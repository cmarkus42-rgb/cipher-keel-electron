# Niveau-C-Rückgabe-Vertrag — Entwurf

**Stand:** 2026-08-13
**Zuschnitt:** Vertrag und Läufer. Keine Auftrags-Schnittstelle für Sessions.

---

## 1. Warum das gebaut wird

cipher keel soll ein Leistungsgefälle bedienbar machen. Die obere Hälfte ist verdrahtet und
in der laufenden App belegt: Das Niveau folgt dem Adapter, Modell-Tiers lösen auf, eine
Architect-Session startet auf `--model opus`. Die untere Hälfte gibt es nicht.

Aus dem Gespräch vom 2026-08-12/13 ergab sich die Zuordnung, die im Repo bisher nirgends
ausgesprochen war — **die drei Niveaus sind drei Laufzeiten:**

| Niveau | Laufzeit | Begründung |
|---|---|---|
| A | Claude Code (Schenkel 1) | fremdes Harness, voll agentisch |
| B | NanoClaw (Schenkel 2) | agentisch, aber wir bauen das Harness nicht selbst |
| C | **keel selbst** | ein Prompt hinein, eine formatierte Antwort heraus — dafür braucht es kein Harness |

Die Vorgabe des Nutzers für C lautet wörtlich: „für die kleinen Modelle soll es ja nur geben
‚Antwort hierhin zurückgeben' (im entsprechenden Format etc), ansonsten sollen sie ja nicht
belastet werden", und: „Iterationen starten ja eh mit neuen Sessions bei den kleinen".

C ist damit **zustandslos und werkzeuglos**. Was ein C-Worker leisten muss, ist genau eines:
eine prüfbare Antwort zurückgeben.

**Die C-Laufzeit existiert bereits, nur nicht unter diesem Namen.** Das Notizen-Tagging
(`src/main/notes/note-tagging.ts`) ist dieses Muster in klein — ein POST auf Ollamas
`/api/generate`, ein Timeout, und `parseTagResponse`, das die Antwort in eine Struktur
zwingt. Was fehlt, ist nicht der Zugang zum Modell, sondern der **Vertrag über die Antwort**.

## 2. Das Problem, das der Vertrag löst

`parseTagResponse` ist die Warnung, nicht das Vorbild. Es fällt von JSON auf einen Regex und
von dort auf Komma-Trennung zurück und liefert im Zweifel Müll statt eines Fehlers. Für Tags
ist das richtig: Ein danebengegangenes Tag ist folgenlos.

Für ein Arbeitsergebnis, das die nächste Phase speist, wäre es genau die Sorte stillen
Verlusts, die bei Niveau B gerade beseitigt wurde — dort emittierte die Assemblierung
kommentarlos *nichts*, und eine B-Session hätte ihre ganze Capability-Schicht verloren, ohne
dass irgendwo etwas rot geworden wäre.

**Anforderung:** Ein kleines Modell, das das Format verfehlt, muss das sichtbar tun.

## 3. Entscheidungen

| Frage | Entscheidung | Von wem |
|---|---|---|
| Was tut keel mit der Antwort? | Prüfen, dann an den Auftraggeber. **Kein** Graph-Schreiben, kein Datei-Schreiben | Nutzer |
| Wer legt die Form fest? | Der Auftraggeber, pro Auftrag — fester Umschlag plus eine Liste von Pflichtfeldern. Kein JSON-Schema | Nutzer |
| Was bei Formatbruch? | **Genau ein** Reparaturversuch, immer protokolliert | Nutzer |
| Zuschnitt | Vertrag + Läufer. Auftrags-Schnittstelle später | Nutzer |
| Umschlag-Format | Markierter, umzäunter Block mit einem JSON-Objekt darin | Assistent, bestätigt |

**Warum der markierte Block und nicht reines JSON:** Kleine Modelle produzieren umzäunte
Blöcke zuverlässig — das ist das häufigste Muster in ihrem Training — und schreiben fast
immer „Hier ist das Ergebnis:" davor. Reines JSON würde an genau der Eigenschaft scheitern,
die wir bedienen wollen. Der Marker macht das Herausschneiden **eindeutig**: kein Raten wie
in `parseTagResponse`, das sich die erste passende Klammer greift. Geschwätz *um* den Block
wird geduldet, im Block selbst nichts.

**Bekannte Schwäche, bewusst in Kauf genommen:** JSON verlangt maskierte Zeilenumbrüche in
Textfeldern, und daran verschlucken sich schwache Modelle. Der Reparaturversuch benennt
genau das. Zeigt der Betrieb, dass mehrzeilige Nutzlasten reihenweise scheitern, ist das
eine gemessene Korrektur — jetzt schon einen zweiten Mechanismus für lange Textfelder zu
erfinden, wäre geraten.

## 4. Architektur

Drei Module unter `src/main/worker/`, jedes mit einer Aufgabe:

