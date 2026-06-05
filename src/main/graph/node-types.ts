/**
 * node-types.ts — TypeScript definitions for all 8 Knowledge Graph node types.
 *
 * CK-GRAPH-003: anforderung  CK-GRAPH-004: entscheidung  CK-GRAPH-005: artefakt
 * CK-GRAPH-006: test         CK-GRAPH-007: note          CK-GRAPH-008: phase_subsystem
 * CK-GRAPH-009: anlass       CK-GRAPH-010: github_repo
 * CK-GRAPH-011: Core attributes for all (uid, kind, path, title, status, etc.)
 * CK-GRAPH-041: Extensible attribute schema per node type (JSON frontmatter column).
 */

// ---------------------------------------------------------------------------
// Status enum (CK-GRAPH-016)
// ---------------------------------------------------------------------------

export const NODE_STATUSES = ['aktiv', 'abgeloest', 'verworfen'] as const
export type NodeStatus = (typeof NODE_STATUSES)[number]

// ---------------------------------------------------------------------------
// Node kind enum
// ---------------------------------------------------------------------------

export const NODE_KINDS = [
  'anforderung',
  'entscheidung',
  'artefakt',
  'test',
  'note',
  'phase_subsystem',
  'anlass',
  'github_repo'
] as const

export type NodeKind = (typeof NODE_KINDS)[number]

// ---------------------------------------------------------------------------
// Core attributes shared by every node (CK-GRAPH-011)
// ---------------------------------------------------------------------------

export interface NodeCore {
  uid: string
  kind: NodeKind
  path: string | null     // mutable — NOT an identity carrier
  title: string
  status: NodeStatus
  frontmatter: string     // JSON string with type-specific extended attrs
  body: string            // file content for FTS
  content_hash: string
  erstellt: string        // ISO-8601
  abgeloest: string | null // ISO-8601 or null
  natural_key: string | null
}

// ---------------------------------------------------------------------------
// Type-specific extended attributes (stored in frontmatter JSON)
// CK-GRAPH-041: extensible schema per type
// ---------------------------------------------------------------------------

/** CK-GRAPH-003 */
export interface AnforderungAttrs {
  quelle?: string
  prioritaet?: string
}

/** CK-GRAPH-004 */
export interface EntscheidungAttrs {
  begruendung?: string
  alternativen?: string[]
}

/** CK-GRAPH-005 */
export interface ArtefaktAttrs {
  artefakt_pfad?: string
  sprache_art?: string
}

/** CK-GRAPH-006 */
export interface TestAttrs {
  testart?: string
  ergebnis?: string
}

/** CK-GRAPH-007 */
export interface NoteAttrs {
  notetyp?: string
}

/** CK-GRAPH-008 */
export interface PhaseSubsystemAttrs {
  ebene?: string
}

/** CK-GRAPH-009 */
export interface AnlassAttrs {
  session?: string
  zeitpunkt?: string
  handoff_referenz?: string
}

/** CK-GRAPH-010 */
export interface GithubRepoAttrs {
  url: string
  owner?: string
  name?: string
  repo_id?: string
  default_branch?: string
  visibility?: string
  linked_at?: string
}

// ---------------------------------------------------------------------------
// Type-specific attribute map
// ---------------------------------------------------------------------------

export interface NodeAttrMap {
  anforderung: AnforderungAttrs
  entscheidung: EntscheidungAttrs
  artefakt: ArtefaktAttrs
  test: TestAttrs
  note: NoteAttrs
  phase_subsystem: PhaseSubsystemAttrs
  anlass: AnlassAttrs
  github_repo: GithubRepoAttrs
}

// ---------------------------------------------------------------------------
// Schema registry — required fields per type (for CK-GRAPH-013 validation)
// ---------------------------------------------------------------------------

/** Fields that are required (non-optional) in frontmatter for a given kind. */
export const REQUIRED_FRONTMATTER_FIELDS: Record<NodeKind, string[]> = {
  anforderung: [],
  entscheidung: [],
  artefakt: [],
  test: [],
  note: [],
  phase_subsystem: [],
  anlass: [],
  github_repo: ['url']
}

/** Allowed frontmatter fields per kind (for strict validation). */
export const ALLOWED_FRONTMATTER_FIELDS: Record<NodeKind, string[]> = {
  anforderung: ['quelle', 'prioritaet'],
  entscheidung: ['begruendung', 'alternativen'],
  artefakt: ['artefakt_pfad', 'sprache_art'],
  test: ['testart', 'ergebnis'],
  note: ['notetyp'],
  phase_subsystem: ['ebene'],
  anlass: ['session', 'zeitpunkt', 'handoff_referenz'],
  github_repo: ['url', 'owner', 'name', 'repo_id', 'default_branch', 'visibility', 'linked_at']
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isValidKind(kind: string): kind is NodeKind {
  return (NODE_KINDS as readonly string[]).includes(kind)
}

export function isValidStatus(status: string): status is NodeStatus {
  return (NODE_STATUSES as readonly string[]).includes(status)
}
