# Niveau- und Adapter-Anbindung — Design

**Stand:** 2026-08-11
**Ausgangspunkt:** die offenen Punkte aus `plans/2026-08-11-handover-entitaets-startstrecke.md`
**Konzept-Grundlage:** M2 `konzept_v1.1.md` (Presets, Abschnitte 4–11), M4 `konzept_v1.0.md`
(Prozess), M6 `konzept_v0.1.md` §3.1 (0.1-Schnitt), M8 `00_seed.md` (Harness-Adapter)

---

## 1. Warum das hier gebaut wird

cipher keel soll ein **Leistungsgefälle** bedienbar machen: starke Modelle dort, wo Fehler
sich vervielfachen — Ideation, Requirements, Systems Engineer, Architect —, billige oder
lokale Modelle dort, wo Arbeit mechanisch und in Menge anfällt, und beides unter Aufsicht
statt unter Vertrauen. M4 formuliert das als Leitmotiv **„lokal leistbar"** und stellt die
keel-Ebene ausdrücklich *über* die ausführende Ebene: Sie führt, versorgt mit Kontext und
urteilt an Gates — sie führt nicht selbst aus.

Die Niveaus A/B/C sind der Mechanismus dieses Gefälles, nicht eine Sparvariante. Ein
lokales Modell hat kein Harness, das `@`-Referenzen auflöst, und kein Kontextfenster für
32 Capability-Dateien. **Niveau B und C sind die Bedingung, unter der ein schwaches Modell
überhaupt beauftragbar wird.** Das ist der Unterschied zu cipher-mux, der genau eine Ebene
kannte und deshalb auch keinen Anlass für Niveaus hatte.

Heute läuft davon nichts. Jede Session ist A, jede Session läuft auf dem Harness-Default,
und der einzige gebaute zweite Adapter ist nicht registriert.

---

## 2. Ausgangslage — gemessen, nicht vermutet

### 2.1 Die Capability-Deklaration steht drei- bis fünffach im Code

Fünf Entitäten in drei unvereinbaren Formen:

| Entität | Paket-Deklaration | Produktionspfad liest |
|---|---|---|
| Architect | `getArchitectCapabilities(niveau) → Package[]` | drei handgepflegte String-Listen |
| Cyber Factory | `getCfCapabilities(niveau) → Package[]` | dito |
| Systems Engineer | `SE_PACKAGES` | `getSECapabilities(niveau) → string[]` |
| Workshop | `WORKSHOP_PACKAGES` | `pakete`-Listen in der Niveau-Config |
| Testing Assistant | `TA_PACKAGES` | `TA_CAPABILITIES` |

Dazu kodiert jedes Paket seinen `pfad` von Hand, obwohl `capabilityRefPath(id)` genau
diesen Pfad erzeugt, und `CAPABILITY_SKILLS` führt dieselben IDs ein viertes Mal.

`capability-tree.ts` und `capability-loader.ts` sind ausschließlich aus Tests erreichbar.
Ihr Lazy-Loading liest `pkg.pfad` von Platte — Inhalte liegen aber seit Task 14 per `?raw`
im Bundle.

### 2.2 Der zweite Schenkel ist gebaut und fallen gelassen

`src/main/nanoclaw/` enthält 619 Zeilen: `NanoClawBridge` (Unix-Domain-Socket,
JSON-Lines, Reconnect), `NanoClawChannelAdapter` (`implements AgentAdapter`, `tier-2`,
vollständige `getCapabilities()`), `container-env.ts`. Der Adapter trägt fertige
Prompt-Fragmente mit der Überschrift „Worker-Session (NanoClaw)", empfiehlt
`/add-ollama-provider` für lokale Modelle und beschreibt Multi-Modell-Routing über
Agent-Groups. `buildLauncherPromptFragment` gibt bewusst leer zurück — NanoClaw-Sessions
werden beauftragt, nicht aus dem Launcher gestartet. Genau M4s ausführende Ebene.

`AdapterRegistry` kennt bereits `'nanoclaw-channel-route' → 'nanoclaw-channel'`.

