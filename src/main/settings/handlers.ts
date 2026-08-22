/**
 * settings/handlers — the IPC surface of the settings window.
 *
 * Separate from ipc-handlers.ts on purpose: that file is 815 lines, and nine more handlers
 * would make it worse.
 *
 * Two rules hold for every writer here:
 *   1. validate in main, never trust the renderer
 *   2. return the freshly computed whole view, because one change moves things elsewhere —
 *      an assignment changes a fallback, a secret changes an entry's status in every slot
 *      that names it
 *
 * `config:set` is deliberately left alone and unused by this window: it writes a whole
 * top-level key with no validation, and that surface is not being widened.
 */

import { ipcMain } from 'electron'
import { configStore, type LlmEndpoint } from '../config/config-store'
import { baueAnsicht } from '../model/ansicht'
import { normaliseEintrag } from '../model/entry'
import { slotFuerId, type Rolle } from '../model/slots'
import { storeInKeychain, keychainService } from '../worker/api-keys'
import { normaliseEndpoint, type RawEndpoint } from '../worker/model-client'
import { execFileAsync } from '../util/exec-util'
import { AdapterRegistry } from '../agent/registry'
import { splitShellArgs } from '../util/shell-quote'
import type { SettingsAntwort } from '../../shared/settings-types'
import {
  SETTINGS_ANSICHT, SETTINGS_ZUORDNUNG_SETZEN, SETTINGS_EINTRAG_SPEICHERN,
  SETTINGS_EINTRAG_LOESCHEN, SETTINGS_GEHEIMNIS_SETZEN, SETTINGS_GEHEIMNIS_LOESCHEN,
  SETTINGS_STARTARGS_SETZEN, SETTINGS_EINFACHFELD_SETZEN,
  SETTINGS_RUECKFALL_ENDPUNKT_SETZEN,
} from '../../shared/ipc-channels'

/** Every writer funnels through this: validate, mutate, hand back the whole picture. */
async function mitAnsicht(aenderung: () => void): Promise<SettingsAntwort> {
  try {
    aenderung()
  } catch (err) {
    return { ok: false, fehler: err instanceof Error ? err.message : String(err) }
  }
  try {
    return { ok: true, ansicht: await baueAnsicht() }
  } catch (err) {
    return { ok: false, fehler: `Die Aenderung wurde gespeichert, aber die Ansicht liess sich nicht neu aufbauen: ${err instanceof Error ? err.message : String(err)}` }
  }
}

const EINFACHFELDER = new Set([
  'modelltier:light', 'modelltier:standard', 'modelltier:heavy',
  'sprachausgabe:aktiv', 'sprachausgabe:stimme',
  // Der Netzzugang der Harness-Werkzeuge. Die Schluessel stehen bewusst *nicht* hier, sondern
  // gehen ueber SETTINGS_GEHEIMNIS_SETZEN in den Schluesselbund — eine Konfigurationsdatei ist
  // kein Ort fuer Geheimnisse, und der Kanal dafuer ist schon generisch.
  'netz:bevorzugt', 'netz:searxngEndpunkt', 'netz:zusaetzlichePositivliste',
])

/** Die Anbieter, die `waehleAnbieter` kennt. Leer heisst automatisch. */
const ANBIETER = new Set(['', 'searxng', 'tavily', 'brave'])

