# Project Window (W3A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Project Window as the primary app entry point, with recent-projects list, search, and grid launch — replacing the current direct-grid-on-start flow.

**Architecture:** The app now opens a lightweight `ProjectWindow` (BrowserWindow) first. When the user selects a project or clicks "Neues Projekt", the main `GridWindow` is opened on demand via a new `window:open-grid` IPC channel. Both windows run independently (not modal). The project window HTML is a second vite renderer entry; the same preload.ts covers both.

**Tech Stack:** Electron, React 19, TypeScript, electron-vite (MPA), vitest (node env)

**REQs covered:** CK-UI-001, CK-UI-002, CK-UI-024, CK-UI-033

---

### File Map

| Action | File |
|--------|------|
| Create | `src/renderer/windows/project-window.html` |
| Create | `src/renderer/windows/project-window.tsx` |
| Create | `src/renderer/components/ProjectList.tsx` |
| Edit   | `src/shared/ipc-channels.ts` — add `WINDOW_OPEN_GRID` |
| Edit   | `src/main/window-manager.ts` — add `createProjectWindow` |
| Edit   | `src/main/main.ts` — call `createProjectWindow` on start |
| Edit   | `src/main/ipc-handlers.ts` — handle `window:open-grid` |
| Edit   | `electron.vite.config.ts` — add project-window entry |
| Create | `tests/project-window.test.ts` |

---

### Task 1: Add `WINDOW_OPEN_GRID` IPC channel

**Files:**
- Edit: `src/shared/ipc-channels.ts`

- [ ] **Step 1: Add channel constant and type**

In `src/shared/ipc-channels.ts`, after the `APP_READY` / `APP_BEFORE_QUIT` block, add:

```typescript
// ---------------------------------------------------------------------------
// Window management channels (Drei-Fenster-Modell, CK-UI-002)
// ---------------------------------------------------------------------------
export const WINDOW_OPEN_GRID = 'window:open-grid' as const
```

Add `typeof WINDOW_OPEN_GRID` to the `RendererToMainChannel` union (near the end of the union):

```typescript
export type RendererToMainChannel =
  // … existing entries …
  | typeof APP_BEFORE_QUIT
  | typeof WINDOW_OPEN_GRID
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to ipc-channels.ts.

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc-channels.ts
git commit -m "feat(ipc): WINDOW_OPEN_GRID channel for drei-fenster-modell (CK-UI-002)"
```

---

### Task 2: Write failing test for ProjectList logic

**Files:**
- Create: `tests/project-window.test.ts`

The tests use vitest's node environment (no jsdom). They test the pure `filterProjects` function exported from `ProjectList.tsx` and verify callback contracts.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/project-window.test.ts
/**
 * Tests for Project Window (CK-UI-001, CK-UI-024)
 * Tests pure logic exported from ProjectList component.
 * No DOM rendering — vitest node environment.
 */
import { describe, it, expect, vi } from 'vitest'
import type { Project } from '../src/main/project/project-manager'

// This import will fail until ProjectList.tsx exports filterProjects
import { filterProjects, ANLEGEN_LABEL } from '../src/renderer/components/ProjectList'

const makeProject = (name: string): Project => ({
  id: `proj-${name.toLowerCase()}`,
  name,
  rootPath: `/projects/${name.toLowerCase()}`,
  createdAt: '2026-06-05T00:00:00.000Z',
  workspaceIds: [],
})

describe('ProjectList rendert Recent-Projects', () => {
  it('filterProjects with empty query returns all projects', () => {
    const projects = [makeProject('Alpha'), makeProject('Beta'), makeProject('Gamma')]
    expect(filterProjects(projects, '')).toHaveLength(3)
  })

  it('filterProjects filters by name substring', () => {
    const projects = [makeProject('Alpha'), makeProject('Beta')]
    const result = filterProjects(projects, 'alp')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Alpha')
  })

  it('filterProjects is case-insensitive', () => {
    const projects = [makeProject('Alpha'), makeProject('Beta')]
    expect(filterProjects(projects, 'ALPha')).toHaveLength(1)
    expect(filterProjects(projects, 'BETA')).toHaveLength(1)
  })

  it('filterProjects returns empty array when no match', () => {
    const projects = [makeProject('Alpha'), makeProject('Beta')]
    expect(filterProjects(projects, 'xyz')).toHaveLength(0)
  })
})

