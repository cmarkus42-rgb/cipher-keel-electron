# Modell-Registry, Läufer und Eignung — Entwurf

**Stand:** 2026-08-16
**Zuschnitt:** Datenschicht. Keine Oberfläche, kein Harness.
**Vorgänger:** `2026-08-14-modell-ebene-basiskonzept.md` (Begriffe und Schnitte)
**Autoritäten:** M8 `konzept_v1.0.md` §5, §6, §11 · M2 `konzept_v1.1.md` §5.3/§6.3 ·
M6-Nachtrag `nachtrag-nanoclaw-abloesung_2026-08-16.md`

---

## 1. Warum das gebaut wird

Jedes Niveau hat heute seinen eigenen, unverbundenen Weg zur Modellwahl:

| Niveau | Mechanismus heute | Ort | Form |
|---|---|---|---|
| A | Tier-Label → Handle | `agent.modelTiers` | drei Zeichenketten |
| B | **nichts** | — | — |
| C | Endpunkt je Rolle | `llm.tagging`, `llm.worker` | zwei lose Objekte |

Drei Mechanismen, drei Datenformen, kein gemeinsamer Begriff. Eine Settings-Seite, die „alle
möglichen Modelle für A, B und C" führen soll, kann darauf nicht aufsetzen — und das Harness,
das nach der Ratifikation vom 2026-08-16 vollständig in 0.1 liegt, bekäme sonst einen vierten
Weg dazu.

**Der zweite Anlass ist neu und kommt aus M8.** §5 verlangt eine **Fähigkeitstabelle** je
Modell — Codec, Werkzeugmodus, Kontextfenster, Vertrags-Strenge, `gemessen am`. Das ist eine
zweite Datenschicht über denselben Gegenständen. Entstehen beide getrennt, wissen zwei Stellen
dasselbe über ein Modell, und das ist genau der Fehler, den die Capability-Listen an fünf
Stellen bereits gemacht haben.

## 2. Was PR #18 schon gebaut hat — und warum es noch keine Registry ist

Der API-Anbieter-Schritt hat mehr hinterlassen als einen Transport:

- `worker/model-client.ts`: `RawEndpoint` (lose, aus der Config) → `normaliseEndpoint()` →
  `ModelEndpoint` als unterschiedene Union (`ollama` | `openai-compatible`),
  `clientForEndpoint()` als Transport-Wahl, `describeEndpoint()` log-sicher.
- `worker/api-keys.ts`: Ein Endpunkt nennt einen **`keyRef`**, nie einen Schlüssel; aufgelöst
  gegen Keychain, dann Umgebung, in dieser Reihenfolge und mit Begründung.

**Das ist die halbe Registry und die richtige Hälfte.** Was fehlt, ist der Schritt von *einem
Endpunkt je Rolle* zu *einer Liste von Einträgen, aus der Rollen auswählen*. Heute steht der
Endpunkt inline unter `llm.worker`; zwei Rollen auf dasselbe Modell zu zeigen heißt, ihn
zweimal zu schreiben. Erklärtext, Empfehlung, Örtlichkeit und Fähigkeiten haben keinen Ort.

**Konsequenz für den Bau:** Die Registry wird nicht neben `ModelEndpoint` gebaut, sondern
**darüber**. `ModelEndpoint` bleibt, was es ist — die Erreichbarkeit eines Eintrags. Der
Worker-Pfad ändert sich nicht in seinem Verhalten.

## 3. Entscheidungen

