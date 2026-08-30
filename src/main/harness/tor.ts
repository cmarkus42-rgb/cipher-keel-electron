/**
 * tor — announcement, decision, effect. The place that can say no.
 *
 * The predecessor `intent-vor-effekt.ts` is a *checker*: `effekteOhneIntent` is a pure function
 * over the log with no production caller, and the invariant it guards is produced in lauf.ts. For
 * a writing or executing tool that is not enough — there the decision has to be able to refuse,
 * and the refusal has to be readable afterwards.
 *
 * That the gate always says yes for `shell_ausfuehren` is not a sham: it genuinely refuses for the
 * other two and writes the refusal. A place that can say no for two of three inputs is a gate; one
 * that can for none was the finding.
 *
 * There is deliberately no rule over a shell *command* here. Against a shell a string check is
 * theatre — `$(...)` and a rewritten npm script walk past it — and the boundary is the sandbox.
 */

import { pruefePfad, type WacheKontext } from './pfadwache'
import type { Ereignis } from './ereignisse'

/**
 * The tools that have an effect. One source, three consumers: the gate, the Single-Writer rule in
 * lauf.ts, and the git precondition at run start. Three separate lists would drift, and the drift
 * would show up as a run that writes without a decision.
 */
export const WIRKENDE_WERKZEUGE: ReadonlySet<string> = new Set([
  'datei_schreiben', 'datei_loeschen', 'shell_ausfuehren',
])

export function istWirkend(name: string): boolean {
  return WIRKENDE_WERKZEUGE.has(name)
}

export type Urteil = { erlaubt: boolean; grund: string }

export function entscheide(
  name: string, eingabe: Record<string, unknown>, wache: WacheKontext,
): Urteil {
  if (name === 'shell_ausfuehren') {
    const k = eingabe.kommando
    if (typeof k !== 'string' || k === '') {
      return { erlaubt: false, grund: `Das Feld 'kommando' fehlt in der Eingabe.` }
    }
    // Named, not silent: the log must say why this was allowed, otherwise a reader cannot tell an
    // examined yes from an unexamined one.
    return { erlaubt: true, grund: 'Die Grenze setzt der Sandkasten, nicht das Tor.' }
  }

  const pfad = eingabe.pfad
  if (typeof pfad !== 'string' || pfad === '') {
    return { erlaubt: false, grund: `Das Feld 'pfad' fehlt in der Eingabe.` }
  }
  const w = pruefePfad(pfad, wache)
  if (!w.ok) return { erlaubt: false, grund: w.grund }
  return { erlaubt: true, grund: 'Pfad liegt in der Wurzel und ist nicht geschuetzt.' }
}

/**
 * Every `tool.completed`/`tool.failed` of a *wirkendes* tool whose `aufrufId` has no preceding
 * `tool.entschieden`. Sibling of `effekteOhneIntent`, same shape and same reason — order matters,
 * a decision that appears afterwards does not cover the effect.
 *
 * Reading tools are not required to have one: laying the chain over them too would spend an event
 * on every read whose answer is always yes. The log would get longer and not truer.
 */
export function effekteOhneEntscheidung(ereignisse: Ereignis[]): Ereignis[] {
  const entschieden = new Set<string>()
  const verletzungen: Ereignis[] = []
  for (const e of ereignisse) {
    if (e.art === 'tool.entschieden') {
      entschieden.add(String(e.nutzlast.aufrufId))
      continue
    }
    if (e.art !== 'tool.completed' && e.art !== 'tool.failed') continue
    if (!istWirkend(String(e.nutzlast.name))) continue
    if (!entschieden.has(String(e.nutzlast.aufrufId))) verletzungen.push(e)
  }
  return verletzungen
}
