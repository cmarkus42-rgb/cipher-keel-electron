# Design: Das Settings-Fenster — die Modell-Schicht bekommt einen Konsumenten

**Stand:** 2026-08-17
**Vorlage:** `docs/superpowers/plans/2026-08-17-handover-modell-schicht-steht.md` §2, §3
**Basiskonzept:** `docs/superpowers/specs/2026-08-14-modell-ebene-basiskonzept.md` §7, §8 Schritt 3

## 1. Warum diese Strecke

Der Abschluss-Review von PR #19 hat festgestellt, dass **nichts `warnungen()` aufruft**. Zwei
Matrizen, sechs Warnregeln, gebaut, getestet und in der laufenden App belegt — ohne Konsument.
Genau ein Hinweis erreicht heute einen Menschen: der Vermerk in der Prompt-Vorschau, wenn ein
Tier auf einen Nicht-CLI-Eintrag zeigt.

Das Basiskonzept sequenziert die Settings-Seite ohnehin vor dem Harness (§8, Schritt 3), und sie
ist jetzt „Anzeige, nicht Logik", weil die Datenschicht darunter liegt.

Dazu löst sie einen Teil von CK-NFR-012 ein: `agent.modelTiers` und `llm.*` sind heute nur durch
Editieren einer Datei außerhalb der App erreichbar.

## 2. Bestandsaufnahme — wer liest die Config eigentlich?

Für jedes Config-Feld nachgesehen, wer es liest. Das Ergebnis bestimmt den Umfang:

| Feld | Gelesen von | Wirkung einer Änderung |
|---|---|---|
| `modelle.eintraege` / `.zuordnung` | `registry.ts`, `rollen.ts` — bei *jeder* Auflösung | **sofort** |
| `llm.tagging` / `llm.worker` | `rollen.ts` als Rückfall | **sofort** |
| `agent.skipPermissions` | `claude-code.ts:49` beim Sessionstart | **nächste Session** |
| `agent.modelTiers` | `ipc-handlers.ts:251,309` beim Sessionstart | **nächste Session** |
| `voice.piperVoice` | `tts-piper.ts:21` bei jeder Ausgabe | **sofort** |
| `voice.enabled` | `main.ts:70` beim Dienststart | **Neustart** |
| `projects.*` | `ProjectManager` | nicht Settings-Gegenstand |
| `ui.theme` / `.language` / `.grid` | **niemand** | tot |
| `mcp.port` / `.host` / `.apiKey` | **niemand** | tot |
| `app.maxSessions` | **niemand** | tot |
| `windows.main` | **niemand** | tot |

`mcp.port: 3100` kommt im gesamten Quelltext nur in den Config-Vorgaben vor; der Graph-MCP-Server
läuft über stdio, nicht über einen Port. Die Fenstergrößen stehen fest verdrahtet in
`window-manager.ts`. Das Dunkel der Oberfläche ist ebenfalls fest verdrahtet.

**Konsequenz:** Eine „volle Settings-Seite", die `ui.theme`, `mcp.port` und `app.maxSessions`
anbietet, wäre zur Hälfte eine Oberfläche für Attrappen — Werte schreiben, die niemand liest.
Das ist genau das Muster, gegen das diese Strecke antritt (Handover §4). Die toten Blöcke werden
**aus dem Schema entfernt**, nicht nur ausgeblendet: Sonst findet die nächste Sitzung dieselbe
Attrappe wieder und investiert dieselbe Stunde erneut, um sie zu widerlegen.

Ebenfalls fällig, weil dasselbe Muster im selben Subsystem: `CONFIG_CHANGED` und `CONFIG_DELETE`
sind deklarierte IPC-Kanäle **ohne Handler und ohne Sender**. Sie werden gestrichen. Eine
Live-Benachrichtigung zwischen Fenstern braucht es nicht — das Settings-Fenster ist das einzige,
das schreibt.

## 3. Umfang

Drei Reiter, jeder mit echten Lesern dahinter:

