# Die Modell-Ebene — Basiskonzept

**Stand:** 2026-08-14
**Art:** Basiskonzept **vor** der Ideation, absichtlich detailunabhängig. Es legt die
Begriffe und Schnitte fest, nicht die Ausführung.
**Anlass:** Nutzer-Entscheidungen vom 2026-08-13/14 — C bekommt neben Ollama API-Anbieter,
B bekommt ein **eigenes Harness** als Teil von keel, und am Ende steht eine Settings-Seite
für alle drei Niveaus.

---

## 1. Der Befund, der das Konzept nötig macht

Heute hat jedes Niveau seinen eigenen, unverbundenen Weg zur Modellwahl:

| Niveau | Mechanismus heute | Ort |
|---|---|---|
| A | Tier-Label → Handle | `agent.modelTiers` |
| B | **nichts** | — |
| C | Host, Port, Modell | `llm.worker` |

Drei Mechanismen, drei Datenformen, kein gemeinsamer Begriff. Eine Settings-Seite, die
„alle möglichen Modelle für A, B und C" führen soll, kann darauf nicht aufsetzen. **Die
Registry ist deshalb der Kern dieses Konzepts, nicht die Oberfläche.** Die Oberfläche ist
die Folge.

## 2. Der zentrale Schnitt: Modell und Läufer sind zwei Dinge

Die Verwechslung, die es zu vermeiden gilt: Ein Niveau ist **kein** Modell-Attribut. Ein
Modell weiß nicht, ob es agentisch benutzt wird.

- Ein **Modell-Eintrag** beschreibt, *was* antwortet und *wie man es erreicht*.
- Ein **Läufer** beschreibt, *wie* gearbeitet wird: fremdes CLI-Harness (A), eigene
  Agentenschleife (B), Ein-Schuss (C).

Dazwischen steht eine **Eignungsmatrix**. Sie ist die einzige Stelle, an der beide
Begriffe aufeinandertreffen — und sie ist zugleich die Quelle für Empfehlungen und
Warnungen auf der Settings-Seite.

## 3. Der Modell-Eintrag

Detailunabhängig, ohne Feldnamen festzuzurren:

- **Identität** — ein stabiler Schlüssel und ein Anzeigename
- **Anbieterart** — `cli-harness`, `local-http`, `api`
- **Erreichbarkeit** — je nach Anbieterart: ein CLI-Handle, ein Host/Port, oder eine
  Basis-URL plus Referenz auf ein Geheimnis. **Nie das Geheimnis selbst.**
- **Fähigkeiten** — beherrscht es Werkzeugaufrufe? Wie groß ist das Kontextfenster? Kommt
  es mit strengen Ausgabeformaten zurecht?
- **Örtlichkeit** — lokal, eigenes Netz, fremdes Netz. Das ist die Größe, aus der sich
  Datenschutz-Hinweise und Kostenklasse ableiten.
- **Erklärtext und Empfehlung** — gepflegter Fließtext, kein abgeleiteter Automatismus.
  Der Nutzer will lesen können, *warum* ein Eintrag wofür taugt.

**Wichtig:** Die Registry ist eine **Liste von Einträgen**, nicht drei Listen je Niveau.
Derselbe Eintrag kann für mehrere Läufer in Frage kommen.

## 4. Die drei Anbieterarten

| Art | Wer | Transport | Genutzt von |
|---|---|---|---|
| `cli-harness` | Claude Code, später Codex/Gemini | Prozessstart, Modell als Flag | **A** |
| `local-http` | Ollama und Kompatible | HTTP im eigenen Netz | **B**, **C** |
| `api` | Vendoren (Anthropic, OpenAI, Google, DeepSeek) und Hoster (OpenRouter, Together, Fireworks, Groq) | HTTPS mit Schlüssel | **B**, **C** |

Der heutige Bau kennt nur die erste und die zweite Art. Die dritte ist die Erweiterung aus
Nutzer-Entscheidung 1.

**Für C ändert sich dabei der Vertrag nicht.** Der Rückgabe-Vertrag — markierter Block,
Pflichtfelder, ein Reparaturversuch — ist transportunabhängig. Ausgetauscht wird allein,
was hinter dem Client-Interface steckt. Dessen Name (`OllamaClient`) wird dabei falsch und
sollte anbieterneutral werden; das ist die einzige Umbenennung, die diese Erweiterung
erzwingt.

