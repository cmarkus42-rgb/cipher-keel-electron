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

/** Everything a capability row does not state. Never `gemessen` — that is the canary's word. */
const FAEHIGKEITEN_RUECKFALL: Faehigkeiten = {
  codec: 'text',
  werkzeugmodus: 'text',
  paralleleAufrufe: false,
  denkbloecke: false,
  bilder: false,
  dokumente: false,
  aufgeschobenesLaden: false,
  werkzeugObergrenze: 8,
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

export function toModelEndpoint(e: Erreichbarkeit): ModelEndpoint {
  switch (e.art) {
    case 'cli-harness':
      throw new Error(
        `Ein cli-harness-Eintrag hat keinen Endpunkt — das CLI bringt sein Modell selbst mit`
      )
    case 'local-http':
      return normaliseEndpoint({ kind: 'ollama', host: e.host, port: e.port, model: e.model })
    case 'api':
      return normaliseEndpoint({
        kind: 'openai-compatible', baseUrl: e.baseUrl, model: e.model, keyRef: e.keyRef,
      })
  }
}