| Frage | Entscheidung | Herkunft |
|---|---|---|
| Eine Liste oder drei Listen je Niveau? | **Eine.** Derselbe Eintrag kann für mehrere Läufer taugen | Basiskonzept §3 |
| Registry und Fähigkeitstabelle getrennt? | **Nein — ein Eintrag, zwei Teile.** Gepflegt und gemessen, mit getrennten Schreibern | dieser Entwurf, §5 |
| Wo liegt sie? | Gebündelte Voreinstellungen im Code, Überschreibung in der Config | M8 §5, CK-NFR-012 |
| Geheimnisse? | **Nie im Eintrag.** Ein Eintrag nennt einen `keyRef` | gebaut, PR #18 |
| Eine Matrix oder zwei? | **Zwei.** Struktur sperrt, Modellstärke warnt | dieser Entwurf, §7 |
| Was sperrt, was warnt? | Struktur sperrt hart. Alles über Modellstärke **warnt nur** | Basiskonzept §5, Nutzer |
| Bestehende Config-Dateien? | Laufen unverändert weiter; die lose Form bleibt gültig | CK-NFR-013 |
| Kanarienauftrag jetzt? | **Nein.** Das Feld `quelle` und die Sichtbarkeit von *vermutet* jetzt, der Messläufer mit dem Harness | M8 §7 Zeile 12 |

## 4. Der Registry-Eintrag

```ts
export interface ModellEintrag {
  /** Stable key. Referenced by roles, tiers and the capability table alike. */
  id: string
  name: string
  /** How this model is reached at all — the hard structural property. */
  art: 'cli-harness' | 'local-http' | 'api'
  erreichbarkeit: Erreichbarkeit
  /** Where the prompt physically goes. Source of privacy and cost hints. */
  oertlichkeit: 'lokal' | 'eigenes-netz' | 'fremdes-netz'
  /** Curated prose. Never derived — the user wants to read *why*. */
  erklaertext: string
  empfehlung: string
  /** Absent for cli-harness: Claude Code owns its own protocol. See section 5. */
  faehigkeiten?: Faehigkeiten
}

export type Erreichbarkeit =
  | { art: 'cli-harness'; cli: string; handle: string }
  | { art: 'local-http'; host: string; port: number; model: string }
  | { art: 'api'; baseUrl: string; model: string; keyRef: string }
```

Die beiden unteren Varianten sind zeichengleich mit `OllamaEndpointSpec` und
`OpenAiCompatibleEndpointSpec` aus `model-client.ts`. **Sie werden nicht dupliziert**, sondern
von dort importiert; `Erreichbarkeit` ist deren Vereinigung plus der CLI-Fall, den der Worker
nie sieht.

`{ art: 'cli-harness', cli: 'claude', handle: 'opus' }` ist die Form, in der `agent.modelTiers`
aufgeht: Heute steht dort die nackte Zeichenkette `opus` ohne Aussage darüber, welches CLI sie
versteht. Mit einem zweiten CLI-Adapter wäre das mehrdeutig.

## 5. Die Fähigkeitstabelle — ein Eintrag, zwei Schreiber

M8 §5 nennt als erstes Feld den **Modellschlüssel**. Das ist genau die `id` aus §4 — die Tabelle
ist keine zweite Liste, sondern die zweite Hälfte desselben Eintrags.

```ts
export interface Faehigkeiten {
  codec: 'anthropic' | 'openai-chat' | 'ollama-native' | 'text'
  werkzeugmodus: 'nativ' | 'text'
  paralleleAufrufe: boolean
  denkbloecke: boolean
  bilder: boolean
  dokumente: boolean
  aufgeschobenesLaden: boolean
  werkzeugObergrenze: number
  nutzbaresKontextfenster: number
  /** Schema depth of the result block, and how many repairs are worth trying. */
  vertragsStrenge: { schemaTiefe: number; reparaturversuche: number }
  rundenbudget: number
  /** ISO date, or null when never measured. */
  gemessenAm: string | null
  /** What measured it — build id or canary run. Null when never measured. */
  gemessenMit: string | null
  quelle: 'gemessen' | 'vermutet' | 'herstellerangabe'
}
```

**Die beiden Teile des Eintrags haben verschiedene Lebensdauern, und das ist der Grund, sie
nicht zu vermischen:**

| Teil | Wer schreibt | Wann |
|---|---|---|
| `name`, `art`, `erreichbarkeit`, `oertlichkeit`, `erklaertext`, `empfehlung` | Mensch, über Config oder Settings-Seite | selten |
| `faehigkeiten` | Voreinstellung, später der Kanarienauftrag | bei jeder Messung |

