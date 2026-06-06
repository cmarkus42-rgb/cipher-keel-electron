// tests/session/phase5-persistence.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  saveSessionSnapshot,
  loadSessionSnapshot,
  type SessionSnapshot,
} from '../../src/main/session/keep-working'

describe('Session Persistence (CK-UI-032)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-persist-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('saves and loads session snapshot', () => {
    const snapshot: SessionSnapshot = {
      sessions: [
        { presetId: 'architect', name: 'Architect-1', gridPosition: 0 },
        { presetId: 'cyber-factory', name: 'CF-1', gridPosition: 1 },
      ],
      gridConfig: { cols: 2, rows: 2 },
      activeProject: 'cipher-keel',
    }

    saveSessionSnapshot(snapshot, tmpDir)
    const loaded = loadSessionSnapshot(tmpDir)

    expect(loaded).not.toBeNull()
    expect(loaded!.sessions).toHaveLength(2)
    expect(loaded!.gridConfig.cols).toBe(2)
    expect(loaded!.activeProject).toBe('cipher-keel')
  })

  it('returns null when no snapshot exists', () => {
    const loaded = loadSessionSnapshot(tmpDir)
    expect(loaded).toBeNull()
  })

  it('handles corrupt snapshot gracefully', () => {
    fs.writeFileSync(path.join(tmpDir, 'session-snapshot.json'), 'not json')
    const loaded = loadSessionSnapshot(tmpDir)
    expect(loaded).toBeNull()
  })
})
