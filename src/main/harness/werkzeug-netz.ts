/**
 * werkzeug-netz — die zwei Netz-Werkzeuge des Hauptlaufs: `web_suchen` und `seite_lesen`.
 *
 * Zwei Werkzeuge und nicht eins, aus Kontextbudget (Entwurf §3.1): ein Anbieter, der bei zehn
 * Treffern den Seiteninhalt inline mitliefert, sind grob 100k Token. Ein 27B mit 64K nutzbarem
 * Kontext hat das nicht. Also liefert `web_suchen` nur Metadaten, und Inhalt holt `seite_lesen`
 * einzeln und auf Ansage.
 *
 * Bauform wie `werkzeug-datei.ts`: `schema` ist eine **Methode**, kein Feld; ein Fehlschlag ist
 * `{ ok: false, meldung }` und nie ein Wurf; kein `fehler`-Feld — das setzt erst `projektion.ts`.
 *
 * ## Die Herkunftspruefung
 *
 * `seite_lesen` nimmt **nur URLs, die bytegleich in einem Suchtreffer dieses Laufs stehen.** Das
 * ist die eine Regel dieser Datei, die nicht Hygiene ist, sondern Mechanik: eine vom Modell
 * komponierte URL — `https://erlaubte-domaene.test/?d=<Inhalt aus dem Lauf>` — hat keinen Treffer
 * und faellt, bevor irgendetwas das Haus verlaesst. Die Positivliste der netzwache leistet das
 * ausdruecklich *nicht*: eine erlaubte URL traegt ihren Query-String mit hinaus (netzwache.ts,
 * Modulkopf). Erst beide zusammen schliessen den Kanal fast vollstaendig.
 *
 * Geprueft wird gegen das **Ereignisprotokoll**, nicht gegen einen Merker im Speicher dieses
 * Moduls, und die Pruefung ist eine reine Funktion darueber — genau die Bauform von
 * `effekteOhneIntent` (intent-vor-effekt.ts), und aus denselben zwei Gruenden: der Lauf haelt
 * seinen Zustand nirgends ausser im Protokoll (ein Merker waere nach einem Neustart weg, und
 * `seite_lesen` wuerde nach einem Absturz genau die URLs ablehnen, die es vorher selbst gefunden
 * hat), und eine Regel, die als reine Funktion dasteht, laesst sich gegen Daten pruefen, die der
 * Test nicht zum Bestehen gebaut hat.
 *
 * Was ausdruecklich **nicht** geht: die URLs aus dem Antworttext des Werkzeugs zurueckzulesen. Der
 * Text traegt auch Titel und Auszug, und beide sind fremdbestimmter Netzinhalt. Wer dort nach
 * URLs sucht, laesst den Angreifer die Liste der erlaubten Ziele mitschreiben — er muesste nur
 * eine Seite mit der Ausleit-URL im Auszug in die Treffer bringen. Deshalb steht in
 * `tool.completed` ein eigenes Feld `trefferUrls`, und nur das wird gelesen.
 *
 * ## Beide Werkzeuge und der Weg ins Netz
 *
 * `seite_lesen` geht ueber `netzwache.holeSicher` — Ziel ist modellgewaehlt, also ist die Wache
 * Pflicht: nur https, keine privaten und keine Tailscale-Ziele, Pruefung bei **jeder**
 * Weiterleitung, Bindung an die geprueften Adressen. Es gibt keinen zweiten Weg.
 * `web_suchen` geht ueber den `SuchAnbieter`, dessen Ziel **betreiberkonfiguriert** ist und der
 * seine Grenzen deshalb selbst traegt (such-anbieter.ts, Modulkopf). Das Modell waehlt dort die
 * Anfrage, nie das Ziel.
 */

