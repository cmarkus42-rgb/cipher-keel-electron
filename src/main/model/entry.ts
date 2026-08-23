/**
 * entry — one registry entry: what answers, how it is reached, and what it can do.
 *
 * Two halves with different lifetimes. The curated half (name, reachability, locality,
 * prose) is written by a human and changes rarely. The measured half (`faehigkeiten`) is
 * written by the canary job once the harness can run one — until then every row carries
 * `quelle: 'vermutet'`, and whoever displays it has to show that.
 *
 * Reachability is translated into a `ModelEndpoint` rather than duplicating its shape, so
 * the transport validation exists exactly once (M8 section 5; spec section 4).
 */

import { normaliseEndpoint, type ModelEndpoint } from '../worker/model-client'

export type Anbieterart = 'cli-harness' | 'local-http' | 'api'
export type Oertlichkeit = 'lokal' | 'eigenes-netz' | 'fremdes-netz'

export type Erreichbarkeit =
  | { art: 'cli-harness'; cli: string; handle: string }
  | { art: 'local-http'; host: string; port: number; model: string }
  | { art: 'api'; baseUrl: string; model: string; keyRef: string }

/**
 * Was der Codec je Anfrage an Samplern mitschickt — oder eben nicht.
 *
 * Der Block ist optional, aber sein Weglassen ist keine Enthaltung: Ollamas `/v1`-Schicht
 * setzt `temperature` und `top_p` **zwangsweise auf 1.0**, wenn der Client sie nicht sendet
 * (`openai.go` L663/L681). Ein Modell mit empfohlenem `top_p 0.95` laeuft ohne diesen Block
 * also auf 1.0, und nirgends steht, dass das passiert ist.
 *
 * **Warum genau diese fuenf Felder und keine weiteren:** `top_k`, `min_p` und `repeat_penalty`
 * fehlen mit Absicht. Ollamas `/v1`-Flaeche kennt sie nicht und verwirft sie stillschweigend —
 * ein Regler dafuer waere eine Attrappe, die etwas verspricht, das nie den Server erreicht.
 * Fuer einen Ollama-Eintrag stehen diese drei im Modelfile auf dem Server und nur dort; das ist
 * so in `docs/anpassbare-flaechen.md` gefuehrt (CK-NFR-012: eine anpassbare Flaeche ausserhalb
 * der App muss benannt sein, gerade weil sie hier nicht editierbar ist).
 *
 * CK-NFR-012: das hier ist eine anpassbare Flaeche. Sie hat einen Eintrag im Inventar, ein Feld
 * im Settings-Formular, und `tests/docs/anpassbare-flaechen.test.ts` haelt den Eintrag fest.
 */
export interface Sampler {
  temperature: number
  topP: number
  presencePenalty: number
  maxTokens: number
  /**
   * keel-Namen. `'xhigh'` darf hier nie stehen — nicht weil der Server es abweist (er nimmt es
   * an), sondern weil es gemessen 106 Sekunden fuer eine *kuerzere* Antwort kostet. Die Zahlen
   * stehen bei `DENKSTUFEN`. `normaliseEintrag` weist es vor dem Request ab.
   */
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
}

export interface Faehigkeiten {
  codec: 'anthropic' | 'openai-chat' | 'ollama-native' | 'text'
  werkzeugmodus: 'nativ' | 'text'
  paralleleAufrufe: boolean
  denkbloecke: boolean
  bilder: boolean
  dokumente: boolean
  aufgeschobenesLaden: boolean
  werkzeugObergrenze: number
  nutzbaresKontextfenster: number
  vertragsStrenge: { schemaTiefe: number; reparaturversuche: number }
  rundenbudget: number
  gemessenAm: string | null
  gemessenMit: string | null
  quelle: 'gemessen' | 'vermutet' | 'herstellerangabe'
  /** Fehlt bei jedem Eintrag, der bisher keinen hatte — der Codec sendet dann keine Sampler. */
  sampler?: Sampler
}

export interface ModellEintrag {
  id: string
  name: string
  art: Anbieterart
  erreichbarkeit: Erreichbarkeit
  oertlichkeit: Oertlichkeit
  erklaertext: string
  empfehlung: string
  /** Absent for cli-harness: Claude Code owns its own protocol. */
  faehigkeiten?: Faehigkeiten
}

