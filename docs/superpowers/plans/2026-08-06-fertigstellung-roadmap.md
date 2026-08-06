# cipher keel — Vorgehensplan Fertigstellung (Phase 6–10)

**Stand:** 2026-08-06
**Ausgangslage:** Phase 5 abgeschlossen, 1390 Tests gruen, Typecheck sauber, Repo public.
**Ziel:** Die im README unter „What is not there yet" benannten Luecken schliessen und
cipher keel zu einer installierbaren, benutzbaren 0.1 fuehren.

> **Dokumententyp:** Roadmap, kein Task-Plan. Der Scope umfasst fuenf unabhaengige
> Teilsysteme; jede Phase bekommt vor ihrer Umsetzung einen eigenen detaillierten
> TDD-Plan unter `docs/superpowers/plans/`. Diese Datei legt Reihenfolge, Schnitt,
> Abnahmekriterien und Abhaengigkeiten fest.

---

## Globale Randbedingungen

Gelten fuer jede Phase, ohne Ausnahme:

- **Security-Baseline unverhandelbar** (CK-NFR-004, CK-INF-022): `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`. `src/preload.ts` bleibt die einzige
  `contextBridge.exposeInMainWorld`-Aufrufstelle.
- **TDD**: Test zuerst, Test rot sehen, minimale Implementierung, Test gruen, committen.
- **Keine Regression**: `npm test` (aktuell 1390) und `npm run typecheck` muessen nach
  jedem Commit gruen sein.
- **Graceful Degradation** (CK-NFR-010): Ein fehlendes Subsystem darf die App nie
  hart abstuerzen lassen — aber es muss **sichtbar** degradieren (siehe Befund 2).
- **Niveau-Bedienung** (D-14): Jeder Task-Schnitt in den Detailplaenen muss von einem
  Worker ohne Projektvorwissen aus dem Task-Text allein startbar sein.
- **Konzept-Hoheit**: Weichen Konzept und Bau voneinander ab, wird das Konzept
  praezisiert — in den Ideation-Verzeichnissen, nicht im Repo.

---

## Befunde der Bestandsaufnahme

Drei Befunde aus der Code-Analyse vom 2026-08-06. Sie bestimmen die Reihenfolge.

### Befund 1 — Services werden beim App-Start nie initialisiert (kritisch)

