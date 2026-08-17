import { describe, it, expect } from 'vitest'
import { SLOTS, slotFuerId, slotFuerTier } from '../../src/main/model/slots'
import { CapabilityNiveau } from '../../src/main/preset/niveau'

describe('Slot-Tabelle', () => {
  it('kennt genau fuenf Slots', () => {
    expect(SLOTS).toHaveLength(5)
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