| Modul | Aufgabe | Abhängigkeiten |
|---|---|---|
| `result-contract.ts` | Block herausschneiden, parsen, Pflichtfelder prüfen | keine — reine Funktionen |
| `ollama-client.ts` | ein POST auf `/api/generate`, Timeout, klare Fehler | `node:http`, ConfigStore |
| `c-worker.ts` | Prompt bauen, aufrufen, prüfen, einmal reparieren | die beiden obigen |

Der Client sitzt hinter einem schmalen Interface, damit `c-worker` im Test ohne Netz läuft.

**Umbau am Bestand:** `note-tagging.ts` benutzt künftig `ollama-client.ts`, statt einen
zweiten HTTP-Pfad zu Ollama zu unterhalten (`ollamaPost` ist dort heute privat).

**Grenze, ausdrücklich:** Das Tagging **behält** seine nachsichtige Auswertung samt Regex-
und Komma-Rückfall. Zwei Konsumenten, zwei Strengegrade — wer das später zusammenlegen will,
soll diesen Absatz finden.

## 5. Schnittstellen

```ts
interface WorkerJob {
  /** The task itself, formulated by the dispatching entity. */
  prompt: string
  /** Field names the answer must carry. Presence is checked, content is not. */
  requiredFields: string[]
  /** Overrides the configured endpoint — e.g. to reach the DGX Spark instead of the Mac. */
  endpoint?: { host?: string; port?: number; model?: string }
  /** Per-job timeout. Defaults to WORKER_TIMEOUT_MS (120s). */
  timeoutMs?: number
}

interface WorkerResult {
  ok: boolean
  /** The parsed object, or null when the contract was not met. */
  data: Record<string, unknown> | null
  /** 0 or 1 — a repair is always visible, never silent. */
  repairs: number
  /** What broke on the first attempt, even when the repair succeeded. */
  note: string | null
  /** Why it failed for good. */
  error: string | null
  /** The model's last answer, verbatim — kept on success and failure alike. */
  raw: string
}
```

`endpoint` ist der Grund, warum ein zweiter Rechner keine Umbaumaßnahme ist: Seit dem
2026-08-13 steht ein DGX Spark bereit, auf dem größere oder weniger stark quantisierte
Modelle laufen. Eine Modell-Registry oder Tier-Tabelle entsteht hier **nicht** — das wäre
geraten, solange die B-Seite offen ist.

## 6. Die Formatanweisung

keel hängt sie selbst an. Ein Modell kann kein Format einhalten, das ihm niemand genannt hat
— die Anweisung ist Teil des Vertrags, nicht Sache des Auftraggebers. Sie nennt den Marker,
das JSON-Objekt, die Feldnamen aus `requiredFields`, und sagt ausdrücklich, dass Text
außerhalb des Blocks ignoriert wird.

Der Marker ist wörtlich **`keel-ergebnis`**, als Infostring eines dreifach umzäunten Blocks:

````
```keel-ergebnis
{ "datei": "...", "aenderung": "...", "begruendung": "..." }
```
````

Sprache: deutsch, wie alle Prompt-Inhalte des Projekts.

## 7. Prüfschritte und Reparatur

| Bruch | Meldung |
|---|---|
| kein markierter Block | `kein Block "keel-ergebnis" in der Antwort` |
| mehr als einer | `mehr als ein Block — es muss genau einer sein` |
| JSON ungültig | `JSON im Block ist ungültig: <Parser-Meldung>` |
| kein Objekt | `im Block steht kein JSON-Objekt` |
| Felder fehlen | `fehlende Felder: <namen>` |

**Die Bruchmeldung ist zugleich die Reparaturanweisung** — ein Text, zwei Verwendungen. Was
der Auftraggeber liest, ist wörtlich das, was das Modell im zweiten Versuch gesagt bekommt.

Beim zweiten Block wird streng abgelehnt statt „den letzten genommen". Raten ist genau das,
was `parseTagResponse` tut.

Der Reparaturversuch ist ein **frischer** Aufruf — C ist zustandslos. Er trägt die
ursprüngliche Aufgabe, die missratene Antwort des Modells, die Bruchmeldung und die
Formatanweisung erneut.

**Zwei Grenzen:** Zusatzfelder sind erlaubt, geprüft wird Anwesenheit statt
Ausschließlichkeit. Und ein leeres Feld gilt als anwesend — ob `""` brauchbar ist,
entscheidet der Auftraggeber. Inhalt ist nie keels Sache.

## 8. Fehler jenseits des Formats

Transportfehler und Vertragsbruch werden getrennt behandelt. Ein Netzfehler bekommt **keinen**
Reparaturversuch: Ein nicht erreichbarer Daemon repariert sich nicht dadurch, dass man ihm
sagt, ein Feld habe gefehlt.

| Fall | Verhalten |
|---|---|
| Ollama nicht erreichbar | Fehler, kein Reparaturversuch |
| Modell nicht installiert (404) | Fehler, der das Modell beim Namen nennt, nach dem Muster von `describeMissingTool` |
| Timeout | Fehler mit dem Zeitwert, damit ein zu knapper Wert erkennbar ist |
| HTTP ≠ 200 | Fehler mit Status |

