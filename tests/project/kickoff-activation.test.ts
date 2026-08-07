/**
 * tests/project/kickoff-activation.test.ts — ein frisch angelegtes Projekt wird aktiv.
 *
 * Vorher: createProject setzte activeId nie, also scheiterte session:create direkt
 * nach dem Kickoff mit "No session name and no active project".
 */
import { describe, it, expect, vi } from 'vitest'
import { activateAfterKickoff } from '../../src/main/project/kickoff'

const project = {
  id: 'proj-1', name: 'Probe', rootPath: '/tmp/probe',
  createdAt: '2026-08-06T00:00:00.000Z', workspaceIds: [],
}

describe('activateAfterKickoff', () => {
  it('activates the project of a successful kickoff', () => {
    const switchProject = vi.fn()

    const activated = activateAfterKickoff(switchProject, {
      ok: true, project, phaseUids: [], githubResult: null, error: null,
    })

    expect(activated).toBe(true)
    expect(switchProject).toHaveBeenCalledWith('proj-1')
  })

  it('still activates a project created during a failed (degraded-graph) kickoff', () => {
    // Befund 5: the graph being unavailable must not orphan the project record
    // that createProject + git init already produced — the next session:create
    // needs an active project regardless of whether the Phasenkette was written.
    const switchProject = vi.fn()

    const activated = activateAfterKickoff(switchProject, {
      ok: false, project, phaseUids: [], githubResult: null,
      error: { code: 'SUBSYSTEM_UNAVAILABLE', subsystem: 'graph', message: 'x' },
    })

    expect(activated).toBe(true)
    expect(switchProject).toHaveBeenCalledWith('proj-1')
  })

  it('does not activate when no project was created', () => {
    const switchProject = vi.fn()

    const activated = activateAfterKickoff(switchProject, {
      ok: true, project: null, phaseUids: [], githubResult: null, error: null,
    })

    expect(activated).toBe(false)
    expect(switchProject).not.toHaveBeenCalled()
  })

  it('does not let a switchProject failure break the kickoff', () => {
    const switchProject = vi.fn(() => { throw new Error('gone') })

    expect(() => activateAfterKickoff(switchProject, {
      ok: true, project, phaseUids: [], githubResult: null, error: null,
    })).not.toThrow()
  })

  it('reports false when activation threw', () => {
    const switchProject = vi.fn(() => { throw new Error('gone') })

    const activated = activateAfterKickoff(switchProject, {
      ok: true, project, phaseUids: [], githubResult: null, error: null,
    })

    expect(activated).toBe(false)
  })
})
