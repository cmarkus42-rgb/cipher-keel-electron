/**
 * GitHub MCP Server configuration generator.
 * Optional — project works without it via gh CLI.
 * CK-GH-009
 */

import fs from 'node:fs'
import path from 'node:path'

export interface McpServerEntry {
  command: string
  args: string[]
  env: Record<string, string>
}

export interface McpConfigOptions {
  toolset?: string[]
  tokenEnvVar?: string
}

const DEFAULT_TOOLSET = ['repos', 'pull_requests', 'issues']

export function generateMcpEntry(options: McpConfigOptions): McpServerEntry {
  const toolset = options.toolset ?? DEFAULT_TOOLSET
  const tokenVar = options.tokenEnvVar ?? 'GITHUB_PERSONAL_ACCESS_TOKEN'

  return {
    command: 'github-mcp-server',
    args: ['--toolset', toolset.join(',')],
    env: { [tokenVar]: '${' + tokenVar + '}' },
  }
}

export function writeMcpConfig(projectPath: string, entry: McpServerEntry): void {
  const configPath = path.join(projectPath, '.mcp.json')
  let config: { mcpServers: Record<string, McpServerEntry> } = { mcpServers: {} }
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      if (!config.mcpServers) config.mcpServers = {}
    } catch {
      config = { mcpServers: {} }
    }
  }
  config.mcpServers['github'] = entry
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}
