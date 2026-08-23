/**
 * harness-netz — der konkrete Weg ins Netz, und die einzige Stelle, an der er gebaut wird.
 *
 * Er liegt **ausserhalb** von `src/main/harness/`, aus demselben Grund wie `harness-handlers.ts`:
 * dort drinnen soll kein Modul die Umgebung kennen. Die netzwache formuliert ihre Regeln ueber
 * eingespeiste Funktionen (`Aufloeser`, `Abrufer`), damit sie ohne DNS und ohne Netz pruefbar
 * bleibt — und weil die Wache dann in einem Test einen Angreifer spielen lassen kann. Hier stehen
 * die echten Implementierungen dazu, und sonst nirgends.
 *
 * **Der Grund, warum hier nicht `fetch(url)` steht.** Die Wache urteilt ueber *Adressen*: sie
 * loest den Namen auf, prueft jede Adresse gegen die Sperrliste (privat, link-local und
 * insbesondere `100.64.0.0/10`, das Tailscale-Netz) und gibt genau die freigegebenen Adressen als
 * `bindung` heraus. Ein Abrufer, der stattdessen den *Namen* an `fetch` reicht, laesst den Klienten
 * ein zweites Mal aufloesen — und zwischen Pruefung und Verbindung kann sich die Antwort geaendert
 * haben (DNS-Rebinding). Deshalb geht die Verbindung hier ueber `lookup: auftrag.bindung`, das
 * nichts nachschlaegt, sondern ausgibt. Das ist das letzte Tor vor dem Socket.
 *
 * In dieser Umgebung ist das kein Formalismus: ueber Tailscale haengt ein **unauthentifizierter
 * Ollama** unter `100.78.7.108:11434`, dazu TrueNAS und n8n auf `100.67.95.13` und ein VPS mit
 * `sudo` auf `100.64.99.118`. Eine geholte Seite, die dorthin weiterleitet, wuerde aus dem
 * Hauptprozess fremde Modelle fahren.
 */

import { lookup as dnsLookup } from 'node:dns'
import { request as httpsRequest } from 'node:https'
import { Readable } from 'node:stream'
import { configStore } from './config/config-store'
import { resolveApiKey } from './worker/api-keys'
import {
  bindeAufAdressen, type Abrufauftrag, type Abrufer, type Aufloeser,
} from './harness/netzwache'
import { waehleAnbieter, type SuchKonfiguration } from './harness/such-anbieter'
import {
  VORGABE_POSITIVLISTE, VORGABE_SEITE_GRENZEN, type NetzKontext,
} from './harness/werkzeug-netz'

/**
 * Loest **alle** Familien auf. Wer nur A-Records nimmt, laesst die AAAA-Adressen ungeprueft — und
 * `bindeAufAdressen` gaebe sie dann gar nicht erst heraus, sodass die Verbindung an einem Ziel
 * scheitert, das nie geprueft wurde. `all: true` ist hier Pflicht, kein Komfort.
 *
 * Das Abbruchsignal wird mitgereicht, weil Node eine laufende DNS-Abfrage nicht von selbst
 * beendet und das Zeitbudget fuer die ganze Kette gilt.
 */
export const aufloeserDesSystems: Aufloeser = (host, signal) =>
  new Promise((erfuellen, ablehnen) => {
    if (signal.aborted) { ablehnen(new Error('Zeitbudget bereits erschoepft')); return }
    const beiAbbruch = () => ablehnen(new Error('Zeitbudget waehrend der Namensaufloesung erschoepft'))
    signal.addEventListener('abort', beiAbbruch, { once: true })
    dnsLookup(host, { all: true, verbatim: true }, (fehler, treffer) => {
      signal.removeEventListener('abort', beiAbbruch)
      if (fehler) { ablehnen(fehler); return }
      erfuellen(treffer.map(t => t.address))
    })
  })

/**
 * Der Abrufer. `node:https` statt `fetch`, weil nur `https.request` die `lookup`-Funktion
 * annimmt, ueber die die Bindung laeuft — `fetch` bietet dafuer keinen Weg ohne undici als
 * zusaetzliche Abhaengigkeit.
 *
 * Weiterleitungen werden **nicht** gefolgt: `holeSicher` folgt selbst und prueft dabei jedes Ziel
 * erneut. Ein Klient, der hier von sich aus folgt, wuerde genau diese Pruefung ueberspringen.
 */
