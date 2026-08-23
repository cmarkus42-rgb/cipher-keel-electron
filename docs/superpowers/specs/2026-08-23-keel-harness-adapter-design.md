# Der `keel-harness`-Adapter — eine Niveau-B-Sitzung im Gitter

**Stand:** 2026-08-23 · Entwurf, abgenommen abschnittsweise am 2026-08-23 ·
Vorgänger: `docs/superpowers/plans/2026-08-23-handover-nach-niveau-c.md` Abschnitt 3.1

---

## 1. Was dieser Schritt schließt

keel existiert für ein Leistungsgefälle: starke Modelle oben, billige oder lokale unten, und
beides unter Aufsicht statt unter Vertrauen. Die billige Ebene **existiert und ist vermessen** —
ein lokales 27B fährt durch keels Schleife, ruft Werkzeuge, hält Budgets, recherchiert im Netz und
liest seine Fähigkeiten nach, bevor es sie benutzt.

Sie ist nur **noch keine Arbeitskraft.** `RUNTIMES_WITHOUT_ADAPTER` enthält weiterhin
`keel-harness`: kein Preset startet eine Niveau-B-Sitzung im Gitter, mit eigener Zelle,
Lebenszyklus und Ausgabeereignissen. Genau ein Schritt trennt „Motor läuft" von „Gefälle
funktioniert", und dies ist er.

Der Motor darunter ist fertig und gemessen. Dies ist Anschlussarbeit, keine Forschung.

---

## 2. Die abgenommenen Entscheidungen

| Frage | Entscheidung | Grund |
|---|---|---|
| Was ist eine Niveau-B-Zelle? | **Auftragszelle**, geschnitten so, dass „von oben beauftragbar" danach ein Werkzeug ist und kein Umbau | Der Mensch gibt heute den Auftrag; der Orchestrator später über denselben Kanal |
| Zelle = Lauf oder Platz? | **Platz.** Die Zelle lebt, bis der Mensch sie schließt | Ein Gitterplatz ist ein Platz, kein Ereignis. Fertige Läufe füllen das Gitter sonst mit Leichen |
| Kontext pro Auftrag | **Frisch**, außer das Modell trägt mehr — gemessen, nicht geraten (§7) | Kleine Modelle sollen einen Auftrag abarbeiten, dann frische Inferenz. Ein großes Modell soll das nicht müssen |
| Woher das Modell? | **Neuer Zuordnungsplatz** `sitzung:niveau-b` in den Einstellungen | Modellwahl gehört in Registry und Plätze, nicht in Preset-Quelltext |
| Wo der Fork? | **Zwei Adaptersorten über gemeinsamer Basis** (§3) | Ein Adapter, dessen halbes Interface „gibt es hier nicht" wirft, lässt die Frage „was ist ein Adapter" offen — und die kommt beim Codex-Adapter wieder |

Verworfen: der Harness als Prozess in einem tmux-Pane. Er hätte das Gitter unberührt gelassen,
verlangte aber einen **zweiten Zusammenbau** der Lauf-Umgebung (Graph-DB, Konfiguration,
Netzwache, Modell-Registry, Protokoll-DB) in einem zweiten Prozess. Das ist wörtlich die
Begründung, mit der `pruefeKeinUnterlauf` schon heute einen zweiten Zusammenbau ablehnt: *die
zweite Stelle ist die, die beim nächsten Umbau vergessen wird.*

---

## 3. Die Schnittstelle zerfällt in drei Teile

`src/main/agent/agent-adapter.ts`:

```
AgentAdapterBasis          id, displayName, tier, niveau, isAvailable(),
                           nichtVerfuegbarGrund(), getProjectMarkers(),
                           readProjectInstructions(), supports(), getCapabilities(),
                           buildWorkshop-/Launcher-/CyberFactoryPromptFragment()

CliSitzungsAdapter         = Basis + sitzungsart: 'tmux'
                             buildLaunchCommand(), sendPrompt(),
                             postLaunchInjection?, attachStatusHook?,
                             appGesteuerteParameter,
                             executeCommand(), streamOutput()

SchleifenSitzungsAdapter   = Basis + sitzungsart: 'eigene-schleife'
                             starteAuftrag(opts): Promise<{ laufId }>
                             brichAb(laufId): void

type AgentAdapter = CliSitzungsAdapter | SchleifenSitzungsAdapter
```

