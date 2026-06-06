/**
 * GitHub MCP Server configuration generator.
 * Optional — project works without it via gh CLI.
 * CK-GH-009
 */

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
