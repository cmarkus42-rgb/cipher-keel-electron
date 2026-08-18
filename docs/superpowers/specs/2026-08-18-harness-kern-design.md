# Design: Der Harness-Kern — Schleife, kanonische Form, Ereignisprotokoll

**Stand:** 2026-08-18
**Autorität:** `cipher-keel-harness-ideation/deliverables/konzept_v1.0.md` (M8, freigegeben
2026-08-16), außerhalb des Repos unter `/Users/Shared/Nextcloud/Claude/`
**Vorlage:** `docs/superpowers/plans/2026-08-18-handover-settings-fenster-steht.md` §2, §4
**Release-Schnitt:** entschieden im M6-Nachtrag `nachtrag-nanoclaw-abloesung_2026-08-16.md` —
das Harness-Subsystem liegt vollständig in 0.1

## 1. Warum diese Strecke, und warum genau dieser Ausschnitt

M8 gibt v1 als siebzehn Zeilen mit einer Reihenfolge-Spalte vor, sortiert **nach
Nachrüstbarkeit, nicht nach Wichtigkeit**: Was später teuer wird, kommt zuerst. Diese Spec
beschreibt **Strecke 1** daraus — die Zeilen 1 bis 5, 7 und 11:

| M8 §7 | Inhalt | in dieser Strecke |
|---|---|---|
| 1 | Kern / Ereignisstrom / Eingabekanal | ja |
| 2 | Kanonische Form inkl. `image` und `document` | ja |
| 3 | Ereignisprotokoll, Verlauf als Projektion, Wiederaufnahme | ja, mit einer benannten Lücke (§12) |
| 4 | Präfix-Ordnung, Stummelliste, aufgeschobenes Laden | **nur die Ordnung** (§6, §12) |
| 5 | Vier Budgets, drei Endzustände, Abschlussmodus | ja, mit **zwei** Endzuständen (§7) |
| 7 | Zwei Codecs (`anthropic`, `openai-chat`) | ja |
| 11 | Rückgabe-Vertrag an den Außenkanten | ja — vorhanden, wird eingebunden |

Nicht in dieser Strecke: Werkzeuge und Ausführungsgrenze (Zeilen 9, 10, 13), `ausgesetzt` samt
Weckdienst (6), Delegation (8), Fähigkeitstabelle samt Kanarienauftrag (12), die nachgelagerten
Zeilen 14 bis 17. Die Kopplung, die das erzwingt, steht in M8 §7 Zeile 10: Mit Shell und
Schreiben im Umfang ist jede Prüfung unterhalb der Betriebssystem-Grenze Theater. Werkzeuge und
Sandbox reisen zusammen, und beide zusammen sind Strecke 2.

Zeile 11 ist nachträglich in diese Strecke gezogen worden. Der Grund steht in §7: Der
Abschlussmodus lautet „liefere jetzt das Ergebnis in Vertragsform" — ohne die Vertragsprüfung
wäre das eine Anweisung, deren Erfüllung niemand feststellt. `result-contract.ts` existiert;
M8 §7 nennt Zeile 11 selbst „Vorhanden, wird eingebunden".

## 2. Was schon dasteht

Der Bestand ist größer als der Handover vermuten lässt, und drei Befunde formen die Spec:

