import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SettingsAnsicht } from '../../src/shared/settings-types'

describe('Ansichtsmodell', () => {
  let tmpDir: string

  beforeEach(() => {
    vi.resetModules()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-ansicht-test-'))
  })

  afterEach(() => {
    vi.doUnmock('electron')
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  /** Never touches the real keychain: both sources are injected. */
  async function ansichtMit(cfg: unknown, geheim: Record<string, string> = {}) {
    if (cfg !== null) {
      fs.writeFileSync(path.join(tmpDir, 'cipher-keel-config.json'), JSON.stringify(cfg))
    }
    vi.doMock('electron', () => ({ app: { getPath: () => tmpDir } }))
    const { baueAnsicht } = await import('../../src/main/model/ansicht')
    return baueAnsicht({
      keychain: async (ref: string) => geheim[ref] ?? null,
      env: () => null,
    }) as Promise<SettingsAnsicht>
  }

  const slot = (a: SettingsAnsicht, id: string) => a.slots.find(s => s.id === id)!
  const codes = (a: SettingsAnsicht, id: string) => slot(a, id).warnungen.map(w => w.code)

  it('liefert fuenf Slots und alle gebuendelten Eintraege', async () => {
    const a = await ansichtMit(null)
    expect(a.slots).toHaveLength(5)
    expect(a.eintraege.map(e => e.id)).toContain('openrouter-qwen3-coder')
  })

  it('sperrt einen local-http-Eintrag fuer ein Tier und nennt den Grund', async () => {
    const a = await ansichtMit(null)
    const option = slot(a, 'tier:heavy').optionen.find(o => o.eintragId === 'mac-qwen3-30b')!
    expect(option.sperrgrund).not.toBeNull()
    expect(option.sperrgrund).toContain('CLI-Harness')
  })

  it('laesst einen cli-harness-Eintrag fuer ein Tier offen', async () => {
    const a = await ansichtMit(null)
    const option = slot(a, 'tier:heavy').optionen.find(o => o.eintragId === 'claude-opus-cli')!
    expect(option.sperrgrund).toBeNull()
  })

  it('sperrt einen cli-harness-Eintrag fuer eine Rolle', async () => {
    const a = await ansichtMit(null)
    const option = slot(a, 'rolle:worker').optionen.find(o => o.eintragId === 'claude-opus-cli')!
    expect(option.sperrgrund).not.toBeNull()
  })

  // --- die zwei erreichbaren Warnregeln ---

  it('warnt bei rolle:worker auf einen API-Eintrag in fremdem Netz mit genau zwei Codes', async () => {
    const a = await ansichtMit({
      modelle: { zuordnung: { rollen: { tagging: '', worker: 'openrouter-qwen3-coder' } } },
    })
    expect(codes(a, 'rolle:worker').sort()).toEqual(['teure-ebene-fuer-mechanik', 'verlaesst-netz'])
  })

  it('warnt bei einem Tier auf Claude nur ueber das verlassene Netz', async () => {
    const a = await ansichtMit({
      modelle: { zuordnung: { tiers: { light: '', standard: '', heavy: 'claude-opus-cli' } } },
    })
    expect(codes(a, 'tier:heavy')).toEqual(['verlaesst-netz'])
  })

  it('warnt gar nicht bei einer Rolle auf ein lokales Modell', async () => {
    const a = await ansichtMit({
      modelle: { zuordnung: { rollen: { tagging: 'mac-qwen3-30b', worker: '' } } },
    })
    expect(codes(a, 'rolle:tagging')).toEqual([])
  })

  // --- die vier unerreichbaren Regeln: Gegenproben ---
  // Faellt eine davon, hat das Harness einen B-Slot eingefuehrt. Dann ist die Gegenprobe
  // anzupassen, nicht die Regel — und Spec Paragraf 5.5 ist nachzufuehren.

  it('erreicht werkzeugmodus-text nicht: kein Slot benutzt eigene-schleife', async () => {
    const a = await ansichtMit({
      modelle: { zuordnung: { rollen: { tagging: 'spark-gemma4-26b', worker: '' } } },
    })
    expect(codes(a, 'rolle:tagging')).not.toContain('werkzeugmodus-text')
  })

  it('erreicht nicht-gemessen nicht: ein Tier haelt strukturell nur cli-harness', async () => {
    const a = await ansichtMit({
      modelle: { zuordnung: { tiers: { light: '', standard: '', heavy: 'claude-opus-cli' } } },
    })
    expect(codes(a, 'tier:heavy')).not.toContain('nicht-gemessen')
  })

  it('erreicht unter-faehigkeit nicht: die C-Slots fahren ein-schuss, der auf C steht', async () => {
    const a = await ansichtMit({
      modelle: { zuordnung: { rollen: { tagging: '', worker: 'spark-gemma4-26b' } } },
    })
    expect(codes(a, 'rolle:worker')).not.toContain('unter-faehigkeit')
  })

  it('erreicht kontext-zu-klein nicht: nichts liefert heute einen Startkontext', async () => {
    const a = await ansichtMit({
      modelle: { zuordnung: { rollen: { tagging: 'mac-qwen3-30b', worker: '' } } },
    })
    expect(codes(a, 'rolle:tagging')).not.toContain('kontext-zu-klein')
  })

  // --- Rueckfall, Herkunft, Geheimnisse ---

  it('nennt den Rueckfall eines leeren Rollen-Slots mit Host und Modell', async () => {
    const a = await ansichtMit(null)
    expect(slot(a, 'rolle:tagging').rueckfallText).toContain('11434')
    expect(slot(a, 'rolle:tagging').rueckfallText).toContain('qwen3')
  })

  it('nennt den Rueckfall eines leeren Tier-Slots mit dem Modell-Handle', async () => {
    const a = await ansichtMit(null)
    expect(slot(a, 'tier:heavy').rueckfallText).toContain('opus')
  })

  it('macht die vermutete Herkunft der Faehigkeitszeile sichtbar', async () => {
    const a = await ansichtMit(null)
    const e = a.eintraege.find(x => x.id === 'mac-qwen3-30b')!
    expect(e.faehigkeitenHerkunft).toBe('vermutet')
  })

  it('laesst die Herkunft bei einem cli-harness-Eintrag leer', async () => {
    const a = await ansichtMit(null)
    expect(a.eintraege.find(x => x.id === 'claude-opus-cli')!.faehigkeitenHerkunft).toBeNull()
  })

  it('meldet ein hinterlegtes Geheimnis als schluesselbund', async () => {
    const a = await ansichtMit(null, { openrouter: 'sk-test' })
    const e = a.eintraege.find(x => x.id === 'openrouter-qwen3-coder')!
    expect(e.geheimnisStatus).toBe('schluesselbund')
  })

  it('meldet ein fehlendes Geheimnis und nennt die geprueft Umgebungsvariable', async () => {
    const a = await ansichtMit(null)
    const e = a.eintraege.find(x => x.id === 'openrouter-qwen3-coder')!
    expect(e.geheimnisStatus).toBe('fehlt')
    expect(e.geheimnisHinweis).toContain('CIPHER_KEEL_API_OPENROUTER')
  })

  it('gibt einem Eintrag ohne keyRef gar keinen Geheimnis-Status', async () => {
    const a = await ansichtMit(null)
    expect(a.eintraege.find(x => x.id === 'mac-qwen3-30b')!.geheimnisStatus).toBeNull()
  })

  it('markiert gebuendelte Eintraege als nicht loeschbar', async () => {
    const a = await ansichtMit(null)
    expect(a.eintraege.find(x => x.id === 'claude-opus-cli')!.loeschbar).toBe(false)
  })

  it('markiert einen Eintrag aus der Config als loeschbar', async () => {
    const a = await ansichtMit({
      modelle: { eintraege: [{
        id: 'eigener', name: 'Eigener', art: 'local-http',
        erreichbarkeit: { art: 'local-http', host: '10.0.0.5', port: 11434, model: 'x' },
        oertlichkeit: 'eigenes-netz', erklaertext: '', empfehlung: '',
      }] },
    })
    expect(a.eintraege.find(x => x.id === 'eigener')!.loeschbar).toBe(true)
  })

  it('reicht uebersprungene Eintraege mit Fehlertext durch', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // name gesetzt, damit die Validierung bis zur Anbieterart kommt — siehe
      // tests/model/registry.test.ts, wo dieselbe Reihenfolge zaehlt.
      const a = await ansichtMit({
        modelle: { eintraege: [{ id: 'kaputt', name: 'Kaputt', art: 'telepathie' }] },
      })
      expect(a.uebersprungen).toHaveLength(1)
      expect(a.uebersprungen[0].beschreibung).toContain('kaputt')
      expect(a.uebersprungen[0].fehler).toContain('telepathie')
    } finally {
      warn.mockRestore()
    }
  })

  it('degradiert einen einzelnen Eintrag auf unbekannt, wenn der Schluesselbund wirft', async () => {
    fs.writeFileSync(path.join(tmpDir, 'cipher-keel-config.json'), '{}')
    vi.doMock('electron', () => ({ app: { getPath: () => tmpDir } }))
    const { baueAnsicht } = await import('../../src/main/model/ansicht')
    const a = await baueAnsicht({
      keychain: async () => { throw new Error('security nicht gefunden') },
      env: () => null,
    })
    const e = a.eintraege.find(x => x.id === 'openrouter-qwen3-coder')!
    expect(e.geheimnisStatus).toBe('unbekannt')
    expect(e.geheimnisHinweis).toContain('security nicht gefunden')
    // Die Seite lebt weiter: alle anderen Eintraege sind unversehrt da.
    expect(a.eintraege.length).toBeGreaterThan(1)
  })

  it('warnt, wenn ein Startparameter etwas nennt, das die App selbst anhaengt', async () => {
    const a = await ansichtMit({ agent: { startArgs: { 'claude-code': '--resume' } } })
    const w = a.adapter.find(x => x.id === 'claude-code')!.warnungen
    expect(w.map(x => x.code)).toEqual(['doppelter-parameter'])
    expect(w[0].text).toContain('--resume')
  })

  it('benennt das Ueberspringen der Berechtigungsrueckfrage, ohne es zu sperren', async () => {
    const a = await ansichtMit({
      agent: { startArgs: { 'claude-code': '--dangerously-skip-permissions' } },
    })
    const w = a.adapter.find(x => x.id === 'claude-code')!.warnungen
    expect(w.map(x => x.code)).toEqual(['berechtigungen-uebersprungen'])
    // Sperren waere falsch: es ist die Vorgabe, und ohne sie haengt eine Sitzung.
    expect(w[0].text).toContain('Werkzeugaufruf')
  })

  it('nennt beide Gruende, wenn beide zutreffen', async () => {
    const a = await ansichtMit({
      agent: { startArgs: { 'claude-code': '--dangerously-skip-permissions --resume' } },
    })
    const codes = a.adapter.find(x => x.id === 'claude-code')!.warnungen.map(x => x.code)
    expect(codes.sort()).toEqual(['berechtigungen-uebersprungen', 'doppelter-parameter'])
  })

  it('warnt nicht bei einem harmlosen Startparameter', async () => {
    const a = await ansichtMit({ agent: { startArgs: { 'claude-code': '--verbose' } } })
    expect(a.adapter.find(x => x.id === 'claude-code')!.warnungen).toEqual([])
  })

  it('meldet eine unlesbare Parameterzeile und urteilt dann nicht weiter', async () => {
    const a = await ansichtMit({
      agent: { startArgs: { 'claude-code': '--datei "ohne Ende' } },
    })
    const w = a.adapter.find(x => x.id === 'claude-code')!.warnungen
    expect(w.map(x => x.code)).toEqual(['unlesbare-parameter'])
  })
})
