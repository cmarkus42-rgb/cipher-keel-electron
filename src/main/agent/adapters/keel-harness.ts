/**
 * keel-harness — der Adapter fuer keels eigene Schleife.
 *
 * Er haelt **keine** Lauf-Maschinerie. Die steht in harness-sitzung.ts und hat dort genau einen
 * Zusammenbau, den sich Harness-Fenster und Gitterzelle teilen. Dieser Adapter ist die Identitaet
 * der Laufzeit, ihr Niveau, ihre Verfuegbarkeit — und ein Startbefehl, der weiterreicht.
 *
 * Der Import von harness-sitzung.ts geschieht **lazy** — nicht um `electron` fernzuhalten: das
 * kommt ueber model/registry -> config/config-store ohnehin eifrig herein (und config-store
 * faengt ein fehlendes `app.getPath` bereits selbst in einem try/catch ab, siehe dort). Der
 * tragende Grund ist harness-sitzung.ts selbst: `harnessDb()` ruft `app.getPath('userData')`
 * und loest das better-sqlite3-Binding auf, beides ungeschuetzt, und das Modul zieht ueber
 * harness/index.ts die gesamte Lauf-Maschinerie nach (Werkzeuge, Codecs, Transport). Wer diesen
 * Adapter nur zum Aufzaehlen baut (model/ansicht.ts, settings/handlers.ts), soll dafuer nicht
 * die ganze Harness-Kette anstossen — genau wie ClaudeCodeAdapter seinen Statusline-Hook lazy
 * holt.
 */

import type {
  SchleifenSitzungsAdapter, SchleifenStartOpts, SchleifenStartErgebnis, ProjectInstructions,
} from '../agent-adapter'
import { SITZUNG_EIGENE_SCHLEIFE } from '../agent-adapter'
import type { AdapterFeature, AdapterCapabilities } from '../../../shared/types'
import { CapabilityNiveau } from '../../preset/niveau'
import { eintragFuerSitzung } from '../../model/registry'
import { slotFuerId, type SlotId } from '../../model/slots'
import { laeuferKannArt, sperrgrund } from '../../model/eignung'
import { platzNiveauBLeerText } from '../../model/sitzungsplatz-text'
import type { AppServices } from '../../window-manager'

const PLATZ: SlotId = 'sitzung:niveau-b'

export class KeelHarnessAdapter implements SchleifenSitzungsAdapter {
  readonly id = 'keel-harness'
  readonly displayName = 'keel-Harness'
  readonly tier = 'tier-2' as const
  readonly niveau = CapabilityNiveau.B
  readonly sitzungsart = SITZUNG_EIGENE_SCHLEIFE

  /**
   * Die Dienste des Hauptprozesses (Graph-DB, Netz). Ueber den Konstruktor hereingereicht statt
   * importiert, weil ansicht.ts eine Registry ohne sie baut — dort wird nur `displayName`
   * gebraucht, und ein Adapter, der zum Bauen einen Dienstbaum verlangt, waere dort nicht
   * konstruierbar. `starteAuftrag` ohne Dienste wirft benannt statt still nichts zu tun.
   */
  private readonly services: AppServices | null

  constructor(services: AppServices | null = null) {
    this.services = services
  }

  isAvailable(): boolean {
    return this.grundOderNull() === null
  }

  nichtVerfuegbarGrund(): string | null {
    return this.grundOderNull()
  }

  /**
   * Synchron und ohne E/A, wie das Interface es verlangt: es liest die Zuordnung und die
   * Eignungsmatrix. Es klopft an keinen Endpunkt — ein Adapter, der beim Aufzaehlen der
   * Gitterplaetze eine HTTP-Anfrage ausloest, waere eine Ueberraschung an der falschen Stelle.
   */
  private grundOderNull(): string | null {
    const eintrag = eintragFuerSitzung('niveau-b')
    if (!eintrag) {
      return platzNiveauBLeerText()
    }
    const laeufer = slotFuerId(PLATZ)!.laeufer
    if (!laeuferKannArt(laeufer, eintrag.art)) {
      // Kein neuer Text: die Regel hat schon einen, in eignung.ts.
      return `Der Platz zeigt auf '${eintrag.id}'. ${sperrgrund(laeufer, eintrag.art)}`
    }
    return null
  }

  async starteAuftrag(opts: SchleifenStartOpts): Promise<SchleifenStartErgebnis> {
    if (!this.services) {
      throw new Error(
        '[KeelHarnessAdapter] Ohne AppServices kann kein Lauf starten. Diese Instanz wurde nur ' +
        'zum Aufzaehlen gebaut (siehe model/ansicht.ts).',
      )
    }
    const { beauftrageSchleife } = await import('../../harness-sitzung')
    return beauftrageSchleife(opts, this.services)
  }

  brichAb(laufId: string): void {
    // Synchron, damit ein Abbruch nicht selbst auf einen dynamischen Import wartet: der Aufrufer
    // (SESSION_DESTROY) entfernt die Zelle unmittelbar danach.
    void import('../../harness-sitzung')
      .then(m => m.markiereAbbruch(laufId))
      .catch((err) => {
        // Nichts still verschlucken: scheitert der dynamische Import, verschwaende der
        // Abbruchwunsch sonst als unbehandelte Ablehnung, und der Lauf liefe unbemerkt weiter.
        console.error(
          `[KeelHarnessAdapter] Abbruch fuer Lauf '${laufId}' konnte nicht gesetzt werden:`,
          err instanceof Error ? err.message : String(err),
        )
      })
  }

  getProjectMarkers(): string[] {
    // keels Schleife liest ihre Faehigkeiten ueber `faehigkeit_lesen` aus der Laufwurzel; das
    // Verzeichnis ist dasselbe wie bei Claude Code, der Weg hinein ein anderer.
    return ['.claude']
  }

  async readProjectInstructions(_projectPath: string): Promise<ProjectInstructions | null> {
    // Die Anweisungen der Entitaet kommen ueber den stabilen Praefix herein (SchleifenStartOpts
    // .praefix), nicht aus einer Datei, die die Schleife selbst laese. Null ist hier die
    // ehrliche Antwort, kein fehlendes Feature.
    return null
  }

  supports(feature: AdapterFeature): boolean {
    return this.getCapabilities()[feature] === true
  }

  getCapabilities(): AdapterCapabilities {
    return {
      'mcp-injection': false,
      'status-line': false,
      'skip-permissions': false,
      // Der Rechercheur ist zwar ein Unterlauf, aber diese Faehigkeit meint, was
      // `buildWorkshopPromptFragment` und die Cyber-Factory-Orchestrierung darunter verstehen:
      // dass der Adapter *weitere Sitzungen* starten kann. Das kann keels Schleife nicht; sie
      // kapselt einen Unterlauf im eigenen Lauf. Ein `true` hier hiesse, der Cyber-Factory-Weg
      // duerfe dieser Zelle Worker-Auftraege geben — und das ist genau der Schritt, der nicht
      // zu diesem Plan gehoert (Spec §10).
      'sub-agents': false,
      'project-instructions': false,
      'message-bus-participant': false,
      'companion-mcp': false,
    }
  }

  buildWorkshopPromptFragment(): string { return '' }
  buildLauncherPromptFragment(): string { return '' }
  buildCyberFactoryPromptFragment(): string { return '' }
}
