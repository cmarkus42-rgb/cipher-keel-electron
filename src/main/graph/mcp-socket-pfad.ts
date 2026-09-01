/**
 * mcp-socket-pfad.ts — der Pfad, auf dem der MCP-Server lauscht, und die zwei Eigenheiten von
 * Unix-Sockets, die ihn von einem Port unterscheiden (Paket D).
 *
 * **Frisch je App-Start.** Der Name traegt acht Hexzeichen aus `randomUUID`. Das erhaelt genau
 * die Eigenschaft, fuer die vorher Port 0 gewaehlt wurde (siehe den Modulkopf von
 * mcp-http-server.ts): zwei App-Instanzen, oder ein Neustart ueber einem noch lebenden alten
 * Prozess, koennen nie auf demselben Ohr landen. Ein fester Pfad taete genau das.
 *
 * **Laengengrenze.** `sockaddr_un.sun_path` fasst auf macOS 104 Byte. Ein zu langer Pfad wird
 * beim `bind` **abgeschnitten**, nicht abgewiesen — der Server lauschte dann woanders, als der
 * Klient sucht, und niemand saehe einen Fehler. Genau die Sorte stiller Fehlschlag, vor der die
 * Paket-C-Strecke gewarnt hat, deshalb wird hier laut geworfen. Gemessen am 2026-08-31:
 * `/Users/cipher/Library/Application Support/cipher-keel` sind 53 Zeichen, mit dem Namen also
 * 71 — Luft, aber kein Naturgesetz; ein laengerer Kurzname kommt naeher heran, und die Grenze
 * gehoert deshalb in den Code und nicht in eine Fussnote.
 *
 * **Leichen.** Ein Absturz laesst die Socketdatei liegen. `listen` scheitert dann mit
 * `EADDRINUSE` auf einer Datei, hinter der niemand mehr lauscht — ein Fehlerbild, das nach
 * "eine zweite Instanz laeuft" aussieht und keine ist.
 */

import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

/** macOS `sockaddr_un.sun_path`. Linux hat 108; die kleinere Zahl ist die sichere. */
export const SUN_PATH_MAX = 104

/**
 * Bildet einen frischen Socketpfad unter `userDataPfad`. Wirft, statt einen Pfad
 * zurueckzugeben, den der Kernel stillschweigend abschneiden wuerde.
 */
export function sockelPfad(userDataPfad: string): string {
  const name = `mcp-${randomUUID().replace(/-/g, '').slice(0, 8)}.sock`
  const voll = path.join(userDataPfad, name)
  const laenge = Buffer.byteLength(voll, 'utf8')
  if (laenge >= SUN_PATH_MAX) {
    throw new Error(
      `[mcp-socket-pfad] Der Socketpfad ist ${laenge} Byte lang und erreicht damit die ` +
      `sun_path-Grenze von ${SUN_PATH_MAX}. Ein laengerer Pfad wird beim bind abgeschnitten, ` +
      `nicht abgewiesen — deshalb hier ein Fehler statt eines Servers am falschen Ohr: ${voll}`,
    )
  }
  return voll
}

/**
 * Entfernt eine liegengebliebene Socketdatei vor dem `listen`.
 *
 * `ENOENT` ist der Normalfall und kein Fehler. **Jeder andere Fehler wird geworfen** — ein
 * blindes `return` waere hier die schlechtere Wahl: wer den Pfad nicht loeschen kann, kann ihn
 * gleich darauf auch nicht binden, und dann ist der laute Fehler an dieser Stelle der
 * genauere.
 */
export function entferneLeiche(pfad: string): void {
  try {
    fs.unlinkSync(pfad)
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return
    throw err
  }
}