**Zum Zeitwert:** Der bestehende Client wartet 60 s — angemessen für ein Tag, knapp für ein
30B-MoE, das echte Arbeit macht. Der Worker-Default wird deshalb `WORKER_TIMEOUT_MS = 120_000`
und ist pro Auftrag überschreibbar. Das Tagging behält seine 60 s.

**Der schlechteste Fall ist die doppelte Wartezeit**: Ein Auftrag, der ins Timeout läuft, und
ein Reparaturversuch, der es ebenfalls tut, blockieren zusammen bis zu vier Minuten. Weil ein
Timeout ein Transportfehler ist, tritt der Fall nach Abschnitt 8 gar nicht ein — nach einem
Timeout wird **nicht** repariert. Die Verdopplung gilt nur für den Formatbruch, bei dem der
erste Aufruf schnell zurückkam.

Der zweite Fall ist real: `llm.ollamaModel` steht auf `gemma3:12b`, und dieses Modell liegt
auf der Maschine nicht.

## 9. Der Modell-Default

`gemma3:12b` stammt aus einer Zeit, in der es weder Qwen3-Coder noch Gemma4 gab. Er wird auf
**`qwen3:30b-a3b-instruct-2507-q4_K_M`** gesetzt — real installiert, 30.5B MoE, das stärkste
vorhandene Allzweckmodell.

**Das ist ein Platzhalter, keine Wahl.** Das Ziel des Nutzers ist das jeweils aktuelle
Coding-Flaggschiff, das auf der Hardware gut läuft — Qwen3-Coder ist auf dieser Maschine
nicht installiert. Sobald es gezogen wird, ist der Wechsel eine Zeile in der Config.

## 10. Was das ermöglicht, ohne es zu bauen

Der Nutzer will eine **eigene Benchmark-Strecke**, um nicht an geschönten offiziellen
Benchmarks zu hängen. Der Rückgabe-Vertrag ist deren Voraussetzung: Was nicht maschinell
prüfbar ist, ist nicht bewertbar.

Der Entwurf lässt das offen, ohne es vorwegzunehmen — das Modell ist ein Parameter pro
Auftrag, der Läufer hat keinen verborgenen Zustand, `raw` bleibt erhalten. „Dieselben zwanzig
Aufträge gegen fünf Modelle" ist damit später eine Schleife, kein Umbau. **Gebaut wird sie
hier nicht.**

## 11. Test

| Ebene | Inhalt |
|---|---|
| `result-contract` | alle fünf Brüche, glücklicher Pfad, Zusatzfelder, leeres Feld — reine Funktionen |
| `c-worker` | eingesetzter Fake-Client: genau zwei Aufrufe bei Reparatur, `repairs: 1`, Notiz nennt das fehlende Feld, Scheitern nach dem zweiten Fehlversuch, **kein** Reparaturversuch bei Transportfehler |
| `note-tagging` | bestehende Tests bleiben unverändert grün — ändert sich dort Verhalten, war die Herauslösung falsch |

Kein Test geht ins Netz.

**Beleg in der laufenden App**, weil grüne Tests in diesem Repo über eine Verdrahtung nichts
aussagen — kein Test erreicht einen `ipcMain`-Handler: ein echter Lauf gegen das lokale
Ollama mit einem installierten Modell. Der Reparaturpfad wird dabei **absichtlich erzwungen**
statt auf einen Zufallsfehler gewartet.

## 12. Nicht dabei

- keine Auftrags-Schnittstelle für Sessions (IPC-Kanal oder MCP-Werkzeug)
- kein Graph-Schreiben, kein Datei-Schreiben
- keine Tier-Tabelle, keine Modell-Registry
- keine Änderung an der C-Prompt-Assemblierung (`assemble-entity.ts` kürzt weiter auf 2000
  Token)
- kein zweiter Reparaturversuch
- keine Benchmark-Strecke
- keine Änderung am Tagging-Verhalten

## 13. Offene Punkte, die dieser Entwurf nicht anfasst

- **Niveau B** bleibt unbeantwortet: Woher das `provider:modell`-Handle kommt und ob der
  Channel-Umschlag ein Feld dafür bekommen kann, ist mit NanoClaw abzustimmen. C hängt nicht
  daran.
- **`llm.*` heißt wie die LLM-Konfiguration der App**, bediente bisher aber nur die Notizen.
  Mit diesem Entwurf bekommt der Schlüssel einen zweiten Konsumenten. Ob er später eine
  Tabelle statt eines Einzelwerts trägt, entscheidet die B-Frage mit.
- **`nomic-embed-text` liegt installiert auf der Maschine**, während keels
  `EmbeddingProvider` nur als `NoopEmbeddingProvider` verdrahtet ist — die Vektorsuche ist
  praktisch reine Volltextsuche. Eigener Auftrag, hier nur notiert.
