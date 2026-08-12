# Niveau- und Adapter-Anbindung — Umsetzungsplan

> **Für agentische Worker:** ERFORDERLICHE SUB-SKILL: `superpowers:subagent-driven-development`
> (empfohlen) oder `superpowers:executing-plans`, um diesen Plan Task für Task umzusetzen.
> Schritte tragen Checkbox-Syntax (`- [ ]`) zur Fortschrittsverfolgung.

**Ziel:** Das Leistungsgefälle aus M4 bedienbar machen — das Capability-Niveau kommt vom
Adapter, `runtime` wählt den Adapter, NanoClaw ist registriert, und das Modell-Tier wird
aufgelöst statt verworfen.

**Architektur:** Capability-Pakete werden die einzige Deklaration je Entität; die
handgepflegten Niveau-String-Listen entfallen. Der Adapter deklariert sein Niveau (M2
§11.3), `session:create` löst ihn über `rahmen.runtime` auf statt über `getDefault()`, und
der Assembler verzweigt an einer Stelle nach `loaderStrategie`. Das Modell-Feld wird
zweiformig aufgelöst: Tier über eine Config-Tabelle, `provider:modell` unverändert.

**Tech-Stack:** TypeScript, Electron, Vitest, React (Renderer). Keine neuen Abhängigkeiten.

**Spec:** `docs/superpowers/specs/2026-08-11-niveau-adapter-anbindung-design.md`

## Global Constraints

- **TDD ohne Ausnahme:** Test zuerst schreiben, rot sehen, minimal implementieren, grün
  sehen, committen. Ein Schritt „Test rot sehen" wird nicht übersprungen.
- **Keine Regression:** `npm test` (aktuell 1788 grün / 128 Dateien), `npm run typecheck`
  und `npm run lint` müssen nach jedem Commit grün sein.
- **Sprachregel:** Code-Kommentare, Bezeichner, Testnamen **englisch**. Prompt-Inhalte
  (Bodies, Personas, SKILL.md, GlobalRules) und Dokumente unter `docs/superpowers/`
  **deutsch**.
- **Security-Baseline unverhandelbar** (CK-NFR-004, CK-INF-022): `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`. `src/preload.ts` bleibt die einzige
  `contextBridge.exposeInMainWorld`-Aufrufstelle.
- **Native-ABI-Falle:** `better-sqlite3` liegt zweimal im `node_modules`. Bei rund 497
  fallenden Tests bei unverändertem Code: `npm run rebuild-native` ausführen, **nie** eine
  Quelldatei ändern.
- **Bündel-Wächter:** Wer eine neue Markdown-Datei per `?raw` einbindet, setzt einen Marker
  in `scripts/verify-bundle.mjs`. Marker müssen ASCII und frei von Anführungszeichen sein.
- **Niveau C wird nicht angefasst.** M6 Z. 177 stellt es auf 0.2. Das heutige C-Verhalten
  des Assemblers (Body-Kappung auf 2000 Token) bleibt unverändert.
- **Niveau A wird nicht angefasst.** Die `@`-Emission ist dreimal in der laufenden App
  belegt. Die offene Lazy-Loading-Frage ist eine Messfrage einer Folgephase.

---

## Dateistruktur

**Neu:**

| Datei | Verantwortung |
|---|---|
| `src/main/preset/capabilities.ts` | Einheitlicher Paket-Zugriff `getCapabilityPackages(entityId, niveau)` und `capabilityPath(pkg)` |
| `src/main/session/model-resolver.ts` | Zweiformige Auflösung des `model`-Felds (Tier vs. `provider:modell`) |
| `src/main/session/preview-prompt.ts` | Assembliert den Prompt ohne Session-Start und ohne Schreibzugriff |
| `src/renderer/components/PromptPreview.tsx` | Dialog, der das Vorschau-Ergebnis anzeigt |
| `docs/anpassbare-flaechen.md` | Inventar aller anpassbaren Flächen (CK-NFR-012) |

**Geändert:**

| Datei | Änderung |
|---|---|
| `src/main/agent/agent-adapter.ts` | Interface bekommt `readonly niveau: CapabilityNiveau` |
| `src/main/agent/adapters/claude-code.ts` | `niveau = A` |
| `src/main/nanoclaw/adapter.ts` | `niveau = B` |
| `src/main/agent/registry.ts` | keine Änderung an `getForRuntime` — nur Aufrufer ändern sich |
| `src/main/main.ts:56` | `_nanoClawAdapter` entfällt; Registrierung wandert in `registerIpcHandlers` |
| `src/main/ipc-handlers.ts` | Registry wird in `registerIpcHandlers` erzeugt; Adapter über `runtime`; Niveau vom Adapter; `model` durchgereicht; neuer Vorschau-Kanal |
| `src/main/preset/registry.ts` | neuer billiger `getEntityRahmen(entityId, niveau?)` |
| `src/main/preset/capability-schema.ts` | `pfad` wird optional |
| `src/main/preset/*/[…]-capabilities.ts` | einheitliche Paket-Deklaration je Entität |
| `src/main/preset/*/[…]-preset.ts` | `capabilityAnbindung` aus den Paketen abgeleitet; String-Listen entfallen |
| `src/main/session/assemble-entity.ts` | Niveau-B-Inventar statt stiller Leere |
| `src/main/config/config-store.ts` | `agent.modelTiers` |
| `src/shared/ipc-channels.ts` | `PRESET_PREVIEW_PROMPT` |
| `src/renderer/components/LauncherCell.tsx` | Aktion „Prompt ansehen" je Preset |

**Gelöscht:**

| Datei | Grund |
|---|---|
| `src/main/preset/capability-tree.ts` | Lazy-Loading von Platte trifft keinen realen Fall mehr |
| `src/main/preset/capability-loader.ts` | dito; liest `pkg.pfad`, Inhalte liegen im Bundle |
| `tests/capability-system.test.ts` | testet ausschließlich die beiden gelöschten Module |

---

## Task 1: Der Adapter deklariert sein Niveau

**Files:**
- Modify: `src/main/agent/agent-adapter.ts`
- Modify: `src/main/agent/adapters/claude-code.ts`
- Modify: `src/main/nanoclaw/adapter.ts`
- Test: `tests/agent/adapter-niveau.test.ts` (neu)

**Interfaces:**
- Consumes: `CapabilityNiveau` aus `src/main/preset/niveau.ts`
- Produces: `AgentAdapter.niveau: CapabilityNiveau` — Task 3 liest es

- [ ] **Schritt 1: Fehlschlagenden Test schreiben**

```ts
// tests/agent/adapter-niveau.test.ts
import { describe, it, expect } from 'vitest'
import { ClaudeCodeAdapter } from '../../src/main/agent/adapters/claude-code'
import { NanoClawChannelAdapter } from '../../src/main/nanoclaw/adapter'
import { NanoClawBridge } from '../../src/main/nanoclaw/bridge'
import { CapabilityNiveau } from '../../src/main/preset/niveau'

describe('adapter niveau declaration (M2 section 11.3)', () => {
  it('ClaudeCodeAdapter runs at Niveau A', () => {
    const adapter = new ClaudeCodeAdapter({ getSkipPermissions: () => true })
    expect(adapter.niveau).toBe(CapabilityNiveau.A)
  })

  it('NanoClawChannelAdapter runs at Niveau B', () => {
    const adapter = new NanoClawChannelAdapter(new NanoClawBridge('/tmp/does-not-exist.sock'))
    expect(adapter.niveau).toBe(CapabilityNiveau.B)
  })
})
```

- [ ] **Schritt 2: Test laufen lassen, Rot bestätigen**

Ausführen: `npx vitest run tests/agent/adapter-niveau.test.ts`
Erwartet: FAIL — `niveau` existiert auf keinem der beiden Adapter.

- [ ] **Schritt 3: Minimal implementieren**

In `src/main/agent/agent-adapter.ts`, im `AgentAdapter`-Interface direkt nach `tier`:

```ts
  /**
   * Capability niveau this adapter can serve (M2 section 11.3).
   * Claude Code is the only harness with native SKILL.md lazy-loading (A);
   * every other harness in the garden is B.
   */
  readonly niveau: CapabilityNiveau
```

Dazu am Kopf der Datei:

```ts
import { CapabilityNiveau } from '../preset/niveau'
```

In `src/main/agent/adapters/claude-code.ts`, in der Klasse neben `readonly tier`:

```ts
  readonly niveau = CapabilityNiveau.A
```

und der passende Import. In `src/main/nanoclaw/adapter.ts` analog:

```ts
  readonly niveau = CapabilityNiveau.B
```

- [ ] **Schritt 4: Test laufen lassen, Grün bestätigen**

Ausführen: `npx vitest run tests/agent/adapter-niveau.test.ts`
Erwartet: PASS, beide Tests.

- [ ] **Schritt 5: Volle Suite und Typecheck**

Ausführen: `npm test && npm run typecheck && npm run lint`
Erwartet: alles grün. Schlägt der Typecheck in einer Testdatei mit einem Fake-Adapter fehl,
bekommt dieser Fake ebenfalls `niveau: CapabilityNiveau.A` — nicht das Interface aufweichen.

- [ ] **Schritt 6: Committen**

```bash
git add src/main/agent/agent-adapter.ts src/main/agent/adapters/claude-code.ts \
        src/main/nanoclaw/adapter.ts tests/agent/adapter-niveau.test.ts
git commit -m "feat(agent): adapters declare their capability niveau (M2 11.3)"
```

---

## Task 2: NanoClaw registrieren, Adapter über `runtime` auflösen

