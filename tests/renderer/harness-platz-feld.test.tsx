/**
 * Der Harness-Platz im Einstellungsfenster.
 *
 * Kein DOM: `renderToStaticMarkup` sagt, was auf der Seite steht, und fuer den Schreibweg wird
 * die Komponente als das aufgerufen, was sie ist — eine reine Funktion ohne Hooks, die einen
 * Elementbaum zurueckgibt. Der Baum wird durchsucht, das `onChange` des Auswahlfeldes
 * aufgerufen. Damit ist der Kanal wirklich geprueft und nicht bloss im Quelltext gesucht.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HarnessPlatzFeld } from '../../src/renderer/components/settings/HarnessPlatzFeld'
import { infoSchliessen, infoUmschalten } from '../../src/renderer/components/settings/InfoKnopf'
import type { HarnessPlatzAnsicht, Schreiber } from '../../src/shared/settings-types'

type Knoten = ReactElement<Record<string, unknown>>

function finde(k: ReactNode, pred: (el: Knoten) => boolean): Knoten | null {
  if (Array.isArray(k)) {
    for (const kind of k as ReactNode[]) {
      const treffer = finde(kind, pred)
      if (treffer) return treffer
    }
    return null
  }
  if (!isValidElement(k)) return null
  const el = k as Knoten
  if (pred(el)) return el
  return finde(el.props.children as ReactNode, pred)
}

const PLATZ: HarnessPlatzAnsicht = {
  id: 'harness:sitzung',
  beschriftung: 'Harness — womit eine Sitzung läuft',
  gewaehlt: '',
  rueckfallKurz: '— keine Wahl, es gilt die Laufzeit des Presets —',
  optionen: [
    { adapterId: 'claude-code', name: 'Claude Code', sperrgrund: null },
    { adapterId: 'kimi-code', name: 'Kimi CLI', sperrgrund: 'Das Werkzeug kimi fehlt im Pfad.' },
  ],
  gewaehltHinweis: null,
  // Die beiden Fassungen sind hier absichtlich bis auf kein Wort deckungsgleich: nur so kann
  // ein Test sagen, welche von beiden an welcher Stelle steht.
  rueckfallText: 'Der lange Satz, der in zwei Saetzen erklaert, was ohne Wahl gilt.',
  erklaertext: 'Die Wahl zwischen den fremden CLI-Harnessen.',
  wirkung: 'naechste-session',
}

/**
 * Was ein Mensch auf der Seite liest — Elementinhalte, keine Attribute.
 *
 * Der Sperrgrund steht zusaetzlich im `title` der gesperrten Option. Gegen das rohe Markup
 * geprueft, blieb der Waechter darunter gruen, als der sichtbare Sperrgrund-Block entfernt
 * wurde — er haette die vertagte Frage halb beantworten lassen, ohne es zu merken.
 */
function sichtbarerText(html: string): string {
  return html.replace(/<[^>]*>/g, '\n')
}

const stumm: Schreiber = async () => true

beforeEach(() => {
  infoSchliessen()
})