const ARTEN = new Set<string>(['cli-harness', 'local-http', 'api'])
const OERTLICHKEITEN = new Set<string>(['lokal', 'eigenes-netz', 'fremdes-netz'])
const QUELLEN = new Set<string>(['gemessen', 'vermutet', 'herstellerangabe'])

/**
 * Die einzigen Denkstufen, die keel hinausgibt.
 *
 * **Gemessen am 2026-08-21** gegen Ollama 0.32.15 mit `qwen3.8:27b` — eine fruehere Fassung dieses
 * Kommentars behauptete, `'xhigh'` koste einen HTTP 400. Das ist falsch: der Server nimmt alle
 * sieben Stufen an (`none`, `minimal`, `low`, `medium`, `high`, `max`, `xhigh`). Der Grund, es
 * trotzdem nicht hinauszugeben, ist ein anderer und ein besserer — er steht in Zahlen da:
 *
 * | Stufe | Denkspur | Antwort | Zeit |
 * |---|---|---|---|
 * | `none`   |     0 Z |   593 Z |   7,8 s |
 * | `low`    | 1.252 Z |   814 Z |  23,8 s |
 * | `medium` | 1.933 Z | 1.290 Z |  37,0 s |
 * | `high`   | 3.635 Z |   789 Z |  50,5 s |
 * | `xhigh`  | 8.628 Z |   531 Z | 106,3 s |
 *
 * `xhigh` denkt am laengsten und antwortet am kuerzesten, in vierzehnfacher Zeit gegenueber
 * `none`. `none` ist dabei kein Notbehelf, sondern der richtige Schalter fuer mechanische
 * Arbeit — deshalb steht es hier mit drin und nicht nur als Randnotiz.
 *
 * `minimal`, `max` und `ultra` fehlen, weil ihre Bedeutung an der Serverversion haengt (0.20.4
 * kennt sie nicht) und eine Liste, die an der Serverversion haengt, keine Wache ist.
 */
export const DENKSTUFEN = new Set<string>(['none', 'low', 'medium', 'high'])

/** The Faehigkeiten fields that must be a whole number greater than zero. */
const GANZZAHL_FELDER = ['nutzbaresKontextfenster', 'werkzeugObergrenze', 'rundenbudget'] as const

/**
 * Die vier Sampler-Zahlen — jede Pflicht, sobald der Block ueberhaupt da ist.
 *
 * Ein halb gefuellter Block ist schlimmer als gar keiner: `openAiChatCodec.toWire` schreibt bei
 * vorhandenem Block alle vier hinaus, `JSON.stringify` wirft ein `undefined` still weg, und
 * Ollamas `/v1` setzt ein fehlendes `temperature`/`top_p` zwangsweise auf 1.0 — also genau das
 * stille Ueberschreiben, gegen das dieser Block gebaut wurde, nur diesmal mit einer Config, die
 * aussieht, als waere er gesetzt. Erreichbar ueber `sampler: {}` von Hand und, bis Runde 2,
 * ueber das Formular: `Number('')` ist 0, nicht NaN, ein geleertes Feld ergab also `0` statt
 * einer auffaelligen Luecke. Das Formular schickt seither NaN, und NaN faellt hier auf.
 */
const SAMPLER_ZAHLEN = ['temperature', 'topP', 'presencePenalty', 'maxTokens'] as const

/** Everything a capability row does not state. Never `gemessen` — that is the canary's word. */
const FAEHIGKEITEN_RUECKFALL: Faehigkeiten = {
  codec: 'text',
  werkzeugmodus: 'text',
  paralleleAufrufe: false,
  denkbloecke: false,
  bilder: false,
  dokumente: false,
  aufgeschobenesLaden: false,
  // 12, weil der Harness zwoelf Stummel ausliefert: 3 Datei- + 4 Graph-Werkzeuge,
  // `faehigkeit_lesen`, `web_suchen`, `seite_lesen`, `recherchieren` und `werkzeug_schema`
  // (letzteres nur bei aufgeschobenem Laden). Mit einem zu kleinen Rueckfall schriebe jeder
  // Eintrag mit aufgeschobenem Laden bei *jedem* Lauf einen Hinweis in `run.started` — eine
  // Warnung, die bei der Vorgabekonfiguration immer anschlaegt, nutzt sich ab, bis niemand mehr
  // hinsieht. Die Zahl haengt an tests/harness/werkzeugliste.test.ts, und der prueft gegen die
  // echte Konstruktion in harness-handlers.ts, nicht gegen einen Nachbau.
  werkzeugObergrenze: 12,
  nutzbaresKontextfenster: 8192,
  vertragsStrenge: { schemaTiefe: 1, reparaturversuche: 1 },
  rundenbudget: 12,
  gemessenAm: null,
  gemessenMit: null,
  quelle: 'vermutet',
}

