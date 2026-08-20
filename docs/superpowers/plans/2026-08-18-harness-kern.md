# Harness-Kern Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine eigene Agentenschleife im Electron-Hauptprozess, die gegen drei Anbieter läuft, lesende Werkzeuge ausführt, jeden Zug in ein append-only Protokoll schreibt und aus diesem Protokoll fortsetzbar ist.

**Architecture:** `src/main/harness/` ist electron-frei und besteht aus zehn reinen Modulen plus vier mit I/O. Der Zustand liegt ausschließlich im Ereignisprotokoll (`harness.db`); der Nachrichtenverlauf ist eine reine Projektion darüber, weshalb Wiederaufnahme kein eigener Codepfad ist. Anbieterunterschiede leben in zwei Codecs, die nur `toWire`/`fromWire` können und keinen Schleifenzustand sehen.

**Tech Stack:** TypeScript, Electron, better-sqlite3, vitest, React (nur für das Abnahme-Panel).

**Spec:** `docs/superpowers/specs/2026-08-18-harness-kern-design.md`
**Autorität:** `cipher-keel-harness-ideation/deliverables/konzept_v1.0.md` (M8)
**Zweig:** `harness-kern` (existiert, trägt die Spec-Commits)

## Global Constraints

- **Deutsch für alles, was ein Mensch liest.** Fehlermeldungen, Werkzeugbeschreibungen, Anweisungstexte, Doku. Bezeichner und Code-Kommentare wie im Bestand: englische Kommentare, deutsche Domänennamen in der jüngsten Schicht (`eignung.ts`, `slots.ts`, `ansicht.ts`).
- **Kein Modul unter `src/main/harness/` importiert `electron`.** Ohne Ausnahmeliste. Die IPC-Fläche liegt in `src/main/harness-handlers.ts`.
- **Kein Fehlertext enthält ein Geheimnis oder den Namen, unter dem eines abgelegt ist.**
- **Kein stilles Verschlucken.** Was ein Modell nicht kann, wird gemeldet, nicht weggelassen.
- Tests laufen mit `npx vitest run <pfad>`; die volle Suite mit `npm test`. Typecheck `npm run typecheck`, Lint `npm run lint`.
- Nach jeder Aufgabe: `npm test && npm run typecheck && npm run lint` müssen grün sein, bevor committet wird.
- Commit-Betreffs ohne Umlaute (Hausgebrauch); Fließtext in Commit-Bodies darf sie tragen.
- Node ≥ 22, `better-sqlite3` synchron, Hauptprozess einfädig.

## Dateistruktur

| Datei | Verantwortung | Aufgabe |
|---|---|---|
| `src/main/harness/ereignisse.ts` | Ereignistypen, Nutzlast-Formen | 1 |
| `src/main/harness/protokoll.ts` | SQLite-Schema, Trigger, anhängen, lesen | 1 |
| `src/main/harness/form.ts` | kanonische Blöcke und Nachrichten | 2 |
| `src/main/harness/projektion.ts` | Ereignisse → Verlauf | 2 |
| `src/main/harness/codec.ts` | Codec-Interface, Codec-Auswahl | 3 |
| `src/main/harness/codec-openai-chat.ts` | OpenAI-Chat-Drahtform | 3 |
| `src/main/harness/codec-anthropic.ts` | Anthropic-Messages-Drahtform | 4 |
| `src/main/worker/model-client.ts` | `chat()`, `ModelAntwort`, Anthropic-Endpunkt | 5 |
| `src/main/worker/anthropic-client.ts` | dritter `ModelClient` | 5 |
| `src/main/harness/praefix.ts` | Ordnung, Stummelliste, determ. Serialisierung | 6 |
| `src/main/harness/preise.ts` | versionierte Preistabelle | 7 |
| `src/main/harness/budget.ts` | vier Budgets, Endzustände, Abschlussgründe | 7 |
| `src/main/harness/pfadwache.ts` | Symlink-Auflösung, geschützte Pfade, Wurzel | 8 |
| `src/main/harness/werkzeuge.ts` | Registry, Stummel, Schema-Nachreichung | 9 |
| `src/main/harness/werkzeug-datei.ts` | lesen, listen, suchen | 9 |
| `src/main/harness/werkzeug-graph.ts` | vier lesende Graph-Werkzeuge | 10 |
| `src/main/harness/lauf.ts` | die Schleife | 11, 12 |
| `src/main/harness/index.ts` | öffentliche Fläche | 12 |
| `src/main/harness-handlers.ts` | vier IPC-Kanäle | 13 |
| `src/renderer/windows/harness-window.*` | Fenster | 13 |
| `src/renderer/components/harness/EreignisPanel.tsx` | Anzeige | 13 |

---

### Task 1: Das Ereignisprotokoll

**Files:**
- Create: `src/main/harness/ereignisse.ts`
- Create: `src/main/harness/protokoll.ts`
- Test: `tests/harness/protokoll.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces: `type EreignisArt`, `interface Ereignis { laufId, seq, ts, art, nutzlast }`, `oeffneHarnessDb(pfad, nativeBinding?): Database`, `anhaengen(db, laufId, art, nutzlast): Ereignis`, `lesen(db, laufId): Ereignis[]`, `laufIds(db): string[]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/harness/protokoll.test.ts
import { describe, it, expect } from 'vitest'
import { oeffneHarnessDb, anhaengen, lesen, laufIds } from '../../src/main/harness/protokoll'

