/**
 * Preset bodies — the core instruction text of each entity.
 *
 * Inlined at build time via Vite's `?raw` so the main bundle carries them.
 * There is no asset copy step: dist/main holds index.js only.
 */

import architectBody from './architect/architect-body.md?raw'
import cfBody from './cyber-factory/cf-body.md?raw'

export const ARCHITECT_BODY: string = architectBody
export const CF_BODY: string = cfBody
