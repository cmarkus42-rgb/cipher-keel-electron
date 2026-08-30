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
 * **What it contributes today is the entry, not the prevention — and the next builder should read
 * that here and not only in the design doc.** Measured while Task 7 was built and confirmed
 * independently by review: no refusal of this gate is the only thing standing between a call and
 * its effect. Every branch is mirrored downstream — `werkzeug-schreiben.ts` asks pfadwache again
 * on purpose, missing fields are named there too, and `shell_ausfuehren` is waved through anyway.
 * Take the abort out and the log looks identical. Its contribution is `tool.entschieden`: proof
 * that a decision happened and why, where before a refusal was visible only as an absent effect.
 *
 * It becomes load-bearing the moment a *fourth* acting tool arrives without a check of its own.
 * The only test that would notice that day is the trusting-double in
 * tests/harness/lauf-wirkende-werkzeuge.test.ts — it builds exactly that situation, and it is the
 * only place where a mutation of this gate bites. Whoever adds that tool inherits it.
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
 *
 * **One branch reports a violation that is none.** The closing turn in lauf.ts writes `tool.intent`
 * and `tool.failed` for every call the model still makes after a budget was hit, without passing
 * the gate — deliberately: nothing is executed there, the run ends on that turn. If an acting tool
 * ever shows up in that set, this function counts it. No production caller exists today, so nobody
 * sees it; whoever wires one should read that hit as this branch and not as a breach.
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
