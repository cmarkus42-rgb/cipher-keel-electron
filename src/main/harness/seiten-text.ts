/**
 * seiten-text — HTML rein, Markdown raus. Der zweite Baustein der Zufuhr, unter den Werkzeugen.
 *
 * Genau diese Inhaltsextraktion ist das, wofuer Kagi ($4/1k Seiten), Exa ($1/1k) und Jina Geld
 * nehmen (Entwurf §3.3). Hier sind es zwei Pakete und eine Datei. `linkedom` statt `jsdom`:
 * gemessen bit-identischer Text (7452 Zeichen), ~10x schneller (10 ms gegen 98 ms), 18 MB
 * weniger Installation. jsdom kommt nicht ins Haus.
 *
 * Diese Datei holt nichts. Sie bekommt HTML als Zeichenkette und ist damit ohne Netz testbar;
 * das Holen macht `netzwache.holeSicher`, und das gehoert nicht hierher.
 *
 * Vier Pflichten, jede gegen einen konkreten Fehlerfall:
 *
 *   1. `isProbablyReaderable()` davor. Readability gibt bei JS-gerenderten Seiten kommentarlos
 *      `null` zurueck. Ohne den Waechter steht am Ende ein leerer Befund neben einem echten
 *      Seitentitel, und das Modell erfindet den Inhalt aus dem Titel.
 *   2. Mindestlaenge 250 Zeichen danach. Readability liefert bei Teaser- und Linklisten still
 *      10 bis 200 Zeichen Muell. Unterschreitung wird eine ehrliche Absage, kein Erfolg.
 *   3. Turndown ohne Link-URLs und ohne Bilder. Gemessen am selben Wikipedia-Artikel:
 *      `textContent` 20.385 Token, Turndown-Standard 42.360, `no-links + no-img` 20.926.
 *      Ueberschriften, Listen und Tabellen zum Nulltarif; die URL-Flut kostet 100 % Aufschlag
 *      fuer nichts. Nebenwirkung, die hier zaehlt: eine im Markdown transportierte URL ist auch
 *      der Ausleitungsweg aus EchoLeak (CVE-2025-32711) — ohne URLs im Text gibt es sie nicht.
 *   4. Zeichensaeuberung. Siehe `saeubere`.
 *
 * Was hier ausdruecklich *nicht* steht, weil es falsch waere: dass irgendetwas davon Prompt
 * Injection verhindert. Ein hoeflich formulierter, vollstaendig sichtbarer Satz auf einer
 * geholten Seite geht durch jede Zeile dieser Datei unveraendert hindurch. Gesaeubert wird
 * Unsichtbares, nicht Boesartiges.
 */

import { parseHTML } from 'linkedom'
import { Readability, isProbablyReaderable } from '@mozilla/readability'
import TurndownService from 'turndown'

/**
 * Untergrenze fuer brauchbaren Text. Gemessen (Entwurf §3.3): Readability liefert bei
 * Linklisten 10 bis 200 Zeichen. 250 liegt darueber und unter jedem echten Artikel.
 */
export const MIN_ZEICHEN = 250

/** Vorgabe aus §3.4, ~8.000 Token. */
export const STANDARD_MAX_ZEICHEN = 32000

/**
 * Harte Obergrenze aus §3.4, ~12.000 Token. Zum Vergleich, gemessen: ein Wikipedia-Artikel
 * sind 1.055 KB roh, 80 KB Text, ~20.380 Token — eine einzige grosse Seite sprengt jedes
 * vernuenftige Einzelseiten-Budget auch nach der Extraktion.
 */
export const HARTE_MAX_ZEICHEN = 48000

/** Hoechstens so viele Abschnittsnamen stehen in der Kuerzungsmarke. Namen sind billig
 *  (~5 Token), aber bei einer Seite mit 200 Abschnitten waere die Marke selbst der Inhalt. */
const MAX_GENANNTE_ABSCHNITTE = 12

const ABSAGE = 'Seite nicht lesbar extrahierbar (JS-gerendert oder zu kurz).'

export interface ExtraktGrenzen {
  /** Obergrenze in Zeichen. Wird auf [MIN_ZEICHEN, HARTE_MAX_ZEICHEN] geklemmt. */
  maxZeichen?: number
}

export type ExtraktErgebnis =
  | { ok: true; titel: string; markdown: string; gekuerzt: boolean }
  | { ok: false; meldung: string }

