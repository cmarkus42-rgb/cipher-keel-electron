/**
 * Was ein Anhang werden darf, und was benannt abgelehnt wird.
 *
 * Vorher stand hier eine Zuordnung mit fuenf Bildformaten und PDF, und alles andere wurde zu
 * `application/octet-stream` **geraten und trotzdem verschickt**. Das traf nicht nur `.docx` und
 * `.xlsx`, sondern auch `.txt`, `.md`, `.csv`, `.json` — die gewoehnlichsten Anhaenge ueberhaupt.
 * Drei Zeilen daneben lehnt `auftrag-unvereinbar` einen Bildblock fuer ein Modell ohne
 * Bildfaehigkeit benannt ab; hier wurde geraten. Derselbe Fehlermodus, gegen den die ganze
 * Strecke gebaut ist.
 *
 * Drei Ausgaenge, mehr nicht: getragen, als Text getragen, benannt abgelehnt.
 */

import { describe, it, expect } from 'vitest'
import { anhangBlock, AnhangNichtTragbar } from '../../src/main/harness/anhang'

const DATEN = 'QUFB'

describe('anhangBlock — die Typgrenze fuer Anhaenge', () => {
  it('traegt Bildformate als Bildblock mit dem richtigen Medientyp', () => {
    expect(anhangBlock('/p/schirm.png', DATEN)).toEqual({ art: 'bild', medientyp: 'image/png', daten: DATEN })
    expect(anhangBlock('/p/foto.JPG', DATEN)).toMatchObject({ art: 'bild', medientyp: 'image/jpeg' })
    expect(anhangBlock('/p/a.jpeg', DATEN)).toMatchObject({ medientyp: 'image/jpeg' })
    expect(anhangBlock('/p/a.gif', DATEN)).toMatchObject({ medientyp: 'image/gif' })
    expect(anhangBlock('/p/a.webp', DATEN)).toMatchObject({ medientyp: 'image/webp' })
  })

  it('traegt PDF als Dokumentblock und behaelt den Dateinamen', () => {
    expect(anhangBlock('/p/unter/bericht.pdf', DATEN)).toEqual({
      art: 'dokument', medientyp: 'application/pdf', name: 'bericht.pdf', daten: DATEN,
    })
  })

  it('traegt Textformate als text/plain — sie brauchen keine Umwandlung', () => {
    for (const pfad of ['/p/a.txt', '/p/a.md', '/p/a.markdown', '/p/a.csv', '/p/a.json',
                        '/p/a.xml', '/p/a.yaml', '/p/a.yml', '/p/a.log']) {
      expect(anhangBlock(pfad, DATEN)).toMatchObject({ art: 'dokument', medientyp: 'text/plain' })
    }
  })

  it('lehnt eine unbekannte Endung benannt ab, statt sie zu raten', () => {
    let gefangen: unknown = null
    try { anhangBlock('/p/irgendwas.zip', DATEN) } catch (e) { gefangen = e }
    expect(gefangen).toBeInstanceOf(AnhangNichtTragbar)
    const meldung = (gefangen as Error).message
    expect(meldung).toContain('irgendwas.zip')
    expect(meldung).toContain('.zip')
    // Und niemals der geratene Typ, der frueher stillschweigend rausging.
    expect(meldung).not.toContain('octet-stream')
  })

  it('lehnt eine Datei ohne Endung benannt ab', () => {
    expect(() => anhangBlock('/p/LIESMICH', DATEN)).toThrow(AnhangNichtTragbar)
  })

  /**
   * Der Unterschied, der dem Nutzer etwas nuetzt: bei einem Format, von dem wir *wissen*, dass es
   * verbreitet ist und noch nicht getragen wird, sagt die Ablehnung das — statt es wie einen
   * Zufallsfund zu behandeln.
   */
  it('nennt bei Textdokumenten den Grund: Umwandlung fehlt noch', () => {
    for (const pfad of ['/p/a.docx', '/p/a.doc', '/p/a.odt', '/p/a.rtf', '/p/a.pages']) {
      let gefangen: unknown = null
      try { anhangBlock(pfad, DATEN) } catch (e) { gefangen = e }
      expect(gefangen).toBeInstanceOf(AnhangNichtTragbar)
      expect((gefangen as Error).message).toContain('Umwandlung')
    }
  })

  it('nennt bei Tabellen und Praesentationen den Grund', () => {
    for (const pfad of ['/p/a.xlsx', '/p/a.xls', '/p/a.numbers', '/p/a.pptx', '/p/a.key']) {
      let gefangen: unknown = null
      try { anhangBlock(pfad, DATEN) } catch (e) { gefangen = e }
      expect(gefangen).toBeInstanceOf(AnhangNichtTragbar)
      expect((gefangen as Error).message).toMatch(/Tabelle|Praesentation/)
    }
  })

  it('unterscheidet Gross- und Kleinschreibung der Endung nicht', () => {
    expect(anhangBlock('/p/a.PDF', DATEN)).toMatchObject({ medientyp: 'application/pdf' })
    expect(anhangBlock('/p/a.MD', DATEN)).toMatchObject({ medientyp: 'text/plain' })
    expect(() => anhangBlock('/p/a.DOCX', DATEN)).toThrow(AnhangNichtTragbar)
  })

  it('laesst sich von einem Punkt im Verzeichnisnamen nicht taeuschen', () => {
    // extname() liest nur den Basisnamen — ein Verzeichnis wie /p/v1.2/ darf die Endung der Datei
    // nicht bestimmen. Sonst wuerde eine Datei ohne Endung als '.2' durchgehen.
    expect(() => anhangBlock('/p/v1.2/LIESMICH', DATEN)).toThrow(AnhangNichtTragbar)
    expect(anhangBlock('/p/v1.2/notiz.md', DATEN)).toMatchObject({ medientyp: 'text/plain' })
  })
})
