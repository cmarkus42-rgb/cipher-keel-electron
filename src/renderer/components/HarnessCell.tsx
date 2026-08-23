/**
 * HarnessCell — die Niveau-B-Zelle im Gitter.
 *
 * Sie **leitet nichts ab**. `zustand` kommt ueber SESSION_STATUS_CHANGED aus dem Hauptprozess,
 * der ihn ohnehin fuehrt, um einen zweiten Auftrag abzulehnen. Eine Zelle, die aus dem
 * Ereignisstrom selbst auf „fertig" schloesse, waere die zweite Stelle, die dieselbe Sache
 * weiss — und in dieser Strecke ist genau das dreimal schiefgegangen.
 *
 * Unterlaeufe (Rechercheur) zeigt sie nicht: die stehen unter eigener laufId und erreichen den
 * Elternlauf als `unterlauf.verbraucht` und als Werkzeugergebnis. Wer einen Unterlauf einzeln
 * aufmachen will, nimmt das Harness-Fenster.
 */
import { useCallback, useState } from 'react'
import { EreignisPanel } from './harness/EreignisPanel'
import type { HarnessEreignis } from '../../shared/harness-types'

export interface Zellenansicht {
  beauftragenMoeglich: boolean
  abbrechenMoeglich: boolean
  /** Deutsch: was im Kopf der Zelle steht. */
  zustandstext: string
}

/**
 * Rein, damit sie ohne DOM pruefbar ist — dieses Repo hat keine Browser-Testumgebung, und eine
 * dafuer nachzuziehen waere eine Abhaengigkeit fuer drei Erwartungen.
 *
 * Sie nimmt **keine** Ereignisse entgegen, und das ist die Aussage: der Zustand kommt aus dem
 * Hauptprozess. Eine Zelle, die aus `run.finished` selbst auf `leerlaufend` schloesse, waere die
 * zweite Stelle, die dieselbe Sache weiss — dreimal in dieser Strecke schiefgegangen.
 */
export function zellenansicht(
  zustand: 'leerlaufend' | 'laeuft', letzterEndzustand: string | null,
): Zellenansicht {
  if (zustand === 'laeuft') {
    return { beauftragenMoeglich: false, abbrechenMoeglich: true, zustandstext: 'laeuft' }
  }
  return {
    beauftragenMoeglich: true, abbrechenMoeglich: false,
    zustandstext: letzterEndzustand ? `bereit — zuletzt: ${letzterEndzustand}` : 'bereit',
  }
}

export interface HarnessCellProps {
  sessionName: string
  /**
   * SchleifenZelle.eintragId (schleifen-sitzungen.ts) — der Registry-Eintrag, mit dem diese
   * Zelle angelegt wurde, nicht der aktuelle Inhalt des Zuordnungsplatzes 'sitzung:niveau-b'.
   * Der Platz kann sich aendern (wirkung: 'naechste-session', model/slots.ts), diese Zelle
   * faehrt aber weiter mit dem Eintrag von ihrer Anlage — deshalb zeigt der Kopf genau das,
   * was diese Zelle tatsaechlich fuehrt, nicht was der Platz gerade sagt.
   */
  eintragId: string
  zustand: 'leerlaufend' | 'laeuft'
  laufId: string | null
  letzterEndzustand: string | null
  /**
   * Alle Ereignisse aller Zellen, ungefiltert — diese Zelle filtert selbst auf ihre eigene
   * laufId (siehe unten). Die Deckelung (wie viele Ereignisse je Lauf ueberhaupt hier ankommen)
   * passiert eine Ebene hoeher, in index.tsx.
   */
  ereignisse: HarnessEreignis[]
  /** Resolves to an error message on failure, or null on success — dieselbe Konvention wie onStartSession. */
  onAuftrag: (auftragstext: string) => Promise<string | null>
  onAbbrechen: () => Promise<string | null>
  onClose: () => void
}

export function HarnessCell({
  sessionName, eintragId, zustand, laufId, letzterEndzustand, ereignisse,
  onAuftrag, onAbbrechen, onClose,
}: HarnessCellProps) {
  const [auftragstext, setAuftragstext] = useState('')
  const [sendeGerade, setSendeGerade] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const a = zellenansicht(zustand, letzterEndzustand)

  const handleBeauftragen = useCallback(() => {
    if (!a.beauftragenMoeglich || sendeGerade) return
    setSendeGerade(true)
    setFehler(null)
    void onAuftrag(auftragstext).then((meldung) => {
      setSendeGerade(false)
      if (meldung) {
        // Nicht nur console.error: eine gescheiterte Beauftragung muss der Mensch im Fenster
        // sehen, nicht nur in der Konsole.
        setFehler(meldung)
      } else {
        setAuftragstext('')
      }
    })
  }, [a.beauftragenMoeglich, sendeGerade, onAuftrag, auftragstext])

  const handleAbbrechen = useCallback(() => {
    if (!a.abbrechenMoeglich) return
    setFehler(null)
    void onAbbrechen().then((meldung) => {
      if (meldung) setFehler(meldung)
    })
  }, [a.abbrechenMoeglich, onAbbrechen])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      border: '1px solid #333', borderRadius: '4px', overflow: 'hidden', background: '#0d0d0d',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px',
        background: '#1a1a1a', borderBottom: '1px solid #333', fontSize: '12px', color: '#ccc',
        flexShrink: 0,
      }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sessionName}
        </span>
        <span style={{ color: '#565f89' }} title="Registry-Eintrag, festgehalten bei Anlage dieser Zelle">
          Modell: {eintragId}
        </span>
        <span style={{ color: zustand === 'laeuft' ? '#9ece6a' : '#565f89' }}>{a.zustandstext}</span>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', color: '#666', cursor: 'pointer',
            padding: '2px 4px', fontSize: '14px', lineHeight: 1,
          }}
          title="Zelle schliessen"
        >
          ×
        </button>
      </div>
      <div style={{ padding: 8, borderBottom: '1px solid #1f2335', display: 'grid', gap: 6, flexShrink: 0 }}>
        <label htmlFor={`auftrag-${sessionName}`} style={{ color: '#565f89', fontSize: 11 }}>Auftrag</label>
        <textarea
          id={`auftrag-${sessionName}`}
          value={auftragstext}
          onChange={(e) => setAuftragstext(e.target.value)}
          disabled={!a.beauftragenMoeglich}
          rows={3}
          style={{
            background: '#16161e', color: '#e0e0e0', border: '1px solid #292e42', padding: 6,
            resize: 'vertical',
          }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleBeauftragen} disabled={!a.beauftragenMoeglich || sendeGerade}>
            Beauftragen
          </button>
          <button onClick={handleAbbrechen} disabled={!a.abbrechenMoeglich}>
            Abbrechen
          </button>
        </div>
        {fehler && <p style={{ color: '#f7768e', margin: 0, fontSize: 12 }}>{fehler}</p>}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <EreignisPanel ereignisse={ereignisse.filter(e => e.laufId === laufId)} />
      </div>
    </div>
  )
}
