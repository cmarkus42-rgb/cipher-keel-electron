/**
 * StepGitInit — Step 2: optional git init.
 *
 * Checks whether .git already exists in rootPath on mount (git:has-repo IPC).
 * If a repo exists, checkbox is disabled and initGit is forced false.
 */
import { useState, useEffect } from 'react'
import { type WizardData } from '../KickoffWizard'

const api = () => window.cipherKeel

interface StepGitInitProps {
  data: WizardData
  onChange: (partial: Partial<WizardData>) => void
}

export function StepGitInit({ data, onChange }: StepGitInitProps) {
  const [hasRepo, setHasRepo] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!data.rootPath) return
    setChecking(true)
    ;(api().invoke('git:has-repo', data.rootPath) as Promise<{ hasRepo: boolean }>)
      .then((result) => {
        setHasRepo(result.hasRepo)
        if (result.hasRepo) {
          // Already a repo — disable and force initGit:false
          onChange({ initGit: false })
        }
      })
      .catch((err: unknown) => {
        console.error('[StepGitInit] git:has-repo failed:', err)
      })
      .finally(() => setChecking(false))
  }, [data.rootPath])

  const disabled = hasRepo === true || checking

  return (
    <div style={styles.container}>
      <div style={styles.heading}>Git-Repository</div>

      {checking && <div style={styles.hint}>Prüfe Verzeichnis…</div>}

      {hasRepo === true && (
        <div style={styles.notice}>
          ✓ .git bereits vorhanden — git init übersprungen.
        </div>
      )}

      <label style={disabled ? styles.checkRowDisabled : styles.checkRow}>
        <input
          type="checkbox"
          checked={data.initGit}
          disabled={disabled}
          onChange={(e) => onChange({ initGit: e.target.checked })}
          style={styles.checkbox}
        />
        <span>git init ausführen</span>
      </label>

      <div style={styles.desc}>
        Initialisiert ein neues Git-Repository im Root-Ordner.
        Kann übersprungen werden, wenn das Verzeichnis bereits ein Repo ist.
      </div>
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
  checkRow: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 10,
    color: '#e0e0e0',
    fontFamily: font,
    fontSize: 13,
    cursor: 'pointer',
    userSelect: 'none' as const,
  },
  checkRowDisabled: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 10,
    color: '#444',
    fontFamily: font,
    fontSize: 13,
    cursor: 'not-allowed' as const,
    userSelect: 'none' as const,
  },
  checkbox: {
    accentColor: '#90d090',
    width: 14,
    height: 14,
  },
  notice: {
    color: '#90d090',
    fontFamily: font,
    fontSize: 12,
    padding: '6px 10px',
    background: '#0d1a0d',
    border: '1px solid #1e3a1e',
    borderRadius: 4,
  },
  hint: {
    color: '#555',
    fontFamily: font,
    fontSize: 12,
  },
  desc: {
    color: '#555',
    fontFamily: font,
    fontSize: 11,
    lineHeight: 1.6,
    marginTop: 4,
  },
} as const