**Kein Eintrag startet als `gemessen`.** Die gebündelten Voreinstellungen tragen
`quelle: 'vermutet'` oder `'herstellerangabe'` und `gemessenAm: null`. Wer die Tabelle liest,
sieht die Unsicherheit; wer sie anzeigt, muss sie sichtbar machen. **Das ist der Teil des
Kanarien-Mechanismus, der jetzt schon trägt** — ohne ihn wäre die Tabelle binnen eines Jahres
ein geglaubtes Dokument, und ein falscher Eintrag macht nichts rot, er macht die Ergebnisse
schlechter (M8 §5).

Der Messläufer selbst kommt mit dem Harness: Werkzeugmodus und parallele Aufrufe sind ohne
Werkzeugaufrufe nicht messbar. Was der C-Worker heute schon belegen könnte — Vertrags-Strenge —
wird hier bewusst nicht vorgezogen; ein halber Kanarienauftrag, der die Hälfte der Zeilen auf
`gemessen` setzt, wäre irreführender als gar keiner.

## 6. Läufer und Niveau — die Auflösung, die M8 verlangt

Im Repo ist „Niveau" zweimal unvereinbar definiert: in der Preset-Schicht als Fähigkeitsfilter,
in `worker/c-worker.ts` Zeile 4 als Laufzeit („The three niveaus are three runtimes"). **M8 §6
und Entscheidung E19 lösen das auf, und dieser Entwurf setzt es um:**

- **Niveau** ist ein Fähigkeitsfilter über einer Rolle. Es sagt **nichts** über das Modell.
- **Läufer** ist, *wie* gearbeitet wird. Drei davon:

| Läufer | Was | Session-Laufzeit? |
|---|---|---|
| `fremdes-cli` | Claude Code, später Codex/Gemini | ja — `claude-cli-tmux` |
| `eigene-schleife` | das Harness aus M8 | ja — **`keel-harness`**, der dritte Wert für `KNOWN_RUNTIMES` |
| `ein-schuss` | der C-Worker | **nein** — pro Auftrag, nicht pro Session |

Die Unterscheidung in der rechten Spalte ist der Grund, warum Läufer und `runtime` nicht
dasselbe Wort bekommen: C hat keine Session und steht deshalb nicht in `KNOWN_RUNTIMES`, ist
aber sehr wohl ein Läufer.

**Mitzuerledigen:** `nanoclaw-channel-route` fällt aus `KNOWN_RUNTIMES` (M6-Nachtrag Punkt 4),
und der Kommentar in `c-worker.ts` wird korrigiert statt fortgeschrieben (M8 §6 wörtlich).

## 7. Die zwei Matrizen

Das Basiskonzept führt **eine** Matrix, deren Zellen zwei verschiedene Dinge mischen: was
strukturell unmöglich ist, und was riskant ist. Für eine Oberfläche, die sperren *und* warnen
soll, ist das nicht implementierbar, ohne dass Regel und Anzeige auseinanderdriften. Deshalb
zwei.

### 7.1 Struktur — sperrt hart

| Läufer | `cli-harness` | `local-http` | `api` |
|---|---|---|---|
| `fremdes-cli` | ja | **nein** | **nein** |
| `eigene-schleife` | **nein** | ja | ja |
| `ein-schuss` | **nein** | ja | ja |

Beide Nein-Richtungen haben je einen Grund, und der zweite ist kein technischer:

- Ein CLI-Harness bringt sein Modell mit. Ein lokales Modell dort einzutragen ergibt keinen
  Sinn und wäre eine stille Falle.
- Ein Abo-CLI durch die eigene Schleife zu fahren hieße, ein Abo-OAuth-Token durch eine eigene
  API-Schleife zu schicken. **M8 §12 führt das als die eine Grenze, die nie gebrochen wird.**
  Diese Zelle ist eine Nutzungsbedingung, keine Fähigkeitsfrage, und wird deshalb auch dann
  nicht geöffnet, wenn es technisch ginge.

### 7.2 Niveau × Läufer — trägt der Läufer die Fähigkeitsstufe?

| Niveau | `fremdes-cli` | `eigene-schleife` | `ein-schuss` |
|---|---|---|---|
| A | ja | ja | nein |
| B | ja | ja | nein |
| C | ja | ja | ja |

Die Regel dahinter ist monoton und gehört als solche in den Code, nicht als abgeschriebene
Tabelle: **Ein Läufer trägt jedes Niveau bis zu seiner eigenen Fähigkeitsstufe.** `fremdes-cli`
und `eigene-schleife` stehen auf A, `ein-schuss` auf C.

Dass `eigene-schleife` auf A steht, ist Entscheidung **E21** und keine Prognose — mit der
Ratifikation „alles 0.1" gibt es keinen Zwischenstand, in dem das Harness nur B trüge.

Ein Niveau **unter** der Fähigkeit des Läufers ist erlaubt und nur verschwenderisch; das ist
ein Hinweis, keine Sperre (§7.3).

### 7.3 Warnungen — an der Zuordnung, nie am Eintrag

Derselbe lokale 7B ist auf C unbedenklich und auf B ein Risiko. Eine Warnung ist deshalb nie
Eigenschaft eines Eintrags, sondern der Paarung aus Eintrag, Läufer und Niveau.

**Ein Befund, der die Regel vorgibt:** Der Nutzer nannte als Warnfall „lokal und A oder B". Die
Örtlichkeit ist aber nicht der Prädiktor. Beim C-Vertrag scheiterte `moondream` (1B) zweimal,
während `gemma4:26b`, `qwen3-vl:30b` und `gpt-oss:120b` auf Anhieb sauber lieferten — **alle
vier lokal.** Eine Warnung an `oertlichkeit` wäre am 120B auf dem Spark genauso laut wie am 1B
und damit binnen einer Woche Rauschen, das man wegklickt.

Die Warnungen hängen deshalb an den **Fähigkeiten**, mit der Örtlichkeit als Nebenhinweis:

| Auslöser | Text sagt sinngemäß |
|---|---|
| Läufer `eigene-schleife` und `werkzeugmodus: 'text'` | Die Schleife läuft über das Text-Protokoll — die Stelle, an der schwache Modelle zuerst brechen |
| Niveau A oder B und `quelle !== 'gemessen'` | Für dieses Modell liegt keine eigene Messung vor; die Zeile ist vermutet |
| Niveau A oder B und `nutzbaresKontextfenster` unter der Schwelle des Rahmens | Der Startkontext dieser Rolle passt nicht |
| Niveau C und `oertlichkeit: 'fremdes-netz'` bei starkem Modell | Teure Ebene für mechanische Arbeit — das Gegenteil des Gefälles |
| Niveau unter der Fähigkeitsstufe des Läufers | Läuft, nutzt den Läufer aber nicht aus |
| `oertlichkeit: 'fremdes-netz'` | Der Prompt verlässt das eigene Netz |

**Keine dieser Zeilen sperrt.** Sperren tut ausschließlich §7.1.

### 7.4 Eine Korrektur am Basiskonzept

Basiskonzept §5 führt unter der Matrix den Punkt *„A mit lokalem Modell: nicht anbietbar"*.
Dieser Punkt stammt aus der Fassung **vor** der Nutzer-Korrektur vom 2026-08-16, die unmittelbar
darüber steht und A ausdrücklich von zwei Läufern bedienbar macht. Er ist damit überholt:

- A über `fremdes-cli` mit lokalem Modell: **gesperrt**, aus §7.1 — und zwar weil das CLI sein
  Modell mitbringt, nicht weil das Modell lokal ist.
- A über `eigene-schleife` mit lokalem Modell: **erlaubt, mit der stärksten Warnung.** Es ist
  genau der Fall, für den das Gefälle gebaut wird, und zugleich die Stelle mit dem höchsten
  Ausfallrisiko.

Die beiden anderen Punkte des Basiskonzepts — „B mit lokalem Modell warnt statt zu sperren" und
„C mit großem API-Modell ist erlaubt, aber erklärungsbedürftig" — bleiben unverändert gültig.

## 8. Wo die Registry liegt, und wie bestehende Dateien weiterlaufen

**Gebündelte Voreinstellungen im Code**, Überschreibung in `cipher-keel-config.json` — dieselbe
Form wie `agent.modelTiers` heute, und damit eine anpassbare Fläche im Sinne von CK-NFR-012.

Neuer Config-Schlüssel `modelle`, daneben die Zuordnungen:

```jsonc
{
  "modelle": {
    "eintraege": [ /* ModellEintrag[], überschreibt gleich-id-ige Voreinstellungen */ ],
    "zuordnung": {
      "tiers":  { "light": "<id>", "standard": "<id>", "heavy": "<id>" },
      "rollen": { "tagging": "<id>", "worker": "<id>" }
    }
  }
}
```

**Bestehende Dateien laufen unverändert.** `llm.tagging` und `llm.worker` behalten ihre lose
Endpunkt-Form; `agent.modelTiers` behält seine drei Zeichenketten. Die Auflösung bekommt eine
feste Reihenfolge:

1. Steht unter `modelle.zuordnung` eine Id, gilt der Registry-Eintrag.
2. Sonst gilt der Altwert — der lose Endpunkt beziehungsweise das nackte Handle.

Der Altwert wird dabei **nicht** stillschweigend in einen Eintrag umgeschrieben. Er wird als
namenloser Eintrag behandelt, dessen `faehigkeiten` fehlen — und wer keine Fähigkeiten hat,
löst nach §7.3 die Warnung „nicht gemessen" aus. Eine Migration, die Feldwerte rät, wäre genau
die Sorte stiller Umdeutung, die dieses Projekt vermeidet.

## 9. Was daraus liest

Die Datenschicht hat drei Konsumenten und schafft keinen vierten:

| Konsument | Heute | Danach |
|---|---|---|
| `session/model-resolver.ts` | Tier-Label → Zeichenkette aus `agent.modelTiers` | Tier-Label → Eintrag → `erreichbarkeit.handle` |
| `worker/model-client.ts` (`endpointForRole`) | Rolle → loser Endpunkt aus `llm.*` | Rolle → Eintrag → `erreichbarkeit` |
| das Harness (M8) | — | Rahmen → Eintrag → `erreichbarkeit` **und** `faehigkeiten` |

Die dritte Zeile ist der Grund, warum diese Spec vor dem Harness kommt: Ein Harness ohne
Fähigkeitstabelle muss je Anbieter raten, und M8 nennt genau das seine Stelle mit der höchsten
Alterungsrate.

**`model-resolver.ts` behält seine Rückfallregel:** Ein unauflösbarer Wert ergibt `undefined`,
und das heißt weiterhin „`--model` weglassen, das Harness entscheidet". Eine fehlende Registry
darf keine Session am Start hindern.

## 10. REQ-IDs

Neuer Bereich **`CK-MOD`** — Modell-Ebene. Er tritt nicht an die Stelle von `CK-S2`
(„Schenkel 2 / NanoClaw"), dessen Name der M6-Nachtrag als überholt vermerkt: Vergebene IDs
wandern nicht, `CK-S2-001` bis `CK-S2-015` bleiben, wo sie sind, und werden nicht neu belegt.

Vorgesehen: `CK-MOD-001` bis `CK-MOD-0xx` für Eintrag, Fähigkeiten, die beiden Matrizen, die
Auflösungsreihenfolge und die Warnregeln — die genaue Zuschneidung entsteht im Plan, nicht hier.

## 11. Test

| Ebene | Inhalt |
|---|---|
| Eintrag und Normalisierung | Alle drei `art`-Fälle; fehlende Pflichtfelder scheitern benannt, nach dem Muster von `normaliseEndpoint` |
| Struktur-Matrix | Alle neun Zellen, beide Sperrrichtungen mit ihrer je eigenen Begründung |
| Niveau × Läufer | Die monotone Regel gegen alle neun Paarungen, **nicht gegen eine abgeschriebene Tabelle** |
| Warnregeln | Je Auslöser ein Fall; und der Gegenbeleg: ein starkes lokales Modell auf B warnt **nicht** wegen seiner Örtlichkeit |
| Auflösungsreihenfolge | Registry gewinnt; ohne Zuordnung gilt der Altwert; ein Altwert trägt keine `faehigkeiten` |
| Rückwärtsverträglichkeit | Eine Config-Datei ohne `modelle` verhält sich zeichengleich zu heute |
| Wächtertest | Die Matrizen haben **eine** Quelle. Eine zweite Stelle, die dieselbe Regel kennt, ist ein Build-Fehler — dasselbe Muster, das die Capability-Deklaration bindet |

Kein Test geht ins Netz.

**Der Wächtertest der letzten Zeile ist der wichtigste.** Das Basiskonzept verlangt wörtlich,
die Matrix gehöre in den Code und nicht in die Oberfläche; ohne Wächter ist das eine Absicht,
die die erste Settings-Seite bricht.

## 12. Beleg in der laufenden App

Grüne Tests sagen in diesem Repo über eine Verdrahtung nichts aus — kein Test erreicht einen
`ipcMain`-Handler. Deshalb, über `.claude/skills/run-keel/`:

1. Eine Architect-Session startet weiterhin mit `--model opus` — aber der Wert kommt jetzt
   aus einem Registry-Eintrag. Zu belegen an der Kommandozeile der laufenden Session, nicht
   am Test.
2. Ein C-Auftrag gegen den bestehenden `llm.worker`-Endpunkt läuft **ohne Config-Änderung**
   unverändert durch. Das ist der Rückwärtsverträglichkeits-Beleg.
3. Derselbe C-Auftrag, nachdem `modelle.zuordnung.rollen.worker` auf einen Eintrag zeigt,
   erreicht dasselbe Modell.
4. Eine Zuordnung, die §7.1 verletzt, wird **abgelehnt und benennt die Zelle**; eine, die nur
   §7.3 auslöst, läuft und meldet die Warnung.

Punkt 4 wird **absichtlich erzwungen**, nicht abgewartet.

## 13. Nicht dabei

- **Keine Settings-Oberfläche.** Sie ist der nächste Schritt und liest diese Schicht ab.
- **Kein Harness.** Die `faehigkeiten` werden hier deklariert, nicht benutzt.
- **Kein Kanarienauftrag.** Nur `quelle` und die Sichtbarkeit von *vermutet*.
- **Keine Benchmark-Strecke.** Sie braucht den zurückgehaltenen Aufgabensatz aus M8 §11.
- **Kein Rückbau des NanoClaw-Bestands** über `KNOWN_RUNTIMES` und den `c-worker`-Kommentar
  hinaus. Der Rest gehört in den Harness-Plan, und der M6-Nachtrag Punkt 4 trennt dort reine
  Altlast von bloßer Umverdrahtung.
- **Keine Änderung am Rückgabe-Vertrag.** `vertragsStrenge` beschreibt ihn, sie verstellt ihn
  nicht.
- **Keine Auftrags-Schnittstelle für C.** Weiterhin offen, weiterhin IPC gegen MCP-Werkzeug.

## 14. Offene Punkte

- **Welche Einträge gebündelt ausgeliefert werden**, ist eine Pflegefrage, keine
  Architekturfrage. Der erste Satz sollte das abbilden, was auf dieser Maschine und auf dem
  Spark real erreichbar ist, plus je einen Anbieter-Vertreter — und keinen Eintrag, den
  niemand je erreicht hat.
- **Die Schwelle „nutzbares Kontextfenster gegen Startkontext des Rahmens"** (§7.3, dritte
  Zeile) setzt voraus, dass der Startkontext eines Rahmens bekannt ist. Für Niveau A ist er
  gemessen (~37 900 Token beim Architect), für die eigene Schleife noch nicht. Bis dahin
  greift die Regel nur, wo eine Zahl vorliegt.
- **`agent.modelTiers` trägt Aliase** (`opus`, `sonnet`, `haiku`), weil M2 konkrete Handles
  „fragil" nennt. Ein Registry-Eintrag ist konkreter als ein Alias. Ob die Voreinstellungen
  weiterhin Aliase führen oder gepinnte Ids, entscheidet der Plan — beides ist mit der Form
  aus §4 ausdrückbar.
