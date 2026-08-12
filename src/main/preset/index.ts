/**
 * Preset module — barrel export.
 * CK-ENT-001, CK-ENT-003, CK-ENT-004, CK-ENT-023
 */
export type { Entity, Preset, Session, SessionStatus } from './types'
export { CapabilityNiveau, getNiveauConfig } from './niveau'
export type { BodyForm, LoaderStrategie, NiveauConfig } from './niveau'
export { RollenTyp, validatePresetRahmen } from './schema'
export type { PresetRahmen, GraphAnbindung, ValidationError, ValidationResult } from './schema'
export { getEntityDefinition, listEntityIds } from './registry'
export type { EntityDefinition } from './registry'