1. **Modelle** — Einträge (anzeigen, anlegen, bearbeiten, löschen), die fünf Zuordnungen,
   Warnungen, Sperrgründe, Geheimnisse je `keyRef`, sichtbare Rückfälle (`agent.modelTiers`,
   `llm.*`) mit Bearbeitungsmöglichkeit an Ort und Stelle.
2. **CLI-Start** — je Adapter ein Freitextfeld für Startparameter.
3. **Sprachausgabe** — `voice.enabled`, `voice.piperVoice`.

**Jedes Feld trägt seine Wirkung sichtbar am Feld**, aus der Tabelle in §2: *wirkt sofort* /
*gilt ab der nächsten Session* / *braucht einen Neustart*. Nicht als Fußnote. Eine Seite, die
alle Felder gleich aussehen lässt, produziert stille Fehler — die teuerste Sorte.

## 4. Architektur

### 4.1 Die Grenze zwischen Regel und Anzeige

Der Renderer erhält **nur Ergebnisse, nie Regeln**. `src/shared/settings-types.ts` trägt
`sperrgrund: string | null`, `warnungen: { code, text }[]`,
`geheimnisStatus: 'schluesselbund' | 'umgebung' | 'fehlt' | 'unbekannt'`. Kein Import aus
`src/main/model/` im Renderer.

Das ist Handover §5 in seiner starken Form: Ein Zeichenketten-Wächter schützt gegen Kopieren,
nicht gegen Nacherzählen. Die Schnittstellenform macht den Fehler unmöglich, statt ihn zu
erkennen — der Renderer kann keine Regel nacherzählen, weil er nie eine bekommt.

Der zweite, entscheidende Grund: `warnungen()` nimmt einen `WarnKontext` mit
`startkontextToken`. Den kennt nur der Hauptprozess. Ein Renderer, der die Regeln selbst führte,
könnte diese Warnung strukturell nie korrekt berechnen.

### 4.2 Neue Dateien im Hauptprozess

- **`src/main/model/slots.ts`** — die fünf Zuordnungsslots mit ihren festen Eigenschaften
  (Läufer, Niveau, deutsche Beschriftung, Rückfallquelle). Eigene Datei, damit ein späterer
  B-Slot eine Zeile ist und eine bewusste Änderung bleibt.
- **`src/main/model/ansicht.ts`** — baut das Ansichtsmodell. **Einziger Aufrufer von
  `warnungen()` im Projekt.** Asynchron, weil der Geheimnis-Status den `security`-CLI befragt.
- **`src/main/settings/handlers.ts`** — registriert die Settings-IPC-Kanäle, aufgerufen aus
  `registerIpcHandlers`. Nicht in `ipc-handlers.ts`: die Datei hat 815 Zeilen, sieben weitere
  Handler machen sie schlechter.
- **`src/main/util/shell-quote.ts`** bekommt die Gegenrichtung `splitShellArgs(text): string[]`.
  Beide Richtungen beschreiben dieselbe Grammatik; getrennt driften sie auseinander.

### 4.3 Neue Dateien im Renderer

`src/renderer/windows/settings-window.html` + `settings-window.tsx`, dazu
`src/renderer/components/settings/` mit `ModelleReiter`, `CliStartReiter`,
`SprachausgabeReiter` und den geteilten Teilen `Warnliste`, `GeheimnisFeld`, `WirkungVermerk`.

### 4.4 IPC — ein Lesekanal, acht Schreibkanäle

Lesen: `settings:ansicht` → das vollständige Modell für alle drei Reiter.

Schreiben — jeder validiert im Hauptprozess und gibt die **frisch gerechnete Gesamtansicht**
zurück:

| Kanal | Wirkung |
|---|---|
| `settings:zuordnung-setzen` | Slot ← Eintrag-ID (leerer String löst die Zuordnung) |
| `settings:eintrag-speichern` | durch `normaliseEintrag`, dann Upsert in `modelle.eintraege` |
| `settings:eintrag-loeschen` | nur Config-Einträge; gebündelte sind nicht löschbar |
| `settings:geheimnis-setzen` | `storeInKeychain` — das Geheimnis geht nie zurück zum Renderer |
| `settings:geheimnis-loeschen` | Schlüsselbund-Eintrag entfernen |
| `settings:startargs-setzen` | `(adapterId, text)` — die Adapter-ID ist dynamisch, daher ein eigener Kanal statt einer Union; geprüft gegen `AdapterRegistry.listIds()` |
| `settings:einfachfeld-setzen` | `(feld, wert)` über eine **geschlossene** Union skalarer Felder: `modelltier:light\|standard\|heavy`, `sprachausgabe:aktiv\|stimme` |
| `settings:rueckfall-endpunkt-setzen` | `(rolle, endpunkt)` — `llm.tagging` / `llm.worker` sind `LlmEndpoint`-Objekte (kind, host, port, baseUrl, keyRef, model), kein Skalar; validiert durch `normaliseEndpoint`, dessen Transportprüfung damit die einzige bleibt |

Rückgabe immer `{ ok: true, ansicht }` oder `{ ok: false, fehler: string }` mit deutscher
Meldung, angezeigt **am Feld**. Kein stiller Rückfall — die Lehre aus PR #21.

**Warum jeder Schreibvorgang die ganze Ansicht zurückgibt:** Eine Änderung wirkt anderswo. Einen
Eintrag auf `rolle:worker` zu legen ändert die Rückfall-Anzeige; ein Geheimnis zu setzen ändert
den Status des Eintrags in allen Slots, die ihn nennen. Ein Umlauf, und der Renderer muss über
Teilzustände nicht nachdenken.

Die bestehenden Kanäle `config:get` / `config:set` bleiben unverändert und werden vom
Settings-Fenster **nicht** benutzt: `config:set` schreibt einen ganzen Top-Level-Schlüssel ohne
jede Validierung. Diese Fläche wird nicht verbreitert.

### 4.5 Fenster und Klickpfad

`createSettingsWindow(services)` in `window-manager.ts`, mit derselben Sicherheitsgrundlage wie
die bestehenden Fenster (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
Preload, `webSecurity: true`) — CK-NFR-004, CK-INF-022.

`window:open-settings` als Spiegelbild von `window:open-grid`: focus-or-create, aktives Fenster
in `ipc-handlers.ts` verfolgt.

Knopf im Kopfbereich des **Projektfensters**, sichtbar in allen Ansichten (Liste, Projekt,
Wizard) — die Modellkonfiguration ist nicht projektgebunden. Das Projektfenster öffnet beim
Start, also ist der Weg ab kaltem Start garantiert. Das beantwortet die Erreichbarkeitsklage aus
Handover §4.

Ein zweiter Einstieg aus dem Grid-Fenster ist billig nachrüstbar und **nicht** Teil dieser
Strecke: besser ein belegter Weg als zwei halbe.

### 4.6 Zwei leicht vergessene Stellen

- `electron.vite.config.ts`: `renderer.rollupOptions.input` braucht einen Eintrag
  `'settings-window'`. Ohne ihn baut das Fenster im Produktionsbündel nicht.
- Die Kanalfreigabe ist rein typseitig (`RendererToMainChannel` in `src/shared/ipc-channels.ts`),
  keine Laufzeitprüfung. Neue Kanäle müssen dort in die Union.

## 5. Der Modelle-Reiter

### 5.1 Die Slot-Tabelle

Der Läufer gehört zum Slot, nicht zur Auswahl:

| Slot | Läufer | Niveau | Herkunft der Festlegung |
|---|---|---|---|
| `tier:light` / `:standard` / `:heavy` | `fremdes-cli` | A | `cliHandleFuerTier` benutzt heute bereits `sperrgrund('fremdes-cli', …)` |
| `rolle:tagging` | `ein-schuss` | C | Auto-Tagging ist ein Einzelauftrag |
| `rolle:worker` | `ein-schuss` | C | Config-Kommentar: „Niveau-C worker jobs" |

**Damit verschwindet eine bestehende Doppelung:** `registry.ts:cliHandleFuerTier` trägt
`'fremdes-cli'` hart ein. Künftig liest es die Slot-Tabelle. Eine Quelle statt zwei.

