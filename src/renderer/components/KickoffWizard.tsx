/**
 * KickoffWizard — deterministic 5-step project setup wizard.
 *
 * CK-UI-020: Kickoff-Wizard
 *
 * Pure exports (testable without React):
 *   WizardData — wizard state interface
 *   initialWizardData() — factory for default state
 *   WIZARD_STEPS — 5-entry step descriptor array
 *   validateStep1(data) — requires non-empty name + path
 *   validateStep2(data) — always true (git init is optional)
 */
import { useState } from 'react'
import { StepProjectName } from './wizard/StepProjectName'
import { StepGitInit } from './wizard/StepGitInit'
import { StepGraphInit } from './wizard/StepGraphInit'
import { StepGitHub } from './wizard/StepGitHub'
import { StepToolConfig } from './wizard/StepToolConfig'
import { errorMessage } from '../../shared/service-status'

const api = () => (window as any).cipherKeel

// ---------------------------------------------------------------------------
// WizardData — shared state passed through all steps
// ---------------------------------------------------------------------------

export interface WizardData {
  projectName: string
  rootPath: string
  initGit: boolean
  githubAction: 'create' | 'link' | 'skip'
  githubRepoName?: string
  githubRepoDesc?: string
  githubVisibility?: 'public' | 'private'
  githubOwnerRepo?: string
  toolModel: 'light' | 'standard' | 'heavy'
  toolNiveau: 'A' | 'B' | 'C'
}

export function initialWizardData(): WizardData {
  return {
    projectName: '',
    rootPath: '',
    initGit: true,
    githubAction: 'skip',
    toolModel: 'standard',
    toolNiveau: 'B',
  }
}

// ---------------------------------------------------------------------------
// WIZARD_STEPS — 5 step descriptors (id + label)
// ---------------------------------------------------------------------------

export const WIZARD_STEPS = [
  { id: 1, label: 'Projekt' },
  { id: 2, label: 'Git' },
  { id: 3, label: 'Graph' },
  { id: 4, label: 'GitHub' },
  { id: 5, label: 'Tools' },
] as const

// ---------------------------------------------------------------------------
// Validators — exported for testing
// ---------------------------------------------------------------------------

export function validateStep1(data: WizardData): boolean {
  return data.projectName.trim().length > 0 && data.rootPath.trim().length > 0
}

export function validateStep2(_data: WizardData): boolean {
  // git init is optional — step always passable
  return true
}

// ---------------------------------------------------------------------------
// KickoffWizard component
// ---------------------------------------------------------------------------

interface KickoffWizardProps {
  onComplete: () => void
  onCancel: () => void
}

