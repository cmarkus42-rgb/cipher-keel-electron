/**
 * useWikiLinks.ts — Wiki-link parsing utility for the renderer.
 *
 * Parses [[wikilink]] syntax from note body text.
 * `targetUid` and `resolved` are populated by the graph resolution layer.
 */

export interface WikiLink {
  /** The raw inner text of the link, e.g. "ComponentA" from [[ComponentA]] */
  text: string
  /** Start index of `[[` in the source string */
  start: number
  /** End index (exclusive) of `]]` in the source string */
  end: number
  /** Graph node UID if resolved; undefined when not yet looked up */
  targetUid?: string
  /** True when the link has been resolved to a graph node */
  resolved?: boolean
}

const WIKILINK_PATTERN = /\[\[([^\[\]]+?)\]\]/g

/**
 * Parse all [[wikilink]] occurrences from a markdown body string.
 *
 * Returns one WikiLink per match with text, start, and end set.
 * targetUid and resolved are left undefined — populate them via graph lookup.
 *
 * @param body — raw markdown string (may contain wikilinks)
 */
export function parseWikiLinks(body: string): WikiLink[] {
  const links: WikiLink[] = []
  for (const match of body.matchAll(WIKILINK_PATTERN)) {
    links.push({
      text: match[1],
      start: match.index!,
      end: match.index! + match[0].length
    })
  }
  return links
}
