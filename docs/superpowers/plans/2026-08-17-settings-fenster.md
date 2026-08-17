# Settings-Fenster — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein eigenes Settings-Fenster mit garantiertem Klickpfad, das die Modell-Schicht bedienbar macht und `warnungen()` seinen ersten Konsumenten gibt.

**Architecture:** Der Hauptprozess rechnet ein vollständiges Ansichtsmodell (`src/main/model/ansicht.ts`) und schickt es über IPC an ein neues BrowserWindow. Der Renderer erhält **nur Ergebnisse, nie Regeln** — er kann die Eignungsmatrix nicht nacherzählen, weil er sie nie sieht. Jeder Schreibvorgang validiert im Hauptprozess und gibt die frisch gerechnete Gesamtansicht zurück.

**Tech Stack:** Electron, React 18, TypeScript, vitest, electron-vite.

**Spec:** `docs/superpowers/specs/2026-08-17-settings-fenster-design.md`
**Zweig:** `settings-fenster` (existiert bereits, der Spec-Commit liegt darauf)

## Global Constraints

- **Sprache:** Code-Kommentare Englisch, alle nutzersichtbaren Zeichenketten Deutsch. **Keine Umlaute und kein ß im Quelltext** — weder in Bezeichnern noch in Anzeigetexten: `waere`, `verlaesst`, `Uebersprungen`, `muessen`. Nachgemessen im Bestand: `eignung.ts`, `registry.ts` und `config-store.ts` enthalten zusammen **null** Umlaute. Markdown-Dokumente sind davon ausgenommen.
- **Jede Aufgabe hinterlässt einen grünen Baum.** Nach jedem Commit müssen `npm run typecheck` und `npm test` mit EXIT=0 durchlaufen. Kein Commit mit bekannt fehlschlagendem Typecheck.
- **Sicherheitsgrundlage jedes BrowserWindow, nicht verhandelbar** (CK-NFR-004, CK-INF-022): `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `preload: join(__dirname, '../preload/index.js')`, `webSecurity: true`, `allowRunningInsecureContent: false`.
- **Kein Geheimnis verlässt den Hauptprozess.** Kein API-Schlüssel wird je an den Renderer zurückgegeben und keiner landet in `cipher-keel-config.json`.
- **Kein stiller Rückfall.** Jeder Fehler bekommt eine deutsche Meldung, die eine Oberfläche erreicht.
- **Der Renderer importiert nichts aus `src/main/`.** Geteilte Typen liegen in `src/shared/`.
- **Befehle:** `npm test` (vitest run) · `npm run typecheck` · `npm run lint` · `npm run verify:bundle`
- **Vor jedem Commit:** `git branch --show-current` prüfen — es muss `settings-fenster` sein.
- **Exit-Codes nie aus abgeschnittener Ausgabe lesen.** `npm test 2>&1 | tail -30; echo "EXIT=$?"` liefert den Code der *Pipe*. Immer `npm test > /tmp/t.log 2>&1; echo "EXIT=$?"; tail -30 /tmp/t.log`.

---

## Dateiübersicht

**Neu (Hauptprozess)**
| Datei | Verantwortung |
|---|---|
| `src/main/model/slots.ts` | Die fünf Zuordnungsslots mit Läufer, Niveau, Beschriftung. Besitzt `Tier` und `Rolle`. |
| `src/main/model/ansicht.ts` | Baut das Ansichtsmodell. Einziger Aufrufer von `warnungen()`. |
| `src/main/settings/handlers.ts` | Registriert die Settings-IPC-Kanäle. |

**Neu (geteilt / Renderer)**
| Datei | Verantwortung |
|---|---|
| `src/shared/settings-types.ts` | Die Typen des Ansichtsmodells. Nur Ergebnisse, keine Regeln. |
| `src/renderer/windows/settings-window.html` | Einstiegsdokument des Fensters. |
| `src/renderer/windows/settings-window.tsx` | React-Wurzel, Reiterverwaltung, Ladezustand. |
| `src/renderer/components/settings/ModelleReiter.tsx` | Einträge, Zuordnungen, Geheimnisse. |
| `src/renderer/components/settings/CliStartReiter.tsx` | Startparameter je Adapter. |
| `src/renderer/components/settings/SprachausgabeReiter.tsx` | `voice.enabled`, `voice.piperVoice`. |
| `src/renderer/components/settings/WirkungVermerk.tsx` | „wirkt sofort" / „nächste Session" / „Neustart". |
| `src/renderer/components/settings/Warnliste.tsx` | Warnungen zu einer Zuordnung. |
| `src/renderer/components/settings/GeheimnisFeld.tsx` | Schreibendes Schlüsselfeld. |

**Geändert**
| Datei | Änderung |
|---|---|
| `src/main/util/shell-quote.ts` | `splitShellArgs` — die Gegenrichtung. |
| `src/main/config/config-store.ts` | `startArgs`, Migration, tote Blöcke raus. |
| `src/main/model/registry.ts` | `ladeEintraege`, Läufer aus der Slot-Tabelle. |
| `src/main/agent/agent-adapter.ts` | `appGesteuerteParameter`. |
| `src/main/agent/adapters/claude-code.ts` | `getStartArgs`, Prompt-Fragmente. |
| `src/main/window-manager.ts` | `createSettingsWindow`. |
| `src/main/ipc-handlers.ts` | `window:open-settings`, Settings-Handler einhängen, `getStartArgs`. |
| `src/shared/ipc-channels.ts` | Neue Kanäle, tote Kanäle raus. |
| `src/renderer/windows/project-window.tsx` | Knopf „Einstellungen". |
| `electron.vite.config.ts` | Bündel-Einstiegspunkt `settings-window`. |
| `.claude/skills/run-keel/SKILL.md` | Drittes Fenster. |

---

## Task 1: Die Skill-Datei vor der Zustandsänderung korrigieren

Handover §6: „Eine Anweisung in `.claude/skills/` ist Teil des Prüfstands. Wer den Zustand ändert, den eine Skill-Datei als erwartet beschreibt, muss sie **vorher** korrigieren." `run-keel/SKILL.md` sagt „an Electron app with two windows" und kennt nur die `urlPart`-Werte `project-window` und `index.html`. Ein Prüfer, der später das dritte Fenster sieht, könnte den Erfolg als Fehler melden.

**Files:**
- Modify: `.claude/skills/run-keel/SKILL.md`

**Interfaces:**
- Consumes: nichts
- Produces: nichts (Dokumentation)

- [ ] **Step 1: Zwei Stellen ändern**

In `.claude/skills/run-keel/SKILL.md`, im Abschnitt „# Running cipher keel", ersetzen:

```
cipher keel is an Electron app with two windows.
```

durch:

```
cipher keel is an Electron app with three windows.
```

Im Abschnitt „## Drive it" ersetzen:

```
`<urlPart>` picks the window: `project-window` for the project window (project list,
kickoff wizard, ProjectView with Timeline + Kanban), `index.html` for the grid window
(SessionGrid, StatusBar).
```

durch:

```
`<urlPart>` picks the window: `project-window` for the project window (project list,
kickoff wizard, ProjectView with Timeline + Kanban), `index.html` for the grid window
(SessionGrid, StatusBar), `settings-window` for the settings window (model registry,
assignments, CLI start parameters, speech output).

The settings window does not open on start. Open it first, then drive it:

    D=".claude/skills/run-keel/driver.mjs"
    node $D project-window "window.cipherKeel.invoke('window:open-settings')"
    node $D settings-window "window.cipherKeel.invoke('settings:ansicht')"
```

Dieser Block steht **vor** der Stelle, an der die Datei `D` bisher zum ersten Mal setzt — er definiert die Variable daher selbst. Wer die zwei Zeilen von oben nach unten kopiert, bekommt einen funktionierenden Aufruf und kein leeres `$D`.

- [ ] **Step 2: Zweig prüfen und committen**

```bash
git branch --show-current   # muss settings-fenster sein
git add .claude/skills/run-keel/SKILL.md
git commit -m "docs(run-keel): das dritte Fenster vor seiner Existenz ankuendigen"
```

---

## Task 2: Die Slot-Tabelle

Der Läufer gehört zum Slot, nicht zur Auswahl. `registry.ts:cliHandleFuerTier` trägt `'fremdes-cli'` heute hart ein — diese Doppelung verschwindet.

`Tier` und `Rolle` ziehen nach `slots.ts` um, damit `slots.ts → registry.ts` kein Zyklus wird. `registry.ts` exportiert sie weiter, damit kein bestehender Import bricht.

**Files:**
- Create: `src/main/model/slots.ts`
- Modify: `src/main/model/registry.ts`
- Test: `tests/model/slots.test.ts`

**Interfaces:**
- Consumes: `Laeufer`, `sperrgrund` aus `./eignung`; `CapabilityNiveau` aus `../preset/niveau`
- Produces:
  - `type Tier = 'light' | 'standard' | 'heavy'`
  - `type Rolle = 'tagging' | 'worker'`
  - `type SlotId = 'tier:light' | 'tier:standard' | 'tier:heavy' | 'rolle:tagging' | 'rolle:worker'`
  - `interface Slot { id: SlotId; beschriftung: string; laeufer: Laeufer; niveau: CapabilityNiveau; art: 'tier' | 'rolle'; schluessel: Tier | Rolle; wirkung: 'sofort' | 'naechste-session' }`
  - `const SLOTS: readonly Slot[]`
  - `function slotFuerId(id: string): Slot | null`
  - `function slotFuerTier(tier: Tier): Slot`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Create `tests/model/slots.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SLOTS, slotFuerId, slotFuerTier } from '../../src/main/model/slots'
import { CapabilityNiveau } from '../../src/main/preset/niveau'

