# Entitäts-Startstrecke und Persona-Katalog — Implementierungsplan

> **Für agentische Worker:** ERFORDERLICHE SUB-SKILL: `superpowers:subagent-driven-development`
> (empfohlen) oder `superpowers:executing-plans`, um diesen Plan Task für Task umzusetzen.
> Schritte tragen Checkbox-Syntax (`- [ ]`) zur Nachverfolgung.

**Ziel:** Eine über die Oberfläche gestartete Session bekommt nachweislich ihren
zusammengebauten Entitäts-Prompt — und der Katalog wächst um den Testing Assistant.

**Architektur:** `session:create` startet heute nur eine leere Shell. Die Startstrecke wird
vollständig gemacht: eine Registry bildet `entityId` auf Rahmen, Body und Persona ab; Markdown
wird per Vite-`?raw` in den Main-Bundle einkompiliert (kein `fs` zur Laufzeit, kein asar-Problem);
`assembleEntityClaudeMd` schreibt eine Prompt-Datei pro Session unter `userData`; der Start läuft
über `ClaudeCodeAdapter.buildLaunchCommand()` mit `--append-system-prompt-file`. Danach werden die
Capability-SKILL.md-Dateien preset-weise geschrieben, zuletzt kommt der Testing Assistant dazu.

**Tech-Stack:** TypeScript, Electron 32, electron-vite (Rollup), vitest, tmux, Claude Code CLI 2.1.221

---

## Globale Randbedingungen

- **Branch:** `phase-8-packaging`. Nicht auf `main` arbeiten — PR #10 ist offen.
- **Baseline, gemessen am 2026-08-10:** 1541 Tests / 107 Dateien grün, `npm run typecheck` und
  `npm run lint` ohne Ausgabe. Jeder Task endet auf mindestens diesem Stand.
- **Sprachregel:** Code-Kommentare, Bezeichner und Testnamen **englisch**. Dokumente unter
  `docs/superpowers/plans/` **deutsch**. Der Inhalt der Entitäts-Bodies und der SKILL.md-Dateien
  ist **deutsch** — das sind Prompts für den Nutzer-Agenten, kein Code.
- **Native-ABI-Falle:** `better-sqlite3` liegt zweimal im `node_modules`. Bricht die Testsuite mit
  ~497 Fehlern bei unverändertem Code, ist die Ursache immer die ABI — Gegenmittel
  `npm run rebuild-native`, **nie** eine Quelldatei ändern.
- **Kein Test dieses Repos erreicht einen `ipcMain`-Handler.** Es gibt kein `vi.mock('electron')`.
  Grüne Tests sind kein Beleg für Verdrahtung. Beleg liefert nur `.claude/skills/run-keel/`.
- **Nach jedem App-Lauf `tmux list-sessions` prüfen und selbst aufräumen.** `stop.sh` meldet
  „tmux sessions removed: 0" auch dann, wenn eine von der App erzeugte Session noch läuft.
- **Umlaute:** Die bestehenden Bodies schreiben teils `ae/oe/ue` (`Vertraege`, `schnueren`). Neue
  Dateien schreiben echte Umlaute; bestehende werden **nicht** umgeschrieben (kein Beifang).

## Bereits entschieden — nicht neu verhandeln

| Entscheidung | Von wem | Konsequenz |
|---|---|---|
| Prompt geht als Datei an `claude --append-system-prompt-file`, nie in eine Projekt-`CLAUDE.md` | Nutzer 2026-08-10 | Task 6, Task 7 |
| `session:create` startet `claude` künftig selbst | Nutzer 2026-08-10 | Task 7 — größter Verhaltenssprung der App seit Wave 4 |
| `--dangerously-skip-permissions` an ConfigStore, **Default `true`** | Nutzer 2026-08-10 | Task 6. Achtung: `config.agent.skipPermissions` existiert bereits mit Default **`false`** (`config-store.ts:68`) und wird von niemandem gelesen; der Adapter hardcodet `true`. Der Default wird auf `true` geändert. |
| Markdown per Vite-`?raw` in den Bundle inlined | Nutzer 2026-08-10 | Task 1 |
| SKILL.md-Dateien werden geschrieben, **preset-weise in Verdrahtungsreihenfolge** | Nutzer 2026-08-10 | Phase B |
| `companion-memory-tools` fliegt aus der SE-Liste | Nutzer 2026-08-10 | Task 12 — Companion ist zurückgestellt, die Capability beschreibt MCP-Tools, die keel nicht hat |
| Companion und Release Manager werden **nicht** gebaut | Nutzer 2026-08-10 | M5 delegiert das Companion-Capability-Set an M2; M5 nennt den Release Manager ausdrücklich undetailliert |
| Fünfte Persona ist der Testing Assistant | Empfehlung, vom Nutzer übernommen | Phase C |

## Ausgangslage — am 2026-08-10 im Code nachgemessen

Das Personas-Handover nennt fünf Lücken. Alle fünf bestätigt. Drei Befunde kommen hinzu, zwei
davon ändern den Zuschnitt:

- **Die App startet überhaupt keinen Agenten.** `ipc-handlers.ts:162` reicht `opts.command` an
  `tmux.createSession` durch; `tmux-manager.ts:251` legt nur dann ein `send-keys` nach, wenn das
  Feld gesetzt ist — und der einzige echte Aufrufer (`src/renderer/index.tsx:54`) schickt nur
  `{ entityId }`. Jede Session ist heute eine leere Shell. `AdapterRegistry` hat außerhalb von
  `src/main/agent/` null Konsumenten.
- **Es gibt keinen Asset-Pfad für Markdown.** `electron.vite.config.ts` bündelt nur
  `src/main/main.ts`; `dist/main/` enthält genau `index.js`. `build.files` erlaubt nur `dist/**`.
  Ein neu angelegtes `src/main/preset/shared/personas/` wäre zur Laufzeit nicht vorhanden —
  `__dirname` ist `dist/main`, im Paket in `app.asar`. Schritte 1 und 3 des Handovers laufen ohne
  Task 1 ins Leere.
- **28 Capability-IDs, keine einzige SKILL.md.** Architect (7) und Cyber Factory (8) definieren
  `CapabilityPackage`-Objekte mit `pfad`; Systems Engineer und Workshop führen ihre Capabilities
  **nur als String-Listen** — für 13 Namen existiert nicht einmal ein Pfad. Beide Mux-Checkouts
  und der cyber-factory-pack durchsucht: keiner der 28 Namen kommt dort vor, es gibt dort
  überhaupt keine `SKILL.md`. Genau 2 der 15 Pakete haben ein `niveauCExtrakt`.

## Dateistruktur

| Datei | Verantwortung | Task |
|---|---|---|
| `src/main/assets.d.ts` | Modul-Deklaration für `*.md?raw`, damit `tsc` die Importe kennt | 1 |
| `src/main/preset/bodies.ts` | Alle Preset-Bodies als eingebundene Strings, ein Export je Preset | 1, 2 |
| `src/main/preset/systems-engineer/se-body.md` | Body des Systems Engineer (M5 §4) | 2 |
| `src/main/preset/workshop/workshop-body.md` | Body des Workshop (M5 §8.5) | 2 |
| `src/main/preset/shared/personas/cipher.md` | Persona Cipher, portiert aus dem Pack | 3 |
| `src/main/preset/shared/personas/theaitetos.md` | Persona Theaitetos, portiert aus dem Pack | 3 |
| `src/main/preset/shared/persona-loader.ts` | ergänzt um eingebundene Personas; `loadPersona()` bleibt für nutzereigene | 3 |
| `src/main/preset/registry.ts` | `entityId` → `{ rahmen, body, persona }`; behandelt Konstante und Fabrik gleich | 4 |
| `src/main/preset/systems-engineer/se-preset.ts` | ergänzt um `createSERahmen(niveau)` | 4 |
| `src/main/session/prompt-file.ts` | Prompt-Datei pro Session unter `userData` schreiben und aufräumen | 5 |
| `src/main/session/capability-refs.ts` | nur existierende Capability-Refs ausgeben, fehlende sichtbar melden | 5 |
| `src/main/util/shell-quote.ts` | `{cmd, args}` in eine tmux-taugliche Shell-Zeile, injektionssicher | 7 |
| `src/main/agent/adapters/claude-code.ts` | `appendSystemPromptFile` in `buildLaunchCommand`; ConfigStore statt Hardcode | 6, 7 |
| `src/main/agent/agent-adapter.ts` | `LaunchOpts.appendSystemPromptFile` | 6 |
| `src/main/config/config-store.ts` | `agent.skipPermissions` Default auf `true` | 6 |
| `src/main/ipc-handlers.ts:130-178` | `session:create` komponiert Registry → Assemblierung → Prompt-Datei → Start | 7 |
| `src/main/preset/<preset>/capabilities/<id>/SKILL.md` | je Capability eine Instruktionsdatei | 10–13 |
| `src/main/preset/systems-engineer/se-capabilities.ts` | ergänzt um `CapabilityPackage`-Objekte | 12 |
| `src/main/preset/workshop/workshop-capabilities.ts` | neu: `CapabilityPackage`-Objekte für den Workshop | 13 |
| `src/main/preset/testing-assistant/*` | fünftes Preset | 14–15 |
| `src/shared/preset-catalog.ts` | fünfter Eintrag, Prosa des ratifizierten Schnitts nachgezogen | 15 |

---

# Phase A — Die Startstrecke

Kein neues Preset, bis eine Session nachweislich ihren Prompt bekommt.

---

### Task 1: Markdown zur Laufzeit verfügbar machen

Ohne diesen Task sind alle folgenden Body- und Persona-Dateien tote Dateien im Repo: Rollup
bündelt nur TypeScript, `dist/main/` enthält heute genau `index.js`.

**Dateien:**
- Erstellen: `src/main/assets.d.ts`
- Erstellen: `src/main/preset/bodies.ts`
- Erstellen: `tests/preset/bodies.test.ts`

**Schnittstellen:**
- Konsumiert: nichts
- Produziert: `ARCHITECT_BODY: string`, `CF_BODY: string` aus `src/main/preset/bodies.ts`.
  Task 2 ergänzt `SE_BODY` und `WORKSHOP_BODY`, Task 4 liest alle vier.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`tests/preset/bodies.test.ts`:

```typescript
// tests/preset/bodies.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ARCHITECT_BODY, CF_BODY } from '../../src/main/preset/bodies'

const SRC = path.join(__dirname, '../../src/main/preset')

describe('preset bodies are compiled into the bundle', () => {
  it('ARCHITECT_BODY matches the source file byte for byte', () => {
    const onDisk = fs.readFileSync(path.join(SRC, 'architect/architect-body.md'), 'utf-8')
    expect(ARCHITECT_BODY).toBe(onDisk)
  })

  it('CF_BODY matches the source file byte for byte', () => {
    const onDisk = fs.readFileSync(path.join(SRC, 'cyber-factory/cf-body.md'), 'utf-8')
    expect(CF_BODY).toBe(onDisk)
  })

  it('bodies are non-empty', () => {
    expect(ARCHITECT_BODY.length).toBeGreaterThan(100)
    expect(CF_BODY.length).toBeGreaterThan(100)
  })
})
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `npx vitest run tests/preset/bodies.test.ts`
Erwartet: FAIL — `Failed to resolve import "../../src/main/preset/bodies"`.

- [ ] **Schritt 3: Die Modul-Deklaration schreiben**

`src/main/assets.d.ts`:

```typescript
/**
 * Vite `?raw` imports — markdown compiled into the main bundle as a string.
 *
 * The main process is bundled by rollup into a single dist/main/index.js and
 * packaged into app.asar. Reading markdown via fs at runtime would need both a
 * copy step and an asar-aware path; inlining avoids both.
 */
declare module '*.md?raw' {
  const content: string
  export default content
}
```

- [ ] **Schritt 4: Das Body-Modul schreiben**

`src/main/preset/bodies.ts`:

```typescript
/**
 * Preset bodies — the core instruction text of each entity.
 *
 * Inlined at build time via Vite's `?raw` so the main bundle carries them.
 * There is no asset copy step: dist/main holds index.js only.
 */

import architectBody from './architect/architect-body.md?raw'
import cfBody from './cyber-factory/cf-body.md?raw'

export const ARCHITECT_BODY: string = architectBody
export const CF_BODY: string = cfBody
```

- [ ] **Schritt 5: Test laufen lassen, Erfolg bestätigen**

Ausführen: `npx vitest run tests/preset/bodies.test.ts`
Erwartet: PASS, 3 Tests.

- [ ] **Schritt 6: Typecheck und Lint**

Ausführen: `npm run typecheck && npm run lint`
Erwartet: beide ohne Ausgabe. Schlägt der Typecheck mit
`Cannot find module './architect/architect-body.md?raw'` fehl, liegt `assets.d.ts` nicht im
`include` von `tsconfig.node.json` — es deckt `src/main/**/*` ab, die Datei muss also genau dort
liegen.

- [ ] **Schritt 7: Den Bündel-Nachweis *nicht* hier führen**

> **Korrektur am 2026-08-10, nach dem Review von Task 1.** Der ursprüngliche Schritt 7 verlangte
> `npm run build && grep -c "Du bist der Architect" dist/main/index.js` mit der Erwartung `≥ 1`.
> Dieser Nachweis ist in Task 1 **nicht führbar**: `rollupOptions.input` des Hauptprozesses ist
> genau `src/main/main.ts`, und Rollup wirft ein Modul, das von dort aus niemand erreicht, aus dem
> Bundle. `bodies.ts` hat in Task 1 noch keinen Konsumenten. Der Nachweis war also nur zu bestehen,
> indem man `main.ts` ein Gerüst-Re-Export verpasst — Produktionscode ohne fachlichen Zweck, den
> später niemand zu entfernen gezwungen ist.
>
> **Entscheidung (Nutzer):** Kein Gerüst. Der Nachweis wandert nach Task 4, wo die Registry die
> Bodies echt importiert und der `grep` deshalb etwas über den Produktionspfad aussagt.
> `src/main/main.ts` wird in Task 1 **nicht angefasst**.

Task 1 endet mit den drei geplanten Dateien. Die Unit-Tests aus Schritt 5 belegen, dass der
`?raw`-Import auflöst; dass er das Bündeln überlebt, belegt Task 4.

- [ ] **Schritt 8: Committen**

```bash
git add src/main/assets.d.ts src/main/preset/bodies.ts tests/preset/bodies.test.ts
git commit -m "feat(preset): inline preset bodies into the main bundle via ?raw"
```

---

### Task 2: Bodies für Systems Engineer und Workshop

Inhaltliche Arbeit, kein Klebstoff. Zwei von vier Presets haben heute keinen Body — jede
Verdrahtung ohne diesen Task täte für die Hälfte des Katalogs still nichts.

**Dateien:**
- Erstellen: `src/main/preset/systems-engineer/se-body.md`
- Erstellen: `src/main/preset/workshop/workshop-body.md`
- Ändern: `src/main/preset/bodies.ts`
- Erstellen: `tests/preset/systems-engineer/se-body.test.ts`
- Erstellen: `tests/preset/workshop/workshop-body.test.ts`
- Ändern: `tests/preset/bodies.test.ts`

**Schnittstellen:**
- Konsumiert: `src/main/preset/bodies.ts` aus Task 1
- Produziert: `SE_BODY: string`, `WORKSHOP_BODY: string`

**Inhaltsquelle:** `/Users/Shared/Nextcloud/Claude/cipher-keel-entitaeten-ideation/deliverables/konzept_v1.1.md`
— §4 für den SE (Zeilen 67–85), §8.5 für den Workshop (Zeilen 149–155).
**Formvorlage:** `src/main/preset/architect/architect-body.md`, 42 Zeilen, Abschnitte
`# <Rolle>` / Einleitungsabsatz / `## Kernaufgaben` / `## Arbeitsablauf` / `## Negative Grenzen` /
`## Niveau-Hinweise`. Diese Gliederung wird übernommen, damit alle vier Bodies dieselbe Form haben.

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

`tests/preset/systems-engineer/se-body.test.ts`:

```typescript
// tests/preset/systems-engineer/se-body.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const BODY_PATH = path.join(__dirname, '../../../src/main/preset/systems-engineer/se-body.md')

describe('Systems Engineer Body (M5 section 4)', () => {
  let body: string

  beforeEach(() => {
    body = fs.readFileSync(BODY_PATH, 'utf-8')
  })

  it('exists and is non-empty', () => {
    expect(body.length).toBeGreaterThan(100)
  })

  it('contains the standard sections', () => {
    expect(body).toContain('## Kernaufgaben')
    expect(body).toContain('## Arbeitsablauf')
    expect(body).toContain('## Negative Grenzen')
    expect(body).toContain('## Niveau-Hinweise')
  })

  it('names the three M4 burdens', () => {
    expect(body).toMatch(/Steuer-Überblick/i)
    expect(body).toMatch(/Gate-Urteil/i)
    expect(body).toMatch(/Quereinstieg/i)
  })

  it('states the trigger model — no entity-to-entity handoffs', () => {
    expect(body).toMatch(/kein.*Entität-zu-Entität/i)
  })

  it('forbids executing work itself', () => {
    expect(body).toMatch(/schreibt keinen Code|führt nicht aus/i)
  })

  // Corrected 2026-08-10 after the Task 2 review: the original assertion was
  // toContain('Orchestrierung'), which passes on any stray mention of the word and
  // never checks the distinction the test is named after.
  it('separates Fuehrung from Orchestrierung', () => {
    expect(body).toMatch(/Führung[\s\S]{0,400}Orchestrierung|Orchestrierung[\s\S]{0,400}Führung/)
  })
})
```

