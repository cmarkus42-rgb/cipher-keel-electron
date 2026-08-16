# Handover: Die Modell-Ebene, die Harness-Ideation, und was daraus zu bauen ist

**Stand:** 2026-08-16
**Für:** die nächste Session — insbesondere die, welche die Ergebnisse der Harness-Ideation
aufnimmt und in Bau überführt
**Kurzfassung:** Niveau A und C sind gebaut und gemessen, C erreicht jetzt auch API-Anbieter.
Niveau B ist leer und wird nicht mehr zugekauft, sondern selbst gebaut — dafür läuft eine
Ideation in Cowork. Dieses Dokument gibt den Kontext, den man braucht, um deren Ergebnis
einzuordnen, statt es nur umzusetzen.

> **Einstiegsdokument.** Es löst `2026-08-13-handover-niveau-c-und-stapel.md` ab. Jenes bleibt
> gültig für die Niveau-C-Strecke selbst und den DGX-Spark-Zugang.

---

## 1. Wozu das Ganze — ohne diesen Abschnitt wirkt alles wie Aufräumarbeit

cipher keel soll ein **Leistungsgefälle** bedienbar machen: starke Modelle oben, wo Fehler
sich vervielfachen — Ideation, Requirements, Systems Engineer, mit Abstrichen Architect —,
billige oder lokale Modelle unten, wo Arbeit mechanisch und in Menge anfällt, und beides
**unter Aufsicht statt unter Vertrauen**. M4 nennt das Leitmotiv wörtlich „lokal leistbar"
und stellt die keel-Ebene ausdrücklich *über* die ausführende: Sie führt und versorgt mit
Kontext, sie führt nicht selbst aus.

Die Niveaus A/B/C sind der **Mechanismus** dieses Gefälles, keine Sparvariante. Ein lokales
Modell hat kein Harness, das `@`-Referenzen auflöst, und kein Kontextfenster für 32
Capability-Dateien. B und C sind die Bedingung, unter der ein schwaches Modell überhaupt
beauftragbar wird.

**Das ist der Unterschied zum Vorgängerprojekt cipher-mux**, das eine Ebene kannte und
deshalb auch keinen Anlass für Niveaus hatte.

## 2. Das Denkmodell — und eine Kurzformel, die man kennen und misstrauen muss

In der Bau-Arbeit entstand die Formel **„drei Niveaus sind drei Laufzeiten"**:

| Niveau | Laufzeit heute | Zustand |
|---|---|---|
| A | Claude Code (fremdes CLI-Harness) | gebaut, in der laufenden App belegt |
| B | eigenes Agenten-Harness (zu bauen) | **leer** |
| C | keel selbst — ein Prompt hinein, eine geprüfte Antwort heraus | gebaut, gegen sieben Modelle gemessen |

Sie beschreibt den heutigen Bau treffend und **wird als Denkfigur schnell falsch.** Ein
Niveau sagt, *wie viel Harness-Fähigkeit eine Entität voraussetzen darf*; eine Laufzeit sagt,
*wer die Arbeit ausführt*. Das sind zwei Achsen.

Der Nutzer hat das am 2026-08-16 ausdrücklich klargestellt: Das eigene Harness soll **der eine
Entrypoint für API-Modelle** sein, quer über die Niveaus, und **API-Modelle sollen der
Normalfall werden**. Ein starkes API-Modell darin muss A-würdige Arbeit tragen. Damit ist
Niveau A keine Eigenschaft des CLI-Wegs mehr, sondern eine Fähigkeitsstufe, die zwei Läufer
bedienen können. Die Eignungsmatrix im Basiskonzept ist entsprechend korrigiert.

**Konsequenz, die noch niemand ausgearbeitet hat:** Die Presets deklarieren heute
`runtime: 'claude-cli-tmux'`. Wenn der CLI-Weg eine Option neben anderen wird, ist das eine
offene Frage — sie steht als Punkt 7 im Ideation-Seed.

## 3. Wo die Arbeit steht

