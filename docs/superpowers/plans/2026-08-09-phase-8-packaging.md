# Phase 8 — Packaging und Release 0.1: Implementierungsplan

> **Für agentische Bearbeiter:** ERFORDERLICHE SUB-SKILL: Nutze
> `superpowers:subagent-driven-development` (empfohlen) oder
> `superpowers:executing-plans`, um diesen Plan Task für Task umzusetzen.
> Die Schritte tragen Checkbox-Syntax (`- [ ]`) zur Verfolgung.

**Ziel:** Ein unsigniertes arm64-DMG, das auf einem fremden Apple-Silicon-Mac startet und
in dem der Knowledge Graph nachweislich lebt — nicht stumm degradiert.

**Architektur:** Das Paket bricht heute an zwei Stellen, beide gemessen (Abschnitt
„Ausgangslage"). Erstens kollidiert das electron-builder-Ausgabeverzeichnis mit dem
electron-vite-Bauverzeichnis, weshalb die App gar nicht erst ins Archiv kommt. Zweitens
lädt `sqlite-vec` seine `vec0.dylib` über sqlite3s eigenes `dlopen`, das kein asar kennt.
Der Plan trennt die Verzeichnisse, baut **zuerst** einen Rauchtest, der das gepackte
Artefakt startet und `graph=ready` prüft, sieht ihn rot, und repariert dann gegen ihn.

**Tech-Stack:** electron-builder 26.15.3, electron-vite 5, Electron 42.8.1 (ABI 146),
better-sqlite3 12, sqlite-vec 0.1.9, vitest 4, Pillow 12 (nur für die einmalige
Icon-Erzeugung).

---

## Global Constraints

Gelten für jeden Task, ohne Ausnahme:

- **Zielplattform 0.1: macOS arm64, ausschließlich.** `build.mac.target[].arch` ist
  `["arm64"]`. Kein x64, kein Universal (Entscheidung 2026-08-09, Begründung in
  Abschnitt „Ausgangslage" Befund 4).
- **Unsigniert** (Roadmap-Entscheidung 1, 2026-08-06): jeder Paketlauf setzt
  `CSC_IDENTITY_AUTO_DISCOVERY=false`. `xattr -cr /Applications/cipher\ keel.app` gehört
  prominent ins README, nicht in eine Fußnote.
- **Security-Baseline unverhandelbar** (CK-NFR-004, CK-INF-022): `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`. `src/preload.ts` bleibt die einzige
  `contextBridge.exposeInMainWorld`-Aufrufstelle. Kein Task fasst das an.
- **TDD**: Test zuerst, Test rot sehen, minimale Implementierung, Test grün, committen.
- **Keine Regression**: `npm test` (Stand 1511) und `npm run typecheck` sind nach jedem
  Commit grün.
- **Nach jeder Abhängigkeitsoperation** (`npm install`, `npm ci`, Lockfile-Änderung,
  **auch nach jedem `electron-builder`-Lauf**, denn der ruft `@electron/rebuild`):
  `npm run rebuild-native` ausführen, danach `npm test` **und** `npm run smoke:packaged`.
  Grüne Tests allein belegen nichts — siehe Handover Abschnitt 9.
- **Plattformneutral schreiben, wo es nichts kostet.** Linux ist erklärtes späteres Ziel
  (Nutzer-Entscheidung 2026-08-09), aber nicht Teil dieser Phase. Konkret: Pfadlogik nutzt
  `path.sep` statt `'/'`, und kein neuer Code prüft `process.platform === 'darwin'`, wo die
  Abfrage vermeidbar ist. Siehe Abschnitt „Was für Linux offen bleibt".
- **Abhängigkeitsversionen** (unverändert lassen): `electron ^42.3.3`,
  `electron-builder ^26.8.1`, `better-sqlite3 ^12.11.1`, `sqlite-vec ^0.1.9`.

---

## Ausgangslage — was am 2026-08-09 gemessen wurde

Alle sechs Befunde sind reproduziert, nicht vermutet. Der Handover
(`2026-08-07-handover-phase-7ff.md`, Abschnitt 3) hat die Falle richtig geahnt, aber am
falschen Modul verortet; Befund 2 und 3 korrigieren ihn.

### Befund 1 — Packaging scheitert heute vollständig (Blocker)

`directories.output` ist per Default `dist` — dasselbe Verzeichnis, in das electron-vite
baut. electron-builder schließt sein eigenes Ausgabeverzeichnis aus `files` aus, also
landet die App nie im Archiv:

```
$ CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir --arm64
⨯ Application entry file "dist/main/index.js" in the "…/app.asar" is corrupted:
  Error: "dist/main/index.js" was not found in this archive
```

Das erzeugte Archiv enthielt `node_modules` (1064 Einträge), `src` (199), `tests` (117),
`docs` (25) — nur nicht `dist`.

### Befund 2 — `better-sqlite3` ist **nicht** der Bruchpunkt (Korrektur am Handover)

electron-builder 26 entpackt beide nativen Pakete von selbst:

```
app.asar.unpacked/node_modules/better-sqlite3/bin/darwin-arm64-146/better-sqlite3.node
app.asar.unpacked/node_modules/sqlite-vec-darwin-arm64/vec0.dylib
```

Electron patcht zusätzlich `process.dlopen` so, dass `app.asar`-Pfade auf
`app.asar.unpacked` umgebogen werden. Der Resolver findet die ABI-146-Binary, `new
Database(...)` gelingt. **Ein `asarUnpack`-Eintrag ist nicht nötig** — der im Handover
vorgeschlagene erste Punkt entfällt.

### Befund 3 — `sqlite-vec` ist der Bruchpunkt (Blocker)

`db.loadExtension()` geht durch sqlite3s eigenes `dlopen`, das nichts von asar weiß:

```
[service-lifecycle] Knowledge Graph init failed: SqliteError: dlopen(
  …/Contents/Resources/app.asar/node_modules/sqlite-vec-darwin-arm64/vec0.dylib.dylib,
  0x000A) … (errno=20)
    at Database.loadExtension (…/better-sqlite3/lib/methods/wrappers.js:19:14)
    at Module.load (…/sqlite-vec/index.cjs:43:6)
    at openGraphDb (…/dist/main/index.js:1477:24)
```

Folge: `graph` und `kanban` gehen auf `degraded`. **Nicht stumm** — `initGraph` fängt,
setzt Status und schreibt `console.warn`. Die Formulierung „ohne Warnung" im Handover ist
an dieser Stelle zu streichen.

**Der Fix ist verifiziert, nicht vermutet.** Archiv extrahiert, `getLoadablePath()` um
`app.asar` → `app.asar.unpacked` ergänzt, neu gepackt, gestartet:

```
[service-lifecycle] Knowledge Graph initialized: …/graph.db
```

Damit ist `vec0` bewiesen geladen — `applySchema` legt `vec_chunks` als
`vec0`-Virtual-Table an und wäre sonst mitgeflogen.

### Befund 4 — Der Resolver ist unsauber, aber anders als vermutet

Probe: das entpackte `bin/`-Verzeichnis versteckt und neu gestartet. Erwartet war
`existsSync` → `false` → Fallback. Gemessen:

```
Knowledge Graph init failed: Error: dlopen(…/app.asar.unpacked/node_modules/
  better-sqlite3/bin/darwin-arm64-146/better-sqlite3.node, 0x0001):
  tried: '…' (no such file)
    at process.func [as dlopen] (node:electron/js2c/node_init:2:2625)
```

`existsSync` beantwortet im Paket den **asar-Index**, nicht die Platte. Die im Docstring
zugesagte Eigenschaft „gibt `undefined` zurück, wenn dort nichts liegt" gilt im gepackten
Build nicht. Behoben in Task 3 (Prüfung gegen den entpackten Pfad) plus `console.warn`.

### Befund 5 — Das x64-Target lieferte eine tote App (erledigt durch Entscheidung)

Gemessen an einem x64-Paketlauf: x86_64-Electron-Shell mit **arm64**-Binaries darin
(`bin/darwin-arm64-146/`, `sqlite-vec-darwin-arm64/vec0.dylib`; `file` bestätigt
`Mach-O 64-bit bundle arm64` neben `Mach-O 64-bit executable x86_64`).
`sqlite-vec-darwin-x64` steht als optionale Abhängigkeit im Lockfile, wird auf einer
arm64-Maschine aber nicht installiert. Ein Intel-DMG wäre bei Auslieferung tot.
**Entscheidung 2026-08-09: x64 wird gestrichen.**

### Befund 6 — Das Archiv trägt Ballast und eine ungetrackte lokale Datei

Ohne `files`-Filter enthielt das Archiv `src/`, `tests/`, `docs/`, alle tsconfigs und
`.claude/settings.local.json` (Schlüssel `mcpServers`, `statusLine`) — eine nicht
versionierte lokale Datei in einem öffentlichen Release-Artefakt.

Gegengemessen mit `files: ["dist/**", "package.json"]`: Bau erfolgreich, Archiv enthält
nur noch `node_modules` (1064), `dist` (18), `package.json`. **Die `node_modules` bleiben
also erhalten** — electron-builder ermittelt den Produktionsbaum getrennt von `files`.
Archivgröße 24 MB → 22 MB.

### Nicht-Befund — der `PATH` ist bereits gelöst

Erwartung war, dass eine per Finder gestartete App nur
`/usr/bin:/bin:/usr/sbin:/sbin` erbt (`launchctl getenv PATH` ist leer) und `tmux` unter
`/opt/homebrew/bin` deshalb nicht findet. Mit `env -i` nachgestellt: **tmux verbindet
trotzdem.** `src/main/util/exec-util.ts` patcht den `PATH` beim Start bereits, inklusive
`/opt/homebrew/bin`, `~/.local/bin` und `~/.claude/local`. Hier ist nichts zu tun.
Offen bleibt allein, dass ein *fehlendes* Werkzeug dem Nutzer nicht erklärt wird — Task 6.

---

## Dateistruktur

| Datei | Verantwortung | Task |
|-------|---------------|------|
| `package.json` (`build`-Block, `scripts`) | Paketkonfiguration: Ausgabeverzeichnis, `files`-Allowlist, arm64, DMG-Layout, Icon | 1, 4, 5 |
| `.gitignore` | `release/` ausschließen | 1 |
| `tests/packaging-config.test.ts` | Regressionswächter für die Paketkonfiguration | 1, 4 |
| `scripts/smoke-packaged.mjs` | Startet das gepackte Artefakt, prüft `graph=ready`, Exit 0/1 | 2 |
| `src/main/graph/native-binding.ts` | asar-sichere Auflösung **beider** nativer Artefakte | 3 |
| `src/main/graph/db.ts` | Lädt `vec0` über den aufgelösten Pfad statt über `sqliteVec.load` | 3 |
| `tests/native-binding.test.ts` | Unit-Tests der Pfadauflösung | 3 |
| `scripts/make-icon.py` | Einmalige, reproduzierbare Icon-Erzeugung (Pillow) | 4 |
| `build/icon.icns`, `build/icon.png` | Erzeugtes, versioniertes Icon-Artefakt | 4 |
| `src/main/util/missing-tool.ts` | Verständliche Meldung für fehlende CLI-Werkzeuge | 6 |
| `tests/missing-tool.test.ts` | Unit-Tests dazu | 6 |
| `src/main/service-lifecycle.ts` | tmux-Degradationsgrund wird handlungsfähig | 6 |
| `src/main/ipc-handlers.ts` | `session:create` prüft das Kommando vor dem Start | 6 |
| `src/main/agent/adapters/claude-code.ts` | `isAvailable()` nutzt den geteilten Helfer | 6 |
| `src/main/util/exec-util.ts` | `isCommandOnPath()` als geteilte Funktion | 6 |
| `README.md` | Statusblock, Installationsanleitung, `xattr`, arm64-only | 7 |

---

## Task 1: Ausgabeverzeichnisse trennen, Archivinhalt begrenzen, Paket-Skripte

**Files:**
- Modify: `package.json` (`scripts`, `build`)
- Modify: `.gitignore`
- Test: `tests/packaging-config.test.ts` (neu)

**Interfaces:**
- Consumes: nichts
- Produces: `npm run pack` erzeugt `release/mac-arm64/cipher keel.app`;
  `npm run dist` erzeugt `release/cipher keel-0.1.0-arm64.dmg`. Task 2 und 8 verlassen
  sich auf genau diesen Pfad des `.app`.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Datei `tests/packaging-config.test.ts`:

```ts
/**
 * Packaging-Konfiguration — Regressionswächter.
 * Phase 8 / Task 1. Jede Zusicherung hier hat einen gemessenen Befund als Anlass
 * (siehe docs/superpowers/plans/2026-08-09-phase-8-packaging.md, „Ausgangslage").
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

interface MacTarget { target: string; arch: string[] }
interface PkgJson {
  main: string
  scripts: Record<string, string>
  build: {
    appId: string
    productName: string
    directories?: { output?: string; buildResources?: string }
    files?: string[]
    mac: { target: MacTarget[]; category: string; icon?: string }
    dmg?: unknown
  }
}

const pkg = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
) as PkgJson

describe('electron-builder configuration', () => {
  it('does not write its output into the electron-vite build directory', () => {
    // Befund 1: Default 'dist' kollidiert mit electron-vite. electron-builder
    // schliesst sein Ausgabeverzeichnis aus dem Archiv aus — die App fehlte.
    expect(pkg.build.directories?.output).toBe('release')
  })

  it('ships only the built app, not sources, tests or local settings', () => {
    // Befund 6: ohne files-Allowlist landeten src/, tests/, docs/ und die nicht
    // versionierte .claude/settings.local.json im Archiv.
    expect(pkg.build.files).toEqual(['dist/**', 'package.json'])
  })

  it('covers the declared entry point with the files allowlist', () => {
    expect(pkg.main).toBe('dist/main/index.js')
  })

  it('targets Apple Silicon only', () => {
    // Befund 5: ein x64-Paket enthielt arm64-Binaries und waere tot ausgeliefert.
    expect(pkg.build.mac.target).toHaveLength(1)
    expect(pkg.build.mac.target[0].arch).toEqual(['arm64'])
  })

  it('never lets electron-builder search for a signing identity', () => {
    for (const script of ['pack', 'dist']) {
      expect(pkg.scripts[script]).toContain('CSC_IDENTITY_AUTO_DISCOVERY=false')
    }
  })

  it('rebuilds the renderer before packaging', () => {
    for (const script of ['pack', 'dist']) {
      expect(pkg.scripts[script]).toContain('npm run build')
    }
  })
})
```

- [ ] **Schritt 2: Test laufen lassen und rot sehen**

Run: `npx vitest run tests/packaging-config.test.ts`
Expected: FAIL — fünf Fehlschläge, u.a.
`expected undefined to be 'release'` und
`expected [ { target: 'dmg', arch: [ 'arm64', 'x64' ] } ] to have a length of 1`.

- [ ] **Schritt 3: `package.json` anpassen**

`scripts` um zwei Einträge ergänzen (die bestehenden bleiben unverändert):

```json
    "pack": "npm run build && CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --mac dir --arm64",
    "dist": "npm run build && CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --mac dmg --arm64",
```

Den `build`-Block vollständig ersetzen durch:

```json
  "build": {
    "appId": "dev.cipher.keel",
    "productName": "cipher keel",
    "directories": {
      "output": "release",
      "buildResources": "build"
    },
    "files": [
      "dist/**",
      "package.json"
    ],
    "mac": {
      "target": [
        {
          "target": "dmg",
          "arch": [
            "arm64"
          ]
        }
      ],
      "category": "public.app-category.developer-tools"
    },
    "dmg": {
      "title": "cipher keel ${version}",
      "contents": [
        { "x": 140, "y": 200, "type": "file" },
        { "x": 400, "y": 200, "type": "link", "path": "/Applications" }
      ]
    }
  }
```

- [ ] **Schritt 4: `.gitignore` ergänzen**

Nach der Zeile `out/` einfügen:

```
release/
```

- [ ] **Schritt 5: Test laufen lassen und grün sehen**

Run: `npx vitest run tests/packaging-config.test.ts`
Expected: PASS (6 Tests)

- [ ] **Schritt 6: Wirklich paketieren und den Archivinhalt nachmessen**

```bash
npm run pack
npx asar list "release/mac-arm64/cipher keel.app/Contents/Resources/app.asar" \
  | awk -F/ '{print $2}' | sort | uniq -c | sort -rn
```

Expected: Der Lauf endet **ohne** `⨯`, und die Aufstellung zeigt genau drei Einträge —
`node_modules`, `dist`, `package.json`. Kein `src`, kein `tests`, kein `docs`, kein
`.claude`.

- [ ] **Schritt 7: Volle Suite und Typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS. Die Testzahl steigt um die sechs neuen; die **exakte Zahl aus der
vitest-Ausgabe** übernehmen, nicht aus dieser Zeile abschreiben und nicht schätzen
(Phase-7-Lehre 3: zählbasierte Wächter durch die Ausgabe der Werkzeuge ersetzen).

> **Achtung:** `npm run pack` hat `@electron/rebuild` ausgelöst. Falls `npm test` jetzt
> fällt, ist die Node-ABI-Binary betroffen — `npm run rebuild-native`, dann erneut.

- [ ] **Schritt 8: Committen**

```bash
git add package.json .gitignore tests/packaging-config.test.ts
git commit -m "build: separate electron-builder output from build dir, limit asar contents

Measured: directories.output defaulted to 'dist', the same directory electron-vite
builds into. electron-builder excludes its own output directory from the archive, so
dist/main/index.js never entered app.asar and packaging aborted with 'entry file is
corrupted'. Output moves to release/, files is limited to the built app.

Also drops the x64 target: a measured x64 package shipped arm64 native addons
(bin/darwin-arm64-146, sqlite-vec-darwin-arm64) inside an x86_64 shell."
```

---

## Task 2: Rauchtest für das gepackte Artefakt — erst das Gate, dann der Fix

**Files:**
- Create: `scripts/smoke-packaged.mjs`
- Modify: `package.json` (`scripts`)
- Modify: `tests/packaging-config.test.ts` (eine Zusicherung ergänzen)

**Interfaces:**
- Consumes: `release/mac-arm64/cipher keel.app` aus Task 1.
- Produces: `npm run smoke:packaged` — Exit 0 wenn der gepackte Main-Prozess
  `[service-lifecycle] Knowledge Graph initialized` meldet, Exit 1 bei
  `Knowledge Graph init failed` oder Zeitüberschreitung. Task 3, 5 und 8 nutzen es
  als Abnahme.

> **Warum dieser Task vor dem Fix kommt:** Phase 7 hat gelehrt, dass ein Gate, dessen
> roter Zustand nie beobachtet wurde, nichts belegt. Der Rauchtest muss gegen das
> heutige, kaputte Paket **rot** gesehen werden, bevor Task 3 ihn grün macht.

- [ ] **Schritt 1: Das Rauchtest-Skript schreiben**

Datei `scripts/smoke-packaged.mjs`:

```js
#!/usr/bin/env node
/**
 * smoke-packaged.mjs — startet das gepackte Artefakt und prueft, ob der
 * Knowledge Graph im Paket wirklich hochkommt.
 *
 * Existiert, weil die Testsuite unter Node laeuft und dort dieselben nativen
 * Artefakte korrekt laedt, die im Paket brechen. Gruene Tests sagen ueber das
 * Paket nichts aus (Handover Phase 7, Abschnitt 9).
 *
 * Nutzt ein Wegwerf-userData-Verzeichnis, damit der echte Graph des Nutzers
 * unberuehrt bleibt.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const APP = 'release/mac-arm64/cipher keel.app/Contents/MacOS/cipher keel'
const READY = '[service-lifecycle] Knowledge Graph initialized'
const FAILED = '[service-lifecycle] Knowledge Graph init failed'
const TIMEOUT_MS = 60_000

if (!existsSync(APP)) {
  console.error(`SMOKE FAIL — no packaged app at ${APP}. Run \`npm run pack\` first.`)
  process.exit(1)
}

