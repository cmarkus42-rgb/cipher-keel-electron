# keel-harness-Adapter — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Niveau-B-Sitzung startet aus dem Launcher als eigene Gitterzelle, nimmt Aufträge an, fährt keels Schleife und zeigt ihren Ereignisstrom — womit `RUNTIMES_WITHOUT_ADAPTER` leer wird.

**Architecture:** Das `AgentAdapter`-Interface zerfällt in eine gemeinsame Basis plus zwei Sorten (`CliSitzungsAdapter` mit tmux, `SchleifenSitzungsAdapter` mit keels eigener Schleife), unterschieden durch das Feld `sitzungsart`; `SESSION_CREATE` engt daran per Typwächter ein. Die Lauf-Maschinerie zieht aus `harness-handlers.ts` nach `harness-sitzung.ts` und bekommt einen zweiten Aufrufer, statt ein zweites Mal zusammengebaut zu werden. Ein neuer Zuordnungsplatz `sitzung:niveau-b` liefert das Modell; ein Folgeauftrag landet als Ereignis `auftrag.folgend` im Verlauf statt in einem umgeschriebenen Präfix.

**Tech Stack:** TypeScript, Electron (main/preload/renderer), React 18, Vitest, better-sqlite3.

**Spec:** `docs/superpowers/specs/2026-08-23-keel-harness-adapter-design.md` — bei Widerspruch zwischen Plan und Spec gewinnt die Spec, und der Widerspruch gehört gemeldet.

## Global Constraints

- **Sprache.** Jeder Text, der einen Nutzer erreicht, ist deutsch. Kommentare und Bezeichner folgen der Nachbarschaft der Datei: `src/main/harness/`, `src/main/model/` und neue Module dieses Plans schreiben deutsch, `src/main/agent/` und `src/main/preset/` sind englisch. Umlaute in Quelltext-Kommentaren werden wie in der Umgebung als `ae/oe/ue` geschrieben; in Markdown-Dokumenten stehen echte Umlaute.
- **Kein `electron`-Import unter `src/main/harness/`.** `tests/harness/waechter-kern.test.ts` erzwingt das ohne Ausnahmeliste.
- **Nichts still verschlucken.** Kein leeres `catch`, kein `?? []` über einem Fehler.
- **Ein falscher Grund im Kommentar ist schlimmer als kein Kommentar.** Keine Zahl als „gemessen" ausgeben, die geschätzt ist.
- **Falsifikation:** Wer eine Wache baut, erzwingt die Verletzung, sieht den Test rot und stellt zurück. Was dabei zu sehen war, steht im Commit.
- **CK-NFR-012:** eine neue einstellbare Fläche ohne Eintrag in `docs/anpassbare-flaechen.md` ist ein Prüfbefund.
- **Prüfbefehle:** `npx vitest run <pfad>` für einzelne Dateien, `npm test` für alles, `npm run typecheck`, `npm run lint`. Alle drei müssen am Ende jeder Aufgabe grün sein.
- **Commits:** je Aufgabe mindestens einer, deutsche Betreffzeile im Stil des Repos (`feat(bereich): …`), und der Rumpf nennt den Grund, nicht die Dateiliste.

---

## Dateistruktur

**Neu:**

| Datei | Zuständigkeit |
|---|---|
| `src/main/harness-sitzung.ts` | Der eine Zusammenbau der Lauf-Umgebung und die Startsequenz. Zwei Aufrufer: das Harness-Fenster und der Adapter. Darf `electron` importieren |
| `src/main/agent/adapters/keel-harness.ts` | Der `SchleifenSitzungsAdapter`. Hält keine Lauf-Maschinerie, ruft `harness-sitzung.ts` lazy |
| `src/main/harness/fortsetzbarkeit.ts` | `weiterOderFrisch` — fragt `pruefeBudgets` mit knapperem Maß. Rein, kein `electron` |
| `src/main/session/schleifen-sitzungen.ts` | Das Zellenregister und seine reinen Prüffunktionen |
| `src/main/session/schleifen-start.ts` | Reine Zusammenbau-Funktion für eine Zelle (Modellauflösung, Präfixteile). Kein `electron`, kein IO |
| `src/main/preset/keel-arbeiter/ka-preset.ts` | Der Rahmen des Niveau-B-Presets |
| `src/main/preset/keel-arbeiter/ka-body.md` | Sein Body |
| `src/renderer/components/HarnessCell.tsx` | Die Zelle |

**Geändert:** `src/main/agent/agent-adapter.ts`, `src/main/agent/adapters/claude-code.ts`, `src/main/agent/registry.ts`, `src/main/model/slots.ts`, `src/main/model/registry.ts`, `src/main/model/ansicht.ts`, `src/main/config/config-store.ts`, `src/main/harness-handlers.ts`, `src/main/harness-praefix-quelle.ts`, `src/main/harness/ereignisse.ts`, `src/main/harness/projektion.ts`, `src/main/harness/lauf.ts`, `src/main/harness/index.ts`, `src/main/preset/registry.ts`, `src/main/preset/bodies.ts`, `src/main/ipc-handlers.ts`, `src/shared/ipc-channels.ts`, `src/shared/settings-types.ts`, `src/shared/preset-catalog.ts`, `src/renderer/components/SessionGrid.tsx`, `src/renderer/components/harness/EreignisPanel.tsx`, `src/renderer/index.tsx`, `docs/anpassbare-flaechen.md`.

---

## Task 1: Die Schnittstelle zerfällt in drei Teile

**Files:**
- Modify: `src/main/agent/agent-adapter.ts` (ganz)
- Modify: `src/main/agent/adapters/claude-code.ts:38-45` (Klassendeklaration), `:210-234` (isAvailable/executeCommand/streamOutput)
- Modify: `src/main/agent/registry.ts:10-11` (Importe)
- Test: `tests/agent/sitzungsart.test.ts` (neu)

**Interfaces:**
- Produces: `Sitzungsart`, `AgentAdapterBasis`, `CliSitzungsAdapter`, `SchleifenSitzungsAdapter`, `SchleifenStartOpts`, `SchleifenStartErgebnis`, `AgentAdapter` (Union), `istSchleifenAdapter()`, `AgentAdapterBasis.nichtVerfuegbarGrund()`.

- [ ] **Step 1: Den Wächtertest schreiben, der die Trennung erzwingt**

`tests/agent/sitzungsart.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { AdapterRegistry } from '../../src/main/agent/registry'
import { istSchleifenAdapter } from '../../src/main/agent/agent-adapter'

const leserOhneArgumente = { getStartArgs: () => [] as string[] }

// Die Sitzungsart ist das Diskriminanzfeld, an dem SESSION_CREATE einengt. Ein Adapter ohne
// sie faellt dort in keinen Zweig — und ein `default`, das ihn auffinge, waere genau das stille
// Durchfallen, gegen das diese Trennung antritt. Der Test laeuft ueber *jeden* registrierten
// Adapter, nicht ueber eine Liste, die jemand pflegen muss.
describe('jeder registrierte Adapter erklaert seine Sitzungsart', () => {
  it('nennt fuer jede Id eine der beiden Arten', () => {
    const registry = new AdapterRegistry(leserOhneArgumente)
    const ohneArt = registry.listIds()
      .map(id => registry.get(id)!)
      .filter(a => a.sitzungsart !== 'tmux' && a.sitzungsart !== 'eigene-schleife')
    expect(ohneArt.map(a => a.id)).toEqual([])
  })

  it('der Typwaechter trennt genau entlang der Sitzungsart', () => {
    const registry = new AdapterRegistry(leserOhneArgumente)
    for (const id of registry.listIds()) {
      const a = registry.get(id)!
      expect(istSchleifenAdapter(a)).toBe(a.sitzungsart === 'eigene-schleife')
    }
  })

  it('jeder Adapter kann sagen, warum er nicht verfuegbar ist', () => {
    const registry = new AdapterRegistry(leserOhneArgumente)
    for (const id of registry.listIds()) {
      const a = registry.get(id)!
      // Verfuegbar -> null. Nicht verfuegbar -> ein nicht-leerer deutscher Grund.
      // Ein Adapter, der `false` meldet und dazu schweigt, laesst SESSION_CREATE
      // wieder einen Text erfinden, den der Adapter besser weiss.
      const grund = a.nichtVerfuegbarGrund()
      if (a.isAvailable()) expect(grund).toBeNull()
      else expect(typeof grund === 'string' && grund.length > 0).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Test laufen lassen, Rot sehen**

Run: `npx vitest run tests/agent/sitzungsart.test.ts`
Expected: FAIL — `istSchleifenAdapter` existiert nicht, `sitzungsart` und `nichtVerfuegbarGrund` sind keine Eigenschaften von `AgentAdapter`.

- [ ] **Step 3: `agent-adapter.ts` aufteilen**

Der Kopfkommentar der Datei wird um den Grund der Trennung ergänzt. `LaunchCommand`, `LaunchOpts`, `AdapterContext`, `ProjectInstructions`, `SendOpts`, `OutputEvent` bleiben unverändert. Das bisherige `interface AgentAdapter` wird ersetzt durch:

```ts
/** Wie eine Sitzung dieses Adapters ueberhaupt existiert. Das Diskriminanzfeld der Union. */
export type Sitzungsart = 'tmux' | 'eigene-schleife'

/** Was jeder Adapter ehrlich beantworten kann — unabhaengig davon, wie seine Sitzung laeuft. */
export interface AgentAdapterBasis {
  readonly id: string
  readonly displayName: string
  readonly tier: 'tier-1' | 'tier-2'

  /**
   * Capability niveau this adapter can serve (M2 section 11.3).
   *
   * Claude Code is the only harness with native SKILL.md lazy-loading, which is what
   * Niveau A assumes; every other adapter in the garden is B. The niveau is a property
   * of the harness, not a user preference.
   */
  readonly niveau: CapabilityNiveau

  readonly sitzungsart: Sitzungsart

  getProjectMarkers(): string[]
  readProjectInstructions(projectPath: string): Promise<ProjectInstructions | null>
  supports(feature: AdapterFeature): boolean
  getCapabilities(): AdapterCapabilities

  /**
   * Check whether this adapter's runtime is reachable.
   * Must return boolean synchronously without changing state or starting I/O.
   * CK-ENT-026
   */
  isAvailable(): boolean

  /**
   * German, non-null exactly when isAvailable() is false: why this adapter cannot run.
   *
   * It lives here because the adapter knows the reason and the caller does not.
   * SESSION_CREATE used to build that text itself with
   * `adapter.id === 'claude-code' ? describeMissingTool('claude') : <generic>` — a special
   * case in the one place that had the least information about it.
   */
  nichtVerfuegbarGrund(): string | null

  buildWorkshopPromptFragment(lang: 'de' | 'en'): string
  buildLauncherPromptFragment(lang: 'de' | 'en'): string
  buildCyberFactoryPromptFragment(lang: 'de' | 'en'): string
}

/**
 * A harness that runs as its own process in a tmux pane. Everything here is about a command
 * line and a pane: an in-process loop has no honest answer to any of it.
 *
 * `executeCommand`/`streamOutput` (CK-ENT-026) sit here rather than on the base because both
 * already throw in the only adapter that has them, pointing at SessionManager and the tmux
 * output batcher respectively — they describe exactly the separation this union now carries.
 */
export interface CliSitzungsAdapter extends AgentAdapterBasis {
  readonly sitzungsart: 'tmux'
  readonly appGesteuerteParameter?: readonly string[]
  buildLaunchCommand(opts: LaunchOpts): LaunchCommand
  postLaunchInjection?(ctx: AdapterContext): Promise<void>
  getContextUsage?(sessionId: string): Promise<ContextUsage | null>
  attachStatusHook?(projectPath: string): Promise<void>
  sendPrompt(tmuxTarget: string, prompt: string, opts?: SendOpts): Promise<void>
  executeCommand(command: string): Promise<string>
  streamOutput(sessionId: string): AsyncIterable<OutputEvent>
}

/** Die Teile des stabilen Praefix, die aus der Preset-Schicht kommen (harness-praefix-quelle.ts). */
export interface EntitaetsTeile {
  body: string
  persona: string
  capabilities: string
  globaleRegeln: string
}

export interface SchleifenStartOpts {
  /** Projektwurzel — zugleich die Grenze der Pfadwache des Laufs. */
  wurzel: string
  sitzungsname: string
  auftragstext: string
  /** Der Registry-Eintrag aus dem Zuordnungsplatz `sitzung:niveau-b`. */
  eintragId: string
  praefix: EntitaetsTeile
  /**
   * Der zuletzt in dieser Zelle gefahrene Lauf, oder null bei der ersten Beauftragung.
   * Ob daraus ein Folgeauftrag wird, entscheidet `weiterOderFrisch` (harness/fortsetzbarkeit.ts)
   * — nicht der Aufrufer: die Entscheidung braucht das Protokoll, und das kennt nur die
   * Lauf-Maschinerie.
   */
  letzteLaufId: string | null

  /**
   * Gerufen, sobald die laufId feststeht und **bevor** die Schleife anlaeuft — synchron, im
   * selben Zug. Der Aufrufer traegt sie damit in sein Register ein.
   *
   * Es gibt sie, weil die naheliegende Reihenfolge ein Rennen ist: `starteAuftrag` kehrt heim,
   * sobald das erste `run.started` geschrieben ist, und der Rest des Laufs faehrt im
   * Hintergrund weiter. Wer die laufId erst aus dem Rueckgabewert ins Register schriebe,
   * verloere gegen einen sehr kurzen Lauf — dessen `beiEnde` kippte die Zelle auf
   * `leerlaufend`, bevor sie je auf `laeuft` stand, und das nachfolgende `setzeLauf` liesse sie
   * fuer immer auf `laeuft` stehen.
   */
  beiStart?: (laufId: string) => void

  /**
   * Gerufen, wenn der Lauf endet — Erfolg, Fehler oder Abbruch. Die laufId kommt mit, damit der
   * Aufrufer pruefen kann, ob sie noch die aktuelle ist, statt eine fremde Zelle zu kippen.
   *
   * Der Aufrufer kippt damit den Zellenzustand: der Hauptprozess fuehrt ihn, nicht der Renderer.
   */
  beiEnde?: (laufId: string) => void
}

export interface SchleifenStartErgebnis {
  laufId: string
  /** Wahr, wenn der Auftrag in `letzteLaufId` weiterlief statt einen neuen Lauf zu oeffnen. */
  fortgesetzt: boolean
}

/** keels eigene Schleife im Hauptprozess. Kein Pane, kein Kommandozeilenaufruf. */
export interface SchleifenSitzungsAdapter extends AgentAdapterBasis {
  readonly sitzungsart: 'eigene-schleife'
  starteAuftrag(opts: SchleifenStartOpts): Promise<SchleifenStartErgebnis>
  /** Setzt die Abbruchmarke. Der Lauf endet am naechsten Zugrand, nicht sofort. */
  brichAb(laufId: string): void
}

