# Phase 6 — Service-Lifecycle und durchgaengiger Nutzerpfad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Nutzer startet die App, legt ein Projekt an, sieht Timeline und Kanban mit echten Daten, oeffnet das Grid und startet eine Session mit Preset — ohne dass ein Schritt still fehlschlaegt.

**Architecture:** Die Service-Initialisierung wird aus `window-manager.ts` in ein eigenes, fenster-unabhaengiges Modul `service-lifecycle.ts` gehoben und aus `app.whenReady()` heraus deferred gestartet. Alle Main→Renderer-Events laufen ab jetzt ueber einen `event-bus.ts`, der an alle lebenden Fenster broadcastet statt an eine Closure-Variable. Jedes Subsystem meldet einen typisierten Status (`ready | degraded | disabled` + Grund), der ueber `services:status` abrufbar ist und in der `StatusBar` sichtbar wird. Darauf aufbauend werden Kickoff-Pfad, Session-Projektbindung und Preset-Auswahl verdrahtet.

**Tech Stack:** Electron 42, TypeScript 5.4, React 19, better-sqlite3 12 (+ sqlite-vec), vitest 4, tmux control mode.

---

## Verifikation der Befunde (2026-08-06, laufende App)

Die drei Befunde der Roadmap wurden vor dem Schreiben dieses Plans in einer real laufenden App
gegengeprueft — Electron 42.3.3, sauberes `--user-data-dir`, Ansteuerung der IPC-Kanaele ueber
CDP `Runtime.evaluate` im jeweiligen Renderer. Ergebnis:

| Befund | Status | Belegte Beobachtung |
|--------|--------|---------------------|
| 1 — Services nie initialisiert | **bestaetigt** | Nach App-Start (nur Projektfenster): `graph:init-project` → `{ok:false,error:'Graph not initialized'}`, `kanban:list` → `[]`, `graph:query` → `{rows:[],error:'Graph not initialized'}`. Kein `graph.db` im userData. Erst `window:open-grid` loest die Init aus; danach liefert `graph:init-project` die acht Phasen-UIDs und `graph.db` existiert. |
| 2 — Degradation ist stumm | **bestaetigt, schaerfer als beschrieben** | `project:kickoff` liefert **`{ok:true, phaseUids:[]}`** — Projekt und `git init` entstehen, die Phasenkette wird still uebersprungen (`if (services.graphWriter)` ohne `else`). Der Nutzer bekommt eine Erfolgsmeldung fuer einen halb ausgefuehrten Vorgang. `kanban:list` → `[]` ohne Fehlerfeld. `useTimeline.ts:82` liest `phaseResult?.rows ?? []` und verwirft das vorhandene `error`-Feld. |
| 3 — Event-Routing an ein Fenster gebunden | **bestaetigt, mit sauberem Gegenbeweis** | Listener in beiden Fenstern registriert. `notes:changed` (Closure `win.webContents.send`) erreichte **nur** das Grid-Fenster. `kanban:changed` (bereits `BrowserWindow.getAllWindows().forEach`) erreichte **beide**. Der Broadcast-Pfad existiert also schon im Code und funktioniert — er ist nur nicht verallgemeinert. |

### Zusaetzlicher Befund 4 — better-sqlite3 laedt unter Electron nicht (Blocker)

Nicht in der Roadmap, beim Verifizieren aufgefallen und **blockierend fuer Phase 6**:

```
[window-manager] Knowledge Graph init failed (graceful degradation): Error: The module
'…/node_modules/better-sqlite3/build/Release/better_sqlite3.node' was compiled against a
different Node.js version using NODE_MODULE_VERSION 141. This version of Node.js requires
NODE_MODULE_VERSION 146.
```

Der Knowledge Graph ist in der real laufenden App **komplett tot** — auch nach Oeffnen des
Grid-Fensters. Gleichzeitig sind alle 1390 Tests gruen, weil vitest unter Node (ABI 141) laeuft
und dort dieselbe Binary korrekt laedt. Kein einziger Test fasst die Verdrahtung an; deshalb
konnte das unbemerkt bleiben.

`npm run rebuild-native` meldet „Rebuild Complete", legt die Electron-Binary aber nach
`node_modules/better-sqlite3/bin/darwin-arm64-146/` — waehrend `bindings()` weiterhin zuerst
`build/Release/better_sqlite3.node` (ABI 141) findet. Beide ABIs muessen koexistieren: die App
braucht 146, die Testsuite 141. Ein Umschalten per `pretest`/`predev` waere ein Dauerprovisorium.

**Validierte Loesung** (unter Electron 42 real durchprobiert, Ergebnis `{"x":42}`):
`better-sqlite3` akzeptiert eine `nativeBinding`-Option. Zeigt sie unter Electron auf
`bin/<platform>-<arch>-<abi>/better-sqlite3.node`, laedt die App die 146er Binary, waehrend
vitest unter Node unveraendert die Default-Aufloesung nach `build/Release` nutzt. Kein Umschalten,
kein Toggle. Das ist Task 0.

### Abweichung von der Roadmap-Reihenfolge

Die Roadmap nummeriert 6a (Service-Init) vor 6b (Event-Bus). Dieser Plan dreht das um:
**der Event-Bus entsteht zuerst** (Task 2), die Service-Init danach (Task 3). Grund: `initializeServices`
muss beim Extrahieren bereits eine Broadcast-Senke haben. Andernfalls wuerde 6a die Funktion mit
`win`-Parameter herausloesen und 6b sie unmittelbar danach wieder umbauen. Inhaltlich ist nichts
gestrichen, nur die Bauabfolge ist gedreht.

---

## Global Constraints

Gelten fuer jede Task ohne Ausnahme:

- **Security-Baseline unverhandelbar** (CK-NFR-004, CK-INF-022): `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`. `src/preload.ts` bleibt die einzige
  `contextBridge.exposeInMainWorld`-Aufrufstelle. Neue Kanaele werden in
  `src/shared/ipc-channels.ts` deklariert und in die passende Union aufgenommen — sonst sind sie
  im Renderer nicht erreichbar.
- **TDD**: Test zuerst, Test rot sehen, minimale Implementierung, Test gruen, committen.
- **Keine Regression**: `npm test` (Ausgangsstand **1390** Tests, 93 Dateien; Sollstand nach Task 8: **1463**) und
  `npm run typecheck` muessen nach jedem Commit gruen sein.
- **Graceful Degradation** (CK-NFR-010): Ein fehlendes Subsystem darf die App nie hart abstuerzen
  lassen — aber es muss **sichtbar** degradieren.
- **Niveau-Bedienung** (D-14): Jede Task ist aus ihrem eigenen Text allein startbar.
- **Konzept-Hoheit**: Weichen Konzept und Bau voneinander ab, wird das Konzept praezisiert — in
  den Ideation-Verzeichnissen, nicht im Repo.
- **Testumgebung**: vitest laeuft mit `environment: 'node'`, `globals: true`. Es existiert
  **kein** `vi.mock('electron')` im Repo, und dieser Plan fuehrt keines ein. Alle neuen Module
  bleiben laufzeit-frei von `electron`: Nur `import type`-Importe (werden wegkompiliert) sind
  erlaubt, Pfade und Flags werden als Parameter hereingereicht.
- **Sprache**: Kommentare und Log-Ausgaben folgen dem Bestand (englische Kommentare in
  `src/main/`, deutsche Fachbegriffe wo der Bestand sie nutzt).

---

## File Structure

**Neu:**

| Datei | Verantwortung |
|-------|---------------|
| `src/shared/service-status.ts` | Statustypen + typisierter Subsystem-Fehler. Shared, weil Renderer und Main beide darauf typen. |
| `src/main/graph/native-binding.ts` | ABI-korrekte Aufloesung der better-sqlite3-Binary. |
| `src/main/event-bus.ts` | Fenster-Registry + Broadcast an alle lebenden Fenster. |
| `src/main/service-lifecycle.ts` | Fenster-unabhaengige, idempotente Service-Initialisierung. |
| `src/main/project/kickoff.ts` | Elektron-freier Kickoff-Kern (Projekt + Phasenkette). |
| `src/main/session/session-context.ts` | Ableitung von Session-Name und `cwd` aus Projekt + Entitaet. |
| `src/shared/preset-catalog.ts` | Die vier 0.1-Presets als UI-taugliche Metadaten. |

**Geaendert:**

| Datei | Aenderung |
|-------|-----------|
| `src/main/graph/db.ts` | `OpenDbOptions.nativeBinding` |
| `src/main/window-manager.ts` | `initializeBackgroundServices` entfaellt; nur noch Fenster-Lifecycle |
| `src/main/main.ts` | `initializeServices` in `whenReady`, Fenster am Bus registrieren |
| `src/main/ipc-handlers.ts` | `services:status`, typisierte Guards, Kickoff-Delegation, Session-Preset |
| `src/shared/ipc-channels.ts` | neue Kanaele + Union-Eintraege |
| `src/renderer/components/StatusBar.tsx` | Degradations-Anzeige |
| `src/renderer/hooks/useKanban.ts` | neue `{items, error}`-Antwortform |
| `src/renderer/hooks/useTimeline.ts` | Fehlerfeld nicht mehr verwerfen |
| `src/renderer/index.tsx` | Projektkontext + Preset beim Session-Start |
| `src/renderer/components/LauncherCell.tsx` | Preset-Auswahl |

---

## Task 0: Native-Module-ABI — Dual-ABI ohne Umschalten

**Warum zuerst:** Ohne diese Task ist der Knowledge Graph in der laufenden App tot. Die
Abnahmekriterien von 6a, 6c und 6d sind dann nicht pruefbar — man wuerde gegen ein Subsystem
planen, das gar nicht laedt.

**Files:**
- Create: `src/main/graph/native-binding.ts`
- Modify: `src/main/graph/db.ts:14-19` (OpenDbOptions), `src/main/graph/db.ts:31-32` (Database-Konstruktion)
- Test: `tests/graph/native-binding.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: `resolveBetterSqliteBinding(moduleRoot: string, platform?: string, arch?: string, abi?: string): string | undefined` und `OpenDbOptions.nativeBinding?: string`. Task 3 ruft den Resolver auf.

- [ ] **Step 1: Write the failing test**

Datei `tests/graph/native-binding.test.ts`:

```typescript
/**
 * tests/graph/native-binding.test.ts — ABI-korrekte Aufloesung der better-sqlite3-Binary.
 *
 * Hintergrund: vitest laeuft unter Node (ABI 141), die App unter Electron (ABI 146).
 * Beide Binaries koexistieren; die Aufloesung entscheidet, welche geladen wird.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveBetterSqliteBinding } from '../../src/main/graph/native-binding'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'keel-binding-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('resolveBetterSqliteBinding', () => {
  it('returns the ABI-specific path when that binary exists', () => {
    const dir = join(root, 'bin', 'darwin-arm64-146')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'better-sqlite3.node'), '')

    const result = resolveBetterSqliteBinding(root, 'darwin', 'arm64', '146')

    expect(result).toBe(join(dir, 'better-sqlite3.node'))
  })

  it('returns undefined when no ABI-specific binary exists', () => {
    const result = resolveBetterSqliteBinding(root, 'darwin', 'arm64', '146')

    expect(result).toBeUndefined()
  })

  it('does not return a binary built for a different ABI', () => {
    const dir = join(root, 'bin', 'darwin-arm64-141')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'better-sqlite3.node'), '')

    const result = resolveBetterSqliteBinding(root, 'darwin', 'arm64', '146')

    expect(result).toBeUndefined()
  })

  it('defaults to the running process platform, arch and ABI', () => {
    const dir = join(root, 'bin', `${process.platform}-${process.arch}-${process.versions.modules}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'better-sqlite3.node'), '')

    expect(resolveBetterSqliteBinding(root)).toBe(join(dir, 'better-sqlite3.node'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/graph/native-binding.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/main/graph/native-binding"`.

- [ ] **Step 3: Write minimal implementation**

Datei `src/main/graph/native-binding.ts`:

```typescript
/**
 * native-binding.ts — ABI-correct resolution of the better-sqlite3 native addon.
 *
 * vitest runs under Node, the app runs under Electron — different NODE_MODULE_VERSION.
 * electron-rebuild places the Electron build in bin/<platform>-<arch>-<abi>/, while the
 * default `bindings()` lookup finds build/Release first (the Node build). Passing an
 * explicit nativeBinding lets both coexist without a rebuild toggle.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Returns the path to the ABI-matching better-sqlite3 addon, or undefined when none
 * exists — in which case the caller should fall back to default resolution.
 *
 * @param moduleRoot Path to the better-sqlite3 package directory.
 */
