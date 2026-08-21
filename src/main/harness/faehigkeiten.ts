/**
 * faehigkeiten — Skills lesen, nach dem Agent-Skills-Standard, nicht nach einem Hausformat.
 *
 * Ein Skill ist ein Verzeichnis mit einer `SKILL.md`: Frontmatter mit `name` und `description`,
 * Rumpf als formfreies Markdown. Mehr ist Pflicht nicht (Spec 5.1). keel erfindet hier nichts.
 *
 * Zwei Wurzeln, nicht eine: der Standard sucht unter `.claude/skills/`, keel materialisiert seine
 * eigenen Kapazitaeten aber weiter nach `.claude/capabilities/` (src/main/session/capability-refs.ts).
 * Ein Umzug haette eine Nebenwirkung, die niemand geprueft hat — unter `.claude/skills/` wuerde
 * Claude Code dieselben Dateien zusaetzlich selbst entdecken, und das ist eine Aenderung an
 * Niveau A. Also beide lesen, `.claude/skills/` gewinnt bei Namensgleichheit.
 *
 * Was nicht gelesen werden kann, wird **benannt zurueckgegeben**, nicht verschluckt. Eine still
 * uebersprungene Faehigkeit ist der schlimmste Ausgang: das Modell sieht sie nicht in der Liste,
 * kann sie also nicht vermissen, und der Mensch sucht den Fehler beim Modell.
 *
 * Reine Funktionen, kein Electron — der Waechtertest (tests/harness/waechter-kern.test.ts) prueft
 * das ohne Ausnahmeliste.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Werkzeug } from './werkzeuge'
// gray-matter liegt schon im Repo (src/main/notes/*, src/main/p1/normalizer.ts) und parst genau
// das Frontmatter-Format, das der Standard vorschreibt. Ein zweiter, selbstgeschriebener Parser
// waere eine zweite Wahrheit ueber dieselbe Datei.
import matter from 'gray-matter'

export interface Faehigkeit {
  name: string
  beschreibung: string
  /** Der Rumpf der SKILL.md ohne Frontmatter. Geht in die Historie, nie in den Praefix. */
  rumpf: string
  /** Projektrelativer Pfad des Verzeichnisses — nur fuer Meldungen. */
  pfad: string
}

export interface UebersprungeneFaehigkeit {
  /** Projektrelativer Pfad des Verzeichnisses, das nicht gelesen wurde. */
  pfad: string
  grund: string
}

export interface FaehigkeitenBefund {
  faehigkeiten: Faehigkeit[]
  uebersprungen: UebersprungeneFaehigkeit[]
}

/** `.claude/skills/` zuerst: bei Namensgleichheit gewinnt der Standardpfad. */
const WURZELN = ['skills', 'capabilities'] as const

const NAME_MUSTER = /^[a-z0-9-]{1,64}$/
const MAX_BESCHREIBUNG = 1024

function leseEinVerzeichnis(
  absolut: string, relativ: string, verzeichnisname: string,
): { ok: true; faehigkeit: Faehigkeit } | { ok: false; grund: string } {
  let roh: string
  try {
    roh = readFileSync(join(absolut, 'SKILL.md'), 'utf-8')
  } catch {
    return { ok: false, grund: 'Keine lesbare SKILL.md im Verzeichnis.' }
  }

  let kopf: Record<string, unknown>
  let rumpf: string
  try {
    const geparst = matter(roh)
    kopf = geparst.data as Record<string, unknown>
    rumpf = geparst.content
  } catch (err) {
    // Ein kaputtes YAML in einem Verzeichnis darf die anderen nicht mitreissen — deshalb faengt
    // der Fehler hier und nicht beim Aufrufer.
    return { ok: false, grund: `Frontmatter nicht lesbar: ${err instanceof Error ? err.message : String(err)}` }
  }

  const name = kopf.name
  if (typeof name !== 'string' || !NAME_MUSTER.test(name)) {
    return {
      ok: false,
      grund: `Feld 'name' fehlt oder ist unzulaessig — erlaubt sind 1 bis 64 Zeichen aus a-z, 0-9 und Bindestrich.`,
    }
  }
  if (name !== verzeichnisname) {
    return {
      ok: false,
      grund: `Das Feld 'name' lautet '${name}', das Verzeichnis heisst '${verzeichnisname}'. Beide muessen gleich sein.`,
    }
  }

  const beschreibung = kopf.description
  if (typeof beschreibung !== 'string' || beschreibung.trim() === '') {
    return { ok: false, grund: `Feld 'description' fehlt oder ist leer.` }
  }
  if (beschreibung.length > MAX_BESCHREIBUNG) {
    return {
      ok: false,
      grund: `Feld 'description' ist ${beschreibung.length} Zeichen lang, erlaubt sind hoechstens ${MAX_BESCHREIBUNG}.`,
    }
  }

  return {
    ok: true,
    faehigkeit: { name, beschreibung: beschreibung.trim(), rumpf: rumpf.trim(), pfad: relativ },
  }
}

/**
 * Liest alle Faehigkeiten unterhalb der Projektwurzel. Wirft nicht: eine fehlende Wurzel ist der
 * Normalfall, kein Fehler, und ein unlesbares Verzeichnis wird gemeldet statt den Lauf zu kippen.
 *
 * Die Reihenfolge ist deterministisch (Wurzeln in fester Folge, Verzeichnisse sortiert) — nicht,
 * weil der Praefix sich darauf verlaesst (der sortiert selbst, siehe praefix.ts), sondern damit
 * zwei Aufrufe ueber demselben Verzeichnisbaum dasselbe liefern.
 */