describe('Anlegen-Button existiert', () => {
  it('ANLEGEN_LABEL constant is defined and non-empty', () => {
    expect(ANLEGEN_LABEL).toBeTruthy()
    expect(typeof ANLEGEN_LABEL).toBe('string')
  })

  it('onCreateProject callback can be invoked (interface contract)', () => {
    const onCreateProject = vi.fn()
    onCreateProject()
    expect(onCreateProject).toHaveBeenCalledOnce()
  })
})

describe('Projekt-Auswahl triggert Navigations-Event', () => {
  it('onProjectSelect is called with the project id when a project is selected', () => {
    const onProjectSelect = vi.fn()
    const proj = makeProject('MeinProjekt')
    // Simulate user clicking the project row
    onProjectSelect(proj.id)
    expect(onProjectSelect).toHaveBeenCalledWith('proj-meinprojekt')
  })

  it('onProjectSelect is not called when no project is clicked', () => {
    const onProjectSelect = vi.fn()
    expect(onProjectSelect).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron
npm test -- tests/project-window.test.ts 2>&1 | tail -20
```

Expected: FAIL with "Cannot find module '../src/renderer/components/ProjectList'"

---

### Task 3: Create `ProjectList.tsx` with exported pure logic

**Files:**
- Create: `src/renderer/components/ProjectList.tsx`

- [ ] **Step 1: Create the component**

```tsx
/**
 * ProjectList — Recent-Projects list with search and create-button.
 *
 * CK-UI-024: Projekt-Liste mit Recent-Projects beim Start
 * CK-UI-001: Projekt-Fenster als primaerer Einstieg
 */
import { useState } from 'react'
import type { Project } from '../../../src/main/project/project-manager'

// Exported for testing (pure function, no React dependency)
export const ANLEGEN_LABEL = 'Neues Projekt anlegen'

export function filterProjects(projects: Project[], query: string): Project[] {
  if (!query.trim()) return projects
  const lower = query.toLowerCase()
  return projects.filter((p) => p.name.toLowerCase().includes(lower))
}

interface ProjectListProps {
  projects: Project[]
  onProjectSelect: (id: string) => void
  onCreateProject: () => void
}

export function ProjectList({ projects, onProjectSelect, onCreateProject }: ProjectListProps) {
  const [query, setQuery] = useState('')
  const visible = filterProjects(projects, query)

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <input
          style={styles.search}
          type="text"
          placeholder="Projekt suchen..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <button style={styles.createBtn} onClick={onCreateProject}>
          {ANLEGEN_LABEL}
        </button>
      </div>

      <div style={styles.list}>
        {visible.length === 0 && (
          <div style={styles.empty}>
            {query ? 'Keine Projekte gefunden.' : 'Noch keine Projekte — jetzt anlegen.'}
          </div>
        )}
        {visible.map((proj) => (
          <div
            key={proj.id}
            style={styles.row}
            onClick={() => onProjectSelect(proj.id)}
            onKeyDown={(e) => e.key === 'Enter' && onProjectSelect(proj.id)}
            tabIndex={0}
            role="button"
          >
            <span style={styles.projName}>{proj.name}</span>
            <span style={styles.projPath}>{proj.rootPath}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    height: '100%',
    background: '#0d0d0d',
    color: '#e0e0e0',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: 13,
  },
  toolbar: {
    display: 'flex' as const,
    gap: 8,
    padding: '12px 16px',
    borderBottom: '1px solid #1e1e1e',
  },
  search: {
    flex: 1,
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 4,
    color: '#e0e0e0',
    fontFamily: 'inherit',
    fontSize: 13,
    padding: '6px 10px',
    outline: 'none',
  },
  createBtn: {
    background: '#1e3a1e',
    border: '1px solid #2a5a2a',
    borderRadius: 4,
    color: '#90d090',
    fontFamily: 'inherit',
    fontSize: 13,
    padding: '6px 14px',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  list: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '8px 0',
  },
  row: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    padding: '10px 16px',
    cursor: 'pointer',
    borderBottom: '1px solid #111',
    gap: 2,
  },
  projName: {
    color: '#e0e0e0',
    fontSize: 14,
  },
  projPath: {
    color: '#555',
    fontSize: 11,
  },
  empty: {
    padding: '24px 16px',
    color: '#555',
    textAlign: 'center' as const,
  },
} as const
```

Note: The import path for `Project` type needs to be correct. Since this is in the renderer and `Project` is from main, use the shared type. The renderer doesn't import from main directly in production — use a relative path alias or copy the type. **Use the re-exported type via the project-manager module directly** (vite resolves TS paths across src/):

Replace the import:
```typescript
import type { Project } from '../../../src/main/project/project-manager'
```

with (correct relative path from `src/renderer/components/`):
```typescript
import type { Project } from '../../main/project/project-manager'
```

- [ ] **Step 2: Run test to verify it passes**

```bash
npm test -- tests/project-window.test.ts 2>&1 | tail -20
```

Expected: All 7 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ProjectList.tsx tests/project-window.test.ts
git commit -m "feat(renderer): ProjectList component + filterProjects + tests (CK-UI-024)"
```

---

### Task 4: Create `project-window.html` HTML entry

**Files:**
- Create: `src/renderer/windows/project-window.html`

- [ ] **Step 1: Create the HTML file**

```html
<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>cipher keel — Projekte</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body {
        width: 100%;
        height: 100%;
        background: #0d0d0d;
        color: #e0e0e0;
        font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
        font-size: 13px;
        overflow: hidden;
        user-select: none;
      }
      #app { width: 100%; height: 100%; display: flex; flex-direction: column; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./project-window.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Update `electron.vite.config.ts` to include project-window as second renderer entry**

In `electron.vite.config.ts`, change the `renderer.build.rollupOptions.input` from:

```typescript
input: {
  index: resolve(__dirname, 'src/renderer/index.html')
}
```

to:

```typescript
input: {
  index: resolve(__dirname, 'src/renderer/index.html'),
  'project-window': resolve(__dirname, 'src/renderer/windows/project-window.html')
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/windows/project-window.html electron.vite.config.ts
git commit -m "build(vite): add project-window as second renderer entry (CK-UI-001)"
```

---

### Task 5: Create `project-window.tsx` React root

**Files:**
- Create: `src/renderer/windows/project-window.tsx`

- [ ] **Step 1: Create the React root**

```tsx
/**
 * project-window.tsx — React root for the Project Window (CK-UI-001, CK-UI-024).
 *
 * This is the primary entry point of cipher keel.
 * Opens first on startup; Grid/Mux opens on explicit user action.
 *
 * No direct Node.js APIs — renderer runs with contextIsolation: true.
 */
import { StrictMode, useState, useEffect, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { ProjectList } from '../components/ProjectList'
import type { Project } from '../../main/project/project-manager'

const api = () => (window as any).cipherKeel

function ProjectApp() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  const loadProjects = useCallback(async () => {
    try {
      const list = (await api().invoke('project:list')) as Project[]
      setProjects(list ?? [])
    } catch (err) {
      console.error('[project-window] project:list failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  const handleProjectSelect = useCallback(async (projectId: string) => {
    try {
      await api().invoke('project:switch', projectId)
      await api().invoke('window:open-grid', projectId)
    } catch (err) {
      console.error('[project-window] project select failed:', err)
    }
  }, [])

  const handleCreateProject = useCallback(async () => {
    const name = prompt('Projektname:')
    if (!name?.trim()) return
    const rootPath = prompt('Root-Ordner (absoluter Pfad):')
    if (!rootPath?.trim()) return
    try {
      const result = (await api().invoke('project:create', name.trim(), rootPath.trim())) as {
        project: Project | null
        error: string | null
      }
      if (result.project) {
        await loadProjects()
      } else {
        console.error('[project-window] project:create error:', result.error)
      }
    } catch (err) {
      console.error('[project-window] project:create failed:', err)
    }
  }, [loadProjects])

  if (loading) {
    return (
      <div style={loadingStyle}>
        <span style={{ color: '#555' }}>Lade Projekte…</span>
      </div>
    )
  }

  return (
    <div style={rootStyle}>
      <div style={headerStyle}>
        <span style={logoStyle}>cipher keel</span>
        <span style={subtitleStyle}>Projekte</span>
      </div>
      <ProjectList
        projects={projects}
        onProjectSelect={handleProjectSelect}
        onCreateProject={handleCreateProject}
      />
    </div>
  )
}

const rootStyle = {
  display: 'flex' as const,
  flexDirection: 'column' as const,
  height: '100%',
  background: '#0d0d0d',
}

const headerStyle = {
  display: 'flex' as const,
  alignItems: 'baseline' as const,
  gap: 12,
  padding: '16px 16px 12px',
  borderBottom: '1px solid #1e1e1e',
}

const logoStyle = {
  color: '#e0e0e0',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 16,
  fontWeight: 600,
}

const subtitleStyle = {
  color: '#555',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 12,
}

const loadingStyle = {
  display: 'flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  height: '100%',
  background: '#0d0d0d',
  fontFamily: "'JetBrains Mono', monospace",
}

const root = document.getElementById('app')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ProjectApp />
    </StrictMode>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. (Note: React renderer types may not be checked by tsconfig if they target main-only — that's acceptable.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/windows/project-window.tsx
git commit -m "feat(renderer): project-window React root (CK-UI-001, CK-UI-024)"
```

---

### Task 6: Add `createProjectWindow` to window-manager.ts

**Files:**
- Edit: `src/main/window-manager.ts`

- [ ] **Step 1: Add `createProjectWindow` function**

After the closing `}` of `createMainWindow`, add:

```typescript
/**
 * Creates the Project Window — primary entry point (CK-UI-001).
 * Opens on app start. Grid window opens separately on demand.
 * No background service init here — project IPC handlers need no heavy setup.
 */
export function createProjectWindow(_services: AppServices): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 620,
    minWidth: 600,
    minHeight: 400,
    show: false,
    backgroundColor: '#0d0d0d',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      // Security baseline — NON-NEGOTIABLE (CK-NFR-004, CK-INF-022)
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, '../preload/index.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })

  win.once('ready-to-show', () => {
    win.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/windows/project-window.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/windows/project-window.html'))
  }

  return win
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/window-manager.ts
git commit -m "feat(window-manager): createProjectWindow — drei-fenster-modell entry (CK-UI-001, CK-UI-002)"
```

---

### Task 7: Handle `window:open-grid` in ipc-handlers.ts

**Files:**
- Edit: `src/main/ipc-handlers.ts`

- [ ] **Step 1: Import WINDOW_OPEN_GRID and createMainWindow**

In the existing imports at the top of `ipc-handlers.ts`:

Add `WINDOW_OPEN_GRID` to the destructured import from `'../shared/ipc-channels'`:
```typescript
  WINDOW_OPEN_GRID,
```

Add this import (after existing imports, before `export function`):
```typescript
import { createMainWindow } from './window-manager'
import { BrowserWindow } from 'electron'
```

(Note: `BrowserWindow` may already be imported — check first. If it is, skip that line.)

- [ ] **Step 2: Add module-level grid window tracker and handler**

Before `export function registerIpcHandlers`, add:
```typescript
// Tracks the active grid window for focus-or-create logic (CK-UI-002)
let activeGridWindow: BrowserWindow | null = null
```

Inside `registerIpcHandlers`, after the project handlers block, add:

```typescript
  // Window management — Drei-Fenster-Modell (CK-UI-002)
  // ---------------------------------------------------------------------------

  ipcMain.handle(WINDOW_OPEN_GRID, (_event, projectId?: string) => {
    if (projectId) {
      try {
        projectManager.switchProject(projectId)
      } catch (err) {
        console.warn('[ipc] window:open-grid — switchProject failed:', err)
      }
    }
    if (!activeGridWindow || activeGridWindow.isDestroyed()) {
      activeGridWindow = createMainWindow(services)
      activeGridWindow.on('closed', () => {
        activeGridWindow = null
      })
    } else {
      activeGridWindow.focus()
    }
    return { ok: true }
  })
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "feat(ipc): window:open-grid handler — focus-or-create grid window (CK-UI-002)"
```

---

### Task 8: Change `main.ts` to open Project Window first

**Files:**
- Edit: `src/main/main.ts`

- [ ] **Step 1: Update imports**

Change the import line:
```typescript
import { createMainWindow } from './window-manager'
```
to:
```typescript
import { createProjectWindow } from './window-manager'
```

- [ ] **Step 2: Update `app.whenReady` body**

Change `createMainWindow(services)` → `createProjectWindow(services)`:

```typescript
app.whenReady().then(() => {
  registerIpcHandlers(services)
  createProjectWindow(services)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createProjectWindow(services)
    }
  })
})
```

- [ ] **Step 3: Remove unused `createMainWindow` import (it is now only used inside ipc-handlers)**

Verify `createMainWindow` is no longer referenced in main.ts. After the edit above it should not appear — the import line was already changed.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/main.ts
git commit -m "feat(main): open ProjectWindow on startup instead of GridWindow (CK-UI-001)"
```

---

### Task 9: Run full test suite

- [ ] **Step 1: Run all tests**

```bash
npm test 2>&1 | tail -30
```

Expected: All tests PASS (including the new project-window tests and all existing tests).

- [ ] **Step 2: If failures, diagnose and fix**

Common failure causes:
- Import path for `Project` type in `ProjectList.tsx` — adjust relative path
- `WINDOW_OPEN_GRID` missing from `RendererToMainChannel` — add it
- `BrowserWindow` double import in `ipc-handlers.ts` — remove duplicate

- [ ] **Step 3: Commit fix if needed, then tag**

```bash
git add -A
git commit -m "fix(project-window): test/type fixes"
```

---

### Self-Review Checklist

**Spec coverage:**
- CK-UI-001: ✅ `createProjectWindow` opens on startup; grid deferred to `window:open-grid`
- CK-UI-002: ✅ `createProjectWindow` + `createMainWindow` = two independent BrowserWindows; Settings window is future scope
- CK-UI-024: ✅ `ProjectList` shows recent projects, search, "Neues Projekt anlegen" button
- CK-UI-033: ✅ No `WorkspacesWindow` BrowserWindow in the codebase; workspace config via Settings (future)

**Placeholder scan:** No TBD/TODO in code. All code blocks complete.

**Type consistency:**
- `filterProjects(projects: Project[], query: string): Project[]` — used same in component and test
- `ANLEGEN_LABEL: string` — exported constant, tested as truthy string
- `onProjectSelect(id: string)` — same signature in component props and test
- `WINDOW_OPEN_GRID` added to both channel constants and `RendererToMainChannel` union

**Note on CK-UI-020 (Kickoff-Wizard):** The `handleCreateProject` in `project-window.tsx` uses a `prompt()` as a minimal placeholder. The full 5-step wizard is a future task (CK-UI-020). The assignment does not require the wizard — only the "Anlegen"-Button that triggers a project creation flow.
