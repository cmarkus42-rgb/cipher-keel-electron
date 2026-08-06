# Phase 3b Design Spec: GitHub Integration + Kickoff Wizard

Stand: 2026-06-05

Sub-Projekt: 3b von 3 (Phase 3 Zerlegung)
Scope: 11 REQs (CK-UI-020 + GH-001..006, GH-011, GH-013..015)

---

## Kontext

Phase 3a hat die Prozess-Engine vervollstaendigt (882 Tests, 18 REQs). Phase 3b liefert den User-facing Projekt-Setup-Flow: Ein deterministischer 5-Schritt-Wizard legt Projekte an, die GitHub-Integration verbindet Projekte mit Repos.

GH-007 (github_repo Node) und GH-008 (hat_github_repo Edge) sind aus Phase 2 done. GH-012 (Git-Historie bleibt in Git) ist ein Negativ-Constraint, der durch Design erfuellt ist.

## Abhaengigkeiten

- BT-1 (Knowledge Graph): done
- BT-3 (Electron-Grundgeruest): done
- CK-UI-003/004 (ProjectView, Timeline): done
- GH-007/008 (github_repo Node + Edge): done
- project-manager.ts: done

## Deferred

| REQ | Grund |
|-----|-------|
| GH-009 | GitHub MCP Server — braucht Go-Binary, "soll" Prio |
| GH-010 | Schenkel-2 GitHub-Zugriff — braucht NanoClaw |

---

## 1. Backend: GitHub Service (`src/main/github/`)

### 1.1 Auth-Modul (`auth.ts`) — GH-001, GH-002, GH-003

```typescript
export interface AuthStatus {
  ghInstalled: boolean
  authenticated: boolean
  username: string | null
  scopes: string[]
}

// GH-001: gh-CLI als primaere Auth-Methode
export async function detectGhCli(): Promise<boolean>
  // execFile('which', ['gh']) — true wenn Exit 0

export async function checkAuthStatus(): Promise<AuthStatus>
  // execFile('gh', ['auth', 'status', '--show-token']) — parst Output

export async function getToken(): Promise<string | null>
  // 1. gh auth token (primaer)
  // 2. Keychain-PAT Fallback (GH-002)
  // 3. null wenn beides fehlschlaegt

// GH-003: Auth-Check beim ersten GitHub-Zugriff
export async function triggerLogin(): Promise<void>
  // execFile('gh', ['auth', 'login', '--web'])
```

### 1.2 Repo-Modul (`repo.ts`) — GH-004, GH-005, GH-006, GH-015

```typescript
export interface RepoInfo {
  name: string
  owner: string
  url: string
  visibility: 'public' | 'private'
  defaultBranch: string
  repoId: string
}

export interface RepoResult {
  ok: boolean
  repo?: RepoInfo
  error?: string
}

// GH-004: Neues Repo via gh repo create
export async function createRepo(
  name: string, description: string, visibility: 'public' | 'private',
  projectDir: string
): Promise<RepoResult>
  // 1. gh repo create {name} --{visibility} -d {description}
  // 2. git remote add origin {url} im projectDir
  // 3. RepoInfo zurueckgeben
  // GH-006: KEIN git clone — nur remote add

// GH-005: Bestehendes Repo verlinken
export async function linkRepo(
  ownerRepo: string, projectDir: string
): Promise<RepoResult>
  // 1. gh api /repos/{owner}/{repo} — Validierung
  // 2. git remote add origin {url} (oder set-url wenn origin existiert)
  // 3. RepoInfo zurueckgeben

// GH-005: Repo-Listing fuer Auswahl
export async function listUserRepos(
  token: string, page?: number
): Promise<{ repos: RepoInfo[]; hasMore: boolean }>
  // GET /user/repos?per_page=100&sort=updated&page={page}
  // Client-seitige Filterung im UI

// GH-015: Repo wechseln
export async function switchRepo(
  ownerRepo: string, projectDir: string
): Promise<RepoResult>
  // 1. linkRepo() aufrufen
  // 2. Alten github_repo-Knoten im Graph ersetzen (hat_github_repo 1:1)
```

### 1.3 Token-Store (`token-store.ts`) — GH-002, GH-014

```typescript
const SERVICE_NAME = 'cipher-keel-github'
const ACCOUNT_NAME = 'pat'

// GH-002: PAT im macOS Keychain speichern
export async function storePat(token: string): Promise<void>
  // execFile('security', ['add-generic-password', '-s', SERVICE_NAME, '-a', ACCOUNT_NAME, '-w', token, '-U'])

export async function retrievePat(): Promise<string | null>
  // execFile('security', ['find-generic-password', '-s', SERVICE_NAME, '-a', ACCOUNT_NAME, '-w'])
  // null bei "could not be found"

export async function deletePat(): Promise<void>
  // execFile('security', ['delete-generic-password', '-s', SERVICE_NAME, '-a', ACCOUNT_NAME])
```

