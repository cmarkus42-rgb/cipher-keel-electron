/**
 * Core type hierarchy for the Preset-System.
 *
 * Entity: immutable role identity (who a participant is)
 * Preset: materialized run folder + prompt (how a role is instantiated)
 * Session: ephemeral AI invocation (a single run)
 *
 * Multiple Sessions of the same Entity can exist simultaneously.
 * Permanence lives in the graph, not in the Session.
 *
 * CK-ENT-001
 */

import type { RollenTyp, PresetRahmen } from './schema'

export interface Entity {
  /** Stable unique identifier */
  id: string
  /** Human-readable role name (e.g. "SE", "Debugger") */
  name: string
  /** Role classification — determines orchestration and trigger logic */
  rollenTyp: RollenTyp
  /** Free-form description of this entity's purpose */
  description: string
}

export interface Preset {
  /** Stable unique identifier */
  id: string
  /** Human-readable preset name */
  name: string
  /** ID of the Entity this preset materializes */
  entityId: string
  /** Typed metadata block read by the machinery */
  rahmen: PresetRahmen
  /** Absolute path to the body prompt file */
  bodyPath: string
  /** Absolute path to the persona file (empty string = no persona) */
  personaPath: string
}

export type SessionStatus = 'pending' | 'running' | 'finished' | 'error'

export interface Session {
  /** Stable unique identifier (ULID recommended) */
  id: string
  /** ID of the Preset that spawned this session */
  presetId: string
  /** ID of the AgentAdapter used for this session */
  adapterId: string
  /** Lifecycle state */
  status: SessionStatus
  /** When this session was created */
  createdAt: Date
}
