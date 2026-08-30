/**
 * kimi-code — der Adapter fuer Kimi Code (`@moonshot-ai/kimi-code`) in einem tmux-Pane.
 *
 * Der zweite CLI-Harness des Gartens, und der Grund, warum es ueberhaupt eine Wahl gibt:
 * keel startete bis hierher genau einen fremden Harness, und ein Werkzeug, das nur einen
 * Anbieter starten kann, ist ein goldener Kaefig (Spec 2026-08-30-paket-a-harness-wahl,
 * Abschnitt 1). Die Flaeche, an der ein Mensch den Harness waehlt, ist ausdruecklich NICHT
 * Teil dieser Strecke (A3, Spec Abschnitt 6) — dieser Adapter ist ueber
 * `getForRuntime('kimi-cli-tmux')` ansprechbar, aber kein Preset und keine Kachel waehlt ihn,
 * also startet ihn heute auch keine Sitzung. Im Settings-Fenster (Reiter CLI-Start) steht er
 * trotzdem: dort zaehlt `model/ansicht.ts` alle Adapter der Registry auf, nicht die
 * startbaren — sein Startparameter-Feld ist damit schon da, wenn A3 kommt.
 *
 * Drei Unterschiede zu ClaudeCodeAdapter tragen die Datei; alles andere ist gleich:
 *
 * 1. **Der Prompt ersetzt, er ergaenzt nicht.** Claude bekommt `--append-system-prompt-file`
 *    — das Wort *append* steht im Schalternamen. Kimis Agent-Datei-Rumpf **ist** der
 *    Systemprompt ("The body is the agent's system prompt, and it is rendered as a template
 *    each time the prompt is built"). Ohne Gegenmassnahme wuerfe unser Prompt Kimis eigenen
 *    Vorgabe-Prompt weg; der dokumentierte Platzhalter `${base_prompt}` als erste Zeile des
 *    Rumpfs macht aus "ersetzen" wieder "ergaenzen" (siehe `baueAgentDatei`).
 * 2. **Kein Modell.** Der Adapter uebergibt `-m` nie: welches Modell ein CLI benutzt, ist
 *    dessen eigene Sache (Spec Abschnitt 4) — den strukturellen Grund dahinter formuliert
 *    `sperrgrund` in model/eignung.ts, und dort allein. `--model` steht deshalb auch nicht
 *    in `appGesteuerteParameter`: wer je Sitzung festlegen will, traegt `-m <alias>` in die
 *    freien Startparameter ein. Ein trotzdem hereingereichtes `opts.model` wird benannt,
 *    nicht verschluckt.
 * 3. **Ein** MCP-Schreibpfad statt zwei: Kimi hat keinen `mcp`-Befehl, also faellt Claudes
 *    zweiter, nicht zurueckzunehmender CLI-Weg ersatzlos weg. Es bleibt
 *    `<projekt>/.kimi-code/mcp.json`. `~/.kimi-code/config.toml` wird nicht angefasst.
 *
 * Alle Schalter unten wurden am 2026-08-30 gegen `/opt/homebrew/bin/kimi`
 * (`@moonshot-ai/kimi-code@0.38.0`) beziehungsweise die offizielle Doku geprueft.
 */

import * as fs from 'fs'
import * as path from 'path'
import { SITZUNG_FREMDES_CLI } from '../agent-adapter'
import type {
  CliSitzungsAdapter,
  LaunchCommand,
  LaunchOpts,
  AdapterContext,
  McpEinspritzungsBeschreibung,
  ProjectInstructions,
  SendOpts,
  OutputEvent,
} from '../agent-adapter'
import type { AdapterFeature, AdapterCapabilities } from '../../../shared/types'
import { CapabilityNiveau } from '../../preset/niveau'
import { isCommandOnPath } from '../../util/exec-util'
import { describeMissingTool } from '../../util/missing-tool'
import { writeEntityPromptFile } from '../../session/prompt-file'
// Der Leser der freien Startparameter wohnt bei ClaudeCodeAdapter, weil er dort entstanden
// ist. Von dort geholt statt kopiert: zwei gleichlautende Schnittstellen waeren zwei
// Wahrheiten darueber, was ein Adapter aus der Konfiguration lesen darf.
import type { AgentConfigReader } from './claude-code'

