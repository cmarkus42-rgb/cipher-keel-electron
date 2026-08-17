/**
 * settings-window.tsx — React root for the settings window.
 *
 * Holds the whole view model in one state. Every write returns the freshly computed view,
 * so this file never reasons about partial state: it replaces what it has.
 *
 * No rule lives here. sperrgrund and warnungen arrive as finished German text.
 */
import { StrictMode, useState, useEffect, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import type { SettingsAnsicht, SettingsAntwort, Schreiber } from '../../shared/settings-types'
import { ModelleReiter } from '../components/settings/ModelleReiter'
import { CliStartReiter } from '../components/settings/CliStartReiter'
import { SprachausgabeReiter } from '../components/settings/SprachausgabeReiter'

const api = () => window.cipherKeel

type ReiterId = 'modelle' | 'cli' | 'sprache'

const REITER: { id: ReiterId; titel: string }[] = [
  { id: 'modelle', titel: 'Modelle' },
  { id: 'cli', titel: 'CLI-Start' },
  { id: 'sprache', titel: 'Sprachausgabe' },
]

function SettingsApp() {
  const [ansicht, setAnsicht] = useState<SettingsAnsicht | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [reiter, setReiter] = useState<ReiterId>('modelle')

  const laden = useCallback(async () => {
    try {
      setAnsicht((await api().invoke('settings:ansicht')) as SettingsAnsicht)
      setFehler(null)
    } catch (err) {
      setFehler(`Die Einstellungen liessen sich nicht laden: ${String(err)}`)
    }
  }, [])

  useEffect(() => {
    void laden()
  }, [laden])

  const schreibe: Schreiber = useCallback(async (kanal: string, ...args: unknown[]) => {
    try {
      const antwort = (await api().invoke(kanal as never, ...args)) as SettingsAntwort
      if (antwort.ok) {
        setAnsicht(antwort.ansicht)
        setFehler(null)
        return true
      }
      setFehler(antwort.fehler)
      return false
    } catch (err) {
      setFehler(String(err))
      return false
    }
  }, [])

  if (!ansicht) {
    return (
      <div style={styles.laden}>
        <span style={{ color: '#555' }}>{fehler ?? 'Lade Einstellungen…'}</span>
      </div>
    )
  }

  return (
    <div style={styles.root}>
      <div style={styles.kopf}>
        <span style={styles.logo}>cipher keel</span>
        <span style={styles.untertitel}>Einstellungen</span>
      </div>
      <div style={styles.reiterleiste}>
        {REITER.map(r => (
          <button
            key={r.id}
            style={{ ...styles.reiter, ...(reiter === r.id ? styles.reiterAktiv : {}) }}
            onClick={() => setReiter(r.id)}
          >
            {r.titel}
          </button>
        ))}
      </div>
      {fehler && <div style={styles.fehler}>{fehler}</div>}
      <div style={styles.inhalt}>
        {reiter === 'modelle' && <ModelleReiter ansicht={ansicht} schreibe={schreibe} />}
        {reiter === 'cli' && <CliStartReiter ansicht={ansicht} schreibe={schreibe} />}
        {reiter === 'sprache' && <SprachausgabeReiter ansicht={ansicht} schreibe={schreibe} />}
      </div>
    </div>
  )
}

const styles = {
  root: { display: 'flex' as const, flexDirection: 'column' as const, height: '100%', background: '#0d0d0d' },
  kopf: { display: 'flex' as const, alignItems: 'baseline' as const, gap: 12, padding: '16px 16px 12px' },
  logo: { color: '#e0e0e0', fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 600 },
  untertitel: { color: '#555', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 },
  reiterleiste: { display: 'flex' as const, gap: 4, padding: '0 16px', borderBottom: '1px solid #1e1e1e' },
  reiter: {
    background: 'none', border: 'none', borderBottom: '2px solid transparent',
    color: '#888', padding: '8px 12px', cursor: 'pointer' as const, fontSize: 13,
  },
  reiterAktiv: { color: '#e0e0e0', borderBottom: '2px solid #4a9eff' },
  fehler: {
    margin: '12px 16px 0', padding: '8px 12px', background: '#2a1416',
    border: '1px solid #5a2a2a', borderRadius: 3, color: '#ff9a9a', fontSize: 12,
  },
  inhalt: { flex: 1, overflowY: 'auto' as const, padding: 16 },
  laden: {
    display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    height: '100%', background: '#0d0d0d', fontFamily: "'JetBrains Mono', monospace",
  },
}

const root = document.getElementById('app')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <SettingsApp />
    </StrictMode>
  )
}
