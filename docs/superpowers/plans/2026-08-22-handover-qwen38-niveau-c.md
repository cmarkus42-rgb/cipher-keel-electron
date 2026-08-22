# Übergabe: Qwen3.8 27B als Niveau-C-Modell mit Nachschlagen und Rechercheur

**Stand:** 2026-08-22, zweite Fassung · **Zweig:** `qwen38-niveau-c`, 2671 Tests grün, typecheck
und lint sauber, Arbeitsbaum sauber · **Nicht integriert.**

> **Was sich seit der ersten Fassung geändert hat:** die zwei Konstruktionsfehler aus 5b sind
> behoben und an der laufenden App belegt, und **M12 ist gefahren** — zweimal zehn echte
> Recherchen, vier Behebungen dazwischen, Messprotokoll in
> `docs/superpowers/plans/2026-08-22-m12-rechercheur.md`. Der Rechercheur ist damit von
> „gebaut, nicht brauchbar" auf „brauchbar, mit einem benannten offenen Defekt" gerückt. Der
> Defekt aus Abschnitt 5d ist geklärt **und behoben**: er lag nicht in keel, sondern in einem
> Netzfilter dieser Maschine. Nach der Regel liest der Rechercheur 17 von 25 ausgewählten Seiten
> statt 11 von 27 — mit Folgen für jede weitere Messung hier.

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

- **Ollama auf dem Spark ist 0.32.15** (war 0.32.5, das Modell verlangt ≥ 0.32.12). Der
  Rückfall-Container `ollama-alt-0325` ist am 2026-08-22 gelöscht, nachdem die neue Version einen
  vollen Arbeitstag getragen hat. Das alte Image ist ebenfalls nicht mehr da — ein Rückfall wäre
  jetzt ein erneuter Download, kein `docker start`. Was zählt, liegt ohnehin nicht im Container:
  die Modelle stehen auf dem Bind-Mount `/home/crimak/ollama` (190 GB) und überleben jeden
  Container-Neubau.
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

- Die **Skill-Mechanik**. Ob ein 27B dem Satz „lies die Fähigkeit, bevor du sie benutzt"
  tatsächlich folgt, ist unbelegt — **M7**, laut Entwurf der wichtigste Messpunkt überhaupt,
  weil keels Niveau B schon heute auf derselben Annahme ruht. **Ein Teilbefund liegt jetzt vor:**
  für *Werkzeugschemata* folgt das Modell dem gleichlautenden Satz in 8 von 10 Läufen, und zwar
  auf eigene Kosten (zwei von vier Runden). Für Fähigkeiten fehlt der Beleg weiter —
  `faehigkeit_lesen` wurde in zwanzig gemessenen Unterläufen kein einziges Mal gerufen, weil im
  Messprojekt keine Fähigkeit hinterlegt war. Wer M7 fährt, muss zuerst eine hinterlegen.

### Erprobt, seit dieser Fassung

- **Der Rechercheur.** Zweimal zehn echte Fragen durch die laufende App, gegen
  `keel-qwen38:27b` mit Tavily, Ereignisprotokoll je Lauf ausgewertet. Vorher: 3 von 33
  versuchten Seitenabrufen gelesen, 7 von 10 Recherchen ohne eine einzige Quelle. Nachher:
  11 von 35 und 4 von 10. Vier Behebungen dazwischen, ein offener Defekt (5d). Sechs Fragen des
  Entwurf-Nachtrags beantwortet — das Protokoll steht in
  `docs/superpowers/plans/2026-08-22-m12-rechercheur.md`.
- **Der eigene Zuordnungsplatz des Rechercheurs.** Hauptlauf auf `spark-qwen38-27b`, Unterlauf
  auf einem anderen Eintrag, belegt am `run.started` des Unterlaufs.

---

## 4. Vier Fallen, die Zeit kosten, wenn du sie nicht kennst

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

