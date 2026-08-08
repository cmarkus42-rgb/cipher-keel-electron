/**
 * access-profile.ts — Graph access isolation per preset role.
 *
 * Phase 3c / Task 5
 *
 * AccessProfile is derived from a PresetRahmen's rollenTyp and constrains
 * which operations on which node kinds are considered within-scope.
 *
 * IMPORTANT: violations are informational — callers log them but do NOT block.
 */

import { RollenTyp, type PresetRahmen } from '../preset/schema'
import { isValidKind } from './node-types'

// ---------------------------------------------------------------------------
// AccessProfile
// ---------------------------------------------------------------------------

export interface AccessProfile {
  read: 'wide' | 'phase-scoped'
  write: 'full' | 'phase-scoped'
  /** Phase names or UIDs that define the scope (present when phase-scoped). */
  phasenScope?: string[]
}

// ---------------------------------------------------------------------------
// AccessCheckResult
// ---------------------------------------------------------------------------

export interface AccessCheckResult {
  allowed: boolean
  /** Human-readable violation message when allowed=false. */
  reason?: string
}

// ---------------------------------------------------------------------------
// Control-plane node kinds — off-limits for phase-scoped profiles
// ---------------------------------------------------------------------------

/**
 * Node kinds that represent global/cross-cutting control plane resources.
 * A phase-scoped profile should not read or write these; doing so is a
 * violation (logged by the caller, never hard-blocked here).
 */
const CONTROL_KINDS = new Set(['phase', 'trigger', 'gate_befund', 'github_repo'])

// ---------------------------------------------------------------------------
// deriveProfile
// ---------------------------------------------------------------------------

/**
 * Derive an AccessProfile from a PresetRahmen.
 *
 * Role mapping:
 *   QuerliegenSE          → wide read / full write   (coordination hub)
 *   QuerliegenCompanion   → wide read / phase-scoped write
 *   PhasenEntitaet        → phase-scoped read / phase-scoped write
 *   BeauftragteInstanz    → phase-scoped read / phase-scoped write
 */
export function deriveProfile(rahmen: PresetRahmen): AccessProfile {
  // QuerliegenSE is always wide/full — graphAnbindung override is irrelevant
  if (rahmen.rollenTyp === RollenTyp.QuerliegenSE) {
    return { read: 'wide', write: 'full' }
  }

  // Start with RollenTyp default
  let profile: AccessProfile
  switch (rahmen.rollenTyp) {
    case RollenTyp.QuerliegenCompanion:
      profile = { read: 'wide', write: 'phase-scoped', phasenScope: [...rahmen.phasenBindung] }
      break
    case RollenTyp.PhasenEntitaet:
    case RollenTyp.BeauftragteInstanz:
    default:
      profile = { read: 'phase-scoped', write: 'phase-scoped', phasenScope: [...rahmen.phasenBindung] }
      break
  }

  // DE-2: graphAnbindung override from PresetRahmen
  if (rahmen.graphAnbindung.lesen) {
    profile.read = 'wide'
  }
  if (rahmen.graphAnbindung.schreiben) {
    profile.write = 'full'
  }

  return profile
}

// ---------------------------------------------------------------------------
// checkAccess
// ---------------------------------------------------------------------------

/**
 * Check whether a profile permits an operation on a node kind.
 *
 * Returns { allowed: true } when the operation is within scope.
 * Returns { allowed: false, reason } when it is a violation.
 *
 * Callers MUST log violations but MUST NOT block the operation — access
 * profiles are advisory constraints, not hard gates.
 */
export function checkAccess(
  profile: AccessProfile,
  operation: 'read' | 'write',
  nodeKind: string
): AccessCheckResult {
  // M-4: Reject unknown node kinds
  if (!isValidKind(nodeKind)) {
    return {
      allowed: false,
      reason: `Unknown node kind '${nodeKind}'`,
    }
  }

  const relevantScope = operation === 'read' ? profile.read : profile.write

  // wide read or full write — always allowed
  if (relevantScope === 'wide' || relevantScope === 'full') {
    return { allowed: true }
  }

  // phase-scoped: control-plane kinds are violations
  if (CONTROL_KINDS.has(nodeKind)) {
    return {
      allowed: false,
      reason:
        `phase-scoped profile violation: ${operation} on '${nodeKind}' ` +
        `is a control-plane operation not permitted for this role`,
    }
  }

  return { allowed: true }
}
