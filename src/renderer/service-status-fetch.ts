/**
 * service-status-fetch.ts — Pure sequencing guard for async services:status fetches.
 *
 * No React imports — testable in a Node.js environment.
 *
 * CK-NFR-010: index.tsx fetches services:status from three independent triggers
 * (mount, app:ready, services:status-changed) with no IPC-level ordering
 * guarantee. Today the main-side handler happens to be a synchronous read of a
 * module-level variable, so responses resolve in dispatch order — but that is
 * an implementation detail of the current handler, not a contract. The moment
 * getServiceStatus() becomes async (e.g. a live subsystem health probe), a
 * slow earlier response could resolve after a faster later one and overwrite
 * fresher state with stale data. This guard makes "only the newest response
 * wins" an explicit, enforced rule instead of an accident of timing.
 */

/**
 * Decides whether an incoming services:status response should be applied to
 * state, given the sequence number of the most recently applied response.
 *
 * Rule: a response applies only if it is strictly newer (incomingSeq >
 * latestAppliedSeq) than the last one actually applied. Equal sequence
 * numbers are treated as a duplicate/already-applied response and dropped —
 * this keeps the guard idempotent if the same request is ever evaluated
 * twice, rather than re-triggering a redundant state update.
 */
export function shouldApplyStatusResult(latestAppliedSeq: number, incomingSeq: number): boolean {
  return incomingSeq > latestAppliedSeq
}