Heute konstruiert `main.ts:56` den NanoClaw-Adapter in eine Unterstrich-Variable und
registriert ihn nie; `ipc-handlers.ts:188` ruft `getDefault()` und ignoriert
`rahmen.runtime`. Ein Preset mit NanoClaw-Runtime würde damit still eine Claude-Session
starten.

**Files:**
- Modify: `src/main/main.ts:56`
- Modify: `src/main/ipc-handlers.ts:126-128` (Registry-Erzeugung) und `:181-190`
- Test: `tests/agent/adapter-runtime-resolution.test.ts` (neu)

**Interfaces:**
- Consumes: `AdapterRegistry.getForRuntime(runtime)` — existiert bereits ungenutzt
- Produces: registrierter `nanoclaw-channel`-Adapter; `session:create` wählt nach `runtime`

- [ ] **Schritt 1: Fehlschlagenden Test schreiben**

```ts
// tests/agent/adapter-runtime-resolution.test.ts
import { describe, it, expect } from 'vitest'
import { AdapterRegistry } from '../../src/main/agent/registry'
import { NanoClawChannelAdapter } from '../../src/main/nanoclaw/adapter'
import { NanoClawBridge } from '../../src/main/nanoclaw/bridge'

function makeRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry({ getSkipPermissions: () => true })
  registry.register(new NanoClawChannelAdapter(new NanoClawBridge('/tmp/nope.sock')))
  return registry
}

describe('runtime to adapter resolution', () => {
  it('resolves claude-cli-tmux to the Claude adapter', () => {
    expect(makeRegistry().getForRuntime('claude-cli-tmux').id).toBe('claude-code')
  })

  it('resolves nanoclaw-channel-route to the NanoClaw adapter once registered', () => {
    expect(makeRegistry().getForRuntime('nanoclaw-channel-route').id).toBe('nanoclaw-channel')
  })

  it('falls back to the default adapter when runtime is empty (M2 section 11.4)', () => {
    expect(makeRegistry().getForRuntime('').id).toBe('claude-code')
  })

  it('throws on an unknown runtime instead of silently using Claude', () => {
    expect(() => makeRegistry().getForRuntime('made-up-runtime')).toThrow(/made-up-runtime/)
  })

  it('throws when the runtime is known but its adapter was never registered', () => {
    const bare = new AdapterRegistry({ getSkipPermissions: () => true })
    expect(() => bare.getForRuntime('nanoclaw-channel-route')).toThrow(/not registered/)
  })
})
```

- [ ] **Schritt 2: Test laufen lassen**

Ausführen: `npx vitest run tests/agent/adapter-runtime-resolution.test.ts`
Erwartet: Die ersten drei und der fünfte laufen bereits grün — `getForRuntime` existiert.
Der zweite schlägt fehl, solange `register` im Test steht, aber die Produktion ihn nicht
ruft; er dient hier als Vertrag für Schritt 3. Der Wert dieses Tasks liegt im
Produktionsaufrufer, den Schritt 3 herstellt.

- [ ] **Schritt 3: Registry in `registerIpcHandlers` erzeugen und NanoClaw registrieren**

In `src/main/ipc-handlers.ts` die Modul-Konstante bei Zeile 126 **entfernen**:

```ts
// entfällt:
// const adapterRegistry = new AdapterRegistry({
//   getSkipPermissions: () => configStore.get('agent').skipPermissions,
// })
```

und stattdessen zu Beginn von `registerIpcHandlers(services)` erzeugen — das ist die eine
Stelle, an der sowohl der ConfigStore als auch `services.nanoClawBridge` verfügbar sind:

```ts
export function registerIpcHandlers(services: AppServices): void {
  // The registry needs both the ConfigStore (skip-permissions) and the NanoClaw bridge.
  // Building it here is what lets the second Schenkel be registered at all: main.ts used
  // to construct NanoClawChannelAdapter into a discarded variable, so `runtime:
  // 'nanoclaw-channel-route'` would have silently launched Claude.
  const adapterRegistry = new AdapterRegistry({
    getSkipPermissions: () => configStore.get('agent').skipPermissions,
  })
  adapterRegistry.register(new NanoClawChannelAdapter(services.nanoClawBridge))
```

Import ergänzen:

```ts
import { NanoClawChannelAdapter } from './nanoclaw'
```

In `src/main/main.ts` die Zeilen 55–56 entfernen:

```ts
// entfällt — der Adapter wird jetzt in registerIpcHandlers registriert:
// const _nanoClawAdapter = new NanoClawChannelAdapter(services.nanoClawBridge)
```

und den nun ungenutzten `NanoClawChannelAdapter`-Import in `main.ts` auf `NanoClawBridge`
reduzieren.

- [ ] **Schritt 4: Adapter im `session:create`-Handler über `runtime` auflösen**

In `src/main/ipc-handlers.ts` die Zeile

```ts
      const adapter = adapterRegistry.getDefault()
```

ersetzen durch:

```ts
      // The Rahmen declares which harness this entity runs on (M2 section 11.4).
      // An unknown runtime throws rather than falling back — a silent fallback would
      // start a Claude session for an entity that asked for something else.
      let adapter
      try {
        adapter = adapterRegistry.getForRuntime(def.rahmen.runtime)
      } catch (err) {
        return { id: null, name: null, error: (err as Error).message }
      }
```

Die anschließende Verfügbarkeitsprüfung bleibt, wird aber adapter-genau statt
claude-spezifisch:

```ts
      if (!adapter.isAvailable()) {
        return {
          id: null,
          name: null,
          error: adapter.id === 'claude-code'
            ? describeMissingTool('claude')
            : `Adapter '${adapter.displayName}' is not available — session not started`,
        }
      }
```

- [ ] **Schritt 5: Tests laufen lassen**

Ausführen: `npx vitest run tests/agent/adapter-runtime-resolution.test.ts && npm test`
Erwartet: alles grün. `tests/session/session-create-claude-gate.test.ts` erreicht den
echten `ipcMain`-Handler per `vi.doMock('electron')` und muss weiter grün sein — schlägt er
fehl, ist die Verfügbarkeitsprüfung falsch verdrahtet, nicht der Test veraltet.

- [ ] **Schritt 6: Typecheck, Lint, Committen**

```bash
npm run typecheck && npm run lint
git add src/main/main.ts src/main/ipc-handlers.ts tests/agent/adapter-runtime-resolution.test.ts
git commit -m "fix(agent): register the NanoClaw adapter and resolve adapters by runtime"
```

---

## Task 3: Das Niveau kommt vom Adapter

`getEntityDefinition` nimmt bereits ein Niveau entgegen, bekommt aber nie eines. Weil
`runtime` im Rahmen steht und das Niveau aus dem Adapter kommt, wird in zwei Schritten
aufgelöst — über einen billigen Rahmen-Zugriff, der keine Persona lädt.

**Files:**
- Modify: `src/main/preset/registry.ts`
- Modify: `src/main/preset/index.ts` (Export)
- Modify: `src/main/ipc-handlers.ts` (`session:create`)
- Test: `tests/preset/entity-rahmen.test.ts` (neu)

**Interfaces:**
- Consumes: `AgentAdapter.niveau` (Task 1), `getForRuntime` (Task 2)
- Produces: `getEntityRahmen(entityId, niveau?): PresetRahmen | null`

- [ ] **Schritt 1: Fehlschlagenden Test schreiben**

```ts
// tests/preset/entity-rahmen.test.ts
import { describe, it, expect } from 'vitest'
import { getEntityRahmen } from '../../src/main/preset/registry'
import { CapabilityNiveau } from '../../src/main/preset/niveau'

describe('getEntityRahmen', () => {
  it('returns the runtime without resolving a persona', () => {
    expect(getEntityRahmen('architect')?.runtime).toBe('claude-cli-tmux')
  })

  it('defaults to Niveau A', () => {
    expect(getEntityRahmen('architect')?.capabilityNiveau).toBe(CapabilityNiveau.A)
  })

  it('honours the requested niveau', () => {
    expect(getEntityRahmen('architect', CapabilityNiveau.B)?.capabilityNiveau)
      .toBe(CapabilityNiveau.B)
  })

  it('returns null for an unknown entity', () => {
    expect(getEntityRahmen('nope')).toBeNull()
  })
})
```

- [ ] **Schritt 2: Test laufen lassen, Rot bestätigen**

Ausführen: `npx vitest run tests/preset/entity-rahmen.test.ts`
Erwartet: FAIL — `getEntityRahmen` ist nicht exportiert.

- [ ] **Schritt 3: Implementieren**

In `src/main/preset/registry.ts`, vor `getEntityDefinition`:

```ts
/**
 * Build only the Rahmen for an entity — no persona resolution, no body.
 *
 * session:create needs `runtime` before it can pick an adapter, and it needs the
 * adapter before it knows the niveau the full definition should be built at. This is
 * the cheap first half of that two-step resolution.
 */
export function getEntityRahmen(
  entityId: string,
  niveau: CapabilityNiveau = CapabilityNiveau.A,
): PresetRahmen | null {
  const entry = ENTITIES[entityId]
  if (!entry) return null
  return entry.rahmen(niveau)
}
```

In `src/main/preset/index.ts` den Export ergänzen:

```ts
export { getEntityDefinition, getEntityRahmen, listEntityIds } from './registry'
```

- [ ] **Schritt 4: Test laufen lassen, Grün bestätigen**

Ausführen: `npx vitest run tests/preset/entity-rahmen.test.ts`
Erwartet: PASS, vier Tests.

- [ ] **Schritt 5: `session:create` auf die Zwei-Schritt-Auflösung umstellen**

In `src/main/ipc-handlers.ts` den Block ersetzen, der heute mit
`const def = getEntityDefinition(entityId)` beginnt:

```ts
      // Two-step resolution: the Rahmen carries `runtime`, the adapter carries the
      // niveau, and the full definition depends on the niveau (M2 section 11.3/11.4).
      const rahmen = getEntityRahmen(entityId)
      if (!rahmen) {
        return { id: null, name: null, error: `Unknown entity '${entityId}'` }
      }

      let adapter
      try {
        adapter = adapterRegistry.getForRuntime(rahmen.runtime)
      } catch (err) {
        return { id: null, name: null, error: (err as Error).message }
      }

      if (!adapter.isAvailable()) {
        return {
          id: null,
          name: null,
          error: adapter.id === 'claude-code'
            ? describeMissingTool('claude')
            : `Adapter '${adapter.displayName}' is not available — session not started`,
        }
      }

      const def = getEntityDefinition(entityId, adapter.niveau)
      if (!def) {
        return { id: null, name: null, error: `Unknown entity '${entityId}'` }
      }
