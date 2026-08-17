# Handover: Die Modell-Schicht steht, das Harness nicht — und was die Nacht gelernt hat

**Stand:** 2026-08-17
**Für:** die nächste Session
**Kurzfassung:** Drei Strecken sind gebaut, belegt und auf `main`. Die Modell-Schicht liegt
unter allen drei Niveaus, NanoClaw ist weg, ein stiller Fehler ist laut geworden. Der nächste
Schritt ist **nicht** das Harness, sondern die Settings-Seite — mit Begründung unten.

> **Einstiegsdokument.** Es löst `2026-08-16-handover-modell-ebene-und-harness.md` ab. Jenes
> bleibt gültig für die Ideations-Landschaft und den DGX-Spark-Zugang.

---

## 1. Was seit gestern auf `main` liegt

| PR | Was |
|---|---|
| **#19** | Modell-Registry, Läufer, Eignung — eine Datenschicht für A, B und C |
| **#20** | NanoClaw-Rückbau — das abgelöste Subsystem ist weg |
| **#21** | `autoTag` — Konfigurationsfehler propagiert, Transportfehler degradiert still |

**Testsuite 1908 grün · Typecheck 0 · Lint 0 · Bündel-Wächter 0.** Die Zahl ist gegenüber dem
Höchststand *gefallen*, und das ist richtig: #20 nahm 55 Tests mit, deren Gegenstand das
entfernte Subsystem war.

### Die Modell-Schicht, in fünf Dateien unter `src/main/model/`

`entry.ts` (Eintrag, Validierung, Übersetzung zum Endpunkt) · `defaults.ts` (sieben gebündelte
Einträge) · `eignung.ts` (beide Matrizen, sechs Warnregeln) · `registry.ts` (Laden,
Auflösungsreihenfolge) · `rollen.ts` (Rolle → Endpunkt). Zusammen 515 Zeilen.

**Der Kern in drei Sätzen.** Ein Eintrag beschreibt, *was* antwortet und *wie man es erreicht*;
ein Läufer beschreibt, *wie* gearbeitet wird. Dazwischen stehen **zwei** Matrizen statt einer:
Struktur (Läufer × Anbieterart) sperrt hart, Niveau × Läufer ist eine monotone Regel, und
Warnungen sperren nie. Warnungen hängen an der **Zuordnung** aus Eintrag, Läufer und Niveau —
nie am Eintrag allein, weil derselbe lokale 7B auf C harmlos und auf B ein Risiko ist.

**Rückwärtsverträglich:** Alle Zuordnungen sind per Voreinstellung leer, eine Config ohne
`modelle`-Block verhält sich zeichengleich zu vorher. In der laufenden App belegt.

## 2. Der nächste Schritt ist die Settings-Seite, nicht das Harness

**Begründung, und sie ist ein Befund, keine Vorliebe:** Der Abschluss-Review von #19 hat
festgestellt, dass **nichts `warnungen()` aufruft**. Zwei Matrizen, sechs Warnregeln, alle
gebaut, getestet und belegt — und ohne Konsument. Genau **ein** Hinweis erreicht heute einen
Menschen: der Vermerk in der Prompt-Vorschau, wenn ein Tier auf einen Nicht-CLI-Eintrag zeigt.

Das Basiskonzept sequenziert die Settings-Seite ohnehin **vor** dem Harness (Schritt 3 von 4),
und sie ist jetzt „Anzeige, nicht Logik", weil die Datenschicht darunter liegt.

Etwas zu bauen und das Nächste anzufangen, bevor es jemand benutzen kann, ist außerdem genau
das Muster, das diese Nacht dreimal gefunden hat — siehe §4.

**Danach:** das Harness (eigene Sitzung, es ist das größte Einzelstück des Projekts). **Dann**
die Plausibilitäts-Inferenz — ihre offene Frage lautet „welcher Läufer, welcher Vertrag, wer
ruft auf", und genau das beantwortet das Harness; sie vorher umzuverdrahten hieße, die Antwort
zu raten. **Zuletzt** das Embedding: Das Prozess-Dokument sagt in §4.7, der erste Lasttest solle
einen vollen Phasendurchlauf prüfen statt der Suche — und ein voller Phasendurchlauf braucht das
Harness.

## 3. Was für die Settings-Seite schon dasteht

- **Die Eignungsregeln haben genau eine Quelle**, und ein Wächtertest erzwingt das
  (`tests/model/eignung-einzige-quelle.test.ts`). **Die Seite darf die Regeln nicht
  nachbauen** — sie liest sie ab. Wer „eigene-schleife" in ein Auswahlfeld schreibt, bricht den
  Wächter, und das ist Absicht.