Die Oberfläche bietet **keine Läufer-Auswahl** an — Handover §3 verbietet das ausdrücklich, und
mit der Slot-Tabelle stellt sich die Frage nicht.

### 5.2 Aufbau

- **Einträge**, gruppiert nach Anbieterart (Basiskonzept §7). Je Eintrag: Name, Erklärtext,
  Empfehlung, Örtlichkeit — und die Fähigkeitszeile mit **sichtbarer Herkunft**
  (`vermutet` / `Herstellerangabe` / `gemessen am …`). Handover §3 verlangt das, weil heute jede
  Zeile `vermutet` trägt.
- **Fünf Zuordnungen**, je ein Auswahlfeld über alle Einträge. Optionen mit `sperrgrund ≠ null`
  sind gesperrt und zeigen den Grund im Klartext. Darunter die Warnungen zur getroffenen Wahl,
  gruppierbar über die stabilen Codes.
- **Rückfall sichtbar bei leerem Slot** und dort editierbar: `tier:*` → `agent.modelTiers.<tier>`,
  `rolle:*` → `llm.<rolle>`. Ohne das sieht der Nutzer ein leeres Feld und weiß nicht, was
  tatsächlich läuft.
- **Geheimnis je `api`-Eintrag**: Status (`im Schlüsselbund` / `aus Umgebung` mit dem
  Variablennamen aus `envVarName(ref)` / `fehlt` / `unbekannt`), dazu Setzen, Ersetzen, Löschen.

### 5.3 Geheimnisse

Die Frage, die Basiskonzept §9 als offen bezeichnet, **ist im ausgelieferten Code bereits
beantwortet** — das Basiskonzept ist an dieser Stelle veraltet. `src/main/worker/api-keys.ts`
löst einen `keyRef` auf: macOS-Schlüsselbund zuerst, Umgebungsvariable zweitens, mit begründeter
Reihenfolge (eine vergessene Variable im Shell-Profil soll nicht still den Schlüssel
überschreiben, den der Nutzer gespeichert glaubt). Das Modul exportiert `storeInKeychain(ref, key)`
und sagt im Docblock: „Exported so the settings UI can name it too." Es wurde für diese Seite
geschrieben und hat bis heute keinen Aufrufer.

Das Feld ist **schreibend, nie lesend**. Das Geheimnis geht nie zurück in den Renderer und nie in
`cipher-keel-config.json` — deren Docblock begründet auch das: Modus 0600 hält andere Konten
fern und sonst nichts; die Datei landet in Backups und ist die, die man beim Hilfesuchen in einen
Chat einfügt.

**Ehrlichkeit dazu:** Der `security`-CLI nimmt den Schlüssel als Argument entgegen, er ist also
für einen Moment in `ps` sichtbar. Auf einem Einbenutzer-Mac akzeptabel, und es ist dasselbe
Idiom, das `github/token-store.ts` bereits verwendet — zwei Idiome wären schlechter. Es ist
macOS-gebunden; die Umgebungsvariable bleibt der Weg für alles andere.

### 5.4 Die Fähigkeitszeile ist nicht editierbar

Sie ist das Revier des Kanarienauftrags; `quelle: 'gemessen'` ist dessen Wort, und
`normaliseEintrag` erzwingt bereits, dass `gemessen` ohne `gemessenAm`/`gemessenMit` scheitert.
Fünfzehn Felder von Hand zu füllen erzeugt genau das falsche Zutrauen, gegen das `quelle`
erfunden wurde. Neue Einträge tragen keine Fähigkeitszeile und fallen auf
`FAEHIGKEITEN_RUECKFALL` zurück — das ist ehrlich, weil es `vermutet` bleibt.

### 5.5 Die Zählung: vier von sechs Warnregeln bleiben unerreichbar

Die sechs Warnregeln gegen die fünf Slots durchgerechnet:

