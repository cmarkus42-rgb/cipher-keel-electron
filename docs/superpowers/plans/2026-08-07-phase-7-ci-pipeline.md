# Phase 7 — CI-Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jeder Push und jeder Pull Request laeuft Typecheck, Lint, Testsuite und Build auf GitHub Actions — und ein frischer Klon des public Repos laesst sich ueberhaupt installieren.

**Architecture:** Vier Schichten, in dieser Reihenfolge, weil jede die naechste traegt. Zuerst wird `npm ci` reparabel gemacht (heute scheitert es deterministisch). Dann bekommt das Repo ein funktionierendes ESLint samt Flat-Config. Dann wird der Bestand sauber gemacht — `src` und `tests` getrennt, weil unterschiedliche Risikoprofile. Erst danach kommt der Workflow dazu, der alle vier Gates scharf schaltet, gefolgt von den Community-Dateien und dem README-Nachzug.

**Tech Stack:** GitHub Actions (macOS-Runner), Node 22 LTS, npm 11, ESLint 9 (Flat Config) + typescript-eslint, vitest 4, electron-vite.

---

## Verifikation der Ausgangslage (2026-08-07, gemessen)

Dieser Plan wurde nicht gegen Vermutungen geschrieben. Alles Folgende ist an einem frischen
`git clone` in einem Scratch-Verzeichnis nachgemessen worden, ohne den Arbeitsbaum anzufassen.

### Befund 1 — `npm ci` scheitert auf jedem frischen Klon (Blocker)

```
npm error   node_modules/@xterm/addon-canvas
npm error     @xterm/addon-canvas@"^0.7.0" from the root project
npm error Fix the upstream dependency conflict, or retry this command with --force
npm error or --legacy-peer-deps …
```

Ursache: `@xterm/addon-canvas@0.7.0` deklariert `peerDependencies: { "@xterm/xterm": "^5.0.0" }`,
das Projekt nutzt aber `@xterm/xterm@6.0.0`. Upstream hat **keine** xterm-6-taugliche Version —
auch der Beta-Kanal (`0.8.0-beta.48`) deklariert weiterhin `^5.0.0`.

Tragweite ueber die CI hinaus: **Das Repo ist public.** Wer es klont und `npm ci` ausfuehrt —
das Standardvorgehen — bekommt einen Fehler. Der bestehende `node_modules`-Baum funktioniert nur,
weil er historisch anders installiert wurde.

`CanvasAddon` ist kein toter Ballast: `src/renderer/hooks/useTerminal.ts:142,147` laedt es als
Fallback, wenn WebGL nicht verfuegbar ist.

**Entscheidung (2026-08-07, getroffen): `overrides` in `package.json`.** Validiert — nach dem
Eintrag laeuft `npm ci` ohne Sonderflag durch, 1511 Tests bleiben gruen, Typecheck und Build
sauber, und die aufgeloesten Versionen aendern sich nicht (`xterm 6.0.0`, `addon-canvas 0.7.0`).
Damit funktioniert auch der Standardpfad fuer Fremde. Revidierbar, sobald Upstream nachzieht.

### Befund 2 — ESLint existiert nur auf dem Papier

`package.json` deklariert `"lint": "eslint src --ext .ts"`, aber **`eslint` steht nicht in den
`devDependencies`** und ist nicht installiert. `npm run lint` endet mit
`sh: eslint: command not found`. Auf den rund 5.900 Zeilen aus Phase 6 lief also nie ein Lint-Gate.

Nebenbei ist das Skript auch inhaltlich veraltet: ESLint 9 kennt `--ext` nicht mehr (Flat Config
regelt Dateiendungen ueber die Konfiguration), und `src` enthaelt selbst Testdateien
(`src/main/graph/__tests__/`).

**Gemessener Bestand** mit ESLint 9 + `typescript-eslint` (recommended) und dem ueblichen
`_`-Praefix-Ignore fuer absichtlich ungenutzte Parameter — **152 echte Treffer**:

| Regel | `src` | `tests` |
|-------|------:|--------:|
| `no-explicit-any` | 18 | 58 |
| `no-unused-vars` | 14 | 31 |
| `no-unused-expressions` | 0 | 26 |
| `no-require-imports` | 4 | 1 |
| **Summe** | **36** | **116** |

Ohne das `_`-Ignore waeren es 183 — die Differenz sind durchweg absichtliche Platzhalter zur
Interface-Konformitaet (z.B. `_tmuxTarget`, `_prompt`, `_opts` in
`src/main/agent/adapters/claude-code.ts`). Das Ignore ist Standardkonfiguration, keine Aufweichung.

Der Linter hat sofort einen echten Rest aus Phase 6 gefunden:
`src/main/window-manager.ts:58 'services' is defined but never used` — der Parameter wurde
funktionslos, als die Service-Init aus dieser Datei herauswanderte.

