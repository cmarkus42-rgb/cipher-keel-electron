# Phase 3b: GitHub + Kickoff Wizard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a deterministic 5-step kickoff wizard for project setup and integrate GitHub repo management via gh-CLI with PAT fallback.

**Architecture:** New `src/main/github/` module for backend GitHub operations (auth, repo CRUD, keychain token store). New wizard UI components in `src/renderer/components/wizard/`. Integration via 12 new IPC channels. All shell commands use execFile (no exec) for injection safety.

**Tech Stack:** TypeScript, Electron IPC, gh-CLI, macOS Security framework, React, Vitest

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/main/github/auth.ts` | gh-CLI detection, auth status, token retrieval, login trigger |
| Create | `src/main/github/repo.ts` | Repo create, link, list, switch, remote management |
| Create | `src/main/github/token-store.ts` | macOS Keychain PAT storage |
| Create | `src/main/github/index.ts` | Barrel exports |
| Modify | `src/shared/ipc-channels.ts` | +12 channel constants |
| Modify | `src/main/ipc-handlers.ts` | +GitHub, graph-init, dialog handlers |
| Create | `src/renderer/components/KickoffWizard.tsx` | 5-step container with navigation state machine |
| Create | `src/renderer/components/wizard/StepProjectName.tsx` | Step 1: name + root path |
| Create | `src/renderer/components/wizard/StepGitInit.tsx` | Step 2: git init |
| Create | `src/renderer/components/wizard/StepGraphInit.tsx` | Step 3: knowledge DB + 8 phases |
| Create | `src/renderer/components/wizard/StepGitHub.tsx` | Step 4: GitHub optional |
| Create | `src/renderer/components/wizard/StepToolConfig.tsx` | Step 5: model + niveau defaults |
| Modify | `src/renderer/windows/project-window.tsx` | +wizard view state |
| Create | `tests/github-auth.test.ts` | Auth detection + token tests |
| Create | `tests/github-repo.test.ts` | Repo CRUD + remote tests |
| Create | `tests/github-token-store.test.ts` | Keychain tests |
| Create | `tests/kickoff-wizard.test.ts` | Wizard logic + step validation |
| Create | `tests/github-hygiene.test.ts` | Token hygiene + no-clone constraint |

---

## Task 1: GitHub Auth Module

**Files:**
- Create: `src/main/github/auth.ts`
- Create: `tests/github-auth.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/github-auth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock execFile for all tests
const mockExecFile = vi.fn()
vi.mock('../src/main/util/exec-util', () => ({
  execFileAsync: (...args: unknown[]) => mockExecFile(...args)
}))

import { detectGhCli, checkAuthStatus, getToken } from '../src/main/github/auth'

beforeEach(() => { mockExecFile.mockReset() })

describe('detectGhCli (GH-001)', () => {
  it('returns true when gh is installed', async () => {
    mockExecFile.mockResolvedValue({ stdout: '/usr/local/bin/gh\n', stderr: '' })
    expect(await detectGhCli()).toBe(true)
  })
  it('returns false when gh is not found', async () => {
    mockExecFile.mockRejectedValue(new Error('not found'))
    expect(await detectGhCli()).toBe(false)
  })
})

describe('checkAuthStatus (GH-001)', () => {
  it('returns authenticated status with username', async () => {
    mockExecFile.mockResolvedValue({
      stdout: 'github.com\n  Logged in to github.com account testuser\n',
      stderr: ''
    })
    const status = await checkAuthStatus()
    expect(status.authenticated).toBe(true)
    expect(status.username).toBe('testuser')
  })
  it('returns unauthenticated when gh auth status fails', async () => {
    mockExecFile.mockRejectedValue(new Error('not logged in'))
    const status = await checkAuthStatus()
    expect(status.authenticated).toBe(false)
  })
})

