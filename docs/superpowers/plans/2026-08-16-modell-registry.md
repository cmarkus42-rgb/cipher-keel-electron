# Modell-Registry, Läufer und Eignung — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Datenschicht, aus der alle drei Niveaus ihr Modell beziehen — eine Liste von Einträgen, zwei Matrizen für Sperre und Warnung, ohne Oberfläche und ohne Harness.

**Architecture:** Ein neues Verzeichnis `src/main/model/` trägt Eintrag, Voreinstellungen, Eignungsregeln und Registry als reine Module. Die drei bestehenden Konsumenten (`model-resolver` für A, `endpointForRole` für C, später das Harness für B) lesen daraus, statt eigene Formen zu führen. Die Registry wird **über** dem bestehenden `ModelEndpoint` gebaut, nicht daneben: Ein Eintrag wird über `normaliseEndpoint` in einen Endpunkt übersetzt, sodass die Transport-Validierung genau einmal existiert.

**Tech Stack:** TypeScript, Electron Main, vitest. Keine neuen Abhängigkeiten.

**Spec:** `docs/superpowers/specs/2026-08-16-modell-registry-design.md`
**Autoritäten:** M8 `konzept_v1.0.md` §5/§6/§11 · Basiskonzept `2026-08-14-modell-ebene-basiskonzept.md` · M6-Nachtrag `nachtrag-nanoclaw-abloesung_2026-08-16.md`

## Global Constraints

- **Zweig:** `modell-registry`. Vor jedem Commit `git branch --show-current` prüfen — es sind schon einmal acht Commits versehentlich auf lokalem `main` gelandet.
- **Sprache:** Code und Kommentare **englisch**. Prompt-Inhalte, Fehlermeldungen an den Nutzer und alles unter `docs/superpowers/` **deutsch**. Die Fehlertexte in diesem Plan sind wörtlich zu übernehmen.
- **Kein Test geht ins Netz.** Keiner dieser Tests startet einen HTTP-Aufruf.
- **Native ABI:** Falls Tests reihenweise (~497) fallen, ist es die native ABI — `npm run rebuild-native`, **nie** eine Quelldatei ändern.
- **Exit-Codes nie aus abgeschnittener Ausgabe schließen.** `npm run typecheck | tail -3` liefert den Code von `tail`. Richtig: `npm run typecheck >/dev/null 2>&1; echo $?`.
- **Nach jedem Task:** `npm test`, `npm run typecheck`, `npm run lint` — alle drei grün, bevor committet wird.
- **Bündel-Wächter:** `npm run verify:bundle` muss grün bleiben. Marker sind ASCII ohne Anführungszeichen.
- **Node 24** (`.nvmrc`). Dieser Rechner läuft 25 — Lockfile nicht anfassen, `npm ci` nicht ausführen.
- **Keine Geheimnisse im Eintrag.** Ein Eintrag nennt einen `keyRef`, nie einen Schlüssel. Kein Testfixture enthält einen echten Schlüssel.

---

## Dateien

| Datei | Verantwortung |
|---|---|
| `src/main/model/entry.ts` | **Neu.** Typen `ModellEintrag`, `Erreichbarkeit`, `Faehigkeiten`; Validierung; Übersetzung nach `ModelEndpoint` |
| `src/main/model/defaults.ts` | **Neu.** Gebündelte Voreinstellungen |
| `src/main/model/eignung.ts` | **Neu.** Beide Matrizen und die Warnregeln — rein, ohne Config |
| `src/main/model/registry.ts` | **Neu.** Einträge laden, nach Id suchen, Zuordnung auflösen |
| `src/main/model/rollen.ts` | **Neu.** `erreichbarkeitFuerRolle` — zieht aus `model-client.ts` hierher, um einen Importzyklus zu vermeiden |
| `src/main/config/config-store.ts` | Neuer Schlüssel `modelle` samt Voreinstellung |
| `src/main/worker/model-client.ts` | `endpointForRole` entfällt hier (wandert nach `rollen.ts`) |
| `src/main/notes/note-tagging.ts` | Import auf `rollen.ts` umstellen |
| `src/main/session/model-resolver.ts` | Optionaler `TierLookup` — Registry vor Altwert |
| `src/main/ipc-handlers.ts`, `src/main/session/preview-prompt.ts` | Reichen den Lookup durch |
| `src/main/preset/schema.ts` | `KNOWN_RUNTIMES`: `nanoclaw-channel-route` raus, `keel-harness` rein |
| `src/main/worker/c-worker.ts` | Kopfkommentar korrigieren |
| `scripts/probe-registry.mjs` | **Neu.** Beleg-Skript für Task 11 — **im Repo**, nicht im Scratchpad |

**Zur Zyklus-Frage:** `model/entry.ts` importiert `normaliseEndpoint` aus `worker/model-client.ts`. Bliebe `endpointForRole` dort und läse die Registry, entstünde `model-client → model/registry → model/entry → model-client`. Deshalb wandert die Rollen-Auflösung nach `model/rollen.ts`; `model-client.ts` behält nur Transport-Belange. Das ist dieselbe Falle, wegen der `filterByNiveau` in `capability-schema.ts` liegt und nicht in `capabilities.ts`.

## REQ-IDs

