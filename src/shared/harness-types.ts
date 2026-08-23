/**
 * harness-types — what crosses the IPC boundary.
 *
 * Deliberately narrow: the renderer sees events, never a provider, never an endpoint, never a
 * capability row. What it displays comes out of the event stream (M8 section 4.11). `art` is
 * typed as plain `string` rather than reusing `harness/index.ts`'s `EreignisArt` — the wire
 * shape and the main process's internal union are allowed to drift without a shared-layer
 * import reaching into `src/main/harness/` for it.
 */

export interface HarnessEreignis {
  laufId: string
  seq: number
  ts: string
  art: string
  nutzlast: Record<string, unknown>
}

export interface LaufStartWunsch {
  auftragstext: string
  modellId: string
  wurzel: string
  anhaenge?: string[]
}

/** One run's summary for a list view — never the full event log. */
export interface LaufAnzeige {
  laufId: string
  modellId: string
  gestartetTs: string
  /** null while the run has not (yet) written a run.finished event. */
  endzustand: string | null
  /**
   * Wahr, wenn dieser Lauf der Unterlauf eines anderen ist (heute: der des Rechercheurs). Er wird
   * nicht fortgesetzt — siehe `pruefeKeinUnterlauf` in harness-sitzung.ts.
   */
  istUnterlauf: boolean
}

export type HarnessAntwort<T> =
  | { ok: true; wert: T }
  | { ok: false; meldung: string }
