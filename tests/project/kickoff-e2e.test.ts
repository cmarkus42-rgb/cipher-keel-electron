/**
 * tests/project/kickoff-e2e.test.ts — kompletter Kickoff-Pfad gegen eine echte Graph-DB.
 *
 * Befund 2 (verifiziert 2026-08-06): project:kickoff lieferte {ok:true, phaseUids:[]},
 * wenn der GraphWriter fehlte — Erfolgsmeldung fuer einen halb ausgefuehrten Vorgang.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphWriter } from '../../src/main/graph/writer'
import { PHASE_DEFS, initProjectPhases, runKickoff } from '../../src/main/project/kickoff'

let dir: string
let db: Database.Database
let writer: GraphWriter

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'keel-kickoff-'))
  db = openGraphDb({ path: ':memory:' })
  writer = new GraphWriter(db)
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('PHASE_DEFS', () => {
  it('defines the eight phases of the Phasenkette (CK-PROC-001)', () => {
    expect(PHASE_DEFS.map(p => p.name)).toEqual([
      'ideation', 'requirements', 'architecture', 'development',
      'testing', 'fixing', 'audit', 'release-management',
    ])
  })

  it('numbers positions 1..8', () => {
    expect(PHASE_DEFS.map(p => p.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})

describe('initProjectPhases', () => {
  it('writes eight phase nodes', () => {
    const result = initProjectPhases(writer, dir)

    expect(result.ok).toBe(true)
    expect(result.phaseUids).toHaveLength(8)
  })

  it('links the phases into a chain of seven naechste_phase edges', () => {
    const { phaseUids } = initProjectPhases(writer, dir)

    const edges = db.prepare(
      `SELECT src, dst FROM edge WHERE type = 'naechste_phase' ORDER BY rowid`,
    ).all() as Array<{ src: string; dst: string }>

    expect(edges).toHaveLength(7)
    for (let i = 0; i < 7; i++) {
      expect(edges[i].src).toBe(phaseUids[i])
      expect(edges[i].dst).toBe(phaseUids[i + 1])
    }
  })

  it('is idempotent — a second run does not duplicate phase nodes', () => {
    initProjectPhases(writer, dir)
    initProjectPhases(writer, dir)

    const count = db.prepare(`SELECT COUNT(*) AS n FROM node WHERE kind = 'phase'`).get() as { n: number }
    expect(count.n).toBe(8)
  })

  it('marks every phase as ausstehend', () => {
    initProjectPhases(writer, dir)

    const rows = db.prepare(`SELECT frontmatter FROM node WHERE kind = 'phase'`).all() as Array<{ frontmatter: string }>
    for (const row of rows) {
      expect(JSON.parse(row.frontmatter).phase_status).toBe('ausstehend')
    }
  })
})

describe('runKickoff — happy path', () => {
  function deps() {
    return {
      writer,
      createProject: vi.fn((name: string, rootPath: string) => ({
        id: 'proj-1', name, rootPath, createdAt: '2026-08-06T00:00:00.000Z', workspaceIds: [],
      })),
      gitInit: vi.fn().mockResolvedValue(undefined),
      createRepo: vi.fn(),
      linkRepo: vi.fn(),
    }
  }

  it('creates the project, runs git init and writes the phase chain', async () => {
    const d = deps()

    const result = await runKickoff(d, {
      name: 'Probe', rootPath: dir, initGit: true, github: { action: 'skip' },
    })

    expect(result.ok).toBe(true)
    expect(result.project!.name).toBe('Probe')
    expect(result.phaseUids).toHaveLength(8)
    expect(d.gitInit).toHaveBeenCalledWith(dir)
  })

  it('skips git init when not requested', async () => {
    const d = deps()

    await runKickoff(d, { name: 'Probe', rootPath: dir, initGit: false, github: { action: 'skip' } })

    expect(d.gitInit).not.toHaveBeenCalled()
  })

  it('creates a GitHub repo when requested', async () => {
    const d = deps()
    d.createRepo = vi.fn().mockResolvedValue({ ok: true, url: 'https://github.com/x/y' })

    const result = await runKickoff(d, {
      name: 'Probe', rootPath: dir, initGit: false,
      github: { action: 'create', name: 'y', desc: '', visibility: 'private' },
    })

    expect(d.createRepo).toHaveBeenCalledWith('y', '', 'private', dir)
    expect(result.githubResult).toEqual({ ok: true, url: 'https://github.com/x/y' })
  })
})

describe('runKickoff — the graph is unavailable (Befund 2)', () => {
  function depsWithoutWriter() {
    return {
      writer: null,
      createProject: vi.fn((name: string, rootPath: string) => ({
        id: 'proj-1', name, rootPath, createdAt: '2026-08-06T00:00:00.000Z', workspaceIds: [],
      })),
      gitInit: vi.fn().mockResolvedValue(undefined),
      createRepo: vi.fn(),
      linkRepo: vi.fn(),
    }
  }

  it('does NOT report ok when the phase chain could not be written', async () => {
    const result = await runKickoff(depsWithoutWriter(), {
      name: 'Probe', rootPath: dir, initGit: false, github: { action: 'skip' },
    })

    expect(result.ok).toBe(false)
  })

  it('names the graph subsystem as the cause', async () => {
    const result = await runKickoff(depsWithoutWriter(), {
      name: 'Probe', rootPath: dir, initGit: false, github: { action: 'skip' },
    })

    expect(result.error!.subsystem).toBe('graph')
  })

  it('still reports the project that was created, so the UI can show partial progress', async () => {
    const result = await runKickoff(depsWithoutWriter(), {
      name: 'Probe', rootPath: dir, initGit: false, github: { action: 'skip' },
    })

    expect(result.project!.name).toBe('Probe')
    expect(result.phaseUids).toEqual([])
  })
})

describe('runKickoff — an unexpected error is thrown', () => {
  it('reports ok:false with a KICKOFF_FAILED error instead of throwing', async () => {
    const d = {
      writer,
      createProject: vi.fn(() => {
        throw new Error('disk full')
      }),
      gitInit: vi.fn().mockResolvedValue(undefined),
      createRepo: vi.fn(),
      linkRepo: vi.fn(),
    }

    const result = await runKickoff(d, {
      name: 'Probe', rootPath: dir, initGit: false, github: { action: 'skip' },
    })

    expect(result.ok).toBe(false)
    expect(result.error).toEqual({ code: 'KICKOFF_FAILED', subsystem: null, message: 'disk full' })
    expect(result.project).toBeNull()
    expect(result.phaseUids).toEqual([])
  })
})
