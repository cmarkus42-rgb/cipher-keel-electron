import { describe, it, expect } from 'vitest'
import { SLOTS, slotFuerId } from '../../src/main/model/slots'
import { laeuferKannArt, sperrgrund } from '../../src/main/model/eignung'
import { CapabilityNiveau } from '../../src/main/preset/niveau'

describe('der Zuordnungsplatz sitzung:niveau-b', () => {
  it('existiert, faehrt die eigene Schleife und steht auf Niveau B', () => {
    const slot = slotFuerId('sitzung:niveau-b')
    expect(slot).not.toBeNull()
    expect(slot!.laeufer).toBe('eigene-schleife')
    expect(slot!.niveau).toBe(CapabilityNiveau.B)
    expect(slot!.art).toBe('sitzung')
    // Gelesen wird beim Zellenstart — ein Wechsel trifft die naechste Zelle, nicht die laufende.
    expect(slot!.wirkung).toBe('naechste-session')
  })

  it('erbt die Eignungsregeln, ohne eine davon zu wiederholen', () => {
    const l = slotFuerId('sitzung:niveau-b')!.laeufer
    expect(laeuferKannArt(l, 'local-http')).toBe(true)
    expect(laeuferKannArt(l, 'api')).toBe(true)
    expect(laeuferKannArt(l, 'cli-harness')).toBe(false)
    expect(sperrgrund(l, 'cli-harness')).toContain('CLI-Harness')
  })

  it('jede Slot-Id kommt genau einmal vor', () => {
    const ids = SLOTS.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
