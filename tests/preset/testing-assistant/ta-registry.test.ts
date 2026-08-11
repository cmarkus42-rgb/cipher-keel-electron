// tests/preset/testing-assistant/ta-registry.test.ts
//
// Fix round 1, Finding C: nothing called getEntityDefinition('testing-assistant') before this
// file existed — registry.test.ts iterates PRESET_CATALOG, which at the time deliberately
// excluded the Testing Assistant (src/shared/preset-catalog.ts was untouched by this task). A
// typo in the ENTITIES registry key or in one of the capability-assets.ts ?raw import paths
// would compile and the entire suite would still pass. This test closes that gap by resolving
// the Testing Assistant through the registry directly, independently of whether the catalog
// happens to list it — registry.test.ts now also exercises it, since PRESET_CATALOG does too,
// but that coverage arrived later and this file's direct check stays as its own guard.
import { describe, it, expect } from 'vitest'
import { getEntityDefinition } from '../../../src/main/preset/registry'
import { TA_BODY } from '../../../src/main/preset/bodies'
import { TA_CAPABILITIES } from '../../../src/main/preset/testing-assistant/ta-preset'
import { getBuiltinPersona } from '../../../src/main/preset/shared/persona-loader'

describe('Testing Assistant via the entity registry', () => {
  it('resolves to a non-null definition with the shipped body', () => {
    const def = getEntityDefinition('testing-assistant')
    expect(def).not.toBeNull()
    expect(def!.body.length).toBeGreaterThan(100)
    expect(def!.body).toBe(TA_BODY)
  })

  it('resolves the cipher persona, matching persona-defaults.json', () => {
    const def = getEntityDefinition('testing-assistant')!
    expect(def.persona).not.toBeNull()
    expect(def.persona).toBe(getBuiltinPersona('cipher'))
  })

  it('carries exactly the capabilities TA_CAPABILITIES declares at Niveau A', () => {
    const def = getEntityDefinition('testing-assistant')!
    expect(def.rahmen.capabilityAnbindung).toEqual([...TA_CAPABILITIES])
  })
})