`main.ts:60` startet die App mit `createProjectWindow(services)`. Diese Funktion
initialisiert **keine** Background-Services (`window-manager.ts:111-148`, Kommentar:
„No background service init"). `initializeBackgroundServices` wird ausschliesslich
von `createMainWindow` gerufen (`window-manager.ts:94`) — und die entsteht erst,
wenn der Nutzer ueber `window:open-grid` das Grid-Fenster oeffnet
(`ipc-handlers.ts:533-534`).

Konsequenz beim ersten Start: `graphDb`, `graphWriter`, `kanbanStore`, `noteManager`,
`voiceManager` sind `null`, tmux ist nicht verbunden. Damit gilt:

| Aufruf | Ist-Verhalten | Fundstelle |
|--------|---------------|------------|
| Kickoff-Wizard → Graph-Init | `{ok: false, error: 'Graph not initialized'}` | `ipc-handlers.ts:625` |
| Kanban-Board laden | `[]` (leeres Board, keine Fehlermeldung) | `ipc-handlers.ts:461` |
| Timeline laden | Graph-Queries laufen ins Leere | `useTimeline.ts:82-89` |

**Das ist der eigentliche Grund fuer „no end-to-end UX flow".** Es fehlt nicht primaer
UI-Verdrahtung — der allererste Nutzerpfad (App starten → Projekt anlegen) schlaegt
im Hintergrund fehl. Alles Weitere haengt daran.

### Befund 2 — Degradation ist stumm

Die Null-Guards geben leere Ergebnisse statt Fehlern zurueck (`ipc-handlers.ts:461`).
Ein nicht initialisierter Graph ist von einem leeren Projekt nicht unterscheidbar.
Graceful Degradation ohne Sichtbarkeit ist ein Diagnose-Loch: der Nutzer sieht ein
leeres Board und nimmt an, das sei der korrekte Zustand.

### Befund 3 — Event-Routing ist an ein Fenster gebunden

`initializeBackgroundServices(win, services)` schliesst ueber genau ein `win` und
sendet alle Events per `win.webContents.send(...)` (`window-manager.ts:167, 173, 178,
201-217, 257, 265`). Bei zwei Fenstern (Projekt + Grid) erreichen Events nur das
Fenster, das die Init ausgeloest hat. Das Drei-Fenster-Modell aus M3 ist damit
strukturell blockiert.

---

## Phasenuebersicht

| Phase | Inhalt | Abhaengig von | Groesse |
|-------|--------|---------------|---------|
| **6** | Service-Lifecycle + durchgaengiger Nutzerpfad | — | L |
| **7** | CI-Pipeline | — (parallel zu 6 moeglich) | S |
| **8** | Packaging und Release 0.1 | 6 | M |
| **9** | Runtime-NFR-Verifikation | 8 | S |
| **10** | Adapter-Garten (Codex/Gemini) | 6 | M |

Groessen sind Relativschaetzungen, keine Zeitzusagen: S = eine Bau-Session,
M = zwei bis drei, L = mehrere Wellen mit Audit.

---

## Phase 6 — Service-Lifecycle und durchgaengiger Nutzerpfad

**Ziel:** Ein Nutzer startet die App, legt ein Projekt an, sieht Timeline und Kanban
mit echten Daten, oeffnet das Grid, startet eine Session — ohne dass ein Schritt
still fehlschlaegt.

**Warum zuerst:** Befund 1. Ohne diese Phase ist jede weitere Politur wertlos,
weil der Einstiegspfad bricht.

### Teilschritte

**6a — Service-Init vom Fenster entkoppeln**
Neue Datei `src/main/service-lifecycle.ts`: `initializeServices(services)` ohne
`BrowserWindow`-Parameter, idempotent (Mehrfachaufruf ist ein No-op), aufgerufen
aus `app.whenReady()` in `main.ts` **vor** der Fenstererzeugung, aber deferred per
`setImmediate` — die Startup-Anforderung < 5s (CK-INF-025, CK-NFR-008) bleibt gewahrt.
`window-manager.ts` behaelt nur noch Fenster-Lifecycle.

**6b — Event-Bus statt Fenster-Closure**
Neue Datei `src/main/event-bus.ts`: Registry aller offenen `BrowserWindow`, Broadcast
an alle lebenden Fenster, automatische Deregistrierung bei `closed`. Alle
`win.webContents.send(...)` aus `initializeBackgroundServices` wandern dorthin.
Loest Befund 3 und ist Voraussetzung fuer das Drei-Fenster-Modell.

**6c — Service-Status sichtbar machen**
Neuer IPC-Kanal `services:status` liefert pro Subsystem `ready | degraded | disabled`
plus Grund. Null-Guards geben ab jetzt einen typisierten Fehler statt eines leeren
Ergebnisses zurueck. `StatusBar` zeigt degradierte Subsysteme an. Loest Befund 2.

**6d — Kickoff-Pfad Ende-zu-Ende**
`project:kickoff` (`ipc-handlers.ts:664`) gegen initialisierte Services testen:
Projekt anlegen → git init → Graph-Init mit Phasenkette → optional GitHub-Repo →
Projekt erscheint in der Liste → `ProjectView` zeigt die acht Phasen. Integrationstest,
der den kompletten Pfad ueber die IPC-Handler fahrt (ohne echtes Electron-Fenster).

**6e — Projekt-Kontext im Grid-Fenster**
`index.tsx:41-43` erzeugt Sessions mit `session-${Date.now()}` ohne Projektbezug und
ohne `cwd`. Session-Erzeugung an das aktive Projekt binden: `cwd` = `project.rootPath`,
Name aus Projekt und Entitaet abgeleitet, Session als Graph-Knoten geschrieben.

**6f — Entitaets-Auswahl beim Session-Start**
`LauncherCell` bekommt eine Preset-Auswahl (Systems Engineer, Architect, Cyber Factory,
Workshop). Die Assemblierung existiert bereits (`src/main/session/assemble-entity.ts`),
ist aber nicht an die UI angeschlossen. Das ist der Schritt, der aus dem
Terminal-Multiplexer die Prozess-Maschine macht.

### Abnahmekriterien

- Frischer Start ohne `graph.db`: Kickoff legt ein Projekt an, `graph:init-project`
  gibt `{ok: true}`, die acht Phasen sind im Graph
- Timeline und Kanban zeigen im neuen Projekt echte (leere, aber initialisierte) Daten,
  unterscheidbar von „Subsystem nicht bereit"
- Grid-Fenster oeffnen, Session mit Preset starten: tmux-Session laeuft im
  Projektverzeichnis, Session-Knoten liegt im Graph
- Ein Event (z.B. `notes:changed`) erreicht beide Fenster
- Alle bisherigen Tests bleiben gruen; neue Integrationstests fuer 6a, 6c, 6d

### Risiken

- Service-Init vor Fenster-Show kann die Startzeit verschlechtern. Gegenmassnahme:
  `setImmediate`-Deferral beibehalten, Startzeit in Phase 9 messen — nicht schaetzen.
- `assemble-entity` ist gegen Tests gebaut, nicht gegen eine laufende Session. In 6f
  ist mit Nacharbeit am Prompt-Zusammenbau zu rechnen.

---

## Phase 7 — CI-Pipeline

**Ziel:** Jeder Push und PR laeuft Typecheck, Lint und Testsuite auf GitHub Actions.

**Warum frueh:** Das Repo ist public, Actions sind damit kostenfrei. Die Phase kostet
wenig und schuetzt alle folgenden Phasen. Kann parallel zu Phase 6 laufen.

### Teilschritte

- `.github/workflows/ci.yml`: macOS-Runner, Node 20, `npm ci`, `npm run typecheck`,
  `npm run lint`, `npm test`
- `better-sqlite3` braucht auf dem Runner einen nativen Build — Cache fuer
  `node_modules` und Prebuild-Pfad pruefen, sonst wird jeder Lauf teuer
- CI-Badge im README aktivieren (im aktuellen README bewusst weggelassen, weil es
  keine Pipeline gibt)
- `CONTRIBUTING.md` und `SECURITY.md` ergaenzen — bei einem public Repo gehoert ein
  privater Meldeweg fuer Sicherheitsluecken dazu

### Abnahmekriterien

- Ein PR mit absichtlich gebrochenem Test wird rot
- Ein Lauf auf `main` ist gruen, Badge zeigt passing
- Laufzeit unter fuenf Minuten

---

## Phase 8 — Packaging und Release 0.1

**Ziel:** Eine DMG, die auf einem fremden Mac startet.

**Abhaengig von Phase 6** — eine App zu paketieren, deren Einstiegspfad bricht, waere
sinnlos.

### Teilschritte

- `electron-builder`-Konfiguration in `package.json:54` vervollstaendigen: Icon,
  `category`, `dmg`-Layout, `extraResources` fuer die `better-sqlite3`-Binary
- `npm run dist` als Script ergaenzen (existiert derzeit nicht)
- Native Module im gepackten Build verifizieren — `better-sqlite3` und `sqlite-vec`
  sind der wahrscheinlichste Bruchpunkt zwischen Dev und Paket
- **Signierung entscheiden:** ohne Apple Developer ID braucht jeder Nutzer
  `xattr -cr`. Mit Notarisierung entfaellt das, kostet aber ein Entwicklerkonto.
  Das ist eine Maker-Entscheidung, keine technische — siehe Offene Entscheidungen
- Erst-Start auf einem Rechner ohne Dev-Umgebung testen: kein Node, kein tmux.
  Fehlermeldung muss sagen, was fehlt und wie man es installiert
- GitHub Release 0.1 mit Artefakt und Release Notes

### Abnahmekriterien

- DMG auf einem zweiten Mac ohne Dev-Toolchain installierbar und startbar
- Fehlende Abhaengigkeiten (tmux, Claude Code CLI) erzeugen eine verstaendliche
  Meldung statt eines stummen Fehlschlags
- README-Statusblock von „pre-alpha, source only" auf den echten Stand gehoben

---

## Phase 9 — Runtime-NFR-Verifikation

**Ziel:** Die architektonisch begruendeten NFRs messen statt behaupten.

**Abhaengig von Phase 8** — gemessen wird am Produktionsbuild, nicht am Dev-Server.

### Teilschritte

- CK-NFR-009 (Idle-RAM < 300 MB): Messung im laufenden Electron-Prozess, Main und
  Renderer getrennt, nach fuenf Minuten Idle
- CK-NFR-008 / CK-INF-025 (Start < 5s): von Prozessstart bis `app-ready`-Event,
  mit und ohne bestehende `graph.db`
- CK-NFR-011 (< 2000 Tokens fuer zehn Treffer): gegen einen realen Graphen mit
  einigen hundert Knoten, nicht gegen Testfixtures
- Ergebnisse in `docs/superpowers/specs/` festhalten; README-Abschnitt
  „RAM budget unverified" entsprechend korrigieren oder streichen

### Abnahmekriterien

- Drei Messprotokolle mit Zahlen, Methode und Datum
- Jede Zielverfehlung entweder behoben oder als bewusst akzeptiert dokumentiert

---

## Phase 10 — Adapter-Garten

**Ziel:** Der zweite offizielle CLI-Adapter, damit die Multi-Harness-Aussage aus
der Architektur belegt ist und nicht nur behauptet.

**Abhaengig von Phase 6** (Preset-Auswahl in der UI muss existieren).

### Teilschritte

- `src/main/agent/adapters/` um einen Referenz-Stub erweitern; die Adapter-Schnittstelle
  (`agent-adapter.ts`, `registry.ts`) gegen einen zweiten Konsumenten pruefen —
  eine Schnittstelle mit nur einer Implementierung ist unbewiesen
- Codex **oder** Gemini, nicht beides. Der zweite folgt, wenn der erste traegt
- Niveau-B-Konformitaet nach M2 pruefen: welche Capabilities ueberleben den Wechsel,
  welche nicht
- Adapter-Testprotokoll dokumentieren

### Abnahmekriterien

- Eine Session laeuft mit dem neuen Adapter im Grid
- Dokumentiert, welche Capabilities auf Niveau B wegfallen

---

## Nicht im Scope

Bewusst ausgeschlossen, damit der Plan endlich ist:

- **Linux/Windows** — tmux, Unix-Domain-Sockets und Keychain sind macOS-gebunden.
  Linux ist plausibel, aber ein eigenes Projekt
- **Cross-Runtime-Orchestrierung** — per D5 explizit 2.0-Material
- **OpenCode-Adapter** — die Lizenz-/ToS-Verifikation ist laut `06-offene-punkte.md`
  weiterhin offen und muss vor jedem Bau geklaert werden
- **Cost-Aggregation ueber Runtimes** — per D8 2.0

---

## Offene Entscheidungen (Maker)

Diese Punkte blockieren keine sofortige Arbeit, muessen aber vor der jeweils
genannten Phase entschieden sein:

1. **Code-Signierung** (vor Phase 8): Apple Developer ID beschaffen, oder DMG
   unsigniert mit `xattr -cr`-Anleitung ausliefern? Beeinflusst die Einstiegshuerde
   fuer jeden Nutzer.
2. **Companion-Rolle** (vor einer Companion-Integration): eigene Entitaet mit Preset
   oder Systemdienst? Offen seit 2026-05-28, dokumentiert in `06-offene-punkte.md`
   Punkt 8. Beruehrt Phase 6f nur, falls der Companion in die Preset-Auswahl soll.
3. **Release Manager** (vor 0.2): als Entitaet nicht ausdifferenziert
   (`06-offene-punkte.md` Punkt 9). Fuer 0.1 kein Blocker.
4. **Positionierung „kein Quota-Stretcher"** (vor Launch-Kommunikation): Befund 8
   aus Brain-Note 21. Das Repo ist inzwischen public — die Frage ist damit faellig,
   nicht mehr hypothetisch.

---

## Vorgeschlagene Reihenfolge

```
Phase 7 (CI) ─────────────┐
                          ├──> Phase 8 (Packaging) ──> Phase 9 (NFR)
Phase 6 (Lifecycle+UX) ───┤
                          └──> Phase 10 (Adapter)
```

Phase 6 und 7 koennen parallel starten. Phase 6 ist der kritische Pfad — jede
Stunde dort zahlt auf alles Folgende ein.

**Naechster Schritt:** Detailplan fuer Phase 6 schreiben (Task-Ebene, TDD, mit
Code in jedem Schritt), dann Phase 6a als erste Bau-Session.
