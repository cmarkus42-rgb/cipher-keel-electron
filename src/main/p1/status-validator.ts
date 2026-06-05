/**
 * status-validator.ts — DokumentStatus enum and transition rules.
 * CK-P1-014: Only three status values; forbidden transitions enforced.
 */

export const DOKUMENT_STATUSES = ['entwurf', 'freigegeben', 'abgeloest'] as const
export type DokumentStatus = (typeof DOKUMENT_STATUSES)[number]

export function isValidDokumentStatus(value: string): value is DokumentStatus {
  return (DOKUMENT_STATUSES as readonly string[]).includes(value)
}

/**
 * Returns true if the transition from → to is permitted.
 * Allowed:   entwurf → freigegeben, freigegeben → abgeloest
 * Forbidden: everything else (including reverse transitions and entwurf → abgeloest)
 */
export function validateStatusTransition(from: DokumentStatus, to: DokumentStatus): boolean {
  if (from === 'entwurf' && to === 'freigegeben') return true
  if (from === 'freigegeben' && to === 'abgeloest') return true
  return false
}
