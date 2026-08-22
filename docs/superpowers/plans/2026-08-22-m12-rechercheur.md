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
gelesene Seite zum Befund. Nach vier Behebungen sind es **11 von 35** und **vier von zehn**.

Der verbleibende Verlust hatte genau eine Ursache, und sie liegt **nicht in keel**: ein Netzfilter,
der pro Anwendung und Ziel entscheidet (Little Snitch), hält den ersten Kontakt zu jedem neuen
Host, bis eine Regel existiert — und in einem unbeaufsichtigten Lauf beantwortet niemand seinen
Dialog. Mit gesetzter Regel und dem eigenen Versuchsbudget sind es in einer dritten Runde
**17 von 25** gelesenen Seiten und **ein** Lauf von zehn ohne Quelle. Die Untersuchung und die
Gegenprobe stehen weiter unten.

| | vorher | nachher |
|---|---|---|
| Eingabefehler des Modells (Typ-Tippfehler) | 20, in 8 von 10 Läufen | **0** |
| Züge, die für `werkzeug_schema` draufgingen | 17 | **0** |
| Seiten gelesen | 3 von 33 Versuchen | **11 von 35** |
| Läufe ohne eine einzige gelesene Seite | 7 von 10 | **4 von 10** |
| Abrufe, die am Zeitbudget scheiterten | 1 | **15** (Ursache gefunden, siehe unten) |

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

## Der hängende Abruf: Ursache gefunden — es ist nicht keel

**Der Befund vorweg:** ein **Netzfilter, der pro Anwendung und pro Ziel entscheidet** (Little
Snitch, auf dieser Maschine aktiv) hält den **ersten** Kontakt der Electron-Binärdatei zu jedem
neuen Host, bis eine Regel existiert. In einem unbeaufsichtigten Lauf beantwortet niemand seinen
Dialog, also bleibt die Verbindung im Zustand „connecting" hängen — Socket erzeugt, danach weder
`connect` noch `error` — bis keels Zeitbudget zuschlägt.

### Wie das gefunden wurde

Die nachgeschärfte Absage sagte zuerst nur den Abschnitt: **immer `Abruf`, immer Sprung 0.** Nie
die Namensauflösung, nie das Lesen. Dann wurde der Socket-Lebenslauf mitgeschrieben, und das Bild
wurde eindeutig:

```
OK unit42… :: bind?(all=true)@0 bind!(4:23.218.171.247)@0 socket(neu=true)@1 tcp@16331 tls@17613
FEHLER dev.to… ::                                        socket(neu=true)@1 (nie ein tcp-Marker)
```

Nacheinander ausgeschlossen, jedes mit einer eigenen Messung:

| Verdacht | Messung | Ergebnis |
|---|---|---|
| Das Netz / die Zielseiten | Dieselben URLs über denselben Code unter Node | 84–782 ms, alle |
| Der Electron-Hauptprozess als solcher | Dieselbe Diagnose beim App-Start, im Leerlauf | 114–782 ms, alle |
| Blockierte Ereignisschleife | Verzögerungsmesser im Hauptprozess, ganzer Lauf | 4 Blockaden, zusammen 3,9 s — erklärt keine 20 s |
| Liegengelassene Weiterleitungskörper | 12 Abrufe hintereinander in einem Prozess | 151–177 ms, kein Anstieg |
| Nebenläufigkeit | 5 gleichzeitige Abrufe unter Node | 318–1763 ms |
| IPv6 / Happy Eyeballs | DNS-Familien der betroffenen Hosts | Die meisten haben gar kein AAAA |
| Socket- oder fd-Erschöpfung | `lsof` auf den echten Hauptprozess während eines Laufs | 3 Sockets |
| Paketverlust auf der Strecke | 20 ICMP-Pakete an genau die hängende Adresse | 0 % Verlust, 10 ms |

Übrig blieb: **derselbe Rechner, dieselbe Adresse, derselbe Augenblick — ein Prozess kommt durch,
der andere nicht.** Auf TCP-Ebene ist das unmöglich; ein SYN trägt keine Programmkennung. Also
entscheidet etwas oberhalb, und das kann auf macOS nur eine Netzwerk-Erweiterung sein.
`systemextensionsctl list` nennt zwei aktive: Tailscale und **Little Snitch**.

### Der Beleg ohne root

Der CLI von Little Snitch verlangt root; das war nicht nötig. Die Vorhersage eines Filters, der
pro Anwendung und Ziel entscheidet, ist prüfbar: **der erste Kontakt zu einem Host hängt, jeder
spätere geht durch.** Über alle Läufe hinweg gezählt:

| | schnell | langsam oder gescheitert |
|---|---|---|
| **Erster** Kontakt zu einem Host | 12 | **6** |
| Späterer Kontakt (ohne Wiederholung derselben Anfrage) | 10 | **0** |

Einzelfälle, die es festnageln: `cheatsheetseries.owasp.org` scheiterte beim ersten Mal und
antwortete danach in 30 und 22 ms. `christian-schneider.net` scheiterte beim ersten Mal, danach
46 ms. `unit42.paloaltonetworks.com` brauchte beim ersten Mal 16.331 ms, danach nichts mehr.
`api.tavily.com` und `github.com` — in **jedem** Lauf kontaktiert — hingen **kein einziges Mal**.

Und die Gegenprobe zur Shell erklärt sich damit auch: mein Vergleichsprozess war `node`, für den
Filter ein anderes Programm mit anderen Regeln. Der Vergleich war nie derselbe Weg.