### 1.4 Token-Hygiene (GH-014)

Alle Regeln gelten fuer das gesamte github/-Modul:
- Kein `console.log` mit Token-Werten
- Error-Messages maskieren Token-Patterns (`ghp_*`, `gho_*`, `github_pat_*`) zu `gh***`
- Token erscheint nur im HTTP Authorization-Header oder im Keychain-Aufruf
- IPC-Messages enthalten keine Token-Felder
- Verifiziert durch grep-Test ueber alle Log-Ausgaben

### 1.5 Netzwerk-Fehlerbehandlung (GH-013)

Alle externen Aufrufe (gh CLI, GitHub API) mit Timeout:
- CLI-Aufrufe: 10s Timeout via `AbortController`
- Bei Timeout oder Netzwerk-Fehler: `{ ok: false, error: 'github_unreachable' }`
- App startet ohne Haenger wenn GitHub nicht erreichbar
- Wizard Schritt 4 zeigt "GitHub nicht erreichbar" als Status (nicht als Blocker)
- Alle nicht-GitHub-Funktionen bleiben vollstaendig nutzbar

---

## 2. Frontend: Kickoff Wizard (CK-UI-020)

### 2.1 Wizard-Container (`KickoffWizard.tsx`)

```typescript
interface WizardData {
  // Step 1
  projectName: string
  rootPath: string
  // Step 2
  initGit: boolean
  // Step 3 (automatisch)
  graphInitialized: boolean
  // Step 4 (optional)
  githubAction: 'create' | 'link' | 'skip'
  repoName?: string
  repoVisibility?: 'public' | 'private'
  selectedRepo?: string
  // Step 5
  modelDefault: 'light' | 'standard' | 'heavy'
  niveauDefault: 'A' | 'B' | 'C'
}

// State-Machine: step 1-5, canProceed berechnet pro Step
// Navigation: Zurueck / Weiter / Abbrechen
// "Projekt anlegen" bei Step 5 → project:kickoff IPC
```

### 2.2 Schritt 1: Projekt-Name + Root-Ordner (`StepProjectName.tsx`)

- Input: Projektname (Pflicht)
- Ordner-Picker via IPC `dialog:open-directory` (Electron dialog.showOpenDialog)
- Validierung: Name nicht leer, Pfad existiert
- canProceed: name.trim() && rootPath

### 2.3 Schritt 2: Git-Repo initialisieren (`StepGitInit.tsx`)

- Checkbox "Git-Repository initialisieren" (default: true wenn kein .git vorhanden)
- Wenn .git existiert: "Git-Repo erkannt" (Checkbox disabled, kein Init noetig)
- Pruefung via IPC `git:has-repo`

### 2.4 Schritt 3: Knowledge-DB (`StepGraphInit.tsx`)

- Automatischer Schritt — zeigt Fortschritt
- IPC `graph:init-project` → erstellt DB + 8 Phase-Knoten (alle "ausstehend") + naechste_phase-Kanten
- canProceed: graphInitialized === true

### 2.5 Schritt 4: GitHub-Anbindung (`StepGitHub.tsx`) — GH-011

- Automatischer Auth-Check beim Betreten des Schritts
- Bei Erfolg: unsichtbar (kein zusaetzlicher UI-Schritt) — GH-003 AK3
- Bei Fehler: Hinweis-Dialog mit gh-Installationsanleitung + PAT-Fallback
- Drei Optionen: Neues Repo / Bestehendes Repo / Ueberspringen
- Neues Repo: Name (pre-filled aus Projektname), Beschreibung, Visibility
- Bestehendes Repo: Listing mit Suchfeld oder URL-Eingabe
- canProceed: immer true (Schritt ist optional)

### 2.6 Schritt 5: Werkzeug-Konfig (`StepToolConfig.tsx`)

- Model-Default: light / standard / heavy (Radio)
- Niveau-Default: A / B / C (Radio)
- Speichert in Projekt-Config

### 2.7 Integration in project-window.tsx

Neuer View-State `'wizard'` neben `'list'` und `'project'`:
- "Neues Projekt anlegen" setzt `view = 'wizard'` statt Create-Form
- Wizard-Abschluss → `view = 'project'` mit neuem Projekt
- Wizard-Abbruch → `view = 'list'`
- Bestehende Create-Form wird durch den Wizard ersetzt

