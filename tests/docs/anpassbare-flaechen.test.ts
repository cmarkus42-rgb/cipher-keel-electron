import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const INVENTORY = readFileSync(
  join(__dirname, '../../docs/anpassbare-flaechen.md'), 'utf8'
)

/** Das Formular, auf das die Inventarzeile zeigt — der Wegweiser muss auf echten Text zeigen. */
const FORMULAR = readFileSync(
  join(__dirname, '../../src/renderer/components/settings/EintragFormular.tsx'), 'utf8'
)

// CK-NFR-012: a new adjustable surface without an inventory entry is an audit finding.
// Binding the test to the config keys is what keeps this from being a document that
// quietly falls behind the code.
const CONFIG_PATHS = [
  'agent.startArgs',
  'agent.modelTiers',
  // Der Harness-Platz (2026-08-30). Bis dahin war die Harness-Wahl die im Inventar benannte
  // offene Stelle: kimi-code war gebaut, aber ueber keine Flaeche erreichbar.
  'agent.harness',
  'voice.enabled',
  'voice.piperVoice',
  'llm.tagging',
  'llm.worker',
  'modelle.eintraege',
  'modelle.zuordnung',
  // Der Netzzugang der Harness-Werkzeuge. Die Schluessel selbst stehen nicht im ConfigStore,
  // sondern im Schluesselbund — deshalb stehen sie hier nicht, aber im Inventar sehr wohl.
  'netz.searxngEndpunkt',
  'netz.bevorzugt',
  'netz.zusaetzlichePositivliste',
]

