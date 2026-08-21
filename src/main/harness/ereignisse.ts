/**
 * ereignisse — what the loop writes down, and nothing else.
 *
 * The list is deliberately shorter than M8 section 3.1: an event type whose trigger does not
 * exist yet is not declared. Tool events are here because this stretch has reading tools;
 * delegation, heartbeat and suspension are not.
 */

/**
 * Zur Laufzeit vorhanden, nicht nur als Typ — damit ein Test ueber *alle* Arten laufen kann.
 * `HarnessEreignis.art` ist an der IPC-Grenze als `string` deklariert (shared/harness-types.ts),
 * also faengt der Compiler eine im Fenster vergessene Art nicht: `skill.geladen` fehlte nach
 * seiner Einfuehrung sowohl in der Farbtabelle als auch in der Kurzfassung des Ereignis-Panels
 * und wurde stumm als leere Zeile dargestellt — ausgerechnet das Ereignis, dessen einziger Zweck
 * Sichtbarkeit ist. Die Liste hier ist die Grundlage des Waechters, der das kuenftig faengt
 * (tests/renderer/ereignis-panel.test.ts).
 */
export const EREIGNIS_ARTEN = [
  'run.started',
  'prompt.sent',
  'model.answered',
  'tool.intent',
  'tool.completed',
  'tool.failed',
  'tool.schema_loaded',
  // Nutzlast `{name, text}`. Eigenes Ereignis statt eines gewoehnlichen Werkzeugergebnisses, damit
  // im Protokoll sichtbar bleibt, dass eine Faehigkeit tatsaechlich geladen wurde (Spec 5.2, M7).
  'skill.geladen',
  'budget.warned',
  'run.finished',
] as const

export type EreignisArt = (typeof EREIGNIS_ARTEN)[number]

export interface Ereignis {
  laufId: string
  seq: number
  /** ISO-8601, UTC. */
  ts: string
  art: EreignisArt
  nutzlast: Record<string, unknown>
}