export function normaliseEintrag(raw: unknown): ModellEintrag {
  const r = raw as Partial<ModellEintrag>
  if (!r || typeof r !== 'object') throw new Error('Eintrag ist kein Objekt')
  if (!r.id) throw new Error('Eintrag ohne id — jeder Eintrag braucht einen stabilen Schluessel')
  if (!r.name) throw new Error(`Eintrag '${r.id}' ohne name`)
  if (!r.art || !ARTEN.has(r.art)) {
    throw new Error(
      `Unbekannte Anbieterart '${r.art}' — bekannt sind cli-harness, local-http, api`
    )
  }
  if (!r.oertlichkeit || !OERTLICHKEITEN.has(r.oertlichkeit)) {
    throw new Error(
      `Eintrag '${r.id}': unbekannte oertlichkeit '${r.oertlichkeit}' — ` +
        'bekannt sind lokal, eigenes-netz, fremdes-netz'
    )
  }
  if (!r.erreichbarkeit) throw new Error(`Eintrag '${r.id}' ohne erreichbarkeit`)
  if (r.erreichbarkeit.art !== r.art) {
    throw new Error(
      `Eintrag '${r.id}': art ist '${r.art}', erreichbarkeit ist '${r.erreichbarkeit.art}' — ` +
        'beide muessen dasselbe sagen'
    )
  }
  const err = r.erreichbarkeit
  switch (err.art) {
    case 'cli-harness':
      if (!err.cli || !err.handle) {
        throw new Error(`Eintrag '${r.id}': cli-harness braucht cli und handle`)
      }
      if (r.faehigkeiten) {
        throw new Error(
          `Eintrag '${r.id}': cli-harness kennt keine faehigkeiten — das CLI besitzt sein Protokoll selbst`
        )
      }
      break
    default:
      // Reachability is checked by building the endpoint: one validation, not two.
      toModelEndpoint(err)
  }

  // faehigkeiten is defaulted-then-merged, so consistency between quelle and the
  // measurement fields has to be checked on the merged result, not on raw input alone.
  let faehigkeiten: Faehigkeiten | undefined
  if (r.faehigkeiten) {
    faehigkeiten = { ...FAEHIGKEITEN_RUECKFALL, ...r.faehigkeiten }
    // A budget or a context limit that is NaN is worse than a missing one: every comparison
    // against NaN is false, so whatever check the harness builds on this field goes silently
    // inert instead of failing loudly (Review-Runde 1, Fund 2). Number.isInteger already
    // implies finite, so this one check catches NaN, Infinity, non-integers and non-numbers.
    for (const feld of GANZZAHL_FELDER) {
      const wert = faehigkeiten[feld]
      if (typeof wert !== 'number' || !Number.isInteger(wert) || wert <= 0) {
        throw new Error(
          `Eintrag '${r.id}': faehigkeiten.${feld} muss eine ganze Zahl groesser als 0 sein, gesehen: ${String(wert)}`
        )
      }
    }
    if (!QUELLEN.has(faehigkeiten.quelle)) {
      throw new Error(
        `Eintrag '${r.id}': unbekannte quelle '${faehigkeiten.quelle}' — ` +
          'bekannt sind gemessen, vermutet, herstellerangabe'
      )
    }
    if (faehigkeiten.quelle === 'gemessen') {
      if (!faehigkeiten.gemessenAm || !faehigkeiten.gemessenMit) {
        throw new Error(
          `Eintrag '${r.id}': quelle ist 'gemessen', aber gemessenAm oder gemessenMit fehlt`
        )
      }
    } else if (faehigkeiten.gemessenAm !== null || faehigkeiten.gemessenMit !== null) {
      throw new Error(
        `Eintrag '${r.id}': quelle ist '${faehigkeiten.quelle}', darf dann aber keine Messdaten tragen`
      )
    }
    // Vor dem Request, nicht im Wiederholungsversuch: eine unbekannte Denkstufe geht sonst als
    // `reasoning_effort` hinaus und Ollamas Renderer antwortet mit
    // `unsupported Qwen3.8 reasoning effort "xhigh"` — ein 400 mitten im Lauf, der wie ein
    // Transportfehler aussieht, obwohl er in der Konfiguration steht.
    const stufe = faehigkeiten.sampler?.reasoningEffort
    if (stufe !== undefined && !DENKSTUFEN.has(stufe)) {
      throw new Error(
        `Eintrag '${r.id}': unbekannte sampler.reasoningEffort '${stufe}' — ` +
          'bekannt sind low, medium, high'
      )
    }
    const sampler = faehigkeiten.sampler
    if (sampler) {
      for (const feld of SAMPLER_ZAHLEN) {
        const wert = sampler[feld]
        if (typeof wert !== 'number' || !Number.isFinite(wert)) {
          throw new Error(
            `Eintrag '${r.id}': faehigkeiten.sampler.${feld} muss eine Zahl sein, gesehen: ${String(wert)}`
          )
        }
      }
      // maxTokens enger: `num_predict 0` liefert gar keine Antwort, und ein gebrochener Wert
      // ist keine Tokenzahl. Temperatur 0 dagegen ist eine Wahl (deterministisch) und bleibt
      // erlaubt — eine untere Schranke waere hier eine Meinung, keine Wache.
      if (!Number.isInteger(sampler.maxTokens) || sampler.maxTokens <= 0) {
        throw new Error(
          `Eintrag '${r.id}': faehigkeiten.sampler.maxTokens muss eine ganze Zahl groesser als 0 ` +
            `sein, gesehen: ${String(sampler.maxTokens)}`
        )
      }
    }
  }

  return {
    id: r.id,
    name: r.name,
    art: r.art,
    erreichbarkeit: r.erreichbarkeit,
    oertlichkeit: r.oertlichkeit,
    erklaertext: r.erklaertext ?? '',
    empfehlung: r.empfehlung ?? '',
    faehigkeiten,
  }
}

