/**
 * Comprehensible messages for missing CLI tools.
 * Phase 8 / Task 6.
 */

import { describe, it, expect } from 'vitest'
import {
  looksLikeMissingCommand,
  describeMissingTool,
  describeToolFailure,
} from '../src/main/util/missing-tool'
import { isCommandOnPath } from '../src/main/util/exec-util'

describe('looksLikeMissingCommand', () => {
  it('recognises a spawn ENOENT', () => {
    const err = Object.assign(new Error('spawn tmux ENOENT'), { code: 'ENOENT' })
    expect(looksLikeMissingCommand(err)).toBe(true)
  })

  it('recognises the message alone when no code is attached', () => {
    expect(looksLikeMissingCommand(new Error('tmux control mode failed: command not found')))
      .toBe(true)
  })

  it('does not claim an unrelated failure is a missing command', () => {
    expect(looksLikeMissingCommand(new Error('tmux exited with code 1'))).toBe(false)
  })
})

describe('describeMissingTool', () => {
  it('gives an install instruction for tmux', () => {
    expect(describeMissingTool('tmux')).toBe(
      'tmux not found. Install it with: brew install tmux',
    )
  })

  it('gives an install instruction for the Claude Code CLI', () => {
    expect(describeMissingTool('claude')).toBe(
      'Claude Code CLI not found. Install it from: https://claude.com/claude-code',
    )
  })

  it('falls back to a generic instruction for anything else', () => {
    expect(describeMissingTool('gemini')).toBe(
      'gemini not found on PATH. Install it and make sure it is reachable.',
    )
  })
})

describe('describeToolFailure', () => {
  it('replaces a missing-command error with the install instruction', () => {
    const err = Object.assign(new Error('spawn tmux ENOENT'), { code: 'ENOENT' })
    expect(describeToolFailure('tmux', err)).toBe(
      'tmux not found. Install it with: brew install tmux',
    )
  })

  it('passes an unrelated error through unchanged', () => {
    expect(describeToolFailure('tmux', new Error('tmux exited with code 1')))
      .toBe('tmux exited with code 1')
  })
})

describe('isCommandOnPath', () => {
  it('finds a binary that exists in every POSIX PATH', () => {
    expect(isCommandOnPath('ls')).toBe(true)
  })

  it('does not find a binary that cannot exist', () => {
    expect(isCommandOnPath('cipher-keel-no-such-binary')).toBe(false)
  })
})
