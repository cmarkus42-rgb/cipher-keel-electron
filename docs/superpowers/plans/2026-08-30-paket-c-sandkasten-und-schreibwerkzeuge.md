# Paket C — Sandkasten, Schreibwerkzeuge, Tor: Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** keels eigene Schleife bekommt `datei_schreiben`, `datei_loeschen` und `shell_ausfuehren`, abgesichert durch einen Seatbelt-Sandkasten über dem Kindprozess und ein Tor, das ablehnen kann und die Ablehnung ins Protokoll schreibt.

**Architecture:** Zwei Schichten, die einander nicht berühren. In-Prozess-Werkzeuge (`datei_schreiben`, `datei_loeschen`) laufen im Electron-Hauptprozess und werden von der **Pfadwache** über ihren Argumenten geprüft; der Kindprozess von `shell_ausfuehren` wird von **Seatbelt** geprüft (`sandbox-exec -p`, Profil als Text erzeugt). Dazwischen sitzt `tor.ts`: `tool.intent` → **`tool.entschieden`** → `tool.completed`/`tool.failed`. Ein Zug mit einem wirkenden Aufruf läuft sequenziell statt `Promise.all`.

**Tech Stack:** TypeScript, Electron (Hauptprozess), vitest, `node:child_process`, macOS `sandbox-exec` (SBPL).

Spec: `docs/superpowers/specs/2026-08-30-paket-c-sandkasten-und-schreibwerkzeuge-design.md`

## Global Constraints

- **Keine Umlaute in Quelltext-Kommentaren und Bezeichnern.** Deutscher *Prompt*-Text (der ins Modell geht) darf sie tragen — die Konvention betrifft Kommentare und Namen. Es gibt dafür weder Lint-Regel noch Wächter; sie wird von Hand eingehalten.
- **Kein `electron`-Import unter `src/main/harness/`.** Wächter: `tests/harness/waechter-kern.test.ts` → *„kein Modul unter src/main/harness/ importiert electron — ohne Ausnahmeliste"*. `node:child_process` und `src/main/util/exec-util.ts` sind erlaubt (exec-util importiert kein electron).
- **`npm run typecheck`, niemals ein handgeschriebenes `tsc --noEmit -p .`** — letzteres ist in diesem Repo stumm erfolgreich und prüft nichts.
- **Die Läufer-Wache liest rohen Dateitext, Kommentare eingeschlossen.** Wer über `fremdes-cli`/`eigene-schleife`/`ein-schuss` schreibt, benutzt die Konstanten oder lässt die Anführungszeichen weg.
- **Tests:** `npx vitest run <pfad>` bzw. `npx vitest run <pfad> -t "<name>"`. Ganzer Lauf: `npm test`.
- **Vor dem Merge eine Schlussrunde über eigene Terminzusagen** — Kommentare der Form „kommt in einer späteren Aufgabe", die dieses Paket eingelöst hat. Mindestens `lauf.ts:369-371` (Single-Writer) und `werkzeug-graph.ts:10` (*„They belong to the stretch that brings the sandbox."*).
- **Jeder Wächter wird gegen eine absichtlich falsche Fassung gefahren.** Ein Test, der nie rot war, hat nichts bewiesen. Das Ergebnis gehört in den Abschlussbericht.
- **Plattform:** `sandbox-exec` gibt es nur auf macOS. Jeder Test, der einen echten Kindprozess startet, wird mit `describe.skipIf(process.platform !== 'darwin')` übersprungen.

---

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/main/harness/sandkasten.ts` **(neu)** | `profilText()` (rein), `sbplLiteral()`, `sbplRegex()`, `starte()`, `istPaketbefehl()`, die Vorgabekonstanten |
| `src/main/harness/tor.ts` **(neu)** | `WIRKENDE_WERKZEUGE`, `entscheide()` (rein), `effekteOhneEntscheidung()` |
| `src/main/harness/werkzeug-schreiben.ts` **(neu)** | `datei_schreiben`, `datei_loeschen`, Export `SCHREIB_WERKZEUGE` |
| `src/main/harness/werkzeug-shell.ts` **(neu)** | `shell_ausfuehren`, Export `SHELL_WERKZEUGE` |
| `src/main/harness/ereignisse.ts` | neue Art `tool.entschieden` |
| `src/main/harness/werkzeuge.ts` | `WerkzeugKontext` bekommt `sandkasten` |
| `src/main/harness/lauf.ts` | Tor-Kette, Single-Writer, Git-Vorbedingung |
| `src/main/harness/index.ts` | Re-Exporte |
| `src/main/harness-sitzung.ts` | Registry und `SandkastenKontext` bauen |
| `src/renderer/components/harness/EreignisPanel.tsx` | Farbe und Kurzfassung für `tool.entschieden` |
| `docs/anpassbare-flaechen.md` | Einträge für Zwischenspeicher, Zeitgrenze, Ausgabedeckel |

---

## Task 1: `profilText` — das Sandkastenprofil als reine Funktion

**Files:**
- Create: `src/main/harness/sandkasten.ts`
- Test: `tests/harness/sandkasten-profil.test.ts`

**Interfaces:**
- Consumes: `WacheKontext` aus `./pfadwache`
- Produces:
  - `interface SandkastenKontext extends WacheKontext { zwischenspeicher: string[]; tmpdir: string }`
  - `type NetzModus = 'zu' | 'offen'`
  - `function profilText(ktx: SandkastenKontext, netz: NetzModus): string`
  - `function sbplLiteral(pfad: string): string`
  - `function sbplRegex(pfad: string): string`
  - `const STANDARD_ZWISCHENSPEICHER: string[]` (heim-relativ)

- [ ] **Step 1: Write the failing test**

Create `tests/harness/sandkasten-profil.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  profilText, sbplLiteral, sbplRegex, STANDARD_ZWISCHENSPEICHER,
  type SandkastenKontext,
} from '../../src/main/harness/sandkasten'

const ktx: SandkastenKontext = {
  wurzel: '/Users/x/projekt',
  heim: '/Users/x',
  userDataPfad: '/Users/x/Library/Application Support/cipher-keel',
  zwischenspeicher: ['/Users/x/.npm', '/Users/x/.pub-cache'],
  tmpdir: '/private/var/folders/tmp',
}

describe('sbplLiteral', () => {
  it('entwertet Anfuehrungszeichen und Rueckstriche', () => {
    expect(sbplLiteral('/a/b"c\\d')).toBe('/a/b\\"c\\\\d')
  })
  it('laesst einen gewoehnlichen Pfad unveraendert', () => {
    expect(sbplLiteral('/Users/x/projekt')).toBe('/Users/x/projekt')
  })
})

describe('sbplRegex', () => {
  it('entwertet Regex-Sonderzeichen', () => {
    expect(sbplRegex('/a/b.c+d')).toBe('/a/b\\.c\\+d')
  })
  it('entwertet Klammern und Anfuehrungszeichen', () => {
    expect(sbplRegex('/a/(b)"c')).toBe('/a/\\(b\\)\\"c')
  })
})

describe('profilText — Grundgeruest', () => {
  const p = profilText(ktx, 'zu')

  it('beginnt mit Version und deny default', () => {
    expect(p.startsWith('(version 1)\n(deny default)')).toBe(true)
  })
  it('erlaubt Prozessstart, sonst laeuft kein Build-Werkzeug', () => {
    expect(p).toContain('(allow process-exec* process-fork)')
  })
  it('erlaubt Lesen grundsaetzlich', () => {
    expect(p).toContain('(allow file-read*)')
  })
  it('erlaubt Schreiben in der Wurzel', () => {
    expect(p).toContain('(allow file-write* (subpath "/Users/x/projekt"))')
  })
  it('verbietet Schreiben in .git, in jeder Tiefe', () => {
    expect(p).toContain('(deny file-write* (regex #"^/Users/x/projekt/(.*/)?\\.git(/|$)"))')
  })
  it('erlaubt jeden mitgegebenen Zwischenspeicher', () => {
    expect(p).toContain('(allow file-write* (subpath "/Users/x/.npm"))')
    expect(p).toContain('(allow file-write* (subpath "/Users/x/.pub-cache"))')
  })
  it('erlaubt TMPDIR', () => {
    expect(p).toContain('(allow file-write* (subpath "/private/var/folders/tmp"))')
  })
})

describe('profilText — Netzmodus', () => {
  it('zu: kein allow network', () => {
    expect(profilText(ktx, 'zu')).not.toContain('allow network')
  })
  it('offen: network-outbound und network-bind', () => {
    const p = profilText(ktx, 'offen')
    expect(p).toContain('(allow network-outbound)')
    expect(p).toContain('(allow network-bind)')
  })
})

describe('Waechter: jedes Leseverbot ist auch ein Schreibverbot', () => {
  // Der Fund vom 2026-08-30: ein deny auf file-read* allein laesst das Ueberschreiben zu —
  // ein Lauf konnte die .env vernichten, ohne sie je gelesen zu haben.
  it('keine deny-Zeile nennt file-read* ohne file-write*', () => {
    const zeilen = profilText(ktx, 'zu').split('\n')
    const nurLesen = zeilen.filter(z => z.includes('(deny file-read*') && !z.includes('file-write*'))
    expect(nurLesen).toEqual([])
  })
})

describe('Waechter: kein Verbot steht vor einer Erlaubnis', () => {
  // Der teuerste Fund dieser Strecke. SBPL entscheidet nach der **zuletzt** passenden Regel:
  // ein `(deny ... .env)` vor `(allow file-write* (subpath <wurzel>))` ist wirkungslos, und im
  // Profiltext sieht es trotzdem nach Schutz aus. Gemessen mit zwei Profilen, die sich nur in
  // der Reihenfolge dieser zwei Zeilen unterschieden: davor gelang `echo > .env`, danach kam
  // 'Operation not permitted'.
  //
  // Dieser Waechter ist der einzige Texttest, der das faengt — alle anderen pruefen, ob eine
  // Zeile *da* ist, und da war sie.
  it('jede allow-Zeile steht vor jeder deny-Zeile', () => {
    const zeilen = profilText(ktx, 'offen').split('\n').map(z => z.trim())
    const istDeny = (z: string): boolean => z.startsWith('(deny') && z !== '(deny default)'
    const letzteErlaubnis = zeilen.findLastIndex(z => z.startsWith('(allow'))
    const erstesVerbot = zeilen.findIndex(istDeny)
    expect(erstesVerbot).toBeGreaterThan(-1)
    expect(letzteErlaubnis).toBeGreaterThan(-1)
    expect(
      erstesVerbot,
      `Verbot in Zeile ${erstesVerbot} steht vor Erlaubnis in Zeile ${letzteErlaubnis} — ` +
      `SBPL nimmt die letzte passende Regel, das Verbot waere wirkungslos.`,
    ).toBeGreaterThan(letzteErlaubnis)
  })
})

describe('Waechter: jedes Verbot ist verankert', () => {
  // Ein globales deny auf *.pem sperrt /etc/ssl/cert.pem und bricht jedes TLS im Kindprozess —
  // also ausgerechnet npm ci.
  it('jede deny-Regel nennt die Wurzel oder das Heim', () => {
    // `(deny default)` ist die Grundregel des Profils und nennt keinen Pfad — sie ist keine der
    // pfadbezogenen Verbotsregeln, gegen die dieser Waechter antritt. Genau diese eine woertliche
    // Zeile faellt heraus, nichts sonst: der Ausschluss ist eng, damit eine Regel, die ihren
    // Anker verliert, weiter auffliegt.
    const zeilen = profilText(ktx, 'zu').split('\n')
      .filter(z => z.trimStart().startsWith('(deny') && z.trim() !== '(deny default)')
    expect(zeilen.length).toBeGreaterThan(0)
    for (const z of zeilen) {
      const verankert = z.includes(ktx.wurzel) || z.includes(ktx.heim)
      expect(verankert, `nicht verankert: ${z}`).toBe(true)
    }
  })
})

describe('profilText — die Verbote der Pfadwache, gespiegelt', () => {
  const p = profilText(ktx, 'zu')
  const alles = p.replace(/\s+/g, ' ')

  it('sperrt ~/.ssh beidseitig', () => {
    expect(alles).toContain('(deny file-read* file-write* (subpath "/Users/x/.ssh"))')
  })
  it('sperrt das userData-Verzeichnis beidseitig', () => {
    expect(alles).toContain(
      '(deny file-read* file-write* (subpath "/Users/x/Library/Application Support/cipher-keel"))',
    )
  })
  it('sperrt ~/.cipher-* beidseitig, in jeder Tiefe', () => {
    // Die Tiefe ist der Punkt: pfadwache prueft den Basename unter dem ganzen Heim-Teilbaum.
    expect(alles).toContain('(deny file-read* file-write* (regex #"^/Users/x/(.*/)?\\.cipher-"))')
  })
  it('sperrt .env unter der Wurzel, in jeder Tiefe', () => {
    expect(alles).toContain('#"^/Users/x/projekt/(.*/)?\\.env(\\..*)?$"')
  })
  it('sperrt Schluesseldateien unter der Wurzel', () => {
    expect(alles).toContain('#"^/Users/x/projekt/(.*/)?(id_rsa|id_ed25519|id_ecdsa|id_dsa)$"')
  })
  it('sperrt Schluesselendungen unter der Wurzel', () => {
    expect(alles).toContain('#"^/Users/x/projekt/(.*/)?[^/]*\\.(pem|key|p12|keystore|jks)$"')
  })
  it('sperrt Shell-Startdateien im Heim, in jeder Tiefe', () => {
    expect(alles).toContain('#"^/Users/x/(.*/)?\\.(zshrc|zprofile|zshenv|bashrc|bash_profile|profile)$"')
  })
})

