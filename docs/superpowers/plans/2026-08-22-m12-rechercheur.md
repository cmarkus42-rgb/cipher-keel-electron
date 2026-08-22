# M12 — trägt der innere Ablauf des Rechercheurs? Messprotokoll

**Stand:** 2026-08-22 · **Modell:** `spark-qwen38-27b` (`keel-qwen38:27b` auf dem DGX Spark)
· **Suchanbieter:** Tavily · **Durch die laufende App gefahren**, nicht gegen eingespeiste
Antworten.

Alles hier ist gemessen. Wo eine Zahl fehlt, steht das dabei.

---

## Der Aufbau

Zehn Fragen aus der laufenden Arbeit (Electron, Node, Vitest, Ollama, Qwen, Suchanbieter), alle
**außerhalb** der Positivliste — sonst misst der Lauf den Nachschlage-Weg statt den Rechercheur.
Je Frage ein Hauptlauf, dessen einzige Aufgabe der Aufruf von `recherchieren` ist; die Tiefe steht
im Auftrag (fünfmal `kurz`, fünfmal `gruendlich`) und wird nicht dem Hauptlauf überlassen, weil
der **innere** Ablauf des Unterlaufs gemessen wird und beide Budgetregime dazugehören.

Ausgewertet wird das Ereignisprotokoll des Unterlaufs, nicht sein Text.

Die Skripte liegen außerhalb des Repos (Job-Verzeichnis dieser Sitzung): `fahre.mjs` sammelt,
`lies.mjs` legt den inneren Ablauf offen, `vergleich.py` rechnet. Sie sind Messwerkzeug, kein
Bauteil — deshalb stehen sie nicht in `tests/`.

**Eine Einschränkung des Messwerkzeugs, benannt statt verschwiegen:** der CDP-Treiber von
`run-keel` kappt eine Antwort bei rund 65 KB. Zwei der zehn Wiederholungsläufe kamen deshalb nicht
als Ganzes zurück; ihre Kennzahlen sind einzeln nachgeholt (kompakte Projektion im Fenster statt
volles Protokoll). Die Läufe selbst waren davon nicht betroffen. Bemerkenswert ist die Richtung:
das Kappen trat erst **nach** den Behebungen auf, weil die Protokolle vorher kleiner waren — es
wurde ja kaum eine Seite gelesen.

---

## Das Ergebnis in einem Satz

Der Rechercheur war **gebaut, nicht brauchbar**: in zehn Läufen wurden **3 von 33** versuchten
Seitenabrufen wirklich gelesen, und **sieben von zehn** Recherchen kamen ohne eine einzige
gelesene Seite zum Befund. Nach vier Behebungen sind es **11 von 35** und **vier von zehn**, und
der verbleibende Verlust hat genau eine Ursache, die benannt und lokalisiert, aber noch nicht
behoben ist.

| | vorher | nachher |
|---|---|---|
| Eingabefehler des Modells (Typ-Tippfehler) | 20, in 8 von 10 Läufen | **0** |
| Züge, die für `werkzeug_schema` draufgingen | 17 | **0** |
| Seiten gelesen | 3 von 33 Versuchen | **11 von 35** |
| Läufe ohne eine einzige gelesene Seite | 7 von 10 | **4 von 10** |
| Abrufe, die am 20-Sekunden-Budget scheiterten | 1 | **15** |

Die letzte Zeile sieht aus wie eine Verschlechterung und ist keine: vorher **kam** kaum ein Abruf
bis zum Netz (5 gingen in zehn Läufen wirklich hinaus, 27 danach). Der Zeitfehler war vorher
verdeckt, weil vorher schon das Budget verbrannt war.

---

## Die sechs Fragen des Entwurf-Nachtrags

