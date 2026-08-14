# Handover: Niveau C, der abgeräumte Stapel, und was als Nächstes trägt

**Stand:** 2026-08-13
**Für:** die nächste Session
**Kurzfassung:** Der vierfache PR-Stapel ist in `main`, CI läuft zum ersten Mal überhaupt
grün, Niveau C hat eine Laufzeit samt Rückgabe-Vertrag, und die A-Lazy-Loading-Frage ist
gemessen statt vermutet. Offen ist der Weg, auf dem eine Session einen C-Worker beauftragt.

> **Dies ist das Einstiegsdokument.** Es löst `2026-08-11-handover-niveau-adapter.md` ab.
> Jenes bleibt gültig für die Niveau-/Adapter-Strecke selbst.

---

## 1. Die Erkenntnis, die alles andere ordnet

Sie stand vorher nirgends im Repo und ist der eigentliche Ertrag dieser Session:

**Die drei Niveaus sind drei Laufzeiten.**

| Niveau | Laufzeit | Warum |
|---|---|---|
| A | Claude Code (Schenkel 1) | fremdes Harness, voll agentisch, kostet uns nichts |
| B | NanoClaw (Schenkel 2) | agentisch — **wir bauen das Harness nicht selbst**, das war der Grund für NanoClaw |
| C | **keel selbst** | ein Prompt hinein, eine formatierte Antwort heraus. Dafür braucht es kein Harness |

Die Vorgabe des Nutzers für C wörtlich: „für die kleinen Modelle soll es ja nur geben
‚Antwort hierhin zurückgeben' (im entsprechenden Format etc), ansonsten sollen sie ja nicht
belastet werden", und „Iterationen starten ja eh mit neuen Sessions bei den kleinen".

**Die C-Laufzeit existierte bereits, nur unbenannt:** Das Notizen-Tagging war dieses Muster
in klein. Was fehlte, war nie der Modellzugang, sondern der Vertrag über die Antwort.

---

## 2. Wo die Arbeit liegt

| | |
|---|---|
| **`main`** | `356e50e` — trägt PRs #10–#15, CI grün |
| **Offen** | **PR #16** `niveau-c-rueckgabe-vertrag` — CI grün, wartet auf Merge |
| **Testsuite** | 1857 grün / 142 Dateien · Typecheck 0 · Lint 0 · Bündel 0 |
| **Commits diese Session** | 27 |

Alle alten Zweige sind gelöscht, lokal wie remote. Es existiert nur `main` und der offene
Zweig zu PR #16.

---

## 3. Was diese Session gebaut hat

### 3.1 Die Niveau-/Adapter-Strecke zu Ende geführt (Tasks 8–13)

Niveau B emittiert ein **Inventar** statt nichts (vorher hätte eine B-Session ihre ganze
Capability-Schicht kommentarlos verloren). Eine **Prompt-Vorschau** über einen lesenden
IPC-Kanal, in der `LauncherCell` als 👁 je Preset, mit Niveau-Umschalter. **CK-NFR-012** und
`docs/anpassbare-flaechen.md` als testgebundenes Inventar. Messprotokoll in der laufenden App.

### 3.2 Die fünfte Assemblierungs-Schicht