describe('STANDARD_ZWISCHENSPEICHER', () => {
  it('ist heim-relativ und nennt npm und pub-cache', () => {
    expect(STANDARD_ZWISCHENSPEICHER).toContain('.npm')
    expect(STANDARD_ZWISCHENSPEICHER).toContain('.pub-cache')
    for (const e of STANDARD_ZWISCHENSPEICHER) expect(e.startsWith('/')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness/sandkasten-profil.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/main/harness/sandkasten"`.

**Wichtig:** Ein einzelnes „Modul nicht gefunden" sagt über die einzelnen Tests nichts (Lehre der Kimi-Strecke). Der Beweis, dass diese Tests beissen, folgt in Step 5.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/harness/sandkasten.ts`:

```ts
/**
 * sandkasten — the process boundary, and the only place that writes SBPL.
 *
 * pfadwache checks tool *arguments*; this checks the *process*. Its own header says so, and this
 * module is the "sandbox arrives with the shell" it names. Nothing here parses a command: against
 * a shell a string check is theatre, because `$(...)` and a rewritten npm script walk past it.
 *
 * ASSUMPTION, measured on Darwin 25.4 on 2026-08-30 and not guaranteed beyond it: `sandbox-exec`
 * exists and is enforced. Apple has called it deprecated for years and shipped it for years. If it
 * ever disappears, the answer is a container (Docker was not installed on this machine, which is
 * why it was not the answer in 2026-08) — `profilText` and `starte` are separate exactly so a
 * second implementation can arrive without touching the rules.
 *
 * The profile is generated as text and passed inline via `-p`, not written to a file with `-D`
 * parameters: this way `profilText` is a pure function, testable without ever starting a process,
 * and the rules — the part that can be wrong — are checkable like pfadwache's.
 */

import type { WacheKontext } from './pfadwache'

export interface SandkastenKontext extends WacheKontext {
  /** Absolute write targets outside the root: toolchain caches. Adjustable surface, CK-NFR-012. */
  zwischenspeicher: string[]
  tmpdir: string
}

export type NetzModus = 'zu' | 'offen'

/**
 * Home-relative by design: the list is a statement about tool conventions, not about one machine.
 * Adjustable surface (CK-NFR-012), documented in docs/anpassbare-flaechen.md.
 *
 * Only the root would mean every install fails: `flutter pub get` writes to ~/.pub-cache, `npm ci`
 * to ~/.npm. This is the softest spot in the whole sandbox — every entry is a hole — so it lives
 * in exactly one place, visible, and never grows silently.
 */
export const STANDARD_ZWISCHENSPEICHER = [
  '.npm', '.pub-cache', '.dart', '.flutter', '.cargo/registry', '.gradle',
]

/** For `(subpath "...")` and `(literal "...")`: an SBPL string literal. */
export function sbplLiteral(pfad: string): string {
  return pfad.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * For `#"..."`: an SBPL regex literal. A separate function with its own tests rather than one with
 * a flag — the two escaping rules are genuinely different, and a shared function with a switch is
 * where they would quietly drift into each other.
 */
export function sbplRegex(pfad: string): string {
  return pfad.replace(/[\\^$.|?*+()[\]{}"]/g, '\\$&')
}

export function profilText(ktx: SandkastenKontext, netz: NetzModus): string {
  const w = sbplLiteral(ktx.wurzel)
  const wRe = sbplRegex(ktx.wurzel)
  const hRe = sbplRegex(ktx.heim)

  const zeilen: string[] = [
    '(version 1)',
    '(deny default)',
    '',
    '; Prozesse duerfen starten — sonst laeuft kein Build-Werkzeug',
    '(allow process-exec* process-fork)',
    '(allow signal (target self))',
    '(allow sysctl-read)',
    '(allow mach-lookup)',
    '',
  ]

  if (netz === 'offen') {
    zeilen.push('(allow network-outbound)', '(allow network-bind)', '')
  }

  // ALLE Erlaubnisse zuerst, ALLE Verbote zuletzt. Das ist die tragende Regel dieser Funktion,
  // und sie ist am 2026-08-30 gegen echtes sandbox-exec gemessen worden: **SBPL entscheidet nach
  // der zuletzt passenden Regel**, nicht nach der ersten und nicht "deny gewinnt". Gemessen mit
  // zwei Profilen, die sich nur in der Reihenfolge zweier Zeilen unterschieden:
  //
  //   deny .env  VOR  allow write <wurzel>  ->  echo zerstoert > .env  gelingt
  //   deny .env  NACH allow write <wurzel>  ->  Operation not permitted, Inhalt unveraendert
  //
  // Ein Verbot vor einer umfassenderen Erlaubnis ist also wirkungslos — es sieht im Profiltext
  // aus wie Schutz und ist keiner. Genau deshalb reicht eine Textpruefung ueber diesem Profil
  // nicht: die Reihenfolge ist die Aussage, nicht das Vorhandensein der Zeile.
  zeilen.push(
    '; Lesen: grundsaetzlich ja — die Verbote stehen unten und ueberstimmen das.',
    '(allow file-read*)',
    '',
    '; Schreibziele: die Wurzel und die Zwischenspeicher der Toolchains.',
    `(allow file-write* (subpath "${w}"))`,
    `(allow file-write* (subpath "${sbplLiteral(ktx.tmpdir)}"))`,
  )

  for (const z of ktx.zwischenspeicher) {
    zeilen.push(`(allow file-write* (subpath "${sbplLiteral(z)}"))`)
  }

  zeilen.push(
    '(allow file-write-data (literal "/dev/null"))',
    '',
    '; Ab hier nur noch Verbote, und keine Erlaubnis darf ihnen folgen. Beidseitig, nie nur',
    '; lesend: ein deny auf file-read* allein laesst das Ueberschreiben zu, und dann ist das',
    '; Geheimnis vertraulich und zerstoerbar.',
    `(deny file-read* file-write* (subpath "${sbplLiteral(ktx.heim)}/.ssh"))`,
    `(deny file-read* file-write* (subpath "${sbplLiteral(ktx.userDataPfad)}"))`,
    // `(.*/)?` in jeder dieser Regeln, und das ist keine Kosmetik: pfadwache prueft den
    // **Basename** und `istIn(pfad, heim)` — also jede Tiefe unter dem Heim. Eine Regel ohne
    // dieses Segment traefe nur direkte Kinder, und der Sandkasten waere schwaecher als die
    // Wache, die er spiegeln soll.
    `(deny file-read* file-write* (regex #"^${hRe}/(.*/)?\\.cipher-"))`,
    `(deny file-read* file-write* (regex #"^${hRe}/(.*/)?\\.(zshrc|zprofile|zshenv|bashrc|bash_profile|profile)$"))`,
    `(deny file-read* file-write* (regex #"^${wRe}/(.*/)?\\.env(\\..*)?$"))`,
    `(deny file-read* file-write* (regex #"^${wRe}/(.*/)?(id_rsa|id_ed25519|id_ecdsa|id_dsa)$"))`,
    // Anchored to the root, never global: a global deny on *.pem locks /etc/ssl/cert.pem and
    // breaks TLS in the child — that is, `npm ci` itself.
    `(deny file-read* file-write* (regex #"^${wRe}/(.*/)?[^/]*\\.(pem|key|p12|keystore|jks)$"))`,
    // Jedes `.git`-Segment in jeder Tiefe, nicht bloss `<wurzel>/.git`: pfadwache verwirft einen
    // Pfad, sobald *irgendein* Segment `.git` heisst (pfadwache.ts:101). Ein Submodul oder ein
    // eingebettetes Repo unter `vendor/` waere sonst beschreibbar, waehrend die Wache es
    // verweigert — und die Rueckwegzusage gilt dann nur fuer das oberste Repo. Ein
    // `git reset --hard` naehme ausserdem genau den Rueckweg weg, auf dem die
    // Startvorbedingung beruht.
    `(deny file-write* (regex #"^${wRe}/(.*/)?\\.git(/|$)"))`,
    '',
  )
  return zeilen.join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harness/sandkasten-profil.test.ts`
Expected: PASS, alle Tests.

- [ ] **Step 5: Prove the two guards bite**

Beide Wächter gegen eine absichtlich falsche Fassung fahren — **einzeln**, und die Fassung danach zurücknehmen:

1. In `profilText` die `.env`-Zeile auf `(deny file-read* (regex ...))` kürzen (also `file-write*` streichen). Run: `npx vitest run tests/harness/sandkasten-profil.test.ts -t "keine deny-Zeile nennt file-read* ohne file-write*"` → **muss FAIL sein**. Zurücknehmen.
2. Die `.pem`-Zeile auf `#"[^/]*\\.(pem|key|p12|keystore|jks)$"` kürzen (Anker weg). Run: `npx vitest run tests/harness/sandkasten-profil.test.ts -t "jede deny-Regel nennt die Wurzel oder das Heim"` → **muss FAIL sein**. Zurücknehmen.

Beide Ergebnisse in den Abschlussbericht.

- [ ] **Step 6: Typecheck und Commit**

```bash
npm run typecheck && npx vitest run tests/harness/sandkasten-profil.test.ts
git add src/main/harness/sandkasten.ts tests/harness/sandkasten-profil.test.ts
git commit -m "feat(sandkasten): profilText als reine Funktion, mit zwei Waechtern"
```

---

## Task 2: `starte()` — der Sandkasten gegen ein echtes `sandbox-exec`

**Files:**
- Modify: `src/main/harness/sandkasten.ts`
- Test: `tests/harness/sandkasten-lauf.test.ts`

**Interfaces:**
- Consumes: `profilText`, `SandkastenKontext`, `NetzModus` aus Task 1; `getEnhancedPath` aus `../util/exec-util`
- Produces:
  - `interface SandkastenLauf { ausgabe: string; code: number | null; abgeschnitten: boolean; zeitueberschreitung: boolean }`
  - `function starte(kommando: string, ktx: SandkastenKontext, netz: NetzModus, zeitgrenzeMs?: number): Promise<SandkastenLauf>`
  - `const STANDARD_ZEITGRENZE_MS = 120_000`
  - `const MAX_AUSGABE_BYTES = 64 * 1024`

- [ ] **Step 1: Write the failing test**

Create `tests/harness/sandkasten-lauf.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { starte, type SandkastenKontext } from '../../src/main/harness/sandkasten'

let heim: string
let wurzel: string
let ktx: SandkastenKontext

beforeAll(() => {
  heim = realpathSync(mkdtempSync(join(tmpdir(), 'keel-sb-')))
  wurzel = join(heim, 'projekt')
  mkdirSync(join(wurzel, '.git'), { recursive: true })
  mkdirSync(join(heim, '.ssh'), { recursive: true })
  writeFileSync(join(wurzel, '.git', 'HEAD'), 'historie')
  writeFileSync(join(wurzel, '.env'), 'GEHEIM=original')
  writeFileSync(join(wurzel, 'a.ts'), 'export const a = 1')
  // Ein Inhalt, der in keinem Pfad vorkommen kann. 'privat' waere hier falsch: die kanonisierte
  // Temp-Wurzel dieses Rechners heisst /private/var/..., und eine Zusicherung
  // `not.toContain('privat')` pruefte dann den Pfad in der Fehlermeldung statt den Schluessel.
  writeFileSync(join(heim, '.ssh', 'id_rsa'), 'SCHLUESSELMATERIAL-Q7X')
  writeFileSync(join(heim, '.cipher-test.env'), 'TOKEN=GEHEIM-Q7X')
  mkdirSync(join(heim, 'fremd'), { recursive: true })
  writeFileSync(join(heim, 'fremd', 'wichtig.txt'), 'wichtige arbeit')
  // Ein eigenes Verzeichnis, **nicht** die OS-Temp-Wurzel: `realpathSync(tmpdir())` ist der
  // Vorfahr dieses ganzen Testbaums, und `(allow file-write* (subpath <tmpdir>))` machte damit
  // jede Grenze des Profils gegenstandslos — der fremde Baum und `.git` lagen darunter. In der
  // Produktion ist TMPDIR (/var/folders/...) kein Vorfahr einer Projektwurzel; die Fixture muss
  // dieselbe Lage herstellen, sonst prueft sie einen Fall, den es nicht gibt.
  const eigenesTmp = join(heim, 'tmp')
  mkdirSync(eigenesTmp, { recursive: true })
  ktx = {
    wurzel, heim,
    userDataPfad: join(heim, 'Library', 'Application Support', 'cipher-keel'),
    zwischenspeicher: [],
    tmpdir: eigenesTmp,
  }
})

afterAll(() => rmSync(heim, { recursive: true, force: true }))

// sandbox-exec gibt es nur auf macOS.
describe.skipIf(process.platform !== 'darwin')('starte — die Grenze haelt', () => {
  it('schreibt in der Wurzel', async () => {
    const r = await starte(`echo neu > ${wurzel}/b.ts`, ktx, 'zu')
    expect(r.code).toBe(0)
    expect(readFileSync(join(wurzel, 'b.ts'), 'utf-8')).toBe('neu\n')
  })

  it('schreibt nicht ausserhalb der Wurzel', async () => {
    const ziel = join(heim, 'verboten.txt')
    const r = await starte(`echo raus > ${ziel}`, ktx, 'zu')
    expect(r.code).not.toBe(0)
    expect(r.ausgabe).toContain('Operation not permitted')
    expect(() => readFileSync(ziel, 'utf-8')).toThrow()
  })

  it('loescht keinen fremden Baum', async () => {
    const r = await starte(`rm -rf ${heim}/fremd`, ktx, 'zu')
    expect(r.code).not.toBe(0)
    expect(readFileSync(join(heim, 'fremd', 'wichtig.txt'), 'utf-8')).toBe('wichtige arbeit\n')
  })

  it('schreibt nicht in .git', async () => {
    const r = await starte(`echo kaputt > ${wurzel}/.git/HEAD`, ktx, 'zu')
    expect(r.code).not.toBe(0)
    expect(readFileSync(join(wurzel, '.git', 'HEAD'), 'utf-8')).toBe('historie')
  })

  it('loescht .git nicht', async () => {
    const r = await starte(`rm -rf ${wurzel}/.git`, ktx, 'zu')
    expect(r.code).not.toBe(0)
    expect(readFileSync(join(wurzel, '.git', 'HEAD'), 'utf-8')).toBe('historie')
  })

  it('liest die .env der Wurzel nicht', async () => {
    const r = await starte(`cat ${wurzel}/.env`, ktx, 'zu')
    expect(r.ausgabe).not.toContain('original')
    expect(r.ausgabe).toContain('Operation not permitted')
  })

  it('ueberschreibt die .env der Wurzel nicht', async () => {
    const r = await starte(`echo zerstoert > ${wurzel}/.env`, ktx, 'zu')
    expect(r.code).not.toBe(0)
    expect(readFileSync(join(wurzel, '.env'), 'utf-8')).toBe('GEHEIM=original\n')
  })

  it('liest keinen SSH-Schluessel', async () => {
    const r = await starte(`cat ${heim}/.ssh/id_rsa`, ktx, 'zu')
    expect(r.ausgabe).not.toContain('SCHLUESSELMATERIAL-Q7X')
  })

  it('liest keine .cipher-Datei', async () => {
    const r = await starte(`cat ${heim}/.cipher-test.env`, ktx, 'zu')
    expect(r.ausgabe).not.toContain('GEHEIM-Q7X')
  })

  it('liest gewoehnlichen Quelltext', async () => {
    const r = await starte(`cat ${wurzel}/a.ts`, ktx, 'zu')
    expect(r.code).toBe(0)
    expect(r.ausgabe).toContain('export const a = 1')
  })
})

describe.skipIf(process.platform !== 'darwin')('starte — Netz', () => {
  it('zu: kein Socket', async () => {
    const r = await starte(
      'curl -s -m 8 -o /dev/null -w "%{http_code}" https://example.com', ktx, 'zu',
    )
    expect(r.ausgabe.trim()).toContain('000')
  }, 20_000)

  it('offen: erreicht das Netz', async () => {
    const r = await starte(
      'curl -s -m 8 -o /dev/null -w "%{http_code}" https://example.com', ktx, 'offen',
    )
    expect(r.ausgabe.trim()).toContain('200')
  }, 20_000)
})

describe.skipIf(process.platform !== 'darwin')('starte — Grenzen des Laufs', () => {
  it('bricht bei Zeitueberschreitung ab und sagt es', async () => {
    const r = await starte('sleep 5', ktx, 'zu', 300)
    expect(r.zeitueberschreitung).toBe(true)
  }, 20_000)

  it('bindet die Wanduhr auch bei einem Kommando, das forkt', async () => {
    // Der Fall, der die Zeitgrenze wirklich braucht. `sleep 5` allein prueft die eine Form, die
    // die Shell mit `exec` an sich zieht — dort genuegt ein Kill auf die eine Pid, und der Test
    // war gruen, waehrend die Grenze fuer jede Pipeline und jeden Hintergrundjob nicht band.
    // Gemessen ohne Gruppenkill: 5024 ms bei 300 ms Grenze, mit `zeitueberschreitung: true`.
    // Die Wanduhr ist darum die Zusicherung, nicht die Flagge.
    const t0 = Date.now()
    const r = await starte('sleep 5 | cat', ktx, 'zu', 300)
    expect(r.zeitueberschreitung).toBe(true)
    expect(Date.now() - t0).toBeLessThan(2000)
  }, 20_000)

  it('deckelt die Ausgabe und sagt es', async () => {
    const r = await starte('yes abcdefgh | head -c 200000', ktx, 'zu')
    expect(r.abgeschnitten).toBe(true)
    expect(r.ausgabe.length).toBeLessThanOrEqual(64 * 1024)
  }, 20_000)

  it('arbeitet in der Wurzel', async () => {
    const r = await starte('pwd', ktx, 'zu')
    expect(r.ausgabe.trim()).toBe(wurzel)
  })

  it('gibt dem Kind kein Umgebungsgeheimnis mit', async () => {
    process.env.KEEL_TEST_GEHEIMNIS = 'darf-nicht-durch'
    try {
      const r = await starte('echo "[$KEEL_TEST_GEHEIMNIS]"', ktx, 'zu')
      expect(r.ausgabe).not.toContain('darf-nicht-durch')
      expect(r.ausgabe).toContain('[]')
    } finally {
      delete process.env.KEEL_TEST_GEHEIMNIS
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness/sandkasten-lauf.test.ts`
Expected: FAIL — `starte is not a function` / kein Export `starte`.

- [ ] **Step 3: Write minimal implementation**

An `src/main/harness/sandkasten.ts` anhängen:

```ts
import { spawn } from 'node:child_process'
import { getEnhancedPath } from '../util/exec-util'

/** Wall-clock ceiling for one command. Adjustable surface (CK-NFR-012). */
export const STANDARD_ZEITGRENZE_MS = 120_000

/**
 * Output cap. Not comfort: the output goes into the model context. An `npm ci` with 4 MB of
 * output blows a local 27B model's window in a single turn, and then the test track measures who
 * guessed `--silent`.
 */
export const MAX_AUSGABE_BYTES = 64 * 1024

export interface SandkastenLauf {
  /** stdout and stderr, interleaved in arrival order, capped at MAX_AUSGABE_BYTES. */
  ausgabe: string
  code: number | null
  abgeschnitten: boolean
  zeitueberschreitung: boolean
}

export function starte(
  kommando: string,
  ktx: SandkastenKontext,
  netz: NetzModus,
  zeitgrenzeMs: number = STANDARD_ZEITGRENZE_MS,
): Promise<SandkastenLauf> {
  const profil = profilText(ktx, netz)
  return new Promise((aufloesen) => {
    // A minimal environment, not process.env: the main process carries API keys, and a child that
    // inherits them can write them into the project tree. PATH is passed explicitly rather than
    // relied upon — a macOS GUI app does not inherit the shell PATH (see exec-util.ts), so without
    // this `npm` is simply not found.
    const kind = spawn(
      '/usr/bin/sandbox-exec',
      ['-p', profil, '/bin/sh', '-c', kommando],
      {
        cwd: ktx.wurzel,
        // `detached` makes the child a process *group* leader, and that is what makes the wall
        // clock below binding. Without it, `kill` reaches only the `sandbox-exec` pid: for a
        // command the shell can `exec` in place that is the same process and it works, but any
        // command that forks — a pipeline, a background job, i.e. every real build tool — leaves
        // grandchildren holding the stdout pipe open, and `close` does not fire until they finish
        // on their own. Measured on 2026-08-30 against a 300 ms limit: `sleep 5` ended after
        // 306 ms, `sleep 5 | cat` after 5024 ms with the flag already claiming a timeout.
        detached: true,
        env: {
          PATH: getEnhancedPath(),
          HOME: ktx.heim,
          TMPDIR: ktx.tmpdir,
          LANG: process.env.LANG ?? 'en_US.UTF-8',
        },
      },
    )

    let ausgabe = ''
    let abgeschnitten = false
    let zeitueberschreitung = false

    const sammle = (stueck: Buffer): void => {
      if (abgeschnitten) return
      ausgabe += stueck.toString('utf-8')
      if (ausgabe.length > MAX_AUSGABE_BYTES) {
        ausgabe = ausgabe.slice(0, MAX_AUSGABE_BYTES)
        abgeschnitten = true
      }
    }
    kind.stdout.on('data', sammle)
    kind.stderr.on('data', sammle)

    const wecker = setTimeout(() => {
      zeitueberschreitung = true
      // The negated pid is the process *group*, which is the whole point of `detached` above.
      // Wrapped, because the group can already be gone between the timer firing and the signal
      // (ESRCH) — and a throw here would escape the promise instead of ending the run.
      try { process.kill(-kind.pid!, 'SIGKILL') } catch { /* schon beendet */ }
    }, zeitgrenzeMs)

    kind.on('error', (err) => {
      clearTimeout(wecker)
      aufloesen({ ausgabe: String(err), code: null, abgeschnitten, zeitueberschreitung })
    })
    kind.on('close', (code) => {
      clearTimeout(wecker)
      aufloesen({ ausgabe, code, abgeschnitten, zeitueberschreitung })
    })
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harness/sandkasten-lauf.test.ts`
Expected: PASS.

Wenn *„liest die .env der Wurzel nicht"* scheitert, weil die Meldung anders lautet: die Behauptung `not.toContain('original')` ist die tragende — den Meldungstext anpassen, **nicht** die Inhaltsprüfung.

- [ ] **Step 5: Prove it bites**

In `profilText` vorübergehend `(deny file-write* (subpath "…/.git"))` streichen.
Run: `npx vitest run tests/harness/sandkasten-lauf.test.ts -t "schreibt nicht in .git"` → **muss FAIL sein**. Zurücknehmen, Ergebnis in den Bericht.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npx vitest run tests/harness/sandkasten-lauf.test.ts
git add src/main/harness/sandkasten.ts tests/harness/sandkasten-lauf.test.ts
git commit -m "feat(sandkasten): starte() gegen ein echtes sandbox-exec, zwoelf Proben"
```

---

## Task 3: Das Ereignis `tool.entschieden` und seine Sichtbarkeit

**Files:**
- Modify: `src/main/harness/ereignisse.ts`
- Modify: `src/renderer/components/harness/EreignisPanel.tsx:13-27` (Farbtabelle), `:29-67` (`kurzfassung`)
- Test: `tests/renderer/ereignis-panel.test.ts` (bestehender Wächter, läuft über `EREIGNIS_ARTEN`)

**Interfaces:**
- Produces: Ereignisart `'tool.entschieden'`, Nutzlast `{ aufrufId: string; name: string; erlaubt: boolean; grund: string }`

- [ ] **Step 1: Run the existing guard to see it green**

Run: `npx vitest run tests/renderer/ereignis-panel.test.ts`
Expected: PASS — das ist der Ausgangszustand, gegen den Step 3 rot wird.

- [ ] **Step 2: Add the event type, and watch the guard fail**

In `src/main/harness/ereignisse.ts`, nach `'tool.schema_loaded',` einfügen:

```ts
  /**
   * Nutzlast `{aufrufId, name, erlaubt, grund}`. Die Entscheidung zwischen Ankuendigung und
   * Wirkung, geschrieben fuer jedes wirkende Werkzeug (tor.ts).
   *
   * Eigenes Ereignis und kein Feld an `tool.intent`: der Intent wird geschrieben, *bevor*
   * entschieden ist — nachtraeglich ein Feld hineinzuschreiben hiesse, ein Ereignis zu aendern,
   * das schon steht. Ein abgelehnter Aufruf war vorher nur an einer ausbleibenden Wirkung zu
   * erkennen, also gar nicht.
   */
  'tool.entschieden',
```

Run: `npx vitest run tests/renderer/ereignis-panel.test.ts`
Expected: **FAIL** — `tool.entschieden hat eine Farbe` und `tool.entschieden hat eine nicht-leere Kurzfassung`.

Das ist der Beweis, dass der Wächter beisst — er ist hier ohne Zutun rot geworden.

- [ ] **Step 3: Make the panel show it**

In `src/renderer/components/harness/EreignisPanel.tsx`, in `FARBE` nach `'tool.schema_loaded'`:

```ts
  // Nicht `#e0af68` — das ist `tool.intent`, und genau diese beiden stehen fuer denselben
  // Aufruf direkt untereinander. Zwei gleiche Farben ausgerechnet dort heben die Farbspalte
  // fuer das eine Paar auf, fuer das sie gebaut ist. Magenta ist in dieser Tabelle unbenutzt
  // und von Gelb auf einen Blick zu unterscheiden.
  'tool.entschieden': '#ff007c',
```

In `kurzfassung`, nach dem Fall `'tool.schema_loaded'`:

```ts
    case 'tool.entschieden':
      // Ja/Nein zuerst: das ist die Frage, die ein Mensch an diese Zeile hat. Der Grund steht
      // dahinter, weil er nur bei einem Nein etwas aussagt.
      return n.erlaubt === true
        ? `${String(n.name)} erlaubt`
        : `${String(n.name)} ABGELEHNT: ${String(n.grund)}`
```

- [ ] **Step 4: Beide Zweige der Kurzfassung belegen**

Der Reihen-Wächter läuft über `EREIGNIS_ARTEN` mit einer gemeinsamen Nutzlast, die kein `erlaubt`
trägt — er trifft damit **nur** den Ablehnungszweig. Der Ja-Zweig ginge ungeprüft ins Feld, und er
ist der häufigere. Zwei Tests dazu, neben den bestehenden Einzelfällen (`nennt bei skill.geladen…`):

```ts
  it('nennt bei tool.entschieden zuerst das Urteil, nicht den Grund', () => {
    const e = { art: 'tool.entschieden', nutzlast: { aufrufId: 'a1', name: 'datei_schreiben', erlaubt: true, grund: 'Pfad liegt in der Wurzel' } }
    expect(kurzfassung(e as never)).toBe('datei_schreiben erlaubt')
  })

  it('nennt bei einer Ablehnung den Grund, weil nur dort einer etwas aussagt', () => {
    const e = { art: 'tool.entschieden', nutzlast: { aufrufId: 'a1', name: 'datei_schreiben', erlaubt: false, grund: 'Pfad liegt ausserhalb der Wurzel' } }
    expect(kurzfassung(e as never)).toBe('datei_schreiben ABGELEHNT: Pfad liegt ausserhalb der Wurzel')
  })
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/renderer/ereignis-panel.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npx vitest run tests/renderer/ereignis-panel.test.ts
git add src/main/harness/ereignisse.ts src/renderer/components/harness/EreignisPanel.tsx tests/renderer/ereignis-panel.test.ts
git commit -m "feat(protokoll): tool.entschieden als eigene Ereignisart, im Panel sichtbar"
```

---

## Task 4: `tor.ts` — die Entscheidungsstelle als reine Funktion

**Files:**
- Create: `src/main/harness/tor.ts`
- Test: `tests/harness/tor.test.ts`

**Interfaces:**
- Consumes: `pruefePfad`, `WacheKontext` aus `./pfadwache`; `Ereignis` aus `./ereignisse`
- Produces:
  - `const WIRKENDE_WERKZEUGE: ReadonlySet<string>` — `datei_schreiben`, `datei_loeschen`, `shell_ausfuehren`
  - `function istWirkend(name: string): boolean`
  - `type Urteil = { erlaubt: boolean; grund: string }` — **ein** Objekt, keine Union: der Grund
    steht in beiden Fällen, weil auch ein Ja begründet ins Protokoll gehört. Wer nur Ablehnungen
    begründet, macht aus einem geprüften Ja ein ungeprüftes.
  - `function entscheide(name: string, eingabe: Record<string, unknown>, wache: WacheKontext): Urteil`
  - `function effekteOhneEntscheidung(ereignisse: Ereignis[]): Ereignis[]`

- [ ] **Step 1: Write the failing test**

Create `tests/harness/tor.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  WIRKENDE_WERKZEUGE, istWirkend, entscheide, effekteOhneEntscheidung,
} from '../../src/main/harness/tor'
import type { Ereignis } from '../../src/main/harness/ereignisse'

let heim: string
let wurzel: string
let wache: { wurzel: string; heim: string; userDataPfad: string }

beforeAll(() => {
  heim = realpathSync(mkdtempSync(join(tmpdir(), 'keel-tor-')))
  wurzel = join(heim, 'projekt')
  mkdirSync(wurzel, { recursive: true })
  wache = { wurzel, heim, userDataPfad: join(heim, 'userData') }
})
afterAll(() => rmSync(heim, { recursive: true, force: true }))

describe('WIRKENDE_WERKZEUGE', () => {
  it('nennt genau die drei wirkenden Werkzeuge', () => {
    expect([...WIRKENDE_WERKZEUGE].sort()).toEqual(
      ['datei_loeschen', 'datei_schreiben', 'shell_ausfuehren'],
    )
  })
  it('istWirkend sagt bei einem lesenden Werkzeug nein', () => {
    expect(istWirkend('datei_lesen')).toBe(false)
    expect(istWirkend('datei_schreiben')).toBe(true)
  })
})

describe('entscheide — datei_schreiben', () => {
  it('erlaubt einen Pfad in der Wurzel', () => {
    const u = entscheide('datei_schreiben', { pfad: 'src/a.ts', inhalt: 'x' }, wache)
    expect(u.erlaubt).toBe(true)
  })
  it('lehnt einen Pfad ausserhalb der Wurzel ab, mit Grund', () => {
    const u = entscheide('datei_schreiben', { pfad: '/etc/hosts', inhalt: 'x' }, wache)
    expect(u.erlaubt).toBe(false)
    expect(u.grund).toContain('ausserhalb der Wurzel')
  })
  it('lehnt eine .env ab, auch in der Wurzel', () => {
    const u = entscheide('datei_schreiben', { pfad: '.env', inhalt: 'x' }, wache)
    expect(u.erlaubt).toBe(false)
    expect(u.grund).toContain('geschuetzt')
  })
  it('lehnt einen Pfad unter .git ab', () => {
    const u = entscheide('datei_schreiben', { pfad: '.git/HEAD', inhalt: 'x' }, wache)
    expect(u.erlaubt).toBe(false)
  })
  it('lehnt eine fehlende Pfadangabe ab, statt sie durchzulassen', () => {
    const u = entscheide('datei_schreiben', { inhalt: 'x' }, wache)
    expect(u.erlaubt).toBe(false)
    expect(u.grund).toContain('pfad')
  })
})

describe('entscheide — datei_loeschen', () => {
  it('lehnt einen Pfad ausserhalb der Wurzel ab', () => {
    expect(entscheide('datei_loeschen', { pfad: '/etc/hosts' }, wache).erlaubt).toBe(false)
  })
  it('erlaubt einen Pfad in der Wurzel', () => {
    expect(entscheide('datei_loeschen', { pfad: 'weg.ts' }, wache).erlaubt).toBe(true)
  })
})

describe('entscheide — shell_ausfuehren', () => {
  it('erlaubt jedes Kommando: die Grenze setzt der Sandkasten, nicht das Tor', () => {
    const u = entscheide('shell_ausfuehren', { kommando: 'rm -rf /' }, wache)
    expect(u.erlaubt).toBe(true)
  })
  it('nennt den Sandkasten als Grund, damit das Protokoll nicht schweigt', () => {
    const u = entscheide('shell_ausfuehren', { kommando: 'npm test' }, wache)
    expect(u.grund).toContain('Sandkasten')
  })
  it('lehnt ein fehlendes Kommando ab', () => {
    expect(entscheide('shell_ausfuehren', {}, wache).erlaubt).toBe(false)
  })
})

function e(art: Ereignis['art'], nutzlast: Record<string, unknown>): Ereignis {
  return { laufId: 'l', seq: 0, ts: '2026-08-30T00:00:00Z', art, nutzlast }
}

describe('effekteOhneEntscheidung', () => {
  it('findet ein completed eines wirkenden Werkzeugs ohne vorherige Entscheidung', () => {
    const v = effekteOhneEntscheidung([
      e('tool.intent', { aufrufId: '1', name: 'datei_schreiben' }),
      e('tool.completed', { aufrufId: '1', name: 'datei_schreiben' }),
    ])
    expect(v).toHaveLength(1)
  })
  it('laesst eine vollstaendige Kette durch', () => {
    const v = effekteOhneEntscheidung([
      e('tool.intent', { aufrufId: '1', name: 'datei_schreiben' }),
      e('tool.entschieden', { aufrufId: '1', name: 'datei_schreiben', erlaubt: true, grund: 'ok' }),
      e('tool.completed', { aufrufId: '1', name: 'datei_schreiben' }),
    ])
    expect(v).toEqual([])
  })
  it('verlangt von einem lesenden Werkzeug keine Entscheidung', () => {
    const v = effekteOhneEntscheidung([
      e('tool.intent', { aufrufId: '1', name: 'datei_lesen' }),
      e('tool.completed', { aufrufId: '1', name: 'datei_lesen' }),
    ])
    expect(v).toEqual([])
  })
  it('achtet auf die Reihenfolge — eine Entscheidung danach zaehlt nicht', () => {
    const v = effekteOhneEntscheidung([
      e('tool.completed', { aufrufId: '1', name: 'datei_schreiben' }),
      e('tool.entschieden', { aufrufId: '1', name: 'datei_schreiben', erlaubt: true, grund: 'ok' }),
    ])
    expect(v).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness/tor.test.ts`
Expected: FAIL — `Failed to resolve import ".../tor"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/harness/tor.ts`:

```ts
/**
 * tor — announcement, decision, effect. The place that can say no.
 *
 * The predecessor `intent-vor-effekt.ts` is a *checker*: `effekteOhneIntent` is a pure function
 * over the log with no production caller, and the invariant it guards is produced in lauf.ts. For
 * a writing or executing tool that is not enough — there the decision has to be able to refuse,
 * and the refusal has to be readable afterwards.
 *
 * That the gate always says yes for `shell_ausfuehren` is not a sham: it genuinely refuses for the
 * other two and writes the refusal. A place that can say no for two of three inputs is a gate; one
 * that can for none was the finding.
 *
 * There is deliberately no rule over a shell *command* here. Against a shell a string check is
 * theatre — `$(...)` and a rewritten npm script walk past it — and the boundary is the sandbox.
 */

import { pruefePfad, type WacheKontext } from './pfadwache'
import type { Ereignis } from './ereignisse'

/**
 * The tools that have an effect. One source, three consumers: the gate, the Single-Writer rule in
 * lauf.ts, and the git precondition at run start. Three separate lists would drift, and the drift
 * would show up as a run that writes without a decision.
 */
export const WIRKENDE_WERKZEUGE: ReadonlySet<string> = new Set([
  'datei_schreiben', 'datei_loeschen', 'shell_ausfuehren',
])

export function istWirkend(name: string): boolean {
  return WIRKENDE_WERKZEUGE.has(name)
}

export type Urteil = { erlaubt: boolean; grund: string }

export function entscheide(
  name: string, eingabe: Record<string, unknown>, wache: WacheKontext,
): Urteil {
  if (name === 'shell_ausfuehren') {
    const k = eingabe.kommando
    if (typeof k !== 'string' || k === '') {
      return { erlaubt: false, grund: `Das Feld 'kommando' fehlt in der Eingabe.` }
    }
    // Named, not silent: the log must say why this was allowed, otherwise a reader cannot tell an
    // examined yes from an unexamined one.
    return { erlaubt: true, grund: 'Die Grenze setzt der Sandkasten, nicht das Tor.' }
  }

  const pfad = eingabe.pfad
  if (typeof pfad !== 'string' || pfad === '') {
    return { erlaubt: false, grund: `Das Feld 'pfad' fehlt in der Eingabe.` }
  }
  const w = pruefePfad(pfad, wache)
  if (!w.ok) return { erlaubt: false, grund: w.grund }
  return { erlaubt: true, grund: 'Pfad liegt in der Wurzel und ist nicht geschuetzt.' }
}

/**
 * Every `tool.completed`/`tool.failed` of a *wirkendes* tool whose `aufrufId` has no preceding
 * `tool.entschieden`. Sibling of `effekteOhneIntent`, same shape and same reason — order matters,
 * a decision that appears afterwards does not cover the effect.
 *
 * Reading tools are not required to have one: laying the chain over them too would spend an event
 * on every read whose answer is always yes. The log would get longer and not truer.
 */
export function effekteOhneEntscheidung(ereignisse: Ereignis[]): Ereignis[] {
  const entschieden = new Set<string>()
  const verletzungen: Ereignis[] = []
  for (const e of ereignisse) {
    if (e.art === 'tool.entschieden') {
      entschieden.add(String(e.nutzlast.aufrufId))
      continue
    }
    if (e.art !== 'tool.completed' && e.art !== 'tool.failed') continue
    if (!istWirkend(String(e.nutzlast.name))) continue
    if (!entschieden.has(String(e.nutzlast.aufrufId))) verletzungen.push(e)
  }
  return verletzungen
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harness/tor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && npx vitest run tests/harness/tor.test.ts
git add src/main/harness/tor.ts tests/harness/tor.test.ts
git commit -m "feat(tor): die Entscheidungsstelle, die auch nein sagen kann"
```

---

## Task 5: `datei_schreiben` und `datei_loeschen`

**Files:**
- Create: `src/main/harness/werkzeug-schreiben.ts`
- Test: `tests/harness/werkzeug-schreiben.test.ts`

**Interfaces:**
- Consumes: `Werkzeug`, `WerkzeugErgebnis`, `WerkzeugKontext` aus `./werkzeuge`; `pruefePfad` aus `./pfadwache`
- Produces: `const SCHREIB_WERKZEUGE: Werkzeug[]`

**Hinweis zur Doppelprüfung:** Die Pfadwache läuft hier **noch einmal**, obwohl das Tor sie schon gefragt hat. Das ist Absicht und kein Versehen: das Werkzeug ist auch dann richtig, wenn es jemand später ohne Tor aufruft, und die Prüfung liefert den aufgelösten Pfad, den das Schreiben braucht.

- [ ] **Step 1: Write the failing test**

Create `tests/harness/werkzeug-schreiben.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SCHREIB_WERKZEUGE } from '../../src/main/harness/werkzeug-schreiben'
import type { WerkzeugKontext } from '../../src/main/harness/werkzeuge'

const schreiben = SCHREIB_WERKZEUGE.find(w => w.name === 'datei_schreiben')!
const loeschen = SCHREIB_WERKZEUGE.find(w => w.name === 'datei_loeschen')!

let heim: string
let wurzel: string
let ktx: WerkzeugKontext

beforeEach(() => {
  heim = realpathSync(mkdtempSync(join(tmpdir(), 'keel-schr-')))
  wurzel = join(heim, 'projekt')
  mkdirSync(wurzel, { recursive: true })
  mkdirSync(join(heim, 'geheim'), { recursive: true })
  writeFileSync(join(heim, 'geheim', 'ziel.txt'), 'unberuehrt')
  ktx = {
    wache: { wurzel, heim, userDataPfad: join(heim, 'userData') },
    graphDb: null,
  }
})
afterEach(() => rmSync(heim, { recursive: true, force: true }))

describe('datei_schreiben', () => {
  it('legt eine Datei an', async () => {
    const r = await schreiben.ausfuehren({ pfad: 'a.ts', inhalt: 'export const a = 1' }, ktx)
    expect(r.ok).toBe(true)
    expect(readFileSync(join(wurzel, 'a.ts'), 'utf-8')).toBe('export const a = 1')
  })

  it('legt fehlende Elternverzeichnisse an', async () => {
    const r = await schreiben.ausfuehren({ pfad: 'src/tief/b.ts', inhalt: 'x' }, ktx)
    expect(r.ok).toBe(true)
    expect(readFileSync(join(wurzel, 'src', 'tief', 'b.ts'), 'utf-8')).toBe('x')
  })

  it('ersetzt eine bestehende Datei vollstaendig', async () => {
    writeFileSync(join(wurzel, 'c.ts'), 'alt und laenger')
    await schreiben.ausfuehren({ pfad: 'c.ts', inhalt: 'neu' }, ktx)
    expect(readFileSync(join(wurzel, 'c.ts'), 'utf-8')).toBe('neu')
  })

  it('lehnt einen Pfad ausserhalb der Wurzel ab, ohne zu schreiben', async () => {
    const ziel = join(heim, 'geheim', 'ziel.txt')
    const r = await schreiben.ausfuehren({ pfad: ziel, inhalt: 'zerstoert' }, ktx)
    expect(r.ok).toBe(false)
    expect(readFileSync(ziel, 'utf-8')).toBe('unberuehrt')
  })

  it('lehnt .env ab, auch in der Wurzel', async () => {
    const r = await schreiben.ausfuehren({ pfad: '.env', inhalt: 'x' }, ktx)
    expect(r.ok).toBe(false)
    expect(existsSync(join(wurzel, '.env'))).toBe(false)
  })

  it('folgt keinem Symlink aus der Wurzel heraus', async () => {
    // Was dieser Test belegt, ist die **Pfadwache**, nicht O_NOFOLLOW: `pruefePfad` loest den
    // Symlink auf, sieht ein Ziel ausserhalb der Wurzel und lehnt ab — `openSync` wird nie
    // erreicht. O_NOFOLLOW greift nur bei einem Tausch *nach* der Aufloesung, und diesen Fall
    // belegt kein Test dieser Strecke (siehe den Kommentar an `dateiSchreiben`).
    symlinkSync(join(heim, 'geheim', 'ziel.txt'), join(wurzel, 'abkuerzung.txt'))
    const r = await schreiben.ausfuehren({ pfad: 'abkuerzung.txt', inhalt: 'zerstoert' }, ktx)
    expect(r.ok).toBe(false)
    expect(readFileSync(join(heim, 'geheim', 'ziel.txt'), 'utf-8')).toBe('unberuehrt')
  })

  it('nennt ein fehlendes Feld statt still nichts zu tun', async () => {
    const r = await schreiben.ausfuehren({ inhalt: 'x' }, ktx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('pfad')
  })

  it('verlangt inhalt als Zeichenkette', async () => {
    const r = await schreiben.ausfuehren({ pfad: 'a.ts' }, ktx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('inhalt')
  })

  it('nennt seine Quelle als lokal', async () => {
    const r = await schreiben.ausfuehren({ pfad: 'a.ts', inhalt: 'x' }, ktx)
    // Unbedingt, nicht bloss hinter `if (r.ok)`: sonst besteht der Test auch dann, wenn das
    // Schreiben scheiterte — und ein Test, der im Fehlerfall nichts zusichert, prueft nichts.
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.quelle).toBe('lokal')
  })
})

describe('datei_loeschen', () => {
  it('loescht eine Datei in der Wurzel', async () => {
    writeFileSync(join(wurzel, 'weg.ts'), 'x')
    const r = await loeschen.ausfuehren({ pfad: 'weg.ts' }, ktx)
    expect(r.ok).toBe(true)
    expect(existsSync(join(wurzel, 'weg.ts'))).toBe(false)
  })

  it('loescht nichts ausserhalb der Wurzel', async () => {
    const r = await loeschen.ausfuehren({ pfad: join(heim, 'geheim', 'ziel.txt') }, ktx)
    expect(r.ok).toBe(false)
    expect(existsSync(join(heim, 'geheim', 'ziel.txt'))).toBe(true)
  })

  it('loescht kein Verzeichnis — dafuer gibt es die Shell mit ihrer Grenze', async () => {
    mkdirSync(join(wurzel, 'ordner'), { recursive: true })
    const r = await loeschen.ausfuehren({ pfad: 'ordner' }, ktx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('Verzeichnis')
    expect(existsSync(join(wurzel, 'ordner'))).toBe(true)
  })

  it('nennt eine fehlende Datei statt zu schweigen', async () => {
    const r = await loeschen.ausfuehren({ pfad: 'gibtsnicht.ts' }, ktx)
    expect(r.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness/werkzeug-schreiben.test.ts`
Expected: FAIL — `Failed to resolve import ".../werkzeug-schreiben"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/harness/werkzeug-schreiben.ts`:

```ts
/**
 * werkzeug-schreiben — writing and deleting, in-process, never through a shell.
 *
 * Same layer as werkzeug-datei.ts and the same reason: these resolve their own path argument, so
 * pfadwache over that argument *is* the boundary. The sandbox is for the child process; it cannot
 * apply here, because the main process must be able to write where keel writes.
 *
 * pfadwache runs here as well, although tor.ts already asked it. That is deliberate: the tool
 * stays correct if a later caller invokes it without the gate, and the check hands back the
 * resolved path that the write needs anyway.
 *
 * Whole files, no search-and-replace. keel's own purpose decides this: the test track measures the
 * *cheap* tier, and a tool that demands exact string matching is one that weak models miss
 * systematically — then the track measures aim at the tool instead of ability at the workpiece.
 * The counter-argument is real and recorded in the spec (a 500-line file must be rewritten whole,
 * and a small output window tears): if the measurement shows it, an edit tool follows *with
 * evidence*, not on suspicion.
 */

import { closeSync, constants, mkdirSync, openSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import { pruefePfad } from './pfadwache'
import type { Werkzeug, WerkzeugErgebnis, WerkzeugKontext } from './werkzeuge'

function fehlendesFeld(feld: string): WerkzeugErgebnis {
  return { ok: false, meldung: `Das Feld '${feld}' fehlt in der Eingabe.` }
}

const dateiSchreiben: Werkzeug = {
  name: 'datei_schreiben',
  beschreibung: 'Schreibt eine Datei in der Projektwurzel — vollstaendig, bestehender Inhalt wird ersetzt.',
  schema: () => ({
    type: 'object',
    properties: {
      pfad: { type: 'string', description: 'Pfad zur Datei, relativ zur Wurzel' },
      inhalt: { type: 'string', description: 'Der vollstaendige neue Inhalt der Datei' },
    },
    required: ['pfad', 'inhalt'],
  }),
  async ausfuehren(eingabe, ktx) {
    const roh = eingabe.pfad
    if (typeof roh !== 'string' || roh === '') return fehlendesFeld('pfad')
    const inhalt = eingabe.inhalt
    if (typeof inhalt !== 'string') return fehlendesFeld('inhalt')

    const wache = pruefePfad(roh, ktx.wache)
    if (!wache.ok) return { ok: false, meldung: wache.grund }

    try {
      // Laeuft vor dem bewachten Oeffnen und hat kein Gegenstueck zu O_NOFOLLOW. Scheitert das
      // Oeffnen danach, bleiben die hier angelegten Verzeichnisse liegen: das Ergebnis ist
      // `ok: false`, die Verzeichnisse sind trotzdem da. Fuer einen von der Wache abgelehnten
      // Pfad passiert das nicht — der kehrt oben um, bevor diese Zeile laeuft.
      mkdirSync(dirname(wache.pfad), { recursive: true })
      // O_NOFOLLOW auf der letzten Komponente. Was es leistet und was nicht, genau benannt —
      // die erste Fassung dieses Kommentars war eine Ueberbehauptung und ein Review hat sie
      // auseinandergenommen:
      //
      // pfadwache loest Symlinks auf und gibt den **aufgeloesten** Pfad zurueck. Im Normalbetrieb
      // sieht `openSync` deshalb nie einen Symlink, und das Flag greift nicht — der Symlink-Test
      // dieser Datei ist aus genau diesem Grund gruen, nicht wegen O_NOFOLLOW. Das Flag greift in
      // einem Fall: die letzte Komponente wird zwischen Aufloesung und Oeffnen getauscht (TOCTOU).
      // **Kein Test dieser Strecke belegt ihn** — synchron und ohne Mocks ist er nicht
      // herstellbar. Tiefenverteidigung gegen ein echtes Rennen, keine gepruefte Zusage.
      //
      // Nicht gedeckt: dasselbe Rennen um ein *Zwischenverzeichnis* (siehe `mkdirSync` darueber).
      // Benanntes Restrisiko, nicht geschlossen.
      const fd = openSync(
        wache.pfad,
        constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
        0o644,
      )
      // `writeFileSync` ueber dem Deskriptor, nicht `writeSync`: letzteres ist ein duenner Aufsatz
      // auf write(2) und darf weniger schreiben als der Puffer haelt. Sein Rueckgabewert wurde
      // nicht geprueft, ein Teilschreibvorgang waere also als Erfolg durchgegangen.
      try { writeFileSync(fd, inhalt) } finally { closeSync(fd) }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err)
      return { ok: false, meldung: `Datei nicht schreibbar: ${relative(ktx.wache.wurzel, wache.pfad)} (${m})` }
    }

    return {
      ok: true, quelle: 'lokal',
      inhalt: [{ art: 'text', text: `Geschrieben: ${relative(ktx.wache.wurzel, wache.pfad)} (${inhalt.length} Zeichen)` }],
    }
  },
}

const dateiLoeschen: Werkzeug = {
  name: 'datei_loeschen',
  beschreibung: 'Loescht eine einzelne Datei in der Projektwurzel. Keine Verzeichnisse.',
  schema: () => ({
    type: 'object',
    properties: { pfad: { type: 'string', description: 'Pfad zur Datei, relativ zur Wurzel' } },
    required: ['pfad'],
  }),
  async ausfuehren(eingabe, ktx) {
    const roh = eingabe.pfad
    if (typeof roh !== 'string' || roh === '') return fehlendesFeld('pfad')

    const wache = pruefePfad(roh, ktx.wache)
    if (!wache.ok) return { ok: false, meldung: wache.grund }

    try {
      // No directories, not recursive. Whoever wants to clear a tree has the shell, and there the
      // kernel holds the line — a recursive delete as an in-process tool would have the same effect
      // without the same boundary.
      if (statSync(wache.pfad).isDirectory()) {
        return {
          ok: false,
          meldung: `'${relative(ktx.wache.wurzel, wache.pfad)}' ist ein Verzeichnis. Dieses Werkzeug loescht nur einzelne Dateien.`,
        }
      }
      unlinkSync(wache.pfad)
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err)
      return { ok: false, meldung: `Datei nicht loeschbar: ${relative(ktx.wache.wurzel, wache.pfad)} (${m})` }
    }

    return {
      ok: true, quelle: 'lokal',
      inhalt: [{ art: 'text', text: `Geloescht: ${relative(ktx.wache.wurzel, wache.pfad)}` }],
    }
  },
}

export const SCHREIB_WERKZEUGE: Werkzeug[] = [dateiSchreiben, dateiLoeschen]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harness/werkzeug-schreiben.test.ts`
Expected: PASS.

- [ ] **Step 5: Prove the guard bites**

`O_NOFOLLOW` aus dem `openSync`-Aufruf entfernen und `pruefePfad` vorübergehend durch `{ ok: true, pfad: roh }` ersetzen.
Run: `npx vitest run tests/harness/werkzeug-schreiben.test.ts -t "folgt keinem Symlink"` → **muss FAIL sein** (`ziel.txt` wäre dann `zerstoert`). Beides zurücknehmen, Ergebnis in den Bericht.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npx vitest run tests/harness/werkzeug-schreiben.test.ts
git add src/main/harness/werkzeug-schreiben.ts tests/harness/werkzeug-schreiben.test.ts
git commit -m "feat(werkzeuge): datei_schreiben und datei_loeschen, mit O_NOFOLLOW"
```

---

## Task 6: `shell_ausfuehren` und die Netzmodus-Erkennung

**Files:**
- Create: `src/main/harness/werkzeug-shell.ts`
- Modify: `src/main/harness/sandkasten.ts` (Ergänzung `istPaketbefehl`)
- Modify: `src/main/harness/werkzeuge.ts:19-32` (`WerkzeugKontext` bekommt `sandkasten`)
- Modify: `src/main/harness/form.ts:21` (`WerkzeugQuelle` bekommt `'fremd'`)
- Modify: `src/main/harness/projektion.ts:18` (`quelleAus` lässt `'fremd'` sonst stumm fallen)
- Test: `tests/harness/werkzeug-shell.test.ts`, `tests/harness/projektion.test.ts`

**Interfaces:**
- Consumes: `starte`, `SandkastenKontext`, `NetzModus` aus `./sandkasten`
- Produces:
  - `function istPaketbefehl(kommando: string): boolean` (in `sandkasten.ts`)
  - `const PAKETBEFEHLE: string[]` (in `sandkasten.ts`)
  - `const SHELL_WERKZEUGE: Werkzeug[]` (in `werkzeug-shell.ts`)
  - `WerkzeugKontext.sandkasten?: SandkastenKontext`

- [ ] **Step 1: Write the failing test**

Create `tests/harness/werkzeug-shell.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { istPaketbefehl } from '../../src/main/harness/sandkasten'
import { SHELL_WERKZEUGE } from '../../src/main/harness/werkzeug-shell'
import type { WerkzeugKontext } from '../../src/main/harness/werkzeuge'

const shell = SHELL_WERKZEUGE.find(w => w.name === 'shell_ausfuehren')!

describe('istPaketbefehl', () => {
  it('erkennt die Paketbefehle', () => {
    expect(istPaketbefehl('npm ci')).toBe(true)
    expect(istPaketbefehl('npm install lodash')).toBe(true)
    expect(istPaketbefehl('flutter pub get')).toBe(true)
    expect(istPaketbefehl('  dart pub get  ')).toBe(true)
    expect(istPaketbefehl('pip install requests')).toBe(true)
  })
  it('erkennt gewoehnliche Kommandos nicht', () => {
    expect(istPaketbefehl('npm test')).toBe(false)
    expect(istPaketbefehl('flutter test')).toBe(false)
    expect(istPaketbefehl('curl https://example.com')).toBe(false)
    expect(istPaketbefehl('echo npm ci')).toBe(false)
  })
})

describe('shell_ausfuehren — ohne Sandkastenkontext', () => {
  it('antwortet benannt statt zu laufen', async () => {
    const r = await shell.ausfuehren({ kommando: 'echo x' }, { wache: { wurzel: '/x', heim: '/h', userDataPfad: '/u' }, graphDb: null })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('Sandkasten')
  })
})

let heim: string
let wurzel: string
let ktx: WerkzeugKontext

beforeAll(() => {
  heim = realpathSync(mkdtempSync(join(tmpdir(), 'keel-sh-')))
  wurzel = join(heim, 'projekt')
  mkdirSync(wurzel, { recursive: true })
  const wache = { wurzel, heim, userDataPfad: join(heim, 'userData') }
  ktx = {
    wache, graphDb: null,
    sandkasten: { ...wache, zwischenspeicher: [], tmpdir: realpathSync(tmpdir()) },
  }
})
afterAll(() => rmSync(heim, { recursive: true, force: true }))

describe.skipIf(process.platform !== 'darwin')('shell_ausfuehren — echter Lauf', () => {
  it('fuehrt aus und gibt die Ausgabe zurueck', async () => {
    const r = await shell.ausfuehren({ kommando: 'echo hallo' }, ktx)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.inhalt[0].text).toContain('hallo')
  })

  it('nennt den Rueckgabecode bei einem Fehlschlag, statt still ok zu melden', async () => {
    const r = await shell.ausfuehren({ kommando: 'exit 3' }, ktx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('3')
  })

  it('schreibt in der Wurzel', async () => {
    const r = await shell.ausfuehren({ kommando: 'echo inhalt > erzeugt.txt' }, ktx)
    expect(r.ok).toBe(true)
    expect(readFileSync(join(wurzel, 'erzeugt.txt'), 'utf-8')).toBe('inhalt\n')
  })

  it('schreibt nicht ausserhalb der Wurzel', async () => {
    const r = await shell.ausfuehren({ kommando: `echo raus > ${heim}/verboten.txt` }, ktx)
    expect(r.ok).toBe(false)
  })

  it('bekommt ohne Paketbefehl kein Netz', async () => {
    // `|| true` ist hier nicht Bequemlichkeit, sondern die Bedingung dafuer, dass der Test
    // ueberhaupt etwas prueft: ohne Socket endet `curl` mit einem Fehlercode, `shell_ausfuehren`
    // liefert dann `ok: false` — und eine Zusicherung hinter `if (r.ok)` liefe genau im
    // geprueften Fall ins Leere. Mit `|| true` endet die Shell mit 0, das Ergebnis ist `ok`, und
    // die Ausgabe traegt die 000, auf die es ankommt.
    const r = await shell.ausfuehren(
      { kommando: 'curl -s -m 8 -o /dev/null -w "%{http_code}" https://example.com || true' }, ktx,
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.inhalt[0].text).toContain('000')
  }, 20_000)

  it('nennt ein fehlendes Kommando', async () => {
    const r = await shell.ausfuehren({}, ktx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('kommando')
  })

  it('unterscheidet Zeitueberschreitung von einer Ablehnung durch die Grenze', async () => {
    const r = await shell.ausfuehren({ kommando: 'sleep 5', zeitgrenzeMs: 300 }, ktx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('Zeitgrenze')
  }, 20_000)

  it('sein Stummel ist einzeilig — sonst schmuggelt er sich in den Praefix', () => {
    expect(shell.beschreibung).not.toContain('\n')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness/werkzeug-shell.test.ts`
Expected: FAIL — `istPaketbefehl` und das Modul `werkzeug-shell` fehlen.

- [ ] **Step 3a: `istPaketbefehl` in `sandkasten.ts` ergänzen**

```ts
/**
 * The commands that get the `offen` network profile. Adjustable surface (CK-NFR-012).
 *
 * This is NOT a positive list of what may run — every command runs, only without network if it
 * does not match here. If the match is wrong, the failure case is a failing build, never an open
 * channel: it errs fail-closed, and that is exactly why it is allowed to be imprecise.
 *
 * What it does not close, and the tool text says so too: a `postinstall` script runs with full
 * network under `offen`. That is the same gap a human takes on when typing `npm ci` themselves.
 */
export const PAKETBEFEHLE = [
  'npm ci', 'npm install', 'npm i ', 'yarn install', 'pnpm install', 'pnpm i ',
  'flutter pub get', 'dart pub get', 'pip install', 'pip3 install',
  'cargo fetch', 'go mod download', 'bundle install',
]

export function istPaketbefehl(kommando: string): boolean {
  const k = kommando.trim()
  return PAKETBEFEHLE.some(p => k === p.trim() || k.startsWith(p))
}
```

- [ ] **Step 3b: `WerkzeugKontext` erweitern**

In `src/main/harness/werkzeuge.ts`, im Interface `WerkzeugKontext` nach `netz?: NetzKontext` einfügen (und `import type { SandkastenKontext } from './sandkasten'` oben ergänzen):

```ts
  /**
   * Der Prozessrand fuer `shell_ausfuehren`. Optional, und das Werkzeug antwortet ohne ihn
   * **benannt** statt zu laufen — dieselbe Regel wie bei `netz`: ein Werkzeug ohne seinen Kontext
   * sagt, was fehlt, statt still etwas anderes zu tun.
   */
  sandkasten?: SandkastenKontext
```

- [ ] **Step 3c: `werkzeug-shell.ts` schreiben**

```ts
/**
 * werkzeug-shell — the one tool that starts a process.
 *
 * Nothing here parses the command, and there is no positive list of allowed commands. Against a
 * shell a string check is theatre (`$(...)`, a rewritten npm script), and the boundary is the
 * sandbox. The list in sandkasten.ts decides only *which of the two profiles* a command runs
 * under, never *whether* it runs.
 *
 * Its stub is one line, and that is not cosmetics: faehigkeiten.ts already warns by name that a
 * multi-line description can smuggle a made-up `shell_ausfuehren` entry into the stable prefix,
 * indistinguishable from keel's own list. Actually having the tool makes that warning sharper,
 * not smaller.
 */

import { istPaketbefehl, starte, STANDARD_ZEITGRENZE_MS } from './sandkasten'
import type { Werkzeug, WerkzeugErgebnis, WerkzeugKontext } from './werkzeuge'

const shellAusfuehren: Werkzeug = {
  name: 'shell_ausfuehren',
  beschreibung: 'Fuehrt ein Kommando im Projektverzeichnis aus, in einem Sandkasten ohne Netz (Paketbefehle ausgenommen).',
  schema: () => ({
    type: 'object',
    properties: {
      kommando: { type: 'string', description: 'Das Kommando, wie in einer Shell getippt' },
      zeitgrenzeMs: { type: 'number', description: 'Zeitgrenze in Millisekunden' },
    },
    required: ['kommando'],
  }),
  async ausfuehren(eingabe, ktx: WerkzeugKontext): Promise<WerkzeugErgebnis> {
    const kommando = eingabe.kommando
    if (typeof kommando !== 'string' || kommando === '') {
      return { ok: false, meldung: `Das Feld 'kommando' fehlt in der Eingabe.` }
    }
    if (!ktx.sandkasten) {
      return { ok: false, meldung: 'Fuer diesen Lauf ist kein Sandkasten eingerichtet — es wird nichts ausgefuehrt.' }
    }

    const zeitgrenze = typeof eingabe.zeitgrenzeMs === 'number' && eingabe.zeitgrenzeMs > 0
      ? eingabe.zeitgrenzeMs
      : STANDARD_ZEITGRENZE_MS

    const netz = istPaketbefehl(kommando) ? 'offen' : 'zu'
    const r = await starte(kommando, ktx.sandkasten, netz, zeitgrenze)

    // Named apart, because they mean different things to whoever reads the log: a wall-clock
    // ceiling that ran out, versus a boundary that refused. Conflating them turns a sandbox
    // rejection into a mysterious build error.
    if (r.zeitueberschreitung) {
      return { ok: false, meldung: `Abgebrochen: die Zeitgrenze von ${zeitgrenze} ms ist ueberschritten.` }
    }
    // Ein Spawn-Fehler liefert ebenfalls `code: null` — ohne eigenen Zweig kaeme er als
    // "Rueckgabecode null" heraus, und ein Modell suchte den Fehler in seinem Kommando statt im
    // Sandkasten, der gar nicht erst startete. Drei Ausgaenge, drei Texte.
    if (r.code === null) {
      return { ok: false, meldung: `Der Sandkasten liess sich nicht starten: ${r.ausgabe}` }
    }
    if (r.code !== 0) {
      return {
        ok: false,
        meldung: `Kommando endete mit Rueckgabecode ${String(r.code)}.\n${r.ausgabe}`,
      }
    }

    const hinweis = r.abgeschnitten ? '\n(Ausgabe abgeschnitten.)' : ''
    const netzHinweis = netz === 'offen' ? '\n(Als Paketbefehl erkannt — mit Netzzugang gelaufen.)' : ''
    return {
      ok: true,
      // `fremd`, not `lokal`: what a build tool prints is not keel's word. A dependency can print
      // whatever it likes into that stream, and it lands in the model's context.
      quelle: 'fremd',
      inhalt: [{ art: 'text', text: r.ausgabe + hinweis + netzHinweis }],
    }
  },
}

export const SHELL_WERKZEUGE: Werkzeug[] = [shellAusfuehren]
```

- [ ] **Step 3d: `'fremd'` als dritter Herkunftswert — zwei Stellen, nicht eine**

`WerkzeugQuelle` kennt heute `'netz' | 'lokal'` (`form.ts:21`). Beides ist für Shell-Ausgabe falsch: `netz` heisst laut eigenem Kommentar *„fremdbestimmt, von einer Gegenstelle, die niemand von uns kontrolliert"* — ein `npm ci` kommt von keiner Gegenstelle; `lokal` heisst *„aus dieser Maschine"* und verschwiege, dass der Text von fremdem Code stammt und im Modellkontext landet.

**Nachgeprüft, bevor der Wert dazukommt:** kein Produktionszweig verzweigt über `WerkzeugQuelle`, das Feld ist heute rein beschreibend. Der Zusatz ist damit additiv — alte Protokolle behalten ihre Bedeutung, und genau davor warnt der Kopf von `form.ts`.

In `src/main/harness/form.ts:21`:

```ts
/**
 * … `fremd` heisst: auf dieser Maschine erzeugt, aber von Code, den wir nicht kontrollieren —
 * die Ausgabe eines Build-Werkzeugs. Ein eigener Wert und kein `netz`, weil ein Protokolleintrag
 * sonst behauptete, ein `npm ci` sei von einer Gegenstelle gekommen; und kein `lokal`, weil das
 * verschwiege, dass ein Paket in diesen Text schreiben kann und er im Modellkontext landet.
 */
export type WerkzeugQuelle = 'netz' | 'lokal' | 'fremd'
```

Und — **das ist die Stelle, die man vergisst** — in `src/main/harness/projektion.ts:18`:

```ts
function quelleAus(wert: unknown): { quelle?: WerkzeugQuelle } {
  return wert === 'netz' || wert === 'lokal' || wert === 'fremd' ? { quelle: wert } : {}
}
```

Ohne die zweite Änderung fällt `'fremd'` **stumm** aus der Projektion — die Funktion lässt unbekannte Werte weg, statt sie zu raten. Das wäre dieselbe Fehlerklasse wie `skill.geladen`, das nach seiner Einführung als leere Zeile gerendert wurde.

Dazu ein Test in `tests/harness/projektion.test.ts`, **innerhalb** des bestehenden `describe('projiziere: die Herkunft')` — dort steht bereits ein `block(quelle)`-Helfer, der einen echten Lauf projiziert. `quelleAus` ist nicht exportiert und wird es auch nicht: der Weg durch `projiziere` ist die richtige Probe.

```ts
  it('reicht fremd durch — die Herkunft der Shell-Ausgabe darf nicht stumm wegfallen', () => {
    expect(block('fremd')).toMatchObject({ art: 'werkzeug-ergebnis', quelle: 'fremd' })
  })
```

Der bestehende Nachbartest *„laesst einen unbekannten Wert weg"* prüft mit `'sonstwoher'` und `42` und bleibt davon unberührt — nachgesehen, nicht angenommen.

**Probe, dass dieser Test beisst:** die Ergänzung in `projektion.ts:18` zurücknehmen. → `npx vitest run tests/harness/projektion.test.ts -t "reicht fremd durch"` **muss FAIL sein**. Wieder einsetzen.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harness/werkzeug-shell.test.ts`
Expected: PASS.

- [ ] **Step 5: Prove it bites**

In `werkzeug-shell.ts` `const netz = 'offen'` fest verdrahten.
Run: `npx vitest run tests/harness/werkzeug-shell.test.ts -t "bekommt ohne Paketbefehl kein Netz"` → **muss FAIL sein**. Zurücknehmen, Ergebnis in den Bericht.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npx vitest run tests/harness/werkzeug-shell.test.ts tests/harness/sandkasten-profil.test.ts
git add src/main/harness/werkzeug-shell.ts src/main/harness/sandkasten.ts src/main/harness/werkzeuge.ts tests/harness/werkzeug-shell.test.ts
git commit -m "feat(werkzeuge): shell_ausfuehren im Sandkasten, Netz nur fuer Paketbefehle"
```

---

## Task 7: `lauf.ts` — die Tor-Kette und Single-Writer

**Files:**
- Modify: `src/main/harness/lauf.ts:369-372` (Single-Writer), `:425-551` (`fuehreAus`)
- Modify: `tests/harness/waechter-kern.test.ts` (neuer Wächter `effekteOhneEntscheidung`)
- Test: `tests/harness/lauf-wirkende-werkzeuge.test.ts`

**Interfaces:**
- Consumes: `entscheide`, `istWirkend`, `effekteOhneEntscheidung` aus `./tor`
- Produces: `LaufUmgebung.sandkasten?: SandkastenKontext`

- [ ] **Step 1: Write the failing test**

Create `tests/harness/lauf-wirkende-werkzeuge.test.ts`. Für den Aufbau der `LaufUmgebung` **den bestehenden Helfer aus `tests/harness/lauf.test.ts` nachbauen** — dort steht, wie `db`, `eintrag`, `praefixTeile`, `sende` und `registry` zusammengesetzt werden. Diese Datei ist zuerst zu lesen; der Helfer wird kopiert, nicht neu erfunden.

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { starteLauf, lesen, WerkzeugRegistry } from '../../src/main/harness'
import { SCHREIB_WERKZEUGE } from '../../src/main/harness/werkzeug-schreiben'
import { DATEI_WERKZEUGE } from '../../src/main/harness/werkzeug-datei'
import { effekteOhneEntscheidung } from '../../src/main/harness/tor'
import { effekteOhneIntent } from '../../src/main/harness/intent-vor-effekt'
// baueUmgebung: aus tests/harness/lauf.test.ts uebernommen — dieselbe Zusammensetzung,
// nur mit einer anderen Registry und einer Wurzel im Wegwerf-Verzeichnis.
import { baueUmgebung } from './lauf.test-helfer'

let heim: string
let wurzel: string

beforeEach(() => {
  heim = realpathSync(mkdtempSync(join(tmpdir(), 'keel-lw-')))
  wurzel = join(heim, 'projekt')
  mkdirSync(wurzel, { recursive: true })
})
afterEach(() => rmSync(heim, { recursive: true, force: true }))

describe('Die Kette Intent → Entscheidung → Wirkung', () => {
  it('ein erlaubter Schreibaufruf schreibt alle drei Ereignisse, in dieser Reihenfolge', async () => {
    const u = baueUmgebung({
      wurzel, heim,
      registry: new WerkzeugRegistry([...DATEI_WERKZEUGE, ...SCHREIB_WERKZEUGE]),
      antworten: [
        { bloecke: [{ art: 'werkzeug-aufruf', id: 'a1', name: 'datei_schreiben', eingabe: { pfad: 'neu.ts', inhalt: 'x' } }], stopGrund: { roh: 'tool_use', normalisiert: 'werkzeug' } },
        { bloecke: [{ art: 'text', text: 'fertig' }], stopGrund: { roh: 'end_turn', normalisiert: 'ende' } },
      ],
    })
    const laufId = await starteLauf({ auftragstext: 'schreibe', modellId: u.eintrag.id, wurzel, budgets: { runden: 4, wanduhrMs: 60_000, kostenCent: 100, kontextAnteil: 0.9 } }, u)

    const arten = lesen(u.db, laufId).filter(e => String(e.nutzlast.aufrufId) === 'a1').map(e => e.art)
    expect(arten).toEqual(['tool.intent', 'tool.entschieden', 'tool.completed'])
    expect(readFileSync(join(wurzel, 'neu.ts'), 'utf-8')).toBe('x')
  })

  it('ein abgelehnter Schreibaufruf steht mit Grund im Protokoll und schreibt nichts', async () => {
    const u = baueUmgebung({
      wurzel, heim,
      registry: new WerkzeugRegistry([...SCHREIB_WERKZEUGE]),
      antworten: [
        { bloecke: [{ art: 'werkzeug-aufruf', id: 'a1', name: 'datei_schreiben', eingabe: { pfad: '/etc/hosts', inhalt: 'x' } }], stopGrund: { roh: 'tool_use', normalisiert: 'werkzeug' } },
        { bloecke: [{ art: 'text', text: 'ok' }], stopGrund: { roh: 'end_turn', normalisiert: 'ende' } },
      ],
    })
    const laufId = await starteLauf({ auftragstext: 'schreibe', modellId: u.eintrag.id, wurzel, budgets: { runden: 4, wanduhrMs: 60_000, kostenCent: 100, kontextAnteil: 0.9 } }, u)

    const ereignisse = lesen(u.db, laufId)
    const entschieden = ereignisse.find(e => e.art === 'tool.entschieden')!
    expect(entschieden.nutzlast.erlaubt).toBe(false)
    expect(String(entschieden.nutzlast.grund)).toContain('ausserhalb der Wurzel')

    // Ein Nein ist ein Werkzeugfehler, kein Laufende: das Modell erfaehrt den Grund.
    const gescheitert = ereignisse.find(e => e.art === 'tool.failed')!
    expect(String(gescheitert.nutzlast.meldung)).toContain('ausserhalb der Wurzel')
    expect(ereignisse.some(e => e.art === 'tool.completed')).toBe(false)
  })

  it('ein lesendes Werkzeug bekommt keine Entscheidung', async () => {
    const u = baueUmgebung({
      wurzel, heim,
      registry: new WerkzeugRegistry([...DATEI_WERKZEUGE]),
      antworten: [
        { bloecke: [{ art: 'werkzeug-aufruf', id: 'a1', name: 'verzeichnis_listen', eingabe: { muster: '**/*' } }], stopGrund: { roh: 'tool_use', normalisiert: 'werkzeug' } },
        { bloecke: [{ art: 'text', text: 'ok' }], stopGrund: { roh: 'end_turn', normalisiert: 'ende' } },
      ],
    })
    const laufId = await starteLauf({ auftragstext: 'liste', modellId: u.eintrag.id, wurzel, budgets: { runden: 4, wanduhrMs: 60_000, kostenCent: 100, kontextAnteil: 0.9 } }, u)
    expect(lesen(u.db, laufId).some(e => e.art === 'tool.entschieden')).toBe(false)
  })
})

describe('Single-Writer', () => {
  it('ein Zug mit einem wirkenden Aufruf laeuft sequenziell, in Blockreihenfolge', async () => {
    const u = baueUmgebung({
      wurzel, heim,
      registry: new WerkzeugRegistry([...DATEI_WERKZEUGE, ...SCHREIB_WERKZEUGE]),
      antworten: [
        { bloecke: [
          { art: 'werkzeug-aufruf', id: 'a1', name: 'datei_schreiben', eingabe: { pfad: 'x.ts', inhalt: 'eins' } },
          { art: 'werkzeug-aufruf', id: 'a2', name: 'datei_lesen', eingabe: { pfad: 'x.ts' } },
        ], stopGrund: { roh: 'tool_use', normalisiert: 'werkzeug' } },
        { bloecke: [{ art: 'text', text: 'ok' }], stopGrund: { roh: 'end_turn', normalisiert: 'ende' } },
      ],
    })
    const laufId = await starteLauf({ auftragstext: 'beides', modellId: u.eintrag.id, wurzel, budgets: { runden: 4, wanduhrMs: 60_000, kostenCent: 100, kontextAnteil: 0.9 } }, u)

    const ereignisse = lesen(u.db, laufId)
    const iA1 = ereignisse.findIndex(e => e.art === 'tool.completed' && e.nutzlast.aufrufId === 'a1')
    const iA2 = ereignisse.findIndex(e => e.art === 'tool.intent' && e.nutzlast.aufrufId === 'a2')
    // Der Lesevorgang beginnt erst, nachdem der Schreibvorgang fertig ist — sonst haengt es vom
    // Zeitpunkt ab, ob er Altes oder Neues sieht, und das Protokoll saehe in beiden Faellen
    // gleich aus.
    expect(iA1).toBeLessThan(iA2)

    const gelesen = ereignisse.find(e => e.art === 'tool.completed' && e.nutzlast.aufrufId === 'a2')!
    expect(JSON.stringify(gelesen.nutzlast.inhalt)).toContain('eins')
  })
})

describe('Waechter ueber einem echten Lauf', () => {
  it('ein Lauf mit einem Schreibaufruf verletzt weder Intent- noch Entscheidungsregel', async () => {
    const u = baueUmgebung({
      wurzel, heim,
      registry: new WerkzeugRegistry([...SCHREIB_WERKZEUGE]),
      antworten: [
        { bloecke: [{ art: 'werkzeug-aufruf', id: 'a1', name: 'datei_schreiben', eingabe: { pfad: 'p.ts', inhalt: 'x' } }], stopGrund: { roh: 'tool_use', normalisiert: 'werkzeug' } },
        { bloecke: [{ art: 'text', text: 'ok' }], stopGrund: { roh: 'end_turn', normalisiert: 'ende' } },
      ],
    })
    const laufId = await starteLauf({ auftragstext: 'schreibe', modellId: u.eintrag.id, wurzel, budgets: { runden: 4, wanduhrMs: 60_000, kostenCent: 100, kontextAnteil: 0.9 } }, u)
    const ereignisse = lesen(u.db, laufId)
    expect(effekteOhneIntent(ereignisse)).toEqual([])
    expect(effekteOhneEntscheidung(ereignisse)).toEqual([])
  })
})
```

**Schritt vor dem Schreiben dieser Datei:** `tests/harness/lauf.test.ts` lesen, den dortigen Aufbau der `LaufUmgebung` in eine neue Datei `tests/harness/lauf.test-helfer.ts` herausziehen (als `export function baueUmgebung(...)`), und `lauf.test.ts` auf den Helfer umstellen. Die bestehenden Tests dort müssen danach unverändert grün sein — das ist die Probe, dass der Auszug nichts verändert hat.

Run nach dem Auszug: `npx vitest run tests/harness/lauf.test.ts` → **muss PASS sein**, bevor es weitergeht.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness/lauf-wirkende-werkzeuge.test.ts`
Expected: FAIL — kein `tool.entschieden` im Protokoll; Single-Writer-Test scheitert oder ist flatterhaft.

- [ ] **Step 3a: Das Tor in `fuehreAus` einhängen**

In `src/main/harness/lauf.ts`, in `fuehreAus`, **unmittelbar nach** der `tool.intent`-Zeile (heute Zeile 428) einfügen:

```ts
  // Ankuendigung, Entscheidung, Wirkung. Nur wirkende Werkzeuge: die Kette auch ueber die
  // lesenden zu legen hiesse, jedem Lesevorgang ein Ereignis zu spendieren, dessen Antwort immer
  // ja ist — das Protokoll wuerde laenger und nicht wahrer.
  // `istWirkend` davor ist nicht bloss eine Abkuerzung, sondern die Bedingung, unter der
  // `entscheide` ueberhaupt aussagekraeftig ist: fuer jeden Namen ausser `shell_ausfuehren` faellt
  // es in den Pfadzweig und beurteilte ein `pfad`-Feld, das ein fremdes Werkzeug gar nicht hat.
  if (istWirkend(a.name)) {
    // `.erlaubt` wird sofort gelesen. `entscheide` gibt **immer** ein Objekt zurueck, also waere
    // ein `if (entscheide(...))` immer wahr und das Tor stillschweigend abgeschaltet — der Typ
    // kann das nicht verhindern. Was es verhindert, ist die Mutationsprobe in Step 5.
    const urteil = entscheide(a.name, a.eingabe, u.wache)
    schreibe(u, laufId, 'tool.entschieden', {
      aufrufId: a.id, name: a.name, erlaubt: urteil.erlaubt, grund: urteil.grund,
    })
    if (!urteil.erlaubt) {
      // Ein Nein ist ein Werkzeugfehler, kein Laufende — dieselbe Regel wie bei den lesenden
      // Werkzeugen: wer zu weit greift, soll es erfahren, nicht daran sterben.
      schreibe(u, laufId, 'tool.failed', { aufrufId: a.id, name: a.name, meldung: urteil.grund })
      return
    }
  }
```

Oben ergänzen: `import { entscheide, istWirkend } from './tor'`.

Den `WerkzeugKontext`-Aufbau (heute Zeile 543) um den Sandkasten erweitern:

```ts
    const r = await werkzeug.ausfuehren(a.eingabe, {
      wache: u.wache, graphDb: u.graphDb, netz, sandkasten: u.sandkasten,
    })
```

Und in `LaufUmgebung` (nach `wache: WacheKontext`):

```ts
  /**
   * Der Prozessrand fuer `shell_ausfuehren`. Fehlt er, antwortet das Werkzeug benannt statt zu
   * laufen — dieselbe Regel wie bei `netz`.
   */
  sandkasten?: SandkastenKontext
```

- [ ] **Step 3b: Single-Writer**

`src/main/harness/lauf.ts:369-372` ersetzen:

```ts
      // Single-Writer (M8 §3.2). Enthaelt die Aufrufmenge eines Zuges *einen* wirkenden Aufruf,
      // laeuft der **ganze** Zug sequenziell, in Blockreihenfolge. Nicht "nur die schreibenden
      // serialisieren, die lesenden nebenher": ein Lesevorgang parallel zu einem Schreibvorgang
      // auf derselben Datei liefert je nach Zeitpunkt Altes oder Neues, und das Protokoll saehe
      // in beiden Faellen gleich aus. Die Reproduzierbarkeit eines Laufs ist genau das, was die
      // Teststrecke misst.
      if (aufrufe.some(a => istWirkend(a.name))) {
        for (const a of aufrufe) await fuehreAus(u, laufId, auftrag, a)
      } else {
        await Promise.all(aufrufe.map(a => fuehreAus(u, laufId, auftrag, a)))
      }
```

Der alte Kommentar (*„All tools in this stretch read… The mechanism for it arrives with the writing tools."*) fällt damit weg — er ist eingelöst.

- [ ] **Step 3c: Der Wächter über einem echten Lauf**

In `tests/harness/waechter-kern.test.ts`, im `describe('Waechter: kein Effekt ohne Intent')`, einen zweiten `describe` daneben:

```ts
describe('Waechter: kein Effekt ohne Entscheidung', () => {
  it('effekteOhneEntscheidung findet ein wirkendes completed ohne vorherige Entscheidung', () => {
    const v = effekteOhneEntscheidung([
      { laufId: 'l', seq: 0, ts: 't', art: 'tool.completed', nutzlast: { aufrufId: '1', name: 'datei_schreiben' } },
    ])
    expect(v).toHaveLength(1)
  })
})
```

Oben ergänzen: `import { effekteOhneEntscheidung } from '../../src/main/harness/tor'`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/harness/lauf-wirkende-werkzeuge.test.ts tests/harness/waechter-kern.test.ts tests/harness/lauf.test.ts
```
Expected: PASS.

- [ ] **Step 5: Prove they bite**

Drei Mutationen, einzeln, je zurückgenommen:

1. Die `if (!urteil.erlaubt)`-Abbruchzeile in `fuehreAus` streichen (also trotz Nein ausführen). → `npx vitest run tests/harness/lauf-wirkende-werkzeuge.test.ts -t "ein abgelehnter Schreibaufruf"` **muss FAIL sein**.
2. Single-Writer zurück auf `Promise.all` für alle Fälle. → `-t "ein Zug mit einem wirkenden Aufruf laeuft sequenziell"` **muss FAIL sein** (mindestens flatterhaft; wenn es zufällig grün wird, `datei_schreiben` in der Mutation mit einem `await new Promise(r => setTimeout(r, 50))` verzögern und erneut fahren).
3. `istWirkend` in `fuehreAus` auf `() => true` setzen. → `-t "ein lesendes Werkzeug bekommt keine Entscheidung"` **muss FAIL sein**.

Alle drei Ergebnisse in den Abschlussbericht.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npm test
git add src/main/harness/lauf.ts tests/harness/lauf-wirkende-werkzeuge.test.ts tests/harness/lauf.test-helfer.ts tests/harness/lauf.test.ts tests/harness/waechter-kern.test.ts
git commit -m "feat(lauf): Tor-Kette und Single-Writer fuer wirkende Werkzeuge"
```

---

## Task 8: Die Vorbedingung — sauberer Arbeitsbaum

**Files:**
- Modify: `src/main/harness/lauf.ts` (`starteLauf`, vor `run.started`)
- Test: `tests/harness/laufstart-git.test.ts`

**Interfaces:**
- Produces: `function pruefeArbeitsbaum(wurzel: string): Promise<{ ok: true } | { ok: false; meldung: string }>` (exportiert aus `lauf.ts`)

- [ ] **Step 1: Write the failing test**

Create `tests/harness/laufstart-git.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileAsync } from '../../src/main/util/exec-util'
import { pruefeArbeitsbaum } from '../../src/main/harness/lauf'

let heim: string
let wurzel: string

beforeEach(() => {
  heim = realpathSync(mkdtempSync(join(tmpdir(), 'keel-git-')))
  wurzel = join(heim, 'projekt')
  mkdirSync(wurzel, { recursive: true })
})
afterEach(() => rmSync(heim, { recursive: true, force: true }))

async function repoMitCommit(): Promise<void> {
  await execFileAsync('git', ['init', '-q', wurzel])
  await execFileAsync('git', ['-C', wurzel, 'config', 'user.email', 'test@test.invalid'])
  await execFileAsync('git', ['-C', wurzel, 'config', 'user.name', 'Test'])
  writeFileSync(join(wurzel, 'a.txt'), 'inhalt')
  await execFileAsync('git', ['-C', wurzel, 'add', '.'])
  await execFileAsync('git', ['-C', wurzel, 'commit', '-q', '-m', 'erst'])
}

describe('pruefeArbeitsbaum', () => {
  it('laesst ein sauberes Repo durch', async () => {
    await repoMitCommit()
    const r = await pruefeArbeitsbaum(wurzel)
    expect(r.ok).toBe(true)
  })

  it('lehnt ein Repo mit ungesicherten Aenderungen ab, und nennt sie', async () => {
    await repoMitCommit()
    writeFileSync(join(wurzel, 'a.txt'), 'geaendert')
    const r = await pruefeArbeitsbaum(wurzel)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('a.txt')
  })

  it('lehnt eine unversionierte Datei ebenso ab', async () => {
    await repoMitCommit()
    writeFileSync(join(wurzel, 'neu.txt'), 'x')
    const r = await pruefeArbeitsbaum(wurzel)
    expect(r.ok).toBe(false)
  })

  it('lehnt ein Verzeichnis ohne Git ab — nicht Start mit Warnung', async () => {
    const r = await pruefeArbeitsbaum(wurzel)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.meldung).toContain('Git')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/harness/laufstart-git.test.ts`
Expected: FAIL — `pruefeArbeitsbaum` ist kein Export von `lauf.ts`.

- [ ] **Step 3: Write minimal implementation**

In `src/main/harness/lauf.ts` ergänzen (Import oben: `import { execFileAsync } from '../util/exec-util'`):

```ts
/**
 * Die Startvorbedingung wirkender Werkzeuge: die Wurzel ist ein Git-Repo, und der Arbeitsbaum ist
 * sauber.
 *
 * Warum das traegt und nicht bloss beruhigt: `.git` ist in pfadwache geschuetzt und im
 * Sandkastenprofil vom Schreiben ausgenommen. Der Rueckweg `git diff` / `git checkout` gehoert
 * damit ueber den ganzen Lauf ausschliesslich dem Menschen — kein Werkzeug und kein Kindprozess
 * kann ihn wegnehmen. Diese Pruefung stellt nur sicher, dass es zu Beginn etwas gibt, worauf man
 * zurueckkann.
 *
 * Kein Git-Repo heisst: kein Start. Nicht "Start mit Warnung" — eine Warnung, die einmal
 * weggeklickt wurde, ist beim zweiten Mal keine mehr, und der Preis ist die Arbeit eines Tages.
 *
 * Was sie *nicht* ist: Schutz vor Zeitverlust. Ein Lauf kann Stunden Arbeit zerschreiben;
 * wiederherstellbar ist, was committet war.
 */
export async function pruefeArbeitsbaum(
  wurzel: string,
): Promise<{ ok: true } | { ok: false; meldung: string }> {
  let ausgabe: string
  try {
    const r = await execFileAsync('git', ['-C', wurzel, 'status', '--porcelain'])
    ausgabe = String(r.stdout)
  } catch {
    return {
      ok: false,
      meldung:
        `'${wurzel}' ist kein Git-Repository. Ein Lauf mit schreibenden Werkzeugen startet nur ` +
        `dort, wo es einen Rueckweg gibt — lege eines an ('git init') und sichere den ` +
        `Ausgangsstand mit einem Commit.`,
    }
  }
  if (ausgabe.trim() !== '') {
    return {
      ok: false,
      meldung:
        `Der Arbeitsbaum ist nicht sauber. Ein Lauf mit schreibenden Werkzeugen wuerde Aenderungen ` +
        `ueberschreiben, die nirgends gesichert sind:\n${ausgabe.trim()}`,
    }
  }
  return { ok: true }
}
```

In `starteLauf`, **vor** `schreibe(u, laufId, 'run.started', …)` und nach `pruefeStartbedingungen`:

```ts
  // Vor `run.started`: ein Lauf, der hier scheitert, hat nie begonnen, und im Protokoll steht kein
  // angefangener Lauf ohne Ende.
  if (u.registry.alle().some(w => istWirkend(w.name))) {
    const baum = await pruefeArbeitsbaum(auftrag.wurzel)
    if (!baum.ok) throw new Error(baum.meldung)
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/harness/laufstart-git.test.ts`
Expected: PASS.

- [ ] **Step 5: Prove the whole suite still holds**

Run: `npm test`
Expected: PASS. **Achtung:** Bestehende Tests, die `starteLauf` mit einer Registry samt Schreibwerkzeugen über einem Nicht-Repo fahren, scheitern jetzt zu Recht — dort muss der Wegwerf-Baum ein `git init` plus leeren Commit bekommen. Tests mit rein lesender Registry bleiben unberührt; wenn doch einer fällt, ist die `istWirkend`-Bedingung zu weit gefasst.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npm test
git add src/main/harness/lauf.ts tests/harness/laufstart-git.test.ts
git commit -m "feat(lauf): wirkende Werkzeuge starten nur ueber einem sauberen Arbeitsbaum"
```

---

## Task 9: Verdrahtung, Dokumentation, und der Beweislauf

**Files:**
- Modify: `src/main/harness/index.ts`
- Modify: `src/main/harness-sitzung.ts:112-117` (`baueWerkzeugRegistry`), `:265` (`wache`-Aufbau)
- Modify: `docs/anpassbare-flaechen.md`
- Modify: `src/main/harness/werkzeug-graph.ts:10` (eingelöste Terminzusage)
- Test: `tests/harness/verdrahtung.test.ts`, `tests/harness/werkzeugliste.test.ts` (bestehende, laufen über die echte Konstruktion)

**Interfaces:**
- Consumes: alles Vorherige
- Produces: `baueSandkastenKontext(wurzel: string): SandkastenKontext` in `harness-sitzung.ts`

- [ ] **Step 1: Read the two wiring guards first**

`tests/harness/verdrahtung.test.ts` und `tests/harness/werkzeugliste.test.ts` lesen. Beide prüfen gegen `baueWerkzeugRegistry()`, nicht gegen einen Nachbau — der Nachbau war einmal grün, während die halbe Liste nicht verdrahtet war. Die neuen Werkzeuge werden **dort** erwartet, wo diese Tests die Liste prüfen.

- [ ] **Step 2: Extend the wiring guard, and watch it fail**

In `tests/harness/werkzeugliste.test.ts` ergänzen:

```ts
it('die drei wirkenden Werkzeuge stehen in der echten Registry', () => {
  const namen = baueWerkzeugRegistry().alle().map(w => w.name)
  expect(namen).toContain('datei_schreiben')
  expect(namen).toContain('datei_loeschen')
  expect(namen).toContain('shell_ausfuehren')
})
```

Run: `npx vitest run tests/harness/werkzeugliste.test.ts`
Expected: **FAIL** — die drei fehlen noch.

- [ ] **Step 3: Wire them up**

`src/main/harness/index.ts` ergänzen:

```ts
export { SCHREIB_WERKZEUGE } from './werkzeug-schreiben'
export { SHELL_WERKZEUGE } from './werkzeug-shell'
export { WIRKENDE_WERKZEUGE, istWirkend, entscheide, effekteOhneEntscheidung } from './tor'
export {
  profilText, starte, istPaketbefehl, STANDARD_ZWISCHENSPEICHER, STANDARD_ZEITGRENZE_MS,
  MAX_AUSGABE_BYTES,
} from './sandkasten'
export type { SandkastenKontext, NetzModus, SandkastenLauf } from './sandkasten'
```

`src/main/harness-sitzung.ts`: den Import aus `./harness` um `SCHREIB_WERKZEUGE, SHELL_WERKZEUGE, STANDARD_ZWISCHENSPEICHER` erweitern, `baueWerkzeugRegistry` ergänzen:

```ts
export function baueWerkzeugRegistry(): WerkzeugRegistry {
  return new WerkzeugRegistry([
    ...DATEI_WERKZEUGE, ...SCHREIB_WERKZEUGE, ...SHELL_WERKZEUGE,
    ...GRAPH_WERKZEUGE, faehigkeitLesenWerkzeug,
    ...NETZ_WERKZEUGE, rechercheurWerkzeug,
  ])
}
```

Und daneben, neu:

```ts
/**
 * Der Sandkastenkontext eines Laufs. Er teilt sich die drei Pfadfelder mit `WacheKontext` — eine
 * Quelle, damit die Argumentpruefung und die Prozessgrenze nicht ueber verschiedene Verzeichnisse
 * reden.
 */
export function baueSandkastenKontext(wurzel: string): SandkastenKontext {
  return {
    wurzel, heim: homedir(), userDataPfad: app.getPath('userData'),
    zwischenspeicher: STANDARD_ZWISCHENSPEICHER.map(p => join(homedir(), p)),
    tmpdir: tmpdir(),
  }
}
```

`tmpdir` aus `node:os` importieren. An der Stelle, wo heute `wache: { wurzel, heim: homedir(), userDataPfad: app.getPath('userData') }` gebaut wird (`:265`), daneben `sandkasten: baueSandkastenKontext(wurzel),` ergänzen.

- [ ] **Step 4: Run the wiring guards**

```bash
npx vitest run tests/harness/werkzeugliste.test.ts tests/harness/verdrahtung.test.ts
```
Expected: PASS.

Danach `npm run typecheck` — die Werkzeugobergrenze der Fähigkeitszeile kann jetzt überschritten sein. Das ist ein **Hinweis, kein Abbruch** (`starteLauf`, M8 §4.10): erscheint er im Lauf, gehört er in den Bericht, nicht in eine stillschweigende Anhebung der Zahl.

- [ ] **Step 5: Document the adjustable surfaces**

In `docs/anpassbare-flaechen.md` einen Abschnitt für Paket C ergänzen, mit je einem Eintrag und einer Begründung:

- **`STANDARD_ZWISCHENSPEICHER`** (`sandkasten.ts`) — Schreibziele ausserhalb der Wurzel. Warum es sie gibt: `flutter pub get` schreibt nach `~/.pub-cache`, `npm ci` nach `~/.npm`; nur die Wurzel freizugeben hiesse, dass jede Installation scheitert. **Die weichste Stelle des Sandkastens** — jeder Eintrag ist ein Loch, die Liste steht darum an einer Stelle und wächst nicht stillschweigend. Wermutstropfen, der benannt gehört: sobald Flutter installiert ist, braucht es zusätzlich `$FLUTTER_ROOT/bin/cache`, denn Flutter schreibt in die eigene Installation.
- **`PAKETBEFEHLE`** (`sandkasten.ts`) — welche Kommandos das Netzprofil `offen` bekommen. **Keine Positivliste dessen, was laufen darf:** ein nicht getroffenes Kommando läuft trotzdem, nur ohne Netz. Sie irrt fail-closed und darf darum ungenau sein.
- **`STANDARD_ZEITGRENZE_MS`** (120 000) und **`MAX_AUSGABE_BYTES`** (65 536) — der Deckel ist kein Komfort: die Ausgabe geht in den Modellkontext.

- [ ] **Step 6: Close the outdated promises**

Suchen und einlösen — die Suche allein reicht nicht, zwei frühere Treffer lagen über Zeilenumbrüche verteilt und einer enthielt kein Suchwort:

```bash
grep -rn "spaeter\|später\|kommt mit\|arrives with\|noch nicht gebaut" src/main/harness/ | grep -v "\.test\."
```

Mindestens:
- `src/main/harness/werkzeug-graph.ts:10` — *„They belong to the stretch that brings the sandbox."* Der Sandkasten ist da; der Satz ist umzuschreiben auf das, was jetzt gilt.
- `src/main/harness/lauf.ts:369-371` — in Task 7 bereits ersetzt, hier nur noch gegenlesen.
- `src/main/harness/pfadwache.ts:11-13` — *„When the shell arrives the sandbox arrives with it"*: die Vorhersage ist eingelöst. Der Satz bleibt richtig, bekommt aber den Verweis auf `sandkasten.ts`, damit ein Leser die zweite Schicht findet.

- [ ] **Step 7: Full suite, typecheck, lint**

```bash
npm run typecheck && npm run lint && npm test
```
Expected: alles grün.

- [ ] **Step 8: Der Beweislauf — und er ist der eigentliche Abschluss**

Grüne Tests sagen über eine Verdrahtung nichts. Dieser Schritt wird **von Hand gefahren**, mit der `run-keel`-Skill (die Testsuite dieses Repos erreicht keinen `ipcMain`-Handler).

Aufbau:

```bash
mkdir -p ~/keel-beweis && cd ~/keel-beweis
git init -q && git commit -q --allow-empty -m "leer"
npm init -y >/dev/null
```

Dann die App starten, eine Zelle mit keels eigener Schleife über dieser Wurzel laufen lassen, und im Protokoll fünf Dinge nachweisen:

1. eine Datei, die vorher nicht da war, ist geschrieben,
2. ein `npm install` (oder `flutter pub get`) ist durchgekommen — also hat es Netz unter `offen` bekommen,
3. ein Test oder Skript ist gelaufen und seine Ausgabe steht im Protokoll,
4. ein Schreibversuch **ausserhalb** der Wurzel ist gescheitert, mit `tool.entschieden` / `erlaubt: false` und Grund im Ereignis-Panel,
5. `git status` in `~/keel-beweis` zeigt danach die geschriebenen Dateien und ein **unverändertes** `.git`.

**Punkt 4 und 5 sind die, die zählen.** 1 bis 3 zeigen, dass es *geht*; 4 und 5 zeigen, dass die Grenze *hält*. Ein Lauf, der nur 1 bis 3 erreicht, ist kein Beweis, sondern eine Vorführung.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(paket-c): Verdrahtung, anpassbare Flaechen, eingeloeste Terminzusagen"
```

---

## Self-Review

**Spec-Abdeckung** — jede Nummer der Spec zeigt auf eine Aufgabe:

| Spec | Aufgabe |
|---|---|
| §2 zwei Schichten, keine Kommandoliste | Task 4 (`entscheide` bei `shell_ausfuehren`), Task 6 (Modulkopf) |
| §3 der Fund: Lese- ist auch Schreibverbot | Task 1 Wächter, Task 2 Probe *„ueberschreibt die .env nicht"* |
| §4.1 `profilText` rein, `-p` inline | Task 1 |
| §4.2 das Profil, `.git`, verankerte Verbote | Task 1 + Task 2 |
| §4.3 zwei Netzmodi, Paketbefehle | Task 1 (Modus), Task 6 (`istPaketbefehl`) |
| §4.4 Zwischenspeicher als anpassbare Fläche | Task 1 (Konstante), Task 9 Step 5 (Doku) |
| §4.5 Zeitgrenze, Ausgabedeckel | Task 2 |
| §5 `tor.ts`, `tool.entschieden`, Panel | Task 3 + Task 4 + Task 7 |
| §6 die drei Werkzeuge, `O_NOFOLLOW`, einzeiliger Stummel | Task 5 + Task 6 |
| §7 Git-Vorbedingung | Task 8 |
| §8 Single-Writer | Task 7 |
| §9 Tests und Wächter | in jeder Aufgabe, Step 5 |
| §10 gekennzeichnete Annahmen | Task 1 (Modulkopf `sandkasten.ts`), Task 9 Step 5 |
| §11 der Beweis | Task 9 Step 8 |
| §12 was nicht gebaut wird | nirgends eine Aufgabe — richtig so |

**Typkonsistenz** geprüft: `SandkastenKontext` (Task 1) wird in Task 2, 6, 7, 9 gleich benannt; `Urteil.erlaubt`/`.grund` (Task 4) passen zur Nutzlast in Task 3 und Task 7; `istWirkend` (Task 4) hat drei Aufrufer (Task 7 zweimal, Task 8).

**Eine Stelle, die beim Schreiben des Plans aufgelöst wurde statt sie dem Umsetzer zu überlassen:** `WerkzeugQuelle` (`form.ts:21`) kannte nur `'netz' | 'lokal'`, und beides ist für Shell-Ausgabe falsch. Nachgeprüft, dass kein Produktionszweig über den Wert verzweigt (der Zusatz ist damit additiv) — und dass `quelleAus` in `projektion.ts:18` unbekannte Werte **stumm** wegfallen lässt, die Änderung also zwei Stellen braucht. Beides steht als Task 6 Step 3d im Plan, mit Beissprobe.

**Was den Umsetzer trotzdem überraschen kann:** die Werkzeugobergrenze der Fähigkeitszeile (Task 9 Step 4). Drei neue Werkzeuge können sie reissen. Sie warnt und bricht nicht ab (M8 §4.10) — die Warnung gehört in den Bericht, nicht in eine stillschweigend angehobene Zahl.

**Zwei Aufgaben ändern bestehende Tests** und sind darum die riskantesten: Task 7 (Auszug des `LaufUmgebung`-Helfers aus `lauf.test.ts`) und Task 8 (bestehende Läufe über Nicht-Repos). Beide haben eine ausdrückliche Zwischenprobe, bevor es weitergeht.