export type AgentAdapter = CliSitzungsAdapter | SchleifenSitzungsAdapter

export function istSchleifenAdapter(a: AgentAdapter): a is SchleifenSitzungsAdapter {
  return a.sitzungsart === 'eigene-schleife'
}
```

- [ ] **Step 4: `ClaudeCodeAdapter` an die neue Sorte anschließen**

In `src/main/agent/adapters/claude-code.ts` den Import `AgentAdapter` durch `CliSitzungsAdapter` ersetzen, die Klassendeklaration ändern und zwei Zeilen ergänzen:

```ts
export class ClaudeCodeAdapter implements CliSitzungsAdapter {
  readonly id = 'claude-code'
  readonly displayName = 'Claude Code'
  readonly tier = 'tier-1' as const
  readonly niveau = CapabilityNiveau.A
  readonly sitzungsart = 'tmux' as const
```

und direkt hinter `isAvailable()`:

```ts
  /**
   * Der Grund steht jetzt beim Adapter statt bei SESSION_CREATE. Bis hierher baute der
   * Handler ihn mit `adapter.id === 'claude-code' ? describeMissingTool('claude') : …`
   * zusammen — eine Sonderbehandlung an der Stelle mit den wenigsten Informationen darueber.
   */
  nichtVerfuegbarGrund(): string | null {
    return this.isAvailable() ? null : describeMissingTool('claude')
  }
```

Import ergänzen: `import { describeMissingTool } from '../../util/missing-tool'`.

- [ ] **Step 5: Test laufen lassen, Grün sehen**

Run: `npx vitest run tests/agent/sitzungsart.test.ts && npm run typecheck`
Expected: PASS. `typecheck` deckt auf, wo `AgentAdapter` bisher als Einzelinterface benutzt wurde — jede solche Stelle bekommt `istSchleifenAdapter` oder wird auf `CliSitzungsAdapter` verengt. `src/main/ipc-handlers.ts:264` (`adapter.buildLaunchCommand`) ist die einzige Produktionsstelle; sie wird in Task 6 richtig verzweigt und bekommt hier vorläufig ein `if (istSchleifenAdapter(adapter)) return { id: null, name: null, error: 'Der Adapter für diese Laufzeit ist noch nicht verdrahtet.' }` **mit einem `TODO(Task 6)`-freien Kommentar**, der sagt, dass Task 6 diesen Zweig ersetzt.

- [ ] **Step 6: Falsifikation — die Wache einmal rot sehen**

`sitzungsart` in `claude-code.ts` auskommentieren, Test laufen lassen: er muss rot werden mit `['claude-code']` in `ohneArt`. Danach zurückstellen. Ebenso `nichtVerfuegbarGrund` auf `() => null` festnageln und prüfen, dass der dritte Fall rot wird, wenn `claude` nicht auf dem PATH liegt (`PATH= npx vitest run tests/agent/sitzungsart.test.ts`). Was zu sehen war, kommt in die Commit-Nachricht.

- [ ] **Step 7: Ganze Suite und commit**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/agent tests/agent/sitzungsart.test.ts src/main/ipc-handlers.ts
git commit -m "refactor(agent): zwei Adaptersorten ueber gemeinsamer Basis" -m "..."
```

---

## Task 2: Der Zuordnungsplatz `sitzung:niveau-b`

**Files:**
- Modify: `src/main/model/slots.ts:16-40` (Typen), `:42-93` (SLOTS)
- Modify: `src/main/config/config-store.ts:87-95` (Schema), `:171-178` (Vorgaben)
- Modify: `src/main/model/registry.ts:72-76` (neben `eintragFuerTier`/`eintragFuerRolle`)
- Modify: `src/main/model/ansicht.ts:114-117`
- Modify: `src/shared/settings-types.ts` (`SlotAnsicht.art`, falls geführt)
- Modify: `docs/anpassbare-flaechen.md`
- Test: `tests/model/sitzungsplatz.test.ts` (neu)

**Interfaces:**
- Consumes: nichts aus Task 1.
- Produces: `Sitzungsschluessel = 'niveau-b'`, `Slot.art: 'tier' | 'rolle' | 'sitzung'`, `slotFuerId('sitzung:niveau-b')`, `eintragFuerSitzung(schluessel: Sitzungsschluessel): ModellEintrag | null`, Config-Pfad `modelle.zuordnung.sitzungen['niveau-b']`.

- [ ] **Step 1: Den Test schreiben**

`tests/model/sitzungsplatz.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SLOTS, slotFuerId } from '../../src/main/model/slots'
import { laeuferKannArt, sperrgrund } from '../../src/main/model/eignung'
import { CapabilityNiveau } from '../../src/main/preset/niveau'

describe('der Zuordnungsplatz sitzung:niveau-b', () => {
  it('existiert, faehrt die eigene Schleife und steht auf Niveau B', () => {
    const slot = slotFuerId('sitzung:niveau-b')
    expect(slot).not.toBeNull()
    expect(slot!.laeufer).toBe('eigene-schleife')
    expect(slot!.niveau).toBe(CapabilityNiveau.B)
    expect(slot!.art).toBe('sitzung')
    // Gelesen wird beim Zellenstart — ein Wechsel trifft die naechste Zelle, nicht die laufende.
    expect(slot!.wirkung).toBe('naechste-session')
  })

  it('erbt die Eignungsregeln, ohne eine davon zu wiederholen', () => {
    const l = slotFuerId('sitzung:niveau-b')!.laeufer
    expect(laeuferKannArt(l, 'local-http')).toBe(true)
    expect(laeuferKannArt(l, 'api')).toBe(true)
    expect(laeuferKannArt(l, 'cli-harness')).toBe(false)
    expect(sperrgrund(l, 'cli-harness')).toContain('CLI-Harness')
  })

  it('jede Slot-Id kommt genau einmal vor', () => {
    const ids = SLOTS.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
```

- [ ] **Step 2: Test laufen lassen, Rot sehen**

Run: `npx vitest run tests/model/sitzungsplatz.test.ts`
Expected: FAIL — `slotFuerId('sitzung:niveau-b')` liefert `null`.

- [ ] **Step 3: `slots.ts` weiten**

```ts
export type Tier = 'light' | 'standard' | 'heavy'
export type Rolle = 'tagging' | 'worker' | 'rechercheur'
/**
 * Die dritte Art. Ein Tier faehrt ein CLI-Harness, eine Rolle verteilt einen einzelnen Job —
 * eine Sitzung ist keines von beidem, und sie unter `rollen` zu haengen machte den Satz im
 * Modulkopf falsch.
 */
export type Sitzungsschluessel = 'niveau-b'

export type SlotId =
  | 'tier:light' | 'tier:standard' | 'tier:heavy'
  | 'rolle:tagging' | 'rolle:worker' | 'rolle:rechercheur'
  | 'sitzung:niveau-b'

export interface Slot {
  id: SlotId
  beschriftung: string
  laeufer: Laeufer
  niveau: CapabilityNiveau
  art: 'tier' | 'rolle' | 'sitzung'
  schluessel: Tier | Rolle | Sitzungsschluessel
  wirkung: 'sofort' | 'naechste-session'
}
```

und als letzter Eintrag in `SLOTS`:

```ts
  /**
   * Die Niveau-B-Sitzung im Gitter (agent/adapters/keel-harness.ts). Der einzige Platz, dessen
   * Laeufer eine ganze Sitzung traegt statt eines einzelnen Zuges oder Jobs.
   *
   * `wirkung: 'naechste-session'` wie bei den Tiers: gelesen wird beim Zellenstart. Mitten in
   * einem laufenden Auftrag das Modell zu wechseln, verwuerfe dessen Praefix-Zwischenspeicher.
   *
   * **Kein Rueckfall bei leerem Platz** — anders als `rolle:rechercheur`, wo das Modell des
   * Hauptlaufs einspringt. Der naechstliegende Rueckfall waere hier `llm.worker`, und das ist
   * ein Ein-Schuss-Endpunkt fuer einen einzelnen Job, keine Sitzung. ansicht.ts sagt das im
   * Rueckfalltext, und der Start scheitert benannt (session/schleifen-start.ts).
   */
  {
    id: 'sitzung:niveau-b',
    beschriftung: 'Sitzung „Niveau B" — die eigene Schleife im Gitter',
    laeufer: 'eigene-schleife', niveau: CapabilityNiveau.B,
    art: 'sitzung', schluessel: 'niveau-b', wirkung: 'naechste-session',
  },
```

- [ ] **Step 4: Konfiguration**

In `src/main/config/config-store.ts` im Schema unter `modelle.zuordnung`:

```ts
      rollen: { tagging: string; worker: string; rechercheur: string }
      /**
       * Die Sitzungsplaetze. Leer heisst hier — anders als bei `tagging` und `worker` —
       * **kein Rueckfall**, sondern „keine Niveau-B-Zelle startet". Siehe slots.ts.
       */
      sitzungen: { 'niveau-b': string }
```

und in `defaults`:

```ts
      rollen: { tagging: '', worker: '', rechercheur: '' },
      // Kein Migrationszweig noetig: `deepMerge` legt einen fehlenden Schluessel aus den
      // Vorgaben nach, und '' ist genau der Zustand „keine Zuordnung", den eine aeltere
      // Datei meint — dieselbe Begruendung wie bei `rechercheur`.
      sitzungen: { 'niveau-b': '' },
```

- [ ] **Step 5: `eintragFuerSitzung` und die Ansicht**

`src/main/model/registry.ts`, neben `eintragFuerRolle`:

```ts
export function eintragFuerSitzung(schluessel: Sitzungsschluessel): ModellEintrag | null {
  return eintragNachId(configStore.get('modelle').zuordnung.sitzungen[schluessel])
}
```

`src/main/model/ansicht.ts`, an der Stelle mit `const gewaehlt = …`:

```ts
  const gewaehlt = slot.art === 'tier'
    ? zuordnung.tiers[slot.schluessel as Tier]
    : slot.art === 'rolle'
      ? zuordnung.rollen[slot.schluessel as Rolle]
      : zuordnung.sitzungen[slot.schluessel as Sitzungsschluessel]
```

Der Rückfalltext dieses Platzes lautet:

```
Ohne Belegung startet keine Niveau-B-Zelle. Es gibt hier keinen Rueckfall: der
naechstliegende waere der Worker-Endpunkt, und der ist fuer einen einzelnen Job
bemessen, nicht fuer eine Sitzung.
```

Wo `ansicht.ts` heute `if (slot.art === 'tier')` für die Optionsliste verzweigt (Zeile ~94), gilt der Nicht-Tier-Zweig unverändert auch für `'sitzung'` — die Optionen kommen aus der Registry, gefiltert über `laeuferKannArt`. **Beim Bau prüfen**, ob dieser Zweig eine Tier-Annahme trifft, die für `'sitzung'` falsch wäre; falls ja, gehört sie an `slot.art === 'tier'` gebunden statt an „nicht Rolle".

- [ ] **Step 6: Tests laufen lassen, Grün sehen**

Run: `npx vitest run tests/model/ tests/config/ && npm run typecheck`
Expected: PASS. `tests/model/eignung-einzige-quelle.test.ts` muss weiter grün sein — der neue Slot nennt seinen Läufer genau einmal und erzählt keine Regel nach.

- [ ] **Step 7: Falsifikation**

In `slots.ts` `laeufer: 'eigene-schleife'` auf `'fremdes-cli'` ändern und `npx vitest run tests/model/sitzungsplatz.test.ts` laufen lassen: der Eignungsteil muss rot werden. Zurückstellen.

- [ ] **Step 8: `docs/anpassbare-flaechen.md` und commit**

Zeile in die ConfigStore-Tabelle, in der Form der Nachbarzeilen:

```
| `modelle.zuordnung.sitzungen['niveau-b']` | Modell der Niveau-B-Gitterzelle | ja (Einstellungen → Modelle) | ja |
```

Und die Stand-Zeile oben um den neuen Platz ergänzen.

```bash
npm test && npm run typecheck && npm run lint
git add src/main/model src/main/config src/shared/settings-types.ts tests/model/sitzungsplatz.test.ts docs/anpassbare-flaechen.md
git commit -m "feat(model): Zuordnungsplatz 'sitzung:niveau-b' — die dritte Slot-Art"
```

---

## Task 3: Die Lauf-Maschinerie zieht um

Reiner Umzug. **Kein Verhalten ändert sich**, und genau das ist der Prüfstein: die bestehende Harness-Test-Suite muss ohne eine einzige Änderung grün bleiben.

**Files:**
- Create: `src/main/harness-sitzung.ts`
- Modify: `src/main/harness-handlers.ts` (die umgezogenen Teile entfernen, aus dem neuen Modul importieren und re-exportieren)
- Test: bestehende `tests/harness/*.test.ts` — Importpfade der umgezogenen Funktionen anpassen

**Interfaces:**
- Produces: aus `src/main/harness-sitzung.ts`: `harnessDb()`, `baueWerkzeugRegistry()`, `baueLaufUmgebung()`, `mitSystemPraefix()`, `sendeUeberTransport()`, `rechercheurModell()`, `SCHLEIFE_TIMEOUT_MS`, `STANDARD_BUDGETS`, `auftragAusProtokoll()`, `laufAbgeschlossen()`, `istUnterlauf()`, `pruefeKeinUnterlauf()`, `pruefeLaufLaeuftNicht()`, `laufUebersicht()`, `abbruchmarken`, `laufendeLaeufe`, und neu `starteHarnessLauf()`.

- [ ] **Step 1: Das neue Modul anlegen, Inhalte verschieben**

`src/main/harness-sitzung.ts` bekommt diesen Kopf:

```ts
/**
 * harness-sitzung — der eine Zusammenbau einer Lauf-Umgebung, und die Startsequenz darum.
 *
 * Bis zum 2026-08-23 stand das alles in harness-handlers.ts, und es gab genau einen Aufrufer:
 * das Harness-Fenster. Mit der Gitterzelle (agent/adapters/keel-harness.ts) kommt ein zweiter.
 * Es hier herauszuziehen, statt die Zelle ihre eigene Umgebung bauen zu lassen, ist dieselbe
 * Entscheidung, die `pruefeKeinUnterlauf` schon traegt: die zweite Stelle, an der eine
 * Kapselung richtig zusammengesetzt werden muss, ist die, die beim naechsten Umbau vergessen
 * wird.
 *
 * Das Modul liegt **ausserhalb** von src/main/harness/, weil es `electron` braucht
 * (app.getPath('userData')) und der Waechter tests/harness/waechter-kern.test.ts dort keinen
 * electron-Import duldet — ohne Ausnahmeliste, denn eine Ausnahmeliste ist, wie ein Waechter
 * still aufhoert zu wachen.
 *
 * Was hier NICHT hinwandert: `pruefeAnhaenge` und `dialogAusgewaehlt`. Der
 * Anhang-Herkunftsnachweis haengt am Dateidialog des Harness-Fensters, und die Gitterzelle hat
 * keine Anhaenge. Sie bleiben im Handler, bei dem Fenster, dessen Dialog sie bezeugen.
 */
```

Verschoben werden — **unverändert, samt aller Kommentare**: `db`/`harnessDb()`, `abbruchmarken`, `laufendeLaeufe`, `pruefeLaufLaeuftNicht`, `STANDARD_BUDGETS`, `baueWerkzeugRegistry`, `mitSystemPraefix`, `SCHLEIFE_TIMEOUT_MS`, `sendeUeberTransport`, `rechercheurModell`, `baueLaufUmgebung`, `auftragAusProtokoll`, `laufAbgeschlossen`, `istUnterlauf`, `pruefeKeinUnterlauf`, `laufUebersicht`, `fehler`.

`baueLaufUmgebung` wird dabei **exportiert** und bekommt einen zusätzlichen Parameter für die Präfixteile:

```ts
export async function baueLaufUmgebung(
  laufId: string, eintrag: ModellEintrag, auftragstext: string, wurzel: string,
  services: AppServices, aufJedesEreignis: (ev: HarnessEreignis) => void,
  entitaet?: EntitaetsTeile,
): Promise<LaufUmgebung> {
```

und reicht `entitaet` an `assemblePraefixTeile` durch (Task 5 baut den Parameter dort). Weggelassen heißt: die heutigen fest verdrahteten Sätze — also genau das bisherige Verhalten des Harness-Fensters.

- [ ] **Step 2: `starteHarnessLauf` als benannte Startsequenz**

Der Rumpf von `HARNESS_LAUF_STARTEN` ab „Minted here" wird zu einer Funktion, damit der Adapter dieselbe Sequenz fährt statt einer zweiten:

```ts
/**
 * Die Startsequenz, an einer Stelle. Sie `await`et den Lauf **nicht** zu Ende: `starteLauf`
 * loest erst auf, wenn die ganze Mehrrunden-Schleife durch ist, und darauf zu warten hiesse,
 * den IPC-Hinlauf fuer die gesamte Laufdauer zu blockieren — der Abbrechen-Knopf, der an einer
 * laufId haengt, wuerde erst klickbar, wenn es nichts mehr abzubrechen gibt. Stattdessen ein
 * Rennen zwischen dem ersten Schreibvorgang der Schleife und dem Ausgang des Laufversprechens:
 * ein synchroner Startfehler (unbekannter Codec, cli-harness-Eintrag ohne Faehigkeitszeile)
 * kommt als gewoehnlicher Fehler zurueck, ein geglueckter Start kehrt sofort heim.
 */
export async function starteHarnessLauf(args: {
  laufId: string
  eintrag: ModellEintrag
  auftragstext: string
  wurzel: string
  services: AppServices
  anhaenge?: string[]
  entitaet?: EntitaetsTeile
  /** Laeuft nach dem Ende des Laufs — egal ob Erfolg, Fehler oder Abbruch. */
  beiEnde?: () => void
}): Promise<void> {
  const { laufId, eintrag, auftragstext, wurzel, services } = args

  let markiereGestartet: (() => void) | null = null
  const wennGestartet = new Promise<void>((resolve) => { markiereGestartet = resolve })

  laufendeLaeufe.add(laufId)

  const laufPromise = starteLauf(
    {
      auftragstext, modellId: eintrag.id, wurzel,
      anhaenge: args.anhaenge && args.anhaenge.length > 0 ? args.anhaenge : undefined,
      budgets: STANDARD_BUDGETS,
    },
    await baueLaufUmgebung(laufId, eintrag, auftragstext, wurzel, services, () => {
      if (markiereGestartet) { markiereGestartet(); markiereGestartet = null }
    }, args.entitaet),
    laufId,
  )

  laufPromise
    .catch((err) => {
      console.error(
        `[harness-sitzung] Lauf '${laufId}' endete mit einem unbehandelten Fehler:`,
        err instanceof Error ? err.message : String(err),
      )
    })
    .finally(() => {
      abbruchmarken.delete(laufId)
      laufendeLaeufe.delete(laufId)
      args.beiEnde?.()
    })

  await Promise.race([wennGestartet, laufPromise])
}
```

`HARNESS_LAUF_STARTEN` ruft danach nur noch `await starteHarnessLauf({...})` und gibt `{ ok: true, wert: laufId }` zurück.

- [ ] **Step 3: `harness-handlers.ts` aufräumen**

Die verschobenen Definitionen entfernen, aus `./harness-sitzung` importieren, und die bisher **exportierten** Namen von dort re-exportieren, damit keine bestehende Importstelle bricht:

```ts
export {
  pruefeLaufLaeuftNicht, laufUebersicht, auftragAusProtokoll, laufAbgeschlossen,
  istUnterlauf, pruefeKeinUnterlauf, baueWerkzeugRegistry, mitSystemPraefix,
  rechercheurModell, SCHLEIFE_TIMEOUT_MS,
} from './harness-sitzung'
```

- [ ] **Step 4: Die ganze Suite laufen lassen — sie ist der Beweis**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS, **ohne dass eine Testdatei angefasst wurde**. Genau das ist der Prüfstein eines reinen Umzugs. Muss doch eine Datei angefasst werden, dann nur ihr Importpfad — und der Grund gehört in den Commit.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness-sitzung.ts src/main/harness-handlers.ts
git commit -m "refactor(harness): die Lauf-Maschinerie bekommt ein eigenes Modul" -m "Reiner Umzug, kein Verhalten geaendert: die Suite ist ohne eine Testaenderung gruen geblieben. Der Grund ist der zweite Aufrufer, der mit der Gitterzelle kommt."
```

---

## Task 4: Der `KeelHarnessAdapter`

**Files:**
- Create: `src/main/agent/adapters/keel-harness.ts`
- Modify: `src/main/agent/registry.ts:21-41` (Map, Menge), `:47-50` (Konstruktor)
- Test: `tests/agent/keel-harness-adapter.test.ts` (neu)

**Interfaces:**
- Consumes: `SchleifenSitzungsAdapter`, `SchleifenStartOpts`, `SchleifenStartErgebnis` (Task 1); `eintragFuerSitzung`, `slotFuerId` (Task 2); `starteHarnessLauf`, `abbruchmarken` (Task 3).
- Produces: `KeelHarnessAdapter` mit `id = 'keel-harness'`; `RUNTIME_TO_ADAPTER_ID` enthält `['keel-harness', 'keel-harness']`; `RUNTIMES_WITHOUT_ADAPTER` ist leer.

- [ ] **Step 1: Den Test schreiben**

`tests/agent/keel-harness-adapter.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/main/config/config-store', () => ({
  configStore: { get: vi.fn(() => zuordnung) },
}))