export function resolveBetterSqliteBinding(
  moduleRoot: string,
  platform: string = process.platform,
  arch: string = process.arch,
  abi: string = process.versions.modules,
): string | undefined {
  const candidate = join(moduleRoot, 'bin', `${platform}-${arch}-${abi}`, 'better-sqlite3.node')
  return existsSync(candidate) ? candidate : undefined
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/graph/native-binding.test.ts`
Expected: PASS (4 Tests).

- [ ] **Step 5: Thread nativeBinding through openGraphDb**

In `src/main/graph/db.ts` das Interface erweitern (bisher `path` + `embeddingDim`):

```typescript
export interface OpenDbOptions {
  /** Path to the SQLite file. Use ':memory:' for tests. */
  path: string
  /** Embedding vector dimension. Default 384. */
  embeddingDim?: number
  /**
   * Explicit path to the better-sqlite3 native addon. Set under Electron, where the
   * default lookup would find the Node-ABI build. Omit to use default resolution.
   */
  nativeBinding?: string
}
```

Und die Konstruktion in `openGraphDb` (aktuell `const db = new Database(opts.path)`):

```typescript
  const db = opts.nativeBinding
    ? new Database(opts.path, { nativeBinding: opts.nativeBinding })
    : new Database(opts.path)
```

- [ ] **Step 6: Verify the whole suite still passes**

Run: `npm test && npm run typecheck`
Expected: 1394 Tests gruen (1390 + 4 neue), Typecheck ohne Fehler.

- [ ] **Step 7: Commit**

```bash
git add src/main/graph/native-binding.ts src/main/graph/db.ts tests/graph/native-binding.test.ts
git commit -m "fix(graph): resolve better-sqlite3 addon by ABI so Electron and vitest coexist"
```

---

## Task 1: Shared Service-Status-Typen

**Files:**
- Create: `src/shared/service-status.ts`
- Test: `tests/service-status.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: `SubsystemId`, `ServiceState`, `SubsystemStatus`, `ServiceStatusMap`, `SUBSYSTEM_IDS`, `subsystemError(subsystem, message)`, `isSubsystemError(value)`, `SUBSYSTEM_UNAVAILABLE`. Tasks 3, 4, 5 und 6 bauen darauf.

- [ ] **Step 1: Write the failing test**

Datei `tests/service-status.test.ts`:

```typescript
/**
 * tests/service-status.test.ts — Statustypen und typisierter Subsystem-Fehler.
 *
 * Loest Befund 2: Ein nicht initialisiertes Subsystem muss von einem leeren
 * Ergebnis unterscheidbar sein.
 */
import { describe, it, expect } from 'vitest'
import {
  SUBSYSTEM_IDS,
  SUBSYSTEM_UNAVAILABLE,
  subsystemError,
  isSubsystemError,
  type ServiceStatusMap,
} from '../src/shared/service-status'

describe('SUBSYSTEM_IDS', () => {
  it('covers exactly the six subsystems the lifecycle initializes', () => {
    expect([...SUBSYSTEM_IDS]).toEqual(['tmux', 'nanoclaw', 'voice', 'graph', 'kanban', 'notes'])
  })

  it('has no duplicates', () => {
    expect(new Set(SUBSYSTEM_IDS).size).toBe(SUBSYSTEM_IDS.length)
  })
})

describe('subsystemError', () => {
  it('carries the code, the subsystem and the reason', () => {
    const err = subsystemError('graph', 'Graph not initialized')

    expect(err.code).toBe(SUBSYSTEM_UNAVAILABLE)
    expect(err.subsystem).toBe('graph')
    expect(err.message).toBe('Graph not initialized')
  })
})

describe('isSubsystemError', () => {
  it('accepts a value built by subsystemError', () => {
    expect(isSubsystemError(subsystemError('kanban', 'Kanban not initialized'))).toBe(true)
  })

  it('rejects a plain empty array — the old silent-degradation shape', () => {
    expect(isSubsystemError([])).toBe(false)
  })

  it('rejects null and undefined', () => {
    expect(isSubsystemError(null)).toBe(false)
    expect(isSubsystemError(undefined)).toBe(false)
  })

  it('rejects an object with a different code', () => {
    expect(isSubsystemError({ code: 'SOMETHING_ELSE', subsystem: 'graph', message: 'x' })).toBe(false)
  })
})

describe('ServiceStatusMap', () => {
  it('types a full map keyed by subsystem id', () => {
    const map: ServiceStatusMap = {
      tmux:     { id: 'tmux',     state: 'ready',    reason: null },
      nanoclaw: { id: 'nanoclaw', state: 'degraded', reason: 'socket not reachable' },
      voice:    { id: 'voice',    state: 'disabled', reason: 'disabled in config' },
      graph:    { id: 'graph',    state: 'ready',    reason: null },
      kanban:   { id: 'kanban',   state: 'ready',    reason: null },
      notes:    { id: 'notes',    state: 'ready',    reason: null },
    }

    expect(map.nanoclaw.state).toBe('degraded')
    expect(map.voice.reason).toBe('disabled in config')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/service-status.test.ts`
Expected: FAIL — `Failed to resolve import "../src/shared/service-status"`.

- [ ] **Step 3: Write minimal implementation**

Datei `src/shared/service-status.ts`:

```typescript
/**
 * service-status.ts — Subsystem status shared by Main and Renderer.
 *
 * CK-NFR-010: Graceful degradation must be visible. A subsystem that failed to
 * initialize must be distinguishable from a subsystem that is simply empty.
 */

// ---------------------------------------------------------------------------
// Subsystems
// ---------------------------------------------------------------------------

/** All subsystems initialized by service-lifecycle, in initialization order. */
export const SUBSYSTEM_IDS = ['tmux', 'nanoclaw', 'voice', 'graph', 'kanban', 'notes'] as const

export type SubsystemId = (typeof SUBSYSTEM_IDS)[number]

/**
 * ready    — initialized, fully usable
 * degraded — initialization failed or the backing resource is unreachable
 * disabled — intentionally switched off by config; not an error
 */
export type ServiceState = 'ready' | 'degraded' | 'disabled'

export interface SubsystemStatus {
  id: SubsystemId
  state: ServiceState
  /** Human-readable cause. Always set unless state is 'ready'. */
  reason: string | null
}

export type ServiceStatusMap = Record<SubsystemId, SubsystemStatus>

// ---------------------------------------------------------------------------
// Typed error returned by IPC handlers instead of a silent empty result
// ---------------------------------------------------------------------------

export const SUBSYSTEM_UNAVAILABLE = 'SUBSYSTEM_UNAVAILABLE' as const

export interface SubsystemError {
  code: typeof SUBSYSTEM_UNAVAILABLE
  subsystem: SubsystemId
  message: string
}

export function subsystemError(subsystem: SubsystemId, message: string): SubsystemError {
  return { code: SUBSYSTEM_UNAVAILABLE, subsystem, message }
}

export function isSubsystemError(value: unknown): value is SubsystemError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { code?: unknown }).code === SUBSYSTEM_UNAVAILABLE
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/service-status.test.ts`
Expected: PASS (8 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/service-status.ts tests/service-status.test.ts
git commit -m "feat(status): shared subsystem status types and typed unavailable error"
```

---

## Task 2: Event-Bus (6b) — Broadcast statt Fenster-Closure

**Loest Befund 3.** Verifiziert wurde: `notes:changed` erreichte nur das Grid-Fenster, waehrend
`kanban:changed` ueber `BrowserWindow.getAllWindows()` beide erreichte. Der Bus verallgemeinert
den funktionierenden Pfad und macht ihn testbar.

**Files:**
- Create: `src/main/event-bus.ts`
- Test: `tests/event-bus.test.ts`

**Interfaces:**
- Consumes: `MainToRendererChannel` aus `src/shared/ipc-channels.ts`.
- Produces: `registerWindow(win)`, `broadcast(channel, ...args)`, `windowCount()`, `resetEventBus()`, `type BroadcastTarget`. Tasks 3 und 4 senden ueber `broadcast`.

**Designhinweis:** `BroadcastTarget` ist ein strukturelles Interface, kein `BrowserWindow`-Import
zur Laufzeit. `BrowserWindow` erfuellt es strukturell; die Tests nutzen ein Fake-Objekt. Damit
bleibt das Modul unter vitest ohne Electron ladbar.

- [ ] **Step 1: Write the failing test**

Datei `tests/event-bus.test.ts`:

```typescript
/**
 * tests/event-bus.test.ts — Broadcast an alle lebenden Fenster (Befund 3).
 *
 * Verifiziert am 2026-08-06 in der laufenden App: notes:changed erreichte nur
 * das Fenster, das die Service-Init ausgeloest hatte. Der Bus behebt das.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerWindow,
  broadcast,
  windowCount,
  resetEventBus,
  type BroadcastTarget,
} from '../src/main/event-bus'

interface FakeWindow extends BroadcastTarget {
  sent: Array<{ channel: string; args: unknown[] }>
  destroyed: boolean
  fireClosed: () => void
}

function makeWindow(): FakeWindow {
  let closedHandler: (() => void) | null = null
  const win: FakeWindow = {
    sent: [],
    destroyed: false,
    webContents: {
      send(channel: string, ...args: unknown[]) {
        win.sent.push({ channel, args })
      },
    },
    isDestroyed: () => win.destroyed,
    once(_event: 'closed', cb: () => void) {
      closedHandler = cb
    },
    fireClosed() {
      win.destroyed = true
      closedHandler?.()
    },
  }
  return win
}

beforeEach(() => {
  resetEventBus()
})

describe('registerWindow / windowCount', () => {
  it('starts empty', () => {
    expect(windowCount()).toBe(0)
  })

  it('counts each registered window', () => {
    registerWindow(makeWindow())
    registerWindow(makeWindow())

    expect(windowCount()).toBe(2)
  })

  it('registering the same window twice does not duplicate it', () => {
    const win = makeWindow()
    registerWindow(win)
    registerWindow(win)

    expect(windowCount()).toBe(1)
  })
})

describe('broadcast', () => {
  it('reaches every registered window — the core fix for Befund 3', () => {
    const a = makeWindow()
    const b = makeWindow()
    registerWindow(a)
    registerWindow(b)

    broadcast('notes:changed')

    expect(a.sent).toEqual([{ channel: 'notes:changed', args: [] }])
    expect(b.sent).toEqual([{ channel: 'notes:changed', args: [] }])
  })

  it('forwards all arguments', () => {
    const win = makeWindow()
    registerWindow(win)

    broadcast('session:output', 'sess-1', 'hello')

    expect(win.sent[0].args).toEqual(['sess-1', 'hello'])
  })

  it('does not throw when no window is registered', () => {
    expect(() => broadcast('notes:changed')).not.toThrow()
  })
})

describe('deregistration', () => {
  it('drops a window when it fires closed', () => {
    const a = makeWindow()
    const b = makeWindow()
    registerWindow(a)
    registerWindow(b)

    a.fireClosed()

    expect(windowCount()).toBe(1)
    broadcast('notes:changed')
    expect(a.sent).toHaveLength(0)
    expect(b.sent).toHaveLength(1)
  })

  it('skips a destroyed window that never fired closed', () => {
    const win = makeWindow()
    registerWindow(win)
    win.destroyed = true

    broadcast('notes:changed')

    expect(win.sent).toHaveLength(0)
  })

  it('keeps delivering to healthy windows when one send throws', () => {
    const bad = makeWindow()
    bad.webContents.send = () => {
      throw new Error('render process gone')
    }
    const good = makeWindow()
    registerWindow(bad)
    registerWindow(good)

    expect(() => broadcast('notes:changed')).not.toThrow()
    expect(good.sent).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/event-bus.test.ts`
Expected: FAIL — `Failed to resolve import "../src/main/event-bus"`.

- [ ] **Step 3: Write minimal implementation**

Datei `src/main/event-bus.ts`:

```typescript
/**
 * event-bus.ts — Main→Renderer broadcast registry.
 *
 * Background services must not capture a single BrowserWindow in a closure: with two
 * windows open (project + grid) only the window that triggered initialization would
 * receive events. Every window registers here; broadcast reaches all live ones.
 *
 * CK-UI-002 (Drei-Fenster-Modell)
 */

import type { MainToRendererChannel } from '../shared/ipc-channels'

/**
 * Structural subset of BrowserWindow. Declared structurally so this module stays
 * loadable under vitest without electron.
 */
export interface BroadcastTarget {
  webContents: { send(channel: string, ...args: unknown[]): void }
  isDestroyed(): boolean
  once(event: 'closed', cb: () => void): void
}

const windows = new Set<BroadcastTarget>()

/** Registers a window and auto-deregisters it when it closes. */
export function registerWindow(win: BroadcastTarget): void {
  if (windows.has(win)) return
  windows.add(win)
  win.once('closed', () => {
    windows.delete(win)
  })
}

/** Sends a channel message to every live registered window. */
export function broadcast(channel: MainToRendererChannel, ...args: unknown[]): void {
  for (const win of [...windows]) {
    if (win.isDestroyed()) {
      windows.delete(win)
      continue
    }
    try {
      win.webContents.send(channel, ...args)
    } catch (err) {
      // A window can die between the isDestroyed check and the send.
      console.warn('[event-bus] send failed, dropping window:', err)
      windows.delete(win)
    }
  }
}

/** Number of currently registered windows. */
export function windowCount(): number {
  return windows.size
}

/** Test seam — clears the registry. */
export function resetEventBus(): void {
  windows.clear()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/event-bus.test.ts`
Expected: PASS (9 Tests).

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: 1411 Tests gruen (1402 + 9), Typecheck sauber.

- [ ] **Step 6: Commit**

```bash
git add src/main/event-bus.ts tests/event-bus.test.ts
git commit -m "feat(event-bus): broadcast main events to all live windows"
```

---

## Task 3: Service-Lifecycle (6a) — Init vom Fenster entkoppeln

**Loest Befund 1.**

**Files:**
- Create: `src/main/service-lifecycle.ts`
- Modify: `src/main/window-manager.ts` (streicht `initializeBackgroundServices` und die zugehoerigen Importe), `src/main/main.ts:57-81`
- Test: `tests/service-lifecycle.test.ts`

**Interfaces:**
- Consumes: `AppServices` (`src/main/window-manager.ts`), `ServiceStatusMap`/`SUBSYSTEM_IDS` (Task 1), `broadcast` (Task 2), `resolveBetterSqliteBinding` (Task 0).
- Produces: `initializeServices(services, ctx): Promise<ServiceStatusMap>`, `getServiceStatus(): ServiceStatusMap`, `resetServiceLifecycle()`, `type ServiceInitContext`. Task 4 liest `getServiceStatus()`.

**Designhinweise:**
- `ServiceInitContext` traegt alles Electron-Abhaengige herein (`userDataPath`, `appPath`,
  `voiceEnabled`), damit das Modul ohne Electron testbar bleibt.
- Idempotenz ueber ein modulweites `initPromise`: Ein zweiter Aufruf gibt dasselbe Promise zurueck
  und startet nichts erneut — auch bei parallelem Aufruf.
- Jedes Subsystem wird einzeln in `try/catch` gefasst und setzt seinen Status. Ein Fehler in einem
  Subsystem darf die uebrigen nicht verhindern (CK-NFR-010).

- [ ] **Step 1: Write the failing test**

Datei `tests/service-lifecycle.test.ts`:

```typescript
/**
 * tests/service-lifecycle.test.ts — fenster-unabhaengige, idempotente Service-Init.
 *
 * Befund 1 (verifiziert 2026-08-06): Beim App-Start wurde nie initialisiert; graphDb,
 * kanbanStore und noteManager blieben null, bis der Nutzer das Grid-Fenster oeffnete.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  initializeServices,
  getServiceStatus,
  resetServiceLifecycle,
  type ServiceInitContext,
} from '../src/main/service-lifecycle'
import { resetEventBus } from '../src/main/event-bus'
import type { AppServices } from '../src/main/window-manager'

let userDataPath: string

/** Minimal fakes — only the members service-lifecycle actually touches. */
function makeServices(overrides: Partial<AppServices> = {}): AppServices {
  return {
    tmux: {
      connect: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      sendKeys: vi.fn().mockResolvedValue(undefined),
    },
    statusMonitor: { start: vi.fn(), on: vi.fn() },
    nanoClawBridge: { connect: vi.fn().mockResolvedValue(undefined), on: vi.fn() },
    voiceManager: null,
    graphDb: null,
    graphWriter: null,
    graphMcpServer: null,
    noteManager: null,
    noteTagging: null,
    tagClassRepo: null,
    tagIndex: null,
    noteWatcher: null,
    kanbanStore: null,
    ...overrides,
  } as unknown as AppServices
}

function makeContext(): ServiceInitContext {
  return { userDataPath, appPath: process.cwd(), voiceEnabled: false }
}

beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'keel-lifecycle-'))
  resetServiceLifecycle()
  resetEventBus()
})

