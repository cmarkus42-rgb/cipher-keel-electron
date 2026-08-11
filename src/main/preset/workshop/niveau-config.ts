/**
 * niveau-config.ts — Capability-Pakete und Einschraenkungen je Niveau.
 *
 * CK-P4-008: Niveau C — Einzeltask-Modus, kein Sub-Session-Spawn,
 *            Completeness-Check als Checkpoint-Prompt.
 * CK-P4-010: Niveau A (7 Pakete, max 5), B (6 Pakete, max 3), C (5 Pakete, max 1).
 *
 * Niveau B ist der Mindeststand fuer vollwertigen konvergenten Flow.
 * Niveau C ist Bedienhilfe-Modus (D-13).
 */

import { CapabilityNiveau } from '../niveau'
import { getWorkshopCapabilityPackages } from './workshop-capabilities'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkshopNiveau = 'A' | 'B' | 'C'

export type CompletenessCheckMode = 'graph-query' | 'prose' | 'checkpoint-prompt'

export interface WorkshopNiveauConfig {
  niveau: WorkshopNiveau
  /** Geladene Capability-Pakete */
  capabilities: string[]
  /** Maximale Anzahl paralleler Worker-Sessions */
  maxParallel: number
  /** Ob Sub-Sessions (mux_create_session) erlaubt sind */
  allowSubSessions: boolean
  /** Wie der Completeness-Check durchgefuehrt wird */
  completenessCheckMode: CompletenessCheckMode
  /** Hinweis fuer den Preset-Katalog */
  hint?: string
}

// ---------------------------------------------------------------------------
// Capability-Listen
// ---------------------------------------------------------------------------

/** Vollstaendige Capability-Liste (Niveau A, alle als SKILL.md) */
const CAPABILITIES_NIVEAU_A = getWorkshopCapabilityPackages(CapabilityNiveau.A).map(p => p.name)

/** Niveau B: debugger-beauftragung entfaellt vollstaendig (Niveau-A-exklusiv) */
const CAPABILITIES_NIVEAU_B = getWorkshopCapabilityPackages(CapabilityNiveau.B).map(p => p.name)

/** Niveau C: 5 Pakete, kein debugger-beauftragung, kein worker-monitoring */
const CAPABILITIES_NIVEAU_C = getWorkshopCapabilityPackages(CapabilityNiveau.C).map(p => p.name)

// ---------------------------------------------------------------------------
// getNiveauWorkshopConfig
// ---------------------------------------------------------------------------

/**
 * Gibt die Capability-Konfiguration fuer das angegebene Niveau zurueck.
 *
 * Niveau A: 7 Pakete, max 5 parallel, Sub-Sessions erlaubt, Graph-Abfrage
 * Niveau B: 6 Pakete, max 3 parallel, Sub-Sessions erlaubt, Prosa
 * Niveau C: 5 Pakete, max 1 (sequentiell), kein Sub-Session, Checkpoint-Prompt
 */
export function getNiveauWorkshopConfig(niveau: WorkshopNiveau): WorkshopNiveauConfig {
  switch (niveau) {
    case 'A':
      return {
        niveau: 'A',
        capabilities: [...CAPABILITIES_NIVEAU_A],
        maxParallel: 5,
        allowSubSessions: true,
        completenessCheckMode: 'graph-query',
      }

    case 'B':
      return {
        niveau: 'B',
        capabilities: [...CAPABILITIES_NIVEAU_B],
        maxParallel: 3,
        allowSubSessions: true,
        completenessCheckMode: 'prose',
        hint: 'Mindeststand fuer vollwertigen konvergenten Flow.',
      }

    case 'C':
      return {
        niveau: 'C',
        capabilities: [...CAPABILITIES_NIVEAU_C],
        maxParallel: 1,
        allowSubSessions: false,
        completenessCheckMode: 'checkpoint-prompt',
        hint: 'Bedienhilfe-Modus, Niveau B empfohlen.',
      }
  }
}