describe('getToken (GH-001, GH-002)', () => {
  it('returns token from gh auth token', async () => {
    mockExecFile.mockResolvedValue({ stdout: 'ghp_abc123\n', stderr: '' })
    const token = await getToken()
    expect(token).toBe('ghp_abc123')
  })
  it('returns null when both gh and keychain fail', async () => {
    mockExecFile.mockRejectedValue(new Error('no token'))
    const token = await getToken()
    expect(token).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests, verify FAIL**

- [ ] **Step 3: Check if exec-util exists, create execFileAsync wrapper if needed**

Read `src/main/util/exec-util.ts`. If `execFileAsync` does not exist, add it:

```typescript
import { execFile } from 'child_process'
import { promisify } from 'util'

export const execFileAsync = promisify(execFile)
```

- [ ] **Step 4: Implement auth.ts**

```typescript
// src/main/github/auth.ts
import { execFileAsync } from '../util/exec-util'

export interface AuthStatus {
  ghInstalled: boolean
  authenticated: boolean
  username: string | null
}

export async function detectGhCli(): Promise<boolean> {
  try {
    await execFileAsync('which', ['gh'])
    return true
  } catch {
    return false
  }
}

export async function checkAuthStatus(): Promise<AuthStatus> {
  const installed = await detectGhCli()
  if (!installed) return { ghInstalled: false, authenticated: false, username: null }
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'status'])
    const match = stdout.match(/account\s+(\S+)/)
    return { ghInstalled: true, authenticated: true, username: match?.[1] ?? null }
  } catch {
    return { ghInstalled: true, authenticated: false, username: null }
  }
}

export async function getToken(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token'])
    const token = stdout.trim()
    return token || null
  } catch {
    // Fallback: try keychain PAT
    try {
      const { retrievePat } = await import('./token-store')
      return await retrievePat()
    } catch {
      return null
    }
  }
}

export async function triggerLogin(): Promise<void> {
  await execFileAsync('gh', ['auth', 'login', '--web'])
}
```

- [ ] **Step 5: Run tests, verify PASS**

- [ ] **Step 6: Commit** — `feat(github): add auth module with gh-CLI detection and token retrieval (GH-001, GH-002, GH-003)`

---

## Task 2: Token Store (Keychain)

**Files:**
- Create: `src/main/github/token-store.ts`
- Create: `tests/github-token-store.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/github-token-store.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExecFile = vi.fn()
vi.mock('../src/main/util/exec-util', () => ({
  execFileAsync: (...args: unknown[]) => mockExecFile(...args)
}))

import { storePat, retrievePat, deletePat } from '../src/main/github/token-store'

beforeEach(() => { mockExecFile.mockReset() })

describe('Token Store — macOS Keychain (GH-002, GH-014)', () => {
  it('storePat calls security add-generic-password', async () => {
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })
    await storePat('ghp_test123')
    expect(mockExecFile).toHaveBeenCalledWith(
      'security',
      expect.arrayContaining(['add-generic-password', '-w', 'ghp_test123'])
    )
  })

  it('retrievePat returns token from keychain', async () => {
    mockExecFile.mockResolvedValue({ stdout: 'ghp_stored456\n', stderr: '' })
    expect(await retrievePat()).toBe('ghp_stored456')
  })

  it('retrievePat returns null when not found', async () => {
    mockExecFile.mockRejectedValue(new Error('could not be found'))
    expect(await retrievePat()).toBeNull()
  })

  it('deletePat calls security delete-generic-password', async () => {
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })
    await deletePat()
    expect(mockExecFile).toHaveBeenCalledWith(
      'security',
      expect.arrayContaining(['delete-generic-password'])
    )
  })
})
```

- [ ] **Step 2: Run tests, verify FAIL**

- [ ] **Step 3: Implement token-store.ts**

```typescript
// src/main/github/token-store.ts
import { execFileAsync } from '../util/exec-util'

const SERVICE = 'cipher-keel-github'
const ACCOUNT = 'pat'

export async function storePat(token: string): Promise<void> {
  await execFileAsync('security', [
    'add-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w', token, '-U'
  ])
}

export async function retrievePat(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('security', [
      'find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w'
    ])
    return stdout.trim() || null
  } catch {
    return null
  }
}

export async function deletePat(): Promise<void> {
  try {
    await execFileAsync('security', [
      'delete-generic-password', '-s', SERVICE, '-a', ACCOUNT
    ])
  } catch { /* ignore if not found */ }
}
```

- [ ] **Step 4: Create barrel export**

```typescript
// src/main/github/index.ts
export { detectGhCli, checkAuthStatus, getToken, triggerLogin, type AuthStatus } from './auth'
export { createRepo, linkRepo, listUserRepos, switchRepo, type RepoInfo, type RepoResult } from './repo'
export { storePat, retrievePat, deletePat } from './token-store'
```

- [ ] **Step 5: Run tests, verify PASS**

- [ ] **Step 6: Commit** — `feat(github): add keychain token store and barrel export (GH-002, GH-014)`

---

## Task 3: Repo Module

**Files:**
- Create: `src/main/github/repo.ts`
- Create: `tests/github-repo.test.ts`

- [ ] **Step 1: Write failing tests**

Tests for createRepo, linkRepo, listUserRepos, switchRepo — all with mocked execFileAsync. Test that:
- createRepo calls `gh repo create` + `git remote add origin`
- createRepo never calls `git clone` (GH-006)
- linkRepo validates via API then sets remote
- listUserRepos parses JSON response
- switchRepo calls linkRepo internally
- All functions return `{ ok: false, error: 'github_unreachable' }` on timeout (GH-013)

- [ ] **Step 2: Run tests, verify FAIL**

- [ ] **Step 3: Implement repo.ts**

Core functions: createRepo, linkRepo, listUserRepos, switchRepo. All use execFileAsync with AbortController timeout (10s). Token masking in error messages (GH-014).

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Run full suite**

- [ ] **Step 6: Commit** — `feat(github): add repo module with create, link, list, switch (GH-004, GH-005, GH-006, GH-013, GH-015)`

---

## Task 4: IPC Channels + Handlers

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/ipc-handlers.ts`

- [ ] **Step 1: Add 12 channel constants to ipc-channels.ts**

```typescript
export const GITHUB_CHECK_AUTH = 'github:check-auth'
export const GITHUB_GET_TOKEN = 'github:get-token'
export const GITHUB_TRIGGER_LOGIN = 'github:trigger-login'
export const GITHUB_CREATE_REPO = 'github:create-repo'
export const GITHUB_LINK_REPO = 'github:link-repo'
export const GITHUB_LIST_REPOS = 'github:list-repos'
export const GITHUB_STORE_PAT = 'github:store-pat'
export const GITHUB_SWITCH_REPO = 'github:switch-repo'
export const GRAPH_INIT_PROJECT = 'graph:init-project'
export const GIT_HAS_REPO = 'git:has-repo'
export const DIALOG_OPEN_DIR = 'dialog:open-directory'
export const PROJECT_KICKOFF = 'project:kickoff'
```

- [ ] **Step 2: Add handlers to ipc-handlers.ts**

Each handler delegates to the corresponding github/ function. `graph:init-project` creates 8 phase nodes + naechste_phase edges. `dialog:open-directory` uses Electron `dialog.showOpenDialog`. `project:kickoff` orchestrates the full sequence.

- [ ] **Step 3: Run full suite**

- [ ] **Step 4: Commit** — `feat(ipc): add GitHub + kickoff IPC channels and handlers (GH-001..006, GH-011..015)`

---

## Task 5: KickoffWizard Container + Steps 1-3

**Files:**
- Create: `src/renderer/components/KickoffWizard.tsx`
- Create: `src/renderer/components/wizard/StepProjectName.tsx`
- Create: `src/renderer/components/wizard/StepGitInit.tsx`
- Create: `src/renderer/components/wizard/StepGraphInit.tsx`
- Create: `tests/kickoff-wizard.test.ts`

- [ ] **Step 1: Write failing tests for wizard logic**

```typescript
// tests/kickoff-wizard.test.ts
import { describe, it, expect } from 'vitest'
import {
  validateStep1, validateStep2, WIZARD_STEPS,
  type WizardData, initialWizardData
} from '../src/renderer/components/KickoffWizard'

describe('KickoffWizard logic (CK-UI-020)', () => {
  it('has exactly 5 steps', () => {
    expect(WIZARD_STEPS).toHaveLength(5)
  })
  it('initialWizardData has empty defaults', () => {
    const data = initialWizardData()
    expect(data.projectName).toBe('')
    expect(data.rootPath).toBe('')
    expect(data.githubAction).toBe('skip')
  })
  it('validateStep1 requires name and path', () => {
    expect(validateStep1({ projectName: '', rootPath: '' } as WizardData)).toBe(false)
    expect(validateStep1({ projectName: 'Test', rootPath: '/tmp' } as WizardData)).toBe(true)
  })
  it('validateStep2 always passes (git init is optional)', () => {
    expect(validateStep2({ initGit: false } as WizardData)).toBe(true)
  })
  it('no LLM call in any step (deterministic)', () => {
    // Structural: wizard module has no import of anthropic/openai/ollama
    // Verified by grep in github-hygiene.test.ts
  })
})
```

- [ ] **Step 2: Run tests, verify FAIL**

- [ ] **Step 3: Implement KickoffWizard.tsx**

Export: `WIZARD_STEPS`, `initialWizardData()`, `validateStep1()`, `validateStep2()`, `WizardData` type. Component renders current step, navigation bar (Back/Next/Cancel), calls IPC on finish.

- [ ] **Step 4: Implement StepProjectName, StepGitInit, StepGraphInit**

Each is a presentational component receiving `data` + `onChange` props. StepGraphInit triggers `graph:init-project` IPC on mount and shows progress.

- [ ] **Step 5: Run tests, verify PASS**

- [ ] **Step 6: Commit** — `feat(ui): add KickoffWizard container and steps 1-3 (CK-UI-020)`

---

## Task 6: Wizard Steps 4-5 + project-window Integration

**Files:**
- Create: `src/renderer/components/wizard/StepGitHub.tsx`
- Create: `src/renderer/components/wizard/StepToolConfig.tsx`
- Modify: `src/renderer/windows/project-window.tsx`

- [ ] **Step 1: Implement StepGitHub.tsx**

Calls `github:check-auth` on mount. Shows auth status. Three options: create/link/skip. Create shows name+visibility form. Link shows repo list with search + URL fallback. Skip sets `githubAction = 'skip'`.

- [ ] **Step 2: Implement StepToolConfig.tsx**

Radio groups for model (light/standard/heavy) and niveau (A/B/C). Defaults: standard + B.

- [ ] **Step 3: Integrate wizard into project-window.tsx**

Add `'wizard'` to view state type. Replace create form with wizard. On wizard complete: `view = 'project'`. On cancel: `view = 'list'`.

- [ ] **Step 4: Run full suite**

- [ ] **Step 5: Commit** — `feat(ui): add wizard steps 4-5 and integrate into project window (GH-011, CK-UI-020)`

---

## Task 7: Hygiene Tests + Final Verification

**Files:**
- Create: `tests/github-hygiene.test.ts`

- [ ] **Step 1: Write hygiene constraint tests**

```typescript
// tests/github-hygiene.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

function readAllTsFiles(dir: string): string[] {
  const contents: string[] = []
  for (const f of readdirSync(dir, { recursive: true }) as string[]) {
    if (f.endsWith('.ts') || f.endsWith('.tsx')) {
      contents.push(readFileSync(join(dir, f), 'utf-8'))
    }
  }
  return contents
}

describe('GH-006: No git clone', () => {
  it('github module contains no git clone call', () => {
    const files = readAllTsFiles('src/main/github')
    for (const content of files) {
      expect(content).not.toMatch(/git.clone|'clone'/)
    }
  })
})

describe('GH-014: Token hygiene', () => {
  it('github module has no console.log with token patterns', () => {
    const files = readAllTsFiles('src/main/github')
    for (const content of files) {
      expect(content).not.toMatch(/console\.log.*token/i)
      expect(content).not.toMatch(/console\.log.*ghp_/)
    }
  })
})

describe('CK-UI-020: No LLM in wizard', () => {
  it('wizard components have no AI SDK imports', () => {
    const wizardFiles = readAllTsFiles('src/renderer/components/wizard')
    const container = readFileSync('src/renderer/components/KickoffWizard.tsx', 'utf-8')
    const all = [...wizardFiles, container]
    for (const content of all) {
      expect(content).not.toMatch(/anthropic|openai|ollama|claude/)
    }
  })
})
```

- [ ] **Step 2: Run tests, verify PASS**

- [ ] **Step 3: Run full test suite** — expect 882 existing + ~80-120 new all PASS

- [ ] **Step 4: Run typecheck** — `npx tsc --noEmit`

- [ ] **Step 5: Commit** — `test: add GitHub hygiene and wizard constraint tests (GH-006, GH-014, CK-UI-020)`

---

## Wave Assignment for CF Execution

| Wave | Tasks | Workers |
|------|-------|---------|
| 1 | Task 1 + Task 2 (auth + token store) | 2 parallel |
| 2 | Task 3 + Task 4 (repo + IPC) | 2 sequential (IPC depends on repo) |
| 3 | Task 5 + Task 6 (wizard UI) | 2 parallel (steps 1-3 vs steps 4-5) |
| 4 | Task 7 (hygiene + verification) | 1 |