`tests/preset/workshop/workshop-body.test.ts`:

```typescript
// tests/preset/workshop/workshop-body.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const BODY_PATH = path.join(__dirname, '../../../src/main/preset/workshop/workshop-body.md')

describe('Workshop Body (M5 section 8.5)', () => {
  let body: string

  beforeEach(() => {
    body = fs.readFileSync(BODY_PATH, 'utf-8')
  })

  it('exists and is non-empty', () => {
    expect(body.length).toBeGreaterThan(100)
  })

  it('contains the standard sections', () => {
    expect(body).toContain('## Kernaufgaben')
    expect(body).toContain('## Arbeitsablauf')
    expect(body).toContain('## Negative Grenzen')
    expect(body).toContain('## Niveau-Hinweise')
  })

  it('names the convergent flow steps', () => {
    expect(body).toMatch(/aufnehmen/i)
    expect(body).toMatch(/klassifizieren/i)
    expect(body).toMatch(/dispatch/i)
    expect(body).toMatch(/konsolidier/i)
  })

  it('claims routing authority inside the fixing phase', () => {
    expect(body).toMatch(/Routing-Hoheit/i)
    expect(body).toMatch(/informiert.*Systems Engineer|SE.*informiert/i)
  })

  it('forbids cross-phase coordination', () => {
    expect(body).toMatch(/keine phasenübergreifende Koordination/i)
  })

  // Corrected 2026-08-10 after the Task 2 review: /Debugger/i also matched the
  // Debugger's earlier mention as a dispatch target, so the prohibition itself
  // was never asserted.
  it('forbids deep single-bug analysis (Debugger territory)', () => {
    expect(body).toMatch(/(keine|kein).{0,40}(Tiefen-?Analyse|Einzel-?Bug)[\s\S]{0,120}Debugger/i)
  })
})
```

- [ ] **Schritt 2: Tests laufen lassen, Fehlschlag bestätigen**

Ausführen: `npx vitest run tests/preset/systems-engineer/se-body.test.ts tests/preset/workshop/workshop-body.test.ts`
Erwartet: FAIL — `ENOENT: no such file or directory`.

- [ ] **Schritt 3: `se-body.md` schreiben**

Aus M5 §4. Die Datei muss diese Aussagen tragen, in der Form der Vorlage:

- *Identität:* projektführende Rolle, „der gute Geist des Projektes", querliegend unter der
  ganzen Phasenkette, keel-Ebene.
- *Kernaufgaben:* (1) Steuer-Überblick als aggregierende Graph-Abfrage über Subsystem-Stränge,
  Phasenposition, offene Gates. (2) Inhaltliches Urteil an den Traceability-Gates — struktureller
  Befund und Plausibilitäts-Befund werden **getrennt geführt und bewusst nicht verrechnet**; das
  Gewichten ist die Rolle. (3) Quereinstiegs-Entscheidungen. (4) Handoff-Logik: jede produktive
  Entität wird vom SE getriggert, liest Input aus dem Graphen, schreibt Output dorthin zurück.
- *Arbeitsablauf:* Trigger trägt einen **zugeschnittenen Zeiger** (welcher Input, welches
  Subsystem), nicht ein blankes „du bist dran".
- *Negative Grenzen:* bearbeitet keine Phase, schreibt keinen Code, führt keine
  Entität-zu-Entität-Handoffs ein, greift nicht in die phasen-interne Orchestrierung von CF,
  Workshop und Debugger ein.
- *Niveau-Hinweise:* A volles Set; B ohne `steuer-ueberblick-tool` und
  `graph-navigation-advanced`; C nur `se-core-identity`, Bedienhilfe-Modus.

Länge in der Größenordnung der Vorlage (40–60 Zeilen). Keine Sätze über den Companion — er ist
zurückgestellt.

- [ ] **Schritt 4: `workshop-body.md` schreiben**

Aus M5 §8.5 und §7. Erforderliche Aussagen:

- *Identität:* die konvergente Orchestrator-/Bugfixer-Entität; Bugfixing und Orchestrierung sind
  **dasselbe Pattern unter verschiedenen Anlässen** — ein Flow, nicht zwei Implementierungen.
- *Kernaufgaben:* Items aufnehmen, klassifizieren, dispatchen (darunter der Debugger und bei
  Bedarf die Cyber Factory), Worker steuern, Status konsolidieren.
- *Routing-Hoheit:* entscheidet pro Item selbst — intern, Debugger oder CF-Eskalation. Der SE wird
  **informiert, entscheidet nicht**. Routing-Entscheidungen werden als Graph-Knoten dokumentiert.
  Vor CF-Eskalationen informiert der Workshop den SE per Graph-Knoten, ohne Wartepflicht.
- *Negative Grenzen:* keine phasenübergreifende Koordination, keine Architektur, keine Specs,
  keine Tiefen-Analyse eines einzelnen Bugs.
- *Niveau-Hinweise:* A 7 Pakete/max 5 parallel; B 6 Pakete/max 3; C 5 Pakete/max 1, keine
  Sub-Sessions, Completeness-Check als Checkpoint-Prompt. Werte aus
  `src/main/preset/workshop/niveau-config.ts` — vor dem Schreiben dort nachsehen und exakt
  übernehmen, nicht aus dem Gedächtnis.

- [ ] **Schritt 5: Tests laufen lassen, Erfolg bestätigen**

Ausführen: `npx vitest run tests/preset/systems-engineer/se-body.test.ts tests/preset/workshop/workshop-body.test.ts`
Erwartet: PASS. Fällt eine Zusicherung durch, fehlt die Aussage im Body — den Body ergänzen,
nicht den Test abschwächen.

- [ ] **Schritt 6: Bodies ins Bundle-Modul aufnehmen**

`src/main/preset/bodies.ts` ergänzen:

```typescript
import seBody from './systems-engineer/se-body.md?raw'
import workshopBody from './workshop/workshop-body.md?raw'

export const SE_BODY: string = seBody
export const WORKSHOP_BODY: string = workshopBody
```

Und in `tests/preset/bodies.test.ts` zwei Zusicherungen nach demselben Muster ergänzen:

```typescript
it('SE_BODY matches the source file byte for byte', () => {
  const onDisk = fs.readFileSync(path.join(SRC, 'systems-engineer/se-body.md'), 'utf-8')
  expect(SE_BODY).toBe(onDisk)
})

it('WORKSHOP_BODY matches the source file byte for byte', () => {
  const onDisk = fs.readFileSync(path.join(SRC, 'workshop/workshop-body.md'), 'utf-8')
  expect(WORKSHOP_BODY).toBe(onDisk)
})
```

Der Import oben in der Testdatei wird auf
`import { ARCHITECT_BODY, CF_BODY, SE_BODY, WORKSHOP_BODY } from '../../src/main/preset/bodies'`
erweitert.

- [ ] **Schritt 7: Volle Suite, Typecheck, Lint**

Ausführen: `npm test && npm run typecheck && npm run lint`
Erwartet: alle Tests grün (Baseline + neue), keine Typ- oder Lint-Ausgabe.

- [ ] **Schritt 8: Committen**

```bash
git add src/main/preset/systems-engineer/se-body.md src/main/preset/workshop/workshop-body.md \
        src/main/preset/bodies.ts tests/preset/systems-engineer/se-body.test.ts \
        tests/preset/workshop/workshop-body.test.ts tests/preset/bodies.test.ts
git commit -m "feat(preset): add Systems Engineer and Workshop bodies"
```

---

### Task 3: Personas hinterlegen

`DEFAULT_PERSONAS_DIR` zeigt auf `path.join(__dirname, 'personas')` — ein Verzeichnis, das nicht
existiert; `loadPersona()` liefert damit immer `null`. Zur Laufzeit ist `__dirname` ohnehin
`dist/main`, ein Verzeichnis im Quellbaum würde die Lücke also nicht schließen. Die
mitgelieferten Personas werden deshalb eingebunden; `loadPersona()` bleibt unverändert für
nutzereigene Persona-Verzeichnisse.

**Dateien:**
- Erstellen: `src/main/preset/shared/personas/cipher.md`
- Erstellen: `src/main/preset/shared/personas/theaitetos.md`
- Ändern: `src/main/preset/shared/persona-loader.ts`
- Erstellen: `tests/preset/builtin-personas.test.ts`

Die bestehenden 25 Tests in `tests/persona-loader.test.ts` (im Wurzelverzeichnis von `tests/`,
nicht unter `tests/preset/`) decken `loadPersona()` und `getDefaultPersona()` ab und bleiben
unverändert — dieser Task ergänzt, er baut nicht um.

**Schnittstellen:**
- Konsumiert: `PERSONA_DEFAULTS` und `getDefaultPersona(presetId)` aus `persona-loader.ts`
- Produziert: `getBuiltinPersona(vorgabe: string): string | null` und
  `resolvePersona(vorgabe: string, personasDir?: string): string | null` aus `persona-loader.ts`.
  Task 4 ruft `resolvePersona`.

**Inhaltsquellen — am 2026-08-10 während Task 3 korrigiert:**

- **Cipher:** `…/ClaudeCode01/cipher-mux-electron/moreismore/cyber-factory-pack/16-persona-presets.md`,
  Zeile 68 im Wortlaut. Die Zuordnungstabelle ab Zeile 130 deckt sich mit `persona-defaults.json`.
- **Theaitetos:** **nicht** in dieser Datei. Der Pack kennt die Persona nur unter dem Label
  „Sokratischer Tutor" (Zeile 102/108) und nennt den Bezeichner `theaitetos` nirgends. Der
  passende Wortlaut steht als `THEAITETOS_CHARACTER_BLOCK` in
  `…/CIPHER-MUX/projects/cipher-mux-electron` (`character-defaults`) — dort trägt er genau den
  Bezeichner, den `persona-defaults.json` erwartet.

Die dort erfassten Presets brauchen genau diese zwei Personas (`cipher` für SE, Workshop, CF,
Debugger, Testing Assistant; `theaitetos` für Architect).

> **Abgrenzung, die beim Portieren auffiel:** `THEAITETOS_CHARACTER_BLOCK` trägt im Mux zusätzlich
> einen Abschnitt `### Sicherheit` (keine schädlichen Anweisungen, keine PII an Drittsessions,
> Credentials nie lesen/zitieren/leaken). Das ist **keine Tonlage** und gehört damit nicht in die
> Persona-Datei. In keels Schichtung wäre es die `globalRules`-Schicht von
> `assembleEntityClaudeMd` — die heute niemand befüllt. Siehe „Offene Punkte".

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`tests/preset/builtin-personas.test.ts`:

```typescript
// tests/preset/builtin-personas.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  getBuiltinPersona,
  resolvePersona,
  PERSONA_DEFAULTS,
} from '../../src/main/preset/shared/persona-loader'

describe('builtin personas', () => {
  it('resolves every persona referenced by persona-defaults.json', () => {
    for (const [presetId, vorgabe] of Object.entries(PERSONA_DEFAULTS)) {
      expect(getBuiltinPersona(vorgabe), `${presetId} -> ${vorgabe}`).not.toBeNull()
    }
  })

  it('returns null for an unknown persona', () => {
    expect(getBuiltinPersona('nonexistent')).toBeNull()
  })

  it('returns null for an empty identifier', () => {
    expect(getBuiltinPersona('')).toBeNull()
  })

  it('cipher carries its defining traits', () => {
    const cipher = getBuiltinPersona('cipher')!
    expect(cipher).toMatch(/Cipher/)
    expect(cipher.length).toBeGreaterThan(200)
  })

  it('resolvePersona falls back to the builtin when no directory is given', () => {
    expect(resolvePersona('theaitetos')).toBe(getBuiltinPersona('theaitetos'))
  })

  // Corrected 2026-08-10 after the Task 3 review. The original version passed
  // '/nonexistent-dir' and therefore exercised the FALLBACK, not the precedence its
  // name claims — deleting the `if (personasDir)` branch outright would still have
  // passed. A real file on disk is the only way to prove the user directory wins.
  it('resolvePersona prefers a user directory over the builtin', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-personas-'))
    try {
      fs.writeFileSync(path.join(dir, 'cipher.md'), '# Cipher (user override)\n', 'utf-8')
      const resolved = resolvePersona('cipher', dir)
      expect(resolved).toBe('# Cipher (user override)\n')
      expect(resolved).not.toBe(getBuiltinPersona('cipher'))
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('falls back to the builtin when the user directory lacks the persona', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-personas-'))
    try {
      expect(resolvePersona('cipher', dir)).toBe(getBuiltinPersona('cipher'))
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `npx vitest run tests/preset/builtin-personas.test.ts`
Erwartet: FAIL — `getBuiltinPersona is not a function`.

- [ ] **Schritt 3: Die zwei Persona-Dateien anlegen**

`src/main/preset/shared/personas/cipher.md` und `.../theaitetos.md`. Inhalt aus dem Pack
übernehmen — der Persona-Text beschreibt ausschließlich das **Wie** der Kommunikation, nie eine
Rolle oder Aufgabe (M5 §6: „Persona ist nicht Entität"). Cipher trägt den Wächter-Ton, radikale
Ehrlichkeit, keine Service-Floskeln, keine proaktiven Folgefragen am Ende. Theaitetos ist die
Architekten-Persona aus derselben Datei.

Jede Datei beginnt mit `# <Name>` und enthält keinen Abschnitt, der Aufgaben zuweist.

- [ ] **Schritt 4: `persona-loader.ts` ergänzen**

Unterhalb der bestehenden Exporte einfügen — `loadPersona()` bleibt unangetastet:

```typescript
import cipherPersona from './personas/cipher.md?raw'
import theaitetosPersona from './personas/theaitetos.md?raw'

/**
 * Personas shipped with the app, compiled into the bundle.
 * loadPersona() still serves user-supplied persona directories.
 */
const BUILTIN_PERSONAS: Record<string, string> = {
  cipher: cipherPersona,
  theaitetos: theaitetosPersona,
}

/** Look up a persona that ships with the app. */
export function getBuiltinPersona(vorgabe: string): string | null {
  if (!vorgabe) return null
  return BUILTIN_PERSONAS[vorgabe] ?? null
}

/**
 * Resolve a persona: a user directory wins, the shipped persona is the fallback.
 * Returns null when neither knows the identifier.
 */
export function resolvePersona(vorgabe: string, personasDir?: string): string | null {
  if (personasDir) {
    const fromDisk = loadPersona(vorgabe, personasDir)
    if (fromDisk !== null) return fromDisk
  }
  return getBuiltinPersona(vorgabe)
}
```

- [ ] **Schritt 5: Test laufen lassen, Erfolg bestätigen**

Ausführen: `npx vitest run tests/preset/builtin-personas.test.ts`
Erwartet: PASS, 6 Tests. Der erste Test deckt alle sechs Einträge aus `persona-defaults.json` ab —
schlägt er für `debugger` oder `testing-assistant` fehl, ist das kein Fehler: beide zeigen auf
`cipher`, das genügt.

- [ ] **Schritt 6: Die Personas in den Bündel-Wächter aufnehmen**

`scripts/verify-bundle.mjs` (aus Task 4) kennt bisher nur die zwei Bodies. Beide Personas sind
nach demselben Muster einzutragen — sie sind über `?raw` eingebunden und teilen damit exakt die
Schwachstelle, für die das Script existiert:

```javascript
  { needle: '<markanter Satz aus cipher.md>', source: 'src/main/preset/shared/personas/cipher.md' },
  { needle: '<markanter Satz aus theaitetos.md>', source: 'src/main/preset/shared/personas/theaitetos.md' },
```

Die Nadeln aus den geschriebenen Dateien **ablesen**, nicht erfinden, und einen Satz wählen, der
nirgends sonst im Bundle vorkommt. Danach:

```bash
npm run build && npm run verify:bundle
```

Erwartet: `OK — 4/4 markers present`.

Läuft Task 3 vor Task 4 (das Script existiert dann noch nicht), diesen Schritt überspringen und
stattdessen in der Rückmeldung vermerken — Task 4 trägt die Personas dann gleich mit ein.

- [ ] **Schritt 7: Volle Suite, Typecheck, Lint**

Ausführen: `npm test && npm run typecheck && npm run lint`
Erwartet: alles grün.

- [ ] **Schritt 8: Committen**

```bash
git add src/main/preset/shared/personas src/main/preset/shared/persona-loader.ts \
        tests/preset/builtin-personas.test.ts scripts/verify-bundle.mjs
git commit -m "feat(preset): ship cipher and theaitetos personas with the bundle"
```

---

### Task 4: Registry `entityId` → Rahmen, Body, Persona

Die Registry ist der Ort, an dem die Formunterschiede der vier Presets verschwinden: Architect,
CF und Workshop haben eine Niveau-Fabrik, der Systems Engineer nur eine Konstante. Statt eines
Sonderfalls bekommt der SE eine Fabrik — `getSECapabilities(niveau)` existiert bereits, sie war
nur nie an einen Rahmen gebunden.

