/**
 * cipher-keel-electron — Renderer process entry point.
 *
 * Bootstraps React and renders the SessionGrid.
 * Access to Electron main process goes exclusively through window.cipherKeel
 * (exposed via src/preload.ts via contextBridge).
 *
 * No direct access to Node.js APIs — renderer runs with:
 *   contextIsolation: true, nodeIntegration: false, sandbox: true
 */

import { StrictMode, useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { SessionGrid } from './components/SessionGrid'
import { Sidebar, SidebarSession } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { useVoiceSession } from './hooks/useVoiceSession'
import { shouldApplyStatusResult } from './service-status-fetch'
import { errorMessage, type ServiceStatusMap } from '../shared/service-status'
import { defaultPresetId } from '../shared/preset-catalog'
import type { HarnessAntwort, HarnessEreignis, SessionStatusChanged } from '../shared/harness-types'

interface SessionSlot {
  type: 'session' | 'launcher' | 'harness'
  sessionId?: string
  sessionName?: string
  status?: 'active' | 'closing' | 'stopped'
  contextUsage?: number
  /**
   * Nur fuer type 'harness'. Gefuehrt vom Hauptprozess ueber SESSION_STATUS_CHANGED, nie hier
   * abgeleitet — siehe den Modulkopf von HarnessCell.tsx: eine Zelle, die aus dem Ereignisstrom
   * selbst auf 'leerlaufend' schloesse, waere die zweite Stelle, die dieselbe Sache weiss.
   */
  zustand?: 'leerlaufend' | 'laeuft'
  laufId?: string | null
  letzterEndzustand?: string | null
  /** SchleifenZelle.eintragId, festgehalten bei Anlage der Zelle — nicht der aktuelle Platzinhalt. */
  eintragId?: string
}

// IPC channel constants (inlined to avoid circular imports in renderer)
const SERVICES_STATUS = 'services:status'
const SERVICES_STATUS_CHANGED = 'services:status-changed'
const APP_READY = 'app:ready'
const SESSION_AUFTRAG = 'session:auftrag'
const SESSION_STATUS_CHANGED = 'session:status-changed'
const HARNESS_EREIGNIS = 'harness:ereignis'
const HARNESS_LAUF_ABBRECHEN = 'harness:lauf-abbrechen'
/**
 * Deckel je Lauf, nicht insgesamt: ein einzelner sehr langer Lauf soll den Renderer-Speicher
 * nicht unbegrenzt fuellen. Das ist eine Deckelung, keine Vollstaendigkeit — was darueber
 * hinausgeht, faellt aus dieser Ansicht, bleibt aber in der Harness-DB nachlesbar
 * (harness:lauf-lesen im Harness-Fenster).
 */
const HARNESS_EREIGNIS_DECKEL = 500

const api = () => window.cipherKeel

function App() {
  const [slots, setSlots] = useState<SessionSlot[]>([])
  const [grid] = useState({ cols: 2, rows: 2 })
  // CK-NFR-010: subsystem degradation status for the StatusBar
  const [serviceStatus, setServiceStatus] = useState<ServiceStatusMap | null>(null)
  // Derive focused session ID from first active session slot
  const focusedSessionId = useMemo(() => {
    const active = slots.find(s => s.type === 'session' && s.status === 'active')
    return active?.sessionId ?? null
  }, [slots])
  // CK-VOICE-009/010: Voice session with graceful degradation
  const voice = useVoiceSession(focusedSessionId)

  // F-6: returns an error message string on failure (null on success) instead of
  // only console.error-ing it, so LauncherCell can show the user what happened
  // rather than reverting silently from "..." back to "+".
  const handleStartSession = useCallback(async (_slotIndex: number, entityId = defaultPresetId()): Promise<string | null> => {
    const result = await api().invoke('session:create', { entityId }) as {
      id: string | null
      name: string | null
      error: string | null
      /** F2: set when a tier assignment named a non-cli-harness entry and the session
       *  fell back to agent.modelTiers — surfaced here for now as a console warning
       *  rather than a UI banner, which is beyond this fix's scope. */
      hinweis?: string | null
      /**
       * Nur gesetzt, wenn der Lancierpfad eine Niveau-B-Schleifenzelle statt einer tmux-Sitzung
       * ergab (ipc-handlers.ts, Konstante SITZUNG_EIGENE_SCHLEIFE in agent-adapter.ts). Der
       * Renderer vergleicht nur auf "gesetzt", ohne den Wert selbst zu benennen: die Werte
       * dieses Vokabulars haben genau eine Heimat (tests/model/eignung-einzige-quelle.test.ts),
       * und src/renderer gehoert nicht dazu.
       */
      sitzungsart?: string | null
      /**
       * Nur gesetzt, wenn sitzungsart oben gesetzt ist — SchleifenZelle.eintragId, der
       * Registry-Eintrag, mit dem diese Zelle angelegt wurde. Kommt vom Hauptprozess, weil der
       * ihn bereits aus dem Niveau-B-Zuordnungsplatz aufgeloest hat; ein zweites Nachschlagen
       * hier waere dieselbe Tatsache auf einem zweiten Weg.
       */
      eintragId?: string | null
    }
    if (result?.id && result.name) {
      if (result.hinweis) {
        console.warn('[renderer] session create used a fallback model:', result.hinweis)
      }
      if (result.sitzungsart) {
        setSlots((prev) => [
          ...prev,
          {
            type: 'harness', sessionId: result.name!, sessionName: result.name!,
            zustand: 'leerlaufend', laufId: null, letzterEndzustand: null,
            eintragId: result.eintragId ?? '',
          },
        ])
        return null
      }
      setSlots((prev) => [
        ...prev,
        { type: 'session', sessionId: result.name!, sessionName: result.name!, status: 'active' }
      ])
      return null
    }
    const message = errorMessage(result?.error ?? 'Session konnte nicht gestartet werden')
    console.error('[renderer] session create failed:', result?.error)
    return message
  }, [])

  // Ein Auftrag an eine Niveau-B-Zelle. Gibt wie handleStartSession eine Fehlermeldung statt
  // null zurueck (F-6-Konvention) — eine gescheiterte Beauftragung muss der Mensch im Fenster
  // sehen, nicht nur in der Konsole.
  const handleAuftrag = useCallback(async (sessionName: string, auftragstext: string): Promise<string | null> => {
    const antwort = await api().invoke(SESSION_AUFTRAG, { name: sessionName, auftragstext }) as
      HarnessAntwort<{ laufId: string; fortgesetzt: boolean }>
    if (antwort.ok) return null
    console.error('[renderer] session:auftrag failed:', antwort.meldung)
    return antwort.meldung
  }, [])

  const handleAbbrechenLauf = useCallback(async (laufId: string): Promise<string | null> => {
    const antwort = await api().invoke(HARNESS_LAUF_ABBRECHEN, laufId) as HarnessAntwort<true>
    if (antwort.ok) return null
    console.error('[renderer] harness:lauf-abbrechen failed:', antwort.meldung)
    return antwort.meldung
  }, [])

  const handleCloseSession = useCallback(async (sessionId: string) => {
    setSlots((prev) =>
      prev.map((s) => (s.sessionId === sessionId ? { ...s, status: 'closing' as const } : s))
    )
    const result = await api().invoke('session:destroy', sessionId) as { ok: boolean; error: string | null }
    if (result?.ok) {
      setSlots((prev) => prev.filter((s) => s.sessionId !== sessionId))
    } else {
      console.error('[renderer] session destroy failed:', result?.error)
      setSlots((prev) =>
        prev.map((s) => (s.sessionId === sessionId ? { ...s, status: 'active' as const } : s))
      )
    }
  }, [])

  // Der Zellenzustand einer Niveau-B-Zelle kommt ausschliesslich hierueber — nie aus
  // HARNESS_EREIGNIS abgeleitet (Modulkopf HarnessCell.tsx). laufId bleibt beim Uebergang nach
  // 'leerlaufend' stehen (SchleifenZelle tut dasselbe, schleifen-sitzungen.ts): der Kopf soll
  // den Verlauf des zuletzt gelaufenen Auftrags noch zeigen koennen, nicht auf "Noch kein Lauf"
  // zurueckspringen, sobald er fertig ist.
  useEffect(() => {
    const unsub = api().on(SESSION_STATUS_CHANGED, (_event, status) => {
      const s = status as SessionStatusChanged
      setSlots((prev) => prev.map((slot) => {
        if (slot.type !== 'harness' || slot.sessionName !== s.name) return slot
        if (s.zustand === 'laeuft') {
          return { ...slot, zustand: 'laeuft', laufId: s.laufId }
        }
        return { ...slot, zustand: 'leerlaufend', letzterEndzustand: s.endzustand }
      }))
    })
    return unsub
  }, [])

  // Sammelt Harness-Ereignisse aller Zellen fuer die HarnessCells (die selbst nach laufId
  // filtern). Gedeckelt je laufId auf HARNESS_EREIGNIS_DECKEL: ein einzelner sehr langer Lauf
  // soll den Renderer-Speicher nicht unbegrenzt fuellen. Wer ueber die Deckelung hinaus will,
  // liest im Harness-Fenster (harness:lauf-lesen) nach — dort steht der volle Verlauf aus der DB.
  const [harnessEreignisse, setHarnessEreignisse] = useState<HarnessEreignis[]>([])
  useEffect(() => {
    const unsub = api().on(HARNESS_EREIGNIS, (_event, e) => {
      const ereignis = e as HarnessEreignis
      setHarnessEreignisse((prev) => {
        const naechste = [...prev, ereignis]
        const zuDiesemLauf = naechste.filter((x) => x.laufId === ereignis.laufId)
        if (zuDiesemLauf.length <= HARNESS_EREIGNIS_DECKEL) return naechste
        const ueberschuss = zuDiesemLauf.length - HARNESS_EREIGNIS_DECKEL
        let uebersprungen = 0
        return naechste.filter((x) => {
          if (x.laufId !== ereignis.laufId) return true
          if (uebersprungen < ueberschuss) { uebersprungen++; return false }
          return true
        })
      })
    })
    return unsub
  }, [])

  // Listen for context usage updates from StatusLineMonitor. Extra args on a
  // MainToRendererChannel listener are typed unknown — narrowed here rather
  // than annotated, since the wire payload isn't statically known until checked.
  useEffect(() => {
    const unsub = api().on('statusline:ctx-update', (_event, sessionId, usage) => {
      if (typeof sessionId !== 'string') return
      const percentage = (usage as { percentage?: unknown } | null)?.percentage
      if (typeof percentage !== 'number') return
      setSlots((prev) =>
        prev.map((s) =>
          s.sessionId === sessionId ? { ...s, contextUsage: percentage } : s
        )
      )
    })
    return unsub
  }, [])

  // CK-NFR-010: fetch subsystem status once, then re-fetch once main-process
  // init finishes and whenever the status changes. The first fetch on mount
  // can legitimately land before service-lifecycle's setImmediate-deferred
  // init runs, so app:ready is the signal that the snapshot is trustworthy.
  //
  // getServiceStatus() is a synchronous read today, so responses happen to
  // resolve in dispatch order — but nothing guarantees that once it becomes
  // a real async probe. requestSeqRef/appliedSeqRef + shouldApplyStatusResult
  // enforce "only the newest response wins" explicitly rather than relying
  // on that timing accident.
  const requestSeqRef = useRef(0)
  const appliedSeqRef = useRef(0)

  const fetchServiceStatus = useCallback(async () => {
    if (!api()) return
    const mySeq = ++requestSeqRef.current
    try {
      const result = await api().invoke(SERVICES_STATUS) as ServiceStatusMap | undefined
      if (shouldApplyStatusResult(appliedSeqRef.current, mySeq)) {
        appliedSeqRef.current = mySeq
        setServiceStatus(result ?? null)
      }
    } catch (err) {
      // Fail safe: keep the last known serviceStatus rather than clobbering it.
      console.error('[renderer] services:status fetch failed:', err)
    }
  }, [])

  useEffect(() => {
    fetchServiceStatus()
  }, [fetchServiceStatus])

  useEffect(() => {
    if (!api()) return
    const unsubReady = api().on(APP_READY, () => { fetchServiceStatus() })
    const unsubChanged = api().on(SERVICES_STATUS_CHANGED, () => { fetchServiceStatus() })
    return () => {
      unsubReady()
      unsubChanged()
    }
  }, [fetchServiceStatus])

  const sidebarSessions = useMemo<SidebarSession[]>(() =>
    slots
      .filter(s => s.type === 'session')
      .map(s => ({
        sessionId: s.sessionId!,
        sessionName: s.sessionName!,
        status: s.status!,
      })),
    [slots]
  )

  const sessionCount = sidebarSessions.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TitleBar />
      <div style={{ display: 'flex', flexDirection: 'row', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          sessions={sidebarSessions}
          activeSessionId={focusedSessionId ?? undefined}
        />
        <SessionGrid
          cols={grid.cols}
          rows={grid.rows}
          slots={slots}
          voiceDot={voice.voiceDotState}
          onStartSession={handleStartSession}
          onCloseSession={handleCloseSession}
          harnessEreignisse={harnessEreignisse}
          onAuftrag={handleAuftrag}
          onAbbrechen={handleAbbrechenLauf}
        />
      </div>
      <StatusBar sessionCount={sessionCount} activeProject="" serviceStatus={serviceStatus} />
    </div>
  )
}

/**
 * TitleBar — schmaler Streifen oben im Grid-Fenster.
 *
 * Das Fenster laeuft mit titleBarStyle 'hiddenInset' (window-manager.ts), die
 * macOS-Ampel liegt also *innerhalb* der Inhaltsflaeche oben links. Ohne diesen
 * Streifen ueberlappt sie die erste Zeile des Inhalts — und weil ohne Titelleiste
 * keine Drag-Flaeche uebrig bleibt, laesst sich das Fenster kaum verschieben.
 *
 * Der Streifen loest beides: er haelt die Ampel frei und ist als app-region 'drag'
 * die Greifflaeche des Fensters. TITLEBAR_HEIGHT entspricht der macOS-Titelleiste,
 * TRAFFIC_LIGHT_INSET dem Platz, den die drei Knoepfe links belegen.
 */
const TITLEBAR_HEIGHT = 28
const TRAFFIC_LIGHT_INSET = 78

function TitleBar() {
  return (
    <div
      style={{
        height: TITLEBAR_HEIGHT,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: TRAFFIC_LIGHT_INSET,
        background: '#1a1a1a',
        borderBottom: '1px solid #333',
        fontSize: '11px',
        color: '#666',
        WebkitAppRegion: 'drag',
        userSelect: 'none',
      } as React.CSSProperties}
    >
      cipher keel
    </div>
  )
}

const root = document.getElementById('app')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
