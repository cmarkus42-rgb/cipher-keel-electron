/**
 * rollen — which endpoint a role reaches.
 *
 * This used to sit in `worker/model-client.ts`. It moved because the registry needs
 * `normaliseEndpoint` from there, and a role resolution reading the registry would have
 * closed the cycle `model-client -> registry -> entry -> model-client`. `model-client`
 * now carries transport concerns only. Same trap that keeps `filterByNiveau` in
 * `capability-schema.ts` rather than in `capabilities.ts`.
 *
 * Resolution order: registry assignment first, the old inline `llm.*` endpoint second.
 */

import { configStore } from '../config/config-store'
import { normaliseEndpoint, type ModelEndpoint, type LlmRole } from '../worker/model-client'
import { eintragFuerRolle } from './registry'
import { toModelEndpoint } from './entry'

export function endpointForRole(role: LlmRole): ModelEndpoint {
  const eintrag = eintragFuerRolle(role)
  if (eintrag) return toModelEndpoint(eintrag.erreichbarkeit)
  return normaliseEndpoint(configStore.get('llm')[role])
}
