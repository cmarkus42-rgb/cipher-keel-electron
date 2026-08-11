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

## 2. Phase 7 (CI-Pipeline) — ERLEDIGT (2026-08-08, Merge `56f13a0`)

> Phase 7 ist abgeschlossen und auf `main`. Was unten als Eingabe stand, ist umgesetzt:
> ESLint installiert und der Bestand von 152 Treffern bereinigt; Typecheck als eigenes Gate
> **und repariert** (`tsc --noEmit` prüfte bei Project References null Dateien — 28 echte
> Typfehler kamen zum Vorschein und sind behoben); `npm ci` auf frischem Klon repariert; ein
> Test-Flake beseitigt, der die Hälfte aller Läufe rot machte.
>
> **Die Pipeline:** macOS-Runner, vier Gates (typecheck, lint, test, build), ~36 s bei warmem
> Cache, grüner Lauf auf `main` (`31255005585`), Badge `passing`. **Jedes Gate ist einzeln rot
> bewiesen** — typecheck `31253354400`, lint `31208508223`, test `31208403719`,
> build `31210760855`.
>
> Neu im Repo: `CONTRIBUTING.md`, `SECURITY.md` (Private Vulnerability Reporting aktiviert),
> `tsconfig.test.json` (die Tests waren von keinem Typecheck erfasst),
> `src/shared/cipher-keel-bridge.ts` (eine statt zwei `Window.cipherKeel`-Deklarationen, jetzt
> mit typisierten Kanalnamen), `.claude/skills/run-keel/` (Treiber für die laufende App).
>
> **Was für Phase 8+ bleibt** — siehe Abschnitt 6.

### Ursprüngliche Eingaben (historisch)

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

> **Nachtrag (Stand 2026-08-09/10):** Die Paketierung ist gebaut und gegen ein
> automatisiertes Smoke-Skript geprüft — Details und Messprotokolle in
> `2026-08-09-phase-8-packaging.md`. **Bewusst noch offen:** ein Release ist nicht
> veröffentlicht (menschliche Entscheidung, kein Befund), und der Erst-Start auf einem
> zweiten Apple-Silicon-Mac ohne Entwicklungsumgebung ist ungeprüft. Zwei Annahmen dieses
> Abschnitts waren falsch: (a) `asarUnpack` war nicht nötig — electron-builder 26
> entpackt `better-sqlite3` und `sqlite-vec-darwin-arm64` von selbst, und Electron biegt
> `process.dlopen` bereits auf `app.asar.unpacked` um; (b) die Falle war nicht stumm —
> `initGraph` fängt, setzt `degraded` und warnt, und das galt schon seit Phase 6, nicht
> erst seit einem Phase-8-Fix. Der tatsächliche Bruch lag bei `sqlite-vec`:
> `db.loadExtension()` geht durch sqlite3s eigenes `dlopen`, das kein asar kennt.
> Zusätzlich gefunden: das Ausgabeverzeichnis `dist` kollidierte mit electron-vite und
> verhinderte jeden Paketbau, und `existsSync` beantwortet innerhalb von `app.asar` den
> Archiv-Index statt die Platte, weshalb der zugesagte `undefined`-Fallback im Paket nie
> griff. Die unten durchgestrichenen Stellen sind entsprechend widerlegt; die
> „Zu tun"-Liste ist um den tatsächlichen Stand ergänzt.

`resolveBetterSqliteBinding(moduleRoot)` (`src/main/graph/native-binding.ts`) sucht unter
`<moduleRoot>/bin/<platform>-<arch>-<abi>/better-sqlite3.node` und gibt `undefined` zurück, wenn
dort nichts liegt — dann fällt `openGraphDb` auf die Default-Auflösung zurück.

Im gepackten Build liegt `node_modules` in `app.asar`, aus dem sich **keine `.node`-Datei laden
lässt**. ~~Ohne `asarUnpack`-Eintrag für `better-sqlite3` findet der Resolver nichts, die
Default-Auflösung schlägt ebenfalls fehl — und das Ganze passiert **ohne Warnung**, weil der
Resolver ein legitimes `undefined` liefert statt zu meckern. Symptom im Paket: Graph degradiert,
App läuft weiter, niemand weiß warum.~~ **Widerlegt (siehe Nachtrag oben):** electron-builder 26
entpackt `better-sqlite3` von selbst, ganz ohne `asarUnpack`-Eintrag, und `initGraph`
(`src/main/service-lifecycle.ts`, seit Phase 6) fängt den Fehlerfall bereits ab, setzt `graph` und
`kanban` auf `degraded` und schreibt `console.warn` — nie stumm gewesen. Der tatsächliche Bruch lag
bei `sqlite-vec`, siehe Nachtrag oben.