| Regel | Feuert in v1? | Warum |
|---|---|---|
| `verlaesst-netz` | **ja** | jeder Slot mit einem Eintrag in `fremdes-netz` |
| `teure-ebene-fuer-mechanik` | **ja** | `rolle:*` (Niveau C) auf einen Eintrag in `fremdes-netz` |
| `werkzeugmodus-text` | nein | verlangt `eigene-schleife` — kein Slot benutzt sie |
| `nicht-gemessen` | nein | verlangt einen agentischen Läufer auf einem Nicht-CLI-Eintrag — genau die Paarung, die `sperrgrund` für jeden Tier-Slot sperrt |
| `unter-faehigkeit` | nein | verlangt Niveau C mit einem Läufer über C — unter diesen Slots nicht vorhanden |
| `kontext-zu-klein` | nein | braucht `startkontextToken`, und nichts im Projekt liefert das heute |

Gegen die gebündelten Einträge geprüft: `rolle:worker` auf `openrouter-qwen3-coder`
(`api`, `fremdes-netz`) löst tatsächlich genau die zwei erreichbaren Warnungen aus.

**Eine Korrektur an dieser Tabelle, gefunden beim Review der Umsetzung.** Die ursprüngliche
Begründung für `nicht-gemessen` lautete, ein Tier könne strukturell nur `cli-harness` halten.
Das stimmt nicht: Eine Config *kann* ein Tier auf einen `local-http`-Eintrag zeigen lassen —
`registry.ts` modelliert diesen Zustand ausdrücklich als „eine falsch geformte Zuordnung, die
der Nutzer tatsächlich gemacht hat". Die Regel wäre damit erreichbar gewesen.

Erreichbar ist sie trotzdem nicht, aber aus einem anderen und schärferen Grund: **Eine
Zuordnung, die `sperrgrund` sperrt, trägt keine Warnungen.** Sie läuft nicht, es gilt der
Rückfall, und eine Warnung über eine Paarung, die nie ausgeführt wird, ist keine Aussage über
das, was läuft. Das Ansichtsmodell setzt in diesem Fall stattdessen `gewaehltHinweis` — den
Sperrgrund im Klartext, plus den Hinweis, dass der Rückfall greift.

Die Gegenprobe im Test ist entsprechend auf einen **Nicht-CLI**-Eintrag verankert. Wäre sie es
nicht, würde sie vom Eintrag blockiert statt von der Slot-Tabelle und könnte nie fallen, wenn
das Harness einen `eigene-schleife`-Slot einführt — sie hätte still aufgehört zu bewachen.

**Die Settings-Seite gibt `warnungen()` einen Konsumenten, aber vier von sechs Regeln erreichen
weiterhin keinen Menschen.** Das ist kein Versäumnis dieser Strecke: Alle vier hängen an
`eigene-schleife` oder an Niveau B — dem Läufer des Harness, das es noch nicht gibt.

Slots zu erfinden, damit Regeln feuern, wäre derselbe Fehler in neuem Gewand: Config bauen, die
niemand liest. Wenn das Harness kommt, ist ein B-Slot **eine Zeile in `slots.ts`**; vier Regeln
werden dann gleichzeitig sichtbar, ohne dass die Oberfläche angefasst wird.

## 6. Der CLI-Start-Reiter

### 6.1 Von einem Schalter zu Startparametern

`agent.skipPermissions: boolean` wird zu `agent.startArgs: Record<adapterId, string>`. Je
registriertem Adapter ein Freitextfeld, Liste aus `AdapterRegistry.listIds()` — ein neuer
CLI-Adapter erscheint von selbst. Der Vendor steht damit nur noch als Schlüssel in der Config,
nicht mehr in ihrer Struktur.

Die Schnittstelle folgt: `AgentConfigReader.getSkipPermissions(): boolean` wird zu
`getStartArgs(adapterId: string): string[]`. In `ipc-handlers.ts` wird daraus
`splitShellArgs(configStore.get('agent').startArgs[id] ?? '')`.

**Reihenfolge im Aufruf: Nutzerparameter zuerst, App-Parameter danach.** Damit erzeugt eine
migrierte Vorgabe-Config eine zeichengleiche Kommandozeile wie heute — belegbar statt behauptet.

