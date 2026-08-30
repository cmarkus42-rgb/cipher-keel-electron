/**
 * harness-platz — der Platz, an dem ein Mensch waehlt, welches fremde CLI eine Sitzung faehrt.
 *
 * **Neben `SLOTS` (model/slots.ts), nicht darin.** Jeder Platz dort zielt auf einen
 * Registry-Eintrag — ein Modell —, und seine Optionen werden ueber eignung.ts gefiltert
 * (Laeufer, Niveau, Anbieterart). Ein Harness ist kein Modelleintrag, sondern ein Adapter. Ihn
 * in dieselbe Liste zu haengen hiesse, `Slot` zwei verschiedene Dinge bedeuten zu lassen und
 * Eignungsregeln auf etwas anzuwenden, ueber das sie nichts aussagen — dieselbe Verwechslung,
 * an der der Befund vom 2026-08-23 hing (ein Tier-Platz, der ein Modell waehlt, aber nicht das
 * CLI).
 *
 * Der eigene Typ ist dabei nicht teurer, sondern billiger:
 *
 * - Die Optionen kommen aus der `AdapterRegistry`, gefiltert auf die CLI-Adapter.
 *   `istSchleifenAdapter` schliesst keels eigene Schleife aus — sie ist kein Harness zum
 *   Wechseln, sondern eine andere Sitzungsart.
 * - Der Sperrgrund existiert schon: jeder Adapter hat `isAvailable()` und
 *   `nichtVerfuegbarGrund()`, auf Deutsch und genau in der Form, die das Fenster ohnehin als
 *   `sperrgrund` rendert. Kein Wort neuer Regellogik.
 * - Kein `eignung`-Aufruf, also keine zweite Quelle fuer die Laeufer-Regeln. Der Waechter
 *   tests/model/eignung-einzige-quelle.test.ts bleibt unberuehrt.
 *
 * Entwurf: docs/superpowers/specs/2026-08-30-a3-harness-platz-und-infoknoepfe-design.md §1-§2.
 */

import { istSchleifenAdapter, type AgentAdapter } from '../agent/agent-adapter'
import type { AdapterRegistry } from '../agent/registry'

export interface HarnessPlatz {
  readonly id: string
  /** Deutsch: dieser Text erreicht den Nutzer. */
  readonly beschriftung: string
  /**
   * Wie bei den Tiers und der Niveau-B-Sitzung: gelesen beim Sitzungsstart. Ein laufender Pane
   * hat seinen Prozess schon gestartet, an dessen Kommandozeile nichts mehr zu aendern ist.
   */
  readonly wirkung: 'sofort' | 'naechste-session'
  /** Deutsch: was der Platz tut — und was ausdruecklich nicht. */
  readonly erklaertext: string
  /** Deutsch: was gilt, solange nichts gewaehlt ist. */
  readonly rueckfallText: string
  /**
   * Derselbe Sachverhalt in Beschriftungslaenge, fuer den leeren Eintrag im Auswahlfeld.
   *
   * Zwei Felder statt einer Kuerzung im Renderer: `rueckfallText` erklaert in zwei Saetzen,
   * eine Option traegt eine Zeile. Wer dort kuerzt, erfindet die zweite Fassung an der einen
   * Stelle, die laut ihrem eigenen Kopfkommentar keinen Text erfinden darf
   * (settings-window.tsx). Beide Fassungen stehen deshalb hier nebeneinander, wo sie beim
   * Umformulieren zusammen ins Auge fallen.
   */
  readonly rueckfallKurz: string
}

export const HARNESS_PLATZ: HarnessPlatz = {
  id: 'harness:sitzung',
  beschriftung: 'Harness — womit eine Sitzung läuft',
  wirkung: 'naechste-session',
  erklaertext:
    'Die Wahl zwischen den fremden CLI-Harnessen. Sie greift nur bei Presets, deren Laufzeit ' +
    'ohnehin ein fremdes CLI startet — eine Niveau-B-Zelle, die keels eigene Schleife fährt, ' +
    'bleibt unangetastet. Der Platz wählt zwischen fremden CLIs, nicht zwischen Sitzungsarten. ' +
    'Ein Kimi-Harness liest die Tier-Plätze nicht; das sagt der Adapter beim Start als Hinweis.',
  rueckfallText:
    'Keine Wahl — es gilt die Laufzeit des Presets. Das ist die Vorgabe, also genau das ' +
    'bisherige Verhalten: wer nichts einstellt, merkt nichts.',
  rueckfallKurz: '— keine Wahl, es gilt die Laufzeit des Presets —',
}

