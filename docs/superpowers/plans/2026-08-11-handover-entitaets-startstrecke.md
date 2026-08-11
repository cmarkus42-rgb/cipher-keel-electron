# Handover nach der Entitäts-Startstrecke — Stand, Entscheidungen, offene Punkte

**Stand:** 2026-08-11
**Für:** die nächste Session, insbesondere eine, die aufräumt
**Kurzfassung:** Die Startstrecke ist gebaut, reviewt und dreimal in der laufenden App belegt.
Sie liegt in **PR #11**, gestapelt auf dem weiterhin offenen PR #10.

> **Nicht mehr das Einstiegsdokument.** Der Einstieg ist
> `2026-08-11-handover-niveau-adapter.md`. Dieses Dokument bleibt gültig für die
> Startstrecke selbst und für die offenen Punkte in Abschnitt 5, die der Niveau- und
> Adapter-Plan nicht anfasst — aber die drei aufruferlosen `CapabilityPackage[]` aus
> Abschnitt 5 sind dort erledigt, und die Aussage „Niveau B und C sind unerreichbar"
> ist überholt.
>
> **Ursprünglich:** Einstiegsdokument nach `2026-08-10-handover-nach-phase-8.md`. Es beschreibt,
> was seither entstanden ist und was bewusst liegen blieb. Der Plan selbst
> (`2026-08-10-entitaets-startstrecke-und-personas.md`) enthält die Messprotokolle und die
> Korrekturen, die während der Ausführung nötig wurden — er ist die Detailquelle, nicht dieses
> Dokument.

---

## 1. Wo die Arbeit liegt

