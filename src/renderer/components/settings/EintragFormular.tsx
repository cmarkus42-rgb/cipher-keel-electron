/**
 * EintragFormular — create or edit one registry entry.
 *
 * Includes the capability row (CK-NFR-012: what is meant to be adjustable in the app has to
 * be adjustable in the app, not only by editing the config file by hand). A cli-harness
 * entry gets no such section -- the CLI owns its own protocol, and normaliseEintrag rejects
 * a faehigkeiten object there. `quelle` is never a form field the user picks from -- there is
 * no dropdown for it. But it is not always `'vermutet'` either: `baueFaehigkeitenPayload`
 * carries `quelle`/`gemessenAm`/`gemessenMit`/`vertragsStrenge` through from the entry's
 * existing row unchanged, because a form must only change what it displays. Those four fields
 * are not shown here, so an edit that only touches, say, Empfehlung must not silently turn a
 * canary-measured row back into a guess (Review-Runde 1, Fund 3).
 *
 * Validation is not repeated on this side. The form assembles a raw object and lets
 * normaliseEintrag in main reject it — that function's German messages are precise, and a
 * second validator here would be a second truth. The one exception is telling the user in
 * advance that a choice is guaranteed to fail: `codecFuer` in src/main/harness/codec.ts only
 * builds `anthropic` and `openai-chat`, so this form still offers `ollama-native` and `text`
 * (existing entries use `ollama-native`, and hiding the option would show an unexplained blank
 * select for them) but warns under both, the same way it already did for the text
 * werkzeugmodus.
 */
import { useState } from 'react'
import type { EintragAnsicht, FaehigkeitenAnsicht, Schreiber } from '../../../shared/settings-types'

type Art = 'cli-harness' | 'local-http' | 'api'
type Oertlichkeit = 'lokal' | 'eigenes-netz' | 'fremdes-netz'
type Codec = FaehigkeitenAnsicht['codec']
type Werkzeugmodus = FaehigkeitenAnsicht['werkzeugmodus']
/** Empty string means "keine Stufe angeben" -- the field stays out of the payload entirely. */
type Denkstufe = '' | 'low' | 'medium' | 'high'

/** Codecs no run can actually use yet -- see codecFuer in src/main/harness/codec.ts. */
const UNGEBAUTE_CODECS = new Set<Codec>(['ollama-native', 'text'])

export interface Felder {
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
  fCodec: Codec
  fWerkzeugmodus: Werkzeugmodus
  fParalleleAufrufe: boolean
  fDenkbloecke: boolean
  fBilder: boolean
  fDokumente: boolean
  fAufgeschobenesLaden: boolean
  fWerkzeugObergrenze: string
  fNutzbaresKontextfenster: string
  fRundenbudget: string
  /**
   * Whether this entry carries a sampler block at all. A separate flag rather than four empty
   * strings, because "no block" and "a block of defaults" are different things on the wire:
   * without the block the codec sends nothing and Ollama's /v1 forces temperature and top_p to
   * 1.0; with it, whatever stands here goes out. A form that always sent the block would give
   * every existing entry samplers nobody chose, on the first save that touched anything else.
   */
  fSamplerAn: boolean
  fTemperature: string
  fTopP: string
  fPresencePenalty: string
  fMaxTokens: string
  fReasoningEffort: Denkstufe
}

/**
 * Same fallback values as `FAEHIGKEITEN_RUECKFALL` in src/main/model/entry.ts -- kept as a
 * separate constant because the renderer may not import from src/main, not because the
 * values are meant to drift. A new entry starts here, same as a saved one that never had a
 * capability row would if normaliseEintrag had to fill it in.
 */
