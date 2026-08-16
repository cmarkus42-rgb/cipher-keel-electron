/**
 * eignung — the two matrices, and the only place either of them is stated.
 *
 * They are separated on purpose. The structural matrix says what is impossible; the
 * warnings say what is risky. A single matrix mixing both cannot be implemented by a
 * surface that must lock *and* warn without rule and display drifting apart — which is
 * exactly what happened to the capability lists that knew the same thing in five places.
 *
 * The basic concept (section 5) says the matrix belongs in the code, not in the surface.
 * `tests/model/eignung-einzige-quelle.test.ts` is what keeps that true.
 */

import type { Anbieterart, ModellEintrag } from './entry'
import { CapabilityNiveau } from '../preset/niveau'

/** How work is done. Two of the three are session runtimes; `ein-schuss` is per job. */
export type Laeufer = 'fremdes-cli' | 'eigene-schleife' | 'ein-schuss'

export const LAEUFER: readonly Laeufer[] = ['fremdes-cli', 'eigene-schleife', 'ein-schuss']

const STRUKTUR: Record<Laeufer, ReadonlySet<Anbieterart>> = {
  'fremdes-cli': new Set<Anbieterart>(['cli-harness']),
  'eigene-schleife': new Set<Anbieterart>(['local-http', 'api']),
  'ein-schuss': new Set<Anbieterart>(['local-http', 'api']),
}

export function laeuferKannArt(laeufer: Laeufer, art: Anbieterart): boolean {
  return STRUKTUR[laeufer].has(art)
}

/** German: this text reaches the user. Null when the cell is open. */
export function sperrgrund(laeufer: Laeufer, art: Anbieterart): string | null {
  if (laeuferKannArt(laeufer, art)) return null
  if (laeufer === 'fremdes-cli') {
    return 'Ein CLI-Harness bringt sein Modell selbst mit — ein anderes dort einzutragen waere eine stille Falle.'
  }
  // Any keel-driven runner against a cli-harness (eigene-schleife or ein-schuss)
  return (
    'Ein CLI-Harness ist kein Endpunkt, sondern ein eigener Prozess mit eigener Sitzung — ' +
    'keel kann es nicht direkt ansprechen. Und ein Abo-Kontingent wird nie durch eine eigene ' +
    'Schleife gefahren: Das hiesse, ein Abo-OAuth-Token durch eine eigene API-Schleife zu ' +
    'schicken. Das ist eine Nutzungsbedingung, keine Faehigkeitsfrage.'
  )
}

/**
 * A is the strongest demand, C the weakest. Rank rather than string compare, so the rule
 * reads as the rule instead of as an alphabetical accident.
 */
const RANG: Record<CapabilityNiveau, number> = {
  [CapabilityNiveau.A]: 3,
  [CapabilityNiveau.B]: 2,
  [CapabilityNiveau.C]: 1,
}

/**
 * The own loop stands on A because of decision E21 — v1 carries A-worthy work, not only B.
 * With the ratification of 2026-08-16 ("alles 0.1") there is no interim state in which it
 * would carry less, so none is modelled here.
 */
const FAEHIGKEIT: Record<Laeufer, CapabilityNiveau> = {
  'fremdes-cli': CapabilityNiveau.A,
  'eigene-schleife': CapabilityNiveau.A,
  'ein-schuss': CapabilityNiveau.C,
}

export function laeuferFaehigkeit(laeufer: Laeufer): CapabilityNiveau {
  return FAEHIGKEIT[laeufer]
}

export function laeuferTraegtNiveau(laeufer: Laeufer, niveau: CapabilityNiveau): boolean {
  return RANG[FAEHIGKEIT[laeufer]] >= RANG[niveau]
}

export interface Warnung {
  /** Stable key for tests and for a surface that wants to group. */
  code: string
  /** German: this text reaches the user. */
  text: string
}

export interface WarnKontext {
  /** Start context of the frame in tokens, when a measurement exists. */
  startkontextToken?: number
}

/**
 * Warnings hang on the pairing of entry, Laeufer and niveau — never on the entry alone.
 * The same local 7B is harmless on C and a risk on B.
 *
 * None of these locks. Locking is `sperrgrund` and nothing else.
 */
export function warnungen(
  eintrag: ModellEintrag,
  laeufer: Laeufer,
  niveau: CapabilityNiveau,
  ctx: WarnKontext = {}
): Warnung[] {
  const out: Warnung[] = []
  const f = eintrag.faehigkeiten
  const agentisch = laeufer === 'eigene-schleife' || laeufer === 'fremdes-cli'

  if (laeufer === 'eigene-schleife' && (!f || f.werkzeugmodus === 'text')) {
    out.push({
      code: 'werkzeugmodus-text',
      text: 'Dieses Modell hat keinen nativen Werkzeugmodus — die Schleife laeuft ueber das ' +
        'Text-Protokoll, und das ist die Stelle, an der schwache Modelle zuerst brechen.',
    })
  }

  // A cli-harness entry never carries a faehigkeiten row: Task 1's validator rejects one
  // that does, since Claude Code owns its own protocol there. "No measurement exists" and
  // "no measurement applies" are different states -- this rule is about the former, and
  // the cli path is structurally exempt, not permanently unmeasured.
  if (
    agentisch &&
    niveau !== CapabilityNiveau.C &&
    eintrag.art !== 'cli-harness' &&
    (!f || f.quelle !== 'gemessen')
  ) {
    out.push({
      code: 'nicht-gemessen',
      text: 'Fuer dieses Modell liegt keine eigene Messung vor — die Faehigkeitszeile ist vermutet.',
    })
  }

  if (f && ctx.startkontextToken && f.nutzbaresKontextfenster < ctx.startkontextToken) {
    out.push({
      code: 'kontext-zu-klein',
      text: `Der Startkontext dieser Rolle (${ctx.startkontextToken} Token) passt nicht in das ` +
        `nutzbare Kontextfenster (${f.nutzbaresKontextfenster} Token).`,
    })
  }

  if (niveau === CapabilityNiveau.C && eintrag.oertlichkeit === 'fremdes-netz') {
    out.push({
      code: 'teure-ebene-fuer-mechanik',
      text: 'Damit wird die teure Ebene fuer mechanische Arbeit eingespannt — das Gegenteil des Gefaelles.',
    })
  }

  // C is the tier the cheap one-shot runner is rated for. When a laeufer rated above C
  // (an agentic loop) carries C-level work anyway, the loop's own overhead goes unused —
  // this is a mismatch of runner to work, not a statement about the model's strength, and
  // it must not fire for any niveau above C (see the counter-proof test: a measured local
  // model on B, run through its native eigene-schleife, warns about nothing).
  if (niveau === CapabilityNiveau.C && laeuferFaehigkeit(laeufer) !== CapabilityNiveau.C) {
    out.push({
      code: 'unter-faehigkeit',
      text: 'Das laeuft, nutzt den Laeufer aber nicht aus.',
    })
  }

  if (eintrag.oertlichkeit === 'fremdes-netz') {
    out.push({
      code: 'verlaesst-netz',
      text: 'Der Prompt verlaesst das eigene Netz.',
    })
  }

  return out
}