`sitzungsart` ist das Diskriminanzfeld. `SESSION_CREATE` engt daran ein, und **der Compiler**,
nicht ein geworfener Laufzeitfehler, hält die Trennung.

`executeCommand`/`streamOutput` (CK-ENT-026) wandern nach `CliSitzungsAdapter`. Beide werfen heute
im einzigen Adapter, den es gibt, mit der Begründung „das macht der SessionManager / der
tmux-Ausgabesammler" — sie beschreiben also genau die Trennung, die jetzt der Typ trägt.
**Zu prüfen beim Bau:** ob eine CK-Anforderung sie auf *jedem* Adapter verlangt. Falls ja, bleiben
sie, wo dieser Entwurf sie hinlegt, und der Befund steht im Commit; sie in die Basis zu heben,
hieße dem Schleifen-Adapter zwei Methoden ohne ehrliche Antwort zu geben.

**`nichtVerfuegbarGrund(): string | null`** ist neu in der Basis und räumt im Vorbeigehen auf:
`SESSION_CREATE` bastelt heute per `adapter.id === 'claude-code' ? describeMissingTool('claude') :
…` einen Text zusammen — der Adapter weiß, warum er nicht kann, und die Stelle, die es sagt, kennt
ihn nicht. Claude Code liefert `describeMissingTool('claude')`, der Schleifen-Adapter den leeren
Zuordnungsplatz. Die Sonderbehandlung in `ipc-handlers.ts` fällt weg.

`isAvailable()` des Schleifen-Adapters bleibt **synchron und ohne E/A**, wie das Interface es
verlangt: es liest die Zuordnung und die `eignung`-Matrix. Es klopft an keinen Endpunkt.

---

## 4. Der eine Zusammenbau

Heute steckt die Lauf-Maschinerie in `harness-handlers.ts`: `baueLaufUmgebung`, die Modul-Zustände
`db` / `abbruchmarken` / `laufendeLaeufe`, die Startsequenz mit dem `Promise.race` gegen das erste
`run.started`.

Sie wandert nach **`src/main/harness-sitzung.ts`** und bekommt zwei Aufrufer:

- `HARNESS_LAUF_STARTEN` (Harness-Fenster, unverändert im Verhalten)
- `KeelHarnessAdapter.starteAuftrag` (neu)

Mit wandern die reinen Helfer, die schon heute zur Lauf-Maschinerie gehören und nicht zur
IPC-Oberfläche: `auftragAusProtokoll`, `laufAbgeschlossen`, `istUnterlauf`, `pruefeKeinUnterlauf`,
`pruefeLaufLaeuftNicht`, `baueWerkzeugRegistry`. `harness-handlers.ts` importiert sie zurück, damit
keine bestehende Importstelle bricht — dieselbe Bewegung, mit der `verbrauch.ts` aus `lauf.ts`
herausgezogen wurde. `pruefeAnhaenge` und `dialogAusgewaehlt` bleiben **im Handler**: der
Anhang-Herkunftsnachweis hängt am Dateidialog des Fensters, und die Zelle hat keine Anhänge (§10).

Kein zweiter Zusammenbau. Das Modul liegt **außerhalb** von `src/main/harness/`, weil es
`electron` braucht (`app.getPath('userData')`) und der Wächter `tests/harness/waechter-kern.test.ts`
dort keinen `electron`-Import duldet — ohne Ausnahmeliste, denn eine Ausnahmeliste ist, wie ein
Wächter still aufhört zu wachen.

Der `KeelHarnessAdapter` importiert dieses Modul **lazy** (`await import(...)` in `starteAuftrag`),
genau wie `ClaudeCodeAdapter.attachStatusHook` den Statusline-Hook holt. Grund: `ansicht.ts` baut
für das Einstellungsfenster eine eigene `AdapterRegistry`, und die Tests dazu laufen ohne
Electron-Mock (`vitest.config.ts` kennt keine Setup-Datei) — ein eifriger Import zöge `electron` in
jeden davon.

### Der Fork in `SESSION_CREATE`

Alles bis zur Adapterwahl bleibt: Projekt, Entität, `getForRuntime`, `isAvailable`-Tor,
`getEntityDefinition(entityId, adapter.niveau)`. Danach:

- `sitzungsart === 'tmux'` → heutiger Weg, unverändert
- `sitzungsart === 'eigene-schleife'` → **kein** `materialiseCapabilities`, **kein**
  `writeEntityPromptFile`, kein tmux; stattdessen Eintrag im Zellenregister, Zustand
  `leerlaufend`, Rückgabe `{ id, name, sitzungsart }`

> **Korrektur vom 2026-08-23, beim Bau von Aufgabe 6 gefunden.** Der folgende Absatz war
> **falsch**, und zwar an der tragenden Stelle. Er stand hier so:
>
> > *„`materialiseCapabilities` schreibt `.claude/capabilities/` ins Projektverzeichnis, für ein
> > CLI, das dort nachliest. keels Schleife liest ihre Fähigkeiten über `faehigkeit_lesen` aus
> > ihrer eigenen Wurzel; dieselben Dateien ins Projekt zu schreiben wäre eine Nebenwirkung ohne
> > Verbraucher."*
>
> Nachgemessen am Code: `materialiseCapabilities` schreibt nach
> `<projekt>/.claude/capabilities/<id>/SKILL.md` (`session/materialise-capabilities.ts:61,72`),
> und `leseFaehigkeiten` — keels **eigener** Leser — durchläuft `WURZELN = ['skills',
> 'capabilities']` unter `<projektwurzel>/.claude/` (`harness/faehigkeiten.ts:51,140`). **Das ist
> dasselbe Verzeichnis.** Der Verbraucher, den es angeblich nicht gibt, ist keels eigene Schleife.
>
> Was daraus folgt, ist besser als das, was hier stand: der Schleifen-Weg **materialisiert
> ebenfalls**, und die Fähigkeiten erreichen das Modell über den Mechanismus, den das Harness
> schon hat — Name und Beschreibung als Stummel im stabilen Präfix, der Rumpf auf Abruf über
> `faehigkeit_lesen`. Das ist genau das aufgeschobene Laden aus §7 der Harness-Spec, statt den
> vollen Text in den zwischengespeicherten Präfix zu pressen.
>
> `EntitaetsTeile.capabilities` bleibt damit leer — aber aus einem **wahren** Grund: die
> Fähigkeiten kommen über die Fähigkeitswurzel, nicht über dieses Feld.

Der Unterschied zum CLI-Weg ist damit **kleiner**, als dieser Entwurf zunächst behauptete, und
liegt woanders: `writeEntityPromptFile` entfällt (keels Schleife bekommt den zusammengesetzten
Body über `assemblePraefixTeile`, nicht über eine Datei und einen Kommandozeilenschalter), und
`buildLaunchCommand` entfällt mit dem ganzen Pane. `materialiseCapabilities` läuft auf **beiden**
Wegen.

Der zusammengesetzte Body geht stattdessen dorthin, wo `harness-praefix-quelle.ts` sich im
Modulkopf **selbst als Naht bezeichnet**: *„heute ein schlichter Body und die Hausregeln, später
der zusammengesetzte Body einer Entität, Fähigkeiten und Persona."* `assemblePraefixTeile` bekommt
`body`, `persona` und `capabilities` aus `getEntityDefinition`, statt der drei fest verdrahteten
Sätze.

---

## 5. Platz, Preset, Modell

### 5.1 Ein neuer Platz, eine neue Art

`slots.ts` kennt heute `art: 'tier' | 'rolle'`, und der Modulkopf sagt warum: ein Tier fährt ein
CLI-Harness, eine Rolle verteilt einen einzelnen Job. Eine Sitzung ist keines von beidem — sie
unter `rollen` zu hängen machte den Satz im Kopf falsch. Also eine dritte Art:

```ts
{
  id: 'sitzung:niveau-b',
  beschriftung: 'Sitzung „Niveau B" — die eigene Schleife im Gitter',
  laeufer: 'eigene-schleife',
  niveau: CapabilityNiveau.B,
  art: 'sitzung', schluessel: 'niveau-b',
  wirkung: 'naechste-session',
}
```

Das weitet zwei Typen in `slots.ts`: `Slot.art` auf `'tier' | 'rolle' | 'sitzung'` und
`Slot.schluessel` auf `Tier | Rolle | Sitzungsschluessel` (neuer Typ, heute genau `'niveau-b'`).
`SlotAnsicht` in `src/shared/settings-types.ts` zieht nach, falls es die Art führt — beim Bau zu
prüfen; ein `art`-Feld, das im Renderer eine engere Union hat als in `slots.ts`, wäre dieselbe
Zahl an zwei Stellen mit unterschiedlicher Wahrheit.

