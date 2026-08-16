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

/**
 * Where a model request goes. Loose on purpose — `worker/model-client.ts` normalises it
 * into a discriminated union, so an existing config file keeps working and a new provider
 * needs no migration. Never holds a key: `keyRef` names where the key is stored.
 */
export interface LlmEndpoint {
  /** 'ollama' (default) or 'openai-compatible'. */
  kind?: 'ollama' | 'openai-compatible'
  host?: string
  port?: number
  /** For openai-compatible: e.g. https://openrouter.ai/api/v1 */
  baseUrl?: string
  /** For openai-compatible: the name the key is stored under, never the key. */
  keyRef?: string
  model: string
}

export interface CipherKeelConfig {
  app: {
    maxSessions: number
  }
  agent: {
    skipPermissions: boolean
    /**
     * Tier label -> model handle, for the Rahmen's `model` field (M2 section 5.3).
     * Aliases rather than pinned ids: M2 calls concrete handles fragile, and aliases
     * survive model releases. An empty value means "let the harness decide".
     */
    modelTiers: { light: string; standard: string; heavy: string }
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
  /**
   * Two endpoints, because the two callers have opposite profiles. Tagging is small and
   * frequent and belongs next to the notes it tags; a Niveau-C worker job is large and
   * occasional and belongs on whichever machine has the memory for a serious model.
   */
  llm: {
    /** Note auto-tagging — local by default. */
    tagging: LlmEndpoint
    /** Niveau-C worker jobs. Intended for the DGX Spark; see docs/anpassbare-flaechen.md. */
    worker: LlmEndpoint
  }
  /**
   * The model registry. Bundled defaults live in `model/defaults.ts`; entries here
   * override them by id. Assignments are empty by default, which is what keeps a config
   * file written before this feature behaving exactly as it did.
   */
  modelle: {
    eintraege: unknown[]
    zuordnung: {
      tiers: { light: string; standard: string; heavy: string }
      rollen: { tagging: string; worker: string }
    }
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
    // Sessions are launched by the app itself; true matches cipher-mux 0.9.x behaviour.
    skipPermissions: true,
    // The strength gradient the presets already express: heavy where errors multiply
    // (Systems Engineer, Architect), standard elsewhere. Editable per CK-NFR-012.
    modelTiers: { light: 'haiku', standard: 'sonnet', heavy: 'opus' },
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
  llm: {
    tagging: {
      host: '127.0.0.1',
      port: 11434,
      model: 'qwen3:30b-a3b-instruct-2507-q4_K_M',
    },
    // Worker jobs go to the DGX Spark, which is the machine with the memory for a serious
    // model and the one place where pinning one costs nobody anything.
    //
    // Measured 2026-08-14 on the Spark itself: Ollama runs there as a container whose
    // OLLAMA_HOST is already 0.0.0.0 — it is Docker's host binding, 127.0.0.1:11434, that
    // closes it. Until that binding is widened, worker jobs fail with "Ollama ist auf
    // 100.78.7.108:11434 nicht erreichbar", which names the cause exactly. Pointing at the
    // intended host anyway is deliberate: the failure is honest, a local default would
    // quietly work for the wrong reason.
    worker: {
      host: '100.78.7.108', // gx10-91a9 (DGX Spark) over Tailscale
      port: 11434,
      // Verified present on the Spark and answering the return contract on the first try.
      // The machine also carries gpt-oss:120b and llama4:scout for heavier work.
      model: 'gemma4:26b',
    },
  },
  modelle: {
    eintraege: [],
    zuordnung: {
      tiers: { light: '', standard: '', heavy: '' },
      rollen: { tagging: '', worker: '' },
    },
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