Die 26 `no-unused-expressions` sind alle dasselbe Muster im Test-Teardown:
`db?.open && db.close()`. Mechanisch nach `if (db?.open) db.close()` zu ueberfuehren.

**Entscheidung (2026-08-07, getroffen): `src` **und** `tests` linten, alle 152 Treffer beheben,
Gate bricht bei jedem Fehler.** Begruendung: In den Tests liegen die 26 `no-unused-expressions`,
und genau diese Regelklasse verdeckt echte Fehler (ein vergessenes `await`, ein
Vergleich ohne Wirkung). Ein Gate, das die Haelfte des Codes auslaesst, gibt falsche Sicherheit.

### Befund 3 — Laufzeit ist nicht das Problem

Auf dem Klon gemessen (warmer npm-Cache): `npm ci` 3 s, `typecheck` 1 s, `test` 7 s, `build` 2 s.
Der Rechenteil der Pipeline liegt bei rund zehn Sekunden. Das Fuenf-Minuten-Kriterium der Roadmap
entscheidet sich **allein am Download** auf einem kalten Runner — Electron allein ist ueber 100 MB.
Deshalb ist das npm-Cache in `actions/setup-node` kein Feinschliff, sondern der Kern der
Laufzeitanforderung.

`better-sqlite3` musste beim Install **nicht** aus Quelltext uebersetzt werden. Fuer reine
Testlaeufe genuegt der Node-Build; `electron-rebuild` braucht die CI nur, wenn sie zusaetzlich die
App startet — was dieser Plan nicht tut.

### Befund 4 — Was schlicht fehlt

Kein `.github/`, keine ESLint-Konfiguration, kein `CONTRIBUTING.md`, kein `SECURITY.md`, kein
`engines`-Feld, keine `.nvmrc`. **Private Vulnerability Reporting ist am Repo deaktiviert**
(`gh api …/private-vulnerability-reporting` → `{"enabled":false}`) — ein public Repo ohne privaten
Meldeweg zwingt Finder dazu, Luecken oeffentlich zu melden. `gh` ist lokal vorhanden und als
`cmarkus42-rgb` authentifiziert, die Tasks 5 und 6 koennen es also nutzen. Das README traegt statische Badges mit **fest eingetragenen**
Werten (`tests-1390 passing` — inzwischen 1511; `status pre-alpha`) und in Zeile 196 die Aussage
„**No CI.** Tests run locally", die dieser Plan aufhebt.

---

## Global Constraints

Gelten fuer jede Task ohne Ausnahme:

- **Keine Regression:** `npm test` (Ausgangsstand **1511** Tests, 105 Dateien) und
  `npm run typecheck` muessen nach jedem Commit gruen sein. Ab Task 2 zusaetzlich `npm run lint`
  — allerdings erst ab Task 5 als hartes Kriterium (siehe dort).
- **Security-Baseline unverhandelbar** (CK-NFR-004, CK-INF-022): `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`; `src/preload.ts` bleibt die einzige
  `contextBridge.exposeInMainWorld`-Aufrufstelle. Keine Task hier fasst das an — wenn eine
  Lint-Korrektur dort landet, ist das ein Warnsignal, kein Routinefix.
- **Lint-Korrekturen aendern kein Verhalten.** Eine ungenutzte Variable wird geloescht, nicht
  „verwendet". Ein `any` wird praezisiert, nicht per `eslint-disable` stillgestellt. Wo eine
  Korrektur Verhalten aendern wuerde, ist das ein Befund und gehoert gemeldet, nicht gefixt.
- **`eslint-disable` ist begruendungspflichtig.** Jede Ausnahme braucht einen Kommentar, der
  sagt *warum*. Ein nacktes `// eslint-disable-next-line` ist in dieser Phase ein Reviewfehler —
  der Sinn der Uebung ist ein ehrlicher Bestand, kein gruenes Gate.
- **Node-Version an einer Stelle:** Dev und CI muessen dieselbe Hauptversion nutzen. `.nvmrc`,
  `engines` in `package.json` und der Workflow duerfen sich nicht widersprechen.
- **Niveau-Bedienung** (D-14): Jede Task ist aus ihrem eigenen Text allein startbar.
- **Sprache:** Kommentare folgen dem Bestand (`src/main/` englisch, `src/renderer/` gemischt mit
  englischem Uebergewicht). Nutzersichtbare Dokumentation (`README`, `CONTRIBUTING`, `SECURITY`)
  ist **englisch** — das Repo ist public und international.

---

## File Structure

**Neu:**

