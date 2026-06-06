/**
 * NanoClaw Container Environment — GITHUB_TOKEN + Volume Mount.
 * CK-GH-010
 */

export interface ContainerEnvConfig {
  envVars: string[]
  volumes: string[]
  toArgs(): string[]
}

export function buildContainerEnv(projectPath: string, githubToken?: string): ContainerEnvConfig {
  const envVars: string[] = []
  if (githubToken) {
    envVars.push('-e', `GITHUB_TOKEN=${githubToken}`)
  }

  const volumes = ['-v', `${projectPath}:/workspace/project`]

  return {
    envVars,
    volumes,
    toArgs() {
      return [...envVars, ...volumes]
    },
  }
}