### 2.8 project:kickoff IPC-Ablauf

Wenn User "Projekt anlegen" klickt:
1. `project:create` (existiert) — erstellt Projekt in ProjectManager
2. `git init` falls initGit (wenn kein .git)
3. `graph:init-project` — Knowledge-DB + 8 Phasen
4. GitHub-Flow (create/link) falls nicht skip — `github_repo`-Knoten im Graph
5. Config speichern (Model, Niveau)
6. Return `{ ok: true, projectId }`

---

## 3. IPC-Channels

Neue Channels in `src/shared/ipc-channels.ts`:

```
GITHUB_CHECK_AUTH   = 'github:check-auth'
GITHUB_GET_TOKEN    = 'github:get-token'
GITHUB_TRIGGER_LOGIN = 'github:trigger-login'
GITHUB_CREATE_REPO  = 'github:create-repo'
GITHUB_LINK_REPO    = 'github:link-repo'
GITHUB_LIST_REPOS   = 'github:list-repos'
GITHUB_STORE_PAT    = 'github:store-pat'
GITHUB_SWITCH_REPO  = 'github:switch-repo'
GRAPH_INIT_PROJECT  = 'graph:init-project'
GIT_HAS_REPO        = 'git:has-repo'
DIALOG_OPEN_DIR     = 'dialog:open-directory'
PROJECT_KICKOFF     = 'project:kickoff'
```

---

## 4. Datei-Map

| Action | Datei | Verantwortung |
|--------|-------|---------------|
| Create | `src/main/github/auth.ts` | gh-CLI + PAT Auth |
| Create | `src/main/github/repo.ts` | Repo CRUD + Remote |
| Create | `src/main/github/token-store.ts` | Keychain PAT |
| Create | `src/main/github/index.ts` | Barrel export |
| Create | `src/renderer/components/KickoffWizard.tsx` | 5-Step Container + Navigation |
| Create | `src/renderer/components/wizard/StepProjectName.tsx` | Schritt 1 |
| Create | `src/renderer/components/wizard/StepGitInit.tsx` | Schritt 2 |
| Create | `src/renderer/components/wizard/StepGraphInit.tsx` | Schritt 3 |
| Create | `src/renderer/components/wizard/StepGitHub.tsx` | Schritt 4 |
| Create | `src/renderer/components/wizard/StepToolConfig.tsx` | Schritt 5 |
| Modify | `src/renderer/windows/project-window.tsx` | +wizard View-State |
| Modify | `src/shared/ipc-channels.ts` | +12 Channel-Konstanten |
| Modify | `src/main/ipc-handlers.ts` | +GitHub + Graph-Init + Dialog Handler |
| Create | `tests/github-auth.test.ts` | Auth-Tests (Mock gh CLI) |
| Create | `tests/github-repo.test.ts` | Repo-Tests (Mock gh CLI + API) |
| Create | `tests/github-token-store.test.ts` | Keychain-Tests (Mock security) |
| Create | `tests/kickoff-wizard.test.ts` | Wizard-Logic-Tests |
| Create | `tests/github-hygiene.test.ts` | Token-Hygiene grep-Test, Clone-Constraint |

---

## 5. Wave-Vorschlag

| Wave | Inhalt | Workers |
|------|--------|---------|
| 1 | Backend: auth.ts + token-store.ts + Tests | 2 |
| 2 | Backend: repo.ts + IPC-Handler + Tests | 2 |
| 3 | Frontend: KickoffWizard + Steps 1-3 + project-window Integration | 2-3 |
| 4 | Frontend: Step 4 (GitHub) + Step 5 (Config) + Hygiene-Tests | 2 |
| 5 | Integration + Settings Repo-Wechsel (GH-015) | 1 |

Geschaetzter Test-Zuwachs: ~80-120 neue Tests.

---

## 6. Akzeptanzkriterien (Gesamt)

1. Alle 11 REQs implementiert mit Tests
2. Kickoff-Wizard durchlauft alle 5 Schritte ohne LLM-Aufruf
3. Nach Wizard-Abschluss: leerer Zeitstrahl mit 8 ausstehenden Phasen
4. gh-CLI Auth + PAT Fallback funktioniert
5. Neues Repo anlegen + Bestehendes Repo verlinken funktioniert
6. Kein git clone im gesamten GitHub-Code (GH-006)
7. Kein Token in Logs oder IPC (GH-014)
8. App startet ohne Haenger bei GitHub-Nicht-Erreichbarkeit (GH-013)
9. Bestehende 882 Tests bleiben gruen
