/**
 * EintragFormular — create or edit one registry entry.
 *
 * No capability row here: that is the canary job's territory, and a hand-filled row would
 * carry `vermutet` anyway, which is exactly what the fallback already gives.
 *
 * Validation is not repeated on this side. The form assembles a raw object and lets
 * normaliseEintrag in main reject it — that function's German messages are precise, and a
 * second validator here would be a second truth.
 */
import { useState } from 'react'
import type { EintragAnsicht } from '../../../shared/settings-types'

type Art = 'cli-harness' | 'local-http' | 'api'
type Oertlichkeit = 'lokal' | 'eigenes-netz' | 'fremdes-netz'
type Schreiber = (kanal: string, ...args: unknown[]) => Promise<void>

interface Felder {
  id: string
  name: string
  art: Art
  oertlichkeit: Oertlichkeit
  erklaertext: string
  empfehlung: string
  cli: string
  handle: string
  host: string
  port: string
  model: string
  baseUrl: string
  keyRef: string
}

const LEER: Felder = {
  id: '', name: '', art: 'local-http', oertlichkeit: 'eigenes-netz',
  erklaertext: '', empfehlung: '',
  cli: 'claude', handle: '', host: '', port: '11434', model: '', baseUrl: '', keyRef: '',
}

export function EintragFormular({
  vorlage,
  schreibe,
  onFertig,
}: {
  vorlage: EintragAnsicht | null
  schreibe: Schreiber
  onFertig: () => void
}) {
  const [f, setF] = useState<Felder>(() =>
    vorlage
      ? {
          ...LEER,
          id: vorlage.id,
          name: vorlage.name,
          art: vorlage.art,
          oertlichkeit: vorlage.oertlichkeit,
          erklaertext: vorlage.erklaertext,
          empfehlung: vorlage.empfehlung,
          keyRef: vorlage.keyRef ?? '',
        }
      : LEER
  )

  const setze = (k: keyof Felder) => (e: { target: { value: string } }) =>
    setF(alt => ({ ...alt, [k]: e.target.value }))

  const erreichbarkeit = (): unknown => {
    if (f.art === 'cli-harness') return { art: 'cli-harness', cli: f.cli, handle: f.handle }
    if (f.art === 'api') {
      return { art: 'api', baseUrl: f.baseUrl, model: f.model, keyRef: f.keyRef }
    }
    return { art: 'local-http', host: f.host, port: Number(f.port), model: f.model }
  }

  const speichern = async () => {
    await schreibe('settings:eintrag-speichern', {
      id: f.id,
      name: f.name,
      art: f.art,
      erreichbarkeit: erreichbarkeit(),
      oertlichkeit: f.oertlichkeit,
      erklaertext: f.erklaertext,
      empfehlung: f.empfehlung,
    })
    onFertig()
  }

  const istUeberschreibung = vorlage !== null && !vorlage.loeschbar

  return (
    <div style={styles.rahmen}>
      <h3 style={styles.titel}>{vorlage ? `Eintrag „${vorlage.name}" bearbeiten` : 'Neuer Eintrag'}</h3>

      {istUeberschreibung && (
        <div style={styles.ueberschreibung}>
          Dies ist ein gebuendelter Eintrag. Gespeichert wird eine eigene Fassung unter
          derselben Kennung, die den gebuendelten ueberschreibt — der gebuendelte bleibt
          unangetastet und kehrt zurueck, sobald die eigene Fassung geloescht wird.
        </div>
      )}

      <label style={styles.marke}>Kennung</label>
      <input value={f.id} onChange={setze('id')} disabled={vorlage !== null} style={styles.eingabe} />

      <label style={styles.marke}>Name</label>
      <input value={f.name} onChange={setze('name')} style={styles.eingabe} />

      <label style={styles.marke}>Anbieterart</label>
      <select value={f.art} onChange={setze('art')} style={styles.eingabe}>
        <option value="cli-harness">CLI-Harness</option>
        <option value="local-http">HTTP im eigenen Zugriff</option>
        <option value="api">Fremder Anbieter</option>
      </select>

      <label style={styles.marke}>Oertlichkeit</label>
      <select value={f.oertlichkeit} onChange={setze('oertlichkeit')} style={styles.eingabe}>
        <option value="lokal">lokal — verlaesst diese Maschine nicht</option>
        <option value="eigenes-netz">eigenes Netz</option>
        <option value="fremdes-netz">fremdes Netz</option>
      </select>

      {f.art === 'cli-harness' && (
        <>
          <label style={styles.marke}>CLI-Befehl</label>
          <input value={f.cli} onChange={setze('cli')} style={styles.eingabe} />
          <label style={styles.marke}>Modell-Handle</label>
          <input value={f.handle} onChange={setze('handle')} placeholder="opus" style={styles.eingabe} />
        </>
      )}

      {f.art === 'local-http' && (
        <>
          <label style={styles.marke}>Host</label>
          <input value={f.host} onChange={setze('host')} placeholder="127.0.0.1" style={styles.eingabe} />
          <label style={styles.marke}>Port</label>
          <input value={f.port} onChange={setze('port')} style={styles.eingabe} />
          <label style={styles.marke}>Modell</label>
          <input value={f.model} onChange={setze('model')} placeholder="gemma4:26b" style={styles.eingabe} />
        </>
      )}

      {f.art === 'api' && (
        <>
          <label style={styles.marke}>Basis-URL</label>
          <input value={f.baseUrl} onChange={setze('baseUrl')} placeholder="https://openrouter.ai/api/v1" style={styles.eingabe} />
          <label style={styles.marke}>Modell</label>
          <input value={f.model} onChange={setze('model')} style={styles.eingabe} />
          <label style={styles.marke}>Schluesselname</label>
          <input value={f.keyRef} onChange={setze('keyRef')} placeholder="openrouter" style={styles.eingabe} />
          <div style={styles.hinweis}>
            Der Schluessel selbst wird hier nicht eingetragen. Nach dem Speichern erscheint am
            Eintrag ein Feld, das ihn im Schluesselbund hinterlegt — nie in der Konfigurationsdatei.
          </div>
        </>
      )}

      <label style={styles.marke}>Erklaertext</label>
      <textarea value={f.erklaertext} onChange={setze('erklaertext')} rows={2} style={styles.eingabe} />

      <label style={styles.marke}>Empfehlung</label>
      <textarea value={f.empfehlung} onChange={setze('empfehlung')} rows={2} style={styles.eingabe} />

      <div style={styles.knopfzeile}>
        <button onClick={speichern} style={styles.knopf}>Speichern</button>
        <button onClick={onFertig} style={styles.knopf}>Abbrechen</button>
      </div>
    </div>
  )
}

const styles = {
  rahmen: { marginBottom: 16, padding: 12, background: '#0f1418', border: '1px solid #2a3a44', borderRadius: 3 },
  titel: { color: '#e0e0e0', fontSize: 13, margin: '0 0 10px' },
  marke: { display: 'block' as const, color: '#777', fontSize: 11, margin: '8px 0 3px' },
  eingabe: {
    width: '100%', background: '#0d0d0d', border: '1px solid #333', borderRadius: 3,
    color: '#ddd', padding: '4px 6px', fontSize: 12,
  },
  hinweis: { color: '#6a8fa8', fontSize: 11, marginTop: 6 },
  ueberschreibung: {
    padding: 8, background: '#1a1710', border: '1px solid #3d332a',
    borderRadius: 3, color: '#d9b25f', fontSize: 11, marginBottom: 8,
  },
  knopfzeile: { display: 'flex' as const, gap: 8, marginTop: 12 },
  knopf: {
    background: '#1a1a1a', color: '#ddd', border: '1px solid #333',
    borderRadius: 3, padding: '4px 12px', cursor: 'pointer' as const, fontSize: 12,
  },
}
