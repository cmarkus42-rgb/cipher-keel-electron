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
    // Vorgabe, damit jeder Aufrufer, der die Art nicht selbst setzt, weiter uebersetzt.
    // Wer nach Gruppen prueft, gibt sie ueber `extra` mit.
    art: 'tier',
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
  slot('tier:light'),
  slot('rolle:tagging', { wirkung: 'sofort' }),
  slot('sitzung:niveau-b'),
]

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
      <ModelleReiter ansicht={ansichtMit([slot('tier:light')])} schreibe={stumm} />,
    )
    expect(gruppenUeberschriften(html)).toEqual(['Harness', 'Tiers'])
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
    const html = renderToStaticMarkup(
      <ModelleReiter ansicht={eingeschraenkt} schreibe={stumm} />,
    )
    expect(html).toContain('SPERRGRUND-AUF-DER-SEITE')
    expect(html).toContain('WARNUNG-AUF-DER-SEITE')
    expect(html).toContain('HINWEIS-AUF-DER-SEITE')
    expect(html).toContain('UEBERSPRUNGEN-AUF-DER-SEITE')
  })
})
