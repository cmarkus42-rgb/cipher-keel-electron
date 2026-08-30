/**
 * Der Info-Knopf: oeffnen, schliessen, und die Zusage „hoechstens einer offen".
 *
 * Dieses Repo hat weder jsdom noch @testing-library/react, vitest.config.ts steht auf
 * environment: 'node' (siehe den Kopf von harness-cell.test.ts). Deshalb dieselbe Aufteilung
 * wie dort, nur eine Stufe weiter:
 *
 * - der Zustand („welcher Knopf ist offen") liegt in reinen Modulfunktionen und wird direkt
 *   geprueft,
 * - die beiden Schliesswege haengen an einem uebergebenen `EventTarget`, also kann der Test
 *   ein eigenes aufspannen statt ein `document` zu brauchen,
 * - was am Ende im Fenster steht, kommt aus `renderToStaticMarkup` — das laeuft in Node,
 *   ohne DOM und ohne neue Abhaengigkeit.
 *
 * Was so nicht erreichbar bleibt: dass das Fenster den Schliesser wirklich an `document`
 * haengt und Zeigerereignisse im Popup abfaengt. Dafuer steht unten eine Textwache, dieselbe
 * Konstruktion wie bei den Kanalwachen des Hauptprozesses.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  InfoKnopf, infoOffen, infoUmschalten, infoSchliessen, installiereInfoSchliesser,
} from '../../src/renderer/components/settings/InfoKnopf'

function taste(name: string): Event {
  return Object.assign(new Event('keydown'), { key: name })
}

beforeEach(() => {
  infoSchliessen()
})

describe('Info-Knopf — welcher offen ist', () => {
  it('oeffnet auf Klick', () => {
    infoUmschalten('a')
    expect(infoOffen()).toBe('a')
  })

  it('schliesst wieder, wenn derselbe Knopf noch einmal gedrueckt wird', () => {
    infoUmschalten('a')
    expect(infoOffen()).toBe('a')
    infoUmschalten('a')
    expect(infoOffen()).toBeNull()
  })

  it('ein zweiter Knopf schliesst das erste Popup — nie sind zwei gleichzeitig offen', () => {
    infoUmschalten('a')
    expect(infoOffen()).toBe('a')
    infoUmschalten('b')
    expect(infoOffen()).toBe('b')
  })
})

/*
 * Die drei Tests darueber pruefen den Zustand. Der ist nur die halbe Zusage: welcher Knopf
 * offen *ist*, sagt noch nicht, welche Popups gerendert *werden*. Ein Bau, der statt
 * `aktuell === id` nur `aktuell !== null` fragt, laesst den Zustand unberuehrt und klappt
 * trotzdem alle Popups auf, sobald irgendeines offen ist — und er kam durch alle 2944 Tests.
 * Deshalb dieselbe Zusage noch einmal am gerenderten Ergebnis.
 */