/** Der Servername, unter dem keel seine zehn Werkzeuge eintraegt — derselbe wie bei Claude. */
const MCP_SERVERNAME = 'cipher-keel'

/**
 * Kimis dokumentierter Platzhalter fuer den Vorgabe-Systemprompt. In einfachen
 * Anfuehrungszeichen: TypeScript interpoliert hier nichts, Kimi schon.
 */
const BASIS_PLATZHALTER = '${base_prompt}'

/**
 * Der Kopf der Agent-Datei: Frontmatter, Basis-Platzhalter, Leerzeile. Als Array, weil die
 * Wache unten wissen muss, in welcher Zeile der Platzhalter steht — der Index wird daraus
 * abgeleitet (`indexOf`) statt danebengeschrieben. Ein gepflegter Zahlenwert und ein Array,
 * das sich aendert, laufen sonst irgendwann auseinander.
 */
function kopfZeilen(name: string): string[] {
  return [
    '---',
    `name: ${name}`,
    `description: Entitaets-Prompt aus cipher keel fuer die Sitzung ${name}.`,
    '---',
    BASIS_PLATZHALTER,
    '',
  ]
}

/** Wortlaut aus Spec Abschnitt 4. Erscheint, wenn ein Preset einen Tier-Platz aufgeloest hat. */
const MODELL_HINWEIS =
  'Der Tier-Platz gilt fuer diesen Harness nicht — Kimi Code waehlt sein Modell aus seiner ' +
  'eigenen Konfiguration. Fuer eine Festlegung je Sitzung: -m <alias> in den freien ' +
  'Startparametern.'

/**
 * Spec Abschnitt 3.4. Ein Betriebsbefund, kein Entwurfsdetail: keel kann die Rueckfrage nicht
 * umgehen und soll es nicht — es kann sie benennen, damit niemand mit einer Sitzung dasteht,
 * die gesund aussieht und die zehn Werkzeuge nicht hat.
 *
 * Er haengt an `mcpEinspritzung`, nicht am Startbefehl: die Rueckfrage folgt der geschriebenen
 * Datei, nicht der gebauten Kommandozeile. Am Startbefehl stuende der Satz auch dann, wenn gar
 * kein MCP-Server laeuft und niemand nach Vertrauen fragt — und ein Satz, der bei jedem Start
 * steht, wird zu einem, den niemand mehr liest.
 */
const TRUST_HINWEIS =
  'Kimi Code fragt beim Sitzungsstart in einem noch nicht vertrauten Ordner nach, ob den ' +
  'projektlokalen MCP-Servern vertraut wird; die Vorgabe ist "Don\'t trust". Wer die ' +
  'Rueckfrage wegklickt, hat eine Sitzung ohne die zehn keel-Werkzeuge.'

/**
 * Die Fortsetzen-Schalter in allen Schreibweisen, die commander.js annimmt — gebraucht, um sie
 * in den freien Startparametern des Nutzers zu erkennen, nicht um sie zu setzen.
 */
const ISTFORTSETZEN = /^(-S|-c|--session|--continue)(=|$)/

/**
 * Der Sitzungsname als kebab-case-Bezeichner fuer das `name`-Feld im Frontmatter.
 *
 * `name` ist im Frontmatter optional, aber nicht folgenlos: faellt es weg, leitet Kimi es aus
 * dem Dateinamen ab und **verwirft die Datei**, wenn dabei kein kebab-case herauskommt.
 * Deshalb wird es hier gesetzt statt dem Dateinamen ueberlassen — und normalisiert statt
 * durchgereicht.
 */
function kebabName(sessionName: string): string {
  const name = sessionName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (!name) {
    throw new Error(
      `[KimiCodeAdapter] Aus dem Sitzungsnamen '${sessionName}' laesst sich kein ` +
      'kebab-case-Name bilden. Kimi Code verwirft eine Agent-Datei, deren name-Feld keines ' +
      'ist — laut abbrechen statt eine Datei schreiben, die stumm liegen bleibt.'
    )
  }
  return name
}