const userDataDir = mkdtempSync(join(tmpdir(), 'keel-smoke-'))
const child = spawn(APP, [`--user-data-dir=${userDataDir}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
})

let transcript = ''
let settled = false

function finish(code, message) {
  if (settled) return
  settled = true
  child.kill('SIGTERM')
  // Verdikt zuerst. Electron schreibt nach SIGTERM noch kurz ins userData-
  // Verzeichnis, ein rmSync davor kann mit ENOTEMPTY werfen und die Diagnose
  // verschlucken — beobachtet 2026-08-09. Ein liegengebliebenes Temp-Verzeichnis
  // ist harmlos, ein verlorenes Verdikt nicht.
  console.log(message)
  try {
    rmSync(userDataDir, { recursive: true, force: true })
  } catch {
    // absichtlich geschluckt, siehe oben
  }
  process.exit(code)
}

function onChunk(buffer) {
  transcript += buffer.toString()
  if (transcript.includes(FAILED)) {
    const detail = transcript.slice(transcript.indexOf(FAILED), transcript.indexOf(FAILED) + 700)
    finish(1, `SMOKE FAIL — the graph did not initialise in the packaged app:\n\n${detail}`)
  }
  if (transcript.includes(READY)) {
    finish(0, 'SMOKE PASS — graph=ready in the packaged app')
  }
}

child.stdout.on('data', onChunk)
child.stderr.on('data', onChunk)
child.on('error', (err) => finish(1, `SMOKE FAIL — could not launch ${APP}: ${err.message}`))
child.on('exit', (code) => finish(1, `SMOKE FAIL — app exited (code ${code}) before any graph verdict`))

setTimeout(
  () => finish(1, `SMOKE FAIL — no graph verdict within ${TIMEOUT_MS / 1000}s`),
  TIMEOUT_MS,
)
```

- [ ] **Schritt 2: Das Skript verdrahten**

In `package.json` bei `scripts` ergänzen:

```json
    "smoke:packaged": "node scripts/smoke-packaged.mjs",
```

- [ ] **Schritt 3: Das Gate rot sehen — das ist der Beleg**

```bash
npm run pack
npm run smoke:packaged; echo "exit=$?"
```

Expected: `exit=1` und eine Ausgabe, die den gemessenen Befund 3 zeigt:

```
SMOKE FAIL — the graph did not initialise in the packaged app:

[service-lifecycle] Knowledge Graph init failed: SqliteError: dlopen(
  …/app.asar/node_modules/sqlite-vec-darwin-arm64/vec0.dylib.dylib, 0x000A) …
```

**Diesen roten Lauf im Commit zitieren.** Bekommst du hier Exit 0, ist entweder der
Rauchtest falsch verdrahtet oder du hast einen bereits reparierten Baum — nachsehen,
nicht weitergehen.

- [ ] **Schritt 4: Die Konfigurationszusicherung ergänzen**

In `tests/packaging-config.test.ts` innerhalb des bestehenden `describe`-Blocks ergänzen:

```ts
  it('exposes the packaged smoke test as a script', () => {
    expect(pkg.scripts['smoke:packaged']).toBe('node scripts/smoke-packaged.mjs')
  })
```

- [ ] **Schritt 5: Tests laufen lassen**

Run: `npx vitest run tests/packaging-config.test.ts && npm run typecheck`
Expected: PASS (7 Tests)

- [ ] **Schritt 6: Committen**

```bash
git add scripts/smoke-packaged.mjs package.json tests/packaging-config.test.ts
git commit -m "test: add packaged smoke test, proven red against the current package

Launches the packaged app with a throwaway user-data-dir and waits for the graph
verdict in the main process log. Run against the current build it exits 1 with
'dlopen(.../app.asar/node_modules/sqlite-vec-darwin-arm64/vec0.dylib.dylib) errno=20'
— the failure the next commit fixes."
```

---

## Task 3: asar-sichere Auflösung beider nativer Artefakte

**Files:**
- Modify: `src/main/graph/native-binding.ts`
- Modify: `src/main/graph/db.ts:45-46`
- Test: `tests/native-binding.test.ts` (neu)

**Interfaces:**
- Consumes: `npm run smoke:packaged` aus Task 2 (muss von rot auf grün wechseln).
- Produces:
  - `toUnpackedPath(p: string): string` — biegt ein `app.asar`-Segment auf
    `app.asar.unpacked` um, idempotent, außerhalb eines Pakets ein No-op.
  - `resolveBetterSqliteBinding(moduleRoot: string, platform?: string, arch?: string,
    abi?: string): string | undefined` — unveränderte Signatur, prüft aber gegen den
    entpackten Pfad und warnt beim Fehlschlag.
  - `resolveVecExtensionPath(loadablePath: string): string`.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Datei `tests/native-binding.test.ts`:

```ts
/**
 * Aufloesung nativer Artefakte unter asar.
 * Phase 8 / Task 3. Anlass: im gepackten Build zeigen beide Pfade in app.asar,
 * aus dem sich weder ein .node noch ein .dylib laden laesst.
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  toUnpackedPath,
  resolveBetterSqliteBinding,
  resolveVecExtensionPath,
} from '../src/main/graph/native-binding'

describe('toUnpackedPath', () => {
  it('redirects a path inside app.asar to the unpacked directory', () => {
    expect(
      toUnpackedPath('/Apps/keel.app/Contents/Resources/app.asar/node_modules/x/y.node'),
    ).toBe('/Apps/keel.app/Contents/Resources/app.asar.unpacked/node_modules/x/y.node')
  })

  it('leaves an ordinary development path untouched', () => {
    expect(toUnpackedPath('/repo/node_modules/x/y.node')).toBe('/repo/node_modules/x/y.node')
  })

  it('is idempotent — an already unpacked path is not rewritten twice', () => {
    const p = '/Apps/keel.app/Contents/Resources/app.asar.unpacked/node_modules/x/y.node'
    expect(toUnpackedPath(p)).toBe(p)
  })

  it('does not match a directory that merely starts with app.asar', () => {
    const p = '/repo/app.asarbackup/node_modules/x/y.node'
    expect(toUnpackedPath(p)).toBe(p)
  })
})

describe('resolveBetterSqliteBinding', () => {
  it('returns the addon path when an ABI-matching build exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'keel-binding-'))
    const dir = join(root, 'bin', 'darwin-arm64-146')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'better-sqlite3.node'), '')

    expect(resolveBetterSqliteBinding(root, 'darwin', 'arm64', '146')).toBe(
      join(dir, 'better-sqlite3.node'),
    )
  })

  it('returns undefined when no ABI-matching build exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'keel-binding-'))
    expect(resolveBetterSqliteBinding(root, 'darwin', 'arm64', '146')).toBeUndefined()
  })

  it('checks the unpacked location, not the archive index', () => {
    // Gemessen 2026-08-09: existsSync beantwortet innerhalb von app.asar den
    // Archiv-Index statt die Platte. Geprueft werden muss deshalb der entpackte
    // Pfad — hier nachgestellt: die Datei liegt NUR unter app.asar.unpacked,
    // der uebergebene moduleRoot zeigt aber nach app.asar.
    const tmp = mkdtempSync(join(tmpdir(), 'keel-asar-'))
    const unpackedDir = join(
      tmp, 'app.asar.unpacked', 'node_modules', 'better-sqlite3', 'bin', 'darwin-arm64-146',
    )
    mkdirSync(unpackedDir, { recursive: true })
    writeFileSync(join(unpackedDir, 'better-sqlite3.node'), '')

    const moduleRoot = join(tmp, 'app.asar', 'node_modules', 'better-sqlite3')
    expect(resolveBetterSqliteBinding(moduleRoot, 'darwin', 'arm64', '146')).toBe(
      join(unpackedDir, 'better-sqlite3.node'),
    )
  })
})

describe('resolveVecExtensionPath', () => {
  it('redirects the sqlite-vec loadable path out of the archive', () => {
    expect(
      resolveVecExtensionPath(
        '/Apps/keel.app/Contents/Resources/app.asar/node_modules/sqlite-vec-darwin-arm64/vec0.dylib',
      ),
    ).toBe(
      '/Apps/keel.app/Contents/Resources/app.asar.unpacked/node_modules/sqlite-vec-darwin-arm64/vec0.dylib',
    )
  })

  it('leaves the development path untouched', () => {
    const p = '/repo/node_modules/sqlite-vec-darwin-arm64/vec0.dylib'
    expect(resolveVecExtensionPath(p)).toBe(p)
  })
})
```

- [ ] **Schritt 2: Test laufen lassen und rot sehen**

Run: `npx vitest run tests/native-binding.test.ts`
Expected: FAIL — der Import bricht ab mit
`does not provide an export named 'toUnpackedPath'`.

- [ ] **Schritt 3: `native-binding.ts` ersetzen**

Datei `src/main/graph/native-binding.ts` vollständig ersetzen durch:

```ts
/**
 * native-binding.ts — Aufloesung der nativen Artefakte des Knowledge Graph.
 *
 * Zwei getrennte Probleme, dieselbe Ursache:
 *
 * 1. ABI. vitest laeuft unter Node, die App unter Electron — verschiedene
 *    NODE_MODULE_VERSION. electron-rebuild legt den Electron-Build unter
 *    bin/<platform>-<arch>-<abi>/ ab, waehrend die Standardaufloesung zuerst
 *    build/Release findet (den Node-Build). Ein expliziter nativeBinding laesst
 *    beide nebeneinander bestehen.
 *
 * 2. asar. Im gepackten Build liegen beide Artefakte nominell in app.asar.
 *    Electron biegt process.dlopen selbst auf app.asar.unpacked um, sqlite3s
 *    eigenes dlopen (fuer die vec0-Erweiterung) tut das nicht. Und existsSync
 *    beantwortet innerhalb von app.asar den Archiv-Index statt die Platte —
 *    gemessen 2026-08-09. Deshalb wird jeder Pfad vor Pruefung und Rueckgabe
 *    auf das entpackte Verzeichnis gebogen.
 */

import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'

const ASAR_SEGMENT = `${sep}app.asar${sep}`
const UNPACKED_SEGMENT = `${sep}app.asar.unpacked${sep}`

/**
 * Biegt einen Pfad innerhalb von app.asar auf app.asar.unpacked um.
 * Idempotent; ausserhalb eines gepackten Builds ein No-op.
 */
export function toUnpackedPath(p: string): string {
  if (p.includes(UNPACKED_SEGMENT)) return p
  return p.replace(ASAR_SEGMENT, UNPACKED_SEGMENT)
}

/**
 * Liefert den Pfad zum ABI-passenden better-sqlite3-Addon, oder undefined, wenn
 * keines existiert — dann faellt der Aufrufer auf die Standardaufloesung zurueck.
 *
 * @param moduleRoot Pfad zum better-sqlite3-Paketverzeichnis.
 */
export function resolveBetterSqliteBinding(
  moduleRoot: string,
  platform: string = process.platform,
  arch: string = process.arch,
  abi: string = process.versions.modules,
): string | undefined {
  const candidate = toUnpackedPath(
    join(moduleRoot, 'bin', `${platform}-${arch}-${abi}`, 'better-sqlite3.node'),
  )
  if (existsSync(candidate)) return candidate

  console.warn(
    `[native-binding] no ABI-matching better-sqlite3 addon at ${candidate} — ` +
      'falling back to default resolution, which will load the Node-ABI build and throw',
  )
  return undefined
}

/**
 * Liefert den ladbaren Pfad der sqlite-vec-Erweiterung. sqlite3 laedt sie ueber
 * sein eigenes dlopen, das kein asar kennt — der Pfad muss deshalb auf das
 * entpackte Verzeichnis zeigen.
 *
 * @param loadablePath Rueckgabe von sqliteVec.getLoadablePath().
 */
export function resolveVecExtensionPath(loadablePath: string): string {
  return toUnpackedPath(loadablePath)
}
```

- [ ] **Schritt 4: `db.ts` auf den aufgelösten Pfad umstellen**

In `src/main/graph/db.ts` den Import ergänzen (nach der Zeile
`import * as sqliteVec from 'sqlite-vec'`):

```ts
import { resolveVecExtensionPath } from './native-binding'
```

Und die Ladezeile ersetzen — vorher:

```ts
  // CK-GRAPH-002: Load sqlite-vec extension for vec0 virtual tables.
  sqliteVec.load(db)
```

nachher:

```ts
  // CK-GRAPH-002: Load sqlite-vec extension for vec0 virtual tables.
  // sqliteVec.load() would hand sqlite3 a path inside app.asar, and sqlite3's own
  // dlopen cannot read from the archive. Measured 2026-08-09: the packaged app failed
  // with dlopen(.../app.asar/node_modules/sqlite-vec-darwin-arm64/vec0.dylib.dylib)
  // errno=20. Outside a package the rewrite is a no-op.
  db.loadExtension(resolveVecExtensionPath(sqliteVec.getLoadablePath()))
```

- [ ] **Schritt 5: Unit-Tests laufen lassen und grün sehen**

Run: `npx vitest run tests/native-binding.test.ts`
Expected: PASS (9 Tests)

- [ ] **Schritt 6: Die volle Suite — `openGraphDb` hat viele Aufrufer**

Run: `npm test && npm run typecheck`
Expected: PASS. Jeder Test, der `openGraphDb` benutzt, fährt jetzt durch den neuen
Ladepfad; unter Node ist die Umschreibung ein No-op, es darf sich nichts ändern.

- [ ] **Schritt 7: Das Gate grün sehen — der eigentliche Beweis**

```bash
npm run pack
npm run smoke:packaged; echo "exit=$?"
```

Expected: `exit=0` und `SMOKE PASS — graph=ready in the packaged app`.

Damit ist auch `vec0` bewiesen geladen: `applySchema` legt `vec_chunks` als
`vec0`-Virtual-Table an und würde sonst mitfliegen.

- [ ] **Schritt 8: Committen**

```bash
git add src/main/graph/native-binding.ts src/main/graph/db.ts tests/native-binding.test.ts
git commit -m "fix(graph): resolve native artefacts outside app.asar in packaged builds

sqlite-vec hands sqlite3 the path from require.resolve, which points into app.asar.
sqlite3 loads the extension through its own dlopen, which has no asar awareness, so
the packaged app died with errno=20 on vec0.dylib and degraded graph and kanban.

Also fixes an unsound check in resolveBetterSqliteBinding: existsSync answers from
the asar index rather than from disk inside a package, so the documented undefined
fallback never triggered. Both paths now go through toUnpackedPath, and a miss warns
instead of staying quiet.

npm run smoke:packaged: exit 1 before, exit 0 after."
```

---

## Task 4: App-Icon

**Files:**
- Create: `scripts/make-icon.py`
- Create: `build/icon.png`, `build/icon.icns` (erzeugt, versioniert)
- Modify: `package.json` (`build.mac.icon`)
- Modify: `tests/packaging-config.test.ts`

**Interfaces:**
- Consumes: Paketkonfiguration aus Task 1.
- Produces: `build/icon.icns`; electron-builder meldet
  `default Electron icon is used` nicht mehr.

> **Gestaltung:** monochromes Schiffsquerschnitt-Motiv — Deckbalken, darunter die
> Kiellinie als Parabel, darüber ein Mast. Dunkler Grund (`#0E1116`), heller Strich
> (`#E9E4DA`). Bewusst schlicht und jederzeit austauschbar; der Generator ist
> versioniert, damit die Entscheidung nachvollziehbar und wiederholbar bleibt.
> Voraussetzung ist Pillow (auf dieser Maschine 12.1.1 vorhanden) sowie `iconutil`
> aus den macOS-Bordmitteln.

- [ ] **Schritt 1: Den Generator schreiben**

Datei `scripts/make-icon.py`:

```python
#!/usr/bin/env python3
"""
make-icon.py — erzeugt build/icon.png und build/icon.icns.

Einmalig auszufuehren; die Ergebnisse sind versioniert. Der Generator existiert,
damit das Icon reproduzierbar ist und nicht als undurchsichtiges Binaerartefakt
im Repo liegt.

Benoetigt Pillow und iconutil (macOS-Bordmittel):
    python3 scripts/make-icon.py
"""

import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 1024
BG = (14, 17, 22, 255)       # #0E1116
FG = (233, 228, 218, 255)    # #E9E4DA
STROKE = 46

BUILD = Path(__file__).resolve().parent.parent / "build"
ICONSET = BUILD / "icon.iconset"


def draw_icon() -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=224, fill=BG)

    cx = SIZE / 2
    deck_y = 380
    half_beam = 300

    # Kiellinie: Parabel, tief in der Mitte, steigt zu den Seiten aufs Deck.
    hull = []
    for i in range(61):
        t = -1 + 2 * i / 60
        hull.append((cx + half_beam * t, 760 - 380 * t * t))
    d.line(hull, fill=FG, width=STROKE, joint="curve")

    # Deckbalken
    d.line(
        [(cx - half_beam, deck_y), (cx + half_beam, deck_y)],
        fill=FG,
        width=STROKE,
    )

    # Mast
    d.line([(cx, 190), (cx, deck_y + 40)], fill=FG, width=STROKE)

    return img


def main() -> None:
    BUILD.mkdir(exist_ok=True)
    master = draw_icon()
    master.save(BUILD / "icon.png")

    if ICONSET.exists():
        shutil.rmtree(ICONSET)
    ICONSET.mkdir()

    for base in (16, 32, 128, 256, 512):
        for scale in (1, 2):
            px = base * scale
            suffix = "" if scale == 1 else "@2x"
            master.resize((px, px), Image.LANCZOS).save(
                ICONSET / f"icon_{base}x{base}{suffix}.png"
            )

    subprocess.run(
        ["iconutil", "-c", "icns", str(ICONSET), "-o", str(BUILD / "icon.icns")],
        check=True,
    )
    shutil.rmtree(ICONSET)
    print(f"wrote {BUILD / 'icon.png'} and {BUILD / 'icon.icns'}")


if __name__ == "__main__":
    main()
```

- [ ] **Schritt 2: Generator laufen lassen und das Ergebnis ansehen**

```bash
python3 scripts/make-icon.py
open build/icon.png
```

Expected: `wrote …/build/icon.png and …/build/icon.icns`, und `build/icon.icns`
existiert. **Das Bild wirklich ansehen** — wenn Mast, Deck oder Kiel nicht als Motiv
lesbar sind, sind die Konstanten `deck_y`, `half_beam` und die Parabelformel die
Stellschrauben. Nicht ungesehen weitercommitten.

- [ ] **Schritt 3: Den Test ergänzen**

In `tests/packaging-config.test.ts` innerhalb des bestehenden `describe`-Blocks:

```ts
  it('ships an app icon rather than the Electron default', () => {
    expect(pkg.build.mac.icon).toBe('build/icon.icns')
    expect(existsSync(join(process.cwd(), 'build', 'icon.icns'))).toBe(true)
  })
```

Dafür den Import in derselben Datei erweitern:

```ts
import { existsSync, readFileSync } from 'node:fs'
```

- [ ] **Schritt 4: Test rot sehen**

Run: `npx vitest run tests/packaging-config.test.ts`
Expected: FAIL — `expected undefined to be 'build/icon.icns'`.

- [ ] **Schritt 5: Icon verdrahten**

In `package.json` im Block `build.mac` ergänzen:

```json
      "icon": "build/icon.icns",
```

- [ ] **Schritt 6: Test grün sehen**

Run: `npx vitest run tests/packaging-config.test.ts`
Expected: PASS (8 Tests — 6 aus Task 1, 1 aus Task 2, 1 aus diesem Task)

- [ ] **Schritt 7: Am Paket nachmessen**

```bash
npm run pack 2>&1 | grep -i "icon"
```

Expected: **keine** Zeile `default Electron icon is used`. Zusätzlich
`open release/mac-arm64/` und im Finder prüfen, dass die App das Motiv trägt.

- [ ] **Schritt 8: Committen**

```bash
git add scripts/make-icon.py build/icon.png build/icon.icns package.json tests/packaging-config.test.ts
git commit -m "build: add generated app icon

Monochrome ship-section mark: deck beam, keel parabola, mast. The generator is
versioned so the artefact is reproducible rather than an opaque binary. Removes
electron-builder's 'default Electron icon is used' notice."
```

---

## Task 5: Typ-Pakete aus den Laufzeitabhängigkeiten nehmen

**Files:**
- Modify: `package.json` (`dependencies`, `devDependencies`)

**Interfaces:**
- Consumes: `npm run smoke:packaged` aus Task 2.
- Produces: nichts für spätere Tasks; reine Hygiene.

> **Anlass:** `@types/react` und `@types/react-dom` stehen in `dependencies` und landen
> damit im Auslieferungsarchiv, obwohl sie reine Compile-Zeit-Artefakte sind. Der Task
> steht bewusst **nach** Task 2, damit die Abhängigkeitsoperation gegen ein
> funktionierendes Gate läuft — sie kann die nativen Builds zerstören (Handover
> Abschnitt 9).

- [ ] **Schritt 1: Verschieben**

In `package.json` die beiden Einträge aus `dependencies` entfernen:

```json
    "@types/react": "^19.2.16",
    "@types/react-dom": "^19.2.3",
```

und in `devDependencies` einfügen (alphabetisch nach `@types/node`):

```json
    "@types/react": "^19.2.16",
    "@types/react-dom": "^19.2.3",
```

- [ ] **Schritt 2: Lockfile neu erzeugen und die nativen Builds retten**

```bash
npm install
npm run rebuild-native
```

Expected: `npm install` läuft durch, `rebuild-native` baut beide Varianten.
**Diesen Schritt nicht überspringen** — genau hier ist die Falle dreimal zugeschnappt.

- [ ] **Schritt 3: Typecheck — der eigentliche Test dieses Tasks**

Run: `npm run typecheck`
Expected: PASS. Wären die Typen zur Laufzeit nötig gewesen, fiele es hier auf.

- [ ] **Schritt 4: Suite und Paket**

```bash
npm test
npm run pack && npm run smoke:packaged; echo "exit=$?"
```

Expected: Suite grün, `exit=0`, `SMOKE PASS`.

- [ ] **Schritt 5: Nachmessen, dass die Typen wirklich raus sind**

```bash
npx asar list "release/mac-arm64/cipher keel.app/Contents/Resources/app.asar" \
  | grep -c "node_modules/@types" || echo "0 — keine @types im Archiv"
```

Expected: `0 — keine @types im Archiv`.

- [ ] **Schritt 6: Committen**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): move @types/react and @types/react-dom to devDependencies

They are compile-time only and were being shipped inside app.asar as production
dependencies. Typecheck, suite and packaged smoke test all still green."
```

---

## Task 6: Fehlende Werkzeuge verständlich melden

**Files:**
- Create: `src/main/util/missing-tool.ts`
- Modify: `src/main/util/exec-util.ts`
- Modify: `src/main/service-lifecycle.ts` (`initTmux`, catch-Zweig)
- Modify: `src/main/ipc-handlers.ts` (`SESSION_CREATE`)
- Modify: `src/main/agent/adapters/claude-code.ts` (`isAvailable`)
- Test: `tests/missing-tool.test.ts` (neu)

**Interfaces:**
- Consumes: nichts aus früheren Tasks.
- Produces:
  - `isCommandOnPath(cmd: string): boolean` in `exec-util.ts`
  - `looksLikeMissingCommand(err: unknown): boolean` in `missing-tool.ts`
  - `describeMissingTool(cmd: string): string` in `missing-tool.ts`
  - `describeToolFailure(cmd: string, err: unknown): string` in `missing-tool.ts`

> **Anlass:** Roadmap-Abnahmekriterium für Phase 8 — „Fehlende Abhängigkeiten (tmux,
> Claude Code CLI) erzeugen eine verständliche Meldung statt eines stummen
> Fehlschlags". Heute liefert `initTmux` den rohen Spawn-Fehler als
> Degradationsgrund, und `ClaudeCodeAdapter.isAvailable()` hat null Aufrufer.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Datei `tests/missing-tool.test.ts`:

```ts
/**
 * Verstaendliche Meldungen fuer fehlende CLI-Werkzeuge.
 * Phase 8 / Task 6.
 */

import { describe, it, expect } from 'vitest'
import {
  looksLikeMissingCommand,
  describeMissingTool,
  describeToolFailure,
} from '../src/main/util/missing-tool'
import { isCommandOnPath } from '../src/main/util/exec-util'

describe('looksLikeMissingCommand', () => {
  it('recognises a spawn ENOENT', () => {
    const err = Object.assign(new Error('spawn tmux ENOENT'), { code: 'ENOENT' })
    expect(looksLikeMissingCommand(err)).toBe(true)
  })

  it('recognises the message alone when no code is attached', () => {
    expect(looksLikeMissingCommand(new Error('tmux control mode failed: command not found')))
      .toBe(true)
  })

  it('does not claim an unrelated failure is a missing command', () => {
    expect(looksLikeMissingCommand(new Error('tmux exited with code 1'))).toBe(false)
  })
})

describe('describeMissingTool', () => {
  it('gives an install instruction for tmux', () => {
    expect(describeMissingTool('tmux')).toBe(
      'tmux not found. Install it with: brew install tmux',
    )
  })

  it('gives an install instruction for the Claude Code CLI', () => {
    expect(describeMissingTool('claude')).toBe(
      'Claude Code CLI not found. Install it from: https://claude.com/claude-code',
    )
  })

  it('falls back to a generic instruction for anything else', () => {
    expect(describeMissingTool('gemini')).toBe(
      'gemini not found on PATH. Install it and make sure it is reachable.',
    )
  })
})

describe('describeToolFailure', () => {
  it('replaces a missing-command error with the install instruction', () => {
    const err = Object.assign(new Error('spawn tmux ENOENT'), { code: 'ENOENT' })
    expect(describeToolFailure('tmux', err)).toBe(
      'tmux not found. Install it with: brew install tmux',
    )
  })

  it('passes an unrelated error through unchanged', () => {
    expect(describeToolFailure('tmux', new Error('tmux exited with code 1')))
      .toBe('tmux exited with code 1')
  })
})

describe('isCommandOnPath', () => {
  it('finds a binary that exists in every POSIX PATH', () => {
    expect(isCommandOnPath('ls')).toBe(true)
  })

  it('does not find a binary that cannot exist', () => {
    expect(isCommandOnPath('cipher-keel-no-such-binary')).toBe(false)
  })
})
```

- [ ] **Schritt 2: Test rot sehen**

Run: `npx vitest run tests/missing-tool.test.ts`
Expected: FAIL — `Failed to resolve import "../src/main/util/missing-tool"`.

- [ ] **Schritt 3: `isCommandOnPath` in `exec-util.ts` ergänzen**

In `src/main/util/exec-util.ts` die Imports erweitern:

```ts
import { statSync } from 'node:fs'
import { join } from 'node:path'
```

und nach `getEnhancedPath()` einfügen:

```ts
/**
 * True, wenn cmd als ausfuehrbare Datei in einem Verzeichnis des erweiterten
 * PATH liegt. Synchron, ohne Seiteneffekte — bewusst dieselbe Logik, die
 * ClaudeCodeAdapter.isAvailable() bisher fuer sich allein hielt.
 */
export function isCommandOnPath(cmd: string): boolean {
  const dirs = getEnhancedPath().split(':').filter(Boolean)
  return dirs.some((dir) => {
    try {
      return statSync(join(dir, cmd)).isFile()
    } catch {
      return false
    }
  })
}
```

- [ ] **Schritt 4: `missing-tool.ts` anlegen**

Datei `src/main/util/missing-tool.ts`:

```ts
/**
 * missing-tool.ts — verstaendliche Meldungen fuer fehlende CLI-Werkzeuge.
 *
 * Ein gepacktes 0.1 landet auf Rechnern ohne Entwicklungsumgebung. Ein roher
 * "spawn tmux ENOENT" sagt dort niemandem, was zu tun ist.
 */

const INSTALL_HINTS: Record<string, string> = {
  tmux: 'tmux not found. Install it with: brew install tmux',
  claude: 'Claude Code CLI not found. Install it from: https://claude.com/claude-code',
}

/** True, wenn der Fehler danach aussieht, dass das Kommando gar nicht existiert. */
export function looksLikeMissingCommand(err: unknown): boolean {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    if ((err as { code?: unknown }).code === 'ENOENT') return true
  }
  const message = err instanceof Error ? err.message : String(err)
  return message.includes('ENOENT') || message.includes('command not found')
}