```

Der Import wird auf `import { getEntityDefinition, getEntityRahmen } from './preset/registry'`
erweitert. Der in Task 2 eingefügte Adapter-Block weiter unten entfällt dabei — er ist
hierher gewandert.

- [ ] **Schritt 6: Volle Suite, Typecheck, Lint, Committen**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/preset/registry.ts src/main/preset/index.ts src/main/ipc-handlers.ts \
        tests/preset/entity-rahmen.test.ts
git commit -m "feat(preset): the session niveau comes from the resolved adapter"
```

---

## Task 4: Das Modell-Tier auflösen statt verwerfen

`ipc-handlers.ts` lässt `model` heute bewusst weg, weil `'heavy'` auf keine Model-ID
abbildet. M2 §5.3/§6.3 kennt zwei Formen: Tier-Bezeichner auf Schenkel 1,
`provider:modell` auf Schenkel 2.

**Achtung, einzige Verhaltensänderung dieses Plans:** Nach diesem Task starten
Systems-Engineer- und Architect-Sessions auf der Opus-Klasse statt auf dem Harness-Default.
Das ist die Absicht des Gefälles und wird in Task 9 in der laufenden App belegt.

**Files:**
- Create: `src/main/session/model-resolver.ts`
- Modify: `src/main/config/config-store.ts`
- Modify: `src/main/ipc-handlers.ts:209-217`
- Test: `tests/session/model-resolver.test.ts` (neu)

**Interfaces:**
- Consumes: `configStore.get('agent').modelTiers`
- Produces: `resolveModel(rahmenModel: string, tiers: ModelTiers): string | undefined`

- [ ] **Schritt 1: Fehlschlagenden Test schreiben**

```ts
// tests/session/model-resolver.test.ts
import { describe, it, expect } from 'vitest'
import { resolveModel } from '../../src/main/session/model-resolver'

const TIERS = { light: 'haiku', standard: 'sonnet', heavy: 'opus' }

describe('resolveModel', () => {
  it('maps a tier label to the configured handle', () => {
    expect(resolveModel('heavy', TIERS)).toBe('opus')
    expect(resolveModel('standard', TIERS)).toBe('sonnet')
    expect(resolveModel('light', TIERS)).toBe('haiku')
  })

  it('passes a provider:model handle through verbatim (Schenkel 2, M2 6.3)', () => {
    expect(resolveModel('ollama:gemma3:27b', TIERS)).toBe('ollama:gemma3:27b')
    expect(resolveModel('anthropic:claude-opus-4', TIERS)).toBe('anthropic:claude-opus-4')
  })

  it('returns undefined for an empty model field — harness default', () => {
    expect(resolveModel('', TIERS)).toBeUndefined()
  })

  it('returns undefined when the tier maps to an empty handle', () => {
    expect(resolveModel('heavy', { light: '', standard: '', heavy: '' })).toBeUndefined()
  })

  it('returns undefined for an unknown tier rather than passing it through', () => {
    expect(resolveModel('gigantic', TIERS)).toBeUndefined()
  })
})
```

- [ ] **Schritt 2: Test laufen lassen, Rot bestätigen**

Ausführen: `npx vitest run tests/session/model-resolver.test.ts`
Erwartet: FAIL — Modul existiert nicht.

- [ ] **Schritt 3: Resolver implementieren**

```ts
// src/main/session/model-resolver.ts
/**
 * model-resolver — turn a Rahmen's `model` field into something a harness accepts.
 *
 * M2 sections 5.3 and 6.3 define two forms:
 *   Schenkel 1 (CLI harnesses): a tier label — light | standard | heavy. The concept
 *     calls concrete handles "fragil", which is why the mapping lives in the config
 *     and ships as aliases rather than pinned model ids.
 *   Schenkel 2 (NanoClaw): a `provider:modell` handle, e.g. `ollama:gemma3:27b`.
 *     It is passed through untouched — cipher keel does not own that namespace.
 *
 * An unresolvable value yields undefined, which means "omit --model and let the
 * harness decide" — the behaviour every session had before this existed.
 */

export interface ModelTiers {
  light: string
  standard: string
  heavy: string
}

const TIER_KEYS = new Set<keyof ModelTiers>(['light', 'standard', 'heavy'])

export function resolveModel(rahmenModel: string, tiers: ModelTiers): string | undefined {
  if (!rahmenModel) return undefined

  // A colon marks a provider-qualified handle (Schenkel 2) — never a tier.
  if (rahmenModel.includes(':')) return rahmenModel

  if (!TIER_KEYS.has(rahmenModel as keyof ModelTiers)) return undefined

  const handle = tiers[rahmenModel as keyof ModelTiers]
  return handle ? handle : undefined
}
```

- [ ] **Schritt 4: Test laufen lassen, Grün bestätigen**

Ausführen: `npx vitest run tests/session/model-resolver.test.ts`
Erwartet: PASS, fünf Tests.

- [ ] **Schritt 5: Config-Feld ergänzen**

In `src/main/config/config-store.ts` das `agent`-Interface erweitern:

```ts
  agent: {
    skipPermissions: boolean
    /**
     * Tier label -> model handle. Aliases, not pinned ids: M2 calls concrete handles
     * fragile, and aliases survive model releases. Empty string = harness default.
     */
    modelTiers: { light: string; standard: string; heavy: string }
  }
```

und die Defaults:

```ts
  agent: {
    // Sessions are launched by the app itself; true matches cipher-mux 0.9.x behaviour.
    skipPermissions: true,
    modelTiers: { light: 'haiku', standard: 'sonnet', heavy: 'opus' },
  },
```

- [ ] **Schritt 6: Im Handler durchreichen**

In `src/main/ipc-handlers.ts` den Kommentarblock bei Zeile 209–212 und den
`buildLaunchCommand`-Aufruf ersetzen:

```ts
      // The Rahmen's model is a tier label (Schenkel 1) or a provider:model handle
      // (Schenkel 2). Unresolvable values omit --model, which is what every session
      // did before the tier table existed.
      const model = resolveModel(def.rahmen.model, configStore.get('agent').modelTiers)

      const launch = adapter.buildLaunchCommand({
        projectPath: cwd,
        sessionName: name,
        appendSystemPromptFile: promptPath,
        model,
      })
```

Import ergänzen: `import { resolveModel } from './session/model-resolver'`.

- [ ] **Schritt 7: Volle Suite, Typecheck, Lint, Committen**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/session/model-resolver.ts src/main/config/config-store.ts \
        src/main/ipc-handlers.ts tests/session/model-resolver.test.ts
git commit -m "feat(session): resolve the model tier instead of dropping it"
```

---

## Task 5: `pfad` wird abgeleitet statt handgepflegt

Jedes Paket kodiert seinen `pfad` von Hand, obwohl `capabilityRefPath(id)` genau diesen
Pfad erzeugt. Der Loader `nanoclaw-skill` braucht `pfad` aber weiterhin als Channel-Route
(M2 §6.4) — deshalb wird abgeleitet, nicht gelöscht.

**Files:**
- Create: `src/main/preset/capabilities.ts`
- Modify: `src/main/preset/capability-schema.ts`
- Test: `tests/preset/capability-path.test.ts` (neu)

**Interfaces:**
- Consumes: `capabilityRefPath(id)` aus `src/main/session/capability-refs.ts`
- Produces: `capabilityPath(pkg): string` — Task 6 nutzt es für das B-Inventar

- [ ] **Schritt 1: Fehlschlagenden Test schreiben**

```ts
// tests/preset/capability-path.test.ts
import { describe, it, expect } from 'vitest'
import { capabilityPath } from '../../src/main/preset/capabilities'
import { LoaderType } from '../../src/main/preset/capability-schema'
import { validateCapabilityPackage } from '../../src/main/preset/capability-schema'

describe('capabilityPath', () => {
  it('derives the path from the id when the package declares none', () => {
    expect(capabilityPath({
      name: 'gate-urteil-guide',
      beschreibung: 'x',
      loader: LoaderType.SkillMd,
    })).toBe('.claude/capabilities/gate-urteil-guide/SKILL.md')
  })

  it('honours an explicit pfad — nanoclaw-skill routes are not derivable', () => {
    expect(capabilityPath({
      name: 'some-skill',
      beschreibung: 'x',
      loader: LoaderType.NanoClawSkill,
      pfad: 'channel://skills/some-skill',
    })).toBe('channel://skills/some-skill')
  })
})

