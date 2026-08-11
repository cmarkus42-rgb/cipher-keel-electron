/**
 * assembleEntityClaudeMd — assemble a CLAUDE.md from preset layers.
 *
 * Assembly order (fixed): Body → Capabilities → Persona → GlobalRules → PhaseInput
 * Capability branches lazy-load via SKILL.md at Niveau A (CK-INF-021).
 * Niveau B: an inventory of name, description and path — no @-references, because a
 * non-Claude harness does not resolve them (M2 section 6.4, strategy 1).
 * Niveau C: body truncated to ≤2000 estimated tokens.
 * Persona is always a separate section, never embedded in body (ENT-002).
 *
 * CK-INF-021, CK-3C-009
 */

import { CapabilityNiveau } from '../preset/niveau'
import { capabilityPath } from '../preset/capabilities'
import type { CapabilityPackage } from '../preset/capability-schema'

export interface AssemblyOptions {
  /** The preset body (core instructions). Always present. */
  body: string
  /** Persona layer — injected as <!-- BEGIN:Persona --> section (ENT-002). */
  persona?: string
  /** Global rules layer — injected as <!-- BEGIN:GlobalRules --> section. */
  globalRules?: string
  /** Phase input (context-bearing layer) — injected as <!-- BEGIN:PhaseInput --> section. */
  phaseInput?: string
  /** Capability niveau — controls SKILL.md refs (A), compression (B), truncation (C). */
  niveau?: CapabilityNiveau
  /** Capability IDs to reference at Niveau A via SKILL.md lazy-loading. */
  capabilities?: string[]
  /**
   * Capability packages for the Niveau-B inventory. Niveau B has no native
   * lazy-loading (M2 section 6.4, strategy 1): the prompt names each capability with
   * its description and path, and the agent reads them itself when it needs them.
   */
  capabilityPackages?: CapabilityPackage[]
}

/** Max estimated tokens for Niveau C output (whitespace-split × 1.3 heuristic). */
const NIVEAU_C_MAX_TOKENS = 2000

/** Estimate token count from a string (whitespace-split × 1.3). */
function estimateTokens(text: string): number {
  return text.split(/\s+/).filter(Boolean).length * 1.3
}

/** Truncate body to fit within NIVEAU_C_MAX_TOKENS. */
function truncateToTokenBudget(body: string): string {
  if (estimateTokens(body) <= NIVEAU_C_MAX_TOKENS) return body
  const words = body.split(/\s+/).filter(Boolean)
  const maxWords = Math.floor(NIVEAU_C_MAX_TOKENS / 1.3)
  return words.slice(0, maxWords).join(' ')
}

/**
 * Assembles a valid CLAUDE.md string from the provided preset layers.
 *
 * Niveau A: adds <!-- BEGIN:Capabilities --> section with @…SKILL.md lines.
 * Niveau B: plain assembly — no SKILL.md refs, no token cap.
 * Niveau C: body truncated to ≤2000 estimated tokens, no SKILL.md refs.
 * No niveau: backward-compatible, identical to original behaviour.
 */
export function assembleEntityClaudeMd(options: AssemblyOptions): string {
  const { niveau, capabilities = [], capabilityPackages = [] } = options

  // Niveau C: truncate body first
  const body = niveau === CapabilityNiveau.C
    ? truncateToTokenBudget(options.body)
    : options.body

  const parts: string[] = [body]

  // Niveau A: add SKILL.md capability references (lazy-loading)
  if (niveau === CapabilityNiveau.A && capabilities.length > 0) {
    const refs = capabilities.map(id => `@.claude/capabilities/${id}/SKILL.md`).join('\n')
    parts.push(`<!-- BEGIN:Capabilities -->\n${refs}\n<!-- END:Capabilities -->`)
  }

  // Niveau B: inventory instead of @-references. A non-Claude harness does not resolve
  // @-lines, so emitting them would cost the entity its entire capability layer without
  // a single error message.
  if (niveau === CapabilityNiveau.B && capabilityPackages.length > 0) {
    const lines = capabilityPackages.map(
      pkg => `- **${pkg.name}** — ${pkg.beschreibung}\n  Datei: \`${capabilityPath(pkg)}\``
    ).join('\n')
    parts.push(
      '<!-- BEGIN:Capabilities -->\n' +
      'Diese Fähigkeiten stehen dir als Dateien im Projekt zur Verfügung. ' +
      'Lies die zugehörige Datei, sobald du eine davon brauchst — sie wird nicht ' +
      'automatisch geladen.\n\n' +
      lines +
      '\n<!-- END:Capabilities -->'
    )
  }

  // Persona is always a separate section (ENT-002)
  if (options.persona) {
    parts.push(`<!-- BEGIN:Persona -->\n${options.persona}\n<!-- END:Persona -->`)
  }
  if (options.globalRules) {
    parts.push(`<!-- BEGIN:GlobalRules -->\n${options.globalRules}\n<!-- END:GlobalRules -->`)
  }
  if (options.phaseInput) {
    parts.push(`<!-- BEGIN:PhaseInput -->\n${options.phaseInput}\n<!-- END:PhaseInput -->`)
  }

  return parts.join('\n\n')
}
