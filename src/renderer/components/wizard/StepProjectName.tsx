/**
 * StepProjectName — Step 1: project name + root directory picker.
 *
 * Presentational: receives data + onChange, no internal async state.
 * Directory picker uses dialog:open-directory IPC.
 */
import { type WizardData } from '../KickoffWizard'

const api = () => (window as any).cipherKeel

interface StepProjectNameProps {
  data: WizardData
  onChange: (partial: Partial<WizardData>) => void
}

export function StepProjectName({ data, onChange }: StepProjectNameProps) {
  const handlePickDir = async () => {
    try {
      const result = await api().invoke('dialog:open-directory', { title: 'Root-Ordner wählen' })
      if (!result.canceled && result.path) {
        onChange({ rootPath: result.path })
      }
    } catch (err) {
      console.error('[StepProjectName] dialog:open-directory failed:', err)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.heading}>Neues Projekt</div>

      <label style={styles.label}>Projektname</label>
      <input
        style={styles.input}
        type="text"
        placeholder="z.B. cipher-keel-v2"
        value={data.projectName}
        onChange={(e) => onChange({ projectName: e.target.value })}
        autoFocus
      />

      <label style={styles.label}>Root-Ordner</label>
      <div style={styles.pathRow}>
        <input
          style={{ ...styles.input, flex: 1 }}
          type="text"
          placeholder="/Users/cipher/projects/mein-projekt"
          value={data.rootPath}
          onChange={(e) => onChange({ rootPath: e.target.value })}
        />
        <button style={styles.pickBtn} onClick={handlePickDir}>
          Wählen…
        </button>
      </div>

      {data.rootPath && (
        <div style={styles.hint}>{data.rootPath}</div>
      )}
    </div>
  )
}

const font = "'JetBrains Mono', 'Fira Code', monospace"

const styles = {
  container: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 8,
    maxWidth: 520,
  },
  heading: {
    fontSize: 15,
    color: '#90d090',
    fontFamily: font,
    fontWeight: 600 as const,
    marginBottom: 12,
  },
  label: {
    color: '#888',
    fontSize: 11,
    fontFamily: font,
    letterSpacing: '0.05em',
    marginTop: 4,
  },
  input: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 4,
    color: '#e0e0e0',
    fontFamily: font,
    fontSize: 13,
    padding: '8px 10px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  pathRow: {
    display: 'flex' as const,
    gap: 8,
    alignItems: 'center' as const,
  },
  pickBtn: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 4,
    color: '#888',
    fontFamily: font,
    fontSize: 12,
    padding: '8px 12px',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  hint: {
    color: '#444',
    fontSize: 11,
    fontFamily: font,
    padding: '2px 0',
    wordBreak: 'break-all' as const,
  },
} as const