/**
 * Die Wache aus Spec Abschnitt 3.2.
 *
 * Der Rumpf einer Agent-Datei wird als Template gerendert, also wird **jede** `${…}`-Sequenz
 * in unserem Entitaets-Prompt interpoliert — und unsere Prompts tragen Regeln, Beispiele und
 * potenziell Code. Zwei Wege waeren denkbar; maskieren scheidet aus, weil die Doku keine
 * Escape-Regel nennt und eine erfundene schlimmer waere als keine. Bleibt: erkennen und
 * benennen, mit Zeilennummer und Fundstelle. Laut scheitern statt still verfaelschen.
 *
 * Die Zeilennummern zaehlen die **Agent-Datei**, nicht den hereingereichten Prompt: das ist
 * die Datei, die es dann nicht gibt — aber auch die, deren Aufbau dieser Adapter kennt und
 * ueber die er reden kann, ohne zu raten, aus welchen Schichten der Prompt zusammengesetzt
 * wurde. Die ersten sechs Zeilen sind Frontmatter, Platzhalter und Leerzeile.
 */
function pruefeTemplateSequenzen(text: string, platzhalterZeile: number): void {
  const funde: string[] = []
  text.split('\n').forEach((zeile, i) => {
    if (i === platzhalterZeile && zeile === BASIS_PLATZHALTER) return
    let ab = zeile.indexOf('${')
    while (ab !== -1) {
      const zu = zeile.indexOf('}', ab)
      const roh = zu === -1 ? zeile.slice(ab) : zeile.slice(ab, zu + 1)
      funde.push(`Zeile ${i + 1}: ${roh.slice(0, 40)}`)
      ab = zeile.indexOf('${', ab + 2)
    }
  })
  if (funde.length === 0) return
  throw new Error(
    '[KimiCodeAdapter] Der zusammengesetzte Prompt enthaelt Sequenzen, die Kimi Code beim ' +
    `Rendern der Agent-Datei ersetzen wuerde: ${funde.join('; ')}. Der Rumpf einer ` +
    'Agent-Datei wird als Template gerendert, eine dokumentierte Maskierung gibt es nicht — ' +
    `erlaubt ist allein der von diesem Adapter selbst gesetzte ${BASIS_PLATZHALTER} in der ` +
    `Zeile ${platzhalterZeile + 1}.`
  )
}

/**
 * Der Text der Agent-Datei: Frontmatter, Basis-Platzhalter, Leerzeile, unser Prompt.
 *
 * Pflichtfeld im Frontmatter ist genau eines, `description`; `name` steht trotzdem da (siehe
 * `kebabName`). Beide Werte stammen aus dem normalisierten Namen und koennen deshalb kein
 * YAML zerlegen und keine Template-Sequenz einschleusen — die Wache laeuft trotzdem ueber
 * den ganzen Text, weil "kann nicht vorkommen" und "wird geprueft" nicht dasselbe sind.
 *
 * Rein und ohne E/A, damit die Wache ohne Dateisystem testbar ist; `schreibeAgentDatei`
 * darunter ist der Schreibweg.
 */
export function baueAgentDatei(sessionName: string, prompt: string): string {
  const kopf = kopfZeilen(kebabName(sessionName))
  const platzhalterZeile = kopf.indexOf(BASIS_PLATZHALTER)
  if (platzhalterZeile === -1) {
    // Nur erreichbar, wenn jemand den Platzhalter aus dem Kopf entfernt — dann ist der Prompt
    // aber ein Ersatz fuer Kimis Vorgabe-Prompt statt einer Ergaenzung, und das gehoert nicht
    // stillschweigend geschrieben.
    throw new Error(
      `[KimiCodeAdapter] Der Kopf der Agent-Datei enthaelt ${BASIS_PLATZHALTER} nicht mehr — ` +
      'ohne ihn ersetzt unser Prompt Kimis eigenen Vorgabe-Prompt, statt ihn zu ergaenzen.'
    )
  }
  const text = [...kopf, prompt].join('\n')
  pruefeTemplateSequenzen(text, platzhalterZeile)
  return text
}