**Dateien:**
- Ändern: `src/main/preset/systems-engineer/se-preset.ts`
- Erstellen: `src/main/preset/registry.ts`
- Ändern: `src/main/preset/index.ts`
- Erstellen: `tests/preset/registry.test.ts`

**Schnittstellen:**
- Konsumiert: `ARCHITECT_BODY`, `CF_BODY`, `SE_BODY`, `WORKSHOP_BODY` (Task 1, 2);
  `resolvePersona` (Task 3); `createArchitectRahmen`, `createCfRahmen`, `createWorkshopRahmen`,
  `getSECapabilities`, `SE_RAHMEN`

**Namensregel:** Die SE-Module schreiben `SE` groß (`createSEPreset` existiert bereits in
`se-preset.ts`). Die neue Fabrik heißt deshalb `createSERahmen`, nicht `createSERahmen`.
- Produziert:
  ```typescript
  export interface EntityDefinition {
    id: string
    rahmen: PresetRahmen
    body: string
    persona: string | null
  }
  export function getEntityDefinition(
    entityId: string,
    niveau?: CapabilityNiveau,
  ): EntityDefinition | null
  export function listEntityIds(): string[]
  ```
  Task 7 ruft `getEntityDefinition`.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`tests/preset/registry.test.ts`:

```typescript
// tests/preset/registry.test.ts
import { describe, it, expect } from 'vitest'
import { getEntityDefinition, listEntityIds } from '../../src/main/preset/registry'
import { CapabilityNiveau } from '../../src/main/preset/niveau'
import { getBuiltinPersona } from '../../src/main/preset/shared/persona-loader'
import { PRESET_CATALOG } from '../../src/shared/preset-catalog'

describe('entity registry', () => {
  it('knows every id in the shipped catalog', () => {
    for (const choice of PRESET_CATALOG) {
      expect(getEntityDefinition(choice.id), choice.id).not.toBeNull()
    }
  })

  it('listEntityIds covers the catalog', () => {
    const ids = listEntityIds()
    for (const choice of PRESET_CATALOG) {
      expect(ids).toContain(choice.id)
    }
  })

  it('returns null for an unknown id', () => {
    expect(getEntityDefinition('nope')).toBeNull()
  })

  it('gives every entity a non-empty body', () => {
    for (const choice of PRESET_CATALOG) {
      const def = getEntityDefinition(choice.id)!
      expect(def.body.length, choice.id).toBeGreaterThan(100)
    }
  })

  it('gives every entity a non-empty capability list', () => {
    for (const choice of PRESET_CATALOG) {
      const def = getEntityDefinition(choice.id)!
      expect(def.rahmen.capabilityAnbindung.length, choice.id).toBeGreaterThan(0)
    }
  })

  // These two assert WHICH persona was resolved, not merely that one was. A
  // not.toBeNull() here would pass even if every entity got the same wrong persona.
  it('resolves the persona declared by the rahmen', () => {
    const architect = getEntityDefinition('architect')!
    expect(architect.rahmen.personaVorgabe).toBe('theaitetos')
    expect(architect.persona).toBe(getBuiltinPersona('theaitetos'))
    expect(architect.persona).not.toBe(getBuiltinPersona('cipher'))
  })

  it('falls back to the catalog default persona when the rahmen declares none', () => {
    // workshop-preset.ts sets personaVorgabe: '' — persona-defaults.json says 'cipher'.
    const workshop = getEntityDefinition('workshop')!
    expect(workshop.rahmen.personaVorgabe).toBe('')
    expect(workshop.persona).toBe(getBuiltinPersona('cipher'))
  })

  it('honours the requested niveau for every entity, factory or not', () => {
    for (const choice of PRESET_CATALOG) {
      const c = getEntityDefinition(choice.id, CapabilityNiveau.C)!
      expect(c.rahmen.capabilityNiveau, choice.id).toBe(CapabilityNiveau.C)
    }
  })

  // toBeLessThan, not toBeLessThanOrEqual: all four narrow strictly (architect 7→1,
  // cyber-factory 8→1, systems-engineer 7→1, workshop 7→5, counted in the sources on
  // 2026-08-10). ToBeLessThanOrEqual would pass even if the niveau were ignored entirely.
  it('narrows the capability set at Niveau C relative to Niveau A', () => {
    for (const choice of PRESET_CATALOG) {
      const a = getEntityDefinition(choice.id, CapabilityNiveau.A)!
      const c = getEntityDefinition(choice.id, CapabilityNiveau.C)!
      expect(
        c.rahmen.capabilityAnbindung.length,
        choice.id,
      ).toBeLessThan(a.rahmen.capabilityAnbindung.length)
    }
  })

  it('produces a rahmen that passes its own validator', async () => {
    const { validatePresetRahmen } = await import('../../src/main/preset/schema')
    for (const choice of PRESET_CATALOG) {
      const def = getEntityDefinition(choice.id)!
      const result = validatePresetRahmen(def.rahmen)
      expect(result.errors, choice.id).toEqual([])
    }
  })
})
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `npx vitest run tests/preset/registry.test.ts`
Erwartet: FAIL — `Failed to resolve import ".../preset/registry"`.

- [ ] **Schritt 3: Dem Systems Engineer eine Niveau-Fabrik geben**

In `src/main/preset/systems-engineer/se-preset.ts` unterhalb von `SE_RAHMEN` ergänzen. `SE_RAHMEN`
bleibt exportiert — bestehende Tests hängen daran:

```typescript
/**
 * Create a PresetRahmen for the Systems Engineer at the given niveau.
 *
 * SE_RAHMEN stays the Niveau-A constant; this factory brings the SE to the same
 * shape as the other presets so the registry needs no special case.
 */
export function createSERahmen(niveau: CapabilityNiveau): PresetRahmen {
  return {
    ...SE_RAHMEN,
    capabilityAnbindung: getSECapabilities(niveau),
    model: niveau === CapabilityNiveau.A ? 'heavy' : '',
    capabilityNiveau: niveau,
  }
}
```

Nötige Importe in der Datei prüfen: `CapabilityNiveau`, `PresetRahmen` und `getSECapabilities` —
letzteres aus `./se-capabilities`.

- [ ] **Schritt 4: Die Registry schreiben**

`src/main/preset/registry.ts`:

```typescript
/**
 * Entity registry — maps an entityId to everything a session start needs.
 *
 * The four shipped presets differ in shape: three carry a niveau factory, the
 * Systems Engineer used to carry only a constant (createSERahmen closes that).
 * Callers see one uniform record and never touch the individual modules.
 *
 * CK-ENT-001, CK-ENT-004
 */

import type { PresetRahmen } from './schema'
import { CapabilityNiveau } from './niveau'
import { createArchitectRahmen } from './architect/architect-preset'
import { createCfRahmen } from './cyber-factory/cf-preset'
import { createSERahmen } from './systems-engineer/se-preset'
import { createWorkshopRahmen } from './workshop/workshop-preset'
import { ARCHITECT_BODY, CF_BODY, SE_BODY, WORKSHOP_BODY } from './bodies'
import { resolvePersona, getDefaultPersona } from './shared/persona-loader'

export interface EntityDefinition {
  /** Stable entity id — the value session:create receives. */
  id: string
  /** Typed metadata block for this entity at the requested niveau. */
  rahmen: PresetRahmen
  /** Core instruction text. Never empty. */
  body: string
  /** Persona layer, or null when none is registered. */
  persona: string | null
}

type RahmenFactory = (niveau: CapabilityNiveau) => PresetRahmen

interface EntityEntry {
  rahmen: RahmenFactory
  body: string
}

const ENTITIES: Record<string, EntityEntry> = {
  'systems-engineer': { rahmen: createSERahmen, body: SE_BODY },
  'architect': { rahmen: createArchitectRahmen, body: ARCHITECT_BODY },
  'cyber-factory': { rahmen: createCfRahmen, body: CF_BODY },
  'workshop': { rahmen: createWorkshopRahmen, body: WORKSHOP_BODY },
}

/** All entity ids the registry can build. */
export function listEntityIds(): string[] {
  return Object.keys(ENTITIES)
}

/**
 * Build the full definition for an entity.
 *
 * @param entityId  one of listEntityIds()
 * @param niveau    capability niveau; defaults to the preset's own default (A)
 * @param personasDir optional user persona directory, wins over shipped personas
 * @returns null when the id is unknown — callers must handle it, never assume.
 */
export function getEntityDefinition(
  entityId: string,
  niveau: CapabilityNiveau = CapabilityNiveau.A,
  personasDir?: string,
): EntityDefinition | null {
  const entry = ENTITIES[entityId]
  if (!entry) return null

  const rahmen = entry.rahmen(niveau)
  // The rahmen may leave personaVorgabe empty (workshop does) — the catalog default fills in.
  const vorgabe = rahmen.personaVorgabe || getDefaultPersona(entityId) || ''
  const persona = vorgabe ? resolvePersona(vorgabe, personasDir) : null

  return { id: entityId, rahmen, body: entry.body, persona }
}
```

- [ ] **Schritt 5: Aus dem Barrel exportieren**

`src/main/preset/index.ts` um eine Zeile ergänzen:

```typescript
export { getEntityDefinition, listEntityIds } from './registry'
export type { EntityDefinition } from './registry'
```

- [ ] **Schritt 6: Test laufen lassen, Erfolg bestätigen**

Ausführen: `npx vitest run tests/preset/registry.test.ts`
Erwartet: PASS, 10 Tests.

Fällt `produces a rahmen that passes its own validator` durch, ist das ein **echter Befund**, kein
Testfehler: `validatePresetRahmen` verlangt unter anderem eine nicht-leere `capabilityAnbindung`
und eine bekannte `runtime`. Die Ursache im betroffenen Preset beheben, nicht die Zusicherung
entfernen.

- [ ] **Schritt 7: Volle Suite, Typecheck, Lint**

Ausführen: `npm test && npm run typecheck && npm run lint`
Erwartet: alles grün.

- [ ] **Schritt 8: Den Bündel-Nachweis erwarten — und den `0` als Befund hinnehmen**

> **Zweite Korrektur, am 2026-08-10 in Task 4 gemessen.** Der Nachweis war aus Task 1 hierher
> verschoben worden mit der Begründung, die Registry sei der erste echte Konsument. **Das war
> falsch, und zwar nachgemessen:** `src/main/ipc-handlers.ts` importiert aus dem Preset-Bereich
> ausschließlich `src/shared/preset-catalog.ts`. Nichts im Hauptprozess erreicht
> `preset/index.ts` oder `registry.ts` — die Registry hat selbst noch keinen Aufrufer. Rollup
> entfernt die Kette also weiterhin zu Recht.
>
> **Die Kette schließt erst in Task 7**, wo `ipc-handlers.ts` `getEntityDefinition` aufruft. Der
> Nachweis wandert dorthin. Die Regel bleibt dieselbe wie in Task 1: kein Gerüst, um einen
> Nachweis künstlich bestehen zu lassen.

Ausführen:

```bash
npm run build
grep -c "Du bist der Architect" dist/main/index.js
```

Erwarteter Stand **in diesem Task**: `0`. Das ist kein Fehlschlag, sondern der dokumentierte
Zwischenzustand — festhalten, nicht reparieren. **Insbesondere nicht** durch einen Re-Export in
`src/main/main.ts`; das wurde in Task 1 gebaut, geprüft und verworfen.

Ein Wert `≥ 1` hier wäre umgekehrt ein Befund: er hieße, dass etwas die Registry bereits erreicht,
das der Plan nicht kennt.

- [ ] **Schritt 9: Den Nachweis als Script festschreiben**

> **Entscheidung (Nutzer, 2026-08-10):** Der Bündel-Nachweis wird automatisiert, nicht nur
> dokumentiert. Grund: Die Unit-Tests aus Task 1 wären auch dann grün, wenn `bodies.ts` später auf
> `fs.readFileSync` zurückfiele — also genau auf das Verhalten, das in der gepackten App bricht.
> Das Muster wiederholt sich in Task 3 (Personas) und Task 14 (~27 Capability-Dateien); ohne
> Wächter multipliziert sich die blinde Stelle.

`scripts/verify-bundle.mjs` anlegen:

```javascript
/**
 * verify-bundle.mjs — assert that inlined markdown survived the rollup build.
 *
 * The main process is bundled into a single dist/main/index.js. Markdown is
 * inlined via Vite's `?raw`; a regression back to fs.readFileSync would keep
 * every unit test green (vitest reads from disk) and only break in the packaged
 * app, where the source tree does not exist. This is the guard for that.
 *
 * Run after `npm run build`.
 */
import { readFileSync, existsSync } from 'node:fs'

const BUNDLE = 'dist/main/index.js'

/** Marker text that must appear in the bundle, and where it comes from. */
const MARKERS = [
  { needle: 'Du bist der Architect', source: 'src/main/preset/architect/architect-body.md' },
  { needle: 'Du bist die Cyber Factory', source: 'src/main/preset/cyber-factory/cf-body.md' },
]

if (!existsSync(BUNDLE)) {
  console.error(`[verify-bundle] ${BUNDLE} is missing — run \`npm run build\` first`)
  process.exitCode = 1
} else {
  const bundle = readFileSync(BUNDLE, 'utf-8')
  const missing = MARKERS.filter(m => !bundle.includes(m.needle))

  for (const m of missing) {
    console.error(`[verify-bundle] MISSING: ${m.source} — text not found in ${BUNDLE}`)
  }
  if (missing.length > 0) {
    console.error(
      `[verify-bundle] ${missing.length}/${MARKERS.length} markers missing. ` +
      'Inlined markdown did not survive bundling; the packaged app would lose it silently.'
    )
    process.exitCode = 1
  } else {
    console.log(`[verify-bundle] OK — ${MARKERS.length}/${MARKERS.length} markers present`)
  }
}
```

Der genaue Wortlaut der zweiten Nadel ist aus `src/main/preset/cyber-factory/cf-body.md`
abzulesen, nicht zu raten — passt er nicht, meldet das Script einen Fehlalarm.

In `package.json` unter `scripts` ergänzen:

```json
    "verify:bundle": "node scripts/verify-bundle.mjs",
```

- [ ] **Schritt 10: Das Script gegen beide Zustände prüfen — an einem synthetischen Bündel**

> **Korrigiert am 2026-08-10.** Der ursprüngliche Schritt erwartete `OK — 2/2` gegen den echten
> Build. Das kann in diesem Task nicht eintreten (siehe Schritt 8): das echte Bündel enthält die
> Marker noch nicht, das Script meldet dort korrekt `2/2 MISSING`. Eine Gegenprobe gegen ein
> bereits rotes Bündel beweist nichts — sie ist rot, egal was das Script tut.

Deshalb wird das Script gegen ein **synthetisches** Bündel geprüft, in dem beide Marker
nachweislich vorkommen. Nur so trennt die Probe „Script funktioniert" von „Bündel ist leer":

```bash
# 1. Echter Build: der dokumentierte Zwischenzustand
npm run build && npm run verify:bundle; echo "exit=$?"
```

Erwartet: zwei `MISSING`-Zeilen, `exit=1`.

```bash
# 2. Synthetisches Bündel MIT beiden Markern — beweist, dass das Script OK sagen kann
mkdir -p /tmp/vb/dist/main
cat src/main/preset/architect/architect-body.md src/main/preset/cyber-factory/cf-body.md \
  > /tmp/vb/dist/main/index.js
cp scripts/verify-bundle.mjs /tmp/vb/
(cd /tmp/vb && node verify-bundle.mjs); echo "exit=$?"
```

Erwartet: `OK — 2/2 markers present`, `exit=0`.

```bash
# 3. Dasselbe Bündel, ein Marker zerstört — beweist, dass das Script auch nein sagen kann
sed -i '' 's/Du bist der Architect/ZERSTOERT/' /tmp/vb/dist/main/index.js
(cd /tmp/vb && node verify-bundle.mjs); echo "exit=$?"
rm -rf /tmp/vb
```

Erwartet: eine `MISSING`-Zeile für `architect-body.md`, `exit=1`.

Sagt Probe 2 nicht `OK`, ist die Nadel falsch abgelesen. Sagt Probe 3 `OK`, prüft das Script
nichts. Beide Ausgaben gehören in den Bericht.

- [ ] **Schritt 11: Committen**

```bash
git add src/main/preset/registry.ts src/main/preset/index.ts \
        src/main/preset/systems-engineer/se-preset.ts tests/preset/registry.test.ts \
        scripts/verify-bundle.mjs package.json