Auf die Nachfrage des Nutzers („was ist da zu entscheiden? ist das nicht einfach Arbeit die
zu tun ist?") stellte sich heraus: Resolver, Query-Template, Kantentyp und
Assemblierungs-Option waren alle da, es fehlte die Verdrahtung dazwischen. `phase-input.ts`,
rund 70 Zeilen. Die Schicht trägt **Zeiger** (uid, Titel, Pfad), keinen Inhalt.

**Wichtig für jede künftige Änderung an der Assemblierung:** Die Vorschau musste mitwandern.
`buildPromptPreview` bekommt denselben Graph-Zugriff wie `session:create` — sonst zeigt sie
still etwas anderes als das Ausgelieferte, und das ist schlimmer als keine Vorschau.

### 3.3 Der Stapel und ein CI, der nie lief

**Der wichtigste Fund der Session:** CI war auf allen vier PRs rot, seit Phase 8 — nicht
wegen des Codes. `npm ci` brach nach 9 Sekunden mit `EUSAGE` ab, „Missing: esbuild@0.28.2
from lock file", bevor ein Test lief. Der Stapel war **nie** von CI geprüft, während das
README die Pipeline als „Done" führte.

Ursache: **npm-Major-Spaltung.** CI installierte Node 22 (npm 10), der Rechner läuft Node 25
(npm 11). npm 11 hoistet anders und hatte beim Neuerzeugen des Lockfiles 28 verschachtelte
`node_modules/vitest/node_modules/@esbuild/*`-Einträge entfernt.

Die Verträglichkeit ist **einseitig**, in beide Richtungen gemessen:

- npm-10-Lockfile unter npm 11 → läuft
- npm-11-Lockfile unter npm 10 → scheitert

Behoben mit `npm install --package-lock-only` unter npm 10.9.8 (`/opt/homebrew/opt/node@22/bin`),
dann `.nvmrc` auf **24** gehoben — Active LTS bis 2028, bringt npm 11 wie der Rechner.
**Nicht auf 25**, obwohl der Rechner das fährt: Node 25 ist seit 2026-06-01 End-of-Life.

### 3.4 Niveau A lädt bedarfsgesteuert — gemessen

Die offene Frage aus dem Konzept-Nachtrag ist beantwortet:

| Variante | Gesamt-Token |
|---|---|
| ohne Capabilities | 36 477 |
| 1 Referenz | 37 769 |
| 7 Referenzen | 37 934 |
| 7 Referenzen, **eine Datei auf 271 000 Zeichen aufgeblasen** | **37 934** |

Der vierte Lauf entscheidet: 68 000 Token hinter einer Referenz, Kontext unverändert.
**Der Umbau der A-Mechanik auf `.claude/skills/` ist aus Token-Gründen nicht nötig.** Und:
Die erste Referenz kostet ~1292 Token, jede weitere ~28 — die Zahl der Capabilities ist kein
Token-Argument mehr.

### 3.5 Niveau C: Laufzeit und Rückgabe-Vertrag (PR #16)

Drei Module unter `src/main/worker/`: `result-contract.ts` (rein), `ollama-client.ts` (aus
dem Tagging herausgelöst), `c-worker.ts` (Orchestrierung mit genau einem Reparaturversuch).

Gemessen gegen echte Modelle:

| Modell | ok | repairs |
|---|---|---|
| qwen3 30B | true | 0 |
| mistral-nemo 12B | true | 0 |
| **moondream 1B** | **false** | **1** |

Moondream antwortete `[ "feld": "wert", "kleiner-kennzeichnung": "keel-ergebnis" ]` — weder
Block noch JSON. `parseTagResponse` hätte daraus stillschweigend Tags gemacht; hier ist es
ein gemeldeter Fehlschlag mit erhaltener Rohantwort. **Das ist der ganze Zweck, an einem
echten Fall.**

---

## 4. Was als Nächstes ansteht

### 4.1 Die Auftrags-Schnittstelle für C — die kürzeste Strecke zu etwas Benutzbarem

C ist heute eine **Bibliothek, kein Werkzeug**: Keine laufende Session kann einen C-Worker
beauftragen. Eine Entwurfsfrage steckt drin — **IPC-Kanal oder MCP-Werkzeug**, also ob der
Auftraggeber der Renderer ist oder die Session selbst. Für den Gefälle-Gedanken spricht das
MCP-Werkzeug: Dann kann eine Cyber-Factory-Session selbst Arbeit nach unten geben.

### 4.2 Die Benchmark-Strecke — jetzt baubar, ohne auf etwas zu warten

Der Nutzer will nicht an „bench-gemaxxten" offiziellen Benchmarks hängen. Der
Rückgabe-Vertrag ist die Voraussetzung: Was nicht maschinell prüfbar ist, ist nicht
bewertbar. Sie braucht die Auftrags-Schnittstelle **nicht**, nur `runCWorker`.

Der Entwurf lässt sie bewusst zu, ohne sie zu bauen: Modell ist Parameter pro Auftrag, der
Läufer hat keinen verborgenen Zustand, `raw` bleibt erhalten.

### 4.3 Billige Funde, die herumliegen

| Fund | Warum billig |
|---|---|
| **Embeddings** — `nomic-embed-text` ist auf der Maschine installiert, aber nur `NoopEmbeddingProvider` ist verdrahtet; die Vektorsuche ist praktisch reine Volltextsuche, obwohl `search.ts` ein `embedding` entgegennimmt | Embedding ist dasselbe Ein-Schuss-Muster wie C. Seit `ollama-client.ts` existiert, ist das ein kleiner Auftrag statt eines eigenen Brockens |
| **`project:create` überlebt den Neustart nicht** (über den Kickoff-Wizard angelegt schon) — live reproduziert | Deckt sich mit dem offenen Punkt „Projektliste nach `project:kickoff`" aus dem Vorgänger-Handover, ist jetzt aber reproduziert |
| **`niveauMinimum-sync`** im Workshop prüft seit Task 6 der Niveau-Strecke eine Ableitung gegen sich selbst | Schärfen oder streichen, beides klein |

### 4.4 Niveau B — von außen blockiert

Woher das `provider:modell`-Handle kommt und ob der Channel-Umschlag ein Feld dafür
bekommt, ist ungeklärt. **Das Nachrichtenformat hat kein Modellfeld** —
`NanoClawInboundMessage` trägt `channelType`, `platformId`, `threadId` und Text. Bei
Schenkel 1 wird das Modell ein CLI-Flag; hier gibt es keine Kommandozeile.

Vier Möglichkeiten, mit Bewertung, stehen im Gesprächsverlauf: NanoClaw besitzt die Wahl /
Rahmen nennt ein Handle / Rahmen nennt ein Tier und eine zweite Tabelle löst auf / **keel
wählt eine Agent-Group** (empfohlen — NanoClaws eigene Routing-Einheit trägt den Provider,
und keel nennt nie Modellnamen, die M2 „fragil" nennt).

Dazu fehlen weiterhin `NanoClawChannelCell` (ratifizierter 0.1-Inhalt aus M6 §3.1),
Lifecycle und Output-Events.

### 4.5 Unverändert offen

Das **Phase-8-Abnahmekriterium**: Erst-Start auf einem zweiten Apple-Silicon-Mac ohne
Entwicklungsumgebung. Hängt seit Wochen und ist das Einzige zwischen dem Bau und einer
Aussage über Auslieferbarkeit. Kein Release, kein Tag (Nutzer-Entscheidung 2026-08-09).

---

## 5. NanoClaw installieren — was das wirklich bedeutet

Der Nutzer fragte am 2026-08-13: „installier doch einfach nanoclaw?" Die Recherche ergab,
dass „einfach" hier nicht zutrifft.

**Es ist `nanocoai/nanoclaw`** auf GitHub — MIT, TypeScript, rund 30 500 Sterne, zuletzt am
2026-08-13 aktualisiert. Nicht auf npm unter diesem Namen. `~/.config/cipher-mux/channels/`
existiert nicht: **NanoClaw lief auf dieser Maschine noch nie.**

**Was `nanoclaw.sh` laut README tut:** Node und pnpm installieren, **Docker installieren**,
eine Anthropic-Credential bei OneCLI registrieren, den Agenten-Container bauen, einen Kanal
paaren (iMessage, Telegram, Discord, WhatsApp oder lokale CLI).

**Docker ist auf dieser Maschine nicht installiert**, pnpm ebenfalls nicht.

**Warum ich es nicht ausgeführt habe — die zwei Gründe sind unabhängig voneinander:**

1. **Das README verbietet es ausdrücklich:** „Run the script directly, not from inside a
   Claude session — the deterministic side needs interactive prompts and real shell I/O for
   Node/pnpm bootstrap, Docker, OneCLI, and the container build."
2. Es installiert Docker Desktop und hantiert mit Credentials. Das ist keine Aktion, die
   ein Assistent auf der Maschine eines Nutzers ungefragt vornimmt.

**Der Nutzer führt es selbst aus**, in dieser Session per `!`-Präfix:

```
! git clone https://github.com/nanocoai/nanoclaw.git ~/nanoclaw && cd ~/nanoclaw && ./nanoclaw.sh
```

**Und der Einwand, der die ganze NanoClaw-Frage neu aufmacht (Nutzer, 2026-08-13):** keel
soll herunterladbar und **assistiert einrichtbar** sein — Maßstab ist, dass eine
Claude-Code-Session die vollständige Einrichtung durchführen kann. Auslieferungsmodalitäten
zählen zum Ergebnis. Damit steht NanoClaws „nicht aus einer Claude-Session heraus" direkt
gegen die Anforderung, und Niveau B wäre der einzige Teil des Gefälles, der nicht assistiert
einzurichten ist. Das ist als **CK-NFR-013** in `docs/anpassbare-flaechen.md` festgehalten,
samt der Liste aller sieben heute nötigen Handgriffe und drei möglicher Auswege. **Diese
Frage gehört beantwortet, bevor NanoClaw installiert wird** — nicht danach.

**Ein Hinweis, der vorher bedacht gehört:** NanoClaw nutzt **nativ Claude Code über
Anthropics Agent SDK**. Sein Standardweg ist also wieder ein starkes Modell. Der Pfad, den
das Gefälle braucht, ist `/add-ollama-provider` — eine nachinstallierbare Skill. Wer
NanoClaw für Niveau B einrichtet, sollte diesen Schritt gleich mitgehen, sonst steht am Ende
ein zweites A statt eines B.

---

## 6. Fallen

**Die alten gelten unverändert:** native ABI (`npm run rebuild-native`, **nie** eine
Quelldatei ändern, Symptom rund 497 fallende Tests), Bündel-Wächter
(`npm run verify:bundle`, Marker ASCII ohne Anführungszeichen), die geteilte
`rolling-summary` mit drei Konsumenten, und die Sprachregel: Code englisch, Prompt-Inhalte
und `docs/superpowers/` deutsch.

**Neu aus dieser Session:**

- **npm-Majors sind nicht symmetrisch.** Wer hier `npm install` unter npm 11 laufen lässt
  und das Lockfile committet, während jemand anders npm 10 fährt, bricht dessen `npm ci`.
  `.nvmrc` steht jetzt auf 24, damit CI denselben Major fährt wie der Rechner. **Dieser
  Rechner läuft weiter Node 25, also End-of-Life** — `brew install node@24` würde das
  schließen, ist aber eine Entscheidung über die Maschine, nicht über das Repo.
- **Exit-Codes nie aus abgeschnittener Ausgabe schließen.** `npm run typecheck | tail -3`
  liefert den Code von `tail`, also 0. Richtig: `npm run typecheck >/dev/null 2>&1; echo $?`.
- **Das Scratchpad liegt außerhalb des Repos.** Relative Importe in Probe-Skripten greifen
  nicht; absolute Pfade benutzen.
- **Ein starkes Modell belegt keinen Fehlerpfad.** Der 30B formatierte auf Anhieb sauber und
  hätte den Reparaturweg nie gezeigt. Wer Fehlerverhalten belegen will, nimmt ein wirklich
  schwaches Modell (`moondream:latest`) statt den Fall künstlich zu erzwingen.
- **Vor dem Committen den Zweig prüfen.** In dieser Session landeten acht Commits
  versehentlich auf lokalem `main`; nichts war gepusht, also folgenlos reparierbar (Zweig
  an dieselbe Stelle, `main` auf `origin/main` zurück). Kostet drei Sekunden Prüfung.

---

## 7. Was ausdrücklich **nicht** belegt ist

- **Keine NanoClaw-Session lief je.** Der Adapter ist registriert, sein
  `buildLaunchCommand` ein No-op. `nanoclaw` meldet in der StatusBar korrekt „degradiert".
- **Kein Auftraggeber für C.** Der Messlauf ging über ein Wegwerf-Skript, nicht über eine
  Session.
- **Kein mehrzeiliges Nutzlastfeld im C-Vertrag getestet.** Die bekannte Schwäche —
  maskierte Zeilenumbrüche in JSON-Textfeldern — wurde nicht ausgereizt.
- **Keine Aussage über Arbeitsqualität der kleinen Modelle.** Gemessen ist Formattreue.
- **Der zweite Mac** (Phase-8-Abnahme) ist unangetastet.

---

## 8. Was zuerst zu lesen ist

1. Dieses Dokument
2. `docs/superpowers/specs/2026-08-13-niveau-c-rueckgabe-vertrag-design.md` — der C-Entwurf
   mit den Begründungen
3. `docs/superpowers/plans/2026-08-13-niveau-c-rueckgabe-vertrag.md` — Plan und
   Messprotokoll
4. `docs/anpassbare-flaechen.md` — CK-NFR-012, das testgebundene Inventar
5. `2026-08-11-handover-niveau-adapter.md` — der Vorgänger, für die Niveau-/Adapter-Strecke
6. Außerhalb des Repos:
   `cipher-keel-presets-ideation/deliverables/nachtrag-niveau-anbindung_2026-08-11.md` —
   sechs Konzept-Divergenzen, zwei davon inzwischen erledigt und dort vermerkt

> **Nicht lesen:** `HANDOFF.md` im Wurzelverzeichnis. Endet am 2026-06-05 bei Wave 4.
