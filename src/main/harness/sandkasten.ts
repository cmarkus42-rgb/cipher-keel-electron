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

  zeilen.push(
    '; Lesen: grundsaetzlich ja …',
    '(allow file-read*)',
    '',
    '; … ausser den Verboten der Pfadwache. Beidseitig, nie nur lesend: ein deny auf file-read*',
    '; allein laesst das Ueberschreiben zu, und dann ist das Geheimnis vertraulich und zerstoerbar.',
    `(deny file-read* file-write* (subpath "${sbplLiteral(ktx.heim)}/.ssh"))`,
    `(deny file-read* file-write* (subpath "${sbplLiteral(ktx.userDataPfad)}"))`,
    `(deny file-read* file-write* (regex #"^${hRe}/\\.cipher-"))`,
    `(deny file-read* file-write* (regex #"^${hRe}/\\.(zshrc|zprofile|zshenv|bashrc|bash_profile|profile)$"))`,
    `(deny file-read* file-write* (regex #"^${wRe}/(.*/)?\\.env(\\..*)?$"))`,
    `(deny file-read* file-write* (regex #"^${wRe}/(.*/)?(id_rsa|id_ed25519|id_ecdsa|id_dsa)$"))`,
    // Anchored to the root, never global: a global deny on *.pem locks /etc/ssl/cert.pem and
    // breaks TLS in the child — that is, `npm ci` itself.
    `(deny file-read* file-write* (regex #"^${wRe}/(.*/)?[^/]*\\.(pem|key|p12|keystore|jks)$"))`,
    '',
    '; Schreiben: die Wurzel — und die Verwaltung des Rueckwegs ausdruecklich nicht. Ein',
    '; `git reset --hard` naehme genau den Rueckweg weg, auf dem die Startvorbedingung beruht.',
    `(allow file-write* (subpath "${w}"))`,
    `(deny file-write* (subpath "${w}/.git"))`,
    '',
    '; Schreibziele ausserhalb der Wurzel: die Zwischenspeicher der Toolchains.',
    `(allow file-write* (subpath "${sbplLiteral(ktx.tmpdir)}"))`,
  )

  for (const z of ktx.zwischenspeicher) {
    zeilen.push(`(allow file-write* (subpath "${sbplLiteral(z)}"))`)
  }

  zeilen.push('', '(allow file-write-data (literal "/dev/null"))', '')
  return zeilen.join('\n')
}
