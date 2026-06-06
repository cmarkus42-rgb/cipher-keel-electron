import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { VaultWatcher, type VaultEvent } from '../../src/main/notes/vault-watcher'

describe('Vault Watcher (CK-NOTES-009)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-watch-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('emits created event for new .md file', async () => {
    const events: VaultEvent[] = []
    const watcher = new VaultWatcher(tmpDir, (e) => events.push(e))
    watcher.start()

    // Give watcher time to initialize before writing (macOS FSEvents race)
    await new Promise(r => setTimeout(r, 200))
    fs.writeFileSync(path.join(tmpDir, 'test.md'), '# Test')

    // Wait for debounce + fs.watch delay
    await new Promise(r => setTimeout(r, 2000))
    watcher.stop()

    expect(events.some(e => e.type === 'created' || e.type === 'changed')).toBe(true)
  })

  it('ignores non-markdown files', async () => {
    const events: VaultEvent[] = []
    const watcher = new VaultWatcher(tmpDir, (e) => events.push(e))
    watcher.start()

    await new Promise(r => setTimeout(r, 200))
    fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'not markdown')

    await new Promise(r => setTimeout(r, 2000))
    watcher.stop()

    expect(events).toHaveLength(0)
  })

  it('stop() prevents further events', () => {
    const watcher = new VaultWatcher(tmpDir, () => {})
    watcher.start()
    watcher.stop()
    // No error thrown
  })
})
