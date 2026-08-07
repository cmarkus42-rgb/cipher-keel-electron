# Handover nach Phase 6 — Eingaben für Phase 7 bis 10

**Stand:** 2026-08-07
**Merge:** `8561e8b` auf `main`. Phase 6 ist abgeschlossen und abgenommen.
**Testsuite:** 1390 → **1511** (105 Dateien), Typecheck sauber, beides auf dem gemergten Stand nachgefahren.
**Gepusht:** `4cbb182` auf `origin/main` (2026-08-07). Das Repo ist public.

> **Zweck dieses Dokuments:** Die Roadmap `2026-08-06-fertigstellung-roadmap.md` bleibt gültig, aber
> Phase 6 hat einige ihrer Annahmen widerlegt und neue Befunde erzeugt. Was hier steht, ist das, was
> ein Bearbeiter der Phasen 7–10 wissen muss und aus Code oder Git-Historie nicht ableiten kann.

---

## 1. Was Phase 6 geändert hat — und was das für die Folgephasen bedeutet

### Neue Module, die es vorher nicht gab

| Datei | Verantwortung | Relevant für |
|-------|---------------|--------------|
| `src/main/service-lifecycle.ts` | Fenster-unabhängige, idempotente Service-Init **und** `shutdownServices` | 9 (Startzeit), 8 (Quit-Verhalten) |
| `src/main/event-bus.ts` | Broadcast an alle lebenden Fenster | 10 (Adapter-Events) |
| `src/main/graph/native-binding.ts` | ABI-genaue Auflösung der better-sqlite3-Binary | **8 (Packaging) — kritisch** |
| `src/shared/service-status.ts` | Subsystem-Status + typisierter Fehler + `errorMessage()` | 7, 9 |
| `src/main/project/kickoff.ts` | Elektron-freier Kickoff-Kern | 7 (Testmuster) |
| `src/main/session/session-context.ts` | Session ↔ Projekt ↔ Graph | 10 |
| `src/shared/preset-catalog.ts` | Die vier 0.1-Rollen | **10 (Adapter)** |

### Widerlegte Roadmap-Annahmen

- **„Native Module im gepackten Build verifizieren" (Phase 8) war zu spät angesetzt.** Der Bruch
  bestand bereits im Dev-Build: `better-sqlite3` war gegen Node-ABI 141 gebaut, Electron 42 braucht
  146. Der Knowledge Graph war in der **laufenden App komplett tot**, während alle 1390 Tests grün
  waren — weil vitest unter Node läuft und dort dieselbe Binary korrekt lädt. Gelöst in Phase 6
  (Task 0). Die Lehre gilt weiter: *grüne Tests sagen in diesem Repo nichts über die Verdrahtung.*
- **Phase 6 hatte eine Lücke, die keine Task abdeckte:** Es gab überhaupt keinen Weg, das
  Grid-Fenster zu öffnen — `window:open-grid` war registriert, aber kein Renderer-Code, kein Menü,
  kein Shortcut rief es je auf. Nachgetragen als Task 9.

---

## 2. Phase 7 (CI-Pipeline) — konkrete Eingaben

### 2.1 Blocker: `npm run lint` ist kaputt

```
$ npm run lint
> eslint src --ext .ts
sh: eslint: command not found
```

`package.json` deklariert das Lint-Skript, aber **`eslint` steht nicht in den `devDependencies`**
und ist nicht installiert. Konsequenz: Auf den ~5.900 Zeilen aus Phase 6 lief kein Lint-Gate, und
die geplante Pipeline (`typecheck` + `lint` + `test`) würde am Lint-Schritt scheitern.

**Vor allem anderen in Phase 7:** ESLint samt TypeScript-Plugin als devDependency ergänzen, eine
Konfiguration anlegen, und den Bestand einmal durchlaufen lassen. Rechne mit Nacharbeit — der Code
ist nie gelintet worden.

### 2.2 Typecheck muss ein eigenständiges Pflicht-Gate sein

vitest transformiert TypeScript per esbuild und **prüft dabei keine Typen**. Ein IPC-Kanal, der in
der falschen Union stünde (`MainToRenderer` statt `RendererToMain`), würde `npm test` nicht rot
machen — nur `tsc --noEmit` fängt das. `npm test` allein als CI-Gate wäre trügerisch.

### 2.3 Der Testansatz hat eine benannte blinde Stelle

**Kein Test in diesem Repo erreicht je einen `ipcMain`-Handler.** Es existiert kein
`vi.mock('electron')`, und `src/main/ipc-handlers.ts` ist inzwischen genau der Ort, an dem die
Komposition lebt: `session:create` macht Projektauflösung → Preset-Gating → Kontextableitung →
tmux connect/create/watch → Graph-Write, und nichts davon ist abgedeckt.

Drei der sechs Befunde aus dem Schluss-Review von Phase 6 waren derselbe Fehler: Eine Task änderte
eine Antwortform, ergänzte das Feld im Handler oder im Hook, und hörte auf, bevor eine Komponente
es rendert. **`npm run typecheck` kann diese Klasse nachweislich nicht fangen**, weil die Bridge
`(window as any).cipherKeel` ist.