let zuordnung: any
beforeEach(() => {
  zuordnung = { zuordnung: { tiers: {}, rollen: {}, sitzungen: { 'niveau-b': '' } }, eintraege: [] }
})

describe('KeelHarnessAdapter', () => {
  it('ist ohne belegten Platz nicht verfuegbar und sagt warum', async () => {
    const { KeelHarnessAdapter } = await import('../../src/main/agent/adapters/keel-harness')
    const a = new KeelHarnessAdapter()
    expect(a.sitzungsart).toBe('eigene-schleife')
    expect(a.isAvailable()).toBe(false)
    expect(a.nichtVerfuegbarGrund()).toContain('Sitzung „Niveau B"')
    expect(a.nichtVerfuegbarGrund()).toContain('Einstellungen')
  })

  it('ist mit einem local-http-Eintrag verfuegbar', async () => {
    zuordnung.zuordnung.sitzungen['niveau-b'] = 'spark-qwen38-27b'
    const { KeelHarnessAdapter } = await import('../../src/main/agent/adapters/keel-harness')
    expect(new KeelHarnessAdapter().isAvailable()).toBe(true)
  })

  it('ist mit einem cli-harness-Eintrag gesperrt, mit dem Text aus eignung.ts', async () => {
    zuordnung.zuordnung.sitzungen['niveau-b'] = 'claude-opus-cli'
    const { KeelHarnessAdapter } = await import('../../src/main/agent/adapters/keel-harness')
    const a = new KeelHarnessAdapter()
    expect(a.isAvailable()).toBe(false)
    // Kein neuer Text: die Sperre hat schon einen, und zwei Formulierungen derselben Regel
    // sind zwei Stellen, an denen sie sich aendern kann.
    expect(a.nichtVerfuegbarGrund()).toContain('CLI-Harness')
  })
})
```

> **Nachgeprüft am 2026-08-23:** beide Ids sind echte Einträge in `src/main/model/defaults.ts` — `spark-qwen38-27b` (`art: 'local-http'`, Zeile 62) und `claude-opus-cli` (`art: 'cli-harness'`, Zeile 17). Eine erfundene Id machte den Test grün aus dem falschen Grund.

- [ ] **Step 2: Test laufen lassen, Rot sehen**

Run: `npx vitest run tests/agent/keel-harness-adapter.test.ts`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 3: Den Adapter schreiben**

```ts
/**
 * keel-harness — der Adapter fuer keels eigene Schleife.
 *
 * Er haelt **keine** Lauf-Maschinerie. Die steht in harness-sitzung.ts und hat dort genau einen
 * Zusammenbau, den sich Harness-Fenster und Gitterzelle teilen. Dieser Adapter ist die Identitaet
 * der Laufzeit, ihr Niveau, ihre Verfuegbarkeit — und ein Startbefehl, der weiterreicht.
 *
 * Der Import von harness-sitzung.ts geschieht **lazy**, genau wie ClaudeCodeAdapter seinen
 * Statusline-Hook holt: ansicht.ts baut fuer das Einstellungsfenster eine eigene AdapterRegistry,
 * und die Tests dazu laufen ohne electron-Mock (vitest.config.ts kennt keine Setup-Datei). Ein
 * eifriger Import zoege `electron` in jeden davon.
 */

import type {
  SchleifenSitzungsAdapter, SchleifenStartOpts, SchleifenStartErgebnis, ProjectInstructions,
} from '../agent-adapter'
import type { AdapterFeature, AdapterCapabilities } from '../../../shared/types'
import { CapabilityNiveau } from '../../preset/niveau'
import { eintragFuerSitzung } from '../../model/registry'
import { slotFuerId } from '../../model/slots'
import { laeuferKannArt, sperrgrund } from '../../model/eignung'
import type { AppServices } from '../../window-manager'

const PLATZ = 'sitzung:niveau-b'

export class KeelHarnessAdapter implements SchleifenSitzungsAdapter {
  readonly id = 'keel-harness'
  readonly displayName = 'keel-Harness'
  readonly tier = 'tier-2' as const
  readonly niveau = CapabilityNiveau.B
  readonly sitzungsart = 'eigene-schleife' as const

  /**
   * Die Dienste des Hauptprozesses (Graph-DB, Netz). Ueber den Konstruktor hereingereicht statt
   * importiert, weil ansicht.ts eine Registry ohne sie baut — dort wird nur `displayName`
   * gebraucht, und ein Adapter, der zum Bauen einen Dienstbaum verlangt, waere dort nicht
   * konstruierbar. `starteAuftrag` ohne Dienste wirft benannt statt still nichts zu tun.
   */
  private readonly services: AppServices | null

  constructor(services: AppServices | null = null) {
    this.services = services
  }

  isAvailable(): boolean {
    return this.grundOderNull() === null
  }

  nichtVerfuegbarGrund(): string | null {
    return this.grundOderNull()
  }

  /**
   * Synchron und ohne E/A, wie das Interface es verlangt: es liest die Zuordnung und die
   * Eignungsmatrix. Es klopft an keinen Endpunkt — ein Adapter, der beim Aufzaehlen der
   * Gitterplaetze eine HTTP-Anfrage ausloest, waere eine Ueberraschung an der falschen Stelle.
   */
  private grundOderNull(): string | null {
    const eintrag = eintragFuerSitzung('niveau-b')
    if (!eintrag) {
      return (
        'Der Platz „Sitzung „Niveau B"" ist nicht belegt — ohne Modell startet keine ' +
        'Niveau-B-Zelle. Einstellungen → Modelle.'
      )
    }
    const laeufer = slotFuerId(PLATZ)!.laeufer
    if (!laeuferKannArt(laeufer, eintrag.art)) {
      // Kein neuer Text: die Regel hat schon einen, in eignung.ts.
      return `Der Platz zeigt auf '${eintrag.id}'. ${sperrgrund(laeufer, eintrag.art)}`
    }
    return null
  }

  async starteAuftrag(opts: SchleifenStartOpts): Promise<SchleifenStartErgebnis> {
    if (!this.services) {
      throw new Error(
        '[KeelHarnessAdapter] Ohne AppServices kann kein Lauf starten. Diese Instanz wurde nur ' +
        'zum Aufzaehlen gebaut (siehe model/ansicht.ts).',
      )
    }
    const { beauftrageSchleife } = await import('../../harness-sitzung')
    return beauftrageSchleife(opts, this.services)
  }

  brichAb(laufId: string): void {
    // Synchron, damit ein Abbruch nicht selbst auf einen dynamischen Import wartet: der Aufrufer
    // (SESSION_DESTROY) entfernt die Zelle unmittelbar danach.
    void import('../../harness-sitzung').then(m => m.markiereAbbruch(laufId))
  }

  getProjectMarkers(): string[] {
    // keels Schleife liest ihre Faehigkeiten ueber `faehigkeit_lesen` aus der Laufwurzel; das
    // Verzeichnis ist dasselbe wie bei Claude Code, der Weg hinein ein anderer.
    return ['.claude']
  }

  async readProjectInstructions(_projectPath: string): Promise<ProjectInstructions | null> {
    // Die Anweisungen der Entitaet kommen ueber den stabilen Praefix herein (SchleifenStartOpts
    // .praefix), nicht aus einer Datei, die die Schleife selbst laese. Null ist hier die
    // ehrliche Antwort, kein fehlendes Feature.
    return null
  }

  supports(feature: AdapterFeature): boolean {
    return this.getCapabilities()[feature] === true
  }

  getCapabilities(): AdapterCapabilities {
    return {
      'mcp-injection': false,
      'status-line': false,
      'skip-permissions': false,
      'sub-agents': false,
      'project-instructions': false,
      'message-bus-participant': false,
      'companion-mcp': false,
    }
  }

