/**
 * slots — the five assignment slots, and the one place their runner and niveau are stated.
 *
 * A slot's Laeufer is a property of the slot, never a user choice: a tier drives a CLI
 * harness, a role dispatches a single job. The settings surface therefore offers no runner
 * picker, which is what keeps the eignung rules unrestated (see the guard test in
 * tests/model/eignung-einzige-quelle.test.ts).
 *
 * `Tier` and `Rolle` live here rather than in registry.ts so that registry.ts can import
 * this module without a cycle. registry.ts re-exports them, so no existing import breaks.
 */

import type { Laeufer } from './eignung'
import { CapabilityNiveau } from '../preset/niveau'

export type Tier = 'light' | 'standard' | 'heavy'
export type Rolle = 'tagging' | 'worker'

export type SlotId =
  | 'tier:light'
  | 'tier:standard'
  | 'tier:heavy'
  | 'rolle:tagging'
  | 'rolle:worker'

export interface Slot {
  id: SlotId
  /** German: this text reaches the user. */
  beschriftung: string
  laeufer: Laeufer
  niveau: CapabilityNiveau
  art: 'tier' | 'rolle'
  schluessel: Tier | Rolle
  /**
   * When a change takes effect. Tiers are read at session launch
   * (ipc-handlers.ts), roles on every resolution (rollen.ts).
   */
  wirkung: 'sofort' | 'naechste-session'
}

export const SLOTS: readonly Slot[] = [
  {
    id: 'tier:light', beschriftung: 'Tier „light" — mechanische Arbeit',
    laeufer: 'fremdes-cli', niveau: CapabilityNiveau.A,
    art: 'tier', schluessel: 'light', wirkung: 'naechste-session',
  },
  {
    id: 'tier:standard', beschriftung: 'Tier „standard" — der Alltagsweg',
    laeufer: 'fremdes-cli', niveau: CapabilityNiveau.A,
    art: 'tier', schluessel: 'standard', wirkung: 'naechste-session',
  },
  {
    id: 'tier:heavy', beschriftung: 'Tier „heavy" — dort, wo Fehler sich vervielfachen',
    laeufer: 'fremdes-cli', niveau: CapabilityNiveau.A,
    art: 'tier', schluessel: 'heavy', wirkung: 'naechste-session',
  },
  {
    id: 'rolle:tagging', beschriftung: 'Rolle „Notizen-Verschlagwortung"',
    laeufer: 'ein-schuss', niveau: CapabilityNiveau.C,
    art: 'rolle', schluessel: 'tagging', wirkung: 'sofort',
  },
  {
    id: 'rolle:worker', beschriftung: 'Rolle „Niveau-C-Auftraege"',
    laeufer: 'ein-schuss', niveau: CapabilityNiveau.C,
    art: 'rolle', schluessel: 'worker', wirkung: 'sofort',
  },
]

export function slotFuerId(id: string): Slot | null {
  return SLOTS.find(s => s.id === id) ?? null
}

export function slotFuerTier(tier: Tier): Slot {
  const slot = SLOTS.find(s => s.art === 'tier' && s.schluessel === tier)
  if (!slot) throw new Error(`Unbekanntes Tier '${tier}'`)
  return slot
}
