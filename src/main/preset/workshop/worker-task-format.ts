/**
 * worker-task-format.ts — Niveau-C-taugliche Worker-Task-Outputs.
 *
 * CK-P4-003: Vier Pflicht-Felder pro Task, kein impliziter Kontext,
 * ein Item pro Task. Prueffrage: "Kann ein Entwickler der das Projekt
 * nie gesehen hat diesen Task allein starten?"
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkerTask {
  /** Eindeutige ID, z.B. BUG-001 oder MFR-001 */
  id: string
  /** Was ist Bug/Item (Beschreibung) */
  description: string
  /** Betroffene Datei oder Modul */
  file: string
  /** Beobachtetes (tatsaechliches) Verhalten */
  observed: string
  /** Erwartetes (gewuenschtes) Verhalten */
  expected: string
  /** Klares Abschluss-Kriterium */
  completionCriteria: string
}

export interface WorkerTaskValidationResult {
  valid: boolean
  errors: string[]
}

// ---------------------------------------------------------------------------
// Section markers used in the formatted task string
// ---------------------------------------------------------------------------

const MARKERS = {
  description:        '**Beschreibung:**',
  file:               '**Datei/Modul:**',
  observed:           '**Beobachtet:**',
  expected:           '**Erwartet:**',
  completionCriteria: '**Abschluss-Kriterium:**',
} as const

// ---------------------------------------------------------------------------
// formatWorkerTask
// ---------------------------------------------------------------------------

/**
 * Erzeugt einen vollstaendigen, selbst-staendigen Worker-Task-String.
 *
 * Alle vier Pflicht-Informationen sind explizit gelabelt. Kein impliziter
 * Kontext — ein 13B-Modell muss den Task allein starten koennen.
 */
export function formatWorkerTask(item: WorkerTask): string {
  return [
    `# Worker-Task ${item.id}`,
    '',
    `${MARKERS.description} ${item.description}`,
    '',
    `${MARKERS.file} ${item.file}`,
    '',
    `${MARKERS.observed} ${item.observed}`,
    '',
    `${MARKERS.expected} ${item.expected}`,
    '',
    `${MARKERS.completionCriteria} ${item.completionCriteria}`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// validateWorkerTask
// ---------------------------------------------------------------------------

/**
 * Prueft ob ein Worker-Task-String alle Pflicht-Marker enthaelt.
 *
 * Kann auf beliebige Strings angewendet werden (z.B. LLM-generierte Tasks).
 */
export function validateWorkerTask(task: string): WorkerTaskValidationResult {
  const errors: string[] = []

  for (const [key, marker] of Object.entries(MARKERS)) {
    if (!task.includes(marker)) {
      errors.push(`Pflicht-Marker fehlt: ${marker} (Feld: ${key})`)
    }
  }

  return { valid: errors.length === 0, errors }
}
