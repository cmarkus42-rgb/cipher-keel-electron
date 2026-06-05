/**
 * gate-cache.ts — Version-based cache for graphQuery results.
 *
 * Avoids repeated SQLite roundtrips for identical parameterized queries
 * within a single gate evaluation pass. Call invalidate() after any write
 * to the graph to ensure stale entries are not returned.
 */

import type Database from 'better-sqlite3'
import { graphQuery, type QueryParams, type QueryResult } from './query'

interface CacheEntry {
  version: number
  result: QueryResult
}

export class GateCache {
  private readonly cache = new Map<string, CacheEntry>()
  private version = 0
  hits = 0

  /**
   * Return a cached result when the cache version matches, otherwise execute
   * graphQuery and store the result under the current version.
   */
  getOrQuery(db: Database.Database, params: QueryParams): QueryResult {
    const key = JSON.stringify(params)
    const entry = this.cache.get(key)

    if (entry !== undefined && entry.version === this.version) {
      this.hits++
      return entry.result
    }

    const result = graphQuery(db, params)
    this.cache.set(key, { version: this.version, result })
    return result
  }

  /**
   * Bump the version counter and clear stale entries to prevent unbounded growth.
   */
  invalidate(): void {
    this.version++
    this.cache.clear()
  }
}