- `sperrgrund(laeufer, art)` liefert den Sperrgrund, `warnungen(eintrag, laeufer, niveau)` die
  Liste, `laeuferTraegtNiveau` die Fähigkeitsfrage. Alle deutsch, alle nutzerfertig.
- `alleEintraege()` liefert die Liste, `eintragFuerTier` / `eintragFuerRolle` die Zuordnungen.
- **Die Warnungen tragen stabile Codes** (`werkzeugmodus-text`, `nicht-gemessen`,
  `kontext-zu-klein`, `teure-ebene-fuer-mechanik`, `unter-faehigkeit`, `verlaesst-netz`) —
  gedacht zum Gruppieren in der Oberfläche.
- **Jede Fähigkeitszeile trägt `quelle: 'vermutet'`.** Die Seite muss diese Unsicherheit
  **sichtbar** machen; der Kanarienauftrag, der sie auf *gemessen* hebt, kommt mit dem Harness.

## 4. Das Muster, das diese Nacht dreimal gefunden hat

**Code, der existiert und nie läuft.** Das Prozess-Dokument führte einen Fall; es sind vier:

1. Die Orchestrierung lebt im Prompt, ihr Code wird nur aus Tests gerufen.
2. `fullReindex` / `incrementalIndex` in `graph/vault.ts` werden **von keinem Produktivcode**
   aufgerufen — und rufen ihrerseits `indexNodeEmbeddings` nie. `vec_chunks` ist strukturell
   leer.
3. **Kein Klickpfad legt eine Notiz an und löst Tagging aus.** Deshalb steht die neue
   Fehlermeldung aus #21 im Log und erreicht keine Oberfläche.
4. `warnungen()` hat keinen Aufrufer (§2).

Dazu, verwandt: **Das Grid-Fenster mit der Statuszeile öffnet beim Start nicht von selbst.**
Ohne Projekt gibt es kein Klickziel dorthin — die Fläche, auf der Degradation gemeldet wird,
ist im Auslieferungszustand nicht ohne Weiteres erreichbar.

**Was daraus folgt:** Vor „gebaut" gehört die Frage, wer es aufruft. Ein grüner Test beantwortet
sie nicht.

## 5. Die schärfste Lehre — sie präzisiert eine Projektregel

Das Prozess-Dokument §16.3 sagt: Jede Regel braucht **entweder** eine Schnittstellenform, die
den Fehler unmöglich macht, **oder** einen Wächtertest, der ihn zum Build-Fehler macht.

**Die beiden sind nicht gleichwertig.** Der Wächtertest aus #19, gebaut um „die Eignungsregeln
haben eine Quelle" zu erzwingen, wurde **in derselben Strecke** von einer Doppelung unterlaufen,
die er nicht sah — sein Prüfmuster lag knapp daneben. Empirisch belegt: derselbe Satz wörtlich
wieder eingefügt lässt ihn fallen, dieselbe Regel **anders formuliert** kommt durch.

Ein Zeichenketten-Wächter schützt gegen **Kopieren**, nicht gegen **Nacherzählen**. Wo es darauf
ankommt, ist die Schnittstellenform die stärkere der beiden Optionen — sie macht den Fehler
unmöglich, statt ihn zu erkennen.

## 6. Die Fallen, die diese Nacht dazugelernt hat

**Die alten gelten unverändert** (native ABI, Bündel-Wächter, Sprachregel, Zweig vor dem
Commit prüfen, Exit-Codes nie aus abgeschnittener Ausgabe).

**Neu:**

- **`grep -r "nanoclaw"` findet `nanoClawBridge` nicht.** Ein case-sensitives Muster übersieht
  camelCase-Bezeichner. Bei jedem Bestands-Sweep `-i` benutzen — dieser Blindfleck hätte tote
  Verdrahtung stehen lassen.
- **Ein Sweep über `src/ tests/` sieht `docs/`, `README.md` und `.claude/` nicht.** Genau dort
  stand eine Anweisung, die einen Prüfer den Erfolg als Fehler hätte melden lassen.
- **Eine Anweisung in `.claude/skills/` ist Teil des Prüfstands.** Wer den Zustand ändert, den
  eine Skill-Datei als erwartet beschreibt, muss sie **vorher** korrigieren.
