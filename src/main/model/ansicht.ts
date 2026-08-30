/**
 * ansicht — the settings window's view model, computed in main.
 *
 * This is the only caller of `warnungen` in the project. The renderer receives finished
 * German text and never a rule, which is why it cannot paraphrase the eignung matrices.
 *
 * Async because the secret status asks the macOS keychain via the `security` CLI. Both
 * secret sources are injectable so tests never touch the real keychain.
 */

import { configStore, type CipherKeelConfig } from '../config/config-store'
import { DEFAULT_EINTRAEGE } from './defaults'
import { ladeEintraege } from './registry'
import { sperrgrund, warnungen } from './eignung'
import { SLOTS, type Tier, type Rolle, type Slot, type Sitzungsschluessel } from './slots'
import type { ModellEintrag } from './entry'
import { envVarName, readFromEnv, readFromKeychain } from '../worker/api-keys'
import { splitShellArgs } from '../util/shell-quote'
import { AdapterRegistry } from '../agent/registry'
import { istSchleifenAdapter } from '../agent/agent-adapter'
import { VORGABE_POSITIVLISTE } from '../harness/werkzeug-netz'
import { HARNESS_PLATZ, harnessOptionen } from './harness-platz'
import type {
  AdapterAnsicht, EintragAnsicht, EndpunktAnsicht, GeheimnisStatus, HarnessPlatzAnsicht,
  SettingsAnsicht, SlotAnsicht, SlotOptionAnsicht, WarnungAnsicht,
} from '../../shared/settings-types'

export interface GeheimnisQuellen {
  keychain?: (ref: string) => Promise<string | null>
  env?: (ref: string) => string | null
}

const GEBUENDELTE_IDS = new Set(DEFAULT_EINTRAEGE.map(e => e.id))

function keyRefVon(e: ModellEintrag): string | null {
  return e.erreichbarkeit.art === 'api' ? e.erreichbarkeit.keyRef : null
}

function herkunftVon(e: ModellEintrag): string | null {
  const f = e.faehigkeiten
  if (!f) return null
  if (f.quelle === 'gemessen') return `gemessen am ${f.gemessenAm} mit ${f.gemessenMit}`
  return f.quelle
}

async function geheimnisStatusVon(
  ref: string,
  quellen: GeheimnisQuellen
): Promise<{ status: GeheimnisStatus; hinweis: string }> {
  const variable = envVarName(ref)
  try {
    const ausSchluesselbund = await (quellen.keychain ?? readFromKeychain)(ref)
    if (ausSchluesselbund) {
      return { status: 'schluesselbund', hinweis: `Im Schluesselbund hinterlegt (cipher-keel-api-${ref}).` }
    }
    const ausUmgebung = (quellen.env ?? readFromEnv)(ref)
    if (ausUmgebung) {
      return { status: 'umgebung', hinweis: `Aus der Umgebungsvariable ${variable}.` }
    }
    return {
      status: 'fehlt',
      hinweis: `Weder im Schluesselbund noch in ${variable} gefunden — ohne Schluessel bleibt dieser Eintrag unerreichbar.`,
    }
  } catch (err) {
    // One entry degrades, the page lives on.
    const grund = err instanceof Error ? err.message : String(err)
    return { status: 'unbekannt', hinweis: `Der Schluesselbund war nicht lesbar: ${grund}` }
  }
}

function endpunktAnsicht(e: { kind?: string; host?: string; port?: number; baseUrl?: string; keyRef?: string; model: string }): EndpunktAnsicht {
  return {
    kind: e.kind === 'openai-compatible' ? 'openai-compatible' : 'ollama',
    host: e.host ?? '',
    port: e.port ?? 0,
    baseUrl: e.baseUrl ?? '',
    keyRef: e.keyRef ?? '',
    model: e.model,
  }
}

/**
 * Enough of a rejected config entry to recognise it, and no more.
 *
 * The raw value comes from a hand-edited file and is displayed to a user, so it is bounded
 * here rather than in the renderer — the main process is where the value is known to be
 * arbitrary. The ellipsis matters: without it a clipped blob reads as malformed JSON
 * rather than as an excerpt, which would blame the wrong thing.
 */