## 5. Die Eignungsmatrix — Herz des Konzepts

|  | `cli-harness` | `local-http` | `api` |
|---|---|---|---|
| **A** (Voll-Fähigkeit) | ja | nein | **ja, sobald das eigene Harness trägt** |
| **B** (eigene Schleife) | nein | **mit Warnung** | ja |
| **C** (Ein-Schuss) | nein | ja | ja |

**Korrektur vom 2026-08-16, Nutzer-Vorgabe.** Eine frühere Fassung dieser Matrix sperrte A
für alles außer dem CLI-Harness. Das war zu eng gedacht: Das eigene Harness soll **der eine
Entrypoint für API-Modelle** sein und im Anspruch auch A-würdige Arbeit tragen — API-Modelle
sind der *Normalfall*, nicht der Sonderfall. Damit ist Niveau A keine Eigenschaft des
CLI-Wegs mehr, sondern eine Fähigkeitsstufe, die zwei Läufer bedienen können. Was das für
die `runtime`-Deklarationen der Presets bedeutet, ist Gegenstand der Harness-Ideation
(`/Users/Shared/Nextcloud/Claude/cipher-keel-harness-ideation/`).

Daraus folgen die Hinweise, die der Nutzer auf der Settings-Seite sehen will:

- **A mit lokalem Modell:** hängt am Läufer. Über den CLI-Weg **nicht anbietbar** — das
  CLI-Harness bringt sein Modell mit, und ein lokales Modell dort einzutragen wäre eine
  stille Falle. Über das eigene Harness **erlaubt, mit der stärksten Warnung**: Es ist
  genau der Fall, für den das Gefälle gebaut wird, und zugleich die Stelle mit dem
  höchsten Ausfallrisiko. *(Präzisiert am 2026-08-16, siehe
  `2026-08-16-modell-registry-design.md` §7.4 — die frühere Fassung stammte aus der Zeit
  vor der Korrektur direkt darüber.)*
- **B mit lokalem Modell: Warnung, keine Sperre.** Es *funktioniert* — und es ist genau der
  Fall, für den das Gefälle gebaut wird. Aber eine Agentenschleife mit Werkzeugen ist die
  Stelle, an der schwache Modelle zuerst zusammenbrechen: Sie verfehlen das
  Werkzeug-Format, laufen im Kreis, brechen nicht ab. Der Nutzer soll das wählen dürfen und
  vorher wissen, was ihn erwartet. **Der Beleg dafür liegt schon vor** — beim
  C-Rückgabe-Vertrag scheiterte `moondream` (1B) zweimal am Format, während 12B und 30B auf
  Anhieb sauber lieferten.
- **C mit großem API-Modell:** erlaubt, aber der Erklärtext soll sagen, dass man damit die
  teure Ebene für mechanische Arbeit einspannt — das Gegenteil des Gefälles.

**Die Matrix gehört in den Code, nicht in die Oberfläche.** Die Oberfläche liest sie ab.
Sonst driften Regel und Anzeige auseinander, wie es bei den Capability-Listen schon
geschehen ist, die an fünf Stellen dasselbe wussten.

## 6. Das eigene Harness für B

Die Entscheidung des Nutzers kehrt die NanoClaw-Begründung um: Statt ein fremdes Harness zu
übernehmen, wird eines gebaut — ausdrücklich auch als Lernprojekt.

**Das löst nebenbei einen echten Konflikt.** CK-NFR-013 verlangt, dass eine Claude-Code-Session
die vollständige Einrichtung durchführen kann; NanoClaws Installer verbietet genau das
ausdrücklich. Ein Harness im Bau von keel hat keine Fremdinstallation, keinen Docker-Zwang
und keine Kanal-Paarung. **Die Umkehr macht das ausgelieferte Gefälle also assistiert
einrichtbar, statt es an einer Fremdabhängigkeit zu brechen.** Das ist ein Argument *für*
die Entscheidung, das vorher nicht auf dem Tisch lag.

### Was ein Harness minimal ist

Vier Teile, keiner davon exotisch:

1. **Die Schleife** — Anfrage, Antwort, Werkzeugaufrufe ausführen, Ergebnisse zurückgeben,
   von vorn, bis ein Abbruchkriterium greift.
