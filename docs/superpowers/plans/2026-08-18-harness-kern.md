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
  tabelle: Record<string, Preis> = VORGABE_PREISE,
): Abschlussgrund | null {
  void tabelle
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
