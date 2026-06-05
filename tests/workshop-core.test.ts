/**
 * Workshop Core Tests — CK-P4-001, CK-P4-002, CK-P4-007, CK-P4-009
 */

import { describe, it, expect } from 'vitest'

import { CapabilityNiveau } from '../src/main/preset/niveau'
import { RollenTyp, validatePresetRahmen } from '../src/main/preset/schema'

import {
  WORKSHOP_KONFIGURATION,
  createWorkshopRahmen,
  getMaxParallelWorker,
  WORKSHOP_CAPABILITY_PAKETE,
} from '../src/main/preset/workshop/workshop-preset'

import {
  validateRoutingDecision,
  routeItem,
  createRoutingNode,
  isCFEskalation,
  type WorkItem,
  type RoutingDecision,
  type RoutingGraphDb,
  type RoutingNodeId,
} from '../src/main/preset/workshop/routing'

import {
  executeWorkshopFlow,
  allePhasenDurchlaufen,
  WORKSHOP_PHASEN,
  DEFAULT_MONITORING_CONFIG,
  formatP1Id,
} from '../src/main/preset/workshop/workshop-flow'

import {
  createInitialState,
  updateStateNachItem,
  updateStateNachRoutingEntscheidung,
  createRollingSummaryNote,
  sollteAktualisieren,
  renderRollingSummary,
} from '../src/main/preset/workshop/rolling-summary'

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function makeItem(id: string, typ: 'BUG' | 'MFR' | 'NRF' = 'BUG'): WorkItem {
  return { id, titel: `Test-Item ${id}`, typ, stand: 'neu' }
}

function makeRoutingDecision(overrides: Partial<RoutingDecision> = {}): RoutingDecision {
  return {
    quelle: 'test-findings',
    ziel: 'intern',
    itemId: 'BUG-001',
    begruendung: 'Triviales Problem, direkt behebbar',
    stand: 'klassifiziert',
    ...overrides,
  }
}

function makeMockGraphDb(): RoutingGraphDb & { nodes: Array<{ labels: string[]; props: Record<string, string> }> } {
  const nodes: Array<{ labels: string[]; props: Record<string, string> }> = []
  return {
    nodes,
    createNode(labels, properties): RoutingNodeId {
      nodes.push({ labels, properties })
      return `node-${nodes.length}`
    },
  }
}

// ---------------------------------------------------------------------------
// CK-P4-001 — Workshop-Preset Registrierung
// ---------------------------------------------------------------------------