**Empfohlenes Muster** — das dieser Branch bereits erfunden hat: Kern als reine Funktion mit
injizierten Abhängigkeiten extrahieren, Handler als dünner Adapter. Vorbilder im Code:
`runKickoff(deps, payload)` in `src/main/project/kickoff.ts` und
`initializeServices(services, ctx)` in `src/main/service-lifecycle.ts`.
Als nächstes anbietet sich `createSessionForProject(deps, opts)`.

### 2.4 CI-Betrieb

- macOS-Runner ist Pflicht (tmux, Unix-Sockets, Keychain).
- `better-sqlite3` braucht auf dem Runner einen nativen Build. **Wichtig:** Wenn die CI zusätzlich
  die App startet (nicht nur Tests), braucht sie `electron-rebuild` — sonst greift derselbe
  ABI-Bruch wie in Befund 4. Für reine `npm test`-Läufe genügt der Node-Build.

---

## 3. Phase 8 (Packaging) — eine stille Falle

`resolveBetterSqliteBinding(moduleRoot)` (`src/main/graph/native-binding.ts`) sucht unter
`<moduleRoot>/bin/<platform>-<arch>-<abi>/better-sqlite3.node` und gibt `undefined` zurück, wenn
dort nichts liegt — dann fällt `openGraphDb` auf die Default-Auflösung zurück.

Im gepackten Build liegt `node_modules` in `app.asar`, aus dem sich **keine `.node`-Datei laden
lässt**. Ohne `asarUnpack`-Eintrag für `better-sqlite3` findet der Resolver nichts, die
Default-Auflösung schlägt ebenfalls fehl — und das Ganze passiert **ohne Warnung**, weil der
Resolver ein legitimes `undefined` liefert statt zu meckern. Symptom im Paket: Graph degradiert,
App läuft weiter, niemand weiß warum.

**Zu tun:**
- `asarUnpack` für `better-sqlite3` (und `sqlite-vec-darwin-arm64`) in den `build`-Block
- `app.getAppPath()` zeigt im Paket auf `app.asar` — der an `initializeServices` übergebene
  `appPath` muss auf das **entpackte** Verzeichnis zeigen (`app.asar.unpacked`)
- Erwäge, den Resolver bei Nichtfinden `console.warn`en zu lassen, damit die Falle nicht stumm bleibt
- Signierung ist entschieden: **unsigniert**, `xattr -cr`-Anleitung prominent ins README (Roadmap
  Entscheidung 1)

---

## 4. Phase 9 (NFR-Verifikation) — zwei Hinweise zur Messmethode

1. **Die Init-Reihenfolge wurde in Phase 6 korrigiert, kurz bevor sie die Messung verfälscht hätte.**
   Ursprünglich wurde `initVoice` (Whisper-/Piper-Modell von Platte) **vor** Graph und Notes
   abgewartet, und `voice.enabled` ist per Default `true`. Die gemessene Startzeit hätte damit das
   Modell-Laden abgebildet, nicht den Graph. Jetzt läuft Voice fire-and-forget; die Reihenfolge ist
   Graph → Notes → Voice, in einem echten App-Lauf bestätigt.
2. **CK-NFR-009 (Idle-RAM) und CK-NFR-008 (Start < 5s) sind weiterhin ungemessen.** Die
   Service-Init hängt an `setImmediate` hinter `app.whenReady()`, das Fenster zeichnet zuerst —
   aber das ist eine Konstruktionsaussage, keine Messung. Am Produktionsbuild messen, nicht am
   Dev-Server.

---

## 5. Phase 10 (Adapter-Garten) — was jetzt existiert

- `src/shared/preset-catalog.ts` liefert die vier 0.1-Rollen als UI-Metadaten; `LauncherCell` zeigt
  sie an; `SESSION_CREATE` validiert die `entityId` gegen `isKnownPresetId` und fällt sonst auf
  `defaultPresetId()` zurück.
- **Nicht angeschlossen:** `assembleEntityClaudeMd` (`src/main/session/assemble-entity.ts`) hat
  weiterhin **null Produktions-Aufrufer**. Die Preset-*Auswahl* steht, der Prompt-*Zusammenbau*
  nicht. Das war in Phase 6 bewusst ausgeklammert (siehe Risiko-Abschnitt des Phase-6-Plans) und ist
  die erste echte Arbeit, sobald ein zweiter Adapter Sinn ergeben soll.
- `AdapterRegistry` (`src/main/agent/registry.ts`) hat weiterhin genau eine Implementierung
  (`claude-code`). Die Schnittstelle ist damit unbewiesen — das ist der Kern von Phase 10.

---

## 6. Offene Befunde aus Phase 6 (bewusst nicht behoben)

### Für den Nutzer sichtbar

| Befund | Ort | Bewertung |
|--------|-----|-----------|
| ~~macOS-Ampel überlappt die Sidebar-Tabs~~ | `src/renderer/index.tsx` (`TitleBar`) | **Behoben** (`157b408`). 28px-Streifen mit 78px Freiraum links und `app-region: drag` — hält die Ampel frei und macht das Fenster wieder verschiebbar. In der laufenden App nachgemessen. |

