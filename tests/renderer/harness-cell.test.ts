/**
 * zellenansicht — rein pruefbar, ohne DOM.
 *
 * Dieses Repo hat weder jsdom noch @testing-library/react, vitest.config.ts steht auf
 * environment: 'node'. HarnessCell exportiert seine Entscheidungslogik deshalb als reine
 * Funktion, dasselbe Muster wie FARBE/kurzfassung in ereignis-panel.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { zellenansicht } from '../../src/renderer/components/HarnessCell'

describe('zellenansicht', () => {
  it('laesst beauftragen, solange die Zelle leerlaeuft', () => {
    const a = zellenansicht('leerlaufend', null)
    expect(a.beauftragenMoeglich).toBe(true)
    expect(a.abbrechenMoeglich).toBe(false)
  })

  it('sperrt Beauftragen und oeffnet Abbrechen, solange ein Auftrag faehrt', () => {
    const a = zellenansicht('laeuft', null)
    expect(a.beauftragenMoeglich).toBe(false)
    expect(a.abbrechenMoeglich).toBe(true)
  })

  it('zeigt den letzten Endzustand, ohne ihn aus Ereignissen abzuleiten', () => {
    // Die Funktion nimmt gar keine Ereignisse entgegen — das ist die Aussage, nicht ein
    // fehlender Parameter.
    expect(zellenansicht('leerlaufend', 'ziel-erreicht').zustandstext).toContain('ziel-erreicht')
    expect(zellenansicht('leerlaufend', null).zustandstext).toBe('bereit')
  })

  it('die beiden Knopfzustaende schliessen einander aus', () => {
    for (const z of ['leerlaufend', 'laeuft'] as const) {
      const a = zellenansicht(z, null)
      expect(a.beauftragenMoeglich).not.toBe(a.abbrechenMoeglich)
    }
  })
})