  buildWorkshopPromptFragment(): string { return '' }
  buildLauncherPromptFragment(): string { return '' }
  buildCyberFactoryPromptFragment(): string { return '' }
}
```

> **Nachgeprüft am 2026-08-23:** `AdapterCapabilities = Record<AdapterFeature, boolean>` mit genau diesen sieben Schlüsseln (`src/shared/types.ts:9-18`) — das Objekt oben ist vollständig, kein `as` nötig.
>
> `'sub-agents': false` **bleibt und bekommt diesen Kommentar daneben**: der Rechercheur ist zwar ein Unterlauf, aber die Fähigkeit meint hier, was `buildWorkshopPromptFragment` und die Cyber-Factory-Orchestrierung darunter verstehen — dass der Adapter *weitere Sitzungen* starten kann. Das kann keels Schleife nicht; sie kapselt einen Unterlauf im eigenen Lauf. Ein `true` hier hieße, der Cyber-Factory-Weg dürfe dieser Zelle Worker-Aufträge geben, und das ist genau der Schritt, der **nicht** zu diesem Plan gehört (§10 der Spec).

- [ ] **Step 4: In die Registry eintragen**

`src/main/agent/registry.ts`:

```ts
export const RUNTIME_TO_ADAPTER_ID: ReadonlyMap<string, string> = new Map([
  ['claude-cli-tmux', 'claude-code'],
  ['keel-harness', 'keel-harness'],
])

/**
 * Runtime values that KNOWN_RUNTIMES accepts as valid but that have no entry in
 * RUNTIME_TO_ADAPTER_ID yet. Declared explicitly so the gap between "valid preset value" and
 * "resolvable adapter" is an intentional, named fact rather than an accident.
 *
 * **Leer seit dem 2026-08-23**, als der keel-harness-Adapter landete. Die Liste bleibt stehen,
 * und der Zweig in getForRuntime, der „gueltig, aber Adapter nicht gebaut" wirft, bleibt es
 * auch: dort landet der naechste Wert (Codex, Gemini). Der Waechter in
 * tests/agent/runtime-registry-completeness.test.ts traegt auch ueber eine leere Menge — seine
 * lebende Pruefung ist „jede bekannte Laufzeit hat einen Adapter *oder* ist benannt".
 */
export const RUNTIMES_WITHOUT_ADAPTER: ReadonlySet<string> = new Set<string>([])
```

Der Konstruktor nimmt die Dienste optional entgegen und registriert beide Adapter:

```ts
  constructor(configReader: AgentConfigReader, services: AppServices | null = null) {
    const claude = new ClaudeCodeAdapter(configReader)
    this.adapters.set(claude.id, claude)
    const keel = new KeelHarnessAdapter(services)
    this.adapters.set(keel.id, keel)
  }
```

`src/main/ipc-handlers.ts` reicht `services` durch; `src/main/model/ansicht.ts` nicht (dort wird nur aufgezählt).

- [ ] **Step 5: Tests laufen lassen**

Run: `npx vitest run tests/agent/ && npm run typecheck`
Expected: PASS. `runtime-registry-completeness.test.ts` bleibt grün; `adapter-runtime-resolution.test.ts:30-40` erwartet heute einen Wurf für `keel-harness` und **muss angepasst werden** — der Test bekommt stattdessen die Erwartung, dass `getForRuntime('keel-harness').id === 'keel-harness'` ist, und sein Kommentar den Grund, warum die alte Erwartung fiel.

- [ ] **Step 6: Falsifikation**

`RUNTIME_TO_ADAPTER_ID` den `keel-harness`-Eintrag nehmen, ohne ihn in `RUNTIMES_WITHOUT_ADAPTER` zu setzen: `runtime-registry-completeness` muss rot werden. Beides zurückstellen.

- [ ] **Step 7: Commit**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/agent tests/agent
git commit -m "feat(agent): der keel-harness-Adapter — RUNTIMES_WITHOUT_ADAPTER wird leer"
```

---

## Task 5: Das Preset und die Naht zur Preset-Schicht

**Files:**
- Create: `src/main/preset/keel-arbeiter/ka-preset.ts`, `src/main/preset/keel-arbeiter/ka-body.md`
- Modify: `src/main/preset/bodies.ts`, `src/main/preset/registry.ts:44-50` (ENTITIES)
- Modify: `src/shared/preset-catalog.ts`
- Modify: `src/main/harness-praefix-quelle.ts`
- Test: `tests/preset/keel-arbeiter.test.ts` (neu), `tests/harness/praefix-quelle.test.ts` (neu)

**Interfaces:**
- Consumes: `EntitaetsTeile` (Task 1).
- Produces: `KA_RAHMEN`, `createKaRahmen(niveau)`, Entity-Id `keel-arbeiter`; `assemblePraefixTeile(auftragstext, faehigkeiten, entitaet?)`.

- [ ] **Step 1: Die Tests schreiben**

`tests/preset/keel-arbeiter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getEntityRahmen, getEntityDefinition } from '../../src/main/preset/registry'
import { CapabilityNiveau } from '../../src/main/preset/niveau'
import { isKnownPresetId } from '../../src/shared/preset-catalog'

describe('Preset keel-arbeiter', () => {
  it('erklaert die eigene Laufzeit und Niveau B', () => {
    const r = getEntityRahmen('keel-arbeiter', CapabilityNiveau.B)!
    expect(r.runtime).toBe('keel-harness')
    expect(r.capabilityNiveau).toBe(CapabilityNiveau.B)
  })

  it('nennt kein Modell — das entscheidet der Zuordnungsplatz', () => {
    // Zwei Antworten auf eine Frage sind eine zu viel. Der Platz sitzung:niveau-b ist die eine.
    for (const n of [CapabilityNiveau.A, CapabilityNiveau.B, CapabilityNiveau.C]) {
      expect(getEntityRahmen('keel-arbeiter', n)!.model).toBe('')
    }
  })

  it('hat einen nicht-leeren Body und steht im Launcher-Katalog', () => {
    expect(getEntityDefinition('keel-arbeiter', CapabilityNiveau.B)!.body.length).toBeGreaterThan(0)
    expect(isKnownPresetId('keel-arbeiter')).toBe(true)
  })
})
```

`tests/harness/praefix-quelle.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { assemblePraefixTeile } from '../../src/main/harness-praefix-quelle'

describe('assemblePraefixTeile', () => {
  it('ohne Entitaet gelten die Hausvorgaben — das Harness-Fenster bleibt, wie es war', () => {
    const t = assemblePraefixTeile('Finde X', [])
    expect(t.body).toContain('Projektverzeichnis')
    expect(t.persona).toBe('')
    expect(t.capabilities).toBe('')
    expect(t.auftragstext).toBe('Finde X')
  })

  it('mit Entitaet gewinnt deren Body, Persona und Faehigkeitstext', () => {
    const t = assemblePraefixTeile('Finde X', [], {
      body: 'ENTITAETS-BODY', persona: 'PERSONA',
      capabilities: 'FAEHIGKEITEN', globaleRegeln: '## Regeln\n\nR',
    })
    expect(t.body).toBe('ENTITAETS-BODY')
    expect(t.persona).toBe('PERSONA')
    expect(t.capabilities).toBe('FAEHIGKEITEN')
    expect(t.globaleRegeln).toBe('## Regeln\n\nR')
    // Der Auftragstext kommt nie aus der Entitaet — er ist die Sache des Laufs.
    expect(t.auftragstext).toBe('Finde X')
  })
})
```

- [ ] **Step 2: Tests laufen lassen, Rot sehen**

Run: `npx vitest run tests/preset/keel-arbeiter.test.ts tests/harness/praefix-quelle.test.ts`
Expected: FAIL — Entität unbekannt; dritter Parameter existiert nicht.

- [ ] **Step 3: `harness-praefix-quelle.ts` um die Naht erweitern**

```ts
import type { EntitaetsTeile } from './agent/agent-adapter'

/**
 * Die Faehigkeiten kommen als Argument herein … (bestehender Kommentar bleibt)
 *
 * `entitaet` ist die Naht, die der Modulkopf seit je ankuendigt: weggelassen gelten die
 * Hausvorgaben unten — das ist der Weg des Harness-Fensters und bleibt unveraendert. Gesetzt
 * kommen Body, Persona, Faehigkeitstext und Hausregeln aus getEntityDefinition, und der Lauf
 * traegt die Anweisungen der Entitaet, in deren Zelle er faehrt.
 *
 * Der `auftragstext` kommt **nie** von dort. Er ist die Sache des Laufs, nicht der Entitaet.
 */
export function assemblePraefixTeile(
  auftragstext: string, faehigkeiten: Faehigkeit[], entitaet?: EntitaetsTeile,
): PraefixTeile {
  return {
    body: entitaet?.body ?? BODY,
    capabilities: entitaet?.capabilities ?? '',
    persona: entitaet?.persona ?? '',
    globaleRegeln: entitaet?.globaleRegeln ?? `## Regeln\n\n${REGELN}`,
    auftragstext,
    faehigkeiten,
  }
}
```

- [ ] **Step 4: Preset anlegen**

`src/main/preset/keel-arbeiter/ka-body.md`:

```markdown
Du bist ein Arbeiter in keels eigener Schleife. Du bekommst einen Auftrag, arbeitest ihn ab
und lieferst am Ende ein Ergebnis in Vertragsform.

Du kannst lesen, im Projekt suchen, den Knowledge-Graph abfragen und im Netz recherchieren.
Du kannst nichts schreiben und nichts ausfuehren. Wenn ein Auftrag eine Schreibhandlung
verlangt, sagst du das, statt es zu umgehen.

Lies eine Faehigkeit, bevor du sie benutzt. Der Name im Praefix ist nicht ihr Inhalt.

Belege schlagen Behauptungen: Nenne Datei und Zeile, wenn du etwas ueber den Code sagst, und
die Quelle, wenn du etwas aus dem Netz sagst. Was du nicht geprueft hast, sagst du nicht.

Wird ein Werkzeug abgelehnt, nenne die Ablehnung in deiner Antwort. Sie zu umgehen ist keine
Loesung, sondern ein zweiter Fehler.

Ein Teilergebnis mit benannter Luecke ist besser als ein vollstaendig klingendes, das raet.
```

`src/main/preset/keel-arbeiter/ka-preset.ts`:

```ts
/**
 * keel-arbeiter — die Niveau-B-Zelle im Gitter.
 *
 * `rollenTyp: BeauftragteInstanz`: die Zelle bekommt einen Auftrag und arbeitet ihn ab — heute
 * vom Menschen im Auftragsfeld, spaeter von einer starken Sitzung ueber SESSION_AUFTRAG.
 *
 * **`model` ist absichtlich leer, auf jedem Niveau.** Das Modell kommt aus dem Zuordnungsplatz
 * `sitzung:niveau-b` (model/slots.ts). Traegt hier jemand ein `provider:model` nach, gibt es
 * zwei Antworten auf eine Frage, und die zweite ist die, die beim naechsten Umbau vergessen
 * wird. tests/preset/keel-arbeiter.test.ts haelt das Feld leer.
 */

import { RollenTyp } from '../schema'
import { CapabilityNiveau } from '../niveau'
import type { PresetRahmen } from '../schema'

export function createKaRahmen(niveau: CapabilityNiveau): PresetRahmen {
  return {
    id: 'keel-arbeiter',
    name: 'keel-Arbeiter',
    rollenTyp: RollenTyp.BeauftragteInstanz,
    phasenBindung: [],
    capabilityAnbindung: [],
    graphAnbindung: { lesen: true, schreiben: false },
    personaVorgabe: '',
    runtime: 'keel-harness',
    model: '',
    capabilityNiveau: niveau,
    harnessBindung: '',
  }
}

export const KA_RAHMEN: PresetRahmen = createKaRahmen(CapabilityNiveau.B)
```

`src/main/preset/bodies.ts`: `import kaBody from './keel-arbeiter/ka-body.md?raw'` und `export const KA_BODY: string = kaBody`.

`src/main/preset/registry.ts`, in `ENTITIES`: `'keel-arbeiter': { rahmen: createKaRahmen, body: KA_BODY },`.

`src/shared/preset-catalog.ts`, als Eintrag:

```ts
  {
    id: 'keel-arbeiter',
    label: 'keel-Arbeiter (Niveau B)',
    description: 'Ein Auftrag, keels eigene Schleife, lokales oder billiges Modell',
  },
```

- [ ] **Step 5: Tests laufen lassen, Grün sehen**

Run: `npx vitest run tests/preset/ tests/harness/praefix-quelle.test.ts && npm run typecheck`
Expected: PASS. **Achtung:** `tests/preset-schema.test.ts` und Tests, die über `listEntityIds()` laufen, können auf einer festen Anzahl von Entitäten bestehen. Falls dort eine Zahl steht, wird sie angepasst und der Grund in den Kommentar geschrieben — nicht der Katalog verkleinert.

- [ ] **Step 6: Commit**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/preset src/shared/preset-catalog.ts src/main/harness-praefix-quelle.ts tests/preset tests/harness/praefix-quelle.test.ts
git commit -m "feat(preset): keel-arbeiter, und die Naht zur Preset-Schicht ist gefuellt"
```

---

## Task 6: Das Zellenregister und der Fork in `SESSION_CREATE`

**Files:**
- Create: `src/main/session/schleifen-sitzungen.ts`, `src/main/session/schleifen-start.ts`
- Modify: `src/main/ipc-handlers.ts:158-306` (SESSION_CREATE, SESSION_DESTROY)
- Modify: `src/shared/ipc-channels.ts` (nichts Neues hier — `SESSION_STATUS_CHANGED` existiert bereits als Deklaration)
- Test: `tests/session/schleifen-sitzungen.test.ts`, `tests/session/schleifen-start.test.ts` (beide neu)

**Interfaces:**
- Consumes: `istSchleifenAdapter`, `EntitaetsTeile` (Task 1); `eintragFuerSitzung` (Task 2); `KeelHarnessAdapter` (Task 4); `getEntityDefinition` (bestehend).
- Produces: `SchleifenZelle`, `zellenRegister` (Map-Wrapper mit `setze`/`hole`/`entferne`/`alle`), `pruefeZelleFrei(name, register)`, `baueSchleifenSitzung(args)`.

> **Befund, der in den Commit gehört:** `SESSION_STATUS_CHANGED` ist in `src/shared/ipc-channels.ts:16` deklariert und steht in der `MainToRendererChannel`-Union, hat aber **heute weder Sender noch Hörer** (`grep -rn "SESSION_STATUS_CHANGED" src` findet nur die Deklaration). Diese Aufgabe ist sein erster Verbraucher. Die Spec sagt „den Kanal gibt es bereits" — das stimmt als Deklaration, nicht als Verdrahtung.

- [ ] **Step 1: Die Tests schreiben**

