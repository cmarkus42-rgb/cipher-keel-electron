import { describe, it, expect } from 'vitest'
import { zuordnungMitPlatz } from '../../src/main/settings/handlers'
import { slotFuerId } from '../../src/main/model/slots'

// zuordnungMitPlatz ist der Schreibpfad hinter SETTINGS_ZUORDNUNG_SETZEN, als reine Funktion
// herausgezogen, weil kein Test in diesem Repo ipcMain erreicht (siehe harness-handlers.ts,
// pruefeAnhaenge). Vor dieser Extraktion baute der Handler die Zuordnung mit
// `{ tiers: {...}, rollen: {...} }` komplett neu auf und nannte `sitzungen` darin nicht — jede
// Zuweisung an irgendeinen anderen Platz haette eine Sitzungs-Zuordnung dabei stillschweigend
// geloescht. Der zweite Fall unten ist deshalb der wichtigere: er ist der, der vorher fehlte.

const LEER = {
  tiers: { light: '', standard: '', heavy: '' },
  rollen: { tagging: '', worker: '', rechercheur: '' },
  sitzungen: { 'niveau-b': '' },
}

describe('zuordnungMitPlatz — der Schreibpfad hinter SETTINGS_ZUORDNUNG_SETZEN', () => {
  it('traegt eine Tier-Zuweisung in tiers ein', () => {
    const slot = slotFuerId('tier:light')!
    const neu = zuordnungMitPlatz(LEER, slot, 'eintrag-a')
    expect(neu.tiers.light).toBe('eintrag-a')
  })

  it('traegt eine Rollen-Zuweisung in rollen ein', () => {
    const slot = slotFuerId('rolle:worker')!
    const neu = zuordnungMitPlatz(LEER, slot, 'eintrag-b')
    expect(neu.rollen.worker).toBe('eintrag-b')
  })

  it('traegt eine Sitzungs-Zuweisung in sitzungen ein', () => {
    const slot = slotFuerId('sitzung:niveau-b')!
    const neu = zuordnungMitPlatz(LEER, slot, 'eintrag-c')
    expect(neu.sitzungen['niveau-b']).toBe('eintrag-c')
  })

  it('laesst die beiden anderen Gruppen unveraendert, wenn eine Sitzung zugewiesen wird', () => {
    const bisher = {
      tiers: { light: 'alt-light', standard: '', heavy: '' },
      rollen: { tagging: 'alt-tagging', worker: '', rechercheur: '' },
      sitzungen: { 'niveau-b': '' },
    }
    const slot = slotFuerId('sitzung:niveau-b')!
    const neu = zuordnungMitPlatz(bisher, slot, 'eintrag-d')
    expect(neu.sitzungen['niveau-b']).toBe('eintrag-d')
    // Das ist der Fund: vor der Extraktion baute der Handler tiers/rollen komplett neu auf und
    // nannte sitzungen darin nicht. Eine Sitzungs-Zuweisung darf umgekehrt tiers und rollen
    // nicht anfassen.
    expect(neu.tiers).toEqual(bisher.tiers)
    expect(neu.rollen).toEqual(bisher.rollen)
  })

  it('laesst sitzungen unveraendert, wenn ein Tier zugewiesen wird', () => {
    const bisher = {
      tiers: { light: '', standard: '', heavy: '' },
      rollen: { tagging: '', worker: '', rechercheur: '' },
      sitzungen: { 'niveau-b': 'alt-sitzung' },
    }
    const slot = slotFuerId('tier:heavy')!
    const neu = zuordnungMitPlatz(bisher, slot, 'eintrag-e')
    expect(neu.tiers.heavy).toBe('eintrag-e')
    expect(neu.sitzungen).toEqual(bisher.sitzungen)
    expect(neu.rollen).toEqual(bisher.rollen)
  })
})