Damit greift die `eignung`-Matrix **ohne eine einzige neue Regel**: `eigene-schleife` nimmt
`local-http` und `api`, ein `cli-harness`-Eintrag ist gesperrt, und `sperrgrund` liefert den Text,
den es schon gibt. `tests/model/eignung-einzige-quelle.test.ts` fängt es, wenn der neue Platz eine
Regel nacherzählt statt sie zu benutzen.

`wirkung: 'naechste-session'`, weil der Platz beim Zellenstart gelesen wird — ein Wechsel trifft die
nächste Zelle, nicht die laufende.

### 5.2 Konfiguration

Eine dritte Gruppe neben `tiers` und `rollen`:

```ts
zuordnung: {
  tiers:     { light: '', standard: '', heavy: '' },
  rollen:    { tagging: '', worker: '', rechercheur: '' },
  sitzungen: { 'niveau-b': '' },        // neu
}
```

Kein Migrationszweig — `deepMerge` legt den fehlenden Schlüssel aus den Vorgaben nach, und `''` ist
genau der Zustand „keine Zuordnung", den eine ältere Datei meint. Dieselbe Begründung steht schon
neben `rollen.rechercheur`.

`ansicht.ts` bekommt einen dritten Zweig dort, wo heute
`slot.art === 'tier' ? zuordnung.tiers[…] : zuordnung.rollen[…]` steht. `registry.ts` bekommt
`eintragFuerSitzung(schluessel)` neben `eintragFuerRolle`.

### 5.3 Leerer Platz = kein Start, mit Namen

Hier wird ausdrücklich **kein** Rückfall gebaut. `rolle:rechercheur` darf leer bleiben, weil es dort
einen ehrlichen Rückfall gibt (das Modell des Hauptlaufs). Hier gibt es keinen: der nächstliegende
wäre `llm.worker`, und das ist ein Ein-Schuss-Endpunkt für einen einzelnen Job, keine Sitzung.

> „Der Platz *Sitzung „Niveau B"* ist nicht belegt — ohne Modell startet keine Niveau-B-Zelle.
> Einstellungen → Modelle."

### 5.4 Das Preset nennt kein Modell

Neues Preset `keel-arbeiter`: `runtime: 'keel-harness'`, `capabilityNiveau: B`,
`rollenTyp: BeauftragteInstanz` (die Rolle existiert bereits und beschreibt genau diese Zelle),
`model: ''`.

Der Schleifen-Zweig ruft `resolveModel` / `tierAus` / `cliHandleFuerTier` **gar nicht** — die sind
für CLI-Handles gebaut. Er liest den Platz. Eine Zeile im Preset-Kopf sagt, dass `model` hier
absichtlich leer ist; sonst trägt es beim nächsten Umbau jemand nach, und es gäbe zwei Antworten auf
eine Frage.

`PRESET_CATALOG` (`src/shared/`) bekommt den Eintrag, damit der Launcher die Zelle anbietet.

### 5.5 `RUNTIMES_WITHOUT_ADAPTER`

Der Satz fällt mit dem Bau: `keel-harness` wandert nach `RUNTIME_TO_ADAPTER_ID`, die Menge wird
leer. Der Wächter `tests/agent/runtime-registry-completeness.test.ts` bleibt scharf — die lebende
Prüfung ist „jede bekannte Laufzeit hat einen Adapter **oder** ist benannt", und die trägt auch über
eine leere Menge. Der Zweig in `getForRuntime`, der „gültig, aber Adapter nicht gebaut" wirft,
**bleibt stehen**: er ist die Stelle, an der der nächste Wert (Codex, Gemini) landet.

---

## 6. Zelle und Lebenszyklus

### 6.1 Das Register

`src/main/session/schleifen-sitzungen.ts`, Name → Zelle:

```ts
{ name, wurzel, entityId, eintragId,
  zustand: 'leerlaufend' | 'laeuft',
  /** Der laufende Lauf — oder, im Zustand `leerlaufend`, der zuletzt gefahrene.
   *  `null` nur, solange die Zelle noch keinen Auftrag hatte. Beides in einem Feld,
   *  weil `weiterOderFrisch` (§7.4) genau den letzten Lauf braucht, um zu entscheiden;
   *  ein zweites Feld „letzteLaufId" wäre dieselbe Zahl an zwei Stellen. */
  laufId: string | null,
  letzterEndzustand: string | null }
```