**Zu tun:**
- ~~`asarUnpack` für `better-sqlite3` (und `sqlite-vec-darwin-arm64`) in den `build`-Block~~
  **Nie nötig gewesen** — electron-builder 26 entpackt beide nativen Pakete automatisch, ohne
  eigenen `build`-Eintrag
- ~~`app.getAppPath()` zeigt im Paket auf `app.asar` — der an `initializeServices` übergebene
  `appPath` muss auf das **entpackte** Verzeichnis zeigen (`app.asar.unpacked`)~~ **Gelöst, aber
  anders als hier beschrieben:** `appPath` bleibt unverändert und zeigt weiterhin auf `app.asar`;
  die Umschreibung passiert pro Pfad in `resolveBetterSqliteBinding` und
  `resolveVecExtensionPath` über `toUnpackedPath()` (`src/main/graph/native-binding.ts`), nicht am
  `appPath` selbst
- ~~Erwäge, den Resolver bei Nichtfinden `console.warn`en zu lassen, damit die Falle nicht stumm
  bleibt~~ **Erledigt** — `resolveBetterSqliteBinding` warnt bei Nichtfinden
  (`src/main/graph/native-binding.ts`)
- Signierung ist entschieden: **unsigniert**, `xattr -cr`-Anleitung prominent ins README (Roadmap
  Entscheidung 1) — unverändert aktuell

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
| ~~Unhandled Rejection im Test-Teardown~~ | `src/main/notes/note-manager.ts` | **Behoben in Phase 7** (`ac7db3f`). **Korrektur einer Falschaussage in diesem Dokument:** hier stand, der Exit-Code bleibe 0 und es sei kein CI-Blocker. Das war falsch — es beruhte auf zwei Messungen. Tatsaechlich gemessen: **3 von 6 Laeufen endeten mit Exit 1** bei jeweils 1511 gruenen Tests, also rund 50 % Flake-Rate; auf dem GitHub-Runner ebenso. Ursache: der Konstruktor feuerte `void fs.mkdir(...)` als freischwebende Promise, die unbehandelt rejectete, wenn das Test-Teardown das Verzeichnis zuerst entfernte — vitest wertet das als Fehlschlag des Laufs. Fix: `fsSync.mkdirSync`, passend zum bereits synchronen `cleanTrash()` daneben. Nachgewiesen mit 10 sauberen Laeufen des Implementers plus 12 unabhaengigen des Controllers (22 insgesamt, 0 Fehlschlaege). **Lehre: zwei Stichproben bei einem 50-%-Fehler sind kein Befund.** |
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


---

## 9. Nachtrag nach Phase 7 (2026-08-08)

### Die Falle, die dreimal zuschnappte — und wieder zuschnappen wird

`better-sqlite3` existiert zweimal im `node_modules`: gegen Electrons ABI (für die App, unter
`bin/darwin-arm64-<abi>/`) und gegen Nodes ABI (für vitest, unter `build/Release`). **Jede
Abhängigkeitsoperation kann eines oder beide zerstören**, und `engines: ">=22"` erlaubt jede
Node-Version ab 22, während die gebaute Binary immer nur zu genau einer passt.

In Phase 7 ist das dreimal passiert: bei der Lockfile-Neuerzeugung, beim Testlauf unter
gewechseltem Node, und in der Schluss-Fixwelle — dort war das Electron-Artefakt **ganz
verschwunden** und lokal fielen 497 Tests, während die CI grün blieb (sie installiert frisch
unter Node 22).

**Gegenmittel, jedes Mal:** `npm run rebuild-native` (baut beide). Dokumentiert in
`CONTRIBUTING.md`. Erzwingbar ist es nicht — es bleibt eine manuelle Disziplin.

**Merkregel:** Grüne Tests sind kein Beleg, dass beide Builds in Ordnung sind. Die Testseite ist
genau die, die weiterläuft, wenn die Electron-Seite bricht. Nach jeder Abhängigkeitsänderung die
App einmal über `.claude/skills/run-keel/` starten und `graph=ready` prüfen.

### Offene Befunde aus Phase 7