| | |
|---|---|
| **Branch** | `entity-start-path`, gepusht |
| **PR** | [#11](https://github.com/cmarkus42-rgb/cipher-keel-electron/pull/11) — offen, Ziel `phase-8-packaging` |
| **Darunter** | [#10](https://github.com/cmarkus42-rgb/cipher-keel-electron/pull/10) Phase 8, ebenfalls offen |
| **Umfang** | 55 Commits, 95 Dateien, +7785 / −74 |
| **Testsuite** | 1788 grün / 128 Dateien · Typecheck sauber · Lint sauber |

**Merge-Reihenfolge ist mechanisch festgelegt:** #11 zielt auf `phase-8-packaging`, kann also
erst nach #10 gemergt werden. Sobald #10 landet, zielt GitHub #11 automatisch auf `main` um.

---

## 2. Was jetzt anders ist

Vorher öffnete `session:create` eine **leere tmux-Shell**. Die App hat nie einen Agenten
gestartet: `opts.command` wurde nur gesendet, wenn ein Aufrufer es setzte, und der einzige echte
Aufrufer schickte nur `{ entityId }`.

Jetzt baut sie aus vier Schichten — Body, Capabilities, Persona, GlobalRules — einen Prompt,
schreibt ihn pro Session unter `userData`, materialisiert 32 Capability-Dateien ins Projekt und
startet `claude --append-system-prompt-file`.

Die Kernaussage des Vorgänger-Handovers hat sich bestätigt: **Es war keine Verdrahtungsaufgabe.**
`assembleEntityClaudeMd` hatte keinen Aufrufer, weil die konsumierten Schichten fehlten — zwei
von vier Presets ohne Body, Personas die immer `null` lieferten, keine Registry.

---

## 3. Entscheidungen dieser Session — und wer sie getroffen hat

| Entscheidung | Von wem | Konsequenz |
|---|---|---|
| `session:create` startet `claude` selbst | Nutzer | Größter Verhaltenssprung seit Wave 4 |
| `--dangerously-skip-permissions` an ConfigStore, **Default `true`** | Nutzer | War vorher im Adapter hartcodiert und *gar nicht* schaltbar — der Zustand ist offener als vorher, nicht geschlossener |
| Markdown per Vite-`?raw` ins Bundle statt Kopierschritt | Nutzer | Kein asar-Problem, keine Änderung an `build.files` |
| Kein Gerüstcode, um einen Nachweis grün zu bekommen | Nutzer | Der Bündel-Nachweis wanderte zweimal, statt `main.ts` ein Re-Export zu verpassen |
| Config-Reader injizieren statt im Adapter holen | Nutzer | `defaultConfigReader`, lazy `require` und ein Test, der Nodes Modulauflösung patchte, sind ersatzlos weg |
| `companion-memory-tools` gestrichen | Nutzer | Beschrieb MCP-Tools, die es nur im Mux gibt |
| `command`-Feld aus der IPC-Oberfläche entfernt | Nutzer | Umging die Quotierung, hatte null Nutzer |
| GlobalRules müssen auf allen Ebenen wirken | Nutzer | Niveau C bekommt einen Satz, nicht eine gekürzte Liste |
| Testing Assistant als fünftes Preset | Nutzer | Verschiebt den ratifizierten 0.1-Schnitt um eins |
| `rolling-summary` **nicht** für den Testing Assistant | Nutzer | M5 §9.5 führt ihn nicht als langlaufend, und es gab keine Konfiguration |
| Zweitrechner-Test ist **kein Push-Blocker** | Nutzer, 2026-08-11 | Siehe Abschnitt 6 — die Abnahme bleibt offen, nur das Push-Gate fällt |

---

## 4. Was belegt ist — und was Tests nicht belegen können

Kein Test dieses Repos erreichte je einen `ipcMain`-Handler. Deshalb wurde dreimal in der
laufenden App gemessen, jedes Mal über den echten Nutzerweg mit `{ entityId }` und **nie** mit
selbst gesetztem `command` — genau der Parameter hatte in Phase 8 einen wertlosen Beweis erzeugt.

1. **Startstrecke** — Prompt-Datei mit Body, Persona, GlobalRules, `0` Capability-Referenzen
   (korrekt, es existierte noch keine `SKILL.md`). Architect **und** Workshop, weil letzterer
   seinen Rahmen aus einer Fabrik bezieht und seine Persona über den Defaults-Fallback.
2. **Materialisierung** — `7` Referenzen und sieben Verzeichnisse im Projekt.
3. **Katalog** — Session per Klick im Launcher gestartet; die Antwort trug wörtlich
   „Ich fixe nicht." / „Ich ändere keinen Code."

Die erzeugten Prompt-Dateien wurden jeweils **selbst geöffnet**, nicht den Berichten geglaubt.

**Eine Grundannahme ist dabei gefallen:** `tests/session/session-create-claude-gate.test.ts`
erreicht per `vi.doMock('electron')` den echten `ipcMain`-Handler. Der Satz „grüne Tests sagen
über die Verdrahtung nichts" gilt für diesen Pfad nicht mehr, und das Muster steht als
Präzedenzfall im Repo.

---

## 5. Offene Punkte — nach Dringlichkeit, für eine Polishing-Session

### Zuerst, weil es die Form ist, gegen die dieser Plan angetreten ist

- **Drei neue `CapabilityPackage[]` ohne Produktionsaufrufer.** `SE_PACKAGES`,
  `WORKSHOP_PACKAGES`, `TA_PACKAGES` sind schema-validiert und testgedeckt — und die Laufzeit
  liest die String-Listen daneben. Die ganze `CapabilityPackage`-Maschinerie
  (`capability-tree`, `capability-loader`, `capability-lint`) ist nur aus Tests erreichbar;
  `capability-loader` würde einen relativen Pfad lesen, den es im Paket nicht gibt.
  **Dieser Plan hat die Form, die er beseitigen wollte, dreimal neu erzeugt.** Entweder
  anschließen oder streichen — aber nicht liegen lassen.
- **`se-gate-urteil.ts` und `se-trigger.ts`: getestet, kein Aufrufer.** Dieselbe Form, älter.
  `trigger-zeiger-format/SKILL.md` musste bereits korrigiert werden, weil es Garantien
  versprach, die nur die aufruferlose Funktion liefert.

### Danach, weil es sichtbar wird, sobald jemand Niveaus benutzt

- **Niveau B und C sind unerreichbar.** `getEntityDefinition` wird ohne Niveau gerufen, jede
  Session ist A. `RULES_B`/`RULES_C`, die C-Kappung, alle B/C-Capability-Listen und die
  per-Entität-Niveau-Prosa der geteilten `rolling-summary` sind ungelesen. Nichts ist kaputt —
  aber die sorgfältige Dreiteilung hat heute keinen Aufrufer.
- **`resolvePersona`s Nutzerverzeichnis-Zweig ebenso:** `personasDir` wird nie übergeben.

### Kleinigkeiten mit Aufräumwert

- Prompt-Dateien häufen sich: kein Startup-Sweep, `SESSION_DESTROY` überspringt das Aufräumen,
  wenn `killSession` wirft, und eine Datei vor einem fehlgeschlagenen tmux-Connect bleibt liegen.
- `console.warn` für fehlende Capabilities ist in der gepackten App unsichtbar. Kann heute nicht
  feuern, weil Materialisierung und Auflösung dieselbe feste Liste lesen.
- Drei Kodierungen desselben Capability-Pfads (`capability-refs.ts`, `assemble-entity.ts`, das
  `pfad`-Feld jedes Pakets), keine referenziert die andere.
- Vier Workshop-`SKILL.md` und `ta-body.md`s `## Negative Grenzen` sprechen die Entität in der
  dritten Person an, während 26 von 32 Dateien „du" sagen — ausgerechnet der Abschnitt, der am
  härtesten binden soll, redet über jemand anderen.
- Kleinere veraltete Stellen: `cf-body.md` sagt „kein Orchestrator" bei Niveau C, während
  `cf-preset.ts` `orchestrierung: true` auf allen Niveaus setzt; `adversarial-probing` zitiert
  eine Pack-Datei, die im Repo nicht existiert; `suite-lauf-protokoll` beschreibt einen Schritt,
  der nach sich selbst passiert.

### Braucht eine Entscheidung, keine Reparatur

- **`model: 'heavy'` bildet auf keine Claude-Model-ID ab.** `session:create` lässt `model` weg,
  statt einen Wert durchzureichen, der den Start bricht. Jede Session läuft auf dem
  Harness-Default, unabhängig davon, was ihr Preset verlangt. Als README-Einschränkung
  dokumentiert. Eine Übersetzungstabelle ist eine inhaltliche Entscheidung.
- **Die Niveau-C-Obergrenze steht dreimal mit drei Werten:** 500 in `capability-lint.ts`
  (pro Paket), 800 in einem Kommentar in `architect-capabilities.ts`, 2000 in `D13_HINWEIS`
  (ganze Datei). Das sind zwei Geltungsbereiche und ein Widerspruch — keine der drei Stellen
  sagt, worauf sie sich bezieht.
- **`agent.skipPermissions` hat keine Oberfläche.** Der Schalter, auf dem eine
  sicherheitsrelevante Entscheidung ruht, ist nur durch Editieren der Config-Datei erreichbar.
  Im README dokumentiert.
- **`item-dispatch` hat zwei unversöhnte Mechanismen** (`routing.ts` dreiwegig,
  `workshop-fixing-dispatch.ts` zweiwegig). Die `SKILL.md` beschreibt beide, statt einen zu
  küren — bewusst.
- **Die Projektliste aktualisiert sich nach `project:kickoff` nicht.** Zweimal umgangen, beide
  Male außerhalb des Scopes. Deckt sich mit einer ungeprüften Beobachtung aus Phase 8.

---

## 6. Was ausdrücklich **nicht** erledigt ist

**Das Abnahmekriterium von Phase 8 steht weiterhin offen:** Erst-Start auf einem zweiten
Apple-Silicon-Mac ohne Entwicklungsumgebung. Der Nutzer hat es am 2026-08-11 als *Push-Gate*
aufgehoben — nicht als Abnahmekriterium. **Weder PR #10 noch PR #11 sind ein Beleg dafür, dass
dieser Test bestanden wurde.** Wer später liest, dass beides gepusht wurde, darf das nicht als
Abnahme lesen.

Ebenso unverändert: **kein Release, kein Tag** (Nutzer-Entscheidung 2026-08-09).

---

## 7. Fallen, die weiterhin Zeit kosten

**Die native ABI-Falle.** `better-sqlite3` liegt zweimal im `node_modules`. Jede
Abhängigkeitsoperation kann eine Seite zerstören; Symptom sind rund 497 fallende Tests bei
unverändertem Code. Gegenmittel `npm run rebuild-native`, **nie** eine Quelldatei ändern. In
dieser Session nicht zugeschnappt, aber das sagt nichts über die nächste.

**Der Bündel-Wächter ist jetzt Pflicht, nicht Kür.** `npm run verify:bundle` läuft in CI hinter
dem Build. Wer eine neue Markdown-Datei per `?raw` einbindet und keinen Marker setzt, bekommt
keinen Fehler — die Datei fährt dann ungeschützt mit. Marker müssen ASCII und frei von
Anführungszeichen sein: der Text landet als JS-String-Literal im Bundle.

**Die geteilte `rolling-summary`-Datei hat drei Konsumenten mit drei verschiedenen
Niveau-Regeln.** Architect nur A, Systems Engineer ab B, Workshop auf allen dreien. Zweimal ist
diese Datei in Reviews aufgefallen, weil sie für einen Konsumenten falsch war. Wer einen vierten
hinzufügt, muss sie anfassen.

**Ein Kommentar kann falscher sein als der Code darunter.** `niveau-config.ts:49` behauptete über
die Liste zwei Zeilen tiefer das Gegenteil dessen, was dort stand — und der Fehler wanderte über
meinen Plan in einen Wächter-Test, der ihn danach verteidigt hätte. Bei Widerspruch gilt die
Liste, nicht der Kommentar.

**Sprachregel.** Code-Kommentare, Bezeichner und Testnamen **englisch**; Prompt-Inhalte
(Bodies, Personas, `SKILL.md`, GlobalRules) und die Dokumente unter `docs/superpowers/plans/`
**deutsch**.

---

## 8. Was zuerst zu lesen ist

1. Dieses Dokument
2. `2026-08-10-entitaets-startstrecke-und-personas.md` — der Plan mit den Messprotokollen und
   allen Korrekturen, die während der Ausführung nötig wurden
3. `2026-08-10-handover-nach-phase-8.md` — der Vorgänger, weiterhin gültig für Phase 8
4. `cipher-keel-entitaeten-ideation/deliverables/nachtrag-prompt-uebergabe_2026-08-11.md` —
   acht Konzept-Divergenzen, außerhalb des Repos, wie die Projektregel es verlangt
5. `2026-08-06-fertigstellung-roadmap.md` — Phase 9 (NFR-Messung) ist jetzt möglich, Phase 10
   (Adapter-Garten) war laut Roadmap genau von dieser Prompt-Assemblierung blockiert und ist es
   nicht mehr

> **Nicht lesen:** `HANDOFF.md` im Wurzelverzeichnis. Endet am 2026-06-05 bei Wave 4.
