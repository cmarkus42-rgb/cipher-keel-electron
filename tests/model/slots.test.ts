import { describe, it, expect } from 'vitest'
import { SLOTS, slotFuerId, slotFuerTier } from '../../src/main/model/slots'
import { CapabilityNiveau } from '../../src/main/preset/niveau'

describe('Slot-Tabelle', () => {
  it('kennt genau sechs Slots', () => {
    expect(SLOTS).toHaveLength(6)
  })

  it('faehrt alle drei Tiers ueber fremdes-cli auf Niveau A', () => {
    for (const tier of ['light', 'standard', 'heavy'] as const) {
      const slot = slotFuerTier(tier)
      expect(slot.laeufer).toBe('fremdes-cli')
      expect(slot.niveau).toBe(CapabilityNiveau.A)
      expect(slot.art).toBe('tier')
      expect(slot.schluessel).toBe(tier)
    }
  })

  it('faehrt beide Rollen ueber ein-schuss auf Niveau C', () => {
    for (const id of ['rolle:tagging', 'rolle:worker'] as const) {
      const slot = slotFuerId(id)
      expect(slot?.laeufer).toBe('ein-schuss')
      expect(slot?.niveau).toBe(CapabilityNiveau.C)
      expect(slot?.art).toBe('rolle')
    }
  })

  it('faehrt den Rechercheur ueber die eigene Schleife, nicht ueber ein-schuss', () => {
    // Der Unterlauf ist eine Agentenschleife im Kleinen: suchen, lesen, noch einmal suchen,
    // zusammenfassen. Ein `ein-schuss`-Laeufer kann das nicht — und `eigene-schleife` sperrt
    // zugleich die cli-harness-Eintraege, die `pruefeStartbedingungen` sonst erst beim Start
    // des Unterlaufs abweisen wuerde, mitten in einem Werkzeugaufruf des Hauptlaufs.
    const slot = slotFuerId('rolle:rechercheur')
    expect(slot?.laeufer).toBe('eigene-schleife')
    expect(slot?.art).toBe('rolle')
    expect(slot?.schluessel).toBe('rechercheur')
    expect(slot?.wirkung).toBe('sofort')
  })

  it('stellt den Rechercheur nicht auf Niveau C', () => {
    // Auf C feuerte `unter-faehigkeit` („Das laeuft, nutzt den Laeufer aber nicht aus") bei
    // jeder Zuordnung — und das waere hier schlicht falsch: der Unterlauf nutzt die Schleife.
    // Auf B feuert stattdessen `nicht-gemessen`, solange die Faehigkeitszeile vermutet ist,
    // und das ist wahr.
    expect(slotFuerId('rolle:rechercheur')?.niveau).toBe(CapabilityNiveau.B)
  })

  it('gibt jedem Slot eine deutsche Beschriftung', () => {
    for (const slot of SLOTS) {
      expect(slot.beschriftung.length).toBeGreaterThan(0)
    }
  })

  it('vermerkt die Wirkung: Tiers gelten ab der naechsten Session, Rollen sofort', () => {
    expect(slotFuerTier('heavy').wirkung).toBe('naechste-session')
    expect(slotFuerId('rolle:tagging')?.wirkung).toBe('sofort')
  })

  it('gibt null fuer eine unbekannte Slot-Id statt zu werfen', () => {
    expect(slotFuerId('tier:gibt-es-nicht')).toBeNull()
  })
})
