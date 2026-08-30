# Die Teststrecke: morphcook als Messlatte für das Gefälle

**Stand:** 2026-08-30 · Vorschlag, nichts gebaut · ergänzt
`2026-08-30-naechste-schritte-harness-wahl-und-mcp-transport.md`

---

## 1. Warum morphcook die richtige Messlatte ist

keel hat das Gefälle als **Mechanismus** gebaut — Plätze, Adapter, Zellen, Budgets — und konnte
bisher die Frage nicht beantworten, auf die es ankommt: **trägt die billige Ebene echte Arbeit, und
ab wo nicht mehr?** Gemessen wurde bisher Recherchequalität und Werkzeugtreue, nicht Werkstück.

`github.com/TheMorpheus407/morphcook` ist ein Vergleichsexperiment: *„One spec, seven
implementations."* Sieben Modelle, dieselbe Aufgabe, je ein Durchlauf — und, das ist der
brauchbarste Satz des Repos: *„the **first commit** that touches a directory is exactly what that
model produced in a single run."* Dazu ein prüfbarer Ausgang (`flutter test`) und eine
Aufgabengröße, die eine echte App ist statt einer Übung.

## 2. Was nachgemessen wurde, statt es zu glauben

**Die Specs sind nicht identisch** — das Repo sagt es selbst („die Spezifikation entwickelte sich
zwischen den Durchläufen"). Es sind **drei** Fassungen über sechs geprüfte Verzeichnisse:

| Prüfsumme | Verzeichnisse |
|---|---|
| `4108b23d…` | `claude-opus-4-8`, `gemini-3-5-flash`, `minimax-m3` |
| `6e8a3dad…` | `glm-5-2`, `kimi-k2-7` |
| `049328f6…` | `claude-fable-5` (einzeln; trägt zusätzlich `pipeline/` und `docs/`) |

**Die größte faire Vergleichsgruppe ist damit `4108b23d…` mit drei Implementierungen** — und ihre
Besetzung ist ein Glücksfall: ein starkes Anthropic-Modell, ein günstiges Google-Flash-Modell und
ein chinesisches OSS-Flaggschiff. Also genau die drei Ebenen, die das Gefälle behauptet.

**Die Spec ist klein genug für jede Ebene:** rund 570 Zeilen, ~3 400 Wörter, **≈ 4 750 Token**.
Sie passt in das Fenster jedes Eintrags der Registry, auch des lokalen 27B.

**Flutter ist auf dieser Maschine nicht installiert** (`flutter` und `dart` nicht auf dem PATH;
`xcodebuild` und ein Android-SDK sind da). Ohne Toolchain gibt es keinen prüfbaren Ausgang — das
ist eine Voraussetzung, kein Detail.

## 3. Der Blocker, und er ist grundsätzlich

**keels eigene Schleife kann nicht schreiben und nichts ausführen.** Die Werkzeugliste eines Laufs
besteht aus:

```
datei_lesen · verzeichnis_listen · inhalt_suchen
graph_suchen · graph_knoten_holen · graph_ausweiten · graph_abfragen
faehigkeit_lesen · web_suchen · seite_lesen · recherchieren
```

**Elf Werkzeuge, alle lesend.** Der Body des `keel-arbeiter`-Presets sagt es dem Modell auch
ausdrücklich: *„Du kannst nichts schreiben und nichts ausfuehren."*

Damit gilt für die Teststrecke heute:

| Ebene | Harness | kann morphcook bauen? |
|---|---|---|
| oben — Claude-CLI-Modelle | Claude Code im tmux-Pane | **ja** — das echte CLI, volle Werkzeuge |
| Mitte — gutes OSS-Modell über API | keels eigene Schleife | **nein** — nur lesend |
| unten — lokale Worker | keels eigene Schleife | **nein** — nur lesend |

**Eine Teststrecke, die nur die oberste Ebene fahren kann, misst nichts über ein Gefälle.**

Das ist keine Überraschung, sondern eine eingelöste Vorhersage: der ursprüngliche Kommentar an
`RUNTIMES_WITHOUT_ADAPTER` sagte, ein Schleifen-Adapter brauche *„writing tools and a shell, which
travel with the sandbox."* Der Adapter ist gebaut, die Werkzeuge sind es nicht.

## 4. Was daraus für die Reihenfolge folgt

**Paket C — Schreib- und Ausführwerkzeuge für die Schleife, mit Sandkasten.** Das ist die
eigentliche nächste Sache, und die Teststrecke ist ihr Beweis. Was daran zu entscheiden ist:

- **Die Grenze.** `pfadwache` hält heute Lesezugriffe an der Projektwurzel. Für Schreiben und
  Ausführen ist eine Wurzelgrenze zu wenig: ein `rm -rf` innerhalb der Wurzel ist erlaubt und
  falsch. Sandkasten heißt hier: eigener Baum, Wegwerf-Kopie, oder Container.

  > **Nachgesehen am 2026-08-30: die Pfadwache sagt selbst, wie sie sich dazu verhält.** Ihr
  > Kopfkommentar, wörtlich: *„It is not an execution boundary and does not replace one. It
  > holds as long as no tool starts a process. **When the shell arrives the sandbox arrives with
  > it**, and this stays alongside: it checks tool arguments, the sandbox checks the process."*
  > Die Schichtung ist damit vorgezeichnet und nicht zu erfinden: die Wache bleibt, wo sie ist,
  > und prüft **Argumente**; der Sandkasten kommt **daneben** und prüft den **Prozess**. Sie zu
  > erweitern wäre der falsche Schnitt — ihr eigener Text nennt den Grund: gegen eine Shell ist
  > eine Zeichenkettenprüfung Theater, weil `$(…)` und ein umgeschriebenes npm-Skript daran
  > vorbeilaufen.

- **Der Ausführpfad.** Ein `shell_ausfuehren` ist die Fläche, die alles andere überflüssig macht —
  und die gefährlichste Einzelentscheidung des ganzen Projekts. `faehigkeiten.ts` warnt schon
  heute davor, dass ein Modell sich einen solchen Namen in den Präfix schmuggeln kann.
- **Intent vor Effekt.** *Diese Zeile stand hier zu großzügig und ist am 2026-08-30 korrigiert
  worden.* `intent-vor-effekt.ts` ist **kein Tor, sondern ein Prüfer**: `effekteOhneIntent` ist
  eine reine Funktion über dem Ereignisprotokoll **ohne Produktionsaufrufer** — nachgesehen, sie
  wird nur aus `tests/harness/waechter-kern.test.ts` gerufen, und zwei weitere Dateien nennen sie
  bloß als nachgeahmte Bauform. Die Invariante selbst entsteht in `lauf.ts`, weil dort der
  `tool.intent` vor der Ausführung geschrieben wird; die Funktion bewacht das im Test.

  Für ein Schreib- oder Ausführwerkzeug reicht das nicht. Dort muss aus dem Protokolleintrag
  eine **Entscheidungsstelle** werden, die auch nein sagen kann — Ankündigung, Entscheidung,
  Wirkung. Das ist zu bauen, nicht vorhanden.

**Erst danach ist die Teststrecke fahrbar.** Vorher misst sie eine Ebene.

## 5. Wie die Teststrecke dann aussieht

**Aufbau, einmal je Ebene:**

1. Wegwerf-Baum, die gewählte Spec (`4108b23d…`) hineinlegen, sonst nichts.
2. Auftrag: *„Implementiere die App gemäß `SPEC.md`. Ein Durchlauf."*
3. Laufen lassen, Budget aus dem Platz der Ebene.
4. Messen: `flutter pub get`, `flutter analyze`, `flutter test`.

**Was gemessen wird — und was davon keel schon aufzeichnet:**

| Größe | Quelle |
|---|---|
| Runden, Wanduhr, Kosten, Kontextfüllung | `harness.db`, je Lauf (`verbrauchAusEreignissen`) |
| Werkzeugtreue, Abbruchgrund | Ereignisprotokoll |
| baut es? analysiert es sauber? Tests grün? | Flutter-Toolchain |
| gegen die drei Referenzen derselben Spec | Repo-Verzeichnisse |

**Was die Strecke ehrlich halten muss:**

- **Ein Durchlauf**, wie im Repo. Keine Nachbesserung, sonst vergleicht man Geduld statt Modelle.
- **Dieselbe Spec** für alle eigenen Läufe — `4108b23d…`, weil sie die größte Referenzgruppe hat.
- Der Vergleich mit den drei Referenzen ist **indikativ, nicht streng**: sie liefen mit anderen
  Harnessen und unter anderen Bedingungen. Was streng vergleichbar ist, sind **unsere** Läufe
  untereinander.
- Ein Fehlschlag der unteren Ebene ist **ein Ergebnis**, keine Panne. Genau dafür gibt es die
  Strecke.

## 6. Was gebraucht wird, bevor irgendetwas fährt

1. **Flutter installieren** (`flutter`, `dart`) — sonst kein prüfbarer Ausgang.
2. **Paket C** — ohne Schreiben und Ausführen fährt nur die oberste Ebene.
3. Eine Entscheidung, **wo** die Wegwerf-Bäume liegen und wer sie aufräumt.

## 7. Was diese Strecke *nicht* in Frage stellt

Christian dazu ausdrücklich: die Freiheit, CLI-Harnesse zu wechseln und darin eigene Modelle zu
hinterlegen, *„MUSS es sowieso geben — wir wollen ja keinen goldenen Käfig"*, und sie stellt das
Gebaute nicht in Frage. Paket A (Harness-Wahl, `kimicode` und `opencode` als weitere Harnesse) ist
damit **keine Option, sondern Voraussetzung** — die Teststrecke braucht sie sogar doppelt: um
oben verschiedene CLIs gegeneinander zu fahren.