import type { Ereignis } from './ereignisse'
import type { Werkzeug, WerkzeugErgebnis } from './werkzeuge'
import {
  MAX_ANFRAGE_LAENGE, MAX_ANZAHL, MAX_AUSZUG_ZEICHEN, MAX_TITEL_ZEICHEN, SuchFehler,
  type SuchAnbieter,
} from './such-anbieter'
import {
  HARTE_MAX_ZEICHEN, MIN_ZEICHEN, STANDARD_MAX_ZEICHEN, einzeilig, extrahiereSeitenText,
} from './seiten-text'
import { holeSicher, type AbrufGrenzen, type Abrufer, type Aufloeser } from './netzwache'

export const WEB_SUCHEN_NAME = 'web_suchen'
export const SEITE_LESEN_NAME = 'seite_lesen'

/**
 * Vorgabe der Positivliste: Dokumentationsseiten, deren Inhalt wir als Nachschlagewerk behandeln
 * (Nachtrag 2026-08-21). Ein Eintrag gilt **samt aller Unterdomaenen, beliebig tief** — deshalb
 * stehen hier nur Domaenen, deren Unterdomaenen derselben Partei gehoeren.
 *
 * **GitHub fehlt hier absichtlich.** Nicht vergessen, sondern entschieden: GitHub traegt fremden
 * Nutzerinhalt unter einer Domaene, die jeder beschreiben kann, und `github.io` vergibt
 * Unterdomaenen an jeden, der sich anmeldet. Im Hauptlauf stuende dieser Inhalt neben
 * `datei_lesen` und den Graph-Werkzeugen. GitHub-Recherche laeuft ueber den Rechercheur — eigener
 * Unterlauf, kein Datei- und kein Graph-Werkzeug daneben.
 */
export const VORGABE_POSITIVLISTE: readonly string[] = [
  'nodejs.org',
  'developer.mozilla.org',
  'electronjs.org',
  'vitest.dev',
  'vite.dev',
  'typescriptlang.org',
  'docs.ollama.com',
  'docs.anthropic.com',
  'react.dev',
]

/** Grenzen von `seite_lesen` aus §3.4: 5 MB, 20 Sekunden, hoechstens 3 Weiterleitungen. */
export const VORGABE_SEITE_GRENZEN: AbrufGrenzen = {
  maxBytes: 5 * 1024 * 1024,
  zeitbudgetMs: 20_000,
  maxWeiterleitungen: 3,
}

/**
 * Alles, was die beiden Werkzeuge ueber das Netz wissen — Anbieter, Positivliste, Modus, Grenzen,
 * Protokoll.
 *
 * **Warum das im Kontext steht und nicht aus dem `configStore` gezogen wird:** das Werkzeug bleibt
 * eine reine Funktion ueber seinem Kontext und damit ohne Daemon, ohne Electron und ohne Netz
 * testbar — der Waechtertest verbietet unter `src/main/harness/` ohnehin jeden `electron`-Import.
 * Und die anpassbare Flaeche (Positivliste, Suchanbieter, Grenzen) entsteht an genau **einer**
 * Stelle statt in drei Modulen, die auseinanderlaufen koennen.
 */
export interface NetzKontext {
  /** Der gewaehlte Suchdienst. `waehleAnbieter` (such-anbieter.ts) benennt, wenn keiner da ist. */
  anbieter: SuchAnbieter
  /**
   * Der Abrufer des Suchdienstes. Bewusst `fetch` und **nicht** die netzwache: das Suchziel ist
   * betreiberkonfiguriert, und der SearXNG-Endpunkt auf MS-01 ist http im Tailnet — durch die
   * Wache zu fuehren hiesse, http und 100.64.0.0/10 zu oeffnen. Die Grenzen dieses einen Abrufs
   * traegt `such-anbieter.ts` selbst.
   */
  suchAbrufer: typeof fetch
  /** Namensaufloesung fuer `seite_lesen`. Pflicht: **alle** Familien, sonst bleibt AAAA ungeprueft. */
  aufloesen: Aufloeser
  /** Der Abrufer hinter der netzwache — er verbindet ueber die `bindung`, nicht ueber den Namen. */
  abrufen: Abrufer
  /** 'whitelist' = Hauptlauf. 'offen' = Unterlauf des Rechercheurs, spaetere Welle. */
  modus: 'whitelist' | 'offen'
  positivliste: readonly string[]
  seiteGrenzen: AbrufGrenzen
  /**
   * Das Ereignisprotokoll dieses Laufs, so weit es geschrieben ist. Grundlage der
   * Herkunftspruefung — siehe Modulkopf.
   */
  ereignisse: readonly Ereignis[]
}

