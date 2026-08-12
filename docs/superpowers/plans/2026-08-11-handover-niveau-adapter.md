# Handover: Niveau- und Adapter-Anbindung — Stand, Funde, was noch fehlt

**Stand:** 2026-08-11
**Für:** die nächste Session, die den Plan zu Ende führt
**Kurzfassung:** Sieben von dreizehn Tasks sind gebaut und grün. Der zweite Schenkel ist
verdrahtet, das Modell-Gefälle greift, die Capability-Deklaration ist auf eine Quelle
zusammengelegt. **Nichts davon ist bisher in der laufenden App belegt** — das ist Task 12.

> **Dies ist das Einstiegsdokument.** Es löst
> `2026-08-11-handover-entitaets-startstrecke.md` als Einstieg ab; jenes bleibt gültig für
> die Startstrecke selbst und für die offenen Punkte, die dieser Plan **nicht** anfasst.

---

## 1. Warum das hier gebaut wird — das Überziel

Ohne diesen Abschnitt wirken die nächsten Tasks wie Aufräumarbeit. Sie sind es nicht.

cipher keel soll ein **Leistungsgefälle** bedienbar machen: starke Modelle oben, wo Fehler
sich vervielfachen — Ideation, Requirements, Systems Engineer, mit Abstrichen Architect —,
billige oder lokale Modelle unten, wo Arbeit mechanisch und in Menge anfällt, und beides
unter Aufsicht statt unter Vertrauen. M4 nennt das Leitmotiv wörtlich **„lokal leistbar"**
und stellt die keel-Ebene ausdrücklich *über* die ausführende Ebene: Sie führt und versorgt
mit Kontext, sie führt nicht selbst aus.

**Die Niveaus A/B/C sind der Mechanismus dieses Gefälles, keine Sparvariante.** Ein lokales
Modell hat kein Harness, das `@`-Referenzen auflöst, und kein Kontextfenster für 32
Capability-Dateien. B und C sind die Bedingung, unter der ein schwaches Modell überhaupt
beauftragbar wird. Das ist der Unterschied zu cipher-mux, der eine Ebene kannte und deshalb
auch keinen Anlass für Niveaus hatte.

Der Träger der billigen Ebene ist **NanoClaw** (Schenkel 2, eigene Provider-Keys, lokal per
Ollama oder API). Der Nutzer hat das am 2026-08-11 bestätigt und ergänzt: OpenCode diente
als *Vorlage* für die Integration von API-Modellen, und ein OpenCode-Adapter wäre in Ordnung,
„wenn es die Funktion erfüllt" — Leitbild war, nicht alles neu zu erfinden.

---

## 2. Wo die Arbeit liegt

