# Übergabe nach dem MCP-Transport und dem zweiten Harness

**Stand:** 2026-08-30 · **`main` bei `41768e8`**, mit `origin/main` synchron · **2951 Tests** in
215 Dateien, typecheck und lint grün · Arbeitsbaum sauber, kein offener Zweig.

> **Nachtrag am selben Tag: A3 ist gebaut und gemergt.** Diese Datei entstand bei `3763c9d` und
> nannte A3 als offene Entscheidung. Christian hat entschieden — *„ja, in den einstellungen —
> sinnvoll einsortiert"* —, und es ist umgesetzt. Abschnitt 3 ist entsprechend umgeschrieben;
> die Reihenfolge dahinter hat sich dadurch geändert, **Paket C steht jetzt vorn.**

Vorgänger: `2026-08-24-uebergabe-nach-adapter-und-mcp.md`. Zwei Pakete sind seither gelandet,
und eines davon hat eine Lücke geschlossen, die älter war als alles andere in diesem Projekt.

---

## 1. Die MCP-Fläche ist erreichbar — und das ist erstmals gemessen

Die letzte Übergabe nannte es als wichtigsten offenen Punkt: `handleRequest`, `startStdioServer`
und `postLaunchInjection` hatten **keinen Aufrufer**, die sieben `graph_*`-Werkzeuge waren seit
jeher unerreichbar. Das ist erledigt.

Gebaut: ein lokaler HTTP-Server im Hauptprozess auf `127.0.0.1`, ephemerer Port, JSON-RPC unter
`POST /mcp`, ein Bearer-Schlüssel je App-Start nur im Speicher, `timingSafeEqual` mit
vorheriger Längenprüfung, 401 ohne Rumpf.

**Der Beweis ist ein Lauf, kein Test.** Eine über die Launcher-Kachel angelegte Sitzung zeigte im
echten tmux-Pane auf `/mcp`: `connected · authenticated · 10 tools`, und ein echter
Werkzeugaufruf fand den Knoten wieder, der Sekunden zuvor über einen authentifizierten
HTTP-Aufruf geschrieben worden war. Datum, Methode und Grenze stehen an allen fünf Stellen im
Code, die Erreichbarkeit behaupten.

**Nicht gemessen und weiterhin offen:** eine Sitzung, die einen App-Neustart überlebt hat.

### Was drei Sicherheitsrunden daran gefunden haben

- ein **Rennen** zwischen Einspritzen und Sitzungsstart — das CLI liest seine Konfiguration
  beim eigenen Start, ein späteres Schreiben lief dagegen an. Einspritzen läuft jetzt **vor**
  `tmux.createSession`
- ein **toter Schreibpfad**, der ein Geheimnis in ein Transkriptverzeichnis legte
- eine **Leiche**: scheiterte der Sitzungsstart nach erfolgreichem Einspritzen, blieb ein
  gültiger Schlüssel liegen. Zurückgenommen wird jetzt durch **Wiederherstellen des
  Vorzustands**, nicht durch Löschen — der Schlüssel gehört allen Sitzungen eines Projekts, ein
  blindes Löschen träfe Geschwister
- **`tmux.connect()` lag ausserhalb des geschützten Bereichs** — also ausgerechnet beim
  wahrscheinlichsten tmux-Fehler. Es läuft jetzt davor: es wird kein Schlüssel geschrieben,
  solange tmux nicht erreichbar ist. Die Lücke ist konstruktiv weg, nicht durch einen zweiten
  Rücknahmepfad
- ein **Nutzertext, der die Rücknahme unbedingt behauptete**, auch wenn sie geworfen hatte

---

## 2. Kimi Code ist gebaut — und absichtlich noch nicht startbar

Christians Anforderung war die Leitplanke: *„ich will ja auch cli-harnesse wechseln/probieren
können … diese möglichkeit MUSS es sowieso geben — wir wollen ja keinen goldenen käfig."*