/** Handlungsfaehige Meldung fuer ein fehlendes Werkzeug. */
export function describeMissingTool(cmd: string): string {
  return INSTALL_HINTS[cmd] ?? `${cmd} not found on PATH. Install it and make sure it is reachable.`
}

/**
 * Ersetzt einen "Kommando fehlt"-Fehler durch die Installationsanweisung und
 * laesst jeden anderen Fehler unveraendert durch.
 */
export function describeToolFailure(cmd: string, err: unknown): string {
  if (looksLikeMissingCommand(err)) return describeMissingTool(cmd)
  return err instanceof Error ? err.message : String(err)
}
```

- [ ] **Schritt 5: Test grün sehen**

Run: `npx vitest run tests/missing-tool.test.ts`
Expected: PASS (10 Tests)

- [ ] **Schritt 6: `initTmux` den Grund verbessern lassen**

In `src/main/service-lifecycle.ts` den Import ergänzen (zu den bestehenden
`./util/...`-Importen):

```ts
import { describeToolFailure } from './util/missing-tool'
```

Im catch-Zweig von `initTmux` ersetzen — vorher:

```ts
    setStatus('tmux', 'degraded', reasonOf(err))
```

nachher:

```ts
    setStatus('tmux', 'degraded', describeToolFailure('tmux', err))