describe('validateCapabilityPackage with optional pfad', () => {
  it('accepts a skill-md package without pfad', () => {
    const result = validateCapabilityPackage({
      name: 'a', beschreibung: 'b', loader: 'skill-md',
    })
    expect(result.valid).toBe(true)
  })

  it('still rejects a nanoclaw-skill package without pfad', () => {
    const result = validateCapabilityPackage({
      name: 'a', beschreibung: 'b', loader: 'nanoclaw-skill',
    })
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/pfad/)
  })
})
```

- [ ] **Schritt 2: Test laufen lassen, Rot bestätigen**

Ausführen: `npx vitest run tests/preset/capability-path.test.ts`
Erwartet: FAIL — `src/main/preset/capabilities.ts` existiert nicht.

- [ ] **Schritt 3: Schema und Helfer implementieren**

In `src/main/preset/capability-schema.ts` das Feld optional machen:

```ts
  /**
   * Path to the package file, or channel route for nanoclaw-skill.
   * Optional for skill-md: derived from the name via capabilityPath().
   */
  pfad?: string
```

und die Validierung ersetzen:

```ts
  // pfad is derivable for skill-md (from the name) and meaningless for inline.
  // nanoclaw-skill and reference-material carry a route or a file that no
  // convention produces, so for those it stays required.
  const pfadRequired = p.loader === LoaderType.NanoClawSkill
    || p.loader === LoaderType.ReferenceMaterial
  if (pfadRequired && (typeof p.pfad !== 'string' || p.pfad.trim() === '')) {
    errors.push(`pfad is required for loader '${String(p.loader)}'`)
  }
```

Neue Datei:

```ts
// src/main/preset/capabilities.ts
/**
 * Unified capability access.
 *
 * The path a capability occupies inside a project follows one convention
 * (.claude/capabilities/<id>/SKILL.md) that capabilityRefPath already owns. Packages
 * used to repeat it by hand, which made it the third of three encodings of the same
 * string. It is derived here instead — except where no convention can produce it,
 * which is the nanoclaw-skill channel route (M2 section 6.4).
 */

import type { CapabilityPackage } from './capability-schema'
import { capabilityRefPath } from '../session/capability-refs'

export function capabilityPath(pkg: CapabilityPackage): string {
  return pkg.pfad ?? capabilityRefPath(pkg.name)
}
```

- [ ] **Schritt 4: Test laufen lassen, Grün bestätigen**

Ausführen: `npx vitest run tests/preset/capability-path.test.ts`
Erwartet: PASS, vier Tests.

- [ ] **Schritt 5: `pfad` aus den skill-md-Literalen entfernen**

In `se-capabilities.ts`, `architect-capabilities.ts`, `cf-capabilities.ts`,
`workshop-capabilities.ts`, `ta-capabilities.ts` jede Zeile der Form

```ts
    pfad: '.claude/capabilities/<id>/SKILL.md',
```

löschen, wenn `<id>` gleich dem `name`-Feld desselben Pakets ist. Weicht sie ab, bleibt
`pfad` stehen — das wäre eine Abweichung, die dieser Task nicht stillschweigend
begradigen darf. Der Niveau-C-Zweig in `architect-capabilities.ts`, der `pfad: ''` setzt,
verliert die Zeile ebenfalls.

- [ ] **Schritt 6: Volle Suite, Typecheck, Lint, Committen**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/preset/ tests/preset/capability-path.test.ts
git commit -m "refactor(preset): derive the capability path instead of hand-coding it"
```

---

## Task 6: Ein einheitlicher Paket-Zugriff je Entität

Fünf Entitäten in drei Formen: Architect und CF haben niveau-filternde Paket-Getter ohne
Produktionsaufrufer, der SE einen String-Getter *mit* Aufrufer und ungenutzte Pakete
daneben, Workshop und TA je ein Paket-Array plus separate String-Listen.

**Files:**
- Modify: `src/main/preset/capabilities.ts`
- Modify: `src/main/preset/systems-engineer/se-capabilities.ts`, `se-preset.ts`
- Modify: `src/main/preset/workshop/workshop-capabilities.ts`, `workshop-preset.ts`
- Modify: `src/main/preset/testing-assistant/ta-capabilities.ts`, `ta-preset.ts`
- Modify: `src/main/preset/architect/architect-preset.ts`
- Modify: `src/main/preset/cyber-factory/cf-preset.ts`
- Test: `tests/preset/capability-packages.test.ts` (neu)

**Interfaces:**
- Consumes: `capabilityPath` (Task 5), die fünf Paket-Arrays
- Produces: `getCapabilityPackages(entityId, niveau): CapabilityPackage[]`

- [ ] **Schritt 1: Fehlschlagenden Test schreiben**

```ts
// tests/preset/capability-packages.test.ts
import { describe, it, expect } from 'vitest'
import { getCapabilityPackages } from '../../src/main/preset/capabilities'
import { getEntityRahmen } from '../../src/main/preset/registry'
import { CapabilityNiveau } from '../../src/main/preset/niveau'
import { listEntityIds } from '../../src/main/preset/registry'

describe('getCapabilityPackages', () => {
  it('returns the SE set at Niveau A — seven packages', () => {
    const names = getCapabilityPackages('systems-engineer', CapabilityNiveau.A).map(p => p.name)
    expect(names).toEqual([
      'se-core-identity', 'gate-urteil-guide', 'trigger-zeiger-format',
      'steuer-ueberblick-tool', 'handoff-logik-guide', 'rolling-summary',
      'graph-navigation-advanced',
    ])
  })

  it('drops niveauMinimum-A packages at Niveau B', () => {
    const names = getCapabilityPackages('systems-engineer', CapabilityNiveau.B).map(p => p.name)
    expect(names).not.toContain('steuer-ueberblick-tool')
    expect(names).not.toContain('graph-navigation-advanced')
    expect(names).toHaveLength(5)
  })

  it('returns an empty array for an unknown entity', () => {
    expect(getCapabilityPackages('nope', CapabilityNiveau.A)).toEqual([])
  })
})

describe('capabilityAnbindung is derived from the packages', () => {
  for (const id of listEntityIds()) {
    it(`${id}: the Rahmen lists exactly the package names`, () => {
      for (const niveau of [CapabilityNiveau.A, CapabilityNiveau.B, CapabilityNiveau.C]) {
        const rahmen = getEntityRahmen(id, niveau)!
        const expected = getCapabilityPackages(id, niveau).map(p => p.name)
        expect(rahmen.capabilityAnbindung, `${id} at ${niveau}`).toEqual(expected)
      }
    })
  }
})
```

- [ ] **Schritt 2: Test laufen lassen, Rot bestätigen**

Ausführen: `npx vitest run tests/preset/capability-packages.test.ts`
Erwartet: FAIL — `getCapabilityPackages` existiert nicht.

- [ ] **Schritt 3: SE, Workshop und TA bekommen einen Niveau-Filter**

Architect und CF haben ihn bereits (`getArchitectCapabilities`, `getCfCapabilities`). Die
drei anderen bekommen dieselbe Form. In `se-capabilities.ts` ersetzen die folgenden
Zeilen `SE_CAPABILITIES_A/B/C` und `getSECapabilities`:

```ts
/**
 * Returns the SE capability packages for a niveau.
 * Filtering runs off niveauMinimum, which the packages already carry — the
 * hand-maintained per-niveau string lists this replaces had drifted from them twice.
 */
export function getSECapabilityPackages(niveau: CapabilityNiveau): CapabilityPackage[] {
  if (niveau === CapabilityNiveau.C) {
    return SE_PACKAGES.filter(p => p.name === 'se-core-identity')
  }
  return SE_PACKAGES.filter(p => {
    if (!p.niveauMinimum) return true
    if (niveau === CapabilityNiveau.A) return true
    return p.niveauMinimum !== 'A'
  })
}
```

In `workshop-capabilities.ts` und `ta-capabilities.ts` dieselbe Funktion mit
`WORKSHOP_PACKAGES` bzw. `TA_PACKAGES` und passendem Namen
(`getWorkshopCapabilityPackages`, `getTaCapabilityPackages`). Für den Workshop gilt
zusätzlich: Die heutigen `pakete`-Listen in `workshop-preset.ts` sind die Referenz — nach
dem Umbau muss der Filter dieselben Namen in derselben Reihenfolge liefern. Weicht er ab,
tragen die Pakete falsche `niveauMinimum`-Werte; dann werden **die Pakete** korrigiert,
nicht der Filter aufgeweicht.

- [ ] **Schritt 4: Einheitlichen Zugriff ergänzen**

In `src/main/preset/capabilities.ts`:

```ts
import { CapabilityNiveau } from './niveau'
import { getArchitectCapabilities } from './architect/architect-capabilities'
import { getCfCapabilities } from './cyber-factory/cf-capabilities'
import { getSECapabilityPackages } from './systems-engineer/se-capabilities'
import { getTaCapabilityPackages } from './testing-assistant/ta-capabilities'
import { getWorkshopCapabilityPackages } from './workshop/workshop-capabilities'

type PackageFactory = (niveau: CapabilityNiveau) => CapabilityPackage[]

const PACKAGES_BY_ENTITY: Record<string, PackageFactory> = {
  'systems-engineer': getSECapabilityPackages,
  'architect': getArchitectCapabilities,
  'cyber-factory': getCfCapabilities,
  'workshop': getWorkshopCapabilityPackages,
  'testing-assistant': getTaCapabilityPackages,
}

/** Capability packages for an entity at a niveau. Unknown entity yields []. */
export function getCapabilityPackages(
  entityId: string,
  niveau: CapabilityNiveau,
): CapabilityPackage[] {
  return PACKAGES_BY_ENTITY[entityId]?.(niveau) ?? []
}
```

- [ ] **Schritt 5: Die fünf Presets leiten `capabilityAnbindung` ab**

In jeder `create…Rahmen`-Funktion die handgepflegte Liste durch die Ableitung ersetzen,
Beispiel `architect-preset.ts`:

```ts
export function createArchitectRahmen(niveau: CapabilityNiveau): PresetRahmen {
  return {
    id: 'architect',
    name: 'Architect',
    rollenTyp: RollenTyp.PhasenEntitaet,
    phasenBindung: ['architecture'],
    capabilityAnbindung: getArchitectCapabilities(niveau).map(p => p.name),
    graphAnbindung: { lesen: true, schreiben: true },
    personaVorgabe: 'theaitetos',
    runtime: 'claude-cli-tmux',
    model: niveau === CapabilityNiveau.A ? 'heavy' : '',
    capabilityNiveau: niveau,
    harnessBindung: '',
  }
}
```

Ersatzlos entfernt werden dabei: `NIVEAU_B_CAPABILITIES` und `NIVEAU_C_CAPABILITIES`
(architect-preset.ts), die drei `pakete`-Listen (workshop-preset.ts),
`SE_CAPABILITIES_A/B/C` samt `getSECapabilities` (se-capabilities.ts) und
`TA_CAPABILITIES` (ta-preset.ts). Wird eine dieser Konstanten aus `index.ts` re-exportiert,
fällt der Export mit. Die Konstanten-Rahmen (`ARCHITECT_RAHMEN`, `SE_RAHMEN` …) leiten
`capabilityAnbindung` genauso ab, statt eine zweite Liste zu führen.

`ARCHITECT_CAPABILITIES` bleibt, weil `ArchitectCapabilityName` daraus einen Typ ableitet
— aber `ARCHITECT_RAHMEN.capabilityAnbindung` liest ab jetzt die Pakete.

- [ ] **Schritt 6: Tests laufen lassen**

Ausführen: `npm test`
Erwartet: `tests/preset/capability-packages.test.ts` grün, und die bestehenden
Preset-Tests ebenfalls. Ein Test, der eine gelöschte Konstante importiert, wird auf den
Paket-Zugriff umgestellt — **nicht** die Konstante wiederbelebt.

- [ ] **Schritt 7: Typecheck, Lint, Committen**

```bash
npm run typecheck && npm run lint
git add src/main/preset/ tests/preset/capability-packages.test.ts
git commit -m "refactor(preset): capability packages are the single source per entity"
```

---

## Task 7: Wächtertest und Abriss der abgelösten Lader

**Files:**
- Test: `tests/preset/capability-assets-coverage.test.ts` (neu)
- Delete: `src/main/preset/capability-tree.ts`, `src/main/preset/capability-loader.ts`,
  `tests/capability-system.test.ts`

**Interfaces:**
- Consumes: `getCapabilityPackages` (Task 6), `CAPABILITY_SKILLS`
- Produces: nichts — dieser Task sichert und räumt

- [ ] **Schritt 1: Fehlschlagenden Test schreiben**

```ts
// tests/preset/capability-assets-coverage.test.ts
import { describe, it, expect } from 'vitest'
import { CAPABILITY_SKILLS } from '../../src/main/preset/capability-assets'
import { getCapabilityPackages } from '../../src/main/preset/capabilities'
import { listEntityIds } from '../../src/main/preset/registry'
import { CapabilityNiveau } from '../../src/main/preset/niveau'

function declaredCapabilityIds(): Set<string> {
  const ids = new Set<string>()
  for (const entityId of listEntityIds()) {
    for (const niveau of [CapabilityNiveau.A, CapabilityNiveau.B, CapabilityNiveau.C]) {
      for (const pkg of getCapabilityPackages(entityId, niveau)) ids.add(pkg.name)
    }
  }
  return ids
}

// A mismatch here used to surface only as a console.warn at session start — invisible in
// a packaged app. Binding both directions makes it a build failure instead.
describe('capability assets cover exactly the declared packages', () => {
  it('every declared package has a SKILL.md asset', () => {
    const missing = [...declaredCapabilityIds()].filter(id => !(id in CAPABILITY_SKILLS))
    expect(missing, `declared but no asset: ${missing.join(', ')}`).toEqual([])
  })

  it('every asset belongs to a declared package', () => {
    const declared = declaredCapabilityIds()
    const orphans = Object.keys(CAPABILITY_SKILLS).filter(id => !declared.has(id))
    expect(orphans, `asset but never declared: ${orphans.join(', ')}`).toEqual([])
  })

  it('no asset is empty', () => {
    for (const [id, content] of Object.entries(CAPABILITY_SKILLS)) {
      expect(content.trim().length, `${id} is empty`).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Schritt 2: Test laufen lassen**

Ausführen: `npx vitest run tests/preset/capability-assets-coverage.test.ts`
Erwartet: grün, wenn Task 6 sauber ist. Schlägt er fehl, ist das ein echter Fund und wird
behoben, bevor der Task weiterläuft — die fehlende oder verwaiste Capability wird
nachgetragen bzw. gestrichen, nicht der Test entschärft.

- [ ] **Schritt 3: Die abgelösten Lader entfernen**

```bash
git rm src/main/preset/capability-tree.ts src/main/preset/capability-loader.ts \
       tests/capability-system.test.ts
```

Danach prüfen, dass nichts mehr auf sie zeigt:

```bash
grep -rn "capability-tree\|capability-loader\|CapabilityTree\|loadCapabilityContent" src/ tests/
```

Erwartet: keine Treffer. Bleibt einer übrig, wird der Aufrufer mitentfernt — die Module
kommen nicht zurück. `LoaderType` und `estimateTokenCount` bleiben in
`capability-schema.ts`; beide haben andere Leser.

- [ ] **Schritt 4: Volle Suite, Typecheck, Lint**

Ausführen: `npm test && npm run typecheck && npm run lint`
Erwartet: alles grün, Testzahl um die Fälle aus `capability-system.test.ts` gesunken.

- [ ] **Schritt 5: Committen**

```bash
git add -A
git commit -m "refactor(preset): bind assets to declared packages, drop the superseded loaders"
```

---

## Task 8: Niveau-B-Emission — Inventar statt stiller Leere

`assemble-entity.ts` emittiert Capability-Referenzen ausschließlich auf Niveau A. Auf B
entsteht heute *nichts* — der Kommentar sagt „inline capabilities expected in body", was
kein Body einlöst. Eine B-Session verlöre damit still ihre gesamte Capability-Schicht.

**Files:**
- Modify: `src/main/session/assemble-entity.ts`
- Modify: `src/main/ipc-handlers.ts` (Aufruf reicht Pakete durch)
- Test: `tests/session/assemble-entity-niveau-b.test.ts` (neu)

**Interfaces:**
- Consumes: `capabilityPath` (Task 5), `CapabilityPackage`
- Produces: `AssemblyOptions.capabilityPackages?: CapabilityPackage[]`

- [ ] **Schritt 1: Fehlschlagenden Test schreiben**

```ts
// tests/session/assemble-entity-niveau-b.test.ts
import { describe, it, expect } from 'vitest'
import { assembleEntityClaudeMd } from '../../src/main/session/assemble-entity'
import { CapabilityNiveau } from '../../src/main/preset/niveau'
import { LoaderType } from '../../src/main/preset/capability-schema'

const PACKAGES = [
  { name: 'se-core-identity', beschreibung: 'Kern-Identität des SE', loader: LoaderType.SkillMd },
  { name: 'gate-urteil-guide', beschreibung: 'Gate-Urteil an den Gates', loader: LoaderType.SkillMd },
]

describe('assembleEntityClaudeMd at Niveau B', () => {
  it('emits an inventory with description and path for every package', () => {
    const out = assembleEntityClaudeMd({
      body: '# SE', niveau: CapabilityNiveau.B, capabilityPackages: PACKAGES,
    })
    expect(out).toContain('<!-- BEGIN:Capabilities -->')
    expect(out).toContain('Kern-Identität des SE')
    expect(out).toContain('.claude/capabilities/se-core-identity/SKILL.md')
    expect(out).toContain('Gate-Urteil an den Gates')
  })

  it('emits no @-lines at Niveau B — a non-Claude harness will not resolve them', () => {
    const out = assembleEntityClaudeMd({
      body: '# SE', niveau: CapabilityNiveau.B, capabilityPackages: PACKAGES,
    })
    expect(out).not.toMatch(/^@/m)
  })

  it('leaves Niveau A emission untouched', () => {
    const out = assembleEntityClaudeMd({
      body: '# SE', niveau: CapabilityNiveau.A, capabilities: ['se-core-identity'],
    })
    expect(out).toContain('@.claude/capabilities/se-core-identity/SKILL.md')
  })

  it('emits no capability section at Niveau B without packages', () => {
    const out = assembleEntityClaudeMd({ body: '# SE', niveau: CapabilityNiveau.B })
    expect(out).not.toContain('<!-- BEGIN:Capabilities -->')
  })
})
```

- [ ] **Schritt 2: Test laufen lassen, Rot bestätigen**

Ausführen: `npx vitest run tests/session/assemble-entity-niveau-b.test.ts`
Erwartet: FAIL — `capabilityPackages` ist keine bekannte Option, B emittiert nichts.

- [ ] **Schritt 3: Implementieren**

In `src/main/session/assemble-entity.ts` die Option ergänzen:

```ts
  /**
   * Capability packages for the Niveau-B inventory. Niveau B has no native
   * lazy-loading (M2 section 6.4, strategy 1): the prompt names each capability with
   * its description and path, and the agent reads them itself when it needs them.
   */
  capabilityPackages?: CapabilityPackage[]
```

und den Emissionsblock nach dem bestehenden A-Zweig:

```ts
  // Niveau B: inventory instead of @-references. A non-Claude harness does not resolve
  // @-lines, so emitting them would cost the entity its entire capability layer without
  // a single error message.
  if (niveau === CapabilityNiveau.B && capabilityPackages.length > 0) {
    const lines = capabilityPackages.map(
      pkg => `- **${pkg.name}** — ${pkg.beschreibung}\n  Datei: \`${capabilityPath(pkg)}\``
    ).join('\n')
    parts.push(
      '<!-- BEGIN:Capabilities -->\n' +
      'Diese Fähigkeiten stehen dir als Dateien im Projekt zur Verfügung. ' +
      'Lies die zugehörige Datei, sobald du eine davon brauchst — sie wird nicht ' +
      'automatisch geladen.\n\n' +
      lines +
      '\n<!-- END:Capabilities -->'
    )
  }
