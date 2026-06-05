/**
 * node-types.ts — TypeScript definitions for all 9 Knowledge Graph node types.
 *
 * CK-GRAPH-003: anforderung  CK-GRAPH-004: entscheidung  CK-GRAPH-005: artefakt
 * CK-GRAPH-006: test         CK-GRAPH-007: note          CK-GRAPH-008: phase_subsystem
 * CK-GRAPH-009: anlass       CK-GRAPH-010: github_repo
 * CK-PROC-001:  phase        (M4 eight-phase chain)
 * CK-GRAPH-011: Core attributes for all (uid, kind, path, title, status, etc.)
 * CK-GRAPH-041: Extensible attribute schema per node type (JSON frontmatter column).
 */

// ---------------------------------------------------------------------------
// Status enum (CK-GRAPH-016)
// ---------------------------------------------------------------------------

export const NODE_STATUSES = ['aktiv', 'abgeloest', 'verworfen'] as const
export type NodeStatus = (typeof NODE_STATUSES)[number]

// ---------------------------------------------------------------------------
// Phase status (CK-PROC-001) — separate from node-level lifecycle status
// ---------------------------------------------------------------------------

export const PHASE_STATUSES = ['ausstehend', 'aktiv', 'abgeschlossen', 'trivial-skip'] as const
export type PhaseStatus = (typeof PHASE_STATUSES)[number]

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
  'github_repo',
  'phase',
  'uebergabedokument',
  'gate_befund'
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
  /** Marks this artefakt as the phasenoutput of the phase it is linked to (CK-PROC-002) */
  phasenoutput?: boolean
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
  /** Scope descriptor for this subsystem (e.g. 'backend', 'frontend') */
  scope?: string
  /** Current processing status of this subsystem */
  status?: string
  /** Reason this subsystem is blocked (if applicable) */
  blocked_grund?: string
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
  owner: string
  name: string
  repo_id: string
  default_branch: string
  visibility: string
  linked_at: string
}

/** CK-PROC-001 — M4 phase node (one per project, 8 total) */
export interface PhaseAttrs {
  /** Phase identifier, e.g. 'ideation', 'requirements', … 'release-management' */
  name: string
  /** Canonical position in the chain (1–8) */
  position: number
  /** Phase-level progress status, distinct from node lifecycle status */
  phase_status: PhaseStatus
  /** Optional skip profile — present when this phase is marked as skippable (PROC-004) */
  skip_profil?: {
    /** Skip depth: 'trivial' | 'partial' | 'full' */
    tiefe: string
    /** Human-readable justification for the skip */
    begruendung: string
    /** Who marked this phase for skip */
    markiert_von: string
  }
}

// ---------------------------------------------------------------------------
// Uebergabedokument types (CK-P1-001)
// ---------------------------------------------------------------------------

export const DOKUMENT_TYPEN = [
  'anforderungen',
  'spec',
  'architektur-paket',
  'build-paket',
  'test-findings',
  'fix-report',
  'audit-summary'
] as const

export type DokumentTyp = (typeof DOKUMENT_TYPEN)[number]

/** CK-P1-001 — handoff document node with 7 valid dokumentTyp values */
export interface UebergabedokumentAttrs {
  dokumentTyp: DokumentTyp
}

/** CK-PROC-005 — gate assessment node per phase (PROC-007: two independent signals) */
export interface GateBefundAttrs {
  /** UID of the phase this gate assessment belongs to */
  phase_uid: string
  /** Structural coverage signal: 'gruen' | 'gelb' | 'rot' */
  strukturell: string
  /** Plausibility signal: 'gruen' | 'gelb' | 'rot' | null (null = not yet executed) */
  plausibilitaet: string | null
  /** Weighting annotation (free text) */
  gewichtung: string
  /** Gate type, e.g. 'coverage' */
  gate_typ: string
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
  phase: PhaseAttrs
  uebergabedokument: UebergabedokumentAttrs
  gate_befund: GateBefundAttrs
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
  github_repo: ['url', 'owner', 'name', 'repo_id', 'default_branch', 'visibility', 'linked_at'],
  phase: ['name', 'position'],
  uebergabedokument: ['dokumentTyp'],
  gate_befund: ['phase_uid', 'strukturell', 'gate_typ']
}

/** Allowed frontmatter fields per kind (for strict validation). */
export const ALLOWED_FRONTMATTER_FIELDS: Record<NodeKind, string[]> = {
  anforderung: ['quelle', 'prioritaet'],
  entscheidung: ['begruendung', 'alternativen'],
  artefakt: ['artefakt_pfad', 'sprache_art', 'phasenoutput'],
  test: ['testart', 'ergebnis'],
  note: ['notetyp'],
  phase_subsystem: ['ebene', 'scope', 'status', 'blocked_grund'],
  anlass: ['session', 'zeitpunkt', 'handoff_referenz'],
  github_repo: ['url', 'owner', 'name', 'repo_id', 'default_branch', 'visibility', 'linked_at'],
  phase: ['name', 'position', 'phase_status', 'skip_profil'],
  uebergabedokument: ['dokumentTyp'],
  gate_befund: ['phase_uid', 'strukturell', 'plausibilitaet', 'gewichtung', 'gate_typ']
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

export function isValidDokumentTyp(typ: string): typ is DokumentTyp {
  return (DOKUMENT_TYPEN as readonly string[]).includes(typ)
}
