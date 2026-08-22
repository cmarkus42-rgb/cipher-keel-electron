# Übergabe: Qwen3.8 27B als Niveau-C-Modell mit Nachschlagen und Rechercheur

**Stand:** 2026-08-22 · **Zweig:** `qwen38-niveau-c`, 2633 Tests grün, typecheck und lint sauber,
Arbeitsbaum sauber · **Nicht integriert.**

Diese Datei ist der Einstieg. Lies sie ganz, bevor du etwas anfasst — sie nennt auch, was *nicht*
stimmt, und das ist der teurere Teil.

---

## 1. Worum es geht

Der Nutzer betreibt cipher keel, eine Electron-Anwendung mit eigener Agentenschleife (dem
Harness). Die Schleife steht seit 2026-08-18 in `main`: Prompt bauen, Antwort lesen, Werkzeuge
ausführen, Budgets prüfen, alles ins Ereignisprotokoll. Werkzeuge waren bis dahin nur lesend
(Datei, Verzeichnis, Inhaltssuche, Knowledge-Graph).

Diese Welle bringt **Qwen3.8 27B auf dem hauseigenen DGX Spark als Niveau-C-Modell** — die
billige lokale Ebene des Leistungsgefälles — und gibt ihm zwei Dinge, ohne die es laut Nutzer
nicht gut funktioniert: **Recherche** und **Skill-Unterstützung durch Werkzeuge**.

Die maßgeblichen Dokumente, in dieser Reihenfolge:

1. `docs/superpowers/specs/2026-08-21-qwen38-niveau-c-entwurf.md` — der Entwurf, mit zwei
   Nachträgen am Ende. **Der Nachtrag vom 2026-08-22 ist die gültige Zielfassung.**
2. `docs/superpowers/plans/2026-08-21-messungen-qwen38-spark.md` — was an der laufenden Maschine
   gemessen wurde, samt zwei Stellen, an denen die Messung den Entwurf widerlegt hat.
3. `docs/superpowers/specs/2026-08-18-harness-kern-design.md` — die Kern-Spec. §5.1 und §13 sind
   am 2026-08-22 nachgeführt worden, weil sie das hier Gebaute vorher ausgeschlossen hatten.

---

## 2. Das Ziel in einem Absatz

Zwei Netzwege mit verschiedener Vertrauensstufe.

**Nachschlagen** (`web_suchen`, `seite_lesen`) steht im Hauptlauf, aber nur gegen eine
Positivliste aus Herstellerdokumentation. Der Gewinn ist nicht Bequemlichkeit, sondern Kontext:
das Modell kann im selben Lauf eine Datei lesen und die zugehörige API nachschlagen.

**Recherchieren** (`recherchieren`) ist der gekapselte Unterlauf für alles außerhalb der Liste —
GitHub, Foren, Blogs, das offene Netz. Eigene Registry ohne Datei- und Graph-Werkzeuge, Rückgabe
nur als Text mit Quellenliste. Damit ist auf dem ausführenden Pfad ein Bein der Trifecta entfernt,
statt das Modell darum zu bitten.

Der Unterschied ist genau ein Feld: der Modus der `netzwache` (`'whitelist'` gegen `'offen'`).
Alle übrigen Regeln gelten in beiden.

---

## 3. Was steht, und was du glauben darfst

### Steht und ist an der echten Maschine gemessen

- **Ollama auf dem Spark ist 0.32.15** (war 0.32.5, das Modell verlangt ≥ 0.32.12). Der alte
  Container liegt als `ollama-alt-0325` geparkt und ist ein `docker start` weit weg.
- **`qwen3.8:27b` liegt dort**, dazu das abgeleitete `keel-qwen38:27b` mit Kontext und den drei
  Samplern, die Ollamas `/v1` nicht durchreicht.