**Der CDP-Treiber von `run-keel` kappt eine Antwort bei rund 65 KB.** Wer ein
Ereignisprotokoll am Stück zurückliest, bekommt bei einem langen Lauf abgeschnittenes JSON und
einen `SyntaxError` — nicht in der App, im Messwerkzeug. Zwei von zehn Wiederholungsläufen fielen
so aus und mussten mit einer kompakten Projektion im Fenster (zählen statt zurückgeben) einzeln
nachgeholt werden. Die Richtung ist bemerkenswert: es trat erst **nach** den Behebungen auf, weil
die Protokolle vorher kleiner waren — es wurde ja kaum eine Seite gelesen.

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

## 5b. Zwei Konstruktionsfehler, die vor M12 gehörten — **beide erledigt**

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

**Erledigt 2026-08-22** (`5d85f94`, `910e5e7`), beide an der laufenden App belegt:

*Die Positivliste* wirkt jetzt an drei Stellen statt an einer. In der **Anfrage** — Tavily über
sein eigenes Feld `include_domains`, SearXNG und Brave über eine `site:`-Kette; deshalb nimmt
`SuchAnbieter.suche` eine Hostliste und keinen fertigen Anfragetext. Im **Filter** über den
Treffern, denn was ein Anbieter aus `site:` macht, steht in seiner Hand; verworfen wird nie still
(Zahl und der Name `recherchieren` stehen in der Antwort, und „alle verworfen" sagt etwas anderes
als „Keine Treffer."). Und wie bisher beim Abruf. Gemessen an einem echten Lauf: 21 Treffer aus
drei Suchen, **alle** auf `docs.ollama.com`, null verworfen.

*Der Zuordnungsplatz* heißt `rolle:rechercheur`, steht als sechster Slot im Reiter „Modelle",
sperrt cli-harness-Einträge und fällt bei leerem Platz auf das Modell des Hauptlaufs zurück —
**nicht** auf einen `llm.*`-Endpunkt, den es für diese Rolle nicht gibt. `laeufer:
'eigene-schleife'` und `niveau: B`; auf C hätte `unter-faehigkeit` bei jeder Zuordnung gefeuert,
und das wäre hier unwahr.

## 5d. Der hängende Abruf — **geklärt**, und es war nicht keel

Die Hälfte aller Seitenabrufe des Rechercheurs lief ins Zeitbudget, immer im Abschnitt `Abruf`,
immer beim ersten Sprung. Die Ursache steht im Messbericht mit allen Ausschlussmessungen; hier die
Kurzfassung:

**Ein Netzfilter, der pro Anwendung und Ziel entscheidet** — Little Snitch, auf dieser Maschine
aktiv — hält den **ersten** Kontakt der Electron-Binärdatei zu jedem neuen Host, bis eine Regel
existiert. In einem unbeaufsichtigten Lauf beantwortet niemand seinen Dialog. Der Socket steht
dann in „connecting", ohne `connect` und ohne `error`, bis keels Wecker kommt.

Der Beleg, ohne root und ohne Vermutung: über alle Läufe hinweg hingen **6 von 18 Erstkontakten**
zu einem Host und **0 von 10 Folgekontakten**. `cheatsheetseries.owasp.org` scheiterte beim ersten
Mal und antwortete danach in 30 und 22 ms; `api.tavily.com` und `github.com`, in jedem Lauf
kontaktiert, hingen kein einziges Mal.

*Und die Falle, in die ich zuerst gelaufen bin: mein Vergleichsprozess war ein Shell-`node`. Für
einen Filter, der nach Programm entscheidet, ist das ein anderes Programm. „Derselbe Code ist unter
Node schnell" verglich nie dieselbe Strecke.*

**Was keel dagegen geändert hat** (nicht die Ursache, aber der Schaden): der Abruf hatte kein
eigenes Zeitbudget, ein gehaltener Erstkontakt verbrauchte still die vollen 20 Sekunden der ganzen
Kette. Jetzt bekommt jeder Verbindungsversuch ein Drittel davon, und die Absage nennt Host und
Versuchszahl. Gemessen: Abbruch nach 7,7 s statt nach 20 s.

**Die Regel ist gesetzt, und die Gegenprobe ist gefahren** (2026-08-22, dieselben zehn Fragen ein
drittes Mal):

| | Runde 2 (ohne Regel) | Runde 3 (mit Regel) |
|---|---|---|
| Verbindungsfehler | 15 von 27 | **1 von 25** |
| Seiten gelesen | 11 | **17** |
| Läufe ohne eine Seite | 4 von 10 | **1 von 10** |
| Erstkontakte gescheitert | 6 von 18 | **1 von 14** |

Der Unterschied zwischen Erst- und Folgekontakt ist verschwunden. Damit ist die Diagnose belegt und
nicht bloß plausibel. Was jetzt noch verloren geht, ist Inhalt statt Netz: 4 Seiten waren für
Readability nicht extrahierbar, 3 kamen als HTTP 403 (Reddit, Stack Exchange) zurück — beides
ehrlich benannt und beides erst sichtbar, seit der Filter weg ist.

**Was jede weitere Messung auf dieser Maschine wissen muss:** ohne die Regel messen die ersten
Läufe gegen frische Hosts den Filter mit. Wer M6 oder M7 fährt, prüft zuerst, ob sie noch steht —
sie hängt an `node_modules/electron/dist/Electron.app`, und ein `npm ci` kann sie ungültig machen.
Und ein Shell-`node` ist **kein** gültiger Vergleich zur laufenden App: für einen Filter, der nach
Programm entscheidet, ist das ein anderes Programm.

## 5e. Zwei Befunde aus Runde 4 — beide unbehoben, beide benannt

**Der Spark rechnete auf der CPU — Ursache gefunden, Behebung offen.**

Der Container hat seine **cgroup-Geräterechte** verloren. Er ist mit `--gpus all` gestartet
(`DeviceRequests` steht in `docker inspect`), die Geräteknoten `/dev/nvidia0`, `nvidiactl` und
`nvidia-uvm` sind im Container weiterhin sichtbar — aber `nvidia-smi` dort meldet
`Failed to initialize NVML: Unknown Error`, und im Ollama-Log steht:

```
12:32:10  msg="gpu memory" id=0 library=CUDA available="115.0 GiB"    <- Scheduler sieht die GPU
          ggml_cuda_init: failed to initialize CUDA: no CUDA-capable device is detected
          system_info: n_threads = 20 ... CPU : NEON = 1 ...          <- llama-server auf CPU
```

**Auslöser:** `systemctl daemon-reload` schreibt die cgroup des Containers neu und verwirft dabei
die Geräte-Freigabe, die das nvidia-container-toolkit beim Start injiziert hat. Der bereits
laufende Ollama-Prozess behält seine Handles — deshalb meldet der Scheduler weiter CUDA —, jeder
**neu gestartete** `llama-server` bekommt keine mehr. Im Journal: **8 Reloads in 30 Stunden**, der
letzte ausgelöst von `snapd.service`. **Das kommt wieder.**

**Sofort:** `ssh DGX docker restart ollama` — stellt die Rechte her, das Modell lädt in ~10 s neu.
Die anderen fünf Modelle liegen auf dem Bind-Mount und sind nicht betroffen.

**Dauerhaft** (braucht `sudo`, das es dort nicht passwortlos gibt): `"exec-opts":
["native.cgroupdriver=cgroupfs"]` in `/etc/docker/daemon.json` — die Datei existiert dort nicht —,
oder auf CDI umstellen (`nvidia-ctk cdi generate`, danach `--device nvidia.com/gpu=all`) statt der
alten cgroup-Injektion.

**Behoben am 2026-08-22, und zwar an der Ursache:** der Container ist mit ausdrücklichen
`--device`-Flags neu angelegt. Damit stehen die Geräte in Dockers `HostConfig.Devices`, runc
übersetzt sie in `DeviceAllow=`-Eigenschaften der systemd-Unit — und genau die wendet ein
`daemon-reload` **wieder an**, statt sie zu verwerfen. Nachweis ohne `sudo`:
`systemctl show docker-<id>.scope -p DeviceAllow` zeigt sie beim neuen Container und war beim
alten leer. Gemessen: 1,68 s statt 53 s, `offloaded 66/66 layers to GPU`. Einzelheiten und der
Startbefehl stehen in `docs/anpassbare-flaechen.md`.

**Offen ist die Probe im Ernstfall.** Seit dem Umbau hat kein Reload stattgefunden. Sie braucht
kein `sudo`, weil `snapd` den Auslöser von selbst liefert — **erster Handgriff der nächsten
Sitzung:**

```bash
ssh DGX 'START=$(docker inspect ollama --format "{{.State.StartedAt}}");
  echo "Reloads seit Umbau: $(journalctl --since "$(date -d "$START" "+%F %T")" | grep -ci "Reloading requested")";
  docker exec ollama nvidia-smi -L'
```

Zahl > 0 **und** GPU wird gezeigt → belegt, und `ollama-vor-device` kann gelöscht werden. GPU fehlt
→ die Erklärung trägt nicht, Untersuchung wieder auf.

**Und weiterhin vor jeder Zeitmessung:**

```bash
curl -s http://100.78.7.108:11434/api/ps                 # welches Modell, welcher Kontext
ssh DGX docker exec ollama nvidia-smi -L                 # sieht der *Container* die GPU?
ssh DGX 'docker logs --tail 50 ollama | grep -i cuda'    # oder faellt llama-server auf CPU?
```

`nvidia-smi` **auf dem Host** genügt nicht — der Host sieht die GPU die ganze Zeit. Gefragt ist der
Container. Eine Zahl von einer CPU-Ausführung ist keine Zahl über keel; Runde 4 ist deshalb
verworfen und nicht hineingerechnet.

**`WORKER_TIMEOUT_MS = 120_000` ist für den falschen Verbraucher bemessen.** Die Konstante in
`src/main/worker/ollama-client.ts` stammt vom Ein-Schuss-Worker, der eine kleine Anfrage schickt.
keels eigene Schleife gegen ein 27B ist ein anderes Profil: wachsende Historie, geteilte GPU,
Denkstufe `medium`. Auf der gesunden Maschine fiel die Grenze nie auf; auf der CPU reißt sie jeden
Zug, und der Unterlauf endet `transportfehler`. Derselbe Fehlerkreis wie bei `aufgeschobenesLaden`
und `klemmeMaxZeichen`: eine Zahl, die für einen Verbraucher richtig war, gilt für den zweiten
nicht. **Nicht geändert** — auf einer viermal zu langsamen Maschine lässt sich die richtige Zahl
nicht bestimmen.

## 6. Die Arbeit, die ansteht, in der Reihenfolge, in der sie zählt

1. ~~**Die zwei Konstruktionsfehler aus 5b.**~~ **Erledigt 2026-08-22**, siehe dort.
2. ~~**M12 — den inneren Ablauf des Rechercheurs austesten und nachstellen.**~~ **Gefahren
   2026-08-22**, zweimal zehn Fragen, vier Behebungen, Protokoll in
   `docs/superpowers/plans/2026-08-22-m12-rechercheur.md`. Die sechs Fragen des Nachtrags sind
   beantwortet.
3. ~~**Der hängende Abruf (5d).**~~ **Geklärt und behoben** — ein Netzfilter dieser Maschine, kein
   Defekt in keel. Regel gesetzt, Gegenprobe gefahren: Verbindungsfehler von 15 auf 1, gelesene
   Seiten von 11 auf 17. Die nächsten Verluste sind Inhalt, nicht Netz (Readability, HTTP 403).
4. **Die Feldprobe der Budgets nachholen — der erste Handgriff.** Runden und Uhr gehören seit
   Runde 4 zur Tiefe (`gruendlich`: 8 statt 4 Runden), weil Runde 3 einen Widerspruch zeigte:
   `gruendlich` sagt drei Suchen und fünf Seiten zu, hatte aber dieselben vier Runden wie `kurz` —
   und schöpfte gemessen sein Suchbudget aus, sein Seitenbudget nicht. Die Änderung ist
   gegenprobiert und von einem Wächtertest gehalten, **aber nicht im Feld bestätigt**: beim
   Nachmessen lief der Spark auf der CPU (siehe 5e). Also zuerst die Maschine prüfen, dann
   dieselben zehn Fragen ein viertes Mal.

5. **Zwei Befunde aus Runde 4, beide unbehoben und beide benannt** — siehe 5e.
6. **M7 — folgt ein 27B dem Nachlade-Satz?** Ein Auftrag, dessen Lösung nur in einer Fähigkeit
   steht, die im Präfix bloß mit Namen und Beschreibung erscheint. 20 Läufe, zwei Fähigkeiten,
   `skill.geladen` im Protokoll zählen gegen die Fälle, in denen das Modell stattdessen geraten
   hat. **Vorher eine Fähigkeit im Messprojekt hinterlegen** — in den zwanzig M12-Läufen wurde
   `faehigkeit_lesen` kein einziges Mal gerufen, weil es nichts zu lesen gab.
4. ~~**Das Settings-Fenster** kennt die Netz-Felder nicht.~~ **Erledigt 2026-08-22:** Reiter
   „Netz" mit Anbieterwahl, beiden Schlüsselfeldern, SearXNG-Endpunkt und der Positivliste. Durch
   die laufende App belegt (Knopf geklickt, Inhalt gewechselt, Schreiben über das `<select>` in
   der Konfiguration angekommen).

   Alter Text: `netz.searxngEndpunkt`,
   `netz.bevorzugt` und `netz.zusaetzlichePositivliste` sind heute nur über die Konfigurationsdatei
   erreichbar. Das ist im Inventar so benannt, aber es ist eine offene CK-NFR-012-Lücke.
7. **M6 — SearXNG gegen Tavily gegen Brave**, an denselben 20 Fragen. Vorher ist die
   Anbieterwahl geraten. *Nebenbefund aus M12: die Trefferqualität von Tavily war in keinem der
   zwanzig Läufe das Problem — die Trefferlisten waren durchweg einschlägig.*
8. **Integration** nach `main` über `superpowers:finishing-a-development-branch`.

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

# Einen Harness-Lauf von aussen starten und auslesen (so lief M12):
node .claude/skills/run-keel/driver.mjs project-window \
  "window.cipherKeel.invoke('harness:lauf-starten', {auftragstext:'…', modellId:'spark-qwen38-27b', wurzel:'/tmp/x'})"
node .claude/skills/run-keel/driver.mjs project-window \
  "window.cipherKeel.invoke('harness:lauf-lesen','<laufId>').then(r => r.wert.length)"
#   Der Unterlauf haengt am Ereignis `unterlauf.verbraucht` des Hauptlaufs (Feld `unterLaufId`)
#   und wird ueber denselben Kanal gelesen. Bei langen Laeufen nicht das ganze Protokoll
#   zurueckgeben, sondern im Fenster zaehlen — siehe die vierte Falle in Abschnitt 4.
```

Das Messwerkzeug von M12 lag im Sitzungsverzeichnis und ist weg. Es war klein: ein Skript, das je
Frage einen Hauptlauf mit dem Auftrag „rufe `recherchieren` mit dieser Frage und dieser Tiefe auf"
startet, alle 15 s auf `run.finished` pollt und Haupt- plus Unterlauf als JSON ablegt; ein zweites,
das daraus je Lauf Suchanfragen, gewählte URLs, Ablehnungsgründe und die Rückgabe ausschreibt. Für
M6 und M7 ist es dieselbe Schleife mit anderen Fragen.

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
