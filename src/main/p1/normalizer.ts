/**
 * normalizer.ts — Normalises external Markdown inputs into P1 Übergabedokument format.
 *
 * CK-NOTES-012: Normalisierungsfunktion fuer externe Inputs.
 */

import matter from 'gray-matter'

/** Required frontmatter fields for a P1 Übergabedokument. */
const REQUIRED_FIELDS = ['dokument-typ', 'status', 'phasenuebergang', 'erstellt-am'] as const

/** Default value factories for fields that have sensible defaults. */
const DEFAULTS: Partial<Record<string, () => unknown>> = {
  status: () => 'entwurf',
  'erstellt-am': () => new Date().toISOString().split('T')[0],
  'phasenuebergang': () => '?? -> ??',
}

/**
 * Normalises a Markdown string (with or without frontmatter) into a valid
 * P1 Übergabedokument format.
 *
 * - Generates YAML frontmatter if absent.
 * - Fills missing required fields with defaults where possible; warns otherwise.
 * - Preserves the body content unchanged.
 *
 * @param markdown   Input Markdown (may or may not have frontmatter).
 * @param dokumentTyp  The intended dokument-typ value (e.g. 'anforderungen', 'spec').
 * @returns `normalized` — the full Markdown with frontmatter;
 *          `warnings`   — list of fields that were defaulted or are missing.
 */
export function normalizeToP1Format(
  markdown: string,
  dokumentTyp: string
): { normalized: string; warnings: string[] } {
  const warnings: string[] = []

  // Parse existing frontmatter (gray-matter handles missing frontmatter gracefully)
  let parsed: matter.GrayMatterFile<string>
  let body: string
  try {
    parsed = matter(markdown)
    body = parsed.content
  } catch {
    parsed = { data: {} } as matter.GrayMatterFile<string>
    body = markdown
    warnings.push('Frontmatter konnte nicht geparst werden — wird komplett neu generiert')
  }

  const existing = parsed.data as Record<string, unknown>

  // Build merged frontmatter: existing fields take precedence over defaults
  const fm: Record<string, unknown> = {
    ...existing,
    'type': 'uebergabedokument',
    'dokument-typ': existing['dokument-typ'] ?? dokumentTyp,
  }

  // Fill missing required fields with defaults; warn for each
  for (const field of REQUIRED_FIELDS) {
    if (!fm[field]) {
      const defaultFn = DEFAULTS[field]
      if (defaultFn) {
        fm[field] = defaultFn()
        warnings.push(`'${field}' fehlte — Default-Wert gesetzt: "${String(fm[field])}"`)
      } else {
        warnings.push(`'${field}' fehlt und hat keinen Default — bitte manuell ergaenzen`)
      }
    }
  }

  const normalized = matter.stringify('\n' + body.trimStart(), fm)
  return { normalized, warnings }
}
