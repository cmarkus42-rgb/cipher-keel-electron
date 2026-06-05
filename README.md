# cipher-keel-electron

Electron-basiertes Projektmanagement-UI fuer das cipher-mux Oekosystem.

## Setup

```bash
npm install
npx electron-rebuild   # Pflicht nach install / Electron-Versionswechsel
npm run dev
```

### electron-rebuild

`better-sqlite3` ist ein natives Node-Addon und muss gegen die aktuelle Electron-Version kompiliert werden. Ohne `npx electron-rebuild` nach `npm install` kommt es zu `NODE_MODULE_VERSION` Mismatch-Fehlern beim Start.

```bash
# Nach jedem npm install oder Electron-Upgrade:
npx electron-rebuild
```

## Scripts

| Befehl | Beschreibung |
|--------|-------------|
| `npm run dev` | Electron-Vite Dev-Server mit HMR |
| `npm run build` | Production-Build |
| `npm start` | Electron starten (nach Build) |
| `npm test` | Vitest ausfuehren |
| `npm run typecheck` | TypeScript-Check ohne Emit |

## Architektur

- `src/main/` — Electron Main Process (Node.js)
- `src/renderer/` — React UI (Vite, sandboxed)
- `src/preload.ts` — contextBridge API (`window.cipherKeel`)
- `src/shared/` — Geteilte Types und IPC-Channel-Konstanten
- `tests/` — Vitest-Tests (Node-Environment, kein DOM)
