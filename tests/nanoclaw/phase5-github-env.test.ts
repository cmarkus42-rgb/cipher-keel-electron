import { describe, it, expect } from 'vitest'
import { buildContainerEnv } from '../../src/main/nanoclaw/container-env'

describe('NanoClaw Container Env (CK-GH-010)', () => {
  it('includes GITHUB_TOKEN when provided', () => {
    const env = buildContainerEnv('/project/path', 'ghp_abc123')
    expect(env.envVars).toContain('-e')
    expect(env.envVars).toContain('GITHUB_TOKEN=ghp_abc123')
  })

  it('includes volume mount for project', () => {
    const env = buildContainerEnv('/project/path')
    expect(env.volumes).toContain('-v')
    expect(env.volumes).toContain('/project/path:/workspace/project')
  })

  it('omits GITHUB_TOKEN when not provided', () => {
    const env = buildContainerEnv('/project/path')
    expect(env.envVars.join(' ')).not.toContain('GITHUB_TOKEN')
  })

  it('returns flat args array for docker run', () => {
    const env = buildContainerEnv('/path', 'token')
    const args = env.toArgs()
    expect(args).toContain('-e')
    expect(args).toContain('-v')
  })
})
