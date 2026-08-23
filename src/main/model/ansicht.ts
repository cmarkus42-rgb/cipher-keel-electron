/**
 * ansicht — the settings window's view model, computed in main.
 *
 * This is the only caller of `warnungen` in the project. The renderer receives finished
 * German text and never a rule, which is why it cannot paraphrase the eignung matrices.
 *
 * Async because the secret status asks the macOS keychain via the `security` CLI. Both
 * secret sources are injectable so tests never touch the real keychain.
 */

import { configStore } from '../config/config-store'
import { DEFAULT_EINTRAEGE } from './defaults'
import { ladeEintraege } from './registry'
import { sperrgrund, warnungen } from './eignung'
import { SLOTS, type Rolle, type Slot } from './slots'
import type { ModellEintrag } from './entry'
import { envVarName, readFromEnv, readFromKeychain } from '../worker/api-keys'
import { splitShellArgs } from '../util/shell-quote'
import { AdapterRegistry } from '../agent/registry'
import { istSchleifenAdapter } from '../agent/agent-adapter'
import { VORGABE_POSITIVLISTE } from '../harness/werkzeug-netz'
import type {
  AdapterAnsicht, EintragAnsicht, EndpunktAnsicht, GeheimnisStatus,
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

function rueckfallText(slot: Slot): string {
  if (slot.art === 'tier') {
    const handle = configStore.get('agent').modelTiers[slot.schluessel as 'light' | 'standard' | 'heavy']
    return `Keine Zuordnung — es gilt der Wert aus agent.modelTiers: '${handle}'.`
  }
  // Der Rechercheur hat keinen `llm.*`-Endpunkt und soll keinen bekommen: sein Rueckfall ist das
  // Modell, das gerade den Hauptlauf faehrt (rechercheur.ts). Ein Rueckfalltext, der stattdessen
  // `llm.rechercheur` naehme, naennte einen Endpunkt, den es nicht gibt — und das Feld waere
  // `undefined`, also stuende hier `undefined:undefined, Modell 'undefined'`.
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

function slotAnsicht(slot: Slot, eintraege: ModellEintrag[]): SlotAnsicht {
  const zuordnung = configStore.get('modelle').zuordnung
  const gewaehlt = slot.art === 'tier'
    ? zuordnung.tiers[slot.schluessel as 'light' | 'standard' | 'heavy']
    : zuordnung.rollen[slot.schluessel as Rolle]

  const optionen: SlotOptionAnsicht[] = eintraege.map(e => ({
    eintragId: e.id,
    name: e.name,
    sperrgrund: sperrgrund(slot.laeufer, e.art),
  }))

  const eintrag = eintraege.find(e => e.id === gewaehlt)

  // An assignment is only worth warning about if it actually holds. Two ways it does not:
  // it names an id nothing defines, or it names an entry this slot's runner cannot drive.
  // Both mean the fallback runs, so warnings about the named entry would describe
  // something that never happens — and the lock reason is the message that matters.
  let gewaehltHinweis: string | null = null
  if (gewaehlt && !eintrag) {
    gewaehltHinweis =
      `Die Zuordnung nennt den Eintrag '${gewaehlt}', den es nicht gibt. Es gilt der Rueckfall.`
  } else if (eintrag) {
    const grund = sperrgrund(slot.laeufer, eintrag.art)
    if (grund) {
      gewaehltHinweis = `Diese Zuordnung ist nicht benutzbar. ${grund} Es gilt der Rueckfall.`
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
    gewaehlt: gewaehlt ?? '',
    optionen,
    warnungen: warnListe,
    gewaehltHinweis,
    rueckfallText: rueckfallText(slot),
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

function adapterAnsichten(): AdapterAnsicht[] {
  // The registry needs a config reader; the view model only reads names and parameters,
  // so a reader that answers from the same config is enough.
  const registry = new AdapterRegistry({
    getStartArgs: (id: string) => splitShellArgs(configStore.get('agent').startArgs[id] ?? ''),
  })
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