export const LEER: Felder = {
  id: '', name: '', art: 'local-http', oertlichkeit: 'eigenes-netz',
  erklaertext: '', empfehlung: '',
  cli: 'claude', handle: '', host: '', port: '11434', model: '', baseUrl: '', keyRef: '',
  fCodec: 'text', fWerkzeugmodus: 'text',
  fParalleleAufrufe: false, fDenkbloecke: false, fBilder: false, fDokumente: false,
  fAufgeschobenesLaden: false,
  fWerkzeugObergrenze: '8', fNutzbaresKontextfenster: '8192', fRundenbudget: '12',
  // The starting values are the Thinking-Satz an Ollama ships for this class of model, so a
  // freshly ticked box does not silently change behaviour beyond pinning what was already meant
  // to hold. maxTokens 8192 rather than 4096: a lower budget cuts off before `</think>` at high
  // effort, and the client then sees no content at all, only finish_reason "length".
  fSamplerAn: false,
  fTemperature: '1.0', fTopP: '0.95', fPresencePenalty: '0.0', fMaxTokens: '8192',
  fReasoningEffort: '',
}

/**
 * An existing entry's fields, including the transport ones and the capability row.
 *
 * Reading `erreichbarkeit` is the point: without it an edit would start from blanks and
 * either fail validation or, once the blocking field was filled in, quietly overwrite the
 * untouched ones with defaults. The view model carries these precisely so the form can
 * show what is actually configured.
 *
 * `v.faehigkeiten` is undefined both for a cli-harness entry and for any other entry that
 * has not had a capability row attached yet -- both cases fall through to LEER's fallback
 * values, which is exactly right: an unfilled section should show the same numbers
 * normaliseEintrag would fill in on its own.
 */
function ausVorlage(v: EintragAnsicht): Felder {
  const basis: Felder = {
    ...LEER,
    id: v.id,
    name: v.name,
    art: v.art,
    oertlichkeit: v.oertlichkeit,
    erklaertext: v.erklaertext,
    empfehlung: v.empfehlung,
  }
  const mitFaehigkeiten: Felder = v.faehigkeiten
    ? {
        ...basis,
        fCodec: v.faehigkeiten.codec,
        fWerkzeugmodus: v.faehigkeiten.werkzeugmodus,
        fParalleleAufrufe: v.faehigkeiten.paralleleAufrufe,
        fDenkbloecke: v.faehigkeiten.denkbloecke,
        fBilder: v.faehigkeiten.bilder,
        fDokumente: v.faehigkeiten.dokumente,
        fAufgeschobenesLaden: v.faehigkeiten.aufgeschobenesLaden,
        fWerkzeugObergrenze: String(v.faehigkeiten.werkzeugObergrenze),
        fNutzbaresKontextfenster: String(v.faehigkeiten.nutzbaresKontextfenster),
        fRundenbudget: String(v.faehigkeiten.rundenbudget),
        ...(v.faehigkeiten.sampler
          ? {
              fSamplerAn: true,
              fTemperature: String(v.faehigkeiten.sampler.temperature),
              fTopP: String(v.faehigkeiten.sampler.topP),
              fPresencePenalty: String(v.faehigkeiten.sampler.presencePenalty),
              fMaxTokens: String(v.faehigkeiten.sampler.maxTokens),
              fReasoningEffort: v.faehigkeiten.sampler.reasoningEffort ?? '',
            }
          : {}),
      }
    : basis
  const e = v.erreichbarkeit
  switch (e.art) {
    case 'cli-harness':
      return { ...mitFaehigkeiten, cli: e.cli, handle: e.handle }
    case 'local-http':
      return { ...mitFaehigkeiten, host: e.host, port: String(e.port), model: e.model }
    case 'api':
      return { ...mitFaehigkeiten, baseUrl: e.baseUrl, model: e.model, keyRef: e.keyRef }
  }
}

/**
 * The capability row this form sends, or none for cli-harness. No hooks, no DOM -- a plain
 * function so this specific behaviour (which fields are overwritten and which survive) is
 * unit-testable without a React render environment. See tests/renderer/eintrag-formular.test.ts.
 *
 * `bestehend` is the entry's capability row as it existed before this edit (undefined for a
 * new entry, for a cli-harness entry, or for an entry that never had one). Only the fields the
 * section actually shows come from `f`; `quelle`, `gemessenAm`, `gemessenMit` and
 * `vertragsStrenge` come from `bestehend` unchanged -- a fresh row (no `bestehend`) still gets
 * `quelle: 'vermutet'` with no measurement fields and the rueckfall `vertragsStrenge` (by
 * omitting the key and letting normaliseEintrag's merge fill it in), but an existing
 * `gemessen` row keeps its measurement through any edit this form makes, including one that
 * never touches the capability section at all.
 */