| | |
|---|---|
| **Branch** | `niveau-adapter-anbindung`, **nicht gepusht**, kein PR |
| **Basiert auf** | `entity-start-path` (PR #11, offen) |
| **Darunter** | `phase-8-packaging` (PR #10, offen) → `main` (`a6c6bbb`) |
| **Umfang** | 8 Commits, 38 Dateien, +744 / −733 |
| **Testsuite** | 1796 grün / 135 Dateien · Typecheck 0 · Lint 0 |

**Drei gestapelte Branches.** Merge-Reihenfolge ist mechanisch: #10, dann #11, dann dieser.
Wer hier pusht, öffnet den dritten Stapel — das ist eine Entscheidung, keine Formalie.

Plan und Spec:
- `docs/superpowers/plans/2026-08-11-niveau-adapter-anbindung.md` — dreizehn Tasks, TDD,
  mit Code in jedem Schritt
- `docs/superpowers/specs/2026-08-11-niveau-adapter-anbindung-design.md` — das Design und
  die Begründungen

---

## 3. Was gebaut ist (Task 1–7)

| Task | Ergebnis |
|---|---|
| 1 | `AgentAdapter.niveau` — Claude → A, NanoClaw → B (M2 §11.3) |
| 2 | **NanoClaw registriert**, Adapter kommt aus `rahmen.runtime` statt `getDefault()` |
| 3 | Das Niveau der Session kommt vom aufgelösten Adapter |
| 4 | `agent.modelTiers` in der Config; `model` wird aufgelöst statt verworfen |
| 5 | `pfad` wird abgeleitet — 36 handgepflegte Werte weg |
| — | `capability-tree` und `capability-loader` gelöscht (vorgezogen, siehe §6) |
| 6 | Capability-Pakete sind die einzige Quelle; alle Niveau-String-Listen entfallen |
| 7 | Wächtertest bindet Paketnamen und gebündelte Assets **beidseitig** |

**Der schwerste Fund dabei:** Der Workshop trug denselben Niveau-Schnitt an **fünf** Stellen
— `WORKSHOP_PACKAGES`, `niveau-config.ts`, `WORKSHOP_CAPABILITY_PAKETE`, die `pakete`-Listen
in `WORKSHOP_KONFIGURATION` und die Ternäre in `createWorkshopRahmen`. Jetzt an einer.

**Eine Verhaltensänderung ist drin:** Systems-Engineer- und Architect-Sessions starten mit
`--model opus` statt auf dem Harness-Default. Testgedeckt, **nicht** in der App belegt.

---

## 4. Was noch fehlt (Task 8–13)

In Abhängigkeitsreihenfolge, alle mit fertigem Code im Plan:

1. **Task 8 — Niveau-B-Emission.** Heute emittiert `assemble-entity.ts` auf B *nichts*; der
   Kommentar sagt „inline capabilities expected in body", was kein Body einlöst. Eine
   B-Session verlöre still ihre ganze Capability-Schicht. Zu bauen: Inventar mit
   `beschreibung` und Pfad (M2 §6.4, Strategie 1).
2. **Task 9 — Prompt-Vorschau** über einen neuen IPC-Kanal, ohne Session-Start und ohne
   Schreibzugriff.
3. **Task 10 — die Vorschau in der `LauncherCell`**, mit Niveau-Umschalter.
4. **Task 11 — CK-NFR-012 und `docs/anpassbare-flaechen.md`.** Die Meta-Anforderung des
   Nutzers, siehe §5.
5. **Task 12 — der Messlauf in der laufenden App.** Der einzige Task, der die Kernaussagen
   belegt. Siehe §7.
6. **Task 13 — Konzept-Nachtrag** außerhalb des Repos, siehe §6.

---

## 5. Entscheidungen dieser Session — und wer sie getroffen hat

| Entscheidung | Von wem | Konsequenz |
|---|---|---|
| Niveau B/C sollen erreichbar werden | Nutzer | Die ganze Strecke; ohne das wäre nur entrümpelt worden |
| Das Niveau folgt dem **Adapter**, nicht dem Nutzer | Nutzer | Deckt sich mit M2 §11.3 — die Wahl war konzeptkonform, nicht nur plausibel |
| NanoClaw kommt mit rein | Nutzer | „hätte nicht fallengelassen werden sollen" |
| Model-Zuordnung in diese Runde | Nutzer | Die zweite Hälfte des Gefälles; ohne sie bleibt die Niveau-Arbeit wirkungslos |
| OpenCode-Adapter ist in Ordnung | Nutzer | Bedingung bleibt die Lizenz-/ToS-Verifikation **vor** dem Bau (`06-offene-punkte.md`) |
| **Meta-Anforderung: anpassbare Flächen sichtbar und editierbar** | Nutzer | Gilt für *alles* in keel, was man sinnvoll anpassen kann. Sichtbarkeit jetzt, Editierbarkeit als Folgephase. **Soll Audit-Inhalt werden** — deshalb CK-NFR-012 plus Inventar, nicht nur eine Notiz |
| Niveau C bleibt 0.2 | Assistent, aus M6 Z. 177 | Eine frühere Fassung der Spec hätte C mitgebaut — das wäre die zweite Grenzverschiebung nach dem Testing Assistant gewesen, diesmal ohne Auftrag |
| Kein Worktree für diese Arbeit | Assistent | Ein Worktree bräuchte eigenes `node_modules` samt `rebuild-native` — genau die Operation, die die native ABI zerschießt |

---

## 6. Konzept-Funde — der eigentliche Ertrag dieser Session

Der Nutzer verlangte vor dem Bau eine Prüfung gegen die Ideation-Konzepte („wir wollen ja
nicht in die Irre entwickeln"). Sie hat den Entwurf an vier Stellen korrigiert. **Diese
Funde sind wertvoller als der geschriebene Code.**

### 6.1 Eine Assemblierungs-Schicht fehlt ersatzlos

M2 §9.1 und §17.4 führen **fünf** Schichten: Body, Persona, globale Regeln, Capability-Äste
**und die kontext-tragende Schicht — den graph-aufgelösten `phaseninput`**. Gebaut sind
vier. `assemble-entity.ts` kennt die Option `phaseInput`, aber **kein Aufrufer setzt sie**.

Damit startet jede Entität mit Rollenwissen, aber ohne zu wissen, wo im Prozess sie steht.
M4s graph-vermittelter Handoff (§6.1) hat im Prompt keinen Träger — und M4 nennt die
keel-Ebene ausgerechnet den „idealen Kontext-Lieferanten".

**Das ist die größte inhaltliche Lücke im Repo und gehört vor die NanoClaw-Sessions.** Ein
billiges Modell ohne Auftrag zu beauftragen ist der teuerste Fehler dieser Architektur.

### 6.2 Niveau A weicht schon heute vom Konzept ab — und es ist ungemessen

M2 §5.4 verlangt Capabilities als SKILL.md unter `.claude/skills/` mit Claude Codes
**nativem Inventar-Mechanismus**: Kurzbeschreibungen im Prompt, Inhalt erst bei Aktivierung.
Gebaut sind `@`-Referenzen auf `.claude/capabilities/`.

Die `KEELPROBE7`-Messung (Messprotokoll Task 9 der Startstrecke) kann die entscheidende
Frage **nicht** beantworten: Sie fragte nach dem Codewort, die Datei musste also geladen
werden — ob eifrig beim Start oder bedarfsgesteuert, unterscheidet die Probe nicht. Lädt A
eifrig, zieht jede Session sieben Capability-Dateien vollständig, und „Lazy-Loading als
Pflicht" (M2 §13) ist nicht erfüllt.

**Billig zu messen:** eine Session mit und ohne Capabilities, Token-Verbrauch beim Start
vergleichen. Das Ergebnis entscheidet, ob die A-Mechanik umgebaut werden muss.

### 6.3 `NanoClawChannelCell` ist ratifizierter 0.1-Inhalt und aus der Planung verschwunden

M6 §3.1 führt wörtlich: „Preset-Bauplan Niveau B (Schenkel-2-Pfad): NanoClaw-Pane-Typ im
SessionGrid (**NanoClawChannelCell**), Body-Payload via Channel-Handshake." Die UI-Zeile
nennt sie als Erweiterung des Grids. Es gibt sie im Repo nicht — und die
Fertigstellungs-Roadmap vom 2026-08-06 erwähnt sie nicht.

### 6.4 Die Roadmap priorisiert am Überziel vorbei

Phase 10 zielt auf „Codex oder Gemini" — einen zweiten *CLI*-Adapter. Das belegt die
Multi-Harness-Aussage, zahlt aber nicht auf das Gefälle ein: Das sind wieder Abo-CLIs mit
starken Modellen. Der Pfad, der das Ziel trägt, ist NanoClaw.

**Dazu:** M8 (Harness-Adapter) ist die einzige Ideation **ohne Deliverable** — nur ein Seed.
Der Bau läuft dort gegen einen Seed und gegen vorhandenen Code, nicht gegen ein
freigegebenes Konzept.

### 6.5 Was in den Nachtrag gehört (Task 13)

Nach der Projektregel „Konzept-Hoheit" gehören 6.1 bis 6.4 als additiver Nachtrag nach
`cipher-keel-presets-ideation/deliverables/`, Muster:
`nachtrag-prompt-uebergabe_2026-08-11.md`. Dazu: Annahme A4 aus M2 §5.4 ist durch
Messprotokoll Task 9 erledigt, **A4b** (laden NanoClaw-Skills bedarfsgesteuert?) bleibt offen.

---

## 7. Was ausdrücklich **nicht** belegt ist

- **Der Messlauf in der laufenden App fehlt vollständig.** Kein Test dieses Repos startet
  eine echte Session. Zu belegen sind: `--model opus` in `ps -ww` bei einer
  Architect-Session, und dass die Prompt-Vorschau **byte-identisch** zu der Datei ist, die
  die Session bekommt. Eine Vorschau, die etwas anderes zeigt als das Ausgelieferte, ist
  schlimmer als keine.
- **Keine NanoClaw-Session lief je.** Der Adapter ist registriert und auflösbar; sein
  `buildLaunchCommand` ist ein No-op, Sessions sind Bridge-Threads. Grid-Zelle, Lifecycle
  und Output-Events fehlen. `nanoclaw` meldet in der StatusBar **korrekt** „degradiert" —
  es läuft kein Daemon.
- **Das Phase-8-Abnahmekriterium steht weiter offen:** Erst-Start auf einem zweiten
  Apple-Silicon-Mac ohne Entwicklungsumgebung. Unverändert seit dem Vorgänger-Handover.
- **Kein Release, kein Tag** (Nutzer-Entscheidung 2026-08-09).

---

## 8. Fallen — die alten und drei neue

**Die alten gelten unverändert:** die native ABI-Falle (`npm run rebuild-native`, **nie**
eine Quelldatei ändern, Symptom rund 497 fallende Tests), der Bündel-Wächter
(`npm run verify:bundle`, Marker ASCII und ohne Anführungszeichen), die geteilte
`rolling-summary` mit drei Konsumenten, und die Sprachregel: Code englisch, Prompt-Inhalte
und `docs/superpowers/` deutsch.

**Neu, aus dieser Session:**

- **Exit-Codes nicht aus abgeschnittener Ausgabe schließen.** `npm run typecheck | tail -3`
  liefert den Exit-Code von `tail`, also 0. In einer `&&`-Kette läuft es weiter, und man
  committet mit rotem Typecheck. Genau das ist passiert (`ef21681`, behoben in `8f53bb0`).
  Richtig: `npm run typecheck >/dev/null 2>&1; echo $?`.
- **`filterByNiveau` liegt in `capability-schema.ts`, nicht in `capabilities.ts`.** Das ist
  Absicht: `capabilities.ts` importiert die fünf Entitäts-Getter, die den Filter brauchen —
  läge er dort, schlösse sich ein Importzyklus.
- **Der Workshop-Test `niveauMinimum-sync` ist jetzt tautologisch.** Er pinnte
  `niveauMinimum` gegen die Arrays, solange nichts es las. Da es jetzt entscheidet, prüft er
  eine Ableitung gegen sich selbst. Kein Schaden, aber er behauptet mehr Sicherheit, als er
  liefert — beim nächsten Anfassen entweder schärfen oder streichen.

**Eine Umkehrung, die man kennen muss:** `ta-capabilities.ts` trug einen Kommentar, der
ausdrücklich begründete, warum dort **kein** `niveauMinimum` steht — die Niveau-Verengung
solle allein in den String-Listen leben, damit es keine zweite Repräsentation gibt. Diese
Sorge war berechtigt; sie ist jetzt in die andere Richtung aufgelöst, und der Kommentar sagt
das auch. Wer die alte Fassung im Blame sieht, liest keinen Widerspruch, sondern eine
bewusste Umkehr.

---

## 9. Was zuerst zu lesen ist

1. Dieses Dokument
2. `2026-08-11-niveau-adapter-anbindung.md` — der Plan, Tasks 8–13 sind ab Zeile „Task 8"
   direkt ausführbar
3. `2026-08-11-niveau-adapter-anbindung-design.md` — die Spec mit den Begründungen
4. `2026-08-11-handover-entitaets-startstrecke.md` — der Vorgänger; seine offenen Punkte,
   die dieser Plan **nicht** anfasst, gelten weiter (`se-gate-urteil.ts` und `se-trigger.ts`
   ohne Aufrufer, `resolvePersona`s Nutzerverzeichnis-Zweig, das Aufräumen der
   Prompt-Dateien, die Projektliste nach `project:kickoff`)
5. M2 `cipher-keel-presets-ideation/deliverables/konzept_v1.1.md` **Abschnitte 4–11** —
   wenn es um Niveaus, Adapter oder Assemblierung geht, ist das die Autorität, nicht der
   Bau. Abschnitt 11.3 ist die Adapter-Niveau-Tabelle, 9.1 und 17.4 sind die fünf Schichten
6. M6 `cipher-keel-bauplan-ideation/deliverables/konzept_v0.1.md` **§3.1** — der ratifizierte
   0.1-Schnitt, inklusive der `NanoClawChannelCell`

> **Nicht lesen:** `HANDOFF.md` im Wurzelverzeichnis. Endet am 2026-06-05 bei Wave 4.

---

## 10. Aufgeräumt

Die gitignorierten SDD-Arbeitsordner zu Phase 8 und zur Entitäts-Startstrecke sind gelöscht,
die vier Dokumentverweise darauf umgeschrieben. Die Messprotokolle stehen weiterhin im Plan
`2026-08-10-entitaets-startstrecke-und-personas.md` ab „Messprotokoll Task 8" — sie waren nie
nur im Arbeitsordner, entgegen der Annahme des Vorgänger-Handovers.
