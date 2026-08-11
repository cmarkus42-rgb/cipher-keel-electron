/**
 * Workshop-Preset — konvergenter Orchestrator/Bugfixer.
 *
 * Bugfixing und kleinteiliges Development sind ein Workflow, nicht zwei.
 * Phasen-Bindung: ['fixing', 'development'] — SE triggert mit einer von beiden.
 * Model-Default: 'standard' (Sonnet-Klasse).
 *
 * CK-P4-001
 */

import { RollenTyp } from '../schema'
import { CapabilityNiveau } from '../niveau'
import type { PresetRahmen } from '../schema'

/** Graph-Zugriffsprofile für das Workshop-Preset (CK-P4-001). */
export type GraphLeseModus = 'targeted' | 'full' | 'none'
export type GraphSchreibModus = 'full' | 'selective' | 'none'

export interface WorkshopGraphZugriff {
  lesen: GraphLeseModus
  schreiben: GraphSchreibModus
}

/**
 * Workshop-spezifische Konfiguration — erweitert den PresetRahmen um
 * Workshop-eigene Felder, die das preset-machinery-System nicht kennt.
 */
export interface WorkshopKonfiguration {
  /** Eindeutiger Bezeichner des Presets */
  id: string
  /** Rollen-Typ — phasen-entitaet für den Workshop */
  rollenTyp: RollenTyp.PhasenEntitaet
  /** Beide Phasen-Bindungen teilen denselben Flow */
  phasenBindung: ['fixing', 'development']
  /** Standard-Modell-Klasse (Sonnet) */
  modelDefault: 'standard'
  /** Workshop kann Debugger spawnen und Worker steuern */
  orchestrierungsFaehigkeit: true
  /** Graph-Zugriffsprofil: gezielte Lesezugriffe, volle Schreibrechte */
  graphZugriff: WorkshopGraphZugriff
  /** Capability-Pakete differenziert nach Niveau */
  capabilityPakete: WorkshopCapabilityPakete
}

export interface WorkshopCapabilityPakete {
  /** Niveau A: alle 7 Pakete, max 5 parallele Worker */
  niveauA: WorkshopNiveauConfig
  /** Niveau B: 6 Pakete (debugger-beauftragung entfaellt vollstaendig, Niveau-A-exklusiv), max 3 parallele Worker */
  niveauB: WorkshopNiveauConfig
  /** Niveau C: 5 Pakete inline, max 1 Worker (sequentiell) */
  niveauC: WorkshopNiveauConfig
}

export interface WorkshopNiveauConfig {
  pakete: string[]
  maxParallelWorker: number
}

/** Die sieben Capability-Paket-Namen des Workshops (CK-P4-010). */
export const WORKSHOP_CAPABILITY_PAKETE = [
  'findings-lesen',
  'item-dispatch',
  'debugger-beauftragung',
  'completeness-gate',
  'status-konsolidierung',
  'worker-monitoring',
  'rolling-summary',
] as const

export type WorkshopCapabilityName = (typeof WORKSHOP_CAPABILITY_PAKETE)[number]

/** Vollständige Workshop-Konfiguration (Singleton). */
export const WORKSHOP_KONFIGURATION: WorkshopKonfiguration = {
  id: 'workshop',
  rollenTyp: RollenTyp.PhasenEntitaet,
  phasenBindung: ['fixing', 'development'],
  modelDefault: 'standard',
  orchestrierungsFaehigkeit: true,
  graphZugriff: {
    lesen: 'targeted',
    schreiben: 'full',
  },
  capabilityPakete: {
    niveauA: {
      pakete: [...WORKSHOP_CAPABILITY_PAKETE],
      maxParallelWorker: 5,
    },
    niveauB: {
      // debugger-beauftragung entfaellt vollstaendig (Niveau-A-exklusiv), kein Mode-Wechsel
      pakete: ['findings-lesen', 'item-dispatch', 'completeness-gate', 'status-konsolidierung', 'worker-monitoring', 'rolling-summary'],
      maxParallelWorker: 3,
    },
    niveauC: {
      // Kein debugger-beauftragung, kein CF-Routing; alle inline
      pakete: ['findings-lesen', 'item-dispatch', 'completeness-gate', 'status-konsolidierung', 'rolling-summary'],
      maxParallelWorker: 1,
    },
  },
}

/**
 * Erzeugt den PresetRahmen für den Workshop, kompatibel mit dem
 * preset-machinery-Schema (CK-ENT-004).
 *
 * @param niveau - Capability-Niveau für diese Instanz (A, B oder C)
 */
export function createWorkshopRahmen(niveau: CapabilityNiveau): PresetRahmen {
  const cfg = WORKSHOP_KONFIGURATION
  const niveauCfg = niveau === CapabilityNiveau.A
    ? cfg.capabilityPakete.niveauA
    : niveau === CapabilityNiveau.B
      ? cfg.capabilityPakete.niveauB
      : cfg.capabilityPakete.niveauC

  return {
    id: cfg.id,
    name: 'Workshop',
    rollenTyp: cfg.rollenTyp,
    phasenBindung: [...cfg.phasenBindung],
    capabilityAnbindung: niveauCfg.pakete,
    graphAnbindung: { lesen: true, schreiben: true },
    personaVorgabe: '',
    runtime: 'claude-cli-tmux',
    model: '',        // 'standard' → leer = Harness-Default (Sonnet-Klasse)
    capabilityNiveau: niveau,
    harnessBindung: '',
    orchestrierung: true,
  }
}

/**
 * Gibt die maximale Anzahl paralleler Worker für ein Niveau zurück.
 */
export function getMaxParallelWorker(niveau: CapabilityNiveau): number {
  const cfg = WORKSHOP_KONFIGURATION.capabilityPakete
  if (niveau === CapabilityNiveau.A) return cfg.niveauA.maxParallelWorker
  if (niveau === CapabilityNiveau.B) return cfg.niveauB.maxParallelWorker
  return cfg.niveauC.maxParallelWorker
}