`tests/session/schleifen-sitzungen.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { neuesRegister, pruefeZelleFrei } from '../../src/main/session/schleifen-sitzungen'

const zelle = (over: Partial<any> = {}) => ({
  name: 'z1', wurzel: '/p', entityId: 'keel-arbeiter', eintragId: 'm1',
  zustand: 'leerlaufend' as const, laufId: null, letzterEndzustand: null, ...over,
})

describe('das Zellenregister', () => {
  it('nimmt einen Auftrag an, solange die Zelle leerlaeuft', () => {
    const r = neuesRegister()
    r.setze(zelle())
    expect(pruefeZelleFrei('z1', r).ok).toBe(true)
  })

  it('lehnt einen zweiten Auftrag benannt ab, solange einer faehrt', () => {
    const r = neuesRegister()
    r.setze(zelle({ zustand: 'laeuft', laufId: 'l1' }))
    const p = pruefeZelleFrei('z1', r)
    expect(p.ok).toBe(false)
    // Benannt, nicht still verworfen: der Auftrag darf nicht verschwinden, ohne dass es jemand
    // erfaehrt — dieselbe Form wie pruefeLaufLaeuftNicht.
    if (!p.ok) expect(p.meldung).toContain('laeuft bereits')
  })

  it('lehnt einen Auftrag an eine unbekannte Zelle benannt ab', () => {
    const p = pruefeZelleFrei('gibtsnicht', neuesRegister())
    expect(p.ok).toBe(false)
    if (!p.ok) expect(p.meldung).toContain('gibtsnicht')
  })

  it('behaelt die laufId, wenn die Zelle leerlaeuft — weiterOderFrisch braucht sie', () => {
    const r = neuesRegister()
    r.setze(zelle({ zustand: 'laeuft', laufId: 'l1' }))
    r.setzeZustand('z1', 'leerlaufend', 'ziel-erreicht')
    expect(r.hole('z1')!.laufId).toBe('l1')
    expect(r.hole('z1')!.letzterEndzustand).toBe('ziel-erreicht')
  })
})
```

`tests/session/schleifen-start.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { baueSchleifenSitzung } from '../../src/main/session/schleifen-start'
import { CapabilityNiveau } from '../../src/main/preset/niveau'

const def = {
  id: 'keel-arbeiter', body: 'BODY', persona: null,
  rahmen: { capabilityNiveau: CapabilityNiveau.B } as any,
}
const eintrag = { id: 'm1', art: 'local-http' } as any

describe('baueSchleifenSitzung', () => {
  it('scheitert benannt ohne Registry-Eintrag', () => {
    const e = baueSchleifenSitzung({ name: 'z1', cwd: '/p', entityId: 'keel-arbeiter', def, eintrag: null })
    expect(e.ok).toBe(false)
    if (!e.ok) expect(e.meldung).toContain('Einstellungen')
  })

  it('baut Zelle und Praefixteile aus der Entitaetsdefinition', () => {
    const e = baueSchleifenSitzung({ name: 'z1', cwd: '/p', entityId: 'keel-arbeiter', def, eintrag })
    expect(e.ok).toBe(true)
    if (e.ok) {
      expect(e.zelle.zustand).toBe('leerlaufend')
      expect(e.zelle.laufId).toBeNull()
      expect(e.zelle.eintragId).toBe('m1')
      expect(e.praefix.body).toBe('BODY')
      expect(e.praefix.persona).toBe('')
    }
  })
})
```

- [ ] **Step 2: Tests laufen lassen, Rot sehen**

Run: `npx vitest run tests/session/schleifen-sitzungen.test.ts tests/session/schleifen-start.test.ts`
Expected: FAIL — beide Module fehlen.

- [ ] **Step 3: Das Register schreiben**

`src/main/session/schleifen-sitzungen.ts`:

```ts
/**
 * schleifen-sitzungen — die Gitterzellen von keels eigener Schleife.
 *
 * **Der Zustand hat genau eine Quelle, und das ist Absicht.** Der naheliegende Weg waere, die
 * Zelle im Renderer aus dem Ereignisstrom abzuleiten (run.started -> laeuft, run.finished ->
 * leerlaufend). Der Hauptprozess braucht den Zustand aber ohnehin, um einen zweiten Auftrag
 * abzulehnen, solange einer faehrt. Dann wuessten ihn zwei Stellen — und das ist die
 * Fehlersorte, die diese Strecke dreimal bezahlt hat (aufgeschobenesLaden, klemmeMaxZeichen,
 * WORKER_TIMEOUT_MS). Also fuehrt der Hauptprozess ihn, und der Renderer leitet nichts ab.
 */

export type Zellenzustand = 'leerlaufend' | 'laeuft'

export interface SchleifenZelle {
  name: string
  wurzel: string
  entityId: string
  /** Der Registry-Eintrag, mit dem diese Zelle gestartet wurde. */
  eintragId: string
  zustand: Zellenzustand
  /**
   * Der laufende Lauf — oder, im Zustand `leerlaufend`, der zuletzt gefahrene. `null` nur,
   * solange die Zelle noch keinen Auftrag hatte. Beides in einem Feld, weil `weiterOderFrisch`
   * genau den letzten Lauf braucht; ein zweites Feld „letzteLaufId" waere dieselbe Zahl an zwei
   * Stellen.
   */
  laufId: string | null
  letzterEndzustand: string | null
}

export interface Zellenregister {
  setze(z: SchleifenZelle): void
  hole(name: string): SchleifenZelle | undefined
  entferne(name: string): void
  alle(): SchleifenZelle[]
  setzeZustand(name: string, zustand: Zellenzustand, endzustand?: string | null): void
  setzeLauf(name: string, laufId: string): void
}

export function neuesRegister(): Zellenregister {
  const zellen = new Map<string, SchleifenZelle>()
  return {
    setze: (z) => { zellen.set(z.name, z) },
    hole: (name) => zellen.get(name),
    entferne: (name) => { zellen.delete(name) },
    alle: () => [...zellen.values()],
    setzeZustand: (name, zustand, endzustand) => {
      const z = zellen.get(name)
      if (!z) return
      z.zustand = zustand
      if (endzustand !== undefined) z.letzterEndzustand = endzustand
    },
    setzeLauf: (name, laufId) => {
      const z = zellen.get(name)
      if (!z) return
      z.laufId = laufId
      z.zustand = 'laeuft'
    },
  }
}

/**
 * Rein, damit ein Test sie fahren kann — kein Test in diesem Repo erreicht ipcMain. Dasselbe
 * Muster wie pruefeAnhaenge und pruefeLaufLaeuftNicht in harness-handlers.ts.
 */
export function pruefeZelleFrei(
  name: string, register: Zellenregister,
): { ok: true; zelle: SchleifenZelle } | { ok: false; meldung: string } {
  const zelle = register.hole(name)
  if (!zelle) {
    return { ok: false, meldung: `Es gibt keine Niveau-B-Zelle '${name}'.` }
  }
  if (zelle.zustand === 'laeuft') {
    return {
      ok: false,
      meldung: `In der Zelle '${name}' laeuft bereits ein Auftrag. Warte, bis er fertig ist, ` +
        `oder brich ihn ab — dein Auftrag ist nicht verloren.`,
    }
  }
  return { ok: true, zelle }
}
```

- [ ] **Step 4: Den reinen Zusammenbau schreiben**

`src/main/session/schleifen-start.ts`:

```ts
/**
 * schleifen-start — was aus einer Entitaetsdefinition und einem Registry-Eintrag wird.
 *
 * Rein: kein electron, kein IO, kein Zugriff auf configStore. Alles kommt als Argument herein,
 * damit ein Test **diese** Konstruktion fahren kann statt eines Nachbaus. Der Nachbau in
 * werkzeugliste.test.ts war gruen, waehrend die halbe Liste nicht verdrahtet war.
 */

import type { EntitaetsTeile } from '../agent/agent-adapter'
import type { SchleifenZelle } from './schleifen-sitzungen'
import type { ModellEintrag } from '../model/entry'
import type { EntityDefinition } from '../preset/registry'
import { getGlobalRules } from '../preset/global-rules'

export function baueSchleifenSitzung(args: {
  name: string
  cwd: string
  entityId: string
  def: EntityDefinition
  /** Aus dem Zuordnungsplatz sitzung:niveau-b. null heisst: der Platz ist leer. */
  eintrag: ModellEintrag | null
}):
  | { ok: true; zelle: SchleifenZelle; praefix: EntitaetsTeile }
  | { ok: false; meldung: string } {
  if (!args.eintrag) {
    // Kein Rueckfall, und das ist die Entscheidung: der naechstliegende waere llm.worker, und
    // das ist ein Ein-Schuss-Endpunkt fuer einen einzelnen Job, keine Sitzung.
    return {
      ok: false,
      meldung:
        'Der Platz „Sitzung „Niveau B"" ist nicht belegt — ohne Modell startet keine ' +
        'Niveau-B-Zelle. Einstellungen → Modelle.',
    }
  }
  return {
    ok: true,
    zelle: {
      name: args.name, wurzel: args.cwd, entityId: args.entityId,
      eintragId: args.eintrag.id, zustand: 'leerlaufend',
      laufId: null, letzterEndzustand: null,
    },
    praefix: {
      body: args.def.body,
      persona: args.def.persona ?? '',
      // Leer, solange das Preset keine Faehigkeitspakete traegt. Ein Platzhaltertext waere ein
      // Byte im stabilen Praefix, das nichts sagt.
      capabilities: '',
      globaleRegeln: getGlobalRules(args.def.rahmen.capabilityNiveau),
    },
  }
}
```

> **Nachgeprüft am 2026-08-23:** `getGlobalRules(niveau: CapabilityNiveau): string` (`src/main/preset/global-rules.ts:50`) gibt je Niveau einen fertigen Textblock zurück — er wandert unverändert in `globaleRegeln`, keine zweite Formung.

- [ ] **Step 5: `SESSION_CREATE` verzweigen**

In `src/main/ipc-handlers.ts` das `isAvailable`-Tor ersetzen:

```ts
      if (!adapter.isAvailable()) {
        return {
          id: null, name: null,
          // Der Adapter weiss, warum er nicht kann. Bis hierher stand hier eine
          // Sonderbehandlung fuer 'claude-code' an der Stelle mit den wenigsten
          // Informationen darueber (Task 1).
          error: adapter.nichtVerfuegbarGrund()
            ?? `Adapter '${adapter.displayName}' ist nicht verfuegbar — Sitzung nicht gestartet`,
        }
      }
```

und hinter `const def = getEntityDefinition(...)` den Fork einziehen, **vor** `materialiseCapabilities`:

```ts
      // Ab hier trennen sich die beiden Sitzungsarten. Der Schleifen-Weg schreibt weder
      // .claude/capabilities/ ins Projekt noch eine Prompt-Datei: beides existiert fuer ein CLI,
      // das dort nachliest. keels Schleife bekommt den zusammengesetzten Body ueber den stabilen
      // Praefix (harness-praefix-quelle.ts), und dieselben Dateien ins Projekt zu schreiben waere
      // eine Nebenwirkung ohne Verbraucher.
      if (istSchleifenAdapter(adapter)) {
        const gebaut = baueSchleifenSitzung({
          name, cwd, entityId, def, eintrag: eintragFuerSitzung('niveau-b'),
        })
        if (!gebaut.ok) return { id: null, name: null, error: gebaut.meldung }
        schleifenZellen.setze(gebaut.zelle)
        praefixJeZelle.set(name, gebaut.praefix)
        if (ctx && services.graphWriter) {
          try {
            writeSessionNode(services.graphWriter, { ...ctx, name })
          } catch (err) {
            console.warn('[ipc] session node write failed:', err)
          }
        }
        return { id: name, name, error: null, sitzungsart: 'eigene-schleife', hinweis: null }
      }
```

Modulweit neben `activeGridWindow`:

```ts
const schleifenZellen = neuesRegister()
/**
 * Die Praefixteile je Zelle, aus deren Entitaetsdefinition. Getrennt vom Register, weil sie den
 * Renderer nie erreichen: er sieht Ereignisse, nie einen Body, nie eine Persona (die Regel aus
 * shared/harness-types.ts gilt auch hier).
 */
const praefixJeZelle = new Map<string, EntitaetsTeile>()
```

- [ ] **Step 6: `SESSION_DESTROY` verzweigen**

```ts
  ipcMain.handle(SESSION_DESTROY, async (_event, name: string) => {
    try {
      const zelle = schleifenZellen.hole(name)
      if (zelle) {
        // Laeuft gerade einer, endet er am naechsten Zugrand — wie jeder Abbruch — und schreibt
        // sein run.finished ins Protokoll. Die Zelle ist dann schon weg; das Protokoll bleibt im
        // Harness-Fenster lesbar. Das ist ehrlicher, als die Zelle bis zum Zugende stehen zu
        // lassen und dabei so zu tun, als sei sie noch da.
        if (zelle.laufId && zelle.zustand === 'laeuft') {
          const adapter = adapterRegistry.get('keel-harness')
          if (adapter && istSchleifenAdapter(adapter)) adapter.brichAb(zelle.laufId)
        }
        schleifenZellen.entferne(name)
        praefixJeZelle.delete(name)
        return { ok: true, error: null }
      }
      services.tmux.unwatchSession(name)
      await services.tmux.killSession(name)
      removeEntityPromptFile(app.getPath('userData'), name)
      return { ok: true, error: null }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  })
```

- [ ] **Step 7: Tests laufen lassen, Grün sehen**

Run: `npx vitest run tests/session/ && npm run typecheck`
Expected: PASS. `tests/session/session-create-adapter-selection.test.ts` und `session-create-claude-gate.test.ts` fahren Attrappen-Registries; deren `getForRuntime` liefert Objekte ohne `sitzungsart`. Sie bekommen `sitzungsart: 'tmux'` — und im Kommentar den Grund, dass eine Attrappe ohne Sitzungsart in keinen Zweig fiele.

- [ ] **Step 8: Falsifikation**

`pruefeZelleFrei` das `zustand === 'laeuft'` nehmen und den Registertest laufen lassen: die zweite Erwartung muss rot werden. Zurückstellen.

- [ ] **Step 9: Commit**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/session src/main/ipc-handlers.ts tests/session
git commit -m "feat(session): das Zellenregister und der Fork in session:create"
```

---

## Task 7: `auftrag.folgend` — der Folgeauftrag in der Schleife

Der einzige Teil dieses Plans, der die Schleife selbst anfasst.

**Files:**
- Modify: `src/main/harness/ereignisse.ts:18-53` (EREIGNIS_ARTEN)
- Modify: `src/main/harness/projektion.ts:76-161` (switch)
- Modify: `src/main/harness/lauf.ts:182-204` (neben `setzeFort`)
- Modify: `src/main/harness/index.ts`
- Test: `tests/harness/folgeauftrag.test.ts` (neu), `tests/harness/verlauf-anbietervertrag.test.ts` (erweitern)

**Interfaces:**
- Produces: Ereignisart `'auftrag.folgend'` mit Nutzlast `{ auftragstext: string }`; `setzeFolgeauftrag(laufId, auftrag, u, text): Promise<void>`.

- [ ] **Step 1: Den Test schreiben, der die Adjazenzregel erzwingt**

`tests/harness/folgeauftrag.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { projiziere } from '../../src/main/harness/projektion'
import type { Ereignis } from '../../src/main/harness/ereignisse'