// ---------------------------------------------------------------------------------------------
// Die Herkunftspruefung — reine Funktion ueber dem Protokoll, Bauform `effekteOhneIntent`
// ---------------------------------------------------------------------------------------------

/**
 * Alle URLs, die `web_suchen` in diesem Lauf als Treffer ausgegeben hat. Gelesen wird allein das
 * Feld `trefferUrls` eines `tool.completed` von `web_suchen` — nie ein Text, in dem eine URL
 * vorkommen koennte (Modulkopf).
 *
 * Ein `tool.completed` von `web_suchen` ohne dieses Feld liefert nichts. Das ist die
 * fail-closed-Richtung: eine Ausgabe, deren Treffer nicht im Protokoll stehen, erlaubt keinen
 * Abruf — statt umgekehrt einen Abruf zu erlauben, dessen Herkunft niemand mehr nachsehen kann.
 */
export function trefferUrlsDesLaufs(ereignisse: readonly Ereignis[]): Set<string> {
  const urls = new Set<string>()
  for (const e of ereignisse) {
    if (e.art !== 'tool.completed') continue
    if (e.nutzlast.name !== WEB_SUCHEN_NAME) continue
    const roh = e.nutzlast.trefferUrls
    if (!Array.isArray(roh)) continue
    for (const eintrag of roh) if (typeof eintrag === 'string') urls.add(eintrag)
  }
  return urls
}

/**
 * Bytegleich, nicht „gleichwertig". Kein `new URL(...).toString()` auf der Modelleingabe und kein
 * Vergleich ohne Query: beides waere eine Normalisierung, und jede Normalisierung ist eine Klasse
 * von URLs, die zwei verschiedene Ziele auf denselben Vergleichswert abbildet. Die Treffer-URLs
 * kommen bereits geparst aus `such-anbieter.brauchbareUrl`; das Modell muss genau die abschreiben,
 * die es gesehen hat, und das kann es, weil sie in seinem Kontext steht.
 */
export function stammtAusTreffer(url: string, ereignisse: readonly Ereignis[]): boolean {
  return trefferUrlsDesLaufs(ereignisse).has(url)
}

// ---------------------------------------------------------------------------------------------
// Kleinteile
// ---------------------------------------------------------------------------------------------

function fehlendesFeld(feld: string): WerkzeugErgebnis {
  // Wortgleich mit den Dateiwerkzeugen: dasselbe Versaeumnis soll fuer das Modell dasselbe heissen.
  return { ok: false, meldung: `Das Feld '${feld}' fehlt in der Eingabe.` }
}

/**
 * Die Absage, wenn der Lauf gar keinen Netzkontext hat. Benannt, nicht leer und nicht geworfen:
 * ein Werkzeug, das ohne Konfiguration `Keine Treffer.` sagt, laesst das Modell glauben, es habe
 * gesucht und nichts gefunden — und dann erfindet es die Antwort statt nachzufragen.
 */
function ohneNetz(name: string): WerkzeugErgebnis {
  return {
    ok: false,
    meldung:
      `Netzzugang ist fuer diesen Lauf nicht eingerichtet — '${name}' hat weder Suchanbieter noch ` +
      `Netzwache. Es wurde nicht gesucht, und es wird auch nicht so getan.`,
  }
}

/** Auf `max` Zeichen, mit sichtbarem Ende. Gleiche Bauform wie `such-anbieter.sauberGekappt`. */
function kappe(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + '…'
}