| Befund | Ort | Bewertung |
|--------|-----|-----------|
| Zwei nackte `eslint-disable` ohne Begründung | `src/main/voice/stt-engine.ts:79,103` | Älter als Phase 7 (aus der Zeit, als ESLint nie lief). Widerspricht dem Standard der Phase. |
| Ein weiteres nacktes `eslint-disable` | `tests/phase4a-rolling-summary.test.ts:30` | Dasselbe Muster wurde anderswo in Phase 7 durch Wegfall des Casts behoben — zwei Behandlungen für einen Fall. |
| `npm audit`: 1 moderate **und 1 high** | `vite <=6.4.2`, verschachteltes `esbuild` | Nur Dev-Server, aber der Stand im Ledger war veraltet. Bewusst annehmen oder `vite` anheben. |
| `executeCommand` sendet `threadId: null` statt zu werfen | `src/main/nanoclaw/adapter.ts` | Anders als das Geschwister in `ClaudeCodeAdapter`. Null Aufrufer — offene Designfrage, ob die Methode überhaupt schon funktionieren soll. |
| GitHub-Actions per Major-Tag statt SHA gepinnt | `.github/workflows/ci.yml` | Auf einem public Repo eine Lieferketten-Erwägung. Repo-Default ist `read`. |

### Empfehlungen aus dem Schluss-Review

1. **Typ-bewusstes Linting einschalten.** `@typescript-eslint/no-floating-promises` hätte den
   `void fs.mkdir(...)`-Flake gefunden, der eine Fix-Runde und die halbe CI-Glaubwürdigkeit
   gekostet hat. Braucht `parserOptions.projectService` — die Solution-tsconfig unterstützt das
   jetzt.
2. **Den CI-Check auf `main` als erforderlich schalten.** Ein Gate, das nichts erzwingt, ist eine
   Empfehlung.
3. **Zählbasierte Regressionswächter durch die Ausgabe der Werkzeuge ersetzen.** vitest meldet
   übersprungene Tests, `tsc` Fehlerzahlen, eslint Trefferzahlen. Ein `grep`, der das annähert,
   kann in die beruhigende Richtung falsch liegen — die schlimmste Art.
4. **Wer im Kommentar behauptet, was Code früher tat, zitiert die Zeile, die es belegt.** Phase 7
   produzierte zwei selbstbewusst falsche Begründungen; die zweite kam im Commit direkt nach der
   Korrektur der ersten. Ein Review-Durchgang reicht gegen dieses Muster nicht.

---

## 10. Offene Befunde aus Phase 8

> Aus dem Ledger des gitignorierten SDD-Arbeitsordners zu Phase 8 (inzwischen gelöscht)
> und dem Schluss-Review über den gesamten Branch
> (`a6c6bbb..6ceb286`, 16 Commits). Reviewer-Verdikt dort: **bereit zum Merge mit Fixes**,
> 0 Critical, 2 Important (beide dokumentarisch, in einer Fix-Welle erledigt), 7 Minor. Die
> Punkte unten sind die, die der Reviewer ausdrücklich als nicht-blockierend eingestuft hat.

