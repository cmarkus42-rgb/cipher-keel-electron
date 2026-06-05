/**
 * injectSection — dynamically inject named sections into a CLAUDE.md string.
 *
 * - Idempotent: calling with the same sectionName twice has no effect.
 * - Deterministic order: sections are sorted alphabetically by name.
 *
 * CK-INF-012
 */

const beginMarker = (name: string) => `<!-- BEGIN:${name} -->`
const endMarker = (name: string) => `<!-- END:${name} -->`

/**
 * Injects a named section into `claudeMd`.
 *
 * If a section with `sectionName` already exists the document is returned
 * unchanged (idempotent). Otherwise the section is inserted at the position
 * that maintains alphabetical ordering among all existing sections.
 */
export function injectSection(
  claudeMd: string,
  sectionName: string,
  content: string,
): string {
  if (claudeMd.includes(beginMarker(sectionName))) {
    return claudeMd
  }

  const section = `${beginMarker(sectionName)}\n${content}\n${endMarker(sectionName)}`

  const pattern = /<!-- BEGIN:([^>]+) -->/g
  const existing = [...claudeMd.matchAll(pattern)].map(m => ({
    name: m[1],
    index: m.index,
  }))

  if (existing.length === 0) {
    return claudeMd ? `${claudeMd}\n\n${section}` : section
  }

  const insertBefore = existing.find(s => s.name > sectionName)
  if (!insertBefore) {
    return `${claudeMd}\n\n${section}`
  }

  return (
    claudeMd.slice(0, insertBefore.index) +
    section +
    '\n\n' +
    claudeMd.slice(insertBefore.index)
  )
}