export interface HarnessOption {
  adapterId: string
  /** Der Anzeigename des Adapters, nicht seine Kennung. */
  name: string
  /** Deutsch. Nicht-null heisst: gesperrt, und das hier ist der Grund. */
  sperrgrund: string | null
}

/**
 * Der Sperrgrund einer Option — vom Adapter, nicht von hier.
 *
 * Der Ersatztext greift nur, wenn ein Adapter sich fuer nicht verfuegbar erklaert und den
 * Grund verschweigt; das waere ein Vertragsbruch auf seiner Seite (siehe
 * `nichtVerfuegbarGrund` in agent/agent-adapter.ts) und kein Fall, fuer den diese Stelle
 * eigenen Text erfinden sollte. Dieselbe Konstruktion steht in SESSION_CREATE.
 */
function sperrgrundVon(adapter: AgentAdapter): string | null {
  if (adapter.isAvailable()) return null
  return adapter.nichtVerfuegbarGrund() ??
    `„${adapter.displayName}“ ist auf diesem Rechner nicht verfügbar.`
}

/** Die waehlbaren Harnesse: alle CLI-Adapter der Registry, samt Sperrgrund. */
export function harnessOptionen(registry: AdapterRegistry): HarnessOption[] {
  const optionen: HarnessOption[] = []
  for (const id of registry.listIds()) {
    const adapter = registry.get(id)
    if (!adapter || istSchleifenAdapter(adapter)) continue
    optionen.push({
      adapterId: adapter.id,
      name: adapter.displayName,
      sperrgrund: sperrgrundVon(adapter),
    })
  }
  return optionen
}

/**
 * Prueft eine Wahl, bevor sie gespeichert wird — und ist damit auch die Stelle, die sagt, was
 * ueberhaupt waehlbar ist. Gibt den geprueften Wert zurueck, damit der Aufrufer nicht die
 * ungeprueften Rohdaten weiterschreibt.
 *
 * Leer ist zulaessig und ist die Vorgabe: sie heisst „das Preset entscheidet".
 */
export function pruefeHarnessWahl(registry: AdapterRegistry, adapterId: string): string {
  if (adapterId === '') return ''
  const adapter = registry.get(adapterId)
  if (!adapter) {
    throw new Error(`Kein registrierter Adapter mit der Kennung '${adapterId}'.`)
  }
  if (istSchleifenAdapter(adapter)) {
    throw new Error(
      `'${adapterId}' ist keels eigene Schleife und kein fremder Harness. Welches Modell sie ` +
      `fährt, steht am Platz „Sitzung Niveau B" — dieser Platz wählt zwischen fremden CLIs.`
    )
  }
  return adapterId
}

/**
 * Die eine Stelle, an der der Harness einer neuen Sitzung feststeht — der bisherige
 * `adapterRegistry.getForRuntime(rahmen.runtime)` mit dem Platz davor.
 *
 * **Die Regel, und sie ist die wichtigste des Entwurfs (§2):** der Harness-Platz uebersteuert
 * **nur dann**, wenn die Laufzeit des Presets ohnehin auf einen CLI-Adapter zeigt. Ein Preset
 * mit der Laufzeit der eigenen Schleife ist eine Niveau-B-Zelle, kein fremder Prozess in einem
 * Pane; wuerde der Platz auch die uebersteuern, machte die Wahl „Kimi" jede Niveau-B-Gitterzelle
 * kaputt. Deshalb steht die Aufloesung der Laufzeit *vor* jeder Beruecksichtigung der Wahl —
 * und deshalb bleibt auch der Zweig „gueltig, aber Adapter nicht gebaut" in `getForRuntime`
 * (Codex, Gemini) unumgangen: eine unbekannte oder ungebaute Laufzeit scheitert dort wie
 * bisher, auch mit gesetztem Platz.
 *
 * Was passiert, wenn der gewaehlte Harness nicht verfuegbar ist: nichts Neues. Die
 * `isAvailable()`-Pruefung in SESSION_CREATE laeuft ohnehin vor jeder Verzweigung und
 * scheitert benannt mit `nichtVerfuegbarGrund()`.
 */
export function loeseHarnessAuf(
  registry: AdapterRegistry, runtime: string | undefined, gewaehlt: string,
): AgentAdapter {
  const ausPreset = registry.getForRuntime(runtime)
  if (istSchleifenAdapter(ausPreset)) return ausPreset
  if (gewaehlt === '') return ausPreset
  // Dieselbe Pruefung wie auf dem Schreibweg. Eine von Hand verstellte Konfigurationsdatei
  // scheitert hier benannt, statt still auf das Preset zurueckzufallen — eine stumm
  // uebergangene Einstellung waere die schlechtere Auskunft.
  return registry.get(pruefeHarnessWahl(registry, gewaehlt))!
}