```

`reasonOf` bleibt für alle anderen Subsysteme unverändert in Gebrauch.

- [ ] **Schritt 7: `session:create` das Kommando vorprüfen lassen**

In `src/main/ipc-handlers.ts` die Imports ergänzen:

```ts
import { isCommandOnPath } from './util/exec-util'
import { describeMissingTool } from './util/missing-tool'
```

Im `SESSION_CREATE`-Handler direkt **vor** dem Block
`if (!services.tmux.isConnected())` einfügen:

```ts
      // Ein fehlendes CLI wuerde sonst als leere tmux-Session enden, in der eine
      // unverstaendliche Shell-Fehlermeldung steht. CK-NFR-010: sichtbar degradieren.
      if (opts.command) {
        const binary = opts.command.trim().split(/\s+/)[0]
        if (binary && !isCommandOnPath(binary)) {
          return { id: null, name: null, error: describeMissingTool(binary) }
        }
      }
```

- [ ] **Schritt 8: Die Duplikation im Adapter auflösen**

In `src/main/agent/adapters/claude-code.ts` den Rumpf von `isAvailable()` ersetzen —
vorher:

```ts
  isAvailable(): boolean {
    const pathDirs = (process.env.PATH ?? '').split(':').filter(Boolean)
    return pathDirs.some(dir => {
      try {
        return fs.statSync(path.join(dir, 'claude')).isFile()
      } catch {
        return false
      }
    })
  }