Neuer Bereich **`CK-MOD`** — Modell-Ebene. Er tritt **nicht** an die Stelle von `CK-S2`
(„Schenkel 2 / NanoClaw"), dessen Name der M6-Nachtrag als überholt vermerkt: Vergebene IDs
wandern nicht. `CK-S2-001` bis `CK-S2-015` bleiben, wo sie sind, und werden nicht neu belegt.

Wie im übrigen Repo steht die Id im Kopfkommentar des Moduls, das sie einlöst — dort, wo sie
beim Lesen anfällt, nicht in einer Liste daneben.

| ID | Inhalt | Task |
|---|---|---|
| CK-MOD-001 | Der Modell-Eintrag: Identität, Anbieterart, Erreichbarkeit, Örtlichkeit, Prosa | 1 |
| CK-MOD-002 | Erreichbarkeit wird über `normaliseEndpoint` validiert — eine Transport-Prüfung, nicht zwei | 1 |
| CK-MOD-003 | Fähigkeitszeile je Eintrag; nie `gemessen` ohne Messung | 1 |
| CK-MOD-004 | Gebündelte Voreinstellungen, alle Zeilen `vermutet` | 2 |
| CK-MOD-005 | Struktur-Matrix Läufer × Anbieterart — sperrt hart, mit benanntem Grund je Richtung | 3 |
| CK-MOD-006 | Niveau × Läufer als monotone Regel über der Läufer-Fähigkeitsstufe | 4 |
| CK-MOD-007 | Warnungen an der Zuordnung, an gemessenen Fähigkeiten statt an der Örtlichkeit | 5 |
| CK-MOD-008 | Registry: Config überschreibt Voreinstellung je Id; ein kaputter Eintrag wird laut übersprungen | 6 |
| CK-MOD-009 | Auflösungsreihenfolge Zuordnung vor Altwert; ohne Zuordnung verhält sich alles wie zuvor | 6, 7, 8 |
| CK-MOD-010 | Die Eignungsregeln haben genau eine Quelle, durch Wächtertest gebunden | 10 |

---

### Task 1: Der Eintrag, seine Validierung und die Übersetzung zum Endpunkt

**Files:**
- Create: `src/main/model/entry.ts`
- Test: `tests/model/entry.test.ts`

**Interfaces:**
- Consumes: `normaliseEndpoint`, `ModelEndpoint` aus `src/main/worker/model-client.ts`
- Produces: `Anbieterart`, `Erreichbarkeit`, `Faehigkeiten`, `ModellEintrag`, `normaliseEintrag(raw: unknown): ModellEintrag`, `toModelEndpoint(e: Erreichbarkeit): ModelEndpoint`

> **Nachtrag aus dem Review (2026-08-16, gebaut in `16fec22`).** Der Validator unten prüft zwei
> Zusicherungen nicht, die der Entwurf nennt. Beide sind nachgezogen:
>
> 1. Ein `cli-harness`-Eintrag **mit** `faehigkeiten` wird abgelehnt statt stillschweigend
>    angenommen: `Eintrag '<id>': cli-harness kennt keine faehigkeiten — das CLI besitzt sein
>    Protokoll selbst`.
> 2. `quelle` wird auf **Stimmigkeit** geprüft, nicht auf einen festen Wert: `gemessen` verlangt
>    `gemessenAm` und `gemessenMit`, alles andere verlangt beide `null`, und ein unbekannter
>    Wert wird abgelehnt.
>
> **Punkt 2 ist ausdrücklich *nicht* als Wert-Zwang gebaut**, obwohl der erste Review das
> vorschlug. Die Registry liegt in der Config, und der Kanarienauftrag schreibt seine Messungen
> genau dorthin zurück — ein Validator, der jedes `gemessen` überschreibt, machte die
> Fähigkeitstabelle dauerhaft unlesbar. Die Zusicherung „nichts wird als `gemessen`
> ausgeliefert" gilt den **Voreinstellungen** und wird in Task 2 geprüft, nicht hier.

- [ ] **Step 1: Write the failing test**

`tests/model/entry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normaliseEintrag, toModelEndpoint } from '../../src/main/model/entry'

const CLI = {
  id: 'claude-opus', name: 'Claude Opus (CLI)', art: 'cli-harness',
  erreichbarkeit: { art: 'cli-harness', cli: 'claude', handle: 'opus' },
  oertlichkeit: 'fremdes-netz', erklaertext: 'Abo-Kontingent statt API-Kosten.',
  empfehlung: 'Fuer Niveau A ueber den CLI-Weg.',
}

describe('normaliseEintrag', () => {
  it('accepts a cli-harness entry without capabilities', () => {
    const e = normaliseEintrag(CLI)
    expect(e.id).toBe('claude-opus')
    expect(e.faehigkeiten).toBeUndefined()
  })

  it('names the missing field when id is absent', () => {
    expect(() => normaliseEintrag({ ...CLI, id: '' }))
      .toThrow('Eintrag ohne id')
  })

  it('rejects an art the code does not know', () => {
    expect(() => normaliseEintrag({ ...CLI, art: 'telepathie' }))
      .toThrow("Unbekannte Anbieterart 'telepathie'")
  })

  it('rejects an erreichbarkeit that contradicts the art', () => {
    expect(() => normaliseEintrag({ ...CLI, art: 'api' }))
      .toThrow("Eintrag 'claude-opus': art ist 'api', erreichbarkeit ist 'cli-harness'")
  })

  it('defaults an unmeasured capability row to vermutet', () => {
    const e = normaliseEintrag({
      id: 'spark-gemma', name: 'Gemma4 26B (Spark)', art: 'local-http',
      erreichbarkeit: { art: 'local-http', host: '100.78.7.108', port: 11434, model: 'gemma4:26b' },
      oertlichkeit: 'eigenes-netz', erklaertext: 'Laeuft auf dem Spark.', empfehlung: 'Fuer Niveau C.',
      faehigkeiten: { codec: 'ollama-native', werkzeugmodus: 'text' },
    })
    expect(e.faehigkeiten?.quelle).toBe('vermutet')
    expect(e.faehigkeiten?.gemessenAm).toBeNull()
    expect(e.faehigkeiten?.gemessenMit).toBeNull()
  })
})

describe('toModelEndpoint', () => {
  it('translates a local-http reachability into an Ollama endpoint', () => {
    const ep = toModelEndpoint({ art: 'local-http', host: '100.78.7.108', port: 11434, model: 'gemma4:26b' })
    expect(ep.kind).toBe('ollama')
    if (ep.kind === 'ollama') expect(ep.host).toBe('100.78.7.108')
  })

  it('translates an api reachability into an openai-compatible endpoint', () => {
    const ep = toModelEndpoint({
      art: 'api', baseUrl: 'https://openrouter.ai/api/v1/', model: 'qwen/qwen3-coder', keyRef: 'openrouter',
    })
    expect(ep.kind).toBe('openai-compatible')
    // The trailing slash is stripped by normaliseEndpoint — proof the shared validation ran.
    if (ep.kind === 'openai-compatible') expect(ep.baseUrl).toBe('https://openrouter.ai/api/v1')
  })

  it('refuses to build an endpoint for a cli-harness entry', () => {
    expect(() => toModelEndpoint({ art: 'cli-harness', cli: 'claude', handle: 'opus' }))
      .toThrow('bringt sein Modell selbst mit')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/model/entry.test.ts`
Expected: FAIL — `Cannot find module '../../src/main/model/entry'`

- [ ] **Step 3: Write the implementation**

`src/main/model/entry.ts`:

```ts
/**
 * entry — one registry entry: what answers, how it is reached, and what it can do.
 *
 * Two halves with different lifetimes. The curated half (name, reachability, locality,
 * prose) is written by a human and changes rarely. The measured half (`faehigkeiten`) is
 * written by the canary job once the harness can run one — until then every row carries
 * `quelle: 'vermutet'`, and whoever displays it has to show that.
 *
 * Reachability is translated into a `ModelEndpoint` rather than duplicating its shape, so
 * the transport validation exists exactly once (M8 section 5; spec section 4).
 */

import { normaliseEndpoint, type ModelEndpoint } from '../worker/model-client'

export type Anbieterart = 'cli-harness' | 'local-http' | 'api'
export type Oertlichkeit = 'lokal' | 'eigenes-netz' | 'fremdes-netz'

export type Erreichbarkeit =
  | { art: 'cli-harness'; cli: string; handle: string }
  | { art: 'local-http'; host: string; port: number; model: string }
  | { art: 'api'; baseUrl: string; model: string; keyRef: string }

export interface Faehigkeiten {
  codec: 'anthropic' | 'openai-chat' | 'ollama-native' | 'text'
  werkzeugmodus: 'nativ' | 'text'
  paralleleAufrufe: boolean
  denkbloecke: boolean
  bilder: boolean
  dokumente: boolean
  aufgeschobenesLaden: boolean
  werkzeugObergrenze: number
  nutzbaresKontextfenster: number
  vertragsStrenge: { schemaTiefe: number; reparaturversuche: number }
  rundenbudget: number
  gemessenAm: string | null
  gemessenMit: string | null
  quelle: 'gemessen' | 'vermutet' | 'herstellerangabe'
}

export interface ModellEintrag {
  id: string
  name: string
  art: Anbieterart
  erreichbarkeit: Erreichbarkeit
  oertlichkeit: Oertlichkeit
  erklaertext: string
  empfehlung: string
  /** Absent for cli-harness: Claude Code owns its own protocol. */
  faehigkeiten?: Faehigkeiten
}

const ARTEN = new Set<string>(['cli-harness', 'local-http', 'api'])
const OERTLICHKEITEN = new Set<string>(['lokal', 'eigenes-netz', 'fremdes-netz'])

/** Everything a capability row does not state. Never `gemessen` — that is the canary's word. */
const FAEHIGKEITEN_RUECKFALL: Faehigkeiten = {
  codec: 'text',
  werkzeugmodus: 'text',
  paralleleAufrufe: false,
  denkbloecke: false,
  bilder: false,
  dokumente: false,
  aufgeschobenesLaden: false,
  werkzeugObergrenze: 8,
  nutzbaresKontextfenster: 8192,
  vertragsStrenge: { schemaTiefe: 1, reparaturversuche: 1 },
  rundenbudget: 12,
  gemessenAm: null,
  gemessenMit: null,
  quelle: 'vermutet',
}

export function normaliseEintrag(raw: unknown): ModellEintrag {
  const r = raw as Partial<ModellEintrag>
  if (!r || typeof r !== 'object') throw new Error('Eintrag ist kein Objekt')
  if (!r.id) throw new Error('Eintrag ohne id — jeder Eintrag braucht einen stabilen Schluessel')
  if (!r.name) throw new Error(`Eintrag '${r.id}' ohne name`)
  if (!r.art || !ARTEN.has(r.art)) {
    throw new Error(
      `Unbekannte Anbieterart '${r.art}' — bekannt sind cli-harness, local-http, api`
    )
  }
  if (!r.oertlichkeit || !OERTLICHKEITEN.has(r.oertlichkeit)) {
    throw new Error(
      `Eintrag '${r.id}': unbekannte oertlichkeit '${r.oertlichkeit}' — ` +
        'bekannt sind lokal, eigenes-netz, fremdes-netz'
    )
  }
  if (!r.erreichbarkeit) throw new Error(`Eintrag '${r.id}' ohne erreichbarkeit`)
  if (r.erreichbarkeit.art !== r.art) {
    throw new Error(
      `Eintrag '${r.id}': art ist '${r.art}', erreichbarkeit ist '${r.erreichbarkeit.art}' — ` +
        'beide muessen dasselbe sagen'
    )
  }
  const err = r.erreichbarkeit
  switch (err.art) {
    case 'cli-harness':
      if (!err.cli || !err.handle) {
        throw new Error(`Eintrag '${r.id}': cli-harness braucht cli und handle`)
      }
      break
    default:
      // Reachability is checked by building the endpoint: one validation, not two.
      toModelEndpoint(err)
  }

  return {
    id: r.id,
    name: r.name,
    art: r.art,
    erreichbarkeit: r.erreichbarkeit,
    oertlichkeit: r.oertlichkeit,
    erklaertext: r.erklaertext ?? '',
    empfehlung: r.empfehlung ?? '',
    faehigkeiten: r.faehigkeiten
      ? { ...FAEHIGKEITEN_RUECKFALL, ...r.faehigkeiten }
      : undefined,
  }
}

export function toModelEndpoint(e: Erreichbarkeit): ModelEndpoint {
  switch (e.art) {
    case 'cli-harness':
      throw new Error(
        `Ein cli-harness-Eintrag hat keinen Endpunkt — das CLI bringt sein Modell selbst mit`
      )
    case 'local-http':
      return normaliseEndpoint({ kind: 'ollama', host: e.host, port: e.port, model: e.model })
    case 'api':
      return normaliseEndpoint({
        kind: 'openai-compatible', baseUrl: e.baseUrl, model: e.model, keyRef: e.keyRef,
      })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/model/entry.test.ts`
Expected: PASS, 8 Tests

- [ ] **Step 5: Verify and commit**

```bash
npm run typecheck >/dev/null 2>&1; echo "typecheck: $?"
npm run lint >/dev/null 2>&1; echo "lint: $?"
git branch --show-current   # muss modell-registry sein
git add src/main/model/entry.ts tests/model/entry.test.ts
git commit -m "feat(model): registry entry with curated and measured halves"
```

---

### Task 2: Gebündelte Voreinstellungen

Nur Einträge, die auf dieser Maschine oder dem Spark real erreichbar sind, plus je ein Anbieter-Vertreter. Kein Eintrag, den nie jemand erreicht hat (Spec §14).

**Files:**
- Create: `src/main/model/defaults.ts`
- Test: `tests/model/defaults.test.ts`

**Interfaces:**
- Consumes: `normaliseEintrag`, `ModellEintrag` aus Task 1
- Produces: `DEFAULT_EINTRAEGE: ModellEintrag[]`

- [ ] **Step 1: Write the failing test**

`tests/model/defaults.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_EINTRAEGE } from '../../src/main/model/defaults'

describe('bundled default entries', () => {
  it('has unique ids', () => {
    const ids = DEFAULT_EINTRAEGE.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('carries no measured capability row — nothing has been measured by a canary yet', () => {
    const gemessen = DEFAULT_EINTRAEGE.filter(e => e.faehigkeiten?.quelle === 'gemessen')
    expect(gemessen.map(e => e.id)).toEqual([])
  })

  it('holds no secret — api entries name a keyRef instead', () => {
    for (const e of DEFAULT_EINTRAEGE) {
      if (e.erreichbarkeit.art === 'api') {
        expect(e.erreichbarkeit.keyRef).toBeTruthy()
        expect(JSON.stringify(e)).not.toMatch(/sk-|api[_-]?key["' ]*[:=]/i)
      }
    }
  })

  it('covers all three provider kinds', () => {
    expect(new Set(DEFAULT_EINTRAEGE.map(e => e.art)))
      .toEqual(new Set(['cli-harness', 'local-http', 'api']))
  })

  it('gives every entry prose — the user wants to read why', () => {
    for (const e of DEFAULT_EINTRAEGE) {
      expect(e.erklaertext.length, `${e.id} ohne erklaertext`).toBeGreaterThan(0)
      expect(e.empfehlung.length, `${e.id} ohne empfehlung`).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/model/defaults.test.ts`
Expected: FAIL — `Cannot find module '../../src/main/model/defaults'`

- [ ] **Step 3: Write the implementation**

`src/main/model/defaults.ts`:

```ts
/**
 * defaults — the entries that ship with the app.
 *
 * Deliberately short. Every entry here is reachable from this machine or from the DGX
 * Spark, plus one representative per API vendor family. An entry nobody has ever reached
 * would be a guess wearing the clothes of a default.
 *
 * Capability rows are `vermutet` throughout: no canary job exists yet (M8 section 7 line 12).
 */

import { normaliseEintrag, type ModellEintrag } from './entry'

const SPARK_HOST = '100.78.7.108'

export const DEFAULT_EINTRAEGE: ModellEintrag[] = [
  {
    id: 'claude-opus-cli', name: 'Claude Opus (Claude Code)', art: 'cli-harness',
    erreichbarkeit: { art: 'cli-harness', cli: 'claude', handle: 'opus' },
    oertlichkeit: 'fremdes-netz',
    erklaertext: 'Laeuft im mitgelieferten Harness von Claude Code und nutzt das Abo-Kontingent statt API-Kosten.',
    empfehlung: 'Fuer Niveau A dort, wo Fehler sich vervielfachen — Ideation, Requirements, Systems Engineer.',
  },
  {
    id: 'claude-sonnet-cli', name: 'Claude Sonnet (Claude Code)', art: 'cli-harness',
    erreichbarkeit: { art: 'cli-harness', cli: 'claude', handle: 'sonnet' },
    oertlichkeit: 'fremdes-netz',
    erklaertext: 'Der Alltagsweg im Abo-Kontingent.',
    empfehlung: 'Voreinstellung fuer Cyber Factory und Workshop.',
  },
  {
    id: 'claude-haiku-cli', name: 'Claude Haiku (Claude Code)', art: 'cli-harness',
    erreichbarkeit: { art: 'cli-harness', cli: 'claude', handle: 'haiku' },
    oertlichkeit: 'fremdes-netz',
    erklaertext: 'Der billigste Weg im Abo-Kontingent.',
    empfehlung: 'Fuer mechanische Arbeit, wenn kein lokales Modell bereitsteht.',
  },
  {
    id: 'mac-qwen3-30b', name: 'Qwen3 30B A3B (Mac Mini)', art: 'local-http',
    erreichbarkeit: { art: 'local-http', host: '127.0.0.1', port: 11434, model: 'qwen3:30b-a3b-instruct-2507-q4_K_M' },
    oertlichkeit: 'lokal',
    erklaertext: 'Laeuft auf dem Arbeitsplatz selbst. Nichts verlaesst die Maschine.',
    empfehlung: 'Fuer Notizen-Tagging und kleine C-Auftraege ohne Wartezeit auf einen zweiten Rechner.',
    faehigkeiten: { codec: 'ollama-native', werkzeugmodus: 'text', nutzbaresKontextfenster: 32768 },
  },
  {
    id: 'spark-gemma4-26b', name: 'Gemma4 26B (DGX Spark)', art: 'local-http',
    erreichbarkeit: { art: 'local-http', host: SPARK_HOST, port: 11434, model: 'gemma4:26b' },
    oertlichkeit: 'eigenes-netz',
    erklaertext: 'Laeuft auf dem DGX Spark ueber Tailscale, 128 GB Unified Memory. Ueber LAN geschlossen.',
    empfehlung: 'Voreinstellung fuer Niveau-C-Auftraege — die Maschine mit dem Speicher fuer ein ernsthaftes Modell.',
    faehigkeiten: { codec: 'ollama-native', werkzeugmodus: 'text', nutzbaresKontextfenster: 65536 },
  },
  {
    id: 'spark-gpt-oss-120b', name: 'GPT-OSS 120B (DGX Spark)', art: 'local-http',
    erreichbarkeit: { art: 'local-http', host: SPARK_HOST, port: 11434, model: 'gpt-oss:120b' },
    oertlichkeit: 'eigenes-netz',
    erklaertext: 'Das groesste lokal verfuegbare Modell. Braucht den Spark und dessen GPU ungeteilt.',
    empfehlung: 'Fuer Arbeit, die lokal bleiben muss und mehr verlangt als ein 26B.',
    faehigkeiten: { codec: 'ollama-native', werkzeugmodus: 'text', nutzbaresKontextfenster: 131072 },
  },
  {
    id: 'openrouter-qwen3-coder', name: 'Qwen3 Coder (OpenRouter)', art: 'api',
    erreichbarkeit: {
      art: 'api', baseUrl: 'https://openrouter.ai/api/v1', model: 'qwen/qwen3-coder', keyRef: 'openrouter',
    },
    oertlichkeit: 'fremdes-netz',
    erklaertext: 'Ein OSS-Flaggschiff ueber einen fremden Hoster. Der Prompt verlaesst das eigene Netz.',
    empfehlung: 'Wenn die eigene Maschine belegt ist — ein Anbieter haelt Niveau C am Leben.',
    faehigkeiten: { codec: 'openai-chat', werkzeugmodus: 'nativ', nutzbaresKontextfenster: 131072 },
  },
].map(normaliseEintrag)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/model/defaults.test.ts`
Expected: PASS, 5 Tests

- [ ] **Step 5: Verify and commit**

```bash
npm run typecheck >/dev/null 2>&1; echo "typecheck: $?"
git add src/main/model/defaults.ts tests/model/defaults.test.ts
git commit -m "feat(model): bundled default entries, all capability rows vermutet"
```

---

### Task 3: Die Struktur-Matrix — was hart sperrt

**Files:**
- Create: `src/main/model/eignung.ts`
- Test: `tests/model/eignung-struktur.test.ts`

**Interfaces:**
- Consumes: `Anbieterart` aus Task 1
- Produces: `Laeufer` (Typ), `LAEUFER` (Liste), `laeuferKannArt(l, a): boolean`, `sperrgrund(l, a): string | null`

- [ ] **Step 1: Write the failing test**

`tests/model/eignung-struktur.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { LAEUFER, laeuferKannArt, sperrgrund } from '../../src/main/model/eignung'
import type { Anbieterart } from '../../src/main/model/entry'

const ARTEN: Anbieterart[] = ['cli-harness', 'local-http', 'api']

describe('structural matrix: Laeufer x Anbieterart', () => {
  it('covers all nine cells with a definite answer', () => {
    for (const l of LAEUFER) {
      for (const a of ARTEN) expect(typeof laeuferKannArt(l, a)).toBe('boolean')
    }
  })

  it('lets the foreign CLI drive only a cli-harness model', () => {
    expect(laeuferKannArt('fremdes-cli', 'cli-harness')).toBe(true)
    expect(laeuferKannArt('fremdes-cli', 'local-http')).toBe(false)
    expect(laeuferKannArt('fremdes-cli', 'api')).toBe(false)
  })

  it('lets the own loop and the one-shot runner drive http and api, never a cli harness', () => {
    for (const l of ['eigene-schleife', 'ein-schuss'] as const) {
      expect(laeuferKannArt(l, 'local-http')).toBe(true)
      expect(laeuferKannArt(l, 'api')).toBe(true)
      expect(laeuferKannArt(l, 'cli-harness')).toBe(false)
    }
  })

  it('gives no reason for a cell that is open', () => {
    expect(sperrgrund('ein-schuss', 'api')).toBeNull()
  })

  // The two locked directions have different reasons, and the second is not technical.
  it('says the CLI brings its own model', () => {
    expect(sperrgrund('fremdes-cli', 'local-http')).toMatch(/bringt sein Modell selbst mit/)
  })

  it('says a subscription CLI is never driven through the own loop (M8 section 12)', () => {
    expect(sperrgrund('eigene-schleife', 'cli-harness')).toMatch(/Abo-Kontingent/)
    expect(sperrgrund('eigene-schleife', 'cli-harness')).toMatch(/Nutzungsbedingung/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/model/eignung-struktur.test.ts`
Expected: FAIL — `Cannot find module '../../src/main/model/eignung'`

- [ ] **Step 3: Write the implementation**

`src/main/model/eignung.ts`:

```ts
/**
 * eignung — the two matrices, and the only place either of them is stated.
 *
 * They are separated on purpose. The structural matrix says what is impossible; the
 * warnings say what is risky. A single matrix mixing both cannot be implemented by a
 * surface that must lock *and* warn without rule and display drifting apart — which is
 * exactly what happened to the capability lists that knew the same thing in five places.
 *
 * The basic concept (section 5) says the matrix belongs in the code, not in the surface.
 * `tests/model/eignung-einzige-quelle.test.ts` is what keeps that true.
 */

import type { Anbieterart } from './entry'

/** How work is done. Two of the three are session runtimes; `ein-schuss` is per job. */
export type Laeufer = 'fremdes-cli' | 'eigene-schleife' | 'ein-schuss'

export const LAEUFER: readonly Laeufer[] = ['fremdes-cli', 'eigene-schleife', 'ein-schuss']

const STRUKTUR: Record<Laeufer, ReadonlySet<Anbieterart>> = {
  'fremdes-cli': new Set<Anbieterart>(['cli-harness']),
  'eigene-schleife': new Set<Anbieterart>(['local-http', 'api']),
  'ein-schuss': new Set<Anbieterart>(['local-http', 'api']),
}

export function laeuferKannArt(laeufer: Laeufer, art: Anbieterart): boolean {
  return STRUKTUR[laeufer].has(art)
}

/** German: this text reaches the user. Null when the cell is open. */
export function sperrgrund(laeufer: Laeufer, art: Anbieterart): string | null {
  if (laeuferKannArt(laeufer, art)) return null
  if (laeufer === 'fremdes-cli') {
    return 'Ein CLI-Harness bringt sein Modell selbst mit — ein anderes dort einzutragen waere eine stille Falle.'
  }
  // Every keel-driven runner is locked against a cli-harness model, and for two grounds at
  // once. Naming one runner here would be wrong: both `eigene-schleife` and `ein-schuss`
  // land in this branch.
  return (
    'Ein CLI-Harness ist kein Endpunkt, sondern ein eigener Prozess mit eigener Sitzung — ' +
    'keel kann es nicht direkt ansprechen. Und ein Abo-Kontingent wird nie durch eine eigene ' +
    'Schleife gefahren: Das hiesse, ein Abo-OAuth-Token durch eine eigene API-Schleife zu ' +
    'schicken. Das ist eine Nutzungsbedingung, keine Faehigkeitsfrage.'
  )
}
```

> **Korrigiert nach dem Review (2026-08-16, gebaut in `46ded27`).** Die erste Fassung dieses
> Auszugs schob alles außer `fremdes-cli` in einen `else`-Zweig mit der Abo-Begründung. Die
> Matrix sperrt aber **vier** Zellen: `ein-schuss × cli-harness` fiel ebenfalls dorthin und
> meldete dem Nutzer, seine *eigene Schleife* sei gesperrt. Dazu gehört ein Test, der
> `sperrgrund` und `laeuferKannArt` aneinander bindet — genau dann eine Begründung, wenn
> gesperrt —, damit keine künftige Zelle die Begründung einer anderen erbt.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/model/eignung-struktur.test.ts`
Expected: PASS, 6 Tests

- [ ] **Step 5: Verify and commit**

```bash
npm run typecheck >/dev/null 2>&1; echo "typecheck: $?"
git add src/main/model/eignung.ts tests/model/eignung-struktur.test.ts
git commit -m "feat(model): structural matrix — Laeufer against provider kind"
```

---

### Task 4: Niveau gegen Läufer — die monotone Regel

**Files:**
- Modify: `src/main/model/eignung.ts`
- Test: `tests/model/eignung-niveau.test.ts`

**Interfaces:**
- Consumes: `CapabilityNiveau` aus `src/main/preset/niveau.ts`, `Laeufer` aus Task 3
- Produces: `laeuferFaehigkeit(l): CapabilityNiveau`, `laeuferTraegtNiveau(l, n): boolean`

- [ ] **Step 1: Write the failing test**

`tests/model/eignung-niveau.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { LAEUFER, laeuferTraegtNiveau, laeuferFaehigkeit } from '../../src/main/model/eignung'
import { CapabilityNiveau } from '../../src/main/preset/niveau'

const NIVEAUS = [CapabilityNiveau.A, CapabilityNiveau.B, CapabilityNiveau.C]

describe('Niveau against Laeufer', () => {
  // Monotonicity as a property, not as a recomputation: whatever a Laeufer carries, it
  // must also carry everything weaker. A test that rebuilt the expected value from the
  // implementation's own table would pass even if that table were wrong — the repo already
  // has one such test (`niveauMinimum-sync`, which checks a derivation against itself) and
  // it is a known defect, not a model. The anchors are pinned in the tests below.
  it('is monotone: carrying a niveau implies carrying every weaker one', () => {
    const schwaecher: Record<CapabilityNiveau, CapabilityNiveau[]> = {
      [CapabilityNiveau.A]: [CapabilityNiveau.B, CapabilityNiveau.C],
      [CapabilityNiveau.B]: [CapabilityNiveau.C],
      [CapabilityNiveau.C]: [],
    }
    for (const l of LAEUFER) {
      for (const n of NIVEAUS) {
        if (!laeuferTraegtNiveau(l, n)) continue
        for (const schwach of schwaecher[n]) {
          expect(laeuferTraegtNiveau(l, schwach), `${l} traegt ${n}, aber nicht ${schwach}`).toBe(true)
        }
      }
    }
  })

  it('puts the own loop on A — decision E21, not a forecast', () => {
    expect(laeuferFaehigkeit('eigene-schleife')).toBe(CapabilityNiveau.A)
    expect(laeuferTraegtNiveau('eigene-schleife', CapabilityNiveau.A)).toBe(true)
  })

  it('keeps the one-shot runner at C', () => {
    expect(laeuferFaehigkeit('ein-schuss')).toBe(CapabilityNiveau.C)
    expect(laeuferTraegtNiveau('ein-schuss', CapabilityNiveau.B)).toBe(false)
    expect(laeuferTraegtNiveau('ein-schuss', CapabilityNiveau.A)).toBe(false)
  })

  it('allows a niveau below the runner capability — wasteful, not forbidden', () => {
    expect(laeuferTraegtNiveau('fremdes-cli', CapabilityNiveau.C)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/model/eignung-niveau.test.ts`
Expected: FAIL — `laeuferTraegtNiveau is not a function`

- [ ] **Step 3: Write the implementation**

An `src/main/model/eignung.ts` anhängen:

```ts
import { CapabilityNiveau } from '../preset/niveau'

/**
 * A is the strongest demand, C the weakest. Rank rather than string compare, so the rule
 * reads as the rule instead of as an alphabetical accident.
 */
const RANG: Record<CapabilityNiveau, number> = {
  [CapabilityNiveau.A]: 3,
  [CapabilityNiveau.B]: 2,
  [CapabilityNiveau.C]: 1,
}

/**
 * The own loop stands on A because of decision E21 — v1 carries A-worthy work, not only B.
 * With the ratification of 2026-08-16 ("alles 0.1") there is no interim state in which it
 * would carry less, so none is modelled here.
 */
const FAEHIGKEIT: Record<Laeufer, CapabilityNiveau> = {
  'fremdes-cli': CapabilityNiveau.A,
  'eigene-schleife': CapabilityNiveau.A,
  'ein-schuss': CapabilityNiveau.C,
}

export function laeuferFaehigkeit(laeufer: Laeufer): CapabilityNiveau {
  return FAEHIGKEIT[laeufer]
}

export function laeuferTraegtNiveau(laeufer: Laeufer, niveau: CapabilityNiveau): boolean {
  return RANG[FAEHIGKEIT[laeufer]] >= RANG[niveau]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/model/eignung-niveau.test.ts`
Expected: PASS, 4 Tests

- [ ] **Step 5: Verify and commit**

```bash
npm run typecheck >/dev/null 2>&1; echo "typecheck: $?"
git add src/main/model/eignung.ts tests/model/eignung-niveau.test.ts
git commit -m "feat(model): monotone niveau rule over Laeufer capability"
```

---

### Task 5: Die Warnregeln

Sechs Auslöser aus Spec §7.3. **Keine davon sperrt.** Der wichtigste Test ist der Gegenbeleg: Ein starkes lokales Modell warnt **nicht** wegen seiner Örtlichkeit.

**Files:**
- Modify: `src/main/model/eignung.ts`
- Test: `tests/model/eignung-warnungen.test.ts`

**Interfaces:**
- Consumes: `ModellEintrag` (Task 1), `Laeufer` (Task 3), `CapabilityNiveau`
- Produces: `Warnung { code, text }`, `warnungen(eintrag, laeufer, niveau, opts?): Warnung[]`

- [ ] **Step 1: Write the failing test**

`tests/model/eignung-warnungen.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { warnungen } from '../../src/main/model/eignung'
import { normaliseEintrag, type ModellEintrag, type Faehigkeiten } from '../../src/main/model/entry'
import { CapabilityNiveau } from '../../src/main/preset/niveau'

function lokal(over: Partial<Faehigkeiten> = {}): ModellEintrag {
  return normaliseEintrag({
    id: 'spark-x', name: 'X', art: 'local-http',
    erreichbarkeit: { art: 'local-http', host: '100.78.7.108', port: 11434, model: 'x' },
    oertlichkeit: 'eigenes-netz', erklaertext: 'x', empfehlung: 'x',
    faehigkeiten: { codec: 'ollama-native', werkzeugmodus: 'nativ', quelle: 'gemessen',
      gemessenAm: '2026-08-16', gemessenMit: 'kanarie-1', nutzbaresKontextfenster: 131072, ...over },
  })
}

const codes = (w: { code: string }[]) => w.map(x => x.code)

describe('warnings sit on the assignment, never on the entry', () => {
  it('warns about the text tool protocol on the own loop', () => {
    expect(codes(warnungen(lokal({ werkzeugmodus: 'text' }), 'eigene-schleife', CapabilityNiveau.B)))
      .toContain('werkzeugmodus-text')
  })

  it('does not warn about the tool protocol on the one-shot runner — it uses no tools', () => {
    expect(codes(warnungen(lokal({ werkzeugmodus: 'text' }), 'ein-schuss', CapabilityNiveau.C)))
      .not.toContain('werkzeugmodus-text')
  })

  it('warns when an agentic niveau rests on an unmeasured row', () => {
    const vermutet = lokal({ quelle: 'vermutet', gemessenAm: null, gemessenMit: null })
    expect(codes(warnungen(vermutet, 'eigene-schleife', CapabilityNiveau.A))).toContain('nicht-gemessen')
  })

  it('warns when the context window is below the frame demand', () => {
    const w = warnungen(lokal({ nutzbaresKontextfenster: 8192 }), 'eigene-schleife',
      CapabilityNiveau.A, { startkontextToken: 40000 })
    expect(codes(w)).toContain('kontext-zu-klein')
  })

  it('does not apply the context rule when no number is known', () => {
    expect(codes(warnungen(lokal(), 'eigene-schleife', CapabilityNiveau.A))).not.toContain('kontext-zu-klein')
  })

  it('warns when a niveau sits below the runner capability', () => {
    expect(codes(warnungen(lokal(), 'eigene-schleife', CapabilityNiveau.C))).toContain('unter-faehigkeit')
  })

  it('warns that the prompt leaves the own network for a foreign-net entry', () => {
    const fremd = normaliseEintrag({
      id: 'or-x', name: 'X', art: 'api',
      erreichbarkeit: { art: 'api', baseUrl: 'https://openrouter.ai/api/v1', model: 'x', keyRef: 'openrouter' },
      oertlichkeit: 'fremdes-netz', erklaertext: 'x', empfehlung: 'x',
      faehigkeiten: { codec: 'openai-chat', werkzeugmodus: 'nativ', quelle: 'gemessen',
        gemessenAm: '2026-08-16', gemessenMit: 'kanarie-1' },
    })
    const c = codes(warnungen(fremd, 'ein-schuss', CapabilityNiveau.C))
    expect(c).toContain('verlaesst-netz')
    expect(c).toContain('teure-ebene-fuer-mechanik')
  })

  // The counter-proof. moondream (1B) failed the C contract twice while gemma4:26b,
  // qwen3-vl:30b and gpt-oss:120b passed first try — all four local. Keying the warning on
  // locality would shout at the 120B as loudly as at the 1B and become noise within a week.
  it('does NOT warn a strong measured local model on B for being local', () => {
    const w = codes(warnungen(lokal(), 'eigene-schleife', CapabilityNiveau.B))
    expect(w).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/model/eignung-warnungen.test.ts`
Expected: FAIL — `warnungen is not a function`

- [ ] **Step 3: Write the implementation**

An `src/main/model/eignung.ts` anhängen:

```ts
import type { ModellEintrag } from './entry'

export interface Warnung {
  /** Stable key for tests and for a surface that wants to group. */
  code: string
  /** German: this text reaches the user. */
  text: string
}

export interface WarnKontext {
  /** Start context of the frame in tokens, when a measurement exists. */
  startkontextToken?: number
}

/**
 * Warnings hang on the pairing of entry, Laeufer and niveau — never on the entry alone.
 * The same local 7B is harmless on C and a risk on B.
 *
 * None of these locks. Locking is `sperrgrund` and nothing else.
 */
export function warnungen(
  eintrag: ModellEintrag,
  laeufer: Laeufer,
  niveau: CapabilityNiveau,
  ctx: WarnKontext = {}
): Warnung[] {
  const out: Warnung[] = []
  const f = eintrag.faehigkeiten
  const agentisch = laeufer === 'eigene-schleife' || laeufer === 'fremdes-cli'

  if (laeufer === 'eigene-schleife' && (!f || f.werkzeugmodus === 'text')) {
    out.push({
      code: 'werkzeugmodus-text',
      text: 'Dieses Modell hat keinen nativen Werkzeugmodus — die Schleife laeuft ueber das ' +
        'Text-Protokoll, und das ist die Stelle, an der schwache Modelle zuerst brechen.',
    })
  }

  // A cli-harness entry carries no capability row by construction — entry.ts rejects one
  // that does. That is "no measurement applies", not "no measurement exists". Without this
  // guard the warning would fire on every Claude Code pairing, i.e. on the normal case.
  const messbar = eintrag.art !== 'cli-harness'
  if (agentisch && messbar && niveau !== CapabilityNiveau.C && (!f || f.quelle !== 'gemessen')) {
    out.push({
      code: 'nicht-gemessen',
      text: 'Fuer dieses Modell liegt keine eigene Messung vor — die Faehigkeitszeile ist vermutet.',
    })
  }

  if (f && ctx.startkontextToken && f.nutzbaresKontextfenster < ctx.startkontextToken) {
    out.push({
      code: 'kontext-zu-klein',
      text: `Der Startkontext dieser Rolle (${ctx.startkontextToken} Token) passt nicht in das ` +
        `nutzbare Kontextfenster (${f.nutzbaresKontextfenster} Token).`,
    })
  }

  if (niveau === CapabilityNiveau.C && eintrag.oertlichkeit === 'fremdes-netz') {
    out.push({
      code: 'teure-ebene-fuer-mechanik',
      text: 'Damit wird die teure Ebene fuer mechanische Arbeit eingespannt — das Gegenteil des Gefaelles.',
    })
  }

  // Only a C job on a runner that carries more is under-use worth naming. Anything below
  // the runner's capability would fire on niveau B over the own loop — the designed normal
  // case — and become the noise this section exists to avoid. Ruled by the user 2026-08-16.
  if (niveau === CapabilityNiveau.C && laeuferFaehigkeit(laeufer) !== CapabilityNiveau.C) {
    out.push({
      code: 'unter-faehigkeit',
      text: 'Das laeuft, nutzt den Laeufer aber nicht aus.',
    })
  }

  if (eintrag.oertlichkeit === 'fremdes-netz') {
    out.push({
      code: 'verlaesst-netz',
      text: 'Der Prompt verlaesst das eigene Netz.',
    })
  }

  return out
}
```

> **Korrigiert während der Umsetzung (2026-08-16, Nutzer-Entscheidung, gebaut in `7d55774`).**
> Die erste Fassung dieses Auszugs hatte einen Hilfsbegriff `laeuferTraegtNiveauExakt` und
> warnte bei **jedem** Niveau unterhalb der Läufer-Stufe. Das widersprach dem Gegenbeleg-Test
> im selben Task: `eigene-schleife` steht auf A, also hätte jede B-Zuordnung gewarnt — und B
> auf der eigenen Schleife ist der Normalfall, für den das Gefälle gebaut wird. Die Warnung
> hätte damit auf nahezu jeder Konfiguration gefeuert und wäre binnen einer Woche das Rauschen
> geworden, das dieser Abschnitt gerade vermeiden will.
>
> Es warnt jetzt allein **Niveau C auf einem Läufer, der mehr trägt** — der Fall, in dem
> wirklich eine Agentenschleife für Ein-Schuss-Arbeit verbraucht wird. Spec §7.3 ist
> entsprechend nachgezogen.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/model/eignung-warnungen.test.ts`
Expected: PASS, 8 Tests

- [ ] **Step 5: Korrigiere den überholten Punkt im Basiskonzept**

`docs/superpowers/specs/2026-08-14-modell-ebene-basiskonzept.md` §5 führt unter der Matrix den
Punkt *„A mit lokalem Modell: nicht anbietbar"*. Er stammt aus der Fassung **vor** der
Nutzer-Korrektur, die unmittelbar darüber steht. Bliebe er stehen, läse die nächste Session
zwei widersprüchliche Aussagen im selben Abschnitt — genau die Lage, die der M6-Nachtrag
gerade für NanoClaw aufgelöst hat.

Den Punkt **ersetzen** durch:

```markdown
- **A mit lokalem Modell:** hängt am Läufer. Über den CLI-Weg **nicht anbietbar** — das
  CLI-Harness bringt sein Modell mit, und ein lokales Modell dort einzutragen wäre eine
  stille Falle. Über das eigene Harness **erlaubt, mit der stärksten Warnung**: Es ist
  genau der Fall, für den das Gefälle gebaut wird, und zugleich die Stelle mit dem
  höchsten Ausfallrisiko. *(Präzisiert am 2026-08-16, siehe
  `2026-08-16-modell-registry-design.md` §7.4 — die frühere Fassung stammte aus der Zeit
  vor der Korrektur direkt darüber.)*
```

Die beiden anderen Punkte (B mit lokalem Modell, C mit großem API-Modell) bleiben unverändert.

- [ ] **Step 6: Verify and commit**

```bash
npm run typecheck >/dev/null 2>&1; echo "typecheck: $?"
git add src/main/model/eignung.ts tests/model/eignung-warnungen.test.ts docs/superpowers/specs/2026-08-14-modell-ebene-basiskonzept.md
git commit -m "feat(model): warning rules keyed on measured capability, not locality"
```

---

### Task 6: Registry laden, Config-Schlüssel, Auflösungsreihenfolge

**Files:**
- Create: `src/main/model/registry.ts`
- Modify: `src/main/config/config-store.ts`
- Test: `tests/model/registry.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_EINTRAEGE` (Task 2), `normaliseEintrag`, `ModellEintrag` (Task 1)
- Produces: `alleEintraege(): ModellEintrag[]`, `eintragNachId(id): ModellEintrag | null`, `eintragFuerTier(tier): ModellEintrag | null`, `eintragFuerRolle(rolle): ModellEintrag | null`, Config-Typ `ModelleConfig`

- [ ] **Step 1: Write the failing test**

`tests/model/registry.test.ts`:

```ts
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('registry resolution', () => {
  let tmpDir: string

  beforeEach(() => {
    vi.resetModules()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-registry-test-'))
  })

  afterEach(() => {
    vi.doUnmock('electron')
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  async function withConfig(cfg: unknown) {
    if (cfg !== null) {
      fs.writeFileSync(path.join(tmpDir, 'cipher-keel-config.json'), JSON.stringify(cfg))
    }
    vi.doMock('electron', () => ({ app: { getPath: () => tmpDir } }))
    return import('../../src/main/model/registry')
  }

  it('serves the bundled entries when config says nothing', async () => {
    const { alleEintraege, eintragNachId } = await withConfig(null)
    expect(alleEintraege().length).toBeGreaterThan(0)
    expect(eintragNachId('spark-gemma4-26b')?.name).toBe('Gemma4 26B (DGX Spark)')
  })

  it('leaves every assignment empty by default — behaviour is unchanged out of the box', async () => {
    const { eintragFuerTier, eintragFuerRolle } = await withConfig(null)
    expect(eintragFuerTier('heavy')).toBeNull()
    expect(eintragFuerRolle('worker')).toBeNull()
  })

  // The unrelated `llm` key is the point: it forces the file to exist, so loadConfig takes
  // the deepMerge branch instead of the no-file catch that returns defaults directly. That
  // merge branch is where the promise "an existing installation is unaffected" actually
  // lives. Do not simplify this back to an empty file — the coverage would vanish silently.
  it('behaves exactly as before for a config file written before this feature existed', async () => {
    const { alleEintraege, eintragNachId, eintragFuerTier, eintragFuerRolle } = await withConfig({
      llm: { tagging: { host: '127.0.0.1', port: 11434, model: 'altwert' } },
    })
    expect(alleEintraege().length).toBeGreaterThan(0)
    expect(eintragNachId('spark-gemma4-26b')?.name).toBe('Gemma4 26B (DGX Spark)')
    expect(eintragFuerTier('heavy')).toBeNull()
    expect(eintragFuerRolle('worker')).toBeNull()
  })

  it('lets a config entry override a bundled one of the same id', async () => {
    const { eintragNachId } = await withConfig({
      modelle: { eintraege: [{
        id: 'spark-gemma4-26b', name: 'Andere Gemma', art: 'local-http',
        erreichbarkeit: { art: 'local-http', host: '10.0.0.1', port: 11434, model: 'gemma4:26b' },
        oertlichkeit: 'eigenes-netz', erklaertext: 'x', empfehlung: 'x',
      }] },
    })
    expect(eintragNachId('spark-gemma4-26b')?.name).toBe('Andere Gemma')
  })

  it('resolves a tier assignment to its entry', async () => {
    const { eintragFuerTier } = await withConfig({
      modelle: { zuordnung: { tiers: { light: '', standard: '', heavy: 'claude-opus-cli' } } },
    })
    expect(eintragFuerTier('heavy')?.id).toBe('claude-opus-cli')
    expect(eintragFuerTier('light')).toBeNull()
  })

  it('returns null for an assignment pointing at an id nobody defines', async () => {
    const { eintragFuerRolle } = await withConfig({
      modelle: { zuordnung: { rollen: { tagging: '', worker: 'gibt-es-nicht' } } },
    })
    expect(eintragFuerRolle('worker')).toBeNull()
  })

  it('skips a broken config entry instead of taking the whole registry down', async () => {
    const { alleEintraege, eintragNachId } = await withConfig({
      modelle: { eintraege: [{ id: 'kaputt', art: 'telepathie' }] },
    })
    expect(eintragNachId('kaputt')).toBeNull()
    expect(alleEintraege().length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/model/registry.test.ts`
Expected: FAIL — `Cannot find module '../../src/main/model/registry'`

- [ ] **Step 3: Extend the config store**

In `src/main/config/config-store.ts`, im Interface `CipherKeelConfig` nach `llm` einfügen:

```ts
  /**
   * The model registry. Bundled defaults live in `model/defaults.ts`; entries here
   * override them by id. Assignments are empty by default, which is what keeps a config
   * file written before this feature behaving exactly as it did.
   */
  modelle: {
    eintraege: unknown[]
    zuordnung: {
      tiers: { light: string; standard: string; heavy: string }
      rollen: { tagging: string; worker: string }
    }
  }
```

Und in `defaults`:

```ts
  modelle: {
    eintraege: [],
    zuordnung: {
      tiers: { light: '', standard: '', heavy: '' },
      rollen: { tagging: '', worker: '' },
    },
  },
```

`eintraege` ist bewusst `unknown[]`: Die Config trägt lose Formen, `normaliseEintrag` macht daraus die Union — dieselbe Arbeitsteilung wie bei `LlmEndpoint` und `normaliseEndpoint`.

- [ ] **Step 4: Write the registry**

`src/main/model/registry.ts`:

```ts
/**
 * registry — the one list, and the order in which an assignment is resolved.
 *
 * Two rules carry the whole module:
 *
 *   1. Config entries override bundled ones by id; unknown ids are added.
 *   2. An assignment that names nothing resolves to null, and the caller falls back to
 *      the old value. That is what makes a config file written before this feature behave
 *      exactly as it did.
 *
 * A broken config entry is skipped with a warning rather than taking the registry down:
 * one bad hand-edited line should not cost a user every model they have.
 */

import { configStore } from '../config/config-store'
import { DEFAULT_EINTRAEGE } from './defaults'
import { normaliseEintrag, type ModellEintrag } from './entry'

export type Tier = 'light' | 'standard' | 'heavy'
export type Rolle = 'tagging' | 'worker'

export function alleEintraege(): ModellEintrag[] {
  const byId = new Map<string, ModellEintrag>()
  for (const e of DEFAULT_EINTRAEGE) byId.set(e.id, e)

  for (const raw of configStore.get('modelle').eintraege) {
    try {
      const e = normaliseEintrag(raw)
      byId.set(e.id, e)
    } catch (err) {
      // Loud, not silent — a skipped entry that says nothing is the expensive kind of failure.
      console.warn('[model-registry] Eintrag aus der Konfiguration uebersprungen:', err)
    }
  }
  return [...byId.values()]
}

export function eintragNachId(id: string): ModellEintrag | null {
  if (!id) return null
  return alleEintraege().find(e => e.id === id) ?? null
}

export function eintragFuerTier(tier: Tier): ModellEintrag | null {
  return eintragNachId(configStore.get('modelle').zuordnung.tiers[tier])
}

export function eintragFuerRolle(rolle: Rolle): ModellEintrag | null {
  return eintragNachId(configStore.get('modelle').zuordnung.rollen[rolle])
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/model/registry.test.ts`
Expected: PASS, 6 Tests

- [ ] **Step 6: Verify and commit**

```bash
npm test >/dev/null 2>&1; echo "tests: $?"
npm run typecheck >/dev/null 2>&1; echo "typecheck: $?"
git add src/main/model/registry.ts src/main/config/config-store.ts tests/model/registry.test.ts
git commit -m "feat(model): registry loading with assignment resolution order"
```

---

### Task 7: `model-resolver` liest die Registry, ohne seine Reinheit zu verlieren

`resolveModel` bleibt eine reine Funktion. Die Registry kommt als **injizierter Lookup** dazu — so bleiben die bestehenden Tests unverändert grün, und die neue Regel ist ohne Config testbar.

**Files:**
- Modify: `src/main/session/model-resolver.ts`
- Modify: `src/main/model/registry.ts` (`cliHandleFuerTier` kommt dazu)
- Modify: `src/main/ipc-handlers.ts:252`, `src/main/session/preview-prompt.ts:70`
- Test: `tests/session/model-resolver.test.ts` (erweitern)

**Interfaces:**
- Consumes: `eintragFuerTier` (Task 6)
- Produces: `TierLookup = (tier: keyof ModelTiers) => string | undefined`; `resolveModel(rahmenModel, tiers, lookup?)`

- [ ] **Step 1: Write the failing test**

An `tests/session/model-resolver.test.ts` anhängen:

```ts
describe('resolveModel with a registry lookup', () => {
  it('prefers the registry handle over the configured tier value', () => {
    const lookup = (t: string) => (t === 'heavy' ? 'opus-aus-registry' : undefined)
    expect(resolveModel('heavy', TIERS, lookup)).toBe('opus-aus-registry')
  })

  it('falls back to the tier value when the registry has no assignment', () => {
    expect(resolveModel('heavy', TIERS, () => undefined)).toBe('opus')
  })

  it('behaves exactly as before when no lookup is passed', () => {
    expect(resolveModel('heavy', TIERS)).toBe('opus')
  })

  it('never consults the registry for a provider-qualified handle', () => {
    const lookup = () => { throw new Error('lookup must not be called') }
    expect(resolveModel('ollama:gemma4:26b', TIERS, lookup)).toBe('ollama:gemma4:26b')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/session/model-resolver.test.ts`
Expected: FAIL — der erste neue Test liefert `'opus'` statt `'opus-aus-registry'`

- [ ] **Step 3: Extend the resolver**

In `src/main/session/model-resolver.ts`:

```ts
/**
 * Where a tier's handle comes from when the registry has an assignment for it. Injected
 * rather than imported so this module stays pure and testable without a config file.
 */
export type TierLookup = (tier: keyof ModelTiers) => string | undefined

export function resolveModel(
  rahmenModel: string,
  tiers: ModelTiers,
  lookup?: TierLookup
): string | undefined {
  if (!rahmenModel) return undefined

  // A colon marks a provider-qualified handle — never a tier, and never a registry lookup.
  if (rahmenModel.includes(':')) return rahmenModel

  if (!TIER_KEYS.has(rahmenModel)) return undefined
  const tier = rahmenModel as keyof ModelTiers

  // Registry first, configured tier value second. An unresolvable value still yields
  // undefined, which means "omit --model" — a missing registry must not stop a session.
  const ausRegistry = lookup?.(tier)
  if (ausRegistry) return ausRegistry

  const handle = tiers[tier]
  return handle ? handle : undefined
}
```

Und den Kommentarblock am Dateikopf korrigieren — die Zeile *„Schenkel 2 (NanoClaw): a `provider:modell` handle"* wird zu:

```
 *   A provider-qualified handle (`ollama:gemma4:26b`) is passed through untouched —
 *   cipher keel does not own that namespace. It used to be labelled "Schenkel 2
 *   (NanoClaw)"; NanoClaw was superseded on 2026-08-16 (M6 addendum), the form was not.
```

- [ ] **Step 4: Add the lookup helper to the registry**

Er gehört nicht in den reinen Resolver und wird von zwei Aufrufern gebraucht — also genau einmal,
in `src/main/model/registry.ts`:

```ts
/**
 * The CLI handle a tier assignment points at, or undefined when nothing is assigned.
 * Only a cli-harness entry has a handle; anything else means "no assignment for this tier"
 * rather than an error, because a session must still start.
 */
export function cliHandleFuerTier(tier: Tier): string | undefined {
  const e = eintragFuerTier(tier)
  return e?.erreichbarkeit.art === 'cli-harness' ? e.erreichbarkeit.handle : undefined
}
```

- [ ] **Step 5: Wire the two call sites**

In `src/main/ipc-handlers.ts` — Import ergänzen und Zeile 252 erweitern:

```ts
import { cliHandleFuerTier } from './model/registry'

const model = resolveModel(
  def.rahmen.model,
  configStore.get('agent').modelTiers,
  cliHandleFuerTier
)
```

In `src/main/session/preview-prompt.ts` — derselbe Import und Zeile 70:

```ts
import { cliHandleFuerTier } from '../model/registry'

modelResolved: resolveModel(def.rahmen.model, tiers, cliHandleFuerTier) ?? null,
```

Die Prompt-Vorschau muss denselben Wert zeigen wie der Start — sie war schon einmal
zeichengleich mit der ausgelieferten Datei, und das soll sie bleiben.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/session/ tests/model/`
Expected: PASS — die vier neuen und alle bestehenden `resolveModel`-Tests

- [ ] **Step 7: Verify and commit**

```bash
npm test >/dev/null 2>&1; echo "tests: $?"
npm run typecheck >/dev/null 2>&1; echo "typecheck: $?"
git add src/main/session/model-resolver.ts src/main/model/registry.ts src/main/ipc-handlers.ts src/main/session/preview-prompt.ts tests/session/model-resolver.test.ts
git commit -m "feat(model): tier resolution reads the registry before the config table"
```

---

### Task 8: Rollen-Auflösung wandert aus `model-client.ts`

Verhindert den Importzyklus `model-client → registry → entry → model-client`.

**Files:**
- Create: `src/main/model/rollen.ts`
- Modify: `src/main/worker/model-client.ts` (`endpointForRole` entfernen, `LlmRole` bleibt)
- Modify: `src/main/notes/note-tagging.ts:8,208`
- Test: `tests/model/rollen.test.ts`

**Interfaces:**
- Consumes: `eintragFuerRolle` (Task 6), `toModelEndpoint` (Task 1), `normaliseEndpoint` und `LlmRole` (`model-client.ts`)
- Produces: `endpointForRole(role: LlmRole): ModelEndpoint` — gleicher Name, neuer Ort

- [ ] **Step 1: Write the failing test**

`tests/model/rollen.test.ts`:

```ts
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('endpointForRole', () => {
  let tmpDir: string

  beforeEach(() => {
    vi.resetModules()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-rollen-test-'))
  })

  afterEach(() => {
    vi.doUnmock('electron')
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  async function withConfig(cfg: unknown) {
    if (cfg !== null) {
      fs.writeFileSync(path.join(tmpDir, 'cipher-keel-config.json'), JSON.stringify(cfg))
    }
    vi.doMock('electron', () => ({ app: { getPath: () => tmpDir } }))
    return import('../../src/main/model/rollen')
  }

  it('uses the old llm.* endpoint when no assignment exists', async () => {
    const { endpointForRole } = await withConfig({
      llm: { worker: { host: '10.9.9.9', port: 11434, model: 'altwert' } },
    })
    const ep = endpointForRole('worker')
    expect(ep.kind).toBe('ollama')
    if (ep.kind === 'ollama') {
      expect(ep.host).toBe('10.9.9.9')
      expect(ep.model).toBe('altwert')
    }
  })

  it('prefers the registry entry once the assignment points at one', async () => {
    const { endpointForRole } = await withConfig({
      llm: { worker: { host: '10.9.9.9', port: 11434, model: 'altwert' } },
      modelle: { zuordnung: { rollen: { tagging: '', worker: 'spark-gemma4-26b' } } },
    })
    const ep = endpointForRole('worker')
    // Unconditional first. The narrowing `if` below exists only for the type checker — it
    // must never be the thing that decides whether an assertion runs, or a regression
    // returning the wrong kind would skip the block and report green.
    expect(ep.kind).toBe('ollama')
    if (ep.kind === 'ollama') {
      expect(ep.host).toBe('100.78.7.108')
      expect(ep.model).toBe('gemma4:26b')
    }
  })

  it('refuses a cli-harness entry for a role — it has no endpoint', async () => {
    const { endpointForRole } = await withConfig({
      modelle: { zuordnung: { rollen: { tagging: '', worker: 'claude-opus-cli' } } },
    })
    expect(() => endpointForRole('worker')).toThrow('bringt sein Modell selbst mit')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/model/rollen.test.ts`
Expected: FAIL — `Cannot find module '../../src/main/model/rollen'`

- [ ] **Step 3: Move the function**

`src/main/model/rollen.ts` **neu**:

```ts
/**
 * rollen — which endpoint a role reaches.
 *
 * This used to sit in `worker/model-client.ts`. It moved because the registry needs
 * `normaliseEndpoint` from there, and a role resolution reading the registry would have
 * closed the cycle `model-client -> registry -> entry -> model-client`. `model-client`
 * now carries transport concerns only. Same trap that keeps `filterByNiveau` in
 * `capability-schema.ts` rather than in `capabilities.ts`.
 *
 * Resolution order: registry assignment first, the old inline `llm.*` endpoint second.
 */

import { configStore } from '../config/config-store'
import { normaliseEndpoint, type ModelEndpoint, type LlmRole } from '../worker/model-client'
import { eintragFuerRolle } from './registry'
import { toModelEndpoint } from './entry'

export function endpointForRole(role: LlmRole): ModelEndpoint {
  const eintrag = eintragFuerRolle(role)
  if (eintrag) return toModelEndpoint(eintrag.erreichbarkeit)
  return normaliseEndpoint(configStore.get('llm')[role])
}
```

In `src/main/worker/model-client.ts` die Funktion `endpointForRole` **löschen**; `LlmRole` bleibt dort exportiert. Der Import von `configStore` wird dort dadurch ungenutzt — entfernen, sonst schlägt `npm run lint` fehl.

In `src/main/notes/note-tagging.ts` Zeile 8:

```ts
import { clientForEndpoint } from '../worker/model-client'
import { endpointForRole } from '../model/rollen'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/model/ tests/worker/ tests/notes/`
Expected: PASS — insbesondere die bestehenden `note-tagging`-Tests unverändert

- [ ] **Step 5: Verify and commit**

```bash
npm test >/dev/null 2>&1; echo "tests: $?"
npm run typecheck >/dev/null 2>&1; echo "typecheck: $?"
npm run lint >/dev/null 2>&1; echo "lint: $?"
git add src/main/model/rollen.ts src/main/worker/model-client.ts src/main/notes/note-tagging.ts tests/model/rollen.test.ts
git commit -m "refactor(model): move role resolution out of model-client to break the cycle"
```

---

### Task 9: `KNOWN_RUNTIMES` und der `c-worker`-Kommentar

Die beiden Posten, die der M6-Nachtrag ausdrücklich in diese Strecke legt. **Nicht mehr:** Der übrige NanoClaw-Rückbau gehört in den Harness-Plan, und der Nachtrag trennt dort reine Altlast von bloßer Umverdrahtung.

**Files:**
- Modify: `src/main/preset/schema.ts:77-80`
- Modify: `src/main/worker/c-worker.ts:1-6`
- Test: `tests/preset/known-runtimes.test.ts`

**Interfaces:**
- Produces: `keel-harness` als gültiger `runtime`-Wert

- [ ] **Step 1: Write the failing test**

`tests/preset/known-runtimes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validatePresetRahmen } from '../../src/main/preset/schema'

// Required fields are id, name, rollenTyp, capabilityNiveau — everything else is optional,
// so a fixture only needs those four plus the runtime under test.
function rahmen(runtime: string) {
  return {
    id: 'probe',
    name: 'Probe',
    rollenTyp: 'beauftragte-instanz',
    capabilityNiveau: 'A',
    runtime,
  }
}

/** validatePresetRahmen collects errors, it does not throw. Look at the runtime field only. */
const runtimeErrors = (runtime: string) =>
  validatePresetRahmen(rahmen(runtime)).errors.filter(e => e.field === 'runtime')

describe('KNOWN_RUNTIMES after the NanoClaw supersession', () => {
  it('accepts the own harness as the third runtime (M8 section 11)', () => {
    expect(runtimeErrors('keel-harness')).toEqual([])
  })

  it('still accepts the CLI path', () => {
    expect(runtimeErrors('claude-cli-tmux')).toEqual([])
  })

  it('rejects nanoclaw-channel-route — superseded on 2026-08-16', () => {
    const errs = runtimeErrors('nanoclaw-channel-route')
    expect(errs).toHaveLength(1)
    expect(errs[0].message).toMatch(/Unknown runtime/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/preset/known-runtimes.test.ts`
Expected: FAIL — `keel-harness` wird abgelehnt, `nanoclaw-channel-route` akzeptiert

- [ ] **Step 3: Change the two places**

`src/main/preset/schema.ts`:

```ts
const KNOWN_RUNTIMES = new Set<string>([
  'claude-cli-tmux',
  // The own agent loop (M8). Third value, added when NanoClaw was superseded on
  // 2026-08-16 — `nanoclaw-channel-route` was removed in the same change.
  'keel-harness',
])
```

`src/main/worker/c-worker.ts`, Zeilen 1–6 ersetzen:

```ts
/**
 * c-worker — Niveau C: one prompt in, one checked answer out.
 *
 * Niveau is a capability filter over a role and says nothing about the model; the runtime
 * is a separate choice (M8 section 6, decision E19). This runner is the one-shot Laeufer:
 * a model with no tools, no state and no conversation, whose single obligation is to
 * answer in an agreed shape. Iterations are new calls, not turns.
 *
 * The earlier comment here read "the three niveaus are three runtimes. A is Claude Code,
 * B is NanoClaw, and C is keel itself". That described the build of August 2026, not the
 * model, and NanoClaw was superseded on 2026-08-16.
 */
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/preset/ tests/worker/ tests/agent/`
Expected: PASS. Fallen `tests/agent/adapter-runtime-resolution.test.ts` oder `tests/nanoclaw/adapter.test.ts`, weil sie `nanoclaw-channel-route` als gültig voraussetzen: **den Test anpassen, nicht den Wert zurückholen** — die Ablösung ist ratifiziert. Der zugehörige Eintrag in `RUNTIME_TO_ADAPTER_ID` (`src/main/agent/registry.ts:51`) wird in derselben Änderung entfernt, sonst zeigt eine Abbildung auf einen Laufzeitwert, den es nicht mehr gibt.

- [ ] **Step 5: Verify and commit**

```bash
npm test >/dev/null 2>&1; echo "tests: $?"
npm run verify:bundle >/dev/null 2>&1; echo "bundle: $?"
git add src/main/preset/schema.ts src/main/worker/c-worker.ts src/main/agent/registry.ts tests/
git commit -m "feat(preset): keel-harness replaces nanoclaw-channel-route as a runtime"
```

---

### Task 10: Der Wächtertest — die Matrizen haben eine Quelle

Der wichtigste Test der Strecke. Das Basiskonzept verlangt wörtlich, die Matrix gehöre in den Code und nicht in die Oberfläche; ohne Wächter ist das eine Absicht, die die erste Settings-Seite bricht.

**Files:**
- Test: `tests/model/eignung-einzige-quelle.test.ts`

**Interfaces:**
- Consumes: alles aus `src/main/model/eignung.ts`

- [ ] **Step 1: Write the test**

`tests/model/eignung-einzige-quelle.test.ts`:

```ts
import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'

const SRC = path.join(__dirname, '../../src')

function alleQuelldateien(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) alleQuelldateien(p, out)
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p)
  }
  return out
}

// The capability lists once knew the same thing in five places and drifted. The matrices
// get one home, and a second one is a build failure rather than a code review finding.
describe('the suitability rules have exactly one home', () => {
  const erlaubt = [
    path.join(SRC, 'main/model/eignung.ts'),
  ]

  it('names the three Laeufer only in eignung.ts', () => {
    const treffer = alleQuelldateien(SRC)
      .filter(f => !erlaubt.includes(f))
      .filter(f => /'eigene-schleife'|"eigene-schleife"/.test(fs.readFileSync(f, 'utf8')))
    expect(treffer, `Laeufer ausserhalb von eignung.ts: ${treffer.join(', ')}`).toEqual([])
  })

  it('states the runner capability level only in eignung.ts', () => {
    const treffer = alleQuelldateien(SRC)
      .filter(f => !erlaubt.includes(f))
      .filter(f => /laeuferFaehigkeit\s*[:=]\s*\{|FAEHIGKEIT\s*:\s*Record/.test(fs.readFileSync(f, 'utf8')))
    expect(treffer, `zweite Faehigkeitstabelle: ${treffer.join(', ')}`).toEqual([])
  })

  it('keeps every warning text in eignung.ts, so no surface writes its own', () => {
    const treffer = alleQuelldateien(SRC)
      .filter(f => !erlaubt.includes(f))
      .filter(f => /Gegenteil des Gefaelles|verlaesst das eigene Netz/.test(fs.readFileSync(f, 'utf8')))
    expect(treffer, `Warntext ausserhalb von eignung.ts: ${treffer.join(', ')}`).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/model/eignung-einzige-quelle.test.ts`
Expected: PASS, 3 Tests. **Fällt einer, ist das ein echter Fund** — dann liegt die Regel bereits an zwei Stellen und gehört zusammengezogen, bevor der Test angepasst wird.

- [ ] **Step 3: Verify and commit**

```bash
npm test >/dev/null 2>&1; echo "tests: $?"
git add tests/model/eignung-einzige-quelle.test.ts
git commit -m "test(model): guard that the suitability rules have exactly one home"
```

---

### Task 11: Beleg in der laufenden App

Grüne Tests sagen in diesem Repo über eine Verdrahtung **nichts** — kein Test erreicht einen `ipcMain`-Handler. Diese Strecke endet deshalb mit einem Messprotokoll, nicht mit einer Behauptung.

**Files:**
- Modify: dieser Plan (Messprotokoll am Ende eintragen)

**Kein Probe-Skript.** Ein Skript außerhalb der App käme nicht an `app.getPath('userData')` und
damit nicht an die Config — jeder Umweg dorthin würde etwas anderes messen als das, was die App
tut. Beide Konsumenten sind aus der laufenden App erreichbar: `cliHandleFuerTier` über einen
Session-Start, `endpointForRole` über das Notizen-Tagging. Das genügt, und es ist näher am Ziel.

**Die Config liegt unter** `~/Library/Application Support/cipher-keel-electron/cipher-keel-config.json`
— geprüft am 2026-08-16. *(Der Kopfkommentar in `config-store.ts` nennt `~/.config/cipher-keel/`;
das ist veraltet und sollte in dieser Strecke gleich mitkorrigiert werden.)*

- [ ] **Step 1: Beleg 1 — Rückwärtsverträglichkeit ohne jede Config-Änderung**

App über `.claude/skills/run-keel/` starten, eine Architect-Session öffnen, die Kommandozeile
der tmux-Pane ablesen.

Erwartet: `--model opus`, unverändert. Es existiert keine `modelle`-Zuordnung, also gilt
`agent.modelTiers`. **Das ist der Beleg, dass eine bestehende Installation sich nicht ändert** —
der wichtigste der vier.

Festhalten: die tatsächliche Kommandozeile, wörtlich.

- [ ] **Step 2: Beleg 2 — Die Registry trägt, sobald sie zugeordnet wird**

App beenden. In der Config setzen:

```json
"modelle": {
  "eintraege": [],
  "zuordnung": {
    "tiers": { "light": "", "standard": "", "heavy": "claude-haiku-cli" },
    "rollen": { "tagging": "", "worker": "" }
  }
}
```

**Absichtlich `claude-haiku-cli`, nicht `claude-opus-cli`:** Ein Eintrag, der denselben Wert
liefert wie der Altwert, belegt nichts — die Kommandozeile sähe gleich aus, egal welcher Pfad
gewonnen hat. Der Wechsel muss sichtbar sein.

App starten, Architect-Session öffnen.

Erwartet: `--model haiku`, **ohne dass `agent.modelTiers` angefasst wurde**. Die Prompt-Vorschau
(Launcher → Preset → 👁) muss denselben Wert zeigen wie die Kommandozeile.

Festhalten: Kommandozeile und Vorschau-Wert.

- [ ] **Step 3: Beleg 3 — C erreicht dasselbe Modell über die Zuordnung**

App beenden. `"rollen": { "tagging": "spark-gemma4-26b", "worker": "" }` setzen, App starten,
eine Notiz anlegen, deren Tagging anläuft.

Erwartet: Die Anfrage geht an `100.78.7.108:11434` mit `gemma4:26b` statt an den Altwert aus
`llm.tagging` (`127.0.0.1:11434`). **Beide Ausgänge belegen dasselbe:** Läuft es durch, ist der
Endpunkt aufgelöst; ist der Spark nicht erreichbar, nennt die Fehlermeldung `host:port` wörtlich
— und das ist derselbe Beleg.

**Zur GPU:** Der Spark ist durch den cipher-voice-Trainingslauf belegt; Ollama weicht dann auf
CPU aus, und ein 26B läuft ins Timeout. Für diesen Beleg genügt der **aufgelöste Endpunkt**. Ein
Durchsatz-Vergleich wäre ohne Abstimmung der GPU-Nutzung ohnehin nicht fair zu messen.

- [ ] **Step 4: Beleg 4 — Eine gesperrte Zuordnung wird abgelehnt und benennt die Zelle**

App beenden. `"tagging": "claude-opus-cli"` setzen, App starten, erneut eine Notiz anlegen.

Erwartet: Ein Fehler, der wörtlich sagt, dass ein cli-harness-Eintrag sein Modell selbst
mitbringt — sichtbar, nicht stillschweigend übergangen.

**Absichtlich erzwungen, nicht abgewartet.** Eine korrekte Konfiguration hätte diesen Pfad nie
gezeigt, genauso wenig wie ein starkes Modell den Reparaturweg des C-Vertrags gezeigt hätte.

- [ ] **Step 5: Konfiguration zurücksetzen**

Den `modelle`-Block wieder auf die Voreinstellung bringen (alle Zuordnungen leer). Eine Probe,
die ihre Spuren behält, macht die nächste Messung wertlos — und würde hier still das
Tagging-Modell verstellen.

Danach die App einmal starten und eine Notiz anlegen: Das Tagging muss wieder gegen
`127.0.0.1:11434` laufen. **Das Zurücksetzen wird belegt, nicht angenommen.**

- [ ] **Step 6: Messprotokoll in diesen Plan schreiben und committen**

Am Ende dieses Dokuments einen Abschnitt „Messprotokoll" anlegen: die vier Belege, die
wörtlichen Kommandozeilen und Fehlermeldungen, das Datum. **Kein „funktioniert" ohne die Ausgabe
daneben.** Was nicht belegt werden konnte, wird als nicht belegt notiert — nicht weggelassen.

```bash
npm test >/dev/null 2>&1; echo "tests: $?"
npm run typecheck >/dev/null 2>&1; echo "typecheck: $?"
npm run lint >/dev/null 2>&1; echo "lint: $?"
npm run verify:bundle >/dev/null 2>&1; echo "bundle: $?"
git branch --show-current   # muss modell-registry sein
git add docs/superpowers/plans/2026-08-16-modell-registry.md src/main/config/config-store.ts
git commit -m "docs(model): measurement log for the registry wiring in the running app"
```

---

## Was diese Strecke nicht tut

- **Keine Settings-Oberfläche.** Sie ist der nächste Schritt und liest diese Schicht ab.
- **Kein Harness.** `faehigkeiten` wird deklariert, nicht benutzt.
- **Kein Kanarienauftrag.** Nur `quelle` und die Sichtbarkeit von *vermutet*.
- **Kein NanoClaw-Rückbau** über Task 9 hinaus.
- **Keine Änderung am Rückgabe-Vertrag.**
- **Keine Auftrags-Schnittstelle für C.**

## Offene Punkte nach dieser Strecke

- Die Schwelle „nutzbares Kontextfenster gegen Startkontext des Rahmens" greift nur, wo eine Zahl vorliegt. Für Niveau A ist sie gemessen (~37 900 Token beim Architect), für die eigene Schleife noch nicht.
- Ob die Tier-Voreinstellungen weiterhin Aliase (`opus`) führen oder gepinnte Ids, bleibt offen — beide Formen sind ausdrückbar.
- Welche Einträge gebündelt ausgeliefert werden, ist eine Pflegefrage. Task 2 setzt den ersten Satz; er wächst mit der Maschine, nicht mit dem Katalog.
