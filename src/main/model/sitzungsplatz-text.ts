/**
 * sitzungsplatz-text — the one message for an empty `sitzung:niveau-b` slot.
 *
 * Two places said this, word for word, until the Task 6 review (I-2) caught it:
 * `KeelHarnessAdapter.isAvailable()`/`.nichtVerfuegbarGrund()` (agent/adapters/keel-harness.ts)
 * — the gate `session:create` actually reaches, before the fork over Sitzungsart ever runs —
 * and `baueSchleifenSitzung`'s own check (session/schleifen-start.ts), which the gate makes
 * unreachable in production. Two copies of a user-facing sentence can drift apart silently;
 * one function that both call cannot.
 */
export function platzNiveauBLeerText(): string {
  return (
    // German single quotes nested inside the German double quotes, not the same glyph
    // doubled — the doubled form (M-6) rendered as `„Sitzung „Niveau B""`, which reads as
    // a stray closing mark, not a nested quotation.
    'Der Platz „Sitzung \'Niveau B\'" ist nicht belegt — ohne Modell startet keine ' +
    'Niveau-B-Zelle. Einstellungen → Modelle.'
  )
}
