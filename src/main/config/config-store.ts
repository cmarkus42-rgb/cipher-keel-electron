/**
 * ConfigStore — persistent JSON-File-Store for app configuration.
 *
 * Simplified port from cipher-mux 0.9.x (CK-INF-008).
 * Stores config at ~/Library/Application Support/cipher-keel-electron/cipher-keel-config.json
 * (verified by measurement; `app.getPath('userData')` is the actual source of truth).
 *
 * cipher-keel-specific: stripped down to essential fields.
 * 0.9.x-era fields (personas, characters, workshop, etc.) will be
 * added as those modules are ported in later phases.
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
// DEFAULT_WINDOW_WIDTH/HEIGHT und MAX_SESSIONS werden hier nicht mehr gebraucht — die
// Fenstergroessen stehen in window-manager.ts, und app.maxSessions hatte nie einen Leser.

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
  agent: {
    /**
     * Extra launch parameters per adapter id, as one free-text line each. Replaces the
     * former `skipPermissions` boolean, which named one vendor's flag in the schema
     * itself. The app-driven flags (see AgentAdapter.appGesteuerteParameter) are added
     * on top of these, never replaced by them.
     */
    startArgs: Record<string, string>
    /**
     * Tier label -> model handle, for the Rahmen's `model` field (M2 section 5.3).
     * Aliases rather than pinned ids: M2 calls concrete handles fragile, and aliases
     * survive model releases. An empty value means "let the harness decide".
     */
    modelTiers: { light: string; standard: string; heavy: string }
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
  agent: {
    // Sessions are launched by the app itself, into a tmux pane it drives — nobody is
    // sitting there to answer a permission prompt, so a fresh install keeps the flag that
    // has matched cipher-mux 0.9.x behaviour all along. This is a default *value* under an
    // adapter key, not a vendor name baked into the schema's *shape*; only the latter is
    // what startArgs replaces. It is also what migriere() produces for an existing
    // `skipPermissions: true`, so a fresh install and a migrated one launch identically.
    startArgs: { 'claude-code': '--dangerously-skip-permissions' },
    // The strength gradient the presets already express: heavy where errors multiply
    // (Systems Engineer, Architect), standard elsewhere. Editable per CK-NFR-012.
    modelTiers: { light: 'haiku', standard: 'sonnet', heavy: 'opus' },
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

const TOTE_BLOECKE = ['app', 'ui', 'mcp', 'windows']

/**
 * Bring a config file written before this feature up to the current shape.
 *
 * Idempotent by construction: every branch is guarded on the old key still being present,
 * so a second run finds nothing to do and reports `veraendert: false` — which is what
 * keeps loadConfig from rewriting the file on every start.
 *
 * Exported so it can be tested without a filesystem.
 */
export function migriere(roh: Record<string, unknown>): {
  config: Record<string, unknown>
  veraendert: boolean
} {
  const config = { ...roh }
  let veraendert = false

  const agent = config.agent as Record<string, unknown> | undefined
  if (agent && 'skipPermissions' in agent) {
    const neu = { ...agent }
    // A hand-written startArgs wins: the user stated the newer intent explicitly.
    if (!neu.startArgs) {
      neu.startArgs = {
        'claude-code': neu.skipPermissions === true ? '--dangerously-skip-permissions' : '',
      }
    }
    delete neu.skipPermissions
    config.agent = neu
    veraendert = true
  }

  for (const block of TOTE_BLOECKE) {
    if (block in config) {
      delete config[block]
      veraendert = true
    }
  }

  return { config, veraendert }
}

function loadConfig(): CipherKeelConfig {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf-8')
    if (!raw.trim()) return { ...defaults }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const { config: migriert, veraendert } = migriere(parsed)
    const zusammengefuehrt = deepMerge(
      { ...defaults } as unknown as Record<string, unknown>,
      migriert
    ) as unknown as CipherKeelConfig
    // Persist the migration once, so the file on disk stops carrying the old shape.
    if (veraendert) saveConfig(zusammengefuehrt)
    return zusammengefuehrt
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

// Loaded lazily on first access, not at module import: `loadConfig` reaches
// `app.getPath('userData')` through `getConfigPath`, and that is not reliable yet at the
// moment this module is imported (it runs before `app.whenReady()` in the real app, and no
// test would catch an eager call breaking that — every test here mocks 'electron').
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
