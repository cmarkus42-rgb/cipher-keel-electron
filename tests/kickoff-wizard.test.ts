/**
 * tests/kickoff-wizard.test.ts — KickoffWizard pure logic (CK-UI-020)
 *
 * Tests only the exported pure functions — no React rendering, no IPC.
 * Node environment (vitest default) — safe for node.
 */
import { describe, it, expect } from 'vitest'
import {
  validateStep1,
  validateStep2,
  WIZARD_STEPS,
  initialWizardData,
  type WizardData,
} from '../src/renderer/components/KickoffWizard'

describe('WIZARD_STEPS (CK-UI-020)', () => {
  it('has exactly 5 steps', () => {
    expect(WIZARD_STEPS).toHaveLength(5)
  })

  it('steps have sequential ids 1–5', () => {
    const ids = WIZARD_STEPS.map((s) => s.id)
    expect(ids).toEqual([1, 2, 3, 4, 5])
  })

  it('every step has a non-empty label', () => {
    for (const step of WIZARD_STEPS) {
      expect(step.label.length).toBeGreaterThan(0)
    }
  })
})

describe('initialWizardData (CK-UI-020)', () => {
  it('projectName is empty string', () => {
    expect(initialWizardData().projectName).toBe('')
  })

  it('rootPath is empty string', () => {
    expect(initialWizardData().rootPath).toBe('')
  })

  it('githubAction defaults to skip', () => {
    expect(initialWizardData().githubAction).toBe('skip')
  })

  it('each call returns a fresh object', () => {
    const a = initialWizardData()
    const b = initialWizardData()
    expect(a).not.toBe(b)
  })
})

describe('validateStep1 — name + path required (CK-UI-020)', () => {
  it('returns false when both name and path are empty', () => {
    expect(validateStep1({ projectName: '', rootPath: '' } as WizardData)).toBe(false)
  })

  it('returns false when name is empty', () => {
    expect(validateStep1({ projectName: '', rootPath: '/tmp' } as WizardData)).toBe(false)
  })

  it('returns false when path is empty', () => {
    expect(validateStep1({ projectName: 'Test', rootPath: '' } as WizardData)).toBe(false)
  })

  it('returns false when name is only whitespace', () => {
    expect(validateStep1({ projectName: '   ', rootPath: '/tmp' } as WizardData)).toBe(false)
  })

  it('returns false when path is only whitespace', () => {
    expect(validateStep1({ projectName: 'Test', rootPath: '   ' } as WizardData)).toBe(false)
  })

  it('returns true when name and path are both non-empty', () => {
    expect(validateStep1({ projectName: 'Test', rootPath: '/tmp' } as WizardData)).toBe(true)
  })
})

describe('validateStep2 — git init is optional (CK-UI-020)', () => {
  it('returns true when initGit is false', () => {
    expect(validateStep2({ initGit: false } as WizardData)).toBe(true)
  })

  it('returns true when initGit is true', () => {
    expect(validateStep2({ initGit: true } as WizardData)).toBe(true)
  })
})

describe('StepGitHub module (GH-011)', () => {
  it('exports a StepGitHub component', async () => {
    const mod = await import('../src/renderer/components/wizard/StepGitHub')
    expect(typeof mod.StepGitHub).toBe('function')
  })
})

describe('StepToolConfig module (CK-UI-020 step 5)', () => {
  it('exports a StepToolConfig component', async () => {
    const mod = await import('../src/renderer/components/wizard/StepToolConfig')
    expect(typeof mod.StepToolConfig).toBe('function')
  })
})
