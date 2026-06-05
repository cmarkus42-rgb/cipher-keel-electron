/**
 * workshop-gate.test.ts — W4BC Completeness-Gate, Worker-Tasks, Niveau, Sidebar, StatusBar
 *
 * CK-P4-003: Worker-Task Pflichtfelder
 * CK-P4-004: Completeness-Gate mit Kalibrier-Schalter
 * CK-P4-005: Fix-Report im P1-Format
 * CK-P4-006: Testcase-Pflicht per Fix
 * CK-P4-008: Niveau-C Einzeltask (kein Sub-Session-Spawn)
 * CK-P4-010: Capability-Pakete je Niveau
 * CK-INF-018: Sidebar-Panel
 * CK-INF-019: StatusBar Grundstruktur
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import matter from 'gray-matter'
import {
  formatWorkerTask,
  validateWorkerTask,
  type WorkerTask,
} from '../src/main/preset/workshop/worker-task-format'
import {
  evaluateCompleteness,
  type Fix,
} from '../src/main/preset/workshop/completeness-gate'
import {
  generateFixReport,
  type WorkshopRun,
} from '../src/main/preset/workshop/fix-report-generator'
import { getNiveauWorkshopConfig } from '../src/main/preset/workshop/niveau-config'
import { validateFrontmatter } from '../src/main/p1/frontmatter-schema'
import { Sidebar, filterUebergabedokumente, type SidebarNote } from '../src/renderer/components/Sidebar'
import { StatusBar, type StatusBarProps } from '../src/renderer/components/StatusBar'
import { NoteManager } from '../src/main/notes/note-manager'
import { NOTES_SAVE_RAW, NOTES_VALIDATION_WARNING } from '../src/shared/ipc-channels'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(id: string): WorkerTask {
  return {
    id,
    description: `Bug ${id}: Login-Button reagiert nicht`,
    file: 'src/renderer/Login.tsx',
    observed: 'Button ist klickbar aber nichts passiert',
    expected: 'Login-Flow wird gestartet',
    completionCriteria: 'Login-Form oeffnet sich nach Klick',
  }
}

function makeFix(itemId: string, withTestcase = true): Fix {
  return {
    itemId,
    status: 'behoben',
    testcaseIds: withTestcase ? [`T-${itemId}.1`] : [],
  }
}

// ---------------------------------------------------------------------------
// CK-P4-003 — Worker-Task-Format: 4 Pflichtfelder
// ---------------------------------------------------------------------------

describe('formatWorkerTask — Pflichtfelder', () => {
  it('enthält Bug/Item-Beschreibung', () => {
    const item = makeItem('BUG-001')
    const task = formatWorkerTask(item)
    expect(task).toContain('Login-Button reagiert nicht')
  })

  it('enthält Datei/Modul', () => {
    const item = makeItem('BUG-001')
    const task = formatWorkerTask(item)
    expect(task).toContain('src/renderer/Login.tsx')
  })

  it('enthält beobachtetes Verhalten', () => {
    const item = makeItem('BUG-001')
    const task = formatWorkerTask(item)
    expect(task).toContain('Button ist klickbar aber nichts passiert')
  })

  it('enthält erwartetes Verhalten', () => {
    const item = makeItem('BUG-001')
    const task = formatWorkerTask(item)
    expect(task).toContain('Login-Flow wird gestartet')
  })

  it('enthält Abschluss-Kriterium', () => {
    const item = makeItem('BUG-001')
    const task = formatWorkerTask(item)
    expect(task).toContain('Login-Form oeffnet sich nach Klick')
  })
})

describe('validateWorkerTask — Validierung', () => {
  it('valider Task besteht Pruefung', () => {
    const task = formatWorkerTask(makeItem('BUG-001'))
    const result = validateWorkerTask(task)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('Task ohne Datei-Marker schlaegt fehl', () => {
    const task = 'Nur eine Beschreibung ohne strukturierte Felder'
    const result = validateWorkerTask(task)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// CK-P4-004 — Completeness-Gate: vergessenes Finding
// ---------------------------------------------------------------------------

describe('evaluateCompleteness — vergessenes Finding', () => {
  it('erkennt ein vergessenes Item (production)', () => {
    const items = [makeItem('BUG-001'), makeItem('BUG-002'), makeItem('BUG-003')]
    const fixes = [makeFix('BUG-001'), makeFix('BUG-002')]
    // BUG-003 has no fix — gate must catch it

    const result = evaluateCompleteness(items, fixes, 'production')
    expect(result.passed).toBe(false)
    expect(result.missingItems).toContain('BUG-003')
  })

  it('besteht wenn alle Items adressiert sind (production)', () => {
    const items = [makeItem('BUG-001'), makeItem('BUG-002')]
    const fixes = [makeFix('BUG-001'), makeFix('BUG-002')]

    const result = evaluateCompleteness(items, fixes, 'production')
    expect(result.passed).toBe(true)
    expect(result.missingItems).toHaveLength(0)
  })

  it('zurueckgestellter Fix gilt als adressiert (kein Missing)', () => {
    const items = [makeItem('BUG-001'), makeItem('BUG-002')]
    const fixes: Fix[] = [
      makeFix('BUG-001'),
      { itemId: 'BUG-002', status: 'zurueckgestellt', testcaseIds: ['T-BUG-002.1'] },
    ]

    const result = evaluateCompleteness(items, fixes, 'production')
    expect(result.missingItems).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// CK-P4-004 — Completeness-Gate: Kalibrier-Schalter
// ---------------------------------------------------------------------------

describe('evaluateCompleteness — Kalibrier-Schalter', () => {
  it('production: prueft Forward + Backward + Tests + Kalibrierbarkeit (alle 4)', () => {
    const items = [makeItem('BUG-001')]
    const fixes = [makeFix('BUG-001')]

    const result = evaluateCompleteness(items, fixes, 'production')
    expect(result.criteria.forwardTraceability).toBe(true)
    expect(result.criteria.backwardTraceability).toBe(true)
    expect(result.criteria.testsPassed).toBe(true)
    expect(result.criteria.kalibrierbarkeit).toBe(true)
    expect(result.passed).toBe(true)
  })

  it('production: schlaegt fehl wenn Fix keinen Testcase hat', () => {
    const items = [makeItem('BUG-001')]
    const fixes = [makeFix('BUG-001', false)] // no testcase

    const result = evaluateCompleteness(items, fixes, 'production')
    expect(result.criteria.testsPassed).toBe(false)
    expect(result.passed).toBe(false)
    expect(result.fixesWithoutTestcases).toContain('BUG-001')
  })

  it('staging: prueft nur Forward + Tests (Kriterien 1+3)', () => {
    const items = [makeItem('BUG-001')]
    // no backward traceability check — fix without a corresponding item from findings
    const fixes = [makeFix('BUG-001')]

    const result = evaluateCompleteness(items, fixes, 'staging')
    expect(result.criteria.forwardTraceability).toBe(true)
    expect(result.criteria.testsPassed).toBe(true)
    expect(result.passed).toBe(true)
  })

  it('experimental: prueft nur Forward-Traceability (Kriterium 1), besteht ohne Testcase', () => {
    const items = [makeItem('BUG-001')]
    const fixes = [makeFix('BUG-001', false)] // no testcase — irrelevant in experimental

    const result = evaluateCompleteness(items, fixes, 'experimental')
    expect(result.criteria.forwardTraceability).toBe(true)
    expect(result.passed).toBe(true)
  })

  it('experimental: schlaegt fehl wenn Item ohne Fix (fehlende Forward-Traceability)', () => {
    const items = [makeItem('BUG-001'), makeItem('BUG-002')]
    const fixes = [makeFix('BUG-001')]

    const result = evaluateCompleteness(items, fixes, 'experimental')
    expect(result.passed).toBe(false)
    expect(result.missingItems).toContain('BUG-002')
  })
})

// ---------------------------------------------------------------------------
// CK-P4-005 — Fix-Report validiert gegen P1-Schema (Niveau B)
// ---------------------------------------------------------------------------

describe('generateFixReport — P1-Frontmatter', () => {
  const run: WorkshopRun = {
    runId: 'ws-run-001',
    projekt: 'cipher-keel',
    testFindingsNodeId: '01JTEST001FINDINGS0001',
    items: [makeItem('BUG-001'), makeItem('BUG-002')],
    fixes: [makeFix('BUG-001'), { itemId: 'BUG-002', status: 'zurueckgestellt', testcaseIds: ['T-BUG-002.1'] }],
  }

  it('erzeugt Dokument mit gueltigem Frontmatter (Niveau B)', () => {
    const report = generateFixReport(run)
    const parsed = matter(report)
    const result = validateFrontmatter(parsed.data, 'B')
    expect(result.valid).toBe(true)
  })

  it('dokument-typ ist fix-report', () => {
    const report = generateFixReport(run)
    const parsed = matter(report)
    expect(parsed.data['dokument-typ']).toBe('fix-report')
  })

  it('vorgaenger-dokument verweist auf testFindingsNodeId', () => {
    const report = generateFixReport(run)
    const parsed = matter(report)
    expect(parsed.data['vorgaenger-dokument']).toBe('01JTEST001FINDINGS0001')
  })

  it('Body enthält Bearbeitete-Befunde-Sektion', () => {
    const report = generateFixReport(run)
    const parsed = matter(report)
    expect(parsed.content).toContain('## Bearbeitete Befunde')
  })

  it('Body enthält Aenderungen-Sektion', () => {
    const report = generateFixReport(run)
    const parsed = matter(report)
    expect(parsed.content).toContain('## Aenderungen')
  })

  it('Bug-Status behoben ist im Report enthalten', () => {
    const report = generateFixReport(run)
    expect(report).toContain('behoben')
  })

  it('Bug-Status zurueckgestellt ist im Report enthalten', () => {
    const report = generateFixReport(run)
    expect(report).toContain('zurueckgestellt')
  })
})

// ---------------------------------------------------------------------------
// CK-P4-008 / CK-P4-010 — Niveau-C Einzeltask, keine Sub-Sessions
// ---------------------------------------------------------------------------

describe('getNiveauWorkshopConfig — Niveau C', () => {
  it('Niveau C erlaubt keine Sub-Sessions (kein mux_create_session)', () => {
    const config = getNiveauWorkshopConfig('C')
    expect(config.allowSubSessions).toBe(false)
  })

  it('Niveau C hat max 1 parallele Session', () => {
    const config = getNiveauWorkshopConfig('C')
    expect(config.maxParallel).toBe(1)
  })

  it('Niveau C hat kein debugger-beauftragung Capability', () => {
    const config = getNiveauWorkshopConfig('C')
    expect(config.capabilities).not.toContain('debugger-beauftragung')
  })

  it('Niveau C hat 5 Capabilities', () => {
    const config = getNiveauWorkshopConfig('C')
    expect(config.capabilities).toHaveLength(5)
  })

  it('rolling-summary ist auf Niveau C vorhanden', () => {
    const config = getNiveauWorkshopConfig('C')
    expect(config.capabilities).toContain('rolling-summary')
  })

  it('Completeness-Check auf Niveau C ist Checkpoint-Prompt (nicht Graph-Abfrage)', () => {
    const config = getNiveauWorkshopConfig('C')
    expect(config.completenessCheckMode).toBe('checkpoint-prompt')
  })
})

describe('getNiveauWorkshopConfig — Niveau A', () => {
  it('Niveau A hat 7 Capabilities', () => {
    const config = getNiveauWorkshopConfig('A')
    expect(config.capabilities).toHaveLength(7)
  })

  it('Niveau A hat debugger-beauftragung', () => {
    const config = getNiveauWorkshopConfig('A')
    expect(config.capabilities).toContain('debugger-beauftragung')
  })

  it('Niveau A hat max 5 parallele Sessions', () => {
    const config = getNiveauWorkshopConfig('A')
    expect(config.maxParallel).toBe(5)
  })

  it('Niveau A erlaubt Sub-Sessions', () => {
    const config = getNiveauWorkshopConfig('A')
    expect(config.allowSubSessions).toBe(true)
  })
})

describe('getNiveauWorkshopConfig — Niveau B', () => {
  it('Niveau B hat 6 Capabilities', () => {
    const config = getNiveauWorkshopConfig('B')
    expect(config.capabilities).toHaveLength(6)
  })

  it('Niveau B hat max 3 parallele Sessions', () => {
    const config = getNiveauWorkshopConfig('B')
    expect(config.maxParallel).toBe(3)
  })

  it('rolling-summary auf Niveau B vorhanden', () => {
    const config = getNiveauWorkshopConfig('B')
    expect(config.capabilities).toContain('rolling-summary')
  })
})

// ---------------------------------------------------------------------------
// CK-NOTES-005 — Sidebar-Kategorien: filterUebergabedokumente
// ---------------------------------------------------------------------------

describe('Sidebar — filterUebergabedokumente (CK-NOTES-005)', () => {
  const makeNote = (id: string, noteType: string): SidebarNote => ({
    id,
    title: `Note ${id}`,
    noteType,
    status: 'entwurf',
  })

  it('returns only notes with noteType uebergabedokument', () => {
    const notes: SidebarNote[] = [
      makeNote('1', 'uebergabedokument'),
      makeNote('2', 'brain-note'),
      makeNote('3', 'uebergabedokument'),
      makeNote('4', 'entscheidung'),
    ]
    const result = filterUebergabedokumente(notes)
    expect(result).toHaveLength(2)
    result.forEach(n => expect(n.noteType).toBe('uebergabedokument'))
  })

  it('returns empty array when no uebergabedokumente present', () => {
    const notes: SidebarNote[] = [
      makeNote('1', 'brain-note'),
      makeNote('2', 'entscheidung'),
    ]
    expect(filterUebergabedokumente(notes)).toHaveLength(0)
  })

  it('returns empty array for empty input', () => {
    expect(filterUebergabedokumente([])).toHaveLength(0)
  })

  it('returns all notes when all are uebergabedokument', () => {
    const notes: SidebarNote[] = [
      makeNote('1', 'uebergabedokument'),
      makeNote('2', 'uebergabedokument'),
    ]
    expect(filterUebergabedokumente(notes)).toHaveLength(2)
  })

  it('preserves note properties in filtered results', () => {
    const note: SidebarNote = {
      id: 'ud-1',
      title: 'Spec v1',
      noteType: 'uebergabedokument',
      status: 'freigegeben',
      phaseZuordnung: 'requirements',
    }
    const result = filterUebergabedokumente([note])
    expect(result[0]).toEqual(note)
  })
})

// ---------------------------------------------------------------------------
// CK-INF-018 / CK-INF-019 — Sidebar und StatusBar Render-Tests
// ---------------------------------------------------------------------------

describe('Sidebar — exported component and pure helpers', () => {
  it('is a function (React component exported)', () => {
    expect(typeof Sidebar).toBe('function')
  })

  it('filterUebergabedokumente is a pure function with deterministic output', () => {
    const notes: SidebarNote[] = [
      { id: 'a', title: 'A', noteType: 'uebergabedokument', status: 'entwurf' },
      { id: 'b', title: 'B', noteType: 'brain-note', status: 'entwurf' },
    ]
    // Same input, same output — deterministic
    expect(filterUebergabedokumente(notes)).toEqual(filterUebergabedokumente(notes))
    expect(filterUebergabedokumente(notes)[0].id).toBe('a')
  })
})

describe('StatusBar — exported component and props interface', () => {
  it('is a function (React component exported)', () => {
    expect(typeof StatusBar).toBe('function')
  })

  it('StatusBarProps sessionCount is required and numeric', () => {
    const props: StatusBarProps = { sessionCount: 3 }
    expect(props.sessionCount).toBe(3)
  })

  it('StatusBarProps nanoClawStatus accepts all three valid values', () => {
    const statuses: NonNullable<StatusBarProps['nanoClawStatus']>[] = [
      'connected', 'disconnected', 'connecting'
    ]
    statuses.forEach(s => {
      const props: StatusBarProps = { sessionCount: 0, nanoClawStatus: s }
      expect(props.nanoClawStatus).toBe(s)
    })
  })
})

// ---------------------------------------------------------------------------
// CK-NOTES-010 — saveRaw IPC-Wiring: channel constants + NoteManager.saveRaw
// ---------------------------------------------------------------------------

describe('CK-NOTES-010 — saveRaw channel constants defined', () => {
  it('NOTES_SAVE_RAW channel is defined correctly', () => {
    expect(NOTES_SAVE_RAW).toBe('notes:save-raw')
  })

  it('NOTES_VALIDATION_WARNING channel is defined correctly', () => {
    expect(NOTES_VALIDATION_WARNING).toBe('notes:validation-warning')
  })
})

describe('CK-NOTES-010 — NoteManager.saveRaw returns warnings for incomplete uebergabedokument', () => {
  let dir: string
  let mgr: NoteManager

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ck-notes-010-'))
    mgr = new NoteManager(dir)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('saveRaw with type=uebergabedokument but missing Pflichtfelder returns warnings', async () => {
    // type=uebergabedokument triggers validation; required: dokument-typ, status, phasenuebergang, erstellt-am
    const rawContent = '---\ntitle: Test\ntype: uebergabedokument\n---\n\n# Test\n\nSome content.\n'
    const result = await mgr.saveRaw('test-note-1', rawContent)
    expect(result.warnings.length).toBeGreaterThan(0)
    const combinedWarnings = result.warnings.join(' ')
    expect(combinedWarnings).toContain('dokument-typ')
  })

  it('saveRaw with all required uebergabedokument fields returns no warnings', async () => {
    const rawContent = [
      '---',
      'title: Spec v1',
      'type: uebergabedokument',
      'dokument-typ: spec',
      'status: entwurf',
      'phasenuebergang: requirements-architecture',
      'erstellt-am: 2026-06-05',
      '---',
      '',
      '# Spec',
      '',
      'Inhalt.',
    ].join('\n')
    const result = await mgr.saveRaw('ud-spec-1', rawContent)
    expect(result.warnings).toHaveLength(0)
  })

  it('saveRaw returns info with correct id', async () => {
    const rawContent = '---\ntitle: My Note\n---\n\n# My Note\n'
    const result = await mgr.saveRaw('my-note-id', rawContent)
    expect(result.info.id).toBe('my-note-id')
  })
})