Und dann: `main.ts:56` konstruiert den Adapter in `const _nanoClawAdapter` und
**registriert ihn nie**. `ipc-handlers.ts:188` ruft `getDefault()`, ignoriert also
`rahmen.runtime` vollständig. Die Runtime-Auflösung der Registry hat außerhalb ihrer
eigenen Datei keinen Aufrufer. Alle fünf Presets tragen `runtime: 'claude-cli-tmux'`.

**Konsequenz heute:** Ein Preset mit NanoClaw-Runtime würde still eine Claude-Session
starten. Kein Fehler, keine Meldung.

### 2.3 Das Modell-Gefälle ist ausgedrückt und wird verworfen

Die Presets sagen es sauber — SE `heavy`, Architect `heavy` auf A und Standard darunter,
CF/TA/Workshop leer. `ipc-handlers.ts:209-212` lässt `model` **bewusst** weg, weil
`'heavy'` auf keine Model-ID abbildet. Jede Session läuft auf dem Harness-Default. Es
existiert Vokabular, keine Steuerung.

M2 §5.3/§6.3 legt die Form fest: Tier-Bezeichner `light | standard | heavy` auf
Schenkel 1 („konkrete Handles möglich, aber fragil"), **oder** `provider:modell` auf
Schenkel 2 — Beispiele im Konzept: `anthropic:claude-opus-4`, `ollama:gemma3:27b`.

### 2.4 Vier Divergenzen zwischen Bau und Konzept

Beim Abgleich mit M2/M6 gefunden, alle vier neu:

1. **Eine Assemblierungs-Schicht fehlt ersatzlos.** M2 §9.1 und §17.4 führen fünf
   Schichten: Body, Persona, globale Regeln, Capability-Äste **und die kontext-tragende
   Schicht — den graph-aufgelösten `phaseninput`**. Gebaut sind vier. Damit startet eine
   Entität mit Rollenwissen, aber ohne zu wissen, wo im Prozess sie steht; M4s
   graph-vermittelter Handoff (§6.1) hat im Prompt keinen Träger. Ausgerechnet die
   Kernleistung — M4 nennt die keel-Ebene den „idealen Kontext-Lieferanten" — fehlt.
2. **Niveau C ist 0.2, nicht 0.1** (M6 Z. 177). C ist in M2 v1.1 vollständig definiert,
   aber ausdrücklich zurückgestellt.
3. **Niveau A weicht schon heute ab.** M2 §5.4 verlangt Capabilities als SKILL.md unter
   `.claude/skills/` mit Claude Codes nativem Inventar-Mechanismus — Kurzbeschreibungen im
   Prompt, Inhalt erst bei Aktivierung. Gebaut sind `@`-Referenzen auf
   `.claude/capabilities/`. Ob dabei lazy geladen wird, ist **ungemessen**: Die
   `KEELPROBE7`-Probe (Messprotokoll Task 9) fragte nach dem Codewort, die Datei musste
   also geladen werden — ob eifrig beim Start oder bedarfsgesteuert, unterscheidet sie
   nicht. Lädt A eifrig, ist „Lazy-Loading als Pflicht" (M2 §13) nicht erfüllt.
4. **`NanoClawChannelCell` und der Channel-Handshake stehen im ratifizierten
   0.1-Schnitt** (M6 §3.1, wörtlich: „Preset-Bauplan Niveau B (Schenkel-2-Pfad):
   NanoClaw-Pane-Typ im SessionGrid (NanoClawChannelCell), Body-Payload via
   Channel-Handshake"). Beides fehlt im Repo — und in der Fertigstellungs-Roadmap vom
   2026-08-06, die stattdessen Phase 10 auf „Codex oder Gemini" richtet.

---

## 3. Scope

### 3.1 In dieser Runde

1. Capability-Pakete werden die einzige Deklaration je Entität
2. Das Niveau kommt vom Adapter
3. `rahmen.runtime` löst den Adapter auf; NanoClaw wird registriert
4. Emission nach Niveau: A unverändert, B als Inventar mit Pfaden
5. `model` wird zweiformig aufgelöst und durchgereicht
6. Prompt-Vorschau ohne Session-Start (Transparenz)
7. Die Meta-Anforderung „anpassbare Flächen sind sichtbar" als prüfbare Anforderung
   samt Inventar

### 3.2 Ausdrücklich nicht, mit Grund

| Nicht drin | Grund |
|---|---|
| Niveau-C-Emission | 0.2 laut M6 Z. 177. Die C-Daten bleiben, der Assembler lehnt C explizit ab statt still A-Verhalten zu zeigen. |
| NanoClaw-Session Ende-zu-Ende | `buildLaunchCommand` ist dort ein No-op; Sessions sind Bridge-Threads. Grid-Zelle, Lifecycle und Output-Events sind eine eigene Phase und brauchen eine laufende NanoClaw-Instanz für einen echten Messlauf. |
| Die fünfte Schicht (`phaseninput`) | Eigene Phase, aber **vor** NanoClaw-Sessions — siehe §8. |
| OpenCode-Adapter | Möglich und gewollt, aber `06-offene-punkte.md` verlangt die Lizenz-/ToS-Verifikation vor dem Bau. Als Vorlage/Inspiration ist der Weg frei. |
| Editierbarkeit der Prompts | Benannte Folgephase, siehe §7.3. |

---

## 4. Design

### 4.1 Eine Quelle pro Entität

Das `CapabilityPackage[]` je Entität ist die einzige Deklaration. Ein einheitlicher
Zugriff ersetzt die fünf Formen:

```ts
// src/main/preset/capabilities.ts
export function getCapabilityPackages(
  entityId: string,
  niveau: CapabilityNiveau,
): CapabilityPackage[]
```

`capabilityAnbindung` entsteht daraus als `.map(p => p.name)`. Die handgepflegten
Niveau-Listen entfallen ersatzlos: `NIVEAU_B_CAPABILITIES`/`NIVEAU_C_CAPABILITIES`
(Architect), die `pakete`-Listen (Workshop), `SE_CAPABILITIES_A/B/C`, `TA_CAPABILITIES`.
Gefiltert wird über `niveauMinimum`, das in den Paketen bereits steht.

**`pfad` wird abgeleitet, nicht gelöscht.** M2 §6.4 kennt den Loader `nanoclaw-skill`,
dessen `pfad` eine Channel-Route ist und nicht aus der ID folgt. Deshalb:

```ts
export function capabilityPath(pkg: CapabilityPackage): string {
  return pkg.pfad ?? capabilityRefPath(pkg.name)   // skill-md: aus der ID abgeleitet
}
```

`pfad` wird im Schema optional; für `skill-md`-Pakete verschwindet es aus den Literalen.
`validateCapabilityPackage` verlangt es künftig nur noch für Loader, die es brauchen.

**Wächtertest, beidseitig:** Jeder Paketname hat einen `CAPABILITY_SKILLS`-Eintrag, und
jeder Eintrag gehört zu einem Paket. Damit kann eine Fehlpaarung den Build nicht mehr
passieren — was den Punkt erledigt, dass `console.warn` für fehlende Capabilities in der
gepackten App unsichtbar ist.

`capability-tree.ts` und `capability-loader.ts` entfallen samt ihren Tests. Ihre Aufgabe
existiert nicht mehr: Bei A lädt Claude Code, bei B liest der Agent selbst, bei C wird
nichts geladen. Das Inventar, das `getInventory()` lieferte, wandert in den Assembler und
wird dort für die B-Emission gebraucht (§4.4) — auf A entsteht kein Inventar-Block.

`capability-lint.ts` bleibt als Prüfregel.

### 4.2 Das Niveau kommt vom Adapter

M2 §11.3 legt die Zuordnung fest: `ClaudeCodeAdapter → A`, `NanoClawChannelAdapter → B`,
die perspektivischen Adapter (OpenCode, Codex, Gemini) ebenfalls B. Das Niveau ist damit
eine Adapter-Eigenschaft, keine Nutzerpräferenz:

```ts
interface AgentAdapter {
  readonly niveau: CapabilityNiveau
  // ...
}
```

Der Adapter deklariert mit `getCapabilities()` bereits eine Feature-Matrix; das Niveau
tritt daneben als eigenes, explizites Feld — abgeleitet werden könnte es, aber M2 nennt
es pro Adapter direkt, und eine Ableitung wäre eine Interpretation, die das Konzept nicht
verlangt.

**Auflösungsreihenfolge.** `runtime` steht im Rahmen, das Niveau kommt aus dem Adapter,
und der Rahmen hängt vom Niveau ab. Aufgelöst wird in zwei Schritten über einen billigen
Rahmen-Zugriff, der keine Persona lädt:

```
getEntityRahmen(entityId)          → rahmen.runtime
adapterRegistry.forRuntime(runtime) → adapter
adapter.niveau                      → niveau
getEntityDefinition(entityId, niveau)
```

### 4.3 `runtime` löst den Adapter auf, NanoClaw wird registriert

`ipc-handlers.ts` ersetzt `getDefault()` durch `forRuntime(rahmen.runtime)` — die Methode
existiert bereits ungenutzt in der Registry. Leerer Wert heißt Default (M2 §11.4),
unbekannter Wert wirft mit dem Wert im Text, ohne stillen Rückfall.

Die Registry wird nicht mehr als Modul-Singleton in `ipc-handlers.ts` erzeugt, sondern in
`registerIpcHandlers(services)` — dort ist `services.nanoClawBridge` verfügbar, und der
`NanoClawChannelAdapter` wird registriert statt in `main.ts` in eine Unterstrich-Variable
konstruiert zu werden.

Ist der aufgelöste Adapter nicht verfügbar (`isAvailable() === false`, bei NanoClaw: keine
Socket-Verbindung), bricht `session:create` mit einer klaren Meldung ab, statt auf Claude
zurückzufallen.

**Verhalten heute:** unverändert, weil alle fünf Presets `claude-cli-tmux` tragen. Was
sich ändert, ist die Ehrlichkeit des Pfades.

### 4.4 Emission nach Niveau

Der Assembler verzweigt an einer Stelle, gesteuert von `getNiveauConfig(niveau).loaderStrategie`:

| Niveau | Strategie | Emission |
|---|---|---|
| A | `nativ` | `@.claude/capabilities/<id>/SKILL.md` — **unverändert** |
| B | `manuell` | Inventar-Block: je Capability `beschreibung` + Pfad, plus die Anweisung, sie bei Bedarf selbst zu lesen |
| C | `inline` | nicht gebaut — `NiveauNotSupportedError` |

Niveau A wird bewusst **nicht** angefasst. Die Emission ist dreimal in der laufenden App
belegt; die offene Frage aus §2.4 Punkt 3 ist eine Messfrage, keine Umbaufrage, und wird
vor einer Änderung beantwortet (§8).

Für B gilt M2 §6.4 Strategie 1 („Skills als explizit ladbare Dateien … manuelles
Lazy-Loading"). Die Materialisierung nach `.claude/capabilities/<id>/SKILL.md` bleibt
identisch — nur der Prompt referenziert anders. Damit bekommt `beschreibung` zum ersten
Mal einen Leser.

Die Niveau-C-Obergrenze wird entschieden statt weiter dreifach geführt: **500 Token pro
Paket** bleibt die Lint-Regel in `capability-lint.ts`, **2000 Token für den ganzen
Prompt** ist die Grenze aus M2s eigener Tabelle (§4: C = 500–2.000 Tokens Overhead) und
wird am Assembler geprüft, sobald C gebaut wird. Der 800er-Kommentar in
`architect-capabilities.ts` fällt — er benannte keinen Geltungsbereich.

### 4.5 `model` zweiformig auflösen

Neu in der Config, sichtbar und später editierbar:

```ts
agent: {
  skipPermissions: boolean
  modelTiers: { light: string; standard: string; heavy: string }
}
```

Defaults: `{ light: 'haiku', standard: 'sonnet', heavy: 'opus' }` — **Aliase, keine
gepinnten IDs**, weil M2 konkrete Handles ausdrücklich als fragil bezeichnet und Aliase
Modellwechsel überleben. Ein leerer Wert heißt „Harness-Default", das heutige Verhalten.

Auflösung:

```
rahmen.model enthält ':'  → Schenkel 2, unverändert durchreichen (provider:modell)
rahmen.model sonst gesetzt → Tier, in agent.modelTiers nachschlagen
Ergebnis leer              → --model weglassen (heutiges Verhalten)
```

Der aufgelöste Wert geht als `model` in `buildLaunchCommand`; `ClaudeCodeAdapter`
verarbeitet ihn bereits zu `--model`.

**Das ist eine Verhaltensänderung mit Kostenwirkung** und die einzige dieser Runde:
Systems-Engineer- und Architect-Sessions starten danach auf der Opus-Klasse statt auf dem
Harness-Default. Genau das ist die Absicht des Gefälles — aber es gehört benannt, nicht
nebenbei ausgeliefert, und es wird in der laufenden App belegt (§6).

### 4.6 Transparenz: Prompt-Vorschau

Neuer IPC-Kanal:

```
preset:preview-prompt  { entityId, niveau? }
  → { prompt, schichten, capabilities, modelResolved, niveau, adapterId, tokenEstimate }
```

Er assembliert denselben Prompt wie `session:create`, **ohne** eine Session zu starten und
ohne ins Projekt zu schreiben: Die Capability-Auflösung läuft als Trockenlauf und meldet,
welche Referenzen entstünden. Ohne `niveau` gilt das des aufgelösten Adapters; mit
`niveau` lässt sich jede Stufe ansehen, auch eine, für die kein Adapter existiert — das
macht die Dreiteilung inspizierbar, statt sie zu behaupten.

Der Kanal ist das tragende Stück. Die UI ist dünn: in der `LauncherCell` je Preset eine
Aktion „Prompt ansehen", die das Ergebnis in einem scrollbaren Dialog zeigt — Schichten
erkennbar getrennt, damit sichtbar ist, was woher kommt.

### 4.7 Die Meta-Anforderung als prüfbare Anforderung

Als **CK-NFR-012** aufgenommen (012 ist frei; höchste vergebene ist 011):

> Jede Fläche, die ein Nutzer sinnvoll anpassen kann — Einstellung, Prompt, Persona,
> Regel, Parameter —, ist in der App auffindbar, in ihrer Herkunft benannt und entweder
> editierbar oder ausdrücklich als „noch nicht editierbar" geführt. Eine anpassbare
> Fläche, die nur durch Editieren einer Datei außerhalb der App erreichbar ist und
> nirgends benannt wird, verletzt diese Anforderung.

Dazu ein **Inventar** unter `docs/anpassbare-flaechen.md`: je Fläche Ort, Sichtbarkeit,
Editierbarkeit, Stand. Der heutige Stand wird ehrlich eingetragen, nicht geschönt —
`agent.skipPermissions` etwa ist sicherheitsrelevant und ausschließlich per Config-Datei
erreichbar.

**Das Inventar ist Audit-Inhalt:** Ein Audit prüft es gegen die Realität, nicht gegen sich
selbst. Neue anpassbare Flächen ohne Inventar-Eintrag sind ein Audit-Befund.

---

## 5. Fehlerverhalten

| Fall | Verhalten |
|---|---|
| `runtime` unbekannt | `Error` mit dem Wert im Text, kein stiller Rückfall (existiert) |
| `runtime` leer | Default-Adapter (M2 §11.4) |
| Adapter nicht verfügbar | `session:create` bricht mit Meldung ab, kein Rückfall auf Claude |
| Niveau C angefordert | `NiveauNotSupportedError` — ausdrücklich, statt still A-Verhalten |
| Capability ohne `CAPABILITY_SKILLS`-Eintrag | Wächtertest schlägt fehl; zur Laufzeit meldet die Materialisierung sie als fehlend |
| Tier nicht in `modelTiers` | `--model` entfällt, wie heute |

---

## 6. Nachweis

**Tests.** Für die Adapter-Auflösung ist der Präzedenzfall
`tests/session/session-create-claude-gate.test.ts` einschlägig: Er erreicht per
`vi.doMock('electron')` den echten `ipcMain`-Handler. Der Satz „grüne Tests sagen über die
Verdrahtung nichts" gilt für diesen Pfad nicht mehr.

**In der laufenden App**, über `.claude/skills/run-keel/`, weil kein Test eine echte
Session startet:

1. Architect-Session über `{ entityId }` — `ps -ww` muss `--model opus` zeigen. Das ist
   der Beleg für §4.5 und die einzige Verhaltensänderung dieser Runde.
2. Die Prompt-Vorschau für dieselbe Entität muss **byte-identisch** zu der Datei sein, die
   die Session tatsächlich bekommt. Eine Vorschau, die etwas anderes zeigt als das
   Ausgelieferte, ist schlimmer als keine.
3. Prompt-Vorschau auf Niveau B: Inventar mit Beschreibungen und Pfaden, keine `@`-Zeilen.

**Was nicht belegt werden kann und als offen zu führen ist:** eine NanoClaw-Session
Ende-zu-Ende (kein Daemon in dieser Runde), und ob Niveau A lazy lädt (eigene Messung,
§8).

---

## 7. Was diese Runde nicht liefert

### 7.1 Die fünfte Schicht

Der graph-aufgelöste `phaseninput` bleibt unassembliert. Bis dahin startet jede Entität
mit Rollenwissen ohne Prozesskontext.

### 7.2 NanoClaw-Sessions

Registriert und auflösbar, aber nicht lauffähig: kein Grid-Zellentyp, kein
Channel-Handshake, keine Output-Events.

### 7.3 Editierbarkeit

CK-NFR-012 verlangt Sichtbarkeit **oder** die ausdrückliche Kennzeichnung als nicht
editierbar. Diese Runde liefert Sichtbarkeit. Editierbarkeit braucht ein
Overlay-Verzeichnis für nutzereigene Fassungen, eine Vorrangregel gegenüber den
gebündelten Inhalten und eine Validierung — eigene Phase.

---

## 8. Folgephasen, in Abhängigkeitsreihenfolge

1. **Die fünfte Schicht** — `phaseninput` aus dem Graphen in den Prompt. **Vor**
   NanoClaw-Sessions: Ein billiges Modell ohne Auftrag zu beauftragen ist der teuerste
   Fehler dieser Architektur.
2. **Messung: lädt Niveau A lazy?** Eine Session mit und ohne Capabilities, Token-Verbrauch
   beim Start vergleichen. Billig, und das Ergebnis entscheidet, ob die A-Mechanik gegen
   M2 §5.4 umgebaut werden muss.
3. **NanoClawChannelCell und Channel-Handshake** — ratifizierter 0.1-Inhalt (M6 §3.1), mit
   laufender NanoClaw-Instanz gemessen.
4. **Niveau C** — 0.2 laut M6.
5. **Editierbarkeit** — §7.3.
6. **OpenCode-Adapter**, falls gewollt — mit vorheriger Lizenz-/ToS-Verifikation.

---

## 9. Konzept-Divergenzen für den Nachtrag

Nach der Projektregel („Konzept-Hoheit": weichen Konzept und Bau ab, wird das Konzept
präzisiert, außerhalb des Repos) gehören in einen Nachtrag zu M2/M6:

1. Die fehlende fünfte Schicht — Bau bleibt hinter Konzept zurück, nicht umgekehrt
2. Niveau A: `@`-Referenzen auf `.claude/capabilities/` statt SKILL.md unter
   `.claude/skills/`, mit der ungemessenen Lazy-Loading-Frage
3. `NanoClawChannelCell` und Channel-Handshake als ratifizierter 0.1-Inhalt, der aus der
   Fertigstellungs-Roadmap verschwunden ist
4. Die Roadmap-Beobachtung: Phase 10 („Codex oder Gemini") zahlt auf die
   Multi-Harness-Aussage ein, aber nicht auf das Gefälle-Ziel — dafür ist NanoClaw der
   Pfad
5. Annahme A4 aus M2 §5.4 ist durch Messprotokoll Task 9 erledigt; **A4b**
   (laden NanoClaw-Skills bedarfsgesteuert?) bleibt offen

---

## 10. Sprachregel

Code-Kommentare, Bezeichner und Testnamen **englisch**; Prompt-Inhalte und die Dokumente
unter `docs/superpowers/` **deutsch**.
