import { describe, it, expect } from 'vitest'
import { generateMcpEntry, type McpServerEntry } from '../../src/main/github/github-mcp-config'

describe('GitHub MCP Config (CK-GH-009)', () => {
  it('generates entry with default toolset', () => {
    const entry = generateMcpEntry({})
    expect(entry.command).toContain('github-mcp-server')
    expect(entry.args).toContain('--toolset')
    expect(entry.args).toContain('repos,pull_requests,issues')
  })

  it('generates entry with custom toolset', () => {
    const entry = generateMcpEntry({ toolset: ['repos', 'issues'] })
    expect(entry.args).toContain('repos,issues')
  })

  it('uses GITHUB_PERSONAL_ACCESS_TOKEN env var', () => {
    const entry = generateMcpEntry({})
    expect(entry.env).toHaveProperty('GITHUB_PERSONAL_ACCESS_TOKEN')
  })

  it('uses custom token env var name', () => {
    const entry = generateMcpEntry({ tokenEnvVar: 'GH_TOKEN' })
    expect(entry.env).toHaveProperty('GH_TOKEN')
  })
})
