/**
 * Workshop-Body — Sechs-Phasen-Flow.
 *
 * Kein Schritt wird übersprungen, auch bei einem einzigen Item.
 * Gilt für Bugfixing (phase: fixing) und Development (phase: development) gleichermaßen.
 *
 * CK-P4-009
 */

import type { WorkItem } from './routing'

/** Die sechs Phasen des Workshop-Flows (CK-P4-009). */
export type WorkshopPhase =
  | 'aufnehmen'
  | 'klassifizieren'
  | 'dispatchen'
  | 'monitoring'
  | 'completeness-gate'
  | 'konsolidieren'

export const WORKSHOP_PHASEN: readonly WorkshopPhase[] = [
  'aufnehmen',
  'klassifizieren',
  'dispatchen',
  'monitoring',
  'completeness-gate',
  'konsolidieren',
] as const

/** P1-Klassifikations-IDs (CK-P4-009, CK-P1-001). */
export type P1KlassifikationsTyp = 'BUG' | 'MFR' | 'NRF'

export interface P1KlassifikationsId {
  typ: P1KlassifikationsTyp
  /** Fortlaufende Nummer, 1-basiert */
  nummer: number
}

/** Erzeugt eine P1-formatierte Klassifikations-ID (z.B. 'BUG-001'). */
export function formatP1Id(id: P1KlassifikationsId): string {
  return `${id.typ}-${String(id.nummer).padStart(3, '0')}`
}

/** Monitoring-Konfiguration für Phase 4. */
export interface MonitoringConfig {
  /** Prüf-Intervall in Millisekunden (Default: 2,5 Min = 150_000 ms) */
  intervallMs: number
  /** Stuck-Heuristik: kein Fortschritt seit N ms → Retry (Default: 7 Min = 420_000 ms) */
  stuckSchwelleMs: number
  /** Maximale Retry-Versuche pro Item (Default: 2) */
  maxRetries: number
}

export const DEFAULT_MONITORING_CONFIG: MonitoringConfig = {
  intervallMs: 150_000,     // 2,5 Min (im Bereich 2-3 Min)
  stuckSchwelleMs: 420_000, // 7 Min
  maxRetries: 2,
}

/** Ergebnis des Completeness-Gates (Phase 5). */
export interface CompletenessGateErgebnis {
  bestanden: boolean
  /** Items, die weder gefixt noch explizit zurückgestellt wurden */
  nichtAdressiertItemIds: string[]
  /** Items mit fehlendem Testcase */
  ohneTestcaseItemIds: string[]
}

/** Phasen-Protokoll — wird von executeWorkshopFlow befüllt. */
export interface WorkshopFlowProtokoll {
  phasenDurchlaufen: WorkshopPhase[]
  klassifizierteItems: KlassifizierteItem[]
  dispatchteItems: string[]
  monitoringRunden: number
  gateErgebnis: CompletenessGateErgebnis | null
  konsolidierungsOutput: string | null
}

export interface KlassifizierteItem {
  item: WorkItem
  p1Id: string
  subsystem: string
}

/** Eingabe-Kontext für den Workshop-Flow. */
export interface WorkshopFlowInput {
  /** Items aus test-findings oder Development-Backlog */
  items: WorkItem[]
  /** Trigger-Phase (fixing oder development) */
  phase: 'fixing' | 'development'
  /** Monitoring-Konfiguration (optional, nutzt Defaults) */
  monitoringConfig?: Partial<MonitoringConfig>
  /** Max parallele Sessions (Default: Niveau-abhängig, hier als Override) */
  maxParallelSessions?: number
}

/**
 * Führt den Sechs-Phasen-Workshop-Flow durch.
 *
 * Alle sechs Phasen werden in jedem Lauf durchlaufen — unabhängig von der
 * Größe des Inputs. Klassifizierung, Gate und Konsolidierung sind nicht
 * überspringbar.
 *
 * @returns Vollständiges Phasen-Protokoll
 */
