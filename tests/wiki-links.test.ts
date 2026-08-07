/**
 * parseWikiLinks tests — Wave 4.
 * Covers: single link, multiple links, no links, incomplete/malformed links.
 */

import { describe, it, expect } from 'vitest'
import { parseWikiLinks } from '../src/renderer/hooks/useWikiLinks'

describe('parseWikiLinks', () => {
  describe('single link', () => {
    it('parses a single [[wikilink]]', () => {
      const result = parseWikiLinks('See [[ComponentA]] for details')
      expect(result).toHaveLength(1)
      expect(result[0].text).toBe('ComponentA')
    })

    it('sets correct start index for [[', () => {
      const result = parseWikiLinks('See [[ComponentA]] for details')
      expect(result[0].start).toBe(4)
    })

    it('sets correct end index (exclusive) after ]]', () => {
      const result = parseWikiLinks('See [[ComponentA]] for details')
      // '[[ComponentA]]' = 16 chars, starts at 4, ends at 20
      expect(result[0].end).toBe(4 + '[[ComponentA]]'.length)
    })

    it('text at [start..end] reproduces the full [[link]] token', () => {
      const body = 'See [[ComponentA]] for details'
      const link = parseWikiLinks(body)[0]
      expect(body.slice(link.start, link.end)).toBe('[[ComponentA]]')
    })

    it('targetUid and resolved are undefined by default', () => {
      const result = parseWikiLinks('[[Node]]')
      expect(result[0].targetUid).toBeUndefined()
      expect(result[0].resolved).toBeUndefined()
    })

    it('parses a link at the very start of the string', () => {
      const result = parseWikiLinks('[[First]] word')
      expect(result[0].start).toBe(0)
      expect(result[0].text).toBe('First')
    })

    it('parses a link at the very end of the string', () => {
      const result = parseWikiLinks('word [[Last]]')
      const link = result[0]
      expect(link.text).toBe('Last')
      expect(link.end).toBe('word [[Last]]'.length)
    })

    it('handles link text with spaces', () => {
      const result = parseWikiLinks('[[My Component Name]]')
      expect(result[0].text).toBe('My Component Name')
    })

    it('handles link text with hyphens and underscores', () => {
      const result = parseWikiLinks('[[my-component_v2]]')
      expect(result[0].text).toBe('my-component_v2')
    })
  })

  describe('multiple links', () => {
    it('parses two [[wikilinks]] in the same string', () => {
      const result = parseWikiLinks('[[A]] and [[B]]')
      expect(result).toHaveLength(2)
      expect(result[0].text).toBe('A')
      expect(result[1].text).toBe('B')
    })

    it('returns links in source order', () => {
      const result = parseWikiLinks('[[first]] then [[second]] then [[third]]')
      expect(result.map(l => l.text)).toEqual(['first', 'second', 'third'])
    })

    it('sets correct positions for each link', () => {
      const body = '[[A]] [[B]]'
      const result = parseWikiLinks(body)
      expect(result[0].start).toBe(0)
      expect(result[0].end).toBe(5)  // '[[A]]' = 5 chars
      expect(result[1].start).toBe(6)
      expect(result[1].end).toBe(11) // '[[B]]' = 5 chars, offset 6
    })

    it('all text slices reproduce the original tokens', () => {
      const body = 'Ref [[Alpha]] and [[Beta]] here'
      const links = parseWikiLinks(body)
      for (const link of links) {
        const token = body.slice(link.start, link.end)
        expect(token).toBe(`[[${link.text}]]`)
      }
    })

    it('parses adjacent links without whitespace', () => {
      const result = parseWikiLinks('[[A]][[B]]')
      expect(result).toHaveLength(2)
      expect(result[0].text).toBe('A')
      expect(result[1].text).toBe('B')
    })
  })

  describe('no links', () => {
    it('returns empty array for plain text', () => {
      expect(parseWikiLinks('plain text with no links')).toEqual([])
    })

    it('returns empty array for empty string', () => {
      expect(parseWikiLinks('')).toEqual([])
    })

    it('returns empty array for string with only whitespace', () => {
      expect(parseWikiLinks('   \n\t  ')).toEqual([])
    })

    it('returns empty array for markdown without wikilinks', () => {
      const md = '# Heading\n\nSome **bold** and _italic_ text.\n\n- list item\n'
      expect(parseWikiLinks(md)).toEqual([])
    })

    it('does not match empty brackets [[]]', () => {
      // The +? quantifier requires at least one non-bracket character
      expect(parseWikiLinks('[[]]')).toEqual([])
    })

    it('is safe to call multiple times on the same input', () => {
      const body = '[[Link]]'
      const r1 = parseWikiLinks(body)
      const r2 = parseWikiLinks(body)
      expect(r1).toHaveLength(1)
      expect(r2).toHaveLength(1)
      expect(r1[0].text).toBe(r2[0].text)
    })
  })

  describe('incomplete / malformed links', () => {
    it('does not match unclosed [[ without ]]', () => {
      expect(parseWikiLinks('[[open')).toEqual([])
    })

    it('does not match ]] without preceding [[', () => {
      expect(parseWikiLinks('close]]')).toEqual([])
    })

    it('does not match single brackets [single]', () => {
      expect(parseWikiLinks('[single]')).toEqual([])
    })

    it('does not match nested brackets [[outer[[inner]]]]', () => {
      // [^\[\]] excludes [ and ] from the text match, so outer is never matched
      const result = parseWikiLinks('[[outer[[inner]]]]')
      expect(result).toHaveLength(1)
      expect(result[0].text).toBe('inner')
    })

    it('does not match mismatched brackets [[text]', () => {
      expect(parseWikiLinks('[[text]')).toEqual([])
    })

    it('does not match mismatched brackets [text]]', () => {
      expect(parseWikiLinks('[text]]')).toEqual([])
    })

    it('recovers valid link after malformed text', () => {
      const result = parseWikiLinks('[[broken and [[valid]]')
      expect(result).toHaveLength(1)
      expect(result[0].text).toBe('valid')
    })
  })
})
