import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('registry resolution', () => {
  let tmpDir: string

  beforeEach(() => {
    vi.resetModules()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-registry-test-'))
  })

  afterEach(() => {
    vi.doUnmock('electron')
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  async function withConfig(cfg: unknown) {
    if (cfg !== null) {
      fs.writeFileSync(path.join(tmpDir, 'cipher-keel-config.json'), JSON.stringify(cfg))
    }
    vi.doMock('electron', () => ({ app: { getPath: () => tmpDir } }))
    return import('../../src/main/model/registry')
  }

  it('serves the bundled entries when config says nothing', async () => {
    const { alleEintraege, eintragNachId } = await withConfig(null)
    expect(alleEintraege().length).toBeGreaterThan(0)
    expect(eintragNachId('spark-gemma4-26b')?.name).toBe('Gemma4 26B (DGX Spark)')
  })

  it('leaves every assignment empty by default — behaviour is unchanged out of the box', async () => {
    const { eintragFuerTier, eintragFuerRolle } = await withConfig(null)
    expect(eintragFuerTier('heavy')).toBeNull()
    expect(eintragFuerRolle('worker')).toBeNull()
  })

  it('lets a config entry override a bundled one of the same id', async () => {
    const { eintragNachId } = await withConfig({
      modelle: { eintraege: [{
        id: 'spark-gemma4-26b', name: 'Andere Gemma', art: 'local-http',
        erreichbarkeit: { art: 'local-http', host: '10.0.0.1', port: 11434, model: 'gemma4:26b' },
        oertlichkeit: 'eigenes-netz', erklaertext: 'x', empfehlung: 'x',
      }] },
    })
    expect(eintragNachId('spark-gemma4-26b')?.name).toBe('Andere Gemma')
  })

  it('resolves a tier assignment to its entry', async () => {
    const { eintragFuerTier } = await withConfig({
      modelle: { zuordnung: { tiers: { light: '', standard: '', heavy: 'claude-opus-cli' } } },
    })
    expect(eintragFuerTier('heavy')?.id).toBe('claude-opus-cli')
    expect(eintragFuerTier('light')).toBeNull()
  })

  it('returns null for an assignment pointing at an id nobody defines', async () => {
    const { eintragFuerRolle } = await withConfig({
      modelle: { zuordnung: { rollen: { tagging: '', worker: 'gibt-es-nicht' } } },
    })
    expect(eintragFuerRolle('worker')).toBeNull()
  })

  it('skips a broken config entry instead of taking the whole registry down', async () => {
    const { alleEintraege, eintragNachId } = await withConfig({
      modelle: { eintraege: [{ id: 'kaputt', art: 'telepathie' }] },
    })
    expect(eintragNachId('kaputt')).toBeNull()
    expect(alleEintraege().length).toBeGreaterThan(0)
  })

  it('behaves exactly as before for a config file written before this feature existed', async () => {
    // withConfig(null) writes no file at all, which takes the readFileSync-fails/catch
    // path in config-store's loadConfig() and never runs deepMerge. That proves only
    // "no config file exists -> defaults", not the promise this task makes.
    //
    // The actual promise is about a config file that already exists — written before
    // `modelle` was a key — and does go through deepMerge. So this file carries an
    // unrelated, already-existing key (`llm.tagging`) and deliberately omits `modelle`
    // entirely, forcing deepMerge to run and merge a source object that has no
    // `modelle` property, which must leave the store's own default in place.
    const { alleEintraege, eintragNachId, eintragFuerTier, eintragFuerRolle } = await withConfig({
      llm: { tagging: { host: '127.0.0.1', port: 11434, model: 'altwert' } },
    })
    expect(alleEintraege().length).toBeGreaterThan(0)
    expect(eintragNachId('spark-gemma4-26b')?.name).toBe('Gemma4 26B (DGX Spark)')
    expect(eintragFuerTier('heavy')).toBeNull()
    expect(eintragFuerRolle('worker')).toBeNull()
  })
})