export function executeWorkshopFlow(input: WorkshopFlowInput): WorkshopFlowProtokoll {
  const protokoll: WorkshopFlowProtokoll = {
    phasenDurchlaufen: [],
    klassifizierteItems: [],
    dispatchteItems: [],
    monitoringRunden: 0,
    gateErgebnis: null,
    konsolidierungsOutput: null,
  }

  const monitoring: MonitoringConfig = {
    ...DEFAULT_MONITORING_CONFIG,
    ...input.monitoringConfig,
  }

  // Phase 1: Aufnehmen
  protokoll.phasenDurchlaufen.push('aufnehmen')
  const aufgenommeneItems = aufnehmen(input.items)

  // Phase 2: Klassifizieren/Plan
  protokoll.phasenDurchlaufen.push('klassifizieren')
  protokoll.klassifizierteItems = klassifizieren(aufgenommeneItems)

  // Phase 3: Dispatchen/Worker-steuern
  protokoll.phasenDurchlaufen.push('dispatchen')
  protokoll.dispatchteItems = dispatchen(protokoll.klassifizierteItems)

  // Phase 4: Monitoring
  protokoll.phasenDurchlaufen.push('monitoring')
  protokoll.monitoringRunden = monitoringPhase(protokoll.dispatchteItems, monitoring)

  // Phase 5: Completeness-Gate (nicht überspringbar)
  protokoll.phasenDurchlaufen.push('completeness-gate')
  protokoll.gateErgebnis = completenessGate(protokoll.klassifizierteItems)

  // Phase 6: Konsolidieren/Schreiben
  protokoll.phasenDurchlaufen.push('konsolidieren')
  protokoll.konsolidierungsOutput = konsolidieren(protokoll)

  return protokoll
}

/** Phase 1: Items aus Graph-Lesezugriff aufnehmen. */
function aufnehmen(items: WorkItem[]): WorkItem[] {
  return items
}

/** Phase 2: Items klassifizieren und P1-IDs vergeben. */
function klassifizieren(items: WorkItem[]): KlassifizierteItem[] {
  const zaehler: Record<P1KlassifikationsTyp, number> = { BUG: 0, MFR: 0, NRF: 0 }

  return items.map((item) => {
    zaehler[item.typ] += 1
    return {
      item,
      p1Id: formatP1Id({ typ: item.typ, nummer: zaehler[item.typ] }),
      subsystem: item.id.split('-')[0] ?? 'unbekannt',
    }
  })
}

/** Phase 3: Items dispatchen — gibt Item-IDs der dispatchten Items zurück. */
function dispatchen(klassifiziert: KlassifizierteItem[]): string[] {
  return klassifiziert.map((k) => k.item.id)
}

/**
 * Phase 4: Monitoring.
 * Gibt die Anzahl der Monitoring-Runden zurück.
 * In der Laufzeit würde hier auf Worker-Status gewartet werden.
 */
function monitoringPhase(
  _itemIds: string[],
  _config: MonitoringConfig
): number {
  // Mindestens eine Monitoring-Runde (auch bei 0 Items)
  return Math.max(1, _itemIds.length)
}

/** Phase 5: Completeness-Gate — prüft ob alle Items adressiert wurden. */
function completenessGate(klassifiziert: KlassifizierteItem[]): CompletenessGateErgebnis {
  // Im Test-Kontext: alle Items als adressiert betrachten (kein persistenter State)
  const nichtAdressiert = klassifiziert
    .filter((k) => k.item.stand !== 'abgeschlossen' && k.item.stand !== 'zurueckgestellt')
    .map((k) => k.item.id)

  return {
    bestanden: nichtAdressiert.length === 0,
    nichtAdressiertItemIds: nichtAdressiert,
    ohneTestcaseItemIds: [],
  }
}

/** Phase 6: Konsolidieren — erzeugt Fix-Report-Zusammenfassung. */
function konsolidieren(protokoll: WorkshopFlowProtokoll): string {
  const itemCount = protokoll.klassifizierteItems.length
  const gateBestanden = protokoll.gateErgebnis?.bestanden ?? false

  return [
    `# Workshop-Flow-Zusammenfassung`,
    `Items verarbeitet: ${itemCount}`,
    `Phasen durchlaufen: ${protokoll.phasenDurchlaufen.length}/6`,
    `Completeness-Gate: ${gateBestanden ? 'bestanden' : 'offen'}`,
  ].join('\n')
}

/**
 * Prüft ob alle sechs Phasen im Protokoll vorhanden sind.
 * Hilfsfunktion für Tests und Gate-Checks.
 */
export function allePhasenDurchlaufen(protokoll: WorkshopFlowProtokoll): boolean {
  return WORKSHOP_PHASEN.every((phase) => protokoll.phasenDurchlaufen.includes(phase))
}