/**
 * Schreibt die Agent-Datei und gibt ihren Pfad zurueck — der Pfad, der als `--agent-file`
 * an die Kommandozeile geht.
 *
 * Bewusst ueber `writeEntityPromptFile` (session/prompt-file.ts) statt ueber einen zweiten,
 * danebengestellten Schreiber: dort haengen die Ablage ausserhalb des Projektbaums (ein
 * versioniertes Projekt soll von einem Sitzungsstart nicht schmutzig werden), der Modus 0600,
 * die Wache gegen Pfadtrenner im Sitzungsnamen und — der eigentliche Grund —
 * `removeEntityPromptFile`, das SESSION_DESTROY beim Aufraeumen ruft. Ein eigener Ort haette
 * eine zweite Aufraeumstelle gebraucht, die niemand ruft. Was Kimi-eigen ist, ist der
 * **Inhalt**, und der entsteht hier.
 *
 * Der Dateiname (`<sitzung>.md`) spielt fuer Kimi keine Rolle, weil `name` im Frontmatter
 * gesetzt ist — nur ohne das Feld faellt Kimi auf den Dateinamen zurueck.
 */
export function schreibeAgentDatei(
  userDataPath: string,
  sessionName: string,
  prompt: string,
): string {
  return writeEntityPromptFile(userDataPath, sessionName, baueAgentDatei(sessionName, prompt))
}

export class KimiCodeAdapter implements CliSitzungsAdapter {
  readonly id = 'kimi-code'
  readonly displayName = 'Kimi Code'
  readonly tier = 'tier-2' as const
  /**
   * Niveau B, wie jeder Harness ausser Claude Code: Niveau A setzt das native
   * SKILL.md-Nachladen voraus. Kimi Code hat zwar eine eigene Skill-Entdeckung
   * (`--skills-dir`, Nutzer- und Projektverzeichnisse), ob sie unsere `.claude/`-Faehigkeiten
   * so laedt wie Niveau A es annimmt, ist aber nicht geprueft — und ein ungeprueftes A waere
   * ein Versprechen an die Entitaets-Aufloesung, das niemand eingeloest hat.
   */
  readonly niveau = CapabilityNiveau.B
  readonly sitzungsart = SITZUNG_FREMDES_CLI
  /**
   * Genau die Schalter, die dieser Adapter selbst anhaengt. `-m`/`--model` fehlt hier nicht
   * versehentlich: der Adapter setzt es nie, also ist es fuer den Nutzer frei — genau das ist
   * die Freiheit aus Spec Abschnitt 4.
   */
  readonly appGesteuerteParameter = ['--agent-file', '-S', '-c'] as const

  private readonly configReader: AgentConfigReader

  constructor(configReader: AgentConfigReader) {
    this.configReader = configReader
  }

