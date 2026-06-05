/**
 * ENT Config Templates — reusable section constants for entity body files.
 *
 * Phase 3c / Task 12
 *
 * ENT-013: D13_HINWEIS          — Niveau-C clarification sentence
 * ENT-014: NIVEAU_BEDIENUNG_SECTION — Niveau vs. Bedienung vs. Entsprechung table
 * ENT-015: GRANULARITAETS_PFLICHT_SECTION — Granularity obligation section
 * ENT-016: PRUEFFRAGE_CHECKPOINT — Pre-handoff review checklist
 */

// ---------------------------------------------------------------------------
// ENT-013: D-13 Hinweis-Satz für Niveau-C Presets
// ---------------------------------------------------------------------------

/**
 * One-sentence clarification for entities running at Niveau C.
 * Injected near the top of Niveau-C instruction files.
 */
export const D13_HINWEIS =
  'Dieses Preset läuft auf Niveau C (Instruktionsdatei): ' +
  'Capabilities sind inline eingebettet — kein externes SKILL.md-Loading, ' +
  'kein automatisches Tool-Listing; Token-Budget max. 2000 Token gesamt.'

// ---------------------------------------------------------------------------
// ENT-014: Niveau-Bedienung vs. Entsprechung
// ---------------------------------------------------------------------------

/**
 * Markdown table mapping each Niveau to its operating mode and correspondence.
 * Suitable for inclusion in orientation or onboarding sections of entity bodies.
 */
export const NIVEAU_BEDIENUNG_SECTION = `\
## Niveau-Bedienung vs. Entsprechung

| Niveau | Bedienung | Entsprechung |
|--------|-----------|--------------|
| A | Voll-Harness (CLAUDE.md) | Vollständiges Tool-Set, nativer Lazy-Load |
| B | Harness-nativ | Manueller Lazy-Load, kein Bash |
| C | Instruktionsdatei | Inline-Capabilities, read-only |
`

// ---------------------------------------------------------------------------
// ENT-015: Granularitäts-Pflicht
// ---------------------------------------------------------------------------

/**
 * Section defining the granularity obligation for all entities.
 * Every task must be broken into atomic steps — one decision or state change per step.
 */
export const GRANULARITAETS_PFLICHT_SECTION = `\
## Granularitäts-Pflicht

Jede Entität muss ihre Aufgaben auf atomare Schritte herunterbrechen.
Kein Schritt darf mehr als eine Entscheidung oder eine Zustandsänderung enthalten.
Zusammengesetzte Aktionen sind in Teilschritte zu zerlegen, bevor sie ausgeführt werden.
`

// ---------------------------------------------------------------------------
// ENT-016: Prüffrage-Checkpoint
// ---------------------------------------------------------------------------

/**
 * Pre-handoff review checklist. Evaluate each item before passing control
 * to the next phase or entity.
 */
export const PRUEFFRAGE_CHECKPOINT = `\
## Prüffrage-Checkpoint

Vor jeder Übergabe zu prüfen:
- [ ] Ist der Phasen-Output vollständig und im Graph dokumentiert?
- [ ] Wurde ein Gate-Befund für die abgeschlossene Phase erstellt?
- [ ] Ist der SE-Trigger für die nächste Phase gesetzt?
- [ ] Sind alle offenen Abhängigkeiten aufgelöst oder explizit delegiert?
`