Heute registriert ist genau ein Adapter (`claude-code`). `keel-harness` ist als Runtime bekannt,
hat aber absichtlich keinen Adapter (`RUNTIMES_WITHOUT_ADAPTER`).

### 6.2 Die Doppel-Flag-Falle

Der Claude-Adapter hängt vier Parameter aus eigener Logik an: `--resume`, `--fork-session`,
`--model`, `--append-system-prompt-file`. Stehen sie zusätzlich im Freitext, erscheinen sie
doppelt in der Kommandozeile.

`AgentAdapter` bekommt daher ein optionales `appGesteuerteParameter: readonly string[]`. Der
Claude-Adapter nennt seine vier. Steht einer davon im Freitext, **warnt** die Seite — sperrt aber
nicht. Dieselbe Haltung wie in `eignung.ts`: strukturell sperren, sonst warnen. Und die Liste hat
eine Quelle: der Adapter, der die Parameter anhängt, benennt sie auch.

### 6.3 Eine Doppelung, die mitfällt

`claude-code.ts` schreibt `claude --dangerously-skip-permissions` in vier Prompt-Fragmente
(Zeilen 235, 242, 256, 262) — Anweisungen an eine Sitzung, wie sie Worker startet. Nimmt der
Nutzer das Flag aus den Startparametern, sagt der Prompt weiter das Gegenteil. Die Fragmente
bauen den Befehl künftig aus `formatShellCommand('claude', getStartArgs(this.id))`.

## 7. Der Sprachausgabe-Reiter

`voice.enabled` (Schalter, Vermerk **braucht Neustart** — `main.ts:70` liest beim Dienststart)
und `voice.piperVoice` (Freitext, **wirkt sofort** — `tts-piper.ts:21` liest bei jeder Ausgabe).

Eine Auswahlliste vorhandener Stimmen wäre schöner; sie setzt voraus, dass sich das
Stimmenverzeichnis zuverlässig auflisten lässt, und das ist in v1 nicht geprüft. Freitext mit
sichtbarer Vorgabe ist der ehrliche Zwischenstand.

## 8. Migration

`loadConfig()` bekommt einen `migriere()`-Schritt, idempotent:

- `agent.skipPermissions === true` und kein `startArgs` → `startArgs['claude-code'] = '--dangerously-skip-permissions'`
- `=== false` → `''`
- danach `skipPermissions` entfernen
- die toten Blöcke `ui`, `mcp`, `app.maxSessions`, `windows` fallen aus Schema und Datei

Getestet auf: frische Config · Config mit `true` · Config mit `false` · bereits migrierte Config
(zweiter Lauf ändert nichts) · Config mit von Hand gesetztem `startArgs` **und** altem
`skipPermissions` — dort gewinnt `startArgs`, der Altwert wird kommentarlos entfernt, nicht
gemischt.

## 9. Fehlerbehandlung

Eine Regel, überall: Jeder Schreibkanal liefert `{ ok: false, fehler }` mit deutschem Text,
angezeigt am Feld, nie nur im Log.

- Die Meldungen aus `normaliseEintrag` sind bereits deutsch und präzise und werden wörtlich
  durchgereicht.
- Ein Fehler beim Schlüsselbund-Schreiben zeigt die `security`-Meldung im Klartext.
- Schlägt das Lesen des Geheimnis-Status fehl (kein `security` erreichbar), degradiert der
  **einzelne Eintrag** auf `unbekannt` mit Grund — nicht die ganze Seite.
- Ein unbalanciertes Anführungszeichen in den Startparametern ist ein **Fehler mit deutscher
  Meldung**, keine stillschweigend verstümmelte Kommandozeile.

**Eine Änderung an `registry.ts`, die hierher gehört:** `alleEintraege()` überspringt kaputte
Config-Einträge mit `console.warn` — laut für einen Entwickler, unsichtbar für einen Nutzer.
Daraus wird ein **exportiertes** `ladeEintraege(): { eintraege, uebersprungen: { roh, fehler }[] }`,
das `ansicht.ts` aufruft; `alleEintraege()` delegiert daran und gibt weiterhin nur die Liste
zurück, kein bestehender Aufrufer bricht. Die Settings-Seite
zeigt die übersprungenen Einträge mit ihrem Fehler. Derselbe Fall wie PR #21: ein Fehler, der
existiert und keine Oberfläche erreicht.