describe('CK-NFR-012 — the adjustable-surface inventory', () => {
  for (const path of CONFIG_PATHS) {
    it(`lists ${path}`, () => {
      expect(INVENTORY).toContain(path)
    })
  }

  it('lists the prompt layers', () => {
    for (const layer of ['Body', 'Persona', 'GlobalRules', 'SKILL.md']) {
      expect(INVENTORY).toContain(layer)
    }
  })

  it('marks every entry as either editable or explicitly not yet editable', () => {
    const rows = INVENTORY.split('\n').filter(l => l.startsWith('| `'))
    expect(rows.length).toBeGreaterThan(10)
    for (const row of rows) {
      expect(row, `row without an editability verdict: ${row}`)
        .toMatch(/ja|nein/)
    }
  })

  it('documents the sampler block on the capability row', () => {
    // Ollamas /v1 forces temperature and top_p to 1.0 when the client omits them, so this is
    // an adjustable surface with teeth: leaving it out does not mean "server default", it
    // means 1.0. CK-NFR-012 wants it named.
    expect(INVENTORY).toContain('faehigkeiten.sampler')
    expect(INVENTORY).toContain('presencePenalty')
    expect(INVENTORY).toContain('reasoningEffort')
  })

  // Runde 2, Fund 1: die Zeile sagte pauschal „die der Codec je Anfrage mitschickt". Gelesen
  // wird `f.sampler` aber nur von `openAiChatCodec.toWire`; `anthropicCodec.toWire` fasst den
  // Block nie an. Ein Inventar, das eine Flaeche weiter verspricht, als sie reicht, ist genau
  // die Attrappe, die CK-NFR-012 verbietet.
  it('nennt am sampler-Eintrag den einen Codec, der ihn wirklich mitschickt', () => {
    const zeile = INVENTORY.split('\n').find(l => l.includes('`modelle.eintraege[].faehigkeiten.sampler`'))
    expect(zeile).toBeDefined()
    expect(zeile).toContain('openai-chat')
  })

  // Runde 2, Fund 5: der Wegweiser nannte einen „Abschnitt „Sampler"", den es im Formular
  // nicht gibt — die Flaeche haengt an einem Kontrollkaestchen und ist unsichtbar, solange es
  // aus ist. In einer Tabelle, deren einziger Zweck das Auffinden ist, ist das der Fehler,
  // der zaehlt.
  it('weist den Weg auf eine Beschriftung, die im Formular wirklich steht', () => {
    const zeile = INVENTORY.split('\n').find(l => l.includes('`modelle.eintraege[].faehigkeiten.sampler`'))
    expect(zeile).toContain('Sampler selbst setzen')
    expect(FORMULAR).toContain('Sampler selbst setzen')
    expect(zeile).not.toContain('Abschnitt „Sampler"')
  })

  it('names top_k, min_p and repeat_penalty as a surface outside the app', () => {
    // The honest half of the same entry: these three exist, they matter, and no field in
    // this app can reach them -- Ollamas /v1 discards them. They live in the Modelfile on
    // the server. A slider for them would be a prop, which is the pattern CK-NFR-012 fights.
    expect(INVENTORY).toContain('top_k')
    expect(INVENTORY).toContain('min_p')
    expect(INVENTORY).toContain('repeat_penalty')
    expect(INVENTORY).toContain('Modelfile')
  })

  // Runde 2, Fund 3: der Schlusssatz war in sich widerspruechlich — „ein `ollama-native`-Codec
  // würde daran nichts ändern, denn die Lücke sitzt in Ollamas `/v1`-Übersetzung". Sitzt sie
  // dort, dann schliesst ein Codec, der `/v1` umgeht, sie gerade: Ollamas natives `options`-Feld
  // traegt top_k, min_p und repeat_penalty. Das Argument „die Luecke sitzt in Ollama, nicht in
  // der Uebersetzung" galt `tool_choice`/`parallel_tool_calls` und ist hier auf die falschen
  // Parameter uebertragen worden. Wer spaeter entscheiden soll, ob `ollama-native` gebaut wird,
  // liest sonst im Inventar, dass es fuer diese drei nichts brachte.
  it('nennt den nativen Weg als das, was diese drei erreichen wuerde', () => {
    expect(INVENTORY).not.toMatch(/`ollama-native`-Codec würde daran nichts ändern/)
    const absatz = INVENTORY.split('\n\n').find(a => a.includes('`ollama-native`-Codec'))
    expect(absatz).toBeDefined()
    expect(absatz).toContain('options')
  })

  // Entwurf 1.4 macht den Eintrag zur Pflicht, sobald eine neue anpassbare Flaeche entsteht
  // („Eine Zeile in docs/anpassbare-flaechen.md"). Die Zufuhr hat gleich mehrere gebracht, und
  // 58b7ef5 hatte den Eintrag fuer die netzwache-Positivliste ausdruecklich vertagt. Wer den
  // Suchanbieter im Betrieb umstellen will, findet die Stellschraube sonst nur im Quelltext —
  // dieselbe Klasse Fehler, gegen die CK-NFR-012 steht.
  it('nennt die Suchkonfiguration der Zufuhr', () => {
    for (const flaeche of ['searxngEndpunkt', 'tavilySchluessel', 'bevorzugt', 'such-anbieter.ts']) {
      expect(INVENTORY).toContain(flaeche)
    }
  })

  it('nennt die Grenzen der Suche, die kein Werkzeugargument setzt', () => {
    for (const flaeche of ['MAX_AUSZUG_ZEICHEN', 'MAX_ANFRAGE_LAENGE', 'ZEITBUDGET_MS', 'MAX_ANTWORT_BYTES']) {
      expect(INVENTORY).toContain(flaeche)
    }
  })

  it('nennt die Extraktionsgrenzen von seite_lesen', () => {
    for (const flaeche of ['MIN_ZEICHEN', 'STANDARD_MAX_ZEICHEN', 'HARTE_MAX_ZEICHEN', 'seiten-text.ts']) {
      expect(INVENTORY).toContain(flaeche)
    }
  })

  it('nennt die Positivliste der netzwache — der Eintrag, den 58b7ef5 vertagt hat', () => {
    expect(INVENTORY).toContain('Positivliste')
    expect(INVENTORY).toContain('netzwache')
    // Die Falle, die an dieser Flaeche haengt, gehoert an die Flaeche und nicht nur in den
    // Quelltext: ein Eintrag gilt samt aller Unterdomaenen, beliebig tief.
    expect(INVENTORY).toContain('Unterdomaenen')
  })

  it('nennt die zwei Grenzen des Rechercheurs, die eine Pruefung gefunden hat', () => {
    // Beide sind Sicherheitsgrenzen und keine Bequemlichkeit: die eine begrenzt die Zahl der
    // Unterlaeufe (acht Aufrufe eines Zuges fuhren acht nebenlaeufige Laeufe), die andere die
    // Laenge einer Quellzeile (die End-URL waehlt im Modus 'offen' die Gegenstelle).
    for (const flaeche of ['MAX_RECHERCHEN_JE_LAUF', 'MAX_QUELL_URL_ZEICHEN']) {
      expect(INVENTORY).toContain(flaeche)
    }
    // Und die Protokollzusage, die kein Schalter ist.
    expect(INVENTORY).toContain('netz.ausgehend')
  })

  it('nennt die Harness-Wahl nicht mehr als unerreichbar', () => {
    // Die Zeile war bis zum 2026-08-30 der ehrliche Vermerk einer Luecke: ein zweiter fremder
    // Harness war gebaut, aber nur ueber getForRuntime erreichbar. Steht der Vermerk nach dem
    // Bau der Flaeche weiter da, weist das Inventar an der Flaeche vorbei, die es benennen soll.
    const zeile = INVENTORY.split('\n').find(l => l.includes('**Harness-Wahl**'))
    expect(zeile).toBeDefined()
    expect(zeile).not.toContain('und das ist die offene Stelle')
    expect(zeile).toContain('agent.harness')
  })

  it('documents the cost budget price table', () => {
    // The price table is adjustable because rates change faster than releases.
    // It must be documented, and the key constraint — unknown models cost zero,
    // not guessed — must be explicit.
    expect(INVENTORY).toContain('Kostenbudget')
    expect(INVENTORY).toContain('VORGABE_PREISE')
    expect(INVENTORY).toContain('src/main/harness/budget.ts')
    expect(INVENTORY).toContain('unbekanntes Modell kostet null')
  })
})
