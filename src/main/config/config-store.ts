/**
 * ConfigStore — persistent JSON-File-Store for app configuration.
 *
 * Simplified port from cipher-mux 0.9.x (CK-INF-008).
 * Stores config at ~/.config/cipher-keel/cipher-keel-config.json.
 *
 * cipher-keel-specific: stripped down to essential fields.
 * 0.9.x-era fields (personas, characters, workshop, etc.) will be
 * added as those modules are ported in later phases.
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { MAX_SESSIONS, DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT } from '../../shared/constants'

export interface ProjectRecord {
  id: string
  name: string
  rootPath: string
  createdAt: string
  workspaceIds: string[]
}

export interface CipherKeelConfig {
  app: {
    maxSessions: number
  }
  agent: {
    skipPermissions: boolean
  }
  ui: {
    theme: 'dark' | 'light' | 'cipher-ivory'
    language: 'en' | 'de'
    grid: {
      cols: number
      rows: number
    }
  }
  windows: {
    main: { x: number; y: number; width: number; height: number }
  }
  mcp: {
    port: number
    host: string
    apiKey: string
  }
  voice: {
    enabled: boolean
    piperVoice: string
  }
  projects: {
    list: ProjectRecord[]
    activeId: string | null
  }
}

const defaults: CipherKeelConfig = {
  app: {
    maxSessions: MAX_SESSIONS,
  },
  agent: {
    skipPermissions: false,
  },
  ui: {
    theme: 'dark',
    language: 'en',
    grid: {
      cols: 2,
      rows: 2,
    },
  },
  windows: {
    main: { x: 0, y: 0, width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT },
  },
  mcp: {
    port: 3100,
    host: '127.0.0.1',
    apiKey: '',
  },
  voice: {
    enabled: true,
    piperVoice: 'de_DE-cipher_adult-medium',
  },
  projects: {
    list: [],
    activeId: null,
  },
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'cipher-keel-config.json')
}

/**
 * Deep merge source into target. Source values win.
 * Only merges plain objects — arrays and primitives are overwritten.
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    const tVal = (target as Record<string, unknown>)[key]
    const sVal = source[key]
    if (
      tVal && sVal &&
      typeof tVal === 'object' && !Array.isArray(tVal) &&
      typeof sVal === 'object' && !Array.isArray(sVal)
    ) {
      (result as Record<string, unknown>)[key] = deepMerge(
        tVal as Record<string, unknown>,
        sVal as Record<string, unknown>
      )
    } else {
      (result as Record<string, unknown>)[key] = sVal
    }
  }
  return result
}

function loadConfig(): CipherKeelConfig {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf-8')
    if (!raw.trim()) return { ...defaults }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return deepMerge({ ...defaults } as unknown as Record<string, unknown>, parsed) as unknown as CipherKeelConfig
  } catch {
    return { ...defaults }
  }
}

function saveConfig(config: CipherKeelConfig): void {
  const configPath = getConfigPath()
  const dir = path.dirname(configPath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 })
}

let cached: CipherKeelConfig | null = null

function getConfig(): CipherKeelConfig {
  if (!cached) {
    cached = loadConfig()
  }
  return cached
}

export const configStore = {
  get<K extends keyof CipherKeelConfig>(key: K): CipherKeelConfig[K] {
    return getConfig()[key]
  },

  set<K extends keyof CipherKeelConfig>(key: K, value: CipherKeelConfig[K]): void {
    const config = getConfig()
    config[key] = value
    cached = config
    saveConfig(config)
  },

  getAll(): CipherKeelConfig {
    return { ...getConfig() }
  },

  reset(): void {
    cached = { ...defaults }
    saveConfig(cached)
  },
}
