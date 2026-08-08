/**
 * StepGraphInit — Step 3: initialize knowledge graph with 8 phase chain.
 *
 * Calls graph:init-project IPC on mount and shows per-phase progress.
 * Idempotent: re-running won't duplicate phases (upsert semantics).
 */
import { useState, useEffect, useRef } from 'react'
import { type WizardData } from '../KickoffWizard'
import { errorMessage } from '../../../shared/service-status'

const api = () => window.cipherKeel

const PHASE_NAMES = [
  'ideation',
  'requirements',
  'architecture',
  'development',
  'testing',
  'fixing',
  'audit',
  'release-management',
] as const

interface StepGraphInitProps {
  data: WizardData
}

type Status = 'pending' | 'running' | 'done' | 'error'

export function StepGraphInit({ data }: StepGraphInitProps) {
  const [status, setStatus] = useState<Status>('pending')
  const [phaseUids, setPhaseUids] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const initiated = useRef(false)

  useEffect(() => {
    if (initiated.current) return
    initiated.current = true

    setStatus('running')
    ;(api().invoke('graph:init-project', data.rootPath) as Promise<{ ok: boolean; phaseUids?: string[]; error?: unknown }>)
      .then((result) => {
        if (result.ok) {
          setPhaseUids(result.phaseUids ?? [])
          setStatus('done')
        } else {
          setErrorMsg(errorMessage(result.error))
          setStatus('error')
        }
      })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : String(err))
        setStatus('error')
      })
  }, [data.rootPath])

  return (
    <div style={styles.container}>
      <div style={styles.heading}>Wissensgraph initialisieren</div>

      <div style={styles.phaseList}>
        {PHASE_NAMES.map((name, i) => {
          const uid = phaseUids[i]
          const isCreated = status === 'done' || (status === 'running' && i < phaseUids.length)
          return (
            <div key={name} style={isCreated ? styles.phaseRowDone : styles.phaseRow}>
              <span style={styles.phaseIndicator}>{isCreated ? '✓' : status === 'running' ? '·' : '○'}</span>
              <span style={styles.phaseName}>{i + 1}. {name}</span>
              {uid && <span style={styles.phaseUid}>{uid.slice(0, 8)}…</span>}
            </div>
          )
        })}
      </div>

      {status === 'running' && (
        <div style={styles.hint}>Erstelle Phasen-Kette…</div>
      )}

      {status === 'done' && (
        <div style={styles.success}>
          ✓ 8 Phasen angelegt — naechste_phase-Kette bereit.
        </div>
      )}

      {status === 'error' && (
        <div style={styles.error}>
          Fehler: {errorMsg}
        </div>
      )}
    </div>
  )
}

const font = "'JetBrains Mono', 'Fira Code', monospace"

const styles = {
  container: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 12,
    maxWidth: 520,
  },
  heading: {
    fontSize: 15,
    color: '#90d090',
    fontFamily: font,
    fontWeight: 600 as const,
    marginBottom: 4,
  },
  phaseList: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 4,
    padding: '12px 0',
  },
  phaseRow: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 10,
    color: '#444',
    fontFamily: font,
    fontSize: 12,
  },
  phaseRowDone: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 10,
    color: '#e0e0e0',
    fontFamily: font,
    fontSize: 12,
  },
  phaseIndicator: {
    color: '#90d090',
    width: 14,
    textAlign: 'center' as const,
    flexShrink: 0,
  },
  phaseName: {
    flex: 1,
  },
  phaseUid: {
    color: '#444',
    fontSize: 10,
    fontFamily: font,
  },
  hint: {
    color: '#555',
    fontFamily: font,
    fontSize: 12,
  },
  success: {
    color: '#90d090',
    fontFamily: font,
    fontSize: 12,
    padding: '8px 10px',
    background: '#0d1a0d',
    border: '1px solid #1e3a1e',
    borderRadius: 4,
  },
  error: {
    color: '#e05050',
    fontFamily: font,
    fontSize: 12,
    padding: '8px 10px',
    background: '#1a0d0d',
    border: '1px solid #3a1e1e',
    borderRadius: 4,
  },
} as const