| Frage | Befund |
|---|---|
| Formuliert das Modell aus der Frage eine brauchbare Suchanfrage — oder schiebt es die Frage wörtlich hinein? | **Ja, durchgehend.** In 20 Läufen kein einziges Mal die Frage wörtlich. Beispiele: `Electron native module "was compiled against a different Node.js version" ABI`, `@mozilla/readability returns null parse no content`. Das ist die Stärke dieses Modells in diesem Ablauf. |
| Wählt es aus den Treffern die richtige Seite, oder die erste? | **Es wählt.** Bei der Vitest-Frage nahm es Treffer 1 (GitHub-Issue #3935, die einschlägige Fundstelle) und ließ die drei Doku-Varianten liegen; bei der num_ctx-Frage nahm es Treffer 1 und Treffer 3, nicht 1 und 2. |
| Merkt es, wenn eine Seite nichts hergibt, und holt eine zweite? | **Ja.** Nach `Seite nicht lesbar extrahierbar` und nach einem Zeitfehler wurde jedes Mal eine andere URL versucht. Es fiel dann aber regelmäßig ins Budget statt in eine zweite Seite. |
| Hält es die Budgets ein, ohne sie auszureizen? | **Nein — es reißt sie in fast jedem Lauf.** 8 von 10 (vorher) bzw. 8 von 10 (nachher) enden `runden-erschoepft`. Das Modell hört nicht von selbst auf. |
| Ist der Befund gedeckt, oder erfindet er über die Quellen hinaus? | **Gedeckt, und das ist der stärkste Einzelbefund.** Der Rechercheur trennt von sich aus „belegt" von „nicht belegt", nennt, welche Seite nur als Suchauszug vorlag, und schreibt im Extremfall den Satz *„Die Websuche war in diesem Lauf unbrauchbar … Der folgende Befund stützt sich daher ausschließlich auf mein Vorwissen"*. Kein Lauf hat eine Quelle erfunden — die Quellenliste baut ohnehin keel aus dem Protokoll. |
| Reicht `medium` als Denkstufe, oder braucht der Unterlauf `low`? | **Offen, aber nicht bindend.** Die Wanduhr des Unterlaufs lag vorher bei 27–164 s (Budget 90 s), nachher bei 82–199 s. Gebunden hat in 8 von 10 Läufen das Rundenbudget, nicht die Uhr. Erst wenn die Abrufe zuverlässig durchgehen, ist die Denkstufe die richtige Stellschraube. |

---

## Was behoben wurde, und woran man es sieht

### 1. Ein Aufruf, der nie hinausging, verbrannte das Netzbudget

Der teuerste Befund. `mitObergrenze` zählte `tool.intent` — jede *Absicht*. Ein Aufruf wie
`web_suchen {}` oder `seite_lesen {url, max_zeichen: "30000"}` stirbt in der Eingabeprüfung des
Werkzeugs, vor jeder Namensauflösung, und verbrauchte trotzdem einen Platz.

Lauf 1 der ersten Runde ist der Fall in Reinform: das Modell schickte im ersten Zug zweimal
`web_suchen` mit `{}`, beide Aufrufe verbrannten das Suchbudget von `kurz` (= 1), der dritte Zug
schickte eine tadellose Anfrage und wurde abgewiesen. **Null ausgehende Anfragen, null Quellen,
Befund aus Vorwissen.** Lauf 10 zeigt dieselbe Mechanik am Seitenbudget: vier
`max_zeichen`-Tippfehler in einem Zug fraßen vier von fünf Plätzen.

Gezählt wird jetzt, was **hinausgegangen ist oder gleich wird**:

- *nie hinausgegangen* (`tool.failed`, kein `netz.ausgehend`) → zählt nicht;
- *hinausgegangen und dann gescheitert* → zählt. Das ist die sicherheitsrelevante Richtung: wäre
  ein fehlgeschlagener Abruf frei, wäre ein Ziel, das zuverlässig HTTP 500 antwortet, ein
  unbegrenzter Kanal nach draußen;
- *noch nicht ausgeführt* → zählt. Fail-closed, und es macht die Zählung rennfrei gegen mehrere
  Aufrufe eines Zuges (`fuehreAus` schreibt alle `tool.intent` vor jedem Werkzeug).

Unterschieden wird über eine neue `aufrufId` am `netz.ausgehend`.

### 2. `klemmeMaxZeichen` lehnte eine Zahl in Anführungszeichen ab

`"max_zeichen": "30000"` kam in **fünf von zehn** Läufen. `klemmeAnzahl` nimmt dieselbe Form seit
dem 2026-08-22 an — mit der ausdrücklichen Begründung, dass Modelle dieser Größenklasse JSON-Typen
regelmäßig falsch tippen. Die Funktion daneben tat es nicht. Zusammen mit (1) war das die Ursache
für vier Läufe ohne eine einzige Seite.

Die Ablehnung nennt jetzt auch den erhaltenen Wert. Ohne ihn stand im Protokoll, dass etwas nicht
stimmte, aber nicht was — dieser Fehler wäre sonst gar nicht sichtbar geworden.

### 3. Aufgeschobenes Schemaladen kostete den Unterlauf die halbe Rundenzahl

In **acht von zehn** Läufen holte das Modell zuerst ein oder zwei Schemata. Das ist richtig — der
Präfix fordert es wörtlich —, aber es kostete zwei der vier Runden. Danach blieb Raum für eine
Suche und, wenn es gut lief, einen Seitenabruf.

Aufgeschobenes Laden ist ein Hebel für einen Lauf mit vielen Werkzeugen und Raum. Der Unterlauf
hat drei Werkzeuge und vier Runden. Er bekommt seine Schemata jetzt gleich mit
(`LaufUmgebung.aufgeschobenesLaden: false`); der Hauptlauf bleibt unverändert beim aufgeschobenen
Laden, und `werkzeug_schema` ist im Unterlauf auch **nicht mehr ausführbar**, nicht bloß
unsichtbar.

Der Nebeneffekt war der größere: mit dem Schema im Körper verschwanden **alle** Typ-Tippfehler
(20 → 0). Das Modell sieht jetzt `"type": "number"` und schickt `anzahl: 8` statt `"8"`.

### 4. Der Abruf lief als einziger Abschnitt nicht gegen die Uhr

Beim Nachschärfen der Zeitabsage gefunden, nicht gesucht: `holeSicher` klammert die
Namensauflösung und das Lesen in `gegenDieUhr`, den **Abruf** dazwischen nicht — obwohl
`such-anbieter.holeJson` für genau diesen Fall die Begründung trägt: *das Signal allein reicht
nicht, weil ein Abrufer es ignorieren darf.* `Abrufer` ist eine Schnittstelle; sie sagt zu, dass
`init.signal` mitkommt, nicht dass jemand darauf hört. Die vorhandene Zeitbudget-Gegenprobe blieb
grün, weil ihr hängender Abrufer das Signal brav beachtete.

Und die Absage nennt jetzt den Abschnitt, in dem die Zeit hinging. Ohne das war die einzige
Auskunft im Protokoll die Zahl, die man ohnehin schon hatte.

---

## Was offen bleibt: die Abrufe hängen im Hauptprozess der App

**Der verbleibende Verlust, und der größte.** 15 von 27 Seitenabrufen, die wirklich hinausgingen,
liefen ins 20-Sekunden-Budget. Die nachgeschärfte Absage sagt, wo:

```
Zeitbudget von 20000 ms ueberschritten (Abruf von dasroot.net (Sprung 0))
Zeitbudget von 20000 ms ueberschritten (Abruf von www.firecrawl.dev (Sprung 0))
Zeitbudget von 20000 ms ueberschritten (Abruf von morningcoffee.io (Sprung 0))
Zeitbudget von 20000 ms ueberschritten (Abruf von superuser.com (Sprung 0))
Zeitbudget von 20000 ms ueberschritten (Abruf von unix.stackexchange.com (Sprung 0))
```

Immer der **Abruf**, immer **Sprung 0**, nie die Namensauflösung und nie das Lesen.

Derselbe Code holt dieselben URLs unter Node in Millisekunden — gemessen über `holeSicher` mit
`aufloeserDesSystems` und `abruferDesSystems`, also ohne jeden Ersatz:

| Ziel | unter Node | in der App |
|---|---|---|
| `dasroot.net` | 131 ms, 32.481 Zeichen | Zeitbudget |
| `www.firecrawl.dev` | 738 ms, 1.200.987 Zeichen | Zeitbudget |
| `morningcoffee.io` | 134 ms, 22.652 Zeichen | Zeitbudget |
| `superuser.com` | 121 ms, ehrliches HTTP 403 | Zeitbudget |
| `unix.stackexchange.com` | 84 ms, ehrliches HTTP 403 | Zeitbudget |
| `electronjs.org` (mit Weiterleitung) | 332 ms, 43.900 Zeichen | Zeitbudget |
| `vitest.dev` | 154 ms, 99.640 Zeichen | Zeitbudget |

**Ausgeschlossen ist damit:** das Netz, die Zielseiten, der Code-Pfad selbst, die Nebenläufigkeit
(fünf gleichzeitige Abrufe unter Node: 318–1.763 ms), das Anhäufen liegengelassener
Weiterleitungskörper (zwölf Abrufe hintereinander in einem Prozess: 151–177 ms, kein Anstieg) und
**Happy Eyeballs / IPv6** — die meisten betroffenen Hosts haben gar kein AAAA-Record.

Was übrig bleibt: es liegt am **Electron-Hauptprozess**. Alle betroffenen Ziele sitzen hinter
Bot-Abwehr (Cloudflare, CloudFront, Vercel, Stack Exchange), und keels Abrufer schickt weder
`user-agent` noch `accept-language`. Electron bringt außerdem BoringSSL mit, Node OpenSSL — der
TLS-Fingerabdruck ist also ein anderer als der, unter dem die Messung oben gelingt. Das ist eine
Vermutung und ausdrücklich als solche gekennzeichnet; **belegt ist nur der Unterschied, nicht
seine Ursache.**

**Ein Versuch, gemessen und verworfen.** Naheliegend war, dass die fehlenden Kopfzeilen das
Signal sind: keel schickt weder `user-agent` noch `accept-language`, und eine Anfrage ganz ohne
User-Agent ist der stärkste Bot-Hinweis, den es gibt. Also einmal einen ehrlichen eigenen
User-Agent (`cipher-keel/0.1 (Rechercheur; …)`) plus `accept-language` gesetzt, neu gebaut und
dieselben drei Fragen gefahren:

| | ohne Kopfzeilen | mit Kopfzeilen |
|---|---|---|
| Abrufe hinausgegangen | 11 | 11 |
| davon am Zeitbudget gescheitert | 5 | 4 |
| davon mit benanntem HTTP-Fehler | 1 | 3 |
| Seiten gelesen | 2 | 1 |

**Kein Beleg.** Ein Hänger wurde zu einer ehrlichen Absage, dafür lehnten zwei weitere Ziele ab,
und gelesen wurde weniger. Bei drei Läufen ist das Rauschen. Die Kopfzeilen sind deshalb wieder
draußen: eine Änderung, die sich nicht messen lässt, gehört nicht in den Quelltext — auch dann
nicht, wenn sie plausibel klingt.

**Ebenfalls nicht getan und mit Absicht:** das Zeitbudget hochsetzen. Ein Ziel, das unter Node
131 ms braucht, wird von 20 auf 40 Sekunden nicht schneller — und ein längeres Budget verdeckt den
Befund, statt ihn zu beheben. Ein falscher Grund im Kommentar ist schlimmer als kein Kommentar.

---

## Was danach ansteht, in dieser Reihenfolge

1. **Den hängenden Abruf klären** (oben). Bis dahin bleibt der Rechercheur zwar deutlich besser
   als vorher, aber unter seinen Möglichkeiten: ungefähr die Hälfte der Seiten, die er ausgewählt
   hat, bekommt er nicht.
2. **Die Budgets erst danach nachstellen.** Sie sind heute nicht das bindende Problem, und eine
   Zahl, die gegen einen bekannten Defekt eingestellt wird, muss danach wieder geändert werden.
   Wenn es so weit ist, sprechen die Daten für: `kurz` auf **zwei** Suchen (in jedem einzelnen
   Lauf wollte das Modell nach dem ersten Trefferbild eine verfeinerte zweite Anfrage stellen) und
   für eine Wanduhr über 90 s, weil sie nach dem Wegfall der Schema-Züge zu binden beginnt
   (`zeit-erschoepft` trat erstmals nach den Behebungen auf).
3. **M7** — folgt ein 27B dem Nachlade-Satz für Fähigkeiten? Ein Teilbefund liegt schon vor: für
   **Werkzeugschemata** folgt es dem Satz in 8 von 10 Läufen, und zwar auf eigene Kosten. Das ist
   ein starkes Indiz für die Annahme, auf der keels Niveau B ruht — aber `faehigkeit_lesen` wurde
   in diesen zwanzig Läufen kein einziges Mal gerufen, weil keine Fähigkeit hinterlegt war.
4. **M11** — Transport-Flattern. Zwei der zwanzig Unterläufe endeten `transportfehler`.

---

## Rohdaten

Ereignisprotokolle beider Runden liegen im Job-Verzeichnis dieser Sitzung unter `m12/laeufe`
(vorher) und `m12/laeufe2` (nachher), je Lauf ein JSON mit Haupt- und Unterlauf. Sie überleben die
Sitzung nicht — was aus ihnen folgt, steht oben.
