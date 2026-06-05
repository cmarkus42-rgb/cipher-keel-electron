/**
 * Graph Access Isolation tests.
 * Phase 3c / Task 5: AccessProfile, deriveProfile, checkAccess
 */

import { describe, it, expect } from 'vitest'
import {
  deriveProfile,
  checkAccess,
  type AccessProfile,
} from '../src/main/graph/access-profile'
import { RollenTyp, type PresetRahmen } from '../src/main/preset/schema'
import { CapabilityNiveau } from '../src/main/preset/niveau'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRahmen(overrides: Partial<PresetRahmen>): PresetRahmen {
  return {
    id: 'test-preset',
    name: 'Test',
    rollenTyp: RollenTyp.PhasenEntitaet,
    phasenBindung: [],
    capabilityAnbindung: [],
    graphAnbindung: { lesen: true, schreiben: true },
    personaVorgabe: '',
    runtime: 'claude-cli-tmux',
    model: '',
    capabilityNiveau: CapabilityNiveau.A,
    harnessBindung: '',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// AccessProfile interface (type-level compile check)
// ---------------------------------------------------------------------------

describe('AccessProfile interface', () => {
  it('accepts a wide/full profile', () => {
    const profile: AccessProfile = { read: 'wide', write: 'full' }
    expect(profile.read).toBe('wide')
    expect(profile.write).toBe('full')
    expect(profile.phasenScope).toBeUndefined()
  })

  it('accepts a phase-scoped profile with scope array', () => {
    const profile: AccessProfile = {
      read: 'phase-scoped',
      write: 'phase-scoped',
      phasenScope: ['ideation', 'requirements'],
    }
    expect(profile.phasenScope).toHaveLength(2)
  })

  it('accepts a mixed read-wide/write-phase-scoped profile', () => {
    const profile: AccessProfile = { read: 'wide', write: 'phase-scoped' }
    expect(profile.read).toBe('wide')
    expect(profile.write).toBe('phase-scoped')
  })
})

// ---------------------------------------------------------------------------
// deriveProfile — SE (QuerliegenSE) → wide / full
// ---------------------------------------------------------------------------

describe('deriveProfile — QuerliegenSE', () => {
  const seRahmen = makeRahmen({ rollenTyp: RollenTyp.QuerliegenSE })

  it('returns read: wide', () => {
    expect(deriveProfile(seRahmen).read).toBe('wide')
  })

  it('returns write: full', () => {
    expect(deriveProfile(seRahmen).write).toBe('full')
  })

  it('has no phasenScope', () => {
    expect(deriveProfile(seRahmen).phasenScope).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// deriveProfile — PhasenEntitaet → phase-scoped / phase-scoped
// ---------------------------------------------------------------------------

describe('deriveProfile — PhasenEntitaet', () => {
  const archRahmen = makeRahmen({
    rollenTyp: RollenTyp.PhasenEntitaet,
    phasenBindung: ['requirements', 'architecture'],
  })

  it('returns read: phase-scoped', () => {
    expect(deriveProfile(archRahmen).read).toBe('phase-scoped')
  })

  it('returns write: phase-scoped', () => {
    expect(deriveProfile(archRahmen).write).toBe('phase-scoped')
  })

  it('copies phasenBindung into phasenScope', () => {
    const profile = deriveProfile(archRahmen)
    expect(profile.phasenScope).toEqual(['requirements', 'architecture'])
  })

  it('empty phasenBindung → empty phasenScope', () => {
    const rahmen = makeRahmen({ rollenTyp: RollenTyp.PhasenEntitaet, phasenBindung: [] })
    const profile = deriveProfile(rahmen)
    expect(profile.phasenScope).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// deriveProfile — QuerliegenCompanion and BeauftragteInstanz
// ---------------------------------------------------------------------------

describe('deriveProfile — QuerliegenCompanion', () => {
  it('returns read: wide (cross-cutting read access)', () => {
    const rahmen = makeRahmen({ rollenTyp: RollenTyp.QuerliegenCompanion })
    expect(deriveProfile(rahmen).read).toBe('wide')
  })

  it('returns write: phase-scoped (restricted write)', () => {
    const rahmen = makeRahmen({ rollenTyp: RollenTyp.QuerliegenCompanion })
    expect(deriveProfile(rahmen).write).toBe('phase-scoped')
  })
})

describe('deriveProfile — BeauftragteInstanz', () => {
  it('returns read: phase-scoped', () => {
    const rahmen = makeRahmen({ rollenTyp: RollenTyp.BeauftragteInstanz })
    expect(deriveProfile(rahmen).read).toBe('phase-scoped')
  })

  it('returns write: phase-scoped', () => {
    const rahmen = makeRahmen({ rollenTyp: RollenTyp.BeauftragteInstanz })
    expect(deriveProfile(rahmen).write).toBe('phase-scoped')
  })
})

// ---------------------------------------------------------------------------
// checkAccess — wide/full profile → always allowed
// ---------------------------------------------------------------------------

describe('checkAccess — wide/full profile', () => {
  const wideProfile: AccessProfile = { read: 'wide', write: 'full' }

  it('allows read on any nodeKind', () => {
    for (const kind of ['anforderung', 'phase', 'trigger', 'gate_befund', 'github_repo']) {
      const result = checkAccess(wideProfile, 'read', kind)
      expect(result.allowed).toBe(true)
    }
  })

  it('allows write on any nodeKind', () => {
    for (const kind of ['anforderung', 'phase', 'trigger', 'gate_befund', 'github_repo']) {
      const result = checkAccess(wideProfile, 'write', kind)
      expect(result.allowed).toBe(true)
    }
  })

  it('returns no reason when allowed', () => {
    const result = checkAccess(wideProfile, 'read', 'anforderung')
    expect(result.reason).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// checkAccess — phase-scoped profile: workload kinds allowed
// ---------------------------------------------------------------------------

describe('checkAccess — phase-scoped, workload kinds', () => {
  const phasedProfile: AccessProfile = {
    read: 'phase-scoped',
    write: 'phase-scoped',
    phasenScope: ['requirements'],
  }

  const workloadKinds = [
    'anforderung', 'artefakt', 'test', 'note', 'entscheidung',
    'anlass', 'phase_subsystem', 'uebergabedokument',
  ]

  it('allows read on workload kinds', () => {
    for (const kind of workloadKinds) {
      const result = checkAccess(phasedProfile, 'read', kind)
      expect(result.allowed).toBe(true)
    }
  })

  it('allows write on workload kinds', () => {
    for (const kind of workloadKinds) {
      const result = checkAccess(phasedProfile, 'write', kind)
      expect(result.allowed).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// checkAccess — phase-scoped profile: control kinds are violations
// ---------------------------------------------------------------------------

describe('checkAccess — phase-scoped, violation detection', () => {
  const phasedProfile: AccessProfile = {
    read: 'phase-scoped',
    write: 'phase-scoped',
    phasenScope: ['requirements'],
  }

  it('flags write on phase node as violation', () => {
    const result = checkAccess(phasedProfile, 'write', 'phase')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBeDefined()
    expect(result.reason).toContain('phase')
  })

  it('flags write on trigger node as violation', () => {
    const result = checkAccess(phasedProfile, 'write', 'trigger')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBeDefined()
  })

  it('flags write on gate_befund as violation', () => {
    const result = checkAccess(phasedProfile, 'write', 'gate_befund')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBeDefined()
  })

  it('flags write on github_repo as violation', () => {
    const result = checkAccess(phasedProfile, 'write', 'github_repo')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBeDefined()
  })

  it('flags read on trigger as violation', () => {
    const result = checkAccess(phasedProfile, 'read', 'trigger')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBeDefined()
  })

  it('reason string names the nodeKind', () => {
    const result = checkAccess(phasedProfile, 'write', 'phase')
    expect(result.reason).toContain('phase')
  })

  it('reason string names the operation', () => {
    const result = checkAccess(phasedProfile, 'write', 'trigger')
    expect(result.reason).toContain('write')
  })
})

// ---------------------------------------------------------------------------
// checkAccess — wide read / phase-scoped write (QuerliegenCompanion profile)
// ---------------------------------------------------------------------------

describe('checkAccess — wide read / phase-scoped write', () => {
  const mixedProfile: AccessProfile = { read: 'wide', write: 'phase-scoped' }

  it('allows read on control kinds (wide read)', () => {
    expect(checkAccess(mixedProfile, 'read', 'phase').allowed).toBe(true)
    expect(checkAccess(mixedProfile, 'read', 'trigger').allowed).toBe(true)
  })

  it('flags write on control kinds (phase-scoped write)', () => {
    expect(checkAccess(mixedProfile, 'write', 'phase').allowed).toBe(false)
    expect(checkAccess(mixedProfile, 'write', 'trigger').allowed).toBe(false)
  })

  it('allows write on workload kinds', () => {
    expect(checkAccess(mixedProfile, 'write', 'anforderung').allowed).toBe(true)
    expect(checkAccess(mixedProfile, 'write', 'artefakt').allowed).toBe(true)
  })
})