| Datei | Verantwortung |
|-------|---------------|
| `eslint.config.mjs` | Flat Config: ignorierte Pfade, Regelwerk, `_`-Praefix-Ignore |
| `.nvmrc` | Node-Hauptversion fuer Dev und CI an einer Stelle |
| `.github/workflows/ci.yml` | Typecheck, Lint, Test, Build auf macOS |
| `CONTRIBUTING.md` | Wie man baut, testet und beitraegt |
| `SECURITY.md` | Privater Meldeweg fuer Sicherheitsluecken |

**Geaendert:**

| Datei | Aenderung |
|-------|-----------|
| `package.json` | `overrides`, `devDependencies` (eslint, typescript-eslint), `engines`, `lint`-Skript |
| `package-lock.json` | neu erzeugt (Task 1) |
| ~36 Dateien unter `src/` | Lint-Korrekturen |
| ~40 Dateien unter `tests/` | Lint-Korrekturen |
| `README.md` | CI-Badge, Statusblock, Installationsanleitung |

---

## Task 1: `npm ci` reparieren

**Warum zuerst:** Ohne diese Task hat die CI-Pipeline keinen ersten Schritt. Und solange sie fehlt,
kann niemand das public Repo nach Standardvorgehen installieren.

**Files:**
- Modify: `package.json` (neues `overrides`-Feld), `package-lock.json` (neu erzeugt)
- Test: keiner — dies ist eine Build-Konfigurationsaenderung; der Beweis ist ein erfolgreiches
  `npm ci` in einem frischen Klon (Step 4)

**Interfaces:**
- Consumes: nichts.
- Produces: ein `npm ci`, das ohne Sonderflag durchlaeuft. Task 5 (Workflow) baut darauf.

- [ ] **Step 1: Den Fehler zuerst reproduzieren**

Nicht auslassen: Wer den Fehler nicht gesehen hat, kann nicht beurteilen, ob er behoben ist.
In einem Scratch-Verzeichnis, **nicht** im Arbeitsbaum:

```bash
git clone . /tmp/keel-ci-probe
cd /tmp/keel-ci-probe && npm ci
```

Expected: Abbruch mit `ERESOLVE`, der `@xterm/addon-canvas` und `@xterm/xterm` nennt.

- [ ] **Step 2: `overrides` eintragen**

In `package.json`, als eigenes Top-Level-Feld neben `dependencies` (Reihenfolge im JSON ist
egal, aber direkt nach `dependencies` liest es sich am besten):

```json
  "overrides": {
    "@xterm/addon-canvas": {
      "@xterm/xterm": "$@xterm/xterm"
    }
  }
```

Die Schreibweise `$@xterm/xterm` ist npm-Syntax fuer „nimm die Version, die das Wurzelprojekt
selbst als Dependency fuehrt". Damit bleibt der Eintrag korrekt, wenn xterm spaeter angehoben wird.

**Warum das noetig ist, gehoert dokumentiert.** `package.json` erlaubt keine Kommentare, deshalb
kommt die Begruendung nach `CONTRIBUTING.md` (Task 6) — dort ist ein Abschnitt dafuer vorgesehen.

- [ ] **Step 3: Lockfile neu erzeugen**

```bash
rm -rf node_modules package-lock.json
npm install
```

⚠️ **`npm install` loescht `node_modules` — und damit die von `electron-rebuild` erzeugte
Electron-ABI-Binary unter `node_modules/better-sqlite3/bin/darwin-arm64-146/`.** Ohne die laedt
der Knowledge Graph in der laufenden App nicht mehr (das war Befund 4 der Phase 6). Deshalb
unmittelbar danach:

```bash
npm run rebuild-native
ls -d node_modules/better-sqlite3/bin/darwin-arm64-*/
```

Expected: das ABI-Verzeichnis existiert wieder.

- [ ] **Step 4: Beweisen, dass ein frischer Klon jetzt installiert**

```bash
rm -rf /tmp/keel-ci-probe
git stash list >/dev/null   # sicherstellen, dass die Aenderung committet oder im Baum ist
git clone . /tmp/keel-ci-probe
cd /tmp/keel-ci-probe && npm ci && npm test && npm run typecheck && npm run build
```

Expected: `npm ci` ohne Fehler und **ohne** `--legacy-peer-deps`, 1511 Tests gruen, Typecheck und
Build sauber. Der Klon muss die Aenderung enthalten — falls noch nicht committet, zuerst
committen und dann klonen. Danach `rm -rf /tmp/keel-ci-probe`.

- [ ] **Step 5: Arbeitsbaum verifizieren**

```bash
npm test && npm run typecheck
```

