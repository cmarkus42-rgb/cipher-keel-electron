/**
 * CapabilityTree — CK-ENT-006, CK-ENT-017
 *
 * Manages a set of capability packages with lazy-loading.
 * Inventory (short descriptions) is always available for the system prompt.
 * Full package content is only loaded on demand via loadPackage().
 * Dependencies are resolved recursively; circular dependencies throw an error.
 */

import { estimateTokenCount, type CapabilityPackage } from './capability-schema'
import { loadCapabilityContent } from './capability-loader'

export class CapabilityTree {
  private readonly packages: Map<string, CapabilityPackage>
  private readonly loaded: Map<string, string>

  constructor(packages: CapabilityPackage[]) {
    this.packages = new Map(packages.map((p) => [p.name, p]))
    this.loaded = new Map()
  }

  /** Short descriptions of all packages — goes into the system prompt inventory. */
  getInventory(): string[] {
    return Array.from(this.packages.values()).map((p) => p.beschreibung)
  }

  /** True if the package has been loaded into memory. */
  isLoaded(name: string): boolean {
    return this.loaded.has(name)
  }

  /**
   * Load a package on demand. Recursively loads declared dependencies first.
   * Throws if the package is not found or a circular dependency is detected.
   */
  async loadPackage(name: string): Promise<string> {
    return this._loadPackage(name, new Set<string>())
  }

  /** Estimated token count of all currently loaded package contents. */
  getLoadedTokenCount(): number {
    let total = 0
    for (const content of this.loaded.values()) {
      total += estimateTokenCount(content)
    }
    return total
  }

  private async _loadPackage(name: string, visiting: Set<string>): Promise<string> {
    if (this.loaded.has(name)) return this.loaded.get(name)!

    if (visiting.has(name)) {
      throw new Error(`Circular dependency detected: '${name}' is already in the loading chain`)
    }

    const pkg = this.packages.get(name)
    if (!pkg) {
      throw new Error(`Capability package '${name}' not found in this tree`)
    }

    const nextVisiting = new Set(visiting)
    nextVisiting.add(name)

    for (const dep of pkg.abhaengigkeiten ?? []) {
      await this._loadPackage(dep, nextVisiting)
    }

    const content = await loadCapabilityContent(pkg)
    this.loaded.set(name, content)
    return content
  }
}