- **`src/main/worker/` ist electron-frei.** Kein Modul dort importiert `electron`. Der Kern darf
  es also benutzen, ohne den Wächtertest aus M8 §8 („Der Kern kennt Electron nicht") zu brechen.
- **Die Fähigkeitstabelle ist zur Hälfte gebaut.** `Faehigkeiten` in `model/entry.ts` trägt
  bereits `codec`, `werkzeugmodus`, `paralleleAufrufe`, `denkbloecke`, `bilder`, `dokumente`,
  `aufgeschobenesLaden`, `werkzeugObergrenze`, `nutzbaresKontextfenster`, `vertragsStrenge`,
  `rundenbudget`, `gemessenAm`, `gemessenMit`, `quelle` — also M8 §5 wörtlich. Was fehlt, ist der
  Kanarienauftrag, der sie füllt (Strecke 4). Strecke 1 **liest** sie.
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
  praefix.ts       Ordnung und deterministische Serialisierung        rein
  projektion.ts    (Ereignisse) => Verlauf                            rein
  budget.ts        vier Budgets, Endzustaende, Abschlussmodus         rein
  protokoll.ts     SQLite: Schema, anhaengen, lesen                   I/O
  lauf.ts          die Schleife — der einzige Ort, der zusammensetzt
  index.ts         die oeffentliche Flaeche

src/main/harness-handlers.ts          die IPC-Flaeche, neben ipc-handlers.ts
src/main/worker/anthropic-client.ts   dritter ModelClient
src/renderer/windows/harness-window.{html,tsx}
src/renderer/components/harness/      das Ereignis-Panel
```

Neun der elf Kernmodule sind rein — testbar ohne Netz, ohne Datenbank, ohne Electron. Der Schnitt
ist derselbe, den `api-client.ts` in seinem Kopf beschreibt: die Entscheidungen exportiert, „was
übrig bleibt, ist die HTTPS-Verrohrung".

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
als Folgekosten. Ein Feld entscheidet beides: welcher Codec übersetzt und welcher Transport
sendet.

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
   Damit ist der DGX Spark in Strecke 1 erreichbar, **ohne** dass `ollama-native` gebaut sein
   muss — und die Abnahme „derselbe Auftrag gegen drei Anbieter" (M8 §10) wird erreichbar.
2. `codec: 'ollama-native'` und `codec: 'text'` sind in Strecke 1 nicht gebaut (M8 §7 Zeile 14).
   Ein Eintrag, der sie nennt, wird beim Start des Laufs **laut** abgewiesen, mit dem
   Codec-Namen im Text — nie still auf einen anderen Codec gefallen.

### 3.5 Was ein Lauf beim Start bekommt

```ts
export interface Auftrag {
  auftragstext: string
  modellId: string                    // in die Registry, nicht in die Config
  anhaenge?: string[]                 // absolute Pfade, siehe §4.5
  pflichtfelder?: string[]            // fuer die Vertragspruefung, §7.6
  budgets: {
    runden: number
    wanduhrMs: number
    kostenCent: number
    kontextAnteil: number             // 0..1 des nutzbaren Kontextfensters
  }
}
```

M8 §4.4 verlangt für **autonome** Läufe ein geschlossenes Dokument mit Entität, Phase, Subsystem,
Input-Quelle, erwartetem Output und Budget. Strecke 1 kennt nur **interaktive** Läufe — ein Mensch
sitzt davor, und §4.4 nimmt sie ausdrücklich aus: „Ein interaktiver Lauf hat den Menschen per
Konstruktion in der Schleife und braucht diese Geschlossenheit nicht." Die Felder für Phase,
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

Die beiden Werkzeug-Blöcke gehören dazu, obwohl Strecke 1 keine Werkzeuge hat: Sie sind der Grund,
warum die Form dem Anthropic-Muster folgt (verlustfrei nach OpenAI und Gemini abbildbar, umgekehrt
nicht). Die Codecs übersetzen sie. `lauf.ts` schickt in Strecke 1 keine Werkzeugliste mit — kommt
trotzdem ein `werkzeug-aufruf` zurück, ist das ein benannter Vertragsbruch.

`signatur` am Denkblock ist kein Beiwerk: Anthropic verlangt Denkblöcke bei Fortsetzung wörtlich
samt Signatur zurück. Eine Form ohne dieses Feld verliert die Fortsetzbarkeit genau dort, wo
Denken teuer war.

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
sind dieselbe Tatsache in zwei Schreibweisen — normalisiert wird sie einmal, im Codec, und das
Rohe bleibt daneben stehen, damit niemand die Normalisierung glauben muss.

### 4.3 Der Codec hat zwei Funktionen und keinen Zustand

```ts
export interface Codec {
  name: 'anthropic' | 'openai-chat'
  toWire(nachrichten: Nachricht[], f: Faehigkeiten): unknown
  fromWire(antwort: unknown): ModelAntwort
}
```

Kein Zugriff auf Schleifenzustand, Budgets oder Werkzeuge — die Typsignatur macht es unmöglich
(M8 §8, Art „Form"). Der Textmodus ist später ein weiterer Codec, kein zweiter Pfad.

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

Ein Pfad, der nicht existiert oder nicht lesbar ist, lässt den Lauf **nicht starten** und meldet
den Pfad. Er wird nicht stillschweigend übergangen.

## 5. Das Ereignisprotokoll

### 5.1 Eine eigene Datei, eine einzige Tabelle

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

`seq` wird beim Anhängen in derselben Transaktion vergeben (`COALESCE(MAX(seq), 0) + 1`).
better-sqlite3 ist synchron, der Hauptprozess ist einfädig — damit gilt Single-Writer ohne
zusätzliche Vorkehrung.

### 5.2 Ereignisse in Strecke 1

`run.started` · `prompt.sent` · `model.answered` · `budget.warned` · `run.finished`

Nicht in Strecke 1, weil ihre Auslöser fehlen: `tool.intent`, `tool.completed`, `tool.failed`,
`tool.schema_loaded`, `delegation.dispatched`, `delegation.judged`, `repair.attempted`,
`heartbeat`, `run.suspended`.

`heartbeat` gehört zu M8 §7 Zeile 15 (Beobachtbarkeit autonomer Läufe), ausdrücklich
nachgelagert. `repair.attempted` gehört zum Reparaturversuch, der an der `vertragsStrenge` einer
gemessenen Fähigkeitszeile hängt — Strecke 4.

### 5.3 `prompt.sent` wird vollständig und wörtlich gespeichert

M8 §3.1 übergibt die Persistenz ausdrücklich an die Spec. Die Entscheidung fällt am Wächtertest
aus §8: Er baut den Präfix aus dem Protokoll und vergleicht ihn **zeichengleich mit
`prompt.sent`**. Ist `prompt.sent` selbst schon eine Rekonstruktion aus Präfix-Verweis plus Delta,
vergleicht der Test die Zusammensetzung mit sich selbst und prüft nichts.

Der Preis ist bekannt und wird hingenommen: Der stabile Präfix liegt je Zug erneut im Protokoll,
Größenordnung anderthalb Megabyte bei dreißig Zügen à fünfzigtausend Zeichen. Eine
inhaltsadressierte Ablage wurde erwogen und verworfen — sie löst ein Speicherproblem, das nicht
gemessen ist.

### 5.4 Wiederaufnahme ist kein eigener Codepfad

Die Schleife hält **keinen** Verlauf im Speicher. Vor jedem Zug liest sie die Ereignisse des Laufs
und projiziert daraus den Verlauf.

```ts
export function projiziere(ereignisse: Ereignis[]): Nachricht[]
```

Damit ist „Zug 1" und „Zug 14 nach einem Neustart" derselbe Ablauf. Der Grund ist nicht Eleganz:
Die Wiederaufnahme hängt an einem harten Prozesstod und ist deshalb schlecht testbar. Ein Pfad,
der bei jedem normalen Zug mitläuft, ist bei der Abnahme bereits tausendfach gelaufen.

Was Wiederaufnahme unmöglich machen würde und deshalb verboten ist (M8 §3.4): Zustand nur im
Prozessspeicher, mutierte Verlaufseinträge, ein Präfix aus nicht reproduzierbaren Laufzeitwerten.

Die Regel für den **offenen `tool.intent`** ist in Strecke 1 nicht erreichbar, weil es keine
Werkzeuge gibt. Sie wird deshalb nicht vorgebaut — siehe §12.

## 6. Der Präfix

Ordnung nach M8 §3.5:

1. **Stabil, unveränderlich innerhalb einer Session:** Body → Capabilities → Persona → globale
   Regeln → Auftrag samt Phaseninput → Werkzeug-Stummelliste *(in Strecke 1 leer)*
2. **Append-only:** der Verlauf
3. **Volatil, am Ende:** das Fortschrittsobjekt *(in Strecke 1 leer — ein Lauf ohne Werkzeuge hat
   keine Fortschrittseinheiten)*

Regeln, die Strecke 1 vollständig trägt:

- keine Zeitstempel, Zähler oder Rundenangaben im stabilen Teil
- deterministische Serialisierung mit sortierten Schlüsseln
- der Präfix ist aus dem Protokoll rekonstruierbar, ohne ihn neu zu bauen

**Stummelliste und aufgeschobenes Laden sind nicht in dieser Strecke.** Beide sind werkzeugförmig:
Eine Stummelliste ohne Werkzeuge ist leer, und aufgeschobenes Laden lädt nichts. Nicht nachrüstbar
ist die *Ordnung*, weil sonst die Präfix-Ökonomie inkonsistent wird; die Stummelliste ist ein
weiterer Abschnitt im stabilen Teil, dessen späteres Einfügen **eine** Cache-Invalidierung kostet
und keinen Umbau. Siehe §12.

Was Strecke 1 vom Präfix trotzdem voll belegt, ist die teuerste Zusicherung: Ein zweiter Lauf
meldet einen Cache-Treffer. Das prüft die Ordnung an der Stelle, an der sie Geld kostet.

## 7. Budgets, Endzustände, Abschlussmodus, Vertrag

### 7.1 Vier Budgets

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

### 7.2 Zwei Endzustände, nicht drei

| Endzustand | Gründe |
|---|---|
| `fertig` | `ziel-erreicht`, `runden-erschöpft`, `zeit-erschöpft`, `kosten-erschöpft`, `kontext-erschöpft` |
| `abgebrochen` | `transportfehler`, `abgebrochen-von-aussen` |

`ausgesetzt` ist M8 §7 Zeile 6 und damit Strecke 3. Es wird auch **nicht als unbewohnte Variante**
in die Union aufgenommen: Jedes `switch` müsste dann einen Zweig tragen, den nichts erreicht.
Kommt es in Strecke 3 dazu, zeigt der Compiler jede Stelle an, die es braucht — das ist billiger
als tote Zweige mitzuschleppen.

`kein-fortschritt` ist kein Grund, sondern ein inferiertes Warnsignal (M8 §4.10) und in Strecke 1
nicht vorhanden.

### 7.3 Jeder Grund trägt seinen Anweisungstext

```ts
export interface Abschlussgrund {
  code: 'ziel-erreicht' | 'runden-erschöpft' | 'zeit-erschöpft'
      | 'kosten-erschöpft' | 'kontext-erschöpft'
      | 'transportfehler' | 'abgebrochen-von-aussen'
  anweisung: string        // deutsch, geht an das Modell und ins Ereignis
}
```

Ein Text, zwei Verwendungen — dieselbe Bauweise, die `result-contract.ts` in seinem Kopf begründet.

### 7.4 Der Abschlussmodus ist keine Ausnahme

Schlägt ein Budget an, folgt **ein letzter Zug** mit der Anweisung, jetzt das Ergebnis in
Vertragsform zu liefern, samt Grund. Erst danach `run.finished`. Ein angeschlagenes Budget führt
also zu einem verwertbaren Teilergebnis, nicht zu einer geworfenen Ausnahme.

### 7.5 Trunkierung wird vor jeder Reparaturentscheidung gelesen

`stopGrund.normalisiert === 'laenge'` → `abgebrochen / transportfehler`, **kein** Reparaturversuch
(M8 §4.8). Sonst verbrennt der eine Versuch an einem Problem, das kein Nachdenken löst.

### 7.6 Der Rückgabe-Vertrag, an den Außenkanten

`checkWorkerAnswer` prüft das Ergebnis eines abgeschlossenen Laufs gegen die Pflichtfelder des
Auftrags. **Nur dort.** Innerhalb der Schleife gilt er nicht, und die Schleifen-Schnittstelle nimmt
keine Pflichtfelder entgegen — die Durchsetzung liegt in der Form (M8 §4.9, §8).

Das Ergebnis der Prüfung steht in `run.finished` und wird nicht erzwungen: Erzwungenes
Schema-Decoding hebt die Validität auf hundert Prozent und senkt die Antwortgenauigkeit. Ein
sichtbar gescheiterter Lauf ist das bessere Ergebnis als valides Nonsens.

## 8. IPC und Fenster

### 8.1 Vier Kanäle, jeder mit einem Aufrufer

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

**Der Abbruch wirkt an der Zuggrenze, nicht mitten in der Anfrage.** `harness:lauf-abbrechen`
setzt eine Marke; die Schleife liest sie vor dem nächsten Zug und schließt mit
`abgebrochen / abgebrochen-von-aussen` ab. Eine laufende HTTP-Anfrage wird nicht abgeschnitten.
Das ist die Übertragung von M8 §4.6 — „jede Unterbrechung liegt auf einer Werkzeuggrenze" — auf
eine Strecke ohne Werkzeuge, in der die Zuggrenze die einzige saubere Grenze ist. Der Preis ist
benannt: Bei einem Modell, das neunzig Sekunden denkt, wirkt der Abbruch bis zu neunzig Sekunden
später. Ein `AbortSignal` durch den Transport wäre die Abhilfe und gehört zur Werkzeug-Strecke,
wo die Unterbrechung ohnehin eine Grenze braucht.

### 8.2 Das Fenster spiegelt das Settings-Fenster

`createHarnessWindow` neben `createSettingsWindow`, `harness-window.{html,tsx}` neben
`settings-window.*`, mit garantiertem Klickpfad aus dem Projektfenster. Das Muster ist in der
Settings-Strecke gebaut und in der laufenden App belegt.

Ein neuer Zellentyp im SessionGrid wäre der Weg, den der M6-Nachtrag gerade abgeräumt hat: Aus
„Grid-Zelle plus Adapter" ist ein Laufzeit-Subsystem geworden, und die `NanoClawChannelCell`
entfällt ersatzlos.

Das Panel zeigt je Ereignis eine Zeile — Zeitstempel, Art, Kurzfassung der Nutzlast, aufklappbar.
Es kennt **keinen Anbieternamen**: Was es anzeigt, kommt aus dem Ereignisstrom.

## 9. Fehlerbehandlung

Die Leitregel des Projekts gilt unverändert: **Stille Fehler sind die teuersten.** Konkret:

- **Unbekannter Codec** (`ollama-native`, `text`) → Lauf startet nicht, Meldung nennt den Codec
- **Blocktyp, den das Modell nicht kann** → Codec meldet, nennt Blocktyp und Fähigkeitszeile
- **Anhang nicht lesbar** → Lauf startet nicht, Meldung nennt den Pfad
- **`cli-harness`-Eintrag** → Lauf startet nicht; `sperrgrund` in `eignung.ts` hat den Text bereits
- **Transportfehler** (Netz, Zeitüberschreitung, Status ≠ 200) → `abgebrochen / transportfehler`,
  kein Reparaturversuch
- **`werkzeug-aufruf` in der Antwort, obwohl keine Werkzeugliste gesendet wurde** → benannter
  Vertragsbruch, `abgebrochen`

Kein Fehlertext enthält ein Geheimnis oder den Namen, unter dem eines abgelegt ist. `execFile` legt
die vollständige Argumentliste in `err.message` — redigiert wird dort, wo bekannt ist, dass das
Geheimnis in der Argumentliste steht, nicht beim Aufrufer.

## 10. Tests

**Unit, ohne Netz und ohne Datenbank** — die neun reinen Module: Blockübersetzung in beide
Richtungen je Codec, Normalisierung von `stop_reason` und Usage, Präfix-Serialisierung,
Projektion, Budgetarithmetik, Preistabelle, Abschlussgründe.

**Gegen eine `:memory:`-Datenbank** — `protokoll.ts`: Anhängen, `seq`-Vergabe, Lesen, und dass die
Trigger `UPDATE` und `DELETE` ablehnen.

**Wächtertests:**

| Regel | Prüfung |
|---|---|
| Der Kern kennt Electron nicht | kein `electron`-Import unter `src/main/harness/`, ohne Ausnahmeliste |
| Der Verlauf ist append-only | `UPDATE` und `DELETE` auf `ereignisse` werfen |
| Der Präfix ist rekonstruierbar | Projektion aus dem Protokoll zeichengleich mit `prompt.sent` |
| Die Schleife sieht nur die kanonische Form | derselbe aufgezeichnete Ablauf durch beide Codecs ergibt dieselbe **Ereignisfolge** |
| Der Vertrag bleibt an den Außenkanten | die Schleifen-Schnittstelle nimmt keine Pflichtfelder entgegen (Typ-Ebene) |
| Kein Kanal ohne Aufrufer | jeder `harness:`-Kanal hat einen Renderer-Aufrufer |
| Jede anpassbare Fläche steht im Inventar | die Preistabelle in `docs/anpassbare-flaechen.md` |

**Die vier IPC-Handler bekommen bewusst keine Unit-Tests.** Kein Test dieses Repos erreicht einen
`ipcMain`-Handler; ihre Abnahme sind Belege aus der laufenden App (§11).

**Die vier Gegenproben in `tests/model/ansicht.test.ts` bleiben in dieser Strecke stehen.**
Strecke 1 fügt **keinen B-Slot** in `slots.ts` ein. Ein Slot ist ein Angebot an den Nutzer: Wer
dort eine Zuordnung setzt, erwartet, dass ein Tier oder eine Rolle daraufhin über diesen Läufer
fährt. Das verlangt einen Adapter, der eine Session über das Harness startet — und der hängt an
den Werkzeugen. Ein Slot vor dem Adapter wäre eine Oberfläche für eine Attrappe, also genau das
Muster, gegen das die Settings-Strecke angetreten ist.

Fällt eine der vier Gegenproben trotzdem, gilt der Handover unverändert: Sie ist nicht kaputt, sie
hat gearbeitet. Nicht abschwächen, nicht löschen — prüfen, ob die Regel jetzt zu Recht feuert, und
die Gegenprobe in einen positiven Test umbauen. Für `kontext-zu-klein` reicht ein Slot ohnehin
nicht; sie braucht zusätzlich einen `WarnKontext` in `ansicht.ts`, der heute nicht übergeben wird.

## 11. Messprotokoll — die eigentliche Abnahme

Grüne Tests sagen in diesem Repo über eine Verdrahtung nichts aus. Sieben Belege aus der laufenden
App, jeder mit **gültiger und ungültiger** Eingabe, damit auch das laute Scheitern belegt ist und
nicht nur der Erfolg. Wörtlich nachzutragen im Plandokument unter `## Messprotokoll 2026-08-18`.

1. Lauf ohne Werkzeuge gegen ein echtes Modell → vollständige Ereignisfolge im Panel, ohne
   Anbieternamen in der Darstellung
2. Derselbe Auftrag gegen Anthropic, einen OpenAI-kompatiblen Hoster und den Spark → dreimal
   vertragsgemäß, der Unterschied liegt nachweislich nur in der Fähigkeitszeile
3. Auftrag mit angehängtem Bild und angehängter Datei gegen zwei Anbieter; ein dritter meldet
   Unvermögen ausdrücklich, statt es wegzulassen
4. Prozess zwischen zwei Zügen hart beendet, Lauf fortgesetzt → kein Zug wird ein zweites Mal
   gesendet, der rekonstruierte Präfix ist zeichengleich
5. Zweiter Lauf meldet einen Cache-Treffer
6. Budget künstlich auf zwei Runden → `fertig / runden-erschöpft` mit verwertbarem Teilergebnis,
   keine Ausnahme
7. `KEEL_KEEP_PROFILE=1` — Start mit vorhandener Konfiguration und vorhandener `harness.db`

**Vor jedem Messlauf prüfen**, ob noch etwas läuft: `tmux list-sessions` und
`ps aux | grep -i "[c]ipher-keel"`. Eine zweite Instanz teilt sonst Config und Datenbank.

Der Fehlerpfad wird **absichtlich erzwungen** statt auf einen Zufallsfehler gewartet, und mit einem
wirklich schwachen Modell belegt — ein starkes Modell hätte ihn nie gezeigt.

## 12. Ausdrücklich nicht in dieser Strecke

Werkzeuge und Werkzeugschleife · OS-Ausführungsgrenze, Egress-Allowlist, Sandbox-Profil ·
Kompaktierung · `ausgesetzt` und der Weckdienst · beide Delegations-Primitive · der gekapselte
Rechercheur · Kanarienauftrag und das Füllen der Fähigkeitstabelle · Ergebnisurteil ·
Codecs `ollama-native` und `text` · Beobachtbarkeit autonomer Läufe samt `heartbeat` ·
Token-Streaming · Reparaturversuche · Drag&Drop und Screenshot-Einfügen · ein B-Slot in
`slots.ts`.

### 12.1 Übernommene Abnahmen — fällig in Strecke 2

Was Strecke 1 nicht prüfen kann, weil ihm der Auslöser fehlt. Es wird **nicht vorgebaut** — Code
ohne Aufrufer ist in diesem Projekt ein Prüfbefund — und es wird **nicht vergessen**:

| Abnahme | Herkunft | fällig mit |
|---|---|---|
| Ein offener `tool.intent` geht nach der Wiederaufnahme als „Ausführung unbekannt, Zustand prüfen" in den Verlauf; kein Werkzeug läuft ein zweites Mal | M8 §3.4, §10 | Werkzeuge |
| Die Stummelliste bleibt über die Session zeichengleich; ein maskiertes Werkzeug behält seinen Stummel | M8 §3.5, §8 | Werkzeuge |
| Ein nachgeladenes Schema erscheint im Verlauf und **nicht** im Präfix | M8 §3.5, §10 | Werkzeuge |

## 13. Nachzuführende Dokumente

- `docs/anpassbare-flaechen.md` — die Preistabelle als anpassbare Fläche (§7.1), plus der
  Inventartest
- `src/main/worker/c-worker.ts` — der Kommentar „three niveaus are three runtimes" ist gegen die
  Preset-Schicht falsch und gehört korrigiert, nicht fortgeschrieben (M8 §6). Ein Kommentar, der
  etwas Falsches sagt, ist teurer als ein fehlender
- `src/main/agent/registry.ts` — `keel-harness` steht in `RUNTIMES_WITHOUT_ADAPTER`; nach dieser
  Strecke ist zu entscheiden, ob es dort bleibt, solange kein Adapter den Läufer startet