Expected: 1511 Tests gruen. Das Lockfile waechst dabei spuerbar (rund 8.000 → 8.600 Zeilen), weil
npm 11 es ausfuehrlicher schreibt — das ist erwartet und kein Fehler.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "fix(deps): resolve the xterm peer conflict so npm ci works on a fresh clone"
```

---

## Task 2: ESLint einfuehren

**Files:**
- Create: `eslint.config.mjs`, `.nvmrc`
- Modify: `package.json` (`devDependencies`, `engines`, `lint`-Skript), `package-lock.json`
- Test: keiner — der Beweis ist ein Lint-Lauf, der die erwartete Zahl liefert

**Interfaces:**
- Consumes: Task 1 (funktionierendes `npm ci`).
- Produces: `npm run lint` laeuft und meldet **152 Fehler**. Tasks 3 und 4 arbeiten diese ab.

**Designhinweis:** Diese Task behebt **keinen** einzigen Treffer. Sie stellt nur fest, wie der
Bestand aussieht. Das trennt „Werkzeug einrichten" von „Bestand sanieren" — ein Reviewer kann das
eine annehmen und das andere ablehnen.

- [ ] **Step 1: Abhaengigkeiten ergaenzen**

```bash
npm i -D eslint@^9 typescript-eslint@^8
```

`typescript-eslint` ist das Meta-Paket und bringt Parser und Plugin mit. `typescript` ist
bereits devDependency.

- [ ] **Step 2: Flat Config anlegen**

Datei `eslint.config.mjs` im Wurzelverzeichnis:

```javascript
// ESLint 9 Flat Config.
//
// Umfang: src/ und tests/. Beides, weil ein Gate, das die Testsuite auslaesst, falsche
// Sicherheit gibt — gerade no-unused-expressions faengt dort echte Fehler (ein vergessenes
// await, ein Vergleich ohne Wirkung).
//
// Der _-Praefix-Ignore ist Standardkonfiguration, keine Aufweichung: die Adapter in
// src/main/agent/ fuehren absichtlich ungenutzte Parameter, um eine Schnittstelle zu erfuellen.

import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'out/**',
      'node_modules/**',
      '*.config.*',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
)
```

- [ ] **Step 3: Skript und Node-Version festschreiben**

In `package.json` das `lint`-Skript ersetzen — `--ext` gibt es in ESLint 9 nicht mehr, und `tests`
kommt dazu:

```json
    "lint": "eslint src tests",
```

Ausserdem `engines` ergaenzen, damit Dev und CI dieselbe Hauptversion nutzen:

```json
  "engines": {
    "node": ">=22"
  },
```

Und `.nvmrc` anlegen (eine Zeile, kein `v`-Praefix):

```
22
```

**Zur Wahl von Node 22:** aktuelle LTS-Linie, von `better-sqlite3` 12 und Electron 42 unterstuetzt.
Die Roadmap nannte Node 20; 22 ist der neuere LTS und bleibt laenger gepflegt. Die
Entwicklungsmaschine laeuft derzeit auf Node 25 — das ist fuer die Testsuite unkritisch, weil
`npm ci` die passende `better-sqlite3`-Binary fuer die jeweilige Node-Version beschafft. Wichtig
ist nur, dass `.nvmrc`, `engines` und der Workflow sich nicht widersprechen.

- [ ] **Step 4: Bestand messen**

```bash
npm run lint
```

Expected: Der Lauf bricht mit Fehlern ab — das ist der Zweck. Erwartet werden **152 Probleme**
in dieser Verteilung:

```
  76  @typescript-eslint/no-explicit-any        (18 src, 58 tests)
  45  @typescript-eslint/no-unused-vars         (14 src, 31 tests)
  26  @typescript-eslint/no-unused-expressions  (0 src, 26 tests)
   5  @typescript-eslint/no-require-imports     (4 src,  1 tests)
