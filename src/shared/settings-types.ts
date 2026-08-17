/**
 * settings-types — the shape the settings window receives.
 *
 * Results only, never rules. `sperrgrund` and `warnungen` arrive as finished German text,
 * so the renderer has nothing it could restate: the eignung matrices stay in
 * src/main/model/eignung.ts and are unreachable from here. That is the interface form the
 * project prefers over a string guard, which protects against copying but not against
 * paraphrase.
 */

export type Wirkung = 'sofort' | 'naechste-session' | 'neustart'

export type GeheimnisStatus = 'schluesselbund' | 'umgebung' | 'fehlt' | 'unbekannt'

export interface WarnungAnsicht {
  code: string
  text: string
}

export interface EintragAnsicht {
  id: string
  name: string
  art: 'cli-harness' | 'local-http' | 'api'
  oertlichkeit: 'lokal' | 'eigenes-netz' | 'fremdes-netz'
  erklaertext: string
  empfehlung: string
  /** German, e.g. "vermutet" or "gemessen am 2026-08-17". Null for a cli-harness entry. */
  faehigkeitenHerkunft: string | null
  /** Only an api entry names a key. */
  keyRef: string | null
  geheimnisStatus: GeheimnisStatus | null
  /** German: which environment variable is consulted, or why the status is unknown. */
  geheimnisHinweis: string | null
  /** False for a bundled entry: those cannot be deleted, only overridden. */
  loeschbar: boolean
}

export interface SlotOptionAnsicht {
  eintragId: string
  name: string
  /** German. Non-null means the option is locked and this says why. */
  sperrgrund: string | null
}

export interface SlotAnsicht {
  id: string
  beschriftung: string
  /** Empty string means no assignment. */
  gewaehlt: string
  optionen: SlotOptionAnsicht[]
  warnungen: WarnungAnsicht[]
  /** German: what applies while nothing is assigned. */
  rueckfallText: string
  wirkung: Wirkung
}

export interface EndpunktAnsicht {
  kind: 'ollama' | 'openai-compatible'
  host: string
  port: number
  baseUrl: string
  keyRef: string
  model: string
}

export interface AdapterAnsicht {
  id: string
  name: string
  startArgs: string
  appGesteuerteParameter: string[]
  /**
   * German, already-finished text. Same shape and same posture as a slot's warnings:
   * these never lock anything, they only say what the line means.
   */
  warnungen: WarnungAnsicht[]
}

export interface UebersprungenAnsicht {
  /** German: enough of the broken entry to recognise it. */
  beschreibung: string
  fehler: string
}

export interface SettingsAnsicht {
  eintraege: EintragAnsicht[]
  uebersprungen: UebersprungenAnsicht[]
  slots: SlotAnsicht[]
  modellTiers: { light: string; standard: string; heavy: string }
  rueckfallEndpunkte: { tagging: EndpunktAnsicht; worker: EndpunktAnsicht }
  adapter: AdapterAnsicht[]
  sprachausgabe: { aktiv: boolean; stimme: string }
}

export type SettingsAntwort =
  | { ok: true; ansicht: SettingsAnsicht }
  | { ok: false; fehler: string }
