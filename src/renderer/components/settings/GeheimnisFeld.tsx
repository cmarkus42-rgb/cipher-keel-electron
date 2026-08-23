/**
 * GeheimnisFeld — write-only key entry.
 *
 * The secret is never read back: the view model carries a status, never a value, and this
 * component clears its input as soon as the write is dispatched. Nothing here can display
 * a key, because nothing here ever receives one.
 */
import { useState } from 'react'
import type { GeheimnisStatus, Schreiber } from '../../../shared/settings-types'

const STATUS_TEXT: Record<string, string> = {
  schluesselbund: 'hinterlegt',
  umgebung: 'aus der Umgebung',
  fehlt: 'fehlt',
  unbekannt: 'unbekannt',
}

const STATUS_FARBE: Record<string, string> = {
  schluesselbund: '#6bbf6b',
  umgebung: '#d9b25f',
  fehlt: '#ff9a9a',
  unbekannt: '#888',
}

/**
 * Nimmt Schluesselnamen und Stand einzeln statt einen ganzen Registry-Eintrag: dasselbe Feld
 * traegt inzwischen auch die Suchanbieter-Schluessel im Netz-Reiter, und die haben keinen
 * Eintrag. Eine zweite Kopie dieser Oberflaeche waere eine zweite Stelle, an der die Regel
 * "der Schluessel wird nie zurueckgelesen" eingehalten werden muss — und die zweite ist die,
 * die beim naechsten Umbau vergessen wird.
 */
export function GeheimnisFeld({
  keyRef,
  status,
  hinweis,
  schreibe,
}: {
  keyRef: string | null
  status: GeheimnisStatus | null
  hinweis: string | null
  schreibe: Schreiber
}) {
  const [wert, setWert] = useState('')
  if (!keyRef || !status) return null

  const speichern = async () => {
    const zuSchreiben = wert
    setWert('')
    await schreibe('settings:geheimnis-setzen', keyRef, zuSchreiben)
  }

  return (
    <div style={styles.rahmen}>
      <div style={styles.kopf}>
        <span style={styles.marke}>Schluessel „{keyRef}"</span>
        <span style={{ ...styles.status, color: STATUS_FARBE[status] }}>
          {STATUS_TEXT[status]}
        </span>
      </div>
      <div style={styles.hinweis}>{hinweis ?? ''}</div>
      <div style={styles.zeile}>
        <input
          type="password"
          value={wert}
          placeholder="Neuen Schluessel eintragen"
          onChange={e => setWert(e.target.value)}
          style={styles.eingabe}
        />
        <button onClick={speichern} disabled={!wert} style={styles.knopf}>
          Im Schluesselbund speichern
        </button>
        {status === 'schluesselbund' && (
          <button
            onClick={() => schreibe('settings:geheimnis-loeschen', keyRef)}
            style={styles.knopf}
          >
            Loeschen
          </button>
        )}
      </div>
    </div>
  )
}

const styles = {
  rahmen: { marginTop: 8, padding: 8, background: '#131313', border: '1px solid #222', borderRadius: 3 },
  kopf: { display: 'flex' as const, gap: 8, alignItems: 'baseline' as const },
  marke: { color: '#bbb', fontSize: 12 },
  status: { fontSize: 11, fontWeight: 600 },
  hinweis: { color: '#777', fontSize: 11, margin: '4px 0 6px' },
  zeile: { display: 'flex' as const, gap: 6 },
  eingabe: {
    flex: 1, background: '#0d0d0d', border: '1px solid #333', borderRadius: 3,
    color: '#ddd', padding: '4px 6px', fontSize: 12,
  },
  knopf: {
    background: '#1a1a1a', color: '#ddd', border: '1px solid #333',
    borderRadius: 3, padding: '4px 10px', cursor: 'pointer' as const, fontSize: 12,
  },
}