```

Weicht die Zahl deutlich ab, stimmt etwas an der Konfiguration nicht — dann nachsehen, statt die
Zahl in diesem Plan zu „korrigieren". Kleine Abweichungen sind moeglich, wenn sich seit dem
2026-08-07 Quelltext geaendert hat.

Nuetzlich fuer die Tasks 3 und 4, gibt eine Aufstellung nach Regel:

```bash
npx eslint src tests -f json 2>/dev/null | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const r=JSON.parse(s), by={};
  for(const f of r) for(const m of f.messages){const k=m.ruleId||'(parse)';by[k]=(by[k]||0)+1}
  Object.entries(by).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(String(v).padStart(4),k));
});"
```

- [ ] **Step 5: Verifizieren, dass sonst nichts kaputtging**

```bash
npm test && npm run typecheck
```

Expected: 1511 Tests gruen, Typecheck sauber. `npm run lint` ist an dieser Stelle
**erwartungsgemaess rot** — das ist der dokumentierte Bestand, kein Fehlschlag der Task.

- [ ] **Step 6: Commit**

```bash
git add eslint.config.mjs .nvmrc package.json package-lock.json
git commit -m "build(lint): add working ESLint 9 flat config covering src and tests"
```

---

## Task 3: `src` bereinigen (36 Treffer)

**Files:**
- Modify: rund 20 Dateien unter `src/`
- Test: keine neuen — die bestehende Suite ist der Regressionsschutz

**Interfaces:**
- Consumes: Task 2 (`npm run lint` laeuft).
- Produces: `npx eslint src` ist sauber. Task 5 schaltet das Gate scharf.

**Designhinweis — die drei Klassen haben unterschiedliches Risiko:**

- **14 × `no-unused-vars`:** fast durchweg ungenutzte Typ-Importe (`NodeKind`, `NodeCore`,
  `NodeStatus`, `EdgeSource`, `DokumentTyp`, `AdapterContext`, `VoiceInputRouterDeps`). Loeschen ist
  risikofrei — der Typecheck faengt jeden Irrtum sofort. Zwei Ausreisser verdienen einen Blick:
  `src/main/window-manager.ts:58` (`services`-Parameter, funktionslos seit Phase 6) und
  `src/renderer/components/ProjectView.tsx:18-19` (`MIN_TIMELINE_PCT`/`MAX_TIMELINE_PCT` — pruefen,
  ob hier eine Begrenzung vergessen wurde, statt die Konstanten blind zu loeschen).
- **4 × `no-require-imports`:** `require()` in ESM-Dateien. Auf `import` umstellen, aber pruefen,
  ob es Absicht war (verzoegertes Laden, Zirkularitaet). `src/main/graph/uid.ts:69` und
  `src/main/notes/note-tagging.ts:18,232` genau ansehen.
- **18 × `no-explicit-any`:** die einzige Klasse mit Urteilsbedarf. Wo ein echter Typ existiert,
  eintragen. Wo `any` bewusst ist, `unknown` plus Type-Guard erwaegen. Wo beides nicht traegt,
  `eslint-disable-next-line` **mit Begruendung** — und das im Report benennen.

- [ ] **Step 1: Ausgangslage festhalten**

```bash
npx eslint src -f stylish | tail -5
```

Expected: 36 Probleme. Diese Zahl in den Report.

- [ ] **Step 2: Die risikofreien zuerst — ungenutzte Typ-Importe**

Loeschen, nicht auskommentieren. Nach jeder Handvoll:

```bash
npm run typecheck
```

Der Typecheck ist hier das Sicherheitsnetz: Ein faelschlich geloeschter Import faellt sofort auf.

- [ ] **Step 3: `require()` auf `import` umstellen**

Vier Stellen. Bei jeder pruefen, ob das `require` absichtlich verzoegert war — ein `import` am
Dateikopf laedt frueher und kann Zirkularitaeten ausloesen. Wenn das der Fall ist, `await import()`
verwenden oder die Ausnahme begruenden.

- [ ] **Step 4: `any` praezisieren**

18 Stellen, eine nach der anderen. Nach jeder Aenderung Typecheck. Wo eine Praezisierung
Verhalten aendern wuerde: nicht aendern, sondern als Befund melden.

- [ ] **Step 5: `src` ist sauber**

```bash
npx eslint src
```

Expected: keine Ausgabe.

- [ ] **Step 6: Keine Regression**

```bash
npm test && npm run typecheck
```

Expected: 1511 Tests gruen, Typecheck sauber. **Bleibt eine Testzahl unter 1511, ist das ein
Fehler dieser Task** — Lint-Korrekturen duerfen kein Verhalten aendern.

- [ ] **Step 7: Commit**

```bash
git add src/
git commit -m "style(src): clear all ESLint findings in the main and renderer sources"
```

---

## Task 4: `tests` bereinigen (116 Treffer)

**Files:**
- Modify: rund 40 Dateien unter `tests/`
- Test: die Suite selbst ist Gegenstand und Schutz zugleich

**Interfaces:**
- Consumes: Task 2.
- Produces: `npx eslint tests` ist sauber.

**Designhinweis:** Hier ist die Gefahr groesser als in Task 3 — wer einen Test „aufraeumt", kann
ihn versehentlich entschaerfen. Zwei Regeln:

1. **Die Testanzahl muss exakt 1511 bleiben.** Sinkt sie, wurde ein Test entfernt oder
   uebersprungen. Das ist ein Fehler, kein Aufraeumen.
2. **Eine Assertion wird nie geloescht, um Lint zufriedenzustellen.** Meldet der Linter eine
   Assertion als „unused expression", ist das fast immer ein *echter* Fund — dann ist die
   Assertion wirkungslos und gehoert repariert, nicht entsorgt.

- [ ] **Step 1: Die 26 `no-unused-expressions` zuerst**

Alle folgen demselben Muster im Teardown:

```typescript
db?.open && db.close()
```

Zu ueberfuehren nach:

```typescript
if (db?.open) db.close()
```

Fundstellen unter anderem `tests/gate-system.test.ts:83`, `tests/graph/phase-a.test.ts:20`,
`tests/graph/phase-d.test.ts:20`, `tests/graph/phase-e.test.ts:169`,
`tests/graph/phase4a-queries.test.ts:92`. Die vollstaendige Liste liefert:

```bash
npx eslint tests --rule '{"@typescript-eslint/no-unused-expressions":"error"}' -f stylish
```

**Wichtig:** Trifft die Regel eine Stelle, die *keine* Teardown-Kurzschreibweise ist, genau
hinsehen — dort steht dann moeglicherweise eine wirkungslose Assertion oder ein vergessenes
`await`. Das ist ein Befund fuer den Report, kein Formatierungsthema.

- [ ] **Step 2: Die 31 `no-unused-vars`**

Ungenutzte Importe und Variablen in Tests. Vorsicht bei destrukturierten Werten aus einem
Setup-Aufruf: Wird ein Feld nicht mehr genutzt, kann das heissen, dass eine Pruefung fehlt.

- [ ] **Step 3: Der eine `no-require-imports`**

Auf `import` umstellen.

- [ ] **Step 4: Die 58 `no-explicit-any`**

Die groesste Gruppe. In Tests ist `any` oft in handgebauten Doubles, die absichtlich nur die
Methoden abbilden, die der Code beruehrt (`as unknown as AppServices` ist im Bestand etabliert und
bleibt gueltig). Wo ein echter Typ existiert, eintragen; wo das Double bewusst unvollstaendig ist,
`as unknown as X` verwenden statt `any`, oder die Ausnahme begruenden.

- [ ] **Step 5: `tests` ist sauber**

```bash
npx eslint tests
```

Expected: keine Ausgabe.

- [ ] **Step 6: Die Suite ist unveraendert stark**

```bash
npm test && npm run typecheck
```

Expected: **exakt 1511** Tests gruen (105 Dateien), Typecheck sauber. Zusaetzlich pruefen, dass
niemand einen Test stillgelegt hat:

```bash
grep -rn "\.skip\|\.todo\|xit(\|xdescribe(" tests/ src/ | grep -v node_modules
```

Expected: keine neuen Treffer gegenueber dem Stand vor dieser Task.

- [ ] **Step 7: Commit**

```bash
git add tests/
git commit -m "style(tests): clear all ESLint findings in the test suite"
```

---

## Task 5: GitHub-Actions-Workflow

**Files:**
- Create: `.github/workflows/ci.yml`
- Test: der Beweis ist ein roter und ein gruener Lauf (Steps 3 und 4)

**Interfaces:**
- Consumes: Tasks 1–4 (installierbar, lintbar, sauber).
- Produces: ein Workflow namens `CI` mit vier Gates. Task 7 verlinkt dessen Badge.

- [ ] **Step 1: Workflow anlegen**

Datei `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