```

nachher:

```ts
  isAvailable(): boolean {
    return isCommandOnPath('claude')
  }
```

und den Import ergänzen:

```ts
import { isCommandOnPath } from '../../util/exec-util'
```

Anschließend prüfen, ob `fs` und `path` in dieser Datei noch andere Verwendungen
haben — falls nicht, die nun ungenutzten Importe entfernen, sonst schlägt
`npm run lint` fehl:

```bash
npx eslint src/main/agent/adapters/claude-code.ts
```

- [ ] **Schritt 9: Volle Verifikation**

```bash
npm test && npm run typecheck && npm run lint
```

Expected: alles grün.

- [ ] **Schritt 10: In der laufenden App nachsehen**

Über `.claude/skills/run-keel/` starten und prüfen, dass die StatusBar tmux weiterhin
als `ready` zeigt (tmux ist auf dieser Maschine installiert — die Änderung darf den
Normalfall nicht verändern).

- [ ] **Schritt 11: Committen**

```bash
git add src/main/util/missing-tool.ts src/main/util/exec-util.ts \
        src/main/service-lifecycle.ts src/main/ipc-handlers.ts \
        src/main/agent/adapters/claude-code.ts tests/missing-tool.test.ts
git commit -m "feat: explain missing CLI tools instead of surfacing raw spawn errors