- **M1** lädt und antwortet · **M4** `ollama create` reicht Renderer und Parser durch,
  `tool_calls` kommen strukturiert · **M2** `/v1` nimmt `tool`-Nachrichten in beiden Formen —
  die Codec-Entscheidung hält, `ollama-native` bleibt ungebaut · **M3** alle sieben Denkstufen
  werden angenommen · **M5** der Präfix-Cache greift für die Form, die die Schleife wirklich hat
  · **M8** siehe die Falle unten.
- **Der Netzweg ist end-to-end belegt.** Erster echter Lauf am 2026-08-22 gegen
  `spark-qwen38-27b` mit Tavily: `netz.ausgehend → api.tavily.com` steht im Protokoll, das Modell
  hat die richtige Antwort gefunden. Was der Lauf sonst noch zeigte, steht in 5c.
- **Das Settings-Fenster trägt den Netzzugang.** Reiter „Netz": Anbieterwahl, beide
  Schlüsselfelder, SearXNG-Endpunkt, Positivliste. Durch die laufende App belegt — Knopf geklickt,
  Inhalt gewechselt, Schreiben über das `<select>` in der Konfiguration angekommen.
- 2633 Tests, typecheck, lint.

### Steht im Code, ist aber **nicht** an einem echten Modell erprobt

- Der **Rechercheur**. Sein innerer Ablauf ist nie gegen ein echtes Modell mit einem echten
  Suchdienst gelaufen. Der Nutzer verlangt ausdrücklich, dass er „ausgetestet und optimiert" ist
  und „einen funktionierenden inneren Flow" hat. **Das ist die wichtigste offene Arbeit.**
  Prüfbar gemacht als **M12** im Nachtrag vom 2026-08-22, mit sechs konkreten Fragen.
- Die **Skill-Mechanik**. Ob ein 27B dem Satz „lies die Fähigkeit, bevor du sie benutzt"
  tatsächlich folgt, ist unbelegt — **M7**, laut Entwurf der wichtigste Messpunkt überhaupt,
  weil keels Niveau B schon heute auf derselben Annahme ruht.
- Der Rechercheur **im Besonderen**: der eine echte Netzlauf ging über `web_suchen`, den
  Nachschlage-Weg. `recherchieren` — der Unterlauf — ist weiterhin nie gelaufen.

---

## 4. Drei Fallen, die Zeit kosten, wenn du sie nicht kennst

**Ollama halbiert `num_ctx` pro Anfrage.** Gemessen: `num_ctx 65536` im Modelfile ergab **32.770**
nutzbare Token, und ein 185.000-Token-Prompt wurde **vorne still abgeschnitten** — das Modell
antwortete „verstanden", als wäre nichts gewesen. `ollama show` und `/api/ps` melden beide 65536;
das ist die Gesamtzuteilung über die parallelen Plätze, nicht das, was eine Anfrage bekommt. Das
Modelfile steht deshalb auf `131072`, damit `nutzbaresKontextfenster: 65536` in der Registry
stimmt. **Wer eine der beiden Zahlen ändert, muss die andere mitändern** — laufen sie auseinander,
feuert keels Kontextbudget nie und der Server kappt lautlos.

**Grüne Tests sagen in diesem Repo nichts über eine Verdrahtung.** Zweimal in dieser Welle war
etwas gebaut, getestet und von der App aus unerreichbar: einmal die ganze Netz-Hälfte (2617 Tests
grün, kein `fetch(` unter `src/main/harness/`), und das Repo hatte denselben Ausgang vorher schon
mit einem Grid-Fenster, das kein Knopf öffnen konnte. Der Wächter dagegen ist
`tests/harness/verdrahtung.test.ts` — er prüft gegen die **echte** Konstruktion
(`baueWerkzeugRegistry` in `harness-handlers.ts`), nicht gegen einen Nachbau. Ein Nachbau war
genau der Grund, warum `werkzeugliste.test.ts` grün blieb.

