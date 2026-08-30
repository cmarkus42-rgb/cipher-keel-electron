/**
 * EreignisPanel — one line per event, expandable.
 *
 * It knows no provider name. What it shows comes out of the event stream, which is exactly the
 * acceptance M8 section 10 asks for: the renderer displays the run without knowing who answered.
 */
import { useState } from 'react'
import type { HarnessEreignis } from '../../../shared/harness-types'

// Jede Art in EREIGNIS_ARTEN braucht hier einen Eintrag und unten einen Fall in `kurzfassung`.
// Der Waechter dafuer steht in tests/renderer/ereignis-panel.test.ts — der Compiler faengt es
// nicht, weil `art` an der IPC-Grenze `string` ist.
export const FARBE: Record<string, string> = {
  'run.started': '#7aa2f7',
  'prompt.sent': '#565f89',
  'model.answered': '#9ece6a',
  'tool.intent': '#e0af68',
  'tool.completed': '#73daca',
  'tool.failed': '#f7768e',
  'tool.schema_loaded': '#bb9af7',
  'tool.entschieden': '#e0af68',
  'skill.geladen': '#c0caf5',
  'budget.warned': '#ff9e64',
  'netz.ausgehend': '#f7768e',
  'unterlauf.verbraucht': '#bb9af7',
  'auftrag.folgend': '#7aa2f7',
  'run.finished': '#7dcfff',
}

export function kurzfassung(e: HarnessEreignis): string {
  const n = e.nutzlast
  switch (e.art) {
    case 'run.started':
      return `${String(n.modellId)} · Codec ${String(n.codec)} · ${(n.werkzeuge as string[] ?? []).length} Werkzeuge`
    case 'prompt.sent':
      return `${String(n.text ?? '').length} Zeichen (Zug ${String(n.zug)})`
    case 'model.answered':
      return `${(n.bloecke as unknown[] ?? []).length} Bloecke · stop ${String((n.stopGrund as { roh?: string })?.roh ?? '')}`
    case 'tool.intent':
      return `${String(n.name)} (${String(n.aufrufId)})`
    case 'tool.completed':
      return `${String(n.name)} ok`
    case 'tool.failed':
      return `${String(n.name)}: ${String(n.meldung)}`
    case 'tool.schema_loaded':
      return String(n.name)
    case 'tool.entschieden':
      // Ja/Nein zuerst: das ist die Frage, die ein Mensch an diese Zeile hat. Der Grund steht
      // dahinter, weil er nur bei einem Nein etwas aussagt.
      return n.erlaubt === true
        ? `${String(n.name)} erlaubt`
        : `${String(n.name)} ABGELEHNT: ${String(n.grund)}`
    case 'skill.geladen':
      // Der Name genuegt, aber die Laenge gehoert dazu: bei M7 will man auf einen Blick sehen,
      // ob ein Rumpf ueberhaupt Substanz hatte oder nur eine Ueberschrift war.
      return `${String(n.name)} · ${String(n.text ?? '').length} Zeichen`
    case 'budget.warned':
      return String(n.grund)
    case 'netz.ausgehend':
      // Der Host zuerst und ungekuerzt: das ist die Frage, die ein Mensch an diese Zeile hat —
      // wohin ging etwas. Die volle URL steht aufgeklappt darunter.
      return `${String(n.werkzeug)} · Sprung ${String(n.sprung)} · ${String(n.host)}`
    case 'unterlauf.verbraucht':
      return `${String(n.runden)} Runden · ${String(n.kostenCent)} Cent (${String(n.unterLaufId)})`
    case 'auftrag.folgend':
      // Wie bei run.started zaehlt hier nur, dass ein Auftragstext ankam — der Praefix bleibt
      // unveraendert, dieses Ereignis ist die einzige Stelle, an der der Folgeauftrag sichtbar ist.
      return `${String(n.auftragstext ?? '').length} Zeichen`
    case 'run.finished':
      return `${String(n.endzustand)} / ${String(n.grund)}`
    default:
      return ''
  }
}

export function EreignisPanel({ ereignisse }: { ereignisse: HarnessEreignis[] }) {
  const [offen, setOffen] = useState<number | null>(null)
  if (ereignisse.length === 0) {
    return <p style={{ padding: 16, color: '#565f89' }}>Noch kein Lauf.</p>
  }
  return (
    <div style={{ overflowY: 'auto', flex: 1, padding: 8 }}>
      {ereignisse.map(e => (
        <div key={`${e.laufId}-${e.seq}`} style={{ marginBottom: 2 }}>
          <button
            onClick={() => setOffen(offen === e.seq ? null : e.seq)}
            style={{
              display: 'flex', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer',
              background: 'transparent', border: 'none', color: '#e0e0e0', font: 'inherit', padding: '2px 4px',
            }}
          >
            <span style={{ color: '#414868', minWidth: 28 }}>{e.seq}</span>
            <span style={{ color: FARBE[e.art] ?? '#e0e0e0', minWidth: 160 }}>{e.art}</span>
            <span style={{ color: '#a9b1d6' }}>{kurzfassung(e)}</span>
          </button>
          {offen === e.seq && (
            <pre style={{ background: '#16161e', padding: 8, margin: '4px 0 8px 40px', fontSize: 12 }}>
              {JSON.stringify(e.nutzlast, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  )
}