export function leseFaehigkeiten(projektwurzel: string): FaehigkeitenBefund {
  const faehigkeiten: Faehigkeit[] = []
  const uebersprungen: UebersprungeneFaehigkeit[] = []
  const gesehen = new Map<string, string>()

  for (const wurzelName of WURZELN) {
    const wurzel = join(projektwurzel, '.claude', wurzelName)
    let eintraege
    try {
      eintraege = readdirSync(wurzel, { withFileTypes: true })
    } catch (err) {
      // Genau ein Fehler ist der Normalfall: das Verzeichnis gibt es nicht. Die allermeisten
      // Projekte haben hoechstens eine der beiden Wurzeln, und eine Meldung dafuer wuerde sich
      // abnutzen, bis niemand mehr hinsieht.
      //
      // Alles andere ist es nicht. Vorher fing dieser `catch` jeden Fehler und machte `continue`
      // — ein EACCES oder ENOTDIR liess damit *alle* Faehigkeiten darunter verschwinden, ohne
      // einen Eintrag in `uebersprungen` und ohne eine Zeile im Log. Das widerspricht der
      // Zusicherung im Modulkopf, und der Ausgang ist der dort benannte schlimmste: das Modell
      // sieht die Faehigkeit nicht in der Liste, kann sie also nicht vermissen, und der Mensch
      // sucht den Fehler beim Modell. Ein Nextcloud-Share mit verrutschten Rechten reicht dafuer.
      const code = (err as NodeJS.ErrnoException)?.code
      if (code !== 'ENOENT') {
        uebersprungen.push({
          pfad: `.claude/${wurzelName}`,
          grund: err instanceof Error ? err.message : String(err),
        })
      }
      continue
    }

    const verzeichnisse = eintraege
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort()

    for (const verzeichnisname of verzeichnisse) {
      const relativ = `.claude/${wurzelName}/${verzeichnisname}`
      const ergebnis = leseEinVerzeichnis(join(wurzel, verzeichnisname), relativ, verzeichnisname)
      if (!ergebnis.ok) {
        uebersprungen.push({ pfad: relativ, grund: ergebnis.grund })
        continue
      }
      const schonDa = gesehen.get(ergebnis.faehigkeit.name)
      if (schonDa !== undefined) {
        // Auch das wird genannt: zwei Dateien gleichen Namens sind fast immer ein Versehen, und
        // wer die falsche bearbeitet, bekommt sonst keinen Hinweis darauf, warum nichts passiert.
        uebersprungen.push({
          pfad: relativ,
          grund: `Eine Faehigkeit '${ergebnis.faehigkeit.name}' kam bereits aus '${schonDa}' — die dort gewinnt.`,
        })
        continue
      }
      gesehen.set(ergebnis.faehigkeit.name, relativ)
      faehigkeiten.push(ergebnis.faehigkeit)
    }
  }

  return { faehigkeiten, uebersprungen }
}

export const FAEHIGKEIT_WERKZEUG_NAME = 'faehigkeit_lesen'

/**
 * Das Werkzeug, mit dem sich das Modell den Rumpf einer Faehigkeit holt.
 *
 * Es liegt in der Registry, damit sein Stummel und sein Schema auf demselben Weg in den Praefix
 * kommen wie bei jedem anderen Werkzeug — ausgefuehrt wird es aber nicht von hier, sondern in
 * `fuehreAus` (lauf.ts), abgefangen vor der Werkzeugsuche. Der Grund ist derselbe wie bei
 * `werkzeug_schema`: es muss ein Ereignis schreiben, und ein Werkzeug schreibt keine Ereignisse.
 *
 * Kein eigenes `datei_lesen` mit Pfad: der Pfad muesste dann in den Praefix (mehr Bytes, mehr
 * Gelegenheit fuer Tippfehler), der Unterlauf des Rechercheurs hat gar kein Datei-Werkzeug, und
 * nur ein eigenes Ereignis macht im Protokoll sichtbar, dass eine Faehigkeit wirklich geladen
 * wurde (Spec 5.2).
 */
export const faehigkeitLesenWerkzeug: Werkzeug = {
  name: FAEHIGKEIT_WERKZEUG_NAME,
  // Genau eine Zeile: sie steht im stabilen Praefix und wird bei jedem Zug mitbezahlt (Spec 6.4).
  beschreibung:
    'Liest den vollen Text einer Faehigkeit aus der Liste oben. Rufe es, bevor du eine benutzt.',
  schema: () => ({
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
  }),
  async ausfuehren() {
    // Unerreichbar, solange `fuehreAus` abfaengt — und genau deshalb benannt statt still: wer das
    // Abfangen entfernt, bekommt eine Meldung, die sagt wo es fehlt, statt eines Laufs, in dem
    // das Werkzeug scheinbar nichts tut.
    return {
      ok: false,
      meldung:
        `'${FAEHIGKEIT_WERKZEUG_NAME}' wird in fuehreAus (lauf.ts) abgefangen und nicht ueber die ` +
        `Registry ausgefuehrt. Dass dieser Pfad lief, heisst: das Abfangen fehlt.`,
    }
  },
}

/**
 * Die Ablehnung fuer einen Namen, den es nicht gibt — als reine Funktion, damit `fuehreAus` sie
 * nur noch hinschreiben muss. Nennt die verfuegbaren Namen sortiert, weil eine Ablehnung ohne
 * Alternativen das Modell zum Raten zwingt.
 */
export function unbekannteFaehigkeitMeldung(gesucht: string, alle: readonly Faehigkeit[]): string {
  if (alle.length === 0) {
    return `Es gibt keine Faehigkeit '${gesucht}' — fuer diesen Lauf sind gar keine Faehigkeiten geladen.`
  }
  const namen = alle.map(f => f.name).sort().join(', ')
  return `Es gibt keine Faehigkeit '${gesucht}'. Verfuegbar sind: ${namen}.`
}