```

Destrukturierung am Funktionskopf erweitern:

```ts
  const { niveau, capabilities = [], capabilityPackages = [] } = options
```

Importe: `capabilityPath` aus `../preset/capabilities`, `CapabilityPackage` als Typ aus
`../preset/capability-schema`.

- [ ] **Schritt 4: Test laufen lassen, Grün bestätigen**

Ausführen: `npx vitest run tests/session/assemble-entity-niveau-b.test.ts`
Erwartet: PASS, vier Tests.

- [ ] **Schritt 5: Pakete im Handler durchreichen**

In `src/main/ipc-handlers.ts` den `assembleEntityClaudeMd`-Aufruf erweitern:

```ts
      const prompt = assembleEntityClaudeMd({
        body: def.body,
        persona: def.persona ?? undefined,
        globalRules: getGlobalRules(def.rahmen.capabilityNiveau),
        niveau: def.rahmen.capabilityNiveau,
        capabilities: materialised.written,
        capabilityPackages: getCapabilityPackages(entityId, def.rahmen.capabilityNiveau),
      })
```

Import ergänzen: `import { getCapabilityPackages } from './preset/capabilities'`.

- [ ] **Schritt 6: Volle Suite, Typecheck, Lint, Committen**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/session/assemble-entity.ts src/main/ipc-handlers.ts \
        tests/session/assemble-entity-niveau-b.test.ts
git commit -m "feat(session): Niveau B emits a capability inventory instead of nothing"
```

---

## Task 9: Prompt-Vorschau ohne Session-Start

**Files:**
- Create: `src/main/session/preview-prompt.ts`
- Modify: `src/shared/ipc-channels.ts`, `src/main/ipc-handlers.ts`, `src/preload.ts`
- Test: `tests/session/preview-prompt.test.ts` (neu)

**Interfaces:**
- Consumes: `getEntityRahmen`, `getEntityDefinition`, `getCapabilityPackages`,
  `resolveModel`, `assembleEntityClaudeMd`
- Produces: `buildPromptPreview(entityId, niveau, tiers): PromptPreview | null`

- [ ] **Schritt 1: Fehlschlagenden Test schreiben**

```ts
// tests/session/preview-prompt.test.ts
import { describe, it, expect } from 'vitest'
import { buildPromptPreview } from '../../src/main/session/preview-prompt'
import { CapabilityNiveau } from '../../src/main/preset/niveau'

const TIERS = { light: 'haiku', standard: 'sonnet', heavy: 'opus' }

describe('buildPromptPreview', () => {
  it('returns the assembled prompt with its layers named', () => {
    const preview = buildPromptPreview('architect', CapabilityNiveau.A, TIERS)!
    expect(preview.prompt).toContain('# Architect')
    expect(preview.schichten).toContain('Body')
    expect(preview.schichten).toContain('Persona')
    expect(preview.schichten).toContain('GlobalRules')
  })

  it('resolves the model tier so the preview shows what would actually run', () => {
    expect(buildPromptPreview('architect', CapabilityNiveau.A, TIERS)!.modelResolved).toBe('opus')
  })

  it('shows the B inventory when asked for Niveau B, even with no B adapter present', () => {
    const preview = buildPromptPreview('architect', CapabilityNiveau.B, TIERS)!
    expect(preview.prompt).not.toMatch(/^@/m)
    expect(preview.prompt).toContain('.claude/capabilities/')
  })

  it('returns null for an unknown entity', () => {
    expect(buildPromptPreview('nope', CapabilityNiveau.A, TIERS)).toBeNull()
  })

  it('writes nothing to disk', () => {
    const preview = buildPromptPreview('architect', CapabilityNiveau.A, TIERS)!
    expect(preview.capabilities.length).toBeGreaterThan(0)
    // capabilities are the ids that *would* be materialised; no project path is touched
  })
})
```

- [ ] **Schritt 2: Test laufen lassen, Rot bestätigen**

Ausführen: `npx vitest run tests/session/preview-prompt.test.ts`
Erwartet: FAIL — Modul existiert nicht.

- [ ] **Schritt 3: Implementieren**

```ts
// src/main/session/preview-prompt.ts
/**
 * preview-prompt — assemble an entity prompt without starting anything.
 *
 * CK-NFR-012: what an entity is told must be inspectable before it runs. This builds
 * the same prompt session:create builds, but touches no project directory and writes
 * no file — the capability ids it reports are the ones materialisation *would* write.
 *
 * A niveau can be requested that no registered adapter serves. That is deliberate: it
 * is the only way to see what Niveau B looks like before a B harness exists.
 */

import { getEntityDefinition } from '../preset/registry'
import { getCapabilityPackages } from '../preset/capabilities'
import { getGlobalRules } from '../preset/global-rules'
import { CapabilityNiveau } from '../preset/niveau'
import { assembleEntityClaudeMd } from './assemble-entity'
import { resolveModel, type ModelTiers } from './model-resolver'

export interface PromptPreview {
  prompt: string
  /** Names of the layers actually present, in assembly order. */
  schichten: string[]
  /** Capability ids this niveau would carry. */
  capabilities: string[]
  /** The model handle that would be passed to the harness, or null for its default. */
  modelResolved: string | null
  niveau: CapabilityNiveau
  /** Rough size signal — whitespace words, not a tokenizer. */
  wortZahl: number
}

export function buildPromptPreview(
  entityId: string,
  niveau: CapabilityNiveau,
  tiers: ModelTiers,
): PromptPreview | null {
  const def = getEntityDefinition(entityId, niveau)
  if (!def) return null

  const packages = getCapabilityPackages(entityId, niveau)
  const capabilities = packages.map(p => p.name)

  const prompt = assembleEntityClaudeMd({
    body: def.body,
    persona: def.persona ?? undefined,
    globalRules: getGlobalRules(niveau),
    niveau,
    capabilities,
    capabilityPackages: packages,
  })

  const schichten = ['Body']
  if (prompt.includes('<!-- BEGIN:Capabilities -->')) schichten.push('Capabilities')
  if (prompt.includes('<!-- BEGIN:Persona -->')) schichten.push('Persona')
  if (prompt.includes('<!-- BEGIN:GlobalRules -->')) schichten.push('GlobalRules')
  if (prompt.includes('<!-- BEGIN:PhaseInput -->')) schichten.push('PhaseInput')

  return {
    prompt,
    schichten,
    capabilities,
    modelResolved: resolveModel(def.rahmen.model, tiers) ?? null,
    niveau,
    wortZahl: prompt.split(/\s+/).filter(Boolean).length,
  }
}
```

- [ ] **Schritt 4: Test laufen lassen, Grün bestätigen**

Ausführen: `npx vitest run tests/session/preview-prompt.test.ts`
Erwartet: PASS, fünf Tests.

- [ ] **Schritt 5: IPC-Kanal verdrahten**

In `src/shared/ipc-channels.ts`:

```ts
export const PRESET_PREVIEW_PROMPT = 'preset:preview-prompt' as const
```

In `src/main/ipc-handlers.ts`, neben den übrigen Handlern:

```ts
  ipcMain.handle(PRESET_PREVIEW_PROMPT, (_e, args: { entityId: string; niveau?: string }) => {
    const niveau = args?.niveau === 'B' ? CapabilityNiveau.B
      : args?.niveau === 'C' ? CapabilityNiveau.C
      : CapabilityNiveau.A
    const preview = buildPromptPreview(args.entityId, niveau, configStore.get('agent').modelTiers)
    return preview ?? { error: `Unknown entity '${args?.entityId}'` }
  })
```

In `src/preload.ts` den Kanal der Allowlist hinzufügen, dem Muster der bestehenden
Kanäle folgend. **`contextIsolation`, `nodeIntegration` und `sandbox` bleiben unverändert**
— es kommt ein Kanalname dazu, sonst nichts.

- [ ] **Schritt 6: Volle Suite, Typecheck, Lint, Committen**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/session/preview-prompt.ts src/shared/ipc-channels.ts \
        src/main/ipc-handlers.ts src/preload.ts tests/session/preview-prompt.test.ts
git commit -m "feat(preset): assemble a prompt preview without starting a session"
```

---

## Task 10: Die Vorschau in der Oberfläche

**Files:**
- Create: `src/renderer/components/PromptPreview.tsx`
- Modify: `src/renderer/components/LauncherCell.tsx`

**Interfaces:**
- Consumes: IPC-Kanal `preset:preview-prompt` (Task 9)
- Produces: nichts für spätere Tasks

- [ ] **Schritt 1: Komponente schreiben**

```tsx
// src/renderer/components/PromptPreview.tsx
/**
 * PromptPreview — shows the assembled entity prompt before any session starts.
 *
 * CK-NFR-012: an adjustable surface a user cannot see is not adjustable. The niveau
 * switch shows levels no adapter serves yet — that is the point of it.
 */

import { useState, useEffect, useCallback } from 'react'
import { api } from '../preload-api'

interface PromptPreviewProps {
  entityId: string
  label: string
  onClose: () => void
}

interface Preview {
  prompt: string
  schichten: string[]
  capabilities: string[]
  modelResolved: string | null
  wortZahl: number
}

