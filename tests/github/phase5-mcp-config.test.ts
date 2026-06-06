import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { generateMcpEntry, writeMcpConfig, type McpServerEntry } from '../../src/main/github/github-mcp-config'

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

describe('writeMcpConfig (CK-GH-009)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-config-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates .mcp.json with github entry', () => {
    const entry = generateMcpEntry({})
    writeMcpConfig(tmpDir, entry)
    const raw = fs.readFileSync(path.join(tmpDir, '.mcp.json'), 'utf-8')
    const config = JSON.parse(raw)
    expect(config.mcpServers).toHaveProperty('github')
    expect(config.mcpServers.github.command).toBe('github-mcp-server')
  })

  it('updates existing .mcp.json without overwriting other servers', () => {
    const existing = { mcpServers: { other: { command: 'other-server', args: [], env: {} } } }
    fs.writeFileSync(path.join(tmpDir, '.mcp.json'), JSON.stringify(existing), 'utf-8')
    writeMcpConfig(tmpDir, generateMcpEntry({}))
    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, '.mcp.json'), 'utf-8'))
    expect(config.mcpServers).toHaveProperty('other')
    expect(config.mcpServers).toHaveProperty('github')
  })

  it('overwrites github entry on second call', () => {
    writeMcpConfig(tmpDir, generateMcpEntry({ toolset: ['repos'] }))
    writeMcpConfig(tmpDir, generateMcpEntry({ toolset: ['issues'] }))
    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, '.mcp.json'), 'utf-8'))
    expect(config.mcpServers.github.args).toContain('issues')
  })
})