/**
 * Eine Zeile fuer keels eigenen Rahmen: einzeilig und gekappt.
 *
 * Beides gilt fuer jedes fremdbestimmte Feld, das hier in ein zeilenweise gebautes Format geht —
 * Titel und Auszug eines Treffers, der Titel ueber der Quellzeile von `seite_lesen`. Geprueft
 * wird hier und nicht nur im Anbieter bzw. in der Extraktion, aus demselben Grund wie bei
 * `MAX_ANFRAGE_LAENGE`: `SuchAnbieter` ist eine Schnittstelle, und der Rahmen gehoert dem
 * Werkzeug, das ihn baut.
 *
 * Gemessen, beides an der echten Werkzeugfunktion: ein Treffertitel mit `\n` erzeugte eine
 * Trefferliste mit zwei nummerierten Eintraegen, von denen einer samt URL erfunden war; eine
 * Seite mit 120.000-Zeichen-Titel gab bei `max_zeichen: 1000` einen Textblock von 120.574
 * Zeichen zurueck — `HARTE_MAX_ZEICHEN` war ueber den Titel ausgehebelt, nach oben begrenzt nur
 * durch die 5-MB-Downloadgrenze.
 */
function zeile(text: string, max: number): string {
  return kappe(einzeilig(text).trim(), max)
}

/**
 * `max_zeichen`: Vorgabe 32.000, hart 48.000 (§3.4). Ein zu grosser Wert wird **gekappt**, nicht
 * uebernommen — das ist die eine Stelle, an der Klemmen richtiger ist als Ablehnen, weil 60.000
 * kein Angriff ist, sondern ein Modell, das die Obergrenze nicht gelesen hat.
 *
 * Oeffentlich, damit ein Test die Kappung *dieses* Werkzeugs pruefen kann.
 * `extrahiereSeitenText` klemmt noch einmal auf dieselbe Grenze; ein Test, der nur das Endergebnis
 * misst, waere also auch dann gruen, wenn es hier gar keine Kappung gaebe — der teuerste
 * Fehlermodus dieses Repos.
 */
export function klemmeMaxZeichen(
  wert: unknown,
): { ok: true; wert: number } | { ok: false; meldung: string } {
  if (wert === undefined) return { ok: true, wert: STANDARD_MAX_ZEICHEN }
  if (typeof wert !== 'number' || !Number.isFinite(wert)) {
    return { ok: false, meldung: `'max_zeichen' muss eine Zahl sein.` }
  }
  return { ok: true, wert: Math.min(HARTE_MAX_ZEICHEN, Math.max(MIN_ZEICHEN, Math.trunc(wert))) }
}

/** `anzahl`: 1 bis 10, Vorgabe 5. Ausserhalb wird geklemmt, Unlesbares wird benannt abgelehnt. */
function klemmeAnzahl(wert: unknown): { ok: true; wert: number } | { ok: false; meldung: string } {
  if (wert === undefined) return { ok: true, wert: 5 }
  if (typeof wert !== 'number' || !Number.isFinite(wert)) {
    return { ok: false, meldung: `'anzahl' muss eine Zahl zwischen 1 und ${MAX_ANZAHL} sein.` }
  }
  return { ok: true, wert: Math.min(MAX_ANZAHL, Math.max(1, Math.trunc(wert))) }
}

// ---------------------------------------------------------------------------------------------
// web_suchen
// ---------------------------------------------------------------------------------------------