describe('protokoll', () => {
  it('vergibt seq je Lauf aufsteigend ab 1', () => {
    const db = oeffneHarnessDb(':memory:')
    anhaengen(db, 'lauf-a', 'run.started', { modellId: 'x' })
    anhaengen(db, 'lauf-a', 'prompt.sent', { text: 'hallo' })
    anhaengen(db, 'lauf-b', 'run.started', { modellId: 'y' })
    expect(lesen(db, 'lauf-a').map(e => e.seq)).toEqual([1, 2])
    expect(lesen(db, 'lauf-b').map(e => e.seq)).toEqual([1])
  })

  it('gibt die Nutzlast als Objekt zurueck, nicht als JSON-Text', () => {
    const db = oeffneHarnessDb(':memory:')
    anhaengen(db, 'lauf-a', 'prompt.sent', { text: 'hallo' })
    expect(lesen(db, 'lauf-a')[0].nutzlast).toEqual({ text: 'hallo' })
  })

  it('lehnt UPDATE auf der Ereignistabelle ab', () => {
    const db = oeffneHarnessDb(':memory:')
    anhaengen(db, 'lauf-a', 'prompt.sent', { text: 'hallo' })
    expect(() => db.prepare("UPDATE ereignisse SET art = 'x'").run())
      .toThrow('Ereignisse sind append-only')
  })

  it('lehnt DELETE auf der Ereignistabelle ab', () => {
    const db = oeffneHarnessDb(':memory:')
    anhaengen(db, 'lauf-a', 'prompt.sent', { text: 'hallo' })
    expect(() => db.prepare('DELETE FROM ereignisse').run())
      .toThrow('Ereignisse sind append-only')
  })

  it('nennt die Laeufe in der Reihenfolge ihres Beginns', () => {
    const db = oeffneHarnessDb(':memory:')
    anhaengen(db, 'lauf-a', 'run.started', {})
    anhaengen(db, 'lauf-b', 'run.started', {})
    expect(laufIds(db)).toEqual(['lauf-a', 'lauf-b'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness/protokoll.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/main/harness/protokoll"`

- [ ] **Step 3: Write `ereignisse.ts`**

```ts
/**
 * ereignisse — what the loop writes down, and nothing else.
 *
 * The list is deliberately shorter than M8 section 3.1: an event type whose trigger does not
 * exist yet is not declared. Tool events are here because this stretch has reading tools;
 * delegation, heartbeat and suspension are not.
 */

export type EreignisArt =
  | 'run.started'
  | 'prompt.sent'
  | 'model.answered'
  | 'tool.intent'
  | 'tool.completed'
  | 'tool.failed'
  | 'tool.schema_loaded'
  | 'budget.warned'
  | 'run.finished'

export interface Ereignis {
  laufId: string
  seq: number
  /** ISO-8601, UTC. */
  ts: string
  art: EreignisArt
  nutzlast: Record<string, unknown>
}
```

- [ ] **Step 4: Write `protokoll.ts`**

```ts
/**
 * protokoll — the append-only event log, and the only place the harness touches SQLite.
 *
 * Its own file rather than a table in graph.db: CK-GRAPH-001 calls that database a derived
 * index, discardable and rebuildable from the vault. A log that a run is resumed from is the
 * opposite of a discardable derivation.
 *
 * The triggers are the enforcement, the test is only the proof. A guard test that greps the
 * source for UPDATE checks a spelling; a database that refuses one checks the thing.
 */

import Database from 'better-sqlite3'
import type { Ereignis, EreignisArt } from './ereignisse'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ereignisse (
  lauf_id  TEXT    NOT NULL,
  seq      INTEGER NOT NULL,
  ts       TEXT    NOT NULL,
  art      TEXT    NOT NULL,
  nutzlast TEXT    NOT NULL,
  PRIMARY KEY (lauf_id, seq)
);

CREATE TRIGGER IF NOT EXISTS ereignisse_kein_update BEFORE UPDATE ON ereignisse
BEGIN SELECT RAISE(ABORT, 'Ereignisse sind append-only'); END;

CREATE TRIGGER IF NOT EXISTS ereignisse_kein_delete BEFORE DELETE ON ereignisse
BEGIN SELECT RAISE(ABORT, 'Ereignisse sind append-only'); END;
`

export function oeffneHarnessDb(pfad: string, nativeBinding?: string): Database.Database {
  const db = nativeBinding
    ? new Database(pfad, { nativeBinding })
    : new Database(pfad)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  return db
}

export function anhaengen(
  db: Database.Database,
  laufId: string,
  art: EreignisArt,
  nutzlast: Record<string, unknown>,
): Ereignis {
  const ts = new Date().toISOString()
  const text = JSON.stringify(nutzlast)
  // seq inside the transaction: better-sqlite3 is synchronous and the main process is
  // single-threaded, so nothing can interleave between the read and the write.
  const schreibe = db.transaction((): number => {
    const row = db
      .prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS naechste FROM ereignisse WHERE lauf_id = ?')
      .get(laufId) as { naechste: number }
    db.prepare(
      'INSERT INTO ereignisse (lauf_id, seq, ts, art, nutzlast) VALUES (?, ?, ?, ?, ?)',
    ).run(laufId, row.naechste, ts, art, text)
    return row.naechste
  })
  const seq = schreibe()
  return { laufId, seq, ts, art, nutzlast }
}

export function lesen(db: Database.Database, laufId: string): Ereignis[] {
  const rows = db
    .prepare('SELECT lauf_id, seq, ts, art, nutzlast FROM ereignisse WHERE lauf_id = ? ORDER BY seq')
    .all(laufId) as Array<{ lauf_id: string; seq: number; ts: string; art: string; nutzlast: string }>
  return rows.map(r => ({
    laufId: r.lauf_id,
    seq: r.seq,
    ts: r.ts,
    art: r.art as EreignisArt,
    nutzlast: JSON.parse(r.nutzlast) as Record<string, unknown>,
  }))
}

/** Runs in the order they began. The list is a projection too — there is no run table. */
export function laufIds(db: Database.Database): string[] {
  const rows = db
    .prepare(
      "SELECT lauf_id, MIN(ts) AS beginn FROM ereignisse WHERE art = 'run.started' " +
      'GROUP BY lauf_id ORDER BY beginn, lauf_id',
    )
    .all() as Array<{ lauf_id: string }>
  return rows.map(r => r.lauf_id)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/harness/protokoll.test.ts`
Expected: PASS, 5 Tests

- [ ] **Step 6: Full check and commit**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/harness/ereignisse.ts src/main/harness/protokoll.ts tests/harness/protokoll.test.ts
git commit -m "feat(harness): das append-only Ereignisprotokoll"
```

---

### Task 2: Kanonische Form und Projektion

**Files:**
- Create: `src/main/harness/form.ts`
- Create: `src/main/harness/projektion.ts`
- Test: `tests/harness/projektion.test.ts`

**Interfaces:**
- Consumes: `Ereignis` aus Task 1
- Produces: `type Block` (sechs Varianten), `interface Nachricht { rolle: 'nutzer' | 'modell'; bloecke: Block[] }`, `interface ModelAntwort { bloecke, stopGrund, usage }`, `projiziere(ereignisse: Ereignis[]): Nachricht[]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/harness/projektion.test.ts
import { describe, it, expect } from 'vitest'
import { projiziere } from '../../src/main/harness/projektion'
import type { Ereignis } from '../../src/main/harness/ereignisse'

function ev(seq: number, art: Ereignis['art'], nutzlast: Record<string, unknown>): Ereignis {
  return { laufId: 'l', seq, ts: '2026-08-18T00:00:00.000Z', art, nutzlast }
}

describe('projiziere', () => {
  it('macht aus run.started die erste Nutzernachricht', () => {
    const v = projiziere([ev(1, 'run.started', { auftragstext: 'finde die Warnregeln' })])
    expect(v).toEqual([
      { rolle: 'nutzer', bloecke: [{ art: 'text', text: 'finde die Warnregeln' }] },
    ])
  })

  it('haengt Anhaenge als eigene Bloecke an die erste Nachricht', () => {
    const v = projiziere([ev(1, 'run.started', {
      auftragstext: 'was ist das',
      anhangBloecke: [{ art: 'bild', medientyp: 'image/png', daten: 'AAA' }],
    })])
    expect(v[0].bloecke).toEqual([
      { art: 'text', text: 'was ist das' },
      { art: 'bild', medientyp: 'image/png', daten: 'AAA' },
    ])
  })

  it('macht aus model.answered eine Modellnachricht', () => {
    const v = projiziere([
      ev(1, 'run.started', { auftragstext: 'a' }),
      ev(2, 'model.answered', { bloecke: [{ art: 'text', text: 'b' }] }),
    ])
    expect(v[1]).toEqual({ rolle: 'modell', bloecke: [{ art: 'text', text: 'b' }] })
  })

  it('fasst alle Werkzeugergebnisse eines Zuges zu einer Nutzernachricht zusammen', () => {
    const v = projiziere([
      ev(1, 'run.started', { auftragstext: 'a' }),
      ev(2, 'model.answered', { bloecke: [
        { art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: {} },
        { art: 'werkzeug-aufruf', id: 'c2', name: 'datei_lesen', eingabe: {} },
      ] }),
      ev(3, 'tool.intent', { aufrufId: 'c1', name: 'datei_lesen' }),
      ev(4, 'tool.completed', { aufrufId: 'c1', inhalt: [{ art: 'text', text: 'inhalt-1' }] }),
      ev(5, 'tool.intent', { aufrufId: 'c2', name: 'datei_lesen' }),
      ev(6, 'tool.failed', { aufrufId: 'c2', meldung: 'Pfad ist geschuetzt' }),
    ])
    expect(v[2]).toEqual({
      rolle: 'nutzer',
      bloecke: [
        { art: 'werkzeug-ergebnis', aufrufId: 'c1', inhalt: [{ art: 'text', text: 'inhalt-1' }], fehler: false },
        { art: 'werkzeug-ergebnis', aufrufId: 'c2', inhalt: [{ art: 'text', text: 'Pfad ist geschuetzt' }], fehler: true },
      ],
    })
  })

  it('gibt einem offenen Intent ein Ergebnis mit unbekannter Ausfuehrung', () => {
    const v = projiziere([
      ev(1, 'run.started', { auftragstext: 'a' }),
      ev(2, 'model.answered', { bloecke: [
        { art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: {} },
      ] }),
      ev(3, 'tool.intent', { aufrufId: 'c1', name: 'datei_lesen' }),
    ])
    const block = v[2].bloecke[0]
    expect(block).toMatchObject({ art: 'werkzeug-ergebnis', aufrufId: 'c1', fehler: true })
    expect(JSON.stringify(block)).toContain('Ausfuehrung unbekannt')
  })

  it('haengt ein nachgeladenes Schema an den Verlauf, nie an den Praefix', () => {
    const v = projiziere([
      ev(1, 'run.started', { auftragstext: 'a' }),
      ev(2, 'tool.schema_loaded', { name: 'datei_lesen', schema: { typ: 'objekt' } }),
    ])
    expect(v[1].rolle).toBe('nutzer')
    expect(JSON.stringify(v[1].bloecke)).toContain('datei_lesen')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness/projektion.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/main/harness/projektion"`

- [ ] **Step 3: Write `form.ts`**

```ts
/**
 * form — the canonical message form. Everything the harness translates passes through here.
 *
 * Six block types from day one. What is not retrofittable is the *union*, not the individual
 * case: if it is designed text-only, every codec, every event and every log line assumes text
 * later, and multimodality becomes a rebuild rather than an addition (M8 section 3.3).
 *
 * The shape follows Anthropic's because it maps losslessly onto OpenAI and Gemini; the
 * reverse direction loses information.
 */

export type Block =
  | { art: 'text';              text: string }
  | { art: 'denken';            text: string; signatur?: string }
  | { art: 'bild';              medientyp: string; daten: string }
  | { art: 'dokument';          medientyp: string; name: string; daten: string }
  | { art: 'werkzeug-aufruf';   id: string; name: string; eingabe: Record<string, unknown> }
  | { art: 'werkzeug-ergebnis'; aufrufId: string; inhalt: Block[]; fehler: boolean }

export interface Nachricht {
  rolle: 'nutzer' | 'modell'
  bloecke: Block[]
}

/** Normalised across providers, with the provider's own word kept beside it. */
export interface ModelAntwort {
  bloecke: Block[]
  stopGrund: { normalisiert: 'ende' | 'laenge' | 'werkzeug' | 'anderes'; roh: string }
  usage: { eingabeToken: number; ausgabeToken: number; roh: unknown }
}

export function nurText(bloecke: Block[]): string {
  return bloecke.filter(b => b.art === 'text').map(b => (b as { text: string }).text).join('\n')
}

export function werkzeugAufrufe(bloecke: Block[]): Array<Extract<Block, { art: 'werkzeug-aufruf' }>> {
  return bloecke.filter(b => b.art === 'werkzeug-aufruf') as Array<Extract<Block, { art: 'werkzeug-aufruf' }>>
}
```

- [ ] **Step 4: Write `projektion.ts`**

```ts
/**
 * projektion — the message history, derived from the event log and held nowhere else.
 *
 * The loop keeps no history in memory. Before every turn it projects. That makes "turn 1" and
 * "turn 14 after a restart" the same code path — and resumption, which hangs on a hard process
 * death and is therefore badly testable, has by then run a thousand times in normal operation.
 */

import type { Ereignis } from './ereignisse'
import type { Block, Nachricht } from './form'

const UNBEKANNT =
  'Ausfuehrung unbekannt, Zustand pruefen. Der Aufruf wurde begonnen, sein Ergebnis nicht ' +
  'geschrieben. Stelle den Zustand fest, bevor du weitermachst.'

export function projiziere(ereignisse: Ereignis[]): Nachricht[] {
  const verlauf: Nachricht[] = []
  let offeneIntents: string[] = []
  let ergebnisse: Block[] = []

  const ergebnisseAbschliessen = (): void => {
    // An intent without a result means a hard death between effect and write. The call is not
    // repeated — M8 section 3.4. Repeating it would be harmless for today's reading tools and
    // wrong for the first writing one, and nobody would go looking for the exception then.
    for (const aufrufId of offeneIntents) {
      ergebnisse.push({ art: 'werkzeug-ergebnis', aufrufId, inhalt: [{ art: 'text', text: UNBEKANNT }], fehler: true })
    }
    offeneIntents = []
    if (ergebnisse.length > 0) {
      verlauf.push({ rolle: 'nutzer', bloecke: ergebnisse })
      ergebnisse = []
    }
  }

  for (const e of ereignisse) {
    switch (e.art) {
      case 'run.started': {
        const bloecke: Block[] = [{ art: 'text', text: String(e.nutzlast.auftragstext ?? '') }]
        const anhaenge = (e.nutzlast.anhangBloecke as Block[] | undefined) ?? []
        verlauf.push({ rolle: 'nutzer', bloecke: [...bloecke, ...anhaenge] })
        break
      }
      case 'model.answered': {
        ergebnisseAbschliessen()
        verlauf.push({ rolle: 'modell', bloecke: (e.nutzlast.bloecke as Block[]) ?? [] })
        break
      }
      case 'tool.intent':
        offeneIntents.push(String(e.nutzlast.aufrufId))
        break
      case 'tool.completed': {
        const id = String(e.nutzlast.aufrufId)
        offeneIntents = offeneIntents.filter(x => x !== id)
        ergebnisse.push({
          art: 'werkzeug-ergebnis', aufrufId: id,
          inhalt: (e.nutzlast.inhalt as Block[]) ?? [], fehler: false,
        })
        break
      }
      case 'tool.failed': {
        const id = String(e.nutzlast.aufrufId)
        offeneIntents = offeneIntents.filter(x => x !== id)
        ergebnisse.push({
          art: 'werkzeug-ergebnis', aufrufId: id,
          inhalt: [{ art: 'text', text: String(e.nutzlast.meldung ?? '') }], fehler: true,
        })
        break
      }
      case 'tool.schema_loaded': {
        ergebnisseAbschliessen()
        // Appended to the history, never written into the stable prefix — otherwise every
        // deferred load would invalidate the cache the mechanism exists to protect.
        verlauf.push({
          rolle: 'nutzer',
          bloecke: [{ art: 'text', text:
            `Schema fuer ${String(e.nutzlast.name)}:\n${JSON.stringify(e.nutzlast.schema, null, 2)}` }],
        })
        break
      }
      default:
        break
    }
  }

  ergebnisseAbschliessen()
  return verlauf
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/harness/projektion.test.ts`
Expected: PASS, 6 Tests

- [ ] **Step 6: Full check and commit**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/harness/form.ts src/main/harness/projektion.ts tests/harness/projektion.test.ts
git commit -m "feat(harness): kanonische Form und der Verlauf als Projektion"
```

---

### Task 3: Codec-Interface und der OpenAI-Chat-Codec

**Files:**
- Create: `src/main/harness/codec.ts`
- Create: `src/main/harness/codec-openai-chat.ts`
- Test: `tests/harness/codec-openai-chat.test.ts`

**Interfaces:**
- Consumes: `Block`, `Nachricht`, `ModelAntwort` aus Task 2; `Faehigkeiten` aus `src/main/model/entry.ts`
- Produces: `interface WerkzeugStummel { name: string; beschreibung: string }`, `interface Codec { name; toWire(nachrichten, werkzeuge, f): unknown; fromWire(antwort: unknown): ModelAntwort }`, `codecFuer(name): Codec`, `class CodecKannNicht extends Error`

- [ ] **Step 1: Write the failing test**

```ts
// tests/harness/codec-openai-chat.test.ts
import { describe, it, expect } from 'vitest'
import { openAiChatCodec } from '../../src/main/harness/codec-openai-chat'
import { CodecKannNicht } from '../../src/main/harness/codec'
import type { Faehigkeiten } from '../../src/main/model/entry'

const KANN: Faehigkeiten = {
  codec: 'openai-chat', werkzeugmodus: 'nativ', paralleleAufrufe: true, denkbloecke: false,
  bilder: true, dokumente: true, aufgeschobenesLaden: true, werkzeugObergrenze: 20,
  nutzbaresKontextfenster: 128000, vertragsStrenge: { schemaTiefe: 2, reparaturversuche: 1 },
  rundenbudget: 12, gemessenAm: null, gemessenMit: null, quelle: 'vermutet',
}
const KANN_KEINE_BILDER: Faehigkeiten = { ...KANN, bilder: false }
const OHNE_PARALLEL: Faehigkeiten = { ...KANN, paralleleAufrufe: false }

const STUMMEL = [{ name: 'datei_lesen', beschreibung: 'Liest eine Datei.' }]

describe('openAiChatCodec.toWire', () => {
  it('setzt parallel_tool_calls nur, wenn die Faehigkeitszeile es hergibt', () => {
    const mit = openAiChatCodec.toWire([{ rolle: 'nutzer', bloecke: [{ art: 'text', text: 'a' }] }], STUMMEL, KANN) as Record<string, unknown>
    const ohne = openAiChatCodec.toWire([{ rolle: 'nutzer', bloecke: [{ art: 'text', text: 'a' }] }], STUMMEL, OHNE_PARALLEL) as Record<string, unknown>
    expect(mit.parallel_tool_calls).toBe(true)
    expect('parallel_tool_calls' in ohne).toBe(false)
  })

  it('uebersetzt ein Bild in eine data-URL', () => {
    const w = openAiChatCodec.toWire(
      [{ rolle: 'nutzer', bloecke: [{ art: 'bild', medientyp: 'image/png', daten: 'AAA' }] }],
      STUMMEL, KANN,
    ) as { messages: Array<{ content: Array<Record<string, unknown>> }> }
    expect(w.messages[0].content[0]).toEqual({
      type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' },
    })
  })

  it('meldet Unvermoegen ausdruecklich, statt den Block wegzulassen', () => {
    expect(() => openAiChatCodec.toWire(
      [{ rolle: 'nutzer', bloecke: [{ art: 'bild', medientyp: 'image/png', daten: 'AAA' }] }],
      STUMMEL, KANN_KEINE_BILDER,
    )).toThrow(CodecKannNicht)
  })

  it('nennt in der Meldung den Blocktyp und die Quelle der Faehigkeitszeile', () => {
    expect(() => openAiChatCodec.toWire(
      [{ rolle: 'nutzer', bloecke: [{ art: 'bild', medientyp: 'image/png', daten: 'AAA' }] }],
      STUMMEL, KANN_KEINE_BILDER,
    )).toThrow(/bilder: false.*vermutet/s)
  })

  it('schreibt die Stummelliste als Werkzeuge in die Drahtform', () => {
    const w = openAiChatCodec.toWire([{ rolle: 'nutzer', bloecke: [{ art: 'text', text: 'a' }] }], STUMMEL, KANN) as {
      tools: Array<{ function: { name: string; description: string } }>
    }
    expect(w.tools[0].function).toMatchObject({ name: 'datei_lesen', description: 'Liest eine Datei.' })
  })
})

describe('openAiChatCodec.fromWire', () => {
  it('normalisiert finish_reason length als laenge und behaelt das Rohe', () => {
    const a = openAiChatCodec.fromWire({
      choices: [{ message: { content: 'abc' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 10, completion_tokens: 3 },
    })
    expect(a.stopGrund).toEqual({ normalisiert: 'laenge', roh: 'length' })
    expect(a.usage.eingabeToken).toBe(10)
    expect(a.usage.roh).toEqual({ prompt_tokens: 10, completion_tokens: 3 })
  })

  it('macht aus tool_calls Werkzeug-Aufrufbloecke', () => {
    const a = openAiChatCodec.fromWire({
      choices: [{ message: { content: null, tool_calls: [
        { id: 'c1', function: { name: 'datei_lesen', arguments: '{"pfad":"a.ts"}' } },
      ] }, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })
    expect(a.bloecke).toEqual([
      { art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: { pfad: 'a.ts' } },
    ])
    expect(a.stopGrund.normalisiert).toBe('werkzeug')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness/codec-openai-chat.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/main/harness/codec-openai-chat"`

- [ ] **Step 3: Write `codec.ts`**

```ts
/**
 * codec — two functions and no state.
 *
 * A codec never sees loop state, budgets or tool *execution*; the type signature makes it
 * impossible. It receives the tool list only in order to write it into the wire form. That is
 * why the text mode will later be another codec rather than a second path: there is no path,
 * there is a translation (M8 section 3.3).
 */

import type { Faehigkeiten } from '../model/entry'
import type { ModelAntwort, Nachricht } from './form'

export interface WerkzeugStummel {
  name: string
  /** One line. Stands in the stable prefix. German — the model reads it. */
  beschreibung: string
  /** Only sent when deferred loading is off; otherwise fetched via werkzeug_schema. */
  schema?: Record<string, unknown>
}

export interface Codec {
  name: 'anthropic' | 'openai-chat'
  toWire(nachrichten: Nachricht[], werkzeuge: WerkzeugStummel[], f: Faehigkeiten): unknown
  fromWire(antwort: unknown): ModelAntwort
}

/**
 * Raised when a capability row says the model cannot carry a block type that the order does
 * carry. Never silently dropped: a missing image changes the answer without saying so.
 */
export class CodecKannNicht extends Error {
  constructor(blockArt: string, feld: string, f: Faehigkeiten) {
    super(
      `Das Modell nimmt keine Bloecke der Art '${blockArt}' — die Faehigkeitszeile sagt ` +
      `${feld}: false (Quelle: ${f.quelle}). Der Auftrag traegt einen solchen Block.`,
    )
    this.name = 'CodecKannNicht'
  }
}
```

- [ ] **Step 4: Write `codec-openai-chat.ts`**

```ts
/**
 * codec-openai-chat — the dialect that reaches most of the field.
 *
 * OpenAI, DeepSeek, OpenRouter, Together, Fireworks, Groq, Mistral, vLLM — and Ollama's own
 * /v1 surface, which is how a local model is reachable in this stretch without the
 * ollama-native codec existing yet.
 *
 * `parallel_tool_calls` is written only when the capability row allows it: sent to a model
 * without support it answers HTTP 400 and takes the whole tool subsystem down (M8 section 5).
 */

import type { Faehigkeiten } from '../model/entry'
import type { Block, ModelAntwort, Nachricht } from './form'
import { CodecKannNicht, type Codec, type WerkzeugStummel } from './codec'

function inhaltsteil(b: Block, f: Faehigkeiten): Record<string, unknown> {
  switch (b.art) {
    case 'text':
    case 'denken':
      return { type: 'text', text: b.text }
    case 'bild':
      if (!f.bilder) throw new CodecKannNicht('bild', 'bilder', f)
      return { type: 'image_url', image_url: { url: `data:${b.medientyp};base64,${b.daten}` } }
    case 'dokument':
      if (!f.dokumente) throw new CodecKannNicht('dokument', 'dokumente', f)
      return { type: 'file', file: { filename: b.name, file_data: `data:${b.medientyp};base64,${b.daten}` } }
    default:
      return { type: 'text', text: '' }
  }
}

function stopGrund(roh: string): ModelAntwort['stopGrund'] {
  const normalisiert =
    roh === 'stop' ? 'ende' :
    roh === 'length' ? 'laenge' :
    roh === 'tool_calls' ? 'werkzeug' : 'anderes'
  return { normalisiert, roh }
}

export const openAiChatCodec: Codec = {
  name: 'openai-chat',

  toWire(nachrichten: Nachricht[], werkzeuge: WerkzeugStummel[], f: Faehigkeiten): unknown {
    const messages: Array<Record<string, unknown>> = []
    for (const n of nachrichten) {
      const werkzeugErgebnisse = n.bloecke.filter(b => b.art === 'werkzeug-ergebnis')
      for (const w of werkzeugErgebnisse) {
        const e = w as Extract<Block, { art: 'werkzeug-ergebnis' }>
        messages.push({
          role: 'tool', tool_call_id: e.aufrufId,
          content: e.inhalt.map(b => inhaltsteil(b, f)),
        })
      }
      const aufrufe = n.bloecke.filter(b => b.art === 'werkzeug-aufruf')
      const rest = n.bloecke.filter(b => b.art !== 'werkzeug-ergebnis' && b.art !== 'werkzeug-aufruf')
      if (rest.length > 0 || aufrufe.length > 0) {
        const m: Record<string, unknown> = {
          role: n.rolle === 'nutzer' ? 'user' : 'assistant',
          content: rest.map(b => inhaltsteil(b, f)),
        }
        if (aufrufe.length > 0) {
          m.tool_calls = aufrufe.map(b => {
            const a = b as Extract<Block, { art: 'werkzeug-aufruf' }>
            return { id: a.id, type: 'function', function: { name: a.name, arguments: JSON.stringify(a.eingabe) } }
          })
        }
        messages.push(m)
      }
    }

    const körper: Record<string, unknown> = { messages, stream: false }
    if (werkzeuge.length > 0) {
      körper.tools = werkzeuge.map(w => ({
        type: 'function',
        function: {
          name: w.name,
          description: w.beschreibung,
          ...(w.schema ? { parameters: w.schema } : {}),
        },
      }))
      if (f.paralleleAufrufe) körper.parallel_tool_calls = true
    }
    return körper
  },

  fromWire(antwort: unknown): ModelAntwort {
    const a = antwort as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{
        id: string; function: { name: string; arguments: string }
      }> }; finish_reason?: string }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const wahl = a.choices?.[0]
    const bloecke: Block[] = []
    const text = wahl?.message?.content
    if (text) bloecke.push({ art: 'text', text })
    for (const t of wahl?.message?.tool_calls ?? []) {
      let eingabe: Record<string, unknown> = {}
      try {
        eingabe = JSON.parse(t.function.arguments) as Record<string, unknown>
      } catch {
        // Kept as a named failure rather than guessed: a wrong argument object would be run.
        eingabe = { __unlesbar: t.function.arguments }
      }
      bloecke.push({ art: 'werkzeug-aufruf', id: t.id, name: t.function.name, eingabe })
    }
    return {
      bloecke,
      stopGrund: stopGrund(wahl?.finish_reason ?? ''),
      usage: {
        eingabeToken: a.usage?.prompt_tokens ?? 0,
        ausgabeToken: a.usage?.completion_tokens ?? 0,
        roh: a.usage ?? null,
      },
    }
  },
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/harness/codec-openai-chat.test.ts`
Expected: PASS, 7 Tests

- [ ] **Step 6: Full check and commit**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/harness/codec.ts src/main/harness/codec-openai-chat.ts tests/harness/codec-openai-chat.test.ts
git commit -m "feat(harness): Codec-Interface und der OpenAI-Chat-Codec"
```

---

### Task 4: Der Anthropic-Codec

**Files:**
- Create: `src/main/harness/codec-anthropic.ts`
- Modify: `src/main/harness/codec.ts` (Ergänzung: `codecFuer`)
- Test: `tests/harness/codec-anthropic.test.ts`
- Test: `tests/harness/codec-gleichlauf.test.ts` (Wächtertest)

**Interfaces:**
- Consumes: `Codec`, `WerkzeugStummel`, `CodecKannNicht` aus Task 3
- Produces: `anthropicCodec: Codec`, `codecFuer(name: 'anthropic' | 'openai-chat'): Codec`

- [ ] **Step 1: Write the failing test**

```ts
// tests/harness/codec-anthropic.test.ts
import { describe, it, expect } from 'vitest'
import { anthropicCodec } from '../../src/main/harness/codec-anthropic'
import type { Faehigkeiten } from '../../src/main/model/entry'

const KANN: Faehigkeiten = {
  codec: 'anthropic', werkzeugmodus: 'nativ', paralleleAufrufe: true, denkbloecke: true,
  bilder: true, dokumente: true, aufgeschobenesLaden: true, werkzeugObergrenze: 20,
  nutzbaresKontextfenster: 200000, vertragsStrenge: { schemaTiefe: 2, reparaturversuche: 1 },
  rundenbudget: 12, gemessenAm: null, gemessenMit: null, quelle: 'vermutet',
}
const STUMMEL = [{ name: 'datei_lesen', beschreibung: 'Liest eine Datei.' }]

describe('anthropicCodec.toWire', () => {
  it('uebersetzt ein Bild in eine base64-Quelle', () => {
    const w = anthropicCodec.toWire(
      [{ rolle: 'nutzer', bloecke: [{ art: 'bild', medientyp: 'image/png', daten: 'AAA' }] }],
      STUMMEL, KANN,
    ) as { messages: Array<{ content: Array<Record<string, unknown>> }> }
    expect(w.messages[0].content[0]).toEqual({
      type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' },
    })
  })

  it('gibt einen Denkblock samt Signatur woertlich zurueck', () => {
    const w = anthropicCodec.toWire(
      [{ rolle: 'modell', bloecke: [{ art: 'denken', text: 'ueberlegung', signatur: 'sig-1' }] }],
      STUMMEL, KANN,
    ) as { messages: Array<{ content: Array<Record<string, unknown>> }> }
    expect(w.messages[0].content[0]).toEqual({
      type: 'thinking', thinking: 'ueberlegung', signature: 'sig-1',
    })
  })
})

describe('anthropicCodec.fromWire', () => {
  it('normalisiert max_tokens als laenge', () => {
    const a = anthropicCodec.fromWire({
      content: [{ type: 'text', text: 'abc' }], stop_reason: 'max_tokens',
      usage: { input_tokens: 10, output_tokens: 3 },
    })
    expect(a.stopGrund).toEqual({ normalisiert: 'laenge', roh: 'max_tokens' })
  })

  it('haelt die Signatur eines Denkblocks fest', () => {
    const a = anthropicCodec.fromWire({
      content: [{ type: 'thinking', thinking: 'x', signature: 'sig-9' }],
      stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
    })
    expect(a.bloecke[0]).toEqual({ art: 'denken', text: 'x', signatur: 'sig-9' })
  })

  it('macht aus tool_use einen Werkzeug-Aufrufblock', () => {
    const a = anthropicCodec.fromWire({
      content: [{ type: 'tool_use', id: 'c1', name: 'datei_lesen', input: { pfad: 'a.ts' } }],
      stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 },
    })
    expect(a.bloecke[0]).toEqual({ art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: { pfad: 'a.ts' } })
    expect(a.stopGrund.normalisiert).toBe('werkzeug')
  })
})
```

- [ ] **Step 2: Write the guard test — same run through both codecs**

```ts
// tests/harness/codec-gleichlauf.test.ts
import { describe, it, expect } from 'vitest'
import { codecFuer } from '../../src/main/harness/codec'
import { projiziere } from '../../src/main/harness/projektion'
import type { Ereignis } from '../../src/main/harness/ereignisse'
import type { Faehigkeiten } from '../../src/main/model/entry'

/**
 * M8 section 8, first row: the same recorded run through *all* codecs, and what is compared is
 * the *event sequence*, not the wire form. Two providers, the same events — that is the
 * checkable version of "one code path, no regime".
 */
const ABLAUF: Ereignis[] = [
  { laufId: 'l', seq: 1, ts: 't', art: 'run.started', nutzlast: { auftragstext: 'a' } },
  { laufId: 'l', seq: 2, ts: 't', art: 'model.answered', nutzlast: { bloecke: [
    { art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: { pfad: 'a.ts' } },
  ] } },
  { laufId: 'l', seq: 3, ts: 't', art: 'tool.intent', nutzlast: { aufrufId: 'c1', name: 'datei_lesen' } },
  { laufId: 'l', seq: 4, ts: 't', art: 'tool.completed', nutzlast: { aufrufId: 'c1', inhalt: [{ art: 'text', text: 'inhalt' }] } },
  { laufId: 'l', seq: 5, ts: 't', art: 'model.answered', nutzlast: { bloecke: [{ art: 'text', text: 'fertig' }] } },
]

const BASIS: Faehigkeiten = {
  codec: 'anthropic', werkzeugmodus: 'nativ', paralleleAufrufe: true, denkbloecke: true,
  bilder: true, dokumente: true, aufgeschobenesLaden: true, werkzeugObergrenze: 20,
  nutzbaresKontextfenster: 100000, vertragsStrenge: { schemaTiefe: 2, reparaturversuche: 1 },
  rundenbudget: 12, gemessenAm: null, gemessenMit: null, quelle: 'vermutet',
}

describe('Waechter: ein Codepfad, kein Regime', () => {
  it('beide Codecs uebersetzen denselben Ablauf ohne zu werfen', () => {
    const verlauf = projiziere(ABLAUF)
    const stummel = [{ name: 'datei_lesen', beschreibung: 'Liest eine Datei.' }]
    for (const name of ['anthropic', 'openai-chat'] as const) {
      expect(() => codecFuer(name).toWire(verlauf, stummel, { ...BASIS, codec: name })).not.toThrow()
    }
  })

  it('die Ereignisfolge ist von der Drahtform unabhaengig', () => {
    // The projection sees only the canonical form; nothing codec-specific may leak into it.
    const verlauf = projiziere(ABLAUF)
    expect(verlauf.map(n => n.rolle)).toEqual(['nutzer', 'modell', 'nutzer', 'modell'])
    expect(JSON.stringify(verlauf)).not.toContain('tool_use')
    expect(JSON.stringify(verlauf)).not.toContain('tool_calls')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/harness/codec-anthropic.test.ts tests/harness/codec-gleichlauf.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/main/harness/codec-anthropic"` und `codecFuer is not exported`

- [ ] **Step 4: Write `codec-anthropic.ts`**

```ts
/**
 * codec-anthropic — the vendor with its own shape, and the reference for the canonical form.
 *
 * Thinking blocks go back verbatim including their signature. A form without that field loses
 * continuation exactly where thinking was expensive — and with tools, continuing after a
 * thinking block is the normal case, not the exception.
 */

import type { Faehigkeiten } from '../model/entry'
import type { Block, ModelAntwort, Nachricht } from './form'
import { CodecKannNicht, type Codec, type WerkzeugStummel } from './codec'

function teil(b: Block, f: Faehigkeiten): Record<string, unknown> {
  switch (b.art) {
    case 'text':
      return { type: 'text', text: b.text }
    case 'denken':
      return { type: 'thinking', thinking: b.text, ...(b.signatur ? { signature: b.signatur } : {}) }
    case 'bild':
      if (!f.bilder) throw new CodecKannNicht('bild', 'bilder', f)
      return { type: 'image', source: { type: 'base64', media_type: b.medientyp, data: b.daten } }
    case 'dokument':
      if (!f.dokumente) throw new CodecKannNicht('dokument', 'dokumente', f)
      return { type: 'document', source: { type: 'base64', media_type: b.medientyp, data: b.daten }, title: b.name }
    case 'werkzeug-aufruf':
      return { type: 'tool_use', id: b.id, name: b.name, input: b.eingabe }
    case 'werkzeug-ergebnis':
      return {
        type: 'tool_result', tool_use_id: b.aufrufId, is_error: b.fehler,
        content: b.inhalt.map(x => teil(x, f)),
      }
  }
}

function stopGrund(roh: string): ModelAntwort['stopGrund'] {
  const normalisiert =
    roh === 'end_turn' || roh === 'stop_sequence' ? 'ende' :
    roh === 'max_tokens' ? 'laenge' :
    roh === 'tool_use' ? 'werkzeug' : 'anderes'
  return { normalisiert, roh }
}

export const anthropicCodec: Codec = {
  name: 'anthropic',

  toWire(nachrichten: Nachricht[], werkzeuge: WerkzeugStummel[], f: Faehigkeiten): unknown {
    const körper: Record<string, unknown> = {
      messages: nachrichten.map(n => ({
        role: n.rolle === 'nutzer' ? 'user' : 'assistant',
        content: n.bloecke.map(b => teil(b, f)),
      })),
    }
    if (werkzeuge.length > 0) {
      körper.tools = werkzeuge.map(w => ({
        name: w.name,
        description: w.beschreibung,
        input_schema: w.schema ?? { type: 'object', properties: {} },
      }))
      // Anthropic disables parallel calls via a flag rather than enabling them; only touched
      // when the capability row says the model cannot do them.
      if (!f.paralleleAufrufe) körper.tool_choice = { type: 'auto', disable_parallel_tool_use: true }
    }
    return körper
  },

  fromWire(antwort: unknown): ModelAntwort {
    const a = antwort as {
      content?: Array<Record<string, unknown>>
      stop_reason?: string
      usage?: { input_tokens?: number; output_tokens?: number }
    }
    const bloecke: Block[] = []
    for (const c of a.content ?? []) {
      if (c.type === 'text') bloecke.push({ art: 'text', text: String(c.text ?? '') })
      else if (c.type === 'thinking') bloecke.push({
        art: 'denken', text: String(c.thinking ?? ''),
        ...(c.signature ? { signatur: String(c.signature) } : {}),
      })
      else if (c.type === 'tool_use') bloecke.push({
        art: 'werkzeug-aufruf', id: String(c.id), name: String(c.name),
        eingabe: (c.input as Record<string, unknown>) ?? {},
      })
    }
    return {
      bloecke,
      stopGrund: stopGrund(a.stop_reason ?? ''),
      usage: {
        eingabeToken: a.usage?.input_tokens ?? 0,
        ausgabeToken: a.usage?.output_tokens ?? 0,
        roh: a.usage ?? null,
      },
    }
  },
}
```

- [ ] **Step 5: Add `codecFuer` to `codec.ts`**

Append to `src/main/harness/codec.ts`:

```ts
import { anthropicCodec } from './codec-anthropic'
import { openAiChatCodec } from './codec-openai-chat'

/**
 * The two codecs this stretch builds. `ollama-native` and `text` are M8 section 7 row 14 and
 * are refused by name rather than silently falling back to a different one.
 */
export function codecFuer(name: Faehigkeiten['codec']): Codec {
  switch (name) {
    case 'anthropic': return anthropicCodec
    case 'openai-chat': return openAiChatCodec
    default:
      throw new Error(
        `Der Codec '${name}' ist in dieser Ausbaustufe nicht gebaut — verfuegbar sind ` +
        `anthropic und openai-chat.`,
      )
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/harness/`
Expected: PASS — alle Dateien grün

- [ ] **Step 7: Full check and commit**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/harness/codec-anthropic.ts src/main/harness/codec.ts tests/harness/codec-anthropic.test.ts tests/harness/codec-gleichlauf.test.ts
git commit -m "feat(harness): der Anthropic-Codec und der Gleichlauf-Waechter"
```

---

### Task 5: Der Transport — `chat()` und der dritte Anbieter

**Files:**
- Modify: `src/main/worker/model-client.ts` (Union, `ChatRequest`, `ModelClient.chat`, `clientForEndpoint`, `normaliseEndpoint`)
- Modify: `src/main/worker/api-client.ts` (`chat()`, Authorization nur mit Schluessel)
- Modify: `src/main/worker/ollama-client.ts` (`chat()` wirft benannt)
- Create: `src/main/worker/anthropic-client.ts`
- Modify: `src/main/model/entry.ts` (`toModelEndpoint` mit Codec-Parameter)
- Modify: `src/main/model/rollen.ts:20` (Codec durchreichen)
- Test: `tests/worker/anthropic-client.test.ts`
- Test: `tests/worker/model-client.test.ts` (ergaenzen)
- Test: `tests/model/entry.test.ts` (ergaenzen)

**Interfaces:**
- Consumes: `ModelAntwort`, `Nachricht` aus Task 2; `Codec` aus Task 3
- Produces: `interface AnthropicEndpointSpec { kind: 'anthropic'; baseUrl; model; keyRef }`,
  `interface ChatRequest { koerper: unknown; endpoint: ModelEndpoint; timeoutMs?: number }`,
  `ModelClient.chat(req: ChatRequest): Promise<unknown>` — liefert die **rohe** Antwort, die der
  Codec uebersetzt. Der Transport kennt die kanonische Form nicht.

> **Entscheidung, die diese Aufgabe traegt:** `keyRef: ''` heisst *dieser Endpunkt braucht keinen
> Schluessel*, `keyRef: undefined` heisst weiterhin *vergessen* und wirft. Das ist die
> `??`-Falle aus dem Handover, hier bewusst als Unterscheidung benutzt. Damit bleibt der
> Bestandstest „refuses an OpenAI-compatible endpoint without a key reference" unveraendert
> gruen, und ein Ollama-Endpunkt ueber `/v1` braucht keine Sonderbehandlung.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/worker/anthropic-client.test.ts
import { describe, it, expect } from 'vitest'
import { messagesUrl, describeAnthropicFailure } from '../../src/main/worker/anthropic-client'

const EP = {
  kind: 'anthropic' as const, baseUrl: 'https://api.anthropic.com/v1',
  model: 'claude-opus-5', keyRef: 'anthropic',
}

describe('anthropic-client', () => {
  it('haengt /messages an die Basis-URL', () => {
    expect(messagesUrl(EP)).toBe('https://api.anthropic.com/v1/messages')
  })

  it('nennt bei 401 die Schluesselursache, ohne den Schluesselnamen zu verraten', () => {
    const t = describeAnthropicFailure(401, '', EP)
    expect(t).toContain('api.anthropic.com')
    expect(t).not.toContain('anthropic-secret')
    expect(t).toMatch(/Schluessel|Schlüssel/)
  })

  it('nennt bei 404 das Modell', () => {
    expect(describeAnthropicFailure(404, '', EP)).toContain('claude-opus-5')
  })
})
```

```ts
// an tests/worker/model-client.test.ts anhaengen
import { clientForEndpoint } from '../../src/main/worker/model-client'

describe('keyRef als Aussage gegen keyRef als Versaeumnis', () => {
  it('nimmt einen leeren keyRef als "braucht keinen Schluessel" hin', () => {
    const ep = normaliseEndpoint({
      kind: 'openai-compatible', baseUrl: 'http://100.78.7.108:11434/v1', model: 'gemma4:26b', keyRef: '',
    })
    if (ep.kind === 'openai-compatible') expect(ep.keyRef).toBe('')
  })

  it('kennt den Anthropic-Endpunkt als dritte Art', () => {
    const ep = normaliseEndpoint({
      kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-opus-5', keyRef: 'anthropic',
    })
    expect(ep.kind).toBe('anthropic')
  })

  it('gibt fuer den Anthropic-Endpunkt einen eigenen Transport', () => {
    const ep = normaliseEndpoint({
      kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'm', keyRef: 'a',
    })
    expect(clientForEndpoint(ep).constructor.name).toBe('AnthropicClient')
  })
})
```

```ts
// an tests/model/entry.test.ts anhaengen
describe('toModelEndpoint mit Codec', () => {
  it('macht aus local-http plus openai-chat einen /v1-Endpunkt ohne Schluessel', () => {
    const ep = toModelEndpoint(
      { art: 'local-http', host: '100.78.7.108', port: 11434, model: 'gemma4:26b' },
      'openai-chat',
    )
    expect(ep).toEqual({
      kind: 'openai-compatible', baseUrl: 'http://100.78.7.108:11434/v1',
      model: 'gemma4:26b', keyRef: '',
    })
  })

  it('macht aus api plus anthropic einen Anthropic-Endpunkt', () => {
    const ep = toModelEndpoint(
      { art: 'api', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-opus-5', keyRef: 'anthropic' },
      'anthropic',
    )
    expect(ep.kind).toBe('anthropic')
  })

  it('bleibt ohne Codec beim bisherigen Verhalten', () => {
    const ep = toModelEndpoint({ art: 'local-http', host: 'h', port: 1, model: 'm' })
    expect(ep.kind).toBe('ollama')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/worker/ tests/model/entry.test.ts`
Expected: FAIL — `Failed to resolve import ".../anthropic-client"`, `Unbekannte Endpunkt-Art 'anthropic'`

- [ ] **Step 3: Extend `model-client.ts`**

Vier Aenderungen. Erstens die Union und `ChatRequest`:

```ts
export interface AnthropicEndpointSpec {
  kind: 'anthropic'
  baseUrl: string
  model: string
  keyRef: string
}

export type ModelEndpoint = OllamaEndpointSpec | OpenAiCompatibleEndpointSpec | AnthropicEndpointSpec

/**
 * A chat call. `koerper` is already in the provider's wire form — the codec built it, and the
 * transport neither knows nor needs the canonical form. What comes back is the raw parsed
 * response, which the codec turns back into blocks.
 */
export interface ChatRequest {
  koerper: unknown
  endpoint: ModelEndpoint
  timeoutMs?: number
}

export interface ModelClient {
  generate(req: GenerateRequest): Promise<string>
  chat(req: ChatRequest): Promise<unknown>
}
```

Zweitens `normaliseEndpoint`: die `keyRef`-Pruefung wird auf `undefined` verengt, und der dritte
Zweig kommt dazu.

```ts
  if (kind === 'openai-compatible' || kind === 'anthropic') {
    if (!raw.baseUrl) {
      throw new Error(
        `Endpunkt '${raw.model}' ist als ${kind} deklariert, nennt aber keine baseUrl`
      )
    }
    // An empty keyRef is a statement — "this endpoint needs no key", which is true for Ollama's
    // /v1 surface and for vLLM. An absent one is an omission and stays an error. This is the
    // difference `??` does not make, used deliberately.
    if (raw.keyRef === undefined) {
      throw new Error(
        `Endpunkt '${raw.model}' ist als ${kind} deklariert, nennt aber keinen keyRef`
      )
    }
    const gemeinsam = { baseUrl: raw.baseUrl.replace(/\/+$/, ''), model: raw.model, keyRef: raw.keyRef }
    return kind === 'anthropic' ? { kind: 'anthropic', ...gemeinsam } : { kind: 'openai-compatible', ...gemeinsam }
  }

  throw new Error(
    `Unbekannte Endpunkt-Art '${kind}' — bekannt sind ollama, openai-compatible, anthropic`
  )
```

Drittens `RawEndpoint.kind` erweitern: `kind?: 'ollama' | 'openai-compatible' | 'anthropic'`.

Viertens `describeEndpoint` und `clientForEndpoint`:

```ts
export function describeEndpoint(endpoint: ModelEndpoint): string {
  return endpoint.kind === 'ollama' ? `${endpoint.host}:${endpoint.port}` : endpoint.baseUrl
}

export function clientForEndpoint(endpoint: ModelEndpoint): ModelClient {
  switch (endpoint.kind) {
    case 'ollama': return new HttpOllamaClient()
    case 'openai-compatible': return new OpenAiCompatibleClient()
    case 'anthropic': return new AnthropicClient()
  }
}
```

Dazu oben `import { AnthropicClient } from './anthropic-client'`.

- [ ] **Step 4: Write `anthropic-client.ts`**

```ts
/**
 * anthropic-client — the Messages API, as the sibling module api-client.ts predicted.
 *
 * Different path, different auth header, different version header — but the same ModelClient.
 * Nothing else in the worker changes for it, which is the point of the interface.
 *
 * `generate` exists because the interface requires it and is deliberately not built: the
 * one-shot worker path has no reason to reach this provider, and a half-working second path
 * would be worse than a named refusal.
 */

import * as https from 'node:https'
import type { ChatRequest, GenerateRequest, ModelClient, AnthropicEndpointSpec } from './model-client'
import { resolveApiKey } from './api-keys'

export const ANTHROPIC_TIMEOUT_MS = 120_000
export const ANTHROPIC_VERSION = '2023-06-01'

export function messagesUrl(endpoint: AnthropicEndpointSpec): string {
  return `${endpoint.baseUrl}/messages`
}

export function describeAnthropicFailure(
  status: number, body: string, endpoint: AnthropicEndpointSpec,
): string {
  const where = new URL(endpoint.baseUrl).host
  let detail: string | null = null
  try {
    detail = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? null
  } catch { detail = null }

  if (status === 401 || status === 403) {
    return `${where} hat den Schluessel abgelehnt (HTTP ${status}) — hinterlegt ist er unter ` +
      `dem in der Config genannten Namen; siehe docs/anpassbare-flaechen.md`
  }
  if (status === 429) return `${where}: Rate-Limit oder Kontingent erschoepft (HTTP 429)`
  if (status === 404) return `${where} kennt das Modell '${endpoint.model}' nicht (HTTP 404)`
  return detail ? `${where} antwortete mit HTTP ${status}: ${detail}` : `${where} antwortete mit HTTP ${status}`
}

export class AnthropicClient implements ModelClient {
  generate(_req: GenerateRequest): Promise<string> {
    return Promise.reject(new Error(
      'Der Anthropic-Transport hat keinen generate-Weg — er bedient die Harness-Schleife ueber chat().',
    ))
  }

  async chat(req: ChatRequest): Promise<unknown> {
    if (req.endpoint.kind !== 'anthropic') {
      throw new Error('AnthropicClient wurde mit einem fremden Endpunkt aufgerufen')
    }
    const endpoint = req.endpoint
    const key = await resolveApiKey(endpoint.keyRef)
    if (!key) {
      throw new Error(
        `Fuer '${endpoint.model}' ist kein API-Schluessel hinterlegt — erwartet im Keychain ` +
        `oder als Umgebungsvariable; siehe docs/anpassbare-flaechen.md`
      )
    }

    const koerper = JSON.stringify({ ...(req.koerper as object), model: endpoint.model, max_tokens: 8192 })
    const url = new URL(messagesUrl(endpoint))

    return new Promise<unknown>((resolve, reject) => {
      const request = https.request(
        {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(koerper),
            'x-api-key': key,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          timeout: req.timeoutMs ?? ANTHROPIC_TIMEOUT_MS,
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () => {
            const payload = Buffer.concat(chunks).toString('utf-8')
            if (res.statusCode !== 200) {
              reject(new Error(describeAnthropicFailure(res.statusCode ?? 0, payload, endpoint)))
              return
            }
            try { resolve(JSON.parse(payload)) }
            catch { reject(new Error(`Antwort ist kein verwertbares JSON: ${payload.slice(0, 200)}`)) }
          })
        },
      )
      request.on('error', (err) => reject(new Error(`${url.host} ist nicht erreichbar: ${err.message}`)))
      request.on('timeout', () => {
        request.destroy()
        reject(new Error(
          `${url.host} hat die zugestandene Zeit von ${req.timeoutMs ?? ANTHROPIC_TIMEOUT_MS} ms ueberschritten`
        ))
      })
      request.write(koerper)
      request.end()
    })
  }
}
```

- [ ] **Step 5: Add `chat()` to the two existing clients**

In `api-client.ts`, innerhalb `OpenAiCompatibleClient`. Der Schluessel wird nur verlangt, wenn ein
`keyRef` genannt ist:

```ts
  async chat(req: ChatRequest): Promise<unknown> {
    if (req.endpoint.kind !== 'openai-compatible') {
      throw new Error('OpenAiCompatibleClient wurde mit einem fremden Endpunkt aufgerufen')
    }
    const endpoint = req.endpoint
    // An empty keyRef means the endpoint needs no key — Ollama's /v1 surface and vLLM. A named
    // keyRef that resolves to nothing stays a named failure.
    const key = endpoint.keyRef === '' ? null : await resolveApiKey(endpoint.keyRef)
    if (endpoint.keyRef !== '' && !key) {
      throw new Error(
        `Fuer '${endpoint.model}' ist kein API-Schluessel hinterlegt — erwartet im Keychain ` +
        `oder als Umgebungsvariable; siehe docs/anpassbare-flaechen.md`
      )
    }

    const body = JSON.stringify({ ...(req.koerper as object), model: endpoint.model })
    const url = new URL(chatCompletionsUrl(endpoint))
    const transport = url.protocol === 'http:' ? http : https
    const headers: Record<string, string | number> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    }
    if (key) headers.Authorization = `Bearer ${key}`

    return new Promise<unknown>((resolve, reject) => {
      const request = transport.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'http:' ? 80 : 443),
          path: url.pathname + url.search,
          method: 'POST',
          headers,
          timeout: req.timeoutMs ?? API_TIMEOUT_MS,
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () => {
            const payload = Buffer.concat(chunks).toString('utf-8')
            if (res.statusCode !== 200) {
              reject(new Error(describeApiFailure(res.statusCode ?? 0, payload, endpoint)))
              return
            }
            try { resolve(JSON.parse(payload)) }
            catch { reject(new Error(`Antwort ist kein verwertbares JSON: ${payload.slice(0, 200)}`)) }
          })
        },
      )
      request.on('error', (err) => reject(new Error(`${url.host} ist nicht erreichbar: ${err.message}`)))
      request.on('timeout', () => {
        request.destroy()
        reject(new Error(
          `${url.host} hat die zugestandene Zeit von ${req.timeoutMs ?? API_TIMEOUT_MS} ms ueberschritten`
        ))
      })
      request.write(body)
      request.end()
    })
  }
```

In `ollama-client.ts`, innerhalb `HttpOllamaClient` — ein benannter Fehlschlag statt eines halb
gebauten Weges:

```ts
  chat(_req: ChatRequest): Promise<unknown> {
    return Promise.reject(new Error(
      'Der Ollama-Native-Transport hat keinen chat-Weg. Ein lokales Modell laeuft in dieser ' +
      'Ausbaustufe ueber seine /v1-Flaeche: Eintrag mit codec "openai-chat".',
    ))
  }
```

Beide Dateien brauchen `import type { ChatRequest } from './model-client'`.

- [ ] **Step 6: Extend `toModelEndpoint` in `entry.ts`**

```ts
/**
 * The endpoint a registry entry resolves to.
 *
 * The optional codec is what tells an `api` entry apart from an Anthropic one, and it is the
 * only thing that does — a second `dialekt` field would be the same fact written twice, with a
 * consistency rule as the running cost. `normaliseEintrag` calls this without a codec, because
 * at that point `faehigkeiten` is not merged yet and the question there is only whether
 * baseUrl and keyRef are present — the same question for both dialects.
 */
export function toModelEndpoint(e: Erreichbarkeit, codec?: Faehigkeiten['codec']): ModelEndpoint {
  switch (e.art) {
    case 'cli-harness':
      throw new Error(`Ein cli-harness-Eintrag hat keinen Endpunkt`)
    case 'local-http':
      // Driven through the /v1 surface when the capability row asks for the openai-chat codec.
      // That is how the Spark is reachable before ollama-native exists. No key: Ollama wants none.
      if (codec === 'openai-chat') {
        return normaliseEndpoint({
          kind: 'openai-compatible', baseUrl: `http://${e.host}:${e.port}/v1`, model: e.model, keyRef: '',
        })
      }
      return normaliseEndpoint({ kind: 'ollama', host: e.host, port: e.port, model: e.model })
    case 'api':
      return normaliseEndpoint({
        kind: codec === 'anthropic' ? 'anthropic' : 'openai-compatible',
        baseUrl: e.baseUrl, model: e.model, keyRef: e.keyRef,
      })
  }
}
```

- [ ] **Step 7: Pass the codec through in `rollen.ts`**

`src/main/model/rollen.ts:20` — `toModelEndpoint(eintrag.erreichbarkeit)` wird zu:

```ts
  if (eintrag) return toModelEndpoint(eintrag.erreichbarkeit, eintrag.faehigkeiten?.codec)
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run tests/worker/ tests/model/`
Expected: PASS — inklusive der unveraenderten Bestandstests

- [ ] **Step 9: Full check and commit**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/worker/ src/main/model/entry.ts src/main/model/rollen.ts tests/worker/ tests/model/entry.test.ts
git commit -m "feat(worker): chat() und der Anthropic-Transport als drittes Geschwister"
```

---

### Task 6: Der Präfix

**Files:**
- Create: `src/main/harness/praefix.ts`
- Test: `tests/harness/praefix.test.ts`

**Interfaces:**
- Consumes: `WerkzeugStummel` aus Task 3
- Produces: `interface PraefixTeile { body, capabilities, persona, globaleRegeln, auftragstext }`,
  `baueStabilenTeil(teile: PraefixTeile, werkzeuge: WerkzeugStummel[]): string`,
  `serialisiereDeterministisch(wert: unknown): string`,
  `baueFortschritt(offen: string[], erledigt: string[]): string`

- [ ] **Step 1: Write the failing test**

```ts
// tests/harness/praefix.test.ts
import { describe, it, expect } from 'vitest'
import {
  baueStabilenTeil, serialisiereDeterministisch, baueFortschritt,
} from '../../src/main/harness/praefix'

const TEILE = {
  body: 'Du bist ein Pruefer.', capabilities: 'CAP-1', persona: 'Mimir',
  globaleRegeln: 'Belege schlagen Behauptungen.', auftragstext: 'finde die Warnregeln',
}
const STUMMEL = [
  { name: 'inhalt_suchen', beschreibung: 'Sucht per Regex.' },
  { name: 'datei_lesen', beschreibung: 'Liest eine Datei.' },
]

describe('baueStabilenTeil', () => {
  it('haelt die Reihenfolge aus M8 3.5 ein', () => {
    const p = baueStabilenTeil(TEILE, STUMMEL)
    const i = (s: string): number => p.indexOf(s)
    expect(i('Du bist ein Pruefer.')).toBeLessThan(i('CAP-1'))
    expect(i('CAP-1')).toBeLessThan(i('Mimir'))
    expect(i('Mimir')).toBeLessThan(i('Belege schlagen'))
    expect(i('Belege schlagen')).toBeLessThan(i('finde die Warnregeln'))
    expect(i('finde die Warnregeln')).toBeLessThan(i('datei_lesen'))
  })

  it('ist bei gleicher Eingabe zeichengleich', () => {
    expect(baueStabilenTeil(TEILE, STUMMEL)).toBe(baueStabilenTeil(TEILE, STUMMEL))
  })

  it('sortiert die Stummelliste, damit die Aufrufreihenfolge sie nicht verschiebt', () => {
    const a = baueStabilenTeil(TEILE, STUMMEL)
    const b = baueStabilenTeil(TEILE, [...STUMMEL].reverse())
    expect(a).toBe(b)
  })

  it('traegt kein Schema, nur die eine Zeile je Werkzeug', () => {
    const p = baueStabilenTeil(TEILE, [
      { name: 'datei_lesen', beschreibung: 'Liest eine Datei.', schema: { type: 'object' } },
    ])
    expect(p).toContain('datei_lesen')
    expect(p).not.toContain('"type"')
  })

  it('enthaelt keinen Zeitstempel und keine Rundenangabe', () => {
    const p = baueStabilenTeil(TEILE, STUMMEL)
    expect(p).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(p).not.toMatch(/Runde\s*\d/)
  })
})

describe('serialisiereDeterministisch', () => {
  it('sortiert Schluessel, damit zwei gleiche Objekte gleich aussehen', () => {
    expect(serialisiereDeterministisch({ b: 1, a: 2 }))
      .toBe(serialisiereDeterministisch({ a: 2, b: 1 }))
  })

  it('sortiert auch geschachtelte Schluessel', () => {
    expect(serialisiereDeterministisch({ x: { d: 1, c: 2 } }))
      .toBe('{"x":{"c":2,"d":1}}')
  })

  it('laesst Array-Reihenfolge unangetastet', () => {
    expect(serialisiereDeterministisch([2, 1])).toBe('[2,1]')
  })
})

describe('baueFortschritt', () => {
  it('ist bei leeren Listen leer, damit ein Lauf ohne Einheiten nichts anhaengt', () => {
    expect(baueFortschritt([], [])).toBe('')
  })

  it('nennt offene und erledigte Einheiten', () => {
    const f = baueFortschritt(['B pruefen'], ['A gelesen'])
    expect(f).toContain('A gelesen')
    expect(f).toContain('B pruefen')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness/praefix.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/main/harness/praefix"`

- [ ] **Step 3: Write `praefix.ts`**

```ts
/**
 * praefix — the order of the prompt, and the reason it is worth money.
 *
 * The stable part must be byte-identical across turns or the provider's prompt cache misses and
 * every turn pays full price for the same opening. That is why there are no timestamps, no
 * counters and no round numbers in it, why keys are serialised sorted, and why a deferred tool
 * schema is appended to the *history* and never written back in here (M8 section 3.5).
 *
 * Stubs only: name plus one line. The full schema is fetched on demand.
 */

import type { WerkzeugStummel } from './codec'

export interface PraefixTeile {
  body: string
  capabilities: string
  persona: string
  globaleRegeln: string
  auftragstext: string
}

/** Sorted keys, everywhere, so two equal objects have one spelling. */
export function serialisiereDeterministisch(wert: unknown): string {
  if (Array.isArray(wert)) return `[${wert.map(serialisiereDeterministisch).join(',')}]`
  if (wert !== null && typeof wert === 'object') {
    const o = wert as Record<string, unknown>
    const paare = Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${serialisiereDeterministisch(o[k])}`)
    return `{${paare.join(',')}}`
  }
  return JSON.stringify(wert) ?? 'null'
}

export function baueStabilenTeil(teile: PraefixTeile, werkzeuge: WerkzeugStummel[]): string {
  const abschnitte = [
    teile.body,
    teile.capabilities,
    teile.persona,
    teile.globaleRegeln,
    `## Auftrag\n\n${teile.auftragstext}`,
  ].filter(a => a.trim().length > 0)

  if (werkzeuge.length > 0) {
    // Sorted by name: the order in which the registry happens to hand them over must not move
    // a single byte of the stable part.
    const zeilen = [...werkzeuge]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(w => `- \`${w.name}\` — ${w.beschreibung}`)
    abschnitte.push(`## Werkzeuge\n\n${zeilen.join('\n')}`)
  }

  return abschnitte.join('\n\n')
}

/**
 * The volatile tail. Empty when there are no units — a run without tool calls appends nothing,
 * and appending an empty heading would be a byte that says nothing.
 */
export function baueFortschritt(offen: string[], erledigt: string[]): string {
  if (offen.length === 0 && erledigt.length === 0) return ''
  const zeilen: string[] = ['## Fortschritt', '']
  for (const e of erledigt) zeilen.push(`- [x] ${e}`)
  for (const o of offen) zeilen.push(`- [ ] ${o}`)
  return zeilen.join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harness/praefix.test.ts`
Expected: PASS, 10 Tests

- [ ] **Step 5: Full check and commit**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/harness/praefix.ts tests/harness/praefix.test.ts
git commit -m "feat(harness): die Praefix-Ordnung und die deterministische Serialisierung"
```

---

### Task 7: Budgets, Preistabelle, Endzustände

**Files:**
- Create: `src/main/harness/preise.ts`
- Create: `src/main/harness/budget.ts`
- Test: `tests/harness/budget.test.ts`

**Interfaces:**
- Consumes: `ModelAntwort` aus Task 2
- Produces: `PREISTABELLE_STAND: string`, `kostenCent(modellId, usage, tabelle): number`,
  `interface Budgets { runden; wanduhrMs; kostenCent; kontextAnteil }`,
  `interface Verbrauch { runden; verstricheneMs; kostenCent; letzteEingabeToken }`,
  `type EndzustandCode`, `interface Abschlussgrund { code; anweisung }`,
  `pruefeBudgets(b, v, kontextfenster): Abschlussgrund | null`,
  `grundFuerStopGrund(s): Abschlussgrund | null`, `ZIEL_ERREICHT: Abschlussgrund`

- [ ] **Step 1: Write the failing test**

```ts
// tests/harness/budget.test.ts
import { describe, it, expect } from 'vitest'
import { kostenCent, PREISTABELLE_STAND, VORGABE_PREISE } from '../../src/main/harness/preise'
import {
  pruefeBudgets, grundFuerStopGrund, ZIEL_ERREICHT,
} from '../../src/main/harness/budget'

const BUDGETS = { runden: 12, wanduhrMs: 600_000, kostenCent: 100, kontextAnteil: 0.8 }
const FRISCH = { runden: 0, verstricheneMs: 0, kostenCent: 0, letzteEingabeToken: 0 }

describe('kostenCent', () => {
  it('rechnet Ein- und Ausgabe getrennt gegen die Tabelle', () => {
    const c = kostenCent('claude-opus-5', { eingabeToken: 1_000_000, ausgabeToken: 0, roh: null }, VORGABE_PREISE)
    expect(c).toBeGreaterThan(0)
  })

  it('rechnet ein unbekanntes Modell mit null statt zu raten', () => {
    expect(kostenCent('kennt-keiner', { eingabeToken: 1_000_000, ausgabeToken: 1_000_000, roh: null }, VORGABE_PREISE))
      .toBe(0)
  })

  it('nennt einen Tabellenstand', () => {
    expect(PREISTABELLE_STAND).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('pruefeBudgets', () => {
  it('laesst einen frischen Lauf durch', () => {
    expect(pruefeBudgets(BUDGETS, FRISCH, 100_000)).toBeNull()
  })

  it('schlaegt bei erschoepften Runden an', () => {
    const g = pruefeBudgets(BUDGETS, { ...FRISCH, runden: 12 }, 100_000)
    expect(g?.code).toBe('runden-erschoepft')
  })

  it('schlaegt bei erschoepfter Wanduhr an', () => {
    expect(pruefeBudgets(BUDGETS, { ...FRISCH, verstricheneMs: 600_000 }, 100_000)?.code)
      .toBe('zeit-erschoepft')
  })

  it('nennt im Kostengrund den Tabellenstand mit', () => {
    const g = pruefeBudgets(BUDGETS, { ...FRISCH, kostenCent: 100 }, 100_000)
    expect(g?.code).toBe('kosten-erschoepft')
    expect(g?.anweisung).toContain(PREISTABELLE_STAND)
  })

  it('schlaegt an, wenn der Anteil des Kontextfensters erreicht ist', () => {
    expect(pruefeBudgets(BUDGETS, { ...FRISCH, letzteEingabeToken: 80_000 }, 100_000)?.code)
      .toBe('kontext-erschoepft')
  })

  it('gibt jedem Grund einen Anweisungstext, nicht nur einen Bezeichner', () => {
    const g = pruefeBudgets(BUDGETS, { ...FRISCH, runden: 12 }, 100_000)
    expect(g?.anweisung.length).toBeGreaterThan(40)
  })
})

describe('grundFuerStopGrund', () => {
  it('macht aus Trunkierung einen Transportfehler ohne Reparaturversuch', () => {
    const g = grundFuerStopGrund({ normalisiert: 'laenge', roh: 'max_tokens' })
    expect(g?.code).toBe('transportfehler')
    expect(g?.anweisung).toContain('max_tokens')
  })

  it('laesst ein normales Ende durch', () => {
    expect(grundFuerStopGrund({ normalisiert: 'ende', roh: 'end_turn' })).toBeNull()
  })

  it('laesst einen Werkzeugstopp durch, weil der Zug weitergeht', () => {
    expect(grundFuerStopGrund({ normalisiert: 'werkzeug', roh: 'tool_use' })).toBeNull()
  })

  it('kennt ziel-erreicht als eigenen Grund', () => {
    expect(ZIEL_ERREICHT.code).toBe('ziel-erreicht')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness/budget.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/main/harness/preise"`

- [ ] **Step 3: Write `preise.ts`**

```ts
/**
 * preise — the versioned price table the cost budget counts against.
 *
 * The arithmetic is deterministic; what is uncertain is the *table*. That is why every cost
 * reason names the table's date: the uncertainty stays visible instead of being smoothed away
 * (M8 section 4.8).
 *
 * An unknown model costs zero rather than an estimate. A guessed price would abort a run on a
 * number nobody measured — and a cost budget that fires on a guess is worse than one that does
 * not fire at all, because it looks like a measurement.
 *
 * CK-NFR-012: this is an adjustable surface. It has an entry in docs/anpassbare-flaechen.md,
 * and tests/docs/anpassbare-flaechen.test.ts holds that entry in place.
 */

export const PREISTABELLE_STAND = '2026-08-18'

export interface Preis {
  /** Cent per million input tokens. */
  eingabeProMillion: number
  /** Cent per million output tokens. */
  ausgabeProMillion: number
}

export const VORGABE_PREISE: Record<string, Preis> = {
  'claude-opus-5': { eingabeProMillion: 1500, ausgabeProMillion: 7500 },
  'claude-sonnet-5': { eingabeProMillion: 300, ausgabeProMillion: 1500 },
  'claude-haiku-4-5-20251001': { eingabeProMillion: 100, ausgabeProMillion: 500 },
  // Everything local costs nothing per token; the machine is paid for either way.
  'gemma4:26b': { eingabeProMillion: 0, ausgabeProMillion: 0 },
}

export function kostenCent(
  modellId: string,
  usage: { eingabeToken: number; ausgabeToken: number },
  tabelle: Record<string, Preis>,
): number {
  const p = tabelle[modellId]
  if (!p) return 0
  return (usage.eingabeToken * p.eingabeProMillion + usage.ausgabeToken * p.ausgabeProMillion) / 1_000_000
}
```

- [ ] **Step 4: Write `budget.ts`**

```ts
/**
 * budget — four budgets, two end states, and a reason that carries its own instruction text.
 *
 * Hitting a budget is a *closing mode, not an exception*: one last turn without tools, with the
 * instruction to deliver the result in contract form. That is why every reason carries the text
 * itself rather than an identifier somebody else has to translate — one text, two uses, the same
 * construction result-contract.ts argues for in its own head.
 *
 * `ausgesetzt` is deliberately absent from the union. It is M8 section 7 row 6 and belongs to the
 * stretch that builds the wake service; adding it now would force a branch into every switch
 * that nothing can reach.
 */

import type { ModelAntwort } from './form'
import { kostenCent, PREISTABELLE_STAND, VORGABE_PREISE, type Preis } from './preise'
// `Preis` und `VORGABE_PREISE` gehen nur in verbrauchNach — pruefeBudgets rechnet nicht,
// es vergleicht. Die Kosten stehen zu diesem Zeitpunkt schon im Verbrauch.

export type Endzustand = 'fertig' | 'abgebrochen'

export type EndzustandCode =
  | 'ziel-erreicht'
  | 'runden-erschoepft' | 'zeit-erschoepft' | 'kosten-erschoepft' | 'kontext-erschoepft'
  | 'transportfehler' | 'abgebrochen-von-aussen'

export interface Abschlussgrund {
  code: EndzustandCode
  endzustand: Endzustand
  /** German. Goes to the model as the closing instruction *and* into the event. */
  anweisung: string
}

export interface Budgets {
  runden: number
  wanduhrMs: number
  kostenCent: number
  /** 0..1 of the usable context window. */
  kontextAnteil: number
}

export interface Verbrauch {
  runden: number
  verstricheneMs: number
  kostenCent: number
  letzteEingabeToken: number
}

const ABSCHLUSS =
  'Liefere jetzt das Ergebnis in Vertragsform — ein einzelner Block ```keel-ergebnis mit einem ' +
  'JSON-Objekt. Fuehre kein Werkzeug mehr aus. Ein Teilergebnis mit benannter Luecke ist besser ' +
  'als keines.'

export const ZIEL_ERREICHT: Abschlussgrund = {
  code: 'ziel-erreicht', endzustand: 'fertig',
  anweisung: 'Das Ziel ist erreicht.',
}

export const VON_AUSSEN: Abschlussgrund = {
  code: 'abgebrochen-von-aussen', endzustand: 'abgebrochen',
  anweisung: 'Der Lauf wurde von aussen abgebrochen.',
}

export function pruefeBudgets(
  b: Budgets, v: Verbrauch, nutzbaresKontextfenster: number,
): Abschlussgrund | null {
  if (v.runden >= b.runden) {
    return { code: 'runden-erschoepft', endzustand: 'fertig',
      anweisung: `Das Rundenbudget von ${b.runden} Zuegen ist erschoepft. ${ABSCHLUSS}` }
  }
  if (v.verstricheneMs >= b.wanduhrMs) {
    return { code: 'zeit-erschoepft', endzustand: 'fertig',
      anweisung: `Das Zeitbudget von ${Math.round(b.wanduhrMs / 1000)} Sekunden ist erschoepft. ${ABSCHLUSS}` }
  }
  if (v.kostenCent >= b.kostenCent) {
    // The table's date rides along: the arithmetic is certain, the table is not.
    return { code: 'kosten-erschoepft', endzustand: 'fertig',
      anweisung: `Das Kostenbudget von ${b.kostenCent} Cent ist erschoepft ` +
        `(Preistabelle ${PREISTABELLE_STAND}). ${ABSCHLUSS}` }
  }
  const schwelle = nutzbaresKontextfenster * b.kontextAnteil
  if (v.letzteEingabeToken >= schwelle) {
    return { code: 'kontext-erschoepft', endzustand: 'fertig',
      anweisung: `Der Kontext ist zu ${Math.round(b.kontextAnteil * 100)} Prozent gefuellt ` +
        `(${v.letzteEingabeToken} von ${nutzbaresKontextfenster} Token). ${ABSCHLUSS}` }
  }
  return null
}

/**
 * Truncation is a transport failure, not a format break — and the stop reason is read *before*
 * any repair decision, so the one repair attempt is not burned on a problem no amount of
 * thinking solves (M8 section 4.8).
 */
export function grundFuerStopGrund(s: ModelAntwort['stopGrund']): Abschlussgrund | null {
  if (s.normalisiert !== 'laenge') return null
  return {
    code: 'transportfehler', endzustand: 'abgebrochen',
    anweisung: `Die Antwort wurde abgeschnitten (${s.roh}). Das ist ein Transportfehler; ` +
      `ein Reparaturversuch loest ihn nicht.`,
  }
}

export function verbrauchNach(
  v: Verbrauch, modellId: string, a: ModelAntwort, begonnenMs: number, jetztMs: number,
  tabelle: Record<string, Preis> = VORGABE_PREISE,
): Verbrauch {
  return {
    runden: v.runden + 1,
    verstricheneMs: jetztMs - begonnenMs,
    kostenCent: v.kostenCent + kostenCent(modellId, a.usage, tabelle),
    letzteEingabeToken: a.usage.eingabeToken,
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/harness/budget.test.ts`
Expected: PASS, 11 Tests

- [ ] **Step 6: Full check and commit**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/harness/preise.ts src/main/harness/budget.ts tests/harness/budget.test.ts
git commit -m "feat(harness): vier Budgets, zwei Endzustaende, Gruende mit Anweisungstext"
```

---

### Task 8: Die Pfadwache

**Files:**
- Create: `src/main/harness/pfadwache.ts`
- Test: `tests/harness/pfadwache.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces: `interface WacheKontext { wurzel: string; heim: string; userDataPfad: string }`,
  `pruefePfad(roh: string, ktx: WacheKontext): { ok: true; pfad: string } | { ok: false; grund: string }`

> **Diese Aufgabe traegt die Sicherheitsaussage der ganzen Strecke.** Lesende Werkzeuge brauchen
> keine Sandbox, *weil* diese Pruefung nicht umgehbar ist — sie prueft ein Argument, das das
> Werkzeug selbst aufloest, nicht eine Kommandozeile. Die Aufloesung von Symlinks **vor** jeder
> Pruefung ist der Teil, ohne den die Aussage falsch waere.

- [ ] **Step 1: Write the failing test**

```ts
// tests/harness/pfadwache.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pruefePfad } from '../../src/main/harness/pfadwache'

let heim: string
let wurzel: string
let userDataPfad: string
let ktx: { wurzel: string; heim: string; userDataPfad: string }

beforeAll(() => {
  heim = mkdtempSync(join(tmpdir(), 'keel-heim-'))
  wurzel = join(heim, 'projekt')
  userDataPfad = join(heim, 'Library', 'Application Support', 'cipher-keel')
  mkdirSync(wurzel, { recursive: true })
  mkdirSync(join(heim, '.ssh'), { recursive: true })
  mkdirSync(join(wurzel, '.git'), { recursive: true })
  mkdirSync(userDataPfad, { recursive: true })
  writeFileSync(join(wurzel, 'quelle.ts'), 'export const a = 1')
  writeFileSync(join(wurzel, '.env'), 'TOKEN=geheim')
  writeFileSync(join(wurzel, 'zert.pem'), 'schluesselmaterial')
  writeFileSync(join(heim, '.ssh', 'id_rsa'), 'privat')
  writeFileSync(join(heim, '.zshrc'), 'export PATH=x')
  writeFileSync(join(heim, '.cipher-webhook.env'), 'TOKEN=x')
  writeFileSync(join(wurzel, '.git', 'config'), '[core]')
  // The bypass this whole guard stands or falls on.
  symlinkSync(join(heim, '.ssh'), join(wurzel, 'abkuerzung'))
  ktx = { wurzel, heim, userDataPfad }
})

afterAll(() => rmSync(heim, { recursive: true, force: true }))

describe('pruefePfad', () => {
  it('laesst eine gewoehnliche Datei in der Wurzel durch', () => {
    expect(pruefePfad(join(wurzel, 'quelle.ts'), ktx).ok).toBe(true)
  })

  it('lehnt einen Pfad ausserhalb der Wurzel ab', () => {
    const e = pruefePfad(join(heim, 'anderswo.txt'), ktx)
    expect(e).toEqual({ ok: false, grund: 'Pfad liegt ausserhalb der Wurzel' })
  })

  it('lehnt ~/.ssh ab', () => {
    expect(pruefePfad(join(heim, '.ssh', 'id_rsa'), ktx))
      .toEqual({ ok: false, grund: 'Pfad ist geschuetzt' })
  })

  it('lehnt einen Symlink ab, der aus der Wurzel heraus nach ~/.ssh zeigt', () => {
    // Without realpath before the check this passes the root test and reads the key.
    const e = pruefePfad(join(wurzel, 'abkuerzung', 'id_rsa'), ktx)
    expect(e.ok).toBe(false)
  })

  it('lehnt eine Shell-Startdatei ab', () => {
    expect(pruefePfad(join(heim, '.zshrc'), ktx).ok).toBe(false)
  })

  it('lehnt keels eigene Konfiguration ab', () => {
    expect(pruefePfad(join(userDataPfad, 'config.json'), ktx).ok).toBe(false)
  })

  it('lehnt ~/.cipher-* ab', () => {
    expect(pruefePfad(join(heim, '.cipher-webhook.env'), ktx).ok).toBe(false)
  })

  it('lehnt ein .git-Verzeichnis innerhalb der Wurzel ab', () => {
    expect(pruefePfad(join(wurzel, '.git', 'config'), ktx).ok).toBe(false)
  })

  it('lehnt .env innerhalb der Wurzel ab', () => {
    expect(pruefePfad(join(wurzel, '.env'), ktx))
      .toEqual({ ok: false, grund: 'Pfad ist geschuetzt' })
  })

  it('lehnt *.pem innerhalb der Wurzel ab', () => {
    expect(pruefePfad(join(wurzel, 'zert.pem'), ktx).ok).toBe(false)
  })

  it('laesst eine nicht existierende Datei in der Wurzel durch, damit der Fehler vom Werkzeug kommt', () => {
    expect(pruefePfad(join(wurzel, 'gibtsnicht.ts'), ktx).ok).toBe(true)
  })

  it('verraet in der Ablehnung weder Inhalt noch Existenz', () => {
    const e = pruefePfad(join(heim, '.ssh', 'id_rsa'), ktx)
    if (e.ok) throw new Error('haette abgelehnt werden muessen')
    expect(e.grund).not.toContain('privat')
    expect(e.grund.split(' ').length).toBeLessThan(8)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness/pfadwache.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/main/harness/pfadwache"`

- [ ] **Step 3: Write `pfadwache.ts`**

```ts
/**
 * pfadwache — what a reading tool is allowed to touch.
 *
 * This is why reading tools need no sandbox. A string check is theatre against a *shell*, where
 * `$(...)` and a rewritten npm script walk past it. Against a path argument the tool resolves
 * itself it is the thing itself — provided symlinks are resolved first, which is step one.
 *
 * Order from M8 section 4.6, taken literally: protected paths first, then deny rules, then
 * allow rules. Deny rules never yield to an allow rule.
 *
 * It is *not* an execution boundary and does not replace one. It holds as long as no tool starts
 * a process. When the shell arrives the sandbox arrives with it, and this stays alongside:
 * it checks tool arguments, the sandbox checks the process.
 */

import { realpathSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'

export interface WacheKontext {
  /** The run's project root — the only place reading is allowed. */
  wurzel: string
  /** The user's home directory. Injected rather than read, so the guard is testable. */
  heim: string
  /** app.getPath('userData') — keel's own configuration. */
  userDataPfad: string
}

export type WacheErgebnis =
  | { ok: true; pfad: string }
  | { ok: false; grund: string }

const SHELL_STARTDATEIEN = new Set([
  '.zshrc', '.zprofile', '.zshenv', '.bashrc', '.bash_profile', '.profile',
])

/** Secret-shaped names, denied even inside the root. */
const VERWEIGERTE_NAMEN = /^(\.env(\..*)?|id_rsa|id_ed25519|id_ecdsa|id_dsa)$/
const VERWEIGERTE_ENDUNGEN = /\.(pem|key|p12|keystore|jks)$/

function istIn(kandidat: string, verzeichnis: string): boolean {
  const rel = relative(verzeichnis, kandidat)
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(`..${sep}`))
}

/**
 * Resolve symlinks before anything else. A path that does not exist yet resolves its nearest
 * existing ancestor and re-appends the rest — otherwise "file not found" would be answered by
 * the guard instead of by the tool, and the two failures mean different things.
 */
function aufloesen(pfad: string): string {
  let vorhanden = resolve(pfad)
  const rest: string[] = []
  for (;;) {
    try {
      return join(realpathSync(vorhanden), ...rest.reverse())
    } catch {
      const eltern = dirname(vorhanden)
      if (eltern === vorhanden) return resolve(pfad)
      rest.push(basename(vorhanden))
      vorhanden = eltern
    }
  }
}

export function pruefePfad(roh: string, ktx: WacheKontext): WacheErgebnis {
  const pfad = aufloesen(roh)
  const name = basename(pfad)

  // 1. Protected paths — in every mode, never overridable by an allow rule.
  const geschuetzt =
    istIn(pfad, join(ktx.heim, '.ssh')) ||
    istIn(pfad, ktx.userDataPfad) ||
    (SHELL_STARTDATEIEN.has(name) && istIn(pfad, ktx.heim)) ||
    (name.startsWith('.cipher-') && istIn(pfad, ktx.heim)) ||
    pfad.split(sep).includes('.git')
  if (geschuetzt) return { ok: false, grund: 'Pfad ist geschuetzt' }

  // 2. Deny rules — these bite *inside* the root as well. A project carries secrets, and a
  // .env the model reads travels to the provider with the next prompt.
  if (VERWEIGERTE_NAMEN.test(name) || VERWEIGERTE_ENDUNGEN.test(name)) {
    return { ok: false, grund: 'Pfad ist geschuetzt' }
  }

  // 3. Allow — inside the root, and nowhere else.
  if (!istIn(pfad, aufloesen(ktx.wurzel))) {
    return { ok: false, grund: 'Pfad liegt ausserhalb der Wurzel' }
  }

  return { ok: true, pfad }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harness/pfadwache.test.ts`
Expected: PASS, 12 Tests — insbesondere der Symlink-Fall

- [ ] **Step 5: Full check and commit**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/harness/pfadwache.ts tests/harness/pfadwache.test.ts
git commit -m "feat(harness): die Pfadwache, mit Symlink-Aufloesung vor jeder Pruefung"
```

---

### Task 9: Werkzeug-Registry und die Datei-Werkzeuge

**Files:**
- Create: `src/main/harness/werkzeuge.ts`
- Create: `src/main/harness/werkzeug-datei.ts`
- Test: `tests/harness/werkzeug-datei.test.ts`

**Interfaces:**
- Consumes: `Block` aus Task 2, `WerkzeugStummel` aus Task 3, `pruefePfad`/`WacheKontext` aus Task 8
- Produces: `interface WerkzeugKontext { wache: WacheKontext; graphDb: Database | null }`,
  `type WerkzeugErgebnis = { ok: true; inhalt: Block[] } | { ok: false; meldung: string }`,
  `interface Werkzeug extends WerkzeugStummel { schema(): Record<string, unknown>; ausfuehren(eingabe, ktx): Promise<WerkzeugErgebnis> }`,
  `class WerkzeugRegistry { alle(); stummel(aufgeschoben); finde(name); schemaVon(name) }`,
  `DATEI_WERKZEUGE: Werkzeug[]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/harness/werkzeug-datei.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DATEI_WERKZEUGE } from '../../src/main/harness/werkzeug-datei'
import { WerkzeugRegistry } from '../../src/main/harness/werkzeuge'

let heim: string
let wurzel: string
let ktx: { wache: { wurzel: string; heim: string; userDataPfad: string }; graphDb: null }

const werkzeug = (name: string) => {
  const w = DATEI_WERKZEUGE.find(x => x.name === name)
  if (!w) throw new Error(`kein Werkzeug ${name}`)
  return w
}

beforeAll(() => {
  heim = mkdtempSync(join(tmpdir(), 'keel-wz-'))
  wurzel = join(heim, 'projekt')
  mkdirSync(join(wurzel, 'unter'), { recursive: true })
  writeFileSync(join(wurzel, 'a.ts'), 'zeile 1\nzeile 2\nzeile 3\n')
  writeFileSync(join(wurzel, 'unter', 'b.ts'), 'export const warnungen = 1\n')
  writeFileSync(join(wurzel, '.env'), 'TOKEN=geheim')
  ktx = { wache: { wurzel, heim, userDataPfad: join(heim, 'ud') }, graphDb: null }
})

afterAll(() => rmSync(heim, { recursive: true, force: true }))

describe('datei_lesen', () => {
  it('liest eine Datei in der Wurzel', async () => {
    const r = await werkzeug('datei_lesen').ausfuehren({ pfad: join(wurzel, 'a.ts') }, ktx)
    expect(r).toEqual({ ok: true, inhalt: [{ art: 'text', text: 'zeile 1\nzeile 2\nzeile 3\n' }] })
  })

  it('liest einen Zeilenbereich, wenn einer genannt ist', async () => {
    const r = await werkzeug('datei_lesen').ausfuehren({ pfad: join(wurzel, 'a.ts'), vonZeile: 2, bisZeile: 2 }, ktx)
    expect(r).toEqual({ ok: true, inhalt: [{ art: 'text', text: 'zeile 2' }] })
  })

  it('lehnt eine geschuetzte Datei ab, ohne den Lauf zu beenden', async () => {
    const r = await werkzeug('datei_lesen').ausfuehren({ pfad: join(wurzel, '.env') }, ktx)
    expect(r).toEqual({ ok: false, meldung: 'Pfad ist geschuetzt' })
  })

  it('meldet eine fehlende Datei als Werkzeugfehler, nicht als Wachefehler', async () => {
    const r = await werkzeug('datei_lesen').ausfuehren({ pfad: join(wurzel, 'gibtsnicht.ts') }, ktx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('nicht lesbar')
  })

  it('nennt das fehlende Feld statt zu raten', async () => {
    const r = await werkzeug('datei_lesen').ausfuehren({}, ktx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('pfad')
  })
})

describe('verzeichnis_listen', () => {
  it('findet Dateien nach Muster, relativ zur Wurzel', async () => {
    const r = await werkzeug('verzeichnis_listen').ausfuehren({ muster: '**/*.ts' }, ktx)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const text = (r.inhalt[0] as { text: string }).text
      expect(text).toContain('a.ts')
      expect(text).toContain(join('unter', 'b.ts'))
    }
  })

  it('nennt geschuetzte Treffer gar nicht erst', async () => {
    const r = await werkzeug('verzeichnis_listen').ausfuehren({ muster: '**/*' }, ktx)
    if (r.ok) expect((r.inhalt[0] as { text: string }).text).not.toContain('.env')
  })
})

describe('inhalt_suchen', () => {
  it('findet einen Treffer samt Datei und Zeilennummer', async () => {
    const r = await werkzeug('inhalt_suchen').ausfuehren({ regex: 'warnungen' }, ktx)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const text = (r.inhalt[0] as { text: string }).text
      expect(text).toContain('b.ts')
      expect(text).toContain(':1:')
    }
  })

  it('meldet eine unbrauchbare Regex, statt sie zu verschlucken', async () => {
    const r = await werkzeug('inhalt_suchen').ausfuehren({ regex: '([' }, ktx)
    expect(r.ok).toBe(false)
  })

  it('durchsucht geschuetzte Dateien nicht', async () => {
    const r = await werkzeug('inhalt_suchen').ausfuehren({ regex: 'geheim' }, ktx)
    if (r.ok) expect((r.inhalt[0] as { text: string }).text).not.toContain('.env')
  })
})

describe('WerkzeugRegistry', () => {
  it('gibt bei aufgeschobenem Laden Stummel ohne Schema', () => {
    const r = new WerkzeugRegistry(DATEI_WERKZEUGE)
    const s = r.stummel(true)
    expect(s.every(x => x.schema === undefined)).toBe(true)
    expect(s.some(x => x.name === 'werkzeug_schema')).toBe(true)
  })

  it('gibt ohne aufgeschobenes Laden alle Schemata mit und kein Meta-Werkzeug', () => {
    const r = new WerkzeugRegistry(DATEI_WERKZEUGE)
    const s = r.stummel(false)
    expect(s.every(x => x.schema !== undefined)).toBe(true)
    expect(s.some(x => x.name === 'werkzeug_schema')).toBe(false)
  })

  it('nennt ein unbekanntes Werkzeug beim Namen', () => {
    const r = new WerkzeugRegistry(DATEI_WERKZEUGE)
    expect(r.finde('zaubern')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness/werkzeug-datei.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/main/harness/werkzeug-datei"`

- [ ] **Step 3: Write `werkzeuge.ts`**

```ts
/**
 * werkzeuge — the registry, the stub list, and the deferred loading of schemas.
 *
 * Stubs in the stable prefix, schemas appended to the history. Never the other way round: a
 * schema written into the prefix invalidates the cache on every load and breaks exactly what
 * the mechanism exists for (M8 section 3.5).
 *
 * The registry also carries the meta tool. Fetching a schema explicitly beats letting the model
 * call a tool it has not seen the schema of: both cost one round of latency, but the second also
 * burns a call built on a guessed shape and teaches the model a wrong form first.
 */

import type Database from 'better-sqlite3'
import type { Block } from './form'
import type { WerkzeugStummel } from './codec'
import type { WacheKontext } from './pfadwache'

export interface WerkzeugKontext {
  wache: WacheKontext
  graphDb: Database.Database | null
}

export type WerkzeugErgebnis =
  | { ok: true; inhalt: Block[] }
  | { ok: false; meldung: string }

export interface Werkzeug extends WerkzeugStummel {
  schema(): Record<string, unknown>
  ausfuehren(eingabe: Record<string, unknown>, ktx: WerkzeugKontext): Promise<WerkzeugErgebnis>
}

export const META_WERKZEUG_NAME = 'werkzeug_schema'

export class WerkzeugRegistry {
  constructor(private readonly werkzeuge: Werkzeug[]) {}

  alle(): Werkzeug[] {
    return this.werkzeuge
  }

  finde(name: string): Werkzeug | null {
    return this.werkzeuge.find(w => w.name === name) ?? null
  }

  schemaVon(name: string): Record<string, unknown> | null {
    return this.finde(name)?.schema() ?? null
  }

  /**
   * What goes into the stable prefix. With deferred loading: name and one line, plus the meta
   * tool whose own schema is small enough to always ship. Without it: every schema up front,
   * and no meta tool — it would have nothing to do.
   */
  stummel(aufgeschoben: boolean): WerkzeugStummel[] {
    if (!aufgeschoben) {
      return this.werkzeuge.map(w => ({ name: w.name, beschreibung: w.beschreibung, schema: w.schema() }))
    }
    return [
      ...this.werkzeuge.map(w => ({ name: w.name, beschreibung: w.beschreibung })),
      {
        name: META_WERKZEUG_NAME,
        beschreibung:
          'Holt das vollstaendige Eingabeschema eines Werkzeugs. Rufe es, bevor du ein Werkzeug ' +
          'zum ersten Mal benutzt.',
        schema: {
          type: 'object',
          properties: { name: { type: 'string', description: 'Name des Werkzeugs' } },
          required: ['name'],
        },
      },
    ]
  }
}
```

- [ ] **Step 4: Write `werkzeug-datei.ts`**

```ts
/**
 * werkzeug-datei — reading, listing, searching. In-process, never through a shell.
 *
 * A `grep` via execFile would be convenient and would give up exactly the boundary that
 * justifies this stretch having no sandbox: the moment a command is assembled, checking its
 * arguments is theatre again.
 *
 * Every path passes pfadwache first. A rejection becomes a tool result with fehler: true — the
 * run continues, and the model learns why. A model that reaches too far should find out, not die.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pruefePfad } from './pfadwache'
import type { Werkzeug, WerkzeugErgebnis, WerkzeugKontext } from './werkzeuge'

/** Files above this are refused rather than silently truncated. */
const MAX_BYTES = 512 * 1024

function fehlendesFeld(feld: string): WerkzeugErgebnis {
  return { ok: false, meldung: `Das Feld '${feld}' fehlt in der Eingabe.` }
}

function musterZuRegex(muster: string): RegExp {
  // Minimal glob: ** crosses directories, * does not, everything else is literal.
  const teile = muster.split(/(\*\*\/|\*\*|\*|\?)/).filter(t => t !== '')
  const gebaut = teile.map(t => {
    if (t === '**/') return '(?:.*/)?'
    if (t === '**') return '.*'
    if (t === '*') return '[^/]*'
    if (t === '?') return '[^/]'
    return t.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }).join('')
  return new RegExp(`^${gebaut}$`)
}

function erlaubteDateien(ktx: WerkzeugKontext): string[] {
  const eintraege = readdirSync(ktx.wache.wurzel, { recursive: true, encoding: 'utf-8' })
  const raus: string[] = []
  for (const e of eintraege) {
    const voll = join(ktx.wache.wurzel, e)
    // The guard decides membership, not a second list here — one rule, one place.
    if (!pruefePfad(voll, ktx.wache).ok) continue
    try {
      if (statSync(voll).isFile()) raus.push(voll)
    } catch { /* vanished between listing and stat — not this tool's problem */ }
  }
  return raus.sort()
}

const dateiLesen: Werkzeug = {
  name: 'datei_lesen',
  beschreibung: 'Liest eine Datei aus der Projektwurzel, optional nur einen Zeilenbereich.',
  schema: () => ({
    type: 'object',
    properties: {
      pfad: { type: 'string', description: 'Pfad zur Datei' },
      vonZeile: { type: 'number', description: 'Erste Zeile, 1-basiert' },
      bisZeile: { type: 'number', description: 'Letzte Zeile, 1-basiert' },
    },
    required: ['pfad'],
  }),
  async ausfuehren(eingabe, ktx) {
    const roh = eingabe.pfad
    if (typeof roh !== 'string' || roh === '') return fehlendesFeld('pfad')

    const wache = pruefePfad(roh, ktx.wache)
    if (!wache.ok) return { ok: false, meldung: wache.grund }

    let text: string
    try {
      if (statSync(wache.pfad).size > MAX_BYTES) {
        return { ok: false, meldung: `Datei ist groesser als ${MAX_BYTES} Bytes — nenne einen Zeilenbereich.` }
      }
      text = readFileSync(wache.pfad, 'utf-8')
    } catch {
      return { ok: false, meldung: `Datei nicht lesbar: ${relative(ktx.wache.wurzel, wache.pfad)}` }
    }

    const von = typeof eingabe.vonZeile === 'number' ? eingabe.vonZeile : null
    const bis = typeof eingabe.bisZeile === 'number' ? eingabe.bisZeile : null
    if (von !== null || bis !== null) {
      const zeilen = text.split('\n')
      text = zeilen.slice((von ?? 1) - 1, bis ?? zeilen.length).join('\n')
    }
    return { ok: true, inhalt: [{ art: 'text', text }] }
  },
}

const verzeichnisListen: Werkzeug = {
  name: 'verzeichnis_listen',
  beschreibung: 'Listet Dateien der Projektwurzel nach einem Glob-Muster, etwa `src/**/*.ts`.',
  schema: () => ({
    type: 'object',
    properties: { muster: { type: 'string', description: 'Glob-Muster, relativ zur Wurzel' } },
    required: ['muster'],
  }),
  async ausfuehren(eingabe, ktx) {
    const muster = eingabe.muster
    if (typeof muster !== 'string' || muster === '') return fehlendesFeld('muster')

    let re: RegExp
    try { re = musterZuRegex(muster) }
    catch { return { ok: false, meldung: `Muster '${muster}' ist nicht auswertbar.` } }

    const treffer = erlaubteDateien(ktx)
      .map(p => relative(ktx.wache.wurzel, p))
      .filter(p => re.test(p.split('\\').join('/')))
    return {
      ok: true,
      inhalt: [{ art: 'text', text: treffer.length > 0 ? treffer.join('\n') : 'Keine Treffer.' }],
    }
  },
}

const inhaltSuchen: Werkzeug = {
  name: 'inhalt_suchen',
  beschreibung: 'Sucht per regulaerem Ausdruck in den Dateien der Projektwurzel.',
  schema: () => ({
    type: 'object',
    properties: {
      regex: { type: 'string', description: 'Regulaerer Ausdruck' },
      pfadFilter: { type: 'string', description: 'Glob-Muster, das die Dateiauswahl einschraenkt' },
    },
    required: ['regex'],
  }),
  async ausfuehren(eingabe, ktx) {
    const muster = eingabe.regex
    if (typeof muster !== 'string' || muster === '') return fehlendesFeld('regex')

    let re: RegExp
    try { re = new RegExp(muster) }
    catch (err) {
      const m = err instanceof Error ? err.message : String(err)
      return { ok: false, meldung: `Regulaerer Ausdruck ist unbrauchbar: ${m}` }
    }

    let pfadRe: RegExp | null = null
    if (typeof eingabe.pfadFilter === 'string' && eingabe.pfadFilter !== '') {
      pfadRe = musterZuRegex(eingabe.pfadFilter)
    }

    const zeilen: string[] = []
    for (const datei of erlaubteDateien(ktx)) {
      const rel = relative(ktx.wache.wurzel, datei).split('\\').join('/')
      if (pfadRe && !pfadRe.test(rel)) continue
      let inhalt: string
      try { inhalt = readFileSync(datei, 'utf-8') } catch { continue }
      inhalt.split('\n').forEach((z, i) => {
        if (re.test(z)) zeilen.push(`${rel}:${i + 1}: ${z.trim()}`)
      })
      if (zeilen.length > 200) break
    }
    return {
      ok: true,
      inhalt: [{ art: 'text', text: zeilen.length > 0 ? zeilen.join('\n') : 'Keine Treffer.' }],
    }
  },
}

export const DATEI_WERKZEUGE: Werkzeug[] = [dateiLesen, verzeichnisListen, inhaltSuchen]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/harness/werkzeug-datei.test.ts`
Expected: PASS, 13 Tests

- [ ] **Step 6: Full check and commit**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/harness/werkzeuge.ts src/main/harness/werkzeug-datei.ts tests/harness/werkzeug-datei.test.ts
git commit -m "feat(harness): Werkzeug-Registry und die drei lesenden Datei-Werkzeuge"
```

---

### Task 10: Die Graph-Werkzeuge

**Files:**
- Create: `src/main/harness/werkzeug-graph.ts`
- Test: `tests/harness/werkzeug-graph.test.ts`

**Interfaces:**
- Consumes: `Werkzeug`, `WerkzeugKontext` aus Task 9; `graphSearch`, `graphGetNode`, `graphExpand` aus `graph/search.ts`; `graphQuery` aus `graph/query.ts`; `TOOL_DEFINITIONS` aus `graph/mcp-server.ts`
- Produces: `GRAPH_WERKZEUGE: Werkzeug[]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/harness/werkzeug-graph.test.ts
import { describe, it, expect } from 'vitest'
import { GRAPH_WERKZEUGE } from '../../src/main/harness/werkzeug-graph'
import { TOOL_DEFINITIONS } from '../../src/main/graph/mcp-server'

const KTX_OHNE_DB = {
  wache: { wurzel: '/tmp', heim: '/tmp', userDataPfad: '/tmp/ud' },
  graphDb: null,
}

describe('Graph-Werkzeuge', () => {
  it('bietet genau die vier lesenden Operationen', () => {
    expect(GRAPH_WERKZEUGE.map(w => w.name).sort())
      .toEqual(['graph_abfragen', 'graph_ausweiten', 'graph_knoten_holen', 'graph_suchen'])
  })

  it('bietet keine schreibende Operation an', () => {
    const namen = GRAPH_WERKZEUGE.map(w => w.name).join(' ')
    expect(namen).not.toContain('upsert')
    expect(namen).not.toContain('link')
    expect(namen).not.toContain('maintain')
  })

  it('meldet eine fehlende Graphdatenbank, statt einen leeren Treffer vorzutaeuschen', async () => {
    for (const w of GRAPH_WERKZEUGE) {
      const r = await w.ausfuehren({ query: 'x', uid: 'y', template: 'z' }, KTX_OHNE_DB)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.meldung).toContain('Knowledge-Graph')
    }
  })
})

/**
 * M8 section 4.1's construction: one source, two renderings. The MCP server and the harness
 * tools must offer the same four read operations — if one grows a fifth, this fails.
 */
describe('Waechter: eine Quelle, zwei Renderungen', () => {
  it('deckt dieselben vier Lese-Operationen ab wie der MCP-Server', () => {
    const LESEND = ['graph_search', 'graph_get_node', 'graph_expand', 'graph_query']
    const imServer = TOOL_DEFINITIONS.map(t => t.name).filter(n => LESEND.includes(n)).sort()
    expect(imServer).toEqual([...LESEND].sort())
    expect(GRAPH_WERKZEUGE.length).toBe(imServer.length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness/werkzeug-graph.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/main/harness/werkzeug-graph"`

- [ ] **Step 3: Write `werkzeug-graph.ts`**

```ts
/**
 * werkzeug-graph — the four reading graph operations, as a second rendering over one source.
 *
 * These call the same functions the MCP server calls, not the server itself. An MCP client for
 * foreign servers is explicitly not v1 (M8 section 13), and for our own server it would be a
 * detour across a process boundary that does not exist. The guard test in
 * tests/harness/werkzeug-graph.test.ts holds both renderings to the same four operations.
 *
 * Writing operations — graph_upsert_node, graph_link, graph_maintain — are deliberately absent.
 * They belong to the stretch that brings the sandbox.
 */

import { graphSearch, graphGetNode, graphExpand } from '../graph/search'
import { graphQuery } from '../graph/query'
import type { Werkzeug, WerkzeugErgebnis, WerkzeugKontext } from './werkzeuge'

const OHNE_DB: WerkzeugErgebnis = {
  ok: false,
  meldung: 'Der Knowledge-Graph ist in dieser Sitzung nicht verfuegbar.',
}

function alsText(wert: unknown): WerkzeugErgebnis {
  return { ok: true, inhalt: [{ art: 'text', text: JSON.stringify(wert, null, 2) }] }
}

function fehlgeschlagen(err: unknown): WerkzeugErgebnis {
  return { ok: false, meldung: err instanceof Error ? err.message : String(err) }
}

const graphSuchen: Werkzeug = {
  name: 'graph_suchen',
  beschreibung: 'Durchsucht den Knowledge-Graph. Liefert knappe Treffer; Details ueber graph_knoten_holen.',
  schema: () => ({
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Suchbegriff' },
      limit: { type: 'number', description: 'Hoechstzahl der Treffer, Vorgabe 10' },
      kind: { type: 'string', description: 'Auf eine Knotenart einschraenken' },
    },
    required: ['query'],
  }),
  async ausfuehren(eingabe, ktx: WerkzeugKontext) {
    if (!ktx.graphDb) return OHNE_DB
    if (typeof eingabe.query !== 'string') return { ok: false, meldung: "Das Feld 'query' fehlt in der Eingabe." }
    try {
      return alsText(graphSearch(ktx.graphDb, {
        query: eingabe.query,
        limit: typeof eingabe.limit === 'number' ? eingabe.limit : 10,
        ...(typeof eingabe.kind === 'string' ? { kind: eingabe.kind } : {}),
      } as Parameters<typeof graphSearch>[1]))
    } catch (err) { return fehlgeschlagen(err) }
  },
}

const graphKnotenHolen: Werkzeug = {
  name: 'graph_knoten_holen',
  beschreibung: 'Laedt einen vollstaendigen Knoten samt Rumpf und Frontmatter ueber seine uid.',
  schema: () => ({
    type: 'object',
    properties: { uid: { type: 'string', description: 'uid des Knotens' } },
    required: ['uid'],
  }),
  async ausfuehren(eingabe, ktx: WerkzeugKontext) {
    if (!ktx.graphDb) return OHNE_DB
    if (typeof eingabe.uid !== 'string') return { ok: false, meldung: "Das Feld 'uid' fehlt in der Eingabe." }
    try {
      const knoten = graphGetNode(ktx.graphDb, eingabe.uid)
      // A missing node is a fact, not a failure — the model should be able to act on it.
      return alsText(knoten ?? { gefunden: false, uid: eingabe.uid })
    } catch (err) { return fehlgeschlagen(err) }
  },
}

const graphAusweiten: Werkzeug = {
  name: 'graph_ausweiten',
  beschreibung: 'Weitet die Nachbarschaft eines Knotens aus, optional nach Kantenart und Richtung.',
  schema: () => ({
    type: 'object',
    properties: {
      uid: { type: 'string', description: 'uid des Mittelpunkts' },
      depth: { type: 'number', description: 'Tiefe 1 bis 5, Vorgabe 1' },
      edge_type: { type: 'string', description: 'Auf eine Kantenart einschraenken' },
      direction: { type: 'string', description: 'outgoing, incoming oder both' },
    },
    required: ['uid'],
  }),
  async ausfuehren(eingabe, ktx: WerkzeugKontext) {
    if (!ktx.graphDb) return OHNE_DB
    if (typeof eingabe.uid !== 'string') return { ok: false, meldung: "Das Feld 'uid' fehlt in der Eingabe." }
    try {
      return alsText(graphExpand(ktx.graphDb, {
        uid: eingabe.uid,
        depth: typeof eingabe.depth === 'number' ? eingabe.depth : 1,
        ...(typeof eingabe.edge_type === 'string' ? { edge_type: eingabe.edge_type } : {}),
        ...(typeof eingabe.direction === 'string' ? { direction: eingabe.direction } : {}),
      } as Parameters<typeof graphExpand>[1]))
    } catch (err) { return fehlgeschlagen(err) }
  },
}

const graphAbfragen: Werkzeug = {
  name: 'graph_abfragen',
  beschreibung: 'Fuehrt eine benannte Abfragevorlage aus. Freie Abfragen gibt es nicht.',
  schema: () => ({
    type: 'object',
    properties: {
      template: { type: 'string', description: 'Name der Vorlage' },
      params: { type: 'object', description: 'Parameter der Vorlage' },
    },
    required: ['template'],
  }),
  async ausfuehren(eingabe, ktx: WerkzeugKontext) {
    if (!ktx.graphDb) return OHNE_DB
    if (typeof eingabe.template !== 'string') return { ok: false, meldung: "Das Feld 'template' fehlt in der Eingabe." }
    try {
      return alsText(graphQuery(ktx.graphDb, {
        template: eingabe.template,
        params: (eingabe.params as Record<string, unknown>) ?? {},
      } as Parameters<typeof graphQuery>[1]))
    } catch (err) { return fehlgeschlagen(err) }
  },
}

export const GRAPH_WERKZEUGE: Werkzeug[] = [
  graphSuchen, graphKnotenHolen, graphAusweiten, graphAbfragen,
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harness/werkzeug-graph.test.ts`
Expected: PASS, 4 Tests

- [ ] **Step 5: Full check and commit**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/harness/werkzeug-graph.ts tests/harness/werkzeug-graph.test.ts
git commit -m "feat(harness): die vier lesenden Graph-Werkzeuge als zweite Renderung"
```

---

### Task 11: Die Schleife — ein Zug ohne Werkzeuge

**Files:**
- Create: `src/main/harness/lauf.ts`
- Test: `tests/harness/lauf.test.ts`

**Interfaces:**
- Consumes: alles aus Task 1 bis 8
- Produces: `interface Auftrag { auftragstext; modellId; wurzel; anhaenge?; pflichtfelder?; budgets }`,
  `interface LaufUmgebung { db; eintrag; praefixTeile; wache; graphDb; registry; strom; uhr; abgebrochen }`,
  `starteLauf(auftrag, umgebung): Promise<string>`, `setzeFort(laufId, auftrag, umgebung): Promise<void>`

> **Diese Aufgabe baut den Zug ohne Werkzeugausfuehrung.** Die Antwort darf schon
> Werkzeug-Aufrufbloecke enthalten — sie werden in dieser Aufgabe als benannter Vertragsbruch
> abgelehnt, weil noch keine Werkzeugliste mitgeschickt wird. Task 12 macht daraus die
> Ausfuehrung.

- [ ] **Step 1: Write the failing test**

```ts
// tests/harness/lauf.test.ts
import { describe, it, expect } from 'vitest'
import { oeffneHarnessDb, lesen } from '../../src/main/harness/protokoll'
import { starteLauf } from '../../src/main/harness/lauf'
import { WerkzeugRegistry } from '../../src/main/harness/werkzeuge'
import type { ModellEintrag } from '../../src/main/model/entry'
import type { ModelAntwort } from '../../src/main/harness/form'

const EINTRAG: ModellEintrag = {
  id: 'test-modell', name: 'Testmodell', art: 'api',
  erreichbarkeit: { art: 'api', baseUrl: 'https://x/v1', model: 'm', keyRef: 'k' },
  oertlichkeit: 'fremdes-netz', erklaertext: '', empfehlung: '',
  faehigkeiten: {
    codec: 'openai-chat', werkzeugmodus: 'nativ', paralleleAufrufe: true, denkbloecke: false,
    bilder: true, dokumente: true, aufgeschobenesLaden: true, werkzeugObergrenze: 20,
    nutzbaresKontextfenster: 100_000, vertragsStrenge: { schemaTiefe: 2, reparaturversuche: 1 },
    rundenbudget: 12, gemessenAm: null, gemessenMit: null, quelle: 'vermutet',
  },
}

const AUFTRAG = {
  auftragstext: 'sag hallo', modellId: 'test-modell', wurzel: '/tmp',
  budgets: { runden: 3, wanduhrMs: 60_000, kostenCent: 100, kontextAnteil: 0.8 },
}

/** A transport stand-in: the loop must not know it is not talking to a network. */
function umgebungMit(antworten: ModelAntwort[], gesendet: string[] = []) {
  let i = 0
  let t = 0
  return {
    db: oeffneHarnessDb(':memory:'),
    eintrag: EINTRAG,
    praefixTeile: { body: 'BODY', capabilities: '', persona: '', globaleRegeln: '', auftragstext: AUFTRAG.auftragstext },
    wache: { wurzel: '/tmp', heim: '/tmp', userDataPfad: '/tmp/ud' },
    graphDb: null,
    registry: new WerkzeugRegistry([]),
    strom: () => {},
    uhr: () => (t += 1000),
    abgebrochen: () => false,
    sende: async (_koerper: unknown, praefix: string): Promise<ModelAntwort> => {
      gesendet.push(praefix)
      return antworten[i++]
    },
  }
}

function antwort(text: string, stop: 'ende' | 'laenge' = 'ende'): ModelAntwort {
  return {
    bloecke: [{ art: 'text', text }],
    stopGrund: { normalisiert: stop, roh: stop === 'ende' ? 'stop' : 'length' },
    usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
  }
}

describe('starteLauf', () => {
  it('schreibt run.started, prompt.sent, model.answered und run.finished', async () => {
    const u = umgebungMit([antwort('hallo')])
    const laufId = await starteLauf(AUFTRAG, u)
    expect(lesen(u.db, laufId).map(e => e.art))
      .toEqual(['run.started', 'prompt.sent', 'model.answered', 'run.finished'])
  })

  it('legt den gesendeten Prompt woertlich und vollstaendig ab', async () => {
    const gesendet: string[] = []
    const u = umgebungMit([antwort('hallo')], gesendet)
    const laufId = await starteLauf(AUFTRAG, u)
    const ev = lesen(u.db, laufId).find(e => e.art === 'prompt.sent')
    expect(ev?.nutzlast.text).toBe(gesendet[0])
    expect(String(ev?.nutzlast.text)).toContain('BODY')
  })

  it('endet mit fertig und ziel-erreicht, wenn das Modell aufhoert', async () => {
    const u = umgebungMit([antwort('hallo')])
    const laufId = await starteLauf(AUFTRAG, u)
    const ende = lesen(u.db, laufId).at(-1)
    expect(ende?.nutzlast).toMatchObject({ endzustand: 'fertig', grund: 'ziel-erreicht' })
  })

  it('macht aus Trunkierung einen Abbruch ohne Reparaturversuch', async () => {
    const u = umgebungMit([antwort('abgeschnitten', 'laenge')])
    const laufId = await starteLauf(AUFTRAG, u)
    const arten = lesen(u.db, laufId).map(e => e.art)
    expect(arten).not.toContain('repair.attempted')
    expect(lesen(u.db, laufId).at(-1)?.nutzlast).toMatchObject({
      endzustand: 'abgebrochen', grund: 'transportfehler',
    })
  })

  it('haelt den stabilen Praefix ueber die Zuege zeichengleich', async () => {
    const gesendet: string[] = []
    const werkzeugAntwort: ModelAntwort = {
      bloecke: [{ art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: {} }],
      stopGrund: { normalisiert: 'werkzeug', roh: 'tool_calls' },
      usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
    }
    const u = umgebungMit([werkzeugAntwort, antwort('fertig')], gesendet)
    await starteLauf(AUFTRAG, u)
    // Every sent prompt starts with the identical stable part — that is what the provider caches.
    expect(gesendet[1].startsWith(gesendet[0].split('## Fortschritt')[0])).toBe(true)
  })

  it('lehnt einen Werkzeugaufruf ab, solange keine Werkzeugliste gesendet wurde', async () => {
    const werkzeugAntwort: ModelAntwort = {
      bloecke: [{ art: 'werkzeug-aufruf', id: 'c1', name: 'zaubern', eingabe: {} }],
      stopGrund: { normalisiert: 'werkzeug', roh: 'tool_calls' },
      usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
    }
    const u = umgebungMit([werkzeugAntwort])
    const laufId = await starteLauf(AUFTRAG, u)
    expect(String(lesen(u.db, laufId).at(-1)?.nutzlast.hinweis)).toContain('zaubern')
  })

  it('faehrt nach erschoepftem Rundenbudget einen Abschlusszug und endet fertig', async () => {
    const weiter = (): ModelAntwort => ({
      bloecke: [{ art: 'text', text: 'noch nicht fertig' }],
      stopGrund: { normalisiert: 'werkzeug', roh: 'tool_calls' },
      usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
    })
    const u = umgebungMit([weiter(), weiter(), weiter(), antwort('Teilergebnis')])
    const laufId = await starteLauf({ ...AUFTRAG, budgets: { ...AUFTRAG.budgets, runden: 3 } }, u)
    const ende = lesen(u.db, laufId).at(-1)
    expect(ende?.nutzlast).toMatchObject({ endzustand: 'fertig', grund: 'runden-erschoepft' })
    expect(String(ende?.nutzlast.ergebnis)).toContain('Teilergebnis')
  })

  it('bricht auf Zuruf an der Zuggrenze ab', async () => {
    const u = { ...umgebungMit([antwort('a'), antwort('b')]), abgebrochen: () => true }
    const laufId = await starteLauf(AUFTRAG, u)
    expect(lesen(u.db, laufId).at(-1)?.nutzlast).toMatchObject({
      endzustand: 'abgebrochen', grund: 'abgebrochen-von-aussen',
    })
  })

  it('lehnt einen ungebauten Codec beim Start ab, statt still zu ersetzen', async () => {
    const u = umgebungMit([antwort('a')])
    const eintrag = { ...EINTRAG, faehigkeiten: { ...EINTRAG.faehigkeiten!, codec: 'text' as const } }
    await expect(starteLauf(AUFTRAG, { ...u, eintrag })).rejects.toThrow(/text/)
  })

  it('lehnt werkzeugmodus text beim Start ab', async () => {
    const u = umgebungMit([antwort('a')])
    const eintrag = { ...EINTRAG, faehigkeiten: { ...EINTRAG.faehigkeiten!, werkzeugmodus: 'text' as const } }
    await expect(starteLauf(AUFTRAG, { ...u, eintrag })).rejects.toThrow(/Text-Protokoll/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness/lauf.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/main/harness/lauf"`

- [ ] **Step 3: Write `lauf.ts`**

```ts
/**
 * lauf — the loop, and the only module that assembles the others.
 *
 * It holds no history. Before every turn it reads the run's events and projects. That makes
 * "turn 1" and "turn 14 after a restart" the same code path — and resumption, which hangs on a
 * hard process death and is therefore badly testable, has by then run a thousand times in normal
 * operation (M8 section 3.4).
 *
 * `sende` is injected rather than imported so the loop can be driven without a network. It is
 * not a mock seam bolted on for tests: the loop genuinely has no business knowing which
 * transport answers.
 */

import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { ModellEintrag } from '../model/entry'
import { checkWorkerAnswer } from '../worker/result-contract'
import { anhaengen, lesen } from './protokoll'
import type { Ereignis } from './ereignisse'
import { codecFuer } from './codec'
import type { Block, ModelAntwort } from './form'
import { nurText, werkzeugAufrufe } from './form'
import { projiziere } from './projektion'
import { baueFortschritt, baueStabilenTeil, type PraefixTeile } from './praefix'
import {
  grundFuerStopGrund, pruefeBudgets, verbrauchNach, VON_AUSSEN, ZIEL_ERREICHT,
  type Abschlussgrund, type Budgets, type Verbrauch,
} from './budget'
import type { WacheKontext } from './pfadwache'
import type { WerkzeugRegistry } from './werkzeuge'

export interface Auftrag {
  auftragstext: string
  modellId: string
  wurzel: string
  anhaenge?: string[]
  pflichtfelder?: string[]
  budgets: Budgets
}

export interface LaufUmgebung {
  db: Database.Database
  eintrag: ModellEintrag
  praefixTeile: PraefixTeile
  wache: WacheKontext
  graphDb: Database.Database | null
  registry: WerkzeugRegistry
  /** Every appended event, for whoever wants to watch. */
  strom: (e: Ereignis) => void
  uhr: () => number
  abgebrochen: () => boolean
  /** Wire body in, raw answer already decoded by the codec, out. */
  sende: (koerper: unknown, praefix: string) => Promise<ModelAntwort>
}

const LEERER_VERBRAUCH: Verbrauch = {
  runden: 0, verstricheneMs: 0, kostenCent: 0, letzteEingabeToken: 0,
}

function pruefeStartbedingungen(eintrag: ModellEintrag): void {
  const f = eintrag.faehigkeiten
  if (!f) {
    throw new Error(
      `Der Eintrag '${eintrag.id}' traegt keine Faehigkeitszeile — ein cli-harness besitzt sein ` +
      `Protokoll selbst und kann nicht durch die eigene Schleife gefahren werden.`,
    )
  }
  if (f.werkzeugmodus === 'text') {
    throw new Error(
      `'${eintrag.id}' braucht das Text-Protokoll fuer Werkzeuge. Das ist in dieser Ausbaustufe ` +
      `nicht gebaut — es kommt als eigener Codec.`,
    )
  }
  // Throws by name for ollama-native and text rather than falling back to something else.
  codecFuer(f.codec)
}

/**
 * The run id may be passed in. The IPC surface needs it *before* the run starts, because the
 * abort mark is keyed by it — minting it inside and handing it back afterwards would leave a
 * window in which a run cannot be cancelled.
 */
export async function starteLauf(
  auftrag: Auftrag, u: LaufUmgebung, laufId: string = randomUUID(),
): Promise<string> {
  pruefeStartbedingungen(u.eintrag)
  const f = u.eintrag.faehigkeiten!
  const stummel = u.registry.stummel(f.aufgeschobenesLaden)

  const hinweise: string[] = []
  // The tool ceiling is an inferred signal (M8 section 4.10): it may warn, never abort.
  if (stummel.length > f.werkzeugObergrenze) {
    hinweise.push(
      `Die Werkzeugliste hat ${stummel.length} Eintraege, die Faehigkeitszeile empfiehlt ` +
      `hoechstens ${f.werkzeugObergrenze}.`,
    )
  }

  schreibe(u, laufId, 'run.started', {
    auftragstext: auftrag.auftragstext,
    modellId: auftrag.modellId,
    codec: f.codec,
    werkzeuge: stummel.map(s => s.name),
    budgets: auftrag.budgets,
    hinweise,
    anhangBloecke: await anhangBloecke(auftrag),
  })

  await fahre(laufId, auftrag, u)
  return laufId
}

/** Same entry point after a restart: read, project, carry on. No second implementation. */
export async function setzeFort(laufId: string, auftrag: Auftrag, u: LaufUmgebung): Promise<void> {
  pruefeStartbedingungen(u.eintrag)
  await fahre(laufId, auftrag, u)
}

async function fahre(laufId: string, auftrag: Auftrag, u: LaufUmgebung): Promise<void> {
  const f = u.eintrag.faehigkeiten!
  const codec = codecFuer(f.codec)
  const stummel = u.registry.stummel(f.aufgeschobenesLaden)
  const stabil = baueStabilenTeil(u.praefixTeile, stummel)
  const begonnen = u.uhr()
  let verbrauch = LEERER_VERBRAUCH
  let abschluss: Abschlussgrund | null = null

  for (;;) {
    if (u.abgebrochen()) {
      beende(u, laufId, VON_AUSSEN, '')
      return
    }

    const ereignisse = lesen(u.db, laufId)
    const verlauf = projiziere(ereignisse)
    // The stable part first, byte-identical every turn; the volatile progress object last.
    const praefix = [stabil, baueFortschritt([], erledigte(ereignisse))].filter(t => t !== '').join('\n\n')
    const koerper = codec.toWire(verlauf, abschluss ? [] : stummel, f)

    schreibe(u, laufId, 'prompt.sent', { text: praefix, zug: verbrauch.runden + 1 })

    let antwort: ModelAntwort
    try {
      antwort = await u.sende(koerper, praefix)
    } catch (err) {
      beende(u, laufId, {
        code: 'transportfehler', endzustand: 'abgebrochen',
        anweisung: err instanceof Error ? err.message : String(err),
      }, '')
      return
    }

    schreibe(u, laufId, 'model.answered', {
      bloecke: antwort.bloecke, stopGrund: antwort.stopGrund, usage: antwort.usage,
    })

    // Truncation is read before any repair decision — no amount of thinking fixes it.
    const transport = grundFuerStopGrund(antwort.stopGrund)
    if (transport) {
      beende(u, laufId, transport, nurText(antwort.bloecke))
      return
    }

    if (abschluss) {
      beende(u, laufId, abschluss, nurText(antwort.bloecke), auftrag.pflichtfelder)
      return
    }

    verbrauch = verbrauchNach(verbrauch, auftrag.modellId, antwort, begonnen, u.uhr())

    const aufrufe = werkzeugAufrufe(antwort.bloecke)
    if (aufrufe.length > 0) {
      // Task 12 turns this into execution. Until then a call is a named contract break rather
      // than something quietly ignored.
      beende(u, laufId, {
        code: 'transportfehler', endzustand: 'abgebrochen',
        anweisung: `Das Modell rief '${aufrufe[0].name}' auf, obwohl keine Werkzeugliste ` +
          `gesendet wurde.`,
      }, nurText(antwort.bloecke), undefined, `Das Modell rief '${aufrufe[0].name}' auf.`)
      return
    }

    const budget = pruefeBudgets(auftrag.budgets, verbrauch, f.nutzbaresKontextfenster)
    if (budget) {
      // A hit budget is a closing mode, not an exception: one last turn without tools.
      schreibe(u, laufId, 'budget.warned', { grund: budget.code, anweisung: budget.anweisung })
      abschluss = budget
      continue
    }

    beende(u, laufId, ZIEL_ERREICHT, nurText(antwort.bloecke), auftrag.pflichtfelder)
    return
  }
}

function erledigte(ereignisse: Ereignis[]): string[] {
  return ereignisse
    .filter(e => e.art === 'tool.completed')
    .map(e => `${String(e.nutzlast.name ?? 'Werkzeug')} (${String(e.nutzlast.aufrufId)})`)
}

async function anhangBloecke(auftrag: Auftrag): Promise<Block[]> {
  if (!auftrag.anhaenge || auftrag.anhaenge.length === 0) return []
  const { readFileSync } = await import('node:fs')
  const { basename, extname } = await import('node:path')
  const TYPEN: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.pdf': 'application/pdf',
  }
  return auftrag.anhaenge.map(pfad => {
    // Attachments deliberately bypass pfadwache: they are the user's act, not the model's.
    // A path that cannot be read stops the run instead of being silently skipped.
    const daten = readFileSync(pfad).toString('base64')
    const medientyp = TYPEN[extname(pfad).toLowerCase()] ?? 'application/octet-stream'
    return medientyp.startsWith('image/')
      ? { art: 'bild' as const, medientyp, daten }
      : { art: 'dokument' as const, medientyp, name: basename(pfad), daten }
  })
}

function schreibe(
  u: LaufUmgebung, laufId: string, art: Ereignis['art'], nutzlast: Record<string, unknown>,
): void {
  u.strom(anhaengen(u.db, laufId, art, nutzlast))
}

function beende(
  u: LaufUmgebung, laufId: string, grund: Abschlussgrund, ergebnis: string,
  pflichtfelder?: string[], hinweis?: string,
): void {
  // The contract is checked at the outer edge only, and never enforced: a visibly failed run
  // beats valid nonsense (M8 section 4.9).
  const vertrag = pflichtfelder && pflichtfelder.length > 0
    ? checkWorkerAnswer(ergebnis, pflichtfelder)
    : null
  schreibe(u, laufId, 'run.finished', {
    endzustand: grund.endzustand,
    grund: grund.code,
    anweisung: grund.anweisung,
    ergebnis,
    vertrag: vertrag ? (vertrag.ok ? { ok: true } : { ok: false, grund: vertrag.reason }) : null,
    ...(hinweis ? { hinweis } : {}),
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harness/lauf.test.ts`
Expected: PASS, 10 Tests

- [ ] **Step 5: Full check and commit**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/harness/lauf.ts tests/harness/lauf.test.ts
git commit -m "feat(harness): die Schleife -- Zug, Budgets, Abschlussmodus, Vertrag"
```

---

### Task 12: Werkzeugausführung, Intent vor Effekt, Wiederaufnahme

**Files:**
- Modify: `src/main/harness/lauf.ts`
- Create: `src/main/harness/index.ts`
- Test: `tests/harness/lauf-werkzeuge.test.ts`

**Interfaces:**
- Consumes: `Werkzeug`, `WerkzeugRegistry`, `META_WERKZEUG_NAME` aus Task 9
- Produces: `index.ts` exportiert `starteLauf`, `setzeFort`, `oeffneHarnessDb`, `lesen`, `laufIds`,
  `WerkzeugRegistry`, `DATEI_WERKZEUGE`, `GRAPH_WERKZEUGE`, Typen `Auftrag`, `LaufUmgebung`, `Ereignis`

- [ ] **Step 1: Write the failing test**

```ts
// tests/harness/lauf-werkzeuge.test.ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { oeffneHarnessDb, anhaengen, lesen } from '../../src/main/harness/protokoll'
import { starteLauf, setzeFort } from '../../src/main/harness/lauf'
import { WerkzeugRegistry } from '../../src/main/harness/werkzeuge'
import { DATEI_WERKZEUGE } from '../../src/main/harness/werkzeug-datei'
import type { ModelAntwort } from '../../src/main/harness/form'
import type { ModellEintrag } from '../../src/main/model/entry'

const EINTRAG: ModellEintrag = {
  id: 'test-modell', name: 'Testmodell', art: 'api',
  erreichbarkeit: { art: 'api', baseUrl: 'https://x/v1', model: 'm', keyRef: 'k' },
  oertlichkeit: 'fremdes-netz', erklaertext: '', empfehlung: '',
  faehigkeiten: {
    codec: 'openai-chat', werkzeugmodus: 'nativ', paralleleAufrufe: true, denkbloecke: false,
    bilder: true, dokumente: true, aufgeschobenesLaden: true, werkzeugObergrenze: 20,
    nutzbaresKontextfenster: 100_000, vertragsStrenge: { schemaTiefe: 2, reparaturversuche: 1 },
    rundenbudget: 12, gemessenAm: null, gemessenMit: null, quelle: 'vermutet',
  },
}

function umgebung(wurzel: string, antworten: ModelAntwort[]) {
  let i = 0, t = 0
  return {
    db: oeffneHarnessDb(':memory:'),
    eintrag: EINTRAG,
    praefixTeile: { body: 'BODY', capabilities: '', persona: '', globaleRegeln: '', auftragstext: 'a' },
    wache: { wurzel, heim: wurzel, userDataPfad: join(wurzel, 'ud') },
    graphDb: null,
    registry: new WerkzeugRegistry(DATEI_WERKZEUGE),
    strom: () => {},
    uhr: () => (t += 1000),
    abgebrochen: () => false,
    sende: async (): Promise<ModelAntwort> => antworten[i++],
  }
}

const ruft = (name: string, eingabe: Record<string, unknown>, id = 'c1'): ModelAntwort => ({
  bloecke: [{ art: 'werkzeug-aufruf', id, name, eingabe }],
  stopGrund: { normalisiert: 'werkzeug', roh: 'tool_calls' },
  usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
})

const sagt = (text: string): ModelAntwort => ({
  bloecke: [{ art: 'text', text }],
  stopGrund: { normalisiert: 'ende', roh: 'stop' },
  usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
})

const AUFTRAG = (wurzel: string) => ({
  auftragstext: 'lies a.ts', modellId: 'test-modell', wurzel,
  budgets: { runden: 6, wanduhrMs: 60_000, kostenCent: 100, kontextAnteil: 0.9 },
})

describe('Werkzeugausfuehrung', () => {
  it('schreibt tool.intent vor tool.completed', async () => {
    const w = mkdtempSync(join(tmpdir(), 'keel-lw-'))
    writeFileSync(join(w, 'a.ts'), 'inhalt')
    const u = umgebung(w, [ruft('datei_lesen', { pfad: join(w, 'a.ts') }), sagt('fertig')])
    const id = await starteLauf(AUFTRAG(w), u)
    const arten = lesen(u.db, id).map(e => e.art)
    expect(arten.indexOf('tool.intent')).toBeLessThan(arten.indexOf('tool.completed'))
    rmSync(w, { recursive: true, force: true })
  })

  it('macht aus einer abgelehnten Pfadpruefung ein tool.failed und laeuft weiter', async () => {
    const w = mkdtempSync(join(tmpdir(), 'keel-lw-'))
    writeFileSync(join(w, '.env'), 'TOKEN=x')
    const u = umgebung(w, [ruft('datei_lesen', { pfad: join(w, '.env') }), sagt('verstanden')])
    const id = await starteLauf(AUFTRAG(w), u)
    const ev = lesen(u.db, id)
    expect(ev.some(e => e.art === 'tool.failed')).toBe(true)
    expect(ev.at(-1)?.nutzlast).toMatchObject({ endzustand: 'fertig' })
    rmSync(w, { recursive: true, force: true })
  })

  it('reicht ein Schema nach und schreibt tool.schema_loaded', async () => {
    const w = mkdtempSync(join(tmpdir(), 'keel-lw-'))
    const u = umgebung(w, [ruft('werkzeug_schema', { name: 'datei_lesen' }), sagt('fertig')])
    const id = await starteLauf(AUFTRAG(w), u)
    const geladen = lesen(u.db, id).find(e => e.art === 'tool.schema_loaded')
    expect(geladen?.nutzlast.name).toBe('datei_lesen')
    rmSync(w, { recursive: true, force: true })
  })

  it('haelt den stabilen Praefix nach dem Nachladen zeichengleich', async () => {
    const w = mkdtempSync(join(tmpdir(), 'keel-lw-'))
    const u = umgebung(w, [ruft('werkzeug_schema', { name: 'datei_lesen' }), sagt('fertig')])
    const id = await starteLauf(AUFTRAG(w), u)
    const prompts = lesen(u.db, id).filter(e => e.art === 'prompt.sent')
      .map(e => String(e.nutzlast.text))
    expect(prompts[1].startsWith(prompts[0].split('## Fortschritt')[0])).toBe(true)
    // The schema is in the history, never in the stable part.
    expect(prompts[0]).not.toContain('"required"')
    rmSync(w, { recursive: true, force: true })
  })

  it('lehnt ein unbekanntes Werkzeug beim Namen ab', async () => {
    const w = mkdtempSync(join(tmpdir(), 'keel-lw-'))
    const u = umgebung(w, [ruft('zaubern', {}), sagt('ok')])
    const id = await starteLauf(AUFTRAG(w), u)
    const f = lesen(u.db, id).find(e => e.art === 'tool.failed')
    expect(String(f?.nutzlast.meldung)).toContain('zaubern')
    rmSync(w, { recursive: true, force: true })
  })

  it('fuehrt mehrere lesende Aufrufe eines Zuges aus', async () => {
    const w = mkdtempSync(join(tmpdir(), 'keel-lw-'))
    writeFileSync(join(w, 'a.ts'), 'A')
    writeFileSync(join(w, 'b.ts'), 'B')
    const zwei: ModelAntwort = {
      bloecke: [
        { art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: { pfad: join(w, 'a.ts') } },
        { art: 'werkzeug-aufruf', id: 'c2', name: 'datei_lesen', eingabe: { pfad: join(w, 'b.ts') } },
      ],
      stopGrund: { normalisiert: 'werkzeug', roh: 'tool_calls' },
      usage: { eingabeToken: 100, ausgabeToken: 10, roh: null },
    }
    const u = umgebung(w, [zwei, sagt('fertig')])
    const id = await starteLauf(AUFTRAG(w), u)
    expect(lesen(u.db, id).filter(e => e.art === 'tool.completed')).toHaveLength(2)
    rmSync(w, { recursive: true, force: true })
  })

  it('lehnt einen Werkzeugaufruf im Abschlusszug ab', async () => {
    const w = mkdtempSync(join(tmpdir(), 'keel-lw-'))
    writeFileSync(join(w, 'a.ts'), 'A')
    const u = umgebung(w, [
      ruft('datei_lesen', { pfad: join(w, 'a.ts') }),
      ruft('datei_lesen', { pfad: join(w, 'a.ts') }, 'c2'),
      sagt('Teilergebnis'),
    ])
    const id = await starteLauf({ ...AUFTRAG(w), budgets: { ...AUFTRAG(w).budgets, runden: 2 } }, u)
    expect(lesen(u.db, id).at(-1)?.nutzlast).toMatchObject({ grund: 'runden-erschoepft' })
    rmSync(w, { recursive: true, force: true })
  })
})

describe('Wiederaufnahme', () => {
  it('fuehrt kein Werkzeug ein zweites Mal aus', async () => {
    const w = mkdtempSync(join(tmpdir(), 'keel-lw-'))
    writeFileSync(join(w, 'a.ts'), 'inhalt')
    const u = umgebung(w, [sagt('fertig')])
    const id = 'lauf-fortsetzen'
    // A run that already got as far as a completed tool call.
    anhaengen(u.db, id, 'run.started', { auftragstext: 'a', modellId: 'test-modell', werkzeuge: [] })
    anhaengen(u.db, id, 'model.answered', { bloecke: [
      { art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: { pfad: join(w, 'a.ts') } },
    ] })
    anhaengen(u.db, id, 'tool.intent', { aufrufId: 'c1', name: 'datei_lesen' })
    anhaengen(u.db, id, 'tool.completed', { aufrufId: 'c1', name: 'datei_lesen', inhalt: [{ art: 'text', text: 'inhalt' }] })

    await setzeFort(id, AUFTRAG(w), u)
    expect(lesen(u.db, id).filter(e => e.art === 'tool.intent')).toHaveLength(1)
    rmSync(w, { recursive: true, force: true })
  })

  it('gibt einem offenen Intent ein Ergebnis mit unbekannter Ausfuehrung', async () => {
    const w = mkdtempSync(join(tmpdir(), 'keel-lw-'))
    const u = umgebung(w, [sagt('verstanden')])
    const id = 'lauf-offen'
    anhaengen(u.db, id, 'run.started', { auftragstext: 'a', modellId: 'test-modell', werkzeuge: [] })
    anhaengen(u.db, id, 'model.answered', { bloecke: [
      { art: 'werkzeug-aufruf', id: 'c1', name: 'datei_lesen', eingabe: {} },
    ] })
    anhaengen(u.db, id, 'tool.intent', { aufrufId: 'c1', name: 'datei_lesen' })

    await setzeFort(id, AUFTRAG(w), u)
    const prompt = lesen(u.db, id).filter(e => e.art === 'prompt.sent').at(-1)
    // The projection put it into the history; the loop must not re-run the call.
    expect(lesen(u.db, id).filter(e => e.art === 'tool.intent')).toHaveLength(1)
    expect(prompt).toBeDefined()
    rmSync(w, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness/lauf-werkzeuge.test.ts`
Expected: FAIL — der Vertragsbruch-Zweig aus Task 11 beendet den Lauf, statt auszufuehren

- [ ] **Step 3: Delete the test from Task 11 that this task makes wrong**

In `tests/harness/lauf.test.ts` faellt der Fall

```
it('lehnt einen Werkzeugaufruf ab, solange keine Werkzeugliste gesendet wurde', ...)
```

**ersatzlos weg.** Er hat den Zwischenstand aus Task 11 festgehalten, in dem die Schleife noch
nicht ausfuehren konnte. Ab dieser Aufgabe ist ein Werkzeugaufruf kein Vertragsbruch mehr, sondern
der Normalfall — der Test wuerde jetzt eine Eigenschaft einfordern, die absichtlich nicht mehr
gilt. Das ist die eine Sorte Testloeschung, die richtig ist: Der Test hat gearbeitet und ist
fertig, nicht kaputt und weggeraeumt. Der Fall „unbekanntes Werkzeug" bleibt und wandert nach
`lauf-werkzeuge.test.ts`, wo er als `tool.failed` geprueft wird.

Ebenso faellt der jetzt unbenutzte sechste Parameter `hinweis` aus `beende()` weg.

- [ ] **Step 4: Replace the contract-break branch in `lauf.ts` with execution**

Ersetze in `fahre` den Block `if (aufrufe.length > 0) { beende(...) }` durch:

```ts
    if (aufrufe.length > 0) {
      if (abschluss) {
        // Masking rather than removing: the stub list stays byte-identical, the call is refused
        // with a reason (M8 section 3.5).
        for (const a of aufrufe) {
          schreibe(u, laufId, 'tool.intent', { aufrufId: a.id, name: a.name, eingabe: a.eingabe })
          schreibe(u, laufId, 'tool.failed', {
            aufrufId: a.id, name: a.name,
            meldung: 'Der Lauf ist im Abschlusszug — es wird kein Werkzeug mehr ausgefuehrt.',
          })
        }
        continue
      }
      // All tools in this stretch read, so all calls of a turn may run concurrently. The
      // Single-Writer rule from M8 section 3.2 holds trivially: no call writes. The mechanism
      // for it arrives with the writing tools.
      await Promise.all(aufrufe.map(a => fuehreAus(u, laufId, a)))
      const nachWerkzeug = pruefeBudgets(auftrag.budgets, verbrauch, f.nutzbaresKontextfenster)
      if (nachWerkzeug) {
        schreibe(u, laufId, 'budget.warned', { grund: nachWerkzeug.code, anweisung: nachWerkzeug.anweisung })
        abschluss = nachWerkzeug
      }
      continue
    }
```

- [ ] **Step 5: Add `fuehreAus` to `lauf.ts`**

```ts
/**
 * One tool call, with the intent written *before* the effect.
 *
 * That order is the whole point: a hard death between effect and result leaves an intent without
 * a completion, and the projection turns that into "execution unknown" rather than repeating the
 * call. Writing the intent afterwards would make the two states indistinguishable.
 */
async function fuehreAus(
  u: LaufUmgebung, laufId: string, a: Extract<Block, { art: 'werkzeug-aufruf' }>,
): Promise<void> {
  schreibe(u, laufId, 'tool.intent', { aufrufId: a.id, name: a.name, eingabe: a.eingabe })

  if (a.name === META_WERKZEUG_NAME) {
    const gesucht = typeof a.eingabe.name === 'string' ? a.eingabe.name : ''
    const schema = u.registry.schemaVon(gesucht)
    if (!schema) {
      schreibe(u, laufId, 'tool.failed', {
        aufrufId: a.id, name: a.name,
        meldung: `Es gibt kein Werkzeug '${gesucht}'.`,
      })
      return
    }
    // Appended to the history, never written into the stable prefix.
    schreibe(u, laufId, 'tool.schema_loaded', { name: gesucht, schema })
    schreibe(u, laufId, 'tool.completed', {
      aufrufId: a.id, name: a.name,
      inhalt: [{ art: 'text', text: `Schema fuer ${gesucht} steht im Verlauf.` }],
    })
    return
  }

  const werkzeug = u.registry.finde(a.name)
  if (!werkzeug) {
    schreibe(u, laufId, 'tool.failed', {
      aufrufId: a.id, name: a.name,
      meldung: `Es gibt kein Werkzeug '${a.name}'. Verfuegbar sind: ` +
        u.registry.alle().map(w => w.name).join(', ') + '.',
    })
    return
  }

  try {
    const r = await werkzeug.ausfuehren(a.eingabe, { wache: u.wache, graphDb: u.graphDb })
    if (r.ok) schreibe(u, laufId, 'tool.completed', { aufrufId: a.id, name: a.name, inhalt: r.inhalt })
    else schreibe(u, laufId, 'tool.failed', { aufrufId: a.id, name: a.name, meldung: r.meldung })
  } catch (err) {
    schreibe(u, laufId, 'tool.failed', {
      aufrufId: a.id, name: a.name,
      meldung: err instanceof Error ? err.message : String(err),
    })
  }
}
```

Dazu die Importe ergaenzen: `import { META_WERKZEUG_NAME, type WerkzeugRegistry } from './werkzeuge'`.

- [ ] **Step 6: Write `index.ts`**

```ts
/**
 * index — the harness's public surface.
 *
 * Everything outside src/main/harness/ imports from here, so the module cut inside stays free to
 * move. Nothing here touches Electron; the IPC surface lives in src/main/harness-handlers.ts.
 */

export { starteLauf, setzeFort, type Auftrag, type LaufUmgebung } from './lauf'
export { oeffneHarnessDb, anhaengen, lesen, laufIds } from './protokoll'
export { WerkzeugRegistry, type Werkzeug, type WerkzeugKontext } from './werkzeuge'
export { DATEI_WERKZEUGE } from './werkzeug-datei'
export { GRAPH_WERKZEUGE } from './werkzeug-graph'
export { codecFuer } from './codec'
export { projiziere } from './projektion'
export { baueStabilenTeil, type PraefixTeile } from './praefix'
export { PREISTABELLE_STAND, VORGABE_PREISE } from './preise'
export type { Ereignis, EreignisArt } from './ereignisse'
export type { Block, Nachricht, ModelAntwort } from './form'
export type { WacheKontext } from './pfadwache'
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/harness/`
Expected: PASS — alle Harness-Tests, inklusive der beiden Wiederaufnahme-Faelle

- [ ] **Step 8: Full check and commit**

```bash
npm test && npm run typecheck && npm run lint
git add src/main/harness/lauf.ts src/main/harness/index.ts tests/harness/lauf-werkzeuge.test.ts
git commit -m "feat(harness): Werkzeugausfuehrung, Intent vor Effekt, Wiederaufnahme"
```

---

### Task 13: IPC, Fenster und das Ereignis-Panel

**Files:**
- Modify: `src/shared/ipc-channels.ts` (fünf Konstanten, zwei Unions)
- Create: `src/shared/harness-types.ts`
- Create: `src/main/harness-handlers.ts`
- Modify: `src/main/window-manager.ts` (`createHarnessWindow`)
- Modify: `src/main/ipc-handlers.ts` (`WINDOW_OPEN_HARNESS`, `registerHarnessHandlers()`)
- Modify: `electron.vite.config.ts` (vierter Renderer-Eingang)
- Create: `src/renderer/windows/harness-window.html`
- Create: `src/renderer/windows/harness-window.tsx`
- Create: `src/renderer/components/harness/EreignisPanel.tsx`
- Modify: `src/renderer/components/ProjectView.tsx` (Klickpfad)
- Test: `tests/harness/ipc-kanaele.test.ts`

**Interfaces:**
- Consumes: `starteLauf`, `setzeFort`, `lesen`, `laufIds` aus `harness/index.ts`
- Produces: `HARNESS_LAUF_STARTEN`, `HARNESS_LAUF_LESEN`, `HARNESS_LAUF_ABBRECHEN`,
  `HARNESS_EREIGNIS`, `WINDOW_OPEN_HARNESS`; `interface HarnessAntwort<T>`, `interface LaufAnzeige`

> **Diese Aufgabe hat bewusst keine Unit-Tests fuer die Handler.** Kein Test dieses Repos erreicht
> einen `ipcMain`-Handler; ihre Abnahme sind die Belege aus Aufgabe 15. Was hier getestet wird,
> ist die Zusicherung *daneben*: dass kein Kanal ohne Aufrufer bleibt.

- [ ] **Step 1: Write the failing guard test**

```ts
// tests/harness/ipc-kanaele.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as kanaele from '../../src/shared/ipc-channels'

const WURZEL = join(__dirname, '..', '..')

function alleDateien(verzeichnis: string): string[] {
  return readdirSync(verzeichnis, { recursive: true, encoding: 'utf-8' })
    .map(e => join(verzeichnis, e))
    .filter(p => /\.(ts|tsx)$/.test(p))
}

const HARNESS_KANAELE = Object.entries(kanaele)
  .filter(([, wert]) => typeof wert === 'string' && wert.startsWith('harness:'))
  .map(([, wert]) => wert as string)

describe('Waechter: kein Harness-Kanal ohne Aufrufer', () => {
  it('kennt ueberhaupt Harness-Kanaele', () => {
    expect(HARNESS_KANAELE.length).toBe(4)
  })

  it('jeder Kanal hat einen Aufrufer im Renderer', () => {
    const rendererQuellen = alleDateien(join(WURZEL, 'src', 'renderer'))
      .map(p => readFileSync(p, 'utf-8')).join('\n')
    const ohne = HARNESS_KANAELE.filter(k => !rendererQuellen.includes(k))
    expect(ohne).toEqual([])
  })

  it('jeder Kanal hat einen Handler oder Sender im Hauptprozess', () => {
    const hauptQuellen = alleDateien(join(WURZEL, 'src', 'main'))
      .map(p => readFileSync(p, 'utf-8')).join('\n')
    const ohne = HARNESS_KANAELE.filter(k => !hauptQuellen.includes(k))
    expect(ohne).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness/ipc-kanaele.test.ts`
Expected: FAIL — `expected 0 to be 4`

- [ ] **Step 3: Declare the channels in `src/shared/ipc-channels.ts`**

Nach dem Settings-Block einfuegen:

```ts
// ---------------------------------------------------------------------------
// Harness channels (M8 — the own agent loop)
// ---------------------------------------------------------------------------
export const HARNESS_LAUF_STARTEN = 'harness:lauf-starten' as const
export const HARNESS_LAUF_LESEN = 'harness:lauf-lesen' as const
export const HARNESS_LAUF_ABBRECHEN = 'harness:lauf-abbrechen' as const
/** Main -> Renderer: one event of a running run, as it is appended. */
export const HARNESS_EREIGNIS = 'harness:ereignis' as const
export const WINDOW_OPEN_HARNESS = 'window:open-harness' as const
```

`HARNESS_EREIGNIS` in die `MainToRendererChannel`-Union, die vier uebrigen in
`RendererToMainChannel`.

- [ ] **Step 4: Write `src/shared/harness-types.ts`**

```ts
/**
 * harness-types — what crosses the IPC boundary.
 *
 * Deliberately narrow: the renderer sees events, never a provider, never an endpoint, never a
 * capability row. What it displays comes out of the event stream (M8 section 4.11).
 */

export interface HarnessEreignis {
  laufId: string
  seq: number
  ts: string
  art: string
  nutzlast: Record<string, unknown>
}

export interface LaufStartWunsch {
  auftragstext: string
  modellId: string
  wurzel: string
  anhaenge?: string[]
}

export type HarnessAntwort<T> =
  | { ok: true; wert: T }
  | { ok: false; meldung: string }
```

- [ ] **Step 5: Write `src/main/harness-handlers.ts`**

```ts
/**
 * harness-handlers — the harness's IPC surface.
 *
 * It lives *outside* src/main/harness/ on purpose. settings/handlers.ts imports electron from
 * inside its feature directory, and copying that here would mean an exception in the guard test
 * that checks the core knows no Electron. An exception list is how a guard quietly stops
 * guarding — this project had that exact failure this month. So the rule stays "no module under
 * src/main/harness/ imports electron", with no addendum, and the surface lives here.
 *
 * Both rules of the settings handlers hold: validate in main, never trust the renderer; and
 * broadcast through event-bus, never through a captured BrowserWindow.
 */

import { ipcMain, app } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { statSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import {
  HARNESS_LAUF_STARTEN, HARNESS_LAUF_LESEN, HARNESS_LAUF_ABBRECHEN, HARNESS_EREIGNIS,
} from '../shared/ipc-channels'
import type { HarnessAntwort, HarnessEreignis, LaufStartWunsch } from '../shared/harness-types'
import { broadcast } from './event-bus'
import { resolveBetterSqliteBinding } from './graph/native-binding'
import { eintragNachId } from './model/registry'
import type { ModellEintrag } from './model/entry'
import { assemblePraefixTeile } from './harness-praefix-quelle'
import {
  starteLauf, oeffneHarnessDb, lesen, laufIds,
  WerkzeugRegistry, DATEI_WERKZEUGE, GRAPH_WERKZEUGE,
} from './harness'
import type { AppServices } from './service-lifecycle'

let db: ReturnType<typeof oeffneHarnessDb> | null = null
const abbruchmarken = new Set<string>()

function harnessDb(): ReturnType<typeof oeffneHarnessDb> {
  if (!db) {
    db = oeffneHarnessDb(
      join(app.getPath('userData'), 'harness.db'),
      resolveBetterSqliteBinding(join(app.getAppPath(), 'node_modules', 'better-sqlite3')),
    )
  }
  return db
}

function fehler(err: unknown): HarnessAntwort<never> {
  return { ok: false, meldung: err instanceof Error ? err.message : String(err) }
}

export function registerHarnessHandlers(services: AppServices): void {
  ipcMain.handle(HARNESS_LAUF_STARTEN, async (_e, roh: unknown): Promise<HarnessAntwort<string>> => {
    try {
      const w = roh as LaufStartWunsch
      if (!w || typeof w.auftragstext !== 'string' || w.auftragstext.trim() === '') {
        return { ok: false, meldung: 'Der Auftrag ist leer.' }
      }
      if (typeof w.modellId !== 'string' || w.modellId === '') {
        return { ok: false, meldung: 'Es ist kein Modell gewaehlt.' }
      }
      if (typeof w.wurzel !== 'string' || !statSync(w.wurzel).isDirectory()) {
        return { ok: false, meldung: `Die Wurzel '${String(w.wurzel)}' ist kein Verzeichnis.` }
      }

      const eintrag = eintragNachId(w.modellId)
      if (!eintrag) return { ok: false, meldung: `Kein Registry-Eintrag '${w.modellId}'.` }

      // Minted here, not inside starteLauf: the abort mark is keyed by it, and a run that
      // cannot be cancelled during its first turn is a run that cannot be cancelled.
      const laufId = randomUUID()
      await starteLauf(
        {
          auftragstext: w.auftragstext,
          modellId: w.modellId,
          wurzel: w.wurzel,
          anhaenge: Array.isArray(w.anhaenge) ? w.anhaenge : undefined,
          budgets: { runden: 12, wanduhrMs: 900_000, kostenCent: 200, kontextAnteil: 0.8 },
        },
        {
          db: harnessDb(),
          eintrag,
          praefixTeile: assemblePraefixTeile(w.auftragstext),
          wache: {
            wurzel: w.wurzel,
            heim: homedir(),
            userDataPfad: app.getPath('userData'),
          },
          graphDb: services.graphDb,
          registry: new WerkzeugRegistry([...DATEI_WERKZEUGE, ...GRAPH_WERKZEUGE]),
          strom: (ev) => broadcast(HARNESS_EREIGNIS, ev as HarnessEreignis),
          uhr: () => Date.now(),
          abgebrochen: () => abbruchmarken.has(laufId),
          sende: sendeUeberTransport(eintrag),
        },
        laufId,
      )
      return { ok: true, wert: laufId }
    } catch (err) {
      return fehler(err)
    }
  })

  ipcMain.handle(HARNESS_LAUF_LESEN, (_e, laufId: unknown): HarnessAntwort<HarnessEreignis[]> => {
    try {
      if (typeof laufId !== 'string' || laufId === '') {
        // No argument means "which runs exist" — the run list is a projection too.
        return { ok: true, wert: laufIds(harnessDb()).map(id => ({
          laufId: id, seq: 0, ts: '', art: 'lauf', nutzlast: {},
        })) }
      }
      return { ok: true, wert: lesen(harnessDb(), laufId) as HarnessEreignis[] }
    } catch (err) {
      return fehler(err)
    }
  })

  ipcMain.handle(HARNESS_LAUF_ABBRECHEN, (_e, laufId: unknown): HarnessAntwort<true> => {
    if (typeof laufId !== 'string' || laufId === '') {
      return { ok: false, meldung: 'Es ist kein Lauf genannt.' }
    }
    // The mark is read at the turn boundary. A request in flight is not cut off — see spec 9.1.
    abbruchmarken.add(laufId)
    return { ok: true, wert: true }
  })
}
```

Dazu zwei kleine Hilfen, die dieselbe Datei traegt:

```ts
/**
 * The transport, wired to the codec. The loop hands over the wire body and gets blocks back —
 * it never learns which of the three clients answered.
 */
function sendeUeberTransport(eintrag: ModellEintrag) {
  return async (koerper: unknown): Promise<import('./harness').ModelAntwort> => {
    const { toModelEndpoint } = await import('./model/entry')
    const { clientForEndpoint } = await import('./worker/model-client')
    const { codecFuer } = await import('./harness')
    const endpunkt = toModelEndpoint(eintrag.erreichbarkeit, eintrag.faehigkeiten?.codec)
    const roh = await clientForEndpoint(endpunkt).chat({ koerper, endpoint: endpunkt })
    return codecFuer(eintrag.faehigkeiten!.codec).fromWire(roh)
  }
}
```

- [ ] **Step 6: Write `src/main/harness-praefix-quelle.ts`**

```ts
/**
 * harness-praefix-quelle — where the stable prefix's sections come from.
 *
 * Separate from the handlers because it is the seam to the preset layer: today it hands over a
 * plain body and the house rules, later it hands over an entity's assembled body, capabilities
 * and persona. Keeping it a named function means that later change touches one file.
 */

import type { PraefixTeile } from './harness'

const BODY =
  'Du arbeitest in einem Projektverzeichnis und beantwortest die Frage, die im Auftrag steht. ' +
  'Du kannst lesen, suchen und den Knowledge-Graph abfragen. Du kannst nichts schreiben und ' +
  'nichts ausfuehren.'

const REGELN = [
  'Belege schlagen Behauptungen: Nenne Datei und Zeile, wenn du etwas ueber den Code sagst.',
  'Wenn ein Werkzeug abgelehnt wird, nenne die Ablehnung in deiner Antwort statt sie zu umgehen.',
  'Was du nicht geprueft hast, sagst du nicht.',
].join('\n')

export function assemblePraefixTeile(auftragstext: string): PraefixTeile {
  return {
    body: BODY,
    capabilities: '',
    persona: '',
    globaleRegeln: `## Regeln\n\n${REGELN}`,
    auftragstext,
  }
}
```

- [ ] **Step 7: Add `createHarnessWindow` to `window-manager.ts`**

Wortgleich zu `createSettingsWindow`, drei Unterschiede: Groesse, Titel-Datei, Kommentar.

```ts
/**
 * The harness window. Mirrors the settings window on purpose — that pattern was built and
 * proved in the running app, and a new SessionGrid cell type would be the route the M6 addendum
 * just cleared away (NanoClawChannelCell entfaellt ersatzlos).
 */
export function createHarnessWindow(_services: AppServices): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 760,
    minHeight: 560,
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
    win.loadURL(`${url}/windows/harness-window.html`).catch(() => {
      console.warn('[window-manager] /windows/ path failed, trying root-level')
      win.loadURL(`${url}/harness-window.html`).catch((err: Error) =>
        console.error('[window-manager] harness-window load failed:', err.message)
      )
    })
  } else {
    win.loadFile(join(__dirname, '../renderer/windows/harness-window.html'))
  }

  return win
}
```

- [ ] **Step 8: Wire the window and the handlers in `ipc-handlers.ts`**

Neben `WINDOW_OPEN_SETTINGS`, im selben Muster:

```ts
  ipcMain.handle(WINDOW_OPEN_HARNESS, () => {
    if (!activeHarnessWindow || activeHarnessWindow.isDestroyed()) {
      activeHarnessWindow = createHarnessWindow(services)
      registerWindow(activeHarnessWindow)
      activeHarnessWindow.on('closed', () => {
        activeHarnessWindow = null
      })
    } else {
      activeHarnessWindow.focus()
    }
    return { ok: true }
  })

  registerHarnessHandlers(services)
```

Dazu `let activeHarnessWindow: BrowserWindow | null = null` neben den anderen Fensterhaltern und
die drei Importe. `registerWindow` ist hier noetig und beim Settings-Fenster nicht: Nur dieses
Fenster empfaengt einen Broadcast.

- [ ] **Step 9: Add the renderer entry in `electron.vite.config.ts`**

```ts
          'harness-window': resolve(__dirname, 'src/renderer/windows/harness-window.html')
```

- [ ] **Step 10: Write `harness-window.html`**

Wortgleich zu `settings-window.html`, mit drei Aenderungen: `<title>cipher keel — Harness</title>`,
`src="./harness-window.tsx"`, und ein zusaetzlicher Stilblock fuer die Ereignisliste:

```html
      /* The event list scrolls and its text must be selectable — a prompt is evidence. */
      pre,
      code {
        user-select: text;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: inherit;
      }
```

- [ ] **Step 11: Write `EreignisPanel.tsx`**

```tsx
/**
 * EreignisPanel — one line per event, expandable.
 *
 * It knows no provider name. What it shows comes out of the event stream, which is exactly the
 * acceptance M8 section 10 asks for: the renderer displays the run without knowing who answered.
 */
import { useState } from 'react'
import type { HarnessEreignis } from '../../../shared/harness-types'

const FARBE: Record<string, string> = {
  'run.started': '#7aa2f7',
  'prompt.sent': '#565f89',
  'model.answered': '#9ece6a',
  'tool.intent': '#e0af68',
  'tool.completed': '#73daca',
  'tool.failed': '#f7768e',
  'tool.schema_loaded': '#bb9af7',
  'budget.warned': '#ff9e64',
  'run.finished': '#7dcfff',
}

function kurzfassung(e: HarnessEreignis): string {
  const n = e.nutzlast
  switch (e.art) {
    case 'run.started': return `${String(n.modellId)} · Codec ${String(n.codec)} · ${(n.werkzeuge as string[] ?? []).length} Werkzeuge`
    case 'prompt.sent': return `${String(n.text ?? '').length} Zeichen (Zug ${String(n.zug)})`
    case 'model.answered': return `${(n.bloecke as unknown[] ?? []).length} Bloecke · stop ${String((n.stopGrund as { roh?: string })?.roh ?? '')}`
    case 'tool.intent': return `${String(n.name)} (${String(n.aufrufId)})`
    case 'tool.completed': return `${String(n.name)} ok`
    case 'tool.failed': return `${String(n.name)}: ${String(n.meldung)}`
    case 'tool.schema_loaded': return String(n.name)
    case 'budget.warned': return String(n.grund)
    case 'run.finished': return `${String(n.endzustand)} / ${String(n.grund)}`
    default: return ''
  }
}

export function EreignisPanel({ ereignisse }: { ereignisse: HarnessEreignis[] }): JSX.Element {
  const [offen, setOffen] = useState<number | null>(null)
  if (ereignisse.length === 0) {
    return <p style={{ padding: 16, color: '#565f89' }}>Noch kein Lauf.</p>
  }
  return (
    <div style={{ overflowY: 'auto', flex: 1, padding: 8 }}>
      {ereignisse.map(e => (
        <div key={`${e.laufId}-${e.seq}`} style={{ marginBottom: 2 }}>
          <button
            onClick={() => setOffen(offen === e.seq ? null : e.seq)}
            style={{
              display: 'flex', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer',
              background: 'transparent', border: 'none', color: '#e0e0e0', font: 'inherit', padding: '2px 4px',
            }}
          >
            <span style={{ color: '#414868', minWidth: 28 }}>{e.seq}</span>
            <span style={{ color: FARBE[e.art] ?? '#e0e0e0', minWidth: 160 }}>{e.art}</span>
            <span style={{ color: '#a9b1d6' }}>{kurzfassung(e)}</span>
          </button>
          {offen === e.seq && (
            <pre style={{ background: '#16161e', padding: 8, margin: '4px 0 8px 40px', fontSize: 12 }}>
              {JSON.stringify(e.nutzlast, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 12: Write `harness-window.tsx`**

```tsx
/**
 * harness-window.tsx — React root for the harness window.
 *
 * Four channels, four callers, and nothing else. The file picker is deliberately plain: taking
 * a file by drag&drop or pasting a screenshot is surface work for a later stretch, but the path
 * has to reach the core now, or the canonical form's image and document blocks would sit in the
 * repo with nothing producing them.
 */
import { StrictMode, useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  HARNESS_LAUF_STARTEN, HARNESS_LAUF_LESEN, HARNESS_LAUF_ABBRECHEN, HARNESS_EREIGNIS,
} from '../../shared/ipc-channels'
import type { HarnessAntwort, HarnessEreignis } from '../../shared/harness-types'
import { EreignisPanel } from '../components/harness/EreignisPanel'

const api = () => window.cipherKeel

function Fenster(): JSX.Element {
  const [auftrag, setAuftrag] = useState('')
  const [modellId, setModellId] = useState('')
  const [wurzel, setWurzel] = useState('')
  const [anhaenge, setAnhaenge] = useState<string[]>([])
  const [laufId, setLaufId] = useState<string | null>(null)
  const [ereignisse, setEreignisse] = useState<HarnessEreignis[]>([])
  const [meldung, setMeldung] = useState<string | null>(null)

  useEffect(() => {
    // Live events for the running run.
    return api().on(HARNESS_EREIGNIS, (_ev, e) => {
      const ereignis = e as HarnessEreignis
      setEreignisse(alt => (alt.length > 0 && alt[0].laufId !== ereignis.laufId ? [ereignis] : [...alt, ereignis]))
    })
  }, [])

  const starten = useCallback(async () => {
    setMeldung(null)
    setEreignisse([])
    const a = await api().invoke(HARNESS_LAUF_STARTEN, {
      auftragstext: auftrag, modellId, wurzel, anhaenge,
    }) as HarnessAntwort<string>
    if (a.ok) setLaufId(a.wert)
    else setMeldung(a.meldung)
  }, [auftrag, modellId, wurzel, anhaenge])

  const nachlesen = useCallback(async (id: string) => {
    const a = await api().invoke(HARNESS_LAUF_LESEN, id) as HarnessAntwort<HarnessEreignis[]>
    if (a.ok) setEreignisse(a.wert)
    else setMeldung(a.meldung)
  }, [])

  const abbrechen = useCallback(async () => {
    if (!laufId) return
    const a = await api().invoke(HARNESS_LAUF_ABBRECHEN, laufId) as HarnessAntwort<true>
    if (!a.ok) setMeldung(a.meldung)
  }, [laufId])

  const anhangWaehlen = useCallback(() => {
    const feld = document.createElement('input')
    feld.type = 'file'
    feld.multiple = true
    feld.onchange = () => {
      // Electron exposes the absolute path on a File; the main process reads it.
      const pfade = Array.from(feld.files ?? []).map(f => (f as File & { path: string }).path)
      setAnhaenge(pfade)
    }
    feld.click()
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: 12, borderBottom: '1px solid #1f2335', display: 'grid', gap: 8 }}>
        <textarea
          value={auftrag} onChange={e => setAuftrag(e.target.value)} rows={3}
          placeholder="Auftrag — etwa: Sieh dir src/main/model/ an und sag, wer warnungen() aufruft."
          style={{ background: '#16161e', color: '#e0e0e0', border: '1px solid #292e42', padding: 8 }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={modellId} onChange={e => setModellId(e.target.value)} placeholder="Modell-Id aus der Registry"
            style={{ background: '#16161e', color: '#e0e0e0', border: '1px solid #292e42', padding: 6, flex: 1 }}
          />
          <input
            value={wurzel} onChange={e => setWurzel(e.target.value)} placeholder="Projektwurzel"
            style={{ background: '#16161e', color: '#e0e0e0', border: '1px solid #292e42', padding: 6, flex: 2 }}
          />
          <button onClick={anhangWaehlen}>Anhaenge ({anhaenge.length})</button>
          <button onClick={starten}>Starten</button>
          <button onClick={abbrechen} disabled={!laufId}>Abbrechen</button>
          <button onClick={() => laufId && nachlesen(laufId)} disabled={!laufId}>Nachlesen</button>
        </div>
        {meldung && <p style={{ color: '#f7768e' }}>{meldung}</p>}
      </div>
      <EreignisPanel ereignisse={ereignisse} />
    </div>
  )
}

createRoot(document.getElementById('app')!).render(<StrictMode><Fenster /></StrictMode>)
```

- [ ] **Step 13: Add the click path in `ProjectView.tsx`**

Neben dem vorhandenen Einstellungen-Knopf, im selben Muster:

```tsx
        <button onClick={() => window.cipherKeel.invoke(WINDOW_OPEN_HARNESS)}>Harness</button>
```

Dazu `WINDOW_OPEN_HARNESS` in die Importliste der Kanaele.

- [ ] **Step 14: Run the guard test to verify it passes**

Run: `npx vitest run tests/harness/ipc-kanaele.test.ts`
Expected: PASS, 3 Tests — vier Kanaele, jeder mit Aufrufer und Handler

- [ ] **Step 15: Full check and commit**

```bash
npm test && npm run typecheck && npm run lint
git add src/shared/ src/main/harness-handlers.ts src/main/harness-praefix-quelle.ts src/main/window-manager.ts src/main/ipc-handlers.ts electron.vite.config.ts src/renderer/ tests/harness/ipc-kanaele.test.ts
git commit -m "feat(harness): vier IPC-Kanaele, das Fenster und das Ereignis-Panel"
```

---

### Task 14: Die restlichen Wächtertests und der Dokumenten-Nachzug

**Files:**
- Create: `tests/harness/waechter-kern.test.ts`
- Modify: `docs/anpassbare-flaechen.md`
- Modify: `tests/docs/anpassbare-flaechen.test.ts`
- Modify: `src/main/worker/c-worker.ts` (Kommentar)

**Interfaces:**
- Consumes: alles Vorherige
- Produces: nichts Neues — diese Aufgabe haelt fest, was die anderen gebaut haben

- [ ] **Step 1: Write the failing guard tests**

```ts
// tests/harness/waechter-kern.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { oeffneHarnessDb, anhaengen, lesen } from '../../src/main/harness/protokoll'
import { projiziere } from '../../src/main/harness/projektion'
import { baueStabilenTeil } from '../../src/main/harness/praefix'

const HARNESS = join(__dirname, '..', '..', 'src', 'main', 'harness')

function harnessDateien(): string[] {
  return readdirSync(HARNESS, { recursive: true, encoding: 'utf-8' })
    .filter(p => p.endsWith('.ts'))
    .map(p => join(HARNESS, p))
}

describe('Waechter: der Kern kennt Electron nicht', () => {
  it('kein Modul unter src/main/harness/ importiert electron — ohne Ausnahmeliste', () => {
    const schuldige = harnessDateien().filter(p => {
      const q = readFileSync(p, 'utf-8')
      return /from\s+['"]electron['"]/.test(q) || /require\(['"]electron['"]\)/.test(q)
    })
    expect(schuldige).toEqual([])
  })

  it('findet ueberhaupt Module, damit ein leeres Verzeichnis den Waechter nicht gruen faerbt', () => {
    expect(harnessDateien().length).toBeGreaterThan(10)
  })
})

describe('Waechter: der Praefix ist rekonstruierbar', () => {
  it('die Projektion aus dem Protokoll ist zeichengleich mit prompt.sent', () => {
    const db = oeffneHarnessDb(':memory:')
    const teile = {
      body: 'BODY', capabilities: 'CAP', persona: 'PERS',
      globaleRegeln: 'REGELN', auftragstext: 'auftrag',
    }
    const stummel = [{ name: 'datei_lesen', beschreibung: 'Liest eine Datei.' }]
    const gesendet = baueStabilenTeil(teile, stummel)
    anhaengen(db, 'l', 'prompt.sent', { text: gesendet })

    // Rebuilt from the parts, compared against what actually went over the wire — that is only
    // a check because prompt.sent stores the text literally rather than a reconstruction.
    const nachgebaut = baueStabilenTeil(teile, stummel)
    const abgelegt = String(lesen(db, 'l')[0].nutzlast.text)
    expect(nachgebaut).toBe(abgelegt)
  })
})

describe('Waechter: kein Effekt ohne Intent', () => {
  it('vor jedem Abschluss steht ein Intent mit derselben Aufruf-Id', () => {
    const db = oeffneHarnessDb(':memory:')
    anhaengen(db, 'l', 'tool.intent', { aufrufId: 'c1', name: 'datei_lesen' })
    anhaengen(db, 'l', 'tool.completed', { aufrufId: 'c1', name: 'datei_lesen', inhalt: [] })

    const ereignisse = lesen(db, 'l')
    const gesehen = new Set<string>()
    for (const e of ereignisse) {
      if (e.art === 'tool.intent') gesehen.add(String(e.nutzlast.aufrufId))
      if (e.art === 'tool.completed' || e.art === 'tool.failed') {
        expect(gesehen.has(String(e.nutzlast.aufrufId))).toBe(true)
      }
    }
  })

  it('ein Abschluss ohne Intent faellt auf', () => {
    const db = oeffneHarnessDb(':memory:')
    anhaengen(db, 'l', 'tool.completed', { aufrufId: 'c9', inhalt: [] })
    const ereignisse = lesen(db, 'l')
    const gesehen = new Set(ereignisse.filter(e => e.art === 'tool.intent').map(e => String(e.nutzlast.aufrufId)))
    expect(gesehen.has('c9')).toBe(false)
  })
})

describe('Waechter: der Vertrag bleibt an den Aussenkanten', () => {
  it('weder die Zug-Funktion noch ein Codec noch ein Werkzeug sieht pflichtfelder', () => {
    // M8 4.9 wants no required field to be able to shape an answer before it is thought. The
    // Auftrag carries them because it *is* the outer edge; one level down nothing may.
    const erlaubt = [join(HARNESS, 'lauf.ts')]
    const schuldige = harnessDateien()
      .filter(p => !erlaubt.includes(p))
      .filter(p => readFileSync(p, 'utf-8').includes('pflichtfelder'))
    expect(schuldige).toEqual([])
  })

  it('in lauf.ts steht pflichtfelder nur im Auftrag und im Abschluss', () => {
    const q = readFileSync(join(HARNESS, 'lauf.ts'), 'utf-8')
    const zeilen = q.split('\n').map((z, i) => [i + 1, z] as const)
      .filter(([, z]) => z.includes('pflichtfelder'))
    // Auftrag declaration, the call in `fahre`, the parameter and use in `beende`. If a fifth
    // appears, something inside the loop started reading it.
    expect(zeilen.length).toBeLessThanOrEqual(6)
    expect(q).not.toMatch(/toWire\([^)]*pflichtfelder/)
  })
})

describe('Waechter: der Verlauf traegt keine Drahtform', () => {
  it('die Projektion enthaelt keinen anbieterspezifischen Bezeichner', () => {
    const verlauf = projiziere([
      { laufId: 'l', seq: 1, ts: 't', art: 'run.started', nutzlast: { auftragstext: 'a' } },
      { laufId: 'l', seq: 2, ts: 't', art: 'model.answered', nutzlast: { bloecke: [{ art: 'text', text: 'b' }] } },
    ])
    const text = JSON.stringify(verlauf)
    for (const fremd of ['tool_use', 'tool_calls', 'image_url', 'finish_reason', 'stop_reason']) {
      expect(text).not.toContain(fremd)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they pass or name a real gap**

Run: `npx vitest run tests/harness/waechter-kern.test.ts`
Expected: PASS, 8 Tests. Faellt einer, ist das ein Befund an den vorherigen Aufgaben, kein Anlass,
den Waechter abzuschwaechen.

- [ ] **Step 3: Add the price table to the inventory**

In `docs/anpassbare-flaechen.md`, im selben Format wie die Bestandseintraege:

```markdown
### `harness.preise` — die Preistabelle der Kostenrechnung

**Wo:** gebuendelte Vorgabe in `src/main/harness/preise.ts`, ueberschreibbar in der Config.
**Wer liest sie:** `harness/budget.ts` nach jeder Antwort, fuer das Kostenbudget.
**Wirkung einer Aenderung:** sofort, beim naechsten Lauf.
**Warum sie anpassbar sein muss:** Preise aendern sich schneller als Releases. Ein Stand von
gestern liesse das Kostenbudget an der falschen Stelle anschlagen — und der Abschlussgrund nennt
den Tabellenstand mit, damit die Unsicherheit sichtbar bleibt statt weggeglaettet zu werden
(M8 §4.8).
**Was sie nicht kann:** ein unbekanntes Modell kostet null statt einer Schaetzung. Ein geratener
Preis, der einen Lauf abbricht, sieht aus wie eine Messung.
```

- [ ] **Step 4: Extend the inventory test**

In `tests/docs/anpassbare-flaechen.test.ts` den neuen Eintrag festnageln — im Muster der
vorhandenen Faelle:

```ts
  it('fuehrt die Preistabelle des Harnesses', () => {
    expect(inventar).toContain('harness.preise')
    expect(inventar).toContain('src/main/harness/preise.ts')
  })
```

- [ ] **Step 5: Correct the false comment in `c-worker.ts`**

Der Kommentar „three niveaus are three runtimes" widerspricht der Preset-Schicht und ist seit dem
M6-Nachtrag falsch. Er wird korrigiert, nicht fortgeschrieben:

```ts
/**
 * Niveau is a capability filter over a role and says nothing about the model; the runtime is a
 * separate choice in the `runtime` field (M8 section 6, ratified 2026-08-16). The earlier
 * shorthand "three niveaus are three runtimes" described the build of August 2026, not the
 * model, and contradicted the preset layer — it is corrected here rather than carried forward.
 *
 * This worker stays what it is: stateless, tool-less, one shot. That is its quality, which is
 * why the harness loop stands beside it rather than in its place.
 */
```

- [ ] **Step 6: Decide on `RUNTIMES_WITHOUT_ADAPTER`**

`src/main/agent/registry.ts` fuehrt `keel-harness` in `RUNTIMES_WITHOUT_ADAPTER`. Nach dieser
Strecke gibt es eine Schleife, aber keinen Adapter, der eine *Session* darueber startet — Tiers
und Rollen fahren weiter ueber `fremdes-cli` und `ein-schuss`.

**Der Eintrag bleibt also stehen**, und der Kommentar daneben wird praezisiert, damit die naechste
Sitzung nicht denselben Halbsatz erneut pruefen muss:

```ts
  // The own loop exists since the harness stretch of 2026-08-18, but no adapter starts a session
  // through it: that needs writing tools and a shell, which travel with the sandbox. Until then
  // 'keel-harness' is a known runtime without a live adapter, and no slot in model/slots.ts
  // offers it — a slot before its adapter would be a surface for a dummy.
```

Faellt in der naechsten Strecke der Adapter, faellt dieser Eintrag mit ihm.

- [ ] **Step 7: Full check and commit**

```bash
npm test && npm run typecheck && npm run lint
git add tests/harness/waechter-kern.test.ts docs/anpassbare-flaechen.md tests/docs/anpassbare-flaechen.test.ts src/main/worker/c-worker.ts src/main/agent/registry.ts
git commit -m "test(harness): die restlichen Waechter, Inventareintrag, zwei Kommentare korrigiert"
```

---

### Task 15: Das Messprotokoll — die eigentliche Abnahme

**Files:**
- Modify: `docs/superpowers/plans/2026-08-18-harness-kern.md` (dieser Plan, Abschnitt `## Messprotokoll 2026-08-18`)

**Interfaces:**
- Consumes: die laufende App
- Produces: elf Belege, wörtlich

> **Gruene Tests sagen in diesem Repo ueber eine Verdrahtung nichts aus.** Diese Aufgabe ist die
> Abnahme, nicht ihre Zusammenfassung. Jeder Beleg wird **woertlich** nachgetragen — Kommando,
> Beobachtung, Ergebnis —, und jeder mit **gueltiger und ungueltiger** Eingabe, damit auch das
> laute Scheitern belegt ist und nicht nur der Erfolg.

- [ ] **Step 1: Check that nothing is still running**

```bash
tmux list-sessions
ps aux | grep -i "[c]ipher-keel"
```

Eine zweite Instanz teilt sonst Config und Datenbank. Was laeuft, wird beendet, bevor der Messlauf
beginnt.

- [ ] **Step 2: Prepare three registry entries**

Ueber das Settings-Fenster, nicht ueber die Config-Datei — das ist zugleich eine Probe auf
CK-NFR-012:

- einen `api`-Eintrag mit `codec: 'anthropic'` auf `https://api.anthropic.com/v1`
- einen `api`-Eintrag mit `codec: 'openai-chat'` auf einen Hoster
- einen `local-http`-Eintrag mit `codec: 'openai-chat'` auf den Spark (`100.78.7.108:11434`)

Fuer Beleg 3 zusaetzlich ein Eintrag mit `bilder: false`.

- [ ] **Step 3: Run the eleven proofs**

Gestartet wird ueber den Klickpfad aus dem Projektfenster:

```bash
.claude/skills/run-keel/launch.sh /tmp/keel-harness
```

1. Lauf ohne Werkzeugaufruf gegen ein echtes Modell → vollstaendige Ereignisfolge im Panel, ohne
   Anbieternamen in der Darstellung. **Ungueltig:** leerer Auftrag → benannte Ablehnung.
2. Derselbe Auftrag gegen alle drei Eintraege → dreimal vertragsgemaess; der Unterschied liegt
   nachweislich nur in der Faehigkeitszeile. **Ungueltig:** ein Eintrag mit `codec: 'text'` →
   Lauf startet nicht, Meldung nennt den Codec.
3. Auftrag mit angehaengtem Bild und angehaengter Datei gegen zwei Anbieter; der dritte
   (`bilder: false`) meldet Unvermoegen ausdruecklich. **Ungueltig:** ein Anhangpfad, den es nicht
   gibt → Lauf startet nicht, Meldung nennt den Pfad.
4. „Sieh dir `src/main/model/` an und sag, welche Datei die Warnregeln haelt und wer sie aufruft."
   → mehrere Werkzeugaufrufe, ein belegter Befund. **Ungueltig:** Auftrag mit einem Werkzeugnamen,
   den es nicht gibt → `tool.failed` nennt ihn, der Lauf laeuft weiter.
5. `werkzeug_schema` wird geholt → `tool.schema_loaded` im Panel; das Schema steht im Verlauf, und
   der stabile Praefix ist zeichengleich wie vorher (beide `prompt.sent` im Panel aufklappen und
   vergleichen).
6. Ein Aufruf auf einen Pfad ausserhalb der Wurzel, einer auf `~/.ssh` und einer auf ein `.env`
   **innerhalb** der Wurzel → alle drei abgelehnt, Lauf laeuft weiter, das Modell reagiert.
7. Ein Symlink in der Wurzel, der nach aussen zeigt:
   ```bash
   ln -s ~/.ssh /tmp/keel-harness-projekt/abkuerzung
   ```
   → Aufruf auf `abkuerzung/id_rsa` wird abgelehnt.
8. Prozess **mitten in einem Werkzeugaufruf** hart beenden (`kill -9`), App neu starten, Lauf
   fortsetzen → der offene Intent erscheint als „Ausfuehrung unbekannt"; kein Werkzeug laeuft ein
   zweites Mal.
9. Zweiter Lauf mit demselben Auftrag → Cache-Treffer, in den Usage-Feldern von `model.answered`
   sichtbar.
10. Budget kuenstlich auf zwei Runden → `fertig / runden-erschoepft` mit verwertbarem
    Teilergebnis, keine Ausnahme; ein Werkzeugaufruf im Abschlusszug wird abgelehnt.
11. ```bash
    KEEL_KEEP_PROFILE=1 .claude/skills/run-keel/launch.sh /tmp/keel-harness
    ```
    → Start mit vorhandener Konfiguration und vorhandener `harness.db`; die Laeufe der vorigen
    Sitzung sind ueber `Nachlesen` erreichbar.

**Der Fehlerpfad wird absichtlich erzwungen** statt auf einen Zufallsfehler gewartet, und mit einem
wirklich schwachen Modell belegt — ein starkes haette ihn nie gezeigt.

- [ ] **Step 4: Write the protocol into this file**

Abschnitt `## Messprotokoll 2026-08-18` ans Ende dieses Plans, je Beleg: was getan wurde, was
beobachtet wurde, und ob es der Erwartung entsprach. **Ein Beleg, der aus dem falschen Grund
besteht, ist teurer als ein fehlender** — er sieht aus wie eine Absicherung. Wo die Beobachtung
weniger trug als erwartet, wird das so aufgeschrieben.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-08-18-harness-kern.md
git commit -m "docs(plan): Messprotokoll -- elf Belege aus der laufenden App"
```

---

## Messprotokoll 2026-08-19

Ausgefuehrt gegen `harness-kern`, HEAD `3e3d8b2`, Baum sauber, 2196 Tests gruen. Umfang: acht der
elf Belege aus Task 15 — die drei, die einen externen Anbieter brauchen (Anthropic-API,
API-Hoster; Punkte 1-3 der urspruenglichen Aufzaehlung oben) kosten Geld und schicken Prompts nach
draussen und sind **ausdruecklich nicht** Teil dieses Laufs; der Nutzer gibt sie separat frei. Die
Nummerierung unten folgt dem tatsaechlichen Auftrag (acht Belege), nicht der Liste in Step 3 oben.

Werkzeug: `run-keel`-Skill (`launch.sh`, `driver.mjs`, `stop.sh`). Vor dem Start: `tmux
list-sessions` zeigte nur `cmux-cipher-grow-kit-ryz0` und `cmux-debugger-xp3g` — beides fremde
Multiplexer-Sitzungen (keel selbst legt `cipher-keel-control` an, nicht `cmux-*`), `ps aux | grep
cipher-keel` war leer. Keine zweite Instanz im Weg.

Profil: `/tmp/keel-harness` (frisch gestartet). Projektwurzel fuer alle Laeufe:
`/tmp/keel-harness-projekt`, eine Kopie von `src/main/model/*.ts` aus diesem Repo plus einer
`.env`-Datei mit einem Fake-Secret, angelegt eigens fuer die Pfadwache- und Symlink-Proben.

### Vorbereitung: Fähigkeitszeile über das Settings-Fenster (Beleg 1, Teil 1 — CK-NFR-012)

Die Registry-Vorgabe (`src/main/model/defaults.ts`) traegt `spark-gemma4-26b` und
`spark-gpt-oss-120b` mit `codec: 'ollama-native'`, `werkzeugmodus: 'text'` — beides in dieser
Ausbaustufe nicht gebaut. Das Settings-Fenster geoeffnet (`window:open-settings`), dann
`settings:eintrag-speichern` mit der vollen Fassung beider Eintraege aufgerufen, geaendert nur in
`faehigkeiten.codec: 'openai-chat'` und `faehigkeiten.werkzeugmodus: 'nativ'` (plus
`aufgeschobenesLaden: true`, um `werkzeug_schema` ueberhaupt anzubieten — fuer Beleg 2 gebraucht).

**Ehrlicher Befund zur UI:** `EintragFormular.tsx` hat *kein* Feld fuer die Faehigkeitszeile — sie
wird beim Speichern nur unveraendert durchgereicht (`faehigkeiten: vorlage?.faehigkeiten`). Ein
Mensch kann eine Faehigkeitszeile durch Klicken im sichtbaren Formular nicht anlegen oder aendern.
Was tatsaechlich existiert und geprueft wurde: der IPC-Kanal `settings:eintrag-speichern`, den das
Settings-Fenster selbst benutzt, nimmt ein beliebiges `faehigkeiten`-Objekt entgegen und validiert
es serverseitig ueber `normaliseEintrag` — genau die CK-NFR-012-Eigenschaft ("Config-Aenderungen
laufen validiert durchs Fenster, nicht durch Dateibearbeitung"). Aufgerufen wurde dieser Kanal
ueber `driver.mjs` im offenen Settings-Fenster (`settings-window` als CDP-Ziel), nicht durch
Bearbeiten von `cipher-keel-config.json` direkt. Das ist der ehrliche Mittelweg: durch das Fenster,
aber nicht durch das sichtbare Formular, weil Letzteres die Faehigkeit gar nicht anbietet — eine
Luecke im Formular, kein Umweg um die Schreibvalidierung.

```
window.cipherKeel.invoke('settings:eintrag-speichern', {
  id: 'spark-gemma4-26b', ..., faehigkeiten: { codec: 'openai-chat', werkzeugmodus: 'nativ', ... }
}) → { ok: true }
```
Bestaetigt per `settings:ansicht`: `faehigkeiten.codec === 'openai-chat'`,
`faehigkeiten.werkzeugmodus === 'nativ'`. Die Datei `cipher-keel-config.json` wurde dabei
tatsaechlich veraendert (`grep` bestaetigt den neuen Eintrag), aber als *Folge* des validierten
Schreibkanals, nicht als direkter Edit. Beide Modelle sind ueber den Spark erreichbar (`curl
http://100.78.7.108:11434/v1/models` liefert u.a. `gemma4:26b` und `gpt-oss:120b` mit
`"capabilities":["completion","tools",...]`).

**Ergebnis:** entspricht der Erwartung, mit einer Einschraenkung, die staerker wiegt als eine
Fussnote: die UI-Luecke (kein Formularfeld fuer die Faehigkeitszeile) ist ein echter, unbelegter
Bereich von CK-NFR-012 — die Probe bestand nur, weil der IPC-Kanal direkt angesprochen wurde, nicht
weil ein Mensch das im Fenster hatte klicken koennen.

---

### Beleg 1 — Echte Arbeit gegen den Spark

**Ungueltig, Fall a (`werkzeugmodus: 'text'`):** `harness:lauf-starten` gegen `spark-gpt-oss-120b`
unveraendert (Vorgabe, `werkzeugmodus: 'text'`) mit demselben Auftragstext.
Beobachtet: `{"ok":false,"meldung":"'spark-gpt-oss-120b' braucht das Text-Protokoll fuer
Werkzeuge. Das ist in dieser Ausbaustufe nicht gebaut — es kommt als eigener Codec."}` — Lauf
startet nicht, kein `run.started` im Protokoll.

**Ungueltig, Fall b (`codec: 'text'`):** Scratch-Eintrag `probe-codec-text` angelegt
(`werkzeugmodus: 'nativ'`, `codec: 'text'`, sonst Spark-Zieladresse), Lauf gestartet.
Beobachtet: `{"ok":false,"meldung":"Der Codec 'text' ist in dieser Ausbaustufe nicht gebaut —
verfuegbar sind anthropic und openai-chat."}` — nennt den Codec ausdruecklich, wie gefordert.
Eintrag danach ueber `settings:eintrag-loeschen` wieder entfernt.

**Gueltig:** Auftrag `„Sieh dir src/main/model/ an und sag, welche Datei die Warnregeln haelt und
wer sie aufruft."` gegen `spark-gemma4-26b` (Lauf `c7cc302a-11a5-4788-ba0e-c238626fc5a8`) und
zusaetzlich gegen `spark-gpt-oss-120b` (Lauf `b771f2b7-b27c-4f64-936d-de1467255623`), beide mit
Wurzel `/tmp/keel-harness-projekt`. Vorher per Code-Lesen festgestellter Sollwert: `eignung.ts`
haelt `warnungen()`, `ansicht.ts` ist laut eigenem Kopfkommentar "the only caller of `warnungen` in
the project".

Beobachtet (`c7cc302a`, gemma4:26b): 13 Runden, echte Werkzeugaufrufe gegen den Spark
(`verzeichnis_listen`, `inhalt_suchen`, `werkzeug_schema`, `datei_lesen`-Versuche), darunter ein
organischer `tool.failed` ("Das Feld 'muster' fehlt in der Eingabe.") — der Lauf lief danach
unbeeindruckt weiter, kein Absturz. Endete `fertig / runden-erschoepft`, `ergebnis: ""`.

Beobachtet (`b771f2b7`, gpt-oss:120b): 13 Runden, ebenfalls echte Werkzeugaufrufe
(`verzeichnis_listen`, `inhalt_suchen`, ein `datei_lesen`-Versuch mit falschem Feldnamen `path`
statt `pfad`), endete ebenfalls `fertig / runden-erschoepft`, `ergebnis: ""`; im Abschlusszug
versuchte das Modell trotzdem einen Werkzeugaufruf (`tool.intent` mit leerem `name`), der korrekt
mit `"Der Lauf ist im Abschlusszug — es wird kein Werkzeug mehr ausgefuehrt."` abgelehnt wurde.

**Ergebnis: entspricht der Erwartung nur teilweise, und das steht hier so, weil es wichtiger ist
als ein sauberer Haken.** "Mehrere Werkzeugaufrufe" — klar erfuellt, gegen beide Modelle, echte
Anfragen an den Spark, echte Antworten, echte Ablehnungen samt Weiterlauf. "Ein belegter Befund" —
**nicht erreicht**: keines der beiden Modelle hat `eignung.ts` je gelesen; beide haben wiederholt
mit falsch benannten Feldern geraten (`description` statt `muster`, `path`/`lines` statt
`pfad`/`vonZeile`/`bisZeile`) statt zuverlaessig `werkzeug_schema` zu Rate zu ziehen, und sind ohne
Text-Ergebnis ins Rundenbudget gelaufen. Das ist ein echtes, reproduzierbares Ergebnis ueber diese
beiden schwachen lokalen Modelle in dieser Betriebsart (openai-chat ueber Ollamas `/v1`), keine
Panne der Verdrahtung: jede Ablehnung wurde korrekt gemeldet, der Lauf lief jedes Mal weiter, und
das Budget griff sauber. Es ist trotzdem kein "belegter Befund" im Sinne der Aufgabe, und das wird
hier nicht schoengeredet.

---

### Beleg 2 — `werkzeug_schema` und der stabile Praefix

Innerhalb desselben Laufs `c7cc302a` (kein separater Lauf noetig — das Modell rief
`werkzeug_schema` von selbst auf, Zug 5→6): `tool.schema_loaded` bei `seq 21`, Nutzlast
`{"name":"inhalt_suchen","schema":{...regex, pfadFilter...}}` — steht wortwoertlich im Verlauf.

Verglichen: `prompt.sent` bei `seq 18` (Zug 5, vor dem Schema-Abruf) und `prompt.sent` bei `seq 23`
(Zug 6, danach). Beide Texte am Marker `"## Fortschritt"` geteilt und der Teil davor (der stabile
Teil) zeichenweise verglichen:

```
stableLenBefore: 1376, stableLenAfter: 1376, identical: true
```

Die Gesamtlaenge der beiden `prompt.sent`-Texte wuchs (1468 → 1506 Zeichen) — das ist der volatile
Fortschritts-Abschnitt, der pro erledigtem Werkzeugaufruf eine Zeile ansetzt. Der stabile Teil
selbst blieb zeichengleich, obwohl dazwischen ein volles Schema in den Verlauf geschrieben wurde.

**Ergebnis: entspricht der Erwartung.** Genau die Eigenschaft, die `praefix.ts`s Kopfkommentar
verspricht ("Stubs only... The full schema is fetched on demand" / "no timestamps, no counters...
in [the stable part]") — mit echten Daten aus einem echten Lauf bestaetigt, nicht nur durch Lesen
des Codes angenommen.

---

### Beleg 3 — Pfadwache, drei Faelle

Drei separate, minimale Laeufe gegen `spark-gemma4-26b` (ein kombinierter Lauf mit allen drei
Pfaden in einem Auftrag scheiterte am Modell, das sich auf dem ersten abgelehnten Pfad
festbiss und ihn zehnmal wiederholte, statt zum naechsten weiterzugehen — Lauf `609805eb-...`,
abgebrochen; das war die Grenze des Modells, nicht des Mechanismus).

1. **Ausserhalb der Wurzel** (Lauf `3e5a9833-52b2-41bd-90a1-153cb9970563`): `datei_lesen` mit
   `pfad="/tmp/outside-file.txt"`. Beobachtet: `tool.failed` — `"Pfad liegt ausserhalb der
   Wurzel"`. Modell antwortete danach: *"Der Zugriff auf die Datei schlug fehl, da der Pfad
   außerhalb der Projektwurzel liegt."* Lauf endete `fertig / ziel-erreicht`.
2. **`~/.ssh`** (Lauf `02db2196-6d4a-42bd-9136-05ef73e4e759`): `pfad="/Users/cipher/.ssh/id_rsa"`.
   Beobachtet: `tool.failed` — `"Pfad ist geschuetzt"` (zweimal versucht, dann Text-Antwort).
   Modell: *"Der Versuch, die Datei zu lesen, schlug fehl, da der Pfad geschützt ist."* `fertig /
   ziel-erreicht`.
3. **`.env` innerhalb der Wurzel** (Lauf `fc61d5a5-739d-468d-908f-94dd7d865c62`):
   `pfad="/tmp/keel-harness-projekt/.env"`. Beobachtet: `tool.failed` — `"Pfad ist geschuetzt"`.
   Modell: *"Der Zugriff auf die Datei \".env\" wurde verweigert, da der Pfad geschützt ist."`
   `fertig / ziel-erreicht`.

Alle drei: Lauf lief nach der Ablehnung weiter (kein Absturz, kein haengender Zustand), und das
Modell hat die Ablehnung tatsaechlich in seiner Antwort verarbeitet statt sie zu ignorieren oder zu
umgehen.

**Ergebnis: entspricht der Erwartung**, mit einem Nebenbefund: der kombinierte Lauf (alle drei
Pfade in einem Auftrag) zeigte, dass ein schwaches Modell bei einer wiederholten Ablehnung in eine
Schleife laufen kann, ohne zum naechsten Schritt weiterzugehen — der Mechanismus selbst
(Pfadwache, Fortlauf des Lauf) blieb dabei fehlerfrei; das Problem lag beim Modell, nicht bei der
Wache.

---

### Beleg 4 — Der Symlink-Fall

`ln -s ~/.ssh /tmp/keel-harness-projekt/abkuerzung` angelegt.

**Erster Versuch (Lauf `24cf0536-5d11-4a06-bbfc-8399346aba5a`), relativer Pfad wie im Plan
vorgesehen** (`pfad="abkuerzung/id_rsa"`): abgelehnt mit `"Pfad ist geschuetzt"`. **Das ist aber
kein sauberer Beleg fuer die Symlink-Aufloesung, und das wird hier ausdruecklich vermerkt statt
verschwiegen:** `pfadwache.ts`s `aufloesen()` ruft `resolve(pfad)`, was einen relativen Pfad gegen
`process.cwd()` des Electron-Hauptprozesses aufloest — das ist die Repo-Wurzel dieses Projekts, NICHT
die Lauf-Wurzel `/tmp/keel-harness-projekt`. Ein relativer Pfad wie `abkuerzung/id_rsa` erreicht den
angelegten Symlink also gar nicht; er wird gegen `<Repo-Wurzel>/abkuerzung/id_rsa` aufgeloest (nicht
vorhanden), und die Ablehnung kam stattdessen von der **Verweigerte-Namen-Regel**
(`VERWEIGERTE_NAMEN` matcht `id_rsa` unabhaengig vom Verzeichnis) — richtig abgelehnt, aber aus dem
falschen Grund fuer diesen spezifischen Testzweck. Das ist ein Beleg, der aus dem falschen Grund
besteht, wie die Aufgabenstellung warnt, und wird deshalb nicht als Beweis fuer die
Symlink-Aufloesung gezaehlt.

**Sauberer zweiter Versuch (Lauf `c8000b3c-e769-4bf0-9815-3be396f24697`), absoluter Pfad, Dateiname
ausserhalb der Verweigerungsliste:** `pfad="/tmp/keel-harness-projekt/abkuerzung/known_hosts"` —
`known_hosts` existiert real in `~/.ssh` und matcht keine der Namens-/Endungsregeln in
`pfadwache.ts`. Beobachtet: `tool.failed` — `"Pfad ist geschuetzt"`, zweimal in Folge (Modell
versuchte es zweimal, Lauf lief weiter, dann abgebrochen um Zeit zu sparen — die Ablehnung selbst
war bereits eindeutig bestaetigt). Das zeigt sauber, dass die *Verzeichnis*-Schutzregel
(`istIn(pfad, heim/.ssh)`) auch nach Symlink-Aufloesung greift: `realpathSync` loest den Symlink in
`aufloesen()` auf, bevor die Schutzpruefung laeuft — genau das Verhalten, das der Kopfkommentar von
`pfadwache.ts` verspricht ("provided symlinks are resolved first, which is step one").

**Ergebnis: entspricht der Erwartung, aber erst im zweiten, korrigierten Versuch.** Der erste
Versuch mit dem relativen Pfad haette faelschlich als Beleg fuer Symlink-Aufloesung durchgehen
koennen, war es aber nicht — ein zusaetzlicher, unerwarteter Befund: `datei_lesen` loest relative
Pfade gegen die CWD des Hauptprozesses auf, nicht gegen die Lauf-Wurzel. Ob das eine Luecke ist
(kein im Rahmen dieser Aufgabe beobachteter Modell-Aufruf nutzte je einen relativen Pfad
erfolgreich fuer `datei_lesen` — alle organischen Aufrufe, die ankamen, benutzten absolute Pfade
oder scheiterten an falschen Feldnamen, bevor die Pfadaufloesung ueberhaupt eine Rolle spielte)
oder gewollt ist, ist aus dem Code allein nicht zu entscheiden und wird hier als offene Frage
vermerkt, nicht als entschiedener Fehler.

---

### Beleg 5 — Wiederaufnahme

**Technischer Befund vorab:** ein `kill -9` exakt zwischen `tool.intent` und `tool.completed` liess
sich ueber externe IPC-Poll-Zyklen nicht treffen. Alle registrierten Werkzeuge (`DATEI_WERKZEUGE`,
`GRAPH_WERKZEUGE`) sind synchrone Dateisystem-/SQLite-Operationen ohne echten Async-Punkt zwischen
den beiden Schreibvorgaengen; ein realer Versuch (Lauf `d876743a-...`, echter `kill -9` auf den
Hauptprozess PID 47343 nach mehreren echten Ereignissen) traf tatsaechlich zwischen `prompt.sent`
(Zug 3) und dem zugehoerigen `model.answered` — also mitten im Warten auf das Modell, nicht mitten
in einem Werkzeugaufruf. Das ist selbst ein reales, brauchbares Ergebnis: es zeigt, dass die
schnellste im Code vorhandene Werkzeugausfuehrung schneller ist als jede extern getaktete
Kill-Anweisung.

Um den geforderten Zustand (`tool.intent` ohne `tool.completed`/`tool.failed`, kein
`run.finished`) trotzdem echt zu pruefen, wurde nach dem echten Kill **ein synthetisches
`tool.intent`-Ereignis direkt per `sqlite3`-CLI an das append-only-Log angehaengt**
(`INSERT INTO ereignisse ... seq=12, art='tool.intent', aufrufId='call_synthetic_kill_test',
name='datei_lesen'`) — derselbe Log, dasselbe Schema, kein Umweg um die App. Das bildet exakt den
Zustand nach, den ein echter Absturz mitten in einem (hypothetisch langsameren) Werkzeugaufruf
hinterlassen wuerde. Einschraenkung, offen benannt: dieser Zeile geht in der Datenbank kein
`model.answered` mit passendem `werkzeug-aufruf`-Block voraus (die echte Ursache dafuer war der
Kill mitten im Modell-Request) — strukturell ungewoehnlich fuer einen echten Absturz, aber ohne
Einfluss auf den Mechanismus unter Test: `projiziere()` schliesst offene Intents am Ende des Logs
unabhaengig davon, wo im Log sie stehen.

App neu gestartet mit `KEEL_KEEP_PROFILE=1` (Profil samt `harness.db` erhalten). Lauf-Uebersicht
zeigte `d876743a-...` mit `endzustand: null` — der Lauf ist als "laeuft" / fortsetzbar gelistet.

**Direkter Beleg fuer "Ausfuehrung unbekannt":** die echte Produktionsfunktion `projiziere()` aus
`src/main/harness/projektion.ts` (unveraendert, per `node --experimental-strip-types` direkt aus
dem Quelltext geladen) gegen die realen Ereigniszeilen bis `seq 12` (aus der Datenbank exportiert)
laufen lassen. Ergebnis: der letzte projizierte Nutzer-Block enthaelt

```json
{"art":"werkzeug-ergebnis","aufrufId":"call_synthetic_kill_test",
 "inhalt":[{"art":"text","text":"Ausfuehrung unbekannt, Zustand pruefen. Der Aufruf wurde begonnen,
 sein Ergebnis nicht geschrieben. Stelle den Zustand fest, bevor du weitermachst."}],
 "fehler":true}
```

— wortgleich mit der Erwartung.

Danach ueber `harness:lauf-fortsetzen('d876743a-...')` real fortgesetzt: `{"ok":true,"wert":
"d876743a-..."}`. Der Lauf lief weiter (neue `prompt.sent`/`model.answered`/`tool.intent`-Zyklen ab
`seq 13`). Nachgeprueft per SQL (`WHERE nutzlast LIKE '%call_synthetic_kill_test%'`): **genau eine**
Zeile mit dieser `aufrufId` im gesamten Log, `seq 12`, `art tool.intent` — kein zweiter Aufruf von
`datei_lesen` auf `src/main/model/registry.ts` wurde je ausgefuehrt.

**Ungueltig, Fall a (abgeschlossener Lauf):** `harness:lauf-fortsetzen('3e5a9833-...')` (bereits
`fertig`). Beobachtet: `{"ok":false,"meldung":"Der Lauf '3e5a9833-...' ist bereits
abgeschlossen."}`.

**Ungueltig, Fall b (unbekannte Id):** `harness:lauf-fortsetzen('nicht-existierende-lauf-id-1234')`.
Beobachtet: `{"ok":false,"meldung":"Kein Lauf mit der Id 'nicht-existierende-lauf-id-1234'."}`.

**Ergebnis: entspricht der Erwartung im Kern, mit offen benannter methodischer Abweichung.** Der
Mechanismus selbst — "Ausfuehrung unbekannt" bei offenem Intent, kein zweiter Ausfuehrungsversuch,
benannte Ablehnung fuer beide Ungueltig-Faelle — ist mit echten Aufrufen und der echten
Produktionsfunktion belegt. Der Weg dorthin mischt einen echten `kill -9` (der den erwarteten
Zustand nicht direkt traf) mit einer gezielten, transparent dokumentierten Datenbank-Ergaenzung, die
denselben Zustand herstellt. Wo die Beobachtung weniger trug als die Aufgabenstellung vorsah, steht
das hier so.

---

### Beleg 6 — Cache-Treffer

Derselbe Auftrag (`„Rufe verzeichnis_listen einmal auf mit muster=\"src/main/model/**\", dann
fasse in einem Satz zusammen was du gesehen hast."`) zweimal unabhaengig gegen `spark-gemma4-26b`
gestartet (Laeufe `cfe17f7f-ccee-4b40-a3b6-8b4082a343b9` und
`7d05113f-debe-46c3-ba94-46ceead60f86`), jeweils nach dem ersten `model.answered` abgebrochen.

Beobachtete `usage` des jeweils ersten Zugs:

```
Lauf 1: {"eingabeToken":738,"ausgabeToken":188,"roh":{"prompt_tokens":738,"completion_tokens":188,"total_tokens":926}}
Lauf 2: {"eingabeToken":738,"ausgabeToken":91, "roh":{"prompt_tokens":738,"completion_tokens":91, "total_tokens":829}}
```

`prompt_tokens` ist in beiden Laeufen identisch (738) — konsistent mit einem identischen, stabil
serialisierten Prompt. `completion_tokens` unterscheidet sich, was bei einem generativen Modell mit
Sampling normal ist und nichts ueber Caching aussagt.

**Ergebnis: kein sauberer Beleg — und das wird hier so aufgeschrieben statt behauptet.** Genau die
Warnung aus der Aufgabenstellung trifft zu: Ollamas `/v1/chat/completions`-Antwort (`usage.roh`)
traegt ausschliesslich `prompt_tokens`, `completion_tokens`, `total_tokens` — **kein** Feld, das
einen Cache-Treffer von einem Cache-Miss unterscheidet (anders als z. B. Anthropics
`cache_read_input_tokens` oder OpenAIs `prompt_tokens_details.cached_tokens`). Die identische
Eingabe-Token-Zahl belegt nur, dass beide Anfragen denselben Prompt sahen (erwartet, da derselbe
stabile Teil), nicht, dass die zweite Anfrage tatsaechlich aus einem warmen Cache bedient wurde.
Dieser Beleg bleibt offen.

---

### Beleg 7 — Budget

`STANDARD_BUDGETS.runden` in `src/main/harness-handlers.ts` fuer die Dauer der Probe temporaer von
`12` auf `2` gesetzt (Kommentar `// TEMPORARY for Task 15 acceptance Beleg 7`), App neu gebaut und
mit `KEEL_KEEP_PROFILE=1` neu gestartet, nach der Probe wieder auf `12` zurueckgesetzt und erneut
gebaut — `git diff src/main/harness-handlers.ts` bestaetigt danach keinen Unterschied zum
Ausgangsstand.

Drei Laeufe unter dem 2-Runden-Budget:

- `bbba57dd-ffbd-4972-aecf-f425e7565da4` (gemma4:26b): `budget.warned` zweimal (`runden-erschoepft`,
  `"Das Rundenbudget von 2 Zuegen ist erschoepft..."`), `run.finished` mit `endzustand: "fertig"`,
  `grund: "runden-erschoepft"`, kein `vertrag`-Fehler, keine Ausnahme. Kein Werkzeugaufruf im
  Abschlusszug versucht (Modell fuegte sich). `ergebnis: ""`.
- `ae12b71f-89e4-40b1-b2ca-c37f98ae8628` (gemma4:26b, zweiter Versuch mit staerker
  werkzeug-treibendem Auftrag): gleiches Bild, `ergebnis: ""`, kein Abschlusszug-Werkzeugaufruf.
- `41165479-2b49-42f2-ac87-943b9a29ced0` (gpt-oss:120b): gleiches `fertig / runden-erschoepft`,
  **und** im Abschlusszug versuchte das Modell tatsaechlich `datei_lesen`
  (`pfad="src/main/model/ansicht.ts"`) — abgelehnt mit `"Der Lauf ist im Abschlusszug — es wird
  kein Werkzeug mehr ausgefuehrt."`, danach sofort `run.finished`. `ergebnis: ""`.

**Ergebnis: der Mechanismus entspricht der Erwartung vollstaendig, das versprochene
Teilergebnis nicht — und das ist der eigentliche Befund.** `fertig / runden-erschoepft` ohne
Ausnahme: bestaetigt, dreimal. Werkzeugaufruf im Abschlusszug wird abgelehnt: bestaetigt, einmal
direkt (gpt-oss:120b unter dem kuenstlichen 2-Runden-Budget) und zusaetzlich zweimal indirekt aus
den natuerlichen 12-Runden-Erschoepfungen in Beleg 1 (`c7cc302a` fuer die Grund-Mechanik ohne
Werkzeugversuch, `b771f2b7` mit demselben Ablehnungstext). Was **nicht** eintrat: die von
`budget.anweisung` selbst geforderte Lieferung ("Ein Teilergebnis mit benannter Luecke ist besser
als keines") — in allen fuenf beobachteten Abschlusszuegen dieser Session (zwei natuerliche, drei
kuenstliche, ueber beide Modelle) blieb `ergebnis` leer. Der Code verlangt kein Teilergebnis, er
bittet nur darum; keines der beiden verfuegbaren schwachen lokalen Modelle ist dieser Bitte in
dieser Session je nachgekommen. Das ist eine Eigenschaft der Modelle in dieser Betriebsart, keine
des Harnesses — der reagiert korrekt auf eine leere Antwort (kein Absturz, `vertrag: null`, sauberes
`run.finished`) —, aber es bedeutet: die Behauptung "verwertbares Teilergebnis" ist in dieser
Session nie mit echtem Text belegt worden, nur die Abwesenheit einer Ausnahme.

---

### Beleg 8 — `KEEL_KEEP_PROFILE=1`

Nach Beleg 7s Rueckbau und Rebuild: `KEEL_KEEP_PROFILE=1 .claude/skills/run-keel/launch.sh
/tmp/keel-harness`. Log zeigt `[launch] KEEL_KEEP_PROFILE=1 — profile kept: /tmp/keel-harness`
(kein `rm -rf` des Profilverzeichnisses).

Nach dem Neustart, Harness-Fenster erneut geoeffnet, `harness:lauf-lesen` ohne Argument:

```
count: 14
ids: [c7cc302a..., b771f2b7..., 609805eb..., 3e5a9833..., 02db2196..., fc61d5a5...,
      24cf0536..., c8000b3c..., d876743a..., cfe17f7f..., 7d05113f..., bbba57dd...,
      ae12b71f..., 41165479...]
```

Alle vierzehn Laeufe aus jeder vorherigen Sitzung dieser Probe (verteilt ueber vier
Prozess-Neustarts: den urspruenglichen Start, den Resume-Neustart in Beleg 5, den
Budget-2-Neustart und den Budget-Rueckbau-Neustart) sind ueber die Liste erreichbar. Stichprobe
"Nachlesen": `harness:lauf-lesen('c7cc302a-...')` liefert alle 55 Ereignisse dieses Laufs,
`first: "run.started"`, `last: "run.finished"` — das volle Protokoll, nicht nur die
Zusammenfassung.

Auch die Konfigurationsaenderung aus der Vorbereitung ueberlebte denselben Neustart:
`settings:ansicht` zeigt fuer `spark-gemma4-26b` weiterhin `faehigkeiten.codec: "openai-chat"`,
`faehigkeiten.werkzeugmodus: "nativ"`.

**Ergebnis: entspricht der Erwartung.** Kein gesonderter Ungueltig-Fall in der Aufgabenstellung
fuer diesen Beleg vorgesehen.

---

### Abschluss

App sauber beendet (`stop.sh`: `[stop] app killed`, `[stop] tmux sessions removed: 0` — die
`cmux-*`-Sitzungen sind fremd und wurden nicht angefasst). `git status --porcelain` nach Abschluss
leer bis auf diese Protokoll-Ergaenzung — der temporaere Budget-Edit in `harness-handlers.ts` ist
vollstaendig zurueckgebaut.

**Zusammenfassung nach Beleg:**

| # | Beleg | Status |
|---|-------|--------|
| Vorbereitung | Faehigkeitszeile ueber das Settings-Fenster | belegt, mit offener UI-Luecke |
| 1 | Echte Arbeit gegen den Spark | teilweise — Werkzeugaufrufe belegt, "belegter Befund" offen |
| 2 | `werkzeug_schema` + stabiler Praefix | belegt |
| 3 | Pfadwache, drei Faelle | belegt |
| 4 | Symlink-Fall | belegt (im zweiten, korrigierten Versuch) |
| 5 | Wiederaufnahme | belegt, mit dokumentierter methodischer Abweichung |
| 6 | Cache-Treffer | offen — Ollama liefert kein unterscheidendes Feld |
| 7 | Budget | Mechanismus belegt, Anspruch offen — `ergebnis` blieb in allen fuenf beobachteten Abschlusszuegen dieser Sitzung leer |
| 8 | `KEEL_KEEP_PROFILE=1` | belegt |

---

## Messprotokoll 2026-08-19 — Fortsetzung: die drei kostenpflichtigen Belege plus Wiederholung

Ausgefuehrt gegen `harness-kern`, HEAD `96b1641`, Baum sauber, 2212 Tests gruen — der Nutzer hat
fuer diesen Lauf ausdruecklich freigegeben, dass Prompts an externe Anbieter gehen und Kosten
entstehen. Umfang: die vier Belege, die im obigen Abschnitt ausdruecklich ausgespart wurden
(Beleg 1 wiederholt nach dem Pfad-Fix `0c30772`, Beleg 1 neu ohne Werkzeugaufruf, Beleg 2 gegen
drei Anbieter, Beleg 3 mit Bild und Datei). HEAD traegt gegenueber der vorigen Sitzung zwei weitere
Commits: `0c30772` (der Pfad-Fix, der Beleg 1 diesmal ueberhaupt erst tragen soll) und
`90b89fd`/`96b1641` (die Faehigkeitszeile im Eintrags-Formular — genau die UI-Luecke, die die
vorige Sitzung als offenen Bereich von CK-NFR-012 vermerkt hatte).

Vor dem Start: `tmux list-sessions` zeigte nur die fremden `cmux-*`-Sitzungen, `ps aux | grep
cipher-keel` war leer. Profil `/tmp/keel-harness`, frisch gestartet (kein `KEEL_KEEP_PROFILE`
beim ersten Start dieser Sitzung). Projektwurzel fuer alle Laeufe weiterhin
`/tmp/keel-harness-projekt` (Kopie von `src/main/model/*.ts`, `.env`, `.ssh_decoy`, Symlink
`abkuerzung`) — dieselbe, bereits vom fruehen Beleg-Lauf desselben Tages angelegte Wurzel, unveraendert
weiterverwendet.

### Vorbereitung: der Anthropic-Eintrag ueber das Settings-Fenster (CK-NFR-012)

Zuerst geprueft, ob ein Schluessel ueberhaupt auflösbar waere, bevor irgendein Eintrag angelegt
wird: `security find-generic-password -s cipher-keel-api-anthropic` und
`security find-generic-password -s cipher-keel-api-openrouter` — beide `SecKeychainSearchCopyNext:
The specified item could not be found`, ebenso `CIPHER_KEEL_API_ANTHROPIC` und
`CIPHER_KEEL_API_OPENROUTER` in der Umgebung leer. Kein Schluessel gelesen, keiner zitiert — nur
auf Vorhandensein einer benannten Schluesselbund-Eintragung geprueft, nie auf ihren Inhalt.

Der Eintrag wurde trotzdem angelegt — ueber `window:open-settings`, dann echte Klicks im
Formular per `driver.mjs`-Skript (native Setter auf `HTMLInputElement`/`HTMLSelectElement`, mit
`input`/`change`-Events, damit React sie sieht; Checkboxen ueber den `checked`-Setter). Kein
direkter `settings:eintrag-speichern`-Aufruf fuer diesen Eintrag — das Formular selbst hat
gespeichert. Felder: Kennung `anthropic-claude-haiku`, Anbieterart `api`, Basis-URL
`https://api.anthropic.com/v1`, Modell `claude-haiku-4-5`, Schluesselname `anthropic` (der
Schluessel selbst wurde nirgendwo eingetragen — das Formular bietet dafuer bewusst kein Feld,
siehe `EintragFormular.tsx`s Kopfkommentar), Codec `anthropic`, Werkzeugmodus `nativ`, dazu
`bilder`/`dokumente`/`aufgeschobenesLaden`/`paralleleAufrufe` angehakt fuer Beleg 3.

**Ehrlicher Zwischenfall, der zur eigentlichen Probe wurde:** der erste Speicherversuch schlug
fehl (`"Endpunkt ohne model — es muss benannt sein, welches Modell antworten soll"`), weil mein
Automatisierungsskript das Feld per Label-Text `"Modell"` suchte und — die Seite traegt *drei*
Felder mit demselben Label (zwei Rueckfall-Endpunkte unter „Zuordnungen" plus das Formularfeld
selbst) — das falsche traf. Kein Produktfehler: ein Mensch, der das sichtbare Formular anschaut,
sieht die drei Felder raeumlich getrennt und trifft nie das falsche; es ist eine Eigenheit
skriptgesteuerter Label-Suche. Behoben, indem die Feldsuche auf den Container um den
„Speichern"-Knopf eingeschraenkt wurde. Danach: `settings:ansicht` zeigt den Eintrag korrekt mit
allen zehn Faehigkeitszeile-Feldern, `geheimnisStatus: "fehlt"`,
`geheimnisHinweis: "Weder im Schluesselbund noch in CIPHER_KEEL_API_ANTHROPIC gefunden — ohne
Schluessel bleibt dieser Eintrag unerreichbar."` — dieselbe Formulierung, die auch fuer den
bestehenden `openrouter-qwen3-coder`-Eintrag steht (`geheimnisStatus: "fehlt"`, exakt
symmetrischer Hinweistext mit `CIPHER_KEEL_API_OPENROUTER`).

**Ergebnis: entspricht der Erwartung, und schliesst die Luecke, die die letzte Sitzung offen
liess.** Der Eintrag wurde tatsaechlich durch das sichtbare Formular angelegt — nicht nur durch
den IPC-Kanal, den das Formular benutzt (wie beim letzten Mal, mangels Formularfeld). Ein Mensch
haette exakt diese Klicks machen koennen. Das ist der vollstaendige CK-NFR-012-Beleg, den die
vorige Sitzung nicht erbringen konnte.

Fuer Beleg 1 und 2 wurden zusaetzlich `spark-gemma4-26b` und `spark-gpt-oss-120b` erneut auf
`codec: 'openai-chat'`, `werkzeugmodus: 'nativ'`, `aufgeschobenesLaden: true` gesetzt (das Profil
ist frisch, die Aenderung aus der letzten Sitzung lebte nicht im neuen Profil weiter) — diesmal
ueber den `settings:eintrag-speichern`-Kanal direkt aus dem Settings-Fenster-Kontext, wie in der
letzten Sitzung. Zusaetzlich ein neuer Eintrag `spark-qwen3-vl-30b` fuer Beleg 3 (dazu dort mehr).

---

### Beleg 1 (Wiederholung) — echte Arbeit gegen den Spark, nach dem Pfad-Fix

Derselbe Auftrag wie beim gescheiterten ersten Anlauf: „Sieh dir `src/main/model/` an und sag,
welche Datei die Warnregeln haelt und wer sie aufruft." gegen `spark-gemma4-26b`
(Lauf `78ae683d-60d9-4a76-8aec-77d17d2859bd`).

Beobachtet, 20 Ereignisse: `verzeichnis_listen` (`muster: "src/main/model/*"`) im ersten Zug
mit fehlendem Feld abgelehnt (`tool.failed`, organischer Tippfehler des Modells, keine
Pfadwache-Ablehnung), im zweiten Versuch mit korrektem Feldnamen erfolgreich. Danach zweimal
`inhalt_suchen` — erst mit falschem Feldnamen (`pattern` statt `regex`) abgelehnt, dann mit
`regex: "Warnregeln|warn"` erfolgreich. **Kein einziger `tool.failed` mit „Pfad liegt ausserhalb
der Wurzel" oder „Pfad ist geschuetzt"** — genau die Ablehnung, die den ersten Anlauf zum
Scheitern brachte (`verzeichnis_listen` gab wurzelrelative Pfade zurueck, `datei_lesen` wies sie
als "ausserhalb der Wurzel" zurueck), trat diesmal kein einziges Mal auf, obwohl das Modell
mehrfach mit Pfaden aus der Werkzeugausgabe weiterarbeitete. Endete `fertig / ziel-erreicht` mit
Text-Ergebnis:

```
Die Funktion `warnungen`, welche die Warnregeln enthält, befindet sich in der Datei
`src/main/model/eignung.ts` (Zeile 93). Aufgerufen wird sie in `src/main/model/ansicht.ts`
(Zeile 135 und Zeilen 143, 187, 212 indirekt über die Zuweisung an das Objekt).
```

Gegen die Wurzel geprueft (nicht nur gegen das Original-Repo, sondern gegen die tatsaechliche
Kopie in `/tmp/keel-harness-projekt`, die das Modell durchsucht hat):
`grep -n warnungen src/main/model/eignung.ts` → `93:export function warnungen(`;
`grep -n warnungen src/main/model/ansicht.ts` → Treffer exakt bei Zeile 135
(`? warnungen(eintrag, slot.laeufer, slot.niveau)`) sowie 143, 187, 212. Jede einzelne vom Modell
genannte Zeilennummer stimmt zeichengenau.

**Ergebnis: entspricht der Erwartung, vollstaendig.** Das Modell fand die Datei diesmal — nicht
weil das Modell staerker geworden waere (dasselbe `gemma4:26b` wie beim gescheiterten Anlauf),
sondern weil der Pfad-Fix genau die Klasse Fehler beseitigt hat, an der der erste Anlauf scheiterte.
Das ist der eigentliche Beweis, dass `0c30772` gewirkt hat: **mehrere Werkzeugaufrufe** (vier,
zwei davon organische Fehlschlaege mit sauberem Weiterlauf) **und ein belegter Befund** (beide
Zeilennummern gegen die Datei verifiziert) — beide Teile der Aufgabenstellung erfuellt, anders als
beim vorigen Anlauf, wo nur der erste Teil erreichbar war.

---

### Beleg 1 (neu) — Lauf ohne Werkzeugaufruf, ohne Anbietername in der Darstellung

**Gueltig:** Auftrag „Antworte in genau einem kurzen Satz, ohne irgendein Werkzeug zu benutzen:
was ist 7 mal 6?" gegen `spark-gemma4-26b` (Lauf `12aa1489-0f0f-431e-8368-6dbc2c3a8fc0`).
Beobachtet: vier Ereignisse — `run.started`, `prompt.sent`, `model.answered`
(`bloecke: [{art: "text", text: "7 mal 6 ist 42."}]`, `stopGrund.normalisiert: "ende"`),
`run.finished` (`endzustand: "fertig"`, `grund: "ziel-erreicht"`, `ergebnis: "7 mal 6 ist 42."`).
Vollstaendige Ereignisfolge, kein einziger Werkzeugaufruf, korrekte Antwort.

**Kein Anbietername in der Darstellung:** `harness:lauf-lesen` liefert exakt das, was
`EreignisPanel.tsx` rendert. Das `run.started`-Ereignis traegt `modellId: "spark-gemma4-26b"`
(die selbstgewaehlte Registry-Kennung, nicht der Name eines Anbieters) und `codec: "openai-chat"`
— kein Feld nennt einen Host, eine Firma oder einen Vertriebsnamen. Das deckt sich mit dem
Kopfkommentar der Komponente selbst ("It knows no provider name. What it shows comes out of the
event stream"): gepruefte, echte Daten aus einem echten Lauf bestaetigen die Behauptung des
Kommentars, statt sie nur beim Lesen des Codes zu glauben.

**Ungueltig:** Auftrag `''` (leerer String) gegen `spark-gemma4-26b`. Beobachtet:
`{"ok":false,"meldung":"Der Auftrag ist leer."}` — Lauf startet nicht, kein `run.started` im
Protokoll, benannte Ablehnung noch vor jedem Modellkontakt.

**Ergebnis: entspricht der Erwartung, vollstaendig.**

---

### Beleg 2 — derselbe Auftrag gegen drei Anbieter

Auftrag „Antworte in einem kurzen Satz: was macht die Funktion warnungen in
src/main/model/eignung.ts?" gegen alle drei Eintraege, in identischer Formulierung:

- **Anthropic** (`anthropic-claude-haiku`, Lauf `97d77935-9c9e-4210-972f-faa3e91463ee`):
  `run.finished` — `endzustand: "abgebrochen"`, `grund: "transportfehler"`,
  `anweisung: "Fuer 'claude-haiku-4-5' ist kein API-Schluessel hinterlegt — erwartet im Keychain
  oder als Umgebungsvariable; siehe docs/anpassbare-flaechen.md"`. Kein Schluessel, keine
  Anfrage ging tatsaechlich an `api.anthropic.com` — der Fehler wird lokal aus dem Fehlen der
  Anmeldedaten erzeugt (`resolveApiKey` liefert `null`, `AnthropicClient.chat` wirft, bevor ein
  Socket geoeffnet wird).
- **OpenRouter** (`openrouter-qwen3-coder`, Lauf `70fa7c48-ac3b-4274-a472-68dbf6daee23`):
  dasselbe Bild — `transportfehler`, `"Für 'qwen/qwen3-coder' ist kein API-Schlüssel hinterlegt
  — ..."`. Auch dieser Schluessel war schon vor dem Lauf als `geheimnisStatus: "fehlt"` in
  `settings:ansicht` sichtbar (bestehender Eintrag, nicht neu angelegt).
- **Spark** (`spark-gemma4-26b`, Lauf `f17782ca-f1d1-4d76-9abf-bb78e95fbf1c`, kein Schluessel
  noetig — `local-http` mit leerem `keyRef`): `fertig / ziel-erreicht`,
  `ergebnis: "Die Funktion \`warnungen\` ermittelt potenzielle Risiken (als Liste von
  \`Warnung\`-Objekten), die aus der spezifischen Kombination eines Modells (\`eintrag\`), eines
  Runners (\`laeufer\`) und eines Leistungsniveaus (\`niveau\`) resultieren."` — inhaltlich
  zutreffend (`eignung.ts`s `warnungen(eintrag, laeufer, niveau)`-Signatur stimmt).

**Genau formuliert, nicht ueberzeichnet:** Alle drei `run.started`-Nutzlasten wurden verglichen,
mit `codec`, `modellId` und `werkzeuge` herausgenommen. Der Rest (`auftragstext`, `wurzel`,
`budgets`, `hinweise`, `anhangBloecke`) ist **zeichengleich** ueber alle drei. Einzige
Unterschiede: `codec` (`"anthropic"` vs. zweimal `"openai-chat"` — direkt aus
`faehigkeiten.codec` des jeweiligen Eintrags) und die Laenge der `werkzeuge`-Liste (Anthropic
und Spark: 8, inklusive `werkzeug_schema`; OpenRouter: 7, ohne — weil
`openrouter-qwen3-coder`s `faehigkeiten.aufgeschobenesLaden` unveraendert `false` blieb,
waehrend die anderen beiden fuer diese Sitzung auf `true` gesetzt wurden). Der
`prompt.sent`-Text von Anthropic und Spark — unterschiedlicher Codec, unterschiedlicher
Transport, aber gleiche `aufgeschobenesLaden`-Einstellung — ist **zeichengleich**
(`ps(anthropic) === ps(spark)` bei direktem String-Vergleich, wahr).

Was diese Messung nicht zeigt, weil es nicht gezeigt werden kann: dass Praefix und Auftrag am
Codec **verzweigen wuerden, wenn sie es koennten**, aber es nicht tun. `baueStabilenTeil`
(`praefix.ts`) nimmt keinen Codec-Parameter entgegen und wird von `fahre()` (`lauf.ts`) genau
einmal pro Lauf berechnet, **bevor** `codec.toWire()` ueberhaupt laeuft. Der stabile Teil kann
also unmoeglich vom Codec abhaengen, unabhaengig davon, was diese Probe zeigt — die
Zeichengleichheit ist durch die Funktionssignatur erzwungen, nicht durch beobachtetes Verhalten
bewiesen. Genau formuliert: der Praefix und der Auftrag verzweigen nachweislich nicht am Codec;
die Codec-Haelfte des Pfades selbst ist gegen genau **einen** Dialekt belegt. Der
`anthropic`-Lauf scheiterte am fehlenden Schluessel noch im Transport (`AnthropicClient.chat`
wirft, bevor ein Socket geoeffnet wird) — `anthropicCodec.fromWire()`, das Gegenstueck zu
`codec.toWire()` fuer diesen Dialekt, hat in dieser gesamten Session **keine einzige echte
Anthropic-Antwort** gesehen und ist ausschliesslich durch Unit-Tests
(`tests/harness/codec-anthropic.test.ts`) gedeckt. Das wird hier ausdruecklich als unbelegt
gefuehrt, nicht stillschweigend mitbehauptet.

**Ungueltig:** `harness:lauf-starten` mit `modellId: 'nicht-existierendes-modell-xyz'`.
Beobachtet: `{"ok":false,"meldung":"Kein Registry-Eintrag 'nicht-existierendes-modell-xyz'."}` —
Lauf startet nicht, benannte Ablehnung.

**Ergebnis: der Mechanismus entspricht der Erwartung vollstaendig — dreimal dieselbe Behandlung,
der Unterschied gemessen statt vermutet —, aber zwei der drei Anbieter liefern kein
vertragsgemaesses Ergebnis, weil kein Schluessel hinterlegt ist.** Das ist kein Fund ueber den
Harness: die Fehlerbehandlung selbst ist sauber (keine Ausnahme, kein Absturz, ein prazise
benannter, geheimnisfreier Fehlertext, der Lauf endet ordentlich mit `run.finished`). Es ist ein
offener Punkt ueber die Betriebsumgebung dieser Sitzung — weder im Schluesselbund noch als
Umgebungsvariable war unter den erwarteten Namen (`cipher-keel-api-anthropic`,
`cipher-keel-api-openrouter` bzw. `CIPHER_KEEL_API_ANTHROPIC`, `CIPHER_KEEL_API_OPENROUTER`) ein
Schluessel auffindbar, trotz der Ansage, der Login sei frisch. Nur der dritte, schluessellose
Anbieter (Spark) lieferte tatsaechlich ein inhaltlich geprueftes Ergebnis. Das „dreimal
vertragsgemaess" aus der Aufgabenstellung ist damit **nicht** erreicht; **einmal
vertragsgemaess plus zweimal derselbe, sauber gemeldete, geheimnisfreie Fehlklasse** ist das
ehrliche Bild dieser Sitzung.

---

### Beleg 3 — Bild und Datei

**Vorbereitung:** ein echter Screenshot (`screencapture -x`, 2560×1440, spaeter auf 400px
verkleinert) und ein echtes PDF (`echo ... | cupsfilter`, ein Textabsatz, `PDF document, version
1.3`). Vorab per `curl` direkt gegen den Spark geprueft, **bevor** Registry-Eintraege oder Laeufe
davon abhingen: ein `image_url`-Block wird von `qwen3-vl:30b-a3b` korrekt verarbeitet (echte
Bildbeschreibung zurueck), ein `file`-Block (das Format, das `codec-openai-chat.ts` fuer
Dokumente sendet) wird von Ollamas `/v1/chat/completions` mit `HTTP 400 "invalid message
format"` **abgelehnt** — unabhaengig davon, ob er allein oder zusammen mit einem gueltigen
Bild-Block geschickt wird. Diese Erkenntnis kam vor jedem Harness-Lauf und hat den ganzen Beleg
geformt: **kein derzeit erreichbarer Anbieter kann in dieser Sitzung Bild und Datei tatsaechlich
beides gleichzeitig verarbeiten**, aus zwei verschiedenen, unabhaengigen Gruenden (Anthropic:
Schluessel fehlt; Spark: Ollama selbst weist den Dokumenttyp zurueck). Das wird hier offen
aufgeschrieben, nicht kaschiert.

Drei Registry-Eintraege fuer diesen Beleg: `anthropic-claude-haiku` (`bilder: true`,
`dokumente: true`, wie in der Vorbereitung angelegt), neu `spark-qwen3-vl-30b` (`bilder: true`,
`dokumente: true` — echte Vision-Capability laut Sparks `/api/tags`, das `dokumente: true` erwies
sich als zu optimistisch, siehe unten), und `spark-gemma4-26b` (`bilder: false`, unveraendert,
echte Eigenschaft — `gemma4:26b` traegt laut `/api/tags` keine `vision`-Capability).

**Anhaenge echt ueber den Dateidialog des Hauptprozesses gewaehlt:** `harness:anhaenge-waehlen`
zweimal ausgeloest (einmal je Datei), der native `NSOpenPanel`-Sheet per `System
Events`/Accessibility-Automatisierung bedient (Cmd+Shift+G, exakter Dateipfad eingetragen,
zweimal Return — einmal zur Navigation/Auswahl, einmal zum Bestaetigen des Dialogs) — echte
Klicks in einem echten, vom Betriebssystem gezeichneten Dialog, kein Umweg um die IPC-Grenze.
Beide Pfade landeten dadurch in `dialogAusgewaehlt` und waren fuer alle folgenden Laeufe
gueltig.

**Ungueltig (Dateidialog-Herkunft):** `harness:lauf-starten` mit
`anhaenge: ['/tmp/keel-harness-belege/beleg3-quelle.txt']` — einer Datei, die nie durch den
Dialog lief. Beobachtet: `{"ok":false,"meldung":"Anhang stammt aus keinem vom Hauptprozess
geoeffneten Dateidialog: '/tmp/keel-harness-belege/beleg3-quelle.txt'."}` — Lauf startet nicht,
Meldung nennt den abgelehnten Pfad wortwoertlich.

**Lauf 1 (Anthropic, Bild+Datei, Lauf `4c49b181-3d1c-4117-8d4b-ec8cc857c838`):** dieselbe
Schluessel-Ablehnung wie in Beleg 2, unveraendert durch die Anhaenge — die Faehigkeitszeile
(`bilder: true`, `dokumente: true`) laesst `codec.toWire()` beide Bloecke widerspruchslos
uebersetzen, der Lauf scheitert sauber erst beim Transport
(`transportfehler`, „kein API-Schluessel hinterlegt"). Offener Beleg, wie Beleg 2.

**Lauf 2 (Spark-Vision, Bild+Datei, Lauf `8467f78e-98fd-494b-b7c4-ededfec9bd1f`):** der Codec
liess auch hier beide Bloecke durch (`dokumente: true` in der Faehigkeitszeile), aber die echte
Anfrage an den Spark kam mit `HTTP 400: invalid message format` zurueck — sauber als
`transportfehler` gemeldet, Lauf endet ordentlich (`endzustand: "abgebrochen"`), keine Ausnahme.
Genau die Diskrepanz, die die Vorab-Probe per `curl` vorhergesagt hatte: die Faehigkeitszeile
sagt, das Modell koenne Dokumente verarbeiten; der tatsaechliche Transport (Ollamas
OpenAI-kompatible Chat-Completions-Route) kennt den `file`-Blocktyp nicht. Ein echter, wichtiger
Fund: **eine `vermutete` Faehigkeitszeile kann falsch sein, und wenn sie es ist, scheitert der
Lauf sauber statt falsch zu antworten** — aber `dokumente: true` fuer `spark-qwen3-vl-30b` war
in dieser Sitzung eine unbegruendete Vermutung, keine gepruefte Tatsache, und das steht hier so.

**Lauf 3 (Spark-gemma4, `bilder: false`, Bild+Datei, Lauf `d4052b85-a0a4-4751-9ef8-758ac381becc`)
— der eigentlich wichtigste Fund dieses Belegs, und kein sauberer:** Das Log zeigt die erwartete
Ablehnung wortwoertlich: `[harness-handlers] Lauf 'd4052b85-...' endete mit einem unbehandelten
Fehler: Das Modell nimmt keine Bloecke der Art 'bild' — die Faehigkeitszeile sagt bilder: false
(Quelle: vermutet). Der Auftrag traegt einen solchen Block.` — `CodecKannNicht` wurde exakt so
geworfen, wie `codec-openai-chat.ts` es verspricht. **Aber dieser Fehler erreicht nie ein
`run.finished`-Ereignis.** `harness:lauf-lesen` fuer diesen Lauf zeigt bis heute nur ein einziges
Ereignis (`run.started`); `harness:lauf-lesen` ohne Argument fuehrt ihn dauerhaft mit
`endzustand: null` — also als „laeuft" — obwohl der Prozess laengst fertig damit ist. Der Grund,
im Code nachvollzogen: `lauf.ts`s `fahre()` baut `koerper = codec.toWire(...)` bei Zeile 186,
**ausserhalb** und **vor** dem `try { antwort = await u.sende(koerper, praefix) } catch`-Block
bei Zeile 197/198. Eine `CodecKannNicht`-Ausnahme aus `toWire()` selbst — genau der Fall „Anhang
mit einer Blockart, die die Faehigkeitszeile ausschliesst" — wird von diesem `try/catch` also gar
nicht erst gesehen. Sie faellt als unbehandelte Promise-Ablehnung durch, landet nur im
`.catch()`-Sicherheitsnetz von `harness-handlers.ts` (das ausdruecklich nur Konsole-Logging und
Aufraeumen der Abbruchmarke macht, kein Ereignis schreibt) und verschwindet dort in die
Konsole — sichtbar fuer niemanden, der nicht die Server-Logs liest. Das widerspricht der eigenen
Regel des Plans ("Kein stilles Verschlucken. Was ein Modell nicht kann, wird gemeldet, nicht
weggelassen") an genau der Stelle, wo sie am woertlichsten gilt: die Meldung wird erzeugt, aber
nie gemeldet.

**Ergebnis: gemischt, und das absichtlich nicht schoengeredet.** Der Ungueltig-Fall
(Dateidialog-Herkunft) ist sauber belegt. Die beiden Anbieter, die „beides koennen" sollten,
liefern in dieser Sitzung **kein** vertragsgemaesses Ergebnis fuer die Kombination aus Bild und
Datei — einer, weil kein Schluessel vorliegt (offener Beleg wie in Beleg 2), der andere, weil
seine Faehigkeitszeile fuer `dokumente` in dieser Sitzung unbegruendet war und der echte
Transport das aufdeckte (ein sauber gemeldeter, aber negativer Befund). Der dritte Anbieter
(`bilder: false`) meldet Unvermoegen zwar **ausdruecklich und korrekt** in der erzeugten
Fehlermeldung — aber diese Meldung erreicht das Ereignisprotokoll nie, der Lauf haengt fuer immer
als „laeuft" fest. Das ist der wichtigste Fund dieser Sitzung: eine Luecke zwischen
`codec.toWire()` und dem `try/catch`, die um die Meldepflicht fuer Anhang-Faehigkeitsverstoesse
herumfuehrt. Eine ergaenzende, nicht im Plan geforderte Probe (nur Bild, kein Dokument, gegen
`spark-qwen3-vl-30b`) sollte zumindest einen echten Erfolgsfall fuer Bildverarbeitung zeigen,
scheiterte aber zweimal am 120-Sekunden-Transport-Zeitlimit (`ANTHROPIC_TIMEOUT_MS`/
`API_TIMEOUT_MS`, beide 120000 ms) — sowohl mit dem 2,2-MB-Originalscreenshot als auch mit der
auf 96 KB verkleinerten Fassung. Die fruehe `curl`-Probe mit einem trivialen 1×1-Pixel-Bild lief
in unter zwei Sekunden durch; ein reales Bild scheint auf dieser Hardware deutlich laenger zu
brauchen als das Zeitbudget erlaubt. Das bleibt offen — nicht Teil der geforderten vier Belege,
aber ein zusaetzlicher, unerwarteter Fund, der hier nicht verschwiegen wird.

---

### Abschluss (Fortsetzung)

App sauber beendet (`stop.sh`: `[stop] app killed`). `git status --porcelain` danach leer bis auf
diese Protokoll-Ergaenzung. Fuer Beleg 2s fehlenden Ungueltig-Fall wurde die App ein zweites Mal
kurz mit `KEEL_KEEP_PROFILE=1` gestartet (Konfiguration und alle elf vorherigen Laeufe dieser
Sitzung blieben erhalten — `harness:lauf-lesen` zeigte `count: 11` vor dem zwoelften,
ungueltigen Versuch), danach sofort wieder sauber gestoppt.

**Zusammenfassung nach Beleg:**

| # | Beleg | Status |
|---|-------|--------|
| Vorbereitung | Anthropic-Eintrag ueber das Settings-Fenster-Formular | belegt — schliesst die CK-NFR-012-Luecke der vorigen Sitzung |
| 1 (Wiederholung) | Echte Arbeit gegen den Spark nach dem Pfad-Fix | belegt, vollstaendig — Werkzeugaufrufe und ein gegen die Datei verifizierter Befund |
| 1 (neu) | Lauf ohne Werkzeugaufruf, kein Anbietername in der Darstellung | belegt, vollstaendig |
| 2 | Derselbe Auftrag gegen drei Anbieter | Praefix/Auftrag verzweigen nachweislich nicht am Codec (durch die Signatur erzwungen, nicht nur durch Verhalten gezeigt); die Codec-Haelfte des Pfades ist nur fuer `openai-chat` end-to-end belegt — `anthropicCodec.fromWire()` sah keine echte Antwort, unbelegt; zwei von drei Anbietern liefern kein Ergebnis mangels Schluessel — offen |
| 3 | Bild und Datei | Ungueltig-Fall belegt; „bilder: false" meldet zwar korrekt, aber die Meldung erreicht nie das Ereignisprotokoll — eigenstaendiger, wichtiger Fund; beide „kann beides"-Anbieter liefern kein Ergebnis (Schluessel fehlt bzw. Ollama lehnt den Dokumenttyp ab) |

---

## Messprotokoll 2026-08-20 — die Belege mit echten Schluesseln, und zwei Fehler, die sie zutage foerderten

Der Nutzer hat die API-Schluessel fuer `anthropic` und `openrouter` ueber das Settings-Fenster im
Schluesselbund hinterlegt (`geheimnisStatus: "schluesselbund"` fuer beide Eintraege, gelesen ueber
`settings:ansicht`; die Schluessel selbst wurden nicht gelesen und nicht zitiert). Damit waren zum
ersten Mal die Belege fahrbar, die in der vorigen Sitzung mangels Schluessel offen bleiben mussten.

Startzustand: HEAD `9c5b2d4`, 2214 Tests gruen, Baum sauber. Profil `/tmp/keel-harness` mit
`KEEL_KEEP_PROFILE=1` weiterverwendet, damit die Registry-Eintraege der vorigen Sitzung erhalten
bleiben. Vor dem Start `ps aux | grep cipher-keel` leer. Neue Projektwurzel `/tmp/keel-beleg` mit
einer `README.md`, die den Anker `4711-ANKER` traegt, und einem Unterordner.

### Fund A: das aufgeschobene Laden machte jeden Anthropic-Lauf unmoeglich

Der allererste Lauf gegen `anthropic-claude-haiku` (`c863a1d0-2ec3-4f3c-9bf6-5fe6f1b7709c`) endete
mit `abgebrochen / transportfehler`:

```
api.anthropic.com antwortete mit HTTP 400: messages.4: `tool_use` ids were found without
`tool_result` blocks immediately after: toolu_01GcvucSEDTNtehPS8xYvcCK
```

Ursache: `projiziere()` schrieb ein nachgeladenes Schema als **eigene** Nutzernachricht. Damit
stand es zwischen dem `tool_use` des Meta-Aufrufs und dessen eigenem `tool_result`, und erzeugte
nebenbei zwei Nutzernachrichten hintereinander. Anthropic weist beides ab. Der Mechanismus, der
den Praefix billig halten soll, machte damit genau den Normalfall unmoeglich: jeden Lauf, in dem
ein Modell ein Schema nachlaedt.

**Warum keiner der 2214 Tests das sah:** `tests/harness/projektion.test.ts` hatte die kaputte Form
woertlich festgeschrieben — `expect(v).toHaveLength(4)` mit dem Kommentar
„run.started, model.answered, schema-Nachricht, Ergebnis-Nachricht". Der Test prueft die Form, die
wir erzeugen, und hat nie gefragt, ob ein Anbieter sie annimmt. Das ist derselbe Fehlermodus, der
diese Strecke durchzieht: gruen aus einem Nebengrund.

Behoben in `fb32237`. Neu dazu `tests/harness/verlauf-anbietervertrag.test.ts` — der prueft nicht
unsere Struktur, sondern die Regel des Anbieters (Nachbarschaft von `tool_use` und `tool_result`,
keine doppelte Rolle), indem er die echten Codecs ueber eine echte Projektion laufen laesst. Alle
fuenf waren vor der Behebung rot. **Gegenprobe:** laesst man das Schema ganz weg, werden genau die
zwei Zustell-Tests rot und die Nachbarschaftstests bleiben gruen — die faule Behebung waere
aufgefallen.

### Beleg 1 — echte Arbeit gegen ein echtes Modell — belegt, vollstaendig

Lauf `40b657d8-70f2-4d77-a8bb-78458db6482c`, `anthropic-claude-haiku`, Wurzel `/tmp/keel-beleg`.
Sechzehn Ereignisse, lueckenlos:

```
run.started, prompt.sent, model.answered, tool.intent, tool.failed, prompt.sent, model.answered,
tool.intent, tool.schema_loaded, tool.completed, prompt.sent, model.answered, tool.intent,
tool.completed, prompt.sent, model.answered, run.finished
```

Das Modell rief `datei_lesen` zuerst **ohne** `pfad` auf → `tool.failed` mit „Das Feld 'pfad' fehlt
in der Eingabe." Danach holte es `werkzeug_schema` (`tool.schema_loaded` mit dem vollstaendigen
Schema im Protokoll), rief korrekt mit `{"pfad":"README.md"}` auf, und antwortete
`fertig / ziel-erreicht` mit `4711-ANKER`. Der laute Ablehnungspfad ist damit an einem echten
Anbieter belegt, nicht nur im Test — und zwar so, dass das Modell sich daran korrigiert hat.

### Beleg 2 — derselbe Auftrag gegen drei Anbieter — belegt, vollstaendig

Wortgleicher Auftrag, drei Eintraege, drei Codecs:

| Eintrag | Codec | Lauf | Ende |
|---|---|---|---|
| `anthropic-claude-haiku` | `anthropic` | `40b657d8-…` | fertig / ziel-erreicht |
| `openrouter-qwen3-coder` | `openai-chat` (Hoster) | `741fce81-…` | fertig / ziel-erreicht |
| `spark-qwen3-vl-30b` | `openai-chat` (lokal) | `6da13659-…` | fertig / ziel-erreicht |

Alle drei nannten `4711-ANKER`. **`anthropicCodec.fromWire()` ist damit belegt** — in der vorigen
Sitzung stand es ausdruecklich als unbelegt im Protokoll, weil es nie eine echte Antwort gesehen
hatte; hier hat es vier verarbeitet.

Nebenbefund aus dem Spark-Lauf: das Modell rief `datei_lesen` mit `{"pfade":["README.md"]}` auf,
bekam „Das Feld 'pfad' fehlt in der Eingabe." und korrigierte sich — der Ablehnungspfad ein zweites
Mal, an einem anderen Anbieter.

Ein Ungueltig-Fall fiel unfreiwillig an: der erste Hoster-Lauf (`9d85d751-…`) endete mit
`abgebrochen / transportfehler` und „openrouter.ai ist nicht erreichbar: Client network socket
disconnected before secure TLS connection was established". `curl` gegen dieselbe Domain lieferte
zeitgleich HTTP 200; der Wiederholungslauf ging durch. Also ein fluechtiger Netzfehler — und der
Punkt ist, dass er **benannt und mit `run.finished` beendet** wurde statt den Lauf haengen zu
lassen.

### Fund B: die Praefix-Ordnung war umsonst — es fehlte die Bitte

Beim Durchsehen der `usage`-Felder von Beleg 1 fiel auf, dass Anthropic ueber **alle vier Zuege**
meldete:

```
Zug 1  input=1619  cache_creation=0  cache_read=0
Zug 2  input=1716  cache_creation=0  cache_read=0
Zug 3  input=2021  cache_creation=0  cache_read=0
Zug 4  input=2204  cache_creation=0  cache_read=0
```

`cache_control` kam im gesamten Code nicht vor. Die Ordnung des Praefixes war nie das Problem —
keine Zeitstempel, sortierte Stummel, zeichengleich; es fehlte die Bitte. Anthropic legt nichts in
den Zwischenspeicher, solange kein Haltepunkt gesetzt ist. Bei OpenAI-kompatiblen Anbietern greift
das Praefix-Caching von allein, weshalb es nie auffiel — und **weshalb Beleg 6 der vorigen Sitzung
mit dem falschen Grund offen blieb** („Ollama liefert kein unterscheidendes Feld"). Anthropic
liefert das Feld sehr genau und meldete Null.

Behoben in `478d9af`. Der Haltepunkt gehoert *zwischen* den stabilen Teil und das
Fortschrittsobjekt: Anthropic speichert alles bis einschliesslich des markierten Blocks, ein
Haltepunkt dahinter haette bei jedem Werkzeugaufruf verfehlt — also immer dann, wenn er sich lohnt.
Dafuer bekommt der Transport die beiden Teile jetzt getrennt (`LaufUmgebung.sende` nimmt
`PraefixText {stabil, fluechtig}` statt einer Zeichenkette), statt den zusammengesetzten Text an
der Ueberschrift `## Fortschritt` wieder aufzuschneiden. `prompt.sent` legt weiter beide Teile
zusammen ab — das ist, was abging (Spec 6.3).

**Gegenproben:** Haltepunkt hinter den Fortschritt geschoben → vier der acht neuen Tests rot.
Stabilen Teil pro Zug neu gebaut → die zwei Praefix-Tests in `lauf.test.ts` rot.

### Beleg 6/9 — Cache-Treffer — belegt, mit gemessener Bedingung

Erster Versuch nach der Behebung (Lauf `78291e59-…`, derselbe kurze Auftrag): weiterhin
`cache_read=0` auf allen vier Zuegen, obwohl `grep cache_control dist/main/index.js` den Haltepunkt
im Build nachwies. Verdacht: Anthropics Mindestlaenge fuer zwischenspeicherbare Praefixe (bei den
Haiku-Modellen 2048 Token), unser stabiler Teil lag darunter.

Geprueft, indem der Auftragstext — er gehoert zum stabilen Teil — auf 31494 Zeichen verlaengert
wurde (`/tmp/keel-beleg/auftrag-lang.txt`, 60 durchnummerierte Arbeitsregeln plus dieselbe
Aufgabe). Lauf `b9458d79-25a1-4ed4-85f0-117e0c22ba15`:

```
Zug 1  input=11035  cache_creation=11908  cache_read=0
Zug 2  input=11249  cache_creation=0      cache_read=11908
Zug 3  input=11562  cache_creation=0      cache_read=11908
Zug 4  input=11760  cache_creation=0      cache_read=11908
```

Der entscheidende Teil ist nicht, dass gelesen wurde, sondern dass `cache_read` ueber die Zuege 2
bis 4 **exakt 11908 bleibt**, obwohl dazwischen Werkzeuge liefen und das Fortschrittsobjekt sich
aenderte. Saesse der Haltepunkt hinter dem fluechtigen Teil, waere er beim ersten Werkzeugaufruf
auf Null gefallen. Das ist der Beleg fuer die *Stelle* des Haltepunkts, nicht nur fuer seine
Existenz.

Zweiter Lauf, eigene Lauf-ID, eigene Protokollzeilen (`ce0a453c-3b9c-4a64-bdbd-56a3275343a5`):

```
Zug 1  input=11035  cache_creation=0  cache_read=11908
```

Damit ist der Wortlaut der Spec eingeloest: **„Ein zweiter Lauf meldet einen Cache-Treffer."** Der
stabile Teil war nicht nur innerhalb eines Laufs zeichengleich, sondern ueber Laeufe hinweg.

**Was dieser Beleg nicht sagt:** unterhalb der Mindestlaenge des Anbieters bringt der Haltepunkt
nichts. Bei einem kleinen Auftrag ohne Persona und ohne viele Werkzeuge — wie dem kurzen aus
Beleg 1 — bleibt `cache_read` bei Null, und das ist Anbieterverhalten, kein Fehler bei uns. Die
Praefix-Oekonomie traegt also erst ab einer gewissen Groesse, und genau ab wo, haengt am Modell.
Das steht hier als gemessenes Ergebnis, nicht als Vermutung.

### Zusammenfassung nach Beleg

| # | Beleg | Status |
|---|-------|--------|
| 1 | Echte Arbeit gegen ein echtes Modell | belegt, vollstaendig — sechzehn Ereignisse, Ablehnungspfad und Schema-Nachladen inbegriffen |
| 2 | Derselbe Auftrag gegen drei Anbieter | belegt, vollstaendig — drei Codecs, dreimal derselbe Anker; `anthropicCodec.fromWire()` ist damit nicht mehr unbelegt |
| 6/9 | Cache-Treffer | belegt — mit der gemessenen Bedingung, dass der Praefix die Mindestlaenge des Anbieters erreichen muss |
| 3 | Bild und Dokument | belegt — siehe Nachtrag unten |

Stand nach dieser Sitzung: HEAD `478d9af`, 2227 Tests gruen, Typecheck und Lint sauber.


### Nachtrag: Beleg 3 — Bild und Dokument — belegt

Der Nutzer hat `bild-beleg.png` und `dokument-beleg.pdf` im nativen Dateidialog ausgewaehlt; die
Herkunftspruefung gab beide Pfade in ihrer aufgeloesten Form zurueck
(`/private/tmp/keel-beleg/anhaenge/...`).

| Anbieter | Lauf | Verhalten |
|---|---|---|
| `anthropic-claude-haiku` | `60ab4195-…` | `fertig / ziel-erreicht`. Nannte „Dreieck", `8172-KOMPASS` und `3390-SEEZEICHEN` — die beiden Anker stehen ausschliesslich in den Anhaengen, also sind sie wirklich angekommen |
| `openrouter-qwen3-coder` | `a00080a1-…` | `run.started, run.finished` — **nichts ging raus**. `auftrag-unvereinbar`: „Das Modell nimmt keine Bloecke der Art 'bild' — die Faehigkeitszeile sagt bilder: false (Quelle: vermutet). Der Auftrag traegt einen solchen Block." |

Der Ablehnungsfall ist der wertvollere: er nennt die Faehigkeitszeile *und* ihre Quelle und kostet
keinen Token, weil er vor dem Senden faellt.

**Nebenbefund, nicht Teil des Belegs:** `spark-qwen3-vl-30b` traegt `bilder: true, dokumente: true`
mit `quelle: vermutet`, und beides stimmt fuer diesen Endpunkt nicht. Mit Dokument antwortete
Ollamas /v1-Flaeche `HTTP 400: invalid message format` (laut, benannt, `run.finished` geschrieben);
mit Bild allein nahm der Draht die Anfrage an, das Modell antwortete aber, es sei ein
„Text-Only-Assistent" und koenne das Bild nicht sehen. Der zweite Fall ist der unangenehmere: der
Lauf endet `fertig / ziel-erreicht`, weil das Modell natuerlich aufhoerte — der Anhang ist
unterwegs verschwunden, ohne dass irgendeine Schicht es meldet. Das ist kein Fehler der Schleife
(sie kann nicht beurteilen, ob eine Antwort gut ist), sondern der Beleg dafuer, dass eine
`vermutet`-Faehigkeitszeile tragend ist und niemand sie misst. Der Kanarienauftrag, der genau das
tun soll, ist in Spec 13 ausdruecklich nicht Teil dieser Strecke. Ueber API ist der Fall damit
erledigt; der Spark ist hier Kuer.

### Nachtrag: die Typgrenze fuer Anhaenge (`451c0ec`)

Beim Nachsehen fiel auf, dass die gesamte Typzuordnung fuenf Bildformate und PDF kannte und alles
andere zu `application/octet-stream` **riet und trotzdem verschickte** — auch `.txt`, `.md`,
`.csv`, `.json`. Behoben: drei Ausgaenge, getragen / als Text getragen / benannt abgelehnt, mit
Grund bei bekannten Formaten. Gegenprobe: baut man das Raten wieder ein, werden sechs der neun
neuen Tests rot.

Der Weg durch die laufende App wurde dafuer **nicht** noch einmal gefahren — das haette eine
weitere Auswahl im Dateidialog gebraucht, und die Grenze ist ohne Dateisystem pruefbar, weil sie
Pfad und base64-Daten entgegennimmt statt selbst zu lesen. Das steht hier, statt es zu behaupten.

Stand: HEAD `00bb6a8`, 2236 Tests gruen, Typecheck und Lint sauber.