# Ein neuer Push auf denselben Branch macht den laufenden Job hinfaellig.
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    # macOS ist Pflicht, nicht Bequemlichkeit: tmux, Unix-Domain-Sockets und Keychain
    # sind macOS-gebunden (siehe "Nicht im Scope" der Fertigstellungs-Roadmap).
    runs-on: macos-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          # Der Rechenteil der Pipeline dauert rund zehn Sekunden; die Laufzeit
          # entscheidet sich am Download. Ohne dieses Cache waere jeder Lauf teuer.
          cache: 'npm'

      - name: Install
        run: npm ci

      - name: Typecheck
        # Eigenes Gate, nicht Teil von `test`: vitest transformiert TypeScript ueber
        # esbuild und prueft dabei keine Typen. Ein IPC-Kanal in der falschen Union
        # wuerde die Testsuite nicht rot machen — nur tsc faengt das.
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test

      - name: Build
        # Faengt Bruch in der electron-vite-Konfiguration, den keine Unit ueberdeckt.
        run: npm run build
```

- [ ] **Step 2: Auf einem Branch pushen**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run typecheck, lint, tests and build on macOS"
git push -u origin HEAD
```

Der Workflow laeuft erst, wenn er auf GitHub liegt. Lauf beobachten mit `gh run watch` oder
`gh run list --limit 3`.

- [ ] **Step 3: Beweisen, dass die Pipeline rot werden kann**

Ein Gate, das nie rot wird, ist Dekoration. Auf einem Wegwerf-Branch einen Test absichtlich
brechen:

```bash
git checkout -b ci-selftest
# in einer beliebigen Testdatei eine Assertion umdrehen, z.B. toBe(8) -> toBe(9)
git commit -am "test: deliberately break a test to prove CI turns red"
git push -u origin ci-selftest
gh pr create --fill --base main
gh run watch
```

Expected: Der Lauf schlaegt beim Schritt `Test` fehl, der PR zeigt einen roten Check.

Dann dieselbe Probe fuer das Lint-Gate (eine ungenutzte Variable einfuegen) — beide Gates
einzeln zu pruefen ist der Punkt, denn sie koennten unabhaengig voneinander falsch verdrahtet sein.