function kurzfassung(roh: unknown): string {
  const text = JSON.stringify(roh) ?? String(roh)
  return text.length > 120 ? `Eintrag ${text.slice(0, 120)}…` : `Eintrag ${text}`
}

// Jede Art bekommt ihren eigenen Zweig, ausdruecklich an `slot.art` gebunden — keiner faellt
// ueber ein "sonst" in einen anderen. Ein `switch` statt einer `if`-Kette, mit einem
// `never`-Arm im `default`: eine kuenftige vierte Art meldet sich hier am Compiler, nicht erst
// als falscher Text zur Laufzeit. Vor der Sitzungs-Art endete der Rolle-Zweig ohne eigene
// Bedingung: "kein Tier" hiess dort stillschweigend "also eine Rolle", was so lange stimmte,
// wie es nur zwei Arten gab. Fuer `art: 'sitzung'` waere das falsch gewesen — der Zweig haette
// `configStore.get('llm')['niveau-b']` gelesen, ein Feld, das es nicht gibt, und waere an
// `e.baseUrl` auf `undefined` zerschellt statt einen Rueckfalltext zu liefern.
function rueckfallText(slot: Slot): string {
  switch (slot.art) {
    case 'tier': {
      const handle = configStore.get('agent').modelTiers[slot.schluessel as Tier]
      return `Keine Zuordnung — es gilt der Wert aus agent.modelTiers: '${handle}'.`
    }
    case 'sitzung':
      return (
        'Ohne Belegung startet keine Niveau-B-Zelle. Es gibt hier keinen Rueckfall: der ' +
        'naechstliegende waere der Worker-Endpunkt, und der ist fuer einen einzelnen Job ' +
        'bemessen, nicht fuer eine Sitzung.'
      )
    case 'rolle': {
      // Der Rechercheur hat keinen `llm.*`-Endpunkt und soll keinen bekommen: sein Rueckfall
      // ist das Modell, das gerade den Hauptlauf faehrt (rechercheur.ts). Ein Rueckfalltext,
      // der stattdessen `llm.rechercheur` naehme, naennte einen Endpunkt, den es nicht gibt —
      // und das Feld waere `undefined`, also stuende hier `undefined:undefined, Modell 'undefined'`.
      if (slot.schluessel === 'rechercheur') {
        return (
          'Keine Zuordnung — der Unterlauf faehrt dann das Modell des Hauptlaufs. ' +
          'Einen eigenen Endpunkt gibt es fuer diese Rolle nicht.'
        )
      }
      const e = configStore.get('llm')[slot.schluessel as 'tagging' | 'worker']
      const ziel = e.baseUrl ? e.baseUrl : `${e.host}:${e.port}`
      return `Keine Zuordnung — es gilt der Wert aus llm.${slot.schluessel}: ${ziel}, Modell '${e.model}'.`
    }
    default: {
      const nie: never = slot.art
      throw new Error(`Unbekannte Slot-Art '${nie}'.`)
    }
  }
}

// Derselbe `switch`/`never`-Aufbau wie `rueckfallText`, aus demselben Grund: eine kuenftige
// vierte Art soll hier am Compiler scheitern, nicht stillschweigend in die falsche Gruppe
// lesen (siehe zuordnungMitPlatz in settings/handlers.ts fuer die Schreibseite derselben Regel).
function gewaehlterWert(slot: Slot, zuordnung: CipherKeelConfig['modelle']['zuordnung']): string {
  switch (slot.art) {
    case 'tier':
      return zuordnung.tiers[slot.schluessel as Tier]
    case 'rolle':
      return zuordnung.rollen[slot.schluessel as Rolle]
    case 'sitzung':
      return zuordnung.sitzungen[slot.schluessel as Sitzungsschluessel]
    default: {
      const nie: never = slot.art
      throw new Error(`Unbekannte Slot-Art '${nie}'.`)
    }
  }
}

