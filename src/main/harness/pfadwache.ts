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
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

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

// Lowercase once, at the set/regex definitions, and compare against a lowercased name at the
// call site (see `pruefePfad`) — one form, used everywhere a name is matched. Case-insensitive
// filesystems (default APFS, default Windows) hand a reading tool the content of `.env` when it
// asks for `.ENV`; a case-sensitive name check would wave that request through.
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
  // A relative path is resolved against the run's root, not the main process's CWD. The two
  // listing tools (`verzeichnis_listen`, `inhalt_suchen`) hand the model back exactly
  // `relative(wurzel, pfad)` — root-relative paths — and a model that lists files then reads one
  // resubmits precisely that string. Resolving it against `process.cwd()` instead would answer
  // every such path with "outside the root" (or silently read the wrong file, if the process
  // happens to share a name with something under its own CWD): the very tool that discovers a
  // path and the one that opens it would disagree about what the path means. This runs *before*
  // symlink resolution, which still applies to the joined, now-absolute path exactly as before.
  // An already-absolute path is untouched by this step.
  const eingabe = isAbsolute(roh) ? roh : join(ktx.wurzel, roh)
  const pfad = aufloesen(eingabe)
  const name = basename(pfad)
  // One lowercased form, used for every name comparison below. The rules protect a namespace,
  // not a specific on-disk file — on a case-sensitive filesystem `.ENV` names a different file
  // than `.env`, and it is still denied. That is the intended, stricter reading.
  const nameKlein = name.toLowerCase()

  // Every anchor a containment check compares the candidate against is resolved the same way
  // as the candidate itself — not just `ktx.wurzel`. A symlinked home directory (common on
  // external volumes; /tmp itself is one on most systems) would otherwise compare a resolved
  // candidate against an unresolved prefix, and `istIn` would silently stop matching.
  const heimAufgeloest = aufloesen(ktx.heim)
  const userDataAufgeloest = aufloesen(ktx.userDataPfad)
  const wurzelAufgeloest = aufloesen(ktx.wurzel)

  // 1. Protected paths — in every mode, never overridable by an allow rule.
  const geschuetzt =
    istIn(pfad, join(heimAufgeloest, '.ssh')) ||
    istIn(pfad, userDataAufgeloest) ||
    (SHELL_STARTDATEIEN.has(nameKlein) && istIn(pfad, heimAufgeloest)) ||
    (nameKlein.startsWith('.cipher-') && istIn(pfad, heimAufgeloest)) ||
    pfad.split(sep).some((segment) => segment.toLowerCase() === '.git')
  if (geschuetzt) return { ok: false, grund: 'Pfad ist geschuetzt' }

  // 2. Deny rules — these bite *inside* the root as well. A project carries secrets, and a
  // .env the model reads travels to the provider with the next prompt.
  if (VERWEIGERTE_NAMEN.test(nameKlein) || VERWEIGERTE_ENDUNGEN.test(nameKlein)) {
    return { ok: false, grund: 'Pfad ist geschuetzt' }
  }

  // 3. Allow — inside the root, and nowhere else.
  if (!istIn(pfad, wurzelAufgeloest)) {
    return { ok: false, grund: 'Pfad liegt ausserhalb der Wurzel' }
  }

  return { ok: true, pfad }
}