- **Eine Korrektur kann ins Gegenteil überschießen.** Eine Aussage über fehlende Testabdeckung
  brauchte drei Anläufe — erst zu optimistisch, dann zu pessimistisch. Wer eine Aussage über
  *fehlende* Abdeckung anfasst, zählt vorher nach.
- **Eine zweite App-Instanz kann dieselbe Config und DB teilen.** Vor jedem Messlauf prüfen.
- **`.superpowers/` ist gitignoriert.** Rohbelege aus Messläufen liegen dort und überleben ein
  Aufräumen nicht — die wörtlichen Kernzeilen gehören ins Messprotokoll im Plan, das in Git ist.

## 7. Wo Belege und Begründungen liegen

- **Messprotokolle**, wörtlich, in den Plänen: `2026-08-16-modell-registry.md`,
  `2026-08-17-nanoclaw-rueckbau.md`, `2026-08-17-autotag-laute-fehler.md`.
- **Rohbelege** unter `.superpowers/sdd/<plan>/beleg/` — tmux-Mitschnitte, Netz-Logs,
  Config-Stände. Nicht in Git.
- **Ledger** unter `.superpowers/sdd/<plan>/progress.md` — jede Fix-Runde, jede Adjudikation.
- **Konzept-Seite:** `cipher-keel-harness-ideation/deliverables/` enthält die neue Fassung von
  „Entwickeln im Prozess" (Stand 17.08.) und die Aktualisierungsnotiz mit dem belegten Delta.

**Zur neuen Dokumentfassung eine Ehrlichkeit:** Die Seitenzahlen im Inhaltsverzeichnis sind
**geschätzt, nicht gemessen** (−1 bis +3 Seiten). Auf dieser Maschine gab es keinen
PDF-Renderer; die Paginierung wurde in JavaScript nachgebaut und kalibriert. Vom Nutzer so
akzeptiert. Wer einen Renderer hat, holt den echten Zwei-Pass-Lauf nach.

## 8. Offene Aufträge, in der empfohlenen Reihenfolge

1. **Settings-Seite** — §2 und §3.
2. **Das eigene Harness** — M8 `konzept_v1.0.md` ist die Autorität, „alles 0.1" ist
   ratifiziert, der M6-Nachtrag hält den Release-Schnitt fest.
3. **Plausibilitäts-Inferenz umverdrahten** — `graph/plausibility-inference.ts` hat keinen
   Import, keinen Aufrufer und eine ententypisierte `BridgeLike`-Form nach dem abgelösten Kanal.
   CK-PROC-006.
4. **Embedding / Vektorsuche** — nach einem vollen Phasendurchlauf. Randbedingungen:
   Dimension fest auf `float[384]` gegen 768 von `nomic-embed-text` (Drop und Neu-Einbetten,
   keine Konfigurationsänderung), stiller Rückfall auf Volltext bei jeder Ausnahme, und
   ungeklärt, ob `graph_search` sein Anfrage-Embedding selbst erzeugt.
5. **Kleinere:** `LoaderType.NanoClawSkill` umbenennen (mit dem Harness, wo der Ladeweg seinen
   neuen Träger bekommt — **nicht** wegen einer Datenmigration, die es nicht gibt); der
   Klickpfad zum Grid-Fenster; die Notizen-Oberfläche, ohne die #21 keinen Nutzer erreicht.
6. **Seit Wochen offen:** das Phase-8-Abnahmekriterium — Erst-Start auf einem zweiten
   Apple-Silicon-Mac ohne Entwicklungsumgebung.

## 9. Die Haltung, unverändert

**Belege schlagen Behauptungen.** Kein Test dieses Repos erreicht einen `ipcMain`-Handler; eine
grüne Suite sagt über eine Verdrahtung nichts. Jede der drei Strecken endete mit einem
Messprotokoll aus der laufenden App, und **jede hat dabei etwas gefunden, das alle Tests
überlebt hatte.**

**Stille Fehler sind die teuersten.** Diese Nacht hat drei gefunden: eine Warnung, die im
Normalfall dauerfeuert; eine Zuordnung, die still verworfen wird; ein `catch`, das Ausfall und
Fehlkonfiguration ununterscheidbar macht.

**Und eine, die neu dazugehört: Eine Begründung muss wahr sein.** Eine aufgeschobene Arbeit,
die sich auf eine Tatsache beruft, die es nicht gibt, ist schlimmer als eine unbegründete —
sie hält den Nächsten davon ab, nachzusehen. Der Fall lag in Spec, Plan **und** ausgeliefertem
Quelltext, und ein Reviewer hat ihn durch Nachzählen widerlegt.
