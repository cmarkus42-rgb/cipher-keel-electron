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
  /**
   * Nutzlast `{werkzeug, sprung, url, host}`. Eine ausgehende Anfrage, geschrieben **bevor** sie
   * hinausgeht — §4.1 (4) verlangt jede ausgehende URL vollstaendig im Protokoll, und das war
   * nicht erfuellt: `holeSicher` folgt bis zu drei Weiterleitungen und stellt fuer jeden Sprung
   * eine echte Namensaufloesung und ein echtes GET. Im Protokoll standen genau zwei URLs, die
   * angefragte und (nur im Erfolgsfall) die letzte. Gemessen an einer Kette
   * `forum/a -> zwischenstation-eins -> zwischenstation-zwei -> ziel`: beide Zwischenstationen
   * wurden aufgeloest und abgerufen, und keine stand irgendwo. Wer hinterher fragt, welche Hosts
   * ein Lauf beruehrt hat, bekam eine unvollstaendige Antwort.
   *
   * Vor der Aufloesung geschrieben, nicht danach: schon die DNS-Anfrage traegt den Namen hinaus
   * (`<geheimnis>.boeser-host.test` braucht nie eine Antwort), und ein Eintrag, den erst der
   * Erfolg schreibt, fehlt ausgerechnet bei dem Sprung, der scheiterte.
   */
  'netz.ausgehend',
  /**
   * Nutzlast `{unterLaufId, kostenCent, runden}`, geschrieben ins Protokoll des **Eltern**laufs,
   * sobald ein Unterlauf fertig ist. `verbrauchAusEreignissen` zaehlt `model.answered` nur unter
   * der eigenen laufId — der Verbrauch des Unterlaufs war fuer das Kostenbudget des Hauptlaufs
   * damit unsichtbar, und `pruefeBudgets` schlug nie an, egal wie viele Unterlaeufe liefen.
   */
  'unterlauf.verbraucht',
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
