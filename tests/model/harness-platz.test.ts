import { describe, it, expect } from 'vitest'
import { AdapterRegistry } from '../../src/main/agent/registry'
import type { AgentAdapter } from '../../src/main/agent/agent-adapter'
import {
  HARNESS_PLATZ, harnessOptionen, loeseHarnessAuf, pruefeHarnessWahl,
} from '../../src/main/model/harness-platz'

// Der Harness-Platz steht neben SLOTS, nicht darin: ein Platz in slots.ts zielt auf einen
// Registry-Eintrag und wird ueber eignung.ts gefiltert, ein Harness ist ein Adapter. Diese
// Datei prueft die drei Dinge, die der eigene Typ dadurch billiger bekommt — die Optionen
// kommen aus der AdapterRegistry, der Sperrgrund kommt vom Adapter selbst, und die
// Uebersteuerung greift nur dort, wo das Preset ohnehin ein fremdes CLI startet.

function registry(): AdapterRegistry {
  return new AdapterRegistry({ getStartArgs: () => [] })
}

/**
 * Ein erfundener CLI-Adapter mit festem Verfuegbarkeitsurteil. Die echten beiden antworten
 * danach, ob `claude` bzw. `kimi` auf dieser Maschine im Pfad liegen — eine Aussage ueber den
 * Rechner, auf dem der Test laeuft, und deshalb keine Grundlage fuer eine Zusicherung.
 */
function gesperrterAdapter(id: string, grund: string): AgentAdapter {
  return {
    id,
    displayName: `Erfundenes CLI ${id}`,
    sitzungsart: 'fremdes-cli',
    isAvailable: () => false,
    nichtVerfuegbarGrund: () => grund,
  } as unknown as AgentAdapter
}

describe('Harness-Platz — die Optionen', () => {
  it('bietet die fremden CLIs an', () => {
    const ids = harnessOptionen(registry()).map(o => o.adapterId)
    expect(ids).toContain('claude-code')
    expect(ids).toContain('kimi-code')
  })

  it('bietet die eigene Schleife nicht an — sie ist eine andere Sitzungsart, kein Harness', () => {
    const ids = harnessOptionen(registry()).map(o => o.adapterId)
    // Die Laengenzusage gehoert dazu: eine leere Liste enthaelt keel-harness auch nicht, und
    // ein Test, der auf nichts trifft, sagt nichts.
    expect(ids.length).toBeGreaterThan(0)
    expect(ids).not.toContain('keel-harness')
  })

  it('uebernimmt den Sperrgrund unveraendert vom Adapter', () => {
    const r = registry()
    r.register(gesperrterAdapter('erfunden-cli', 'Das Werkzeug erfunden fehlt im Pfad.'))
    const option = harnessOptionen(r).find(o => o.adapterId === 'erfunden-cli')
    expect(option?.sperrgrund).toBe('Das Werkzeug erfunden fehlt im Pfad.')
  })

  it('nennt den Namen des Adapters, nicht seine Kennung', () => {
    const r = registry()
    r.register(gesperrterAdapter('erfunden-cli', 'egal'))
    const option = harnessOptionen(r).find(o => o.adapterId === 'erfunden-cli')
    expect(option?.name).toBe('Erfundenes CLI erfunden-cli')
  })

  it('wirkt auf die naechste Sitzung, nicht auf einen laufenden Pane', () => {
    expect(HARNESS_PLATZ.wirkung).toBe('naechste-session')
  })
})

describe('Harness-Platz — was er uebersteuert', () => {
  it('laesst das Preset entscheiden, solange nichts gewaehlt ist', () => {
    expect(loeseHarnessAuf(registry(), 'claude-cli-tmux', '').id).toBe('claude-code')
  })

  it('uebersteuert ein Preset, dessen Laufzeit auf ein fremdes CLI zeigt', () => {
    expect(loeseHarnessAuf(registry(), 'claude-cli-tmux', 'kimi-code').id).toBe('kimi-code')
  })

  it('uebersteuert auch ein Preset ohne Laufzeit — dort gilt der Vorgabe-Adapter, ein CLI', () => {
    expect(loeseHarnessAuf(registry(), undefined, 'kimi-code').id).toBe('kimi-code')
  })

  // Die wichtigste Regel des Entwurfs (Spec §2). Ohne sie machte die Wahl „Kimi" jede
  // Niveau-B-Gitterzelle kaputt: der Platz waehlt zwischen fremden CLIs, nicht zwischen
  // Sitzungsarten.
  it('laesst ein Preset der eigenen Schleife unangetastet', () => {
    expect(loeseHarnessAuf(registry(), 'keel-harness', 'kimi-code').id).toBe('keel-harness')
  })

  it('scheitert benannt, wenn die Wahl einen Harness nennt, den es nicht gibt', () => {
    expect(() => loeseHarnessAuf(registry(), 'claude-cli-tmux', 'erfunden'))
      .toThrow(/erfunden/)
  })

  it('scheitert benannt, wenn die Wahl die eigene Schleife nennt', () => {
    expect(() => loeseHarnessAuf(registry(), 'claude-cli-tmux', 'keel-harness'))
      .toThrow(/keel-harness/)
  })

  // Der Zweig „gueltig, aber Adapter nicht gebaut" in getForRuntime bleibt stehen und wird
  // nicht umgangen: eine unbekannte Laufzeit scheitert weiterhin dort, auch mit gesetzter Wahl.
  it('umgeht die Laufzeitaufloesung nicht', () => {
    expect(() => loeseHarnessAuf(registry(), 'erfundene-laufzeit', 'kimi-code'))
      .toThrow(/erfundene-laufzeit/)
  })
})

describe('Harness-Platz — der Schreibpfad', () => {
  it('nimmt die leere Wahl an — sie ist die Vorgabe', () => {
    expect(pruefeHarnessWahl(registry(), '')).toBe('')
  })

  it('nimmt ein fremdes CLI an', () => {
    expect(pruefeHarnessWahl(registry(), 'kimi-code')).toBe('kimi-code')
  })

  it('weist die eigene Schleife ab', () => {
    expect(() => pruefeHarnessWahl(registry(), 'keel-harness')).toThrow(/keel-harness/)
  })

  it('weist eine unbekannte Kennung ab', () => {
    expect(() => pruefeHarnessWahl(registry(), 'erfunden')).toThrow(/erfunden/)
  })
})