function slotAnsicht(slot: Slot, eintraege: ModellEintrag[]): SlotAnsicht {
  const zuordnung = configStore.get('modelle').zuordnung
  const gewaehlt = gewaehlterWert(slot, zuordnung)

  const optionen: SlotOptionAnsicht[] = eintraege.map(e => ({
    eintragId: e.id,
    name: e.name,
    sperrgrund: sperrgrund(slot.laeufer, e.art),
  }))

  const eintrag = eintraege.find(e => e.id === gewaehlt)

  // Dieselbe Quelle wie das Feld `rueckfallText` unten, statt eine zweite Stelle zu bauen, die
  // dasselbe wissen muss: fuer die meisten Plaetze nennt sie einen Rueckfallwert, fuer
  // `sitzung:niveau-b` sagt sie ausdruecklich, dass es keinen gibt. Vor dieser Aenderung stand
  // hier hartcodiert "Es gilt der Rueckfall." — fuer einen Platz ohne Rueckfall eine falsche
  // Auskunft, und die einzige, die der Nutzer in diesem Zustand ueberhaupt zu sehen bekommt
  // (der Renderer zeigte `rueckfallText` selbst nur bei leerem Platz, nicht bei einer
  // vorhandenen, aber unbenutzbaren Zuordnung — seit c68a51e steht er stattdessen immer
  // hinter dem Info-Knopf, was diese Doppelung erst recht noetig macht: `gewaehltHinweis`
  // ist in dem Zustand weiterhin das, was ungefragt auf der Seite steht).
  const rueckfall = rueckfallText(slot)

  // An assignment is only worth warning about if it actually holds. Two ways it does not:
  // it names an id nothing defines, or it names an entry this slot's runner cannot drive.
  // Both mean the fallback runs, so warnings about the named entry would describe
  // something that never happens — and the lock reason is the message that matters.
  let gewaehltHinweis: string | null = null
  if (gewaehlt && !eintrag) {
    gewaehltHinweis =
      `Die Zuordnung nennt den Eintrag '${gewaehlt}', den es nicht gibt. ${rueckfall}`
  } else if (eintrag) {
    const grund = sperrgrund(slot.laeufer, eintrag.art)
    if (grund) {
      gewaehltHinweis = `Diese Zuordnung ist nicht benutzbar. ${grund} ${rueckfall}`
    }
  }

  // No WarnKontext is passed: nothing in the project supplies a start context yet, so
  // `kontext-zu-klein` cannot fire. Spec section 5.5 states that, and
  // tests/model/ansicht.test.ts holds the counter-proof.
  const warnListe = eintrag && !gewaehltHinweis
    ? warnungen(eintrag, slot.laeufer, slot.niveau)
    : []

  return {
    id: slot.id,
    beschriftung: slot.beschriftung,
    art: slot.art,
    schluessel: slot.schluessel,
    gewaehlt: gewaehlt ?? '',
    optionen,
    warnungen: warnListe,
    gewaehltHinweis,
    rueckfallText: rueckfall,
    wirkung: slot.wirkung,
  }
}

/**
 * The flag that turns off Claude Code's per-tool confirmation. It is the shipped default
 * and stays that way — the app starts its sessions into a tmux pane it drives, where no
 * one could answer a prompt. Until this window existed the setting was reachable only by
 * editing a file outside the app (CK-NFR-012), so it was not merely unexplained, it was
 * invisible. Naming it here is what turns a silent default into a stated one.
 */
const BERECHTIGUNGS_FLAGGE = '--dangerously-skip-permissions'

/**
 * The registry needs a config reader; the view model only reads names, parameters and each
 * adapter's own availability verdict, so a reader that answers from the same config is enough.
 * Built once per use and by one function, so the two consumers in this module (the adapter tab
 * and the harness slot) cannot end up looking at differently-constructed registries.
 */
function registryFuerAnsicht(): AdapterRegistry {
  return new AdapterRegistry({
    getStartArgs: (id: string) => splitShellArgs(configStore.get('agent').startArgs[id] ?? ''),
  })
}