describe('Harness-Platz — was auf der Seite steht', () => {
  it('zeigt seine Optionen mit dem Anzeigenamen, nicht mit der Kennung', () => {
    const html = renderToStaticMarkup(<HarnessPlatzFeld platz={PLATZ} schreibe={stumm} />)
    expect(html).toContain('Claude Code')
    expect(html).toContain('Kimi CLI')
  })

  it('sperrt die Option, die einen Sperrgrund traegt — und nur die', () => {
    const html = renderToStaticMarkup(<HarnessPlatzFeld platz={PLATZ} schreibe={stumm} />)
    expect(html).toMatch(/<option[^>]*value="kimi-code"[^>]*disabled/)
    expect(html).not.toMatch(/<option[^>]*value="claude-code"[^>]*disabled/)
  })

  it('beschriftet den leeren Eintrag mit der kurzen Fassung, nicht mit dem langen Satz', () => {
    const html = renderToStaticMarkup(<HarnessPlatzFeld platz={PLATZ} schreibe={stumm} />)
    expect(html).toContain('— keine Wahl, es gilt die Laufzeit des Presets —')
    expect(html).not.toContain('Der lange Satz, der in zwei Saetzen erklaert')
    // Nicht die Formulierung der Modellplaetze: dort heisst es „keine Zuordnung", hier
    // entscheidet das Preset — das ist ein Ausgang, keine Leere.
    expect(html).not.toContain('keine Zuordnung')
  })

  it('haelt Erklaertext, langen Rueckfalltext und Wirkung hinter dem Info-Knopf zurueck', () => {
    const zu = renderToStaticMarkup(<HarnessPlatzFeld platz={PLATZ} schreibe={stumm} />)
    expect(zu).not.toContain('Die Wahl zwischen den fremden CLI-Harnessen.')
    expect(zu).not.toContain('Der lange Satz, der in zwei Saetzen erklaert')
    expect(zu).not.toContain('gilt ab der naechsten Session')
    infoUmschalten('harness:sitzung')
    const auf = renderToStaticMarkup(<HarnessPlatzFeld platz={PLATZ} schreibe={stumm} />)
    expect(auf).toContain('Die Wahl zwischen den fremden CLI-Harnessen.')
    expect(auf).toContain('Der lange Satz, der in zwei Saetzen erklaert')
    expect(auf).toContain('gilt ab der naechsten Session')
  })

  /*
   * Die vertagte Frage aus §4 des Entwurfs: ob auch Sperrgruende und Hinweise hinter das ⓘ
   * gehoeren. Sie ist nicht entschieden, sondern auf die Design-Session verschoben. Die
   * beiden folgenden Tests halten den heutigen Stand fest, damit dieser Bau ihn nicht
   * unbemerkt in die eine oder andere Richtung aufloest.
   */
  it('laesst den Sperrgrund unaufgefordert auf der Seite stehen', () => {
    const html = renderToStaticMarkup(<HarnessPlatzFeld platz={PLATZ} schreibe={stumm} />)
    expect(sichtbarerText(html)).toContain('Das Werkzeug kimi fehlt im Pfad.')
  })

  it('zaehlt den Tooltip der gesperrten Option nicht als sichtbaren Text', () => {
    // Prueft das Pruefwerkzeug: derselbe Satz steht im `title` der Option, und dort darf er
    // die Zusicherung darueber nicht erfuellen.
    const html = renderToStaticMarkup(<HarnessPlatzFeld platz={PLATZ} schreibe={stumm} />)
    expect(html).toContain('title="Das Werkzeug kimi fehlt im Pfad."')
    expect(sichtbarerText(html)).not.toContain('title=')
  })

  it('laesst den Hinweis zur klemmenden Wahl unaufgefordert auf der Seite stehen', () => {
    const klemmt: HarnessPlatzAnsicht = {
      ...PLATZ,
      gewaehlt: 'kimi-code',
      gewaehltHinweis: 'Dieser Harness ist auf diesem Rechner nicht startbar.',
    }
    const html = renderToStaticMarkup(<HarnessPlatzFeld platz={klemmt} schreibe={stumm} />)
    expect(sichtbarerText(html)).toContain('Dieser Harness ist auf diesem Rechner nicht startbar.')
  })
})

describe('Harness-Platz — der Schreibweg', () => {
  it('schreibt die Adapterkennung auf settings:harness-setzen', () => {
    const gesehen: unknown[][] = []
    const schreibe: Schreiber = async (kanal, ...args) => {
      gesehen.push([kanal, ...args])
      return true
    }
    const baum = HarnessPlatzFeld({ platz: PLATZ, schreibe })
    const auswahl = finde(baum, el => el.type === 'select')
    if (!auswahl) throw new Error('kein Auswahlfeld im Baum')
    const beiAenderung = auswahl.props.onChange as (e: unknown) => void
    beiAenderung({ target: { value: 'kimi-code' } })
    expect(gesehen).toEqual([['settings:harness-setzen', 'kimi-code']])
  })

  it('setzt mit dem leeren Eintrag zurueck', () => {
    const gesehen: unknown[][] = []
    const schreibe: Schreiber = async (kanal, ...args) => {
      gesehen.push([kanal, ...args])
      return true
    }
    const baum = HarnessPlatzFeld({ platz: PLATZ, schreibe })
    const auswahl = finde(baum, el => el.type === 'select')
    if (!auswahl) throw new Error('kein Auswahlfeld im Baum')
    const beiAenderung = auswahl.props.onChange as (e: unknown) => void
    beiAenderung({ target: { value: '' } })
    expect(gesehen).toEqual([['settings:harness-setzen', '']])
  })

  it('zeigt die getroffene Wahl im Auswahlfeld', () => {
    const baum = HarnessPlatzFeld({ platz: { ...PLATZ, gewaehlt: 'claude-code' }, schreibe: stumm })
    const auswahl = finde(baum, el => el.type === 'select')
    expect(auswahl?.props.value).toBe('claude-code')
  })
})