/**
 * The endpoint a registry entry resolves to.
 *
 * The optional codec is what tells an `api` entry apart from an Anthropic one, and it is the
 * only thing that does — a second `dialekt` field would be the same fact written twice, with a
 * consistency rule as the running cost. `normaliseEintrag` calls this without a codec, because
 * at that point `faehigkeiten` is not merged yet and the question there is only whether
 * baseUrl and keyRef are present — the same question for both dialects.
 */
export function toModelEndpoint(e: Erreichbarkeit, codec?: Faehigkeiten['codec']): ModelEndpoint {
  switch (e.art) {
    case 'cli-harness':
      // The reason a cli-harness entry is different lives in eignung.ts (sperrgrund) —
      // this is the transport fact only, not a restatement of the rule.
      throw new Error(`Ein cli-harness-Eintrag hat keinen Endpunkt`)
    case 'local-http':
      // Driven through the /v1 surface when the capability row asks for the openai-chat codec.
      // That is how the Spark is reachable before ollama-native exists. No key: Ollama wants none.
      //
      // A named loss, not an oversight: `keepAliveSeconds` (the keep-warm surface documented in
      // docs/anpassbare-flaechen.md, "Zum Festhalten geladener Modelle") is a field on
      // `GenerateRequest`/`ollama-client.ts`'s request body only — `OpenAiCompatibleEndpointSpec`
      // and `api-client.ts` carry no such field at all, because an API provider has no local
      // model to keep resident. Routing a `local-http` entry through this branch therefore drops
      // keep-alive control silently: the same Ollama daemon stays reachable, but every call now
      // goes through the OpenAI-compatible transport, which never sends `keep_alive` and leaves
      // Ollama to its own server-side default instead of this app's `-1` (pin indefinitely).
      if (codec === 'openai-chat') {
        return normaliseEndpoint({
          kind: 'openai-compatible', baseUrl: `http://${e.host}:${e.port}/v1`, model: e.model, keyRef: '',
        })
      }
      return normaliseEndpoint({ kind: 'ollama', host: e.host, port: e.port, model: e.model })
    case 'api':
      return normaliseEndpoint({
        kind: codec === 'anthropic' ? 'anthropic' : 'openai-compatible',
        baseUrl: e.baseUrl, model: e.model, keyRef: e.keyRef,
      })
  }
}