/**
 * Der Harness-Platz, so wie ihn das Settings-Fenster zeigt.
 *
 * Alles, was hier ein Mensch liest, entsteht im Hauptprozess: die Beschriftung und die
 * Erklaerung aus `HARNESS_PLATZ`, der Sperrgrund je Option unveraendert vom Adapter. Das Fenster
 * bekommt fertigen deutschen Text und keine Regel — dieselbe Haltung wie bei den Slots.
 *
 * Der Hinweis zu einer klemmenden Wahl nennt **keinen** Rueckfall, und das ist der Unterschied
 * zu `slotAnsicht`: ein nicht startbarer Harness laesst eine Sitzung nicht auf das Preset
 * zurueckfallen, sondern benannt scheitern (`isAvailable()`-Riegel in SESSION_CREATE). Ein
 * Rueckfalltext an dieser Stelle waere eine falsche Auskunft ueber etwas, das nie passiert.
 */
function harnessPlatzAnsicht(): HarnessPlatzAnsicht {
  const gewaehlt = configStore.get('agent').harness ?? ''
  const optionen = harnessOptionen(registryFuerAnsicht())

  let gewaehltHinweis: string | null = null
  if (gewaehlt) {
    const option = optionen.find(o => o.adapterId === gewaehlt)
    if (!option) {
      gewaehltHinweis =
        `Die Wahl nennt den Harness '${gewaehlt}', den es in dieser App nicht gibt. Solange ` +
        'das so steht, scheitert jeder Sitzungsstart auf einem fremden CLI benannt.'
    } else if (option.sperrgrund) {
      gewaehltHinweis =
        `Dieser Harness ist auf diesem Rechner nicht startbar. ${option.sperrgrund} Eine ` +
        'Sitzung, die ihn starten soll, scheitert benannt — sie fällt nicht auf das Preset ' +
        'zurück.'
    }
  }

  return {
    id: HARNESS_PLATZ.id,
    beschriftung: HARNESS_PLATZ.beschriftung,
    gewaehlt,
    optionen,
    gewaehltHinweis,
    rueckfallText: HARNESS_PLATZ.rueckfallText,
    rueckfallKurz: HARNESS_PLATZ.rueckfallKurz,
    erklaertext: HARNESS_PLATZ.erklaertext,
    wirkung: HARNESS_PLATZ.wirkung,
  }
}

function adapterAnsichten(): AdapterAnsicht[] {
  const registry = registryFuerAnsicht()
  const startArgs = configStore.get('agent').startArgs

  return registry.listIds().map(id => {
    const adapter = registry.get(id)!
    const text = startArgs[id] ?? ''
    // The own loop has no app-driven command-line parameters — it has no command line at
    // all. The list stays empty for it rather than forcing access to a field that does not
    // exist for this Sitzungsart.
    const appGesteuert = istSchleifenAdapter(adapter)
      ? []
      : [...(adapter.appGesteuerteParameter ?? [])]
    // Not named `warnungen`: that name belongs to the eignung function this module is the
    // one caller of, and shadowing it here would make a reader check whether one is the
    // other. Neither is.
    const warnListe: WarnungAnsicht[] = []
    let getippt: string[] = []

    try {
      getippt = splitShellArgs(text)
    } catch (err) {
      // An unreadable line cannot be judged further, so no other rule runs on it.
      warnListe.push({
        code: 'unlesbare-parameter',
        text: err instanceof Error ? err.message : String(err),
      })
      return {
        id, name: adapter.displayName, startArgs: text,
        appGesteuerteParameter: appGesteuert, warnungen: warnListe,
      }
    }

    const doppelt = appGesteuert.filter(p => getippt.includes(p))
    if (doppelt.length > 0) {
      warnListe.push({
        code: 'doppelter-parameter',
        text: `${doppelt.join(', ')} wird von der App selbst angehaengt — hier eingetragen ` +
          'steht der Parameter zweimal in der Kommandozeile.',
      })
    }

    if (getippt.includes(BERECHTIGUNGS_FLAGGE)) {
      warnListe.push({
        code: 'berechtigungen-uebersprungen',
        text: 'Dieser Parameter schaltet die Rueckfrage vor jedem Werkzeugaufruf ab. Er ist ' +
          'die Vorgabe, weil die App ihre Sitzungen selbst in einen tmux-Pane startet, in dem ' +
          'niemand antworten koennte — er bedeutet aber, dass eine Sitzung in diesem Projekt ' +
          'ohne weiteres Nachfragen schreibt und Befehle ausfuehrt.',
      })
    }

    return {
      id, name: adapter.displayName, startArgs: text,
      appGesteuerteParameter: appGesteuert, warnungen: warnListe,
    }
  })
}