### 6.2 Der Zustand hat genau eine Quelle

Der naheliegende Weg wäre, die Zelle im Renderer aus dem Ereignisstrom abzuleiten: `run.started` →
läuft, `run.finished` → leerlaufend. Der Hauptprozess braucht den Zustand aber ohnehin, um einen
zweiten Auftrag abzulehnen, solange einer fährt. Dann wüssten ihn **zwei** Stellen — und das ist die
Fehlersorte, die diese Strecke dreimal bezahlt hat (`aufgeschobenesLaden`, `klemmeMaxZeichen`,
`WORKER_TIMEOUT_MS`).

Also: **der Hauptprozess führt den Zustand**, gekippt im selben `.finally`, das heute schon
`abbruchmarken` und `laufendeLaeufe` aufräumt, und sendet `SESSION_STATUS_CHANGED` — den Kanal gibt
es bereits. Der Renderer rendert den Ereignisstrom und **leitet nichts ab.**

### 6.3 Der Auftragskanal

`SESSION_AUFTRAG = 'session:auftrag'`:

- `{ name, auftragstext }` → `HarnessAntwort<laufId>`
- läuft schon einer → Absage mit Namen, dieselbe Form wie `pruefeLaufLaeuftNicht`
- sonst: `weiterOderFrisch` entscheidet (§7); `frisch` → neue `laufId`, leere Historie,
  `STANDARD_BUDGETS`; `weiter` → `setzeFolgeauftrag` auf der bestehenden `laufId`

Der Kanal wird in `src/shared/ipc-channels.ts` deklariert **und** in die Union der
Renderer→Main-Kanäle aufgenommen; ein Kanal, der nur als Konstante existiert, kommt an der
typisierten Brücke nicht durch. `SESSION_STATUS_CHANGED` steht bereits in der Gegenrichtung.

### 6.4 Zerstören

`SESSION_DESTROY` verzweigt. Schleifen-Sitzung: Abbruchmarke setzen, Eintrag entfernen, kein tmux,
kein `removeEntityPromptFile` (es wurde keine geschrieben). Läuft gerade einer, endet er am nächsten
Zugrand — wie jeder Abbruch heute — und schreibt sein `run.finished` ins Protokoll. Die Zelle ist
dann schon weg; das Protokoll bleibt im Harness-Fenster lesbar. Das ist ehrlicher, als die Zelle bis
zum Zugende stehenzulassen und dabei so zu tun, als sei sie noch da.

### 6.5 Die Zelle im Renderer

`HarnessCell.tsx`: Kopf mit Name, Modell und Zustand; Auftragsfeld mit Knopf (aus, solange
`laeuft`); Abbrechen (nur solange `laeuft`); darunter das **bestehende** `EreignisPanel`, gefiltert
auf die `laufId` der Zelle. Nicht nachgebaut — es kennt bereits alle `EREIGNIS_ARTEN`, und sein
Wächtertest hält das so.

`SessionGrid` bekommt `type: 'harness'` neben `'session'` und `'launcher'`.

Ereignisse der **Unterläufe** (Rechercheur) zeigt die Zelle nicht: sie stehen unter eigener `laufId`
und erreichen den Elternlauf ohnehin als `unterlauf.verbraucht` und als Werkzeugergebnis. Das
Harness-Fenster bleibt der Ort, an dem man einen Unterlauf einzeln aufmacht.

---

## 7. Der Folgeauftrag — kontextempfindlich, nicht modellabhängig

### 7.1 Warum es nicht schon geht

Der Auftrag steht heute **nicht im Verlauf, sondern im stabilen Präfix**:
`baueStabilenTeil(teile, stummel)` setzt Body, Regeln, Fähigkeiten und `auftragstext` zu dem Block
zusammen, der über alle Runden zeichengleich bleibt — genau das macht ihn beim Anbieter
zwischenspeicherbar. `setzeFort` existiert nur, um einen **abgerissenen** Lauf mit *demselben*
Auftrag weiterzufahren; es nimmt keinen neuen an.