  /**
   * Reihenfolge wie beim Claude-Adapter: freie Startparameter des Nutzers zuerst, danach die
   * von der App gesetzten Schalter.
   *
   * Die Unvereinbarkeit von `--agent-file` mit `-S`/`-c` steht woertlich im Hilfetext des
   * Binaries ("Cannot be combined with --session/--continue"). Beim Fortsetzen wird der
   * Prompt deshalb **weggelassen** — Kimi stellt den gebundenen Agenten selbst wieder her.
   * Wird beides zugleich verlangt, ist das ein Fehler des Aufrufers, und er wird laut: still
   * einen der beiden gewinnen zu lassen hiesse, entweder eine Sitzung ohne Entitaets-Prompt
   * zu starten oder eine Fortsetzung in eine neue Sitzung zu verwandeln.
   */
  buildLaunchCommand(opts: LaunchOpts): LaunchCommand {
    if (opts.forkFromClaudeSessionId) {
      throw new Error(
        '[KimiCodeAdapter] Ein Fork wurde verlangt, aber Kimi Code kennt kein Gegenstueck zu ' +
        '--fork-session: seine Befehlsliste hat nur -S/--session und -c/--continue, und beide ' +
        'setzen eine Sitzung fort, statt sie zu verzweigen.'
      )
    }

    const fortsetzen: string[] = []
    if (opts.resumeSessionId) {
      fortsetzen.push('-S', opts.resumeSessionId)
    } else if (opts.resume) {
      fortsetzen.push('-c')
    }

    if (opts.appendSystemPromptFile !== undefined) {
      if (!opts.appendSystemPromptFile) {
        // Wie beim Claude-Adapter: eine Sitzung ohne Entitaets-Prompt sieht aus wie eine
        // funktionierende und ist keine.
        throw new Error(
          '[KimiCodeAdapter] --agent-file wurde gesetzt, ist aber leer — ohne den ' +
          'Entitaets-Prompt wird hier nicht gestartet.'
        )
      }
      if (fortsetzen.length > 0) {
        const gegenstueck = opts.resumeSessionId ? '--session (-S)' : '--continue (-c)'
        throw new Error(
          `[KimiCodeAdapter] --agent-file und ${gegenstueck} wurden zugleich verlangt. Kimi ` +
          'Code laesst das nicht zu ("Cannot be combined with --session/--continue"), und ' +
          'dieser Adapter waehlt nicht selbst aus: beim Fortsetzen gehoert der ' +
          'Entitaets-Prompt weggelassen, Kimi stellt den gebundenen Agenten selbst wieder her.'
        )
      }
    }

    const getippt = this.configReader.getStartArgs(this.id)
    if (opts.appendSystemPromptFile) {
      // Dieselbe Unvereinbarkeit, nur aus der anderen Richtung: der Schalter kommt nicht vom
      // Aufrufer, sondern aus den freien Startparametern. Ohne diesen Wurf braeche Kimis
      // Parser ab — aber an der falschen Stelle: der Mensch saehe einen Parser-Fehler im Pane
      // statt der Erklaerung, und zwar erst beim Start.
      const kollision = getippt.find(a => ISTFORTSETZEN.test(a))
      if (kollision) {
        throw new Error(
          `[KimiCodeAdapter] In den freien Startparametern steht '${kollision}', und diese ` +
          'Sitzung bekommt --agent-file. Kimi Code laesst beides nicht zusammen zu ("Cannot ' +
          'be combined with --session/--continue"): ein fortgesetzter Lauf bringt seinen ' +
          'gebundenen Agenten selbst mit, ein neuer bekommt ihn ueber --agent-file. Der ' +
          'Parameter gehoert aus dem Feld heraus, wenn keel die Sitzungen anlegen soll.'
        )
      }
    }

    const args: string[] = [...getippt, ...fortsetzen]
    if (opts.appendSystemPromptFile) {
      args.push('--agent-file', opts.appendSystemPromptFile)
    }

    // Kein -m, aber auch kein Schweigen: ein Preset loest weiter einen Tier-Platz auf und
    // reicht das Ergebnis herein. Wer es hier still fallen liesse, haette einen Menschen, der
    // ein Modell eingestellt hat und ein anderes bekommt, ohne dass es irgendwo steht.
    //
    // Der Trust-Hinweis steht bewusst NICHT hier, sondern an `mcpEinspritzung` — siehe dort.
    // Deshalb bleibt das Feld weg, wenn es nichts zu sagen gibt, statt ein leeres Array zu
    // tragen: ein Hinweisfeld, das jeder Start setzt, liest bald niemand mehr.
    const hinweise = opts.model && opts.model.trim() ? [MODELL_HINWEIS] : undefined

    return { cmd: 'kimi', args, ...(hinweise ? { hinweise } : {}) }
  }

  /**
   * Der Kimi-eigene Teil des Entitaets-Prompts: er wird zur Agent-Datei (Frontmatter,
   * `${base_prompt}`, dann unser Text) statt roh geschrieben zu werden. Die Wache laeuft in
   * `baueAgentDatei`, also **vor** jedem Schreiben — eine abgewiesene Zusammensetzung
   * hinterlaesst keine halbgueltige Datei.
   *
   * Geschrieben wird ueber `writeEntityPromptFile` wie beim Claude-Weg, damit
   * `removeEntityPromptFile` in SESSION_DESTROY weiter aufraeumt: es loescht nach
   * Sitzungsname, nicht nach Inhalt oder Format, und trifft diese Datei deshalb unveraendert.
   */
  schreibeEntitaetsPromptDatei(
    userDataPath: string,
    sessionName: string,
    prompt: string,
  ): string {
    return schreibeAgentDatei(userDataPath, sessionName, prompt)
  }

  /**
   * Ein Ort, kein zweiter Weg — und ein Satz, den ein Mensch braucht, bevor er glaubt, seine
   * Sitzung habe die zehn Werkzeuge. `nichtZuruecknehmbarerRest` bleibt leer, weil es hier
   * nichts gibt, das eine Ruecknahme nicht erreicht: Kimi Code hat keinen mcp-Befehl.
   */
  readonly mcpEinspritzung: McpEinspritzungsBeschreibung = {
    ort: '.kimi-code/mcp.json',
    vertrauensHinweis: TRUST_HINWEIS,
  }