let n = 0
const ev = (art: Ereignis['art'], nutzlast: Record<string, unknown>): Ereignis =>
  ({ laufId: 'l1', seq: ++n, ts: '2026-08-23T10:00:00.000Z', art, nutzlast })

describe('auftrag.folgend in der Projektion', () => {
  it('wird zur eigenen Nutzer-Nachricht, wenn die letzte vom Modell kam', () => {
    const v = projiziere([
      ev('run.started', { auftragstext: 'Erster' }),
      ev('model.answered', { bloecke: [{ art: 'text', text: 'fertig' }] }),
      ev('auftrag.folgend', { auftragstext: 'Zweiter' }),
    ])
    expect(v.map(m => m.rolle)).toEqual(['nutzer', 'modell', 'nutzer'])
    expect(JSON.stringify(v[2].bloecke)).toContain('Zweiter')
  })

  /**
   * Die Falle. Ein mitten im Zug abgebrochener Lauf endet mit einer NUTZER-Nachricht (den
   * Werkzeugergebnissen). Ein Folgeauftrag als zweite Nutzer-Nachricht dahinter ist genau der
   * Fehler, der diesem Repo schon einen Abnahmelauf gekostet hat:
   * "messages.4: `tool_use` ids were found without `tool_result` blocks immediately after".
   */
  it('verschmilzt mit der letzten Nutzer-Nachricht, statt eine zweite zu oeffnen', () => {
    const v = projiziere([
      ev('run.started', { auftragstext: 'Erster' }),
      ev('model.answered', { bloecke: [{ art: 'werkzeug-aufruf', aufrufId: 'a1' }] }),
      ev('tool.intent', { aufrufId: 'a1' }),
      ev('tool.completed', { aufrufId: 'a1', inhalt: [{ art: 'text', text: 'ok' }] }),
      ev('auftrag.folgend', { auftragstext: 'Zweiter' }),
    ])
    const rollen = v.map(m => m.rolle)
    // Nirgends zwei 'nutzer' hintereinander.
    for (let i = 1; i < rollen.length; i++) {
      expect(rollen[i] === 'nutzer' && rollen[i - 1] === 'nutzer').toBe(false)
    }
    // Und der Auftrag ist trotzdem da — hinter den Werkzeugergebnissen, nicht davor.
    const letzte = v[v.length - 1]
    expect(letzte.rolle).toBe('nutzer')
    const texte = JSON.stringify(letzte.bloecke)
    expect(texte).toContain('Zweiter')
    expect(texte.indexOf('ok')).toBeLessThan(texte.indexOf('Zweiter'))
  })

  it('laesst run.started unangetastet — der erste Auftrag bleibt der erste', () => {
    const v = projiziere([
      ev('run.started', { auftragstext: 'Erster' }),
      ev('model.answered', { bloecke: [] }),
      ev('auftrag.folgend', { auftragstext: 'Zweiter' }),
    ])
    expect(JSON.stringify(v[0].bloecke)).toContain('Erster')
  })
})
```

- [ ] **Step 2: Test laufen lassen, Rot sehen**

Run: `npx vitest run tests/harness/folgeauftrag.test.ts`
Expected: FAIL — `'auftrag.folgend'` ist kein `EreignisArt`; die Projektion fällt in `default` und schreibt nichts.

- [ ] **Step 3: Die Ereignisart deklarieren**

In `src/main/harness/ereignisse.ts`, vor `'run.finished'`:

```ts
  /**
   * Nutzlast `{auftragstext}`. Ein zweiter Auftrag in denselben Lauf, wenn dessen Budgets und
   * Kontext ihn noch tragen (harness/fortsetzbarkeit.ts).
   *
   * Eigenes Ereignis und **kein** umgeschriebener Praefix: der Auftragstext steht im stabilen
   * Teil (praefix.ts, `## Auftrag`), und der muss ueber alle Zuege zeichengleich bleiben, sonst
   * verfehlt der Anbieter-Zwischenspeicher bei jedem Folgeauftrag. Ausserdem behauptete
   * `run.started` dann etwas, das der Lauf nicht tut — ein falscher Grund im Protokoll ist
   * schlimmer als eine fehlende Funktion.
   */
  'auftrag.folgend',
```

- [ ] **Step 4: Die Projektion**

In `projiziere`, als eigener `case` vor `default`:

```ts
      case 'auftrag.folgend': {
        // Erst ausspuelen: offene Intents schliessen und die Werkzeugergebnisse als
        // Nutzer-Nachricht schreiben. Danach steht der Auftrag *hinter* ihnen, nie davor —
        // dieselbe Adjazenzregel, der `nachgeladenes` folgt.
        ergebnisseAusspuelen(true)
        const block: Block = { art: 'text', text: String(e.nutzlast.auftragstext ?? '') }
        const letzte = verlauf[verlauf.length - 1]
        if (letzte && letzte.rolle === 'nutzer') {
          // Zwei Nutzer-Nachrichten hintereinander lehnt Anthropic ab. Ein Lauf, der mitten im
          // Zug abbrach, endet genau so — deshalb wird angehaengt statt aufgemacht.
          letzte.bloecke.push(block)
        } else {
          verlauf.push({ rolle: 'nutzer', bloecke: [block] })
        }
        break
      }
```

- [ ] **Step 5: `setzeFolgeauftrag` in `lauf.ts`**

Direkt hinter `setzeFort`:

```ts
/**
 * Ein zweiter Auftrag in denselben Lauf. **Neben** setzeFort und nicht darin: setzeFort heisst
 * „derselbe Auftrag nach einem Abriss", und ihm eine zweite Bedeutung zu geben, waere eine
 * Funktion, die zwei Dinge heisst.
 *
 * `auftrag` ist der **urspruengliche** aus auftragAusProtokoll — Budgets und modellId kommen
 * von dort, nicht aus einem zweiten Zusammenbau. `u.praefixTeile.auftragstext` bleibt ebenfalls
 * der erste: der stabile Teil muss zeichengleich bleiben, und der Folgeauftrag steht im Verlauf.
 *
 * Ein Lauf, der schon ein run.finished traegt, bekommt am Ende ein zweites. laufUebersicht liest
 * ohnehin das letzte, also traegt die Uebersicht das ohne Aenderung.
 */
export async function setzeFolgeauftrag(
  laufId: string, auftrag: Auftrag, u: LaufUmgebung, text: string,
): Promise<void> {
  try {
    pruefeStartbedingungen(u.eintrag)
  } catch (err) {
    beende(u, laufId, lesen(u.db, laufId), {
      code: 'auftrag-unvereinbar', endzustand: 'abgebrochen',
      anweisung: err instanceof Error ? err.message : String(err),
    }, '')
    return
  }
  schreibe(u, laufId, 'auftrag.folgend', { auftragstext: text })
  await fahre(laufId, auftrag, u)
}
```

`src/main/harness/index.ts`: `setzeFolgeauftrag` im `export { … } from './lauf'` ergänzen.

- [ ] **Step 6: Tests laufen lassen, Grün sehen**

Run: `npx vitest run tests/harness/ && npm run typecheck`
Expected: PASS. `tests/harness/verlauf-anbietervertrag.test.ts` bekommt denselben Abbruch-Fall als eigenen Testfall, damit die Regel dort steht, wo sie schon für Schema und Fähigkeit steht.

- [ ] **Step 7: Falsifikation — die wichtigste dieses Plans**

Im `case 'auftrag.folgend'` den Verschmelzungszweig entfernen (immer `verlauf.push`) und `npx vitest run tests/harness/folgeauftrag.test.ts` laufen lassen: der zweite Fall muss rot werden mit zwei `'nutzer'` hintereinander. **Was zu sehen war, kommt wörtlich in die Commit-Nachricht.** Zurückstellen.

- [ ] **Step 8: Commit**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/harness tests/harness
git commit -m "feat(harness): auftrag.folgend — ein zweiter Auftrag ohne umgeschriebenen Praefix"
```

---

## Task 8: `weiterOderFrisch`

**Files:**
- Create: `src/main/harness/fortsetzbarkeit.ts`
- Modify: `src/main/harness/index.ts`
- Modify: `docs/anpassbare-flaechen.md`
- Test: `tests/harness/fortsetzbarkeit.test.ts` (neu)

**Interfaces:**
- Consumes: `pruefeBudgets`, `Budgets`, `verbrauchAusEreignissen` (bestehend).
- Produces: `FOLGE_RESERVE`, `weiterOderFrisch(ereignisse, modellId, budgets, nutzbaresKontextfenster, jetztMs): { weiter: boolean; grund: string }`.

- [ ] **Step 1: Den Test schreiben**

`tests/harness/fortsetzbarkeit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { weiterOderFrisch, FOLGE_RESERVE } from '../../src/main/harness/fortsetzbarkeit'
import type { Ereignis } from '../../src/main/harness/ereignisse'

const BUDGETS = { runden: 12, wanduhrMs: 900_000, kostenCent: 200, kontextAnteil: 0.8 }
const FENSTER = 32_000
const START = Date.parse('2026-08-23T10:00:00.000Z')

let n = 0
const ev = (art: Ereignis['art'], nutzlast: Record<string, unknown>, ts = START): Ereignis =>
  ({ laufId: 'l1', seq: ++n, ts: new Date(ts).toISOString(), art, nutzlast })

const antwort = (eingabeToken: number) =>
  ev('model.answered', { usage: { eingabeToken, ausgabeToken: 100 } })

describe('weiterOderFrisch', () => {
  it('fuehrt fort, solange in jedem Budget Reserve steht', () => {
    const e = [ev('run.started', {}), antwort(2_000)]
    const r = weiterOderFrisch(e, 'm1', BUDGETS, FENSTER, START + 10_000)
    expect(r.weiter).toBe(true)
  })

  it('faengt frisch an, wenn der Kontext zu voll ist', () => {
    // Schwelle bei Reserve: 32000 * 0.8 * (1 - FOLGE_RESERVE)
    const knapp = Math.ceil(FENSTER * BUDGETS.kontextAnteil * (1 - FOLGE_RESERVE)) + 1
    const e = [ev('run.started', {}), antwort(knapp)]
    const r = weiterOderFrisch(e, 'm1', BUDGETS, FENSTER, START + 10_000)
    expect(r.weiter).toBe(false)
    expect(r.grund).toContain('Kontext')
  })

  /**
   * Der Punkt, den nur ein Kontexttest verfehlen wuerde: ein fortgesetzter Lauf ERBT Runden,
   * Zeit und Kosten, weil verbrauchAusEreignissen kumulativ zaehlt. Genau die Fehlersorte, die
   * diese Strecke dreimal bezahlt hat — eine Zahl, die fuer einen Verbraucher richtig war, gilt
   * fuer den zweiten nicht.
   */
  it('faengt frisch an, wenn die Runden knapp sind, obwohl der Kontext leer ist', () => {
    const noetig = Math.ceil(BUDGETS.runden * (1 - FOLGE_RESERVE))
    const e: Ereignis[] = [ev('run.started', {})]
    for (let i = 0; i < noetig; i++) e.push(antwort(10))
    const r = weiterOderFrisch(e, 'm1', BUDGETS, FENSTER, START + 1_000)
    expect(r.weiter).toBe(false)
    expect(r.grund).toContain('Rundenbudget')
  })

  it('faengt frisch an, wenn die Wanduhr knapp ist', () => {
    const e = [ev('run.started', {}), antwort(10)]
    const spaet = START + Math.ceil(BUDGETS.wanduhrMs * (1 - FOLGE_RESERVE))
    expect(weiterOderFrisch(e, 'm1', BUDGETS, FENSTER, spaet).weiter).toBe(false)
  })

  it('faengt frisch an, wenn es gar keinen vorherigen Lauf gibt', () => {
    expect(weiterOderFrisch([], 'm1', BUDGETS, FENSTER, START).weiter).toBe(false)
  })
})
```

- [ ] **Step 2: Test laufen lassen, Rot sehen**

Run: `npx vitest run tests/harness/fortsetzbarkeit.test.ts`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: Implementieren**

```ts
/**
 * fortsetzbarkeit — ob ein zweiter Auftrag in denselben Lauf darf.
 *
 * **Es erfindet keine zweite Budgetlogik.** Es fragt die bestehende (`pruefeBudgets`) mit
 * knapperem Mass: waere dieser Lauf schon im Abschlussverhalten, wenn seine Budgets um
 * FOLGE_RESERVE kleiner waeren? Dann traegt er keinen zweiten Auftrag mehr.
 *
 * Geprueft werden **alle vier** Budgets, nicht nur der Kontext: ein fortgesetzter Lauf erbt
 * Runden, Zeit und Kosten, weil verbrauchAusEreignissen kumulativ zaehlt.
 *
 * Damit steht nirgends eine Modellgroesse. Das 27B mit knappem Fenster faellt nach einem echten
 * Lauf auf `frisch`; ein Modell mit grossem Fenster und leichtem Auftrag fuehrt fort. Der
 * Schalter ist die Messung, nicht der Modellname.
 */

import type { Ereignis } from './ereignisse'
import { pruefeBudgets, type Budgets } from './budget'
import { verbrauchAusEreignissen } from './verbrauch'

/**
 * Wie viel jedes Budgets frei sein muss, damit ein Folgeauftrag hineindarf.
 *
 * **Geschaetzt, nicht gemessen.** Ein Viertel ist die Groessenordnung, in der ein Auftrag noch
 * mehr als eine Runde bekommt, ohne dass ein Lauf zur Dauereinrichtung wird. Wer das nachmisst,
 * ersetzt diesen Absatz durch die Zahl und das Datum — und nicht umgekehrt.
 */
export const FOLGE_RESERVE = 0.25

export function weiterOderFrisch(
  ereignisse: Ereignis[], modellId: string, budgets: Budgets,
  nutzbaresKontextfenster: number, jetztMs: number,
): { weiter: boolean; grund: string } {
  // Ohne run.started gibt es keinen Lauf, in den etwas hineinkoennte. Das ist kein Fehler,
  // sondern der Normalfall der ersten Beauftragung einer Zelle.
  if (!ereignisse.some(e => e.art === 'run.started')) {
    return { weiter: false, grund: 'Die Zelle hat noch keinen Lauf.' }
  }

  const knapp: Budgets = {
    runden: budgets.runden * (1 - FOLGE_RESERVE),
    wanduhrMs: budgets.wanduhrMs * (1 - FOLGE_RESERVE),
    kostenCent: budgets.kostenCent * (1 - FOLGE_RESERVE),
    kontextAnteil: budgets.kontextAnteil * (1 - FOLGE_RESERVE),
  }
  const verbrauch = verbrauchAusEreignissen(ereignisse, modellId, jetztMs)
  const grund = pruefeBudgets(knapp, verbrauch, nutzbaresKontextfenster)
  if (grund) return { weiter: false, grund: grund.anweisung }
  return { weiter: true, grund: '' }
}
```