**Der Harness ist die Wahl, das Modell ist es nicht.** Der Adapter übergibt `-m` nie; Kimi wählt
aus seiner eigenen Konfiguration. Damit bleiben die drei Tier-Plätze unangetastet, die
befürchtete Matrix aus Platz × Harness entsteht nicht — und wer ein Modell je Sitzung festnageln
will, schreibt `-m <alias>` in die freien Startparameter, weil `--model` bei Kimi nicht unter den
app-gesteuerten Parametern steht.

### Vier Funde, die es nur gab, weil gegen das Binary geprüft wurde

Der alte Plan hielt den Adapter für billig: *„er unterscheidet sich in `cmd`, im Modell-Schalter
und in der Frage, wie ein Entitäts-Prompt hineinkommt."* Die vierte Frage fehlte.

1. **Kimi hat keinen `mcp`-Befehl**, aber einen projektlokalen Ort: `.kimi-code/mcp.json`. Die
   91-KB-`config.toml` mit den Zugangsdaten bleibt unangetastet — und der Adapter hat **einen**
   Schreibpfad statt Claudes zwei, worauf der Rücknahmevertrag sogar besser passt.
2. **Der Rumpf einer Agent-Datei *ist* der Systemprompt**, kein Zusatz. Ohne den Platzhalter
   `${base_prompt}` wirft man Kimis eigenen Prompt weg. Claude bekommt
   `--append-system-prompt-file`, das Wort *append* steht im Schalternamen — Kimi nicht.
3. **Derselbe Rumpf wird als Template gerendert.** Jede `${…}`-Sequenz in unseren Prompts würde
   interpoliert, und es gibt **keine dokumentierte Escape-Regel**. Der Adapter erkennt sie und
   nennt die Zeilennummer, statt still zu verfälschen.
4. **Projektlokale MCP-Server lösen eine Trust-Rückfrage aus, Vorgabe „nein".** Wer sie
   wegklickt, hat eine Sitzung ohne die zehn Werkzeuge. keel kann sie nicht umgehen — es benennt
   sie.

### Was der Review am Entwurf geändert hat

**Die Prompt-Datei ist jetzt eine Pflichtmethode am CLI-Adapter.** Vorher hätte ein späterer Bau
an genau einer Stelle die richtige Schreibfunktion wählen müssen, sonst bekäme Kimi eine Datei
ohne Frontmatter und verwürfe sie. Der erste Vorschlag war ein Wächter-Test über rohem Dateitext;
der Review hat ihn zerlegt — *„Ein Wächter, den eine falsche Umsetzung bestehen und eine richtige
verfehlen kann, wacht nicht, er beruhigt."* Also wurde die Naht **geschlossen statt bewacht**.
Claude reicht durch, byte-gleich belegt (`Buffer.compare` über einen Prompt mit Umlaut, CRLF und
fehlendem Schlusszeilenumbruch).

**Was der Handler über einen Harness wusste, wandert an den Adapter.** Der nutzersichtbare
Rücknahme-Text nannte hart Claudes Dateinamen in adapterneutralem Code — ein Text über einen
Zugangsschlüssel, der jemanden am falschen Ort nachsehen lässt.

---

## 3. Was jetzt ansteht

### A3 ist erledigt — und hinterlässt genau eine Messung

Entwurf: `specs/2026-08-30-a3-harness-platz-und-infoknoepfe-design.md`. Der Harness ist in den
Einstellungen wählbar, leer heisst „das Preset entscheidet" (also unverändertes Verhalten). Die
Zuordnungen sind nach Art gruppiert, Harness oben; die erklärenden Texte sitzen hinter
Info-Knöpfen. Die Launcher-Kachel als Übersteuerung je Sitzung wurde **nicht** gebaut und bleibt
eine Option, kein Versäumnis.

**Der tragende Schnitt:** ein Harness ist kein `Slot`. Jeder Platz in `slots.ts` zielt auf einen
Modelleintrag und wird über `eignung` gefiltert; ein Harness ist ein Adapter. Eigener Typ
daneben — und billiger, weil `nichtVerfuegbarGrund()` an jedem Adapter schon existiert und genau
die Form hat, die die Seite als Sperrgrund rendert.