  /**
   * Traegt den MCP-Server in die **projektlokale** `<projekt>/.kimi-code/mcp.json` ein, damit
   * eine von SESSION_CREATE gestartete Sitzung die zehn Werkzeuge erreicht.
   *
   * Ein Schreibpfad, nicht zwei: Kimi Codes Befehlsliste kennt keinen `mcp`-Befehl (`provider`
   * verwaltet nur LLM-Anbieter), es gibt also kein Gegenstueck zu `claude mcp add-json`. Die
   * Nutzerebene `~/.kimi-code/mcp.json` und erst recht `~/.kimi-code/config.toml` bleiben
   * unberuehrt: bei Namensgleichheit gewinnt ohnehin die Projektebene, und eine Sitzung, die
   * beim Start in die Anbieter-Konfiguration des Nutzers schriebe, waere etwas kategorisch
   * anderes als eine, die eine projektlokale Datei anfasst.
   *
   * Laeuft **vor** `tmux.createSession` — nicht danach, trotz des Methodennamens (siehe den
   * Vertrag in agent-adapter.ts und den Aufrufer in ipc-handlers.ts): der CLI-Prozess liest
   * seine MCP-Konfiguration bei seinem eigenen Start. Nichts hier braucht eine lebende
   * Sitzung; `ctx.sessionId` wird nicht gelesen.
   *
   * Die Ruecknahme stellt den **Eintrag** `cipher-keel` auf seinen Vorzustand zurueck
   * (loeschen, wenn er vorher fehlte; vorherigen Wert wiederherstellen, wenn er da war) — kein
   * blindes Loeschen: ein Bearer-Schluessel wird je App-Start einmal erzeugt und von allen
   * Sitzungen eines Projekts geteilt, der ueberschriebene Eintrag kann also der einer
   * Schwestersitzung sein, die eingespritzt wurde und deren Prozess noch nicht gelesen hat.
   * Der `boolean` bedeutet den einen Satz vom Interface und nichts Weiteres: die von dieser
   * Methode geschriebene Konfiguration traegt keinen Eintrag aus diesem Versuch mehr. `true`
   * deckt auch die trivialen Faelle (nichts geschrieben, Datei nicht mehr da); `false` heisst
   * "konnte ich nicht feststellen" und nennt den Grund auf der Konsole.
   *
   * Der Modus 0600 gilt nur fuer eine Datei, die dieser Aufruf **anlegt**: eine schon
   * vorhandene wird nicht umgestellt. Ihre Rechte hat jemand anderes gesetzt, und ein
   * Sitzungsstart ist kein guter Anlass, das zu uebergehen.
   *
   * **Was hier bewusst in Kauf genommen wird, damit es nicht unausgesprochen bleibt:** dieser
   * Schreibvorgang legt einen gueltigen Bearer-Schluessel in den Projektbaum des Nutzers.
   * prompt-file.ts argumentiert in seinem Modulkopf ueber genau dieses Problem und weicht ihm
   * aus — der Entitaets-Prompt landet deshalb unter `userData`. Hier geht das nicht: die Datei
   * muss dort liegen, wo Kimi Code sie liest, und das ist das Projekt. Der Unterschied zu
   * Claudes `.claude/settings.local.json` ist nicht die Art der Offenlegung, sondern ihre
   * Bekanntheit: `.claude/` steht in vielen `.gitignore`-Dateien, `.kimi-code/` in so gut wie
   * keiner. Ein versehentliches Einchecken ist damit wahrscheinlicher, nicht anders. Dieser
   * Adapter aendert deshalb **nichts** an der `.gitignore` des Nutzers — ein Werkzeug, das
   * ungefragt in die Versionskontrolle eines fremden Projekts schreibt, waere der groessere
   * Uebergriff. Selbstbegrenzend ist die Offenlegung ohnehin: der Schluessel wechselt bei
   * jedem App-Start (B2), ein eingecheckter Eintrag ist also spaetestens dann wertlos —
   * wertlos, nicht weg. Ob daraus etwas folgt (ein Hinweis beim ersten Start, ein Vorschlag
   * fuer die `.gitignore`), gehoert zu A3 und nicht hierher.
   */
  async postLaunchInjection(ctx: AdapterContext): Promise<() => boolean> {
    const eintrag = {
      url: ctx.mcpUrl,
      headers: { Authorization: `Bearer ${ctx.mcpApiKey}` },
    }

    let ruecknahme: (() => boolean) | null = null
    try {
      const verzeichnis = path.join(ctx.projectPath, '.kimi-code')
      const dateiPfad = path.join(verzeichnis, 'mcp.json')

      fs.mkdirSync(verzeichnis, { recursive: true })

      let konfig: Record<string, unknown> = {}
      try {
        const gelesen: unknown = JSON.parse(fs.readFileSync(dateiPfad, 'utf-8'))
        // Nur ein Objekt kann Traeger von mcpServers sein. Eine Datei mit `7` oder `[]` darin
        // wuerde beim Setzen der Eigenschaft werfen; hier faengt sie ein frisches Objekt ab.
        if (gelesen && typeof gelesen === 'object' && !Array.isArray(gelesen)) {
          konfig = gelesen as Record<string, unknown>
        }
      } catch {
        // Datei fehlt oder ist kein JSON — frisch anfangen.
      }

      if (!konfig.mcpServers || typeof konfig.mcpServers !== 'object') {
        konfig.mcpServers = {}
      }
      const server = konfig.mcpServers as Record<string, unknown>
      const hatteEintrag = Object.prototype.hasOwnProperty.call(server, MCP_SERVERNAME)
      const vorherigerEintrag = server[MCP_SERVERNAME]

      server[MCP_SERVERNAME] = eintrag
      fs.writeFileSync(dateiPfad, JSON.stringify(konfig, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
      })

      ruecknahme = () => {
        // Neu einlesen statt das Objekt von oben wiederzuverwenden: zwischen Schreiben und
        // Ruecknahme kann jemand anderes an der Datei gewesen sein, und eine Ruecknahme gegen
        // eine veraltete Kopie wuerde dessen Aenderung ueberschreiben.
        let aktuell: Record<string, unknown>
        try {
          aktuell = JSON.parse(fs.readFileSync(dateiPfad, 'utf-8'))
        } catch (err) {
          // ENOENT ist der eine Lesefehler, bei dem der zugesagte Satz beweisbar stimmt: eine
          // Datei, die es nicht gibt, traegt keinen Eintrag. Jeder andere Fehler — unlesbar,
          // kaputtes JSON, und kaputtes JSON ist der gefaehrliche Fall, weil eine halb
          // geschriebene Datei den Bearer woertlich enthalten kann — laesst den Eintrag
          // moeglicherweise liegen.
          if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return true
          console.warn(
            '[KimiCodeAdapter] Ruecknahme konnte .kimi-code/mcp.json nicht lesen — der ' +
            'cipher-keel-Eintrag kann noch dort liegen:',
            err,
          )
          return false
        }
        if (!aktuell.mcpServers || typeof aktuell.mcpServers !== 'object') {
          console.warn(
            '[KimiCodeAdapter] Ruecknahme fand kein mcpServers-Objekt in .kimi-code/mcp.json ' +
            '— Datei unberuehrt gelassen; der cipher-keel-Eintrag kann noch dort liegen',
          )
          return false
        }
        const aktuelleServer = aktuell.mcpServers as Record<string, unknown>
        if (hatteEintrag) {
          aktuelleServer[MCP_SERVERNAME] = vorherigerEintrag
        } else {
          delete aktuelleServer[MCP_SERVERNAME]
        }
        // Ein Wurf geht an den Aufrufer durch, der ihn wie `false` behandelt.
        fs.writeFileSync(dateiPfad, JSON.stringify(aktuell, null, 2), 'utf-8')
        return true
      }
    } catch (err) {
      console.warn('[KimiCodeAdapter] Schreiben von .kimi-code/mcp.json fehlgeschlagen:', err)
    }

    return () => {
      // Es wurde gar nicht geschrieben (der eigene catch oben hat gegriffen) — dann stimmt der
      // zugesagte Satz trivial: dieser Aufruf hat keinen Eintrag hinterlassen.
      if (!ruecknahme) return true
      return ruecknahme()
    }
  }

