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

/**
 * Payload of SESSION_STATUS_CHANGED (Main -> Renderer, ipc-channels.ts). Sent by SESSION_AUFTRAG's
 * handler whenever a Niveau-B grid cell's own state actually changes — not derived by the
 * renderer from the harness event stream, same "one source" rule as `SchleifenZelle`
 * (src/main/session/schleifen-sitzungen.ts) itself.
 *
 * Two shapes under one channel, discriminated by `zustand`: a cell that just started running
 * carries the laufId that started; a cell that just went idle again carries the run's own end
 * state, read from its `run.finished` — `null` if the run crashed or never wrote one (a failed
 * start counts as the latter).
 */
export type SessionStatusChanged =
  | { name: string; zustand: 'laeuft'; laufId: string }
  | { name: string; zustand: 'leerlaufend'; endzustand: string | null }
