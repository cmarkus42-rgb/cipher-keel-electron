/**
 * Knowledge Graph — public API barrel export.
 */

export { openGraphDb, type OpenDbOptions } from './db'
export { applySchema } from './schema'
export { deterministicUlid, freshUlid, isValidUlid, naturalKey } from './uid'
export {
  NODE_KINDS, NODE_STATUSES,
  REQUIRED_FRONTMATTER_FIELDS, ALLOWED_FRONTMATTER_FIELDS,
  isValidKind, isValidStatus,
  type NodeKind, type NodeStatus, type NodeCore,
  type AnforderungAttrs, type EntscheidungAttrs, type ArtefaktAttrs,
  type TestAttrs, type NoteAttrs, type PhaseSubsystemAttrs,
  type AnlassAttrs, type GithubRepoAttrs, type NodeAttrMap
} from './node-types'
export {
  EDGE_TYPES, EDGE_SOURCES,
  deriveEdgeType, isValidEdgeType, isValidEdgeSource, validateEdgeForPair,
  type EdgeType, type EdgeSource, type EdgeRecord
} from './edge-types'
export {
  GraphWriter, SchemaError, ConflictError,
  type UpsertNodeInput, type UpsertNodeResult,
  type LinkEdgeInput, type LinkEdgeResult
} from './writer'
export {
  SqliteGraphBackend,
  type GraphBackend, type VectorBackend, type FtsBackend,
  type NodeStorageBackend, type VectorSearchResult, type FtsSearchResult
} from './abstraction'
