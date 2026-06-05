/**
 * path-guard.test.ts — Verify that path traversal via note ID is blocked.
 */

import { describe, it, expect } from 'vitest'
import { NoteManager } from '../note-manager'
import { mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('NoteManager path traversal guard', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ck-notes-'))
  const mgr = new NoteManager(tmp)

  it('rejects ../etc/passwd as note ID', async () => {
    await expect(mgr.read('../etc/passwd')).rejects.toThrow('Invalid note ID')
  })

  it('accepts a normal ULID-style ID', async () => {
    // Should not throw — returns null because file does not exist
    const result = await mgr.read('01ABCDEF1234567890123456')
    expect(result).toBeNull()
  })
})