Das Präfix bei jedem Folgeauftrag umzuschreiben, tötete den Zwischenspeicher und machte
`run.started` zu einer Behauptung, die der Lauf nicht einhält. Ein falscher Grund im Protokoll ist
schlimmer als eine fehlende Funktion.

### 7.2 Das Ereignis

**`auftrag.folgend`**, Nutzlast `{ auftragstext }`. `run.started` bleibt unangetastet und behält
seinen ersten Auftrag. Der stabile Präfix bleibt zeichengleich — `## Auftrag` trägt weiter den
ersten Auftrag —, der Folgeauftrag kommt als Nutzer-Zug in den Verlauf.

### 7.3 Die Adjazenzregel ist die Falle

Ein Lauf, der mitten im Zug abgebrochen wurde, endet mit einer **Nutzer**-Nachricht (den
Werkzeugergebnissen). Ein Folgeauftrag als zweite Nutzer-Nachricht dahinter ist genau der Fehler,
der diesem Repo schon einen Abnahmelauf gekostet hat
(`messages.4: tool_use ids were found without tool_result blocks immediately after`).

In `projiziere`: erst `ergebnisseAusspuelen(true)`, dann — ist die letzte Nachricht bereits
`rolle: 'nutzer'` — den Auftragstext als **weiteren Block in diese** Nachricht hängen, sonst eine
neue aufmachen. Dieselbe Disziplin, der `nachgeladenes` schon folgt, und aus demselben Grund.

### 7.4 Die Entscheidung wiederholt keine Regel

`harness/fortsetzbarkeit.ts` (kein `electron`, gehört unter die Wurzel):

```
weiterOderFrisch(ereignisse, modellId, budgets, nutzbaresKontextfenster, jetztMs)
  → { weiter: boolean, grund: string }

  knapp = budgets, jedes Feld mit (1 − FOLGE_RESERVE) gestaucht
  pruefeBudgets(knapp, verbrauchAusEreignissen(…), fenster) !== null
     → weiter: false, grund = dessen `anweisung` (Klartext, schon vorhanden)
     → sonst weiter: true
```

Es prüft **alle vier** Budgets, nicht nur den Kontext: ein fortgesetzter Lauf **erbt** Runden, Zeit
und Kosten, weil `verbrauchAusEreignissen` kumulativ zählt. Genau die Fehlersorte, die diese Strecke
dreimal bezahlt hat — eine Zahl, die für einen Verbraucher richtig war, gilt für den zweiten nicht.
Die Reserve garantiert, dass ein fortgesetzter Auftrag Platz hat, statt in Runde eins ins
Abschlussverhalten zu fallen.

Praktisch, **ohne dass irgendwo eine Modellgröße steht**: wer Platz hat, führt fort; wer keinen
hat, fängt frisch an. Der Schalter ist die Messung, nicht der Modellname.

> **Korrektur vom 2026-08-23, in der Beweisfahrt gemessen.** Hier stand bis zuletzt der Satz
> *„das 27B mit knappem Fenster fällt nach einem echten Lauf auf `frisch`"* — als Beispiel für den
> Mechanismus und als Begründung dafür, dass der `weiter`-Zweig im Feld womöglich gar nicht
> fahrbar sei.
>
> **Das war falsch, und zwar ungeprüft behauptet.** `spark-qwen38-27b` trägt
> `nutzbaresKontextfenster: 65536` (`model/defaults.ts`), die Schwelle liegt damit bei
> 65536 · 0,8 · 0,75 = **39 322 Token**. Gemessen wurden **1,7–1,8k je Zug**. Fünf aufeinander
> folgende echte Aufträge in dieselbe Zelle liefen deshalb alle in **denselben** Lauf, jeder mit
> einem echten `auftrag.folgend` — gegen die Protokolldatenbank geprüft, nicht gegen den
> Fenstertext.
>
> Der Mechanismus ist damit **bestätigt**, nicht widerlegt: er hat gemessen entschieden, und die
> Messung fiel anders aus als meine Annahme. Falsch war die Illustration, nicht die Regel — und
> genau deshalb steht sie hier korrigiert statt gelöscht. Wer diesen Absatz künftig als Beispiel
> zitiert, zitiert eine Zahl aus `defaults.ts`, die selbst noch `quelle: 'vermutet'` trägt.