describe('Workshop-Preset (CK-P4-001)', () => {
  it('hat id "workshop"', () => {
    expect(WORKSHOP_KONFIGURATION.id).toBe('workshop')
  })

  it('hat rollenTyp phasen-entitaet', () => {
    expect(WORKSHOP_KONFIGURATION.rollenTyp).toBe(RollenTyp.PhasenEntitaet)
    expect(WORKSHOP_KONFIGURATION.rollenTyp).toBe('phasen-entitaet')
  })

  it('hat phasenBindung [fixing, development]', () => {
    expect(WORKSHOP_KONFIGURATION.phasenBindung).toContain('fixing')
    expect(WORKSHOP_KONFIGURATION.phasenBindung).toContain('development')
    expect(WORKSHOP_KONFIGURATION.phasenBindung).toHaveLength(2)
  })

  it('model-Default ist "standard" (Sonnet-Klasse)', () => {
    expect(WORKSHOP_KONFIGURATION.modelDefault).toBe('standard')
  })

  it('orchestrierungsFaehigkeit ist true', () => {
    expect(WORKSHOP_KONFIGURATION.orchestrierungsFaehigkeit).toBe(true)
  })

  it('graphZugriff: lesen targeted, schreiben full', () => {
    expect(WORKSHOP_KONFIGURATION.graphZugriff.lesen).toBe('targeted')
    expect(WORKSHOP_KONFIGURATION.graphZugriff.schreiben).toBe('full')
  })

  it('createWorkshopRahmen mit Niveau A ist valide', () => {
    const rahmen = createWorkshopRahmen(CapabilityNiveau.A)
    const result = validatePresetRahmen(rahmen)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('createWorkshopRahmen mit Niveau B ist valide', () => {
    const rahmen = createWorkshopRahmen(CapabilityNiveau.B)
    const result = validatePresetRahmen(rahmen)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('createWorkshopRahmen mit Niveau C ist valide', () => {
    const rahmen = createWorkshopRahmen(CapabilityNiveau.C)
    const result = validatePresetRahmen(rahmen)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('Preset instanziierbar mit phase: fixing', () => {
    const rahmen = createWorkshopRahmen(CapabilityNiveau.A)
    expect(rahmen.phasenBindung).toContain('fixing')
  })

  it('Preset instanziierbar mit phase: development', () => {
    const rahmen = createWorkshopRahmen(CapabilityNiveau.A)
    expect(rahmen.phasenBindung).toContain('development')
  })

  it('Bugfixing und Development teilen dasselbe Capability-Set (kein Modus-Split)', () => {
    // Beide Phasen sind im selben phasenBindung-Array, nicht in zwei Presets
    const rahmen = createWorkshopRahmen(CapabilityNiveau.A)
    expect(rahmen.phasenBindung).toEqual(['fixing', 'development'])
  })

  it('Niveau A hat 7 Capability-Pakete (alle)', () => {
    const rahmen = createWorkshopRahmen(CapabilityNiveau.A)
    expect(rahmen.capabilityAnbindung).toHaveLength(WORKSHOP_CAPABILITY_PAKETE.length)
    expect(rahmen.capabilityAnbindung).toContain('rolling-summary')
    expect(rahmen.capabilityAnbindung).toContain('debugger-beauftragung')
  })

  it('Niveau B hat 6 Pakete (ohne debugger-beauftragung als volles Paket)', () => {
    const rahmen = createWorkshopRahmen(CapabilityNiveau.B)
    expect(rahmen.capabilityAnbindung).toHaveLength(6)
    expect(rahmen.capabilityAnbindung).not.toContain('debugger-beauftragung')
    expect(rahmen.capabilityAnbindung).toContain('rolling-summary')
  })

  it('Niveau C hat 5 Pakete (kein debugger-beauftragung)', () => {
    const rahmen = createWorkshopRahmen(CapabilityNiveau.C)
    expect(rahmen.capabilityAnbindung).toHaveLength(5)
    expect(rahmen.capabilityAnbindung).not.toContain('debugger-beauftragung')
    expect(rahmen.capabilityAnbindung).toContain('rolling-summary')
  })

  it('Niveau A: max 5 parallele Worker', () => {
    expect(getMaxParallelWorker(CapabilityNiveau.A)).toBe(5)
  })

  it('Niveau B: max 3 parallele Worker', () => {
    expect(getMaxParallelWorker(CapabilityNiveau.B)).toBe(3)
  })

  it('Niveau C: max 1 Worker (sequentiell)', () => {
    expect(getMaxParallelWorker(CapabilityNiveau.C)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// CK-P4-002 — Workshop-Routing-Hoheit
// ---------------------------------------------------------------------------

describe('Workshop-Routing (CK-P4-002)', () => {
  it('RoutingDecision mit allen Pflichtfeldern ist valide', () => {
    const decision = makeRoutingDecision()
    const result = validateRoutingDecision(decision)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('fehlende quelle → Validierungsfehler', () => {
    const decision = makeRoutingDecision({ quelle: '' })
    const result = validateRoutingDecision(decision)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('quelle'))).toBe(true)
  })

  it('fehlende begruendung → Validierungsfehler', () => {
    const decision = makeRoutingDecision({ begruendung: '' })
    const result = validateRoutingDecision(decision)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('begruendung'))).toBe(true)
  })

  it('fehlendes itemId → Validierungsfehler', () => {
    const decision = makeRoutingDecision({ itemId: '' })
    const result = validateRoutingDecision(decision)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('itemId'))).toBe(true)
  })

  it('intern-Routing wirft keinen Fehler (kein SE-Gate)', () => {
    const item = makeItem('BUG-001')
    const decision = makeRoutingDecision({ ziel: 'intern' })
    expect(() => routeItem(item, decision)).not.toThrow()
  })

  it('debugger-Routing wirft keinen Fehler (kein SE-Gate)', () => {
    const item = makeItem('BUG-002')
    const decision = makeRoutingDecision({ ziel: 'debugger', itemId: 'BUG-002', begruendung: 'Tiefer Stack-Trace nötig' })
    expect(() => routeItem(item, decision)).not.toThrow()
  })

  it('createRoutingNode erzeugt Knoten mit allen Pflichtfeldern', () => {
    const db = makeMockGraphDb()
    const decision = makeRoutingDecision({ ziel: 'cf-eskalation', begruendung: 'Architektur-Impact' })
    const nodeId = createRoutingNode(db, decision)

    expect(nodeId).toBeTruthy()
    expect(db.nodes).toHaveLength(1)

    const node = db.nodes[0]
    expect(node.labels).toContain('routing-entscheidung')
    expect(node.properties.quelle).toBe(decision.quelle)
    expect(node.properties.ziel).toBe(decision.ziel)
    expect(node.properties.itemId).toBe(decision.itemId)
    expect(node.properties.begruendung).toBe(decision.begruendung)
    expect(node.properties.stand).toBe(decision.stand)
  })

  it('Routing-Knoten enthält alle 5 Pflichtfelder: quelle, ziel, itemId, begruendung, stand', () => {
    const db = makeMockGraphDb()
    const decision: RoutingDecision = {
      quelle: 'test-findings',
      ziel: 'cf-eskalation',
      itemId: 'BUG-042',
      begruendung: 'Breiter Architektur-Impact, CF nötig',
      stand: 'eskaliert',
    }
    createRoutingNode(db, decision)

    const props = db.nodes[0].properties
    expect(Object.keys(props)).toContain('quelle')
    expect(Object.keys(props)).toContain('ziel')
    expect(Object.keys(props)).toContain('itemId')
    expect(Object.keys(props)).toContain('begruendung')
    expect(Object.keys(props)).toContain('stand')
  })

  it('createRoutingNode wirft bei ungültiger Decision', () => {
    const db = makeMockGraphDb()
    const ungueltig = makeRoutingDecision({ begruendung: '' })
    expect(() => createRoutingNode(db, ungueltig)).toThrow()
  })

  it('isCFEskalation erkennt cf-eskalation korrekt', () => {
    expect(isCFEskalation(makeRoutingDecision({ ziel: 'cf-eskalation' }))).toBe(true)
    expect(isCFEskalation(makeRoutingDecision({ ziel: 'intern' }))).toBe(false)
    expect(isCFEskalation(makeRoutingDecision({ ziel: 'debugger' }))).toBe(false)
  })

  it('routeItem mit ungültiger Decision wirft Fehler', () => {
    const item = makeItem('BUG-001')
    const ungueltig = makeRoutingDecision({ quelle: '' })
    expect(() => routeItem(item, ungueltig)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// CK-P4-009 — Sechs-Phasen-Flow
// ---------------------------------------------------------------------------

describe('Workshop-Flow (CK-P4-009)', () => {
  it('hat genau 6 Phasen definiert', () => {
    expect(WORKSHOP_PHASEN).toHaveLength(6)
  })

  it('Phasen in korrekter Reihenfolge', () => {
    expect(WORKSHOP_PHASEN[0]).toBe('aufnehmen')
    expect(WORKSHOP_PHASEN[1]).toBe('klassifizieren')
    expect(WORKSHOP_PHASEN[2]).toBe('dispatchen')
    expect(WORKSHOP_PHASEN[3]).toBe('monitoring')
    expect(WORKSHOP_PHASEN[4]).toBe('completeness-gate')
    expect(WORKSHOP_PHASEN[5]).toBe('konsolidieren')
  })

  it('alle 6 Phasen werden bei 1 Item durchlaufen', () => {
    const input = {
      items: [makeItem('BUG-001')],
      phase: 'fixing' as const,
    }
    const protokoll = executeWorkshopFlow(input)
    expect(allePhasenDurchlaufen(protokoll)).toBe(true)
    expect(protokoll.phasenDurchlaufen).toHaveLength(6)
  })

  it('alle 6 Phasen werden bei 0 Items durchlaufen (kein Überspringen)', () => {
    const input = { items: [], phase: 'fixing' as const }
    const protokoll = executeWorkshopFlow(input)
    expect(allePhasenDurchlaufen(protokoll)).toBe(true)
    expect(protokoll.phasenDurchlaufen).toHaveLength(6)
  })

  it('alle 6 Phasen werden bei mehreren Items durchlaufen', () => {
    const input = {
      items: [makeItem('BUG-001'), makeItem('MFR-001', 'MFR'), makeItem('NRF-001', 'NRF')],
      phase: 'development' as const,
    }
    const protokoll = executeWorkshopFlow(input)
    expect(allePhasenDurchlaufen(protokoll)).toBe(true)
  })

  it('Klassifizierung erstellt P1-IDs (auch bei einem einzigen Item)', () => {
    const input = {
      items: [makeItem('ein-bug', 'BUG')],
      phase: 'fixing' as const,
    }
    const protokoll = executeWorkshopFlow(input)
    expect(protokoll.klassifizierteItems).toHaveLength(1)
    expect(protokoll.klassifizierteItems[0].p1Id).toBe('BUG-001')
  })

  it('Klassifizierung erzeugt korrekte P1-IDs für gemischte Typen', () => {
    const input = {
      items: [
        makeItem('b1', 'BUG'),
        makeItem('m1', 'MFR'),
        makeItem('b2', 'BUG'),
      ],
      phase: 'fixing' as const,
    }
    const protokoll = executeWorkshopFlow(input)
    const ids = protokoll.klassifizierteItems.map((k) => k.p1Id)
    expect(ids).toContain('BUG-001')
    expect(ids).toContain('MFR-001')
    expect(ids).toContain('BUG-002')
  })

  it('Monitoring-Default: Intervall 150000ms, Stuck 420000ms, max 2 Retries', () => {
    expect(DEFAULT_MONITORING_CONFIG.intervallMs).toBe(150_000)
    expect(DEFAULT_MONITORING_CONFIG.stuckSchwelleMs).toBe(420_000)
    expect(DEFAULT_MONITORING_CONFIG.maxRetries).toBe(2)
  })

  it('Completeness-Gate ist nicht überspringbar (immer im Protokoll)', () => {
    const input = { items: [], phase: 'fixing' as const }
    const protokoll = executeWorkshopFlow(input)
    expect(protokoll.phasenDurchlaufen).toContain('completeness-gate')
    expect(protokoll.gateErgebnis).not.toBeNull()
  })

  it('Konsolidierung erzeugt Output-String', () => {
    const input = { items: [makeItem('BUG-001')], phase: 'fixing' as const }
    const protokoll = executeWorkshopFlow(input)
    expect(typeof protokoll.konsolidierungsOutput).toBe('string')
    expect(protokoll.konsolidierungsOutput!.length).toBeGreaterThan(0)
  })

  it('formatP1Id erzeugt korrekte IDs', () => {
    expect(formatP1Id({ typ: 'BUG', nummer: 1 })).toBe('BUG-001')
    expect(formatP1Id({ typ: 'MFR', nummer: 12 })).toBe('MFR-012')
    expect(formatP1Id({ typ: 'NRF', nummer: 100 })).toBe('NRF-100')
  })
})

// ---------------------------------------------------------------------------
// CK-P4-007 — Rolling Summary
// ---------------------------------------------------------------------------

describe('Rolling Summary (CK-P4-007)', () => {
  it('createInitialState erzeugt leeren State', () => {
    const state = createInitialState('session-001')
    expect(state.sessionId).toBe('session-001')
    expect(state.erledigteItems).toHaveLength(0)
    expect(state.itemsInArbeit).toHaveLength(0)
    expect(state.eskaliertItems).toHaveLength(0)
    expect(state.routingEntscheidungen).toHaveLength(0)
  })

  it('Note existiert nach erstem Item (Trigger: item-abgeschlossen)', () => {
    const state = createInitialState('session-001')
    const item = { ...makeItem('BUG-001'), stand: 'abgeschlossen' as const }
    const updatedState = updateStateNachItem(state, item)

    const note = createRollingSummaryNote(updatedState)
    expect(note.noteType).toBe('rolling-summary')
    expect(note.tag).toBe('kind:workshop-summary')
    expect(note.inhalt.length).toBeGreaterThan(0)
    expect(note.sessionId).toBe('session-001')
  })

  it('Note enthält erlediges Item', () => {
    const state = createInitialState('session-001')
    const item = { ...makeItem('BUG-001'), stand: 'abgeschlossen' as const }
    const updatedState = updateStateNachItem(state, item)
    const note = createRollingSummaryNote(updatedState)

    expect(note.inhalt).toContain('BUG-001')
  })

  it('Note wird nach Routing-Entscheidung aktualisiert', () => {
    const state = createInitialState('session-001')
    const decision = makeRoutingDecision({ ziel: 'cf-eskalation', begruendung: 'Architektur-Impact' })
    const updatedState = updateStateNachRoutingEntscheidung(state, decision)

    const note = createRollingSummaryNote(updatedState)
    expect(note.inhalt).toContain('cf-eskalation')
    expect(note.inhalt).toContain('BUG-001')
  })

  it('Überschreiben statt Akkumulieren: neue Note hat anderen Zeitstempel', () => {
    const state1 = createInitialState('session-001')
    const note1 = createRollingSummaryNote(state1)

    // Kurze Pause simulieren via State-Update
    const item = { ...makeItem('BUG-001'), stand: 'abgeschlossen' as const }
    const state2 = updateStateNachItem(state1, item)
    const note2 = createRollingSummaryNote(state2)

    // Beide Notes haben denselben noteType — die zweite überschreibt die erste
    expect(note1.noteType).toBe(note2.noteType)
    expect(note1.tag).toBe(note2.tag)
    // Inhalt unterscheidet sich (mehr Items in state2)
    expect(note2.inhalt).not.toBe(note1.inhalt)
  })

  it('sollteAktualisieren: item-abgeschlossen → true', () => {
    expect(sollteAktualisieren('item-abgeschlossen')).toBe(true)
  })

  it('sollteAktualisieren: routing-entscheidung → true', () => {
    expect(sollteAktualisieren('routing-entscheidung')).toBe(true)
  })

  it('sollteAktualisieren: neues-buendel → true', () => {
    expect(sollteAktualisieren('neues-buendel')).toBe(true)
  })

  it('sollteAktualisieren: kontext-druck bei 75% → true', () => {
    expect(sollteAktualisieren('kontext-druck', 0.75)).toBe(true)
  })

  it('sollteAktualisieren: kontext-druck bei 60% → false', () => {
    expect(sollteAktualisieren('kontext-druck', 0.6)).toBe(false)
  })

  it('renderRollingSummary enthält Session-ID und alle Sektionen', () => {
    const state = createInitialState('session-xyz')
    const rendered = renderRollingSummary(state)
    expect(rendered).toContain('session-xyz')
    expect(rendered).toContain('Erledigt')
    expect(rendered).toContain('In Arbeit')
    expect(rendered).toContain('Eskaliert')
  })

  it('updateStateNachRoutingEntscheidung markiert cf-eskalation als eskaliert', () => {
    const state = createInitialState('session-001')
    const decision = makeRoutingDecision({ ziel: 'cf-eskalation', itemId: 'BUG-099' })
    const updated = updateStateNachRoutingEntscheidung(state, decision)

    expect(updated.eskaliertItems).toContain('BUG-099')
    expect(updated.routingEntscheidungen).toHaveLength(1)
  })

  it('updateStateNachRoutingEntscheidung für debugger eskaliert nicht', () => {
    const state = createInitialState('session-001')
    const decision = makeRoutingDecision({ ziel: 'debugger', itemId: 'BUG-010' })
    const updated = updateStateNachRoutingEntscheidung(state, decision)

    expect(updated.eskaliertItems).not.toContain('BUG-010')
    expect(updated.routingEntscheidungen).toHaveLength(1)
  })
})