`src/main/harness/index.ts`: `export { weiterOderFrisch, FOLGE_RESERVE } from './fortsetzbarkeit'`.

- [ ] **Step 4: Tests laufen lassen, Grün sehen**

Run: `npx vitest run tests/harness/fortsetzbarkeit.test.ts tests/harness/waechter-kern.test.ts`
Expected: PASS — inklusive des Wächters, dass `fortsetzbarkeit.ts` kein `electron` importiert.

- [ ] **Step 5: Falsifikation**

`FOLGE_RESERVE` auf `0` setzen: der Runden- und der Wanduhr-Fall müssen rot werden (bei Reserve 0 ist „knapp" gleich „erschöpft"). Zurückstellen.

- [ ] **Step 6: `docs/anpassbare-flaechen.md` und commit**

Eintrag im Abschnitt für nicht-editierbare Flächen:

```
| `FOLGE_RESERVE` (`src/main/harness/fortsetzbarkeit.ts`) | Wie viel Budget frei sein muss, damit ein Folgeauftrag in denselben Lauf geht statt einen neuen zu oeffnen | nein | nein — geschaetzt, nicht gemessen |
```

```bash
npm test && npm run typecheck && npm run lint
git add src/main/harness tests/harness/fortsetzbarkeit.test.ts docs/anpassbare-flaechen.md
git commit -m "feat(harness): weiterOderFrisch — die Entscheidung fragt pruefeBudgets, statt sie zu wiederholen"
```

---

## Task 9: `SESSION_AUFTRAG` — der Kanal, der alles verbindet

**Files:**
- Modify: `src/shared/ipc-channels.ts` (Konstante + `RendererToMainChannel`)
- Modify: `src/main/harness-sitzung.ts` (`beauftrageSchleife`, `markiereAbbruch`)
- Modify: `src/main/ipc-handlers.ts` (Handler)
- Test: `tests/session/session-auftrag.test.ts` (neu)

**Interfaces:**
- Consumes: `pruefeZelleFrei`, `Zellenregister` (Task 6); `weiterOderFrisch` (Task 8); `setzeFolgeauftrag` (Task 7); `starteHarnessLauf`, `baueLaufUmgebung`, `auftragAusProtokoll`, `STANDARD_BUDGETS`, `harnessDb`, `lesen` (Task 3).
- Produces: `SESSION_AUFTRAG = 'session:auftrag'`; `beauftrageSchleife(opts: SchleifenStartOpts, services): Promise<SchleifenStartErgebnis>`; `markiereAbbruch(laufId): void`.

- [ ] **Step 1: Den Kanal deklarieren**

`src/shared/ipc-channels.ts`, bei den Session-Kanälen:

```ts
/**
 * Ein Auftrag an eine Niveau-B-Gitterzelle. Getrennt von SESSION_CREATE, weil eine Zelle ein
 * Platz ist und ein Auftrag ein Ereignis: dieselbe Zelle nimmt nacheinander mehrere an.
 * Nutzlast `{ name, auftragstext }`, Antwort `HarnessAntwort<{ laufId, fortgesetzt }>`.
 */
export const SESSION_AUFTRAG = 'session:auftrag' as const
```

und `| typeof SESSION_AUFTRAG` in die `RendererToMainChannel`-Union. **Ohne den Union-Eintrag kommt der Kanal an der typisierten Brücke (`src/preload.ts`) nicht durch** — die Konstante allein reicht nicht.

- [ ] **Step 2: Den Test schreiben**

`tests/session/session-auftrag.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { neuesRegister, pruefeZelleFrei } from '../../src/main/session/schleifen-sitzungen'

/**
 * Kein Test in diesem Repo erreicht ipcMain. Geprueft wird deshalb die reine Kette, die der
 * Handler fahren MUSS — und der Beweis, dass er sie wirklich faehrt, ist der Lauf durch die
 * App (Task 11). Gruene Tests sagen hier nichts ueber eine Verdrahtung.
 */
describe('die Kette hinter session:auftrag', () => {
  it('eine laufende Zelle nimmt keinen zweiten Auftrag an', () => {
    const r = neuesRegister()
    r.setze({
      name: 'z1', wurzel: '/p', entityId: 'keel-arbeiter', eintragId: 'm1',
      zustand: 'laeuft', laufId: 'l1', letzterEndzustand: null,
    })
    expect(pruefeZelleFrei('z1', r).ok).toBe(false)
  })

  it('nach dem Lauf ist die Zelle wieder frei und behaelt ihre laufId', () => {
    const r = neuesRegister()
    r.setze({
      name: 'z1', wurzel: '/p', entityId: 'keel-arbeiter', eintragId: 'm1',
      zustand: 'laeuft', laufId: 'l1', letzterEndzustand: null,
    })
    r.setzeZustand('z1', 'leerlaufend', 'ziel-erreicht')
    const p = pruefeZelleFrei('z1', r)
    expect(p.ok).toBe(true)
    if (p.ok) expect(p.zelle.laufId).toBe('l1')
  })
})
```

- [ ] **Step 3: `beauftrageSchleife` in `harness-sitzung.ts`**

```ts
/**
 * Ein Auftrag an eine Zelle. Hier — und nicht beim Aufrufer — faellt die Entscheidung zwischen
 * Folgeauftrag und frischem Lauf: sie braucht das Protokoll des letzten Laufs, und das kennt nur
 * dieses Modul.
 */
export async function beauftrageSchleife(
  opts: SchleifenStartOpts, services: AppServices,
): Promise<SchleifenStartErgebnis> {
  const eintrag = eintragNachId(opts.eintragId)
  if (!eintrag) throw new Error(`Kein Registry-Eintrag '${opts.eintragId}'.`)
  const fenster = eintrag.faehigkeiten?.nutzbaresKontextfenster ?? 0

  if (opts.letzteLaufId) {
    const ereignisse = lesen(harnessDb(), opts.letzteLaufId)
    const entscheidung = weiterOderFrisch(
      ereignisse, eintrag.id, STANDARD_BUDGETS, fenster, Date.now(),
    )
    if (entscheidung.weiter) {
      const alt = auftragAusProtokoll(ereignisse)
      if (alt) {
        const laufId = opts.letzteLaufId
        laufendeLaeufe.add(laufId)
        const u = await baueLaufUmgebung(
          laufId, eintrag, alt.auftragstext, opts.wurzel, services, () => {}, opts.praefix,
        )
        // Vor dem Start, synchron: sonst kann `beiEnde` eines kurzen Laufs vor dem Eintrag ins
        // Register liegen. Siehe SchleifenStartOpts.beiStart.
        opts.beiStart?.(laufId)
        setzeFolgeauftrag(laufId, alt, u, opts.auftragstext)
          .catch((err) => {
            console.error(
              `[harness-sitzung] Folgeauftrag in '${laufId}' endete mit einem unbehandelten ` +
              `Fehler:`, err instanceof Error ? err.message : String(err),
            )
          })
          .finally(() => {
            abbruchmarken.delete(laufId)
            laufendeLaeufe.delete(laufId)
            opts.beiEnde?.(laufId)
          })
        return { laufId, fortgesetzt: true }
      }
      // Kein rekonstruierbarer Auftrag heisst: das Protokoll traegt kein brauchbares
      // run.started. Dann ein frischer Lauf — benannt im Log, nicht still.
      console.warn(
        `[harness-sitzung] Lauf '${opts.letzteLaufId}' liefert keinen rekonstruierbaren ` +
        `Auftrag; der Folgeauftrag startet stattdessen frisch.`,
      )
    }
  }

  const laufId = randomUUID()
  opts.beiStart?.(laufId)
  await starteHarnessLauf({
    laufId, eintrag, auftragstext: opts.auftragstext, wurzel: opts.wurzel,
    services, entitaet: opts.praefix, beiEnde: () => opts.beiEnde?.(laufId),
  })
  return { laufId, fortgesetzt: false }
}

export function markiereAbbruch(laufId: string): void {
  abbruchmarken.add(laufId)
}
```

`SchleifenStartOpts` trägt `beiStart?` und `beiEnde?` bereits aus Task 1 — beide sind dort mit ihrem Grund kommentiert. Diese Aufgabe ruft sie nur.

**Der Test dazu gehört hierher**, weil das Rennen sonst niemand fängt. In `tests/session/session-auftrag.test.ts` ergänzen:

```ts
it('ein Lauf, der vor der Rueckkehr endet, laesst die Zelle nicht auf laeuft stehen', () => {
  // Das Rennen in Worten: beiStart traegt die laufId ein, beiEnde kippt zurueck. Faellt
  // beiEnde vor beiStart, steht die Zelle danach fuer immer auf 'laeuft'. Deshalb ruft
  // beauftrageSchleife beiStart SYNCHRON vor dem Schleifenstart.
  const r = neuesRegister()
  r.setze({
    name: 'z1', wurzel: '/p', entityId: 'keel-arbeiter', eintragId: 'm1',
    zustand: 'leerlaufend', laufId: null, letzterEndzustand: null,
  })
  // Reihenfolge wie im Handler: erst setzeLauf (beiStart), dann setzeZustand (beiEnde).
  r.setzeLauf('z1', 'l1')
  r.setzeZustand('z1', 'leerlaufend', 'ziel-erreicht')
  expect(r.hole('z1')!.zustand).toBe('leerlaufend')
  expect(pruefeZelleFrei('z1', r).ok).toBe(true)
})

it('das Ende eines fremden Laufs kippt die Zelle nicht', () => {
  const r = neuesRegister()
  r.setze({
    name: 'z1', wurzel: '/p', entityId: 'keel-arbeiter', eintragId: 'm1',
    zustand: 'laeuft', laufId: 'l2', letzterEndzustand: null,
  })
  // Der Id-Vergleich im Handler: nur der eigene Lauf kippt die Zelle.
  const zelle = r.hole('z1')!
  expect(zelle.laufId === 'l1').toBe(false)   // 'l1' ist der beendete, 'l2' der laufende
  expect(zelle.zustand).toBe('laeuft')
})
```

- [ ] **Step 4: Den Handler schreiben**

In `src/main/ipc-handlers.ts`:

```ts
  ipcMain.handle(SESSION_AUFTRAG, async (_e, args: { name?: string; auftragstext?: string }) => {
    const name = typeof args?.name === 'string' ? args.name : ''
    const text = typeof args?.auftragstext === 'string' ? args.auftragstext.trim() : ''
    if (text === '') return { ok: false, meldung: 'Der Auftrag ist leer.' }

    const frei = pruefeZelleFrei(name, schleifenZellen)
    if (!frei.ok) return { ok: false, meldung: frei.meldung }

    const adapter = adapterRegistry.get('keel-harness')
    if (!adapter || !istSchleifenAdapter(adapter)) {
      return { ok: false, meldung: 'Der keel-harness-Adapter ist nicht registriert.' }
    }
    const praefix = praefixJeZelle.get(name)
    if (!praefix) {
      return { ok: false, meldung: `Fuer die Zelle '${name}' liegen keine Praefixteile vor.` }
    }

    try {
      const ergebnis = await adapter.starteAuftrag({
        wurzel: frei.zelle.wurzel, sitzungsname: name, auftragstext: text,
        eintragId: frei.zelle.eintragId, praefix, letzteLaufId: frei.zelle.laufId,

        // Der Hauptprozess fuehrt den Zellenzustand — der Renderer leitet nichts aus dem
        // Ereignisstrom ab.
        //
        // beiStart, nicht der Rueckgabewert: `starteAuftrag` kehrt heim, sobald das erste
        // `run.started` steht, und der Rest faehrt im Hintergrund. Wer die laufId erst danach
        // eintruege, verloere gegen einen sehr kurzen Lauf — dessen beiEnde kippte die Zelle,
        // bevor sie je auf 'laeuft' stand, und das nachfolgende setzeLauf liesse sie fuer
        // immer darauf stehen.
        beiStart: (laufId) => {
          schleifenZellen.setzeLauf(name, laufId)
          broadcast(SESSION_STATUS_CHANGED, { name, zustand: 'laeuft', laufId })
        },

        beiEnde: (beendeterLauf) => {
          const zelle = schleifenZellen.hole(name)
          // Gehoert der beendete Lauf noch zu dieser Zelle? Nach einem Zerstoeren und
          // Neuanlegen unter demselben Namen laeuft sonst das finally des alten Laufs in die
          // neue Zelle.
          if (!zelle || zelle.laufId !== beendeterLauf) return
          const letztes = [...lesen(harnessDb(), beendeterLauf)]
            .reverse().find(e => e.art === 'run.finished')
          const endzustand = typeof letztes?.nutzlast.endzustand === 'string'
            ? letztes.nutzlast.endzustand : null
          schleifenZellen.setzeZustand(name, 'leerlaufend', endzustand)
          broadcast(SESSION_STATUS_CHANGED, { name, zustand: 'leerlaufend', endzustand })
        },
      })
      return { ok: true, wert: ergebnis }
    } catch (err) {
      // Der Start ist gescheitert, also laeuft nichts — der Zustand darf nicht auf 'laeuft'
      // stehen bleiben.
      schleifenZellen.setzeZustand(name, 'leerlaufend')
      return { ok: false, meldung: err instanceof Error ? err.message : String(err) }
    }
  })
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npx vitest run tests/session/ && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npm test && npm run typecheck && npm run lint
git add src/shared/ipc-channels.ts src/main/harness-sitzung.ts src/main/ipc-handlers.ts tests/session
git commit -m "feat(session): session:auftrag — ein Auftrag je Zelle, frisch oder fortgesetzt" -m "SESSION_STATUS_CHANGED war deklariert und hatte weder Sender noch Hoerer. Dies ist sein erster Verbraucher."
```

---

## Task 10: Die Zelle im Renderer

**Files:**
- Create: `src/renderer/components/HarnessCell.tsx`
- Modify: `src/renderer/components/SessionGrid.tsx:14-20` (SessionSlot), `:55-75` (Rendern)
- Modify: `src/renderer/index.tsx:63-91` (Slot-Anlage, Schließen), Hörer für `SESSION_STATUS_CHANGED`
- Modify: `src/renderer/components/harness/EreignisPanel.tsx` (Farbe + Kurzfassung für `auftrag.folgend`)
- Test: `tests/renderer/harness-cell.test.tsx` (neu), `tests/renderer/ereignis-panel.test.ts` (läuft bereits)

**Interfaces:**
- Consumes: `SESSION_AUFTRAG`, `SESSION_STATUS_CHANGED`, `HARNESS_EREIGNIS`.

- [ ] **Step 1: `EreignisPanel` um die neue Art erweitern, Wächter läuft schon**