`FOLGE_RESERVE` ist eine anpassbare Fläche → Eintrag in `docs/anpassbare-flaechen.md`, auch wenn sie
in der App nicht editierbar ist (CK-NFR-012, dasselbe Argument wie beim `num_ctx` im Modelfile).

### 7.5 Der Einstieg

`setzeFolgeauftrag(laufId, auftrag, u, text)` kommt **neben** `setzeFort`, nicht hinein. `setzeFort`
heißt „derselbe Auftrag nach einem Abriss"; ihm eine zweite Bedeutung zu geben, wäre eine Funktion,
die zwei Dinge heißt. Der neue Weg schreibt das Ereignis und läuft dann durch dieselbe
`fahre`-Schleife.

Der übergebene `Auftrag` ist der **ursprüngliche** aus `auftragAusProtokoll` — Budgets und
`modellId` kommen von dort, nicht aus einem zweiten Zusammenbau. `praefixTeile.auftragstext` bleibt
der erste Auftrag, damit der Präfix zeichengleich bleibt.

Ein Lauf, der bereits ein `run.finished` trägt, bekommt am Ende des fortgesetzten Zuges ein
zweites. `laufUebersicht` liest ohnehin das **letzte** (`[...ereignisse].reverse().find(…)`), also
trägt die Übersicht das ohne Änderung.

---

## 8. Fehler — alle benannt, keiner still

| Lage | Verhalten |
|---|---|
| Platz `sitzung:niveau-b` leer | Start scheitert, `nichtVerfuegbarGrund` zeigt auf Einstellungen → Modelle |
| Zugeordneter Eintrag ist `cli-harness` | Start scheitert mit `sperrgrund` aus `eignung.ts` — kein neuer Text |
| Zweiter Auftrag bei laufendem | Absage mit Namen; der Auftrag geht nicht verloren |
| Lauf endet mit Fehler | `run.finished` mit Endzustand; Zelle → `leerlaufend`, Endzustand bleibt sichtbar |
| Fähigkeitszeile passt nicht zum Auftrag | `auftrag-unvereinbar` wie heute; die Schleife entscheidet es vor dem Senden |
| Prozess stirbt mitten im Lauf | Zelle ist weg (das Register ist Speicher). Der Lauf steht ohne `run.finished` im Protokoll und ist im Harness-Fenster als abgebrochen sichtbar. **Kein Wiederanlauf** — das wäre `setzeFort`, und der hat in der Zelle keinen Knopf |

Kein leeres `catch`, kein `?? []` über einem Fehler.

---

## 9. Wächter und Beweis

**Grüne Tests sagen in diesem Repo nichts über eine Verdrahtung** — dreimal war etwas gebaut,
getestet und von der App aus unerreichbar. Der Beweis steht deshalb auf drei Beinen.

### 9.1 Die Verzweigung wird testbar herausgezogen

Kein Test in diesem Repo erreicht `ipcMain`. Also folgt die Schleifen-Verzweigung dem Muster, das
`harness-handlers.ts` schon fährt (`pruefeAnhaenge`, `pruefeLaufLaeuftNicht`, `laufUebersicht`):
reine, exportierte Funktionen, die der Handler nur noch aufruft — `waehleSitzungsweg(adapter)`,
`pruefeZelleFrei(name, register)`, `modellFuerSitzung()`. Getestet wird gegen **diese**
Konstruktion, nicht gegen einen Nachbau; der Nachbau in `werkzeugliste.test.ts` war grün, während
die halbe Liste nicht verdrahtet war.

### 9.2 Wächter, jeder einmal rot gesehen

Falsifikation statt Bestätigung: Verletzung erzwingen, Test rot sehen, zurückstellen, und was zu
sehen war, steht im Commit.

| Wächter | Was er fängt |
|---|---|
| `sitzungsart` erschöpfend | ein Adapter ohne Sitzungsart; ein `default`-Zweig, den niemand erreicht, ist ein Typfehler statt eines stillen Durchfallens |
| `runtime-registry-completeness` | bleibt scharf über die nun leere `RUNTIMES_WITHOUT_ADAPTER` |
| `eignung-einzige-quelle` | der neue Platz erzählt eine Regel nach, statt sie zu benutzen |
| Register | zweiter Auftrag bei laufendem wird abgelehnt; Zerstören setzt die Abbruchmarke |
| `verlauf-anbietervertrag` | **neu:** Folgeauftrag hinter abgebrochenem Zug — zwei Nutzer-Nachrichten hintereinander |
| `ereignis-panel` | **vorhanden:** `auftrag.folgend` fehlt in Farbtabelle oder Kurzfassung; genau so ist `skill.geladen` still durchgefallen |
| `waechter-kern` | ein `electron`-Import unter `src/main/harness/` — betrifft `fortsetzbarkeit.ts` |

