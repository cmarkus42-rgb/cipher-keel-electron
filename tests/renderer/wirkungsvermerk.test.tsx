/**
 * Der Wirkungsvermerk steht in **allen** Reitern hinter dem ⓘ — nicht nur im Modelle-Reiter.
 *
 * Die erste Fassung hatte ihn nur dort versteckt und in den drei anderen Reitern stehen
 * lassen. Derselbe Hinweis einmal offen und einmal verborgen ist keine Gestaltung, sondern ein
 * Ausrutscher; die Inkonsistenz war der Fehler, nicht die Richtung. Christians Anweisung lautete
 * „die hinweisetexte" hinter Info-Knoepfe — ohne Ausnahme.
 *
 * Kein DOM: `renderToStaticMarkup` laeuft in Node, ein offenes Popup wird ueber den
 * Modulzustand des Info-Knopfes aufgemacht.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { NetzReiter } from '../../src/renderer/components/settings/NetzReiter'
import { CliStartReiter } from '../../src/renderer/components/settings/CliStartReiter'
import { SprachausgabeReiter } from '../../src/renderer/components/settings/SprachausgabeReiter'
import { infoSchliessen, infoUmschalten } from '../../src/renderer/components/settings/InfoKnopf'
import type { SettingsAnsicht, Schreiber } from '../../src/shared/settings-types'

const stumm: Schreiber = async () => true

const ANSICHT: SettingsAnsicht = {
  eintraege: [],
  uebersprungen: [],
  slots: [],
  harnessPlatz: {
    id: 'harness:sitzung', beschriftung: 'Harness', gewaehlt: '', optionen: [],
    gewaehltHinweis: null, rueckfallText: '', rueckfallKurz: '', erklaertext: '',
    wirkung: 'naechste-session',
  },
  modellTiers: { light: '', standard: '', heavy: '' },
  rueckfallEndpunkte: {
    tagging: { kind: 'ollama', host: '', port: 0, baseUrl: '', keyRef: '', model: '' },
    worker: { kind: 'ollama', host: '', port: 0, baseUrl: '', keyRef: '', model: '' },
  },
  adapter: [{
    id: 'claude-code', name: 'Claude Code', startArgs: '',
    appGesteuerteParameter: [], warnungen: [],
  }],
  sprachausgabe: { aktiv: false, stimme: '' },
  netz: {
    bevorzugt: '', searxngEndpunkt: '', zusaetzlichePositivliste: [],
    vorgabePositivliste: [],
    tavily: { status: 'fehlt', hinweis: '' },
    brave: { status: 'fehlt', hinweis: '' },
  },
}

beforeEach(() => {
  infoSchliessen()
})

const REITER = [
  {
    name: 'Netz',
    element: <NetzReiter ansicht={ANSICHT} schreibe={stumm} />,
    knopfId: 'netz:bevorzugt',
    satz: 'gilt ab dem naechsten Harness-Lauf',
  },
  {
    name: 'CLI-Start',
    element: <CliStartReiter ansicht={ANSICHT} schreibe={stumm} />,
    knopfId: 'cli:claude-code',
    satz: 'gilt ab der naechsten Session',
  },
  {
    name: 'Sprachausgabe',
    element: <SprachausgabeReiter ansicht={ANSICHT} schreibe={stumm} />,
    knopfId: 'sprachausgabe:aktiv',
    satz: 'braucht einen Neustart der App',
  },
]

describe('Wirkungsvermerk — hinter dem ⓘ, in jedem Reiter', () => {
  for (const r of REITER) {
    /*
     * Beide Haelften in einem Test, absichtlich. Getrennt waere die zweite („erscheint beim
     * Klick") gegen den heutigen, immer sichtbaren Vermerk gruen, ohne etwas zu treffen —
     * gruen aus dem falschen Grund. Zusammen sagt der Test, was gemeint ist: der Satz haengt
     * am Knopf.
     */
    it(`Reiter ${r.name}: der Vermerk haengt am Knopf statt auf der Seite zu stehen`, () => {
      expect(renderToStaticMarkup(r.element)).not.toContain(r.satz)
      infoUmschalten(r.knopfId)
      expect(renderToStaticMarkup(r.element)).toContain(r.satz)
    })
  }
})

describe('Wirkungsvermerk — die Ausnahmslosigkeit als Sachverhalt', () => {
  const verzeichnis = join(__dirname, '../../src/renderer/components/settings')

  it('kein Reiter rendert einen sichtbaren Vermerk mehr', () => {
    // Struktur statt Absprache: die Komponente `WirkungVermerk` gibt es nicht mehr, nur noch
    // `wirkungText`. Damit kann kein Reiter versehentlich zum sichtbaren Vermerk
    // zurueckkehren — es gaebe nichts zu rendern.
    const treffer = readdirSync(verzeichnis)
      .filter(f => f.endsWith('.tsx'))
      .filter(f => readFileSync(join(verzeichnis, f), 'utf8').includes('<WirkungVermerk'))
    expect(treffer).toEqual([])
  })

  it('ein Knopf in einer Beschriftungszeile sitzt nicht in deren label', () => {
    // Der barrierefreie Name eines Kontrollkaestchens wird aus dem Inhalt seines `label`
    // berechnet. Ein Knopf darin steuerte sein eigenes `aria-label` bei, und das Kaestchen
    // hiesse „Sprachausgabe aktiv Erläuterung zu Sprachausgabe aktiv".
    //
    // Nicht der Grund, obwohl er naheliegt: dass der Klick das Kaestchen umschaltete. Die
    // Aktivierung eines `label` laesst interaktive Nachkommen aus, ein `button` ist einer.
    const quelle = readFileSync(join(verzeichnis, 'SprachausgabeReiter.tsx'), 'utf8')
    expect(quelle).toContain('InfoKnopf')
    const label = quelle.slice(quelle.indexOf('<label'), quelle.indexOf('</label>'))
    expect(label).not.toContain('InfoKnopf')
  })
})
