/**
 * CF Wave Plan — topological sort of subsystems into build waves.
 *
 * Consumes Architect decomposition (subsystem nodes + haengt_ab_von edges +
 * anforderungspaket nodes) as fixed input. CK-P3CF-002
 *
 * Edge semantics: `B --haengt_ab_von--> A` means "B depends on A".
 * The subsystem_dependencies CTE sets roots = nodes with no INCOMING edges
 * (= most dependent nodes at depth 0) and traverses outgoing edges to reach
 * foundational nodes at higher topo_order. Therefore higher topo_order means
 * "must be built earlier" — we sort descending to get wave order.
 */

import { graphQuery } from '../../graph/query'
import type Database from 'better-sqlite3'

export interface WelleSlot {
  subsystemUid: string
  subsystemTitle: string
  anforderungspaketUid: string | null
}

export interface Welle {
  index: number
  slots: WelleSlot[]
}

export interface WellePlan {
  wellen: Welle[]
}

export function buildWellePlan(db: Database.Database, maxWorkers: number): WellePlan {
  // 1. Get all subsystems
  const subsResult = graphQuery(db, { template: 'subsystem_list' })
  if (subsResult.count === 0) return { wellen: [] }

  // 2. Get topological order from subsystem_dependencies.
  // Higher topo_order = more foundational = must be built in an earlier wave.
  const depsResult = graphQuery(db, { template: 'subsystem_dependencies' })
  const topoOrderMap = new Map<string, number>()
  for (const row of depsResult.rows) {
    topoOrderMap.set(row.uid as string, row.topo_order as number)
  }
  // Safety fallback for subsystems unreachable by CTE (e.g. isolated cycles)
  for (const row of subsResult.rows) {
    const uid = row.uid as string
    if (!topoOrderMap.has(uid)) topoOrderMap.set(uid, 0)
  }

  // 3. Get anforderungspakete per subsystem (first match wins)
  const pkgResult = graphQuery(db, { template: 'anforderungspakete' })
  const pkgBySubsystem = new Map<string, string>()
  for (const row of pkgResult.rows) {
    const fm = typeof row.frontmatter === 'string'
      ? JSON.parse(row.frontmatter)
      : row.frontmatter
    const subsystemUid = fm?.subsystem as string | undefined
    if (subsystemUid && !pkgBySubsystem.has(subsystemUid)) {
      pkgBySubsystem.set(subsystemUid, row.uid as string)
    }
  }

  // 4. Title lookup
  const titleMap = new Map<string, string>()
  for (const row of subsResult.rows) {
    titleMap.set(row.uid as string, row.title as string)
  }

  // 5. Group by topo_order, sort DESCENDING (higher order = built first)
  const byOrder = new Map<number, string[]>()
  for (const [uid, order] of topoOrderMap) {
    if (!byOrder.has(order)) byOrder.set(order, [])
    byOrder.get(order)!.push(uid)
  }
  const sortedOrders = [...byOrder.keys()].sort((a, b) => b - a)

  // 6. Split each order group into waves respecting maxWorkers
  const wellen: Welle[] = []
  let welleIndex = 0
  for (const order of sortedOrders) {
    const uids = byOrder.get(order)!
    for (let i = 0; i < uids.length; i += maxWorkers) {
      const chunk = uids.slice(i, i + maxWorkers)
      wellen.push({
        index: welleIndex++,
        slots: chunk.map(uid => ({
          subsystemUid: uid,
          subsystemTitle: titleMap.get(uid) ?? uid,
          anforderungspaketUid: pkgBySubsystem.get(uid) ?? null,
        })),
      })
    }
  }

  return { wellen }
}