git commit -m "feat(preset): entity registry mapping entityId to rahmen, body and persona"
```

---

### Task 5: Prompt-Datei und ehrliche Capability-Referenzen

Zwei Teile, die zusammen einen Prüfstein bilden: die Datei, die der CLI übergeben wird, und die
Entscheidung, welche Capability-Referenzen überhaupt hineindürfen. Bei Niveau A schreibt
`assembleEntityClaudeMd` `@.claude/capabilities/<id>/SKILL.md` — **keine dieser Dateien existiert
heute**, weder im Repo noch im Mux noch im cyber-factory-pack. Referenzen auf tote Pfade werden
nicht ausgegeben, und was fehlt, wird gemeldet statt verschluckt.

**Dateien:**
- Erstellen: `src/main/session/capability-refs.ts`
- Erstellen: `src/main/session/prompt-file.ts`
- Erstellen: `tests/session/capability-refs.test.ts`
- Erstellen: `tests/session/prompt-file.test.ts`

**Schnittstellen:**
- Konsumiert: `EntityDefinition` (Task 4), `assembleEntityClaudeMd` (bestehend)
- Produziert:
  ```typescript
  // capability-refs.ts
  export interface CapabilityRefResult { present: string[]; missing: string[] }
  export function resolveCapabilityRefs(
    capabilityIds: string[],
    projectPath: string,
  ): CapabilityRefResult

  // prompt-file.ts
  export function entityPromptPath(userDataPath: string, sessionName: string): string
  export function writeEntityPromptFile(
    userDataPath: string,
    sessionName: string,
    content: string,
  ): string
  export function removeEntityPromptFile(userDataPath: string, sessionName: string): void
  ```
  Task 7 ruft `resolveCapabilityRefs` und `writeEntityPromptFile`.

- [ ] **Schritt 1: Den fehlschlagenden Test für die Referenzen schreiben**

`tests/session/capability-refs.test.ts`:

```typescript
// tests/session/capability-refs.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveCapabilityRefs } from '../../src/main/session/capability-refs'

let projectDir: string

beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-caps-'))
})

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true })
})

function materialise(id: string): void {
  const dir = path.join(projectDir, '.claude', 'capabilities', id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `# ${id}\n`, 'utf-8')
}

describe('resolveCapabilityRefs', () => {
  it('reports every capability as missing when nothing is materialised', () => {
    const result = resolveCapabilityRefs(['a', 'b'], projectDir)
    expect(result.present).toEqual([])
    expect(result.missing).toEqual(['a', 'b'])
  })

  it('reports a capability as present once its SKILL.md exists', () => {
    materialise('a')
    const result = resolveCapabilityRefs(['a', 'b'], projectDir)
    expect(result.present).toEqual(['a'])
    expect(result.missing).toEqual(['b'])
  })

  it('preserves the declared order', () => {
    materialise('b')
    materialise('a')
    const result = resolveCapabilityRefs(['a', 'b'], projectDir)
    expect(result.present).toEqual(['a', 'b'])
  })

  it('treats a directory without SKILL.md as missing', () => {
    fs.mkdirSync(path.join(projectDir, '.claude', 'capabilities', 'a'), { recursive: true })
    const result = resolveCapabilityRefs(['a'], projectDir)
    expect(result.missing).toEqual(['a'])
  })

  it('returns empty lists for an empty input', () => {
    expect(resolveCapabilityRefs([], projectDir)).toEqual({ present: [], missing: [] })
  })
})
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `npx vitest run tests/session/capability-refs.test.ts`
Erwartet: FAIL — Modul nicht auflösbar.

- [ ] **Schritt 3: `capability-refs.ts` schreiben**

```typescript
/**
 * capability-refs.ts — decide which capability references the assembled prompt may carry.
 *
 * Niveau A emits `@.claude/capabilities/<id>/SKILL.md` lines. A reference to a file
 * that does not exist is worse than no reference: the agent silently loses the
 * capability and nothing says so. Only present files are referenced; missing ones
 * are returned so the caller can log them.
 */

import fs from 'node:fs'
import path from 'node:path'

export interface CapabilityRefResult {
  /** Capability ids whose SKILL.md exists under the project. Declared order kept. */
  present: string[]
  /** Capability ids with no SKILL.md — the caller must surface these. */
  missing: string[]
}

/** Relative path a capability's SKILL.md occupies inside a project. */
export function capabilityRefPath(id: string): string {
  return path.join('.claude', 'capabilities', id, 'SKILL.md')
}

export function resolveCapabilityRefs(
  capabilityIds: string[],
  projectPath: string,
): CapabilityRefResult {
  const present: string[] = []
  const missing: string[] = []

  for (const id of capabilityIds) {
    const full = path.join(projectPath, capabilityRefPath(id))
    if (fs.existsSync(full)) {
      present.push(id)
    } else {
      missing.push(id)
    }
  }

  return { present, missing }
}
```

- [ ] **Schritt 4: Test laufen lassen, Erfolg bestätigen**

Ausführen: `npx vitest run tests/session/capability-refs.test.ts`
Erwartet: PASS, 5 Tests.

- [ ] **Schritt 5: Den fehlschlagenden Test für die Prompt-Datei schreiben**

`tests/session/prompt-file.test.ts`:

```typescript
// tests/session/prompt-file.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  entityPromptPath,
  writeEntityPromptFile,
  removeEntityPromptFile,
} from '../../src/main/session/prompt-file'

let userData: string

beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-userdata-'))
})

afterEach(() => {
  fs.rmSync(userData, { recursive: true, force: true })
})

describe('entity prompt file', () => {
  it('places the file under userData, never in the project', () => {
    const p = entityPromptPath(userData, 'keel-demo-architect-ab12')
    expect(p.startsWith(userData)).toBe(true)
    expect(p).toContain('entity-prompts')
    expect(p.endsWith('.md')).toBe(true)
  })

  it('gives each session its own path so parallel sessions cannot collide', () => {
    const a = entityPromptPath(userData, 'keel-demo-architect-ab12')
    const b = entityPromptPath(userData, 'keel-demo-architect-cd34')
    expect(a).not.toBe(b)
  })

  it('writes the content and returns the path', () => {
    const written = writeEntityPromptFile(userData, 'keel-demo-workshop-ab12', '# Workshop\n')
    expect(fs.readFileSync(written, 'utf-8')).toBe('# Workshop\n')
  })

  it('creates the directory when it does not exist yet', () => {
    expect(fs.existsSync(path.join(userData, 'entity-prompts'))).toBe(false)
    writeEntityPromptFile(userData, 'keel-demo-se-ab12', 'x')
    expect(fs.existsSync(path.join(userData, 'entity-prompts'))).toBe(true)
  })

  it('overwrites a stale file from a previous run with the same name', () => {
    writeEntityPromptFile(userData, 'keel-demo-se-ab12', 'old')
    const written = writeEntityPromptFile(userData, 'keel-demo-se-ab12', 'new')
    expect(fs.readFileSync(written, 'utf-8')).toBe('new')
  })

  it('writes the file readable only by its owner', () => {
    const written = writeEntityPromptFile(userData, 'keel-demo-se-ab12', 'x')
    expect(fs.statSync(written).mode & 0o777).toBe(0o600)
  })

  it('rejects a session name that would escape the directory', () => {
    expect(() => entityPromptPath(userData, '../escape')).toThrow()
    expect(() => entityPromptPath(userData, 'a/b')).toThrow()
  })

  it('removes the file and stays silent when it is already gone', () => {
    writeEntityPromptFile(userData, 'keel-demo-se-ab12', 'x')
    removeEntityPromptFile(userData, 'keel-demo-se-ab12')
    expect(fs.existsSync(entityPromptPath(userData, 'keel-demo-se-ab12'))).toBe(false)
    expect(() => removeEntityPromptFile(userData, 'keel-demo-se-ab12')).not.toThrow()
  })
})
```

- [ ] **Schritt 6: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `npx vitest run tests/session/prompt-file.test.ts`
Erwartet: FAIL — Modul nicht auflösbar.

- [ ] **Schritt 7: `prompt-file.ts` schreiben**

```typescript
/**
 * prompt-file.ts — the assembled entity prompt as a file for the agent CLI.
 *
 * The file lives under app.getPath('userData'), never inside the user's project:
 * a project directory is usually versioned, and a per-session write there would
 * dirty `git status` on every launch. One path per session name so parallel
 * sessions cannot overwrite each other.
 */

import fs from 'node:fs'
import path from 'node:path'

/** Directory holding one prompt file per live session. */
const PROMPT_DIR = 'entity-prompts'

/**
 * Absolute path of a session's prompt file.
 * @throws when sessionName contains path separators or traversal segments.
 */
export function entityPromptPath(userDataPath: string, sessionName: string): string {
  if (!sessionName || sessionName.includes('/') || sessionName.includes('\\') || sessionName.includes('..')) {
    throw new Error(`[prompt-file] unsafe session name: '${sessionName}'`)
  }
  return path.join(userDataPath, PROMPT_DIR, `${sessionName}.md`)
}

/**
 * Write the assembled prompt and return the path it was written to.
 * Mode 0600 — the prompt can carry project-specific instructions.
 */
export function writeEntityPromptFile(
  userDataPath: string,
  sessionName: string,
  content: string,
): string {
  const filePath = entityPromptPath(userDataPath, sessionName)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, { encoding: 'utf-8', mode: 0o600 })
  return filePath
}

/** Remove a session's prompt file. Missing file is not an error. */
export function removeEntityPromptFile(userDataPath: string, sessionName: string): void {
  try {
    fs.rmSync(entityPromptPath(userDataPath, sessionName), { force: true })
  } catch (err) {
    console.warn('[prompt-file] cleanup failed:', err)
  }
}
```

- [ ] **Schritt 8: Test laufen lassen, Erfolg bestätigen**

Ausführen: `npx vitest run tests/session/prompt-file.test.ts`
Erwartet: PASS, 8 Tests.

Fällt `writes the file readable only by its owner` durch, liegt es an der `umask` der Umgebung —
`fs.writeFileSync` wendet sie auf `mode` an. In dem Fall die Datei nach dem Schreiben mit
`fs.chmodSync(filePath, 0o600)` nachziehen, statt die Zusicherung zu streichen.

- [ ] **Schritt 9: Volle Suite, Typecheck, Lint**

Ausführen: `npm test && npm run typecheck && npm run lint`
Erwartet: alles grün.

- [ ] **Schritt 10: Committen**

```bash
git add src/main/session/capability-refs.ts src/main/session/prompt-file.ts \
        tests/session/capability-refs.test.ts tests/session/prompt-file.test.ts
git commit -m "feat(session): per-session entity prompt file and honest capability refs"
```

---

### Task 6: Startbefehl im Adapter kapseln, Rechte an den ConfigStore

Zwei Dinge, die denselben Code anfassen. Das Flag `--append-system-prompt-file` ist in
`claude --help` **nicht als Option gelistet** — nur der Fließtext erwähnt
`--append-system-prompt[-file]`. Es ist verifiziert vorhanden (Claude Code 2.1.221, Nachweis über
den Aufruf ohne Argument), aber undokumentierte Flags können zwischen CLI-Versionen verschwinden.
Deshalb genau eine Stelle, die es kennt, und ein erkennbarer Fehler statt eines stillen Starts
ohne Prompt.

`config.agent.skipPermissions` existiert bereits (`config-store.ts:30,68`) mit Default `false` und
wird von niemandem gelesen; der Adapter hardcodet `true` mit dem Kommentar „Will be wired to
ConfigStore in Phase C". Beides wird hier aufgelöst — Default wird `true` (Nutzerentscheidung).

**Dateien:**
- Ändern: `src/main/agent/agent-adapter.ts` (`LaunchOpts`)
- Ändern: `src/main/agent/adapters/claude-code.ts:34-68`
- Ändern: `src/main/config/config-store.ts:68`
- Erstellen: `tests/agent/claude-code-adapter.test.ts` — **das Verzeichnis `tests/agent/` existiert
  nicht und `ClaudeCodeAdapter` hat heute keinen einzigen Test.** Der einzige Adapter-Test des
  Repos ist `tests/nanoclaw/adapter.test.ts` und betrifft den NanoClaw-Adapter.

**Schnittstellen:**
- Konsumiert: `configStore` aus `src/main/config/config-store`
- Produziert: `LaunchOpts.appendSystemPromptFile?: string`; `buildLaunchCommand` hängt bei gesetztem
  Wert `--append-system-prompt-file <pfad>` an. Task 7 setzt das Feld.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`tests/agent/claude-code-adapter.test.ts` neu anlegen, mit den Importen
`import { describe, it, expect } from 'vitest'` und
`import { ClaudeCodeAdapter } from '../../src/main/agent/adapters/claude-code'`:

```typescript
describe('ClaudeCodeAdapter launch command (entity prompt)', () => {
  const opts = { projectPath: '/tmp/p', sessionName: 'keel-demo-architect-ab12' }

  it('appends the system prompt file flag when a path is given', () => {
    const adapter = new ClaudeCodeAdapter({ getSkipPermissions: () => false })
    const cmd = adapter.buildLaunchCommand({ ...opts, appendSystemPromptFile: '/tmp/x.md' })
    expect(cmd.args).toContain('--append-system-prompt-file')
    expect(cmd.args[cmd.args.indexOf('--append-system-prompt-file') + 1]).toBe('/tmp/x.md')
  })

  it('omits the flag entirely when no path is given', () => {
    const adapter = new ClaudeCodeAdapter({ getSkipPermissions: () => false })
    const cmd = adapter.buildLaunchCommand(opts)
    expect(cmd.args).not.toContain('--append-system-prompt-file')
  })

  it('rejects an empty path instead of starting without a prompt', () => {
    const adapter = new ClaudeCodeAdapter({ getSkipPermissions: () => false })
    expect(() => adapter.buildLaunchCommand({ ...opts, appendSystemPromptFile: '' }))
      .toThrow(/append-system-prompt-file/)
  })

  it('keeps the prompt path out of the executable name', () => {
    const adapter = new ClaudeCodeAdapter({ getSkipPermissions: () => false })
    const cmd = adapter.buildLaunchCommand({ ...opts, appendSystemPromptFile: '/tmp/x.md' })
    expect(cmd.cmd).toBe('claude')
  })

  it('reads skip-permissions from the injected reader, not from a hardcoded value', () => {
    const off = new ClaudeCodeAdapter({ getSkipPermissions: () => false })
    expect(off.buildLaunchCommand(opts).args).not.toContain('--dangerously-skip-permissions')

    const on = new ClaudeCodeAdapter({ getSkipPermissions: () => true })
    expect(on.buildLaunchCommand(opts).args).toContain('--dangerously-skip-permissions')
  })
})
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `npx vitest run tests/agent/claude-code-adapter.test.ts`
Erwartet: FAIL — die drei Flag-Zusicherungen schlagen fehl,
`appendSystemPromptFile` existiert in `LaunchOpts` nicht.

- [ ] **Schritt 3: `LaunchOpts` erweitern**

In `src/main/agent/agent-adapter.ts` innerhalb von `LaunchOpts` ergänzen:

```typescript
  /**
   * Path to a file whose content is appended to the agent's system prompt.
   * Carries the assembled entity prompt. Claude Code: --append-system-prompt-file.
   */
  appendSystemPromptFile?: string
```

- [ ] **Schritt 4: `buildLaunchCommand` ergänzen und den Hardcode auflösen**

In `src/main/agent/adapters/claude-code.ts` den `defaultConfigReader` an den ConfigStore hängen:

```typescript
/** Default reader — the persisted agent config decides. */
const defaultConfigReader: AgentConfigReader = {
  getSkipPermissions(): boolean {
    // Lazy require: the adapter is unit-tested without an Electron app instance.
    const { configStore } = require('../../config/config-store') as
      typeof import('../../config/config-store')
    return configStore.get('agent').skipPermissions
  },
}
```

Und in `buildLaunchCommand` vor dem `return` einfügen:

```typescript
    if (opts.appendSystemPromptFile !== undefined) {
      if (!opts.appendSystemPromptFile) {
        // Starting without the entity prompt looks like a working session but is not one.
        throw new Error(
          '[ClaudeCodeAdapter] appendSystemPromptFile was set but empty — ' +
          'refusing to launch without the entity prompt'
        )
      }
      args.push('--append-system-prompt-file', opts.appendSystemPromptFile)
    }
```

- [ ] **Schritt 5: Den Default umstellen**

In `src/main/config/config-store.ts` Zeile 68: `skipPermissions: false` → `skipPermissions: true`.

Kommentar darüber setzen:

```typescript
  agent: {
    // Sessions are launched by the app itself; true matches cipher-mux 0.9.x behaviour.
    skipPermissions: true,
  },
```

- [ ] **Schritt 6: Test laufen lassen, Erfolg bestätigen**

Ausführen: `npx vitest run tests/agent/claude-code-adapter.test.ts`
Erwartet: PASS.

- [ ] **Schritt 7: Prüfen, ob der geänderte Default bestehende Tests kippt**

Ausführen: `npx vitest run tests/config`
Erwartet: PASS. Zusichert ein Test `skipPermissions` als `false`, ist er auf `true` zu ziehen —
der Default ist eine bewusste Entscheidung, nicht ein Versehen. Den Testnamen entsprechend
anpassen, nicht nur den Wert.

- [ ] **Schritt 8: Volle Suite, Typecheck, Lint**

Ausführen: `npm test && npm run typecheck && npm run lint`
Erwartet: alles grün.

- [ ] **Schritt 9: Committen**

```bash
git add src/main/agent/agent-adapter.ts src/main/agent/adapters/claude-code.ts \
        src/main/config/config-store.ts tests/agent/claude-code-adapter.test.ts
