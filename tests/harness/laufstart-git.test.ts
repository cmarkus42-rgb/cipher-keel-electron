import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileAsync } from '../../src/main/util/exec-util'
import { pruefeArbeitsbaum } from '../../src/main/harness/lauf'

let heim: string
let wurzel: string

beforeEach(() => {
  heim = realpathSync(mkdtempSync(join(tmpdir(), 'keel-git-')))
  wurzel = join(heim, 'projekt')
  mkdirSync(wurzel, { recursive: true })
})
afterEach(() => rmSync(heim, { recursive: true, force: true }))

async function repoMitCommit(): Promise<void> {
  await execFileAsync('git', ['init', '-q', wurzel])
  await execFileAsync('git', ['-C', wurzel, 'config', 'user.email', 'test@test.invalid'])
  await execFileAsync('git', ['-C', wurzel, 'config', 'user.name', 'Test'])
  writeFileSync(join(wurzel, 'a.txt'), 'inhalt')
  await execFileAsync('git', ['-C', wurzel, 'add', '.'])
  await execFileAsync('git', ['-C', wurzel, 'commit', '-q', '-m', 'erst'])
}

describe('pruefeArbeitsbaum', () => {
  it('laesst ein sauberes Repo durch', async () => {
    await repoMitCommit()
    const r = await pruefeArbeitsbaum(wurzel)
    expect(r.ok).toBe(true)
  })

  it('lehnt ein Repo mit ungesicherten Aenderungen ab, und nennt sie', async () => {
    await repoMitCommit()
    writeFileSync(join(wurzel, 'a.txt'), 'geaendert')
    const r = await pruefeArbeitsbaum(wurzel)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('a.txt')
  })

  it('lehnt eine unversionierte Datei ebenso ab', async () => {
    await repoMitCommit()
    writeFileSync(join(wurzel, 'neu.txt'), 'x')
    const r = await pruefeArbeitsbaum(wurzel)
    expect(r.ok).toBe(false)
  })

  it('lehnt ein Verzeichnis ohne Git ab — nicht Start mit Warnung', async () => {
    const r = await pruefeArbeitsbaum(wurzel)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('kein Git-Repository')
  })

  it('unterscheidet ein fehlendes git-Binary vom fehlenden Repository', async () => {
    // Ohne diese Unterscheidung schickt die Meldung jemanden zu `git init`, waehrend das Problem
    // ein nicht installiertes git ist. Der PATH wird hier geleert, damit execFile ENOENT wirft.
    const alterPfad = process.env.PATH
    process.env.PATH = ''
    try {
      const r = await pruefeArbeitsbaum(wurzel)
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.meldung).toContain('nicht aufrufbar')
        expect(r.meldung).not.toContain('git init')
      }
    } finally {
      process.env.PATH = alterPfad
    }
  })
})