  /**
   * `.kimi-code` ist das projektlokale Konfigurationsverzeichnis — belegt, weil die
   * MCP-Einspritzung oben genau dorthin schreibt. Eine Projektanweisungs-Datei nach Art von
   * CLAUDE.md ist fuer Kimi Code **nicht** belegt und wird hier nicht geraten.
   */
  getProjectMarkers(): string[] {
    return ['.kimi-code']
  }

  /**
   * Null, weil unbekannt: welche Datei Kimi Code als Projektanweisung liest, wurde nicht
   * belegt, und ein geratener Dateiname waere hier schlimmer als eine ehrliche Fehlanzeige —
   * er wuerde beim ersten Treffer fremden Text als Projektanweisung ausgeben.
   * `getCapabilities` sagt dasselbe mit `'project-instructions': false`.
   */
  async readProjectInstructions(_projectPath: string): Promise<ProjectInstructions | null> {
    return null
  }

  supports(feature: AdapterFeature): boolean {
    return this.getCapabilities()[feature] === true
  }

  /**
   * Ehrlich statt grosszuegig: wahr ist genau das, was in dieser Datei auch gebaut ist.
   */
  getCapabilities(): AdapterCapabilities {
    return {
      // Gebaut: postLaunchInjection schreibt .kimi-code/mcp.json.
      'mcp-injection': true,
      // Kein Haken: die Statuszeile haengt an Claude Codes Hook-Mechanik
      // (monitoring/statusline-hook.ts). Deshalb fehlen hier auch attachStatusHook und
      // getContextUsage — beide sind auf CliSitzungsAdapter optional.
      'status-line': false,
      // Kimi hat -y/--auto, aber dieser Adapter haengt nichts dergleichen an. Wer es will,
      // traegt es in die freien Startparameter ein; eine Faehigkeit ist das nicht.
      'skip-permissions': false,
      // Meint "kann weitere Sitzungen starten", wie es Werkstatt und Cyber Factory darunter
      // verstehen. Dafuer gibt es hier keine Prompt-Fragmente, also auch keine Zusage.
      'sub-agents': false,
      'project-instructions': false,
      'message-bus-participant': false,
      'companion-mcp': false,
    }
  }

