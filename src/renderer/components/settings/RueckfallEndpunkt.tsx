/**
 * RueckfallEndpunkt — the editor for a role slot's fallback endpoint.
 *
 * `tier:*` slots fall back to a model handle (one field, edited inline in ModelleReiter).
 * `rolle:*` slots fall back to a whole `LlmEndpoint` -- host/port or a base URL plus a key
 * reference, never a scalar. That shape earns its own file: ModelleReiter is already the
 * largest component in this folder, and a whole endpoint form does not belong inline in it.
 *
 * Local form state, not blur-per-field: an endpoint is only meaningful complete. Writing
 * `host` alone on blur would send a half-endpoint through `normaliseEndpoint` and likely
 * fail, or worse, briefly persist a broken fallback. Fields are collected here and sent
 * together on "Uebernehmen".
 */
import { useState } from 'react'
import type { EndpunktAnsicht, Schreiber } from '../../../shared/settings-types'

type Rolle = 'tagging' | 'worker'

interface Felder {
  kind: 'ollama' | 'openai-compatible'
  host: string
  port: string
  baseUrl: string
  keyRef: string
  model: string
}

function ausAnsicht(e: EndpunktAnsicht): Felder {
  return {
    kind: e.kind,
    host: e.host,
    port: String(e.port || ''),
    baseUrl: e.baseUrl,
    keyRef: e.keyRef,
    model: e.model,
  }
}

const ROLLE_TEXT: Record<Rolle, string> = {
  tagging: 'llm.tagging',
  worker: 'llm.worker',
}

export function RueckfallEndpunkt({
  rolle,
  endpunkt,
  schreibe,
}: {
  rolle: Rolle
  endpunkt: EndpunktAnsicht
  schreibe: Schreiber
}) {
  const [f, setF] = useState<Felder>(() => ausAnsicht(endpunkt))

  const setze = (k: keyof Felder) => (e: { target: { value: string } }) =>
    setF(alt => ({ ...alt, [k]: e.target.value }))

  const uebernehmen = () => {
    schreibe('settings:rueckfall-endpunkt-setzen', rolle, {
      kind: f.kind,
      host: f.host,
      port: Number(f.port) || 0,
      baseUrl: f.baseUrl,
      keyRef: f.keyRef,
      model: f.model,
    })
  }

  return (
    <div style={styles.rahmen}>
      <div style={styles.titel}>Rueckfall {ROLLE_TEXT[rolle]}</div>

      <label style={styles.marke}>Art</label>
      <select value={f.kind} onChange={setze('kind')} style={styles.eingabe}>
        <option value="ollama">Ollama</option>
        <option value="openai-compatible">Kompatibler API-Anbieter</option>
      </select>

      {f.kind === 'ollama' && (
        <>
          <label style={styles.marke}>Host</label>
          <input value={f.host} onChange={setze('host')} placeholder="127.0.0.1" style={styles.eingabe} />
          <label style={styles.marke}>Port</label>
          <input value={f.port} onChange={setze('port')} placeholder="11434" style={styles.eingabe} />
          <label style={styles.marke}>Modell</label>
          <input value={f.model} onChange={setze('model')} placeholder="gemma4:26b" style={styles.eingabe} />
        </>
      )}

      {f.kind === 'openai-compatible' && (
        <>
          <label style={styles.marke}>Basis-URL</label>
          <input value={f.baseUrl} onChange={setze('baseUrl')} placeholder="https://openrouter.ai/api/v1" style={styles.eingabe} />
          <label style={styles.marke}>Modell</label>
          <input value={f.model} onChange={setze('model')} style={styles.eingabe} />
          <label style={styles.marke}>Schluesselname</label>
          <input value={f.keyRef} onChange={setze('keyRef')} placeholder="openrouter" style={styles.eingabe} />
          <div style={styles.hinweis}>
            Der Schluessel selbst wird hier nicht eingetragen — nur der Name, unter dem er
            im Schluesselbund liegt. Zum Hinterlegen des Schluessels: den Eintrag anlegen
            oder bearbeiten, der denselben Namen nennt.
          </div>
        </>
      )}

      <button onClick={uebernehmen} style={styles.knopf}>Uebernehmen</button>
    </div>
  )
}

const styles = {
  rahmen: { marginTop: 8, padding: 8, background: '#0f1418', border: '1px solid #2a3a44', borderRadius: 3 },
  titel: { color: '#bbb', fontSize: 12, marginBottom: 4 },
  marke: { display: 'block' as const, color: '#777', fontSize: 11, margin: '6px 0 3px' },
  eingabe: {
    width: '100%', background: '#0d0d0d', border: '1px solid #333', borderRadius: 3,
    color: '#ddd', padding: '4px 6px', fontSize: 12,
  },
  hinweis: { color: '#6a8fa8', fontSize: 11, marginTop: 6 },
  knopf: {
    marginTop: 8, background: '#1a1a1a', color: '#ddd', border: '1px solid #333',
    borderRadius: 3, padding: '4px 10px', cursor: 'pointer' as const, fontSize: 12,
  },
}
