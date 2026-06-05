/**
 * completeness-gate.ts — Vierstufiges kalibrierbares Completeness-Gate.
 *
 * CK-P4-004: 4 Kriterien, Kalibrier-Schalter production/staging/experimental.
 * CK-P4-006: Fix ohne Testcase ist kein gueltiger Phasenoutput (production/staging).
 *
 * Kalibrier-Level:
 *   production  — alle 4 Kriterien
 *   staging     — Kriterium 1 (Forward) + 3 (Tests bestanden)
 *   experimental — nur Kriterium 1 (Forward-Traceability)
 */

import type { WorkItem } from './worker-task-format'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Fix {
  /** ID des adressierten WorkItems */
  itemId: string
  /** Bearbeitungs-Status des Items */
  status: 'behoben' | 'zurueckgestellt' | 'nicht-reproduzierbar'
  /** Testcase-IDs im Notes-System (T-PREFIX.N) — mind. 1 bei behoben */
  testcaseIds: string[]
}

export type CalibrationLevel = 'production' | 'staging' | 'experimental'

export interface GateCriteria {
  /** Kriterium 1: Jedes Finding hat Entsprechung in einem Fix */
  forwardTraceability: boolean
  /** Kriterium 2: Jeder Fix hat Entsprechung in einem Finding */
  backwardTraceability: boolean
  /** Kriterium 3: Jeder behoben-Fix hat mind. einen Testcase */
  testsPassed: boolean
  /** Kriterium 4: Kalibrierbarkeit — immer true wenn Level gesetzt */
  kalibrierbarkeit: boolean
}

export interface GateResult {
  passed: boolean
  criteria: GateCriteria
  /** Item-IDs ohne korrespondierenden Fix */
  missingItems: string[]
  /** Fix-Item-IDs ohne Testcase (nur bei 'behoben') */
  fixesWithoutTestcases: string[]
}

// ---------------------------------------------------------------------------
// evaluateCompleteness
// ---------------------------------------------------------------------------

/**
 * Bewertet die Completeness eines Workshop-Laufs gegen den angegebenen
 * Kalibrier-Level.
 *
 * Alle drei Status-Varianten ('behoben', 'zurueckgestellt', 'nicht-reproduzierbar')
 * gelten als "adressiert" fuer Forward-Traceability.
 * Testcase-Pflicht gilt nur fuer Fixes mit status === 'behoben'.
 */
export function evaluateCompleteness(
  items: WorkItem[],
  fixes: Fix[],
  level: CalibrationLevel,
): GateResult {
  const fixedItemIds = new Set(fixes.map(f => f.itemId))
  const itemIds = new Set(items.map(i => i.id))

  // --- Kriterium 1: Forward-Traceability ---
  const missingItems = items
    .filter(item => !fixedItemIds.has(item.id))
    .map(item => item.id)
  const forwardTraceability = missingItems.length === 0

  // --- Kriterium 2: Backward-Traceability ---
  const backwardTraceability = fixes.every(fix => itemIds.has(fix.itemId))

  // --- Kriterium 3: Tests bestanden ---
  const fixesWithoutTestcases = fixes
    .filter(fix => fix.status === 'behoben' && fix.testcaseIds.length === 0)
    .map(fix => fix.itemId)
  const testsPassed = fixesWithoutTestcases.length === 0

  // --- Kriterium 4: Kalibrierbarkeit ---
  const kalibrierbarkeit = true

  const criteria: GateCriteria = {
    forwardTraceability,
    backwardTraceability,
    testsPassed,
    kalibrierbarkeit,
  }

  // --- Bewertung je Level ---
  let passed: boolean
  if (level === 'production') {
    passed = forwardTraceability && backwardTraceability && testsPassed && kalibrierbarkeit
  } else if (level === 'staging') {
    passed = forwardTraceability && testsPassed
  } else {
    // experimental: nur Kriterium 1
    passed = forwardTraceability
  }

  return { passed, criteria, missingItems, fixesWithoutTestcases }
}
