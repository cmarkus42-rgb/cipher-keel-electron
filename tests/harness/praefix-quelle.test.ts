import { describe, it, expect } from 'vitest'
import { assemblePraefixTeile } from '../../src/main/harness-praefix-quelle'

// assemblePraefixTeile ist die Naht zur Preset-Schicht (harness-sitzung.ts's baueLaufUmgebung
// reicht ihr optional eine EntitaetsTeile durch). Zwei Behauptungen: ohne Entitaet bleibt der
// Weg des Harness-Fensters unveraendert, mit Entitaet gewinnen deren Teile — und auftragstext
// bleibt in beiden Faellen die Sache des Laufs, nie der Rolle.
describe('assemblePraefixTeile — die Naht zur Preset-Schicht', () => {
  it('gilt ohne entitaet die Hausvorgaben — der Weg des Harness-Fensters, unveraendert', () => {
    const teile = assemblePraefixTeile('lies a.ts', [])
    expect(teile.body).toContain('Du arbeitest in einem Projektverzeichnis')
    expect(teile.capabilities).toBe('')
    expect(teile.persona).toBe('')
    expect(teile.globaleRegeln).toContain('## Regeln')
    expect(teile.globaleRegeln).toContain('Belege schlagen Behauptungen')
    expect(teile.auftragstext).toBe('lies a.ts')
  })

  it('gewinnen mit entitaet deren Body, Persona, Faehigkeitstext und Hausregeln — ' +
    'der Auftragstext bleibt trotzdem der uebergebene', () => {
    const entitaet = {
      body: 'Du bist der Rechercheur.',
      persona: 'Gruendlich und knapp.',
      capabilities: '- recherchieren',
      globaleRegeln: '## Regeln der Entitaet\n\nNenne deine Quelle.',
    }
    const teile = assemblePraefixTeile('lies a.ts', [], entitaet)
    expect(teile.body).toBe(entitaet.body)
    expect(teile.persona).toBe(entitaet.persona)
    expect(teile.capabilities).toBe(entitaet.capabilities)
    expect(teile.globaleRegeln).toBe(entitaet.globaleRegeln)
    // auftragstext kommt nie aus der Entitaet: er ist die Sache des Laufs, nicht der Rolle.
    expect(teile.auftragstext).toBe('lies a.ts')
  })
})