export const abruferDesSystems: Abrufer = (auftrag: Abrufauftrag) =>
  new Promise((erfuellen, ablehnen) => {
    const ziel = new URL(auftrag.url)
    const signal = auftrag.init.signal ?? undefined
    const anfrage = httpsRequest(
      {
        protocol: ziel.protocol,
        hostname: ziel.hostname,
        port: ziel.port === '' ? 443 : Number(ziel.port),
        path: ziel.pathname + ziel.search,
        method: auftrag.init.method ?? 'GET',
        headers: auftrag.init.headers as Record<string, string> | undefined,
        // Das letzte Tor. Siehe Modulkopf.
        // Nodes `LookupFunction` erlaubt `family` auch als 'IPv4'/'IPv6'; `Bindung` ist enger
        // typisiert, weil sie nur Zahlen ausgibt. Die Umformung ist rein typisch — sie aendert
        // nichts am Verhalten, und die Bindung bleibt das Tor.
        lookup: auftrag.bindung as unknown as Parameters<typeof httpsRequest>[0] extends { lookup?: infer L } ? L : never,
        // SNI und Host-Kopf bleiben am geprueften Namen — nur das Ziel kommt aus der Bindung.
        servername: ziel.hostname,
      },
      (antwort) => {
        const kopf = new Headers()
        for (const [name, wert] of Object.entries(antwort.headers)) {
          if (wert === undefined) continue
          for (const einzeln of Array.isArray(wert) ? wert : [wert]) kopf.append(name, einzeln)
        }
        const status = antwort.statusCode ?? 0
        // 204 und 304 duerfen keinen Koerper tragen; `new Response(stream, …)` wirft dann.
        const koerper = status === 204 || status === 304
          ? null
          : (Readable.toWeb(antwort) as ReadableStream<Uint8Array>)
        erfuellen(new Response(koerper, { status, headers: kopf }))
      },
    )
    anfrage.on('error', ablehnen)
    if (signal) {
      if (signal.aborted) { anfrage.destroy(new Error('Zeitbudget erschoepft')); }
      else signal.addEventListener('abort', () => anfrage.destroy(new Error('Zeitbudget erschoepft')), { once: true })
    }
    anfrage.end()
  })

/** Die Konfigurationsflaeche, an einer Stelle gelesen. */
async function suchKonfiguration(): Promise<SuchKonfiguration> {
  const netz = configStore.get('netz')
  // Der Schluessel kommt aus dem Schluesselbund, nicht aus der Konfigurationsdatei.
  const tavily = await resolveApiKey('tavily').catch(() => null)
  const brave = await resolveApiKey('brave').catch(() => null)
  return {
    searxngEndpunkt: netz.searxngEndpunkt,
    tavilySchluessel: typeof tavily === 'string' ? tavily : '',
    braveSchluessel: typeof brave === 'string' ? brave : '',
    // Leer heisst automatisch — das Feld bleibt dann weg, statt einen leeren String zu senden,
    // den `waehleAnbieter` als Anbieternamen deuten muesste.
    ...(netz.bevorzugt === 'tavily' || netz.bevorzugt === 'searxng' || netz.bevorzugt === 'brave'
      ? { bevorzugt: netz.bevorzugt }
      : {}),
  }
}

/**
 * Baut den Netzkontext fuer einen Lauf — oder gibt `undefined` zurueck, wenn kein Suchanbieter
 * eingerichtet ist.
 *
 * `undefined` ist hier die **ehrliche** Antwort und kein Versehen: ohne Anbieter stehen die
 * Netz-Werkzeuge zwar in der Registry (ihre Stummel gehoeren in den stabilen Praefix, damit er
 * sich nicht zwischen Laeufen bewegt), aber sie antworten benannt, dass Netzzugang fuer diesen
 * Lauf nicht eingerichtet ist. Die Alternative — leere Trefferlisten — waere die schlechtere:
 * ein Agent, der leere Ergebnisse statt eines Fehlers bekommt, halluziniert die Antwort.
 *
 * `ereignisse` und `melde` fehlen absichtlich: die setzt `fuehreAus` (lauf.ts) je Aufruf frisch
 * ein, damit die Herkunftspruefung das Protokoll **dieses** Laufs sieht und die Meldung unter der
 * richtigen laufId landet.
 */
export async function baueNetzKontext(): Promise<Omit<NetzKontext, 'ereignisse' | 'melde'> | undefined> {
  const wahl = waehleAnbieter(await suchKonfiguration())
  if (!wahl.ok) {
    console.warn(`[harness-netz] Kein Netzzugang fuer Harness-Laeufe: ${wahl.meldung}`)
    return undefined
  }
  const netz = configStore.get('netz')
  const zusaetzlich = Array.isArray(netz.zusaetzlichePositivliste)
    ? netz.zusaetzlichePositivliste.filter((h): h is string => typeof h === 'string' && h.trim() !== '')
    : []
  return {
    anbieter: wahl.anbieter,
    // Der Suchdienst geht bewusst nicht durch die Wache: sein Ziel ist betreiberkonfiguriert, und
    // ein SearXNG im Tailnet ist http auf 100.64.0.0/10 — durch die Wache zu fuehren hiesse, genau
    // die zwei Regeln zu oeffnen, die dort am meisten tragen.
    suchAbrufer: fetch,
    aufloesen: aufloeserDesSystems,
    abrufen: abruferDesSystems,
    // Der Hauptlauf faehrt gegen die Positivliste. Der Unterlauf des Rechercheurs setzt in
    // rechercheur.ts auf 'offen' um — das ist der ganze Unterschied zwischen den zwei Wegen.
    modus: 'whitelist',
    positivliste: [...VORGABE_POSITIVLISTE, ...zusaetzlich],
    seiteGrenzen: VORGABE_SEITE_GRENZEN,
  }
}

/** Nur fuer Tests: die Bindung an geprueften Adressen, ohne den Rest des Moduls. */
export { bindeAufAdressen }