  async sendPrompt(_tmuxTarget: string, _prompt: string, _opts?: SendOpts): Promise<void> {
    // Wie bei Claude Code: der eigentliche Versand laeuft ueber SessionManager.sendKeys. Die
    // Methode steht hier fuer Adapter, die den Prompt eigens rahmen muessen (etwa JSON-RPC).
    throw new Error('sendPrompt should be called via SessionManager.sendKeys')
  }

  isAvailable(): boolean {
    return isCommandOnPath('kimi')
  }

  nichtVerfuegbarGrund(): string | null {
    return this.isAvailable() ? null : describeMissingTool('kimi')
  }

  async executeCommand(_command: string): Promise<string> {
    throw new Error(
      '[KimiCodeAdapter] executeCommand must be called via SessionManager — ' +
      'tmux-based delivery is handled there, not on the adapter directly.'
    )
  }

  async *streamOutput(_sessionId: string): AsyncGenerator<OutputEvent> {
    throw new Error(
      '[KimiCodeAdapter] streamOutput must be called via the tmux output-batcher — ' +
      'tmux-based output capture is handled there, not on the adapter directly.'
    )
  }

  /**
   * Die drei Prompt-Fragmente sind leer, und das ist eine Antwort, keine Luecke: Werkstatt und
   * Cyber Factory sagen einer Sitzung, wie sie **weitere** Sitzungen startet, und genau das
   * sagt `getCapabilities` mit `'sub-agents': false` ab. Ein Text, der Kimi-Sitzungen anweist,
   * Worker zu starten, waere eine Zusage ohne Deckung. Fuer den Launcher gilt dasselbe: `/launch`
   * ist Claude Codes eigener Slash-Befehl; ob Kimi Code einen entsprechenden hat, ist nicht
   * belegt.
   */
  buildWorkshopPromptFragment(): string { return '' }
  buildLauncherPromptFragment(): string { return '' }
  buildCyberFactoryPromptFragment(): string { return '' }
}
