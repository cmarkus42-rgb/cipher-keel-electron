/**
 * mcp-socket-pfad.test.ts — die zwei Eigenheiten, die einen Unix-Socket von einem Port
 * unterscheiden (Paket D).
 *
 * Falsifikation: beide Zusagen sind nachweisbar rot zu bekommen. Wer die Laengenpruefung
 * entfernt, faellt ueber den dritten Test; wer `randomUUID` gegen einen festen Namen tauscht,
 * ueber den zweiten. Der zweite ist der wichtigere von beiden: er haelt genau die Eigenschaft
 * fest, fuer die vorher Port 0 gewaehlt wurde — zwei App-Instanzen kollidieren nie.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { sockelPfad, entferneLeiche, SUN_PATH_MAX } from '../../src/main/graph/mcp-socket-pfad'

describe('sockelPfad', () => {
  it('legt den Socket unter userData ab und endet auf .sock', () => {
    const p = sockelPfad('/Users/x/Library/Application Support/keel')
    expect(p.startsWith('/Users/x/Library/Application Support/keel/mcp-')).toBe(true)
    expect(p.endsWith('.sock')).toBe(true)
  })

  it('vergibt bei jedem Aufruf einen anderen Namen — zwei Instanzen kollidieren nie', () => {
    const a = sockelPfad('/tmp/keel')
    const b = sockelPfad('/tmp/keel')
    expect(a).not.toBe(b)
  })

  it('scheitert laut statt einen abgeschnittenen Pfad zu binden', () => {
    const zuLang = '/tmp/' + 'x'.repeat(SUN_PATH_MAX)
    expect(() => sockelPfad(zuLang)).toThrow(/sun_path/)
  })

  it('laesst einen Pfad knapp unter der Grenze durch', () => {
    // Der Name haengt mit 18 Zeichen dran: `/mcp-` (5) + 8 Hex + `.sock` (5).
    const basis = '/tmp/' + 'x'.repeat(SUN_PATH_MAX - 18 - '/tmp/'.length - 1)
    expect(() => sockelPfad(basis)).not.toThrow()
  })
})

describe('entferneLeiche', () => {
  it('entfernt eine vorhandene Datei', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-sock-'))
    const p = path.join(d, 'alt.sock')
    fs.writeFileSync(p, '')
    entferneLeiche(p)
    expect(fs.existsSync(p)).toBe(false)
  })

  it('schweigt, wenn nichts da ist', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-sock-'))
    expect(() => entferneLeiche(path.join(d, 'gibt-es-nicht.sock'))).not.toThrow()
  })

  it('wirft bei jedem anderen Fehler, statt ihn zu verschlucken', () => {
    // Ein Verzeichnis ist kein Socket; `unlinkSync` scheitert mit EPERM/EISDIR. Wer den
    // catch-Block auf ein blindes `return` erweitert, faellt hier durch.
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-sock-'))
    expect(() => entferneLeiche(d)).toThrow()
  })
})