## 10. Tests

- **`slots.ts`** — die Tabelle als Gegenstand, damit ein späterer B-Slot eine bewusste Änderung
  ist.
- **`ansicht.ts`** — tabellengetrieben über Slot × Eintragsart. Die **zwei erreichbaren**
  Warnregeln werden festgenagelt, die **vier unerreichbaren** als ausdrückliche Gegenprobe
  („feuert nicht, und zwar aus diesem Grund"). Führt das Harness später einen B-Slot ein, fallen
  diese Gegenproben — und genau das soll passieren, statt dass es niemandem auffällt.
- **`splitShellArgs`** — Anführungszeichen, maskierte Leerzeichen, leerer Text, unbalanciertes
  Anführungszeichen.
- **Migration** — die fünf Fälle aus §8.
- **`ladeEintraege`** — ein kaputter Eintrag landet in `uebersprungen`, nicht im Nichts.

**Kein Wächtertest** für „der Renderer baut die Regeln nicht nach". Handover §5 ernst genommen:
Die Schnittstellenform aus §4.1 leistet mehr als ein Zeichenketten-Wächter, weil der Renderer
keine Regel bekommt, die er nacherzählen könnte.

## 11. Messprotokoll — die eigentliche Abnahme

Kein Test dieses Repos erreicht einen `ipcMain`-Handler; eine grüne Suite sagt über eine
Verdrahtung nichts. Zu belegen in der laufenden App, wörtlich im Plan:

1. Kalter Start → Projektfenster → Knopf sichtbar → Settings-Fenster öffnet.
2. Tier auf einen `local-http`-Eintrag → Option gesperrt, Sperrgrund im Klartext.
3. `rolle:worker` auf `openrouter-qwen3-coder` → **beide** erreichbaren Warnungen erscheinen.
4. Geheimnis setzen → von außen per `security find-generic-password` bestätigt, **und** `grep` in
   `cipher-keel-config.json` findet es nicht.
5. Startparameter ändern → neue Session → die tatsächliche Kommandozeile zeigt die Änderung; mit
   Vorgabe zeichengleich zu heute.
6. Zuordnung setzen → wirkt **ohne Neustart** (Auto-Tagging geht an den neuen Endpunkt). Belegt
   die „sofort"-Zeile aus §2.
7. Kaputter Eintrag in der Config → erscheint als „übersprungen" in der Oberfläche.
8. Config mit `skipPermissions: true` → App-Start → Datei trägt `startArgs`, kein
   `skipPermissions`.

Vor jedem Messlauf prüfen, dass keine zweite App-Instanz dieselbe Config und DB teilt
(Handover §6).

## 12. Ausdrücklich nicht in dieser Strecke

- Fähigkeitszeile editieren — Revier des Kanarienauftrags, kommt mit dem Harness
- `kontext-zu-klein` erreichbar machen — braucht `startkontextToken`, kommt mit dem Harness
- B-Slot mit `eigene-schleife` — eine Zeile in `slots.ts`, wenn das Harness steht
- Zweiter Einstieg aus dem Grid-Fenster
- Stimmen-Auswahlliste
- Schlüsselbund außerhalb von macOS

## 13. Nachzuführende Dokumente

- **Basiskonzept §9** nennt die Geheimnis-Frage offen. Sie ist es nicht (siehe §5.3). Wird
  korrigiert, sonst schiebt sie den Nächsten in eine Entscheidung, die längst gefallen ist.
- **`.claude/skills/run-keel`** beschreibt einen erwarteten Zustand der laufenden App. Wer den
  Zustand ändert, korrigiert die Skill-Datei **vorher** (Handover §6). Ein neues Fenster mit
  neuem Klickpfad ändert ihn.