**Die Regel, an der am meisten hängt:** der Platz übersteuert **nur** bei Presets, deren Laufzeit
ohnehin auf ein fremdes CLI zeigt. Eine Niveau-B-Zelle bleibt unangetastet. Festgenagelt, nicht
behauptet: der Abschlussreview hat die schützende Zeile entfernt und den Test fallen sehen.

> **Damit ist Kimi zum ersten Mal startbar — und der erste Start ist die Messung, die fehlt.**
> Frontmatter, `${base_prompt}` und die `${`-Wache folgen ausschliesslich Doku und Hilfetext.
> Wer ihn fährt, sollte ausserdem wissen: die Kollisionswarnung bei frei getippten `-c`/`-S`
> greift erst bei einem echten Start; der Modell- und der Trust-Hinweis sind verdrahtet, aber
> unbefahren; und `.kimi-code/mcp.json` legt einen Bearer in den Projektbaum unter einem
> Dateinamen, den keine verbreitete `.gitignore`-Konvention abdeckt.

**Zwei Punkte gingen ausdrücklich an die Design-Session, nicht in den Bau:**

1. **Was hinter die Info-Knöpfe gehört.** Christians Anweisung war ausnahmslos; ich habe sie
   eingeengt, **ohne es zu kennzeichnen**, er hat es bemerkt und die Frage vertagt. Drei Tests
   halten den heutigen Stand fest, damit keine spätere Änderung sie unbemerkt beantwortet — einer
   davon war zunächst grün über ein `title`-Attribut und ist jetzt gegen eine Mutation belegt.
2. **Wer Kimi wählt, sieht weiter drei Tier-Plätze, die für seine Sitzungen nichts tun** und
   erfährt es erst beim Start; heute sagt es nur der Erklärtext, also der schwächste Ort.

### Paket C — Schreiben und Ausführen, mit Sandkasten

Voraussetzung für die mittlere und untere Ebene der Teststrecke. Heute hat keels Schleife **elf
Werkzeuge, alle lesend**. Zwei Annahmen des Teststrecken-Plans sind am 2026-08-30 korrigiert
worden, und beide machen es teurer:

- **Die Pfadwache bleibt, wo sie ist.** Ihr eigener Kopf sagt: *„When the shell arrives the
  sandbox arrives with it… it checks tool arguments, the sandbox checks the process."* Der
  Sandkasten steht **daneben**, nicht in ihr. Sie zu erweitern wäre der falsche Schnitt — gegen
  eine Shell ist eine Zeichenkettenprüfung Theater.
- **`intent-vor-effekt.ts` ist ein Prüfer, kein Tor.** `effekteOhneIntent` hat **keinen
  Produktionsaufrufer**; die Invariante entsteht in `lauf.ts`, die Funktion bewacht sie im Test.
  Für ein Schreib- oder Ausführwerkzeug muss daraus eine **Entscheidungsstelle** werden, die auch
  nein sagen kann. Das ist zu bauen, nicht vorhanden.

### Die Teststrecke selbst

Flutter fehlt (`flutter` und `dart` nicht auf dem PATH). Spec `4108b23d…` ist gewählt, weil sie
die grösste faire Vergleichsgruppe hat (drei Implementierungen: ein starkes Anthropic-Modell, ein
günstiges Google-Flash-Modell, ein chinesisches OSS-Flaggschiff). Wo die Wegwerf-Bäume liegen und
wer sie aufräumt, ist unentschieden.

---

## 4. Vier ungemessene Dinge, die als Annahme gekennzeichnet sind

1. **„Das CLI liest seine Konfiguration einmal, beim eigenen Start."** Trägt in fünf Dateien
   Gewicht und ist nie direkt beobachtet worden — nur seine Folge im I-1-Rennen. Im Code als
   Annahme gekennzeichnet, mit dem Nachweis, was ohne sie trägt. Die Messung bleibt geschuldet.
2. **Die neustart-überlebende MCP-Sitzung** — an allen vier Behauptungsstellen als ungemessen
   benannt.
