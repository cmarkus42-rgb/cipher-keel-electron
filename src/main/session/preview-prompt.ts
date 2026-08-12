/**
 * preview-prompt — assemble an entity prompt without starting anything.
 *
 * CK-NFR-012: what an entity is told must be inspectable before it runs. This builds
 * the same prompt session:create builds, but touches no project directory and writes
 * no file — the capability ids it reports are the ones materialisation *would* write.
 *
 * A niveau can be requested that no registered adapter serves. That is deliberate: it
 * is the only way to see what Niveau B looks like before a B harness exists.
 */

import { getEntityDefinition } from '../preset/registry'
import { getCapabilityPackages } from '../preset/capabilities'
import { getGlobalRules } from '../preset/global-rules'
import { CapabilityNiveau } from '../preset/niveau'
import { assembleEntityClaudeMd } from './assemble-entity'
import { resolveModel, type ModelTiers } from './model-resolver'

export interface PromptPreview {
  prompt: string
  /** Names of the layers actually present, in assembly order. */
  schichten: string[]
  /** Capability ids this niveau would carry. */
  capabilities: string[]
  /** The model handle that would be passed to the harness, or null for its default. */
  modelResolved: string | null
  niveau: CapabilityNiveau
  /** Rough size signal — whitespace words, not a tokenizer. */
  wortZahl: number
}

export function buildPromptPreview(
  entityId: string,
  niveau: CapabilityNiveau,
  tiers: ModelTiers,
): PromptPreview | null {
  const def = getEntityDefinition(entityId, niveau)
  if (!def) return null

  const packages = getCapabilityPackages(entityId, niveau)
  const capabilities = packages.map(p => p.name)

  const prompt = assembleEntityClaudeMd({
    body: def.body,
    persona: def.persona ?? undefined,
    globalRules: getGlobalRules(niveau),
    niveau,
    capabilities,
    capabilityPackages: packages,
  })

  const schichten = ['Body']
  if (prompt.includes('<!-- BEGIN:Capabilities -->')) schichten.push('Capabilities')
  if (prompt.includes('<!-- BEGIN:Persona -->')) schichten.push('Persona')
  if (prompt.includes('<!-- BEGIN:GlobalRules -->')) schichten.push('GlobalRules')
  if (prompt.includes('<!-- BEGIN:PhaseInput -->')) schichten.push('PhaseInput')

  return {
    prompt,
    schichten,
    capabilities,
    modelResolved: resolveModel(def.rahmen.model, tiers) ?? null,
    niveau,
    wortZahl: prompt.split(/\s+/).filter(Boolean).length,
  }
}