git commit -m "feat(agent): append-system-prompt-file support and config-driven skip-permissions"
```

---

### Task 7: `session:create` startet die Entität

Der Task, der die Startstrecke schließt. Bis hierher ist alles einzeln getestet und nichts davon
in Betrieb.

**Dateien:**
- Erstellen: `src/main/util/shell-quote.ts`
- Erstellen: `tests/util/shell-quote.test.ts`
- Ändern: `src/main/ipc-handlers.ts:130-178`
- Ändern: `src/main/ipc-handlers.ts` (SESSION_DESTROY, Aufräumen der Prompt-Datei)

**Schnittstellen:**
- Konsumiert: `getEntityDefinition` (Task 4), `resolveCapabilityRefs` und `writeEntityPromptFile`
  (Task 5), `buildLaunchCommand` mit `appendSystemPromptFile` (Task 6),
  `assembleEntityClaudeMd` (bestehend)
- Produziert: `formatShellCommand(cmd: string, args: string[]): string`

- [ ] **Schritt 1: Den fehlschlagenden Test für das Quoting schreiben**

Der Start läuft über `tmux send-keys` — die Argumente werden in eine **Shell getippt**. Ein
`{cmd, args}`-Array ist dort erst dann injektionssicher, wenn es korrekt gequotet wird.

`tests/util/shell-quote.test.ts`:

```typescript
// tests/util/shell-quote.test.ts
import { describe, it, expect } from 'vitest'
import { formatShellCommand } from '../../src/main/util/shell-quote'

describe('formatShellCommand', () => {
  it('leaves a plain command untouched', () => {
    expect(formatShellCommand('claude', [])).toBe('claude')
  })

  it('joins simple arguments with spaces', () => {
    expect(formatShellCommand('claude', ['--resume'])).toBe('claude --resume')
  })

  it('quotes a path containing spaces', () => {
    expect(formatShellCommand('claude', ['--append-system-prompt-file', '/a b/c.md']))
      .toBe("claude --append-system-prompt-file '/a b/c.md'")
  })

  it('neutralises a command substitution attempt', () => {
    const out = formatShellCommand('claude', ['--model', '$(rm -rf /)'])
    expect(out).toBe("claude --model '$(rm -rf /)'")
  })

  it('escapes an embedded single quote', () => {
    const out = formatShellCommand('claude', ["it's"])
    expect(out).toBe("claude 'it'\\''s'")
  })

  it('neutralises a semicolon chain', () => {
    const out = formatShellCommand('claude', ['a; rm -rf /'])
    expect(out).toBe("claude 'a; rm -rf /'")
  })

  it('rejects a newline outright rather than quoting it', () => {
    // tmux send-keys treats a newline as Enter — quoting cannot save this.
    expect(() => formatShellCommand('claude', ['a\nb'])).toThrow()
  })
})
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `npx vitest run tests/util/shell-quote.test.ts`
Erwartet: FAIL — Modul nicht auflösbar.

- [ ] **Schritt 3: `shell-quote.ts` schreiben**

```typescript
/**
 * shell-quote.ts — turn a {cmd, args} launch command into one shell line.
 *
 * Sessions are started by typing into a shell via `tmux send-keys`, so the
 * injection-safe argv form has to be flattened at the very last moment.
 * Single-quoting is the only form POSIX shells treat as fully literal.
 */

/** Arguments needing no quoting: the safe set only. */
const SAFE = /^[A-Za-z0-9._\-/=:@,+]+$/

function quote(arg: string): string {
  if (arg.includes('\n') || arg.includes('\r')) {
    // send-keys turns a newline into Enter — no quoting survives that.
    throw new Error('[shell-quote] argument contains a newline and cannot be sent via tmux')
  }
  if (arg === '') return "''"
  if (SAFE.test(arg)) return arg
  return `'${arg.split("'").join(`'\\''`)}'`
}

/** Format an executable and its arguments as a single shell command line. */
export function formatShellCommand(cmd: string, args: string[]): string {
  return [quote(cmd), ...args.map(quote)].join(' ')
}
```

- [ ] **Schritt 4: Test laufen lassen, Erfolg bestätigen**

Ausführen: `npx vitest run tests/util/shell-quote.test.ts`
Erwartet: PASS, 7 Tests.

- [ ] **Schritt 5: `session:create` umbauen**

In `src/main/ipc-handlers.ts` die Importe ergänzen:

```typescript
import { app } from 'electron'
import { getEntityDefinition } from './preset/registry'
import { assembleEntityClaudeMd } from './session/assemble-entity'
import { resolveCapabilityRefs } from './session/capability-refs'
import { writeEntityPromptFile, removeEntityPromptFile } from './session/prompt-file'
import { formatShellCommand } from './util/shell-quote'
import { AdapterRegistry } from './agent/registry'
```

Ist `app` bereits importiert, den Import nicht doppeln.

Im Handler zwischen der `if (!name)`-Prüfung und `services.tmux.createSession` einfügen:

```typescript
      // Assemble the entity prompt. A caller-supplied command wins — the smoke
      // driver uses it — but the real UI path never sets one.
      let command = opts.command
      if (!command && cwd) {
        const def = getEntityDefinition(entityId)
        if (!def) {
          return { id: null, name: null, error: `Unknown entity '${entityId}'` }
        }

        const refs = resolveCapabilityRefs(def.rahmen.capabilityAnbindung, cwd)
        if (refs.missing.length > 0) {
          console.warn(
            `[ipc] entity '${entityId}': ${refs.missing.length} capability SKILL.md missing, ` +
            `not referenced: ${refs.missing.join(', ')}`
          )
        }

        const prompt = assembleEntityClaudeMd({
          body: def.body,
          persona: def.persona ?? undefined,
          niveau: def.rahmen.capabilityNiveau,
          capabilities: refs.present,
        })
        const promptPath = writeEntityPromptFile(app.getPath('userData'), name, prompt)

        const adapter = adapterRegistry.getDefault()
        const launch = adapter.buildLaunchCommand({
          projectPath: cwd,
          sessionName: name,
          appendSystemPromptFile: promptPath,
          model: def.rahmen.model || undefined,
        })
        command = formatShellCommand(launch.cmd, launch.args)
      }

      if (!services.tmux.isConnected()) {
        await services.tmux.connect()
      }
      const sessionId = await services.tmux.createSession(name, { ...opts, cwd, command })
```

Die bestehende Zeile `const sessionId = await services.tmux.createSession(name, { ...opts, cwd })`
wird durch die letzte Zeile oben ersetzt — `command` muss **nach** dem Spread stehen, sonst
überschreibt `opts.command` (üblicherweise `undefined`) den gebauten Befehl wieder.

Oberhalb der Handler-Registrierung, einmalig im Modul:

```typescript
const adapterRegistry = new AdapterRegistry()
```

`def.rahmen.model` trägt `'heavy'` beziehungsweise `''`. `'heavy'` ist **keine** gültige
Claude-Model-ID. Vor dem Weiterreichen prüfen, wie `model` sonst im Repo aufgelöst wird
(`grep -rn "'heavy'" src/`); existiert keine Übersetzung, `model` in diesem Task **weglassen** und
den Punkt in Abschnitt „Offene Punkte" unten aufnehmen — ein erfundenes Mapping wäre schlimmer als
keins.

- [ ] **Schritt 6: Prompt-Datei beim Zerstören aufräumen**

Im `SESSION_DESTROY`-Handler nach `await services.tmux.killSession(name)` einfügen:

```typescript
      removeEntityPromptFile(app.getPath('userData'), name)
```

- [ ] **Schritt 7: Volle Suite, Typecheck, Lint**

Ausführen: `npm test && npm run typecheck && npm run lint`
Erwartet: alles grün — und **das beweist nichts über die Verdrahtung**. Kein Test dieses Repos
erreicht einen `ipcMain`-Handler. Der Beweis kommt in Task 8.

- [ ] **Schritt 8: Der Bündel-Nachweis — hier schließt die Kette wirklich**

> **Zweimal verschoben, am 2026-08-10 jeweils nach dem Nachmessen.** Der Nachweis stand
> ursprünglich in Task 1 (dort unmöglich: `bodies.ts` hatte keinen Konsumenten) und dann in
> Task 4 (dort ebenso: die Registry selbst hatte keinen Aufrufer, `ipc-handlers.ts` importierte
> aus dem Preset-Bereich nur `preset-catalog.ts`). **Erst dieser Task** importiert
> `getEntityDefinition` in `ipc-handlers.ts`, und `ipc-handlers.ts` hängt an `main.ts`. Damit
> reicht die Import-Kette zum ersten Mal von der Einstiegsdatei bis zu den Bodies.

```bash
npm run build && npm run verify:bundle; echo "exit=$?"
```

Erwartet: `[verify-bundle] OK — 4/4 markers present`, `exit=0` — zwei Bodies aus Task 1, zwei
Personas aus Task 3.

Meldet es weiterhin `MISSING`, ist **das der Befund dieses Tasks**, wichtiger als jeder grüne
Unit-Test: dann verliert die gepackte App ihre Entitäts-Texte still, während die Suite grün
bleibt. Nicht durch einen Re-Export in `main.ts` reparieren — dieser Weg wurde in Task 1 gebaut
und verworfen. Stattdessen die Import-Kette von `main.ts` über `ipc-handlers.ts` bis `bodies.ts`
nachverfolgen und melden, wo sie reißt.

- [ ] **Schritt 9: Committen**

```bash
git add src/main/util/shell-quote.ts tests/util/shell-quote.test.ts src/main/ipc-handlers.ts
git commit -m "feat(session): launch the entity with its assembled prompt on session:create"
```

---

### Task 8: In der laufenden App beweisen

Der einzige Task, der die eigentliche Frage beantwortet. Grüne Tests sagen hier nichts.

**Dateien:** keine. Diagnose, kein Bau.

**Warnung, in Phase 8 am eigenen Leib bezahlt:** Ein IPC-Aufruf mit selbst gesetzten Parametern
beweist den *Handler*, nicht den *Nutzerweg*. Phase 8 prüfte `session:create` mit einem von Hand
gesetzten `command` — einem Feld, das die echte App nie setzt. Der Beweis war keiner. Deshalb
wird hier **ohne `command`** aufgerufen, exakt wie `src/renderer/index.tsx:54`.

- [ ] **Schritt 1: Vorher aufräumen**

```bash
tmux list-sessions 2>/dev/null || echo "keine tmux-Sessions"
```

Erwartet: keine `keel-`-Sessions. Vorhandene vor dem Lauf beenden, sonst ist hinterher nicht
unterscheidbar, welche Session dieser Lauf erzeugt hat.

- [ ] **Schritt 2: Die App starten**

```bash
.claude/skills/run-keel/launch.sh
```

Erwartet: App läuft. Die StatusBar sollte `⚠ 2 Subsysteme degradiert: nanoclaw, voice` melden;
stünde dort `graph`, wäre etwas anderes kaputt und dieser Task ist blockiert.

- [ ] **Schritt 3: Eine Session auf dem echten Nutzerweg erzeugen**

```bash
D=".claude/skills/run-keel/driver.mjs"
node $D window "window.cipherKeel.invoke('session:create', { entityId: 'architect' })"
```

Erwartet: `{ id: '$…', name: 'keel-<projekt>-architect-<seed>', error: null }`.
Kommt `No session name and no active project`, ist kein Projekt aktiv — dann zuerst über die
Oberfläche eines anlegen oder aktivieren und den Aufruf wiederholen.

- [ ] **Schritt 4: Prüfen, dass `claude` mit dem Flag gestartet wurde**

```bash
NAME=<name aus Schritt 3>
tmux list-panes -t "$NAME" -F '#{pane_start_command}'
tmux capture-pane -p -t "$NAME" | head -30
```

Erwartet: Der Pane läuft `claude` mit `--append-system-prompt-file <pfad>`. `pane_start_command`
ist leer, wenn die Session als Shell startete und der Befehl per `send-keys` nachkam — dann zählt
die `capture-pane`-Ausgabe: dort muss der getippte Befehl mitsamt Flag sichtbar sein.

**Fehlt das Flag, ist die Startstrecke nicht angeschlossen** — zurück zu Task 7, nicht
weiterbauen.

- [ ] **Schritt 5: Prüfen, dass die Prompt-Datei liegt und trägt**

```bash
P="$HOME/Library/Application Support/cipher keel/entity-prompts/$NAME.md"
ls -l "$P"
head -20 "$P"
grep -c "BEGIN:Persona" "$P"
grep -c "claude/capabilities" "$P"
```

Erwartet: Datei existiert mit Modus `-rw-------`; der Kopf ist der Architect-Body; genau eine
`BEGIN:Persona`-Marke. Der letzte Zähler muss **`0`** sein — es existiert noch keine einzige
SKILL.md, also darf auch keine referenziert werden. Ein Wert über `0` heißt, `resolveCapabilityRefs`
greift nicht.

Weicht der `userData`-Pfad ab, ihn aus der App selbst holen:
`node $D window "window.cipherKeel.invoke('services:status')"` zeigt den Zustand;
den Pfad notfalls über `app.getPath('userData')` im Hauptprozess-Log nachsehen.

- [ ] **Schritt 6: Prüfen, dass die Entität sich als solche verhält**

```bash
tmux send-keys -t "$NAME" "Wer bist du und was tust du ausdruecklich nicht?" Enter
sleep 20
tmux capture-pane -p -t "$NAME" | tail -40
```

Erwartet: Die Antwort benennt die Architect-Rolle und mindestens eine der drei negativen Grenzen
(kein produktiver Code, keine Welle-Planung, keine Anforderungs-Schärfung). Eine generische
Claude-Antwort ohne Rollenbezug heißt: die Datei kommt an, wird aber nicht als System-Prompt
verwendet — dann ist die Flag-Entscheidung selbst zu prüfen, bevor Phase B beginnt.

- [ ] **Schritt 7: Dieselbe Prüfung für den Workshop**

```bash
node $D window "window.cipherKeel.invoke('session:create', { entityId: 'workshop' })"
```

Dann Schritt 4 bis 6 für diesen Namen wiederholen. Der Workshop ist der zweite Prüfstein, weil er
seinen Rahmen über eine **Fabrik** liefert und seine `personaVorgabe` leer ist — er belegt, dass
Registry und Persona-Fallback für beide Formen tragen.

- [ ] **Schritt 8: Aufräumen und den Befund festhalten**

```bash
.claude/skills/run-keel/stop.sh
tmux list-sessions 2>/dev/null
```

`stop.sh` meldet „tmux sessions removed: 0" auch dann, wenn eine von der App erzeugte Session noch
läuft. Verbliebene `keel-`-Sessions mit `tmux kill-session -t <name>` selbst beenden.

- [ ] **Schritt 9: Den Beweis committen**

Das Beobachtete in `docs/superpowers/plans/2026-08-10-entitaets-startstrecke-und-personas.md`
unter einem neuen Abschnitt „Messprotokoll Task 8" festhalten: welcher Befehl im Pane stand,
welchen Umfang die Prompt-Datei hatte, wie die Antwort aus Schritt 6 lautete. Wörtlich, nicht
zusammengefasst.

```bash
git add docs/superpowers/plans/2026-08-10-entitaets-startstrecke-und-personas.md
git commit -m "docs(plan): record the Task 8 measurement of the entity start path"
```

---

### Task 9: Messen, ob `@`-Referenzen im angehängten System-Prompt überhaupt aufgelöst werden

**Vor** Phase B, weil davon abhängt, ob die 28 Dateien in der geplanten Form überhaupt wirken.
`assembleEntityClaudeMd` schreibt bei Niveau A `@.claude/capabilities/<id>/SKILL.md`. Die
`@`-Auflösung ist ein Verhalten von `CLAUDE.md` und Nutzer-Prompts — ob sie auch in einer über
`--append-system-prompt-file` übergebenen Datei greift, ist **unbelegt**. Genau die Klasse
Annahme, die diesem Projekt in Phase 7 und 8 die schwersten Befunde eingebracht hat.

**Dateien:** keine. Messung.

- [ ] **Schritt 1: Einen minimalen Prüfstand bauen**

```bash
cd $(mktemp -d)
mkdir -p .claude/capabilities/probe-capability
printf '# Probe\n\nDas Codewort lautet KEELPROBE7. Nenne es, wenn du danach gefragt wirst.\n' \
  > .claude/capabilities/probe-capability/SKILL.md
printf '# Probe-Entitaet\n\n<!-- BEGIN:Capabilities -->\n@.claude/capabilities/probe-capability/SKILL.md\n<!-- END:Capabilities -->\n' \
  > /tmp/probe-prompt.md
