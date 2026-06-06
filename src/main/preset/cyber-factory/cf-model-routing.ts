/**
 * CF Model Routing — route worker sessions to model tiers.
 * CK-P3CF-004
 */

import { CapabilityNiveau } from '../niveau'

export type ModelTier = 'light' | 'standard' | 'heavy'
export type SubsystemKomplexitaet = 'trivial' | 'business_logic' | 'architecture'

const NIVEAU_A_ROUTING: Record<string, ModelTier> = {
  trivial: 'light',
  business_logic: 'standard',
  architecture: 'heavy',
}

export function routeModel(komplexitaet: string, niveau: CapabilityNiveau): ModelTier {
  if (niveau !== CapabilityNiveau.A) return 'standard'
  return NIVEAU_A_ROUTING[komplexitaet] ?? 'standard'
}