const webSuchen: Werkzeug = {
  name: WEB_SUCHEN_NAME,
  // Genau eine Zeile: sie steht im stabilen Praefix und wird bei jedem Zug mitbezahlt (§6.4).
  beschreibung: 'Sucht im Web und liefert Titel, URL und Kurzauszug — ohne Seiteninhalt.',
  schema: () => ({
    type: 'object',
    properties: {
      anfrage: { type: 'string', description: `Suchanfrage, hoechstens ${MAX_ANFRAGE_LAENGE} Zeichen` },
      anzahl: { type: 'number', description: `Anzahl Treffer, 1 bis ${MAX_ANZAHL}, Vorgabe 5` },
    },
    required: ['anfrage'],
  }),
  async ausfuehren(eingabe, ktx) {
    const roh = eingabe.anfrage
    if (typeof roh !== 'string' || roh.trim() === '') return fehlendesFeld('anfrage')
    const anfrage = roh.trim()
    if (anfrage.length > MAX_ANFRAGE_LAENGE) {
      // Die Laengengrenze ist nicht Bequemlichkeit, sondern eine Ausleit-Bremse: eine Suchanfrage
      // geht unredigiert nach draussen und ist damit der bequemste Kanal, um Inhalt aus dem Lauf
      // an einen Dritten zu schicken. Geprueft wird hier und nicht erst im Anbieter, damit die
      // Grenze auch fuer eine kuenftige dritte `SuchAnbieter`-Implementierung gilt.
      //
      // Zwei Dinge, die dazugehoeren und bisher nirgends standen. Erstens: **begrenzt sind 200
      // Zeichen je Aufruf, nicht in Summe.** Im Hauptlauf begrenzt nichts die Zahl der Suchen
      // ausser dem Rundenbudget (12 bis 30) — das sind 2,4 bis 6 KB pro Lauf, und dort steht
      // `datei_lesen` daneben. Der Unterlauf des Rechercheurs hat laut Spec hoechstens drei
      // Suchen; der Hauptlauf hat keine solche Schranke. Zweitens, und deshalb ist der Kanal
      // trotzdem ertraeglich: **die Anfrage geht an den betreiberkonfigurierten Suchdienst, nicht
      // an ein angreifergewaehltes Ziel.** Wer hier etwas abholen will, muss die Anfragen dieses
      // Dienstes lesen koennen. Faellt diese Eigenschaft (ein Anbieter, dessen Ziel aus einem
      // Werkzeugargument kaeme), traegt die Laengengrenze allein den Kanal nicht mehr.
      return {
        ok: false,
        meldung:
          `Die Suchanfrage ist ${anfrage.length} Zeichen lang, erlaubt sind ${MAX_ANFRAGE_LAENGE}. ` +
          `Kuerze sie auf die Suchbegriffe.`,
      }
    }

    const anzahl = klemmeAnzahl(eingabe.anzahl)
    if (!anzahl.ok) return { ok: false, meldung: anzahl.meldung }

    const netz = ktx.netz
    if (!netz) return ohneNetz(WEB_SUCHEN_NAME)

    let antwort
    try {
      antwort = await netz.anbieter.suche(anfrage, anzahl.wert, netz.suchAbrufer)
    } catch (fehler) {
      // `SuchAnbieter.suche` wirft — es ist kein Werkzeug (such-anbieter.ts, Modulkopf). Hier
      // endet der Wurf und wird zum benannten Ergebnis, das der Lauf weiterreichen kann.
      if (fehler instanceof SuchFehler) return { ok: false, meldung: fehler.message }
      return {
        ok: false,
        meldung: `Die Suche ist fehlgeschlagen: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
      }
    }

    // Harte Obergrenze noch einmal hier: `MAX_ANZAHL` ist eine Zusage des Werkzeugs an das
    // Kontextbudget, und sie darf nicht davon abhaengen, dass jeder Anbieter sie einhaelt.
    const treffer = antwort.treffer.slice(0, MAX_ANZAHL)
    const zeilen = treffer.map((t, i) =>
      `${i + 1}. ${zeile(t.titel, MAX_TITEL_ZEICHEN)}\n   ${t.url}` +
      `\n   ${zeile(t.auszug, MAX_AUSZUG_ZEICHEN)}`)
    const kopf = zeilen.length > 0 ? zeilen.join('\n') : 'Keine Treffer.'

    return {
      ok: true,
      quelle: 'netz',
      inhalt: [{
        art: 'text',
        // Die Engine-Zeile ist kein Schmuck: SearXNG sperrt eine geblockte Engine 3.600 s, bei
        // CAPTCHA einen Tag, bei Cloudflare 15 Tage. Wer sie nicht sieht, bekommt still weniger
        // Ergebnisse und haelt sie fuer alle, die es gibt.
        text: `${kopf}\n\n${antwort.engineLage}`,
      }],
      // Das Feld, gegen das `seite_lesen` prueft. Es steht im Protokoll und nicht im Text — der
      // Text traegt auch fremdbestimmte Auszuege (Modulkopf).
      trefferUrls: treffer.map(t => t.url),
    }
  },
}

// ---------------------------------------------------------------------------------------------
// seite_lesen
// ---------------------------------------------------------------------------------------------

const seiteLesen: Werkzeug = {
  name: SEITE_LESEN_NAME,
  beschreibung: 'Holt eine Seite aus den Treffern dieses Laufs und gibt sie als Text zurueck.',
  schema: () => ({
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Genau eine URL aus einem Suchtreffer dieses Laufs' },
      max_zeichen: {
        type: 'number',
        description: `Obergrenze, Vorgabe ${STANDARD_MAX_ZEICHEN}, hoechstens ${HARTE_MAX_ZEICHEN}`,
      },
    },
    required: ['url'],
  }),
  async ausfuehren(eingabe, ktx) {
    const roh = eingabe.url
    if (typeof roh !== 'string' || roh.trim() === '') return fehlendesFeld('url')
    const url = roh.trim()

    const maxZeichen = klemmeMaxZeichen(eingabe.max_zeichen)
    if (!maxZeichen.ok) return { ok: false, meldung: maxZeichen.meldung }

    const netz = ktx.netz
    if (!netz) return ohneNetz(SEITE_LESEN_NAME)

    // Die Herkunftspruefung, und sie steht **vor** jedem Netzweg: eine abgelehnte URL wird nicht
    // aufgeloest, nicht verbunden und nicht abgerufen. Sonst traege schon die DNS-Anfrage den
    // ausgeleiteten Inhalt hinaus — `<geheimnis>.boeser-host.de` braucht nie eine Antwort.
    if (!stammtAusTreffer(url, netz.ereignisse)) {
      return {
        ok: false,
        meldung:
          `Die URL ${kappe(url, 200)} steht in keinem Suchtreffer dieses Laufs und wird nicht ` +
          `geholt. '${SEITE_LESEN_NAME}' nimmt ausschliesslich URLs, die genau so in einem ` +
          `Treffer von '${WEB_SUCHEN_NAME}' standen — suche zuerst und uebernimm die URL ` +
          `unveraendert aus dem Treffer.`,
      }
    }

    const abruf = await holeSicher(
      url,
      { modus: netz.modus, positivliste: [...netz.positivliste], adressen: [] },
      netz.seiteGrenzen,
      { aufloesen: netz.aufloesen, abrufen: netz.abrufen },
    )
    if (!abruf.ok) return { ok: false, meldung: `Die Seite wurde nicht geholt: ${abruf.grund}` }

    const extrakt = extrahiereSeitenText(abruf.text, { maxZeichen: maxZeichen.wert })
    // Die Absage der Extraktion wird unveraendert weitergereicht. Sie nennt bewusst nicht den
    // Seitentitel — der Titel ist die Vorlage, aus der das Modell sonst den Inhalt erfindet.
    if (!extrakt.ok) return { ok: false, meldung: extrakt.meldung }

    // Der Titel ist fremdbestimmt wie der Rumpf, geht aber in *keels* Kopfzeilen. Ungekappt und
    // mehrzeilig hebelt er beides aus, was diese zwei Zeilen leisten sollen: die Obergrenze
    // (siehe `zeile`) und die Quellenangabe — auf der §4.1 (4) ruht, weil der Mensch genau diese
    // URL in Handover und Graph traegt.
    const gekappt = zeile(extrakt.titel, MAX_TITEL_ZEICHEN)
    const titel = gekappt === '' ? '(ohne Titel)' : gekappt
    return {
      ok: true,
      quelle: 'netz',
      inhalt: [{
        art: 'text',
        // `abruf.endUrl` und nicht die angefragte URL: nach einer Weiterleitung ist das die Seite,
        // die tatsaechlich gelesen wurde, und jeder Sprung dorthin ist durch die Wache gegangen.
        text: `${titel}\n${abruf.endUrl}\n\n${extrakt.markdown}`,
      }],
    }
  },
}

export const NETZ_WERKZEUGE: Werkzeug[] = [webSuchen, seiteLesen]