export function KickoffWizard({ onComplete, onCancel }: KickoffWizardProps) {
  const [step, setStep] = useState(1)
  const [data, setData] = useState<WizardData>(initialWizardData)
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const merge = (partial: Partial<WizardData>) =>
    setData((prev) => ({ ...prev, ...partial }))

  const canAdvance = () => {
    if (step === 1) return validateStep1(data)
    if (step === 2) return validateStep2(data)
    return true
  }

  const handleNext = async () => {
    if (step < 5) {
      setStep((s) => s + 1)
      return
    }
    // Step 5: finish — call project:kickoff
    setFinishing(true)
    setError(null)
    try {
      const result = await api().invoke('project:kickoff', {
        name: data.projectName,
        rootPath: data.rootPath,
        initGit: data.initGit,
        github:
          data.githubAction !== 'skip'
            ? {
                action: data.githubAction,
                name: data.githubRepoName,
                desc: data.githubRepoDesc,
                visibility: data.githubVisibility,
                ownerRepo: data.githubOwnerRepo,
              }
            : undefined,
      })
      if (result?.ok === false) {
        setError(errorMessage(result.error ?? 'Kickoff fehlgeschlagen'))
      } else {
        onComplete()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setFinishing(false)
    }
  }

  const handleBack = () => setStep((s) => Math.max(1, s - 1))

  return (
    <div style={styles.container}>
      {/* Step indicator */}
      <div style={styles.stepBar}>
        {WIZARD_STEPS.map((s) => (
          <div key={s.id} style={step === s.id ? styles.stepActive : step > s.id ? styles.stepDone : styles.stepPending}>
            <span style={styles.stepNum}>{s.id}</span>
            <span style={styles.stepLabel}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Step content */}
      <div style={styles.content}>
        {step === 1 && <StepProjectName data={data} onChange={merge} />}
        {step === 2 && <StepGitInit data={data} onChange={merge} />}
        {step === 3 && <StepGraphInit data={data} />}
        {step === 4 && <StepGitHub data={data} onChange={merge} />}
        {step === 5 && <StepToolConfig data={data} onChange={merge} />}
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {/* Navigation */}
      <div style={styles.nav}>
        <button style={styles.cancelBtn} onClick={onCancel} disabled={finishing}>
          Abbrechen
        </button>
        <div style={styles.navRight}>
          {step > 1 && (
            <button style={styles.backBtn} onClick={handleBack} disabled={finishing}>
              ← Zurück
            </button>
          )}
          <button
            style={canAdvance() && !finishing ? styles.nextBtn : styles.nextBtnDisabled}
            onClick={handleNext}
            disabled={!canAdvance() || finishing}
          >
            {finishing ? 'Starte…' : step === 5 ? 'Fertigstellen' : 'Weiter →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles — Cyberpunk-Dark palette
// ---------------------------------------------------------------------------

const font = "'JetBrains Mono', 'Fira Code', monospace"

const styles = {
  container: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    height: '100%',
    background: '#0d0d0d',
    color: '#e0e0e0',
    fontFamily: font,
    fontSize: 13,
  },
  stepBar: {
    display: 'flex' as const,
    gap: 0,
    borderBottom: '1px solid #1e1e1e',
    padding: '12px 16px',
    gap_: 12,
  },
  stepActive: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    padding: '4px 12px',
    background: '#1e3a1e',
    border: '1px solid #2a5a2a',
    borderRadius: 4,
    marginRight: 6,
  },
  stepDone: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    padding: '4px 12px',
    color: '#555',
    marginRight: 6,
    border: '1px solid transparent',
  },
  stepPending: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    padding: '4px 12px',
    color: '#444',
    marginRight: 6,
    border: '1px solid transparent',
  },
  stepNum: {
    color: '#90d090',
    fontSize: 11,
    fontWeight: 700 as const,
  },
  stepLabel: {
    fontSize: 12,
  },
  content: {
    flex: 1,
    overflow: 'auto' as const,
    padding: '24px 16px',
  },
  error: {
    padding: '8px 16px',
    color: '#e05050',
    fontSize: 12,
    borderTop: '1px solid #2a1a1a',
    background: '#1a0d0d',
  },
  nav: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    padding: '12px 16px',
    borderTop: '1px solid #1e1e1e',
    gap: 8,
  },
  navRight: {
    display: 'flex' as const,
    gap: 8,
  },
  cancelBtn: {
    background: 'none',
    border: '1px solid #2a2a2a',
    borderRadius: 4,
    color: '#555',
    fontFamily: font,
    fontSize: 13,
    padding: '6px 14px',
    cursor: 'pointer',
  },
  backBtn: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 4,
    color: '#888',
    fontFamily: font,
    fontSize: 13,
    padding: '6px 14px',
    cursor: 'pointer',
  },
  nextBtn: {
    background: '#1e3a1e',
    border: '1px solid #2a5a2a',
    borderRadius: 4,
    color: '#90d090',
    fontFamily: font,
    fontSize: 13,
    padding: '6px 16px',
    cursor: 'pointer',
  },
  nextBtnDisabled: {
    background: '#111',
    border: '1px solid #1e1e1e',
    borderRadius: 4,
    color: '#333',
    fontFamily: font,
    fontSize: 13,
    padding: '6px 16px',
    cursor: 'not-allowed' as const,
  },
} as const