export function PromptPreview({ entityId, label, onClose }: PromptPreviewProps) {
  const [niveau, setNiveau] = useState<'A' | 'B' | 'C'>('A')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const result = await api().invoke('preset:preview-prompt', { entityId, niveau }) as
      Preview & { error?: string }
    if (result?.error) { setError(result.error); setPreview(null) }
    else { setError(null); setPreview(result) }
  }, [entityId, niveau])

  useEffect(() => { void load() }, [load])

  return (
    <div style={{
      position: 'absolute', inset: 0, background: '#0a0a0a', border: '1px solid #333',
      borderRadius: '4px', padding: '12px', display: 'flex', flexDirection: 'column',
      gap: '8px', zIndex: 10,
    }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <strong style={{ color: '#ddd', fontSize: '13px' }}>{label}</strong>
        {(['A', 'B', 'C'] as const).map(n => (
          <button
            key={n}
            onClick={() => setNiveau(n)}
            style={{
              padding: '2px 8px', cursor: 'pointer', fontSize: '11px',
              background: niveau === n ? '#2a2a2a' : 'transparent', color: '#bbb',
              border: '1px solid #333', borderRadius: '3px',
            }}
          >
            Niveau {n}
          </button>
        ))}
        <button
          onClick={onClose}
          style={{
            marginLeft: 'auto', cursor: 'pointer', background: 'transparent',
            color: '#666', border: 'none', fontSize: '14px',
          }}
        >
          ✕
        </button>
      </div>

      {error && <div style={{ color: '#e0a0a0', fontSize: '11px' }}>⚠ {error}</div>}

      {preview && (
        <>
          <div style={{ color: '#777', fontSize: '10px' }}>
            Schichten: {preview.schichten.join(' · ')} — {preview.capabilities.length} Capabilities
            — Modell: {preview.modelResolved ?? 'Harness-Default'} — {preview.wortZahl} Wörter
          </div>
          <pre style={{
            flex: 1, overflow: 'auto', margin: 0, padding: '8px', background: '#050505',
            border: '1px solid #222', borderRadius: '3px', color: '#bbb',
            fontSize: '11px', whiteSpace: 'pre-wrap',
          }}>
            {preview.prompt}
          </pre>
        </>
      )}
    </div>
  )
}
```

- [ ] **Schritt 2: In der LauncherCell anbieten**

In `src/renderer/components/LauncherCell.tsx` einen State ergänzen:

```tsx
  const [previewing, setPreviewing] = useState<{ id: string; label: string } | null>(null)
```

im `picking`-Zweig den Container auf `position: 'relative'` setzen, vor dem Schließen des
Containers die Vorschau einhängen:

```tsx
        {previewing && (
          <PromptPreview
            entityId={previewing.id}
            label={previewing.label}
            onClose={() => setPreviewing(null)}
          />
        )}
```

und jeden Preset-Button um eine zweite, kleine Aktion ergänzen — der Preset-Button selbst
behält sein Verhalten, damit der Startweg unverändert bleibt:

```tsx
          <div key={preset.id} style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => handlePick(preset.id)}
              title={preset.description}
              style={{
                flex: 1, padding: '8px 10px', textAlign: 'left', cursor: 'pointer',
                background: '#141414', color: '#ddd',
                border: `1px solid ${preset.isDefault ? '#555' : '#2a2a2a'}`,
                borderRadius: '3px', fontSize: '13px',
              }}
            >
              {preset.label}
            </button>
            <button
              onClick={() => setPreviewing({ id: preset.id, label: preset.label })}
              title="Prompt ansehen"
              style={{
                padding: '8px', cursor: 'pointer', background: 'transparent',
                color: '#666', border: '1px solid #2a2a2a', borderRadius: '3px',
                fontSize: '12px',
              }}
            >
              👁
            </button>
          </div>
```

Der `PRESET_CATALOG.map`-Aufruf gibt ab jetzt dieses `div` zurück statt des nackten
Buttons; das `key` wandert auf das `div`.

- [ ] **Schritt 3: Suite, Typecheck, Lint**

Ausführen: `npm test && npm run typecheck && npm run lint`
Erwartet: grün. Bestehende `LauncherCell`-Tests, die den Preset-Button über seinen Text
finden, bleiben gültig — der Button behält Text und `onClick`.

- [ ] **Schritt 4: Committen**

```bash
git add src/renderer/components/PromptPreview.tsx src/renderer/components/LauncherCell.tsx
git commit -m "feat(ui): show the assembled entity prompt per preset and niveau"
```

---

## Task 11: CK-NFR-012 und das Inventar der anpassbaren Flächen

**Files:**
- Create: `docs/anpassbare-flaechen.md`
- Test: `tests/docs/anpassbare-flaechen.test.ts` (neu)

**Interfaces:**
- Consumes: `CipherKeelConfig` aus `src/main/config/config-store.ts`
- Produces: nichts — dieser Task macht die Meta-Anforderung prüfbar

- [ ] **Schritt 1: Fehlschlagenden Test schreiben**

Ein Inventar, das nur ein Dokument ist, veraltet still. Der Test bindet es an die Config:

```ts
// tests/docs/anpassbare-flaechen.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const INVENTORY = readFileSync(
  join(__dirname, '../../docs/anpassbare-flaechen.md'), 'utf8'
)

// CK-NFR-012: a new adjustable surface without an inventory entry is an audit finding.
// Binding the test to the config keys is what keeps this from being a document that
// quietly falls behind the code.
const CONFIG_PATHS = [
  'app.maxSessions',
  'agent.skipPermissions',
  'agent.modelTiers',
  'ui.theme',
  'ui.language',
  'ui.grid',
  'mcp.port',
  'mcp.host',
  'mcp.apiKey',
  'voice.enabled',
  'voice.piperVoice',
  'llm.ollamaHost',
  'llm.ollamaPort',
  'llm.ollamaModel',
]

describe('CK-NFR-012 — the adjustable-surface inventory', () => {
  for (const path of CONFIG_PATHS) {
    it(`lists ${path}`, () => {
      expect(INVENTORY).toContain(path)
    })
  }

  it('lists the prompt layers', () => {
    for (const layer of ['Body', 'Persona', 'GlobalRules', 'SKILL.md']) {
      expect(INVENTORY).toContain(layer)
    }
  })

  it('marks every entry as either editable or explicitly not yet editable', () => {
    const rows = INVENTORY.split('\n').filter(l => l.startsWith('| `'))
    expect(rows.length).toBeGreaterThan(10)
    for (const row of rows) {
      expect(row, `row without an editability verdict: ${row}`)
        .toMatch(/ja|nein/)
    }
  })
})
```

- [ ] **Schritt 2: Test laufen lassen, Rot bestätigen**

Ausführen: `npx vitest run tests/docs/anpassbare-flaechen.test.ts`
Erwartet: FAIL — Datei existiert nicht.

- [ ] **Schritt 3: Inventar schreiben**

```markdown
# Anpassbare Flächen — Inventar (CK-NFR-012)

**Stand:** 2026-08-11

> **CK-NFR-012:** Jede Fläche, die ein Nutzer sinnvoll anpassen kann — Einstellung,
> Prompt, Persona, Regel, Parameter —, ist in der App auffindbar, in ihrer Herkunft
> benannt und entweder editierbar oder ausdrücklich als „noch nicht editierbar" geführt.
> Eine anpassbare Fläche, die nur durch Editieren einer Datei außerhalb der App
> erreichbar ist und nirgends benannt wird, verletzt diese Anforderung.
>
> **Dieses Inventar ist Audit-Inhalt.** Ein Audit prüft es gegen die Realität. Eine neue
> anpassbare Fläche ohne Eintrag hier ist ein Audit-Befund.

## Einstellungen (ConfigStore)

Ablage: `~/.config/cipher-keel/cipher-keel-config.json`

| Fläche | Wirkung | In der App sichtbar | Editierbar |
|---|---|---|---|
| `app.maxSessions` | Obergrenze gleichzeitiger Sessions | nein | nein — nur Config-Datei |
| `agent.skipPermissions` | `--dangerously-skip-permissions` beim Start; Default `true` | nein | nein — nur Config-Datei. **Sicherheitsrelevant**, im README dokumentiert |
| `agent.modelTiers` | Tier → Modell-Handle (`light`/`standard`/`heavy`) | in der Prompt-Vorschau als aufgelöstes Modell | nein — nur Config-Datei |
| `ui.theme` | Farbschema | ja | ja |
| `ui.language` | Sprache | ja | ja |
| `ui.grid` | Spalten und Zeilen des Grids | ja | ja |
| `mcp.port` | Port des Graph-MCP-Servers | nein | nein — nur Config-Datei |
| `mcp.host` | Host des Graph-MCP-Servers | nein | nein — nur Config-Datei |
| `mcp.apiKey` | Auth-Schlüssel des MCP-Servers | nein | nein — nur Config-Datei |
| `voice.enabled` | Sprachausgabe an/aus | nein | nein — nur Config-Datei |
| `voice.piperVoice` | Stimme der Sprachausgabe | nein | nein — nur Config-Datei |
| `llm.ollamaHost` | Host des lokalen Ollama | nein | nein — nur Config-Datei |
| `llm.ollamaPort` | Port des lokalen Ollama | nein | nein — nur Config-Datei |
| `llm.ollamaModel` | lokales Modell | nein | nein — nur Config-Datei |

## Prompt-Schichten

Alle vier Schichten sind seit der Prompt-Vorschau **sichtbar** (Launcher → Preset → 👁),
aber keine ist in der App editierbar: Die Inhalte liegen per `?raw` im Bundle.

