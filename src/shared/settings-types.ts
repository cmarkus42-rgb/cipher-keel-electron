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

/**
 * A mirror of src/main/model/entry.ts's `Erreichbarkeit`, not an import of it: the
 * renderer may not reach into src/main/. Structurally identical on purpose, so
 * `baueAnsicht` can pass a `ModellEintrag`'s `erreichbarkeit` straight through.
 *
 * `keyRef` here is the *name* a key is stored under, not the key itself — that name is
 * already public in the config file, so carrying it to the renderer discloses nothing.
 */
export type ErreichbarkeitAnsicht =
  | { art: 'cli-harness'; cli: string; handle: string }
  | { art: 'local-http'; host: string; port: number; model: string }
  | { art: 'api'; baseUrl: string; model: string; keyRef: string }

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
  /**
   * The measured capability row, opaque and untyped on purpose. The form never edits it
   * (Kanarienauftrag territory, spec 5.4) -- it only has to echo this back unmodified when
   * saving an edit, so an unrelated field change stops erasing a row that was already
   * there. `unknown` rather than `Faehigkeiten` keeps that boundary honest: nothing on this
   * side is meant to read it, only carry it.
   */
  faehigkeiten: unknown
  /**
   * What is actually configured, so an edit form can start from the real values instead
   * of blanks. Without this an edit either fails validation for fields the user never
   * touched, or — once the blocking field is filled in — silently overwrites the
   * untouched ones with defaults.
   */
  erreichbarkeit: ErreichbarkeitAnsicht
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
  /**
   * Warnings about the assignment that is actually in effect. Empty when the assignment
   * does not hold — a warning about a pairing that never runs is noise, not information.
   */
  warnungen: WarnungAnsicht[]
  /**
   * German, non-null when the current assignment cannot be used: the entry is locked for
   * this slot, or it names an id nothing defines. In both cases the fallback applies.
   *
   * The renderer displays this instead of reconciling `gewaehlt` against `optionen`
   * itself. Reconciling is a rule, and rules do not cross this boundary.
   */
  gewaehltHinweis: string | null
  /** German: what applies while nothing usable is assigned. */
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

/**
 * The one write signature every settings component uses, declared once so it cannot
 * drift into five slightly different inline copies.
 *
 * Resolves `true` when the write landed (the view model was replaced) and `false` when
 * it was rejected or threw — the page-level banner shows the reason either way, but a
 * caller that needs to know whether *its own* write succeeded (closing a form, say)
 * cannot tell from the banner alone.
 */
export type Schreiber = (kanal: string, ...args: unknown[]) => Promise<boolean>