| | |
|---|---|
| **`main`** | `be49c55` |
| **Offen** | **PR #18** `c-api-anbieter` — CI grün, wartet auf Merge |
| **Testsuite** | 1889 grün / 145 Dateien · Typecheck 0 · Lint 0 · Bündel 0 |
| **Diese Session** | 39 Commits, sechs PRs (#13–#18) |

### Gebaut und belegt

**Niveau A.** Das Niveau folgt dem Adapter (M2 §11.3), Modell-Tiers lösen über
`agent.modelTiers` auf, eine Architect-Session startet nachweislich mit `--model opus`.
**Gemessen:** Capabilities laden bedarfsgesteuert — eine referenzierte Datei von 4 KB auf
271 KB aufgeblasen ließ den Startkontext auf die Zahl genau gleich. Die erste `@`-Referenz
kostet rund 1292 Token, jede weitere 28. Die Zahl der Capabilities ist damit **kein
Token-Argument mehr**.

**Die fünfschichtige Assemblierung** ist vollständig: Body, Capabilities, Persona, globale
Regeln, graph-aufgelöster Phaseninput. Eine Prompt-Vorschau (Launcher → Preset → 👁) zeigt
das Ergebnis vor jedem Start und ist zeichengleich mit der ausgelieferten Datei — in der
laufenden App verglichen, nicht behauptet.

**Niveau C.** `src/main/worker/` — Rückgabe-Vertrag (rein), zwei Transporte, Worker mit genau
einem Reparaturversuch. Der Vertrag verlangt einen markierten Block ```` ```keel-ergebnis ````
mit JSON und vom Auftraggeber benannten Pflichtfeldern; fünf benennbare Brüche, und **die
Bruchmeldung ist zugleich die Reparaturanweisung**.

Gemessen gegen sieben Modelle: 30B, 26B, 24B, 12B und 120B liefern auf Anhieb sauber,
**moondream (1B) scheitert zweimal und meldet das sichtbar**. Über den API-Transport
7 Sekunden ohne Reparatur.

### Nicht belegt, und das gehört gewusst

- **Keine B-Session lief je.** Es gibt kein Harness.
- **Kein Auftraggeber für C.** Keine laufende Session kann einen C-Worker beauftragen — alle
  Messungen liefen über Wegwerf-Skripte. **Das ist die auffälligste Lücke im heutigen Bau.**
- **Kein mehrzeiliges Nutzlastfeld getestet.** Maskierte Zeilenumbrüche in JSON sind die
  bekannte Schwäche des Vertrags.
- **Keine Aussage über Arbeitsqualität** kleiner Modelle. Gemessen ist Formattreue.
- **Das Phase-8-Abnahmekriterium** — Erst-Start auf einem zweiten Apple-Silicon-Mac ohne
  Entwicklungsumgebung — steht seit Wochen offen und ist das Einzige zwischen dem Bau und
  einer Aussage über Auslieferbarkeit.

## 4. Die Ideation, deren Ergebnis aufzunehmen ist

Sie läuft in **Cowork**, Verzeichnis
`/Users/Shared/Nextcloud/Claude/cipher-keel-harness-ideation/`, angelegt nach dem
`ideation-template`. Der Seed ist vollständig gefüllt und trägt den Bau-Stand, die Hardware,
die getroffenen Entscheidungen und **sieben offene Fragen**.

**Sie ist die vierte keel-Ideation.** Drei liegen vor und sind **Autoritäten, keine
Vorschläge**: `-presets-ideation` (M2: Niveaus, Adapter, Assemblierung), `-entitaeten-ideation`
(M5: die elf Rollen), `-bauplan-ideation` (M6: der ratifizierte 0.1-Schnitt). M8
(Harness-Adapter) war die einzige Ideation ohne Deliverable — genau die Lücke.

### Wie ihr Ergebnis aufzunehmen ist

**Nicht einfach umsetzen.** Die Projektregel heißt **Konzept-Hoheit**: Weichen Konzept und
Bau voneinander ab, wird das *Konzept* präzisiert — als additiver Nachtrag im
Ideation-Verzeichnis, nicht im Repo. Muster:
`cipher-keel-presets-ideation/deliverables/nachtrag-niveau-anbindung_2026-08-11.md`.

Der Weg ist also: Deliverable lesen → gegen den Bau-Stand prüfen → Divergenzen als Nachtrag
festhalten → **dann** Spec unter `docs/superpowers/specs/` und Plan unter
`docs/superpowers/plans/` schreiben → nach `superpowers:writing-plans` bauen.

### Was der Seed schon festhält, damit es nicht neu erfunden wird

**B ist im Kern C plus Iteration plus Werkzeuge.** keel hat drei der vier Harness-Bestandteile
bereits: ein Werkzeugverzeichnis (Graph-MCP-Server, sieben Werkzeuge), eine Zustandshaltung
(Rolling Summary), und das Prüfen strukturierter Antworten (den C-Vertrag). Was fehlt, ist die
Schleife und der Werkzeug-Aufruf.

**Was ehrlich teuer bleibt:** Das Werkzeugaufruf-Protokoll unterscheidet sich je Anbieter und
ist die Stelle mit der meisten Wartungslast. Dazu Kontextverwaltung bei langen Läufen,
Fehlererholung, und — falls je gewünscht — Streaming.

**Der Qualitäts-Benchmark ist Claude Code**, aber als Maßstab, nicht als Nachbau-Ziel. Die
produktive Frage: An welchen Stellen ist ein Rückstand eine *Entscheidung* (etwa kein
Streaming in v1) und an welchen ein *Mangel* (etwa keine verlässliche Werkzeug-Rückmeldung)?

## 5. Die Reihenfolge, die das Basiskonzept vorschlägt

Aus `docs/superpowers/specs/2026-08-14-modell-ebene-basiskonzept.md` §8. Sie stellt B
bewusst **ans Ende**, obwohl B die auffälligste Lücke ist — die ersten drei Schritte sind
klein, und jeder macht den vierten billiger:

1. **Registry und Eignungsmatrix als Datenschicht.** Heute hat jedes Niveau seinen eigenen,
   unverbundenen Weg zur Modellwahl: Tier-Tabelle für A, nichts für B, Endpunkt für C. Eine
   Settings-Seite kann darauf nicht aufsetzen.
2. **C um API-Anbieter erweitern.** ✅ erledigt, PR #18.
3. **Settings-Seite**, sobald die Datenschicht steht — dann ist sie Anzeige, nicht Logik.
4. **Das Harness**, nach der Ideation.

**Was der Nutzer von der Settings-Seite erwartet**, wörtlich: alle möglichen Modelle für A, B
und C hinterlegen können, „alle mit allen Varianten", je mit **Erklärtext**, **Empfehlung**
und einer **Warnung** bei problematischen Kombinationen — genannt wurde „lokal und A oder B".

Die Warnung fällt aus der Eignungsmatrix automatisch an: A mit lokalem Modell ist gar nicht
anbietbar (das CLI bringt sein Modell mit), **B mit lokalem Modell warnt statt zu sperren** —
es ist genau der Fall, für den das Gefälle gebaut wird, und zugleich die Stelle, an der
schwache Modelle zuerst brechen. Der Beleg dafür liegt vor: moondream scheiterte am
C-Vertrag, wo 12B und 30B durchliefen. Werkzeugaufrufe sind eine höhere Hürde als ein
Ausgabeformat.

**Die Matrix gehört in den Code, nicht in die Oberfläche.** Sonst driften Regel und Anzeige
auseinander, wie es bei den Capability-Listen schon geschehen ist, die an fünf Stellen
dasselbe wussten.

## 6. Die Maschinen, und was sie gerade tun

| Maschine | Rolle | Zustand |
|---|---|---|
| Mac Mini M4 Pro | Arbeitsplatz, keel läuft hier, Ollama lokal | 64 GB, frei |
| **DGX Spark** `gx10-91a9` | Worker-Endpunkt für C | 128 GB Unified, aarch64 — **GPU seit 2026-08-16 durch den cipher-voice-Trainingslauf belegt (~28 h)** |
| MS-01 | Docker, n8n | TrueNAS SCALE |

**Zugang zum Spark:** `ssh DGX`. Der Alias benutzt `nvsync.key`, **nicht** den OpenClaw-Key —
die explizite Form mit `id_rsa_openclaw` wird abgewiesen. Kein passwortloses `sudo` dort.

Ollama läuft im Container, gebunden auf **die Tailscale-Adresse allein** (`100.78.7.108:11434`),
über LAN geschlossen — bewusste Sicherheit. Modelle: `gemma4:26b` (Default für `llm.worker`),
`mistral-small3.2:24b`, `qwen3-vl:30b-a3b`, `gpt-oss:120b`, `llama4:scout`.

**Offen dort:** `docker.service` hat keine Ordnung gegen `tailscaled.service`. Beim Kaltstart
findet der Container seine IP womöglich nicht, und ein Bindungsfehler ist ein *Start*-Fehler,
den die Restart-Politik schlecht auffängt. Der Drop-in braucht root; Befehl in
`docs/anpassbare-flaechen.md`.

**Nicht anfassen:** `~/cedric-build` und die vier vorhandenen Images. Für **aarch64** haben
viele Pakete kein Wheel — `cedric-train:latest` war teuer zu bauen.

**Und die Lehre vom 2026-08-16:** Während der Trainingslauf läuft, weicht Ollama auf **100 %
CPU** aus. Ein 24B auf 20 ARM-Kernen läuft dann ins Timeout — auch auf dem nativen Weg, der
Stunden zuvor 16 Sekunden brauchte. **Das ist kein Fehler, das ist Konkurrenz um dieselbe
Karte.** Wer längere GPU-Arbeit plant, stimmt sie ab. Und es ist zugleich das beste Argument
für die API-Anbieter: Wenn die eigene Maschine belegt ist, hält ein Anbieter Niveau C am
Leben.

## 7. Fallen

**Die alten, unverändert:** die native ABI-Falle (`npm run rebuild-native`, **nie** eine
Quelldatei ändern, Symptom rund 497 fallende Tests), der Bündel-Wächter
(`npm run verify:bundle`, Marker ASCII ohne Anführungszeichen), die geteilte
`rolling-summary` mit drei Konsumenten, und die Sprachregel: **Code und Kommentare englisch,
Prompt-Inhalte und alles unter `docs/superpowers/` deutsch.**

**Aus den letzten Sessions dazugekommen:**

- **npm-Majors sind nicht symmetrisch.** Ein Lockfile von npm 11 bricht `npm ci` unter
  npm 10, umgekehrt nicht. `.nvmrc` steht auf **24**, damit CI denselben Major fährt wie der
  Rechner. **Dieser Rechner läuft Node 25, also End-of-Life** — `brew install node@24` würde
  das schließen. CI war deshalb monatelang rot, ohne dass es jemandem auffiel.
- **Exit-Codes nie aus abgeschnittener Ausgabe schließen.** `npm run typecheck | tail -3`
  liefert den Code von `tail`. Richtig: `npm run typecheck >/dev/null 2>&1; echo $?`.
- **Das Scratchpad liegt außerhalb des Repos** — relative Importe greifen dort nicht, und
  `tsc` erfasst es nicht. Ein Probe-Skript kann deshalb still ein Feld setzen, das es gar
  nicht gibt. Genau so blieben einmal 83 von 128 GB auf dem Spark belegt.
- **Ein starkes Modell belegt keinen Fehlerpfad.** Der 30B formatierte auf Anhieb sauber und
  hätte den Reparaturweg nie gezeigt. Wer Fehlerverhalten belegen will, nimmt ein wirklich
  schwaches Modell.
- **Vor dem Committen den Zweig prüfen.** Acht Commits landeten einmal versehentlich auf
  lokalem `main`.
- **`keep_alive: -1` ist Absicht**, nicht Versehen: Ein kaltes Modell lässt die erste Anfrage
  die ganze Ladezeit bezahlen. Wer Modelle durchmisst, ohne sie zu behalten, setzt
  `keepAliveSeconds: 0` **und sieht danach in `ollama ps` nach**, statt es zu glauben.
- **`filterByNiveau` liegt in `capability-schema.ts`**, nicht in `capabilities.ts` — sonst
  schlösse sich ein Importzyklus.

## 8. Die Haltung, die in diesem Projekt gilt

Sie steht nicht in einer Datei, deshalb hier:

**Belege schlagen Behauptungen.** Kein Test dieses Repos erreicht einen `ipcMain`-Handler.
Eine grüne Suite sagt über eine Verdrahtung **nichts**. Wer behauptet, etwas funktioniere,
hat es in der laufenden App gezeigt — dafür gibt es `.claude/skills/run-keel/`. Jede
Bau-Strecke der letzten Wochen endete mit einem Messprotokoll im Plan, und mehrere davon
haben Fehler aufgedeckt, die alle Tests überlebt hatten.

**Stille Fehler sind die teuersten.** Der rote Faden durch die letzten Wochen: Niveau B
emittierte kommentarlos nichts; `parseTagResponse` macht aus Müll stillschweigend Tags; ein
Lockfile brach CI, ohne dass jemand hinsah; ein Probe-Skript verwarf ein Feld ohne Meldung.
Wo etwas schiefgehen kann, soll es **laut** schiefgehen.

**Anforderungen, die daraus wurden:** CK-NFR-012 — jede anpassbare Fläche ist auffindbar,
benannt und entweder editierbar oder ausdrücklich als „noch nicht" geführt. CK-NFR-013 —
**Auslieferungsmodalitäten zählen zum Ergebnis**; Maßstab ist, dass eine Claude-Code-Session
die vollständige Einrichtung durchführen kann. Beide in `docs/anpassbare-flaechen.md`, mit
der ehrlichen Liste dessen, was heute noch von Hand nötig ist.

**Diese Anforderung hat die NanoClaw-Entscheidung gekippt.** NanoClaw war als Träger für B
vorgesehen — bis auffiel, dass sein Installer laut eigenem README *nicht* aus einer
Claude-Session laufen darf. Ein eigenes Harness hat gar keine Fremdinstallation.

## 9. Die Liste, in Reihenfolge

1. **PR #18 mergen** (CI grün).
2. **Ideation-Ergebnis aufnehmen**, sobald es vorliegt — Konzept-Hoheit beachten, dann Spec
   und Plan.
3. **Registry und Eignungsmatrix** als Datenschicht.
4. **Settings-Seite** darauf.
5. **Das Harness** nach der Ideation.
6. **Ein Auftraggeber für C** — heute kann keine Session einen Worker beauftragen. Offene
   Entwurfsfrage: IPC-Kanal oder MCP-Werkzeug. Fürs Gefälle spricht das MCP-Werkzeug, weil
   dann eine Cyber-Factory-Session selbst Arbeit nach unten geben kann.
7. **Benchmark-Strecke** — ermöglicht, nicht gebaut. Modell ist Parameter pro Auftrag, der
   Läufer hat keinen verborgenen Zustand, `raw` bleibt erhalten. Der Nutzer will nicht an
   geschönten offiziellen Benchmarks hängen. **GPU-Nutzung abstimmen.**

**Billige Funde, die herumliegen:** `nomic-embed-text` ist auf dem Mac installiert, während
nur `NoopEmbeddingProvider` verdrahtet ist — die Vektorsuche ist praktisch reine
Volltextsuche, obwohl `search.ts` ein `embedding` entgegennimmt. Seit es den Client gibt, ist
das ein kleiner Auftrag. Dazu: ein über `project:create` angelegtes Projekt überlebt den
Neustart nicht (über den Wizard schon), und der Workshop-Test `niveauMinimum-sync` prüft eine
Ableitung gegen sich selbst.

## 10. Was zuerst zu lesen ist

1. Dieses Dokument
2. `docs/superpowers/specs/2026-08-14-modell-ebene-basiskonzept.md` — Registry, Läufer,
   Eignungsmatrix
3. `/Users/Shared/Nextcloud/Claude/cipher-keel-harness-ideation/00_seed.md` — der Kontext,
   den die Ideation bekommen hat, inklusive der sieben offenen Fragen
4. `docs/anpassbare-flaechen.md` — CK-NFR-012 und CK-NFR-013
5. `docs/superpowers/plans/2026-08-13-handover-niveau-c-und-stapel.md` — der Vorgänger, für
   die C-Strecke und den Spark
6. `src/main/worker/` — rund 400 Zeilen, das Muster für alles Weitere
7. M2 `cipher-keel-presets-ideation/deliverables/konzept_v1.1.md` Abschnitte 4–11 — bei Fragen
   zu Niveaus, Adaptern oder Assemblierung ist das die Autorität, nicht der Bau

> **Nicht lesen:** `HANDOFF.md` im Wurzelverzeichnis. Endet am 2026-06-05 bei Wave 4.
