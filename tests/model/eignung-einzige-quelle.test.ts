import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'

const SRC = path.join(__dirname, '../../src')

function alleQuelldateien(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) alleQuelldateien(p, out)
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p)
  }
  return out
}

// The capability lists once knew the same thing in five places and drifted. The matrices
// get one home, and a second one is a build failure rather than a code review finding.
describe('the suitability rules have exactly one home', () => {
  const erlaubt = [
    path.join(SRC, 'main/model/eignung.ts'),
  ]

  /**
   * slots.ts darf einen Laeufer nennen, und zwar genau einmal je Slot: sein eigener Modulkopf
   * sagt, dass der Laeufer eine Eigenschaft des Slots ist und keine Nutzerwahl, und registry.ts
   * verweist ausdruecklich darauf, statt ihn zu wiederholen.
   *
   * Bis zum 2026-08-22 fiel das nicht auf, weil der Test nur nach `'eigene-schleife'` suchte und
   * kein Slot diesen Laeufer hatte — slots.ts nannte `'fremdes-cli'` und `'ein-schuss'` die ganze
   * Zeit unbeanstandet. Der Test prueft jetzt **alle drei** Namen und nimmt slots.ts benannt aus,
   * statt weiter nur einen davon zu treffen. Was er wirklich schuetzen soll, halten ohnehin die
   * beiden Tests darunter: eine zweite Tabelle und ein zweiter Nutzertext.
   *
   * agent-adapter.ts (seit dem Harness-Adapter-Plan, 2026-08-23) nennt `'eigene-schleife'`
   * ebenfalls — dort als Wert des Diskriminanzfelds `Sitzungsart`, nicht als Laeufer-Tabelle.
   * Es ist derselbe reale Sachverhalt (keels eigene Prozessschleife) von der Adapter-Seite aus
   * benannt statt von der Modell-Zuordnungs-Seite, genau wie slots.ts ihn von der Slot-Seite
   * aus nennt. Eine zweite Faehigkeits- oder Sperrgrund-Tabelle entstuende dort trotzdem nicht
   * — das bleibt Sache des Tests direkt darunter.
   */
  const laeuferHeimat = [
    ...erlaubt,
    path.join(SRC, 'main/model/slots.ts'),
    path.join(SRC, 'main/agent/agent-adapter.ts'),
  ]

  it('names the three Laeufer only in eignung.ts and the slot table', () => {
    const treffer = alleQuelldateien(SRC)
      .filter(f => !laeuferHeimat.includes(f))
      .filter(f => /['"](?:eigene-schleife|fremdes-cli|ein-schuss)['"]/.test(fs.readFileSync(f, 'utf8')))
    expect(treffer, `Laeufer ausserhalb von eignung.ts/slots.ts: ${treffer.join(', ')}`).toEqual([])
  })

  it('states the runner capability level only in eignung.ts', () => {
    // Name-based checks (laeuferFaehigkeit / FAEHIGKEIT) catch the obvious copy-paste.
    // Record<Laeufer, ...> catches the same table under any other name — a rename must
    // not be enough to slip a second table (capability or structural) past this guard.
    const treffer = alleQuelldateien(SRC)
      .filter(f => !erlaubt.includes(f))
      .filter(f =>
        /laeuferFaehigkeit\s*[:=]\s*\{|FAEHIGKEIT\s*:\s*Record|Record<\s*Laeufer\s*,/.test(
          fs.readFileSync(f, 'utf8')
        )
      )
    expect(treffer, `zweite Faehigkeitstabelle: ${treffer.join(', ')}`).toEqual([])
  })

  // Every German string eignung.ts hands to a user, one distinctive substring each, taken
  // verbatim from the source. Long enough not to match by accident, short enough to
  // survive a comma moving. This list is meant to be the full set -- if warnungen() or
  // sperrgrund() grows a new user-facing string, it belongs here too.
  const NUTZERTEXTE = [
    'bringt sein Modell selbst mit', // sperrgrund: what a cli-harness is, structurally
    'waere eine stille Falle', // sperrgrund: fremdes-cli locked against a foreign model
    'eine Nutzungsbedingung, keine Faehigkeitsfrage', // sperrgrund: agentic vs. cli-harness
    'schwache Modelle zuerst brechen', // warnungen: werkzeugmodus-text
    'die Faehigkeitszeile ist vermutet', // warnungen: nicht-gemessen
    'passt nicht in das', // warnungen: kontext-zu-klein
    'Gegenteil des Gefaelles', // warnungen: teure-ebene-fuer-mechanik
    'nutzt den Laeufer aber nicht aus', // warnungen: unter-faehigkeit
    'verlaesst das eigene Netz', // warnungen: verlaesst-netz
  ]

  it('keeps every warning and lock text in eignung.ts, so no surface writes its own', () => {
    const treffer = alleQuelldateien(SRC)
      .filter(f => !erlaubt.includes(f))
      .filter(f => {
        const inhalt = fs.readFileSync(f, 'utf8')
        return NUTZERTEXTE.some(text => inhalt.includes(text))
      })
    expect(treffer, `Nutzertext ausserhalb von eignung.ts: ${treffer.join(', ')}`).toEqual([])
  })
})