export function registerSettingsHandlers(): void {
  ipcMain.handle(SETTINGS_ANSICHT, async () => baueAnsicht())

  ipcMain.handle(SETTINGS_ZUORDNUNG_SETZEN, async (_e, slotId: string, eintragId: string) =>
    mitAnsicht(() => {
      const slot = slotFuerId(slotId)
      if (!slot) throw new Error(`Unbekannter Zuordnungsplatz '${slotId}'.`)
      const modelle = configStore.get('modelle')
      const zuordnung = {
        tiers: { ...modelle.zuordnung.tiers },
        rollen: { ...modelle.zuordnung.rollen },
      }
      if (slot.art === 'tier') {
        zuordnung.tiers[slot.schluessel as 'light' | 'standard' | 'heavy'] = eintragId
      } else {
        zuordnung.rollen[slot.schluessel as Rolle] = eintragId
      }
      configStore.set('modelle', { ...modelle, zuordnung })
    })
  )

  ipcMain.handle(SETTINGS_EINTRAG_SPEICHERN, async (_e, roh: unknown) =>
    mitAnsicht(() => {
      // The one validation, reused: normaliseEintrag also builds the endpoint, so the
      // transport check happens here exactly as it does on load.
      const eintrag = normaliseEintrag(roh)
      const modelle = configStore.get('modelle')
      const liste = Array.isArray(modelle.eintraege) ? [...modelle.eintraege] : []
      const index = liste.findIndex(x => (x as { id?: string })?.id === eintrag.id)
      if (index >= 0) liste[index] = eintrag
      else liste.push(eintrag)
      configStore.set('modelle', { ...modelle, eintraege: liste })
    })
  )

  ipcMain.handle(SETTINGS_EINTRAG_LOESCHEN, async (_e, id: string) =>
    mitAnsicht(() => {
      const modelle = configStore.get('modelle')
      const liste = Array.isArray(modelle.eintraege) ? modelle.eintraege : []
      const gefiltert = liste.filter(x => (x as { id?: string })?.id !== id)
      if (gefiltert.length === liste.length) {
        throw new Error(
          `Der Eintrag '${id}' steht nicht in der Konfiguration. Gebuendelte Eintraege lassen ` +
          'sich nicht loeschen, nur durch einen gleichnamigen eigenen ueberschreiben.'
        )
      }
      configStore.set('modelle', { ...modelle, eintraege: gefiltert })
    })
  )

  ipcMain.handle(SETTINGS_GEHEIMNIS_SETZEN, async (_e, ref: string, geheimnis: string) => {
    if (!ref) return { ok: false, fehler: 'Ohne Schluesselnamen laesst sich nichts hinterlegen.' }
    if (!geheimnis) return { ok: false, fehler: 'Ein leeres Geheimnis wird nicht gespeichert — zum Entfernen bitte loeschen.' }
    try {
      // storeInKeychain redigiert seine eigene Ursache — siehe api-keys.ts. Die Meldung
      // hier weiterzureichen ist deshalb sicher, und nur deshalb.
      await storeInKeychain(ref, geheimnis)
    } catch (err) {
      return { ok: false, fehler: err instanceof Error ? err.message : String(err) }
    }
    return mitAnsicht(() => {})
  })

  ipcMain.handle(SETTINGS_GEHEIMNIS_LOESCHEN, async (_e, ref: string) => {
    try {
      await execFileAsync('security', [
        'delete-generic-password', '-s', keychainService(ref), '-a', 'key',
      ])
    } catch (err) {
      return { ok: false, fehler: `Der Schluesselbund hat das Loeschen abgelehnt: ${err instanceof Error ? err.message : String(err)}` }
    }
    return mitAnsicht(() => {})
  })

  ipcMain.handle(SETTINGS_STARTARGS_SETZEN, async (_e, adapterId: string, text: string) =>
    mitAnsicht(() => {
      const registry = new AdapterRegistry({ getStartArgs: () => [] })
      if (!registry.listIds().includes(adapterId)) {
        throw new Error(`Kein registrierter Adapter mit der Kennung '${adapterId}'.`)
      }
      // Reject an unbalanced quote here rather than at launch time, where it would break
      // a session start instead of a form.
      splitShellArgs(text)
      const agent = configStore.get('agent')
      configStore.set('agent', { ...agent, startArgs: { ...agent.startArgs, [adapterId]: text } })
    })
  )

  ipcMain.handle(SETTINGS_EINFACHFELD_SETZEN, async (_e, feld: string, wert: unknown) =>
    mitAnsicht(() => {
      if (!EINFACHFELDER.has(feld)) throw new Error(`Unbekanntes Feld '${feld}'.`)
      const [bereich, name] = feld.split(':')
      if (bereich === 'modelltier') {
        if (typeof wert !== 'string') throw new Error('Ein Modell-Handle muss Text sein.')
        const agent = configStore.get('agent')
        configStore.set('agent', {
          ...agent,
          modelTiers: { ...agent.modelTiers, [name]: wert },
        })
        return
      }
      if (bereich === 'netz') {
        const netz = configStore.get('netz')
        if (name === 'bevorzugt') {
          if (typeof wert !== 'string' || !ANBIETER.has(wert)) {
            throw new Error(
              `Unbekannter Suchanbieter '${String(wert)}' — bekannt sind searxng, tavily, brave ` +
              `oder leer fuer automatisch.`,
            )
          }
          configStore.set('netz', { ...netz, bevorzugt: wert })
          return
        }
        if (name === 'searxngEndpunkt') {
          if (typeof wert !== 'string') throw new Error('Der Endpunkt muss Text sein.')
          // Leer ist zulaessig und heisst "nicht eingerichtet" — dann meldet das Werkzeug das
          // benannt, statt leere Treffer zu liefern.
          configStore.set('netz', { ...netz, searxngEndpunkt: wert.trim() })
          return
        }
        // zusaetzlichePositivliste: eine Zeile je Host, im Formular als Textfeld.
        if (typeof wert !== 'string') throw new Error('Die Positivliste kommt als Text, ein Host je Zeile.')
        const hosts = wert.split('\n').map(z => z.trim().toLowerCase()).filter(z => z !== '')
        for (const h of hosts) {
          // Kein Schema, kein Pfad, kein Sternchen: die netzwache vergleicht Hostnamen. Ein
          // Eintrag wie `https://example.org/docs` wuerde nie greifen und saehe doch richtig aus.
          if (/[/:*\s]/.test(h)) {
            throw new Error(
              `'${h}' ist kein reiner Hostname. Erwartet wird z.B. 'developer.mozilla.org' — ` +
              `ohne Schema, ohne Pfad, ohne Sternchen. Ein Eintrag deckt seine Unterdomaenen mit ab.`,
            )
          }
        }
        configStore.set('netz', { ...netz, zusaetzlichePositivliste: hosts })
        return
      }

      const voice = configStore.get('voice')
      if (name === 'aktiv') {
        if (typeof wert !== 'boolean') throw new Error('Die Sprachausgabe ist an oder aus.')
        configStore.set('voice', { ...voice, enabled: wert })
      } else {
        if (typeof wert !== 'string' || !wert) throw new Error('Ohne Stimmennamen gibt es keine Ausgabe.')
        configStore.set('voice', { ...voice, piperVoice: wert })
      }
    })
  )

  ipcMain.handle(SETTINGS_RUECKFALL_ENDPUNKT_SETZEN, async (_e, rolle: string, endpunkt: unknown) =>
    mitAnsicht(() => {
      if (rolle !== 'tagging' && rolle !== 'worker') {
        throw new Error(`Unbekannte Rolle '${rolle}'.`)
      }
      // normaliseEndpoint is the one transport validation — not restated here. Its return
      // value is discarded on purpose: config keeps the loose RawEndpoint shape (defaults
      // for host/port are filled in on read, in model-client.ts), so what is stored is the
      // input as given, not the normalised result.
      normaliseEndpoint(endpunkt as RawEndpoint)
      const llm = configStore.get('llm')
      const naechster = endpunkt as LlmEndpoint
      configStore.set('llm', {
        ...llm,
        tagging: rolle === 'tagging' ? naechster : llm.tagging,
        worker: rolle === 'worker' ? naechster : llm.worker,
      })
    })
  )
}