A packaged 0.1 lands on machines without a dev toolchain. 'spawn tmux ENOENT' told
nobody what to do, and session:create would happily open a tmux session running a
command that does not exist. Also folds ClaudeCodeAdapter's private PATH scan into
the shared isCommandOnPath helper."
```

---

## Task 7: README auf den echten Stand heben

**Files:**
- Modify: `README.md` (Statusblock Zeilen 6 und 12–17, Abschnitt „What is not there yet"
  ab Zeile 190, neuer Abschnitt „Install")

**Interfaces:**
- Consumes: das funktionierende DMG-Skript aus Task 1 und den Rauchtest aus Task 2.
- Produces: die Installationsanleitung, auf die die Release Notes in Task 8 verweisen.

- [ ] **Schritt 1: Statusabzeichen und Plattformabzeichen anpassen**

In `README.md` Zeile 6 ersetzen — vorher:

```html
  <img alt="Status" src="https://img.shields.io/badge/status-pre--alpha-orange?style=flat-square&labelColor=000000">
```

nachher:

```html
  <img alt="Status" src="https://img.shields.io/badge/status-0.1%20alpha-orange?style=flat-square&labelColor=000000">
```

Und Zeile 9 — vorher:

```html
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS-lightgrey?style=flat-square&labelColor=000000">
```

nachher:

```html
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20(Apple%20Silicon)-lightgrey?style=flat-square&labelColor=000000">
```

- [ ] **Schritt 2: Den Statusblock ersetzen**

Zeilen 12–17 (der Block `> **Pre-alpha — source only.** …`) vollständig ersetzen durch:

```markdown
> **0.1 alpha — installable, unsigned, Apple Silicon only.** There is a packaged DMG
> and a GitHub release. The click-through path — create a project, open the grid, start
> a session — is wired end to end, and the knowledge graph is verified to come up inside
> the packaged build. What is missing is product polish, not a working system. Read this
> repository as a working system under construction. See [Current state](#current-state)
> for exactly what is and isn't wired up.
```

- [ ] **Schritt 3: Einen Installationsabschnitt einfügen**

Direkt **vor** dem Abschnitt `## Repository layout` einfügen:

````markdown
## Install

Download `cipher keel-0.1.0-arm64.dmg` from the
[latest release](https://github.com/cmarkus42-rgb/cipher-keel-electron/releases/latest),
open it, and drag the app to `/Applications`.

**The build is not code-signed.** macOS will refuse to open it until you clear the
quarantine attribute — once, after installing:

```bash
xattr -cr "/Applications/cipher keel.app"
```

Without this you get *"cipher keel is damaged and can't be opened"*, which is macOS
being terse about a missing signature, not a corrupted download.

### Requirements

- **Apple Silicon Mac** (arm64). There is no Intel build: the native modules ship as
  arm64 binaries, and an x86_64 package would fail at startup rather than degrade
- **macOS 12 or later** (Electron 42 floor)
- **tmux** — `brew install tmux`. Without it, sessions cannot start; the status bar
  says so
- **[Claude Code CLI](https://claude.com/claude-code)** — needed to run an agent
  session. The app finds it on the usual paths (`/opt/homebrew/bin`, `~/.local/bin`,
  `~/.claude/local`) even when launched from Finder

Everything else — the knowledge graph, notes, kanban — works without those two.
````

- [ ] **Schritt 4: „What is not there yet" korrigieren**

Den ersten Aufzählungspunkt ersetzen — vorher:

```markdown
- **No packaged build.** `electron-builder` is configured for a macOS DMG, but no release
  has been produced. Run from source
```

nachher:

```markdown
- **Unsigned and unnotarised.** The DMG needs a manual `xattr -cr` after install (see
  [Install](#install)). Signing is a deliberate 0.1 decision, not an oversight —
  revisit it if the project finds real distribution
```

Und den Punkt „macOS only" ersetzen — vorher:

```markdown
- **macOS only.** tmux plus Unix domain sockets plus keychain. Linux is plausible, Windows is not planned
```

nachher:

```markdown
- **macOS on Apple Silicon only.** tmux plus Unix domain sockets plus keychain. Linux is
  an intended later target and nothing in the packaging setup blocks it; Windows is not
  planned. There is no Intel build
```

- [ ] **Schritt 5: Nachlesen statt annehmen**

```bash
grep -n "pre-alpha\|source only\|No packaged build" README.md
```

Expected: keine Treffer. Bleibt einer stehen, widerspricht das README sich selbst.

- [ ] **Schritt 6: Committen**

```bash
git add README.md
git commit -m "docs: raise README status block to the real 0.1 state

Adds an Install section with the xattr step the unsigned build requires, states the
Apple-Silicon-only constraint plainly, and removes the 'no packaged build' claim."
```

---

## Task 8: DMG bauen, prüfen, Release 0.1 veröffentlichen

**Files:**
- Keine Quelländerungen. Erzeugt `release/cipher keel-0.1.0-arm64.dmg` und ein
  GitHub Release.

**Interfaces:**
- Consumes: alles aus Task 1–7.
- Produces: das Release-Artefakt.

> **Dieser Task enthält einen Schritt, der die Maschine wechselt.** Der Erst-Start auf
> einem fremden Mac ist das eigentliche Abnahmekriterium der Phase und lässt sich hier
> nicht simulieren.

- [ ] **Schritt 1: Sauberer Gesamtlauf**

```bash
npm run rebuild-native
npm test && npm run typecheck && npm run lint
```

Expected: alles grün. Die Testzahl notieren — sie geht in die Release Notes.

- [ ] **Schritt 2: DMG bauen**

```bash
npm run dist
ls -la release/*.dmg
```

Expected: `release/cipher keel-0.1.0-arm64.dmg` existiert, keine `⨯`-Zeile im Protokoll,
und `skipped macOS application code signing` steht drin — das ist hier die erwünschte
Meldung, nicht ein Fehler.

- [ ] **Schritt 3: Rauchtest gegen das mitgebaute `.app`**

```bash
npm run smoke:packaged; echo "exit=$?"
```

Expected: `exit=0`, `SMOKE PASS — graph=ready in the packaged app`.

- [ ] **Schritt 4: Das DMG selbst prüfen, nicht nur das `.app` daneben**

```bash
hdiutil attach "release/cipher keel-0.1.0-arm64.dmg"
ls -la "/Volumes/cipher keel 0.1.0/"
cp -R "/Volumes/cipher keel 0.1.0/cipher keel.app" /Applications/
hdiutil detach "/Volumes/cipher keel 0.1.0"
xattr -cr "/Applications/cipher keel.app"
open "/Applications/cipher keel.app"
```

Expected: Das Volume enthält die App **und** den `/Applications`-Alias (DMG-Layout aus
Task 1). Die App startet, das Projektfenster erscheint, die StatusBar zeigt `graph`
nicht als degradiert.

> Der Schritt installiert in `/Applications` — vor dem Ausführen prüfen, ob dort schon
> eine ältere `cipher keel.app` liegt, die überschrieben würde.

- [ ] **Schritt 5: Das eigentliche Abnahmekriterium — fremder Mac**

Das DMG auf einen zweiten Apple-Silicon-Mac ohne Entwicklungsumgebung übertragen
(kein Node, ggf. kein tmux). Dort installieren, `xattr -cr` ausführen, starten und
festhalten:

1. Startet die App überhaupt?
2. Was sagt die StatusBar zu `graph`, `notes`, `kanban`? (Erwartet: alle `ready` —
   sie brauchen keine externen Werkzeuge.)
3. Was sagt sie zu `tmux`, wenn tmux fehlt? (Erwartet: die Meldung aus Task 6,
   `tmux not found. Install it with: brew install tmux`.)
4. Was passiert beim Versuch, eine Session zu starten, wenn `claude` fehlt?
   (Erwartet: `Claude Code CLI not found. Install it from: …`, keine leere Session.)

**Die Antworten notieren** — sie sind der Beleg der Phase und gehören in die Release
Notes und den Handover. Weicht etwas ab, ist das ein Befund, kein Formfehler.

- [ ] **Schritt 6: Release veröffentlichen**

```bash
git tag -a v0.1.0 -m "cipher keel 0.1.0"
git push origin v0.1.0
gh release create v0.1.0 "release/cipher keel-0.1.0-arm64.dmg" \
  --title "cipher keel 0.1.0" \
  --notes "$(cat <<'NOTES'
First installable build. macOS on Apple Silicon, unsigned.

## Install

Open the DMG, drag the app to /Applications, then clear the quarantine attribute once:

```bash
xattr -cr "/Applications/cipher keel.app"
```

Without this macOS reports the app as damaged — that is the missing signature, not a
bad download.

## Requires

- Apple Silicon Mac, macOS 12+
- `tmux` (`brew install tmux`) to start sessions
- [Claude Code CLI](https://claude.com/claude-code) to run an agent

The knowledge graph, notes and kanban work without either.

## What works

Create a project, open the grid, start a session bound to that project with one of the
four 0.1 entities (Systems Engineer, Architect, Cyber Factory, Workshop). The knowledge
graph runs inside the packaged build — verified by an automated smoke test that launches
the packaged app and checks the graph actually initialises.

## What does not

- Unsigned and unnotarised
- No Intel build
- Entity prompt assembly is not yet wired into session launch
- Idle RAM and cold-start time are not yet measured against this build
- Codex and Gemini adapters are a design target, not implemented

Full detail in the README.
NOTES
)"
```

- [ ] **Schritt 7: Das Release nachprüfen**

```bash
gh release view v0.1.0
```

Expected: Das Artefakt ist angehängt, die Notes sind gerendert, der Tag zeigt auf den
Commit, aus dem gebaut wurde.

- [ ] **Schritt 8: Den Handover fortschreiben**

In `docs/superpowers/plans/2026-08-07-handover-phase-7ff.md` den Abschnitt 3
(„Phase 8 (Packaging) — eine stille Falle") um einen Kopfhinweis ergänzen, der
festhält, was sich als falsch erwiesen hat:

```markdown
> **Phase 8 ist abgeschlossen (2026-08-09).** Zwei Annahmen dieses Abschnitts waren
> falsch: (a) `asarUnpack` war nicht nötig — electron-builder 26 entpackt
> `better-sqlite3` und `sqlite-vec-darwin-arm64` von selbst, und Electron biegt
> `process.dlopen` bereits auf `app.asar.unpacked` um; (b) die Falle war nicht stumm —
> `initGraph` fängt, setzt `degraded` und warnt. Der tatsächliche Bruch lag bei
> `sqlite-vec`: `db.loadExtension()` geht durch sqlite3s eigenes `dlopen`, das kein asar
> kennt. Zusätzlich gefunden: das Ausgabeverzeichnis `dist` kollidierte mit
> electron-vite und verhinderte jeden Paketbau, und `existsSync` beantwortet innerhalb
> von `app.asar` den Archiv-Index statt die Platte, weshalb der zugesagte
> `undefined`-Fallback im Paket nie griff. Detail und Messprotokolle:
> `2026-08-09-phase-8-packaging.md`.
```

- [ ] **Schritt 9: Committen**

```bash
git add docs/superpowers/plans/2026-08-07-handover-phase-7ff.md
git commit -m "docs: record what Phase 8 measured against the handover's assumptions"
```

---

## Was für Linux offen bleibt

Linux ist erklärtes späteres Ziel, aber ausdrücklich **nicht** Teil dieser Phase — die
Roadmap führt es unter „Nicht im Scope" als eigenes Projekt. Was dieser Plan tut, damit
die Tür offen bleibt:

- `toUnpackedPath` arbeitet über `path.sep`, nicht über `'/'`
- kein neuer `process.platform === 'darwin'`-Zweig
- `resolveBetterSqliteBinding` bleibt über `platform`/`arch`/`abi` parametrisiert
- `sqlite-vec` liefert `sqlite-vec-linux-x64` und `sqlite-vec-linux-arm64`; die
  Auflösung über `getLoadablePath()` findet sie ohne Änderung

Was für Linux zusätzlich anfiele und hier bewusst nicht angefasst wird: ein
`linux`-Target in der `build`-Konfiguration samt AppImage- oder deb-Layout, ein
Linux-Runner in der CI, eine Ersetzung der macOS-Keychain-Nutzung, und ein
Rauchtest-Skript, das nicht auf `Contents/MacOS/` zeigt. Das ist eine eigene Phase,
kein Nachtrag zu dieser.

## Bewusst nicht in dieser Phase

- **Notarisierung und Signierung** — Roadmap-Entscheidung 1, revidierbar
- **Größenoptimierung des Archivs.** `@xterm/*`, `@codemirror/*`, `react` und
  `react-dom` stehen als Laufzeitabhängigkeiten in `package.json`, werden aber von vite
  vollständig in die Renderer-Chunks gebündelt und im Archiv nicht mehr gebraucht. Sie
  nach `devDependencies` zu verschieben spart rund 15 MB im 22-MB-Archiv, ändert aber am
  321-MB-Gesamtpaket wenig (das ist Electron selbst) und birgt das Risiko, dass ein
  Hauptprozess-Pfad doch auf eines der Pakete zugreift. Als Befund festgehalten,
  nicht umgesetzt.
- **CK-NFR-008/009-Messungen** — das ist Phase 9, und sie misst an genau dem Build,
  den Task 8 erzeugt

## Abnahmekriterien der Phase

1. `npm run dist` erzeugt ein arm64-DMG ohne Fehler
2. `npm run smoke:packaged` ist grün — und war vor Task 3 nachweislich rot
3. Das DMG ist auf einem zweiten Apple-Silicon-Mac ohne Entwicklungsumgebung
   installierbar und startbar
4. Fehlendes tmux und fehlendes `claude` erzeugen die Meldungen aus Task 6, keine
   stummen Fehlschläge
5. Das Archiv enthält weder `src/`, `tests/`, `docs/` noch `.claude/`
6. README-Statusblock und Release Notes entsprechen dem gemessenen Stand
7. `npm test`, `npm run typecheck`, `npm run lint` sind grün