afterEach(() => {
  rmSync(userDataPath, { recursive: true, force: true })
})

describe('initializeServices — graph (Befund 1)', () => {
  it('populates graphDb, graphWriter and kanbanStore', async () => {
    const services = makeServices()

    await initializeServices(services, makeContext())

    expect(services.graphDb).not.toBeNull()
    expect(services.graphWriter).not.toBeNull()
    expect(services.kanbanStore).not.toBeNull()
  })

  it('reports graph and kanban as ready', async () => {
    const status = await initializeServices(makeServices(), makeContext())

    expect(status.graph.state).toBe('ready')
    expect(status.kanban.state).toBe('ready')
  })

  it('creates graph.db under the given userDataPath', async () => {
    const services = makeServices()

    await initializeServices(services, makeContext())

    expect(services.graphDb!.name).toBe(join(userDataPath, 'graph.db'))
  })
})

describe('initializeServices — notes', () => {
  it('populates the notes services and reports ready', async () => {
    const services = makeServices()

    const status = await initializeServices(services, makeContext())

    expect(services.noteManager).not.toBeNull()
    expect(services.tagIndex).not.toBeNull()
    expect(status.notes.state).toBe('ready')
  })
})

describe('initializeServices — idempotence', () => {
  it('is a no-op on the second call', async () => {
    const services = makeServices()

    await initializeServices(services, makeContext())
    const firstDb = services.graphDb
    await initializeServices(services, makeContext())

    expect(services.graphDb).toBe(firstDb)
    expect(services.tmux.connect).toHaveBeenCalledTimes(1)
  })

  it('shares one run between concurrent callers', async () => {
    const services = makeServices()

    await Promise.all([
      initializeServices(services, makeContext()),
      initializeServices(services, makeContext()),
    ])

    expect(services.tmux.connect).toHaveBeenCalledTimes(1)
  })
})

describe('initializeServices — degradation is reported, never thrown', () => {
  it('marks tmux degraded when connect rejects, without failing the run', async () => {
    const services = makeServices({
      tmux: {
        connect: vi.fn().mockRejectedValue(new Error('tmux missing')),
        on: vi.fn(),
        sendKeys: vi.fn(),
      },
    } as unknown as Partial<AppServices>)

    const status = await initializeServices(services, makeContext())

    expect(status.tmux.state).toBe('degraded')
    expect(status.tmux.reason).toContain('tmux missing')
    expect(status.graph.state).toBe('ready')
  })

  it('marks nanoclaw degraded when the socket is unreachable', async () => {
    const services = makeServices({
      nanoClawBridge: {
        connect: vi.fn().mockRejectedValue(new Error('ENOENT')),
        on: vi.fn(),
      },
    } as unknown as Partial<AppServices>)

    const status = await initializeServices(services, makeContext())

    expect(status.nanoclaw.state).toBe('degraded')
  })

  it('marks voice disabled — not degraded — when config switches it off', async () => {
    const status = await initializeServices(makeServices(), {
      userDataPath,
      appPath: process.cwd(),
      voiceEnabled: false,
    })

    expect(status.voice.state).toBe('disabled')
    expect(status.voice.reason).toContain('config')
  })
})

