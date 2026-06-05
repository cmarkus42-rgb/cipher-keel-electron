/**
 * assembleEntityClaudeMd — assemble a CLAUDE.md from preset layers.
 *
 * Assembly order (fixed): Body → Persona → GlobalRules → PhaseInput
 * Capability branches are NOT part of the assembly (lazy-loading, CK-INF-021).
 *
 * CK-INF-021
 */

export interface AssemblyOptions {
  /** The preset body (core instructions). Always present. */
  body: string
  /** Persona layer — injected as <!-- BEGIN:Persona --> section. */
  persona?: string
  /** Global rules layer — injected as <!-- BEGIN:GlobalRules --> section. */
  globalRules?: string
  /** Phase input (context-bearing layer) — injected as <!-- BEGIN:PhaseInput --> section. */
  phaseInput?: string
}

/**
 * Assembles a valid CLAUDE.md string from the provided preset layers.
 * Optional layers are omitted when not provided.
 */
export function assembleEntityClaudeMd(options: AssemblyOptions): string {
  const parts: string[] = [options.body]

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
