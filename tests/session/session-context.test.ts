/**
 * tests/session/session-context.test.ts — Session an das aktive Projekt binden.
 *
 * Vorher: index.tsx erzeugte `session-${Date.now()}` ohne cwd und ohne Projektbezug.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphWriter } from '../../src/main/graph/writer'
import {
  deriveSessionName,
  buildSessionContext,
  writeSessionNode,
} from '../../src/main/session/session-context'

const project = {
  id: 'proj-1',
  name: 'Cipher Keel',
  rootPath: '/tmp/keel',
  createdAt: '2026-08-06T00:00:00.000Z',
  workspaceIds: [],
}

describe('deriveSessionName', () => {
  it('joins a slugified project name, the entity and the seed', () => {
    expect(deriveSessionName('Cipher Keel', 'architect', 'a1b2')).toBe('keel-cipher-keel-architect-a1b2')
  })

  it('lowercases and replaces spaces with hyphens', () => {
    expect(deriveSessionName('My Project', 'workshop', 'zz99')).toBe('keel-my-project-workshop-zz99')
  })

  it('strips characters tmux would choke on', () => {
    expect(deriveSessionName('a.b:c$d', 'architect', 'x1')).toBe('keel-abcd-architect-x1')
  })

  it('collapses repeated separators', () => {
    expect(deriveSessionName('a   b', 'architect', 'x1')).toBe('keel-a-b-architect-x1')
  })

  it('falls back to "projekt" when the name slugifies to nothing', () => {
    expect(deriveSessionName('...', 'architect', 'x1')).toBe('keel-projekt-architect-x1')
  })
})

describe('buildSessionContext', () => {
  it('uses the project root as cwd', () => {
    const ctx = buildSessionContext(project, 'architect', 'a1b2')

    expect(ctx.cwd).toBe('/tmp/keel')
  })

  it('carries the project id for the graph node', () => {
    const ctx = buildSessionContext(project, 'architect', 'a1b2')

    expect(ctx.projectId).toBe('proj-1')
    expect(ctx.entityId).toBe('architect')
  })

  it('produces the derived name', () => {
    const ctx = buildSessionContext(project, 'architect', 'a1b2')

    expect(ctx.name).toBe('keel-cipher-keel-architect-a1b2')
  })
})

describe('writeSessionNode', () => {
  let dir: string
  let db: Database.Database
  let writer: GraphWriter

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'keel-session-'))
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes a session node into the graph', () => {
    const ctx = buildSessionContext({ ...project, rootPath: dir }, 'architect', 'a1b2')

    const { uid } = writeSessionNode(writer, ctx)

    const row = db.prepare(`SELECT kind, title FROM node WHERE uid = ?`).get(uid) as {
      kind: string
      title: string
    }
    expect(row.kind).toBe('session')
    expect(row.title).toBe(ctx.name)
  })

  it('records project, entity and cwd in the frontmatter', () => {
    const ctx = buildSessionContext({ ...project, rootPath: dir }, 'architect', 'a1b2')

    const { uid } = writeSessionNode(writer, ctx)

    const row = db.prepare(`SELECT frontmatter FROM node WHERE uid = ?`).get(uid) as {
      frontmatter: string
    }
    const fm = JSON.parse(row.frontmatter)
    expect(fm.project_id).toBe('proj-1')
    expect(fm.entity).toBe('architect')
    expect(fm.cwd).toBe(dir)
  })
})