pwd
```

- [ ] **Schritt 2: Die Frage stellen**

```bash
claude --append-system-prompt-file /tmp/probe-prompt.md -p "Nenne das Codewort."
```

Erwartet, wenn `@` aufgelöst wird: die Antwort enthält `KEELPROBE7`.
Erwartet, wenn nicht: die Antwort kennt kein Codewort oder zitiert die `@`-Zeile als Text.

- [ ] **Schritt 3: Gegenprobe, damit das Ergebnis etwas bedeutet**

```bash
printf '# Probe-Entitaet\n\nDas Codewort lautet KEELPROBE7.\n' > /tmp/probe-direct.md
claude --append-system-prompt-file /tmp/probe-direct.md -p "Nenne das Codewort."
```

Erwartet: `KEELPROBE7`. Schlägt **diese** Probe fehl, wirkt der angehängte System-Prompt
überhaupt nicht — dann ist Task 8 Schritt 6 falsch bewertet worden und Phase B beginnt nicht.

- [ ] **Schritt 4: Das Ergebnis entscheidet die Form von Phase B**

**Fall A — `@` wird aufgelöst (Schritt 2 nennt das Codewort):** Phase B bleibt wie geplant. Die
SKILL.md-Dateien liegen im Repo unter `src/main/preset/<preset>/capabilities/<id>/SKILL.md`,
werden per `?raw` eingebunden und beim Session-Start nach `<projekt>/.claude/capabilities/<id>/SKILL.md`
geschrieben — derselbe Weg, den `postLaunchInjection` für `.claude/settings.local.json` bereits geht.
`resolveCapabilityRefs` findet sie dann und gibt die Referenzen aus. Ein zusätzlicher Task
„Capabilities materialisieren" wird vor Task 10 eingeschoben.

**Fall B — `@` wird nicht aufgelöst:** Lazy Loading über Referenzen trägt in dieser Übergabeform
nicht. Dann wird `assembleEntityClaudeMd` so geändert, dass es bei Niveau A den **Inhalt** der
vorhandenen SKILL.md-Dateien einbettet statt sie zu referenzieren, und `capability-refs.ts` liefert
Inhalte statt Namen. Die SKILL.md-Dateien selbst und ihr Inhalt bleiben unverändert nötig — nur der
Zustellweg ändert sich. Das Token-Budget wird damit zum Thema: die Niveau-C-Grenze von 2000
geschätzten Token gilt dort schon, für Niveau A ist keine Grenze definiert. Vor dem Umbau messen,
wie groß der Prompt für den Architect mit sieben eingebetteten Capabilities wird.

- [ ] **Schritt 5: Den Befund festhalten**

Ergebnis wörtlich in den Abschnitt „Messprotokoll Task 9" dieses Plans schreiben — welcher Fall
eintrat, mit der tatsächlichen Ausgabe beider Proben. Danach den Prüfstand löschen.

```bash
git add docs/superpowers/plans/2026-08-10-entitaets-startstrecke-und-personas.md
git commit -m "docs(plan): record whether @-refs resolve inside an appended system prompt"
```

---

# Phase B — Capability-SKILL.md, preset-weise

Erst ab hier, weil vorher nicht feststand, ob und wie die Dateien wirken. Reihenfolge folgt der
Verdrahtung: Architect zuerst (sein Body existiert seit Phase 3a), dann Cyber Factory, dann
Systems Engineer und Workshop — letztere brauchen vorher überhaupt erst `CapabilityPackage`-Objekte.

**Gemeinsame Form aller SKILL.md-Dateien.** Jede Datei trägt:

```markdown
---
name: <capability-id>
description: <ein Satz — wofür, in der Sprache von beschreibung im CapabilityPackage>
---

# <Titel>

## Wann das gilt
## Vorgehen
## Grenzen
```

**Gemeinsamer Wächter-Test.** Für jedes Preset eine Testdatei nach diesem Muster (Beispiel
Architect; für die anderen Presets Pfad, `describe` und Namensliste austauschen):

```typescript
// tests/preset/architect/architect-capability-skills.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ARCHITECT_CAPABILITIES } from '../../../src/main/preset/architect/architect-preset'

const DIR = path.join(__dirname, '../../../src/main/preset/architect/capabilities')

describe('Architect capability SKILL.md files', () => {
  for (const id of ARCHITECT_CAPABILITIES) {
    describe(id, () => {
      const file = path.join(DIR, id, 'SKILL.md')

      it('exists', () => {
        expect(fs.existsSync(file), file).toBe(true)
      })

      it('carries frontmatter naming itself', () => {
        const content = fs.readFileSync(file, 'utf-8')
        expect(content.startsWith('---\n')).toBe(true)
        expect(content).toMatch(new RegExp(`^name: ${id}$`, 'm'))
        expect(content).toMatch(/^description: \S/m)
      })

      it('carries the three required sections', () => {
        const content = fs.readFileSync(file, 'utf-8')
        expect(content).toContain('## Wann das gilt')
        expect(content).toContain('## Vorgehen')
        expect(content).toContain('## Grenzen')
      })

      it('is substantial but not bloated', () => {
        const content = fs.readFileSync(file, 'utf-8')
        expect(content.length).toBeGreaterThan(400)
        expect(content.length).toBeLessThan(8000)
      })
    })
  }
})
```

---

### Task 10: Die sieben Architect-Capabilities

**Dateien:**
- Erstellen: `src/main/preset/architect/capabilities/<id>/SKILL.md` für alle sieben IDs
- Erstellen: `tests/preset/architect/architect-capability-skills.test.ts`

**Schnittstellen:**
- Konsumiert: `ARCHITECT_CAPABILITIES` aus `architect-preset.ts`
- Produziert: sieben Dateien, deren Pfade zu `pfad` in `architect-capabilities.ts` passen

| ID | Inhaltsquelle | Kern |
|---|---|---|
| `architect-core-identity` | `architect-capabilities.ts:15-33` (`CORE_IDENTITY_C_EXTRAKT`, ausformulieren) + M5 §5 | Identität, Trennung Entwurf/Bauen, drei negative Grenzen |
| `subsystem-zerlegung-guide` | M5 §5 („zerlegt rekursiv … Blackbox/Whitebox, entlang stabilisierbarer Schnittstellen") | Rekursive Zerlegung, Schnittstellen-Verträge mit `input_schema`, `output_schema`, `fehlerverhalten` |
| `adr-format-guide` | M5 §5, `architect-body.md:12` | ADR-Struktur Kontext–Optionen–Entscheidung–Konsequenzen; Tiefe je Niveau |
| `anforderungspaket-formulierer` | M5 §5, `architect-body.md:13` | Granulare Pakete je Subsystem, max 1000 Token für Niveau C |
| `niveau-c-formulierer` | `src/main/preset/niveau.ts`, `shared/ent-config-templates.ts` (`D13_HINWEIS`, `NIVEAU_BEDIENUNG_SECTION`) | Outputs auf Niveau-C-taugliche Form reduzieren — Pflicht-Capability |
| `coaching-loop-guide` | M5 §5 („graph-vermittelt: CF-Worker schreiben Frage-Knoten, der Architect antwortet") | `offene_fragen`-Query, Antwort-Knoten, Drift-Signale als `gate_befund` mit `gate_typ: 'drift'` |
| `rolling-summary` | `src/main/preset/shared/rolling-summary.ts` (145 Zeilen, getestet) | Das Verhalten des Moduls in Prosa — Struktur, Auslöser, was hineingehört |

- [ ] **Schritt 1: Den Wächter-Test schreiben**

Die Testdatei oben unverändert unter `tests/preset/architect/architect-capability-skills.test.ts`
anlegen.

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `npx vitest run tests/preset/architect/architect-capability-skills.test.ts`
Erwartet: FAIL — 7 × „exists" schlägt fehl.

- [ ] **Schritt 3: Die sieben Dateien schreiben**

Je Datei die Quelle aus der Tabelle öffnen und den Inhalt daraus formulieren. Für
`rolling-summary` das Modul lesen (`src/main/preset/shared/rolling-summary.ts`) und beschreiben,
was es tut — nicht erfinden, was es tun könnte. Für `architect-core-identity` das vorhandene
`CORE_IDENTITY_C_EXTRAKT` als Kern nehmen und auf Niveau-A-Tiefe ausbauen; der C-Extrakt bleibt
unverändert im Code stehen, er dient dem Niveau-C-Pfad.

Umfang je Datei 400–8000 Zeichen (der Test zieht die Grenzen). Deutsch.

- [ ] **Schritt 4: Test laufen lassen, Erfolg bestätigen**

Ausführen: `npx vitest run tests/preset/architect/architect-capability-skills.test.ts`
Erwartet: PASS, 28 Tests (7 × 4).

- [ ] **Schritt 5: Volle Suite, Typecheck, Lint**

Ausführen: `npm test && npm run typecheck && npm run lint`
Erwartet: alles grün.

- [ ] **Schritt 6: Committen**

```bash
git add src/main/preset/architect/capabilities tests/preset/architect/architect-capability-skills.test.ts
git commit -m "feat(preset): add the seven Architect capability SKILL.md files"
```

---

### Task 11: Die acht Cyber-Factory-Capabilities

**Dateien:**
- Erstellen: `src/main/preset/cyber-factory/capabilities/<id>/SKILL.md` für alle acht IDs
- Erstellen: `tests/preset/cyber-factory/cf-capability-skills.test.ts`

**Schnittstellen:**
- Konsumiert: die Namensliste aus `cf-capabilities.ts`
- Produziert: acht Dateien passend zu den dort deklarierten `pfad`-Werten

Sechs der acht haben bereits gebauten, getesteten Code — die SKILL.md ist dort Prosa über
vorhandenes Verhalten, kein Erfinden:

| ID | Inhaltsquelle im Repo |
|---|---|
| `cf-core-identity` | `cf-preset.ts`, `cf-body.md`, M5 §8.3 |
| `welle-plan-guide` | `cf-welle-plan.ts` (98 Zeilen) |
| `welle-plan-granularisierer` | `cf-welle-plan.ts` — der Granularisierungs-Teil; zusätzlich `ent-config-templates.ts` (`GRANULARITAETS_PFLICHT_SECTION`) |
| `worker-startup-protokoll` | `cf-worker-orchestration.ts` (44 Zeilen) + `claude-code.ts:227-242` (`buildCyberFactoryPromptFragment`, Session-Präfix `ckeel-cf-`) |
| `rueckweg-protokoll` | `cf-rueckweg.ts` (61 Zeilen) + M5 §5 „Der Rückweg vom Bauen zum Entwurf" |
| `model-routing-guide` | `cf-model-routing.ts` (20 Zeilen) |
| `risk-review-guide` | `cf-risk-review.ts` (45 Zeilen) |
| `graph-navigation` | `src/main/graph/mcp-server.ts` — die sieben `graph_*`-Tools mit ihren echten Namen und Parametern |

- [ ] **Schritt 1: Den Wächter-Test schreiben**

`tests/preset/cyber-factory/cf-capability-skills.test.ts` nach dem Muster aus der Phasen-Einleitung.
Die Namensliste kommt aus `cf-capabilities.ts` — dort steht sie in den Paket-Objekten; falls kein
Namens-Array exportiert wird, in `cf-capabilities.ts` eines ergänzen:

```typescript
/** Names of all cyber factory capability packages, in declaration order. */
export const CF_CAPABILITY_NAMES = ALL_PACKAGES.map(p => p.name)
```

und im Test importieren.

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `npx vitest run tests/preset/cyber-factory/cf-capability-skills.test.ts`
Erwartet: FAIL — 8 × „exists" schlägt fehl.

- [ ] **Schritt 3: Die acht Dateien schreiben**

Für `graph-navigation` die Tool-Namen **aus `mcp-server.ts` ablesen**, nicht aus dem Gedächtnis —
eine Capability, die auf nicht existierende Tools zeigt, ist genau der Fehler, wegen dem
`companion-memory-tools` gestrichen wurde.

- [ ] **Schritt 4: Test laufen lassen, Erfolg bestätigen**

Ausführen: `npx vitest run tests/preset/cyber-factory/cf-capability-skills.test.ts`
Erwartet: PASS, 32 Tests (8 × 4).

- [ ] **Schritt 5: Volle Suite, Typecheck, Lint**

Ausführen: `npm test && npm run typecheck && npm run lint`
Erwartet: alles grün.

- [ ] **Schritt 6: Committen**

```bash
git add src/main/preset/cyber-factory tests/preset/cyber-factory/cf-capability-skills.test.ts
git commit -m "feat(preset): add the eight Cyber Factory capability SKILL.md files"
```

---

### Task 12: Systems Engineer — erst Capability-Objekte, dann sieben SKILL.md

Der SE führt seine Capabilities heute **nur als String-Listen** (`se-capabilities.ts:12-36`). Es
gibt kein `CapabilityPackage`, also auch keinen `pfad`. Das wird zuerst behoben.

`companion-memory-tools` entfällt: Die Capability beschreibt `companion_memory_*`-MCP-Tools, die es
im Mux gibt und in keel nicht — nachgesehen, kein einziges Vorkommen in `src/`. Der Companion ist
zurückgestellt, die Capability geht mit. Damit hat der SE **7 Pakete bei Niveau A** statt 8 und
**5 bei Niveau B** statt 6.

**Dateien:**
- Ändern: `src/main/preset/systems-engineer/se-capabilities.ts:17` und `:28`
- Ändern: `src/main/preset/systems-engineer/se-preset.ts:21` — **die Liste steht dreimal im Code**,
  nicht zweimal: `se-preset.ts` führt eine eigene `SE_CAPABILITIES`-Konstante. Alle drei Stellen
  anfassen, sonst driften Rahmen und Capability-Liste auseinander.
- Erstellen: `src/main/preset/systems-engineer/capabilities/<id>/SKILL.md` für sieben IDs
- Erstellen: `tests/preset/systems-engineer/se-capability-skills.test.ts`
- Ändern: `tests/se-capabilities.test.ts:20,42,79,83` (Zahlen 8 und 6)
- Ändern: `tests/se-preset.test.ts:33` (Zusicherung „exactly 8 entries") und `:43` (Namensliste)
- Ändern: `tests/ent-validation.test.ts:45` (Namensliste)

Die SE-Tests liegen historisch im Wurzelverzeichnis von `tests/`, nicht unter
`tests/preset/systems-engineer/`. Bestehende Dateien bleiben, wo sie sind; die **neue**
Wächter-Testdatei kommt unter `tests/preset/systems-engineer/`, wie bei Architect, Cyber Factory
und Workshop.

**Schnittstellen:**
- Konsumiert: `getSECapabilities(niveau)` (bestehend), `CapabilityPackage`, `LoaderType`
- Produziert: `SE_PACKAGES: CapabilityPackage[]` aus `se-capabilities.ts`

| ID | Inhaltsquelle |
|---|---|
| `se-core-identity` | M5 §4 + `se-body.md` (Task 2) |
| `gate-urteil-guide` | `se-gate-urteil.ts` (55 Zeilen) + M5 §4: struktureller und Plausibilitäts-Befund werden **nicht verrechnet** |
| `trigger-zeiger-format` | `se-trigger.ts` (71 Zeilen) — der zugeschnittene Zeiger, nicht „du bist dran" |
| `steuer-ueberblick-tool` | M5 §4 + `src/main/graph/query.ts` — die aggregierende Abfrage über Stränge, Phasenposition, offene Gates |
| `handoff-logik-guide` | M5 §4 und §7 — triggern, lesen, schreiben; keine Entität-zu-Entität-Handoffs |
| `rolling-summary` | `src/main/preset/shared/rolling-summary.ts` — **inhaltsgleich mit der Architect-Datei aus Task 10.** Nicht kopieren: dieselbe Datei am selben Ort ist eine geteilte Capability. Siehe Schritt 3. |
| `graph-navigation-advanced` | `src/main/graph/query.ts`, `search.ts`, `expand` in `mcp-server.ts` |

- [ ] **Schritt 1: Den fehlschlagenden Test für die Paket-Objekte schreiben**

Anhängen an `tests/se-capabilities.test.ts`:

```typescript
// tests/se-capabilities.test.ts lives at the root of tests/ — one level up, not three.
import { SE_PACKAGES, getSECapabilities } from '../src/main/preset/systems-engineer/se-capabilities'
import { validateCapabilityPackage } from '../src/main/preset/capability-schema'

describe('SE capability packages', () => {
  it('defines a package for every Niveau-A capability', () => {
    const names = SE_PACKAGES.map(p => p.name)
    for (const id of getSECapabilities('A')) {
      expect(names, id).toContain(id)
    }
  })

  it('every package passes the schema validator', () => {
    for (const pkg of SE_PACKAGES) {
      expect(validateCapabilityPackage(pkg).errors, pkg.name).toEqual([])
    }
  })

  it('no longer carries companion-memory-tools', () => {
    // The companion is deferred; keel has no companion_memory_* MCP tools.
    expect(getSECapabilities('A')).not.toContain('companion-memory-tools')
    expect(getSECapabilities('B')).not.toContain('companion-memory-tools')
  })

  it('keeps seven capabilities at Niveau A and five at Niveau B', () => {
    expect(getSECapabilities('A')).toHaveLength(7)
    expect(getSECapabilities('B')).toHaveLength(5)
  })
})
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `npx vitest run tests/se-capabilities.test.ts`
Erwartet: FAIL — `SE_PACKAGES` existiert nicht; die Längen sind 8 und 6.

- [ ] **Schritt 3: Die Capability aus allen drei Quellen entfernen**

`'companion-memory-tools'` streichen in:

- `src/main/preset/systems-engineer/se-capabilities.ts:17` (`SE_CAPABILITIES_A`)
- `src/main/preset/systems-engineer/se-capabilities.ts:28` (`SE_CAPABILITIES_B`)
- `src/main/preset/systems-engineer/se-preset.ts:21` (`SE_CAPABILITIES`)

Die Kommentare über allen drei Konstanten auf die neuen Zahlen ziehen (7 bei A, 5 bei B).
Anschließend in `se-capabilities.ts` die Paket-Objekte ergänzen:

```typescript
import { LoaderType } from '../capability-schema'
import type { CapabilityPackage } from '../capability-schema'

/**
 * Capability packages for the Systems Engineer.
 *
 * rolling-summary is shared with the Architect and points at the same file —
 * one capability, one source of truth, referenced from both presets.
 */
export const SE_PACKAGES: CapabilityPackage[] = [
  {
    name: 'se-core-identity',
    beschreibung: 'Kern-Identität und Auftrag des Systems Engineer',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/se-core-identity/SKILL.md',
  },
  // … die übrigen sechs nach demselben Muster, pfad jeweils
  // '.claude/capabilities/<name>/SKILL.md'
]
```

Alle sieben Objekte ausschreiben; die `beschreibung` je Paket muss unter 100 geschätzten Token
bleiben (`validateCapabilityPackage` prüft das), also ein knapper Satz.

- [ ] **Schritt 4: Die sieben SKILL.md schreiben**

Sechs neue Dateien unter `src/main/preset/systems-engineer/capabilities/<id>/SKILL.md`.

Für `rolling-summary` **keine zweite Datei anlegen.** Stattdessen die in Task 10 geschriebene
Datei nach `src/main/preset/shared/capabilities/rolling-summary/SKILL.md` verschieben und in
Task 10s Testdatei den Pfad für genau diese ID auf das gemeinsame Verzeichnis zeigen lassen. Der
SE-Wächter-Test tut dasselbe. Begründung: die Capability ist in `architect-capabilities.ts` und in
`SE_CAPABILITIES_A` unter demselben Namen deklariert — zwei divergierende Dateien wären ein Bug,
der erst auffiele, wenn zwei Entitäten sich widersprechen.

- [ ] **Schritt 4b: Die drei bestehenden Testdateien nachziehen**

Die Streichung kippt vier Zusicherungen in drei Dateien. Alle vier sind zu **ändern**, nicht zu
entfernen — der Wegfall ist eine Entscheidung, und ein Test, der die neue Zahl festhält, ist
genau das, was sie absichert:

- `tests/se-capabilities.test.ts:20` → `toHaveLength(7)`, `:42` → `toHaveLength(5)`,
  `:79` → `toHaveLength(7)`, `:83` → `toHaveLength(5)`
- `tests/se-preset.test.ts:33` → „capabilityAnbindung has exactly 7 entries", und die Namensliste
  ab `:43` ohne `'companion-memory-tools'`
- `tests/ent-validation.test.ts:45` → dieselbe Namensliste ohne den Eintrag

- [ ] **Schritt 5: Den Wächter-Test schreiben und laufen lassen**

`tests/preset/systems-engineer/se-capability-skills.test.ts` nach dem Muster aus der
Phasen-Einleitung, mit `getSECapabilities('A')` als Namensliste und einer Pfad-Auflösung, die
`rolling-summary` im geteilten Verzeichnis sucht:

```typescript
const OWN = path.join(__dirname, '../../../src/main/preset/systems-engineer/capabilities')
const SHARED = path.join(__dirname, '../../../src/main/preset/shared/capabilities')
const fileFor = (id: string) =>
  id === 'rolling-summary'
    ? path.join(SHARED, id, 'SKILL.md')
    : path.join(OWN, id, 'SKILL.md')
```

Ausführen: `npx vitest run tests/preset/systems-engineer/`
Erwartet: PASS.

- [ ] **Schritt 6: Volle Suite als Netz für übersehene Fundstellen**

Ausführen: `npm test && grep -rn "companion-memory-tools" src/ tests/`
Erwartet: Suite grün, `grep` ohne Treffer. Ein verbliebener Treffer ist eine vierte Fundstelle,
die Schritt 3 und 4b nicht kannten.

- [ ] **Schritt 7: Typecheck, Lint, committen**

```bash
npm run typecheck && npm run lint
git add src/main/preset/systems-engineer src/main/preset/shared/capabilities \
        src/main/preset/architect tests/preset/systems-engineer tests/preset/architect \
        tests/se-capabilities.test.ts tests/se-preset.test.ts tests/ent-validation.test.ts
git commit -m "feat(preset): SE capability packages and SKILL.md files, drop companion-memory-tools"
```

---

### Task 13: Workshop — Capability-Objekte und sieben SKILL.md

Wie beim SE führt der Workshop seine Capabilities nur als String-Listen, hier in
`workshop/niveau-config.ts:39-65`. Erst Objekte, dann Dateien.

**Dateien:**
- Erstellen: `src/main/preset/workshop/workshop-capabilities.ts`
- Erstellen: `src/main/preset/workshop/capabilities/<id>/SKILL.md` für sechs IDs
- Erstellen: `tests/preset/workshop/workshop-capability-skills.test.ts`

**Schnittstellen:**
- Konsumiert: `getNiveauWorkshopConfig(niveau)` aus `niveau-config.ts`, `CapabilityPackage`
- Produziert: `WORKSHOP_PACKAGES: CapabilityPackage[]`

| ID | Inhaltsquelle im Repo |
|---|---|
| `findings-lesen` | M5 §8.5 + `workshop-flow.ts` — Findings und Items aus dem Graphen lesen |
| `item-dispatch` | `workshop/routing.ts` (139 Zeilen) + `workshop-fixing-dispatch.ts` (57) |
| `debugger-beauftragung` | M5 §8.6 — Beauftragung als phasen-interne Orchestrierung, nicht als Ketten-Handoff |
| `completeness-gate` | `workshop/completeness-gate.ts` (107 Zeilen) — inklusive der drei Modi je Niveau |
| `status-konsolidierung` | `workshop/fix-report-generator.ts` (123 Zeilen) |
| `worker-monitoring` | `workshop-flow.ts` (218) + `worker-task-format.ts` (90) |
| `rolling-summary` | geteilte Datei aus Task 12 — kein Duplikat |

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`tests/preset/workshop/workshop-capability-skills.test.ts` nach dem Muster der Phasen-Einleitung,
Namensliste aus `getNiveauWorkshopConfig('A').capabilities`, `rolling-summary` auf das geteilte
Verzeichnis gezeigt wie in Task 12 Schritt 5. Dazu die Paket-Zusicherungen:

```typescript
import { WORKSHOP_PACKAGES } from '../../../src/main/preset/workshop/workshop-capabilities'
import { validateCapabilityPackage } from '../../../src/main/preset/capability-schema'
import { getNiveauWorkshopConfig } from '../../../src/main/preset/workshop/niveau-config'

describe('Workshop capability packages', () => {
  it('defines a package for every Niveau-A capability', () => {
    const names = WORKSHOP_PACKAGES.map(p => p.name)
    for (const id of getNiveauWorkshopConfig('A').capabilities) {
      expect(names, id).toContain(id)
    }
  })

  it('every package passes the schema validator', () => {
    for (const pkg of WORKSHOP_PACKAGES) {
      expect(validateCapabilityPackage(pkg).errors, pkg.name).toEqual([])
    }
  })

  it('marks debugger-beauftragung as reference material, matching the Niveau-B note', () => {
    const pkg = WORKSHOP_PACKAGES.find(p => p.name === 'debugger-beauftragung')!
    expect(pkg.niveauMinimum).toBe('B')
  })
})
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `npx vitest run tests/preset/workshop/workshop-capability-skills.test.ts`
Erwartet: FAIL — Modul nicht auflösbar.

- [ ] **Schritt 3: `workshop-capabilities.ts` schreiben**

Sieben `CapabilityPackage`-Objekte, `pfad` jeweils `.claude/capabilities/<name>/SKILL.md`,
`loader: LoaderType.SkillMd`. `debugger-beauftragung` bekommt `niveauMinimum: 'B'` — der Kommentar
in `niveau-config.ts:49` hält fest, dass es bei Niveau B als `reference-material` läuft und bei C
ganz entfällt.

- [ ] **Schritt 4: Die sechs SKILL.md schreiben**

`completeness-gate` muss die drei Modi aus `niveau-config.ts` benennen (`graph-query`, `prose`,
`checkpoint-prompt`) — die Werte dort ablesen, nicht aus dem Gedächtnis.

- [ ] **Schritt 5: Test laufen lassen, Erfolg bestätigen**

Ausführen: `npx vitest run tests/preset/workshop/`
Erwartet: PASS.

- [ ] **Schritt 6: Volle Suite, Typecheck, Lint, committen**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/preset/workshop tests/preset/workshop
git commit -m "feat(preset): Workshop capability packages and SKILL.md files"
```

---

### Task 14: Capabilities ins Projekt materialisieren und erneut beweisen

Nur auszuführen, wenn Task 9 **Fall A** ergab. Bei Fall B stattdessen den dort beschriebenen
Einbettungs-Umbau vornehmen und danach Schritt 4 bis 6 dieses Tasks unverändert ausführen.

**Dateien:**
- Erstellen: `src/main/preset/capability-assets.ts`
- Erstellen: `src/main/session/materialise-capabilities.ts`
- Erstellen: `tests/session/materialise-capabilities.test.ts`
- Ändern: `src/main/ipc-handlers.ts` (`session:create`)

**Schnittstellen:**
- Konsumiert: die SKILL.md-Dateien aus Task 10–13
- Produziert:
  ```typescript
  export const CAPABILITY_SKILLS: Record<string, string>   // id -> SKILL.md content
  export function materialiseCapabilities(
    capabilityIds: string[],
    projectPath: string,
  ): { written: string[]; unknown: string[] }
  ```

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```typescript
// tests/session/materialise-capabilities.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { materialiseCapabilities } from '../../src/main/session/materialise-capabilities'
import { CAPABILITY_SKILLS } from '../../src/main/preset/capability-assets'

let projectDir: string

beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-mat-'))
})

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true })
})

describe('materialiseCapabilities', () => {
  it('writes a known capability to .claude/capabilities/<id>/SKILL.md', () => {
    const result = materialiseCapabilities(['architect-core-identity'], projectDir)
    expect(result.unknown).toEqual([])
    const file = path.join(projectDir, '.claude/capabilities/architect-core-identity/SKILL.md')
    expect(fs.readFileSync(file, 'utf-8')).toBe(CAPABILITY_SKILLS['architect-core-identity'])
  })

  it('reports an unknown capability instead of writing an empty file', () => {
    const result = materialiseCapabilities(['does-not-exist'], projectDir)
    expect(result.unknown).toEqual(['does-not-exist'])
    expect(fs.existsSync(path.join(projectDir, '.claude/capabilities/does-not-exist'))).toBe(false)
  })

  it('overwrites a stale copy from an earlier launch', () => {
    const file = path.join(projectDir, '.claude/capabilities/architect-core-identity/SKILL.md')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, 'stale', 'utf-8')
    materialiseCapabilities(['architect-core-identity'], projectDir)
    expect(fs.readFileSync(file, 'utf-8')).not.toBe('stale')
  })

  it('carries every capability the four shipped presets declare', () => {
    // The registry must never reference a capability the assets do not know.
    const ids = Object.keys(CAPABILITY_SKILLS)
    expect(ids.length).toBeGreaterThanOrEqual(27)
  })
})
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `npx vitest run tests/session/materialise-capabilities.test.ts`
Erwartet: FAIL — Module nicht auflösbar.

- [ ] **Schritt 3: `capability-assets.ts` schreiben**

Ein `?raw`-Import je SKILL.md, gesammelt in einem Record `id → Inhalt`. Der Aufbau folgt
`src/main/preset/bodies.ts` aus Task 1. Alle IDs aus Task 10–13, `rolling-summary` genau einmal
aus dem geteilten Verzeichnis.

- [ ] **Schritt 4: `materialise-capabilities.ts` schreiben**

Schreibt je ID `<projectPath>/.claude/capabilities/<id>/SKILL.md`, legt Verzeichnisse an,
überschreibt bestehende Dateien, meldet unbekannte IDs zurück statt eine leere Datei zu erzeugen.
Derselbe Weg, den `postLaunchInjection` für `.claude/settings.local.json` bereits geht — das
Verzeichnis `.claude/` wird von der App ohnehin beschrieben.

- [ ] **Schritt 5: In `session:create` einhängen**

In `src/main/ipc-handlers.ts` **vor** dem Aufruf von `resolveCapabilityRefs` einfügen:

```typescript
        const materialised = materialiseCapabilities(def.rahmen.capabilityAnbindung, cwd)
        if (materialised.unknown.length > 0) {
          console.warn(
            `[ipc] entity '${entityId}': no SKILL.md asset for ${materialised.unknown.join(', ')}`
          )
        }
```

`resolveCapabilityRefs` findet die Dateien anschließend und gibt die Referenzen aus — der Code aus
Task 7 ändert sich nicht.

- [ ] **Schritt 6: Test laufen lassen, volle Suite, Typecheck, Lint**

Ausführen: `npx vitest run tests/session/materialise-capabilities.test.ts && npm test && npm run typecheck && npm run lint`
Erwartet: alles grün.

- [ ] **Schritt 7: In der laufenden App erneut beweisen**

Task 8 Schritt 1 bis 5 wiederholen, mit zwei geänderten Erwartungen:

```bash
grep -c "claude/capabilities" "$P"
ls "$PROJEKT/.claude/capabilities/"
```

Erwartet: **7** Referenzen in der Prompt-Datei des Architect (nicht mehr `0`), und sieben
Verzeichnisse im Projekt. Danach Task 8 Schritt 6 — die Antwort muss jetzt Inhalte aus den
Capabilities tragen, nicht nur aus dem Body.

Anschließend `tmux list-sessions` prüfen und selbst aufräumen.

- [ ] **Schritt 8: Committen**

```bash
git add src/main/preset/capability-assets.ts src/main/session/materialise-capabilities.ts \
        src/main/ipc-handlers.ts tests/session/materialise-capabilities.test.ts \
        docs/superpowers/plans/2026-08-10-entitaets-startstrecke-und-personas.md
git commit -m "feat(session): materialise capability SKILL.md files into the project on launch"
```

---

# Phase C — Der Testing Assistant als fünfte Persona

Erst jetzt, und dann kostet sie nur noch Body, Capabilities und einen Registry-Eintrag.

**Die Grenze, die dabei verschoben wird:** Die vier bestehenden Presets sind der ratifizierte
0.1-Schnitt (M6 §3.1 / BG-1), so dokumentiert in `preset-catalog.ts:4-7` und im README. Eine
fünfte verschiebt ihn. Das ist eine Entscheidung, keine Hürde — beide Dokumente werden in Task 16
nachgezogen, damit die Prosa nicht weiter etwas behauptet, was nicht mehr stimmt.

---

### Task 15: Preset Testing Assistant

**Dateien:**
- Erstellen: `src/main/preset/testing-assistant/ta-preset.ts`
- Erstellen: `src/main/preset/testing-assistant/ta-capabilities.ts`
- Erstellen: `src/main/preset/testing-assistant/ta-body.md`
- Erstellen: `src/main/preset/testing-assistant/capabilities/<id>/SKILL.md`
- Ändern: `src/main/preset/bodies.ts`, `src/main/preset/registry.ts`,
  `src/main/preset/capability-assets.ts`
- Erstellen: `tests/preset/testing-assistant/ta-preset.test.ts`,
  `tests/preset/testing-assistant/ta-body.test.ts`,
  `tests/preset/testing-assistant/ta-capability-skills.test.ts`

**Schnittstellen:**
- Konsumiert: `PresetRahmen`, `RollenTyp`, `CapabilityNiveau`, `CapabilityPackage`, `LoaderType`
- Produziert: `createTaRahmen(niveau)`, `TA_RAHMEN`, `TA_CAPABILITIES`, `TA_PACKAGES`, `TA_BODY`

**Inhaltsquellen:**
- M5 §8.4 (`konzept_v1.1.md:145-147`) — Identität, Zweck, Platz, Verhältnisse, Grenzen
- `cyber-factory-pack/09-testing-assistant.md` (289 Zeilen) — die Pack-Entität, laut M5 §8
  „bereits als Entität vorhanden; M5 schärft sie und ordnet sie ein". Portieren und schärfen,
  nicht erfinden.
- `persona-defaults.json` kennt `testing-assistant → cipher` bereits

**Capability-Zuschnitt** (fünf, dem Zweck aus §8.4 folgend):

| ID | Inhalt |
|---|---|
| `ta-core-identity` | Identität und die scharfe Grenze: fixt nicht, ändert keinen Code |
| `suite-lauf-protokoll` | Die Suite laufen lassen und den Lauf beurteilen — hier konkret: `npm test`, die ABI-Falle, `npm run rebuild-native` |
| `testqualitaet-beurteilung` | Testqualität beurteilen statt Testanzahl zählen |
| `adversarial-probing` | Edge Cases und Schwachstellen systematisch suchen |
| `findings-dokumentation` | Findings strukturiert in den Graphen schreiben |
| `rolling-summary` | geteilte Datei aus Task 12 |

- [ ] **Schritt 1: Den fehlschlagenden Body-Test schreiben**

```typescript
// tests/preset/testing-assistant/ta-body.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const BODY_PATH = path.join(__dirname, '../../../src/main/preset/testing-assistant/ta-body.md')