**Ein falscher Grund im Kommentar ist schlimmer als kein Kommentar.** Der Entwurf behauptete,
`'xhigh'` koste einen HTTP 400. Gemessen ist das falsch — der Server nimmt es an. Der wahre Grund,
es nicht zu senden, ist besser: 106 s für eine *kürzere* Antwort als `medium` in 37 s. Die Tabelle
steht jetzt bei `DENKSTUFEN` in `src/main/model/entry.ts`. Wenn du eine Behauptung im Code findest,
die du nicht nachmessen kannst, miss sie nach oder streiche sie.

---

## 5. Suchanbieter — erledigt

**Beide Schlüssel liegen im Schlüsselbund, beide auf bezahlten Plänen:** Tavily im
Researcher-Plan, Brave im Search-Plan. Der Nutzer dazu: *„die free-amounts sind nicht
ausreichend, sag ich dir."* Brave dient ihm zugleich für OpenClaw.

Eingerichtet ist **Tavily** (`netz.bevorzugt = "tavily"`), gesetzt über den neuen Reiter.

Was das an der Brave-Auflage ändert, und was nicht: die Search-Pläne führen ausdrücklich
AI-Inference-Rechte, das entspannt §3(b)(xiii) vermutlich. Die Speicherklausel §3(b)(i) ist davon
eine **eigene**, und ich habe die Vertragsfassung für den bezahlten Plan nicht gelesen. Wer Brave
produktiv fahren will, liest sie — nicht das Marketing.

Die Handgriffe stehen in Abschnitt 7.

---

## 5c. Was der erste echte Netzlauf gezeigt hat — die ersten M12-Befunde

Lauf `79ac98bc-…`, `spark-qwen38-27b`, Frage nach einer Node.js-API. 36 Ereignisse, sechs Runden,
`fertig / ziel-erreicht` mit der richtigen Antwort. Und zwei Befunde, die zeigen, wofür M12 da ist:

**Zwei von sechs Runden gingen an Anführungszeichen verloren.** Das Modell schickte zweimal
`"anzahl": "5"` — eine Zeichenkette, obwohl das Schema `number` sagt — und wurde zweimal benannt
abgewiesen. Erst im dritten Anlauf ließ es das Feld weg. **Behoben:** `klemmeAnzahl` nimmt jetzt
eine Zeichenkette, wenn sie eine Zahl ist, und die Ablehnung nennt den erhaltenen Wert. Das ist
kein Raten — `"5"` hat eine Lesart, `"viele"` fällt weiterhin durch. Ein 27B tippt JSON-Typen
regelmäßig falsch; streng zu bleiben hätte hier nichts gesichert und ein Drittel des
Rundenbudgets gekostet.

**Das Modell suchte zuerst im lokalen Projekt.** `verzeichnis_listen` und `inhalt_suchen` liefen,
bevor `web_suchen` drankam — bei einer Frage nach einer Node.js-API. Genau die Verwechslung
zwischen `inhalt_suchen` (Dateien) und `web_suchen` (Netz), die der Entwurf für diese
Größenklasse vorhergesagt hat (§6.4: bei Zweifelsfällen 21-facher Fehlgriff). **Nicht behoben** —
das gehört zu M12 und wird über die Beschreibungstexte gelöst, nicht über eine Umbenennung im
Vorbeigehen.

---

## 5b. Zwei Konstruktionsfehler, die vor M12 gehören

Beide sind beim Durchsprechen mit dem Nutzer aufgefallen, beide sind klein zu beheben, und beide
verfälschen M12, wenn man sie stehen lässt.

### Die Positivliste greift nur beim Holen, nicht beim Suchen

`web_suchen` fragt den Anbieter **ohne** Rücksicht auf den Modus. Die Positivliste wirkt erst in
`seite_lesen`, über `holeSicher` (`werkzeug-netz.ts:386`). Im Hauptlauf durchsucht das Modell also
das ganze Netz, bekommt Treffer von GitHub, Stack Overflow und Blogs — und darf keinen davon
öffnen.