export function baueFaehigkeitenPayload(f: Felder, bestehend: FaehigkeitenAnsicht | undefined): unknown {
  if (f.art === 'cli-harness') return undefined
  return {
    codec: f.fCodec,
    werkzeugmodus: f.fWerkzeugmodus,
    paralleleAufrufe: f.fParalleleAufrufe,
    denkbloecke: f.fDenkbloecke,
    bilder: f.fBilder,
    dokumente: f.fDokumente,
    aufgeschobenesLaden: f.fAufgeschobenesLaden,
    werkzeugObergrenze: Number(f.fWerkzeugObergrenze),
    nutzbaresKontextfenster: Number(f.fNutzbaresKontextfenster),
    rundenbudget: Number(f.fRundenbudget),
    quelle: bestehend?.quelle ?? 'vermutet',
    gemessenAm: bestehend?.gemessenAm ?? null,
    gemessenMit: bestehend?.gemessenMit ?? null,
    ...(bestehend?.vertragsStrenge ? { vertragsStrenge: bestehend.vertragsStrenge } : {}),
    // Key omitted entirely when the box is off -- not `sampler: undefined`. normaliseEintrag
    // merges raw over the fallback, and an explicit undefined would still be a present key
    // there. Omitting it is what keeps an untouched entry's wire body identical to before.
    ...(f.fSamplerAn
      ? {
          sampler: {
            temperature: Number(f.fTemperature),
            topP: Number(f.fTopP),
            presencePenalty: Number(f.fPresencePenalty),
            maxTokens: Number(f.fMaxTokens),
            ...(f.fReasoningEffort ? { reasoningEffort: f.fReasoningEffort } : {}),
          },
        }
      : {}),
  }
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
  const [f, setF] = useState<Felder>(() => (vorlage ? ausVorlage(vorlage) : LEER))

  const setze = (k: keyof Felder) => (e: { target: { value: string } }) =>
    setF(alt => ({ ...alt, [k]: e.target.value }))

  const setzeKontrollkaestchen = (k: keyof Felder) => (e: { target: { checked: boolean } }) =>
    setF(alt => ({ ...alt, [k]: e.target.checked }))

  const erreichbarkeit = (): unknown => {
    if (f.art === 'cli-harness') return { art: 'cli-harness', cli: f.cli, handle: f.handle }
    if (f.art === 'api') {
      return { art: 'api', baseUrl: f.baseUrl, model: f.model, keyRef: f.keyRef }
    }
    return { art: 'local-http', host: f.host, port: Number(f.port), model: f.model }
  }

  const speichern = async () => {
    const geschafft = await schreibe('settings:eintrag-speichern', {
      id: f.id,
      name: f.name,
      art: f.art,
      erreichbarkeit: erreichbarkeit(),
      oertlichkeit: f.oertlichkeit,
      erklaertext: f.erklaertext,
      empfehlung: f.empfehlung,
      faehigkeiten: baueFaehigkeitenPayload(f, vorlage?.faehigkeiten),
    })
    // Only on success. Closing after a rejected write would look exactly like a saved
    // one, and the only sign of trouble would be a banner above the tab.
    if (geschafft) onFertig()
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

      {f.art !== 'cli-harness' && (
        <div style={styles.faehigkeitenBlock}>
          <h4 style={styles.faehigkeitenTitel}>Faehigkeitszeile</h4>
          <div style={styles.hinweis}>
            Legt fest, ob und wie dieses Modell ueber die eigene Schleife laeuft — ohne diese
            Angaben startet kein Lauf mit diesem Eintrag.
          </div>

          <label style={styles.marke}>Codec (Uebersetzung und Transport)</label>
          <select value={f.fCodec} onChange={setze('fCodec')} style={styles.eingabe}>
            <option value="anthropic">Anthropic-Format</option>
            <option value="openai-chat">OpenAI-Chat-Format</option>
            <option value="ollama-native">Ollama, natives Format</option>
            <option value="text">nur Text, kein eigenes Protokoll</option>
          </select>
          {UNGEBAUTE_CODECS.has(f.fCodec) && (
            <div style={styles.warnung}>
              Der Codec „{f.fCodec}" ist in dieser Ausbaustufe nicht gebaut — ein Lauf mit
              diesem Eintrag wuerde beim Start abgelehnt. Gebaut sind Anthropic-Format und
              OpenAI-Chat-Format.
            </div>
          )}

          <label style={styles.marke}>Werkzeugmodus</label>
          <select value={f.fWerkzeugmodus} onChange={setze('fWerkzeugmodus')} style={styles.eingabe}>
            <option value="nativ">nativ — das Modell ruft Werkzeuge ueber sein eigenes Protokoll auf</option>
            <option value="text">textvermittelt</option>
          </select>
          {f.fWerkzeugmodus === 'text' && (
            <div style={styles.warnung}>
              Textvermittelter Werkzeugmodus ist in dieser Ausbaustufe nicht gebaut — ein Lauf
              mit diesem Eintrag wuerde beim Start abgelehnt.
            </div>
          )}

          <label style={styles.kontrollkaestchenZeile}>
            <input type="checkbox" checked={f.fParalleleAufrufe} onChange={setzeKontrollkaestchen('fParalleleAufrufe')} />
            Kann mehrere Werkzeugaufrufe gleichzeitig stellen
          </label>
          <label style={styles.kontrollkaestchenZeile}>
            <input type="checkbox" checked={f.fDenkbloecke} onChange={setzeKontrollkaestchen('fDenkbloecke')} />
            Liefert sichtbare Denkbloecke (Reasoning)
          </label>
          <label style={styles.kontrollkaestchenZeile}>
            <input type="checkbox" checked={f.fBilder} onChange={setzeKontrollkaestchen('fBilder')} />
            Kann Bilder verarbeiten
          </label>
          <label style={styles.kontrollkaestchenZeile}>
            <input type="checkbox" checked={f.fDokumente} onChange={setzeKontrollkaestchen('fDokumente')} />
            Kann Dokumente verarbeiten
          </label>
          <label style={styles.kontrollkaestchenZeile}>
            <input type="checkbox" checked={f.fAufgeschobenesLaden} onChange={setzeKontrollkaestchen('fAufgeschobenesLaden')} />
            Laedt Werkzeugdefinitionen erst bei Bedarf nach
          </label>

          {/*
            type="number" and min="1" only steer the input widget -- they make a bad value
            harder to type, nothing more. normaliseEintrag in main is still the one place that
            actually rejects a non-integer, a zero or a NaN (Review-Runde 1, Fund 2); a second
            check here would be a second truth.
          */}
          <label style={styles.marke}>Nutzbares Kontextfenster (Token)</label>
          <input type="number" min={1} value={f.fNutzbaresKontextfenster} onChange={setze('fNutzbaresKontextfenster')} style={styles.eingabe} />

          <label style={styles.marke}>Werkzeug-Obergrenze (gleichzeitig angebotene Werkzeuge)</label>
          <input type="number" min={1} value={f.fWerkzeugObergrenze} onChange={setze('fWerkzeugObergrenze')} style={styles.eingabe} />

          <label style={styles.marke}>Rundenbudget (Schleifendurchlaeufe je Lauf)</label>
          <input type="number" min={1} value={f.fRundenbudget} onChange={setze('fRundenbudget')} style={styles.eingabe} />

          <label style={styles.kontrollkaestchenZeile}>
            <input type="checkbox" checked={f.fSamplerAn} onChange={setzeKontrollkaestchen('fSamplerAn')} />
            Sampler selbst setzen
          </label>
          {!f.fSamplerAn && (
            <div style={styles.hinweis}>
              Ohne eigene Sampler schickt keel keine mit. Bei einem Ollama-Eintrag ueber den
              Codec „openai-chat" heisst das aber <em>nicht</em>, dass die Werte des Servers
              gelten: Ollamas /v1-Flaeche setzt Temperatur und Top-P dann zwangsweise auf 1.0,
              auch wenn im Modelfile etwas anderes steht.
            </div>
          )}
          {f.fSamplerAn && (
            <>
              <label style={styles.marke}>Temperatur</label>
              <input type="number" step="0.05" min={0} value={f.fTemperature} onChange={setze('fTemperature')} style={styles.eingabe} />

              <label style={styles.marke}>Top-P</label>
              <input type="number" step="0.01" min={0} max={1} value={f.fTopP} onChange={setze('fTopP')} style={styles.eingabe} />

              <label style={styles.marke}>Wiederholungsbremse (presence_penalty, 0 bis 2)</label>
              <input type="number" step="0.1" min={0} max={2} value={f.fPresencePenalty} onChange={setze('fPresencePenalty')} style={styles.eingabe} />
              <div style={styles.hinweis}>
                Gegen Endlosschleifen. Der Preis steht in der Model Card: ein hoeherer Wert kann
                Sprachmischung und etwas schwaechere Leistung bringen.
              </div>

              <label style={styles.marke}>Antwortlaenge (max_tokens)</label>
              <input type="number" min={1} value={f.fMaxTokens} onChange={setze('fMaxTokens')} style={styles.eingabe} />
              {Number(f.fMaxTokens) < 2048 && (
                <div style={styles.warnung}>
                  Unter 2048 schneidet ein Denkmodell ab, bevor es mit dem Denken fertig ist —
                  die Antwort kommt dann ganz ohne Text an und sieht wie ein Netzproblem aus.
                </div>
              )}

              <label style={styles.marke}>Denkstufe</label>
              <select value={f.fReasoningEffort} onChange={setze('fReasoningEffort')} style={styles.eingabe}>
                <option value="">keine Angabe — das Modell entscheidet selbst</option>
                <option value="low">low — kurz denken</option>
                <option value="medium">medium — Vorgabe fuer Agentenlaeufe</option>
                <option value="high">high — lange denken</option>
              </select>
              {/*
                Deliberately only these three. Ollamas Renderer kennt je nach Serverversion mehr
                Namen, aber `xhigh` faellt dort in den default-Zweig und kostet einen 400 mitten
                im Lauf. Was das Formular nicht anbietet, kann auch niemand hineinschreiben --
                normaliseEintrag weist es zusaetzlich ab, falls es von Hand in die Datei kommt.
              */}
              <div style={styles.hinweis}>
                Drei Sampler fehlen hier mit Absicht: top_k, min_p und repeat_penalty erreichen
                ueber die /v1-Flaeche keinen Ollama-Server — sie muessen im Modelfile auf dem
                Server stehen. Ein Regler dafuer waere eine Attrappe.
              </div>
            </>
          )}

          <div style={styles.hinweis}>
            {vorlage?.faehigkeiten?.quelle === 'gemessen'
              ? `Quelle: gemessen am ${vorlage.faehigkeiten.gemessenAm} mit ${vorlage.faehigkeiten.gemessenMit}. ` +
                'Diese Angabe bleibt beim Speichern erhalten -- ein Mensch kann sie hier nicht setzen, nur die ' +
                'Felder oben aendern.'
              : 'Quelle: vermutet. Ein Mensch kann diese Zeile nur schaetzen, nicht messen — die ' +
                'Messung uebernimmt ein spaeterer Kanarienauftrag.'}
          </div>
        </div>
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
  warnung: { color: '#d9b25f', fontSize: 11, marginTop: 4 },
  ueberschreibung: {
    padding: 8, background: '#1a1710', border: '1px solid #3d332a',
    borderRadius: 3, color: '#d9b25f', fontSize: 11, marginBottom: 8,
  },
  faehigkeitenBlock: {
    marginTop: 12, padding: 10, background: '#0d1114', border: '1px solid #232f36', borderRadius: 3,
  },
  faehigkeitenTitel: { color: '#ccc', fontSize: 12, margin: 0, fontWeight: 500 as const },
  kontrollkaestchenZeile: {
    display: 'flex' as const, alignItems: 'center' as const, gap: 6,
    color: '#ddd', fontSize: 12, margin: '6px 0',
  },
  knopfzeile: { display: 'flex' as const, gap: 8, marginTop: 12 },
  knopf: {
    background: '#1a1a1a', color: '#ddd', border: '1px solid #333',
    borderRadius: 3, padding: '4px 12px', cursor: 'pointer' as const, fontSize: 12,
  },
}
