/**
 * harness-window.tsx — React root for the harness window.
 *
 * Five channels, five callers, and nothing else besides the run overview that
 * HARNESS_LAUF_LESEN's no-argument form exists for: without it, closing this window while a run
 * is in progress (the run itself keeps going in the main process — nothing here aborts it) would
 * leave no way back to that run's log after reopening.
 *
 * The attachment picker calls HARNESS_ANHAENGE_WAEHLEN rather than an `<input type="file">` —
 * not a style choice. This renderer runs with `sandbox: true` and `nodeIntegration: false`, so
 * it has no filesystem access of its own; a plain file input would still hand the *path* back
 * here, and the main process would then read whatever path arrived over IPC with no way to tell
 * a human's click apart from a scripted string. HARNESS_LAUF_STARTEN only accepts a path the
 * main process itself watched a native dialog return — see the comment on `dialogAusgewaehlt` in
 * harness-handlers.ts. This component never sees a filesystem path it did not get back from
 * that same dialog call.
 */
import { StrictMode, useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  HARNESS_LAUF_STARTEN, HARNESS_LAUF_LESEN, HARNESS_LAUF_ABBRECHEN, HARNESS_LAUF_FORTSETZEN,
  HARNESS_ANHAENGE_WAEHLEN, HARNESS_EREIGNIS,
} from '../../shared/ipc-channels'
import type { HarnessAntwort, HarnessEreignis, LaufAnzeige } from '../../shared/harness-types'
import { EreignisPanel } from '../components/harness/EreignisPanel'

const api = () => window.cipherKeel