Für ein 27B ist das der schlechteste Fall: es sieht etwas Passendes, greift danach, bekommt eine
benannte Ablehnung, und verbrennt Runden. „Nachschlagen" ist das nicht; es ist Suchen mit einer
Mauer dahinter.

**Was zu tun ist:** im Modus `'whitelist'` muss die *Anfrage* eingeschränkt werden, nicht erst der
Abruf — `site:`-Operatoren über die Positivliste, oder Filtern der Treffer vor der Ausgabe.
Ersteres ist besser: es holt bessere Treffer, statt gute wegzuwerfen. Beide Anbieter können
`site:`. Danach sieht das Modell nur, was es auch öffnen kann.

*Nebeneffekt, der die Anbieterfrage entschärft:* ist der Nachschlage-Weg site-beschränkt, hängt
seine Qualität kaum noch am Index. Die Anbieterwahl ist dann fast ausschließlich eine Frage des
**Rechercheurs** — was der Nutzer von sich aus so gesehen hat.

### Der Rechercheur erbt das Modell des Hauptlaufs

`rechercheur.ts:550` setzt `modellId: ktx.elternAuftrag.modellId`. Der Unterlauf fährt also immer
dasselbe Modell wie der Hauptlauf, und ist damit faktisch ans lokale Qwen gebunden, sobald der
Hauptlauf darauf läuft.

Das ist die falsche Kopplung. Der Unterlauf hat ein **eigenes Aufgabenprofil**: kurze Kette, viel
fremder Text, wenig Werkzeugvielfalt, und am Ende eine Zusammenfassung. Das kann ein anderes
Modell besser oder billiger als das, was gerade den Hauptlauf fährt — und der Nutzer will am Ende
ohnehin „für jede Verwendung und das Zusammenspiel verschiedene Modelle in allen Funktionen"
vermessen. Solange die Kopplung steht, ist genau dieser Vergleich nicht fahrbar.

**Was zu tun ist:** ein eigener Zuordnungsplatz (`slots.ts`) für den Rechercheur, mit Rückfall auf
das Modell des Hauptlaufs, wenn keiner gesetzt ist. Das ist dieselbe Mechanik wie bei
`rolle:tagging` und `rolle:worker` und braucht keine neue Idee — nur einen Platz, eine Zeile in
der Zuordnung und eine Zeile im Settings-Fenster.

**Reihenfolge:** die Modellwahl vor M12. Sonst misst M12 den inneren Ablauf eines Unterlaufs, der
auf einem Modell fährt, das er später nicht mehr fahren wird — und die Messung müsste wiederholt
werden.

---

## 6. Die Arbeit, die ansteht, in der Reihenfolge, in der sie zählt

1. **Die zwei Konstruktionsfehler aus 5b** — Positivliste in die Suchanfrage, eigener
   Zuordnungsplatz für das Modell des Rechercheurs. Beide vor M12, sonst misst M12 etwas, das
   danach anders ist.
2. **M12 — den inneren Ablauf des Rechercheurs austesten und nachstellen.** Zehn echte Fragen
   durch die App, Ereignisprotokoll lesen, die sechs Fragen aus dem Nachtrag beantworten.
   Ergebnis ist eine Quote und eine Liste dessen, was nachgestellt werden muss:
   Beschreibungstexte, Budgets, Denkstufe des Unterlaufs, Aufbau der Rückgabe. Bis dahin gilt der
   Rechercheur als gebaut, nicht als brauchbar.
3. **M7 — folgt ein 27B dem Nachlade-Satz?** Ein Auftrag, dessen Lösung nur in einer Fähigkeit
   steht, die im Präfix bloß mit Namen und Beschreibung erscheint. 20 Läufe, zwei Fähigkeiten,
   `skill.geladen` im Protokoll zählen gegen die Fälle, in denen das Modell stattdessen geraten
   hat.
