import { describe, it, expect } from 'vitest'
import { assemblePraefixTeile } from '../../src/main/harness-praefix-quelle'
import type { Faehigkeit } from '../../src/main/harness'

// BODY und REGELN sind modulprivat in harness-praefix-quelle.ts — hier bewusst als Momentaufnahme
// dupliziert statt exportiert, damit der Test die tatsaechliche Ausgabe exakt pinnt (`toBe`),
// nicht nur "enthaelt irgendwas Aehnliches" (`toContain`). Ein `toContain` haette ueberlebt, wenn
// BODY auf seinen ersten Satz gekuerzt oder zwei der drei Regelzeilen entfernt worden waeren —
// also gerade nicht "exakt das bisherige Verhalten", was der Sinn dieses Tests ist. Aendert sich
// der Text in harness-praefix-quelle.ts absichtlich, bricht dieser Test bewusst mit — die
// Momentaufnahme wird dann hier nachgezogen, nicht stillschweigend toleriert.
const BODY_HEUTE =
  'Du arbeitest in einem Projektverzeichnis und beantwortest die Frage, die im Auftrag steht. ' +
  'Du kannst lesen, suchen und den Knowledge-Graph abfragen. Du kannst nichts schreiben und ' +
  'nichts ausfuehren.'

const GLOBALE_REGELN_HEUTE = '## Regeln\n\n' + [
  'Belege schlagen Behauptungen: Nenne Datei und Zeile, wenn du etwas ueber den Code sagst.',
  'Wenn ein Werkzeug abgelehnt wird, nenne die Ablehnung in deiner Antwort statt sie zu umgehen.',
  'Was du nicht geprueft hast, sagst du nicht.',
].join('\n')

const FAEHIGKEITEN: Faehigkeit[] = [
  { name: 'gate-urteil-guide', beschreibung: 'Faellt das Urteil an einem Gate.', rumpf: 'Rumpf', pfad: '.claude/capabilities/gate-urteil-guide' },
]

// assemblePraefixTeile ist die Naht zur Preset-Schicht (harness-sitzung.ts's baueLaufUmgebung
// reicht ihr optional eine EntitaetsTeile durch). Zwei Behauptungen: ohne Entitaet bleibt der
// Weg des Harness-Fensters unveraendert, mit Entitaet gewinnen deren Teile — und auftragstext
// bleibt in beiden Faellen die Sache des Laufs, nie der Rolle. Beide Faelle behaupten ausserdem
// die Durchreichung von faehigkeiten mit, statt eine leere Liste zu uebergeben — sie ist sonst
// von keinem der beiden Tests belegt.
describe('assemblePraefixTeile — die Naht zur Preset-Schicht', () => {
  it('gilt ohne entitaet die Hausvorgaben — der Weg des Harness-Fensters, unveraendert', () => {
    const teile = assemblePraefixTeile('lies a.ts', FAEHIGKEITEN)
    expect(teile.body).toBe(BODY_HEUTE)
    expect(teile.capabilities).toBe('')
    expect(teile.persona).toBe('')
    expect(teile.globaleRegeln).toBe(GLOBALE_REGELN_HEUTE)
    expect(teile.auftragstext).toBe('lies a.ts')
    expect(teile.faehigkeiten).toBe(FAEHIGKEITEN)
  })

  it('gewinnen mit entitaet deren Body, Persona, Faehigkeitstext und Hausregeln — ' +
    'der Auftragstext bleibt trotzdem der uebergebene', () => {
    const entitaet = {
      body: 'Du bist der Rechercheur.',
      persona: 'Gruendlich und knapp.',
      capabilities: '- recherchieren',
      globaleRegeln: '## Regeln der Entitaet\n\nNenne deine Quelle.',
    }
    const teile = assemblePraefixTeile('lies a.ts', FAEHIGKEITEN, entitaet)
    expect(teile.body).toBe(entitaet.body)
    expect(teile.persona).toBe(entitaet.persona)
    expect(teile.capabilities).toBe(entitaet.capabilities)
    expect(teile.globaleRegeln).toBe(entitaet.globaleRegeln)
    // auftragstext kommt nie aus der Entitaet: er ist die Sache des Laufs, nicht der Rolle.
    expect(teile.auftragstext).toBe('lies a.ts')
    expect(teile.faehigkeiten).toBe(FAEHIGKEITEN)
  })
})
