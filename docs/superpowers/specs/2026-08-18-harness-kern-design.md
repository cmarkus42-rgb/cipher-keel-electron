# Design: Der Harness-Kern — Schleife, kanonische Form, Ereignisprotokoll, lesende Werkzeuge

**Stand:** 2026-08-18
**Autorität:** `cipher-keel-harness-ideation/deliverables/konzept_v1.0.md` (M8, freigegeben
2026-08-16), außerhalb des Repos unter `/Users/Shared/Nextcloud/Claude/`
**Vorlage:** `docs/superpowers/plans/2026-08-18-handover-settings-fenster-steht.md` §2, §4
**Release-Schnitt:** entschieden im M6-Nachtrag `nachtrag-nanoclaw-abloesung_2026-08-16.md` —
das Harness-Subsystem liegt vollständig in 0.1

## 1. Warum diese Strecke, und warum genau dieser Ausschnitt

M8 gibt v1 als siebzehn Zeilen mit einer Reihenfolge-Spalte vor, sortiert **nach
Nachrüstbarkeit, nicht nach Wichtigkeit**: Was später teuer wird, kommt zuerst.

| M8 §7 | Inhalt | in dieser Strecke |
|---|---|---|
| 1 | Kern / Ereignisstrom / Eingabekanal | ja |
| 2 | Kanonische Form inkl. `image` und `document` | ja |
| 3 | Ereignisprotokoll, Verlauf als Projektion, Wiederaufnahme | ja, vollständig |
| 4 | Präfix-Ordnung, Stummelliste, aufgeschobenes Laden | ja, vollständig |
| 5 | Vier Budgets, drei Endzustände, Abschlussmodus | ja, mit **zwei** Endzuständen (§8.2) |
| 7 | Zwei Codecs (`anthropic`, `openai-chat`) | ja |
| 9 | Voller Werkzeugsatz | **nur die lesende Hälfte** (§5) |
| 11 | Rückgabe-Vertrag an den Außenkanten | ja — vorhanden, wird eingebunden |

Nicht in dieser Strecke: schreibende Werkzeuge, Editieren, Shell (Rest von Zeile 9),
OS-Ausführungsgrenze und Sandbox-Profile (10), Kompaktierung (13), `ausgesetzt` samt Weckdienst
(6), Delegation (8), Kanarienauftrag (12), die nachgelagerten Zeilen 14 bis 17.

### 1.1 Warum lesende Werkzeuge trotz der Kopplung an die Sandbox

M8 §7 koppelt Zeile 9 an Zeile 10, und die Begründung ist wörtlich:

> Mit **Shell und Schreiben** im Umfang ist eine Zeichenketten-Prüfung auf Kommandos Theater —
> `npm run` mit verändertem Skript und `$(...)` gehen daran vorbei.

Das gilt für schreibende und ausführende Werkzeuge. Ein Satz aus *lesen, suchen, Graph lesen*
verändert nichts und startet keinen Prozess — er hat aber trotzdem einen Kanal nach draußen: der
Modell-Endpunkt, den `c-worker.ts` heute schon benutzt, ist genau das. §5.4 macht diesen Satz
wörtlich: „der Modell-Endpunkt ist der Kanal nach draußen" — deshalb gibt es die Pfadwache
überhaupt. Von den drei Zutaten der gefährlichen Konstellation aus M8 §4.6 — Zugriff auf Privates,
fremde Inhalte im Kontext, Kanal nach draußen — fehlt also **keine**; alle drei sind da, sobald ein
lesendes Werkzeug existiert. (Eine frühere Fassung dieses Abschnitts behauptete das Gegenteil —
die dritte Zutat fehle —, im Widerspruch zu §5.4. Das war falsch und ist hier korrigiert; die
Schlussfolgerung dieses Abschnitts trägt allein durch das folgende Argument.)

Was den Verzicht auf die Sandbox trotzdem rechtfertigt, ist nicht eine fehlende Zutat der Gefahr,
sondern die Bedingung, die eine Zeichenketten-Prüfung erst zu Theater macht: eine **Shell**. Dort
gehen `$(...)` und ein verändertes Skript an jeder Prüfung vorbei, gleich wie sorgfältig sie
argumentiert. Gegen ein **Pfad-Argument, das das Werkzeug selbst auflöst**, ist eine Prüfung nicht
Theater, sondern die Sache selbst — vorausgesetzt, sie löst vorher Symlinks auf (§5.4). Ohne Shell
und ohne Schreiben bleibt der Kanal nach draußen (der Modell-Endpunkt) zwar bestehen, aber die
Pfadwache trägt gegen ihn: Sie entscheidet, was ein lesendes Werkzeug überhaupt in den Kontext
holen kann, bevor dieser Kontext den Endpunkt erreicht.

M8 hat diesen Zwischenschnitt nicht betrachtet, verbietet ihn aber auch nicht: §4.1 legt den
Werkzeugzuschnitt ausdrücklich **außerhalb** des Harnesses fest, in der Preset-Schicht — das
Harness empfängt eine fertige Liste und kennt keine Niveau-Konstante. Eine schmale Liste ist damit
architektonisch der Normalfall, nicht die Ausnahme.

### 1.2 Warum nicht der Kern allein

Der Kern ohne Werkzeuge ist eine Schleife, die einen Prompt schickt, eine Antwort bekommt und
endet. Ihr einziger Konsument wäre das Fenster, das sie vorführt — formgleich mit dem Befund, gegen
den die Settings-Strecke angetreten ist, nur eine Ebene höher. Mit lesenden Werkzeugen kann sie ein
Subsystem durchsehen und einen Befund liefern, und drei Mechanismen bekommen einen Auslöser, die
sonst ungeprüft in die nächste Strecke gewandert wären: die Regel für den offenen `tool.intent`,
die Stummelliste und das aufgeschobene Laden.

Zeile 11 ist ebenfalls nachträglich hereingezogen worden. Der Abschlussmodus lautet „liefere jetzt
das Ergebnis in Vertragsform" — ohne die Vertragsprüfung wäre das eine Anweisung, deren Erfüllung
niemand feststellt. `result-contract.ts` existiert; M8 §7 nennt Zeile 11 selbst „Vorhanden, wird
eingebunden".

## 2. Was schon dasteht

Der Bestand ist größer als der Handover vermuten lässt, und vier Befunde formen die Spec:

- **`src/main/worker/` ist electron-frei.** Kein Modul dort importiert `electron`. Der Kern darf
  es also benutzen, ohne den Wächtertest aus M8 §8 („Der Kern kennt Electron nicht") zu brechen.
- **Die Fähigkeitstabelle ist zur Hälfte gebaut.** `Faehigkeiten` in `model/entry.ts` trägt
  bereits `codec`, `werkzeugmodus`, `paralleleAufrufe`, `denkbloecke`, `bilder`, `dokumente`,
  `aufgeschobenesLaden`, `werkzeugObergrenze`, `nutzbaresKontextfenster`, `vertragsStrenge`,
  `rundenbudget`, `gemessenAm`, `gemessenMit`, `quelle` — also M8 §5 wörtlich. Was fehlt, ist der
  Kanarienauftrag, der sie füllt (Strecke 4). Diese Strecke **liest** sie, und zwar an sechs
  Stellen: Codec-Wahl, Transport-Wahl, Bild- und Dokumentfähigkeit, Werkzeugmodus, parallele
  Aufrufe, aufgeschobenes Laden, Kontextfenster.
- **Die Graph-Lesewerkzeuge existieren als Funktionen.** `graph/query.ts`, `graph/search.ts` und
  `graph/abstraction.ts` tragen die Logik; `graph/mcp-server.ts` ist eine Renderung darüber. Die
  Harness-Werkzeuge werden die zweite — nicht ein MCP-Client, den M8 §13 ausschließt.
- **`eigene-schleife` ist bereits Laufzeit-Vokabular.** Der `Laeufer` existiert in `eignung.ts`
  und steht dort auf Niveau A mit E21 als Begründung; `KNOWN_RUNTIMES` trägt `keel-harness`. Die
  Haken sind gesetzt, der Träger fehlt.

Ebenfalls vorhanden und wiederverwendet: `result-contract.ts`, `api-keys.ts` (Keychain vor
Umgebungsvariable, mit der Redaktion an der Quelle seit der Settings-Strecke), `api-client.ts`,
`ollama-client.ts`, `event-bus.ts`, das Fenstermuster aus `window-manager.ts`.

Nicht wiederverwendet: `c-worker.ts`. Er ist zustandslos und werkzeuglos, und das ist seine
Qualität (M8 §2). Der Harness-Läufer steht daneben, nicht an seiner Stelle.

## 3. Architektur

### 3.1 Modulschnitt

```
src/main/harness/            electron-frei, ohne Ausnahme
  ereignisse.ts    Ereignistypen und Strom-Interface                  rein
  form.ts          kanonische Bloecke und Nachrichten                 rein
  codec.ts         das Interface: toWire / fromWire                   rein
  codec-anthropic.ts                                                  rein
  codec-openai-chat.ts                                                rein
  praefix.ts       Ordnung, Stummelliste, determ. Serialisierung      rein
  projektion.ts    (Ereignisse) => Verlauf                            rein
  budget.ts        vier Budgets, Endzustaende, Abschlussmodus         rein
  preise.ts        versionierte Preistabelle, Vorgabe + Override      rein
  werkzeuge.ts     Registry, Stummel, Schema-Nachreichung             rein
  pfadwache.ts     geschuetzte Pfade, Wurzel, Symlink-Aufloesung      I/O (realpath)
  werkzeug-datei.ts   lesen, listen, suchen                           I/O
  werkzeug-graph.ts   die vier lesenden Graph-Werkzeuge               I/O (SQLite)
  protokoll.ts     SQLite: Schema, anhaengen, lesen                   I/O
  lauf.ts          die Schleife — der einzige Ort, der zusammensetzt
  index.ts         die oeffentliche Flaeche

src/main/harness-handlers.ts          die IPC-Flaeche, neben ipc-handlers.ts
src/main/worker/anthropic-client.ts   dritter ModelClient
src/renderer/windows/harness-window.{html,tsx}
src/renderer/components/harness/      das Ereignis-Panel
```

Zehn der sechzehn Kernmodule sind rein — testbar ohne Netz, ohne Datenbank, ohne Electron. Der
Schnitt ist derselbe, den `api-client.ts` in seinem Kopf beschreibt: die Entscheidungen exportiert,
„was übrig bleibt, ist die HTTPS-Verrohrung".

### 3.2 Warum die IPC-Fläche außerhalb des Verzeichnisses liegt

`settings/handlers.ts` importiert `electron` direkt und wohnt im Feature-Verzeichnis. Der
naheliegende Weg wäre also `harness/handlers.ts` plus eine Ausnahme im Wächtertest.

Ausdrücklich nicht. Eine Ausnahmeliste ist der Mechanismus, mit dem ein Wächter still aufhört zu
wachen — dieselbe Klasse Fehler wie die `nicht-gemessen`-Gegenprobe, die zwischenzeitlich am
falschen Anker hing (Handover §4.3). Die Regel lautet damit ohne Zusatz: **kein Modul unter
`src/main/harness/` importiert `electron`.** Die IPC-Fläche liegt als
`src/main/harness-handlers.ts` dort, wo IPC in diesem Repo auf oberster Ebene liegt.

### 3.3 Der Transport: `worker/` wird erweitert, nicht dupliziert

`ModelClient.generate(req) => Promise<string>` wirft weg, was der Kern braucht: `stop_reason` und
die Usage-Felder. Beide werden gebraucht — die Usage-Felder für Kosten- und Kontextbudget (M8
§4.8), der `stop_reason` für „Trunkierung ist ein Transportfehler, kein Formatbruch".

`ModelClient` bekommt deshalb ein zweites Methodenpaar:

```ts
export interface ModelClient {
  generate(req: GenerateRequest): Promise<string>       // unveraendert
  chat(req: ChatRequest): Promise<ModelAntwort>         // neu
}
```

`c-worker.ts` und die Notizen-Verschlagwortung bleiben auf `generate` und werden nicht angefasst.

Der entscheidende Grund gegen eine zweite Transportschicht im Harness: `api-keys.ts` und
`describeApiFailure` sind genau die Stellen, an denen in der Settings-Strecke zwei
Geheimnis-Lecks geschlossen wurden. `execFile` legt die vollständige Argumentliste in
`err.message` — wer ein Geheimnis als Argument übergibt und die Ursache weitermeldet,
veröffentlicht es. Eine zweite Transportschicht dupliziert genau diese Regel an einen zweiten
Ort, an dem sie ebenfalls stimmen müsste.

### 3.4 Der Anthropic-Weg braucht kein zweites Feld

`api-client.ts` sagt den nächsten Schritt in seinem eigenen Docblock voraus: Vendoren mit eigener
Drahtform bekommen Geschwistermodule, die dasselbe `ModelClient` implementieren. Also
`worker/anthropic-client.ts` und ein drittes Glied in der Union:

```ts
export interface AnthropicEndpointSpec {
  kind: 'anthropic'
  baseUrl: string
  model: string
  keyRef: string
}
```

Woher weiß `toModelEndpoint`, dass ein `art: 'api'`-Eintrag Anthropic ist? **Aus
`faehigkeiten.codec`, und aus nichts sonst.** Ein zusätzliches `dialekt`-Feld an der
Erreichbarkeit wäre dieselbe Tatsache ein zweites Mal aufgeschrieben, mit einer Konsistenzregel
als Folgekosten. Ein Feld entscheidet beides: welcher Codec übersetzt und welcher Transport sendet.

Die Signatur bekommt dafür einen optionalen zweiten Parameter, keine neue Funktion:

```ts
export function toModelEndpoint(e: Erreichbarkeit, codec?: Faehigkeiten['codec']): ModelEndpoint
```

Drei Aufrufstellen, und der Unterschied zwischen ihnen ist der Grund für „optional":

- `normaliseEintrag` (`entry.ts:111`) ruft **ohne** Codec auf. Dort ist `faehigkeiten` noch nicht
  zusammengeführt, und die Prüfung dort fragt ohnehin nur, ob `baseUrl` und `keyRef` dastehen —
  für beide Dialekte dieselbe Frage.
- `rollen.ts:20` ruft **mit** `eintrag.faehigkeiten?.codec` auf. Damit liefert die
  Rollen-Auflösung für einen Anthropic-Eintrag auch einen Anthropic-Endpunkt, und
  `clientForEndpoint` bekommt einen dritten Fall.
- `tests/model/entry.test.ts` prüft beide Formen.

Zwei Folgen:

1. Ein `local-http`-Eintrag mit `codec: 'openai-chat'` läuft gegen Ollamas eigene `/v1`-Fläche.
   Damit ist der DGX Spark in dieser Strecke erreichbar, **ohne** dass `ollama-native` gebaut sein
   muss — und die Abnahme „derselbe Auftrag gegen drei Anbieter" (M8 §10) wird erreichbar.
2. `codec: 'ollama-native'` und `codec: 'text'` sind hier nicht gebaut (M8 §7 Zeile 14). Ein
   Eintrag, der sie nennt, wird beim Start des Laufs **laut** abgewiesen, mit dem Codec-Namen im
   Text — nie still auf einen anderen Codec gefallen.

### 3.5 Was ein Lauf beim Start bekommt

```ts
export interface Auftrag {
  auftragstext: string
  modellId: string                    // in die Registry, nicht in die Config
  wurzel: string                      // Projektwurzel — die Leseerlaubnis, §5.4
  anhaenge?: string[]                 // absolute Pfade, siehe §4.5
  pflichtfelder?: string[]            // fuer die Vertragspruefung, §8.6
  budgets: {
    runden: number
    wanduhrMs: number
    kostenCent: number
    kontextAnteil: number             // 0..1 des nutzbaren Kontextfensters
  }
}
```

M8 §4.4 verlangt für **autonome** Läufe ein geschlossenes Dokument mit Entität, Phase, Subsystem,
Input-Quelle, erwartetem Output und Budget. Diese Strecke kennt nur **interaktive** Läufe — ein
Mensch sitzt davor, und §4.4 nimmt sie ausdrücklich aus: „Ein interaktiver Lauf hat den Menschen
per Konstruktion in der Schleife und braucht diese Geschlossenheit nicht." Die Felder für Phase,
Subsystem und Graph-Input kommen mit der Beauftragung in Strecke 3.

`Faehigkeiten` wird aus `model/entry.ts` importiert — auch dieses Modul ist electron-frei, der
Wächtertest bleibt erfüllt.

## 4. Die kanonische Form und die Codecs

### 4.1 Sechs Blocktypen, alle ab Tag eins

```ts
export type Block =
  | { art: 'text';              text: string }
  | { art: 'denken';            text: string; signatur?: string }
  | { art: 'bild';              medientyp: string; daten: string }
  | { art: 'dokument';          medientyp: string; name: string; daten: string }
  | { art: 'werkzeug-aufruf';   id: string; name: string; eingabe: Record<string, unknown> }
  | { art: 'werkzeug-ergebnis'; aufrufId: string; inhalt: Block[]; fehler: boolean }

export interface Nachricht {
  rolle: 'nutzer' | 'modell'
  bloecke: Block[]
}
```

Nicht nachrüstbar ist **die Union**, nicht der einzelne Fall. M8 §3.3 begründet es: Die kanonische
Form ist das, wodurch alles übersetzt wird — jeder Codec, jedes Ereignis, jede Protokollzeile. Ist
sie textfrei entworfen, unterstellt später jede dieser Stellen Text.

Das Anthropic-Muster ist gewählt, weil es sich verlustfrei nach OpenAI und Gemini abbilden lässt;
der umgekehrte Weg verliert Information.

`inhalt: Block[]` am Werkzeug-Ergebnis ist kein Übermaß: M8 §3.3 verlangt ausdrücklich, dass ein
Werkzeugergebnis `text`, `image` und `document` tragen darf. Ein Lesewerkzeug, das auf ein Bild
zeigt, ist der Fall, der das in dieser Strecke einlöst.

`signatur` am Denkblock ist kein Beiwerk: Anthropic verlangt Denkblöcke bei Fortsetzung wörtlich
samt Signatur zurück. Eine Form ohne dieses Feld verliert die Fortsetzbarkeit genau dort, wo Denken
teuer war — und mit Werkzeugen ist die Fortsetzung nach einem Denkblock der Normalfall, nicht der
Sonderfall.

### 4.2 Die Antwort trägt drei Dinge

```ts
export interface ModelAntwort {
  bloecke: Block[]
  stopGrund: { normalisiert: 'ende' | 'laenge' | 'werkzeug' | 'anderes'; roh: string }
  usage:     { eingabeToken: number; ausgabeToken: number; roh: unknown }
}
```

Normalisiert **und** roh, beides. M8 §3.1 verlangt die Usage-Felder roh; §4.8 verlangt eine Zahl,
gegen die ein Budget prüft. `max_tokens` bei Anthropic und `finish_reason: 'length'` bei OpenAI
sind dieselbe Tatsache in zwei Schreibweisen — normalisiert wird sie einmal, im Codec, und das Rohe
bleibt daneben stehen, damit niemand die Normalisierung glauben muss.

### 4.3 Der Codec hat zwei Funktionen und keinen Zustand

```ts
export interface Codec {
  name: 'anthropic' | 'openai-chat'
  toWire(nachrichten: Nachricht[], werkzeuge: WerkzeugStummel[], f: Faehigkeiten): unknown
  fromWire(antwort: unknown): ModelAntwort
}
```

Kein Zugriff auf Schleifenzustand, Budgets oder Werkzeug-**Ausführung** — die Typsignatur macht es
unmöglich (M8 §8, Art „Form"). Der Codec sieht die Werkzeugliste nur, um sie in die Drahtform zu
schreiben; er ruft nichts auf.

Zwei Fähigkeitsfelder wirken hier unmittelbar:

- `paralleleAufrufe: false` → der Codec setzt `parallel_tool_calls` **nicht**. M8 §5 nennt genau
  diesen Fall: Das Feld an ein Modell ohne Unterstützung legt mit HTTP 400 das ganze
  Werkzeug-Subsystem lahm.
- `werkzeugmodus: 'text'` → in dieser Strecke nicht gebaut. Der Lauf startet nicht und nennt den
  Grund. Das Text-Protokoll ist der `text`-Codec und gehört zu M8 §7 Zeile 14.

### 4.4 Multimodalität, und wo Unvermögen gemeldet wird

| Block | `codec-anthropic` | `codec-openai-chat` |
|---|---|---|
| `bild` | `source: { type: 'base64', media_type, data }` | `image_url: { url: 'data:<mt>;base64,…' }` |
| `dokument` | `type: 'document'`, base64 | `type: 'file'`, `file_data` |

Die Fähigkeitsprüfung sitzt **nur im Codec**, nicht zusätzlich beim Start des Laufs. Ein zweiter
Prüfort wäre dieselbe Regel an zwei Stellen; und `toWire` läuft ohnehin vor dem ersten
Netzzugriff, die Meldung kommt also früh genug. Der Text nennt Blocktyp und Modell:

> `gemma4:26b nimmt keine Bilder — die Fähigkeitszeile sagt bilder: false (Quelle: vermutet).
> Der Auftrag trägt einen Bildblock.`

Was nie passiert: den Block weglassen und weiterlaufen. Derselbe Grundsatz wie beim
Rückgabe-Vertrag — sichtbares Scheitern schlägt unsichtbar falsche Ergebnisse (M8 §4.9).

### 4.5 Anhänge

`harness:lauf-starten` nimmt absolute Dateipfade. Der Hauptprozess liest sie, bestimmt den
Medientyp aus der Endung, kodiert base64 und baut `bild`- beziehungsweise `dokument`-Blöcke. Die
*Aufnahme* per Drag&Drop oder Screenshot-Einfügen ist Oberflächenarbeit späterer Strecken (M8
§4.11); die *Darstellung* im Prompt ist ab jetzt Sache des Kerns.

Anhänge gehen **nicht** durch die Pfadwache aus §5.4: Sie sind eine Handlung des Nutzers, keine
des Modells. Ein Pfad, der nicht existiert oder nicht lesbar ist, lässt den Lauf nicht starten und
wird genannt.

## 5. Die Werkzeuge

### 5.1 Der Satz dieser Strecke

| Werkzeug | Wirkung |
|---|---|
| `datei_lesen` | eine Datei, optional ein Zeilenbereich |
| `verzeichnis_listen` | Glob-Muster relativ zur Wurzel |
| `inhalt_suchen` | Regex über Dateien, mit Pfadfilter |
| `graph_suchen` | wie `graph_search` |
| `graph_knoten_holen` | wie `graph_get_node` |
| `graph_ausweiten` | wie `graph_expand` |
| `graph_abfragen` | wie `graph_query` |
| `werkzeug_schema` | das Meta-Werkzeug des aufgeschobenen Ladens (§5.5) |

Nicht dabei und ausdrücklich nicht: `schreiben`, `editieren`, Shell, `graph_upsert_node`,
`graph_link`, `graph_maintain`, Delegation, Websuche, Netzabruf.

**Die Datei-Werkzeuge laufen im Prozess, nie über eine Shell.** Ein `grep` per `execFile` wäre
bequem und würde genau die Grenze wieder aufheben, deren Fehlen diese Strecke rechtfertigt: Sobald
ein Kommando gebaut wird, ist die Argument-Prüfung wieder Theater.

**Die Graph-Werkzeuge rufen dieselben Funktionen wie der MCP-Server**, nicht den Server selbst. Ein
MCP-Client für fremde Server ist nach M8 §13 kein v1-Inhalt, und für den eigenen Server wäre er ein
Umweg über eine Prozessgrenze, die es nicht gibt. Zwei Renderungen über einer Quelle — dasselbe
Muster, mit dem M8 §4.1 Werkzeugliste und Berechtigungsfragment verbindet. Ein Wächtertest hält
fest, dass beide Renderungen dieselben vier Lese-Operationen anbieten.

### 5.2 Das Werkzeug-Interface

```ts
export interface WerkzeugStummel {
  name: string
  /** Eine Zeile. Steht im stabilen Praefix, §7. */
  beschreibung: string
}

export interface Werkzeug extends WerkzeugStummel {
  /** Erst bei Bedarf serialisiert — nie im stabilen Praefix, §5.5. */
  schema(): Record<string, unknown>
  ausfuehren(eingabe: unknown, ktx: WerkzeugKontext): Promise<WerkzeugErgebnis>
}

export type WerkzeugErgebnis =
  | { ok: true;  inhalt: Block[] }
  | { ok: false; meldung: string }

export interface WerkzeugKontext {
  wurzel: string
  graphDb: Database | null
}
```

Ein `{ ok: false }` wird zu einem `werkzeug-ergebnis`-Block mit `fehler: true` und geht in den
Verlauf — es beendet den Lauf **nicht**. Das Modell soll auf einen Fehler reagieren können; genau
dafür trägt der Block ein Fehlerflag statt einer Ausnahme.

### 5.3 Der Zug mit Werkzeugen

Ein Zug nach M8 §3.2: Prompt anhängen → Modell rufen → Antwort in die kanonische Form parsen →
Werkzeugaufrufe ausführen → Ergebnisse anhängen → Budgets prüfen.

**Kein Effekt ohne vorheriges Intent-Ereignis.** Der Werkzeug-Aufrufer schreibt `tool.intent`
— Aufruf-ID, Name, Argumente — **bevor** er ausführt, und `tool.completed` beziehungsweise
`tool.failed` danach. Ein Wächtertest prüft die Reihenfolge im Protokoll (M8 §8).

**Nebenläufigkeit:** Alle Werkzeuge dieser Strecke sind lesend, also dürfen alle Aufrufe eines Zuges
nebenläufig laufen. Das Single-Writer-Prinzip aus M8 §3.2 gilt damit **trivial erfüllt** — es gibt
keinen schreibenden Aufruf, der eine sequenzielle Ausführung erzwingen könnte. Der Mechanismus
dafür (ein `schreibend`-Feld am Werkzeug und die Sequenzialisierung) kommt mit den schreibenden
Werkzeugen; siehe §13.1.

**Die Werkzeug-Obergrenze ist ein inferiertes Signal.** Ist die Liste länger als
`faehigkeiten.werkzeugObergrenze`, wird der Lauf nicht verweigert — der Hinweis geht als
`hinweise: string[]` in `run.started`. Nur gemessene Signale dürfen abbrechen (M8 §4.10).

### 5.4 Die Pfadwache

Lesende Werkzeuge ohne Pfadwache könnten `~/.ssh/id_rsa` lesen, und der Modell-Endpunkt ist der
Kanal nach draußen. Die Prüfreihenfolge steht in M8 §4.6 und wird wörtlich übernommen:
**geschützte Pfade zuerst, dann Verweigerungsregeln, dann Erlaubnisregeln.**

```ts
export function pruefePfad(roh: string, wurzel: string):
  | { ok: true;  pfad: string }
  | { ok: false; grund: string }
```

1. **Symlinks auflösen** (`fs.realpath`), und zwar *vor* jeder Prüfung. Ohne diesen Schritt führt
   der erste Symlink an allem Folgenden vorbei. Existiert der Pfad nicht, wird das nächst-höhere
   existierende Elternverzeichnis aufgelöst und der Rest angehängt.
2. **Geschützte Pfade**, in jedem Modus, nicht überschreibbar: `~/.ssh`, Shell-Startdateien
   (`.zshrc`, `.zprofile`, `.bashrc`, `.bash_profile`, `.profile`), jedes `.git`-Verzeichnis,
   keels eigene Konfiguration (`app.getPath('userData')`) und `~/.cipher-*`.
3. **Verweigerungsregeln**, auch **innerhalb** der Wurzel: `.env` und `.env.*`, `*.pem`, `*.key`,
   `id_rsa`/`id_ed25519` und Geschwister ohne `.pub`, `*.p12`, `*.keystore`.
4. **Erlaubnis:** innerhalb von `auftrag.wurzel`. Alles außerhalb wird abgelehnt.

Stufe 3 ist der Schritt, den der erste Entwurf dieser Spec ausgelassen hatte. Die Wurzel ist ein
Projektverzeichnis, und Projektverzeichnisse tragen Geheimnisse — ein `.env`, das das Modell liest,
geht mit dem nächsten Prompt zum Anbieter. Die Herkunft der Regel ist M8 §4.6, das
Verweigerungsregeln ausdrücklich als eigene Stufe zwischen geschützten Pfaden und Erlaubnis führt.

Die Ablehnung nennt den Grund und **nicht** den Inhalt: `Pfad liegt außerhalb der Wurzel` oder
`Pfad ist geschützt`. Sie wird zu einem `werkzeug-ergebnis` mit `fehler: true`, nicht zu einem
Laufabbruch — ein Modell, das versehentlich zu weit greift, soll es erfahren und weiterarbeiten.

Sie nennt allerdings den **Dateinamen**, denn der stand ohnehin im Aufruf. Damit bleibt der Weg
offen, den es geben muss: Braucht eine Aufgabe wirklich den Inhalt einer solchen Datei, hängt der
Nutzer sie als Anhang an den Auftrag (§4.5) — Anhänge gehen bewusst nicht durch die Pfadwache. Die
Entscheidung, ein Geheimnis in einen Prompt zu geben, bleibt so beim Menschen, statt beim Modell zu
liegen.

**Was diese Regel ausdrücklich nicht tut: sie verhindert keine SSH-Nutzung.** Einen privaten
Schlüssel zu *lesen* und ihn zu *benutzen* sind verschiedene Dinge — `ssh(1)` liest ihn im eigenen
Prozess, der Agent bekommt ihn nie zu sehen. Ein späteres `ssh`- oder `scp`-Kommando über die Shell
ist von dieser Regel unberührt. Was sie verhindert, ist ausschließlich, dass Schlüsselmaterial über
den Prompt zu einem Modellanbieter wandert.

Diese Prüfung ist **keine** Ausführungsgrenze im Sinne von M8 §4.5 und ersetzt sie nicht. Sie
trägt, solange kein Werkzeug einen Prozess startet. Kommt die Shell, kommt die Sandbox — die
Pfadwache bleibt daneben stehen, weil sie dann die Werkzeug-Argumente prüft und die Sandbox den
Prozess.

### 5.4.1 Die tatsächliche Lesefläche ist größer als `auftrag.wurzel` — die Graph-Werkzeuge

Die Pfadwache bindet **nur die drei Datei-Werkzeuge** an `auftrag.wurzel`. Die vier Graph-Werkzeuge
(§5.1) laufen über eine andere Tür: `baueLaufUmgebung` (`harness-handlers.ts`) reicht
`services.graphDb` unverändert durch, ohne jede Prüfung gegen `auftrag.wurzel` — der
Knowledge-Graph ist prozessweit einer, nicht auf ein Projektverzeichnis eingeschränkt.
`graph_knoten_holen` liefert damit bis zu 100 KB Rumpf (`MAX_BODY_SIZE`,
`werkzeug-graph.ts`) eines **beliebigen** indizierten Vault-Dokuments, solange dessen `uid` bekannt
oder über `graph_suchen`/`graph_ausweiten` auffindbar ist — unabhängig davon, ob dieses Dokument
irgendetwas mit `auftrag.wurzel` zu tun hat. Was das Werkzeug liefert, geht mit dem nächsten Prompt
zum Modell-Endpunkt (§5.4, der Kanal nach draußen).

**Die effektive Lesefläche eines Laufs ist damit `auftrag.wurzel` ∪ der gesamte indizierte Vault**,
nicht `auftrag.wurzel` allein — der Kommentar `wurzel: string // Projektwurzel — die
Leseerlaubnis` in §3.5 benennt nur die Hälfte davon. Das ist kein Versehen in der Umsetzung
gegenüber dieser Spec, sondern eine Lücke der Spec selbst, die hier benannt wird, damit sie nicht
als „wurzel ist die Leseerlaubnis" missverstanden bleibt: Für die drei Datei-Werkzeuge stimmt das;
für die vier Graph-Werkzeuge nicht. Eine Wurzelbindung für die Graph-Werkzeuge — etwa über einen
`pfad`-Filter auf Knoten unterhalb von `auftrag.wurzel` — ist nicht Teil dieser Strecke und bleibt
offen für eine folgende.

### 5.5 Stummelliste und aufgeschobenes Laden

Im stabilen Präfix steht je Werkzeug nur **Name und eine Zeile Beschreibung**. Das vollständige
Schema wird bei Bedarf geholt und an den **Verlauf** angehängt, nie ins Präfix geschrieben — alles
andere invalidierte bei jedem Nachladen den Cache und machte genau das kaputt, wofür der
Mechanismus existiert (M8 §3.5).

Geholt wird über ein Meta-Werkzeug, dessen eigenes Schema im Präfix steht:

```
werkzeug_schema(name: string) -> das vollstaendige Eingabeschema des Werkzeugs
```

Die Alternative — das Modell ruft ein Werkzeug ohne Schema auf, und die Schleife reicht statt der
Ausführung das Schema nach — wurde verworfen: Sie kostet dieselbe Runde Latenz, verbrennt aber
zusätzlich einen auf geratenem Schema gebauten Aufruf und zeigt dem Modell eine falsche Form, bevor
sie ihm die richtige zeigt.

Ein erfolgreiches Nachladen erzeugt `tool.schema_loaded` mit dem Werkzeugnamen.

**Das Fähigkeitsfeld entscheidet, ob überhaupt aufgeschoben wird.** `aufgeschobenesLaden: false`
→ alle Schemata stehen im stabilen Präfix, `werkzeug_schema` entfällt aus der Liste. `true` →
Stummel plus Meta-Werkzeug. Beide Formen sind innerhalb einer Session konstant.

**Maskieren statt Entfernen** gilt für die Stummelliste: Ein maskiertes Werkzeug behält seinen
Stummel, sein Aufruf wird mit Begründung abgelehnt, und die Liste bleibt zeichengleich. In dieser
Strecke maskiert nichts — die Regel steht in der Form, damit sie nicht später eingezogen werden
muss. Zwei Mechanismen, zwei Zwecke: Cache-Stabilität und Präfix-Budget.

## 6. Das Ereignisprotokoll

### 6.1 Eine eigene Datei, eine einzige Tabelle

`harness.db` in `userData`, geöffnet mit derselben `resolveBetterSqliteBinding`-Auflösung wie
`graph.db` — ohne die findet der gepackte Build die Node-ABI-Variante (Befund vom 2026-08-09,
dokumentiert in `graph/db.ts`).

**Nicht** in `graph.db`, und der Grund steht in deren eigenem Kopf: CK-GRAPH-001 nennt sie
„derived index — discardable, rebuildable from vault". Ein Protokoll, aus dem wiederaufgenommen
wird, ist das Gegenteil einer verwerfbaren Ableitung.

```sql
CREATE TABLE IF NOT EXISTS ereignisse (
  lauf_id  TEXT    NOT NULL,
  seq      INTEGER NOT NULL,
  ts       TEXT    NOT NULL,
  art      TEXT    NOT NULL,
  nutzlast TEXT    NOT NULL,
  PRIMARY KEY (lauf_id, seq)
);

CREATE TRIGGER IF NOT EXISTS ereignisse_kein_update BEFORE UPDATE ON ereignisse
BEGIN SELECT RAISE(ABORT, 'Ereignisse sind append-only'); END;

CREATE TRIGGER IF NOT EXISTS ereignisse_kein_delete BEFORE DELETE ON ereignisse
BEGIN SELECT RAISE(ABORT, 'Ereignisse sind append-only'); END;
```

Keine zweite Tabelle für Läufe und ihre Endzustände. Der Endzustand steht als `run.finished` im
Protokoll; eine Spalte, die von `null` auf `fertig` wechselt, wäre genau der mutierbare
Verlaufszustand, den M8 §3.4 ausschließt. Die Lauf-Liste ist ebenfalls eine Projektion.

**Die Trigger sind die Durchsetzung, der Test ist der Beleg.** M8 §8 verlangt einen Wächtertest,
der `UPDATE` verbietet. Ein Test, der den Quelltext nach `UPDATE`-Vorkommen absucht, prüft eine
Schreibweise; die Datenbank, die es ablehnt, prüft die Sache — dieselbe Logik, mit der M8 §4.5 die
Ausführungsgrenze ans Betriebssystem gibt statt an eine Prüfung im Harness.

Der `DELETE`-Trigger geht über M8 hinaus und hat eine Folge, die benannt gehört: Ein Aufräumen
alter Läufe ist damit nur durch Löschen der Datei möglich. Solange kein Bedarf gemessen ist, ist
das der richtige Preis.

`seq` wird beim Anhängen in derselben Transaktion vergeben (`COALESCE(MAX(seq), 0) + 1`).
better-sqlite3 ist synchron, der Hauptprozess ist einfädig — damit gilt Single-Writer ohne
zusätzliche Vorkehrung.

### 6.2 Ereignisse in dieser Strecke

`run.started` · `prompt.sent` · `model.answered` · `tool.intent` · `tool.completed` ·
`tool.failed` · `tool.schema_loaded` · `budget.warned` · `run.finished`

Nicht dabei, weil ihre Auslöser fehlen: `delegation.dispatched`, `delegation.judged`,
`repair.attempted`, `heartbeat`, `run.suspended`.

`heartbeat` gehört zu M8 §7 Zeile 15 (Beobachtbarkeit autonomer Läufe), ausdrücklich nachgelagert.
`repair.attempted` gehört zum Reparaturversuch, der an der `vertragsStrenge` einer **gemessenen**
Fähigkeitszeile hängt — und die entsteht erst mit dem Kanarienauftrag, Strecke 4.

### 6.3 `prompt.sent` wird vollständig und wörtlich gespeichert

M8 §3.1 übergibt die Persistenz ausdrücklich an die Spec. Die Entscheidung fällt am Wächtertest
aus §8: Er baut den Präfix aus dem Protokoll und vergleicht ihn **zeichengleich mit `prompt.sent`**.
Ist `prompt.sent` selbst schon eine Rekonstruktion aus Präfix-Verweis plus Delta, vergleicht der
Test die Zusammensetzung mit sich selbst und prüft nichts.

Der Preis ist bekannt und wird hingenommen: Der stabile Präfix liegt je Zug erneut im Protokoll,
Größenordnung anderthalb Megabyte bei dreißig Zügen à fünfzigtausend Zeichen. Eine
inhaltsadressierte Ablage wurde erwogen und verworfen — sie löst ein Speicherproblem, das nicht
gemessen ist.

### 6.4 Wiederaufnahme ist kein eigener Codepfad

Die Schleife hält **keinen** Verlauf im Speicher. Vor jedem Zug liest sie die Ereignisse des Laufs
und projiziert daraus den Verlauf.

```ts
export function projiziere(ereignisse: Ereignis[]): Nachricht[]
```

Damit ist „Zug 1" und „Zug 14 nach einem Neustart" derselbe Ablauf. Der Grund ist nicht Eleganz:
Die Wiederaufnahme hängt an einem harten Prozesstod und ist deshalb schlecht testbar. Ein Pfad, der
bei jedem normalen Zug mitläuft, ist bei der Abnahme bereits tausendfach gelaufen.

Werkzeugergebnisse werden dabei **aus dem Protokoll gelesen, nicht neu ausgeführt**.

### 6.5 Der offene Intent

Zwischen der Wirkung eines Werkzeugs und dem Schreiben seines Ergebnisses liegt ein Moment, in dem
ein harter Prozesstod ein `tool.intent` ohne Abschluss hinterlässt. Die Wirkung ist dann
*unbekannt* — sie kann eingetreten sein oder nicht. M8 §3.4 gibt die Regel wörtlich vor:

> Findet die Wiederaufnahme einen offenen Intent, wird der Aufruf **nicht wiederholt**. Stattdessen
> geht ein Werkzeugergebnis mit beschriebenem Fehler in den Verlauf — „Ausführung unbekannt,
> Zustand prüfen" — samt der Anweisung an das Modell, den Zustand festzustellen, bevor es
> weitermacht.

Das ist schwächer als „das Idempotenzproblem ist gelöst", und dafür wahr.

Bei rein lesenden Werkzeugen wäre eine Wiederholung tatsächlich harmlos. Die Regel wird trotzdem
so gebaut, wie sie für schreibende gilt — die Ausnahme „bei lesenden darf wiederholt werden" wäre
eine Sonderregel, die genau in dem Moment falsch wird, in dem das erste schreibende Werkzeug
dazukommt, und die dann niemand mehr sucht.

## 7. Der Präfix

Ordnung nach M8 §3.5:

1. **Stabil, unveränderlich innerhalb einer Session:** Body → Capabilities → Persona → globale
   Regeln → Auftrag samt Phaseninput → **Werkzeug-Stummelliste**
2. **Append-only:** der Verlauf, einschließlich nachgeladener Werkzeugschemata
3. **Volatil, am Ende:** das Fortschrittsobjekt

Regeln:

- keine Zeitstempel, Zähler oder Rundenangaben im stabilen Teil
- deterministische Serialisierung mit sortierten Schlüsseln
- der Präfix ist aus dem Protokoll rekonstruierbar, ohne ihn neu zu bauen
- ein nachgeladenes Schema erscheint im Verlauf und **nie** im stabilen Teil

**Das Fortschrittsobjekt** (M8 §4.7) führt offene und erledigte Einheiten mit Duplikatschutz und
wird bei jedem Zug deterministisch ans Ende gehängt. In dieser Strecke speist es sich aus den
Werkzeugaufrufen des Laufs; die Rolling Summary als Graph-Artefakt daraus gehört zur Delegation und
ist Strecke 3.

Die teuerste Zusicherung dieses Abschnitts: **Ein zweiter Lauf meldet einen Cache-Treffer.** Das
prüft die Ordnung an der Stelle, an der sie Geld kostet.

## 8. Budgets, Endzustände, Abschlussmodus, Vertrag

### 8.1 Vier Budgets

| Budget | Quelle | geprüft |
|---|---|---|
| Runden | Zähler | nach jedem Zug |
| Wanduhr | verstrichene Millisekunden | nach jedem Zug |
| Kontextfüllstand | `usage.eingabeToken` gegen `faehigkeiten.nutzbaresKontextfenster` | nach jeder Antwort |
| Kosten | Arithmetik über `usage` gegen eine versionierte Preistabelle | nach jeder Antwort |

Alle vier sind **gemessene** Signale im Sinne von M8 §4.10 und dürfen abbrechen.

Die Kostenrechnung ist deterministisch; unsicher ist nicht die Rechnung, sondern die Tabelle. Der
Abschlussgrund nennt deshalb den Tabellenstand mit: `kosten-erschöpft (Preistabelle 2026-08-18)`.

Die Preistabelle liegt als gebündelte Vorgabe in `harness/preise.ts` mit Config-Override — damit
ist sie eine anpassbare Fläche im Sinne von CK-NFR-012 und **braucht einen Eintrag in
`docs/anpassbare-flaechen.md`**, sonst schlägt `tests/docs/anpassbare-flaechen.test.ts` zu. Eine
neue anpassbare Fläche ohne Inventareintrag ist ein Prüfbefund.

### 8.2 Zwei Endzustände, nicht drei

| Endzustand | Gründe |
|---|---|
| `fertig` | `ziel-erreicht`, `runden-erschöpft`, `zeit-erschöpft`, `kosten-erschöpft`, `kontext-erschöpft` |
| `abgebrochen` | `transportfehler`, `abgebrochen-von-aussen` |

`ausgesetzt` ist M8 §7 Zeile 6 und damit Strecke 3. Es wird auch **nicht als unbewohnte Variante**
in die Union aufgenommen: Jedes `switch` müsste dann einen Zweig tragen, den nichts erreicht. Kommt
es in Strecke 3 dazu, zeigt der Compiler jede Stelle an, die es braucht — das ist billiger als tote
Zweige mitzuschleppen.

`kein-fortschritt` ist kein Grund, sondern ein inferiertes Warnsignal (M8 §4.10) und in dieser
Strecke nicht vorhanden.

### 8.3 Jeder Grund trägt seinen Anweisungstext

```ts
export interface Abschlussgrund {
  code: 'ziel-erreicht' | 'runden-erschöpft' | 'zeit-erschöpft'
      | 'kosten-erschöpft' | 'kontext-erschöpft'
      | 'transportfehler' | 'abgebrochen-von-aussen'
  anweisung: string        // deutsch, geht an das Modell und ins Ereignis
}
```

Ein Text, zwei Verwendungen — dieselbe Bauweise, die `result-contract.ts` in seinem Kopf begründet.

### 8.4 Der Abschlussmodus ist keine Ausnahme

Schlägt ein Budget an, folgt **ein letzter Zug ohne Werkzeuge** mit der Anweisung, jetzt das
Ergebnis in Vertragsform zu liefern, samt Grund. Erst danach `run.finished`. Ein angeschlagenes
Budget führt also zu einem verwertbaren Teilergebnis, nicht zu einer geworfenen Ausnahme.

„Ohne Werkzeuge" ist wörtlich zu nehmen: Die Stummelliste bleibt zeichengleich im Präfix stehen
(maskieren statt entfernen, §5.5), aber jeder Aufruf wird mit Begründung abgelehnt.

### 8.5 Trunkierung wird vor jeder Reparaturentscheidung gelesen

`stopGrund.normalisiert === 'laenge'` → `abgebrochen / transportfehler`, **kein** Reparaturversuch
(M8 §4.8). Sonst verbrennt der eine Versuch an einem Problem, das kein Nachdenken löst.

### 8.6 Der Rückgabe-Vertrag, an den Außenkanten

`checkWorkerAnswer` prüft das Ergebnis eines abgeschlossenen Laufs gegen `auftrag.pflichtfelder`.
**Nur dort.** Innerhalb der Werkzeugschleife gilt er nicht, und die Schleifen-Schnittstelle nimmt
keine Pflichtfelder entgegen — die Durchsetzung liegt in der Form (M8 §4.9, §8).

Das Ergebnis der Prüfung steht in `run.finished` und wird nicht erzwungen: Erzwungenes
Schema-Decoding hebt die Validität auf hundert Prozent und senkt die Antwortgenauigkeit. Ein
sichtbar gescheiterter Lauf ist das bessere Ergebnis als valides Nonsens.

**Wie weit „an den Außenkanten" wörtlich zu nehmen ist.** M8 §4.9 formuliert die Durchsetzung als
„die Schleifen-Schnittstelle nimmt gar keine Pflichtfelder entgegen". Der `Auftrag` trägt sie
trotzdem — er *ist* die Außenkante, und die Prüfung muss wissen, wogegen sie prüft. Was nicht
passieren darf, ist eine Stufe tiefer: **Weder die Zug-Funktion noch ein Codec noch ein Werkzeug
sieht `pflichtfelder`.** So gibt es keinen Ort, an dem ein Pflichtfeld eine Antwort formen könnte,
bevor sie gedacht ist — frei denken, dann formatieren, dann prüfen. Der Wächtertest in §11 prüft
genau diese Grenze und nicht den Wortlaut.

## 9. IPC und Fenster

### 9.1 Vier Kanäle, jeder mit einem Aufrufer

| Kanal | Art | Aufrufer im Renderer |
|---|---|---|
| `harness:lauf-starten` | invoke | Startknopf, mit Dateiwähler für Anhänge |
| `harness:lauf-lesen` | invoke | beim Öffnen des Fensters — Ereignisse nachspielen |
| `harness:lauf-abbrechen` | invoke | Abbruchknopf → `abgebrochen-von-aussen` |
| `harness:ereignis` | broadcast | das Panel, live |

Ein Kanal ohne Aufrufer war der Fund, den in der Settings-Strecke nur das Abschluss-Review über den
ganzen Zweig sehen konnte. Zusicherung 3 des Handovers wird deshalb für diese vier Kanäle als
Wächtertest geschrieben, nicht als Grep in einem Dokument.

Beide Regeln der Settings-Handler gelten weiter: **im Hauptprozess validieren, dem Renderer nie
trauen** — und der Broadcast läuft über `event-bus.ts`, nie über ein eingefangenes
`BrowserWindow`.

**Der Abbruch wirkt an der Zuggrenze, nicht mitten in der Anfrage.** `harness:lauf-abbrechen` setzt
eine Marke; die Schleife liest sie vor dem nächsten Zug und schließt mit
`abgebrochen / abgebrochen-von-aussen` ab. Eine laufende HTTP-Anfrage wird nicht abgeschnitten.
Das ist die Übertragung von M8 §4.6 — „jede Unterbrechung liegt auf einer Werkzeuggrenze" — auf
diese Strecke: Die Werkzeuge sind lesend und kurz, die Zuggrenze ist die teure. Der Preis ist
benannt: Bei einem Modell, das neunzig Sekunden denkt, wirkt der Abbruch bis zu neunzig Sekunden
später. Ein `AbortSignal` durch den Transport wäre die Abhilfe und gehört zur Strecke, in der die
Unterbrechung ohnehin eine schärfere Grenze braucht.

### 9.2 Das Fenster spiegelt das Settings-Fenster

`createHarnessWindow` neben `createSettingsWindow`, `harness-window.{html,tsx}` neben
`settings-window.*`, mit garantiertem Klickpfad aus dem Projektfenster. Das Muster ist in der
Settings-Strecke gebaut und in der laufenden App belegt.

Ein neuer Zellentyp im SessionGrid wäre der Weg, den der M6-Nachtrag gerade abgeräumt hat: Aus
„Grid-Zelle plus Adapter" ist ein Laufzeit-Subsystem geworden, und die `NanoClawChannelCell`
entfällt ersatzlos.

Das Panel zeigt je Ereignis eine Zeile — Zeitstempel, Art, Kurzfassung der Nutzlast, aufklappbar.
Werkzeugaufrufe erscheinen als Paar aus Intent und Ergebnis. Das Panel kennt **keinen
Anbieternamen**: Was es anzeigt, kommt aus dem Ereignisstrom.

## 10. Fehlerbehandlung

Die Leitregel des Projekts gilt unverändert: **Stille Fehler sind die teuersten.**

**Lässt den Lauf nicht starten** — die Meldung nennt jeweils die Ursache:

- unbekannter oder ungebauter Codec (`ollama-native`, `text`)
- `werkzeugmodus: 'text'` — das Text-Protokoll ist Strecke 4
- `cli-harness`-Eintrag — `sperrgrund` in `eignung.ts` hat den Text bereits
- ein Anhang, der nicht existiert oder nicht lesbar ist
- eine Wurzel, die kein Verzeichnis ist

**Beendet den Lauf:**

- Transportfehler (Netz, Zeitüberschreitung, Status ≠ 200) → `abgebrochen / transportfehler`,
  kein Reparaturversuch
- Trunkierung → derselbe Weg (§8.5)
- ein Werkzeugaufruf auf ein Werkzeug, das nicht in der Liste steht → benannter Vertragsbruch

**Geht als Werkzeugergebnis mit `fehler: true` in den Verlauf und lässt den Lauf weiterlaufen:**

- Pfad außerhalb der Wurzel, Pfad geschützt (§5.4)
- Datei nicht gefunden, nicht lesbar, zu groß
- ungültige Werkzeug-Eingabe gegen das Schema
- ein Aufruf während des Abschlussmodus (§8.4)
- ein offener Intent nach Wiederaufnahme (§6.5)

Kein Fehlertext enthält ein Geheimnis oder den Namen, unter dem eines abgelegt ist. `execFile` legt
die vollständige Argumentliste in `err.message` — redigiert wird dort, wo bekannt ist, dass das
Geheimnis in der Argumentliste steht, nicht beim Aufrufer.

Kein Fehlertext einer abgelehnten Pfadprüfung nennt den Inhalt oder die Existenz des Ziels: „Pfad
ist geschützt" ist die vollständige Auskunft.

## 11. Tests

**Unit, ohne Netz und ohne Datenbank** — die reinen Module: Blockübersetzung in beide Richtungen je
Codec, Normalisierung von `stop_reason` und Usage, Präfix-Serialisierung, Stummelliste, Projektion,
Budgetarithmetik, Preistabelle, Abschlussgründe, Werkzeug-Registry.

**Gegen ein temporäres Verzeichnis** — die Pfadwache: Wurzel-Grenze, jeder geschützte Pfad, und
**der Symlink-Fall**: ein Link innerhalb der Wurzel, der nach `~/.ssh` zeigt, wird abgelehnt.

**Gegen eine `:memory:`-Datenbank** — `protokoll.ts`: Anhängen, `seq`-Vergabe, Lesen, und dass die
Trigger `UPDATE` und `DELETE` ablehnen. Dazu die Graph-Werkzeuge gegen eine Test-Graphdatenbank.

**Wächtertests:**

| Regel | Prüfung |
|---|---|
| Der Kern kennt Electron nicht | kein `electron`-Import unter `src/main/harness/`, ohne Ausnahmeliste |
| Der Verlauf ist append-only | `UPDATE` und `DELETE` auf `ereignisse` werfen |
| Der Präfix ist rekonstruierbar | Projektion aus dem Protokoll zeichengleich mit `prompt.sent` |
| Ein Schema steht nie im Präfix | nach `tool.schema_loaded` ist der stabile Teil zeichengleich wie davor |
| Die Schleife sieht nur die kanonische Form | derselbe aufgezeichnete Ablauf durch beide Codecs ergibt dieselbe **Ereignisfolge** |
| Kein Effekt ohne Intent | im Protokoll steht vor jedem `tool.completed`/`tool.failed` ein `tool.intent` mit derselben Aufruf-ID |
| Eine Quelle, zwei Renderungen | die vier Graph-Lesewerkzeuge und der MCP-Server bieten dieselben Operationen |
| Der Vertrag bleibt an den Außenkanten | weder die Zug-Funktion noch ein Codec sieht `pflichtfelder`; nur `Auftrag` hinein und `run.finished` hinaus tun es |
| Kein Kanal ohne Aufrufer | jeder `harness:`-Kanal hat einen Renderer-Aufrufer |
| Jede anpassbare Fläche steht im Inventar | die Preistabelle in `docs/anpassbare-flaechen.md` |

**Die vier IPC-Handler bekommen bewusst keine Unit-Tests.** Kein Test dieses Repos erreicht einen
`ipcMain`-Handler; ihre Abnahme sind Belege aus der laufenden App (§12).

**Die vier Gegenproben in `tests/model/ansicht.test.ts` bleiben in dieser Strecke stehen.** Es wird
**kein B-Slot** in `slots.ts` eingefügt. Ein Slot ist ein Angebot an den Nutzer: Wer dort eine
Zuordnung setzt, erwartet, dass ein Tier oder eine Rolle daraufhin über diesen Läufer fährt. Das
verlangt einen Adapter, der eine Session über das Harness startet, und der hängt an den
schreibenden Werkzeugen und der Shell. Ein Slot vor dem Adapter wäre eine Oberfläche für eine
Attrappe — genau das Muster, gegen das die Settings-Strecke angetreten ist.

Fällt eine der vier Gegenproben trotzdem, gilt der Handover unverändert: Sie ist nicht kaputt, sie
hat gearbeitet. Nicht abschwächen, nicht löschen — prüfen, ob die Regel jetzt zu Recht feuert, und
die Gegenprobe in einen positiven Test umbauen. Für `kontext-zu-klein` reicht ein Slot ohnehin
nicht; sie braucht zusätzlich einen `WarnKontext` in `ansicht.ts`, der heute nicht übergeben wird.

## 12. Messprotokoll — die eigentliche Abnahme

Grüne Tests sagen in diesem Repo über eine Verdrahtung nichts aus. Elf Belege aus der laufenden
App, jeder mit **gültiger und ungültiger** Eingabe, damit auch das laute Scheitern belegt ist und
nicht nur der Erfolg. Wörtlich nachzutragen im Plandokument unter `## Messprotokoll 2026-08-18`.

1. Lauf ohne Werkzeugaufruf gegen ein echtes Modell → vollständige Ereignisfolge im Panel, ohne
   Anbieternamen in der Darstellung
2. Derselbe Auftrag gegen Anthropic, einen OpenAI-kompatiblen Hoster und den Spark → dreimal
   vertragsgemäß, der Unterschied liegt nachweislich nur in der Fähigkeitszeile
3. Auftrag mit angehängtem Bild und angehängter Datei gegen zwei Anbieter; ein dritter meldet
   Unvermögen ausdrücklich, statt es wegzulassen
4. **Ein Auftrag, der wirklich Arbeit ist:** „Sieh dir `src/main/model/` an und sag, welche Datei
   die Warnregeln hält und wer sie aufruft." Mehrere Werkzeugaufrufe, ein belegter Befund
5. `werkzeug_schema` wird geholt → `tool.schema_loaded` im Panel, das Schema steht im Verlauf und
   der stabile Präfix ist zeichengleich wie vorher
6. Ein Werkzeugaufruf auf einen Pfad außerhalb der Wurzel, einer auf `~/.ssh` und einer auf ein
   `.env` **innerhalb** der Wurzel → alle drei abgelehnt, der Lauf läuft weiter, das Modell
   reagiert auf die Ablehnung
7. **Der Symlink-Fall in der laufenden App:** ein Link in der Wurzel, der nach außen zeigt → abgelehnt
8. Prozess **mitten in einem Werkzeugaufruf** hart beendet, Lauf fortgesetzt → der offene Intent
   erscheint als „Ausführung unbekannt, Zustand prüfen"; kein Werkzeug läuft ein zweites Mal
9. Zweiter Lauf meldet einen Cache-Treffer
10. Budget künstlich auf zwei Runden → `fertig / runden-erschöpft` mit verwertbarem Teilergebnis,
    keine Ausnahme; ein Werkzeugaufruf im Abschlusszug wird abgelehnt
11. `KEEL_KEEP_PROFILE=1` — Start mit vorhandener Konfiguration und vorhandener `harness.db`

**Vor jedem Messlauf prüfen**, ob noch etwas läuft: `tmux list-sessions` und
`ps aux | grep -i "[c]ipher-keel"`. Eine zweite Instanz teilt sonst Config und Datenbank.

Der Fehlerpfad wird **absichtlich erzwungen** statt auf einen Zufallsfehler gewartet, und mit einem
wirklich schwachen Modell belegt — ein starkes Modell hätte ihn nie gezeigt.

## 13. Ausdrücklich nicht in dieser Strecke

Schreibende und editierende Werkzeuge · Shell · `graph_upsert_node`, `graph_link`,
`graph_maintain` · OS-Ausführungsgrenze, Egress-Allowlist, Sandbox-Profil je Lauf · Kompaktierung ·
`ausgesetzt` und der Weckdienst · beide Delegations-Primitive · der gekapselte Rechercheur ·
Kanarienauftrag und das Füllen der Fähigkeitstabelle · Ergebnisurteil · Codecs `ollama-native` und
`text` · Beobachtbarkeit autonomer Läufe samt `heartbeat` · Token-Streaming · Reparaturversuche ·
echte Werkzeug-Suche über einen großen Katalog · Drag&Drop und Screenshot-Einfügen · ein B-Slot in
`slots.ts`.

### 13.1 Übernommene Abnahmen — fällig mit den schreibenden Werkzeugen

Was diese Strecke nicht prüfen kann, weil ihm der Auslöser fehlt. Es wird **nicht vorgebaut** —
Code ohne Aufrufer ist in diesem Projekt ein Prüfbefund — und es wird **nicht vergessen**:

| Abnahme | Herkunft | fällig mit |
|---|---|---|
| Ein schreibender Aufruf in der Menge erzwingt sequenzielle Ausführung (Single-Writer auf Werkzeugebene) | M8 §1, §3.2 | schreibenden Werkzeugen |
| Ein Shell-Aufruf auf einen nicht erlaubten Pfad scheitert **am Betriebssystem**, nicht an einer Prüfung im Harness | M8 §4.5, §10 | Shell und Sandbox |
| Ein maskiertes Werkzeug behält seinen Stummel, sein Aufruf wird mit Begründung abgelehnt, die Liste bleibt zeichengleich | M8 §3.5 | dem ersten echten Maskierungsfall |

### 13.2 Ein offener Punkt an M8, der jetzt notiert gehört

**M8s Vorgabe-Sandbox blockiert Deployments, und das ist im Konzept nicht entschieden, sondern
übersehen.** §4.5 gibt dem Arbeitslauf eine schmale Egress-Allowlist: „Modell-Endpunkte, die
Tailscale-Adresse des Spark, localhost für den Graph-MCP-Server." Die Deploy-Ziele dieses Betriebs
— MS-01 unter `100.67.95.13`, der Hostinger-VPS unter `100.64.99.118` — stehen dort nicht. Ein
Arbeitslauf unter dem Vorgabe-Profil könnte also weder `ssh` noch `scp` dorthin.

Das ist kein Fehler dieser Strecke: Ohne Shell gibt es nichts zu deployen. Aber es ist eine
Entscheidung, die **in Strecke 2 fällt und nicht dort erst entdeckt werden sollte**:

- Bekommt der Arbeitslauf die Deploy-Hosts in die Allowlist — womit ein kompromittierter Lauf
  Schreibzugriff auf die Produktionsmaschinen hätte?
- Oder gibt es ein drittes Sandbox-Profil für Deployments, so wie M8 §4.5 es für das „Schreiben
  nach außen des Release Managers" bereits vorsieht — „vorgesehen und standardmäßig aus"?
- Oder bleibt Deployment eine Handlung des Menschen, und der Agent bereitet sie nur vor?

M8 §4.5 hält die dritte Profilart schon bereit; die Frage ist, wer sie bekommt und wann sie an ist.
Nicht Gegenstand dieser Spec — hier steht sie, damit sie in Strecke 2 als Frage auf dem Tisch liegt
statt als Überraschung.

## 14. Nachzuführende Dokumente

- `docs/anpassbare-flaechen.md` — die Preistabelle als anpassbare Fläche (§8.1), plus der
  Inventartest
- `src/main/worker/c-worker.ts` — der Kommentar „three niveaus are three runtimes" ist gegen die
  Preset-Schicht falsch und gehört korrigiert, nicht fortgeschrieben (M8 §6). Ein Kommentar, der
  etwas Falsches sagt, ist teurer als ein fehlender
- `src/main/agent/registry.ts` — `keel-harness` steht in `RUNTIMES_WITHOUT_ADAPTER`; nach dieser
  Strecke ist zu entscheiden, ob es dort bleibt, solange kein Adapter den Läufer startet