### 9.3 Der Beweis in der laufenden App

Skill `run-keel`, Profil behalten (sonst ist die Netz-Konfiguration weg):

```bash
KEEL_KEEP_PROFILE=1 .claude/skills/run-keel/launch.sh /tmp/keel-harness
node .claude/skills/run-keel/driver.mjs project-window "…"
.claude/skills/run-keel/stop.sh          # immer
```

Gefahren wird:

1. Zelle aus dem Launcher starten → Auftrag geben → Ereignisse laufen sehen
2. Zelle geht auf `leerlaufend`, Endzustand sichtbar
3. **Zweiter** Auftrag → bei knappem Modell frische `laufId` und leerer Kontext, belegt am Protokoll
4. Die zwei Absagen im Feld erzwungen: leerer Platz, zweiter Auftrag bei laufendem

Screenshots und die `laufId`s ins Protokoll. Ohne das ist der Schritt nicht fertig, egal wie grün
die Suite ist.

**Zwei Fallen des Werkzeugs**, beide schon bezahlt: der CDP-Treiber kappt eine Antwort bei rund
65 KB — bei langen Läufen im Fenster zählen statt das ganze Protokoll zurückzugeben. Und ein
`onBlur` im Renderer hängt an `focusout`, nicht an `blur`.

### 9.4 CK-NFR-012

Zwei neue anpassbare Flächen, beide mit Eintrag in `docs/anpassbare-flaechen.md`:

- der Zuordnungsplatz `sitzung:niveau-b` (in der App editierbar, Einstellungen → Modelle)
- `FOLGE_RESERVE` (nicht editierbar, ausdrücklich als solche geführt)

---

## 10. Was ausdrücklich nicht dazugehört

- **Kein MCP-Werkzeug zum Beauftragen von oben.** Der Bau macht es zu genau einem Werkzeug, das
  `SESSION_AUFTRAG` ruft — mehr nicht. Es ist der nächste Schritt, nicht dieser.
- **Kein Fortsetzen-Knopf.** Ein abgerissener Lauf wird in der Zelle nicht wiederangeworfen; der
  Folgeauftrag (§7) ist etwas anderes und hat seinen eigenen Weg.
- **Keine Anhänge in der Zelle.** Der Dialog-Herkunftsnachweis (`dialogAusgewaehlt`) hängt am
  Harness-Fenster; ihn zu erweitern wäre eine zweite Grenze.
- **Keine Budget-Oberfläche.** `STANDARD_BUDGETS` bleibt eine benannte Konstante, geteilt mit dem
  Harness-Fenster.
- **Kein Codex-, kein Gemini-Adapter.** Die Schnittstellentrennung macht sie leichter; gebaut werden
  sie hier nicht — sie sind Abo-CLIs mit starken Modellen und zahlen nicht aufs Gefälle ein.

---

## 11. Risiken, offen benannt

- **`executeCommand`/`streamOutput` in der Basis oder nicht** (§3) — beim Bau gegen die
  CK-Anforderungen zu prüfen; der Befund gehört in den Commit, nicht in eine stille Entscheidung.
- **Der Folgeauftrag ist der einzige Teil, der die Schleife selbst anfasst.** Alles andere ist
  Anschlussarbeit. Wenn etwas in diesem Bau kippt, dann hier — deshalb der eigene Wächter gegen die
  Adjazenzregel, und deshalb ist er einmal rot zu sehen, bevor er grün ist.
- **`FOLGE_RESERVE` ist geschätzt, nicht gemessen.** Der Wert bekommt beim Bau eine Zahl und einen
  Kommentar, der sagt, dass er geschätzt ist. Was er *nicht* bekommt, ist ein Kommentar, der eine
  Messung behauptet — in dieser Strecke sind vier solcher Behauptungen gefallen.
- **`spark-qwen38-27b` trägt weiter `quelle: 'vermutet'`.** Dieser Bau ändert das nicht; dafür
  bräuchte es einen Kanarienauftrag.
