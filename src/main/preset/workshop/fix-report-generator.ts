/**
 * fix-report-generator.ts — fix-report.md im P1-Format.
 *
 * CK-P4-005: Report als P1-Dokument (Frontmatter + Body), als Graph-Knoten
 * und Note ablegen. vorgaenger-dokument verweist auf test-findings Knoten-ID.
 *
 * Nutzt body-templates.ts fuer H2-Skelett und generiert gueltiges Niveau-B
 * Frontmatter fuer den validateFrontmatter-Check.
 */

import type { WorkItem } from './worker-task-format'
import type { Fix } from './completeness-gate'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkshopRun {
  /** Eindeutige Run-ID */
  runId: string
  /** Projekt-Name */
  projekt: string
  /** Graph-Knoten-ID des Quell-test-findings-Dokuments */
  testFindingsNodeId: string
  /** Alle bearbeiteten Work-Items */
  items: WorkItem[]
  /** Fixes pro Item */
  fixes: Fix[]
}

// ---------------------------------------------------------------------------
// generateFixReport
// ---------------------------------------------------------------------------

/**
 * Erzeugt einen fix-report.md String im P1-Format (Niveau B).
 *
 * Frontmatter enthaelt alle 9 Niveau-B-Pflichtfelder:
 *   dokument-typ, phase, phasenuebergang, stand, status,
 *   version, projekt, adressat, req-ids
 * Zusaetzlich: vorgaenger-dokument → testFindingsNodeId
 *
 * Body folgt der fix-report Sektion-Struktur aus body-templates.ts:
 *   Kontext, Bearbeitete Befunde, Aenderungen, Gate-Befund (Prosa)
 */
export function generateFixReport(workshopRun: WorkshopRun): string {
  const stand = new Date().toISOString().slice(0, 10)

  const frontmatter = [
    '---',
    `dokument-typ: fix-report`,
    `phase: fixing`,
    `phasenuebergang: fixing→audit`,
    `stand: "${stand}"`,
    `status: entwurf`,
    `version: "1.0"`,
    `projekt: ${workshopRun.projekt}`,
    `adressat: audit`,
    `req-ids: []`,
    `vorgaenger-dokument: ${workshopRun.testFindingsNodeId}`,
    '---',
  ].join('\n')

  const body = buildBody(workshopRun)

  return `${frontmatter}\n\n${body}`
}

// ---------------------------------------------------------------------------
// Body-Aufbau
// ---------------------------------------------------------------------------

function buildBody(run: WorkshopRun): string {
  const fixMap = new Map(run.fixes.map(f => [f.itemId, f]))

  const befunde = run.items.map(item => {
    const fix = fixMap.get(item.id)
    const status = fix ? fix.status : 'offen'
    const testcases = fix?.testcaseIds.join(', ') ?? '—'
    return `- **${item.id}**: ${item.description} — Status: ${status} | Testcases: ${testcases}`
  })

  const aenderungen = run.fixes
    .filter(f => f.status === 'behoben')
    .map(f => `- ${f.itemId}: behoben`)

  const zurueckgestellt = run.fixes
    .filter(f => f.status === 'zurueckgestellt')
    .map(f => `- ${f.itemId}: zurueckgestellt`)

  const nichtReproduzierbar = run.fixes
    .filter(f => f.status === 'nicht-reproduzierbar')
    .map(f => `- ${f.itemId}: nicht-reproduzierbar`)

  const sections: string[] = []

  sections.push('## Kontext')
  sections.push('')
  sections.push(`Workshop-Run: ${run.runId} | Projekt: ${run.projekt}`)
  sections.push(`Quell-Findings: ${run.testFindingsNodeId}`)
  sections.push('')

  sections.push('## Bearbeitete Befunde')
  sections.push('')
  sections.push(...befunde)
  sections.push('')

  sections.push('## Aenderungen')
  sections.push('')
  if (aenderungen.length > 0) sections.push(...aenderungen)
  if (zurueckgestellt.length > 0) sections.push(...zurueckgestellt)
  if (nichtReproduzierbar.length > 0) sections.push(...nichtReproduzierbar)
  if (aenderungen.length === 0 && zurueckgestellt.length === 0 && nichtReproduzierbar.length === 0) {
    sections.push('— keine Aenderungen —')
  }
  sections.push('')

  sections.push('## Gate-Befund')
  sections.push('')
  sections.push('<!-- Gate-Befund als Prosa -->')

  return sections.join('\n')
}