### Was das für keel heißt

**Kein Defekt in keel** — aber eine Stelle, an der keel dem Filter unnötig viel geschenkt hat. Der
Abruf hatte kein eigenes Zeitbudget; ein gehaltener Erstkontakt verbrauchte die vollen 20 Sekunden
der ganzen Kette, still. Behoben:

- **Ein eigenes Budget je Verbindungsversuch**, ein Drittel des Kettenbudgets (6,6 s bei den
  20 s der Vorgabe). Gemessen an der laufenden App: der Versuch bricht jetzt nach 7,7 s ab statt
  nach 20 s, und dem Unterlauf bleibt Zeit für eine andere Seite.
- **Eine benannte Absage** statt eines allgemeinen Zeitfehlers: *„Kein Verbindungsversuch kam
  durch: 2 mal 6666 ms ohne Antwort von arxiv.org."* Sie nennt Host und Versuchszahl.
- **Ein zweiter Versuch je Sprung.** Das ist eine Abwägung, keine Messung, und im Quelltext steht
  es auch so: auf dieser Maschine half er nicht (bei `arxiv.org` scheiterten beide, zusammen
  15,3 s statt 20 s). Er steht für den Fall, den diese Maschine nicht zeigen kann — ein einzeln
  verlorenes SYN.

### Die Gegenprobe: Regel gesetzt, dieselben zehn Fragen noch einmal

Der wirksame Handgriff liegt **außerhalb** des Repos: eine Little-Snitch-Regel, die der
Electron-Binärdatei ausgehende Verbindungen erlaubt. Der Nutzer hat sie am 2026-08-22 gesetzt,
danach dieselben zehn Fragen ein drittes Mal:

| | Runde 1 (vor allem) | Runde 2 (Harness-Behebungen) | **Runde 3 (+ Versuchsbudget + Regel)** |
|---|---|---|---|
| Verbindungsfehler | 1 | **15** (von 27 hinausgegangenen) | **1** (von 25) |
| Seiten gelesen | 3 | 11 | **17** |
| Läufe ohne eine einzige Seite | 7 von 10 | 4 von 10 | **1 von 10** |
| Erstkontakte an der Verbindung gescheitert | — | 6 von 18 | **1 von 14** |
| Folgekontakte an der Verbindung gescheitert | — | 0 von 10 | **0 von 11** |

**Der Unterschied zwischen Erst- und Folgekontakt ist verschwunden** — genau das, was die
Diagnose vorhergesagt hat. `arxiv.org`, `cheatsheetseries.owasp.org`, `news.ycombinator.com` und
`electronjs.org` hingen vorher alle beim ersten Kontakt und gehen jetzt sofort durch. Der eine
verbliebene Verbindungsfehler (`michaelheap.com`, Erstkontakt) ist bei 1 von 14 Rauschen und wird
weder der Regel noch keel zugeschrieben.

Damit ist die Diagnose nicht mehr die beste verfügbare Erklärung, sondern belegt: die Ursache
verschwindet, wenn man genau sie abstellt.

**Was jetzt noch verloren geht, ist Inhalt statt Netz** — und das war vorher hinter dem Filter
unsichtbar:

| Ausgang eines Seitenabrufs | Runde 2 | Runde 3 |
|---|---|---|
| gelesen | 11 | **17** |
| an der Verbindung gescheitert | 11 | **1** |
| am Netzbudget abgewiesen | 5 | **0** |
| nicht extrahierbar (Readability) | 1 | 4 |
| HTTP-Ablehnung (403 von Reddit, Stack Exchange) | 1 | 3 |

Die letzten beiden Zeilen sind die nächsten sinnvollen Ziele: GitHub-Issue-Seiten und ähnliche
JS-gerenderte Seiten scheitern an Readability, und Reddit wie Stack Exchange sperren Klienten ohne
Browser-Kennung. Beides ist ehrlich benannt und kostet je einen Seitenplatz — kein stiller Verlust.

Gebunden hat in Runde 3 wieder das **Rundenbudget** (6 von 10 Läufen `runden-erschoepft`, dazu
einmal `zeit-erschoepft`), und erstmals endeten drei Läufe mit `ziel-erreicht` und echten Quellen.
Damit ist die Budgetfrage aus dem nächsten Abschnitt jetzt ehrlich messbar.

### Was die nächste Messung auf dieser Maschine wissen muss

**Ohne die Regel messen die ersten Läufe gegen frische Hosts den Filter mit.** Wer M6
(Anbietervergleich) oder M7 fährt, prüft zuerst, ob die Regel noch steht — sie hängt an der
Electron-Binärdatei unter `node_modules/electron/dist/Electron.app`, und ein `npm ci` kann sie
ungültig machen. Sonst schreibt er dem Suchanbieter zu, was der Firewall gehört.

**Und ein Shell-`node` ist kein gültiger Vergleich zur laufenden App.** Für einen Filter, der nach
Programm entscheidet, ist das ein anderes Programm mit anderen Regeln. Genau daran ist diese
Untersuchung zuerst in die Irre gelaufen: „derselbe Code ist unter Node schnell" verglich nie
dieselbe Strecke.

## Was danach ansteht, in dieser Reihenfolge

1. ~~**Den hängenden Abruf klären.**~~ **Geklärt** — siehe oben. Was bleibt, ist ein Handgriff
   außerhalb des Repos: eine Little-Snitch-Regel für die Electron-Binärdatei, sonst kostet jeder
   neue Host im Rechercheur weiterhin einen halben Seitenabruf.
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