2. **Ein Werkzeugverzeichnis** — was der Agent aufrufen darf, mit Beschreibung und Schema.
3. **Zustand je Session** — der Verlauf, und was davon beim nächsten Schritt mitgeht.
4. **Grenzen** — maximale Runden, Zeit, Kosten. Ein Harness ohne Abbruchregel ist eine
   Endlosschleife mit Rechnung.

### Warum das weniger neu ist, als es klingt

keel hat drei der vier Teile bereits, an anderer Stelle:

- Das **Werkzeugverzeichnis** existiert als Graph-MCP-Server mit sieben Werkzeugen.
- Der **Zustand** hat sein Gegenstück in der Rolling Summary, die Sessions ohnehin führen.
- Das **Antwort-Parsen** ist der C-Rückgabe-Vertrag: markierter Block, Pflichtfelder,
  benannter Bruch, ein Reparaturversuch.

**B ist damit im Kern: C plus Iteration plus Werkzeuge.** Das ist die Formel, an der sich
der Bau ausrichten sollte — nicht „ein Agenten-Framework schreiben", sondern die
vorhandene Ein-Schuss-Strecke um eine Schleife und einen Werkzeug-Aufruf erweitern.

### Was ehrlich teuer bleibt

Damit die Entscheidung informiert bleibt, gehören die Kosten benannt: Das
**Werkzeugaufruf-Protokoll unterscheidet sich je Anbieter** und ist die Stelle mit der
meisten Wartungslast. Dazu kommen Kontextverwaltung bei langen Läufen, Fehlererholung bei
abgebrochenen Antworten, und — falls je gewünscht — Streaming. Nichts davon ist unlösbar,
aber es ist der Teil, der nie „fertig" ist.

## 7. Die Settings-Seite als Folge, nicht als Ausgangspunkt

Was der Nutzer will — alle Modelle für alle Niveaus, mit Erklärtext, Empfehlung und
Warnung — ergibt sich aus §3 und §5 fast von selbst:

- eine Liste der Einträge, gruppiert nach Anbieterart
- je Eintrag: Erklärtext, Empfehlung, Örtlichkeit
- je Niveau eine Zuordnung, deren Auswahl die Eignungsmatrix filtert
- Warnungen **an der Zuordnung**, nicht am Eintrag: Derselbe lokale 7B ist auf C
  unbedenklich und auf B ein Risiko

Damit löst die Seite zugleich einen Teil von CK-NFR-012 ein: `agent.modelTiers` und
`llm.*` sind heute nur durch Editieren einer Datei außerhalb der App erreichbar.

## 8. Reihenfolge, die auf jedem Schritt etwas Brauchbares hinterlässt

1. **Registry und Matrix** als Datenschicht, ohne Oberfläche. Die drei bestehenden
   Mechanismen lesen daraus, statt eigene Formen zu führen.
2. **C um `api` erweitern.** Kleinster echter Zugewinn: derselbe Vertrag, neuer Transport,
   und die Vendoren stehen bereit.
3. **Settings-Seite**, sobald die Datenschicht steht — sie ist dann Anzeige, nicht Logik.
4. **B-Harness**, nach eigener Ideation. Zuletzt, weil es das größte Stück ist und von
   Registry und Vertrag profitiert, statt sie zu erzwingen.

Die Reihenfolge ist bewusst nicht „B zuerst", obwohl B die auffälligste Lücke ist: Die
ersten drei Schritte sind klein, und jeder macht den vierten billiger.

## 9. Was dieses Konzept ausdrücklich offen lässt

Es ist detailunabhängig. **Nicht** entschieden sind: Feldnamen und Speicherformat der
Registry, das Werkzeug-Protokoll je Anbieter, Abbruch- und Budgetregeln der Schleife, ob B
Streaming braucht, und wie weit das eigene Harness hinter Claude Code zurückbleiben darf,
ohne unbrauchbar zu werden. **Diese Fragen gehören in die Ideation zu Punkt 4**, nicht
hierher.

(Die Frage, wo Geheimnisse liegen, ist seit `src/main/worker/api-keys.ts` beantwortet:
Schluesselbund zuerst, Umgebungsvariable zweitens. Siehe
`2026-08-17-settings-fenster-design.md` §5.3.)