describe('getServiceStatus', () => {
  it('reports every subsystem as degraded before initialization', () => {
    const status = getServiceStatus()

    expect(status.graph.state).toBe('degraded')
    expect(status.graph.reason).toContain('not initialized')
  })

  it('returns the post-init status after a run', async () => {
    await initializeServices(makeServices(), makeContext())

    expect(getServiceStatus().graph.state).toBe('ready')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/service-lifecycle.test.ts`
Expected: FAIL — `Failed to resolve import "../src/main/service-lifecycle"`.

- [ ] **Step 3: Write minimal implementation**

Datei `src/main/service-lifecycle.ts`:

```typescript
/**
 * service-lifecycle.ts — window-independent background service initialization.
 *
 * Previously this lived in window-manager.ts and was only reachable via createMainWindow,
 * so the grid window had to be opened before any service existed. It now runs from
 * app.whenReady() and is idempotent.
 *
 * Everything electron-specific arrives through ServiceInitContext, so this module stays
 * testable without electron.
 *
 * CK-INF-025, CK-NFR-008 (startup budget), CK-NFR-010 (graceful degradation)
 */

import { join } from 'node:path'
import {
  SESSION_OUTPUT,
  STATUSLINE_CTX_UPDATE,
  NANOCLAW_MESSAGE_INBOUND,
  NANOCLAW_STATUS_CHANGED,
  NOTES_CHANGED,
  APP_READY,
  VOICE_STATE,
  VOICE_TRANSCRIPTION,
  VOICE_DISPATCHED,
  VOICE_ERROR,
  VOICE_PIN_STATUS,
  VOICE_ACTIVE_SESSION,
} from '../shared/ipc-channels'
import {
  SUBSYSTEM_IDS,
  type ServiceStatusMap,
  type SubsystemId,
  type ServiceState,
} from '../shared/service-status'
import { broadcast } from './event-bus'
import { openGraphDb } from './graph/db'
import { resolveBetterSqliteBinding } from './graph/native-binding'
import { GraphMcpServer } from './graph/mcp-server'
import { GraphWriter } from './graph/writer'
import { VoiceManager } from './voice/voice-manager'
import { NoteManager } from './notes/note-manager'
import { NoteTagging } from './notes/note-tagging'
import { TagClassRepo } from './notes/tag-repository'
import { TagIndex } from './notes/tag-index'
import { NoteWatcher } from './notes/note-watcher'
import { KanbanStore } from './kanban/kanban-store'
import type { AppServices } from './window-manager'

export interface ServiceInitContext {
  /** Electron app.getPath('userData') — holds graph.db and notes/. */
  userDataPath: string
  /** Electron app.getAppPath() — used to locate the native better-sqlite3 addon. */
  appPath: string
  /** Whether the voice pipeline should be initialized at all. */
  voiceEnabled: boolean
}

// ---------------------------------------------------------------------------
// Status bookkeeping
// ---------------------------------------------------------------------------

function freshStatus(): ServiceStatusMap {
  const map = {} as ServiceStatusMap
  for (const id of SUBSYSTEM_IDS) {
    map[id] = { id, state: 'degraded', reason: 'not initialized' }
  }
  return map
}

let status: ServiceStatusMap = freshStatus()
let initPromise: Promise<ServiceStatusMap> | null = null

function setStatus(id: SubsystemId, state: ServiceState, reason: string | null): void {
  status[id] = { id, state, reason }
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Current status of every subsystem. Safe to call before initialization. */
export function getServiceStatus(): ServiceStatusMap {
  return status
}

/** Test seam — clears status and the idempotence latch. */
export function resetServiceLifecycle(): void {
  status = freshStatus()
  initPromise = null
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initializes all background services. Idempotent: repeated (and concurrent) calls
 * share the first run and never re-initialize.
 */
export function initializeServices(
  services: AppServices,
  ctx: ServiceInitContext,
): Promise<ServiceStatusMap> {
  if (!initPromise) {
    initPromise = runInit(services, ctx)
  }
  return initPromise
}

async function runInit(
  services: AppServices,
  ctx: ServiceInitContext,
): Promise<ServiceStatusMap> {
  await initTmux(services)
  initStatusMonitor(services)
  await initNanoClaw(services)
  await initVoice(services, ctx)
  initGraph(services, ctx)
  initNotes(services, ctx)

  broadcast(APP_READY, { timestamp: Date.now() })
  return status
}

async function initTmux(services: AppServices): Promise<void> {
  services.tmux.on('output', (sessionId: string, data: string) => {
    broadcast(SESSION_OUTPUT, sessionId, data)
  })
  try {
    await services.tmux.connect()
    setStatus('tmux', 'ready', null)
    console.log('[service-lifecycle] tmux control mode connected')
  } catch (err) {
    setStatus('tmux', 'degraded', reasonOf(err))
    console.warn('[service-lifecycle] tmux connect failed (retry on first session create):', err)
  }
}

function initStatusMonitor(services: AppServices): void {
  services.statusMonitor.on('usage-updated', (sessionId: string, usage: unknown) => {
    broadcast(STATUSLINE_CTX_UPDATE, sessionId, usage)
  })
  services.statusMonitor.start()
}

async function initNanoClaw(services: AppServices): Promise<void> {
  services.nanoClawBridge.on('message-inbound', (threadId: string | null, text: string) => {
    broadcast(NANOCLAW_MESSAGE_INBOUND, { threadId, text })
  })
  services.nanoClawBridge.on('status-changed', (s: string) => {
    broadcast(NANOCLAW_STATUS_CHANGED, { status: s })
  })
  try {
    await services.nanoClawBridge.connect()
    setStatus('nanoclaw', 'ready', null)
    console.log('[service-lifecycle] NanoClaw bridge connected')
  } catch (err) {
    setStatus('nanoclaw', 'degraded', reasonOf(err))
    console.warn('[service-lifecycle] NanoClaw not reachable — Schenkel 2 unavailable')
  }
}

async function initVoice(services: AppServices, ctx: ServiceInitContext): Promise<void> {
  if (!ctx.voiceEnabled) {
    setStatus('voice', 'disabled', 'disabled in config')
    console.log('[service-lifecycle] Voice pipeline disabled by config')
    return
  }
  try {
    const vm = new VoiceManager({
      sendKeys: async (sessionId: string, data: string) => {
        await services.tmux.sendKeys(sessionId, data)
      },
    })
    vm.on('stateChanged', (state: string) => broadcast(VOICE_STATE, state))
    vm.on('transcription', (text: string) => broadcast(VOICE_TRANSCRIPTION, text))
    vm.on('dispatched', (data: unknown) => broadcast(VOICE_DISPATCHED, data))
    vm.on('error', (data: unknown) => broadcast(VOICE_ERROR, data))
    vm.on('pinChanged', (data: unknown) => broadcast(VOICE_PIN_STATUS, data))
    vm.on('activeSessionChanged', (id: string | null) =>
      broadcast(VOICE_ACTIVE_SESSION, { sessionId: id }))
    services.voiceManager = vm

    const result = await vm.init()
    if (result.stt) {
      setStatus('voice', 'ready', null)
    } else {
      setStatus('voice', 'degraded', 'STT model missing')
    }
    console.log('[service-lifecycle] Voice pipeline — STT:', result.stt, 'TTS:', result.tts)
  } catch (err) {
    services.voiceManager = null
    setStatus('voice', 'degraded', reasonOf(err))
    console.warn('[service-lifecycle] Voice pipeline init failed:', err)
  }
}

function initGraph(services: AppServices, ctx: ServiceInitContext): void {
  try {
    const graphDbPath = join(ctx.userDataPath, 'graph.db')
    const nativeBinding = resolveBetterSqliteBinding(
      join(ctx.appPath, 'node_modules', 'better-sqlite3'),
    )
    services.graphDb = openGraphDb({ path: graphDbPath, nativeBinding })
    services.graphWriter = new GraphWriter(services.graphDb)
    services.graphMcpServer = new GraphMcpServer(services.graphDb)
    services.kanbanStore = new KanbanStore(services.graphDb)
    setStatus('graph', 'ready', null)
    setStatus('kanban', 'ready', null)
    console.log('[service-lifecycle] Knowledge Graph initialized:', graphDbPath)
  } catch (err) {
    services.graphDb = null
    services.graphWriter = null
    services.graphMcpServer = null
    services.kanbanStore = null
    setStatus('graph', 'degraded', reasonOf(err))
    setStatus('kanban', 'degraded', 'graph unavailable: ' + reasonOf(err))
    console.warn('[service-lifecycle] Knowledge Graph init failed:', err)
  }
}

function initNotes(services: AppServices, ctx: ServiceInitContext): void {
  try {
    const notesDir = join(ctx.userDataPath, 'notes')
    services.noteManager = new NoteManager(notesDir)
    services.noteTagging = new NoteTagging(notesDir)
    services.tagClassRepo = new TagClassRepo(notesDir)
    services.tagIndex = new TagIndex(notesDir, services.tagClassRepo)
    services.noteTagging.setTagClassRepo(services.tagClassRepo)
    services.tagIndex.rebuild()
    services.noteTagging.recountTags()
    services.noteWatcher = new NoteWatcher(notesDir, () => {
      services.tagIndex?.rebuild()
      services.noteTagging?.recountTags()
      broadcast(NOTES_CHANGED)
    })
    services.noteWatcher.start()
    setStatus('notes', 'ready', null)
    console.log('[service-lifecycle] Notes system initialized')
  } catch (err) {
    setStatus('notes', 'degraded', reasonOf(err))
    console.warn('[service-lifecycle] Notes system init failed:', err)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/service-lifecycle.test.ts`
Expected: PASS (11 Tests).

- [ ] **Step 5: Strip the old init out of window-manager.ts**

In `src/main/window-manager.ts`:

1. Die gesamte Funktion `initializeBackgroundServices` (ab dem Kommentarblock
   `// Background service initialization (deferred post-window-show)` bis zum Dateiende) loeschen.
2. In `createMainWindow` den `ready-to-show`-Handler auf reines Anzeigen reduzieren:

```typescript
  win.once('ready-to-show', () => {
    win.show()
  })
```

3. Alle jetzt unbenutzten Importe entfernen — `app`, `join` bleibt (fuer `preload`/`loadFile`
   weiterhin gebraucht), aber diese fliegen raus: die Kanal-Konstanten (`SESSION_OUTPUT`,
   `STATUSLINE_CTX_UPDATE`, `NANOCLAW_MESSAGE_INBOUND`, `NANOCLAW_STATUS_CHANGED`,
   `NOTES_CHANGED`, `APP_READY`, `VOICE_*`), `configStore`, `openGraphDb`, `GraphMcpServer`,
   `GraphWriter`, `VoiceManager`, `NoteManager`, `NoteTagging`, `TagClassRepo`, `TagIndex`,
   `NoteWatcher`, `KanbanStore`. Der `AppServices`-Export und seine `import type`-Zeilen bleiben.
4. Den Datei-Kopfkommentar anpassen: `createMainWindow(services)` initialisiert keine Services
   mehr; das macht `service-lifecycle.ts`.

- [ ] **Step 6: Wire it up in main.ts**

In `src/main/main.ts` den `whenReady`-Block ersetzen. Der bestehende Block erzeugt das
Projektfenster und registriert Logging-Handler; neu sind Bus-Registrierung und deferred Init:

```typescript
import { registerWindow } from './event-bus'
import { initializeServices } from './service-lifecycle'
import { configStore } from './config/config-store'

app.whenReady().then(() => {
  console.log('[main] app ready — registering handlers + creating project window')
  registerIpcHandlers(services)
  const win = createProjectWindow(services)
  registerWindow(win)
  console.log('[main] project window created, id:', win.id)

  // Deferred so the window paints first — startup budget stays under 5s
  // (CK-INF-025, CK-NFR-008). Measured for real in Phase 9.
  setImmediate(() => {
    void initializeServices(services, {
      userDataPath: app.getPath('userData'),
      appPath: app.getAppPath(),
      voiceEnabled: configStore.get('voice').enabled !== false,
    })
  })

  win.on('closed', () => {
    console.log('[main] project window closed')
  })

  win.webContents.on('did-fail-load', (_ev, code, desc) => {
    console.error('[main] project window failed to load:', code, desc)
  })

  win.webContents.on('did-finish-load', () => {
    console.log('[main] project window finished loading')
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      registerWindow(createProjectWindow(services))
    }
  })
})
```

- [ ] **Step 7: Register the grid window on the bus**

In `src/main/ipc-handlers.ts`, im `WINDOW_OPEN_GRID`-Handler, das neu erzeugte Grid-Fenster
registrieren. Import ergaenzen (`import { registerWindow } from './event-bus'`) und die
Erzeugung anpassen:

```typescript
    if (!activeGridWindow || activeGridWindow.isDestroyed()) {
      activeGridWindow = createMainWindow(services)
      registerWindow(activeGridWindow)
      activeGridWindow.on('closed', () => {
        activeGridWindow = null
      })
    } else {
      activeGridWindow.focus()
    }
```

- [ ] **Step 8: Verify the suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: 1422 Tests gruen (1411 + 11), Typecheck sauber. Der Typecheck ist hier der eigentliche
Waechter: er faellt, wenn in Step 5 ein Import stehen blieb oder eine Referenz uebersehen wurde.

- [ ] **Step 9: Verify in the running app**

```bash
npm run build
rm -rf /tmp/keel-verify && mkdir -p /tmp/keel-verify
./node_modules/.bin/electron . --user-data-dir=/tmp/keel-verify 2>&1 | grep -E 'service-lifecycle|Knowledge Graph'
```

Expected: `[service-lifecycle] Knowledge Graph initialized: /tmp/keel-verify/graph.db` erscheint
**ohne** dass das Grid-Fenster geoeffnet wurde, und `/tmp/keel-verify/graph.db` existiert.
Das ist die Abnahme fuer Befund 1.

- [ ] **Step 10: Commit**

```bash
git add src/main/service-lifecycle.ts src/main/window-manager.ts src/main/main.ts \
        src/main/ipc-handlers.ts tests/service-lifecycle.test.ts
git commit -m "feat(lifecycle): initialize services on app ready, decoupled from windows"
```

---

## Task 4: services:status-Kanal und typisierte Guards (6c, Main-Seite)

**Loest Befund 2 auf der Main-Seite.**

**Files:**
- Modify: `src/shared/ipc-channels.ts`, `src/main/ipc-handlers.ts:460-463` (`KANBAN_LIST`), `src/preload.ts`
- Test: `tests/services-status-ipc.test.ts`

**Interfaces:**
- Consumes: `getServiceStatus` (Task 3), `subsystemError`/`isSubsystemError` (Task 1).
- Produces: IPC-Kanal `services:status` liefert `ServiceStatusMap`; `kanban:list` liefert
  `{ items: KanbanItem[]; error: SubsystemError | null }`. Task 5 konsumiert beides.

**Scope-Hinweis:** Umgestellt wird nur `kanban:list` — es ist der einzige Listen-Handler mit
stiller Degradation und genau **einer** Renderer-Aufrufstelle (`useKanban.ts`). Die `graph:*`-Handler
liefern ihr `error`-Feld bereits; dort liegt der Fehler im Renderer (Task 5). `notes:*` bleibt
unveraendert: der Notes-Pfad haengt nicht am Graph, initialisiert in der Praxis immer und
wuerde ohne Gegenwert eine breite Umstellung ausloesen.

- [ ] **Step 1: Write the failing test**

Datei `tests/services-status-ipc.test.ts`:

```typescript
/**
 * tests/services-status-ipc.test.ts — Kanaldeklaration und Antwortformen fuer 6c.
 *
 * Befund 2 (verifiziert 2026-08-06): kanban:list lieferte [] — nicht unterscheidbar
 * von einem leeren Board.
 */
import { describe, it, expect } from 'vitest'
import {
  SERVICES_STATUS,
  SERVICES_STATUS_CHANGED,
  type RendererToMainChannel,
  type MainToRendererChannel,
} from '../src/shared/ipc-channels'
import { subsystemError, isSubsystemError } from '../src/shared/service-status'
import type { KanbanItem } from '../src/shared/kanban-types'

describe('service status channels', () => {
  it('declares services:status as a renderer→main channel', () => {
    const channel: RendererToMainChannel = SERVICES_STATUS
    expect(channel).toBe('services:status')
  })

  it('declares services:status-changed as a main→renderer channel', () => {
    const channel: MainToRendererChannel = SERVICES_STATUS_CHANGED
    expect(channel).toBe('services:status-changed')
  })
})

describe('kanban:list response shape', () => {
  interface KanbanListResult {
    items: KanbanItem[]
    error: ReturnType<typeof subsystemError> | null
  }

  it('distinguishes an empty board from an unavailable subsystem', () => {
    const emptyBoard: KanbanListResult = { items: [], error: null }
    const unavailable: KanbanListResult = {
      items: [],
      error: subsystemError('kanban', 'Kanban not initialized'),
    }

    expect(emptyBoard.items).toHaveLength(0)
    expect(unavailable.items).toHaveLength(0)
    expect(isSubsystemError(emptyBoard.error)).toBe(false)
    expect(isSubsystemError(unavailable.error)).toBe(true)
  })

  it('names the subsystem in the error so the StatusBar can attribute it', () => {
    const result: KanbanListResult = {
      items: [],
      error: subsystemError('kanban', 'graph unavailable'),
    }

    expect(result.error!.subsystem).toBe('kanban')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/services-status-ipc.test.ts`
Expected: FAIL — `SERVICES_STATUS` wird nicht exportiert.

- [ ] **Step 3: Declare the channels**

In `src/shared/ipc-channels.ts` einen neuen Abschnitt ergaenzen (Stil wie die uebrigen Bloecke):

```typescript
// ---------------------------------------------------------------------------
// Service status channels (CK-NFR-010 — degradation must be visible)
// ---------------------------------------------------------------------------
export const SERVICES_STATUS = 'services:status' as const
export const SERVICES_STATUS_CHANGED = 'services:status-changed' as const
```

`SERVICES_STATUS` in die `RendererToMainChannel`-Union aufnehmen und
`SERVICES_STATUS_CHANGED` in die `MainToRendererChannel`-Union — sonst blockt der Preload-Bridge-Typ
den Kanal.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/services-status-ipc.test.ts`
Expected: PASS (4 Tests).

- [ ] **Step 5: Register the handler and switch kanban:list**

In `src/main/ipc-handlers.ts` die Importe ergaenzen. `SERVICES_STATUS` gehoert in den
**bestehenden** Sammelimport aus `'../shared/ipc-channels'` (die grosse Liste, die mit
`SESSION_LIST,` beginnt) — kein zweiter `import`-Block aus demselben Modul, sonst schlaegt
`npm run lint` an. Neu hinzu kommen nur diese beiden Zeilen:

```typescript
import { getServiceStatus } from './service-lifecycle'
import { subsystemError } from '../shared/service-status'
```

Den Status-Handler registrieren (neben den uebrigen `ipcMain.handle`-Aufrufen):

```typescript
  // ---------------------------------------------------------------------------
  // Service status (CK-NFR-010 — degradation must be visible, Befund 2)
  // ---------------------------------------------------------------------------

  ipcMain.handle(SERVICES_STATUS, async () => {
    return getServiceStatus()
  })
```

`KANBAN_LIST` auf die neue Antwortform umstellen (bisher `if (!services.kanbanStore) return []`):

```typescript
  ipcMain.handle(KANBAN_LIST, async () => {
    if (!services.kanbanStore) {
      return { items: [], error: subsystemError('kanban', 'Kanban store not initialized') }
    }
    try {
      return { items: services.kanbanStore.listItems(), error: null }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { items: [], error: subsystemError('kanban', msg) }
    }
  })
```

- [ ] **Step 6: Expose the status channel in the preload bridge**

`src/preload.ts` reicht `invoke`/`on` generisch ueber die Kanal-Unions durch — mit Step 3 ist
`services:status` damit bereits erreichbar. Pruefen, dass kein zusaetzlicher Allowlist-Eintrag
noetig ist: `grep -n "services:status" src/preload.ts` bleibt leer, `grep -n "RendererToMainChannel"
src/preload.ts` zeigt die generische Signatur. Kein Codeeingriff, wenn das zutrifft — die
Security-Baseline bleibt unangetastet (eine einzige `exposeInMainWorld`-Aufrufstelle).

- [ ] **Step 7: Adapt useKanban to the new response shape**

Der einzige Renderer-Aufrufer von `kanban:list` ist `src/renderer/hooks/useKanban.ts`. Er muss in
**dieser** Task mitwandern, sonst landet ein Commit mit rotem Typecheck — die Global Constraints
verlangen nach jedem Commit einen gruenen Typecheck.

`UseKanbanResult` erweitern und den Import ergaenzen:

```typescript
import { isSubsystemError, type SubsystemError } from '../../shared/service-status'

export interface UseKanbanResult {
  items: KanbanItem[]
  filteredItems: KanbanItem[]
  filter: KanbanFilter
  setFilter: (filter: KanbanFilter) => void
  loading: boolean
  /** Set when the kanban subsystem is unavailable — distinct from an empty board. */
  error: SubsystemError | null
  reload: () => Promise<void>
}
```

`reload` auf die neue Antwortform umstellen und einen Fehlerzustand mitfuehren:

```typescript
  const [error, setError] = useState<SubsystemError | null>(null)

  const reload = useCallback(async () => {
    if (!window.cipherKeel) return
    setLoading(true)
    try {
      const result = await window.cipherKeel.invoke(KANBAN_LIST) as {
        items?: KanbanItem[]
        error?: unknown
      }
      setItems(result?.items ?? [])
      setError(isSubsystemError(result?.error) ? result.error : null)
    } finally {
      setLoading(false)
    }
  }, [])
```

Und `error` im Rueckgabeobjekt mitgeben:

```typescript
  return { items, filteredItems, filter, setFilter, loading, error, reload }
```

- [ ] **Step 8: Verify suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: 1426 Tests gruen (1422 + 4), Typecheck sauber.

- [ ] **Step 9: Commit**

```bash
git add src/shared/ipc-channels.ts src/main/ipc-handlers.ts \
        src/renderer/hooks/useKanban.ts tests/services-status-ipc.test.ts
git commit -m "feat(status): services:status channel and typed kanban:list result"
```

---

## Task 5: Sichtbare Degradation im Renderer (6c, Renderer-Seite)

**Files:**
- Modify: `src/renderer/components/StatusBar.tsx`, `src/renderer/hooks/useTimeline.ts:80-90`
- Test: `tests/status-bar-degradation.test.ts`

`useKanban.ts` gehoert bewusst **nicht** hierher — es wandert in Task 4 mit, damit dort kein
Commit mit rotem Typecheck entsteht.

**Interfaces:**
- Consumes: `ServiceStatusMap`, `SubsystemStatus` (Task 1); `services:status` (Task 4); `{items,error}` von `kanban:list` (Task 4).
- Produces: `summarizeDegradation(status): DegradationSummary` als exportierte reine Funktion aus `StatusBar.tsx` — testbar ohne React-Rendering, passend zum Bestandsstil (siehe `tests/kickoff-wizard.test.ts`).

- [ ] **Step 1: Write the failing test**

Datei `tests/status-bar-degradation.test.ts`:

```typescript
/**
 * tests/status-bar-degradation.test.ts — Degradations-Zusammenfassung fuer die StatusBar.
 *
 * Nur reine Funktionen, kein React-Rendering — Stil wie tests/kickoff-wizard.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { summarizeDegradation } from '../src/renderer/components/StatusBar'
import type { ServiceStatusMap } from '../src/shared/service-status'

function statusMap(overrides: Partial<ServiceStatusMap> = {}): ServiceStatusMap {
  return {
    tmux:     { id: 'tmux',     state: 'ready', reason: null },
    nanoclaw: { id: 'nanoclaw', state: 'ready', reason: null },
    voice:    { id: 'voice',    state: 'ready', reason: null },
    graph:    { id: 'graph',    state: 'ready', reason: null },
    kanban:   { id: 'kanban',   state: 'ready', reason: null },
    notes:    { id: 'notes',    state: 'ready', reason: null },
    ...overrides,
  }
}

describe('summarizeDegradation', () => {
  it('reports healthy when every subsystem is ready', () => {
    const summary = summarizeDegradation(statusMap())

    expect(summary.healthy).toBe(true)
    expect(summary.degraded).toEqual([])
    expect(summary.label).toBe('alle Subsysteme bereit')
  })

  it('lists a degraded subsystem', () => {
    const summary = summarizeDegradation(statusMap({
      graph: { id: 'graph', state: 'degraded', reason: 'ERR_DLOPEN_FAILED' },
    }))

    expect(summary.healthy).toBe(false)
    expect(summary.degraded.map(s => s.id)).toEqual(['graph'])
    expect(summary.label).toBe('1 Subsystem degradiert: graph')
  })

  it('lists several degraded subsystems in SUBSYSTEM_IDS order', () => {
    const summary = summarizeDegradation(statusMap({
      graph:  { id: 'graph',  state: 'degraded', reason: 'x' },
      kanban: { id: 'kanban', state: 'degraded', reason: 'y' },
      tmux:   { id: 'tmux',   state: 'degraded', reason: 'z' },
    }))

    expect(summary.degraded.map(s => s.id)).toEqual(['tmux', 'graph', 'kanban'])
    expect(summary.label).toBe('3 Subsysteme degradiert: tmux, graph, kanban')
  })

  it('does not count a disabled subsystem as degraded', () => {
    const summary = summarizeDegradation(statusMap({
      voice: { id: 'voice', state: 'disabled', reason: 'disabled in config' },
    }))

    expect(summary.healthy).toBe(true)
    expect(summary.degraded).toEqual([])
  })

  it('exposes the reason so it can be shown as a tooltip', () => {
    const summary = summarizeDegradation(statusMap({
      nanoclaw: { id: 'nanoclaw', state: 'degraded', reason: 'ENOENT socket' },
    }))

    expect(summary.degraded[0].reason).toBe('ENOENT socket')
  })

  it('treats a missing status map as unknown, not as healthy', () => {
    const summary = summarizeDegradation(null)

    expect(summary.healthy).toBe(false)
    expect(summary.label).toBe('Subsystem-Status unbekannt')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/status-bar-degradation.test.ts`
Expected: FAIL — `summarizeDegradation` wird von `StatusBar` nicht exportiert.

- [ ] **Step 3: Implement summarizeDegradation and render it**

In `src/renderer/components/StatusBar.tsx` ergaenzen — Importe und reine Funktion oberhalb der
Komponente:

```typescript
import { SUBSYSTEM_IDS, type ServiceStatusMap, type SubsystemStatus } from '../../shared/service-status'

export interface DegradationSummary {
  healthy: boolean
  degraded: SubsystemStatus[]
  label: string
}

/**
 * Reduces the subsystem status map to a single StatusBar line.
 * 'disabled' is a deliberate config choice, not a fault — it never counts as degraded.
 */
export function summarizeDegradation(status: ServiceStatusMap | null): DegradationSummary {
  if (!status) {
    return { healthy: false, degraded: [], label: 'Subsystem-Status unbekannt' }
  }

  const degraded = SUBSYSTEM_IDS
    .map(id => status[id])
    .filter((s): s is SubsystemStatus => s?.state === 'degraded')

  if (degraded.length === 0) {
    return { healthy: true, degraded: [], label: 'alle Subsysteme bereit' }
  }

  const noun = degraded.length === 1 ? 'Subsystem' : 'Subsysteme'
  return {
    healthy: false,
    degraded,
    label: `${degraded.length} ${noun} degradiert: ${degraded.map(s => s.id).join(', ')}`,
  }
}
```

`StatusBarProps` um das Statusfeld erweitern:

```typescript
export interface StatusBarProps {
  activeProject?: string
  sessionCount: number
  /** NanoClaw-Verbindungsstatus (Schenkel 2, Phase 5) */
  nanoClawStatus?: 'connected' | 'disconnected' | 'connecting'
  /** Subsystem-Status (CK-NFR-010). null = noch nicht geladen. */
  serviceStatus?: ServiceStatusMap | null
}
```

Im JSX der Komponente einen Indikator ergaenzen — er wird nur sichtbar, wenn etwas nicht stimmt:

```tsx
      {(() => {
        const summary = summarizeDegradation(serviceStatus ?? null)
        if (summary.healthy) return null
        return (
          <span
            title={summary.degraded.map(s => `${s.id}: ${s.reason ?? 'unbekannt'}`).join('\n')}
            style={{ color: '#eab308', cursor: 'help' }}
          >
            ⚠ {summary.label}
          </span>
        )
      })()}
```

`serviceStatus` in die Destrukturierung der Props aufnehmen.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/status-bar-degradation.test.ts`
Expected: PASS (6 Tests).

- [ ] **Step 5: Stop useTimeline from discarding the graph error**

In `src/renderer/hooks/useTimeline.ts` liest `refresh` bislang `phaseResult?.rows ?? []` und
verwirft `phaseResult.error`. Direkt nach dem `phase_chain`-Query einfuegen:

```typescript
      const phaseResult = await api().graph.query({ template: 'phase_chain' })
      if (phaseResult?.error) {
        setState(prev => ({ ...prev, loading: false, error: String(phaseResult.error) }))
        return
      }
      const phases = parsePhases(phaseResult?.rows ?? [])
```

Der `error`-State existiert bereits in `useTimeline` und wird nur nie gesetzt.

- [ ] **Step 6: Verify suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: 1432 Tests gruen (1426 + 6), Typecheck sauber.

- [ ] **Step 7: Verify in the running app**

```bash
npm run build
rm -rf /tmp/keel-verify && mkdir -p /tmp/keel-verify
./node_modules/.bin/electron . --user-data-dir=/tmp/keel-verify
```

Im Projektfenster muss die StatusBar bei laufendem Graph **keinen** Warnhinweis zeigen. Zum
Gegentest den Graph absichtlich brechen (`--user-data-dir` auf einen schreibgeschuetzten Pfad
setzen, z.B. `/tmp/keel-verify-ro` mit `chmod 500`): Der Hinweis
`⚠ 2 Subsysteme degradiert: graph, kanban` muss erscheinen, mit Grund im Tooltip.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/StatusBar.tsx src/renderer/hooks/useTimeline.ts \
        tests/status-bar-degradation.test.ts
git commit -m "feat(ui): surface degraded subsystems in the status bar"
```

---

## Task 6: Kickoff-Pfad Ende-zu-Ende (6d)

**Loest den schaerfsten Teil von Befund 2:** `project:kickoff` meldete `{ok:true, phaseUids:[]}`,
obwohl die Phasenkette nie entstand.

**Files:**
- Create: `src/main/project/kickoff.ts`
- Modify: `src/main/ipc-handlers.ts:613-733` (PHASE_DEFS, GRAPH_INIT_PROJECT, PROJECT_KICKOFF)
- Test: `tests/project/kickoff-e2e.test.ts`

**Interfaces:**
- Consumes: `GraphWriter` (`src/main/graph/writer`), `openGraphDb` (Task 0), `subsystemError` (Task 1).
- Produces: `PHASE_DEFS`, `initProjectPhases(writer, projectDir): { ok: true; phaseUids: string[] }`, `runKickoff(deps, payload): Promise<KickoffResult>`. `ipc-handlers.ts` delegiert an beide.

**Designhinweis:** Der Kern wandert in ein elektron-freies Modul mit injizierten Abhaengigkeiten
(`writer`, `createProject`, `gitInit`, `github`). Damit laesst sich der komplette Pfad — Projekt
anlegen, git init, acht Phasen mit Kette — gegen eine echte SQLite-DB im tmp-Verzeichnis fahren,
ohne Electron und ohne Fenster. Genau das forderte 6d.

- [ ] **Step 1: Write the failing test**

Datei `tests/project/kickoff-e2e.test.ts`:

```typescript
/**
 * tests/project/kickoff-e2e.test.ts — kompletter Kickoff-Pfad gegen eine echte Graph-DB.
 *
 * Befund 2 (verifiziert 2026-08-06): project:kickoff lieferte {ok:true, phaseUids:[]},
 * wenn der GraphWriter fehlte — Erfolgsmeldung fuer einen halb ausgefuehrten Vorgang.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphWriter } from '../../src/main/graph/writer'
import { PHASE_DEFS, initProjectPhases, runKickoff } from '../../src/main/project/kickoff'

let dir: string
let db: Database.Database
let writer: GraphWriter

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'keel-kickoff-'))
  db = openGraphDb({ path: ':memory:' })
  writer = new GraphWriter(db)
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('PHASE_DEFS', () => {
  it('defines the eight phases of the Phasenkette (CK-PROC-001)', () => {
    expect(PHASE_DEFS.map(p => p.name)).toEqual([
      'ideation', 'requirements', 'architecture', 'development',
      'testing', 'fixing', 'audit', 'release-management',
    ])
  })

  it('numbers positions 1..8', () => {
    expect(PHASE_DEFS.map(p => p.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})

describe('initProjectPhases', () => {
  it('writes eight phase nodes', () => {
    const result = initProjectPhases(writer, dir)

    expect(result.ok).toBe(true)
    expect(result.phaseUids).toHaveLength(8)
  })

  it('links the phases into a chain of seven naechste_phase edges', () => {
    const { phaseUids } = initProjectPhases(writer, dir)

    const edges = db.prepare(
      `SELECT src, dst FROM edge WHERE type = 'naechste_phase' ORDER BY rowid`,
    ).all() as Array<{ src: string; dst: string }>

    expect(edges).toHaveLength(7)
    expect(edges[0].src).toBe(phaseUids[0])
    expect(edges[0].dst).toBe(phaseUids[1])
    expect(edges[6].dst).toBe(phaseUids[7])
  })

  it('is idempotent — a second run does not duplicate phase nodes', () => {
    initProjectPhases(writer, dir)
    initProjectPhases(writer, dir)

    const count = db.prepare(`SELECT COUNT(*) AS n FROM node WHERE kind = 'phase'`).get() as { n: number }
    expect(count.n).toBe(8)
  })

  it('marks every phase as ausstehend', () => {
    initProjectPhases(writer, dir)

    const rows = db.prepare(`SELECT frontmatter FROM node WHERE kind = 'phase'`).all() as Array<{ frontmatter: string }>
    for (const row of rows) {
      expect(JSON.parse(row.frontmatter).phase_status).toBe('ausstehend')
    }
  })
})

describe('runKickoff — happy path', () => {
  function deps() {
    return {
      writer,
      createProject: vi.fn((name: string, rootPath: string) => ({
        id: 'proj-1', name, rootPath, createdAt: '2026-08-06T00:00:00.000Z', workspaceIds: [],
      })),
      gitInit: vi.fn().mockResolvedValue(undefined),
      createRepo: vi.fn(),
      linkRepo: vi.fn(),
    }
  }

  it('creates the project, runs git init and writes the phase chain', async () => {
    const d = deps()

    const result = await runKickoff(d, {
      name: 'Probe', rootPath: dir, initGit: true, github: { action: 'skip' },
    })

    expect(result.ok).toBe(true)
    expect(result.project!.name).toBe('Probe')
    expect(result.phaseUids).toHaveLength(8)
    expect(d.gitInit).toHaveBeenCalledWith(dir)
  })

  it('skips git init when not requested', async () => {
    const d = deps()

    await runKickoff(d, { name: 'Probe', rootPath: dir, initGit: false, github: { action: 'skip' } })

    expect(d.gitInit).not.toHaveBeenCalled()
  })

  it('creates a GitHub repo when requested', async () => {
    const d = deps()
    d.createRepo = vi.fn().mockResolvedValue({ ok: true, url: 'https://github.com/x/y' })

    const result = await runKickoff(d, {
      name: 'Probe', rootPath: dir, initGit: false,
      github: { action: 'create', name: 'y', desc: '', visibility: 'private' },
    })

    expect(d.createRepo).toHaveBeenCalledWith('y', '', 'private', dir)
    expect(result.githubResult).toEqual({ ok: true, url: 'https://github.com/x/y' })
  })
})

describe('runKickoff — the graph is unavailable (Befund 2)', () => {
  function depsWithoutWriter() {
    return {
      writer: null,
      createProject: vi.fn((name: string, rootPath: string) => ({
        id: 'proj-1', name, rootPath, createdAt: '2026-08-06T00:00:00.000Z', workspaceIds: [],
      })),
      gitInit: vi.fn().mockResolvedValue(undefined),
      createRepo: vi.fn(),
      linkRepo: vi.fn(),
    }
  }

  it('does NOT report ok when the phase chain could not be written', async () => {
    const result = await runKickoff(depsWithoutWriter(), {
      name: 'Probe', rootPath: dir, initGit: false, github: { action: 'skip' },
    })

    expect(result.ok).toBe(false)
  })

  it('names the graph subsystem as the cause', async () => {
    const result = await runKickoff(depsWithoutWriter(), {
      name: 'Probe', rootPath: dir, initGit: false, github: { action: 'skip' },
    })

    expect(result.error!.subsystem).toBe('graph')
  })

  it('still reports the project that was created, so the UI can show partial progress', async () => {
    const result = await runKickoff(depsWithoutWriter(), {
      name: 'Probe', rootPath: dir, initGit: false, github: { action: 'skip' },
    })

    expect(result.project!.name).toBe('Probe')
    expect(result.phaseUids).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/project/kickoff-e2e.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/main/project/kickoff"`.

- [ ] **Step 3: Write minimal implementation**

Datei `src/main/project/kickoff.ts`:

```typescript
/**
 * kickoff.ts — electron-free core of the project kickoff path.
 *
 * Extracted from ipc-handlers so the whole path (project record → git init → phase
 * chain → optional GitHub) can be tested against a real graph DB without a window.
 *
 * CK-UI-020, CK-PROC-001
 */

import { join } from 'node:path'
import type { GraphWriter } from '../graph/writer'
import { subsystemError, type SubsystemError } from '../../shared/service-status'

/** The eight phases of the Phasenkette (M4). */
export const PHASE_DEFS = [
  { name: 'ideation', position: 1 },
  { name: 'requirements', position: 2 },
  { name: 'architecture', position: 3 },
  { name: 'development', position: 4 },
  { name: 'testing', position: 5 },
  { name: 'fixing', position: 6 },
  { name: 'audit', position: 7 },
  { name: 'release-management', position: 8 },
] as const

/**
 * Writes the eight phase nodes and links them with naechste_phase edges.
 * Idempotent — upsertNode keys on path, so a second run updates instead of duplicating.
 */
export function initProjectPhases(
  writer: GraphWriter,
  projectDir: string,
): { ok: true; phaseUids: string[] } {
  const phaseUids: string[] = []
  for (const p of PHASE_DEFS) {
    const { uid } = writer.upsertNode({
      kind: 'phase',
      title: p.name,
      path: join(projectDir, '.cipher-keel', 'phases', p.name),
      frontmatter: { name: p.name, position: p.position, phase_status: 'ausstehend' },
    })
    phaseUids.push(uid)
  }
  for (let i = 0; i < phaseUids.length - 1; i++) {
    writer.linkEdge({
      src: phaseUids[i],
      dst: phaseUids[i + 1],
      type: 'naechste_phase',
      source: 'inferred',
    })
  }
  return { ok: true, phaseUids }
}

export interface ProjectRecord {
  id: string
  name: string
  rootPath: string
  createdAt: string
  workspaceIds: string[]
}

export interface KickoffDeps {
  /** null when the graph subsystem is unavailable. */
  writer: GraphWriter | null
  createProject: (name: string, rootPath: string) => ProjectRecord
  gitInit: (rootPath: string) => Promise<void>
  createRepo: (
    name: string, desc: string, visibility: 'public' | 'private', projectDir: string,
  ) => Promise<unknown>
  linkRepo: (ownerRepo: string, projectDir: string) => Promise<unknown>
}

export interface KickoffPayload {
  name: string
  rootPath: string
  initGit?: boolean
  github?: {
    action: 'create' | 'link' | 'skip'
    name?: string
    desc?: string
    visibility?: 'public' | 'private'
    ownerRepo?: string
  }
}

export interface KickoffResult {
  ok: boolean
  project: ProjectRecord | null
  phaseUids: string[]
  githubResult: unknown
  error: SubsystemError | { code: 'KICKOFF_FAILED'; subsystem: null; message: string } | null
}

/**
 * Runs the full kickoff. Never reports ok when the phase chain could not be written —
 * a project without its Phasenkette is not a completed kickoff.
 */
export async function runKickoff(
  deps: KickoffDeps,
  payload: KickoffPayload,
): Promise<KickoffResult> {
  let project: ProjectRecord | null = null
  try {
    project = deps.createProject(payload.name, payload.rootPath)

    if (payload.initGit) {
      try {
        await deps.gitInit(payload.rootPath)
      } catch (err) {
        console.warn('[kickoff] git init failed:', err)
      }
    }

    if (!deps.writer) {
      return {
        ok: false,
        project,
        phaseUids: [],
        githubResult: null,
        error: subsystemError('graph', 'Phasenkette not written — graph subsystem unavailable'),
      }
    }

    const { phaseUids } = initProjectPhases(deps.writer, payload.rootPath)

    let githubResult: unknown = null
    const gh = payload.github
    if (gh && gh.action !== 'skip') {
      if (gh.action === 'create') {
        githubResult = await deps.createRepo(
          gh.name ?? payload.name,
          gh.desc ?? '',
          gh.visibility ?? 'private',
          payload.rootPath,
        )
      } else if (gh.action === 'link' && gh.ownerRepo) {
        githubResult = await deps.linkRepo(gh.ownerRepo, payload.rootPath)
      }
    }

    return { ok: true, project, phaseUids, githubResult, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      project,
      phaseUids: [],
      githubResult: null,
      error: { code: 'KICKOFF_FAILED', subsystem: null, message },
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/project/kickoff-e2e.test.ts`
Expected: PASS (12 Tests).

- [ ] **Step 5: Delegate from ipc-handlers**

In `src/main/ipc-handlers.ts`:

1. Den lokalen `PHASE_DEFS`-Block (die `const PHASE_DEFS = [...] as const`-Deklaration im
   Kickoff-Abschnitt) loeschen. `PHASE_DEFS` wird nach den Schritten 2 und 3 in dieser Datei
   nirgends mehr gebraucht — beide Verwender sind dann durch `kickoff.ts` ersetzt. Deshalb **nicht**
   mit importieren, nur die beiden Funktionen:

```typescript
import { initProjectPhases, runKickoff } from './project/kickoff'
import type { KickoffPayload } from './project/kickoff'
```

2. `GRAPH_INIT_PROJECT` auf den gemeinsamen Kern umstellen:

```typescript
  ipcMain.handle(GRAPH_INIT_PROJECT, async (_event, projectDir: string) => {
    if (!services.graphWriter) {
      return { ok: false, error: subsystemError('graph', 'Graph not initialized') }
    }
    try {
      return initProjectPhases(services.graphWriter, projectDir)
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
```

3. `PROJECT_KICKOFF` auf `runKickoff` reduzieren — der ganze bisherige Rumpf entfaellt:

```typescript
  ipcMain.handle(PROJECT_KICKOFF, async (_event, payload: KickoffPayload) => {
    return runKickoff(
      {
        writer: services.graphWriter,
        createProject: (name, rootPath) => projectManager.createProject(name, rootPath),
        gitInit: async (rootPath) => { await execFileAsync('git', ['init', rootPath]) },
        createRepo,
        linkRepo,
      },
      payload,
    )
  })
```

Der `KickoffPayload`-Typ kommt aus dem `import type` in Schritt 1.

- [ ] **Step 6: Verify suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: 1444 Tests gruen (1432 + 12), Typecheck sauber.

- [ ] **Step 7: Verify the whole path in the running app**

```bash
npm run build
rm -rf /tmp/keel-verify /tmp/keel-kickoff && mkdir -p /tmp/keel-verify /tmp/keel-kickoff
./node_modules/.bin/electron . --user-data-dir=/tmp/keel-verify
```

Im Projektfenster den Kickoff-Wizard durchlaufen (Name frei, Pfad `/tmp/keel-kickoff`, git init an,
GitHub ueberspringen). Expected: Das Projekt erscheint in der Liste, `ProjectView` zeigt **acht**
Phasen, `/tmp/keel-verify/graph.db` enthaelt sie. Gegenprobe auf der Kommandozeile:

```bash
sqlite3 /tmp/keel-verify/graph.db "SELECT COUNT(*) FROM node WHERE kind='phase';"
```

Expected: `8`. Das ist die Abnahme fuer 6d.

- [ ] **Step 8: Commit**

```bash
git add src/main/project/kickoff.ts src/main/ipc-handlers.ts tests/project/kickoff-e2e.test.ts
git commit -m "feat(kickoff): extract testable kickoff core, stop reporting ok without phases"
```

---

## Task 7: Projekt-Kontext beim Session-Start (6e)

`src/renderer/index.tsx:40-51` erzeugt Sessions als `session-${Date.now()}` — ohne Projektbezug,
ohne `cwd`. Die Session landet dadurch im Arbeitsverzeichnis des Electron-Prozesses.

**Files:**
- Create: `src/main/session/session-context.ts`
- Modify: `src/main/ipc-handlers.ts` (SESSION_CREATE), `src/renderer/index.tsx:40-51`
- Test: `tests/session/session-context.test.ts`

**Interfaces:**
- Consumes: `ProjectRecord` (Task 6), `GraphWriter`.
- Produces: `deriveSessionName(projectName, entityId, seed)`, `buildSessionContext(project, entityId, seed)`, `writeSessionNode(writer, ctx)`. Task 8 nutzt `buildSessionContext` fuer den Preset-Start.

- [ ] **Step 1: Write the failing test**

Datei `tests/session/session-context.test.ts`:

```typescript
/**
 * tests/session/session-context.test.ts — Session an das aktive Projekt binden.
 *
 * Vorher: index.tsx erzeugte `session-${Date.now()}` ohne cwd und ohne Projektbezug.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../../src/main/graph/db'
import { GraphWriter } from '../../src/main/graph/writer'
import {
  deriveSessionName,
  buildSessionContext,
  writeSessionNode,
} from '../../src/main/session/session-context'

const project = {
  id: 'proj-1',
  name: 'Cipher Keel',
  rootPath: '/tmp/keel',
  createdAt: '2026-08-06T00:00:00.000Z',
  workspaceIds: [],
}

describe('deriveSessionName', () => {
  it('joins a slugified project name, the entity and the seed', () => {
    expect(deriveSessionName('Cipher Keel', 'architect', 'a1b2')).toBe('keel-cipher-keel-architect-a1b2')
  })

  it('lowercases and replaces spaces with hyphens', () => {
    expect(deriveSessionName('My Project', 'workshop', 'zz99')).toBe('keel-my-project-workshop-zz99')
  })

  it('strips characters tmux would choke on', () => {
    expect(deriveSessionName('a.b:c$d', 'architect', 'x1')).toBe('keel-abcd-architect-x1')
  })

  it('collapses repeated separators', () => {
    expect(deriveSessionName('a   b', 'architect', 'x1')).toBe('keel-a-b-architect-x1')
  })

  it('falls back to "projekt" when the name slugifies to nothing', () => {
    expect(deriveSessionName('...', 'architect', 'x1')).toBe('keel-projekt-architect-x1')
  })
})

describe('buildSessionContext', () => {
  it('uses the project root as cwd', () => {
    const ctx = buildSessionContext(project, 'architect', 'a1b2')

    expect(ctx.cwd).toBe('/tmp/keel')
  })

  it('carries the project id for the graph node', () => {
    const ctx = buildSessionContext(project, 'architect', 'a1b2')

    expect(ctx.projectId).toBe('proj-1')
    expect(ctx.entityId).toBe('architect')
  })

  it('produces the derived name', () => {
    const ctx = buildSessionContext(project, 'architect', 'a1b2')

    expect(ctx.name).toBe('keel-cipher-keel-architect-a1b2')
  })
})

describe('writeSessionNode', () => {
  let dir: string
  let db: Database.Database
  let writer: GraphWriter

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'keel-session-'))
    db = openGraphDb({ path: ':memory:' })
    writer = new GraphWriter(db)
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes a session node into the graph', () => {
    const ctx = buildSessionContext({ ...project, rootPath: dir }, 'architect', 'a1b2')

    const { uid } = writeSessionNode(writer, ctx)

    const row = db.prepare(`SELECT kind, title FROM node WHERE uid = ?`).get(uid) as {
      kind: string
      title: string
    }
    expect(row.kind).toBe('session')
    expect(row.title).toBe(ctx.name)
  })

  it('records project, entity and cwd in the frontmatter', () => {
    const ctx = buildSessionContext({ ...project, rootPath: dir }, 'architect', 'a1b2')

    const { uid } = writeSessionNode(writer, ctx)

    const row = db.prepare(`SELECT frontmatter FROM node WHERE uid = ?`).get(uid) as {
      frontmatter: string
    }
    const fm = JSON.parse(row.frontmatter)
    expect(fm.project_id).toBe('proj-1')
    expect(fm.entity).toBe('architect')
    expect(fm.cwd).toBe(dir)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/session/session-context.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/main/session/session-context"`.

- [ ] **Step 3: Write minimal implementation**

Datei `src/main/session/session-context.ts`:

```typescript
/**
 * session-context.ts — binds a tmux session to the active project.
 *
 * Sessions used to be created as `session-${Date.now()}` with no cwd and no project
 * reference, so they started in the Electron process working directory and were
 * invisible to the graph.
 *
 * CK-INF-020
 */

import { join } from 'node:path'
import type { GraphWriter } from '../graph/writer'
import type { ProjectRecord } from '../project/kickoff'

/** Prefix distinguishing cipher-keel sessions from other tmux sessions on the box. */
const SESSION_PREFIX = 'keel'

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return slug.length > 0 ? slug : 'projekt'
}

/** Builds a tmux-safe session name from project, entity and a short random seed. */
export function deriveSessionName(projectName: string, entityId: string, seed: string): string {
  return `${SESSION_PREFIX}-${slugify(projectName)}-${slugify(entityId)}-${seed}`
}

export interface SessionContext {
  name: string
  cwd: string
  projectId: string
  projectName: string
  entityId: string
}

export function buildSessionContext(
  project: ProjectRecord,
  entityId: string,
  seed: string,
): SessionContext {
  return {
    name: deriveSessionName(project.name, entityId, seed),
    cwd: project.rootPath,
    projectId: project.id,
    projectName: project.name,
    entityId,
  }
}

/** Records the session as a graph node so it shows up in timeline and queries. */
export function writeSessionNode(
  writer: GraphWriter,
  ctx: SessionContext,
): { uid: string } {
  return writer.upsertNode({
    kind: 'session',
    title: ctx.name,
    path: join(ctx.cwd, '.cipher-keel', 'sessions', ctx.name),
    frontmatter: {
      project_id: ctx.projectId,
      entity: ctx.entityId,
      cwd: ctx.cwd,
    },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/session/session-context.test.ts`
Expected: PASS (10 Tests).

- [ ] **Step 5: Bind session creation to the project in ipc-handlers**

In `src/main/ipc-handlers.ts` den `SESSION_CREATE`-Handler erweitern. Er akzeptiert weiterhin einen
expliziten `name`, ergaenzt aber Projektbindung und Graph-Knoten, wenn ein Projekt aktiv ist.
Importe ergaenzen:

```typescript
import { buildSessionContext, writeSessionNode } from './session/session-context'
```

Handler:

```typescript
  ipcMain.handle(SESSION_CREATE, async (_event, opts: {
    name?: string
    entityId?: string
    cwd?: string
    command?: string
    env?: Record<string, string>
    width?: number
    height?: number
  }) => {
    try {
      const project = projectManager.getCurrentProject()
      const entityId = opts.entityId ?? 'workshop'

      // Derive name and cwd from the active project unless the caller pinned them.
      let name = opts.name
      let cwd = opts.cwd
      let ctx = null
      if (project) {
        const seed = Math.random().toString(36).slice(2, 6)
        ctx = buildSessionContext(project, entityId, seed)
        name = name ?? ctx.name
        cwd = cwd ?? ctx.cwd
      }
      if (!name) {
        return { id: null, name: null, error: 'No session name and no active project' }
      }

      if (!services.tmux.isConnected()) {
        await services.tmux.connect()
      }
      const sessionId = await services.tmux.createSession(name, { ...opts, cwd })
      services.tmux.watchSession(name, name)

      if (ctx && services.graphWriter) {
        try {
          writeSessionNode(services.graphWriter, { ...ctx, name })
        } catch (err) {
          console.warn('[ipc] session node write failed:', err)
        }
      }

      return { id: sessionId, name, error: null }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { id: null, name: null, error: msg }
    }
  })
```

- [ ] **Step 6: Use the returned name in the renderer**

In `src/renderer/index.tsx` `handleStartSession` umstellen — der Name kommt jetzt aus dem Main-Prozess
statt aus `Date.now()`:

```typescript
  const handleStartSession = useCallback(async (_slotIndex: number, entityId = 'workshop') => {
    const result = await api().invoke('session:create', { entityId }) as {
      id: string | null
      name: string | null
      error: string | null
    }
    if (result?.id && result.name) {
      setSlots((prev) => [
        ...prev,
        { type: 'session', sessionId: result.name!, sessionName: result.name!, status: 'active' }
      ])
    } else {
      console.error('[renderer] session create failed:', result?.error)
    }
  }, [])
```

- [ ] **Step 7: Verify suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: 1454 Tests gruen (1444 + 10), Typecheck sauber.

- [ ] **Step 8: Commit**

```bash
git add src/main/session/session-context.ts src/main/ipc-handlers.ts src/renderer/index.tsx \
        tests/session/session-context.test.ts
git commit -m "feat(session): bind sessions to the active project and record them in the graph"
```

---

## Task 8: Entitaets-Auswahl beim Session-Start (6f)

`assembleEntityClaudeMd` (`src/main/session/assemble-entity.ts`) hat aktuell **keinen einzigen
Produktions-Aufrufer** — verifiziert per Grep ueber `src/`. Diese Task schliesst es an.

**Der 0.1-Schnitt gibt vier Rollen vor** (M6 Abschnitt 3.1 / BG-1): Systems Engineer, Architect,
Cyber Factory, Workshop. Vier Presets sind korrekt, nicht unvollstaendig.

**Files:**
- Create: `src/shared/preset-catalog.ts`
- Modify: `src/renderer/components/LauncherCell.tsx`, `src/renderer/components/SessionGrid.tsx` (Durchreichen des Entity-Arguments), `src/main/ipc-handlers.ts`, `src/shared/ipc-channels.ts`
- Test: `tests/preset-catalog.test.ts`

**Interfaces:**
- Consumes: `SESSION_CREATE` mit `entityId` (Task 7).
- Produces: `PRESET_CATALOG`, `PresetChoice`, `isKnownPresetId(id)`, Kanal `PRESET_LIST`.

- [ ] **Step 1: Write the failing test**

Datei `tests/preset-catalog.test.ts`:

```typescript
/**
 * tests/preset-catalog.test.ts — die vier 0.1-Presets als UI-Metadaten.
 *
 * M6 Abschnitt 3.1 (BG-1) legt fuer Release 0.1 genau vier Rollen fest.
 * M5 kennt elf — die uebrigen sieben sind post-0.1 und hier bewusst nicht enthalten.
 */
import { describe, it, expect } from 'vitest'
import { PRESET_CATALOG, isKnownPresetId } from '../src/shared/preset-catalog'

describe('PRESET_CATALOG', () => {
  it('offers exactly the four ratified 0.1 roles', () => {
    expect(PRESET_CATALOG.map(p => p.id)).toEqual([
      'systems-engineer', 'architect', 'cyber-factory', 'workshop',
    ])
  })

  it('gives every preset a non-empty label and description', () => {
    for (const preset of PRESET_CATALOG) {
      expect(preset.label.length).toBeGreaterThan(0)
      expect(preset.description.length).toBeGreaterThan(0)
    }
  })

  it('has unique ids', () => {
    expect(new Set(PRESET_CATALOG.map(p => p.id)).size).toBe(PRESET_CATALOG.length)
  })

  it('marks exactly one preset as the default', () => {
    expect(PRESET_CATALOG.filter(p => p.isDefault)).toHaveLength(1)
  })

  it('defaults to workshop', () => {
    expect(PRESET_CATALOG.find(p => p.isDefault)!.id).toBe('workshop')
  })

  it('does not offer any post-0.1 role', () => {
    const postRelease = ['ideation', 'refinement', 'testing', 'audit', 'release-manager', 'companion', 'debugger']
    for (const id of postRelease) {
      expect(PRESET_CATALOG.some(p => p.id === id)).toBe(false)
    }
  })
})

describe('isKnownPresetId', () => {
  it('accepts a catalog id', () => {
    expect(isKnownPresetId('architect')).toBe(true)
  })

  it('rejects an unknown id', () => {
    expect(isKnownPresetId('nope')).toBe(false)
  })

  it('rejects a post-0.1 role', () => {
    expect(isKnownPresetId('debugger')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/preset-catalog.test.ts`
Expected: FAIL — `Failed to resolve import "../src/shared/preset-catalog"`.

- [ ] **Step 3: Write minimal implementation**

Datei `src/shared/preset-catalog.ts`:

```typescript
/**
 * preset-catalog.ts — the presets offered in the session launcher.
 *
 * Release 0.1 ships four of the eleven roles M5 describes. That is the ratified cut
 * (M6 section 3.1 / BG-1), not a backlog: Ideation, Refinement, Testing Assistant,
 * Audit, Release Manager, Companion and Debugger are post-0.1.
 *
 * CK-ENT-001
 */

export interface PresetChoice {
  /** Stable id — also the entityId passed to session:create. */
  id: string
  /** Short label for the launcher. */
  label: string
  /** One line explaining what the role is for. */
  description: string
  /** Exactly one entry is the default selection. */
  isDefault?: boolean
}

export const PRESET_CATALOG: readonly PresetChoice[] = [
  {
    id: 'systems-engineer',
    label: 'Systems Engineer',
    description: 'Anforderungen, Gate-Urteile und Phasenfortschritt',
  },
  {
    id: 'architect',
    label: 'Architect',
    description: 'Architekturentscheidungen und Schnittstellen',
  },
  {
    id: 'cyber-factory',
    label: 'Cyber Factory',
    description: 'Wellenplanung und Worker-Orchestrierung',
  },
  {
    id: 'workshop',
    label: 'Workshop',
    description: 'Freies Arbeiten am Projekt',
    isDefault: true,
  },
] as const

export function isKnownPresetId(id: string): boolean {
  return PRESET_CATALOG.some(p => p.id === id)
}

export function defaultPresetId(): string {
  return PRESET_CATALOG.find(p => p.isDefault)?.id ?? PRESET_CATALOG[0].id
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/preset-catalog.test.ts`
Expected: PASS (9 Tests).

- [ ] **Step 5: Add the preset picker to LauncherCell**

`src/renderer/components/LauncherCell.tsx` komplett ersetzen — statt eines direkten Starts zeigt
der Klick jetzt die vier Presets:

```tsx
/**
 * LauncherCell — empty grid slot with preset selection.
 *
 * Clicking "+" opens the preset picker; picking a preset starts the session with that
 * entity. Release 0.1 offers four roles (M6 3.1 / BG-1).
 *
 * Ported from cipher-mux 0.9.x (CK-INF-023).
 */

import { useState, useCallback } from 'react'
import { PRESET_CATALOG } from '../../shared/preset-catalog'

interface LauncherCellProps {
  slotIndex: number
  onStart: (slotIndex: number, entityId: string) => void
}

export function LauncherCell({ slotIndex, onStart }: LauncherCellProps) {
  const [picking, setPicking] = useState(false)
  const [starting, setStarting] = useState(false)

  const handleOpen = useCallback(() => {
    if (starting) return
    setPicking(true)
  }, [starting])

  const handlePick = useCallback((entityId: string) => {
    setPicking(false)
    setStarting(true)
    onStart(slotIndex, entityId)
    setTimeout(() => setStarting(false), 5000)
  }, [slotIndex, onStart])

  if (picking) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center',
        height: '100%', padding: '12px', border: '1px solid #333', borderRadius: '4px',
        background: '#0a0a0a',
      }}>
        {PRESET_CATALOG.map(preset => (
          <button
            key={preset.id}
            onClick={() => handlePick(preset.id)}
            title={preset.description}
            style={{
              padding: '8px 10px', textAlign: 'left', cursor: 'pointer',
              background: '#141414', color: '#ddd',
              border: `1px solid ${preset.isDefault ? '#555' : '#2a2a2a'}`,
              borderRadius: '3px', fontSize: '13px',
            }}
          >
            {preset.label}
          </button>
        ))}
        <button
          onClick={() => setPicking(false)}
          style={{
            padding: '4px', cursor: 'pointer', background: 'transparent',
            color: '#666', border: 'none', fontSize: '12px',
          }}
        >
          Abbrechen
        </button>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
      border: '1px solid #333', borderRadius: '4px', background: '#0a0a0a',
      cursor: starting ? 'wait' : 'pointer',
    }}
      onClick={handleOpen}
    >
      <div style={{
        width: '48px', height: '48px', borderRadius: '50%', border: '2px solid #444',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '24px', color: starting ? '#666' : '#888', transition: 'all 0.15s ease',
      }}>
        {starting ? '...' : '+'}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Thread entityId through SessionGrid**

`src/renderer/components/SessionGrid.tsx` reicht `onStartSession` an `LauncherCell` durch. Die
Prop-Signatur auf `(slotIndex: number, entityId: string) => void` anheben und unveraendert
weiterreichen. In `src/renderer/index.tsx` nimmt `handleStartSession` das zweite Argument bereits
entgegen (Task 7, Step 6) — dort ist nichts weiter zu tun.

- [ ] **Step 7: Reject unknown preset ids in main**

In `src/main/ipc-handlers.ts`, im `SESSION_CREATE`-Handler, den Entity-Wert validieren. Import:

```typescript
import { isKnownPresetId, defaultPresetId } from '../shared/preset-catalog'
```

Und die Zeile `const entityId = opts.entityId ?? 'workshop'` ersetzen:

```typescript
      const entityId = opts.entityId && isKnownPresetId(opts.entityId)
        ? opts.entityId
        : defaultPresetId()
```

- [ ] **Step 8: Verify suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: 1463 Tests gruen (1454 + 9), Typecheck sauber.

- [ ] **Step 9: Verify in the running app — the Phase 6 acceptance run**

```bash
npm run build
rm -rf /tmp/keel-verify /tmp/keel-kickoff && mkdir -p /tmp/keel-verify /tmp/keel-kickoff
./node_modules/.bin/electron . --user-data-dir=/tmp/keel-verify
```

Der komplette Abnahmedurchlauf fuer Phase 6:

1. Kickoff-Wizard mit Pfad `/tmp/keel-kickoff` durchlaufen → Projekt erscheint, acht Phasen sichtbar
2. StatusBar zeigt keinen Degradations-Hinweis
3. Grid-Fenster oeffnen, im Launcher „Architect" waehlen
4. Session laeuft im Projektverzeichnis:
   ```bash
   tmux list-sessions -F '#{session_name} #{pane_current_path}' | grep keel-
   ```
   Expected: eine Zeile `keel-<projekt>-architect-<seed> /tmp/keel-kickoff`
5. Session-Knoten liegt im Graph:
   ```bash
   sqlite3 /tmp/keel-verify/graph.db "SELECT title FROM node WHERE kind='session';"
   ```
   Expected: derselbe Session-Name
6. Ereignis erreicht beide Fenster: im Grid eine Notiz anlegen — Projekt- und Grid-Fenster
   reagieren beide (Befund 3 behoben)

- [ ] **Step 10: Commit**

```bash
git add src/shared/preset-catalog.ts src/renderer/components/LauncherCell.tsx \
        src/renderer/components/SessionGrid.tsx src/main/ipc-handlers.ts \
        src/shared/ipc-channels.ts tests/preset-catalog.test.ts
git commit -m "feat(launcher): offer the four 0.1 presets when starting a session"
```

---

---

## Task 9: Grid-Zugang und Projektaktivierung (6g — nachgetragen)

**Warum nachgetragen:** Nach Task 8 hat der Controller verifiziert, dass **nichts** in
`src/renderer/` oder `src/preload.ts` jemals `window:open-grid` aufruft — die einzige Fundstelle
ist ein Kommentar in `project-window.tsx:5`. Es gibt auch kein App-Menu, keinen Accelerator und
keinen `globalShortcut` in `src/main/`. Der Handler existiert und funktioniert, aber kein
Nutzerpfad erreicht ihn: **das Grid-Fenster ist ueber die Oberflaeche unerreichbar.**

Das Phasenziel nennt ausdruecklich „oeffnet das Grid, startet eine Session", und Abnahmekriterium 3
verlangt genau das. Ohne diese Task ist es nur per IPC-Injektion erfuellbar — so hat der
Task-8-Implementer es auch tun muessen. Die Luecke war ein Planungsfehler, kein Baufehler.

Zweitens: `ProjectManager.createProject` setzt `activeId` nie (`project-manager.ts:38-49`), und
`handleWizardComplete` laedt nur die Liste neu. Ein frisch angelegtes Projekt ist deshalb nicht
aktiv — `session:create` scheitert danach mit „No session name and no active project", bis der
Nutzer das Projekt in der Liste anklickt.

**Files:**
- Modify: `src/main/ipc-handlers.ts` (PROJECT_KICKOFF-Handler), `src/renderer/windows/project-window.tsx`
- Test: `tests/project/kickoff-activation.test.ts`

**Interfaces:**
- Consumes: `runKickoff` (Task 6), `projectManager.switchProject` / `getCurrentProject`, Kanal `WINDOW_OPEN_GRID`.
- Produces: `activateAfterKickoff(switchProject, result): boolean` als reine, testbare Funktion.

**Designhinweis:** Die Aktivierung gehoert in den Main-Prozess, nicht in den Renderer — dann gilt
sie fuer jeden Aufrufer von `project:kickoff`, nicht nur fuer den Wizard. `runKickoff` selbst
bleibt unangetastet: es ist electron-frei und kennt keinen `ProjectManager`. Die Aktivierung
haengt sich an den IPC-Handler.

- [ ] **Step 1: Write the failing test**

Datei `tests/project/kickoff-activation.test.ts`:

```typescript
/**
 * tests/project/kickoff-activation.test.ts — ein frisch angelegtes Projekt wird aktiv.
 *
 * Vorher: createProject setzte activeId nie, also scheiterte session:create direkt
 * nach dem Kickoff mit "No session name and no active project".
 */
import { describe, it, expect, vi } from 'vitest'
import { activateAfterKickoff } from '../../src/main/project/kickoff'

const project = {
  id: 'proj-1', name: 'Probe', rootPath: '/tmp/probe',
  createdAt: '2026-08-06T00:00:00.000Z', workspaceIds: [],
}

describe('activateAfterKickoff', () => {
  it('activates the project of a successful kickoff', () => {
    const switchProject = vi.fn()

    const activated = activateAfterKickoff(switchProject, {
      ok: true, project, phaseUids: [], githubResult: null, error: null,
    })

    expect(activated).toBe(true)
    expect(switchProject).toHaveBeenCalledWith('proj-1')
  })

  it('does not activate when the kickoff failed', () => {
    const switchProject = vi.fn()

    const activated = activateAfterKickoff(switchProject, {
      ok: false, project, phaseUids: [], githubResult: null,
      error: { code: 'SUBSYSTEM_UNAVAILABLE', subsystem: 'graph', message: 'x' },
    })

    expect(activated).toBe(false)
    expect(switchProject).not.toHaveBeenCalled()
  })

  it('does not activate when no project was created', () => {
    const switchProject = vi.fn()

    const activated = activateAfterKickoff(switchProject, {
      ok: true, project: null, phaseUids: [], githubResult: null, error: null,
    })

    expect(activated).toBe(false)
    expect(switchProject).not.toHaveBeenCalled()
  })

  it('does not let a switchProject failure break the kickoff', () => {
    const switchProject = vi.fn(() => { throw new Error('gone') })

    expect(() => activateAfterKickoff(switchProject, {
      ok: true, project, phaseUids: [], githubResult: null, error: null,
    })).not.toThrow()
  })

  it('reports false when activation threw', () => {
    const switchProject = vi.fn(() => { throw new Error('gone') })

    const activated = activateAfterKickoff(switchProject, {
      ok: true, project, phaseUids: [], githubResult: null, error: null,
    })

    expect(activated).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/project/kickoff-activation.test.ts`
Expected: FAIL — `activateAfterKickoff` wird nicht exportiert.

- [ ] **Step 3: Write minimal implementation**

In `src/main/project/kickoff.ts` ergaenzen (unterhalb von `runKickoff`):

```typescript
/**
 * Activates the freshly created project so the very next session:create finds it.
 * A failure here must never break an otherwise successful kickoff — the project
 * exists either way and the user can still select it from the list.
 */
export function activateAfterKickoff(
  switchProject: (projectId: string) => void,
  result: KickoffResult,
): boolean {
  if (!result.ok || !result.project) return false
  try {
    switchProject(result.project.id)
    return true
  } catch (err) {
    console.warn('[kickoff] activating the new project failed:', err)
    return false
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/project/kickoff-activation.test.ts`
Expected: PASS (5 Tests).

- [ ] **Step 5: Wire activation into the kickoff handler**

In `src/main/ipc-handlers.ts` den `PROJECT_KICKOFF`-Handler erweitern. Import ergaenzen
(`activateAfterKickoff` zum bestehenden `./project/kickoff`-Import hinzufuegen) und den Handler
auf das Ergebnis reagieren lassen:

```typescript
  ipcMain.handle(PROJECT_KICKOFF, async (_event, payload: KickoffPayload) => {
    const result = await runKickoff(
      {
        writer: services.graphWriter,
        createProject: (name, rootPath) => projectManager.createProject(name, rootPath),
        gitInit: async (rootPath) => { await execFileAsync('git', ['init', rootPath]) },
        createRepo,
        linkRepo,
      },
      payload,
    )
    activateAfterKickoff((id) => projectManager.switchProject(id), result)
    return result
  })
```

- [ ] **Step 6: Add the grid affordance to the project window**

In `src/renderer/windows/project-window.tsx`. Handler oberhalb des `if (loading)`-Blocks
ergaenzen:

```typescript
  const handleOpenGrid = useCallback(async () => {
    try {
      await api().invoke('window:open-grid', activeProjectId ?? undefined)
    } catch (err) {
      console.error('[project-window] window:open-grid failed:', err)
    }
  }, [activeProjectId])
```

Im Header-JSX rechts einen Button ergaenzen. Der bestehende Header endet mit
`<span style={styles.subtitle}>Projekte</span>`; direkt danach einfuegen:

```tsx
        {view === 'project' && (
          <button
            style={styles.gridBtn}
            onClick={handleOpenGrid}
            title="Grid-Fenster mit den Sessions dieses Projekts oeffnen"
          >
            Grid oeffnen
          </button>
        )}
```

Und in `styles` ergaenzen (Stil an `backBtn` anlehnen, das bereits existiert):

```typescript
  gridBtn: {
    marginLeft: 'auto' as const,
    padding: '4px 10px',
    background: '#1a1a1a',
    color: '#ddd',
    border: '1px solid #333',
    borderRadius: 3,
    cursor: 'pointer' as const,
    fontSize: 12,
  },
```

`marginLeft: 'auto'` schiebt den Button in dem `display: flex`-Header nach rechts.

- [ ] **Step 7: Verify suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: 1481 Tests gruen (1476 + 5), Typecheck sauber.

- [ ] **Step 8: Verify in the running app**

Der Beweis, der vorher fehlte: ein Nutzerpfad ohne IPC-Injektion. Per CDP das Klicken simulieren
statt `window:open-grid` direkt aufzurufen — ein `.click()` auf den Button geht durch dieselbe
Handlerkette wie eine echte Maus:

```bash
npm run build
pkill -f 'remote-debugging-port=9222'
rm -rf /tmp/keel-verify-t9 /tmp/keel-kickoff-t9 && mkdir -p /tmp/keel-verify-t9 /tmp/keel-kickoff-t9
./node_modules/.bin/electron . --remote-debugging-port=9222 --user-data-dir=/tmp/keel-verify-t9 > /tmp/keel-t9.log 2>&1 &
```

Dann: Kickoff auslösen, `project:get-current` pruefen (muss das neue Projekt liefern — vorher
`null`), in die Projektansicht wechseln, den Button per `document.querySelector`-Textsuche
anklicken, und pruefen dass ein zweites Fenster mit `renderer/index.html` existiert.

- [ ] **Step 9: Commit**

```bash
git add src/main/project/kickoff.ts src/main/ipc-handlers.ts \
        src/renderer/windows/project-window.tsx tests/project/kickoff-activation.test.ts
git commit -m "feat(project): open the grid from the project window and activate new projects"
```


## Abnahmekriterien Phase 6 (aus der Roadmap)

| Kriterium | Abgedeckt durch |
|-----------|-----------------|
| Frischer Start ohne `graph.db`: Kickoff legt Projekt an, `graph:init-project` gibt `{ok:true}`, acht Phasen im Graph | Task 0, 3, 6 (Task 6 Step 7) |
| Timeline und Kanban zeigen echte Daten, unterscheidbar von „Subsystem nicht bereit" | Task 4, 5 |
| Grid-Fenster oeffnen, Session mit Preset starten: tmux-Session im Projektverzeichnis, Session-Knoten im Graph | Task 7, 8 (Task 8 Step 9) |
| Ein Event erreicht beide Fenster | Task 2, 3 (Task 8 Step 9, Punkt 6) |
| Alle bisherigen Tests bleiben gruen; neue Integrationstests fuer 6a, 6c, 6d | Jede Task, Schlussstand 1481 |
| Grid-Fenster ist aus der UI erreichbar (ohne IPC-Injektion) | Task 9 |

## Risiken

- **Startzeit.** Die Init laeuft jetzt beim App-Start statt beim Grid-Oeffnen. Das
  `setImmediate`-Deferral bleibt, das Fenster zeichnet zuerst. Ob CK-INF-025 (< 5s) haelt, wird
  in Phase 9 **gemessen**, nicht geschaetzt.
- **Native Module im Paket.** Task 0 loest den Dev-Fall. Im gepackten Build liegt
  `node_modules` in `app.asar`, aus dem sich keine `.node`-Datei laden laesst — dort braucht
  `electron-builder` einen `asarUnpack`-Eintrag fuer `better-sqlite3`. Das ist Phase 8; der
  Resolver aus Task 0 arbeitet dann gegen den entpackten Pfad, weil `app.getAppPath()` in Phase 8
  entsprechend zu setzen ist.
- **`assemble-entity` ist gegen Tests gebaut, nicht gegen eine laufende Session.** Task 8 schliesst
  die Preset-**Auswahl** an; der Prompt-Zusammenbau selbst (`assembleEntityClaudeMd` in die
  Session schreiben) bleibt bewusst ausserhalb dieser Task, weil er eigene Nacharbeit erfordert
  und die Abnahmekriterien der Phase ihn nicht verlangen. Der Katalog liefert die `entityId`, an
  der die Assemblierung spaeter andockt.
- **Testsuite fasst weiterhin keine Electron-Verdrahtung an.** Dass 1390 Tests gruen waren,
  waehrend der Graph in der App tot war, ist die eigentliche Lehre aus Befund 4. Die
  App-Verifikationsschritte (Task 3 Step 9, Task 5 Step 7, Task 6 Step 7, Task 8 Step 9) sind
  deshalb Pflichtschritte, keine Kür.
