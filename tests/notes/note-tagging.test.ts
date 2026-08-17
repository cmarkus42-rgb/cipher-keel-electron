import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// Mocked at the module boundary `NoteTagging.autoTag` actually calls, so the temporal cut
// (resolve vs. send) is testable without a real registry config or a real model daemon.
const endpointForRole = vi.fn<(role: string) => unknown>()
const generate = vi.fn()
const clientForEndpoint = vi.fn<(endpoint: unknown) => { generate: typeof generate }>(
  () => ({ generate })
)

vi.mock('../../src/main/model/rollen', () => ({
  endpointForRole: (role: string) => endpointForRole(role),
}))

vi.mock('../../src/main/worker/model-client', () => ({
  clientForEndpoint: (endpoint: unknown) => clientForEndpoint(endpoint),
}))

describe('NoteTagging.autoTag — configuration vs. transport errors', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-tagging-test-'))
    endpointForRole.mockReset()
    generate.mockReset()
    clientForEndpoint.mockClear()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns the parsed tags on the happy path', async () => {
    const { NoteTagging } = await import('../../src/main/notes/note-tagging')
    const endpoint = { kind: 'ollama' as const, host: '127.0.0.1', port: 11434, model: 'x' }
    endpointForRole.mockReturnValue(endpoint)
    generate.mockResolvedValue('["domain:trading", "tech:typescript"]')

    const tagging = new NoteTagging(tmpDir)
    const tags = await tagging.autoTag('some note content')

    expect(tags).toEqual(['domain:trading', 'tech:typescript'])
  })

  it('degrades to null when the resolved endpoint is unreachable (transport failure)', async () => {
    const { NoteTagging } = await import('../../src/main/notes/note-tagging')
    const endpoint = { kind: 'ollama' as const, host: '127.0.0.1', port: 11434, model: 'x' }
    endpointForRole.mockReturnValue(endpoint)
    generate.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:11434'))

    const tagging = new NoteTagging(tmpDir)
    const result = await tagging.autoTag('some note content')

    expect(result).toBeNull()
  })

  it('propagates when the role resolves to a structurally forbidden entry (configuration error)', async () => {
    const { NoteTagging } = await import('../../src/main/notes/note-tagging')
    endpointForRole.mockImplementation(() => {
      throw new Error('Ein cli-harness-Eintrag hat keinen Endpunkt')
    })

    const tagging = new NoteTagging(tmpDir)

    await expect(tagging.autoTag('some note content')).rejects.toThrow(
      'Ein cli-harness-Eintrag hat keinen Endpunkt'
    )
    expect(generate).not.toHaveBeenCalled()
  })
})
