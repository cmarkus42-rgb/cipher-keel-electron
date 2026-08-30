/**
 * werkzeug-schreiben — writing and deleting, in-process, never through a shell.
 *
 * Same layer as werkzeug-datei.ts and the same reason: these resolve their own path argument, so
 * pfadwache over that argument *is* the boundary. The sandbox is for the child process; it cannot
 * apply here, because the main process must be able to write where keel writes.
 *
 * pfadwache runs here as well, although tor.ts already asked it. That is deliberate: the tool
 * stays correct if a later caller invokes it without the gate, and the check hands back the
 * resolved path that the write needs anyway.
 *
 * Whole files, no search-and-replace. keel's own purpose decides this: the test track measures the
 * *cheap* tier, and a tool that demands exact string matching is one that weak models miss
 * systematically — then the track measures aim at the tool instead of ability at the workpiece.
 * The counter-argument is real and recorded in the spec (a 500-line file must be rewritten whole,
 * and a small output window tears): if the measurement shows it, an edit tool follows *with
 * evidence*, not on suspicion.
 */

import { closeSync, constants, mkdirSync, openSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import { pruefePfad } from './pfadwache'
import type { Werkzeug, WerkzeugErgebnis, WerkzeugKontext } from './werkzeuge'

function fehlendesFeld(feld: string): WerkzeugErgebnis {
  return { ok: false, meldung: `Das Feld '${feld}' fehlt in der Eingabe.` }
}

const dateiSchreiben: Werkzeug = {
  name: 'datei_schreiben',
  beschreibung: 'Schreibt eine Datei in der Projektwurzel — vollstaendig, bestehender Inhalt wird ersetzt.',
  schema: () => ({
    type: 'object',
    properties: {
      pfad: { type: 'string', description: 'Pfad zur Datei, relativ zur Wurzel' },
      inhalt: { type: 'string', description: 'Der vollstaendige neue Inhalt der Datei' },
    },
    required: ['pfad', 'inhalt'],
  }),
  async ausfuehren(eingabe, ktx) {
    const roh = eingabe.pfad
    if (typeof roh !== 'string' || roh === '') return fehlendesFeld('pfad')
    const inhalt = eingabe.inhalt
    if (typeof inhalt !== 'string') return fehlendesFeld('inhalt')

    const wache = pruefePfad(roh, ktx.wache)
    if (!wache.ok) return { ok: false, meldung: wache.grund }

    try {
      // Laeuft vor dem bewachten Oeffnen und hat kein Gegenstueck zu O_NOFOLLOW. Scheitert das
      // Oeffnen danach, bleiben die hier angelegten Verzeichnisse liegen: das Ergebnis ist
      // `ok: false`, die Verzeichnisse sind trotzdem da. Fuer einen von der Wache abgelehnten
      // Pfad passiert das nicht — der kehrt oben um, bevor diese Zeile laeuft.
      mkdirSync(dirname(wache.pfad), { recursive: true })
      // O_NOFOLLOW auf der letzten Komponente. Was es leistet und was nicht, genau benannt —
      // die erste Fassung dieses Kommentars war eine Ueberbehauptung und ein Review hat sie
      // auseinandergenommen:
      //
      // pfadwache loest Symlinks auf und gibt den **aufgeloesten** Pfad zurueck. Im Normalbetrieb
      // sieht `openSync` deshalb nie einen Symlink, und das Flag greift nicht — der Symlink-Test
      // dieser Datei ist aus genau diesem Grund gruen, nicht wegen O_NOFOLLOW. Das Flag greift in
      // einem Fall: die letzte Komponente wird zwischen Aufloesung und Oeffnen getauscht (TOCTOU).
      // **Kein Test dieser Strecke belegt ihn** — synchron und ohne Mocks ist er nicht
      // herstellbar. Tiefenverteidigung gegen ein echtes Rennen, keine gepruefte Zusage.
      //
      // Nicht gedeckt: dasselbe Rennen um ein *Zwischenverzeichnis* (siehe `mkdirSync` darueber).
      // Benanntes Restrisiko, nicht geschlossen.
      const fd = openSync(
        wache.pfad,
        constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
        0o644,
      )
      // `writeFileSync` ueber dem Deskriptor, nicht `writeSync`: letzteres ist ein duenner Aufsatz
      // auf write(2) und darf weniger schreiben als der Puffer haelt. Sein Rueckgabewert wurde
      // nicht geprueft, ein Teilschreibvorgang waere also als Erfolg durchgegangen.
      try { writeFileSync(fd, inhalt) } finally { closeSync(fd) }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err)
      return { ok: false, meldung: `Datei nicht schreibbar: ${relative(ktx.wache.wurzel, wache.pfad)} (${m})` }
    }

    return {
      ok: true, quelle: 'lokal',
      inhalt: [{ art: 'text', text: `Geschrieben: ${relative(ktx.wache.wurzel, wache.pfad)} (${inhalt.length} Zeichen)` }],
    }
  },
}

const dateiLoeschen: Werkzeug = {
  name: 'datei_loeschen',
  beschreibung: 'Loescht eine einzelne Datei in der Projektwurzel. Keine Verzeichnisse.',
  schema: () => ({
    type: 'object',
    properties: { pfad: { type: 'string', description: 'Pfad zur Datei, relativ zur Wurzel' } },
    required: ['pfad'],
  }),
  async ausfuehren(eingabe, ktx) {
    const roh = eingabe.pfad
    if (typeof roh !== 'string' || roh === '') return fehlendesFeld('pfad')

    const wache = pruefePfad(roh, ktx.wache)
    if (!wache.ok) return { ok: false, meldung: wache.grund }

    try {
      // No directories, not recursive. Whoever wants to clear a tree has the shell, and there the
      // kernel holds the line — a recursive delete as an in-process tool would have the same effect
      // without the same boundary.
      if (statSync(wache.pfad).isDirectory()) {
        return {
          ok: false,
          meldung: `'${relative(ktx.wache.wurzel, wache.pfad)}' ist ein Verzeichnis. Dieses Werkzeug loescht nur einzelne Dateien.`,
        }
      }
      unlinkSync(wache.pfad)
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err)
      return { ok: false, meldung: `Datei nicht loeschbar: ${relative(ktx.wache.wurzel, wache.pfad)} (${m})` }
    }

    return {
      ok: true, quelle: 'lokal',
      inhalt: [{ art: 'text', text: `Geloescht: ${relative(ktx.wache.wurzel, wache.pfad)}` }],
    }
  },
}

export const SCHREIB_WERKZEUGE: Werkzeug[] = [dateiSchreiben, dateiLoeschen]
