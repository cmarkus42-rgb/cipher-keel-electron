/**
 * Rolling Summary — Pflicht-Capability für den Workshop.
 *
 * Die Summary lebt als Note (noteType: 'rolling-summary', Tag: kind:workshop-summary).
 * Sie wird bei jedem Trigger überschrieben — kein Akkumulieren.
 * Neue Sessions lesen die Summary als erstes und rekonstruieren den State.
 *
 * CK-P4-007
 */

import type { WorkItem, RoutingDecision } from './routing'

/** Trigger-Ereignisse für eine Summary-Aktualisierung. */
export type SummaryUpdateTrigger =
  | 'item-abgeschlossen'
  | 'routing-entscheidung'
  | 'kontext-druck'    // > 70% Kontextfenster
  | 'neues-buendel'

/** State-Snapshot, der in der Summary komprimiert gespeichert wird. */
export interface WorkshopState {
  sessionId: string
  erledigteItems: string[]
  itemsInArbeit: string[]
  eskaliertItems: string[]
  routingEntscheidungen: RoutingDecision[]
  offeneFragen: string[]
  /** ISO-Timestamp der letzten Aktualisierung */
  letzteAktualisierung: string
}

/** Eine Rolling-Summary-Note. */
export interface RollingSummaryNote {
  noteType: 'rolling-summary'
  /** Tag für das Notes-System */
  tag: 'kind:workshop-summary'
  /** Komprimierter State als Markdown */
  inhalt: string
  /** Session-ID des zugehörigen Workshop-Laufs */
  sessionId: string
  /** Zeitstempel der letzten Aktualisierung */
  aktualisiertAm: string
}

/**
 * Erstellt den Markdown-Inhalt der Rolling Summary aus dem aktuellen State.
 * Wird bei jedem Update neu erzeugt (Überschreiben statt Akkumulieren).
 */
export function renderRollingSummary(state: WorkshopState): string {
  const zeilen: string[] = [
    `# Workshop Rolling Summary`,
    `Session: ${state.sessionId}`,
    `Stand: ${state.letzteAktualisierung}`,
    '',
    `## Erledigt (${state.erledigteItems.length})`,
    ...state.erledigteItems.map((id) => `- ${id}`),
    '',
    `## In Arbeit (${state.itemsInArbeit.length})`,
    ...state.itemsInArbeit.map((id) => `- ${id}`),
    '',
    `## Eskaliert (${state.eskaliertItems.length})`,
    ...state.eskaliertItems.map((id) => `- ${id}`),
  ]

  if (state.routingEntscheidungen.length > 0) {
    zeilen.push('', `## Routing-Entscheidungen (${state.routingEntscheidungen.length})`)
    for (const re of state.routingEntscheidungen) {
      zeilen.push(`- ${re.itemId} → ${re.ziel}: ${re.begruendung}`)
    }
  }

  if (state.offeneFragen.length > 0) {
    zeilen.push('', `## Offene Fragen`)
    for (const frage of state.offeneFragen) {
      zeilen.push(`- ${frage}`)
    }
  }

  return zeilen.join('\n')
}

/**
 * Erzeugt eine neue Rolling-Summary-Note aus dem aktuellen Workshop-State.
 */
export function createRollingSummaryNote(state: WorkshopState): RollingSummaryNote {
  return {
    noteType: 'rolling-summary',
    tag: 'kind:workshop-summary',
    inhalt: renderRollingSummary(state),
    sessionId: state.sessionId,
    aktualisiertAm: state.letzteAktualisierung,
  }
}

/**
 * Aktualisiert den Workshop-State nach einem Item-Abschluss.
 * Gibt einen neuen State zurück (immutable update).
 */
export function updateStateNachItem(
  state: WorkshopState,
  item: WorkItem
): WorkshopState {
  return {
    ...state,
    erledigteItems: [...state.erledigteItems, item.id],
    itemsInArbeit: state.itemsInArbeit.filter((id) => id !== item.id),
    letzteAktualisierung: new Date().toISOString(),
  }
}

/**
 * Aktualisiert den Workshop-State nach einer Routing-Entscheidung.
 * Gibt einen neuen State zurück (immutable update).
 */
export function updateStateNachRoutingEntscheidung(
  state: WorkshopState,
  decision: RoutingDecision
): WorkshopState {
  const eskaliertItems = decision.ziel === 'cf-eskalation'
    ? [...state.eskaliertItems, decision.itemId]
    : state.eskaliertItems

  return {
    ...state,
    routingEntscheidungen: [...state.routingEntscheidungen, decision],
    eskaliertItems,
    letzteAktualisierung: new Date().toISOString(),
  }
}

/**
 * Prüft ob ein Summary-Update ausgelöst werden soll.
 *
 * @param kontextAuslastung - Aktuelle Kontext-Auslastung (0.0 bis 1.0)
 */
export function sollteAktualisieren(
  trigger: SummaryUpdateTrigger,
  kontextAuslastung: number = 0
): boolean {
  if (trigger === 'item-abgeschlossen') return true
  if (trigger === 'routing-entscheidung') return true
  if (trigger === 'neues-buendel') return true
  if (trigger === 'kontext-druck' && kontextAuslastung > 0.7) return true
  return false
}

/**
 * Erzeugt einen leeren initialen Workshop-State.
 */
export function createInitialState(sessionId: string): WorkshopState {
  return {
    sessionId,
    erledigteItems: [],
    itemsInArbeit: [],
    eskaliertItems: [],
    routingEntscheidungen: [],
    offeneFragen: [],
    letzteAktualisierung: new Date().toISOString(),
  }
}