4. ~~**Das Settings-Fenster** kennt die Netz-Felder nicht.~~ **Erledigt 2026-08-22:** Reiter
   „Netz" mit Anbieterwahl, beiden Schlüsselfeldern, SearXNG-Endpunkt und der Positivliste. Durch
   die laufende App belegt (Knopf geklickt, Inhalt gewechselt, Schreiben über das `<select>` in
   der Konfiguration angekommen).

   Alter Text: `netz.searxngEndpunkt`,
   `netz.bevorzugt` und `netz.zusaetzlichePositivliste` sind heute nur über die Konfigurationsdatei
   erreichbar. Das ist im Inventar so benannt, aber es ist eine offene CK-NFR-012-Lücke.
5. **M6 — SearXNG gegen Tavily gegen Brave**, an denselben 20 Fragen. Vorher ist die
   Anbieterwahl geraten.
6. **Integration** nach `main` über `superpowers:finishing-a-development-branch`.

Was ausdrücklich **nicht** ansteht: der `ollama-native`-Codec (M2 hat gezeigt, dass er nichts
kaufen würde), Vision und Dokumente über `/v1` (strukturell beschädigt bzw. Sackgasse), YaRN,
vLLM, ein Injektions-Klassifikator. Die Begründungen stehen in Entwurf §7.

---

## 7. Handgriffe

```bash
# Brave-Schluessel hinterlegen (Konto vorhanden), danach ausdruecklich waehlen:
security add-generic-password -s cipher-keel-api-brave -a key -w '<BRAVE_SUBSCRIPTION_TOKEN>'
#   und in der Konfigurationsdatei:  netz.bevorzugt = "brave"

# oder Tavily, ohne Auflage:
security add-generic-password -s cipher-keel-api-tavily -a key -w '<TAVILY_KEY>'

# Zugang zum Spark (NICHT der OpenClaw-Key):
ssh DGX                      # Alias mit nvsync.key, User crimak, Docker-Gruppe ohne sudo

# App treiben (Skill run-keel):
KEEL_KEEP_PROFILE=1 .claude/skills/run-keel/launch.sh /tmp/keel-harness
node .claude/skills/run-keel/driver.mjs settings-window "…"
.claude/skills/run-keel/stop.sh          # immer, sonst bleiben tmux-Sitzungen liegen

# Aufraeumen, wenn sich 0.32.15 bewaehrt hat:
ssh DGX 'docker rm ollama-alt-0325'
```

Die Registry-Zeile für das Modell ist `spark-qwen38-27b` in `src/main/model/defaults.ts`. Sie
trägt `quelle: 'vermutet'` und behält das, bis es einen Kanarienauftrag gibt — auch die von Hand
gemessenen Zahlen machen sie nicht zu `'gemessen'`. Das ist das Wort des Kanarienauftrags.

---

## 8. Wie hier gearbeitet wird

Falls du es nicht aus den Commits ohnehin abliest:

- **Falsifikation statt Bestätigung.** Wer eine Wache baut, erzwingt die Verletzung, sieht den
  Test rot und stellt zurück. Was dabei zu sehen war, steht im Commit. Diese Welle hat drei
  Fehler gefunden, die bei grüner Suite unsichtbar waren, und jeder war ein Test, der aus einem
  Nebengrund grün war.
- **Nichts still verschlucken.** Kein leeres `catch`, kein `?? []` über einem Fehler. Ein `catch`,
  der ein Rechteproblem wie „Verzeichnis gibt es nicht" behandelte, ließ in dieser Welle *alle*
  Fähigkeiten verschwinden, ohne dass irgendwo ein Pfad genannt wurde.
- **Kommentare erklären das Warum**, mit dem konkreten Fehlerfall dahinter.
- **CK-NFR-012:** eine neue einstellbare Fläche ohne Eintrag in `docs/anpassbare-flaechen.md` ist
  ein Prüfbefund. Das gilt auch für Flächen außerhalb der App — das `num_ctx` im Modelfile auf
  dem Spark steht dort, gerade weil es in der App nicht editierbar ist.
