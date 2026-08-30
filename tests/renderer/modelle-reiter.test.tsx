/**
 * Der Reiter „Modelle": die Einsortierung, und was hinter das ⓘ gewandert ist.
 *
 * Kein DOM — `renderToStaticMarkup` laeuft in Node. Was auf der Seite steht, ist damit direkt
 * pruefbar; ein offenes Popup wird ueber den Modulzustand des Info-Knopfes aufgemacht.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ModelleReiter } from '../../src/renderer/components/settings/ModelleReiter'
import { infoSchliessen, infoUmschalten } from '../../src/renderer/components/settings/InfoKnopf'
import type {
  SettingsAnsicht, SlotAnsicht, EintragAnsicht, Schreiber,
} from '../../src/shared/settings-types'

const stumm: Schreiber = async () => true

function slot(id: string, extra: Partial<SlotAnsicht> = {}): SlotAnsicht {
  return {
    id,
    beschriftung: `Platz ${id}`,
    // Vorgaben, damit jeder Aufrufer, der Art und Schluessel nicht selbst setzt, weiter
    // uebersetzt. Wer nach Gruppen oder nach dem Schluessel prueft, gibt sie ueber `extra` mit.
    art: 'tier',
    schluessel: 'light',
    gewaehlt: '',
    optionen: [],
    warnungen: [],
    gewaehltHinweis: null,
    rueckfallText: `RUECKFALL-${id}`,
    wirkung: 'naechste-session',
    ...extra,
  }
}

const EINTRAG: EintragAnsicht = {
  id: 'e1',
  name: 'Ein Eintrag',
  art: 'local-http',
  oertlichkeit: 'lokal',
  erklaertext: 'ERKLAERTEXT-DES-EINTRAGS',
  empfehlung: 'EMPFEHLUNG-DES-EINTRAGS',
  faehigkeitenHerkunft: null,
  keyRef: null,
  geheimnisStatus: null,
  geheimnisHinweis: null,
  loeschbar: true,
  faehigkeiten: undefined,
  erreichbarkeit: { art: 'local-http', host: '127.0.0.1', port: 11433, model: 'm' },
}

function endpunkt() {
  return {
    kind: 'ollama' as const, host: '127.0.0.1', port: 11433,
    baseUrl: '', keyRef: '', model: 'm',
  }
}

function ansichtMit(slots: SlotAnsicht[], extra: Partial<SettingsAnsicht> = {}): SettingsAnsicht {
  return {
    eintraege: [EINTRAG],
    uebersprungen: [],
    slots,
    harnessPlatz: {
      id: 'harness:sitzung',
      beschriftung: 'Harness — womit eine Sitzung läuft',
      gewaehlt: '',
      rueckfallKurz: '— keine Wahl, es gilt die Laufzeit des Presets —',
      optionen: [{ adapterId: 'claude-code', name: 'Claude Code', sperrgrund: null }],
      gewaehltHinweis: null,
      rueckfallText: 'RUECKFALL-HARNESS',
      erklaertext: 'ERKLAERTEXT-HARNESS',
      wirkung: 'naechste-session',
    },
    modellTiers: { light: '', standard: '', heavy: '' },
    rueckfallEndpunkte: { tagging: endpunkt(), worker: endpunkt() },
    adapter: [],
    sprachausgabe: { aktiv: false, stimme: '' },
    netz: {
      bevorzugt: '', searxngEndpunkt: '', zusaetzlichePositivliste: [],
      vorgabePositivliste: [],
      tavily: { status: 'fehlt', hinweis: '' },
      brave: { status: 'fehlt', hinweis: '' },
    },
    ...extra,
  }
}

const ALLE_ARTEN = [
  slot('tier:light', { art: 'tier' }),
  slot('rolle:tagging', { art: 'rolle', wirkung: 'sofort' }),
  slot('sitzung:niveau-b', { art: 'sitzung' }),
]

/**
 * Was ein Mensch auf der Seite liest — Elementinhalte, keine Attribute.
 *
 * Der Unterschied ist nicht kosmetisch. Der Sperrgrund steht zusaetzlich im `title` der
 * gesperrten Option, und `toContain` gegen das rohe Markup traf diesen Tooltip: der Waechter
 * der vertagten Frage blieb gruen, als der sichtbare Sperrgrund-Block ersatzlos entfernt wurde.
 * Genau diese Verschiebung schliesst der Kommentar in ModelleReiter.tsx aus — „the answer to
 * ‚why can I not pick that' belongs on screen, not in a tooltip" —, und ein Waechter, der sie
 * durchlaesst, beruhigt, statt zu wachen.
 */
function sichtbarerText(html: string): string {
  return html.replace(/<[^>]*>/g, '\n')
}

/** Die Ueberschriften der Zuordnungsgruppen, in der Reihenfolge, in der sie im Fenster stehen. */
function gruppenUeberschriften(html: string): string[] {
  const namen = ['Harness', 'Tiers', 'Sitzung', 'Rollen']
  return [...html.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)]
    .map(m => m[1])
    .filter(t => namen.includes(t))
}

