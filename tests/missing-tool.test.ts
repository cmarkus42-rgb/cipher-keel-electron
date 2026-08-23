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

  it('recognises the Node spawn-ENOENT message shape alone when no code is attached', () => {
    expect(looksLikeMissingCommand(new Error('spawn tmux ENOENT'))).toBe(true)
  })

  it('does not claim an unrelated failure is a missing command', () => {
    expect(looksLikeMissingCommand(new Error('tmux exited with code 1'))).toBe(false)
  })

  it('does not misdiagnose a wrapped tmux failure whose stderr happens to contain "command not found"', () => {
    // tmux-manager.ts wraps tmux's own stderr as "tmux control mode failed: <stderr>".
    // That stderr is arbitrary text — a broken .tmux.conf or a bad $SHELL can contain
    // this exact phrase even though tmux itself is installed and ran fine.
    expect(looksLikeMissingCommand(
      new Error('tmux control mode failed: command not found: some-plugin.sh'),
    )).toBe(false)
  })
})

describe('describeMissingTool', () => {
  it('gives an install instruction for tmux', () => {
    expect(describeMissingTool('tmux')).toBe(
      'tmux nicht gefunden. Installation mit: brew install tmux',
    )
  })

  it('gives an install instruction for the Claude Code CLI', () => {
    expect(describeMissingTool('claude')).toBe(
      'Claude Code CLI nicht gefunden. Installation unter: https://claude.com/claude-code',
    )
  })

  it('falls back to a generic instruction for anything else', () => {
    expect(describeMissingTool('gemini')).toBe(
      'gemini nicht auf dem PATH gefunden. Installieren und erreichbar machen.',
    )
  })
})

describe('describeToolFailure', () => {
  it('replaces a missing-command error with the install instruction', () => {
    const err = Object.assign(new Error('spawn tmux ENOENT'), { code: 'ENOENT' })
    expect(describeToolFailure('tmux', err)).toBe(
      'tmux nicht gefunden. Installation mit: brew install tmux',
    )
  })

  it('passes an unrelated error through unchanged', () => {
    expect(describeToolFailure('tmux', new Error('tmux exited with code 1')))
      .toBe('tmux exited with code 1')
  })

  it('passes a wrapped tmux failure through unchanged instead of misreporting tmux as missing', () => {
    const err = new Error('tmux control mode failed: command not found: some-plugin.sh')
    expect(describeToolFailure('tmux', err)).toBe(
      'tmux control mode failed: command not found: some-plugin.sh',
    )
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
