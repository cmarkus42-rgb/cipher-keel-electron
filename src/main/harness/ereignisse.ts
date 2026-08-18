/**
 * ereignisse — what the loop writes down, and nothing else.
 *
 * The list is deliberately shorter than M8 section 3.1: an event type whose trigger does not
 * exist yet is not declared. Tool events are here because this stretch has reading tools;
 * delegation, heartbeat and suspension are not.
 */

export type EreignisArt =
  | 'run.started'
  | 'prompt.sent'
  | 'model.answered'
  | 'tool.intent'
  | 'tool.completed'
  | 'tool.failed'
  | 'tool.schema_loaded'
  | 'budget.warned'
  | 'run.finished'

export interface Ereignis {
  laufId: string
  seq: number
  /** ISO-8601, UTC. */
  ts: string
  art: EreignisArt
  nutzlast: Record<string, unknown>
}