| Fläche | Herkunft | In der App sichtbar | Editierbar |
|---|---|---|---|
| Body je Entität | `src/main/preset/*/[…]-body.md` | ja — Prompt-Vorschau | nein — Folgephase |
| Persona | `src/main/preset/shared/personas/` | ja — Prompt-Vorschau | nein — Folgephase. `resolvePersona` kennt einen Nutzerverzeichnis-Zweig, der nie aufgerufen wird |
| GlobalRules | `src/main/preset/global-rules.ts` | ja — Prompt-Vorschau | nein — Folgephase |
| Capability-`SKILL.md` | `src/main/preset/*/capabilities/*/SKILL.md` | ja — Prompt-Vorschau | nein — Folgephase |

## Preset-Eigenschaften

| Fläche | Herkunft | In der App sichtbar | Editierbar |
|---|---|---|---|
| `capabilityNiveau` | vom Adapter (M2 §11.3) | ja — Prompt-Vorschau, alle drei Stufen | nein — folgt dem Adapter, keine freie Wahl |
| `runtime` | Preset-Rahmen | nein | nein — Folgephase. M2 §11.4 sieht einen Pro-Session-Override als M3-Arbeit vor |
| `model` | Preset-Rahmen, aufgelöst über `agent.modelTiers` | ja — Prompt-Vorschau | nur indirekt über `agent.modelTiers` |

## Was fehlt

- **Editierbarkeit generell.** Sie braucht ein Overlay-Verzeichnis für nutzereigene
  Fassungen, eine Vorrangregel gegenüber den gebündelten Inhalten und eine Validierung.
  Eigene Phase.
- **Eine Einstellungsoberfläche.** Der Renderer hat heute keine; `ui.*` ist über die
  jeweiligen Bedienelemente erreichbar, alles andere gar nicht.
```

- [ ] **Schritt 4: Test laufen lassen, Grün bestätigen**

Ausführen: `npx vitest run tests/docs/anpassbare-flaechen.test.ts`
Erwartet: PASS.

- [ ] **Schritt 5: Anforderung im README benennen**

Im README den Abschnitt, der `agent.skipPermissions` dokumentiert, um einen Satz ergänzen,
der auf `docs/anpassbare-flaechen.md` verweist. **Keine Release-Behauptung hinzufügen** —
es gibt weiterhin keines.

- [ ] **Schritt 6: Committen**

```bash
npm test && npm run typecheck && npm run lint
git add docs/anpassbare-flaechen.md tests/docs/anpassbare-flaechen.test.ts README.md
git commit -m "docs: CK-NFR-012 and the inventory of adjustable surfaces"
```

---

## Task 12: In der laufenden App belegen

Kein Test dieses Repos startet eine echte Session. Was hier gemessen wird, ist der einzige
Beleg, dass die Verdrahtung trägt — und `session:create` wird **ausschließlich** mit
`{ entityId }` gerufen, nie mit selbst gesetzten Zusatzfeldern. Ein Aufruf mit von Hand
gesetzten Parametern beweist den Handler, nicht den Nutzerweg.

**Files:**
- Modify: `docs/superpowers/plans/2026-08-11-niveau-adapter-anbindung.md` (Messprotokoll)

- [ ] **Schritt 1: Baseline aufnehmen**

Ausführen: `tmux list-sessions`
Fremde Sessions notieren. Am Ende müssen exakt diese übrig bleiben.

- [ ] **Schritt 2: App starten**

Über `.claude/skills/run-keel/` mit eigenem Profil starten. StatusBar notieren; erwartet
sind die bekannten degradierten Subsysteme. `nanoclaw` degradiert ist **korrekt** — es
läuft kein Daemon, und Task 2 ändert daran nichts.

- [ ] **Schritt 3: Architect-Session starten und das Modell belegen**

`session:create({ entityId: 'architect' })` — kein weiteres Feld.

Ausführen: `ps -ww -p <pid> -o pid,command`
Erwartet: `claude --dangerously-skip-permissions --model opus --append-system-prompt-file <pfad>`

**`--model opus` ist der Beleg für Task 4.** Fehlt es, ist der Resolver nicht verdrahtet.
Die tatsächliche Reihenfolge der Flags ist nicht vorgeschrieben — belegt ist die Anwesenheit.

- [ ] **Schritt 4: Prompt-Datei selbst öffnen**

Die Datei unter `<profil>/entity-prompts/<name>.md` **selbst lesen**, nicht einem Bericht
glauben. Erwartet: `# Architect` am Kopf, genau 1× `BEGIN:Persona`, genau 1×
`BEGIN:GlobalRules`, und `grep -c "claude/capabilities"` = 7.

- [ ] **Schritt 5: Vorschau gegen die Wirklichkeit halten**

Im Launcher für den Architect „Prompt ansehen" öffnen, Niveau A, den Text kopieren und
gegen die Datei aus Schritt 4 diffen.

Erwartet: **kein Unterschied.** Eine Vorschau, die etwas anderes zeigt als das
Ausgelieferte, ist schlimmer als keine — bei Abweichung wird der Task nicht abgeschlossen.

- [ ] **Schritt 6: Niveau B in der Vorschau ansehen**

In derselben Vorschau auf Niveau B schalten.
Erwartet: kein `@` am Zeilenanfang, stattdessen sieben Einträge mit Beschreibung und Pfad,
und der Hinweis, dass die Dateien selbst zu lesen sind.

- [ ] **Schritt 7: Aufräumen und protokollieren**

`stop.sh` ausführen, danach `tmux list-sessions` — es dürfen nur die Sessions aus
Schritt 1 übrig sein. `stop.sh` meldet „removed: 0" auch dann, wenn eine App-Session noch
läuft; deshalb selbst nachsehen.

Das Ergebnis wörtlich als Abschnitt „Messprotokoll Task 12" an diesen Plan anhängen:
Kommandozeile, Prompt-Datei-Kopf, Referenzzahl, Diff-Ergebnis aus Schritt 5.

- [ ] **Schritt 8: Committen**

```bash
git add docs/superpowers/plans/2026-08-11-niveau-adapter-anbindung.md
git commit -m "docs: measurement protocol for the niveau and adapter wiring"
```

---

## Task 13: Konzept-Nachtrag außerhalb des Repos

Projektregel „Konzept-Hoheit": Weichen Konzept und Bau voneinander ab, wird das Konzept
präzisiert — in den Ideation-Verzeichnissen, nicht im Repo.

**Files:**
- Create: `/Users/Shared/Nextcloud/Claude/cipher-keel-presets-ideation/deliverables/nachtrag-niveau-anbindung_2026-08-11.md`

- [ ] **Schritt 1: Nachtrag schreiben**

Additiv nach dem Muster von `nachtrag-prompt-uebergabe_2026-08-11.md`: `konzept_v1.1.md`
bleibt unverändert, kein Versionssprung. Fünf Punkte, jeder mit Konzept-Stand, gebautem
Stand und Bewertung:

1. **Die fünfte Assemblierungs-Schicht fehlt.** M2 §9.1 und §17.4 führen den
   graph-aufgelösten `phaseninput` als eigene Schicht; `assemble-entity.ts` kennt die
   Option, aber kein Aufrufer setzt sie. Bau bleibt hinter Konzept zurück — nicht
   verworfen, nur nicht eingelöst.
2. **Niveau A weicht in der Mechanik ab.** M2 §5.4 verlangt SKILL.md unter
   `.claude/skills/` mit Claude Codes nativem Inventar-Mechanismus; gebaut sind
   `@`-Referenzen auf `.claude/capabilities/`. Ob dabei lazy geladen wird, ist ungemessen
   — die `KEELPROBE7`-Probe kann eifriges von bedarfsgesteuertem Laden nicht unterscheiden.
3. **`NanoClawChannelCell` und Channel-Handshake** stehen in M6 §3.1 als ratifizierter
   0.1-Inhalt und fehlen sowohl im Repo als auch in der Fertigstellungs-Roadmap vom
   2026-08-06.
4. **Roadmap-Beobachtung:** Phase 10 („Codex oder Gemini") belegt die Multi-Harness-Aussage,
   zahlt aber nicht auf das Gefälle-Ziel ein — dafür ist NanoClaw der Pfad.
5. **Annahme A4** aus M2 §5.4 ist durch Messprotokoll Task 9 der Startstrecke erledigt;
   **A4b** (laden NanoClaw-Skills bedarfsgesteuert?) bleibt offen.

- [ ] **Schritt 2: Nichts im Repo committen**

Der Nachtrag liegt außerhalb des Repos. Im Repo entsteht dabei kein Commit.

---

## Selbstprüfung des Plans

**Spec-Abdeckung.** §4.1 → Tasks 5, 6, 7. §4.2 → Tasks 1, 3. §4.3 → Task 2. §4.4 →
Task 8 (A und C bewusst unangetastet, in den Global Constraints festgehalten). §4.5 →
Task 4. §4.6 → Tasks 9, 10. §4.7 → Task 11. §6 Nachweis → Task 12. §9 Divergenzen →
Task 13. Keine Lücke.

**Typkonsistenz.** `getEntityRahmen` (Task 3) wird in den Tasks 6 und 9 mit derselben
Signatur benutzt. `capabilityPath(pkg)` (Task 5) wird in Task 8 verwendet.
`getCapabilityPackages(entityId, niveau)` (Task 6) in den Tasks 7, 8, 9.
`resolveModel(rahmenModel, tiers)` (Task 4) in Task 9. `ModelTiers` ist in Task 4 definiert
und in Task 9 importiert. Die Registry-Methode heißt durchgehend `getForRuntime` — so wie
im Code, nicht `forRuntime` wie in einer frühen Spec-Fassung.

**Reihenfolge.** Task 8 braucht Task 5 und 6. Task 9 braucht 3, 4, 6, 8. Task 10 braucht 9.
Task 3 braucht 1 und 2. Innerhalb dieser Abhängigkeiten ist die Nummerierung
ausführungsfähig.