beforeEach(() => {
  infoSchliessen()
})

describe('Modelle-Reiter — die Einsortierung', () => {
  it('gruppiert die Zuordnungen: Harness, Tiers, Sitzung, Rollen — in dieser Reihenfolge', () => {
    const html = renderToStaticMarkup(
      <ModelleReiter ansicht={ansichtMit(ALLE_ARTEN)} schreibe={stumm} />,
    )
    expect(gruppenUeberschriften(html)).toEqual(['Harness', 'Tiers', 'Sitzung', 'Rollen'])
  })

  it('setzt den Harness-Platz vor die Tiers — er entscheidet mit, ob sie ueberhaupt greifen', () => {
    const html = renderToStaticMarkup(
      <ModelleReiter ansicht={ansichtMit(ALLE_ARTEN)} schreibe={stumm} />,
    )
    expect(html).toContain('Harness — womit eine Sitzung läuft')
    expect(html.indexOf('Harness — womit eine Sitzung läuft'))
      .toBeLessThan(html.indexOf('Platz tier:light'))
  })

  it('gibt einer leeren Gruppe keine Ueberschrift', () => {
    const html = renderToStaticMarkup(
      <ModelleReiter ansicht={ansichtMit([slot('tier:light', { art: 'tier' })])} schreibe={stumm} />,
    )
    expect(gruppenUeberschriften(html)).toEqual(['Harness', 'Tiers'])
  })

  /*
   * Der eine Fall, an dem sich die beiden Wege unterscheiden: Id-Praefix und Art sagen
   * Verschiedenes. Nur so ist pruefbar, welchem von beiden die Gruppierung folgt — bei
   * uebereinstimmenden Werten waere jede Zusicherung darueber unbelegt. Die Art ist die
   * Aussage des Hauptprozesses, das Praefix eine Zeichenkette, die zufaellig danebensteht.
   */
  it('gruppiert ueber die Art, nicht ueber das Praefix der Id', () => {
    const html = renderToStaticMarkup(
      <ModelleReiter
        ansicht={ansichtMit([slot('rolle:tagging', { art: 'sitzung' })])}
        schreibe={stumm}
      />,
    )
    expect(gruppenUeberschriften(html)).toEqual(['Harness', 'Sitzung'])
  })

  /*
   * Die Gruppierung war nicht die einzige Stelle, die die Art aus dem Id-Praefix ablas. Zwei
   * weitere hingen daran: das Rueckfall-Handle der Tiers und das Endpunktformular der Rollen.
   * Auch sie fragen jetzt das Feld. Was am Praefix haengen bleibt, ist der *Schluessel*
   * (`light`, `tagging`) — der ist keine Art, und das Ansichtsmodell fuehrt ihn nicht.
   */
  it('haengt das Rueckfall-Handle an die Art, nicht an das Praefix der Id', () => {
    const html = renderToStaticMarkup(
      <ModelleReiter
        ansicht={ansichtMit([slot('tier:light', { art: 'rolle' })])}
        schreibe={stumm}
      />,
    )
    expect(html).not.toContain('Rueckfall-Handle')
  })

  it('haengt das Endpunktformular an die Art, nicht an das Praefix der Id', () => {
    const html = renderToStaticMarkup(
      <ModelleReiter
        ansicht={ansichtMit([slot('rolle:tagging', { art: 'sitzung' })])}
        schreibe={stumm}
      />,
    )
    expect(html).not.toContain('llm.tagging')
  })

  /*
   * Der Schluessel kommt aus dem Feld, nicht aus der Id. Wieder nur an einem Platz pruefbar,
   * dessen Id und Schluessel auseinandergehen — bei uebereinstimmenden Werten sagt der Test
   * nichts darueber aus, welchem von beiden das Fenster folgt.
   */
  it('nimmt das Rueckfall-Handle zum Schluessel des Platzes, nicht zum Id-Ausschnitt', () => {
    const html = renderToStaticMarkup(
      <ModelleReiter
        ansicht={ansichtMit(
          [slot('tier:light', { art: 'tier', schluessel: 'heavy' })],
          { modellTiers: { light: 'HANDLE-LIGHT', standard: 'HANDLE-STANDARD', heavy: 'HANDLE-HEAVY' } },
        )}
        schreibe={stumm}
      />,
    )
    expect(html).toContain('HANDLE-HEAVY')
    expect(html).not.toContain('HANDLE-LIGHT')
  })

  it('nimmt das Endpunktformular zum Schluessel des Platzes, nicht zum Id-Ausschnitt', () => {
    const html = renderToStaticMarkup(
      <ModelleReiter
        ansicht={ansichtMit([slot('rolle:tagging', { art: 'rolle', schluessel: 'worker' })])}
        schreibe={stumm}
      />,
    )
    expect(html).toContain('llm.worker')
    expect(html).not.toContain('llm.tagging')
  })

  it('laesst keinen Platz aus der Gruppierung fallen', () => {
    const html = renderToStaticMarkup(
      <ModelleReiter ansicht={ansichtMit(ALLE_ARTEN)} schreibe={stumm} />,
    )
    for (const s of ALLE_ARTEN) expect(html).toContain(s.beschriftung)
  })
})

