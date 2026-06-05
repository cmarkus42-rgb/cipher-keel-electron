/**
 * capability-lint.ts — Token estimation and capability package lint checks.
 *
 * Phase 3c / Task 10
 *
 * estimateTokens:      whitespace-split word count × 1.3 (ceil)
 * lintCapabilities:    checks declared dependencies are resolvable in the set
 * warnOversizedPackages: warns when a package exceeds the token budget for a niveau
 */

import { estimateTokenCount, type CapabilityPackage } from './capability-schema'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LintResult {
  /** Name of the package that triggered this result. */
  packageName: string
  severity: 'error' | 'warning'
  message: string
}

/** A package with its loaded content for size analysis. */
export interface PackageContent {
  name: string
  content: string
}

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------

/**
 * Estimate the token count of a string.
 *
 * Delegates to estimateTokenCount from capability-schema (chars/4 heuristic)
 * to avoid divergent heuristics across the codebase (M-6).
 */
export function estimateTokens(content: string): number {
  return estimateTokenCount(content)
}

// ---------------------------------------------------------------------------
// lintCapabilities
// ---------------------------------------------------------------------------

/**
 * Lint a set of capability packages for unresolved dependencies.
 *
 * Reports an error for every declared `abhaengigkeiten` entry that is not
 * present in the package set by name. One LintResult per missing dependency.
 *
 * Returns an empty array when all declared dependencies are satisfied.
 */
export function lintCapabilities(packages: CapabilityPackage[]): LintResult[] {
  const knownNames = new Set(packages.map(p => p.name))
  const results: LintResult[] = []

  for (const pkg of packages) {
    if (!pkg.abhaengigkeiten || pkg.abhaengigkeiten.length === 0) continue

    for (const dep of pkg.abhaengigkeiten) {
      if (!knownNames.has(dep)) {
        results.push({
          packageName: pkg.name,
          severity: 'error',
          message:
            `Package '${pkg.name}' declares dependency '${dep}' ` +
            `which is not present in the package set`,
        })
      }
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// warnOversizedPackages
// ---------------------------------------------------------------------------

/** Token budget limits per niveau. */
const NIVEAU_LIMITS: Record<string, number> = {
  C: 500,
  B: 10_000,
  A: 10_000,
}

/**
 * Warn when a package's estimated token count exceeds the niveau budget.
 *
 * Thresholds:
 *   Niveau C: > 500 tokens
 *   Niveau A/B: > 10 000 tokens
 *
 * Returns one LintResult (severity 'warning') per oversized package.
 */
export function warnOversizedPackages(
  packages: PackageContent[],
  niveau: string
): LintResult[] {
  const limit = NIVEAU_LIMITS[niveau] ?? 10_000
  const results: LintResult[] = []

  for (const pkg of packages) {
    const tokens = estimateTokens(pkg.content)
    if (tokens > limit) {
      results.push({
        packageName: pkg.name,
        severity: 'warning',
        message:
          `Package '${pkg.name}' is oversized for niveau ${niveau}: ` +
          `estimated ${tokens} tokens exceeds limit of ${limit}`,
      })
    }
  }

  return results
}
