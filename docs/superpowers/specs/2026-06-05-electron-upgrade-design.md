# Electron Upgrade: 33 → 42

Stand: 2026-06-05

---

## Ausgangslage

- Electron 33.4.11 (9 Major-Versionen hinter aktuell)
- 12 npm audit Vulnerabilities (9 HIGH, 3 MODERATE)
- electron-builder 25.x (ebenfalls veraltet, tar-CVEs)
- electron-vite 2.x

## Ziel

- Electron 42.x (aktuell stable)
- electron-builder 26.x
- electron-vite passend aktualisiert
- 0 HIGH Vulnerabilities
- Alle 1164 Tests gruen
- App startet und funktioniert

## API-Risiko-Analyse

Genutzte Electron-APIs (aus Codebase-Scan):

| API | Risiko | Aenderungs-Wahrscheinlichkeit |
|-----|--------|-------------------------------|
| BrowserWindow + webPreferences | Niedrig | Stabil seit v28, contextIsolation/sandbox default true seit v28 |
| contextBridge.exposeInMainWorld | Niedrig | Stabil, keine bekannten Breaks |
| ipcMain.handle / ipcMain.on | Niedrig | Stabil |
| ipcRenderer.invoke / send / on | Niedrig | Stabil |
| app lifecycle (whenReady, activate, etc.) | Niedrig | Stabil |
| dialog.showOpenDialog | Niedrig | Stabil |
| app.getPath | Niedrig | Stabil |

**Keine exotischen APIs genutzt.** Die Codebase verwendet ausschliesslich Kern-APIs die seit Electron 28+ stabil sind.

## Haupt-Risiken

1. **better-sqlite3 Native Addon:** Muss gegen neue Node-Version in Electron 42 rebuilden. Bekanntes Muster — `npx electron-rebuild` oder `npm rebuild`.
2. **electron-vite Kompatibilitaet:** Muss Electron 42 unterstuetzen. Upgrade auf v3+ evtl noetig.
3. **Security-Defaults:** Electron verschaerft Security-Defaults bei Major-Versionen. Da wir bereits `contextIsolation: true, nodeIntegration: false, sandbox: true` setzen, sollte das kein Problem sein.

## Vorgehen

1. `npm install electron@latest electron-builder@latest` (+ electron-vite falls noetig)
2. `npx electron-rebuild` fuer better-sqlite3
3. `npm test` — alle 1164 Tests muessen gruen bleiben
4. `npx tsc --noEmit` — Typecheck
5. `npm run dev` — manueller Smoke-Test (App startet, Fenster sichtbar)
6. `npm audit` — 0 HIGH
7. Commit