describe('Info-Knopf — hoechstens einer offen, bis ins Markup', () => {
  const zwei = (
    <>
      <InfoKnopf id="a" beschriftung="Erster" text="TEXT-A" />
      <InfoKnopf id="b" beschriftung="Zweiter" text="TEXT-B" />
    </>
  )

  /** Wie viele Popups wirklich im Markup stehen — Popups tragen `id`, Knoepfe `aria-controls`. */
  function popups(html: string): number {
    return [...html.matchAll(/id="info-popup-/g)].length
  }

  it('rendert kein Popup, solange keiner offen ist', () => {
    const html = renderToStaticMarkup(zwei)
    expect(popups(html)).toBe(0)
    expect(html).not.toContain('TEXT-A')
    expect(html).not.toContain('TEXT-B')
  })

  it('rendert genau ein Popup, wenn einer offen ist — nicht beide', () => {
    infoUmschalten('a')
    const html = renderToStaticMarkup(zwei)
    expect(popups(html)).toBe(1)
    expect([...html.matchAll(/aria-expanded="true"/g)]).toHaveLength(1)
    expect(html).toContain('TEXT-A')
    expect(html).not.toContain('TEXT-B')
  })

  it('reicht das offene Popup weiter, wenn der zweite Knopf gedrueckt wird', () => {
    infoUmschalten('a')
    infoUmschalten('b')
    const html = renderToStaticMarkup(zwei)
    expect(popups(html)).toBe(1)
    expect(html).toContain('TEXT-B')
    expect(html).not.toContain('TEXT-A')
  })
})

describe('Info-Knopf — die beiden Schliesswege', () => {
  it('schliesst beim Klick daneben', () => {
    const ziel = new EventTarget()
    const loesen = installiereInfoSchliesser(ziel)
    infoUmschalten('a')
    expect(infoOffen()).toBe('a')
    ziel.dispatchEvent(new Event('pointerdown'))
    expect(infoOffen()).toBeNull()
    loesen()
  })

  it('schliesst mit Escape', () => {
    const ziel = new EventTarget()
    const loesen = installiereInfoSchliesser(ziel)
    infoUmschalten('a')
    expect(infoOffen()).toBe('a')
    ziel.dispatchEvent(taste('Escape'))
    expect(infoOffen()).toBeNull()
    loesen()
  })

  it('laesst eine andere Taste das Popup in Ruhe', () => {
    const ziel = new EventTarget()
    const loesen = installiereInfoSchliesser(ziel)
    infoUmschalten('a')
    ziel.dispatchEvent(taste('a'))
    expect(infoOffen()).toBe('a')
    loesen()
  })

  it('haengt sich wieder ab, wenn das Popup zu ist', () => {
    const ziel = new EventTarget()
    const loesen = installiereInfoSchliesser(ziel)
    loesen()
    infoUmschalten('a')
    ziel.dispatchEvent(taste('Escape'))
    expect(infoOffen()).toBe('a')
  })
})

describe('Info-Knopf — was im Fenster steht', () => {
  const knopf = <InfoKnopf id="a" beschriftung="Harness" text="Der erklärende Satz." />

  it('zeigt den Text erst, wenn der Knopf offen ist', () => {
    expect(renderToStaticMarkup(knopf)).not.toContain('Der erklärende Satz.')
    infoUmschalten('a')
    expect(renderToStaticMarkup(knopf)).toContain('Der erklärende Satz.')
  })

  it('zeigt genau den Text, den sie bekommen hat — und keinen eigenen dazu', () => {
    /*
     * Der Kopfkommentar von settings-window.tsx: „No rule lives here." Die Komponente darf den
     * Text nicht kennen, den sie zeigt — sie bekommt ihn.
     *
     * Vorher stand hier eine Textwache auf drei ausgesuchte Woerter im Quelltext. Die war zu
     * billig: ein hartkodierter *anderer* Satz waere durchgekommen, und genau der ist der Fall,
     * den es zu verhindern gilt. Gleichheit statt Stichprobe — jeder eigene Zusatz, gleich
     * welcher, bricht sie.
     */
    for (const satz of ['Der erklärende Satz.', 'Ein voellig anderer Satz, Wort fuer Wort.']) {
      infoUmschalten('a')
      const gelesen = renderToStaticMarkup(
        <InfoKnopf id="a" beschriftung="Harness" text={satz} />,
      ).replace(/<[^>]*>/g, '').replace('ⓘ', '').trim()
      expect(gelesen).toBe(satz)
      infoSchliessen()
    }
  })

  it('ist mit der Tastatur erreichbar und sagt der Vorlesehilfe an, wozu er gehoert', () => {
    const zu = renderToStaticMarkup(knopf)
    expect(zu).toContain('<button')
    expect(zu).toContain('aria-label="Erläuterung zu Harness"')
    expect(zu).toContain('aria-expanded="false"')
  })

  it('verknuepft das offene Popup mit seinem Knopf', () => {
    infoUmschalten('a')
    const auf = renderToStaticMarkup(knopf)
    const controls = /aria-controls="([^"]+)"/.exec(auf)
    expect(controls).not.toBeNull()
    expect(auf).toContain('aria-expanded="true"')
    expect(auf).toContain(`id="${controls?.[1]}"`)
  })
})

describe('Info-Knopf — die Verdrahtung, die kein Test in Node erreicht', () => {
  const quelle = readFileSync(
    join(__dirname, '../../src/renderer/components/settings/InfoKnopf.tsx'), 'utf8',
  )

  it('haengt den Schliesser an das Dokument, solange ein Popup offen ist', () => {
    expect(quelle).toContain('installiereInfoSchliesser(document)')
  })

  it('faengt Zeigerereignisse an der Huelle ab, die Knopf und Popup umschliesst', () => {
    /*
     * Vorher: `toContain('stopPropagation()')` — erfuellt von jedem beliebigen
     * `stopPropagation` irgendwo in der Datei, ohne Aussage darueber, *wo* es steht. Das ist
     * hier die ganze Frage: sitzt der Riegel an der Huelle, gilt er fuer Knopf und Popup
     * zugleich; sitzt er am Knopf allein, schliesst der Klick ins offene Popup es wieder.
     *
     * Bleibt eine Quelltextwache, weil Reacts synthetische Ereignisse ohne DOM nicht laufen —
     * das Verhalten selbst ist am laufenden Programm nachgefahren (Bericht §5, §7.7).
     */
    const jsx = quelle.slice(quelle.indexOf('return ('))
    const huelleAuf = jsx.indexOf('<span')
    // Bis zum Zeilenende, nicht bis zum ersten `>`: das erste `>` gehoert zum Pfeil in
    // `e => e.stopPropagation()`. Der oeffnende Tag steht auf einer Zeile.
    const huelle = jsx.slice(huelleAuf, jsx.indexOf('\n', huelleAuf))
    expect(huelle).toContain('onPointerDown={e => e.stopPropagation()}')
    // Und die Huelle ist wirklich die aeussere: Knopf und Popup stehen darin.
    expect(jsx.indexOf('<button')).toBeGreaterThan(huelleAuf)
    expect(jsx.indexOf('id={popupId}')).toBeGreaterThan(huelleAuf)
  })
})
