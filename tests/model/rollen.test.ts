import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('endpointForRole', () => {
  let tmpDir: string

  beforeEach(() => {
    vi.resetModules()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-rollen-test-'))
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
    return import('../../src/main/model/rollen')
  }

  it('uses the old llm.* endpoint when no assignment exists', async () => {
    const { endpointForRole } = await withConfig({
      llm: { worker: { host: '10.9.9.9', port: 11434, model: 'altwert' } },
    })
    const ep = endpointForRole('worker')
    expect(ep.kind).toBe('ollama')
    if (ep.kind === 'ollama') {
      expect(ep.host).toBe('10.9.9.9')
      expect(ep.model).toBe('altwert')
    }
  })

  it('prefers the registry entry once the assignment points at one', async () => {
    const { endpointForRole } = await withConfig({
      llm: { worker: { host: '10.9.9.9', port: 11434, model: 'altwert' } },
      modelle: { zuordnung: { rollen: { tagging: '', worker: 'spark-gemma4-26b' } } },
    })
    const ep = endpointForRole('worker')
    if (ep.kind === 'ollama') {
      expect(ep.host).toBe('100.78.7.108')
      expect(ep.model).toBe('gemma4:26b')
    }
  })

  it('refuses a cli-harness entry for a role — it has no endpoint', async () => {
    const { endpointForRole } = await withConfig({
      modelle: { zuordnung: { rollen: { tagging: '', worker: 'claude-opus-cli' } } },
    })
    expect(() => endpointForRole('worker')).toThrow('bringt sein Modell selbst mit')
  })
})
