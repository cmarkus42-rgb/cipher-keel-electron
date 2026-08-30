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
