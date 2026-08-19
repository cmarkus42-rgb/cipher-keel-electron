import { describe, it, expect } from 'vitest'
import { pruefeAnhaenge } from '../../src/main/harness-handlers'

// pruefeAnhaenge is the provenance check behind HARNESS_LAUF_STARTEN's attachment handling
// (Critical finding, Fix-Runde 1): an attachment path is admitted only if it came back from a
// dialog the main process itself opened (HARNESS_ANHAENGE_WAEHLEN), never because of where on
// disk it happens to live. That is the opposite of pfadwache, which is checked in
// tests/harness/pfadwache.test.ts and is deliberately not exercised here.

describe('pruefeAnhaenge — Anhaenge duerfen nur aus dem eigenen Dateidialog stammen', () => {
  it('lehnt einen Pfad ab, der nicht aus dem Dateidialog stammt', () => {
    const ausDemDialog = new Set(['/tmp/projekt/screenshot.png'])
    const ergebnis = pruefeAnhaenge(['/tmp/projekt/anderes.png'], ausDemDialog)
    expect(ergebnis.ok).toBe(false)
    if (!ergebnis.ok) {
      expect(ergebnis.meldung).toContain('/tmp/projekt/anderes.png')
      expect(ergebnis.meldung).toContain('Dateidialog')
    }
  })

  it('laesst einen Pfad aus dem Dateidialog durch, auch wenn er ausserhalb jeder Projektwurzel liegt', () => {
    // The whole point of the fix: location is not the criterion. A screenshot on the user's
    // Desktop is nowhere near a project root and must still be accepted, because a human picked
    // it in a dialog the main process itself opened.
    const ausDemDialog = new Set(['/Users/jemand/Desktop/screenshot.png'])
    const ergebnis = pruefeAnhaenge(['/Users/jemand/Desktop/screenshot.png'], ausDemDialog)
    expect(ergebnis).toEqual({ ok: true })
  })

  it('laesst eine leere Anhangsliste unbeanstandet durch', () => {
    expect(pruefeAnhaenge([], new Set())).toEqual({ ok: true })
  })

  it('lehnt ab, sobald auch nur einer von mehreren Pfaden nicht aus dem Dialog stammt', () => {
    const ausDemDialog = new Set(['/tmp/a.png', '/tmp/b.png'])
    const ergebnis = pruefeAnhaenge(['/tmp/a.png', '/tmp/eingeschmuggelt.png', '/tmp/b.png'], ausDemDialog)
    expect(ergebnis.ok).toBe(false)
  })
})