/**
 * Die Vorpruefung allein, oeffentlich — damit ein Test zeigen kann, dass eine Seite *hier*
 * durchkommt und erst an der Mindestlaenge faellt. Ohne diese Trennung waere ein Test gruen,
 * ohne dass jemand weiss, welcher der beiden Waechter ihn gruen gemacht hat.
 *
 * Kein Umschalter: es gibt keinen Weg, die Pruefung in `extrahiereSeitenText` abzuschalten.
 * Ein Waechter mit Ausschalter ist eine Einladung, ihn im Betrieb auszuschalten.
 */
export function istVorlesbar(html: string): boolean {
  const dokument = dokumentVon(html)
  return dokument !== null && isProbablyReaderable(dokument)
}

/**
 * Zeichensaeuberung nach der Extraktion. Gemessen (Entwurf §3.3): 16 versteckte Zeichen
 * ueberleben die Extraktion bei allen vier getesteten Pipelines und verschwinden durch diesen
 * Strip vollstaendig. Das ist die einzige Massnahme in §4, die deterministisch eine ganze
 * Angriffsklasse schliesst — Anweisungen, die ein Mensch beim Nachlesen der Seite nicht sehen
 * kann, weil sie keine Breite haben.
 *
 * `NFKC` zuerst, sonst laeuft die Umgehung ueber Vollbreitenzeichen und Ligaturen: 'Ｉｇｎｏｒｅ'
 * ist fuer jeden Zeichenvergleich ein anderes Wort als 'Ignore' und fuer das Modell dasselbe.
 *
 * Entfernt: U+E0000–E007F (Unicode-Tags, der Traeger fuer ganze versteckte Saetze),
 * U+200B/U+200C (Zero Width Space/Non-Joiner), U+200E/U+200F (LTR/RTL-Marken),
 * U+2060–U+2064 (Word Joiner und unsichtbare Operatoren), U+FEFF.
 *
 * **Bleibt stehen: U+00AD und U+200D.** Das weiche Trennzeichen steht in deutschen Texten
 * mitten in Woertern, ZWJ traegt arabische und indische Schrift und jede zusammengesetzte
 * Emoji-Sequenz. Wer die mitloescht, saeubert nicht, sondern veraendert fremden Text — und der
 * Schaden faellt genau bei den Sprachen an, die ohnehin am seltensten geprueft werden.
 * Nicht gemessen, bewusst konservativ.
 */
export function saeubere(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u{E0000}-\u{E007F}​‌‎‏⁠-⁤﻿]/gu, '')
}

function dokumentVon(html: string): Document | null {
  if (html.trim() === '') return null
  // linkedom liefert ein DOM-aehnliches Objekt, kein lib.dom-`Document`. Readability und
  // isProbablyReaderable benutzen davon nur den Teil, den linkedom bedient — der Cast ist
  // die Stelle, an der das eingestanden wird, statt es ueber `any` zu verstecken.
  return parseHTML(html).document as unknown as Document
}

function turndown(): TurndownService {
  const dienst = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
  // Linktext ja, URL nein: die URL ist der teure Teil (100 % Aufschlag) und zugleich der
  // einzige Teil, ueber den Markdown Daten aus dem Lauf hinaustragen kann.
  dienst.addRule('nurLinktext', { filter: 'a', replacement: inhalt => inhalt })
  // Bilder ganz weg: ein Modell liest sie nicht, und `![](https://...?daten)` ist der Weg,
  // der in EchoLeak automatisch geladen wurde.
  dienst.addRule('keineBilder', { filter: 'img', replacement: () => '' })
  return dienst
}

