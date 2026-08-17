import { describe, it, expect } from 'vitest'
import { ClaudeCodeAdapter } from '../../src/main/agent/adapters/claude-code'
import type { LaunchOpts } from '../../src/main/agent/agent-adapter'

function adapterMit(args: string[]) {
  return new ClaudeCodeAdapter({ getStartArgs: () => args })
}

// projectPath/sessionName are required by LaunchOpts but unused by buildLaunchCommand's
// args-building logic — filled in here only so the calls below type-check.
const BASIS: Pick<LaunchOpts, 'projectPath' | 'sessionName'> = {
  projectPath: '/tmp/p', sessionName: 'keel-x',
}

describe('Startparameter statt skipPermissions', () => {
  it('stellt die Nutzerparameter vor die app-gesteuerten', () => {
    const cmd = adapterMit(['--dangerously-skip-permissions'])
      .buildLaunchCommand({ ...BASIS, resume: true })
    expect(cmd.cmd).toBe('claude')
    expect(cmd.args).toEqual(['--dangerously-skip-permissions', '--resume'])
  })

  it('erzeugt mit der migrierten Vorgabe dieselbe Kommandozeile wie vor der Umstellung', () => {
    const cmd = adapterMit(['--dangerously-skip-permissions']).buildLaunchCommand({
      ...BASIS, resume: true, model: 'opus',
    })
    expect(cmd.args).toEqual(['--dangerously-skip-permissions', '--resume', '--model', 'opus'])
  })

  it('startet ohne jeden Zusatzparameter, wenn das Feld leer ist', () => {
    const cmd = adapterMit([]).buildLaunchCommand({ ...BASIS })
    expect(cmd.args).toEqual([])
  })

  it('reicht mehrere Freitextparameter unveraendert durch', () => {
    const cmd = adapterMit(['--foo', 'bar baz']).buildLaunchCommand({ ...BASIS })
    expect(cmd.args).toEqual(['--foo', 'bar baz'])
  })

  it('benennt seine app-gesteuerten Parameter', () => {
    expect(adapterMit([]).appGesteuerteParameter).toEqual([
      '--resume', '--fork-session', '--model', '--append-system-prompt-file',
    ])
  })

  it('baut das Worker-Prompt-Fragment aus denselben Startparametern', () => {
    const fragment = adapterMit(['--dangerously-skip-permissions'])
      .buildWorkshopPromptFragment('de')
    expect(fragment).toContain('claude --dangerously-skip-permissions')
  })

  it('nennt im Prompt-Fragment kein Flag, das der Nutzer entfernt hat', () => {
    const fragment = adapterMit([]).buildWorkshopPromptFragment('de')
    expect(fragment).not.toContain('--dangerously-skip-permissions')
    expect(fragment).toContain('claude')
  })
})
