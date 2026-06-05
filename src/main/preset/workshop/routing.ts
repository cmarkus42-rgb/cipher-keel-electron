/**
 * Workshop-Routing-Hoheit — CK-P4-002
 *
 * Der Workshop entscheidet eigenständig über das Routing:
 *   - intern:        Triviale Items, der Workshop oder ein Worker bearbeitet selbst
 *   - debugger:      Klare Bugs mit Tiefenbedarf — kein SE-Gate
 *   - cf-eskalation: Architektur-Impact — routing-entscheidung Knoten + SE-Info
 *
 * Vor CF-Eskalation: Graph-Knoten schreiben + SE informieren (nicht fragen).
 */

/** Die drei Routing-Ziele des Workshops. */
export type RoutingZiel = 'intern' | 'debugger' | 'cf-eskalation'

/** Stand eines Work-Items im Workshop-Flow. */
export type ItemStand =
  | 'neu'
  | 'klassifiziert'
  | 'in-arbeit'
  | 'zurueckgestellt'
  | 'eskaliert'
  | 'abgeschlossen'

/**
 * Pflichtfelder einer Routing-Entscheidung (CK-P4-002).
 * Alle fünf Felder müssen gesetzt sein — kein Feld darf leer sein.
 */
export interface RoutingDecision {
  /** Woher kommt dieses Item (z.B. 'test-findings', 'workshop-triage') */
  quelle: string
  /** Wohin wird es geroutet */
  ziel: RoutingZiel
  /** P1-Item-ID (z.B. 'BUG-001', 'MFR-002') */
  itemId: string
  /** Begründung für diese Routing-Entscheidung */
  begruendung: string
  /** Aktueller Stand des Items */
  stand: ItemStand
}

/** Ein Work-Item, das der Workshop verarbeitet. */
export interface WorkItem {
  /** P1-Item-ID */
  id: string
  /** Kurzbeschreibung */
  titel: string
  /** Klassifikations-Typ */
  typ: 'BUG' | 'MFR' | 'NRF'
  /** Aktueller Stand */
  stand: ItemStand
  /** Optional: ID des zugehörigen Graph-Knotens */
  graphNodeId?: string
}

/** Ergebnis von createRoutingNode — ID des erzeugten Graph-Knotens. */
export type RoutingNodeId = string

/** Minimales Interface für Graph-DB-Operationen beim Routing. */
export interface RoutingGraphDb {
  createNode(
    labels: string[],
    properties: Record<string, string>
  ): RoutingNodeId
}

/**
 * Validiert eine Routing-Entscheidung auf Vollständigkeit.
 * Alle fünf Pflichtfelder müssen nicht-leer sein.
 */
export function validateRoutingDecision(decision: RoutingDecision): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (!decision.quelle?.trim()) errors.push('quelle darf nicht leer sein')
  if (!decision.ziel) errors.push('ziel muss gesetzt sein')
  if (!decision.itemId?.trim()) errors.push('itemId darf nicht leer sein')
  if (!decision.begruendung?.trim()) errors.push('begruendung darf nicht leer sein')
  if (!decision.stand) errors.push('stand muss gesetzt sein')
  return { valid: errors.length === 0, errors }
}

/**
 * Führt die Routing-Entscheidung für ein Work-Item aus.
 *
 * - intern/debugger: kein SE-Gate, Entscheidung wird direkt ausgeführt
 * - cf-eskalation:   routing-entscheidung Knoten wird erzeugt, SE wird informiert
 *
 * @throws wenn die RoutingDecision ungültig ist
 */
export function routeItem(item: WorkItem, decision: RoutingDecision): void {
  const validation = validateRoutingDecision(decision)
  if (!validation.valid) {
    throw new Error(
      `Ungültige Routing-Entscheidung für Item '${item.id}': ${validation.errors.join(', ')}`
    )
  }

  if (decision.ziel === 'intern' || decision.ziel === 'debugger') {
    // Kein SE-Gate — Workshop entscheidet eigenständig
    return
  }

  // cf-eskalation: Dokumentation und SE-Info sind Pflicht
  // Graph-Knoten und SE-Benachrichtigung werden vom Aufrufer
  // über createRoutingNode() + notifySE() ausgeführt.
}

/**
 * Erzeugt einen routing-entscheidung Graph-Knoten mit allen fünf Pflichtfeldern.
 * Wird vor jeder CF-Eskalation aufgerufen.
 *
 * @returns die ID des neu erzeugten Knotens
 * @throws wenn die RoutingDecision ungültig ist oder der Graph-Knoten nicht erzeugt werden kann
 */
export function createRoutingNode(
  graphDb: RoutingGraphDb,
  decision: RoutingDecision
): RoutingNodeId {
  const validation = validateRoutingDecision(decision)
  if (!validation.valid) {
    throw new Error(
      `Kann keinen Routing-Knoten erzeugen — Entscheidung ungültig: ${validation.errors.join(', ')}`
    )
  }

  return graphDb.createNode(['routing-entscheidung'], {
    quelle: decision.quelle,
    ziel: decision.ziel,
    itemId: decision.itemId,
    begruendung: decision.begruendung,
    stand: decision.stand,
  })
}

/**
 * Prüft ob eine Routing-Entscheidung eine CF-Eskalation ist.
 * Hilfsfunktion für den Workshop-Flow.
 */
export function isCFEskalation(decision: RoutingDecision): boolean {
  return decision.ziel === 'cf-eskalation'
}