/** Ueberschrift der zweiten oder dritten Ebene — die Schnittstellen fuers Kuerzen. */
const UEBERSCHRIFT = /^(#{2,3})\s+(.+)$/

interface Abschnitt {
  /** Name der Ueberschrift, oder null fuer den Vorspann vor der ersten Ueberschrift. */
  name: string | null
  text: string
}

function inAbschnitte(markdown: string): Abschnitt[] {
  const abschnitte: Abschnitt[] = []
  let aktuell: Abschnitt = { name: null, text: '' }
  for (const zeile of markdown.split('\n')) {
    const treffer = UEBERSCHRIFT.exec(zeile)
    if (treffer) {
      abschnitte.push(aktuell)
      aktuell = { name: treffer[2].trim(), text: zeile + '\n' }
    } else {
      aktuell.text += zeile + '\n'
    }
  }
  abschnitte.push(aktuell)
  return abschnitte.filter((a, i) => i === 0 || a.text.trim() !== '')
}

function marke(ausgelassen: Abschnitt[]): string {
  const namen = ausgelassen
    .slice(0, MAX_GENANNTE_ABSCHNITTE)
    .map(a => `"${a.name ?? 'ohne Ueberschrift'}"`)
  const rest = ausgelassen.length > MAX_GENANNTE_ABSCHNITTE ? ', ...' : ''
  return `[... ${ausgelassen.length} weitere Abschnitte ausgelassen: ${namen.join(', ')}${rest}]`
}

/**
 * Kuerzt an Ueberschriftsgrenzen und macht die Kuerzung sichtbar. Der Grund ist nicht
 * Aesthetik: ein Modell, das nicht weiss, dass sein Text abbricht, raet den Rest, statt die
 * fehlenden Abschnitte nachzufordern. Die Namen der ausgelassenen Abschnitte stehen in der
 * Marke, damit das Nachfordern gezielt sein kann.
 */
function kuerze(markdown: string, max: number): { markdown: string; gekuerzt: boolean } {
  if (markdown.length <= max) return { markdown, gekuerzt: false }

  const abschnitte = inAbschnitte(markdown)
  for (let behalten = abschnitte.length - 1; behalten >= 1; behalten--) {
    const kopf = abschnitte.slice(0, behalten).map(a => a.text).join('')
    const schwanz = marke(abschnitte.slice(behalten))
    if (kopf.length + schwanz.length <= max) {
      return { markdown: kopf.trimEnd() + '\n\n' + schwanz, gekuerzt: true }
    }
  }

  // Der benannte Ausnahmefall: schon der erste Abschnitt ueberschreitet die Obergrenze allein.
  // Die beiden Alternativen waeren, das Budget stillschweigend zu reissen oder still mitten im
  // Wort zu schneiden. Beide belegen, was hier vermieden wird: das Modell merkt es nicht.
  const schwanz = '[... hier abgeschnitten: der erste Abschnitt ueberschreitet die Obergrenze allein.]'
  const platz = Math.max(0, max - schwanz.length - 2)
  return { markdown: markdown.slice(0, platz).trimEnd() + '\n\n' + schwanz, gekuerzt: true }
}

/**
 * Der ganze Weg: HTML → Readability → Markdown → gesaeubert → gekuerzt.
 *
 * Wirft nicht. Ein Fehlschlag ist `{ ok: false, meldung }` — dieselbe Bauform, die ein
 * Werkzeug spaeter unveraendert weiterreichen kann.
 */
export function extrahiereSeitenText(html: string, grenzen: ExtraktGrenzen = {}): ExtraktErgebnis {
  if (html.trim() === '') {
    return { ok: false, meldung: 'Die Seite war leer — kein HTML zum Auswerten.' }
  }

  const max = Math.min(
    HARTE_MAX_ZEICHEN,
    Math.max(MIN_ZEICHEN, grenzen.maxZeichen ?? STANDARD_MAX_ZEICHEN),
  )

  const dokument = dokumentVon(html)
  // Waechter 1. Die Meldung nennt den Grund, aber nicht den Seitentitel: der Titel ist genau
  // die Vorlage, aus der das Modell sonst die Antwort erfindet.
  if (dokument === null || !isProbablyReaderable(dokument)) {
    return { ok: false, meldung: ABSAGE }
  }

  const artikel = new Readability(dokument).parse()
  if (artikel === null || typeof artikel.content !== 'string' || artikel.content.trim() === '') {
    return { ok: false, meldung: ABSAGE }
  }

  const roh = turndown().turndown(artikel.content)
  const sauber = saeubere(roh).replace(/\n{3,}/g, '\n\n').trim()

  // Waechter 2, nach der Saeuberung gemessen: was durch den Strip verschwindet, hat als Laenge
  // nie gezaehlt. Vorher zu messen hiesse, eine Seite aus 300 unsichtbaren Zeichen zu bestehen.
  if (sauber.length < MIN_ZEICHEN) {
    return { ok: false, meldung: ABSAGE }
  }

  const { markdown, gekuerzt } = kuerze(sauber, max)
  return { ok: true, titel: saeubere(artikel.title ?? '').trim(), markdown, gekuerzt }
}