describe('Slot-Tabelle', () => {
  it('kennt genau fuenf Slots', () => {
    expect(SLOTS).toHaveLength(5)
  })

  it('faehrt alle drei Tiers ueber fremdes-cli auf Niveau A', () => {
    for (const tier of ['light', 'standard', 'heavy'] as const) {
      const slot = slotFuerTier(tier)
      expect(slot.laeufer).toBe('fremdes-cli')
      expect(slot.niveau).toBe(CapabilityNiveau.A)
      expect(slot.art).toBe('tier')
      expect(slot.schluessel).toBe(tier)
    }
  })

  it('faehrt beide Rollen ueber ein-schuss auf Niveau C', () => {
    for (const id of ['rolle:tagging', 'rolle:worker'] as const) {
      const slot = slotFuerId(id)
      expect(slot?.laeufer).toBe('ein-schuss')
      expect(slot?.niveau).toBe(CapabilityNiveau.C)
      expect(slot?.art).toBe('rolle')
    }
  })

  it('gibt jedem Slot eine deutsche Beschriftung', () => {
    for (const slot of SLOTS) {
      expect(slot.beschriftung.length).toBeGreaterThan(0)
    }
  })

  it('vermerkt die Wirkung: Tiers gelten ab der naechsten Session, Rollen sofort', () => {
    expect(slotFuerTier('heavy').wirkung).toBe('naechste-session')
    expect(slotFuerId('rolle:tagging')?.wirkung).toBe('sofort')
  })

  it('gibt null fuer eine unbekannte Slot-Id statt zu werfen', () => {
    expect(slotFuerId('tier:gibt-es-nicht')).toBeNull()
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
npx vitest run tests/model/slots.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"; tail -20 /tmp/t.log
```
Erwartet: FAIL, `Cannot find module '../../src/main/model/slots'`.

- [ ] **Step 3: `slots.ts` schreiben**

Create `src/main/model/slots.ts`:

```ts
/**
 * slots — the five assignment slots, and the one place their runner and niveau are stated.
 *
 * A slot's Laeufer is a property of the slot, never a user choice: a tier drives a CLI
 * harness, a role dispatches a single job. The settings surface therefore offers no runner
 * picker, which is what keeps the eignung rules unrestated (see the guard test in
 * tests/model/eignung-einzige-quelle.test.ts).
 *
 * `Tier` and `Rolle` live here rather than in registry.ts so that registry.ts can import
 * this module without a cycle. registry.ts re-exports them, so no existing import breaks.
 */

import type { Laeufer } from './eignung'
import { CapabilityNiveau } from '../preset/niveau'

export type Tier = 'light' | 'standard' | 'heavy'
export type Rolle = 'tagging' | 'worker'

export type SlotId =
  | 'tier:light'
  | 'tier:standard'
  | 'tier:heavy'
  | 'rolle:tagging'
  | 'rolle:worker'

export interface Slot {
  id: SlotId
  /** German: this text reaches the user. */
  beschriftung: string
  laeufer: Laeufer
  niveau: CapabilityNiveau
  art: 'tier' | 'rolle'
  schluessel: Tier | Rolle
  /**
   * When a change takes effect. Tiers are read at session launch
   * (ipc-handlers.ts), roles on every resolution (rollen.ts).
   */
  wirkung: 'sofort' | 'naechste-session'
}

export const SLOTS: readonly Slot[] = [
  {
    id: 'tier:light', beschriftung: 'Tier „light" — mechanische Arbeit',
    laeufer: 'fremdes-cli', niveau: CapabilityNiveau.A,
    art: 'tier', schluessel: 'light', wirkung: 'naechste-session',
  },
  {
    id: 'tier:standard', beschriftung: 'Tier „standard" — der Alltagsweg',
    laeufer: 'fremdes-cli', niveau: CapabilityNiveau.A,
    art: 'tier', schluessel: 'standard', wirkung: 'naechste-session',
  },
  {
    id: 'tier:heavy', beschriftung: 'Tier „heavy" — dort, wo Fehler sich vervielfachen',
    laeufer: 'fremdes-cli', niveau: CapabilityNiveau.A,
    art: 'tier', schluessel: 'heavy', wirkung: 'naechste-session',
  },
  {
    id: 'rolle:tagging', beschriftung: 'Rolle „Notizen-Verschlagwortung"',
    laeufer: 'ein-schuss', niveau: CapabilityNiveau.C,
    art: 'rolle', schluessel: 'tagging', wirkung: 'sofort',
  },
  {
    id: 'rolle:worker', beschriftung: 'Rolle „Niveau-C-Auftraege"',
    laeufer: 'ein-schuss', niveau: CapabilityNiveau.C,
    art: 'rolle', schluessel: 'worker', wirkung: 'sofort',
  },
]

export function slotFuerId(id: string): Slot | null {
  return SLOTS.find(s => s.id === id) ?? null
}

export function slotFuerTier(tier: Tier): Slot {
  const slot = SLOTS.find(s => s.art === 'tier' && s.schluessel === tier)
  if (!slot) throw new Error(`Unbekanntes Tier '${tier}'`)
  return slot
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

```bash
npx vitest run tests/model/slots.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"; tail -20 /tmp/t.log
```
Erwartet: PASS, 6 Tests.

- [ ] **Step 5: `registry.ts` auf die Tabelle umstellen**

In `src/main/model/registry.ts`:

Die Zeile
```ts
export type Tier = 'light' | 'standard' | 'heavy'
export type Rolle = 'tagging' | 'worker'
```
ersetzen durch
```ts
export type { Tier, Rolle } from './slots'
```

Den Import ergänzen:
```ts
import { slotFuerTier, type Tier, type Rolle } from './slots'
```

In `cliHandleFuerTier` die hart eingetragene Zeichenkette ersetzen. Aus
```ts
  const hinweis =
    `Tier '${tier}' zeigt auf den Eintrag '${e.id}'. ` +
    `${sperrgrund('fremdes-cli', e.art)} Es gilt weiterhin der Wert aus agent.modelTiers.`
```
wird
```ts
  // The runner is a property of the slot, stated once in slots.ts — not restated here.
  const hinweis =
    `Tier '${tier}' zeigt auf den Eintrag '${e.id}'. ` +
    `${sperrgrund(slotFuerTier(tier).laeufer, e.art)} Es gilt weiterhin der Wert aus agent.modelTiers.`
```

- [ ] **Step 6: Bestehende Registry-Tests laufen lassen — sie dürfen sich nicht ändern**

```bash
npx vitest run tests/model/ > /tmp/t.log 2>&1; echo "EXIT=$?"; tail -20 /tmp/t.log
npm run typecheck > /tmp/tc.log 2>&1; echo "EXIT=$?"; tail -20 /tmp/tc.log
```
Erwartet: beide PASS / EXIT=0. `tests/model/registry.test.ts` prüft bereits, dass der Hinweis Tier und Eintrag nennt — er muss unverändert grün bleiben.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add src/main/model/slots.ts src/main/model/registry.ts tests/model/slots.test.ts
git commit -m "feat(model): Slot-Tabelle -- Laeufer und Niveau haben eine Quelle"
```

---

## Task 3: `splitShellArgs` — die Gegenrichtung

`shell-quote.ts` kann argv → Zeichenkette. Freitext-Startparameter brauchen den Rückweg. Beide Richtungen beschreiben dieselbe Grammatik; getrennt driften sie auseinander.

**Files:**
- Modify: `src/main/util/shell-quote.ts`
- Test: `tests/util/shell-quote.test.ts` (anlegen, falls nicht vorhanden — sonst ergänzen)

**Interfaces:**
- Consumes: nichts
- Produces: `function splitShellArgs(text: string): string[]`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

An `tests/util/shell-quote.test.ts` anhängen (Datei anlegen mit dem Import-Kopf, falls sie fehlt):

```ts
import { describe, it, expect } from 'vitest'
import { splitShellArgs, formatShellCommand } from '../../src/main/util/shell-quote'

describe('splitShellArgs', () => {
  it('gibt eine leere Liste fuer leeren Text und fuer reinen Leerraum', () => {
    expect(splitShellArgs('')).toEqual([])
    expect(splitShellArgs('   \t ')).toEqual([])
  })

  it('trennt an Leerraum', () => {
    expect(splitShellArgs('--resume --model opus')).toEqual(['--resume', '--model', 'opus'])
  })

  it('haelt einfache Anfuehrungszeichen zusammen und entfernt sie', () => {
    expect(splitShellArgs("--datei '/pfad mit leerzeichen/x.md'"))
      .toEqual(['--datei', '/pfad mit leerzeichen/x.md'])
  })

  it('haelt doppelte Anfuehrungszeichen zusammen und entfernt sie', () => {
    expect(splitShellArgs('--datei "/pfad mit leerzeichen/x.md"'))
      .toEqual(['--datei', '/pfad mit leerzeichen/x.md'])
  })

  it('maskiert ein Leerzeichen per Rueckstrich ausserhalb von Anfuehrungszeichen', () => {
    expect(splitShellArgs('--datei /pfad\\ mit/x.md')).toEqual(['--datei', '/pfad mit/x.md'])
  })

  it('behandelt ein Anfuehrungszeichen innerhalb der anderen Sorte als Zeichen', () => {
    expect(splitShellArgs(`--text "Kenos' Rezept"`)).toEqual(['--text', "Kenos' Rezept"])
  })

  it('laesst den Rueckstrich in doppelten Anfuehrungszeichen das Anfuehrungszeichen schuetzen', () => {
    expect(splitShellArgs('--text "Use \\"careful\\" quoting"'))
      .toEqual(['--text', 'Use "careful" quoting'])
  })

  it('schuetzt in doppelten Anfuehrungszeichen auch den Rueckstrich selbst', () => {
    expect(splitShellArgs('--text "a\\\\b"')).toEqual(['--text', 'a\\b'])
  })

  it('laesst den Rueckstrich in einfachen Anfuehrungszeichen literal, wie POSIX es will', () => {
    expect(splitShellArgs("--text 'a\\b'")).toEqual(['--text', 'a\\b'])
  })

  it('laesst einen Rueckstrich vor einem harmlosen Zeichen in Anfuehrungszeichen stehen', () => {
    expect(splitShellArgs('--text "a\\zb"')).toEqual(['--text', 'a\\zb'])
  })

  it('erlaubt ein leeres Argument als ausdrueckliches Paar Anfuehrungszeichen', () => {
    expect(splitShellArgs(`--leer ""`)).toEqual(['--leer', ''])
  })

  it('wirft mit deutscher Meldung bei unbalanciertem Anfuehrungszeichen', () => {
    expect(() => splitShellArgs('--datei "/pfad ohne Ende'))
      .toThrow(/Anfuehrungszeichen/)
  })

  it('ist die Umkehrung von formatShellCommand fuer sichere und unsichere Argumente', () => {
    const args = ['--dangerously-skip-permissions', '/pfad mit leerzeichen/x.md', "Kenos' Rezept"]
    const zeile = formatShellCommand('claude', args)
    expect(splitShellArgs(zeile)).toEqual(['claude', ...args])
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
npx vitest run tests/util/shell-quote.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"; tail -20 /tmp/t.log
```
Erwartet: FAIL, `splitShellArgs is not a function` bzw. kein Export.

- [ ] **Step 3: Implementieren**

An `src/main/util/shell-quote.ts` anhängen:

```ts
/** Inside double quotes a backslash protects only these — POSIX, and nothing invented. */
const GESCHUETZT_IN_DOPPELTEN = '"\\$`'

/**
 * Split a free-text command line into argv, the inverse of formatShellCommand.
 *
 * Users type start parameters into the settings window as one line. Splitting on
 * whitespace alone would break `--append-system-prompt-file "/pfad mit leerzeichen"`, so
 * both quoting forms are honoured — and they are honoured *differently*, the way a shell
 * does it:
 *
 *   - outside quotes, a backslash escapes whatever follows it
 *   - inside single quotes nothing is special, not even a backslash
 *   - inside double quotes a backslash protects " \ $ and ` and nothing else; before any
 *     other character it stays a literal backslash
 *
 * That asymmetry is not an oversight to be tidied away later. Treating both quote forms
 * alike would reject `--text "Use \"careful\" quoting"`, which is ordinary input.
 *
 * An unbalanced quote is an error rather than a best-effort guess: this argv becomes a
 * real launch command, and a silently mangled one is the expensive kind of failure.
 */
export function splitShellArgs(text: string): string[] {
  const args: string[] = []
  let current = ''
  let hasCurrent = false
  // Named for what it holds, and not `quote` — that name belongs to the escaping
  // helper above, and shadowing it here would make a reader check whether one calls
  // the other. Neither does.
  let openQuote: "'" | '"' | null = null

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (openQuote) {
      if (
        openQuote === '"' &&
        ch === '\\' &&
        i + 1 < text.length &&
        GESCHUETZT_IN_DOPPELTEN.includes(text[i + 1])
      ) {
        current += text[i + 1]
        i++
        continue
      }
      if (ch === openQuote) {
        openQuote = null
      } else {
        current += ch
      }
      continue
    }

    if (ch === "'" || ch === '"') {
      openQuote = ch
      hasCurrent = true
      continue
    }

    if (ch === '\\' && i + 1 < text.length) {
      current += text[i + 1]
      hasCurrent = true
      i++
      continue
    }

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      if (hasCurrent) {
        args.push(current)
        current = ''
        hasCurrent = false
      }
      continue
    }

    current += ch
    hasCurrent = true
  }

  if (openQuote) {
    throw new Error(
      `[shell-quote] Unbalanciertes Anfuehrungszeichen (${openQuote}) in den Startparametern — ` +
      'jedes geoeffnete Anfuehrungszeichen braucht ein schliessendes.'
    )
  }

  if (hasCurrent) args.push(current)
  return args
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

```bash
npx vitest run tests/util/shell-quote.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"; tail -20 /tmp/t.log
```
Erwartet: PASS, 9 Tests.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/main/util/shell-quote.ts tests/util/shell-quote.test.ts
git commit -m "feat(util): splitShellArgs -- Freitext zu argv, anfuehrungszeichenfest"
```

---

## Task 4: Config und Adapter — `startArgs` statt Vendor-Schalter

`ui`, `mcp`, `app` und `windows` haben im gesamten Quelltext keinen Leser (Spec §2). Sie stehen zu lassen hieße, die nächste Sitzung dieselbe Stunde investieren zu lassen, um sie erneut zu widerlegen.

**Diese Aufgabe umfasst, was ursprünglich als Aufgaben 4 und 5 getrennt war.** Der Grund ist zwingend: Sobald `agent.skipPermissions` aus dem Schema fällt, bricht sein einziger Leser in `ipc-handlers.ts:132`. Getrennt könnte keine der beiden Hälften einen übersetzbaren Baum hinterlassen, und die globale Randbedingung verlangt genau das. Feld und Leser ändern sich zusammen oder gar nicht.

**Files:**
- Modify: `src/main/config/config-store.ts`
- Modify: `src/main/agent/agent-adapter.ts`
- Modify: `src/main/agent/adapters/claude-code.ts`
- Modify: `src/main/ipc-handlers.ts` (Zeilen 130-133)
- Test: `tests/config/migration.test.ts`
- Test: `tests/agent/start-args.test.ts`

**Interfaces:**
- Consumes: `splitShellArgs` und `formatShellCommand` aus Aufgabe 3
- Produces:
  - `CipherKeelConfig.agent` wird `{ modelTiers: { light: string; standard: string; heavy: string }; startArgs: Record<string, string> }`
  - `CipherKeelConfig` verliert `app`, `ui`, `mcp`, `windows`
  - `function migriere(roh: Record<string, unknown>): { config: Record<string, unknown>; veraendert: boolean }` (exportiert, damit sie ohne Dateisystem prüfbar ist)

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Create `tests/config/migration.test.ts`:

```ts
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('Config-Migration', () => {
  let tmpDir: string

  beforeEach(() => {
    vi.resetModules()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-migration-test-'))
  })

  afterEach(() => {
    vi.doUnmock('electron')
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const datei = () => path.join(tmpDir, 'cipher-keel-config.json')

  async function withConfig(cfg: unknown) {
    if (cfg !== null) fs.writeFileSync(datei(), JSON.stringify(cfg, null, 2))
    vi.doMock('electron', () => ({ app: { getPath: () => tmpDir } }))
    const mod = await import('../../src/main/config/config-store')
    // Der Store laedt faul, und das bleibt so: `loadConfig` haengt ueber `getConfigPath`
    // an `app.getPath('userData')`, das beim Modulimport noch nicht verlaesslich ist.
    // Ein Test, der anschliessend nur die Datei liest, wuerde die Migration sonst nie
    // ausloesen — deshalb wird hier einmal angefasst. Der Produktivcode bleibt faul.
    mod.configStore.getAll()
    return mod
  }

  const gelesen = () => JSON.parse(fs.readFileSync(datei(), 'utf-8'))

  it('gibt einer frischen Config die Vorgabe-Startparameter, ohne skipPermissions', async () => {
    const { configStore } = await withConfig(null)
    // Eine frische Installation verhaelt sich wie die ausgelieferte Version seit
    // cipher-mux 0.9.x: die App startet ihre Sitzungen selbst, und in einem von ihr
    // gesteuerten tmux-Pane beantwortet niemand eine Berechtigungsrueckfrage.
    expect(configStore.get('agent').startArgs['claude-code'])
      .toBe('--dangerously-skip-permissions')
    expect((configStore.get('agent') as Record<string, unknown>).skipPermissions).toBeUndefined()
  })

  it('uebersetzt skipPermissions true in das Flag und schreibt die Datei zurueck', async () => {
    const { configStore } = await withConfig({ agent: { skipPermissions: true } })
    expect(configStore.get('agent').startArgs['claude-code']).toBe('--dangerously-skip-permissions')
    expect(gelesen().agent.skipPermissions).toBeUndefined()
    expect(gelesen().agent.startArgs['claude-code']).toBe('--dangerously-skip-permissions')
  })

  it('uebersetzt skipPermissions false in einen leeren Startparameter', async () => {
    const { configStore } = await withConfig({ agent: { skipPermissions: false } })
    expect(configStore.get('agent').startArgs['claude-code']).toBe('')
    // Auch auf der Platte: hier ist der Fall, in dem die Vorgabe die Entscheidung des
    // Nutzers ueberschreiben koennte, weil die Vorgabe das Flag traegt und er es nicht will.
    expect(gelesen().agent.startArgs['claude-code']).toBe('')
  })

  it('ist idempotent — ein zweiter Lauf aendert nichts', async () => {
    await withConfig({ agent: { skipPermissions: true } })
    const nachErstem = fs.readFileSync(datei(), 'utf-8')
    vi.resetModules()
    vi.doMock('electron', () => ({ app: { getPath: () => tmpDir } }))
    const zweiter = await import('../../src/main/config/config-store')
    zweiter.configStore.getAll()
    expect(fs.readFileSync(datei(), 'utf-8')).toBe(nachErstem)
  })

  it('laesst ein von Hand gesetztes startArgs gewinnen und entfernt den Altwert kommentarlos', async () => {
    const { configStore } = await withConfig({
      agent: { skipPermissions: true, startArgs: { 'claude-code': '--resume' } },
    })
    expect(configStore.get('agent').startArgs['claude-code']).toBe('--resume')
    expect(gelesen().agent.skipPermissions).toBeUndefined()
  })

  it('entfernt die toten Bloecke aus der Datei', async () => {
    await withConfig({
      ui: { theme: 'dark' }, mcp: { port: 3100 },
      app: { maxSessions: 12 }, windows: { main: { x: 0, y: 0, width: 1, height: 1 } },
      agent: { skipPermissions: true },
    })
    const roh = gelesen()
    expect(roh.ui).toBeUndefined()
    expect(roh.mcp).toBeUndefined()
    expect(roh.app).toBeUndefined()
    expect(roh.windows).toBeUndefined()
  })

  it('laesst lebende Bloecke unangetastet — im Speicher und auf der Platte', async () => {
    const { configStore } = await withConfig({
      agent: { skipPermissions: true },
      llm: { tagging: { host: '10.0.0.9', port: 11434, model: 'altwert' } },
      projects: { list: [{ id: 'p1', name: 'Probe', rootPath: '/tmp/p1' }], activeId: 'p1' },
    })
    expect(configStore.get('llm').tagging.model).toBe('altwert')
    expect(configStore.get('llm').tagging.host).toBe('10.0.0.9')

    // Die Platte ist der Punkt. Der zerstoererische Pfad dieser Aufgabe ist das
    // Zurueckschreiben, und ein Test, der nur configStore.get() prueft, wuerde nicht
    // bemerken, wenn statt der zusammengefuehrten Config die Vorgaben persistiert
    // wuerden — die tragen dasselbe Flag, aber weder Projekte noch Endpunkte.
    const roh = gelesen()
    expect(roh.llm.tagging.host).toBe('10.0.0.9')
    expect(roh.llm.tagging.model).toBe('altwert')
    expect(roh.projects.list).toHaveLength(1)
    expect(roh.projects.list[0].id).toBe('p1')
  })

  it('meldet fuer eine bereits migrierte Config, dass nichts zu tun war', async () => {
    // `migriere` ist ausdruecklich exportiert, um ohne Dateisystem pruefbar zu sein —
    // und die Idempotenz-Zusicherung des Docblocks lautet `veraendert: false`, nicht
    // "die Bytes sind gleich". Ein Neuschreiben identischer Bytes wuerde den
    // Byte-Vergleich bestehen und trotzdem bei jedem Start auf die Platte gehen.
    const { migriere } = await withConfig(null)
    const bereits = { agent: { startArgs: { 'claude-code': '--dangerously-skip-permissions' } } }
    expect(migriere(bereits).veraendert).toBe(false)
  })

  it('behaelt die gelesene Config, wenn das Schreiben der Migration scheitert', async () => {
    fs.writeFileSync(datei(), JSON.stringify({
      agent: { skipPermissions: true },
      llm: { tagging: { host: '10.0.0.9', port: 11434, model: 'altwert' } },
    }))
    // Nur die Datei schreibgeschuetzt, nicht das Verzeichnis: ein schreibgeschuetztes
    // Verzeichnis verhindert das Anlegen, nicht das Ueberschreiben einer vorhandenen
    // Datei. (Als root laeuft dieser Test nicht sinnvoll — dann greift der Schutz nicht.)
    fs.chmodSync(datei(), 0o400)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      vi.doMock('electron', () => ({ app: { getPath: () => tmpDir } }))
      const { configStore } = await import('../../src/main/config/config-store')
      // Gelesen ist gelesen: es gilt die Datei, nicht der Vorgabenbaum.
      expect(configStore.get('llm').tagging.model).toBe('altwert')
      expect(configStore.get('agent').startArgs['claude-code'])
        .toBe('--dangerously-skip-permissions')
      expect(configStore.get('llm').tagging.host).toBe('10.0.0.9')
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
      fs.chmodSync(datei(), 0o600)
    }
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
npx vitest run tests/config/migration.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"; tail -30 /tmp/t.log
```
Erwartet: FAIL — `startArgs` existiert nicht.

- [ ] **Step 3: Schema ändern**

In `src/main/config/config-store.ts`:

Den Import auf das reduzieren, was übrig bleibt:
```ts
// DEFAULT_WINDOW_WIDTH/HEIGHT und MAX_SESSIONS werden hier nicht mehr gebraucht — die
// Fenstergroessen stehen in window-manager.ts, und app.maxSessions hatte nie einen Leser.
```
Also die Zeile `import { MAX_SESSIONS, DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT } from '../../shared/constants'` **entfernen**. `src/shared/constants.ts` selbst bleibt unangetastet.

Im Interface `CipherKeelConfig` die Blöcke `app`, `ui`, `mcp` und `windows` **streichen** und `agent` ersetzen durch:

```ts
  agent: {
    /**
     * Extra launch parameters per adapter id, as one free-text line each. Replaces the
     * former `skipPermissions` boolean, which named one vendor's flag in the schema
     * itself. The app-driven flags (see AgentAdapter.appGesteuerteParameter) are added
     * on top of these, never replaced by them.
     *
     * "No parameters at all" is `{ 'claude-code': '' }`, not `{}`: an empty object is
     * merged with the defaults on load, which puts the default line back. Whatever writes
     * this must therefore always write the adapter's key, never delete it — otherwise a
     * user who clears the field silently gets the default back on the next start.
     */
    startArgs: Record<string, string>
    modelTiers: { light: string; standard: string; heavy: string }
  }
```

**`configStore` bleibt faul.** `getConfig()` lädt beim ersten Zugriff, nicht beim Modulimport — `loadConfig` hängt über `getConfigPath` an `app.getPath('userData')`, und das ist zum Importzeitpunkt des Moduls noch nicht verlässlich. Ein Test, der die Migration beobachten will, fasst den Store einmal an; der Produktivcode wird dafür **nicht** umgebaut.

In `defaults` die Blöcke `app`, `ui`, `mcp`, `windows` streichen und `agent` ersetzen durch:

```ts
  agent: {
    // Sessions are launched by the app itself; this matches cipher-mux 0.9.x behaviour and
    // is what the migration produces for an existing `skipPermissions: true`.
    startArgs: { 'claude-code': '--dangerously-skip-permissions' },
    // The strength gradient the presets already express: heavy where errors multiply
    // (Systems Engineer, Architect), standard elsewhere. Editable per CK-NFR-012.
    modelTiers: { light: 'haiku', standard: 'sonnet', heavy: 'opus' },
  },
```

- [ ] **Step 4: Migration schreiben**

In `src/main/config/config-store.ts`, oberhalb von `loadConfig`, einfügen:

```ts
const TOTE_BLOECKE = ['app', 'ui', 'mcp', 'windows']

/**
 * Bring a config file written before this feature up to the current shape.
 *
 * Idempotent by construction: every branch is guarded on the old key still being present,
 * so a second run finds nothing to do and reports `veraendert: false` — which is what
 * keeps loadConfig from rewriting the file on every start.
 *
 * Exported so it can be tested without a filesystem.
 */
export function migriere(roh: Record<string, unknown>): {
  config: Record<string, unknown>
  veraendert: boolean
} {
  const config = { ...roh }
  let veraendert = false

  const agent = config.agent as Record<string, unknown> | undefined
  if (agent && 'skipPermissions' in agent) {
    const neu = { ...agent }
    // A hand-written startArgs wins: the user stated the newer intent explicitly.
    if (!neu.startArgs) {
      neu.startArgs = {
        'claude-code': neu.skipPermissions === true ? '--dangerously-skip-permissions' : '',
      }
    }
    delete neu.skipPermissions
    config.agent = neu
    veraendert = true
  }

  for (const block of TOTE_BLOECKE) {
    if (block in config) {
      delete config[block]
      veraendert = true
    }
  }

  return { config, veraendert }
}
```

`loadConfig` ersetzen durch:

```ts
function loadConfig(): CipherKeelConfig {
  let zusammengefuehrt: CipherKeelConfig
  let veraendert: boolean
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf-8')
    if (!raw.trim()) return { ...defaults }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const migriert = migriere(parsed)
    veraendert = migriert.veraendert
    zusammengefuehrt = deepMerge(
      { ...defaults } as unknown as Record<string, unknown>,
      migriert.config
    ) as unknown as CipherKeelConfig
  } catch {
    return { ...defaults }
  }

  // Persisting the migration is best effort, and it sits outside the read's try on
  // purpose. Inside it, a failed write — read-only volume, ENOSPC, a file owned by
  // another account — would fall into the catch and hand back defaults for a config that
  // had just been read successfully. That value becomes `cached`, and the next
  // configStore.set would write the defaults tree over the user's real file: an empty
  // projects list and an empty registry, lost to a write error that had nothing to do
  // with them. A migration that cannot be persisted now is simply persisted on the next
  // write; a config that was read must never be discarded because of it.
  if (veraendert) {
    try {
      saveConfig(zusammengefuehrt)
    } catch (err) {
      console.warn(
        '[config-store] Die Migration konnte nicht geschrieben werden; sie gilt fuer diese ' +
        'Sitzung und wird beim naechsten erfolgreichen Schreiben festgehalten:', err
      )
    }
  }
  return zusammengefuehrt
}
```

- [ ] **Step 5: Test laufen lassen, Erfolg bestätigen**

```bash
npx vitest run tests/config/migration.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"; tail -30 /tmp/t.log
```
Erwartet: PASS, 7 Tests.

- [ ] **Step 6: Typecheck — die Aufrufer der entfernten Felder sichtbar machen**

```bash
npm run typecheck > /tmp/tc.log 2>&1; echo "EXIT=$?"; cat /tmp/tc.log
```

Erwartet: **genau ein** Fehler, an `ipc-handlers.ts:132` (`skipPermissions`). Den behebt Step 11 dieser Aufgabe — der Baum wird erst am Ende wieder grün, aber es wird nichts in diesem Zustand committet.

Erscheint zusätzlich ein Fehler zu `app`, `ui`, `mcp` oder `windows`, dann liest jemand einen Block, den Spec §2 für tot erklärt hat. **Abbrechen und melden**, nicht umbauen: dann ist die Bestandsaufnahme falsch, und das ist eine Entscheidung des Menschen, keine des Implementierers.

- [ ] **Step 7: Den fehlschlagenden Adapter-Test schreiben**

Create `tests/agent/start-args.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ClaudeCodeAdapter } from '../../src/main/agent/adapters/claude-code'

function adapterMit(args: string[]) {
  return new ClaudeCodeAdapter({ getStartArgs: () => args })
}

describe('Startparameter statt skipPermissions', () => {
  it('stellt die Nutzerparameter vor die app-gesteuerten', () => {
    const cmd = adapterMit(['--dangerously-skip-permissions']).buildLaunchCommand({ resume: true })
    expect(cmd.cmd).toBe('claude')
    expect(cmd.args).toEqual(['--dangerously-skip-permissions', '--resume'])
  })

  it('erzeugt mit der migrierten Vorgabe dieselbe Kommandozeile wie vor der Umstellung', () => {
    const cmd = adapterMit(['--dangerously-skip-permissions']).buildLaunchCommand({
      resume: true, model: 'opus',
    })
    expect(cmd.args).toEqual(['--dangerously-skip-permissions', '--resume', '--model', 'opus'])
  })

  it('startet ohne jeden Zusatzparameter, wenn das Feld leer ist', () => {
    const cmd = adapterMit([]).buildLaunchCommand({})
    expect(cmd.args).toEqual([])
  })

  it('reicht mehrere Freitextparameter unveraendert durch', () => {
    const cmd = adapterMit(['--foo', 'bar baz']).buildLaunchCommand({})
    expect(cmd.args).toEqual(['--foo', 'bar baz'])
  })

  it('benennt seine app-gesteuerten Parameter', () => {
    expect(adapterMit([]).appGesteuerteParameter).toEqual([
      '--resume', '--fork-session', '--model', '--append-system-prompt-file',
    ])
  })

  it('baut das Worker-Prompt-Fragment aus denselben Startparametern', () => {
    const fragment = adapterMit(['--dangerously-skip-permissions'])
      .buildWorkshopPromptFragment('de')
    expect(fragment).toContain('claude --dangerously-skip-permissions')
  })

  it('nennt im Prompt-Fragment kein Flag, das der Nutzer entfernt hat', () => {
    const fragment = adapterMit([]).buildWorkshopPromptFragment('de')
    expect(fragment).not.toContain('--dangerously-skip-permissions')
    expect(fragment).toContain('claude')
  })
})
```

- [ ] **Step 8: Test laufen lassen, Fehlschlag bestätigen**

```bash
npx vitest run tests/agent/start-args.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"; tail -20 /tmp/t.log
```
Erwartet: FAIL — `getStartArgs` ist noch nicht die Schnittstelle des Adapters.

- [ ] **Step 9: `AgentAdapter` erweitern**

In `src/main/agent/agent-adapter.ts`, im Interface `AgentAdapter`, oberhalb von `buildLaunchCommand(opts: LaunchOpts): LaunchCommand` einfügen:

```ts
  /**
   * Parameters this adapter appends from its own logic. The settings surface warns when a
   * user types one of them into the free-text start parameters, because it would then
   * appear twice on the command line. Named here rather than in the surface so that the
   * adapter which adds them is also the one that names them.
   */
  readonly appGesteuerteParameter?: readonly string[]
```

- [ ] **Step 10: `claude-code.ts` umstellen**

Den Import ergänzen:
```ts
import { formatShellCommand } from '../../util/shell-quote'
```

`AgentConfigReader` ersetzen:
```ts
/** Minimal interface for reading the agent config section. */
export interface AgentConfigReader {
  /** Extra launch parameters for this adapter, already split into argv. */
  getStartArgs(adapterId: string): string[]
}
```

In der Klasse, nach `readonly niveau = CapabilityNiveau.A`, einfügen:
```ts
  readonly appGesteuerteParameter = [
    '--resume', '--fork-session', '--model', '--append-system-prompt-file',
  ] as const
```

`buildLaunchCommand` — den Kopf ersetzen. Aus
```ts
    const args: string[] = []
    if (this.configReader.getSkipPermissions()) {
      args.push('--dangerously-skip-permissions')
    }
```
wird
```ts
    // User parameters first, app-driven flags after: with the migrated default this
    // produces a byte-identical command line to the pre-startArgs behaviour.
    const args: string[] = [...this.configReader.getStartArgs(this.id)]
```
Der Rest der Methode bleibt unverändert.

Eine private Hilfsmethode ergänzen, direkt vor `buildWorkshopPromptFragment`:
```ts
  /** The launch line as a human reads it — one source with buildLaunchCommand's argv. */
  private startBefehl(): string {
    return formatShellCommand('claude', this.configReader.getStartArgs(this.id))
  }
```

In allen vier Prompt-Fragmenten (`buildWorkshopPromptFragment` de/en, `buildCyberFactoryPromptFragment` de/en) die Zeichenkette
```
\`claude --dangerously-skip-permissions\`
```
ersetzen durch
```
\`${this.startBefehl()}\`
```

- [ ] **Step 11: Den Leser in `ipc-handlers.ts` umstellen**

Import ergänzen:
```ts
import { splitShellArgs } from './util/shell-quote'
```

Zeilen 130-133 ersetzen. Aus
```ts
  const adapterRegistry = new AdapterRegistry({
    getSkipPermissions: () => configStore.get('agent').skipPermissions,
  })
```
wird
```ts
  const adapterRegistry = new AdapterRegistry({
    getStartArgs: (adapterId: string) =>
      splitShellArgs(configStore.get('agent').startArgs[adapterId] ?? ''),
  })
```

- [ ] **Step 12: Die volle Prüfkette**

```bash
npx vitest run tests/agent/ tests/config/ > /tmp/t.log 2>&1; echo "EXIT=$?"; tail -30 /tmp/t.log
npm run typecheck > /tmp/tc.log 2>&1; echo "TYPECHECK=$?"; tail -20 /tmp/tc.log
npm test > /tmp/full.log 2>&1; echo "TEST=$?"; tail -10 /tmp/full.log
npm run lint > /tmp/l.log 2>&1; echo "LINT=$?"; tail -10 /tmp/l.log
```
Erwartet: alle EXIT=0. Bestehende Tests, die `getSkipPermissions` mocken, sind auf `getStartArgs` umzustellen — der Testkörper ändert sich, die geprüfte Zusicherung nicht.

- [ ] **Step 13: Commit**

```bash
git branch --show-current
git add src/main/config/config-store.ts tests/config/migration.test.ts src/main/agent/ src/main/ipc-handlers.ts tests/agent/
git commit -m "feat(config): startArgs je Adapter statt vendorspezifischem Schalter

Das Schema verliert agent.skipPermissions und die vier Bloecke ohne Leser
(app, ui, mcp, windows). An die Stelle des Schalters tritt agent.startArgs
je Adapter-Kennung -- der Vendor steht damit nicht mehr in der Struktur der
Konfiguration, nur noch als Schluessel.

Config und Adapter in einem Commit, weil das Feld und sein einziger Leser
sich zusammen aendern muessen: getrennt haette keine der beiden Haelften
einen uebersetzbaren Baum hinterlassen."
```

---

## Task 5: (in Aufgabe 4 aufgegangen)

Diese Aufgabe hiess urspruenglich „Adapter — Startparameter statt Vendor-Schalter" und ist
vollstaendig in **Aufgabe 4** enthalten, deren Schritte 7 bis 13 sie ausfuehren.

**Der Grund, festgehalten statt stillschweigend:** Aufgabe 4 entfernt `agent.skipPermissions`
aus dem Schema. Dessen einziger Leser steht in `ipc-handlers.ts:132` und wurde von dieser
Aufgabe umgestellt. Getrennt haette Aufgabe 4 einen Commit mit rotem Typecheck hinterlassen —
und die globale Randbedingung „jede Aufgabe hinterlaesst einen gruenen Baum" verbietet das.

Die Nummerierung bleibt, damit jeder Querverweis auf „Aufgabe 6" bis „Aufgabe 14" im uebrigen
Dokument gueltig bleibt. **Hier ist nichts zu tun.**

---

## Task 6: `ladeEintraege` — übersprungene Einträge erreichen eine Oberfläche

`alleEintraege()` überspringt kaputte Config-Einträge mit `console.warn` — laut für einen Entwickler, unsichtbar für einen Nutzer. Derselbe Fall wie PR #21.

**Files:**
- Modify: `src/main/model/registry.ts`
- Test: `tests/model/registry.test.ts` (ergänzen)

**Interfaces:**
- Consumes: nichts
- Produces:
  - `interface EintragsBefund { roh: unknown; fehler: string }`
  - `function ladeEintraege(): { eintraege: ModellEintrag[]; uebersprungen: EintragsBefund[] }`
  - `alleEintraege()` delegiert daran und behält seine Signatur

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

An `tests/model/registry.test.ts` innerhalb des äußeren `describe` anhängen:

```ts
  describe('ladeEintraege', () => {
    it('liefert den kaputten Eintrag samt Fehlertext statt ihn nur zu loggen', async () => {
      const { ladeEintraege } = await withConfig({
        // `name` ist gesetzt, damit die Validierung bis zur Anbieterart kommt:
        // normaliseEintrag prueft name vor art, und der Fehlertext soll den
        // tatsaechlichen Grund tragen, nicht den erstbesten.
        modelle: { eintraege: [{ id: 'kaputt', name: 'Kaputt', art: 'telepathie' }] },
      })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const { eintraege, uebersprungen } = ladeEintraege()
        expect(eintraege.length).toBeGreaterThan(0)
        expect(uebersprungen).toHaveLength(1)
        expect(uebersprungen[0].fehler).toContain('telepathie')
        expect((uebersprungen[0].roh as { id: string }).id).toBe('kaputt')
      } finally {
        warn.mockRestore()
      }
    })

    it('meldet nichts uebersprungen, wenn alles in Ordnung ist', async () => {
      const { ladeEintraege } = await withConfig(null)
      expect(ladeEintraege().uebersprungen).toEqual([])
    })

    it('meldet eine nicht-Array-Liste als einen einzigen Befund', async () => {
      const { ladeEintraege } = await withConfig({ modelle: { eintraege: {} } })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const { uebersprungen } = ladeEintraege()
        expect(uebersprungen).toHaveLength(1)
        expect(uebersprungen[0].fehler).toContain('Array')
      } finally {
        warn.mockRestore()
      }
    })
  })
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
npx vitest run tests/model/registry.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"; tail -20 /tmp/t.log
```
Erwartet: FAIL — `ladeEintraege is not a function`.

- [ ] **Step 3: Implementieren**

In `src/main/model/registry.ts` die Funktion `alleEintraege` ersetzen durch:

```ts
/** One config entry that did not survive validation, with the reason it did not. */
export interface EintragsBefund {
  roh: unknown
  fehler: string
}

/**
 * The entries plus what was dropped getting there.
 *
 * Skipping a broken entry loudly on the console is right for a developer and invisible to
 * a user. The settings surface shows `uebersprungen`, so a hand-edited line that broke
 * stops being a silent loss.
 */
export function ladeEintraege(): { eintraege: ModellEintrag[]; uebersprungen: EintragsBefund[] } {
  const byId = new Map<string, ModellEintrag>()
  for (const e of DEFAULT_EINTRAEGE) byId.set(e.id, e)
  const uebersprungen: EintragsBefund[] = []

  const eintraege = configStore.get('modelle').eintraege
  if (!Array.isArray(eintraege)) {
    const fehler = 'modelle.eintraege ist kein Array — die Liste wird als leer behandelt.'
    console.warn(`[model-registry] ${fehler}`)
    return { eintraege: [...byId.values()], uebersprungen: [{ roh: eintraege, fehler }] }
  }

  for (const raw of eintraege) {
    try {
      const e = normaliseEintrag(raw)
      byId.set(e.id, e)
    } catch (err) {
      const fehler = err instanceof Error ? err.message : String(err)
      // Loud, not silent — a skipped entry that says nothing is the expensive kind of failure.
      console.warn('[model-registry] Eintrag aus der Konfiguration uebersprungen:', fehler)
      uebersprungen.push({ roh: raw, fehler })
    }
  }
  return { eintraege: [...byId.values()], uebersprungen }
}

export function alleEintraege(): ModellEintrag[] {
  return ladeEintraege().eintraege
}
```

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

```bash
npx vitest run tests/model/ > /tmp/t.log 2>&1; echo "EXIT=$?"; tail -20 /tmp/t.log
```
Erwartet: PASS. Die bestehenden `alleEintraege`-Tests bleiben unverändert grün — das ist der Beleg, dass kein Aufrufer bricht.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/main/model/registry.ts tests/model/registry.test.ts
git commit -m "feat(model): ladeEintraege meldet uebersprungene Config-Eintraege statt sie zu verschlucken"
```

---

## Task 7: Die geteilten Typen und das Ansichtsmodell

Der Kern der Strecke. `ansicht.ts` wird der **einzige Aufrufer von `warnungen()`** im Projekt.

**Files:**
- Create: `src/shared/settings-types.ts`
- Create: `src/main/model/ansicht.ts`
- Test: `tests/model/ansicht.test.ts`

**Interfaces:**
- Consumes: `SLOTS`, `slotFuerId` (Aufgabe 2); `ladeEintraege` (Aufgabe 6); `warnungen`, `sperrgrund` aus `./eignung`; `readFromKeychain`, `readFromEnv`, `envVarName` aus `../worker/api-keys`
- Produces:
  - alle Typen aus `src/shared/settings-types.ts` (unten wörtlich)
  - `function baueAnsicht(quellen?: GeheimnisQuellen): Promise<SettingsAnsicht>`
  - `interface GeheimnisQuellen { keychain?: (ref: string) => Promise<string | null>; env?: (ref: string) => string | null }`

- [ ] **Step 1: Die geteilten Typen schreiben**

Create `src/shared/settings-types.ts`:

```ts
/**
 * settings-types — the shape the settings window receives.
 *
 * Results only, never rules. `sperrgrund` and `warnungen` arrive as finished German text,
 * so the renderer has nothing it could restate: the eignung matrices stay in
 * src/main/model/eignung.ts and are unreachable from here. That is the interface form the
 * project prefers over a string guard, which protects against copying but not against
 * paraphrase.
 */

export type Wirkung = 'sofort' | 'naechste-session' | 'neustart'

export type GeheimnisStatus = 'schluesselbund' | 'umgebung' | 'fehlt' | 'unbekannt'

export interface WarnungAnsicht {
  code: string
  text: string
}

export interface EintragAnsicht {
  id: string
  name: string
  art: 'cli-harness' | 'local-http' | 'api'
  oertlichkeit: 'lokal' | 'eigenes-netz' | 'fremdes-netz'
  erklaertext: string
  empfehlung: string
  /** German, e.g. "vermutet" or "gemessen am 2026-08-17". Null for a cli-harness entry. */
  faehigkeitenHerkunft: string | null
  /** Only an api entry names a key. */
  keyRef: string | null
  geheimnisStatus: GeheimnisStatus | null
  /** German: which environment variable is consulted, or why the status is unknown. */
  geheimnisHinweis: string | null
  /** False for a bundled entry: those cannot be deleted, only overridden. */
  loeschbar: boolean
}

export interface SlotOptionAnsicht {
  eintragId: string
  name: string
  /** German. Non-null means the option is locked and this says why. */
  sperrgrund: string | null
}

export interface SlotAnsicht {
  id: string
  beschriftung: string
  /** Empty string means no assignment. */
  gewaehlt: string
  optionen: SlotOptionAnsicht[]
  /**
   * Warnings about the assignment that is actually in effect. Empty when the assignment
   * does not hold — a warning about a pairing that never runs is noise, not information.
   */
  warnungen: WarnungAnsicht[]
  /**
   * German, non-null when the current assignment cannot be used: the entry is locked for
   * this slot, or it names an id nothing defines. In both cases the fallback applies.
   *
   * The renderer displays this instead of reconciling `gewaehlt` against `optionen`
   * itself. Reconciling is a rule, and rules do not cross this boundary.
   */
  gewaehltHinweis: string | null
  /** German: what applies while nothing usable is assigned. */
  rueckfallText: string
  wirkung: Wirkung
}

export interface EndpunktAnsicht {
  kind: 'ollama' | 'openai-compatible'
  host: string
  port: number
  baseUrl: string
  keyRef: string
  model: string
}

export interface AdapterAnsicht {
  id: string
  name: string
  startArgs: string
  appGesteuerteParameter: string[]
  /**
   * German, already-finished text. Same shape and same posture as a slot's warnings:
   * these never lock anything, they only say what the line means.
   */
  warnungen: WarnungAnsicht[]
}

export interface UebersprungenAnsicht {
  /** German: enough of the broken entry to recognise it. */
  beschreibung: string
  fehler: string
}

export interface SettingsAnsicht {
  eintraege: EintragAnsicht[]
  uebersprungen: UebersprungenAnsicht[]
  slots: SlotAnsicht[]
  modellTiers: { light: string; standard: string; heavy: string }
  rueckfallEndpunkte: { tagging: EndpunktAnsicht; worker: EndpunktAnsicht }
  adapter: AdapterAnsicht[]
  sprachausgabe: { aktiv: boolean; stimme: string }
}

export type SettingsAntwort =
  | { ok: true; ansicht: SettingsAnsicht }
  | { ok: false; fehler: string }
```

- [ ] **Step 2: Den fehlschlagenden Test schreiben**

Create `tests/model/ansicht.test.ts`:

```ts
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SettingsAnsicht } from '../../src/shared/settings-types'

describe('Ansichtsmodell', () => {
  let tmpDir: string

  beforeEach(() => {
    vi.resetModules()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-ansicht-test-'))
  })

  afterEach(() => {
    vi.doUnmock('electron')
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  /** Never touches the real keychain: both sources are injected. */
  async function ansichtMit(cfg: unknown, geheim: Record<string, string> = {}) {
    if (cfg !== null) {
      fs.writeFileSync(path.join(tmpDir, 'cipher-keel-config.json'), JSON.stringify(cfg))
    }
    vi.doMock('electron', () => ({ app: { getPath: () => tmpDir } }))
    const { baueAnsicht } = await import('../../src/main/model/ansicht')
    return baueAnsicht({
      keychain: async (ref: string) => geheim[ref] ?? null,
      env: () => null,
    }) as Promise<SettingsAnsicht>
  }

  const slot = (a: SettingsAnsicht, id: string) => a.slots.find(s => s.id === id)!
  const codes = (a: SettingsAnsicht, id: string) => slot(a, id).warnungen.map(w => w.code)

  it('liefert fuenf Slots und alle gebuendelten Eintraege', async () => {
    const a = await ansichtMit(null)
    expect(a.slots).toHaveLength(5)
    expect(a.eintraege.map(e => e.id)).toContain('openrouter-qwen3-coder')
  })

  it('sperrt einen local-http-Eintrag fuer ein Tier und nennt den Grund', async () => {
    const a = await ansichtMit(null)
    const option = slot(a, 'tier:heavy').optionen.find(o => o.eintragId === 'mac-qwen3-30b')!
    expect(option.sperrgrund).not.toBeNull()
    expect(option.sperrgrund).toContain('CLI-Harness')
  })

  it('laesst einen cli-harness-Eintrag fuer ein Tier offen', async () => {
    const a = await ansichtMit(null)
    const option = slot(a, 'tier:heavy').optionen.find(o => o.eintragId === 'claude-opus-cli')!
    expect(option.sperrgrund).toBeNull()
  })

  it('sperrt einen cli-harness-Eintrag fuer eine Rolle', async () => {
    const a = await ansichtMit(null)
    const option = slot(a, 'rolle:worker').optionen.find(o => o.eintragId === 'claude-opus-cli')!
    expect(option.sperrgrund).not.toBeNull()
  })

  // --- die zwei erreichbaren Warnregeln ---

  it('warnt bei rolle:worker auf einen API-Eintrag in fremdem Netz mit genau zwei Codes', async () => {
    const a = await ansichtMit({
      modelle: { zuordnung: { rollen: { tagging: '', worker: 'openrouter-qwen3-coder' } } },
    })
    expect(codes(a, 'rolle:worker').sort()).toEqual(['teure-ebene-fuer-mechanik', 'verlaesst-netz'])
  })

  it('warnt bei einem Tier auf Claude nur ueber das verlassene Netz', async () => {
    const a = await ansichtMit({
      modelle: { zuordnung: { tiers: { light: '', standard: '', heavy: 'claude-opus-cli' } } },
    })
    expect(codes(a, 'tier:heavy')).toEqual(['verlaesst-netz'])
  })

  it('warnt gar nicht bei einer Rolle auf ein lokales Modell', async () => {
    const a = await ansichtMit({
      modelle: { zuordnung: { rollen: { tagging: 'mac-qwen3-30b', worker: '' } } },
    })
    expect(codes(a, 'rolle:tagging')).toEqual([])
  })

  // --- die vier unerreichbaren Regeln: Gegenproben ---
  // Faellt eine davon, hat das Harness einen B-Slot eingefuehrt. Dann ist die Gegenprobe
  // anzupassen, nicht die Regel — und Spec Paragraf 5.5 ist nachzufuehren.

  it('erreicht werkzeugmodus-text nicht: kein Slot benutzt eigene-schleife', async () => {
    const a = await ansichtMit({
      modelle: { zuordnung: { rollen: { tagging: 'spark-gemma4-26b', worker: '' } } },
    })
    expect(codes(a, 'rolle:tagging')).not.toContain('werkzeugmodus-text')
  })

  it('erreicht nicht-gemessen nicht: die Paarung, die es braeuchte, ist gesperrt', async () => {
    // Die Regel verlangt einen agentischen Laeufer auf einem Nicht-CLI-Eintrag. Genau
    // diese Paarung sperrt sperrgrund fuer jeden Tier-Slot — und eine gesperrte
    // Zuordnung traegt keine Warnungen, weil sie nicht laeuft. Der Eintrag ist bewusst
    // ein local-http-Eintrag: waere hier ein cli-harness-Eintrag verankert, wuerde die
    // Gegenprobe vom Eintrag blockiert statt von der Slot-Tabelle und koennte nie
    // fallen, wenn das Harness einen eigene-schleife-Slot einfuehrt.
    const a = await ansichtMit({
      modelle: { zuordnung: { tiers: { light: '', standard: '', heavy: 'spark-gemma4-26b' } } },
    })
    expect(slot(a, 'tier:heavy').gewaehltHinweis).toContain('CLI-Harness')
    expect(codes(a, 'tier:heavy')).toEqual([])
  })

  it('sagt es, wenn eine Zuordnung einen Eintrag nennt, den es nicht gibt', async () => {
    const a = await ansichtMit({
      modelle: { zuordnung: { rollen: { tagging: '', worker: 'gibt-es-nicht' } } },
    })
    expect(slot(a, 'rolle:worker').gewaehltHinweis).toContain('gibt-es-nicht')
    expect(codes(a, 'rolle:worker')).toEqual([])
  })

  it('laesst gewaehltHinweis leer, solange die Zuordnung benutzbar ist', async () => {
    const a = await ansichtMit({
      modelle: { zuordnung: { tiers: { light: '', standard: '', heavy: 'claude-opus-cli' } } },
    })
    expect(slot(a, 'tier:heavy').gewaehltHinweis).toBeNull()
  })

  it('erreicht unter-faehigkeit nicht: die C-Slots fahren ein-schuss, der auf C steht', async () => {
    const a = await ansichtMit({
      modelle: { zuordnung: { rollen: { tagging: '', worker: 'spark-gemma4-26b' } } },
    })
    expect(codes(a, 'rolle:worker')).not.toContain('unter-faehigkeit')
  })

  it('erreicht kontext-zu-klein nicht: nichts liefert heute einen Startkontext', async () => {
    const a = await ansichtMit({
      modelle: { zuordnung: { rollen: { tagging: 'mac-qwen3-30b', worker: '' } } },
    })
    expect(codes(a, 'rolle:tagging')).not.toContain('kontext-zu-klein')
  })

  // --- Rueckfall, Herkunft, Geheimnisse ---

  it('nennt den Rueckfall eines leeren Rollen-Slots mit Host und Modell', async () => {
    const a = await ansichtMit(null)
    expect(slot(a, 'rolle:tagging').rueckfallText).toContain('11434')
    expect(slot(a, 'rolle:tagging').rueckfallText).toContain('qwen3')
  })

  it('nennt den Rueckfall eines leeren Tier-Slots mit dem Modell-Handle', async () => {
    const a = await ansichtMit(null)
    expect(slot(a, 'tier:heavy').rueckfallText).toContain('opus')
  })

  it('macht die vermutete Herkunft der Faehigkeitszeile sichtbar', async () => {
    const a = await ansichtMit(null)
    const e = a.eintraege.find(x => x.id === 'mac-qwen3-30b')!
    expect(e.faehigkeitenHerkunft).toBe('vermutet')
  })

  it('laesst die Herkunft bei einem cli-harness-Eintrag leer', async () => {
    const a = await ansichtMit(null)
    expect(a.eintraege.find(x => x.id === 'claude-opus-cli')!.faehigkeitenHerkunft).toBeNull()
  })

  it('meldet ein hinterlegtes Geheimnis als schluesselbund', async () => {
    const a = await ansichtMit(null, { openrouter: 'sk-test' })
    const e = a.eintraege.find(x => x.id === 'openrouter-qwen3-coder')!
    expect(e.geheimnisStatus).toBe('schluesselbund')
  })

  it('meldet ein fehlendes Geheimnis und nennt die gepruefte Umgebungsvariable', async () => {
    const a = await ansichtMit(null)
    const e = a.eintraege.find(x => x.id === 'openrouter-qwen3-coder')!
    expect(e.geheimnisStatus).toBe('fehlt')
    expect(e.geheimnisHinweis).toContain('CIPHER_KEEL_API_OPENROUTER')
  })

  it('gibt einem Eintrag ohne keyRef gar keinen Geheimnis-Status', async () => {
    const a = await ansichtMit(null)
    expect(a.eintraege.find(x => x.id === 'mac-qwen3-30b')!.geheimnisStatus).toBeNull()
  })

  // --- die Felder, die sonst niemand anfasst ---
  // Ohne diese drei koennte man tagging und worker vertauschen oder die Sprachausgabe
  // invertieren, und die Suite bliebe gruen.

  it('reicht die Modell-Tiers als Rueckfall durch', async () => {
    const a = await ansichtMit(null)
    expect(a.modellTiers).toEqual({ light: 'haiku', standard: 'sonnet', heavy: 'opus' })
  })

  it('ordnet die Rueckfall-Endpunkte der richtigen Rolle zu', async () => {
    const a = await ansichtMit({
      llm: {
        tagging: { host: '10.0.0.1', port: 11434, model: 'tagger' },
        worker: { host: '10.0.0.2', port: 11434, model: 'arbeiter' },
      },
    })
    expect(a.rueckfallEndpunkte.tagging.model).toBe('tagger')
    expect(a.rueckfallEndpunkte.tagging.host).toBe('10.0.0.1')
    expect(a.rueckfallEndpunkte.worker.model).toBe('arbeiter')
    expect(a.rueckfallEndpunkte.worker.host).toBe('10.0.0.2')
  })

  it('gibt die Sprachausgabe unveraendert weiter', async () => {
    const a = await ansichtMit({ voice: { enabled: false, piperVoice: 'de_DE-probe' } })
    expect(a.sprachausgabe).toEqual({ aktiv: false, stimme: 'de_DE-probe' })
  })

  it('markiert gebuendelte Eintraege als nicht loeschbar', async () => {
    const a = await ansichtMit(null)
    expect(a.eintraege.find(x => x.id === 'claude-opus-cli')!.loeschbar).toBe(false)
  })

  it('markiert einen Eintrag aus der Config als loeschbar', async () => {
    const a = await ansichtMit({
      modelle: { eintraege: [{
        id: 'eigener', name: 'Eigener', art: 'local-http',
        erreichbarkeit: { art: 'local-http', host: '10.0.0.5', port: 11434, model: 'x' },
        oertlichkeit: 'eigenes-netz', erklaertext: '', empfehlung: '',
      }] },
    })
    expect(a.eintraege.find(x => x.id === 'eigener')!.loeschbar).toBe(true)
  })

  it('reicht uebersprungene Eintraege mit Fehlertext durch', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // name gesetzt, damit die Validierung bis zur Anbieterart kommt — siehe
      // tests/model/registry.test.ts, wo dieselbe Reihenfolge zaehlt.
      const a = await ansichtMit({
        modelle: { eintraege: [{ id: 'kaputt', name: 'Kaputt', art: 'telepathie' }] },
      })
      expect(a.uebersprungen).toHaveLength(1)
      expect(a.uebersprungen[0].beschreibung).toContain('kaputt')
      expect(a.uebersprungen[0].fehler).toContain('telepathie')
    } finally {
      warn.mockRestore()
    }
  })

  it('degradiert einen einzelnen Eintrag auf unbekannt, wenn der Schluesselbund wirft', async () => {
    fs.writeFileSync(path.join(tmpDir, 'cipher-keel-config.json'), '{}')
    vi.doMock('electron', () => ({ app: { getPath: () => tmpDir } }))
    const { baueAnsicht } = await import('../../src/main/model/ansicht')
    const a = await baueAnsicht({
      keychain: async () => { throw new Error('security nicht gefunden') },
      env: () => null,
    })
    const e = a.eintraege.find(x => x.id === 'openrouter-qwen3-coder')!
    expect(e.geheimnisStatus).toBe('unbekannt')
    expect(e.geheimnisHinweis).toContain('security nicht gefunden')
    // Die Seite lebt weiter: alle anderen Eintraege sind unversehrt da.
    expect(a.eintraege.length).toBeGreaterThan(1)
  })

  it('warnt, wenn ein Startparameter etwas nennt, das die App selbst anhaengt', async () => {
    const a = await ansichtMit({ agent: { startArgs: { 'claude-code': '--resume' } } })
    const w = a.adapter.find(x => x.id === 'claude-code')!.warnungen
    expect(w.map(x => x.code)).toEqual(['doppelter-parameter'])
    expect(w[0].text).toContain('--resume')
  })

  it('benennt das Ueberspringen der Berechtigungsrueckfrage, ohne es zu sperren', async () => {
    const a = await ansichtMit({
      agent: { startArgs: { 'claude-code': '--dangerously-skip-permissions' } },
    })
    const w = a.adapter.find(x => x.id === 'claude-code')!.warnungen
    expect(w.map(x => x.code)).toEqual(['berechtigungen-uebersprungen'])
    // Sperren waere falsch: es ist die Vorgabe, und ohne sie haengt eine Sitzung.
    expect(w[0].text).toContain('Werkzeugaufruf')
  })

  it('nennt beide Gruende, wenn beide zutreffen', async () => {
    const a = await ansichtMit({
      agent: { startArgs: { 'claude-code': '--dangerously-skip-permissions --resume' } },
    })
    const codes = a.adapter.find(x => x.id === 'claude-code')!.warnungen.map(x => x.code)
    expect(codes.sort()).toEqual(['berechtigungen-uebersprungen', 'doppelter-parameter'])
  })

  it('warnt nicht bei einem harmlosen Startparameter', async () => {
    const a = await ansichtMit({ agent: { startArgs: { 'claude-code': '--verbose' } } })
    expect(a.adapter.find(x => x.id === 'claude-code')!.warnungen).toEqual([])
  })

  it('meldet eine unlesbare Parameterzeile und urteilt dann nicht weiter', async () => {
    const a = await ansichtMit({
      agent: { startArgs: { 'claude-code': '--datei "ohne Ende' } },
    })
    const w = a.adapter.find(x => x.id === 'claude-code')!.warnungen
    expect(w.map(x => x.code)).toEqual(['unlesbare-parameter'])
  })
})
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

```bash
npx vitest run tests/model/ansicht.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"; tail -20 /tmp/t.log
```
Erwartet: FAIL, `Cannot find module '../../src/main/model/ansicht'`.

- [ ] **Step 4: `ansicht.ts` schreiben**

Create `src/main/model/ansicht.ts`:

```ts
/**
 * ansicht — the settings window's view model, computed in main.
 *
 * This is the only caller of `warnungen()` in the project. The renderer receives finished
 * German text and never a rule, which is why it cannot paraphrase the eignung matrices.
 *
 * Async because the secret status asks the macOS keychain via the `security` CLI. Both
 * secret sources are injectable so tests never touch the real keychain.
 */

import { configStore } from '../config/config-store'
import { DEFAULT_EINTRAEGE } from './defaults'
import { ladeEintraege } from './registry'
import { sperrgrund, warnungen } from './eignung'
import { SLOTS, type Slot } from './slots'
import type { ModellEintrag } from './entry'
import { envVarName, readFromEnv, readFromKeychain } from '../worker/api-keys'
import { splitShellArgs } from '../util/shell-quote'
import { AdapterRegistry } from '../agent/registry'
import type {
  AdapterAnsicht, EintragAnsicht, EndpunktAnsicht, GeheimnisStatus,
  SettingsAnsicht, SlotAnsicht, SlotOptionAnsicht,
} from '../../shared/settings-types'

export interface GeheimnisQuellen {
  keychain?: (ref: string) => Promise<string | null>
  env?: (ref: string) => string | null
}

const GEBUENDELTE_IDS = new Set(DEFAULT_EINTRAEGE.map(e => e.id))

function keyRefVon(e: ModellEintrag): string | null {
  return e.erreichbarkeit.art === 'api' ? e.erreichbarkeit.keyRef : null
}

function herkunftVon(e: ModellEintrag): string | null {
  const f = e.faehigkeiten
  if (!f) return null
  if (f.quelle === 'gemessen') return `gemessen am ${f.gemessenAm} mit ${f.gemessenMit}`
  return f.quelle
}

async function geheimnisStatusVon(
  ref: string,
  quellen: GeheimnisQuellen
): Promise<{ status: GeheimnisStatus; hinweis: string }> {
  const variable = envVarName(ref)
  try {
    const ausSchluesselbund = await (quellen.keychain ?? readFromKeychain)(ref)
    if (ausSchluesselbund) {
      return { status: 'schluesselbund', hinweis: `Im Schluesselbund hinterlegt (cipher-keel-api-${ref}).` }
    }
    const ausUmgebung = (quellen.env ?? readFromEnv)(ref)
    if (ausUmgebung) {
      return { status: 'umgebung', hinweis: `Aus der Umgebungsvariable ${variable}.` }
    }
    return {
      status: 'fehlt',
      hinweis: `Weder im Schluesselbund noch in ${variable} gefunden — ohne Schluessel bleibt dieser Eintrag unerreichbar.`,
    }
  } catch (err) {
    // One entry degrades, the page lives on.
    const grund = err instanceof Error ? err.message : String(err)
    return { status: 'unbekannt', hinweis: `Der Schluesselbund war nicht lesbar: ${grund}` }
  }
}

function endpunktAnsicht(e: { kind?: string; host?: string; port?: number; baseUrl?: string; keyRef?: string; model: string }): EndpunktAnsicht {
  return {
    kind: e.kind === 'openai-compatible' ? 'openai-compatible' : 'ollama',
    host: e.host ?? '',
    port: e.port ?? 0,
    baseUrl: e.baseUrl ?? '',
    keyRef: e.keyRef ?? '',
    model: e.model,
  }
}

/**
 * Enough of a rejected config entry to recognise it, and no more.
 *
 * The raw value comes from a hand-edited file and is displayed to a user, so it is bounded
 * here rather than in the renderer — the main process is where the value is known to be
 * arbitrary. The ellipsis matters: without it a clipped blob reads as malformed JSON
 * rather than as an excerpt, which would blame the wrong thing.
 */
function kurzfassung(roh: unknown): string {
  const text = JSON.stringify(roh) ?? String(roh)
  return text.length > 120 ? `Eintrag ${text.slice(0, 120)}…` : `Eintrag ${text}`
}

function rueckfallText(slot: Slot): string {
  if (slot.art === 'tier') {
    const handle = configStore.get('agent').modelTiers[slot.schluessel as 'light' | 'standard' | 'heavy']
    return `Keine Zuordnung — es gilt der Wert aus agent.modelTiers: '${handle}'.`
  }
  const e = configStore.get('llm')[slot.schluessel as 'tagging' | 'worker']
  const ziel = e.baseUrl ? e.baseUrl : `${e.host}:${e.port}`
  return `Keine Zuordnung — es gilt der Wert aus llm.${slot.schluessel}: ${ziel}, Modell '${e.model}'.`
}

function slotAnsicht(slot: Slot, eintraege: ModellEintrag[]): SlotAnsicht {
  const zuordnung = configStore.get('modelle').zuordnung
  const gewaehlt = slot.art === 'tier'
    ? zuordnung.tiers[slot.schluessel as 'light' | 'standard' | 'heavy']
    : zuordnung.rollen[slot.schluessel as 'tagging' | 'worker']

  const optionen: SlotOptionAnsicht[] = eintraege.map(e => ({
    eintragId: e.id,
    name: e.name,
    sperrgrund: sperrgrund(slot.laeufer, e.art),
  }))

  const eintrag = eintraege.find(e => e.id === gewaehlt)

  // An assignment is only worth warning about if it actually holds. Two ways it does not:
  // it names an id nothing defines, or it names an entry this slot's runner cannot drive.
  // Both mean the fallback runs, so warnings about the named entry would describe
  // something that never happens — and the lock reason is the message that matters.
  let gewaehltHinweis: string | null = null
  if (gewaehlt && !eintrag) {
    gewaehltHinweis =
      `Die Zuordnung nennt den Eintrag '${gewaehlt}', den es nicht gibt. Es gilt der Rueckfall.`
  } else if (eintrag) {
    const grund = sperrgrund(slot.laeufer, eintrag.art)
    if (grund) {
      gewaehltHinweis = `Diese Zuordnung ist nicht benutzbar. ${grund} Es gilt der Rueckfall.`
    }
  }

  // No WarnKontext is passed: nothing in the project supplies a start context yet, so
  // `kontext-zu-klein` cannot fire. Spec section 5.5 states that, and
  // tests/model/ansicht.test.ts holds the counter-proof.
  const warnListe = eintrag && !gewaehltHinweis
    ? warnungen(eintrag, slot.laeufer, slot.niveau)
    : []

  return {
    id: slot.id,
    beschriftung: slot.beschriftung,
    gewaehlt: gewaehlt ?? '',
    optionen,
    warnungen: warnListe,
    gewaehltHinweis,
    rueckfallText: rueckfallText(slot),
    wirkung: slot.wirkung,
  }
}

/**
 * The flag that turns off Claude Code's per-tool confirmation. It is the shipped default
 * and stays that way — the app starts its sessions into a tmux pane it drives, where no
 * one could answer a prompt. Until this window existed the setting was reachable only by
 * editing a file outside the app (CK-NFR-012), so it was not merely unexplained, it was
 * invisible. Naming it here is what turns a silent default into a stated one.
 */
const BERECHTIGUNGS_FLAGGE = '--dangerously-skip-permissions'

function adapterAnsichten(): AdapterAnsicht[] {
  // The registry needs a config reader; the view model only reads names and parameters,
  // so a reader that answers from the same config is enough.
  const registry = new AdapterRegistry({
    getStartArgs: (id: string) => splitShellArgs(configStore.get('agent').startArgs[id] ?? ''),
  })
  const startArgs = configStore.get('agent').startArgs

  return registry.listIds().map(id => {
    const adapter = registry.get(id)!
    const text = startArgs[id] ?? ''
    const appGesteuert = [...(adapter.appGesteuerteParameter ?? [])]
    // Not named `warnungen`: that name belongs to the eignung function this module is the
    // one caller of, and shadowing it here would make a reader check whether one is the
    // other. Neither is.
    const warnListe: WarnungAnsicht[] = []
    let getippt: string[] = []

    try {
      getippt = splitShellArgs(text)
    } catch (err) {
      // An unreadable line cannot be judged further, so no other rule runs on it.
      warnListe.push({
        code: 'unlesbare-parameter',
        text: err instanceof Error ? err.message : String(err),
      })
      return {
        id, name: adapter.displayName, startArgs: text,
        appGesteuerteParameter: appGesteuert, warnungen: warnListe,
      }
    }

    const doppelt = appGesteuert.filter(p => getippt.includes(p))
    if (doppelt.length > 0) {
      warnListe.push({
        code: 'doppelter-parameter',
        text: `${doppelt.join(', ')} wird von der App selbst angehaengt — hier eingetragen ` +
          'steht der Parameter zweimal in der Kommandozeile.',
      })
    }

    if (getippt.includes(BERECHTIGUNGS_FLAGGE)) {
      warnListe.push({
        code: 'berechtigungen-uebersprungen',
        text: 'Dieser Parameter schaltet die Rueckfrage vor jedem Werkzeugaufruf ab. Er ist ' +
          'die Vorgabe, weil die App ihre Sitzungen selbst in einen tmux-Pane startet, in dem ' +
          'niemand antworten koennte — er bedeutet aber, dass eine Sitzung in diesem Projekt ' +
          'ohne weiteres Nachfragen schreibt und Befehle ausfuehrt.',
      })
    }

    return {
      id, name: adapter.displayName, startArgs: text,
      appGesteuerteParameter: appGesteuert, warnungen: warnListe,
    }
  })
}

export async function baueAnsicht(quellen: GeheimnisQuellen = {}): Promise<SettingsAnsicht> {
  const { eintraege, uebersprungen } = ladeEintraege()

  const eintragsAnsichten: EintragAnsicht[] = await Promise.all(
    eintraege.map(async (e): Promise<EintragAnsicht> => {
      const ref = keyRefVon(e)
      const geheim = ref ? await geheimnisStatusVon(ref, quellen) : null
      return {
        id: e.id,
        name: e.name,
        art: e.art,
        oertlichkeit: e.oertlichkeit,
        erklaertext: e.erklaertext,
        empfehlung: e.empfehlung,
        faehigkeitenHerkunft: herkunftVon(e),
        keyRef: ref,
        geheimnisStatus: geheim ? geheim.status : null,
        geheimnisHinweis: geheim ? geheim.hinweis : null,
        loeschbar: !GEBUENDELTE_IDS.has(e.id),
      }
    })
  )

  const llm = configStore.get('llm')
  const voice = configStore.get('voice')

  return {
    eintraege: eintragsAnsichten,
    uebersprungen: uebersprungen.map(u => ({
      beschreibung: kurzfassung(u.roh),
      fehler: u.fehler,
    })),
    slots: SLOTS.map(s => slotAnsicht(s, eintraege)),
    modellTiers: { ...configStore.get('agent').modelTiers },
    rueckfallEndpunkte: {
      tagging: endpunktAnsicht(llm.tagging),
      worker: endpunktAnsicht(llm.worker),
    },
    adapter: adapterAnsichten(),
    sprachausgabe: { aktiv: voice.enabled !== false, stimme: voice.piperVoice ?? '' },
  }
}
```

- [ ] **Step 5: Test laufen lassen, Erfolg bestätigen**

```bash
npx vitest run tests/model/ansicht.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"; tail -40 /tmp/t.log
```
Erwartet: PASS, 24 Tests.

- [ ] **Step 6: Belegen, dass es genau einen Aufrufer gibt**

```bash
grep -rn "warnungen(" src/ | grep -v "src/main/model/eignung.ts"
```
Erwartet: **genau eine** Zeile, in `src/main/model/ansicht.ts`. Mehr als eine ist ein Fehler — der Spec verspricht genau einen.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add src/shared/settings-types.ts src/main/model/ansicht.ts tests/model/ansicht.test.ts
git commit -m "feat(model): Ansichtsmodell -- der erste und einzige Aufrufer von warnungen()"
```

---

## Task 8: IPC-Kanäle und Settings-Handler

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Create: `src/main/settings/handlers.ts`
- Modify: `src/main/ipc-handlers.ts`

**Interfaces:**
- Consumes: `baueAnsicht` (Aufgabe 7), `storeInKeychain` aus `../worker/api-keys`, `normaliseEintrag` aus `../model/entry`, `normaliseEndpoint` aus `../worker/model-client`, `slotFuerId` (Aufgabe 2)
- Produces: `function registerSettingsHandlers(): void`

- [ ] **Step 1: Kanäle deklarieren**

In `src/shared/ipc-channels.ts`, im Abschnitt „Window management channels", ergänzen:

```ts
export const WINDOW_OPEN_SETTINGS = 'window:open-settings' as const
```

Einen neuen Abschnitt anfügen:

```ts
// ---------------------------------------------------------------------------
// Settings channels — the settings window is the only writer of config
// ---------------------------------------------------------------------------
export const SETTINGS_ANSICHT = 'settings:ansicht' as const
export const SETTINGS_ZUORDNUNG_SETZEN = 'settings:zuordnung-setzen' as const
export const SETTINGS_EINTRAG_SPEICHERN = 'settings:eintrag-speichern' as const
export const SETTINGS_EINTRAG_LOESCHEN = 'settings:eintrag-loeschen' as const
export const SETTINGS_GEHEIMNIS_SETZEN = 'settings:geheimnis-setzen' as const
export const SETTINGS_GEHEIMNIS_LOESCHEN = 'settings:geheimnis-loeschen' as const
export const SETTINGS_STARTARGS_SETZEN = 'settings:startargs-setzen' as const
export const SETTINGS_EINFACHFELD_SETZEN = 'settings:einfachfeld-setzen' as const
export const SETTINGS_RUECKFALL_ENDPUNKT_SETZEN = 'settings:rueckfall-endpunkt-setzen' as const
```

Die Deklarationen `CONFIG_DELETE` und `CONFIG_CHANGED` **streichen** — beide haben weder Handler noch Sender. Entsprechend aus `MainToRendererChannel` (`CONFIG_CHANGED`) und `RendererToMainChannel` (`CONFIG_DELETE`) entfernen.

In `RendererToMainChannel` ergänzen:
```ts
  | typeof WINDOW_OPEN_SETTINGS
  | typeof SETTINGS_ANSICHT
  | typeof SETTINGS_ZUORDNUNG_SETZEN
  | typeof SETTINGS_EINTRAG_SPEICHERN
  | typeof SETTINGS_EINTRAG_LOESCHEN
  | typeof SETTINGS_GEHEIMNIS_SETZEN
  | typeof SETTINGS_GEHEIMNIS_LOESCHEN
  | typeof SETTINGS_STARTARGS_SETZEN
  | typeof SETTINGS_EINFACHFELD_SETZEN
  | typeof SETTINGS_RUECKFALL_ENDPUNKT_SETZEN
```

- [ ] **Step 2: Handler schreiben**

Create `src/main/settings/handlers.ts`:

```ts
/**
 * settings/handlers — the IPC surface of the settings window.
 *
 * Separate from ipc-handlers.ts on purpose: that file is 815 lines, and nine more handlers
 * would make it worse.
 *
 * Two rules hold for every writer here:
 *   1. validate in main, never trust the renderer
 *   2. return the freshly computed whole view, because one change moves things elsewhere —
 *      an assignment changes a fallback, a secret changes an entry's status in every slot
 *      that names it
 *
 * `config:set` is deliberately left alone and unused by this window: it writes a whole
 * top-level key with no validation, and that surface is not being widened.
 */

import { ipcMain } from 'electron'
import { configStore } from '../config/config-store'
import { baueAnsicht } from '../model/ansicht'
import { normaliseEintrag } from '../model/entry'
import { slotFuerId } from '../model/slots'
import { storeInKeychain, keychainService } from '../worker/api-keys'
import { normaliseEndpoint } from '../worker/model-client'
import { execFileAsync } from '../util/exec-util'
import { AdapterRegistry } from '../agent/registry'
import { splitShellArgs } from '../util/shell-quote'
import type { SettingsAntwort } from '../../shared/settings-types'
import {
  SETTINGS_ANSICHT, SETTINGS_ZUORDNUNG_SETZEN, SETTINGS_EINTRAG_SPEICHERN,
  SETTINGS_EINTRAG_LOESCHEN, SETTINGS_GEHEIMNIS_SETZEN, SETTINGS_GEHEIMNIS_LOESCHEN,
  SETTINGS_STARTARGS_SETZEN, SETTINGS_EINFACHFELD_SETZEN,
  SETTINGS_RUECKFALL_ENDPUNKT_SETZEN,
} from '../../shared/ipc-channels'

/** Every writer funnels through this: validate, mutate, hand back the whole picture. */
async function mitAnsicht(aenderung: () => void): Promise<SettingsAntwort> {
  try {
    aenderung()
  } catch (err) {
    return { ok: false, fehler: err instanceof Error ? err.message : String(err) }
  }
  try {
    return { ok: true, ansicht: await baueAnsicht() }
  } catch (err) {
    return { ok: false, fehler: `Die Aenderung wurde gespeichert, aber die Ansicht liess sich nicht neu aufbauen: ${err instanceof Error ? err.message : String(err)}` }
  }
}

const EINFACHFELDER = new Set([
  'modelltier:light', 'modelltier:standard', 'modelltier:heavy',
  'sprachausgabe:aktiv', 'sprachausgabe:stimme',
])

export function registerSettingsHandlers(): void {
  ipcMain.handle(SETTINGS_ANSICHT, async () => baueAnsicht())

  ipcMain.handle(SETTINGS_ZUORDNUNG_SETZEN, async (_e, slotId: string, eintragId: string) =>
    mitAnsicht(() => {
      const slot = slotFuerId(slotId)
      if (!slot) throw new Error(`Unbekannter Zuordnungsplatz '${slotId}'.`)
      const modelle = configStore.get('modelle')
      const zuordnung = {
        tiers: { ...modelle.zuordnung.tiers },
        rollen: { ...modelle.zuordnung.rollen },
      }
      if (slot.art === 'tier') {
        zuordnung.tiers[slot.schluessel as 'light' | 'standard' | 'heavy'] = eintragId
      } else {
        zuordnung.rollen[slot.schluessel as 'tagging' | 'worker'] = eintragId
      }
      configStore.set('modelle', { ...modelle, zuordnung })
    })
  )

  ipcMain.handle(SETTINGS_EINTRAG_SPEICHERN, async (_e, roh: unknown) =>
    mitAnsicht(() => {
      // The one validation, reused: normaliseEintrag also builds the endpoint, so the
      // transport check happens here exactly as it does on load.
      const eintrag = normaliseEintrag(roh)
      const modelle = configStore.get('modelle')
      const liste = Array.isArray(modelle.eintraege) ? [...modelle.eintraege] : []
      const index = liste.findIndex(x => (x as { id?: string })?.id === eintrag.id)
      if (index >= 0) liste[index] = eintrag
      else liste.push(eintrag)
      configStore.set('modelle', { ...modelle, eintraege: liste })
    })
  )

  ipcMain.handle(SETTINGS_EINTRAG_LOESCHEN, async (_e, id: string) =>
    mitAnsicht(() => {
      const modelle = configStore.get('modelle')
      const liste = Array.isArray(modelle.eintraege) ? modelle.eintraege : []
      const gefiltert = liste.filter(x => (x as { id?: string })?.id !== id)
      if (gefiltert.length === liste.length) {
        throw new Error(
          `Der Eintrag '${id}' steht nicht in der Konfiguration. Gebuendelte Eintraege lassen ` +
          'sich nicht loeschen, nur durch einen gleichnamigen eigenen ueberschreiben.'
        )
      }
      configStore.set('modelle', { ...modelle, eintraege: gefiltert })
    })
  )

  ipcMain.handle(SETTINGS_GEHEIMNIS_SETZEN, async (_e, ref: string, geheimnis: string) => {
    if (!ref) return { ok: false, fehler: 'Ohne Schluesselnamen laesst sich nichts hinterlegen.' }
    if (!geheimnis) return { ok: false, fehler: 'Ein leeres Geheimnis wird nicht gespeichert — zum Entfernen bitte loeschen.' }
    try {
      await storeInKeychain(ref, geheimnis)
    } catch (err) {
      return { ok: false, fehler: `Der Schluesselbund hat das Speichern abgelehnt: ${err instanceof Error ? err.message : String(err)}` }
    }
    return mitAnsicht(() => {})
  })

  ipcMain.handle(SETTINGS_GEHEIMNIS_LOESCHEN, async (_e, ref: string) => {
    try {
      await execFileAsync('security', [
        'delete-generic-password', '-s', keychainService(ref), '-a', 'key',
      ])
    } catch (err) {
      return { ok: false, fehler: `Der Schluesselbund hat das Loeschen abgelehnt: ${err instanceof Error ? err.message : String(err)}` }
    }
    return mitAnsicht(() => {})
  })

  ipcMain.handle(SETTINGS_STARTARGS_SETZEN, async (_e, adapterId: string, text: string) =>
    mitAnsicht(() => {
      const registry = new AdapterRegistry({ getStartArgs: () => [] })
      if (!registry.listIds().includes(adapterId)) {
        throw new Error(`Kein registrierter Adapter mit der Kennung '${adapterId}'.`)
      }
      // Reject an unbalanced quote here rather than at launch time, where it would break
      // a session start instead of a form.
      splitShellArgs(text)
      const agent = configStore.get('agent')
      configStore.set('agent', { ...agent, startArgs: { ...agent.startArgs, [adapterId]: text } })
    })
  )

  ipcMain.handle(SETTINGS_EINFACHFELD_SETZEN, async (_e, feld: string, wert: unknown) =>
    mitAnsicht(() => {
      if (!EINFACHFELDER.has(feld)) throw new Error(`Unbekanntes Feld '${feld}'.`)
      const [bereich, name] = feld.split(':')
      if (bereich === 'modelltier') {
        if (typeof wert !== 'string') throw new Error('Ein Modell-Handle muss Text sein.')
        const agent = configStore.get('agent')
        configStore.set('agent', {
          ...agent,
          modelTiers: { ...agent.modelTiers, [name]: wert },
        })
        return
      }
      const voice = configStore.get('voice')
      if (name === 'aktiv') {
        if (typeof wert !== 'boolean') throw new Error('Die Sprachausgabe ist an oder aus.')
        configStore.set('voice', { ...voice, enabled: wert })
      } else {
        if (typeof wert !== 'string' || !wert) throw new Error('Ohne Stimmennamen gibt es keine Ausgabe.')
        configStore.set('voice', { ...voice, piperVoice: wert })
      }
    })
  )

  ipcMain.handle(SETTINGS_RUECKFALL_ENDPUNKT_SETZEN, async (_e, rolle: string, endpunkt: unknown) =>
    mitAnsicht(() => {
      if (rolle !== 'tagging' && rolle !== 'worker') {
        throw new Error(`Unbekannte Rolle '${rolle}'.`)
      }
      // normaliseEndpoint is the one transport validation — not restated here.
      normaliseEndpoint(endpunkt as never)
      const llm = configStore.get('llm')
      configStore.set('llm', { ...llm, [rolle]: endpunkt as never })
    })
  )
}
```

- [ ] **Step 3: Typecheck, Lint, Tests**

Die Handler werden in **Aufgabe 9** eingehängt, zusammen mit dem Fenster, das sie erreichbar macht. Diese Aufgabe endet mit einem grünen Baum: `handlers.ts` ist noch von niemandem importiert, aber übersetzbar und lintbar.

```bash
npm run typecheck > /tmp/tc.log 2>&1; echo "TYPECHECK=$?"; tail -20 /tmp/tc.log
npm run lint > /tmp/l.log 2>&1; echo "LINT=$?"; tail -20 /tmp/l.log
npm test > /tmp/t.log 2>&1; echo "TEST=$?"; tail -10 /tmp/t.log
```
Erwartet: alle drei EXIT=0. Ein Typecheck-Fehler bedeutet, dass eine der importierten Signaturen anders aussieht als angenommen — dann die Signatur nachlesen und `handlers.ts` anpassen, **nicht** die aufgerufene Funktion.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add src/shared/ipc-channels.ts src/main/settings/handlers.ts
git commit -m "feat(settings): IPC-Kanaele -- ein Lesekanal, acht validierende Schreibkanaele"
```

---

## Task 9: Das Fenster und der Klickpfad

Ohne diese Aufgabe ist alles Vorige unerreichbar — genau der Fall, den Handover §4 viermal aufzählt.

**Files:**
- Modify: `src/main/window-manager.ts`
- Modify: `src/main/ipc-handlers.ts`
- Modify: `electron.vite.config.ts`
- Create: `src/renderer/windows/settings-window.html`
- Modify: `src/renderer/windows/project-window.tsx`

**Interfaces:**
- Consumes: `AppServices` aus `window-manager.ts`; `registerSettingsHandlers` aus Aufgabe 8; `WINDOW_OPEN_SETTINGS` aus Aufgabe 8
- Produces: `function createSettingsWindow(services: AppServices): BrowserWindow`

Diese Aufgabe hängt die Handler aus Aufgabe 8 ein — dort wurden sie nur geschrieben, hier werden sie erreichbar. Beides zusammen, damit kein Commit einen Baum hinterlässt, der nicht übersetzt.

- [ ] **Step 1: `createSettingsWindow` schreiben**

An `src/main/window-manager.ts` anhängen:

```ts
/**
 * Creates the Settings Window — the third window.
 *
 * Opens only on explicit user action via window:open-settings. The project window opens on
 * start and carries the button, so the path is reachable from a cold start — which is the
 * point: a surface nobody can get to is a surface that does not exist.
 */
export function createSettingsWindow(_services: AppServices): BrowserWindow {
  const win = new BrowserWindow({
    width: 1000,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    show: false,
    backgroundColor: '#0d0d0d',
    webPreferences: {
      // Security baseline — NON-NEGOTIABLE (CK-NFR-004, CK-INF-022)
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, '../preload/index.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })

  win.once('ready-to-show', () => {
    win.show()
  })

  const url = process.env.ELECTRON_RENDERER_URL
  if (url) {
    // electron-vite dev: same subdirectory-then-root fallback as the project window
    win.loadURL(`${url}/windows/settings-window.html`).catch(() => {
      console.warn('[window-manager] /windows/ path failed, trying root-level')
      win.loadURL(`${url}/settings-window.html`).catch((err: Error) =>
        console.error('[window-manager] settings-window load failed:', err.message)
      )
    })
  } else {
    win.loadFile(join(__dirname, '../renderer/windows/settings-window.html'))
  }

  return win
}
```

- [ ] **Step 1b: Die Handler aus Aufgabe 8 einhängen**

In `src/main/ipc-handlers.ts`:

Imports ergänzen:
```ts
import { registerSettingsHandlers } from './settings/handlers'
import { createSettingsWindow } from './window-manager'
import { WINDOW_OPEN_SETTINGS } from '../shared/ipc-channels'
```
(`createSettingsWindow` gehört zu der bereits vorhandenen Importzeile aus `./window-manager` — dort ergänzen statt eine zweite anzulegen. `WINDOW_OPEN_SETTINGS` ebenso in die bestehende Kanal-Importliste.)

Neben `let activeGridWindow` ergänzen:
```ts
// Tracks the active settings window for focus-or-create logic
let activeSettingsWindow: BrowserWindow | null = null
```

In `registerIpcHandlers`, direkt nach dem `WINDOW_OPEN_GRID`-Handler, einfügen:

```ts
  ipcMain.handle(WINDOW_OPEN_SETTINGS, () => {
    if (!activeSettingsWindow || activeSettingsWindow.isDestroyed()) {
      activeSettingsWindow = createSettingsWindow(services)
      activeSettingsWindow.on('closed', () => {
        activeSettingsWindow = null
      })
    } else {
      activeSettingsWindow.focus()
    }
    return { ok: true }
  })

  registerSettingsHandlers()
```

- [ ] **Step 2: Bündel-Einstiegspunkt ergänzen**

In `electron.vite.config.ts`, in `renderer.build.rollupOptions.input`, ergänzen:

```ts
          'settings-window': resolve(__dirname, 'src/renderer/windows/settings-window.html')
```

- [ ] **Step 3: Das HTML-Dokument anlegen**

Create `src/renderer/windows/settings-window.html`. Die Inhaltssicherheitsrichtlinie ist wörtlich die des Projektfensters — sie verbietet fremde Skripte und ist Teil der Sicherheitsgrundlage, nicht Formsache. Einziger Unterschied zum Projektfenster: `overflow` bleibt zugelassen, weil die Reiter scrollen müssen.

```html
<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>cipher keel — Einstellungen</title>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      html,
      body {
        width: 100%;
        height: 100%;
        background: #0d0d0d;
        color: #e0e0e0;
        font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
        font-size: 13px;
        overflow: hidden;
        user-select: none;
      }

      #app {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
      }

      /* The settings tabs scroll; inputs need selectable text. */
      input,
      select,
      textarea {
        user-select: text;
        font-family: inherit;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./settings-window.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Den Knopf ins Projektfenster setzen**

In `src/renderer/windows/project-window.tsx`:

Nach `handleOpenGrid` einfügen:
```ts
  const handleOpenSettings = useCallback(async () => {
    try {
      await api().invoke('window:open-settings')
    } catch (err) {
      console.error('[project-window] window:open-settings failed:', err)
    }
  }, [])
```

Im Kopfbereich, **nach** dem bedingten Grid-Knopf, einfügen — ohne Bedingung, weil die Modellkonfiguration nicht projektgebunden ist:
```tsx
        <button
          style={styles.settingsBtn}
          onClick={handleOpenSettings}
          title="Einstellungen oeffnen — Modelle, Zuordnungen, Startparameter"
        >
          Einstellungen
        </button>
```

In `styles` ergänzen:
```ts
  settingsBtn: {
    // marginLeft only when the grid button is absent; it carries its own marginLeft:'auto'
    marginLeft: 8,
    padding: '4px 10px',
    background: '#1a1a1a',
    color: '#ddd',
    border: '1px solid #333',
    borderRadius: 3,
    cursor: 'pointer' as const,
    fontSize: 12,
  },
```

Damit der Knopf auch ohne Grid-Knopf rechts steht, `styles.gridBtn.marginLeft` unverändert lassen und in `settingsBtn` ergänzen: den Knopf in einen Container mit `marginLeft: 'auto'` setzen. Konkret den Kopfbereich so umbauen, dass beide Knöpfe in einem `<div style={styles.kopfKnoepfe}>` liegen:

```tsx
        <div style={styles.kopfKnoepfe}>
          {view === 'project' && (
            <button
              style={styles.gridBtn}
              onClick={handleOpenGrid}
              title="Grid-Fenster mit den Sessions dieses Projekts oeffnen"
            >
              Grid oeffnen
            </button>
          )}
          <button
            style={styles.settingsBtn}
            onClick={handleOpenSettings}
            title="Einstellungen oeffnen — Modelle, Zuordnungen, Startparameter"
          >
            Einstellungen
          </button>
        </div>
```

mit
```ts
  kopfKnoepfe: {
    marginLeft: 'auto' as const,
    display: 'flex' as const,
    gap: 8,
  },
```
und `styles.gridBtn.marginLeft` von `'auto'` auf `0` ändern.

- [ ] **Step 5: Typecheck und Bündelbau**

```bash
npm run typecheck > /tmp/tc.log 2>&1; echo "EXIT=$?"; tail -20 /tmp/tc.log
npm run build > /tmp/b.log 2>&1; echo "EXIT=$?"; tail -20 /tmp/b.log
ls dist/renderer/windows/
```
Erwartet: Typecheck EXIT=0 (Aufgabe 8s offenes Ende ist geschlossen), Build EXIT=0, und `settings-window.html` liegt im Ausgabeverzeichnis. Fehlt sie, ist Schritt 2 nicht angekommen.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add src/main/window-manager.ts electron.vite.config.ts src/renderer/windows/ 
git commit -m "feat(ui): Settings-Fenster und der Klickpfad aus dem Projektfenster"
```

---

## Task 10: Der Renderer — Rahmen, Modelle-Reiter, Geheimnisfeld

**Files:**
- Create: `src/renderer/windows/settings-window.tsx`
- Create: `src/renderer/components/settings/WirkungVermerk.tsx`
- Create: `src/renderer/components/settings/Warnliste.tsx`
- Create: `src/renderer/components/settings/GeheimnisFeld.tsx`
- Create: `src/renderer/components/settings/ModelleReiter.tsx`

**Interfaces:**
- Consumes: alle Typen aus `src/shared/settings-types.ts`, die Kanäle aus Aufgabe 8
- Produces (alle als benannte Exporte, kein Default):
  - `function ModelleReiter(props: { ansicht: SettingsAnsicht; schreibe: Schreiber })`
  - `function Warnliste(props: { warnungen: WarnungAnsicht[] })`
  - `function WirkungVermerk(props: { wirkung: Wirkung })`
  - `function GeheimnisFeld(props: { eintrag: EintragAnsicht; schreibe: Schreiber })`
  - wobei `Schreiber = (kanal: string, ...args: unknown[]) => Promise<void>` — die Fehleranzeige liegt beim Rahmen, nicht bei den Reitern, damit es genau eine Fehlerfläche gibt

- [ ] **Step 1: Den Rahmen schreiben**

Create `src/renderer/windows/settings-window.tsx`:

```tsx
/**
 * settings-window.tsx — React root for the settings window.
 *
 * Holds the whole view model in one state. Every write returns the freshly computed view,
 * so this file never reasons about partial state: it replaces what it has.
 *
 * No rule lives here. sperrgrund and warnungen arrive as finished German text.
 */
import { StrictMode, useState, useEffect, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import type { SettingsAnsicht, SettingsAntwort } from '../../shared/settings-types'
import { ModelleReiter } from '../components/settings/ModelleReiter'

const api = () => window.cipherKeel

// The other two tabs arrive in the next task; this list is the only place to extend.
type ReiterId = 'modelle'

const REITER: { id: ReiterId; titel: string }[] = [
  { id: 'modelle', titel: 'Modelle' },
]

function SettingsApp() {
  const [ansicht, setAnsicht] = useState<SettingsAnsicht | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [reiter, setReiter] = useState<ReiterId>('modelle')

  const laden = useCallback(async () => {
    try {
      setAnsicht((await api().invoke('settings:ansicht')) as SettingsAnsicht)
      setFehler(null)
    } catch (err) {
      setFehler(`Die Einstellungen liessen sich nicht laden: ${String(err)}`)
    }
  }, [])

  useEffect(() => {
    void laden()
  }, [laden])

  const schreibe = useCallback(async (kanal: string, ...args: unknown[]) => {
    try {
      const antwort = (await api().invoke(kanal as never, ...args)) as SettingsAntwort
      if (antwort.ok) {
        setAnsicht(antwort.ansicht)
        setFehler(null)
      } else {
        setFehler(antwort.fehler)
      }
    } catch (err) {
      setFehler(String(err))
    }
  }, [])

  if (!ansicht) {
    return (
      <div style={styles.laden}>
        <span style={{ color: '#555' }}>{fehler ?? 'Lade Einstellungen…'}</span>
      </div>
    )
  }

  return (
    <div style={styles.root}>
      <div style={styles.kopf}>
        <span style={styles.logo}>cipher keel</span>
        <span style={styles.untertitel}>Einstellungen</span>
      </div>
      <div style={styles.reiterleiste}>
        {REITER.map(r => (
          <button
            key={r.id}
            style={{ ...styles.reiter, ...(reiter === r.id ? styles.reiterAktiv : {}) }}
            onClick={() => setReiter(r.id)}
          >
            {r.titel}
          </button>
        ))}
      </div>
      {fehler && <div style={styles.fehler}>{fehler}</div>}
      <div style={styles.inhalt}>
        {reiter === 'modelle' && <ModelleReiter ansicht={ansicht} schreibe={schreibe} />}
      </div>
    </div>
  )
}

const styles = {
  root: { display: 'flex' as const, flexDirection: 'column' as const, height: '100%', background: '#0d0d0d' },
  kopf: { display: 'flex' as const, alignItems: 'baseline' as const, gap: 12, padding: '16px 16px 12px' },
  logo: { color: '#e0e0e0', fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 600 },
  untertitel: { color: '#555', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 },
  reiterleiste: { display: 'flex' as const, gap: 4, padding: '0 16px', borderBottom: '1px solid #1e1e1e' },
  reiter: {
    background: 'none', border: 'none', borderBottom: '2px solid transparent',
    color: '#888', padding: '8px 12px', cursor: 'pointer' as const, fontSize: 13,
  },
  reiterAktiv: { color: '#e0e0e0', borderBottom: '2px solid #4a9eff' },
  fehler: {
    margin: '12px 16px 0', padding: '8px 12px', background: '#2a1416',
    border: '1px solid #5a2a2a', borderRadius: 3, color: '#ff9a9a', fontSize: 12,
  },
  inhalt: { flex: 1, overflowY: 'auto' as const, padding: 16 },
  laden: {
    display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    height: '100%', background: '#0d0d0d', fontFamily: "'JetBrains Mono', monospace",
  },
}

const root = document.getElementById('app')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <SettingsApp />
    </StrictMode>
  )
}
```

- [ ] **Step 2: Die drei kleinen Komponenten schreiben**

Create `src/renderer/components/settings/WirkungVermerk.tsx`:

```tsx
/**
 * WirkungVermerk — says when a change takes effect, next to the field it belongs to.
 *
 * A page that makes every field look the same lies about three different lifetimes: the
 * model registry is read on every resolution, tiers at session launch, voice.enabled at
 * service start. That is the silent-failure shape the project treats as most expensive.
 */
import type { Wirkung } from '../../../shared/settings-types'

const TEXT: Record<Wirkung, string> = {
  'sofort': 'wirkt sofort',
  'naechste-session': 'gilt ab der naechsten Session',
  'neustart': 'braucht einen Neustart der App',
}

export function WirkungVermerk({ wirkung }: { wirkung: Wirkung }) {
  return <span style={style}>{TEXT[wirkung]}</span>
}

const style = {
  color: '#666',
  fontSize: 11,
  fontStyle: 'italic' as const,
  marginLeft: 8,
}
```

Create `src/renderer/components/settings/Warnliste.tsx`:

```tsx
/**
 * Warnliste — renders warnings that arrive as finished text.
 *
 * The codes are used only to key the list, never to decide what a warning means: the rule
 * that produced it lives in src/main/model/eignung.ts and is not restated here.
 */
import type { WarnungAnsicht } from '../../../shared/settings-types'

export function Warnliste({ warnungen }: { warnungen: WarnungAnsicht[] }) {
  if (warnungen.length === 0) return null
  return (
    <ul style={styles.liste}>
      {warnungen.map(w => (
        <li key={w.code} style={styles.zeile}>{w.text}</li>
      ))}
    </ul>
  )
}

const styles = {
  liste: { margin: '6px 0 0', padding: '0 0 0 18px', listStyle: 'square' as const },
  zeile: { color: '#d9b25f', fontSize: 12, marginBottom: 3 },
}
```

Create `src/renderer/components/settings/GeheimnisFeld.tsx`:

```tsx
/**
 * GeheimnisFeld — write-only key entry.
 *
 * The secret is never read back: the view model carries a status, never a value, and this
 * component clears its input as soon as the write is dispatched. Nothing here can display
 * a key, because nothing here ever receives one.
 */
import { useState } from 'react'
import type { EintragAnsicht } from '../../../shared/settings-types'

const STATUS_TEXT: Record<string, string> = {
  schluesselbund: 'hinterlegt',
  umgebung: 'aus der Umgebung',
  fehlt: 'fehlt',
  unbekannt: 'unbekannt',
}

const STATUS_FARBE: Record<string, string> = {
  schluesselbund: '#6bbf6b',
  umgebung: '#d9b25f',
  fehlt: '#ff9a9a',
  unbekannt: '#888',
}

export function GeheimnisFeld({
  eintrag,
  schreibe,
}: {
  eintrag: EintragAnsicht
  schreibe: (kanal: string, ...args: unknown[]) => Promise<void>
}) {
  const [wert, setWert] = useState('')
  if (!eintrag.keyRef || !eintrag.geheimnisStatus) return null

  const speichern = async () => {
    const zuSchreiben = wert
    setWert('')
    await schreibe('settings:geheimnis-setzen', eintrag.keyRef, zuSchreiben)
  }

  return (
    <div style={styles.rahmen}>
      <div style={styles.kopf}>
        <span style={styles.marke}>Schluessel „{eintrag.keyRef}"</span>
        <span style={{ ...styles.status, color: STATUS_FARBE[eintrag.geheimnisStatus] }}>
          {STATUS_TEXT[eintrag.geheimnisStatus]}
        </span>
      </div>
      <div style={styles.hinweis}>{eintrag.geheimnisHinweis}</div>
      <div style={styles.zeile}>
        <input
          type="password"
          value={wert}
          placeholder="Neuen Schluessel eintragen"
          onChange={e => setWert(e.target.value)}
          style={styles.eingabe}
        />
        <button onClick={speichern} disabled={!wert} style={styles.knopf}>
          Im Schluesselbund speichern
        </button>
        {eintrag.geheimnisStatus === 'schluesselbund' && (
          <button
            onClick={() => schreibe('settings:geheimnis-loeschen', eintrag.keyRef)}
            style={styles.knopf}
          >
            Loeschen
          </button>
        )}
      </div>
    </div>
  )
}

const styles = {
  rahmen: { marginTop: 8, padding: 8, background: '#131313', border: '1px solid #222', borderRadius: 3 },
  kopf: { display: 'flex' as const, gap: 8, alignItems: 'baseline' as const },
  marke: { color: '#bbb', fontSize: 12 },
  status: { fontSize: 11, fontWeight: 600 },
  hinweis: { color: '#777', fontSize: 11, margin: '4px 0 6px' },
  zeile: { display: 'flex' as const, gap: 6 },
  eingabe: {
    flex: 1, background: '#0d0d0d', border: '1px solid #333', borderRadius: 3,
    color: '#ddd', padding: '4px 6px', fontSize: 12,
  },
  knopf: {
    background: '#1a1a1a', color: '#ddd', border: '1px solid #333',
    borderRadius: 3, padding: '4px 10px', cursor: 'pointer' as const, fontSize: 12,
  },
}
```

- [ ] **Step 3: Den Modelle-Reiter schreiben**

Create `src/renderer/components/settings/ModelleReiter.tsx`:

```tsx
/**
 * ModelleReiter — entries, the five assignments, fallbacks, secrets.
 *
 * Every locked option and every warning is text the main process computed. This file
 * decides layout, never eligibility.
 */
import type { SettingsAnsicht } from '../../../shared/settings-types'
import { Warnliste } from './Warnliste'
import { WirkungVermerk } from './WirkungVermerk'
import { GeheimnisFeld } from './GeheimnisFeld'

const ART_TITEL: Record<string, string> = {
  'cli-harness': 'Ueber ein CLI-Harness',
  'local-http': 'Ueber HTTP im eigenen Zugriff',
  'api': 'Ueber einen fremden Anbieter',
}

const OERTLICHKEIT_TEXT: Record<string, string> = {
  'lokal': 'lokal',
  'eigenes-netz': 'eigenes Netz',
  'fremdes-netz': 'fremdes Netz',
}

export function ModelleReiter({
  ansicht,
  schreibe,
}: {
  ansicht: SettingsAnsicht
  schreibe: (kanal: string, ...args: unknown[]) => Promise<void>
}) {
  const arten = ['cli-harness', 'local-http', 'api'] as const

  return (
    <div>
      {ansicht.uebersprungen.length > 0 && (
        <div style={styles.uebersprungen}>
          <strong>Uebersprungene Eintraege aus der Konfiguration</strong>
          {ansicht.uebersprungen.map((u, i) => (
            <div key={i} style={styles.uebersprungenZeile}>
              {u.beschreibung} — {u.fehler}
            </div>
          ))}
        </div>
      )}

      <h2 style={styles.ueberschrift}>Zuordnungen</h2>
      {ansicht.slots.map(slot => (
        <div key={slot.id} style={styles.slot}>
          <div style={styles.slotKopf}>
            <span style={styles.slotName}>{slot.beschriftung}</span>
            <WirkungVermerk wirkung={slot.wirkung} />
          </div>
          <select
            value={slot.gewaehlt}
            onChange={e => schreibe('settings:zuordnung-setzen', slot.id, e.target.value)}
            style={styles.auswahl}
          >
            <option value="">— keine Zuordnung —</option>
            {slot.optionen.map(o => (
              <option key={o.eintragId} value={o.eintragId} disabled={o.sperrgrund !== null}>
                {o.name}{o.sperrgrund ? ' — gesperrt' : ''}
              </option>
            ))}
          </select>
          {slot.gewaehlt === '' && <div style={styles.rueckfall}>{slot.rueckfallText}</div>}
          {slot.gewaehltHinweis && <div style={styles.sperrgrund}>{slot.gewaehltHinweis}</div>}
          <Warnliste warnungen={slot.warnungen} />
          {slot.id.startsWith('tier:') && (
            <div style={styles.rueckfallFeld}>
              <label style={styles.marke}>Rueckfall-Handle</label>
              <input
                defaultValue={ansicht.modellTiers[slot.id.slice(5) as 'light' | 'standard' | 'heavy']}
                onBlur={e =>
                  schreibe('settings:einfachfeld-setzen', `modelltier:${slot.id.slice(5)}`, e.target.value)
                }
                style={styles.eingabe}
              />
            </div>
          )}
        </div>
      ))}

      <h2 style={styles.ueberschrift}>Eintraege</h2>
      {arten.map(art => {
        const gruppe = ansicht.eintraege.filter(e => e.art === art)
        if (gruppe.length === 0) return null
        return (
          <div key={art}>
            <h3 style={styles.gruppe}>{ART_TITEL[art]}</h3>
            {gruppe.map(e => (
              <div key={e.id} style={styles.eintrag}>
                <div style={styles.eintragKopf}>
                  <span style={styles.eintragName}>{e.name}</span>
                  <span style={styles.marke}>{OERTLICHKEIT_TEXT[e.oertlichkeit]}</span>
                  {e.faehigkeitenHerkunft && (
                    <span style={styles.herkunft}>Faehigkeiten: {e.faehigkeitenHerkunft}</span>
                  )}
                </div>
                <div style={styles.erklaertext}>{e.erklaertext}</div>
                <div style={styles.empfehlung}>{e.empfehlung}</div>
                <GeheimnisFeld eintrag={e} schreibe={schreibe} />
                {e.loeschbar && (
                  <button
                    onClick={() => schreibe('settings:eintrag-loeschen', e.id)}
                    style={styles.loeschen}
                  >
                    Eintrag loeschen
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

const styles = {
  ueberschrift: { color: '#e0e0e0', fontSize: 14, margin: '0 0 12px' },
  gruppe: { color: '#888', fontSize: 12, margin: '16px 0 8px', fontWeight: 500 as const },
  slot: { marginBottom: 16, padding: 10, background: '#111', border: '1px solid #1e1e1e', borderRadius: 3 },
  slotKopf: { display: 'flex' as const, alignItems: 'baseline' as const, marginBottom: 6 },
  slotName: { color: '#ddd', fontSize: 13 },
  auswahl: {
    width: '100%', background: '#0d0d0d', border: '1px solid #333',
    borderRadius: 3, color: '#ddd', padding: '4px 6px', fontSize: 12,
  },
  rueckfall: { color: '#777', fontSize: 11, marginTop: 6 },
  sperrgrund: { color: '#ff9a9a', fontSize: 12, marginTop: 6 },
  rueckfallFeld: { marginTop: 8, display: 'flex' as const, gap: 6, alignItems: 'center' as const },
  marke: { color: '#777', fontSize: 11 },
  herkunft: { color: '#d9b25f', fontSize: 11 },
  eingabe: {
    background: '#0d0d0d', border: '1px solid #333', borderRadius: 3,
    color: '#ddd', padding: '3px 6px', fontSize: 12, width: 160,
  },
  eintrag: { marginBottom: 10, padding: 10, background: '#111', border: '1px solid #1e1e1e', borderRadius: 3 },
  eintragKopf: { display: 'flex' as const, gap: 10, alignItems: 'baseline' as const },
  eintragName: { color: '#ddd', fontSize: 13, fontWeight: 500 as const },
  erklaertext: { color: '#999', fontSize: 12, marginTop: 4 },
  empfehlung: { color: '#6a8fa8', fontSize: 12, marginTop: 3 },
  loeschen: {
    marginTop: 8, background: '#1a1a1a', color: '#ff9a9a', border: '1px solid #40292a',
    borderRadius: 3, padding: '3px 8px', cursor: 'pointer' as const, fontSize: 11,
  },
  uebersprungen: {
    marginBottom: 16, padding: 10, background: '#2a1416',
    border: '1px solid #5a2a2a', borderRadius: 3, color: '#ff9a9a', fontSize: 12,
  },
  uebersprungenZeile: { marginTop: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 },
}
```

- [ ] **Step 4: Typecheck, Lint, Build**

```bash
npm run typecheck > /tmp/tc.log 2>&1; echo "TYPECHECK=$?"; tail -20 /tmp/tc.log
npm run lint > /tmp/l.log 2>&1; echo "LINT=$?"; tail -20 /tmp/l.log
npm run build > /tmp/b.log 2>&1; echo "BUILD=$?"; tail -10 /tmp/b.log
```
Erwartet: alle drei EXIT=0. Das Fenster ist an dieser Stelle mit einem einzigen Reiter lauffähig — die anderen beiden kommen in Aufgabe 11 dazu.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/renderer/windows/settings-window.tsx src/renderer/components/settings/
git commit -m "feat(ui): Settings-Rahmen, Modelle-Reiter, schreibendes Geheimnisfeld"
```

---

## Task 11: Die beiden übrigen Reiter

**Files:**
- Create: `src/renderer/components/settings/CliStartReiter.tsx`
- Create: `src/renderer/components/settings/SprachausgabeReiter.tsx`

**Interfaces:**
- Consumes: `SettingsAnsicht` aus `src/shared/settings-types.ts`, `WirkungVermerk` aus Aufgabe 10
- Produces: `CliStartReiter`, `SprachausgabeReiter`, beide mit `{ ansicht, schreibe }`

- [ ] **Step 1: Den CLI-Start-Reiter schreiben**

Create `src/renderer/components/settings/CliStartReiter.tsx`:

```tsx
/**
 * CliStartReiter — free-text start parameters per adapter.
 *
 * The adapter list comes from AdapterRegistry.listIds() via the view model, so a new CLI
 * adapter appears here without this file knowing it exists. The warning about a duplicated
 * parameter is computed in main from the adapter's own appGesteuerteParameter.
 */
import type { SettingsAnsicht } from '../../../shared/settings-types'
import { WirkungVermerk } from './WirkungVermerk'
import { Warnliste } from './Warnliste'

export function CliStartReiter({
  ansicht,
  schreibe,
}: {
  ansicht: SettingsAnsicht
  schreibe: (kanal: string, ...args: unknown[]) => Promise<void>
}) {
  return (
    <div>
      <h2 style={styles.ueberschrift}>Startparameter je CLI</h2>
      <p style={styles.erklaerung}>
        Diese Parameter werden dem Startbefehl vorangestellt. Die App haengt ihre eigenen
        danach an — sie gehoeren nicht hierher.
      </p>
      {ansicht.adapter.map(a => (
        <div key={a.id} style={styles.block}>
          <div style={styles.kopf}>
            <span style={styles.name}>{a.name}</span>
            <span style={styles.kennung}>{a.id}</span>
            <WirkungVermerk wirkung="naechste-session" />
          </div>
          <input
            defaultValue={a.startArgs}
            placeholder="z. B. --dangerously-skip-permissions"
            onBlur={e => schreibe('settings:startargs-setzen', a.id, e.target.value)}
            style={styles.eingabe}
          />
          <Warnliste warnungen={a.warnungen} />
          {a.appGesteuerteParameter.length > 0 && (
            <div style={styles.appGesteuert}>
              Von der App selbst gesetzt: {a.appGesteuerteParameter.join(' · ')}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

const styles = {
  ueberschrift: { color: '#e0e0e0', fontSize: 14, margin: '0 0 8px' },
  erklaerung: { color: '#888', fontSize: 12, margin: '0 0 16px' },
  block: { marginBottom: 14, padding: 10, background: '#111', border: '1px solid #1e1e1e', borderRadius: 3 },
  kopf: { display: 'flex' as const, gap: 10, alignItems: 'baseline' as const, marginBottom: 6 },
  name: { color: '#ddd', fontSize: 13 },
  kennung: { color: '#666', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" },
  eingabe: {
    width: '100%', background: '#0d0d0d', border: '1px solid #333', borderRadius: 3,
    color: '#ddd', padding: '4px 6px', fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
  },
  appGesteuert: { color: '#666', fontSize: 11, marginTop: 6, fontFamily: "'JetBrains Mono', monospace" },
}
```

- [ ] **Step 2: Den Sprachausgabe-Reiter schreiben**

Create `src/renderer/components/settings/SprachausgabeReiter.tsx`:

```tsx
/**
 * SprachausgabeReiter — the two voice fields, with their different lifetimes.
 *
 * `enabled` is read once at service start (main.ts), `piperVoice` on every utterance
 * (tts-piper.ts). Showing them side by side without saying so would be a lie by layout.
 */
import type { SettingsAnsicht } from '../../../shared/settings-types'
import { WirkungVermerk } from './WirkungVermerk'

export function SprachausgabeReiter({
  ansicht,
  schreibe,
}: {
  ansicht: SettingsAnsicht
  schreibe: (kanal: string, ...args: unknown[]) => Promise<void>
}) {
  return (
    <div>
      <h2 style={styles.ueberschrift}>Sprachausgabe</h2>

      <div style={styles.block}>
        <label style={styles.zeile}>
          <input
            type="checkbox"
            checked={ansicht.sprachausgabe.aktiv}
            onChange={e => schreibe('settings:einfachfeld-setzen', 'sprachausgabe:aktiv', e.target.checked)}
          />
          <span style={styles.name}>Sprachausgabe aktiv</span>
          <WirkungVermerk wirkung="neustart" />
        </label>
      </div>

      <div style={styles.block}>
        <div style={styles.kopf}>
          <span style={styles.name}>Stimme</span>
          <WirkungVermerk wirkung="sofort" />
        </div>
        <input
          defaultValue={ansicht.sprachausgabe.stimme}
          placeholder="de_DE-cipher_adult-medium"
          onBlur={e => schreibe('settings:einfachfeld-setzen', 'sprachausgabe:stimme', e.target.value)}
          style={styles.eingabe}
        />
      </div>
    </div>
  )
}

const styles = {
  ueberschrift: { color: '#e0e0e0', fontSize: 14, margin: '0 0 12px' },
  block: { marginBottom: 14, padding: 10, background: '#111', border: '1px solid #1e1e1e', borderRadius: 3 },
  kopf: { display: 'flex' as const, alignItems: 'baseline' as const, marginBottom: 6 },
  zeile: { display: 'flex' as const, alignItems: 'center' as const, gap: 8, cursor: 'pointer' as const },
  name: { color: '#ddd', fontSize: 13 },
  eingabe: {
    width: '100%', background: '#0d0d0d', border: '1px solid #333', borderRadius: 3,
    color: '#ddd', padding: '4px 6px', fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
  },
}
```

- [ ] **Step 3: Die beiden Reiter in den Rahmen aufnehmen**

In `src/renderer/windows/settings-window.tsx`:

Die Importe ergänzen:
```tsx
import { CliStartReiter } from '../components/settings/CliStartReiter'
import { SprachausgabeReiter } from '../components/settings/SprachausgabeReiter'
```

Den Kommentar und die beiden Deklarationen ersetzen. Aus
```tsx
// The other two tabs arrive in the next task; this list is the only place to extend.
type ReiterId = 'modelle'

const REITER: { id: ReiterId; titel: string }[] = [
  { id: 'modelle', titel: 'Modelle' },
]
```
wird
```tsx
type ReiterId = 'modelle' | 'cli' | 'sprache'

const REITER: { id: ReiterId; titel: string }[] = [
  { id: 'modelle', titel: 'Modelle' },
  { id: 'cli', titel: 'CLI-Start' },
  { id: 'sprache', titel: 'Sprachausgabe' },
]
```

Und im Inhaltsbereich die beiden Zeilen ergänzen:
```tsx
        {reiter === 'cli' && <CliStartReiter ansicht={ansicht} schreibe={schreibe} />}
        {reiter === 'sprache' && <SprachausgabeReiter ansicht={ansicht} schreibe={schreibe} />}
```

- [ ] **Step 4: Die volle Prüfkette**

```bash
npm run typecheck > /tmp/tc.log 2>&1; echo "TYPECHECK=$?"; tail -20 /tmp/tc.log
npm run lint > /tmp/l.log 2>&1; echo "LINT=$?"; tail -20 /tmp/l.log
npm test > /tmp/t.log 2>&1; echo "TEST=$?"; tail -20 /tmp/t.log
npm run build > /tmp/b.log 2>&1; echo "BUILD=$?"; tail -10 /tmp/b.log
npm run verify:bundle > /tmp/v.log 2>&1; echo "BUNDLE=$?"; tail -10 /tmp/v.log
```
Erwartet: alle fünf EXIT=0.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/renderer/components/settings/ src/renderer/windows/settings-window.tsx
git commit -m "feat(ui): CLI-Start- und Sprachausgabe-Reiter"
```

---

## Task 12: Das Eintragsformular

Spec §3 verlangt Einträge **anlegen und bearbeiten**, nicht nur zuordnen und löschen. Ohne diese Aufgabe bleibt ein eigener Endpunkt weiterhin nur per Datei-Edit erreichbar, und `settings:eintrag-speichern` aus Aufgabe 8 hätte keinen Aufrufer — der §4-Fehler in neuem Gewand.

Die Fähigkeitszeile ist **nicht** Teil des Formulars (Spec §5.4): Sie ist das Revier des Kanarienauftrags, und `normaliseEintrag` lehnt `quelle: 'gemessen'` ohne Messdaten ohnehin ab.

**Files:**
- Create: `src/renderer/components/settings/EintragFormular.tsx`
- Modify: `src/renderer/components/settings/ModelleReiter.tsx`

**Interfaces:**
- Consumes: `EintragAnsicht`, `Schreiber` aus Aufgabe 10; Kanal `settings:eintrag-speichern` aus Aufgabe 8
- Produces: `function EintragFormular(props: { vorlage: EintragAnsicht | null; schreibe: Schreiber; onFertig: () => void })` — `vorlage: null` heißt „neuer Eintrag"

- [ ] **Step 1: Das Formular schreiben**

Create `src/renderer/components/settings/EintragFormular.tsx`:

```tsx
/**
 * EintragFormular — create or edit one registry entry.
 *
 * No capability row here: that is the canary job's territory, and a hand-filled row would
 * carry `vermutet` anyway, which is exactly what the fallback already gives.
 *
 * Validation is not repeated on this side. The form assembles a raw object and lets
 * normaliseEintrag in main reject it — that function's German messages are precise, and a
 * second validator here would be a second truth.
 */
import { useState } from 'react'
import type { EintragAnsicht } from '../../../shared/settings-types'

type Art = 'cli-harness' | 'local-http' | 'api'
type Oertlichkeit = 'lokal' | 'eigenes-netz' | 'fremdes-netz'
type Schreiber = (kanal: string, ...args: unknown[]) => Promise<void>

interface Felder {
  id: string
  name: string
  art: Art
  oertlichkeit: Oertlichkeit
  erklaertext: string
  empfehlung: string
  cli: string
  handle: string
  host: string
  port: string
  model: string
  baseUrl: string
  keyRef: string
}

const LEER: Felder = {
  id: '', name: '', art: 'local-http', oertlichkeit: 'eigenes-netz',
  erklaertext: '', empfehlung: '',
  cli: 'claude', handle: '', host: '', port: '11434', model: '', baseUrl: '', keyRef: '',
}

export function EintragFormular({
  vorlage,
  schreibe,
  onFertig,
}: {
  vorlage: EintragAnsicht | null
  schreibe: Schreiber
  onFertig: () => void
}) {
  const [f, setF] = useState<Felder>(() =>
    vorlage
      ? {
          ...LEER,
          id: vorlage.id,
          name: vorlage.name,
          art: vorlage.art,
          oertlichkeit: vorlage.oertlichkeit,
          erklaertext: vorlage.erklaertext,
          empfehlung: vorlage.empfehlung,
          keyRef: vorlage.keyRef ?? '',
        }
      : LEER
  )

  const setze = (k: keyof Felder) => (e: { target: { value: string } }) =>
    setF(alt => ({ ...alt, [k]: e.target.value }))

  const erreichbarkeit = (): unknown => {
    if (f.art === 'cli-harness') return { art: 'cli-harness', cli: f.cli, handle: f.handle }
    if (f.art === 'api') {
      return { art: 'api', baseUrl: f.baseUrl, model: f.model, keyRef: f.keyRef }
    }
    return { art: 'local-http', host: f.host, port: Number(f.port), model: f.model }
  }

  const speichern = async () => {
    await schreibe('settings:eintrag-speichern', {
      id: f.id,
      name: f.name,
      art: f.art,
      erreichbarkeit: erreichbarkeit(),
      oertlichkeit: f.oertlichkeit,
      erklaertext: f.erklaertext,
      empfehlung: f.empfehlung,
    })
    onFertig()
  }

  const istUeberschreibung = vorlage !== null && !vorlage.loeschbar

  return (
    <div style={styles.rahmen}>
      <h3 style={styles.titel}>{vorlage ? `Eintrag „${vorlage.name}" bearbeiten` : 'Neuer Eintrag'}</h3>

      {istUeberschreibung && (
        <div style={styles.ueberschreibung}>
          Dies ist ein gebuendelter Eintrag. Gespeichert wird eine eigene Fassung unter
          derselben Kennung, die den gebuendelten ueberschreibt — der gebuendelte bleibt
          unangetastet und kehrt zurueck, sobald die eigene Fassung geloescht wird.
        </div>
      )}

      <label style={styles.marke}>Kennung</label>
      <input value={f.id} onChange={setze('id')} disabled={vorlage !== null} style={styles.eingabe} />

      <label style={styles.marke}>Name</label>
      <input value={f.name} onChange={setze('name')} style={styles.eingabe} />

      <label style={styles.marke}>Anbieterart</label>
      <select value={f.art} onChange={setze('art')} style={styles.eingabe}>
        <option value="cli-harness">CLI-Harness</option>
        <option value="local-http">HTTP im eigenen Zugriff</option>
        <option value="api">Fremder Anbieter</option>
      </select>

      <label style={styles.marke}>Oertlichkeit</label>
      <select value={f.oertlichkeit} onChange={setze('oertlichkeit')} style={styles.eingabe}>
        <option value="lokal">lokal — verlaesst diese Maschine nicht</option>
        <option value="eigenes-netz">eigenes Netz</option>
        <option value="fremdes-netz">fremdes Netz</option>
      </select>

      {f.art === 'cli-harness' && (
        <>
          <label style={styles.marke}>CLI-Befehl</label>
          <input value={f.cli} onChange={setze('cli')} style={styles.eingabe} />
          <label style={styles.marke}>Modell-Handle</label>
          <input value={f.handle} onChange={setze('handle')} placeholder="opus" style={styles.eingabe} />
        </>
      )}

      {f.art === 'local-http' && (
        <>
          <label style={styles.marke}>Host</label>
          <input value={f.host} onChange={setze('host')} placeholder="127.0.0.1" style={styles.eingabe} />
          <label style={styles.marke}>Port</label>
          <input value={f.port} onChange={setze('port')} style={styles.eingabe} />
          <label style={styles.marke}>Modell</label>
          <input value={f.model} onChange={setze('model')} placeholder="gemma4:26b" style={styles.eingabe} />
        </>
      )}

      {f.art === 'api' && (
        <>
          <label style={styles.marke}>Basis-URL</label>
          <input value={f.baseUrl} onChange={setze('baseUrl')} placeholder="https://openrouter.ai/api/v1" style={styles.eingabe} />
          <label style={styles.marke}>Modell</label>
          <input value={f.model} onChange={setze('model')} style={styles.eingabe} />
          <label style={styles.marke}>Schluesselname</label>
          <input value={f.keyRef} onChange={setze('keyRef')} placeholder="openrouter" style={styles.eingabe} />
          <div style={styles.hinweis}>
            Der Schluessel selbst wird hier nicht eingetragen. Nach dem Speichern erscheint am
            Eintrag ein Feld, das ihn im Schluesselbund hinterlegt — nie in der Konfigurationsdatei.
          </div>
        </>
      )}

      <label style={styles.marke}>Erklaertext</label>
      <textarea value={f.erklaertext} onChange={setze('erklaertext')} rows={2} style={styles.eingabe} />

      <label style={styles.marke}>Empfehlung</label>
      <textarea value={f.empfehlung} onChange={setze('empfehlung')} rows={2} style={styles.eingabe} />

      <div style={styles.knopfzeile}>
        <button onClick={speichern} style={styles.knopf}>Speichern</button>
        <button onClick={onFertig} style={styles.knopf}>Abbrechen</button>
      </div>
    </div>
  )
}

const styles = {
  rahmen: { marginBottom: 16, padding: 12, background: '#0f1418', border: '1px solid #2a3a44', borderRadius: 3 },
  titel: { color: '#e0e0e0', fontSize: 13, margin: '0 0 10px' },
  marke: { display: 'block' as const, color: '#777', fontSize: 11, margin: '8px 0 3px' },
  eingabe: {
    width: '100%', background: '#0d0d0d', border: '1px solid #333', borderRadius: 3,
    color: '#ddd', padding: '4px 6px', fontSize: 12,
  },
  hinweis: { color: '#6a8fa8', fontSize: 11, marginTop: 6 },
  ueberschreibung: {
    padding: 8, background: '#1a1710', border: '1px solid #3d332a',
    borderRadius: 3, color: '#d9b25f', fontSize: 11, marginBottom: 8,
  },
  knopfzeile: { display: 'flex' as const, gap: 8, marginTop: 12 },
  knopf: {
    background: '#1a1a1a', color: '#ddd', border: '1px solid #333',
    borderRadius: 3, padding: '4px 12px', cursor: 'pointer' as const, fontSize: 12,
  },
}
```

- [ ] **Step 2: Das Formular in den Modelle-Reiter einhängen**

In `src/renderer/components/settings/ModelleReiter.tsx`:

Die Importzeile ergänzen:
```tsx
import { useState } from 'react'
import { EintragFormular } from './EintragFormular'
```

Am Anfang der Komponente, vor `const arten = ...`, einfügen:
```tsx
  // null = kein Formular offen; 'neu' = leeres Formular; sonst die Kennung des Eintrags
  const [formular, setFormular] = useState<string | null>(null)
  const vorlage = formular && formular !== 'neu'
    ? ansicht.eintraege.find(e => e.id === formular) ?? null
    : null
```

Direkt vor `<h2 style={styles.ueberschrift}>Eintraege</h2>` die Zeile ersetzen durch:
```tsx
      <div style={styles.eintraegeKopf}>
        <h2 style={styles.ueberschrift}>Eintraege</h2>
        <button onClick={() => setFormular('neu')} style={styles.neuKnopf}>Neuer Eintrag</button>
      </div>
      {formular && (
        <EintragFormular
          vorlage={vorlage}
          schreibe={schreibe}
          onFertig={() => setFormular(null)}
        />
      )}
```

Im Eintragsblock, neben dem Löschknopf, einen Bearbeitungsknopf ergänzen — er steht bei **jedem** Eintrag, auch bei gebündelten, weil Bearbeiten dort eine eigene Fassung erzeugt:
```tsx
                <div style={styles.eintragKnoepfe}>
                  <button onClick={() => setFormular(e.id)} style={styles.bearbeiten}>
                    Bearbeiten
                  </button>
                  {e.loeschbar && (
                    <button
                      onClick={() => schreibe('settings:eintrag-loeschen', e.id)}
                      style={styles.loeschen}
                    >
                      Eintrag loeschen
                    </button>
                  )}
                </div>
```
Der bisherige alleinstehende Löschknopf entfällt dabei.

In `styles` ergänzen:
```ts
  eintraegeKopf: { display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 12 },
  neuKnopf: {
    background: '#1a1a1a', color: '#ddd', border: '1px solid #333',
    borderRadius: 3, padding: '4px 10px', cursor: 'pointer' as const, fontSize: 12,
  },
  eintragKnoepfe: { display: 'flex' as const, gap: 6, marginTop: 8 },
  bearbeiten: {
    background: '#1a1a1a', color: '#ddd', border: '1px solid #333',
    borderRadius: 3, padding: '3px 8px', cursor: 'pointer' as const, fontSize: 11,
  },
```
und in `styles.ueberschrift` das `margin` auf `0` setzen, weil der Abstand jetzt vom Kopfcontainer kommt.

- [ ] **Step 3: Typecheck, Lint, Build**

```bash
npm run typecheck > /tmp/tc.log 2>&1; echo "TYPECHECK=$?"; tail -20 /tmp/tc.log
npm run lint > /tmp/l.log 2>&1; echo "LINT=$?"; tail -20 /tmp/l.log
npm run build > /tmp/b.log 2>&1; echo "BUILD=$?"; tail -10 /tmp/b.log
```
Erwartet: alle drei EXIT=0.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add src/renderer/components/settings/
git commit -m "feat(ui): Eintragsformular -- eigene Endpunkte ohne Datei-Edit"
```

---

## Task 13: Messprotokoll in der laufenden App

Kein Test dieses Repos erreicht einen `ipcMain`-Handler. Dies ist die eigentliche Abnahme, und jede der drei Nacht-Strecken hat hier etwas gefunden, das alle Tests überlebt hatte.

**Files:**
- Modify: `docs/superpowers/plans/2026-08-17-settings-fenster.md` (dieses Dokument, Abschnitt „Messprotokoll" am Ende)

**Interfaces:**
- Consumes: die fertige App
- Produces: das wörtliche Messprotokoll im Plan

- [ ] **Step 1: Sicherstellen, dass keine zweite Instanz läuft**

```bash
ps aux | grep -i "[c]ipher-keel\|[E]lectron" | head
```
Erwartet: keine laufende keel-Instanz. Läuft eine, erst `.claude/skills/run-keel/stop.sh`.

- [ ] **Step 2: App bauen und starten**

```bash
.claude/skills/run-keel/launch.sh
```

- [ ] **Step 3: Beleg 1 — der Klickpfad**

```bash
D=".claude/skills/run-keel/driver.mjs"
node $D project-window "document.body.innerText" | grep -i einstellungen
node $D project-window "window.cipherKeel.invoke('window:open-settings')"
node $D settings-window "document.body.innerText.slice(0, 400)"
```
Erwartet: der Knopftext erscheint im Projektfenster, der Aufruf liefert `{ok:true}`, und das Settings-Fenster zeigt „Einstellungen" samt Reiterleiste. **Ausgabe wörtlich ins Protokoll.**

- [ ] **Step 4: Beleg 2 und 3 — Sperrgrund und die zwei erreichbaren Warnungen**

```bash
node $D settings-window "window.cipherKeel.invoke('settings:zuordnung-setzen','tier:heavy','mac-qwen3-30b')
  .then(a => a.ansicht.slots.find(s=>s.id==='tier:heavy').optionen.find(o=>o.eintragId==='mac-qwen3-30b'))"

node $D settings-window "window.cipherKeel.invoke('settings:zuordnung-setzen','rolle:worker','openrouter-qwen3-coder')
  .then(a => a.ansicht.slots.find(s=>s.id==='rolle:worker').warnungen.map(w=>w.code))"
```
Erwartet: erstens ein `sperrgrund` im Klartext; zweitens **genau** `["teure-ebene-fuer-mechanik","verlaesst-netz"]`. Eine andere Menge widerlegt Spec §5.5 — dann **melden**, nicht anpassen.

- [ ] **Step 5: Beleg 4 — das Geheimnis liegt im Schlüsselbund, nicht in der Datei**

```bash
node $D settings-window "window.cipherKeel.invoke('settings:geheimnis-setzen','probe-ref','sk-probe-12345')
  .then(a => a.ok)"
security find-generic-password -s cipher-keel-api-probe-ref -a key -w
grep -c "sk-probe-12345" /tmp/keel-verify/cipher-keel-config.json || echo "NICHT IN DER CONFIG — richtig"
security delete-generic-password -s cipher-keel-api-probe-ref -a key
```
Erwartet: `true`, dann `sk-probe-12345` aus dem Schlüsselbund, dann **kein** Treffer in der Config.

- [ ] **Step 6: Beleg 5 — die Kommandozeile ändert sich, und die Vorgabe ist zeichengleich**

```bash
node $D settings-window "window.cipherKeel.invoke('settings:startargs-setzen','claude-code','--dangerously-skip-permissions --verbose')
  .then(a => a.ansicht.adapter[0].startArgs)"
node $D project-window "window.cipherKeel.invoke('session:create',{name:'protokoll-probe'})"
tmux list-panes -a -F "#{pane_current_command} #{pane_pid}" | head
ps -o args= -p $(tmux list-panes -a -F "#{pane_pid}" | head -1) 2>/dev/null
```
Erwartet: die tatsächliche Kommandozeile trägt `--verbose`. Danach den Wert auf `--dangerously-skip-permissions` zurücksetzen und eine zweite Session starten — deren Kommandozeile muss **zeichengleich** zu der vor der Umstellung sein.

- [ ] **Step 7: Beleg 6 — eine Zuordnung wirkt ohne Neustart**

```bash
node $D settings-window "window.cipherKeel.invoke('settings:zuordnung-setzen','rolle:tagging','mac-qwen3-30b').then(a=>a.ok)"
node $D project-window "window.cipherKeel.invoke('notes:auto-tag','Ein Text ueber Elektronenmikroskopie.')"
```
Erwartet: der Tagging-Aufruf geht an den zugeordneten Endpunkt, ohne dass die App neu gestartet wurde.

- [ ] **Step 8: Beleg 7 — ein kaputter Eintrag erreicht die Oberfläche**

```bash
.claude/skills/run-keel/stop.sh
python3 - <<'PY'
import json, pathlib
p = pathlib.Path('/tmp/keel-verify/cipher-keel-config.json')
c = json.loads(p.read_text())
c.setdefault('modelle', {}).setdefault('eintraege', []).append({'id': 'kaputt', 'art': 'telepathie'})
p.write_text(json.dumps(c, indent=2))
PY
.claude/skills/run-keel/launch.sh
node .claude/skills/run-keel/driver.mjs project-window "window.cipherKeel.invoke('window:open-settings')"
node .claude/skills/run-keel/driver.mjs settings-window "document.body.innerText" | grep -i "uebersprungen\|telepathie"
```
Erwartet: der kaputte Eintrag steht sichtbar in der Oberfläche, nicht nur in der Konsole.

- [ ] **Step 9: Beleg 8 — die Migration**

```bash
.claude/skills/run-keel/stop.sh
rm -rf /tmp/keel-migration
mkdir -p /tmp/keel-migration
cat > /tmp/keel-migration/cipher-keel-config.json <<'JSON'
{ "agent": { "skipPermissions": true }, "ui": { "theme": "dark" }, "mcp": { "port": 3100 } }
JSON
.claude/skills/run-keel/launch.sh /tmp/keel-migration
cat /tmp/keel-migration/cipher-keel-config.json
```
Erwartet: `agent.startArgs['claude-code'] === '--dangerously-skip-permissions'`, kein `skipPermissions`, kein `ui`, kein `mcp`.

- [ ] **Step 10: Beleg 9 — ein eigener Eintrag entsteht ohne Datei-Edit**

Dieser Beleg steht **nicht** in Spec §11: Die Liste dort entstand, bevor beim Plan-Selbstreview auffiel, dass §3 Anlegen und Bearbeiten verlangt. Spec §11 ist um diesen Punkt zu ergänzen, wenn das Protokoll geschrieben wird.

```bash
D=".claude/skills/run-keel/driver.mjs"
node $D settings-window "window.cipherKeel.invoke('settings:eintrag-speichern', {
  id:'protokoll-eigen', name:'Protokoll-Endpunkt', art:'local-http',
  erreichbarkeit:{art:'local-http', host:'127.0.0.1', port:11434, model:'probe'},
  oertlichkeit:'lokal', erklaertext:'Zum Beleg angelegt.', empfehlung:'Danach wieder weg.'
}).then(a => a.ok && a.ansicht.eintraege.find(e=>e.id==='protokoll-eigen'))"

# Ein ungueltiger Eintrag muss laut scheitern, nicht still verschluckt werden
node $D settings-window "window.cipherKeel.invoke('settings:eintrag-speichern',
  {id:'schief', name:'Schief', art:'api',
   erreichbarkeit:{art:'local-http', host:'x', port:1, model:'y'},
   oertlichkeit:'lokal'}).then(a => a.fehler)"

node $D settings-window "window.cipherKeel.invoke('settings:eintrag-loeschen','protokoll-eigen').then(a=>a.ok)"
```
Erwartet: der neue Eintrag erscheint mit `loeschbar: true`; der schiefe Eintrag liefert die Meldung aus `normaliseEintrag` („art ist 'api', erreichbarkeit ist 'local-http' — beide muessen dasselbe sagen"); das Löschen liefert `true`.

- [ ] **Step 10b: Beleg 10 — die Kanäle, die kein anderer Beleg berührt**

Aufgabe 8 liefert neun IPC-Handler und **keinen einzigen Test** — kein Test dieses Repos erreicht einen `ipcMain`-Handler. Die Belege 1 bis 9 decken sechs davon ab. Diese drei bleiben sonst unbelegt:

```bash
D=".claude/skills/run-keel/driver.mjs"

# einfachfeld-setzen, beide Zweige
node $D settings-window "window.cipherKeel.invoke('settings:einfachfeld-setzen','modelltier:heavy','opus-probe')
  .then(a => a.ansicht.modellTiers)"
node $D settings-window "window.cipherKeel.invoke('settings:einfachfeld-setzen','sprachausgabe:aktiv',false)
  .then(a => a.ansicht.sprachausgabe)"
# geschlossene Union: ein unbekanntes Feld wird abgewiesen, nicht stillschweigend geschrieben
node $D settings-window "window.cipherKeel.invoke('settings:einfachfeld-setzen','gibt-es-nicht','x')
  .then(a => a.fehler)"

# rueckfall-endpunkt-setzen, gueltig und ungueltig
node $D settings-window "window.cipherKeel.invoke('settings:rueckfall-endpunkt-setzen','tagging',
  {host:'127.0.0.1',port:11434,model:'probe'}).then(a => a.ansicht.rueckfallEndpunkte.tagging)"
node $D settings-window "window.cipherKeel.invoke('settings:rueckfall-endpunkt-setzen','tagging',
  {host:'127.0.0.1',port:11434}).then(a => a.fehler)"

# geheimnis-loeschen auf einem Ref, das es nicht gibt -- muss laut scheitern
node $D settings-window "window.cipherKeel.invoke('settings:geheimnis-loeschen','gibt-es-nicht')
  .then(a => a.fehler)"
```

Erwartet: die drei gültigen Aufrufe liefern die geänderten Werte in der zurückgegebenen Ansicht; die drei ungültigen liefern je eine deutsche Meldung und **keine** Änderung.

- [ ] **Step 10c: Beleg 11 — der Adapter-Schlüssel wird nie gelöscht**

Aus dem Review von Aufgabe 4: `startArgs: {}` bedeutet **nicht** „keine Parameter". Ein leeres Objekt wird beim Laden mit den Vorgaben zusammengeführt, wodurch die Vorgabezeile zurückkehrt. Nur `{ 'claude-code': '' }` schaltet ab.

```bash
node $D settings-window "window.cipherKeel.invoke('settings:startargs-setzen','claude-code','')
  .then(a => a.ansicht.adapter.find(x=>x.id==='claude-code').startArgs)"
.claude/skills/run-keel/stop.sh
python3 -c "import json;print(json.load(open('/tmp/keel-verify/cipher-keel-config.json'))['agent']['startArgs'])"
```

Erwartet: der Schlüssel `'claude-code'` steht mit leerem Wert in der Datei. Fehlt der Schlüssel, kehrt die Vorgabe beim nächsten Start zurück und der Nutzer bekommt ein Flag, das er abgeschaltet hat — **dann melden**, nicht nachbessern.

Danach die App für die restlichen Belege wieder starten.

- [ ] **Step 11: Aufräumen und das Protokoll festhalten**

```bash
.claude/skills/run-keel/stop.sh
```

Die wörtlichen Kernzeilen aller neun Belege ans Ende **dieses Plandokuments** schreiben, unter der Überschrift `## Messprotokoll <Datum>`. Handover §6: `.superpowers/` ist gitignoriert — Rohbelege überleben ein Aufräumen nicht, die Kernzeilen gehören in den Plan, der in Git ist.

- [ ] **Step 12: Doku nachführen und committen**

Basiskonzept §9 korrigieren: In `docs/superpowers/specs/2026-08-14-modell-ebene-basiskonzept.md`, §9, den Halbsatz „wo Geheimnisse liegen (Keychain gegen Config gegen Umgebungsvariable)" aus der Liste der offenen Fragen entfernen und ersetzen durch einen Verweis:

```markdown
(Die Frage, wo Geheimnisse liegen, ist seit `src/main/worker/api-keys.ts` beantwortet:
Schluesselbund zuerst, Umgebungsvariable zweitens. Siehe
`2026-08-17-settings-fenster-design.md` §5.3.)
```

```bash
git branch --show-current
git add docs/superpowers/
git commit -m "docs: Messprotokoll des Settings-Fensters und Nachfuehrung des Basiskonzepts"
```

---

## Task 14: Abschluss

- [ ] **Step 1: Die volle Kette ein letztes Mal**

```bash
npm run typecheck > /tmp/tc.log 2>&1; echo "TYPECHECK=$?"
npm run lint > /tmp/l.log 2>&1; echo "LINT=$?"
npm test > /tmp/t.log 2>&1; echo "TEST=$?"; grep -E "Tests|Test Files" /tmp/t.log | tail -3
npm run verify:bundle > /tmp/v.log 2>&1; echo "BUNDLE=$?"
```
Erwartet: alle vier EXIT=0. Die Testzahl notieren — sie liegt über 1908, weil diese Strecke Tests hinzufügt und keine entfernt.

- [ ] **Step 2: Belegen, dass die Zusicherungen des Spec halten**

```bash
# genau ein Aufrufer von warnungen()
grep -rn "warnungen(" src/ | grep -v "src/main/model/eignung.ts"
# der Renderer kennt die Regeln nicht
grep -rn "from '.*main/model" src/renderer/ || echo "kein Import aus main/model — richtig"
# 'fremdes-cli' steht nur noch in slots.ts und eignung.ts
grep -rn "fremdes-cli" src/
```
Erwartet: eine Zeile · kein Treffer · Treffer nur in `slots.ts` und `eignung.ts`.

- [ ] **Step 3: Pull Request**

```bash
git push -u origin settings-fenster
gh pr create --title "Settings-Fenster: die Modell-Schicht bekommt einen Konsumenten" --body "$(cat <<'EOF'
Ein eigenes Settings-Fenster mit garantiertem Klickpfad aus dem Projektfenster.
`src/main/model/ansicht.ts` ist der erste und einzige Aufrufer von `warnungen()`.

**Drei Reiter:** Modelle (Eintraege, fuenf Zuordnungen, Warnungen, Geheimnisse,
Rueckfaelle) · CLI-Start (Startparameter je Adapter) · Sprachausgabe.

**Was dabei mitfaellt:**
- `agent.skipPermissions` wird `agent.startArgs` je Adapter — der Vendor steht nicht
  mehr in der Struktur der Config, mit Migration
- `ui`, `mcp`, `app.maxSessions` und `windows` hatten keinen Leser und fallen aus dem
  Schema; `config:changed` und `config:delete` waren Kanaele ohne Handler und Sender
- `registry.ts` liest den Laeufer aus der neuen Slot-Tabelle statt ihn hart zu tragen
- uebersprungene Config-Eintraege erreichen eine Oberflaeche statt nur die Konsole

**Was ausdruecklich offen bleibt:** Von sechs Warnregeln erreichen nach dieser Strecke
zwei einen Menschen. Die anderen vier haengen an `eigene-schleife` bzw. Niveau B und
damit am Harness. Die Gegenproben dazu stehen in `tests/model/ansicht.test.ts` und
fallen absichtlich, sobald ein B-Slot dazukommt.

Messprotokoll aus der laufenden App im Plandokument.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Messprotokoll

*(Wird in Aufgabe 13, Schritt 11 gefüllt — wörtliche Kernzeilen aller neun Belege.)*