Danach aufraeumen:

```bash
gh pr close ci-selftest --delete-branch
git checkout main && git branch -D ci-selftest
```

- [ ] **Step 4: Gruener Lauf auf `main`**

Nach dem Merge des Workflows:

```bash
gh run list --branch main --limit 1
```

Expected: Status `completed`, Ergebnis `success`.

- [ ] **Step 5: Laufzeit gegen das Kriterium pruefen**

```bash
gh run list --branch main --limit 3 --json displayTitle,conclusion,startedAt,updatedAt
```

Expected: unter fuenf Minuten. Der erste Lauf ist langsamer (kaltes Cache) — massgeblich ist der
zweite. Liegt auch der darueber, ist der Cache nicht gegriffen: pruefen, ob `.nvmrc` gelesen wurde
und ob `cache: 'npm'` einen Treffer meldet (steht im Log des `setup-node`-Schritts).

---

## Task 6: `CONTRIBUTING.md` und `SECURITY.md`

**Warum:** Das Repo ist public. Ein oeffentliches Repo ohne privaten Meldeweg fuer
Sicherheitsluecken zwingt Finder dazu, sie oeffentlich zu melden.

**Files:**
- Create: `CONTRIBUTING.md`, `SECURITY.md`
- Test: keiner

- [ ] **Step 1: `CONTRIBUTING.md`**

Englisch, weil das Repo public ist. Inhaltlich muss es diese Punkte tragen — Formulierung frei,
aber nichts davon weglassen:

- **Prerequisites:** macOS, Node (Version aus `.nvmrc`), tmux, und fuer den vollen Funktionsumfang
  die Claude Code CLI.
- **Setup:** `npm ci`. Dazu der Satz, warum `overrides` in `package.json` steht:
  `@xterm/addon-canvas` deklariert bis heute `@xterm/xterm@^5` als Peer, obwohl das Projekt
  xterm 6 nutzt; ohne den Override scheitert `npm ci`. Der Eintrag faellt weg, sobald Upstream
  nachzieht.
- **Nach dem Setup:** `npm run rebuild-native`, wenn die App (nicht nur die Tests) laufen soll —
  `better-sqlite3` muss gegen Electrons ABI gebaut sein. Ohne das degradiert der Knowledge Graph
  still, waehrend alle Tests gruen bleiben.
- **Die vier Gates:** `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` — dieselben,
  die die CI faehrt. Lokal gruen heisst in der CI gruen.
- **Die App wirklich starten und pruefen:** Verweis auf das Projekt-Skill unter
  `.claude/skills/run-keel/`. Der Hinweis gehoert hierher, weil kein Test dieses Repos einen
  `ipcMain`-Handler erreicht — gruene Tests sagen nichts ueber die Verdrahtung.
- **Commit-Stil:** Conventional Commits, wie im Bestand (`feat(scope):`, `fix(scope):`, …).

- [ ] **Step 2: `SECURITY.md`**

Muss tragen:

- **Welche Version unterstuetzt wird:** derzeit nur `main`; es gibt noch kein Release.
- **Meldeweg:** GitHub Private Vulnerability Reporting (im Repo unter *Security → Report a
  vulnerability*) — das ist der private Kanal und braucht keine E-Mail-Adresse im Klartext.

  ⚠️ **Die Funktion ist derzeit deaktiviert** — am 2026-08-07 geprueft:
  `gh api repos/cmarkus42-rgb/cipher-keel-electron/private-vulnerability-reporting`
  liefert `{"enabled":false}`. Ohne Aktivierung zeigt `SECURITY.md` auf eine Tuer, die es nicht
  gibt. Deshalb **vor** dem Schreiben des Dokuments einschalten:

  ```bash
  gh api --method PUT repos/cmarkus42-rgb/cipher-keel-electron/private-vulnerability-reporting
  gh api repos/cmarkus42-rgb/cipher-keel-electron/private-vulnerability-reporting
  ```

  Expected: der zweite Aufruf liefert `{"enabled":true}`. Das ist eine Aenderung an den
  Repo-Einstellungen, nicht am Code — sie fuegt einen privaten Meldekanal hinzu und nimmt nichts weg.
- **Ausdruecklich keine oeffentlichen Issues** fuer Sicherheitsthemen.
- **Reaktionszeit:** eine ehrliche Angabe. Dies ist ein Ein-Personen-Projekt — eine Zusage von
  24 Stunden waere unglaubwuerdig. „Best effort, typically within a week" ist besser als eine
  Zahl, die nicht gehalten wird.
- **Scope-Hinweis:** cipher keel fuehrt lokal Prozesse aus und verwaltet Zugangsdaten ueber die
  macOS-Keychain. Was als Sicherheitsluecke gilt und was Konfiguration ist, kurz abgrenzen.