describe('Modelle-Reiter — was hinter das ⓘ gewandert ist', () => {
  const ansicht = ansichtMit(ALLE_ARTEN)

  it('haelt den Rueckfalltext einer Zuordnung zurueck, bis der Knopf gedrueckt wird', () => {
    expect(renderToStaticMarkup(<ModelleReiter ansicht={ansicht} schreibe={stumm} />))
      .not.toContain('RUECKFALL-tier:light')
    infoUmschalten('tier:light')
    expect(renderToStaticMarkup(<ModelleReiter ansicht={ansicht} schreibe={stumm} />))
      .toContain('RUECKFALL-tier:light')
  })

  it('haelt den Wirkungsvermerk einer Zuordnung zurueck, bis der Knopf gedrueckt wird', () => {
    expect(renderToStaticMarkup(<ModelleReiter ansicht={ansicht} schreibe={stumm} />))
      .not.toContain('gilt ab der naechsten Session')
    infoUmschalten('tier:light')
    expect(renderToStaticMarkup(<ModelleReiter ansicht={ansicht} schreibe={stumm} />))
      .toContain('gilt ab der naechsten Session')
  })

  it('haelt Erklaertext und Empfehlung eines Eintrags zurueck, bis der Knopf gedrueckt wird', () => {
    const zu = renderToStaticMarkup(<ModelleReiter ansicht={ansicht} schreibe={stumm} />)
    expect(zu).not.toContain('ERKLAERTEXT-DES-EINTRAGS')
    expect(zu).not.toContain('EMPFEHLUNG-DES-EINTRAGS')
    infoUmschalten('eintrag:e1')
    const auf = renderToStaticMarkup(<ModelleReiter ansicht={ansicht} schreibe={stumm} />)
    expect(auf).toContain('ERKLAERTEXT-DES-EINTRAGS')
    expect(auf).toContain('EMPFEHLUNG-DES-EINTRAGS')
  })

  it('haelt den Erklaertext des Harness-Platzes zurueck, bis der Knopf gedrueckt wird', () => {
    expect(renderToStaticMarkup(<ModelleReiter ansicht={ansicht} schreibe={stumm} />))
      .not.toContain('ERKLAERTEXT-HARNESS')
    infoUmschalten('harness:sitzung')
    expect(renderToStaticMarkup(<ModelleReiter ansicht={ansicht} schreibe={stumm} />))
      .toContain('ERKLAERTEXT-HARNESS')
  })
})

/*
 * §4 des Entwurfs, der eingerueckte Korrekturblock: ob auch Sperrgruende und Warnungen hinter
 * das ⓘ gehoeren, ist **vertagt** und gehoert auf die Design-Session. Die folgenden Tests
 * halten den heutigen Stand fest — nicht, weil er richtig waere, sondern damit ein Bau ihn
 * nicht unbemerkt in die eine oder andere Richtung aufloest.
 */
describe('Modelle-Reiter — was ausdruecklich auf der Seite bleibt (vertagte Frage)', () => {
  const eingeschraenkt = ansichtMit([
    slot('tier:light', {
      optionen: [{ eintragId: 'e1', name: 'Ein Eintrag', sperrgrund: 'SPERRGRUND-AUF-DER-SEITE' }],
      warnungen: [{ code: 'w1', text: 'WARNUNG-AUF-DER-SEITE' }],
      gewaehlt: 'e1',
      gewaehltHinweis: 'HINWEIS-AUF-DER-SEITE',
    }),
  ], {
    uebersprungen: [{ beschreibung: 'UEBERSPRUNGEN-AUF-DER-SEITE', fehler: 'kaputt' }],
  })

  it('zeigt Sperrgrund, Warnung, Hinweis und uebersprungene Eintraege unaufgefordert', () => {
    const gelesen = sichtbarerText(renderToStaticMarkup(
      <ModelleReiter ansicht={eingeschraenkt} schreibe={stumm} />,
    ))
    expect(gelesen).toContain('SPERRGRUND-AUF-DER-SEITE')
    expect(gelesen).toContain('WARNUNG-AUF-DER-SEITE')
    expect(gelesen).toContain('HINWEIS-AUF-DER-SEITE')
    expect(gelesen).toContain('UEBERSPRUNGEN-AUF-DER-SEITE')
  })

  /*
   * Die Zusicherung darueber ist nur so viel wert, wie `sichtbarerText` den Tooltip wirklich
   * heraushaelt. Dieser Test prueft das Pruefwerkzeug: derselbe Satz steht im `title` der
   * gesperrten Option, und dort darf er nicht mitzaehlen.
   */
  it('zaehlt den Tooltip nicht als sichtbaren Text', () => {
    const html = renderToStaticMarkup(
      <ModelleReiter ansicht={eingeschraenkt} schreibe={stumm} />,
    )
    expect(html).toContain('title="SPERRGRUND-AUF-DER-SEITE"')
    expect(sichtbarerText(html)).not.toContain('title=')
  })
})