function Fenster() {
  const [auftrag, setAuftrag] = useState('')
  const [modellId, setModellId] = useState('')
  const [wurzel, setWurzel] = useState('')
  const [anhaenge, setAnhaenge] = useState<string[]>([])
  const [laufId, setLaufId] = useState<string | null>(null)
  const [ereignisse, setEreignisse] = useState<HarnessEreignis[]>([])
  const [laeufe, setLaeufe] = useState<LaufAnzeige[]>([])
  const [meldung, setMeldung] = useState<string | null>(null)

  const laeufeLaden = useCallback(async () => {
    const a = await api().invoke(HARNESS_LAUF_LESEN) as HarnessAntwort<LaufAnzeige[]>
    if (a.ok) setLaeufe(a.wert)
  }, [])

  useEffect(() => {
    void laeufeLaden()
  }, [laeufeLaden])

  useEffect(() => {
    // Live events for the running run.
    return api().on(HARNESS_EREIGNIS, (_ev, e) => {
      const ereignis = e as HarnessEreignis
      setEreignisse(alt => (alt.length > 0 && alt[0].laufId !== ereignis.laufId ? [ereignis] : [...alt, ereignis]))
    })
  }, [])

  const starten = useCallback(async () => {
    setMeldung(null)
    setEreignisse([])
    const a = await api().invoke(HARNESS_LAUF_STARTEN, {
      auftragstext: auftrag, modellId, wurzel, anhaenge,
    }) as HarnessAntwort<string>
    if (a.ok) {
      setLaufId(a.wert)
      void laeufeLaden()
    } else {
      setMeldung(a.meldung)
    }
  }, [auftrag, modellId, wurzel, anhaenge, laeufeLaden])

  const nachlesen = useCallback(async (id: string) => {
    const a = await api().invoke(HARNESS_LAUF_LESEN, id) as HarnessAntwort<HarnessEreignis[]>
    if (a.ok) {
      setLaufId(id)
      setEreignisse(a.wert)
    } else {
      setMeldung(a.meldung)
    }
  }, [])

  const abbrechen = useCallback(async () => {
    if (!laufId) return
    const a = await api().invoke(HARNESS_LAUF_ABBRECHEN, laufId) as HarnessAntwort<true>
    if (!a.ok) setMeldung(a.meldung)
  }, [laufId])

  const fortsetzen = useCallback(async (id: string) => {
    setMeldung(null)
    setEreignisse([])
    const a = await api().invoke(HARNESS_LAUF_FORTSETZEN, id) as HarnessAntwort<string>
    if (a.ok) {
      setLaufId(a.wert)
      void laeufeLaden()
    } else {
      setMeldung(a.meldung)
    }
  }, [laeufeLaden])

  const anhangWaehlen = useCallback(async () => {
    const a = await api().invoke(HARNESS_ANHAENGE_WAEHLEN) as HarnessAntwort<string[]>
    if (!a.ok) {
      setMeldung(a.meldung)
      return
    }
    // An empty result means the dialog was cancelled — the previous selection, if any, stands
    // rather than being cleared by a change of mind in the dialog.
    if (a.wert.length > 0) setAnhaenge(a.wert)
  }, [])

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <div style={{ padding: 12, borderBottom: '1px solid #1f2335', display: 'grid', gap: 8 }}>
          <textarea
            value={auftrag} onChange={e => setAuftrag(e.target.value)} rows={3}
            placeholder="Auftrag — etwa: Sieh dir src/main/model/ an und sag, wer warnungen() aufruft."
            style={{ background: '#16161e', color: '#e0e0e0', border: '1px solid #292e42', padding: 8 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={modellId} onChange={e => setModellId(e.target.value)} placeholder="Modell-Id aus der Registry"
              style={{ background: '#16161e', color: '#e0e0e0', border: '1px solid #292e42', padding: 6, flex: 1 }}
            />
            <input
              value={wurzel} onChange={e => setWurzel(e.target.value)} placeholder="Projektwurzel"
              style={{ background: '#16161e', color: '#e0e0e0', border: '1px solid #292e42', padding: 6, flex: 2 }}
            />
            <button onClick={() => void anhangWaehlen()}>Anhaenge ({anhaenge.length})</button>
            <button onClick={starten}>Starten</button>
            <button onClick={abbrechen} disabled={!laufId}>Abbrechen</button>
          </div>
          {meldung && <p style={{ color: '#f7768e' }}>{meldung}</p>}
        </div>
        <EreignisPanel ereignisse={ereignisse} />
      </div>
      <div style={{ width: 220, borderLeft: '1px solid #1f2335', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1f2335' }}>
          <span style={{ color: '#565f89' }}>Bisherige Laeufe</span>
          <button onClick={() => void laeufeLaden()} title="Liste neu laden">↻</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {laeufe.length === 0 && <p style={{ padding: 10, color: '#414868' }}>Noch kein Lauf.</p>}
          {[...laeufe].reverse().map(l => (
            <div
              key={l.laufId}
              style={{
                display: 'flex', alignItems: 'stretch',
                background: l.laufId === laufId ? '#1f2335' : 'transparent',
                borderBottom: '1px solid #1a1b26',
              }}
            >
              <button
                onClick={() => void nachlesen(l.laufId)}
                title={l.laufId}
                style={{
                  display: 'block', flex: 1, minWidth: 0, textAlign: 'left', cursor: 'pointer',
                  background: 'transparent', border: 'none', color: '#e0e0e0', font: 'inherit', padding: '6px 10px',
                }}
              >
                <div style={{ color: '#a9b1d6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.modellId || l.laufId.slice(0, 8)}
                </div>
                <div style={{ color: l.endzustand ? '#565f89' : '#9ece6a', fontSize: 11 }}>
                  {l.endzustand ?? 'laeuft'}
                  {/* Ohne diese Zeile sah ein Unterlauf des Rechercheurs in der Liste aus wie
                      jeder andere Lauf. */}
                  {l.istUnterlauf && <span style={{ color: '#bb9af7' }}> · Unterlauf</span>}
                </div>
              </button>
              {/* Only a run without run.finished may be resumed — the main process re-checks this
                  itself (HARNESS_LAUF_FORTSETZEN), this is only what decides whether the button
                  is offered at all. Ein Unterlauf wird gar nicht fortgesetzt: er bekaeme die
                  Registry des Hauptlaufs neben fremdem Netzinhalt (pruefeKeinUnterlauf). */}
              {l.endzustand === null && !l.istUnterlauf && (
                <button
                  onClick={() => void fortsetzen(l.laufId)}
                  title="Lauf fortsetzen"
                  style={{
                    background: 'transparent', border: 'none', color: '#9ece6a', cursor: 'pointer',
                    padding: '0 8px', fontSize: 11,
                  }}
                >
                  Fortsetzen
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('app')!).render(<StrictMode><Fenster /></StrictMode>)