3. **Kimis Prompt-Format** — Frontmatter, `${base_prompt}` und die Wache folgen Doku und
   Hilfetext. Kein echter Kimi-Lauf hat sie bestätigt; es wurde bewusst keiner gestartet. **Der
   erste echte Start gehört beobachtet.**
4. **Was `-m` mit einem unbekannten Alias tut** — die Doku schweigt. Gegenstandslos, solange keel
   nie eines übergibt; relevant, sobald jemand `-m` in die freien Startparameter schreibt.

---

## 5. Drei Dinge über das Arbeiten, die diese Strecke hinzugefügt hat

**1. Ein Test, der nie rot war, hat nichts bewiesen — und ein einzelnes „Modul nicht gefunden"
zählt nicht.** Beim Kimi-Adapter ergab der erste Lauf genau eine Fehlermeldung für die ganze
Datei, was über die einzelnen Tests nichts aussagt. Der Implementierer hat daraufhin eine
**absichtlich naive Fassung** gebaut — Modell durchgereicht, keine Wache, Rücknahme per blindem
Löschen — und dagegen laufen lassen: 23 von 38 wurden rot. Der Prüfer hat unabhängig davon vier
echte Mutationen am fertigen Code gefahren und alle vier rot gesehen. Das ist der Unterschied
zwischen „war mal rot" und „beisst".

**2. Eine Konvention, die niemand erzwingt, wird beim Weitergeben schärfer, als sie ist.** Die
Umlaut-Regel wurde in mehreren Aufgabenbriefs als absolut formuliert („keine Umlaute im
Quelltext"). Nachgesehen: es gibt **weder Wächter-Test noch Lint-Regel**, und deutscher
Prompt-Text (`global-rules.ts`) trägt selbstverständlich Umlaute. Die Konvention betrifft
Kommentare und Bezeichner. Ein Review-Befund lief daraufhin gegen eine Regel, die so nicht
existiert — und die Korrektur darauf enthielt zunächst einen Kommentar, der etwas anderes
behauptete, als der Code tat. Beides korrigiert; die Lehre steht hier, damit die Regel beim
nächsten Weitergeben stimmt.

**3. Eine ausdrückliche Anweisung einzuengen ist erlaubt — sie einzuengen, ohne es zu sagen,
nicht.** Christian hat verlangt, *„die hinweisetexte"* hinter Info-Knöpfe zu nehmen, ohne
Ausnahme. Ich habe daraus eine Liste mit vier Ausnahmen gemacht und sie als Entwurfsentscheidung
präsentiert, nicht als Abweichung. Seine Antwort: *„naja, das hab ich doch gerade explizit
gefordert."*

Das Argument für die Ausnahmen war nicht schlecht — es steht in `specs/…-a3-…-design.md` §4 und
geht auf die Design-Session. Der Fehler war die Form: eine Einengung, die nicht als solche
markiert ist, sieht für den, der sie liest, aus wie Umsetzung. Sie kostet ihn die Gelegenheit,
zu widersprechen, bevor gebaut wird.

Derselbe Reflex war später noch einmal in Reichweite: der Oberflächen-Implementierer schlug vor,
den Wirkungsvermerk doch sichtbar zu lassen, mit einem vernünftigen Grund. Aufgelöst wurde in die
andere Richtung — hinter das ⓘ, in **allen vier** Reitern —, und sein Einwand ging in den
Bericht statt in eine Ausnahme im Code, die in drei Wochen niemand mehr begründen kann.

---

## 6. Unverändert offen aus den Vorgängerübergaben

GPU-Reload-Probe noch nicht gefallen · Little-Snitch-Regel nach einem `npm ci` weiter ungeprüft ·
unsigniert und nicht notarisiert · Leerlauf-RAM und Kaltstart unvermessen · Codex- und
Gemini-Adapter (`RUNTIMES_WITHOUT_ADAPTER` ist leer, der Fehlerzweig für „gültig, aber nicht
gebaut" steht weiter bereit) · Niveau C · die TOCTOU-Lücke im Frisch-Zweig (reiner Lesebefund,
kein Feldbeleg) · **`opencode` ist auf dieser Maschine nicht installiert** und bleibt als dritter
Harness hypothetisch.