/**
 * Der Netzzugang der Harness-Werkzeuge, so wie ihn das Settings-Fenster zeigt.
 *
 * Die Schluesselstaende kommen aus demselben Leser wie bei den Modell-Eintraegen
 * (`geheimnisStatusVon`), damit es genau eine Wahrheit darueber gibt, ob ein Schluessel
 * auffindbar ist. Die Vorgabe-Positivliste wird mitgeschickt statt im Fenster nachgebaut: sie
 * steht in `harness/werkzeug-netz.ts`, und ein Nachbau im Renderer waere eine zweite Liste, die
 * auseinanderlaufen kann.
 */
async function netzAnsicht(quellen: GeheimnisQuellen) {
  const netz = configStore.get('netz')
  const [tavily, brave] = await Promise.all([
    geheimnisStatusVon('tavily', quellen),
    geheimnisStatusVon('brave', quellen),
  ])
  return {
    bevorzugt: netz.bevorzugt ?? '',
    searxngEndpunkt: netz.searxngEndpunkt ?? '',
    zusaetzlichePositivliste: Array.isArray(netz.zusaetzlichePositivliste)
      ? netz.zusaetzlichePositivliste.filter((h): h is string => typeof h === 'string')
      : [],
    vorgabePositivliste: [...VORGABE_POSITIVLISTE],
    tavily: { status: tavily.status, hinweis: tavily.hinweis },
    brave: { status: brave.status, hinweis: brave.hinweis },
  }
}

export async function baueAnsicht(quellen: GeheimnisQuellen = {}): Promise<SettingsAnsicht> {
  const { eintraege, uebersprungen } = ladeEintraege()

  const eintragsAnsichten: EintragAnsicht[] = await Promise.all(
    eintraege.map(async (e): Promise<EintragAnsicht> => {
      const ref = keyRefVon(e)
      const geheim = ref ? await geheimnisStatusVon(ref, quellen) : null
      return {
        id: e.id,
        name: e.name,
        art: e.art,
        oertlichkeit: e.oertlichkeit,
        erklaertext: e.erklaertext,
        empfehlung: e.empfehlung,
        faehigkeitenHerkunft: herkunftVon(e),
        keyRef: ref,
        geheimnisStatus: geheim ? geheim.status : null,
        geheimnisHinweis: geheim ? geheim.hinweis : null,
        loeschbar: !GEBUENDELTE_IDS.has(e.id),
        erreichbarkeit: e.erreichbarkeit,
        // Typed via FaehigkeitenAnsicht, a structural mirror -- see settings-types.ts. The
        // form reads this to populate the capability section and sends a fresh object back
        // on save; normaliseEintrag remains the one place that validates it.
        faehigkeiten: e.faehigkeiten,
      }
    })
  )

  const llm = configStore.get('llm')
  const voice = configStore.get('voice')

  return {
    eintraege: eintragsAnsichten,
    uebersprungen: uebersprungen.map(u => ({
      beschreibung: kurzfassung(u.roh),
      fehler: u.fehler,
    })),
    slots: SLOTS.map(s => slotAnsicht(s, eintraege)),
    harnessPlatz: harnessPlatzAnsicht(),
    modellTiers: { ...configStore.get('agent').modelTiers },
    rueckfallEndpunkte: {
      tagging: endpunktAnsicht(llm.tagging),
      worker: endpunktAnsicht(llm.worker),
    },
    adapter: adapterAnsichten(),
    sprachausgabe: { aktiv: voice.enabled !== false, stimme: voice.piperVoice ?? '' },
    netz: await netzAnsicht(quellen),
  }
}
