/**
 * StepToolConfig — Step 5: model + niveau defaults.
 *
 * Radio-group für Model-Tier (light / standard / heavy)
 * und Niveau-Stufe (A / B / C). Defaults: standard + B.
 *
 * Presentational — receives data + onChange, no IPC.
 */
import { type WizardData } from '../KickoffWizard'

interface StepToolConfigProps {
  data: WizardData
  onChange: (partial: Partial<WizardData>) => void
}

const MODEL_OPTIONS: Array<{
  value: WizardData['toolModel']
  label: string
  desc: string
}> = [
  { value: 'light', label: 'Light', desc: 'Schnell, kostengünstig — für einfache Aufgaben.' },
  { value: 'standard', label: 'Standard', desc: 'Ausgewogen — empfohlen für die meisten Projekte.' },
  { value: 'heavy', label: 'Heavy', desc: 'Maximal — für komplexe Architektur-Arbeit.' },
]

const NIVEAU_OPTIONS: Array<{
  value: WizardData['toolNiveau']
  label: string
  desc: string
}> = [
  { value: 'A', label: 'A — Einstieg', desc: 'Mehr Erklärungen, kleinere Schritte.' },
  { value: 'B', label: 'B — Standard', desc: 'Ausgewogene Tiefe — empfohlen.' },
  { value: 'C', label: 'C — Expert', desc: 'Kompakt, technisch, wenig Erklärung.' },
]

export function StepToolConfig({ data, onChange }: StepToolConfigProps) {
  return (
    <div style={styles.container}>
      <div style={styles.heading}>Werkzeug-Konfiguration</div>
      <div style={styles.subtext}>
        Standardwerte für dieses Projekt — jederzeit änderbar.
      </div>

      {/* Model radio group */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Modell-Tier</div>
        {MODEL_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            style={
              data.toolModel === opt.value ? styles.optionRowSelected : styles.optionRow
            }
          >
            <input
              type="radio"
              name="toolModel"
              value={opt.value}
              checked={data.toolModel === opt.value}
              onChange={() => onChange({ toolModel: opt.value })}
              style={styles.radio}
            />
            <div>
              <div style={styles.optionTitle}>{opt.label}</div>
              <div style={styles.optionDesc}>{opt.desc}</div>
            </div>
          </label>
        ))}
      </div>

      {/* Niveau radio group */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Niveau</div>
        {NIVEAU_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            style={
              data.toolNiveau === opt.value ? styles.optionRowSelected : styles.optionRow
            }
          >
            <input
              type="radio"
              name="toolNiveau"
              value={opt.value}
              checked={data.toolNiveau === opt.value}
              onChange={() => onChange({ toolNiveau: opt.value })}
              style={styles.radio}
            />
            <div>
              <div style={styles.optionTitle}>{opt.label}</div>
              <div style={styles.optionDesc}>{opt.desc}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}

const font = "'JetBrains Mono', 'Fira Code', monospace"

const styles = {
  container: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 16,
    maxWidth: 520,
  },
  heading: {
    fontSize: 15,
    color: '#90d090',
    fontFamily: font,
    fontWeight: 600 as const,
    marginBottom: 2,
  },
  subtext: {
    color: '#555',
    fontFamily: font,
    fontSize: 11,
    marginBottom: 4,
  },
  section: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 4,
  },
  sectionTitle: {
    color: '#888',
    fontFamily: font,
    fontSize: 11,
    letterSpacing: '0.05em',
    marginBottom: 4,
  },
  optionRow: {
    display: 'flex' as const,
    alignItems: 'flex-start' as const,
    gap: 10,
    padding: '8px 10px',
    border: '1px solid #1e1e1e',
    borderRadius: 4,
    cursor: 'pointer',
    background: '#111',
    fontFamily: font,
  },
  optionRowSelected: {
    display: 'flex' as const,
    alignItems: 'flex-start' as const,
    gap: 10,
    padding: '8px 10px',
    border: '1px solid #2a5a2a',
    borderRadius: 4,
    cursor: 'pointer',
    background: '#0d1a0d',
    fontFamily: font,
  },
  radio: {
    accentColor: '#90d090',
    marginTop: 2,
    flexShrink: 0,
  },
  optionTitle: {
    color: '#e0e0e0',
    fontSize: 13,
    fontFamily: font,
  },
  optionDesc: {
    color: '#555',
    fontSize: 11,
    fontFamily: font,
    marginTop: 2,
  },
} as const