### Technische Schulden

| Befund | Ort | Bewertung |
|--------|-----|-----------|
| ~~Unhandled Rejection im Test-Teardown~~ | `src/main/notes/note-manager.ts` | **Behoben in Phase 7** (`ac7db3f`). **Korrektur einer Falschaussage in diesem Dokument:** hier stand, der Exit-Code bleibe 0 und es sei kein CI-Blocker. Das war falsch — es beruhte auf zwei Messungen. Tatsaechlich gemessen: **3 von 6 Laeufen endeten mit Exit 1** bei jeweils 1511 gruenen Tests, also rund 50 % Flake-Rate; auf dem GitHub-Runner ebenso. Ursache: der Konstruktor feuerte `void fs.mkdir(...)` als freischwebende Promise, die unbehandelt rejectete, wenn das Test-Teardown das Verzeichnis zuerst entfernte — vitest wertet das als Fehlschlag des Laufs. Fix: `fsSync.mkdirSync`, passend zum bereits synchronen `cleanTrash()` daneben. Nachgewiesen mit 12 von 12 sauberen Laeufen. **Lehre: zwei Stichproben bei einem 50-%-Fehler sind kein Befund.** |
| Später Voice-Status nach Shutdown | `service-lifecycle.ts` | `shutdownServices` setzt den Status synchron zurück, während ein fire-and-forget `initVoice` noch laufen kann; dessen Fortsetzung schreibt danach einen Voice-Status und sendet einen späten Broadcast. Harmlos (App beendet sich, `broadcast` verträgt tote Fenster), ungetestet. |
| Projekt-Dedup vergleicht Pfade unnormalisiert | `project-manager.ts` | `p.rootPath === rootPath` ohne `path.resolve`. `/tmp/x` und `/tmp/x/` gelten als verschieden. Ändert außerdem still den Vertrag von `project:create` (liefert bei gleichem Pfad den bestehenden Datensatz statt einen neuen). Latent — kein aktueller Aufrufer betroffen. |
| `getServiceStatus()` gibt das lebende Objekt zurück | `service-lifecycle.ts` | IPC serialisiert, der Renderer ist sicher; ein Main-Prozess-Aufrufer bekäme aber einen Griff auf internen Zustand. Flache Kopie zurückgeben. |
| `NodeAttrMap` hat keinen `session`-Eintrag | `src/main/graph/node-types.ts` | `'session'` wurde zu `NODE_KINDS`, `REQUIRED_FRONTMATTER_FIELDS` und `ALLOWED_FRONTMATTER_FIELDS` ergänzt, aber es gibt kein `SessionAttrs`-Interface. `NodeAttrMap` ist ein Interface statt `Record<NodeKind, …>`, deshalb fällt tsc das nicht auf — jede andere Knotenart hat einen. Entweder ergänzen oder `NodeAttrMap` zu `Record` machen, damit die nächste Knotenart es nicht überspringen kann. |
| `services:status-changed` feuert erst seit dem Schluss-Fix | `service-lifecycle.ts` | Funktioniert (`setStatus` broadcastet bei echtem Übergang, kein Sturm beim Start). Erwähnt, weil eine „Reconnect"-Aktion auf der StatusBar die naheliegende Phase-7-Erweiterung wäre und dem Statussystem einen Zweck über die Anzeige hinaus gäbe. |

---

## 7. Konzept-Hoheit — Nachzug außerhalb dieses Repos

Nach der Regel in `CLAUDE.md` („Weichen Konzept und Bau voneinander ab, wird das Konzept
präzisiert — in den Ideation-Verzeichnissen, nicht im Repo"):

- **Die Graph-Knotenart `session` ist neu.** Sie wurde in Phase 6 zu `NODE_KINDS` ergänzt, weil
  `writeSessionNode` sie schreibt und das Vokabular sie nicht kannte. Additive Änderung, keine
  Migration nötig (kein SQL-`CHECK` auf `kind`). **Aber:** `NODE_KINDS` speist auch das
  MCP-Tool-Schema (`src/main/graph/mcp-server.ts`), das heißt das Vokabular, das Agenten sehen, ist
  jetzt breiter als das Konzept. Das gehört in die M1-/Graph-Konzeptdokumente nachgezogen.
- Die Frontmatter-Felder der Knotenart sind `project_id`, `entity`, `cwd`.

---

## 8. Was ein Bearbeiter zuerst lesen sollte

1. `docs/superpowers/plans/2026-08-06-fertigstellung-roadmap.md` — Reihenfolge und Abgrenzung
2. Dieses Dokument
3. `docs/superpowers/plans/2026-08-06-phase-6-service-lifecycle.md` — der Detailplan mit den
   Befund-Verifikationen (Abschnitt „Verifikation der Befunde") und den Risiken

**Reihenfolge-Empfehlung unverändert:** Phase 7 (CI) und Phase 8 (Packaging) können parallel
starten, 7 ist billiger und schützt 8. Phase 9 misst am Produktionsbuild aus 8. Phase 10 ist von
allem anderen unabhängig, sobald `assembleEntityClaudeMd` angeschlossen ist.
