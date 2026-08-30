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

  it('traegt keinen eigenen Text ausser der Beschriftung, die er bekommen hat', () => {
    // Der Kopfkommentar von settings-window.tsx: „No rule lives here." Die Komponente darf
    // den Text nicht kennen, den sie zeigt — sie bekommt ihn.
    const quelle = readFileSync(
      join(__dirname, '../../src/renderer/components/settings/InfoKnopf.tsx'), 'utf8',
    )
    const rumpf = quelle.slice(quelle.indexOf('*/') + 2)
    expect(rumpf).not.toMatch(/Der erklärende Satz|Rueckfall|Sperrgrund/)
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

  it('faengt Zeigerereignisse im Knopf und im Popup ab, sonst schloesse der eigene Klick sofort', () => {
    expect(quelle).toContain('stopPropagation()')
  })
})
