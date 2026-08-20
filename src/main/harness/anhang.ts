/**
 * anhang — die Typgrenze fuer Anhaenge, und die einzige Stelle, an der sie gezogen wird.
 *
 * Vorher stand die Zuordnung in `lauf.ts` und endete auf
 *
 *   const medientyp = TYPEN[extname(pfad).toLowerCase()] ?? 'application/octet-stream'
 *
 * — geraten und trotzdem verschickt. Das traf `.docx` und `.xlsx`, aber auch `.txt`, `.md`,
 * `.csv` und `.json`, also die gewoehnlichsten Anhaenge ueberhaupt: sie gingen als
 * `application/octet-stream` an einen Anbieter, der als Dokument nur PDF und Text nimmt, und
 * kamen als HTTP 400 zurueck. Drei Zeilen daneben lehnt `auftrag-unvereinbar` einen Bildblock
 * fuer ein Modell ohne Bildfaehigkeit benannt ab — hier wurde geraten.
 *
 * Es gibt drei Ausgaenge und keinen vierten: getragen, als Text getragen, benannt abgelehnt.
 * Der abgelehnte Fall wirft, bevor `run.started` geschrieben ist — es entsteht also kein Lauf,
 * der scheitern muesste, sondern der Start scheitert mit einer Meldung, die die Datei nennt.
 *
 * Was hier bewusst *nicht* passiert, ist Umwandeln. `.docx` liesse sich mit `textutil` in Text
 * wandeln, aber eine `.xlsx` mit acht Blaettern als Textklumpen ist wertlos — dort will ein
 * Modell fragen koennen, welche Blaetter es gibt und einen Bereich anfordern. Umwandlung und
 * Tabellen gehoeren deshalb in einen Entwurf zusammen, nicht in zwei. Bis dahin sagt die
 * Ablehnung, woran es liegt, statt es zu verschweigen.
 */

import { basename, extname } from 'node:path'
import type { Block } from './form'

/** Ein Anhang, den diese Ausbaustufe nicht tragen kann. Benannt, nie geraten. */
export class AnhangNichtTragbar extends Error {
  constructor(meldung: string) {
    super(meldung)
    this.name = 'AnhangNichtTragbar'
  }
}

const BILDER: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp',
}

/** Formate, die schon Text sind und darum keine Umwandlung brauchen. */
const TEXT = new Set([
  '.txt', '.md', '.markdown', '.csv', '.json', '.xml', '.yaml', '.yml', '.log',
])

/**
 * Endungen, bei denen die Ablehnung den Grund nennen kann statt nur „unbekannt". Das ist kein
 * Komfort: „ich weiss, was das ist, und trage es noch nicht" ist eine andere Auskunft als „ich
 * kenne das nicht", und nur die erste sagt dem Nutzer, dass Warten hilft.
 */
const BEKANNT_UNGETRAGEN: Record<string, string> = {
  '.docx': 'Textdokument', '.doc': 'Textdokument', '.odt': 'Textdokument',
  '.rtf': 'Textdokument', '.pages': 'Textdokument',
  '.xlsx': 'Tabelle', '.xls': 'Tabelle', '.ods': 'Tabelle', '.numbers': 'Tabelle',
  '.pptx': 'Praesentation', '.ppt': 'Praesentation', '.odp': 'Praesentation',
  '.key': 'Praesentation',
}

/**
 * Macht aus einem Pfad und seinen base64-Daten den kanonischen Block — oder wirft.
 * Das Lesen der Datei bleibt draussen: so ist diese Grenze ohne Dateisystem pruefbar.
 */
export function anhangBlock(pfad: string, daten: string): Block {
  // Ueber den Basisnamen, nicht ueber den ganzen Pfad: ein Verzeichnis wie `v1.2/` darf die
  // Endung einer Datei nicht bestimmen.
  const endung = extname(basename(pfad)).toLowerCase()
  const name = basename(pfad)

  const bild = BILDER[endung]
  if (bild) return { art: 'bild', medientyp: bild, daten }
  if (endung === '.pdf') return { art: 'dokument', medientyp: 'application/pdf', name, daten }
  if (TEXT.has(endung)) return { art: 'dokument', medientyp: 'text/plain', name, daten }

  const art = BEKANNT_UNGETRAGEN[endung]
  if (art) {
    const grund = art === 'Textdokument'
      ? 'Die Umwandlung in Text ist noch nicht gebaut.'
      : `${art}en werden noch nicht getragen — als Textklumpen waeren sie wertlos, dafuer braucht es ein eigenes Werkzeug.`
    throw new AnhangNichtTragbar(
      `Der Anhang '${name}' ist ein ${art} (${endung}). ${grund} ` +
      `Getragen werden Bilder (${Object.keys(BILDER).join(', ')}), PDF und Textformate ` +
      `(${[...TEXT].join(', ')}).`,
    )
  }

  throw new AnhangNichtTragbar(
    `Der Anhang '${name}' hat ${endung === '' ? 'keine Endung' : `die unbekannte Endung '${endung}'`} ` +
    `und wird nicht verschickt. Getragen werden Bilder (${Object.keys(BILDER).join(', ')}), PDF ` +
    `und Textformate (${[...TEXT].join(', ')}).`,
  )
}