| Befund | Ort | Bewertung |
|--------|-----|-----------|
| Leeres `catch {}` um das Cleanup | `scripts/smoke-packaged.mjs:44-47` | Fängt jeden Fehler von `rmSync` ab, nicht nur die dokumentierte ENOTEMPTY-Race beim Teardown. Läuft erst nach `console.log(message)` — das Verdict ist zu diesem Zeitpunkt bereits geschrieben, betroffen ist nur noch das Aufräumen des Temp-Verzeichnisses. Ein verschluckter Fehler bleibt trotzdem unsichtbar, es gibt kein Log nach stderr. |
| `console.log` unmittelbar vor `process.exit` | `scripts/smoke-packaged.mjs:41,48` | Auf gepipetem, nicht-TTY-stdout kann `process.exit()` den Node-Puffer abschneiden, bevor er geflusht ist. In jedem bisherigen Lauf empirisch nicht aufgetreten — bedroht aber genau das Ziel, für das dieses Skript in Task 2 bereits umgebaut wurde ("das Verdict darf nicht verloren gehen"). **Präzisierte Bedingung:** das muss behoben sein, bevor das Gate je in CI läuft — vorher, nicht als Reaktion auf einen ersten unklaren roten CI-Lauf, dessen Ursache sich dann selbst verschluckt hätte. |
| `existsSync(APP)` prüft Existenz, nicht Aktualität; `APP` ist ein relativer Pfad | `scripts/smoke-packaged.mjs:19,24` | Der Check bestätigt nur, dass irgendein Paket an dem Pfad liegt — nicht, dass es aus dem aktuellen Checkout stammt. Ein Gate-Lauf ohne vorangehendes `npm run pack` misst still ein veraltetes Artefakt. Zusätzlich ist `APP` relativ; das Skript ist nur korrekt, wenn es aus dem Repo-Root aufgerufen wird. |
| `make-icon.py` räumt bei `iconutil`-Fehler nicht auf | `scripts/make-icon.py` | `check=True` wirft, bevor das `rmtree` des Iconset-Ordners erreicht wird — `build/icon.iconset` bleibt liegen. Handlauf-Skript (einmalig von einem Menschen ausgeführt), geringe Eintrittswahrscheinlichkeit, bewusst nicht behoben. |
| `claudeCli` wird einmalig bei Init geprüft, nie erneut | `src/main/service-lifecycle.ts:230-233` (`isCommandOnPath('claude')`) | Konkrete Konsequenz, nicht nur Mechanik: genau der Nutzer, für den diese Diagnose gebaut wurde — ein frischer Mac ohne Toolchain — installiert die CLI auf Anweisung der Meldung, und die StatusBar meldet sie trotzdem weiter als fehlend, bis die App neu gestartet wird. Die Diagnose stimmt also nur einmal pro App-Start. |
| Asar-Fix beruht auf electron-builders impliziter Auto-Unpack-Heuristik, nicht auf einem `asarUnpack`-Eintrag | `package.json` (`build`-Block, kein `asarUnpack`), `src/main/graph/native-binding.ts` | Für electron-builder 26.8.1 geprüft und wahr. `electron-builder` ist aber mit `^`-Range gepinnt — die Heuristik ist nicht vertraglich zugesichert. Das Einzige, was eine Regression bei einem Minor-Update auffangen würde, ist der Smoke-Test, und der läuft nicht in CI. |
| `isCommandOnPath` splittet `PATH` auf einem literalen `':'` statt `path.delimiter` | `src/main/util/exec-util.ts:39` | Konsistent mit dem bereits bestehenden `getEnhancedPath()` (Zeile 24), das denselben literalen Trenner verwendet — keine neue Inkonsistenz. Verstößt aber gegen die Regel „plattformneutral, wo es nichts kostet" — relevant, sobald Linux ernsthaft versucht wird. |
| `tests/packaging-config.test.ts` pinnt den literalen Befehlsstring des Smoke-Skripts | `tests/packaging-config.test.ts:74` | Erwartet `pkg.scripts['smoke:packaged'] === 'node scripts/smoke-packaged.mjs'`. Die naheliegende Reparatur des Staleness-Befunds oben (den Aufruf z. B. an ein vorgeschaltetes `npm run pack` zu koppeln) müsste also auch diesen Test anfassen. |
| `vite`-Peer-Mismatch (vitest verlangt `^6\|\|^7\|\|^8`, Projekt pinnt `^5.2.0`) + offene `npm audit`-Befunde aus Phase 7 | `package.json`; Abschnitt „Offene Befunde aus Phase 7" oben | **Ändert die Priorität, schließt den Befund aber nicht:** Der Schluss-Review hat das gebaute Archiv inspiziert und 62 Produktions-Pakete in `app.asar` gezählt — `vite` ist nicht darunter. Beide Funde sind reine Build-Zeit-Angelegenheiten und erreichen keinen Nutzer der DMG. Bleibt ein offener Phase-7-Punkt; durch diese Beobachtung nicht erledigt. |

### Nicht Phase 8 zuzurechnen — nur beiläufig und unsauber geprüft

Zwei Beobachtungen aus Task 6, ausdrücklich **nicht verifiziert**, damit niemand sie als
gesicherten Befund weiterträgt:

- `.claude/skills/run-keel/stop.sh` meldete "tmux sessions removed: 0", während eine von der
  App erzeugte Session noch lief. Das Cleanup-Versprechen scheint nur das eigene Namensmuster
  des Skripts abzudecken — von Hand beendet, nicht weiter untersucht.
- Ein Klick auf eine Projektzeile in der Projektliste navigierte in einem einzelnen Probe-Lauf
  nicht zu `ProjectView`, und `project:kickoff` außerhalb des Wizards lässt die Liste bis zum
  Reload veraltet stehen. Beides außerhalb von Phase 8s Scope und nur grob angestoßen, kein
  systematischer Reproduktionsversuch.

### Abnahmestatus

Phase 8 ist **nicht** vollständig abgenommen im Sinn der Roadmap: Sie verlangt einen
Erst-Start auf einem zweiten Apple-Silicon-Mac ohne Entwicklungsumgebung, und der hat nicht
stattgefunden. Ebenso ungeprüft ist der `xattr -cr`-Schritt — eine lokal gebaute DMG trägt kein
`com.apple.quarantine`-Attribut, nur eine heruntergeladene trägt eines. Ein Release wurde bewusst
nicht veröffentlicht (menschliche Entscheidung, kein Befund).
