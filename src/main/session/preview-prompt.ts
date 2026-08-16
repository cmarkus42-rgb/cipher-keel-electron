/**
 * preview-prompt — assemble an entity prompt without starting anything.
 *
 * CK-NFR-012: what an entity is told must be inspectable before it runs. This builds
 * the same prompt session:create builds, but touches no project directory and writes
 * no file — the capability ids it reports are the ones materialisation *would* write.
 *
 * A niveau can be requested that no registered adapter serves. That is deliberate: it
 * is the only way to see what Niveau B looks like before a B harness exists.
 *
 * The graph handle is not optional decoration: session:create assembles a phaseninput
 * layer from it, so a preview built without it would show something other than what is
 * delivered — and a preview that differs from the delivered prompt is worse than none.
 */

import type Database from 'better-sqlite3'
import { getEntityDefinition } from '../preset/registry'
import { getCapabilityPackages } from '../preset/capabilities'
import { getGlobalRules } from '../preset/global-rules'
import { CapabilityNiveau } from '../preset/niveau'
import { assembleEntityClaudeMd } from './assemble-entity'
import { buildPhaseInputSection } from './phase-input'
import { resolveModel, tierAus, type ModelTiers } from './model-resolver'
import { cliHandleFuerTier } from '../model/registry'

export interface PromptPreview {
  prompt: string
  /** Names of the layers actually present, in assembly order. */
  schichten: string[]
  /** Capability ids this niveau would carry. */
  capabilities: string[]
  /** The model handle that would be passed to the harness, or null for its default. */
  modelResolved: string | null
  /**
   * German: why the tier assignment was not usable and the legacy `agent.modelTiers`
   * value was used instead — null when the assignment resolved cleanly or nothing was
   * assigned. The preview is a surface the user opens deliberately before a session
   * starts, so this is where a wrong-shaped tier assignment (F2) becomes visible instead
   * of vanishing into a main-process console.warn.
   */
  modelHinweis: string | null
  niveau: CapabilityNiveau
  /** Rough size signal — whitespace words, not a tokenizer. */
  wortZahl: number
}

export async function buildPromptPreview(
  entityId: string,
  niveau: CapabilityNiveau,
  tiers: ModelTiers,
  graphDb: Database.Database | null = null,
): Promise<PromptPreview | null> {
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
    phaseInput: await buildPhaseInputSection(graphDb, def.rahmen.phasenBindung),
  })

  const schichten = ['Body']
  if (prompt.includes('<!-- BEGIN:Capabilities -->')) schichten.push('Capabilities')
  if (prompt.includes('<!-- BEGIN:Persona -->')) schichten.push('Persona')
  if (prompt.includes('<!-- BEGIN:GlobalRules -->')) schichten.push('GlobalRules')
  if (prompt.includes('<!-- BEGIN:PhaseInput -->')) schichten.push('PhaseInput')

  // Resolved once, outside resolveModel's own lookup call, so a wrong-shaped tier
  // assignment is reported (console.warn) exactly once rather than once per lookup site.
  const tier = tierAus(def.rahmen.model)
  const cliErgebnis = tier ? cliHandleFuerTier(tier) : undefined

  return {
    prompt,
    schichten,
    capabilities,
    modelResolved: resolveModel(def.rahmen.model, tiers, () => cliErgebnis?.handle) ?? null,
    modelHinweis: cliErgebnis?.hinweis ?? null,
    niveau,
    wortZahl: prompt.split(/\s+/).filter(Boolean).length,
  }
}