- [ ] **Step 3: Commit**

```bash
git add CONTRIBUTING.md SECURITY.md
git commit -m "docs: add contributing guide and security policy"
```

---

## Task 7: README nachziehen

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 5 (der Workflow muss existieren, sonst zeigt das Badge ins Leere).

- [ ] **Step 1: CI-Badge ergaenzen**

Das README traegt in den Zeilen 6–9 statische Badges. Das CI-Badge kommt dazu und ist
**dynamisch** — es spiegelt den echten Zustand:

```markdown
<img alt="CI" src="https://github.com/cmarkus42-rgb/cipher-keel-electron/actions/workflows/ci.yml/badge.svg">
```

- [ ] **Step 2: Statische Badges korrigieren oder entfernen**

Das Tests-Badge steht fest auf `tests-1390 passing` und ist damit falsch (aktuell 1511) — und es
wird bei jeder Aenderung wieder falsch. Zwei ehrliche Optionen: auf den aktuellen Stand setzen und
in Kauf nehmen, dass es wieder veraltet, **oder** es streichen, weil das CI-Badge die Aussage
besser traegt. Die zweite ist vorzuziehen: ein dynamisches Badge, das nicht luegen kann, ersetzt
ein statisches, das es regelmaessig tut.

- [ ] **Step 3: „No CI" streichen**

`README.md:196` sagt „**No CI.** Tests run locally". Das stimmt nach Task 5 nicht mehr. Zeile
entfernen und den umgebenden Abschnitt „What is not there yet" daraufhin durchsehen — dort koennen
weitere Aussagen stehen, die Phase 6 und 7 ueberholt haben.

- [ ] **Step 4: Installationsanleitung pruefen**

Wenn das README Installationsschritte nennt, muessen sie jetzt tatsaechlich funktionieren —
`npm ci` tut das seit Task 1. Den Hinweis auf `npm run rebuild-native` ergaenzen, falls das
README das Starten der App beschreibt.

- [ ] **Step 5: Alles gruen**

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Expected: alle vier sauber — dieselbe Reihenfolge, die die CI faehrt.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: add CI badge and drop the claim that there is no CI"
```

---

## Abnahmekriterien Phase 7 (aus der Roadmap)

| Kriterium | Abgedeckt durch |
|-----------|-----------------|
| Ein PR mit absichtlich gebrochenem Test wird rot | Task 5 Step 3 (getrennt fuer Test- und Lint-Gate) |
| Ein Lauf auf `main` ist gruen, Badge zeigt passing | Task 5 Step 4, Task 7 Step 1 |
| Laufzeit unter fuenf Minuten | Task 5 Step 5 |
| `CONTRIBUTING.md` und `SECURITY.md` ergaenzt | Task 6 |
| CI-Badge im README aktiviert | Task 7 |

**Ueber die Roadmap hinaus**, weil die Bestandsaufnahme es erzwungen hat:

| Kriterium | Abgedeckt durch |
|-----------|-----------------|
| `npm ci` funktioniert auf einem frischen Klon ohne Sonderflag | Task 1 Step 4 |
| `npm run lint` existiert und laeuft | Task 2 |
| Der Bestand ist lintfrei (152 Treffer behoben) | Tasks 3, 4 |

## Risiken

- **Task 4 ist die riskanteste.** 116 Korrekturen in der Testsuite, und wer einen Test
  „aufraeumt", kann ihn entschaerfen. Gegenmassnahme: die Testzahl muss exakt 1511 bleiben, und
  es darf kein neues `.skip`/`.todo` geben. Beides ist in Step 6 als Pflichtpruefung verankert.
- **`no-explicit-any` (76 Treffer) verleitet zum Stillstellen.** Ein `eslint-disable` ohne
  Begruendung macht das Gate gruen und den Bestand nicht besser. Die Global Constraints machen die
  Begruendung deshalb zur Pflicht, und der Review soll darauf achten.
- **Das Lockfile aus Task 1 ist ein grosser Diff** (rund +570 Zeilen), der echte Aenderungen
  verstecken kann. Deshalb liegt er in einem eigenen Commit, getrennt von allem anderen.
- **`npm install` in Task 1 zerstoert die Electron-ABI-Binary.** Step 3 faengt das mit
  `npm run rebuild-native` ab. Wird das vergessen, laeuft die Testsuite weiter gruen, waehrend die
  App den Knowledge Graph nicht mehr laden kann — genau die Falle aus Phase 6, Befund 4.
- **Der Workflow laesst sich nur auf GitHub testen.** Steps 3 und 4 von Task 5 brauchen einen Push
  und einen Wegwerf-PR. Das ist keine Nachlaessigkeit, sondern die Natur der Sache — lokal
  simulierte Workflow-Laeufe beweisen nicht, dass GitHub die Datei so ausfuehrt.