describe('Testing Assistant Body (M5 section 8.4)', () => {
  let body: string

  beforeEach(() => {
    body = fs.readFileSync(BODY_PATH, 'utf-8')
  })

  it('exists and is non-empty', () => {
    expect(body.length).toBeGreaterThan(100)
  })

  it('contains the standard sections', () => {
    expect(body).toContain('## Kernaufgaben')
    expect(body).toContain('## Arbeitsablauf')
    expect(body).toContain('## Negative Grenzen')
    expect(body).toContain('## Niveau-Hinweise')
  })

  it('names all four duties from M5 section 8.4', () => {
    expect(body).toMatch(/Suite/i)
    expect(body).toMatch(/Testqualität/i)
    expect(body).toMatch(/[Aa]dversarial/)
    expect(body).toMatch(/dokumentier/i)
  })

  it('states the sharpest boundary: it does not fix', () => {
    expect(body).toMatch(/fixt nicht|kein.*[Ff]ix/)
    expect(body).toMatch(/ändert keinen Code|kein.*Code.*ändern/i)
  })
})
```

- [ ] **Schritt 2: Den fehlschlagenden Preset-Test schreiben**

```typescript
// tests/preset/testing-assistant/ta-preset.test.ts
import { describe, it, expect } from 'vitest'
import { TA_RAHMEN, createTaRahmen, TA_CAPABILITIES } from '../../../src/main/preset/testing-assistant/ta-preset'
import { validatePresetRahmen, RollenTyp } from '../../../src/main/preset/schema'
import { CapabilityNiveau } from '../../../src/main/preset/niveau'

describe('Testing Assistant preset', () => {
  it('passes the rahmen validator', () => {
    expect(validatePresetRahmen(TA_RAHMEN).errors).toEqual([])
  })

  it('is a phase entity, not a cross-cutting role', () => {
    expect(TA_RAHMEN.rollenTyp).toBe(RollenTyp.PhasenEntitaet)
  })

  it('binds to the testing phase', () => {
    expect(TA_RAHMEN.phasenBindung).toContain('testing')
  })

  it('reads the graph and writes findings back', () => {
    expect(TA_RAHMEN.graphAnbindung).toEqual({ lesen: true, schreiben: true })
  })

  it('defaults to the cipher persona, matching persona-defaults.json', () => {
    expect(TA_RAHMEN.personaVorgabe).toBe('cipher')
  })

  it('does not orchestrate — it has no workers', () => {
    expect(TA_RAHMEN.orchestrierung).toBeFalsy()
  })

  it('narrows its capability set from A to C', () => {
    const a = createTaRahmen(CapabilityNiveau.A).capabilityAnbindung
    const c = createTaRahmen(CapabilityNiveau.C).capabilityAnbindung
    expect(a).toEqual([...TA_CAPABILITIES])
    expect(c.length).toBeLessThan(a.length)
  })
})
```

- [ ] **Schritt 3: Beide Tests laufen lassen, Fehlschlag bestätigen**

Ausführen: `npx vitest run tests/preset/testing-assistant/`
Erwartet: FAIL — Module nicht auflösbar.

- [ ] **Schritt 4: `ta-preset.ts` schreiben**

Nach der Form von `architect-preset.ts`: `TA_CAPABILITIES` als `as const`-Liste, Niveau-B- und
Niveau-C-Teilmengen, `TA_RAHMEN` als Niveau-A-Konstante, `createTaRahmen(niveau)` als Fabrik.
`runtime: 'claude-cli-tmux'`, `personaVorgabe: 'cipher'`, `phasenBindung: ['testing']`,
`rollenTyp: RollenTyp.PhasenEntitaet`, `model: ''` (kein `heavy` — Prüfen ist nicht das
Gate-Urteil des SE).

- [ ] **Schritt 5: `ta-body.md` und `ta-capabilities.ts` schreiben**

Body nach der Form der vier bestehenden. Capability-Objekte nach der Form von
`workshop-capabilities.ts` aus Task 13, `pfad` jeweils `.claude/capabilities/<name>/SKILL.md`.

- [ ] **Schritt 6: Die fünf SKILL.md schreiben**

Unter `src/main/preset/testing-assistant/capabilities/<id>/SKILL.md`, Form wie in Phase B.
`suite-lauf-protokoll` beschreibt die Werkzeuge dieses Repos konkret: `npm test`, `npm run
typecheck`, `npm run lint`, und die native ABI-Falle mit `npm run rebuild-native` als Gegenmittel —
diese Capability hätte in diesem Repo ab Tag eins echte Arbeit.

Wächter-Test `tests/preset/testing-assistant/ta-capability-skills.test.ts` nach dem Muster der
Phase-B-Einleitung, `rolling-summary` auf das geteilte Verzeichnis gezeigt.

- [ ] **Schritt 7: In Bundle, Registry und Assets aufnehmen**

`bodies.ts`:

```typescript
import taBody from './testing-assistant/ta-body.md?raw'
export const TA_BODY: string = taBody
```

`registry.ts` — ein Eintrag in `ENTITIES`:

```typescript
  'testing-assistant': { rahmen: createTaRahmen, body: TA_BODY },
```

`capability-assets.ts` um die fünf neuen IDs erweitern.

- [ ] **Schritt 8: Tests laufen lassen**

Ausführen: `npx vitest run tests/preset/testing-assistant/ tests/preset/registry.test.ts`
Erwartet: PASS. Der Registry-Test iteriert über `PRESET_CATALOG` — der Testing Assistant steht dort
noch nicht drin, das kommt in Task 16. Die Registry kennt ihn trotzdem schon; das ist die richtige
Reihenfolge, weil der Katalog die Oberfläche steuert und nichts Halbfertiges anbieten soll.

- [ ] **Schritt 9: Volle Suite, Typecheck, Lint, committen**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/preset/testing-assistant src/main/preset/bodies.ts \
        src/main/preset/registry.ts src/main/preset/capability-assets.ts \
        tests/preset/testing-assistant
git commit -m "feat(preset): add the Testing Assistant entity"
```

---

### Task 16: Den Katalog öffnen und die Dokumente nachziehen

**Dateien:**
- Ändern: `src/shared/preset-catalog.ts`
- Ändern: `README.md`
- Ändern: `tests/preset-catalog.test.ts`

- [ ] **Schritt 1: Die zwei bestehenden Zusicherungen anfassen, die den Schnitt festhalten**

`tests/preset-catalog.test.ts` hält den 0.1-Schnitt an zwei Stellen fest. Nur die erste bricht;
die zweite wird irreführend und ist mitzuziehen:

- **`:11-15`** — `offers exactly the four ratified 0.1 roles` vergleicht die ID-Liste exakt. Titel
  und Liste ändern:

  ```typescript
    it('offers the four ratified 0.1 roles plus the Testing Assistant', () => {
      expect(PRESET_CATALOG.map(p => p.id)).toEqual([
        'systems-engineer', 'architect', 'cyber-factory', 'testing-assistant', 'workshop',
      ])
    })
  ```

  Die Reihenfolge muss der Reihenfolge in `preset-catalog.ts` entsprechen — steht der neue Eintrag
  dort nach `cyber-factory`, steht er hier auch dort.

- **`:36-41`** — `does not offer any post-0.1 role` führt `'testing'` in seiner Verbotsliste. Das
  ist **nicht** unsere ID (`testing-assistant`), der Test bliebe also grün und behauptete
  weiterhin etwas Falsches. `'testing'` aus der Liste streichen; die übrigen sechs Einträge
  bleiben und sind ab jetzt die wahre Aussage.

`:63` (`rejects a post-0.1 role`) prüft `'debugger'` und bleibt korrekt.

- [ ] **Schritt 1b: Die neuen Zusicherungen anhängen**

```typescript
import { PRESET_CATALOG, isKnownPresetId, defaultPresetId } from '../src/shared/preset-catalog'
import { listEntityIds } from '../src/main/preset/registry'

describe('preset catalog after the Testing Assistant', () => {
  it('offers five presets', () => {
    expect(PRESET_CATALOG).toHaveLength(5)
  })

  it('knows the testing assistant', () => {
    expect(isKnownPresetId('testing-assistant')).toBe(true)
  })

  it('keeps workshop as the default', () => {
    expect(defaultPresetId()).toBe('workshop')
  })

  // The catalog already asserts a single default at :28 — this one asserts the
  // registry can actually build everything the launcher offers, which nothing did before.
  it('offers nothing the registry cannot build', () => {
    const buildable = listEntityIds()
    for (const choice of PRESET_CATALOG) {
      expect(buildable, choice.id).toContain(choice.id)
    }
  })
})
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `npx vitest run tests/preset-catalog.test.ts`
Erwartet: FAIL — der Katalog hat vier Einträge.

- [ ] **Schritt 3: Den Eintrag ergänzen**

In `src/shared/preset-catalog.ts` nach dem `cyber-factory`-Eintrag:

```typescript
  {
    id: 'testing-assistant',
    label: 'Testing Assistant',
    description: 'Suite prüfen, Testqualität beurteilen, Findings dokumentieren',
  },
```

- [ ] **Schritt 4: Die Prosa korrigieren, die nicht mehr stimmt**

Der Kopfkommentar der Datei (Zeilen 4–7) behauptet, Release 0.1 liefere vier von elf Rollen und
der Testing Assistant sei post-0.1. Das stimmt ab hier nicht mehr:

```typescript
/**
 * preset-catalog.ts — the presets offered in the session launcher.
 *
 * Release 0.1 shipped four of the eleven roles M5 describes (the ratified cut,
 * M6 section 3.1 / BG-1). The Testing Assistant was added afterwards, moving that
 * line by one: Ideation, Refinement, Audit, Release Manager, Companion and
 * Debugger remain unbuilt.
 *
 * CK-ENT-001
 */
```

- [ ] **Schritt 5: Das README nachziehen**

Ausführen: `grep -n "Preset\|Workshop\|Cyber Factory" README.md`
Die Stelle finden, die vier Presets aufzählt, und den Testing Assistant mit derselben
Beschreibung wie im Katalog ergänzen. Behauptet das README „vier Presets" als Zahl, die Zahl
mitziehen.

- [ ] **Schritt 6: Test laufen lassen, volle Suite, Typecheck, Lint**

Ausführen: `npx vitest run tests/preset-catalog.test.ts && npm test && npm run typecheck && npm run lint`
Erwartet: alles grün.

- [ ] **Schritt 7: In der laufenden App beweisen, dass die Oberfläche ihn anbietet**

```bash
.claude/skills/run-keel/launch.sh
```

Im Launcher-Cell prüfen, dass fünf Presets zur Auswahl stehen. Dann eine Session über die
**Oberfläche** starten — nicht über den Treiber — und Task 8 Schritt 4 bis 6 für den Testing
Assistant wiederholen. Die Antwort auf „was tust du ausdrücklich nicht?" muss „fixt nicht, ändert
keinen Code" tragen.

Danach `stop.sh`, dann `tmux list-sessions` prüfen und selbst aufräumen.

- [ ] **Schritt 8: Committen**

```bash
git add src/shared/preset-catalog.ts README.md tests/preset-catalog.test.ts
git commit -m "feat(catalog): offer the Testing Assistant in the session launcher"
```

---

### Task 17: Konzept-Nachzug außerhalb des Repos

`src/main/preset/niveau.ts:31` legt für Niveau A `bodyForm: 'CLAUDE.md'` fest. Der gebaute Weg
liefert denselben Inhalt, aber als angehängten System-Prompt statt als projekteigene `CLAUDE.md`.
Nach der Regel in der Projekt-`CLAUDE.md` — „Weichen Konzept und Bau voneinander ab, wird das
Konzept präzisiert, in den Ideation-Verzeichnissen, nicht im Repo" — gehört das nachgezogen.

**Dateien:** ausschließlich außerhalb des Repos, in
`/Users/Shared/Nextcloud/Claude/cipher-keel-entitaeten-ideation/`.

- [ ] **Schritt 1: Die betroffene Stelle finden**

```bash
cd /Users/Shared/Nextcloud/Claude/cipher-keel-entitaeten-ideation
grep -rn "CLAUDE.md\|bodyForm" deliverables/ | head -20
```

- [ ] **Schritt 2: Einen Nachtrag anlegen**

Nach dem Muster von `deliverables/nachtrag-scope-shift_2026-05-27.md` eine Datei
`deliverables/nachtrag-prompt-uebergabe_2026-08-10.md` schreiben. Inhalt: Niveau A liefert die
Body-Form weiterhin als CLAUDE.md-artigen Markdown-Block, die **Übergabe** erfolgt aber über
`claude --append-system-prompt-file` statt über eine Datei im Projektverzeichnis. Die Begründung
mitgeben — eine projekteigene `CLAUDE.md` zu mutieren macht `git status` bei jedem Session-Start
schmutzig, und `injectSection` ist im schädlichen Sinn idempotent (ein zweiter Aufruf mit anderem
Inhalt ist ein No-op, `tests/inject-section.test.ts`), eine Persona ließe sich damit nie
aktualisieren.

Zwei weitere Präzisierungen in denselben Nachtrag:

- `companion-memory-tools` ist aus dem SE-Capability-Set gestrichen. Grund: die Capability
  beschreibt MCP-Tools, die es in cipher-mux gibt und in cipher keel nicht. Der Companion ist
  zurückgestellt, seine Werkzeugklasse ist von M5 ausdrücklich an M2 delegiert.
- Der ratifizierte 0.1-Schnitt von vier Presets ist um den Testing Assistant erweitert.

- [ ] **Schritt 2b: Falls Task 9 den Fall B ergab**

Dann trägt der Nachtrag zusätzlich, dass das Lazy Loading über `@`-Referenzen in dieser
Übergabeform nicht greift und Capabilities bei Niveau A eingebettet werden — mit dem gemessenen
Beleg aus Task 9.

- [ ] **Schritt 3: Prüfen, dass nichts im Repo geändert wurde**

```bash
cd /Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron
git status --short
```

Erwartet: leer. Der Nachtrag gehört nicht ins Repo.

---

## Offene Punkte, die dieser Plan bewusst nicht schließt

- **Die `globalRules`-Schicht bleibt leer — und mit ihr fährt keine einzige Sicherheitsregel mit.**
  Aufgefallen in Task 3 (2026-08-10): `assembleEntityClaudeMd` kennt eine `globalRules`-Schicht,
  aber Task 7 übergibt sie nicht, und niemand sonst befüllt sie. Der Mux liefert seine
  Sicherheitsregeln als Teil des Persona-Blocks aus (keine schädlichen Anweisungen, keine PII an
  Drittsessions, Credentials nie lesen/zitieren/leaken); in keel gehören sie nach der Schichtung
  ausdrücklich **nicht** in die Persona. Damit startet jede Session dieses Plans ohne sie. Das ist
  keine Regression — heute startet gar keine Entität —, aber es ist eine Lücke, die mit Task 7
  erstmals wirksam wird und vor einem Release zu schließen ist. Bewusst nicht in diesem Plan
  gelöst: welche Regeln gelten sollen, ist eine inhaltliche Entscheidung, keine Verdrahtung.
- **`model: 'heavy'` hat keine Auflösung.** `ARCHITECT_RAHMEN` und `SE_RAHMEN` tragen `'heavy'` als
  Modell-Angabe; `buildLaunchCommand` reicht `opts.model` unverändert an `--model` weiter, und
  `'heavy'` ist keine gültige Claude-Model-ID. Task 7 Schritt 5 lässt das Feld deshalb im Zweifel
  weg. Eine Übersetzungstabelle `heavy | standard | light → Model-ID` gehört in den Adapter, ist
  aber eine eigene Entscheidung (welche ID für welche Klasse) und keine Verdrahtung.
- **`AdapterRegistry` hat weiterhin genau eine Implementierung.** Task 7 geht über die Registry
  statt direkt über `ClaudeCodeAdapter`, damit ein zweiter Adapter später nicht alles umwirft.
  Gebaut wird er hier nicht (YAGNI) — die Schnittstelle bleibt damit unbewiesen.
- **Die Prompt-Datei wird beim Session-Ende gelöscht, nicht beim App-Start aufgeräumt.** Stürzt die
  App ab, bleiben Dateien unter `entity-prompts/` liegen. Harmlos (Modus 0600, eine pro Session),
  aber unaufgeräumt.
- **Phase 8 ist weiterhin nicht abgenommen.** Der Erst-Start auf einem zweiten Apple-Silicon-Mac
  ohne Entwicklungsumgebung steht aus und ist das Abnahmekriterium der Roadmap. Unabhängig von
  dieser Arbeit, aber offen — und PR #10 ist bis dahin nicht zu mergen.
- **Der Rauchtest läuft nicht in CI.** Vor dem ersten CI-Lauf muss `console.log` vor `process.exit`
  in `scripts/smoke-packaged.mjs` repariert sein; auf gepipetem stdout kann das Verdict
  abgeschnitten werden. Vorher, nicht als Reaktion auf einen ersten unklaren roten Lauf.
- **Ideation, Refinement, Audit bleiben ungebaut.** Alle drei sind laut M5 §8 baubar
  (§8.1, §8.2, §8.7) und stehen nach diesem Plan nur noch einen Task auseinander — Body,
  Capabilities, Registry-Eintrag, Katalog. Companion und Release Manager bleiben es nicht:
  beim Companion delegiert M5 das Capability-Set an M2, beim Release Manager nennt M5 die
  Detaillierung ausdrücklich als spätere Arbeit.

---

## Messprotokoll Task 8

*Wird in Task 8 Schritt 9 gefüllt. Wörtlich, nicht zusammengefasst.*

## Messprotokoll Task 9

*Wird in Task 9 Schritt 5 gefüllt. Eingetretener Fall plus die tatsächliche Ausgabe beider Proben.*