Run zuerst: `npx vitest run tests/renderer/ereignis-panel.test.ts`
Expected: **FAIL** — der Wächter kennt `EREIGNIS_ARTEN` und findet `auftrag.folgend` weder in der Farbtabelle noch in der Kurzfassung. Genau dafür existiert er, seit `skill.geladen` still als leere Zeile durchfiel.

Dann in `EreignisPanel.tsx` beide Einträge ergänzen (Farbe in der Nähe von `prompt.sent`, Kurzfassung liest `nutzlast.auftragstext`), Test erneut laufen lassen: PASS.

- [ ] **Step 2: Den Zellentest schreiben — als reine Funktion, ohne DOM**

> **Nachgeprüft am 2026-08-23:** dieses Repo hat **weder `@testing-library/react` noch `jsdom`/`happy-dom`**, und `vitest.config.ts` steht auf `environment: 'node'`. Es wird **keine Abhängigkeit nachgezogen.** Stattdessen exportiert `HarnessCell.tsx` seine Entscheidungslogik als reine Funktion und die wird geprüft — genau das Muster, mit dem `tests/renderer/ereignis-panel.test.ts` `FARBE` und `kurzfassung` prüft, ohne zu rendern.

In `HarnessCell.tsx` mit exportieren:

```ts
export interface Zellenansicht {
  beauftragenMoeglich: boolean
  abbrechenMoeglich: boolean
  /** Deutsch: was im Kopf der Zelle steht. */
  zustandstext: string
}

/**
 * Rein, damit sie ohne DOM pruefbar ist — dieses Repo hat keine Browser-Testumgebung, und eine
 * dafuer nachzuziehen waere eine Abhaengigkeit fuer drei Erwartungen.
 *
 * Sie nimmt **keine** Ereignisse entgegen, und das ist die Aussage: der Zustand kommt aus dem
 * Hauptprozess. Eine Zelle, die aus `run.finished` selbst auf `leerlaufend` schloesse, waere die
 * zweite Stelle, die dieselbe Sache weiss — dreimal in dieser Strecke schiefgegangen.
 */
export function zellenansicht(
  zustand: 'leerlaufend' | 'laeuft', letzterEndzustand: string | null,
): Zellenansicht {
  if (zustand === 'laeuft') {
    return { beauftragenMoeglich: false, abbrechenMoeglich: true, zustandstext: 'laeuft' }
  }
  return {
    beauftragenMoeglich: true, abbrechenMoeglich: false,
    zustandstext: letzterEndzustand ? `bereit — zuletzt: ${letzterEndzustand}` : 'bereit',
  }
}
```

`tests/renderer/harness-cell.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { zellenansicht } from '../../src/renderer/components/HarnessCell'

describe('zellenansicht', () => {
  it('laesst beauftragen, solange die Zelle leerlaeuft', () => {
    const a = zellenansicht('leerlaufend', null)
    expect(a.beauftragenMoeglich).toBe(true)
    expect(a.abbrechenMoeglich).toBe(false)
  })

  it('sperrt Beauftragen und oeffnet Abbrechen, solange ein Auftrag faehrt', () => {
    const a = zellenansicht('laeuft', null)
    expect(a.beauftragenMoeglich).toBe(false)
    expect(a.abbrechenMoeglich).toBe(true)
  })

  it('zeigt den letzten Endzustand, ohne ihn aus Ereignissen abzuleiten', () => {
    // Die Funktion nimmt gar keine Ereignisse entgegen — das ist die Aussage, nicht ein
    // fehlender Parameter.
    expect(zellenansicht('leerlaufend', 'ziel-erreicht').zustandstext).toContain('ziel-erreicht')
    expect(zellenansicht('leerlaufend', null).zustandstext).toBe('bereit')
  })

  it('die beiden Knopfzustaende schliessen einander aus', () => {
    for (const z of ['leerlaufend', 'laeuft'] as const) {
      const a = zellenansicht(z, null)
      expect(a.beauftragenMoeglich).not.toBe(a.abbrechenMoeglich)
    }
  })
})
```

- [ ] **Step 3: Die Zelle schreiben**

`HarnessCell.tsx` mit den Props `sessionName`, `modellId`, `zustand`, `laufId`, `letzterEndzustand`, `ereignisse`, `onAuftrag`, `onAbbrechen`, `onClose`. Kopf: Name, Modell, `zustandstext`, Schließen. Mitte: `<label>Auftrag</label>` mit `<textarea>`, Knopf „Beauftragen" (`disabled={!a.beauftragenMoeglich}`), daneben „Abbrechen" (`disabled={!a.abbrechenMoeglich}`) — beide aus `zellenansicht(zustand, letzterEndzustand)`, damit die Regel genau einmal steht und die geprüfte Funktion wirklich die ist, die rendert. Unten: `<EreignisPanel ereignisse={ereignisse.filter(e => e.laufId === laufId)} />`.

Der Modulkopf hält fest:

```tsx
/**
 * HarnessCell — die Niveau-B-Zelle im Gitter.
 *
 * Sie **leitet nichts ab**. `zustand` kommt ueber SESSION_STATUS_CHANGED aus dem Hauptprozess,
 * der ihn ohnehin fuehrt, um einen zweiten Auftrag abzulehnen. Eine Zelle, die aus dem
 * Ereignisstrom selbst auf „fertig" schloesse, waere die zweite Stelle, die dieselbe Sache
 * weiss — und in dieser Strecke ist genau das dreimal schiefgegangen.
 *
 * Unterlaeufe (Rechercheur) zeigt sie nicht: die stehen unter eigener laufId und erreichen den
 * Elternlauf als `unterlauf.verbraucht` und als Werkzeugergebnis. Wer einen Unterlauf einzeln
 * aufmachen will, nimmt das Harness-Fenster.
 */
```

- [ ] **Step 4: `SessionGrid` und `index.tsx` anschließen**

`SessionSlot` wird zu:

```ts
interface SessionSlot {
  type: 'session' | 'launcher' | 'harness'
  sessionId?: string
  sessionName?: string
  status?: 'active' | 'closing' | 'stopped'
  contextUsage?: number
  /** Nur fuer type 'harness'. Gefuehrt vom Hauptprozess, nie hier abgeleitet. */
  zustand?: 'leerlaufend' | 'laeuft'
  laufId?: string | null
  letzterEndzustand?: string | null
  modellId?: string
}
```

`SessionGrid` rendert `slot.type === 'harness'` als `HarnessCell`, sonst wie bisher. `index.tsx`:

- `handleStartSession` liest das neue Feld `sitzungsart` aus der Antwort und legt bei `'eigene-schleife'` einen `type: 'harness'`-Slot an
- ein `useEffect` hört auf `SESSION_STATUS_CHANGED` und schreibt `zustand`, `laufId`, `letzterEndzustand` in den Slot
- ein `useEffect` hört auf `HARNESS_EREIGNIS` und sammelt die Ereignisse je `laufId` (gedeckelt, z.B. die letzten 500 je Lauf — **mit `log`-freiem Kommentar, dass gedeckelt wird**, damit die Grenze nicht als Vollständigkeit gelesen wird)
- `handleCloseSession` ruft weiterhin `session:destroy`; der Hauptprozess verzweigt selbst (Task 6)

- [ ] **Step 5: Tests, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer tests/renderer
git commit -m "feat(renderer): die Niveau-B-Zelle — sie zeigt Ereignisse und leitet nichts ab"
```

---

## Task 11: Der Beweis in der laufenden App

**Grüne Tests sagen in diesem Repo nichts über eine Verdrahtung.** Diese Aufgabe ist kein Nachweis für die Form, sondern für die Sache. Ohne sie ist der Schritt nicht fertig.

**Files:**
- Create: `docs/superpowers/plans/2026-08-23-keel-harness-adapter-protokoll.md`
- Modify: `README.md` (Abschnitt zum Stand)

- [ ] **Step 1: Vorbedingungen prüfen — der Prüfbefehl gilt dem Container, nicht dem Host**

```bash
curl -s http://100.78.7.108:11434/api/ps
ssh DGX docker exec ollama nvidia-smi -L
ssh DGX 'docker logs --tail 50 ollama | grep -i cuda'
```

Gesund: CUDA0-Backend, ~9 s Laden, ~31 Token/s. Auf der CPU: 53 s für einen Zug — dann ist jede Zeitangabe des Laufs wertlos, und der Lauf wird verworfen statt beschönigt.

- [ ] **Step 2: Den Platz belegen**

App starten, Einstellungen → Modelle, Platz *Sitzung „Niveau B"* auf `spark-qwen38-27b` setzen.

```bash
KEEL_KEEP_PROFILE=1 .claude/skills/run-keel/launch.sh /tmp/keel-harness
```

Profil behalten, sonst ist die Netz-Konfiguration weg. Ein React-Feld schreiben: `onBlur` hängt an `focusout`, nicht an `blur` — ein `dispatchEvent('blur')` setzt den Wert, schreibt aber nichts.

- [ ] **Step 3: Der Durchlauf**

1. Zelle aus dem Launcher starten (`keel-Arbeiter (Niveau B)`) — Screenshot
2. Auftrag geben, Ereignisse laufen sehen — Screenshot, `laufId` notieren
3. Zelle geht auf `leerlaufend`, Endzustand sichtbar — Screenshot
4. **Zweiter** Auftrag: `laufId` notieren. Bei `spark-qwen38-27b` muss sie **neu** sein — der Kontext des 27B trägt keinen Folgeauftrag. Im Protokoll des zweiten Laufs steht ein `run.started` und **kein** `auftrag.folgend`

Der CDP-Treiber kappt eine Antwort bei rund 65 KB. Bei langen Läufen im Fenster zählen, nicht das ganze Protokoll zurückgeben.

- [ ] **Step 4: Die beiden Absagen im Feld erzwingen**

1. Platz leeren, Zelle starten wollen → die benannte Absage muss in der Launcher-Zelle stehen (nicht nur in der Konsole) — Screenshot
2. Während ein Auftrag fährt, einen zweiten schicken → die benannte Absage, und der Auftragstext bleibt im Feld stehen — Screenshot

- [ ] **Step 5: Den Folgeauftrag belegen — oder benannt offenlassen**

Der `weiter`-Zweig ist mit dem 27B **nicht** im Feld erreichbar; sein Kontextfenster fällt nach einem echten Lauf auf `frisch`. Zwei ehrliche Wege, und der zweite ist keine Schande:

1. Ein Registry-Eintrag mit großem `nutzbaresKontextfenster` wird dem Platz zugewiesen, und ein zweiter Auftrag nach einem kurzen ersten läuft in **dieselbe** `laufId`, mit einem `auftrag.folgend` im Protokoll — Screenshot und beide `laufId`s
2. Ist kein solcher Endpunkt erreichbar, wird das **so** protokolliert: „Der `weiter`-Zweig ist an Einheitstests belegt und im Feld nicht gefahren, weil kein Modell mit ausreichendem Fenster angeschlossen war." Kein Beschönigen, keine Behauptung, die eine Messung vortäuscht.

- [ ] **Step 6: Aufräumen und protokollieren**

```bash
.claude/skills/run-keel/stop.sh          # immer
```

Das Protokoll hält fest: welche `laufId`s liefen, welche Screenshots es gibt, was **nicht** gefahren wurde und warum, und ob die GPU beim Lauf gesund war.

- [ ] **Step 7: README und Abschluss-Commit**

Im README fällt der Satz, dass `keel-harness` keinen Adapter hat; an seine Stelle tritt, was die Zelle kann und was sie nicht kann (kein Beauftragen von oben, keine Anhänge, kein Fortsetzen-Knopf).

```bash
npm test && npm run typecheck && npm run lint
git add docs/superpowers/plans/2026-08-23-keel-harness-adapter-protokoll.md README.md
git commit -m "docs: der Beweis in der laufenden App — Niveau-B-Zelle gefahren"
```

---

## Selbstprüfung des Plans

**Spec-Deckung** — jeder Abschnitt der Spec hat eine Aufgabe:

| Spec | Aufgabe |
|---|---|
| §3 Schnittstellentrennung, `nichtVerfuegbarGrund` | 1 |
| §4 Der eine Zusammenbau, Fork in `SESSION_CREATE` | 3, 6 |
| §5.1–5.3 Platz, Konfiguration, leerer Platz | 2 |
| §5.4 Preset ohne Modell, `PRESET_CATALOG` | 5 |
| §5.5 `RUNTIMES_WITHOUT_ADAPTER` | 4 |
| §6.1–6.2 Register, eine Zustandsquelle | 6, 9 |
| §6.3 `SESSION_AUFTRAG` | 9 |
| §6.4 Zerstören | 6 |
| §6.5 Zelle im Renderer | 10 |
| §7 Folgeauftrag (Ereignis, Adjazenz, Entscheidung, Einstieg) | 7, 8 |
| §8 Fehlertabelle | 2 (leerer Platz), 4 (Sperre), 6 (zweiter Auftrag), 9 (Startfehler) |
| §9.1–9.2 Herausgezogene Funktionen, Wächter | 1, 2, 4, 6, 7, 8 |
| §9.3 Beweis in der App | 11 |
| §9.4 CK-NFR-012 | 2 (Platz), 8 (`FOLGE_RESERVE`) |
| §10 Nicht dazugehörig | in keiner Aufgabe — das ist der Punkt |

**Beim Schreiben des Plans nachgeprüft und aufgelöst** (stehen als Befund im Plan, nicht als Prüfauftrag):
`AdapterCapabilities` hat genau sieben Schlüssel · `spark-qwen38-27b` und `claude-opus-cli` sind
echte Ids · `getGlobalRules` gibt einen fertigen Textblock zurück · **es gibt keine
DOM-Testumgebung**, deshalb prüft Task 10 eine reine Funktion statt zu rendern ·
`SESSION_STATUS_CHANGED` ist deklariert, hat aber heute weder Sender noch Hörer.

**Bewusst offen, weil erst beim Anfassen entscheidbar** (jeder mit Anweisung, keiner ein „TODO"):
Task 1 Step 5 (welche Stellen `AgentAdapter` als Einzelinterface benutzen — der `typecheck`
zeigt sie), Task 2 Step 5 (ob der Nicht-Rollen-Zweig in `ansicht.ts` eine Tier-Annahme trifft),
Task 5 Step 5 (ob ein Test auf einer festen Entitätenzahl besteht).

**Typkonsistenz:** `SchleifenStartOpts` wird in Task 1 definiert, in Task 4 konsumiert, in Task 9
um `beiEnde?` ergänzt — die Ergänzung steht in Task 9 Step 3 ausdrücklich. `SchleifenZelle.laufId`
heißt in Register, Start, Handler und Renderer durchgehend `laufId`. `weiterOderFrisch` gibt
`{ weiter, grund }` zurück und wird in Task 9 genau so gelesen.
