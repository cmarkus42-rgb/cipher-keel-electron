/**
 * Shared constants for cipher-keel-electron.
 *
 * WHY no Node.js APIs here: This file is shared between Main and Renderer.
 * Renderer runs in a sandboxed context where Node.js is not available.
 * Path-dependent values belong in brand.ts (Main-only).
 */

/** Interval in ms at which OutputBatcher flushes buffered terminal data to IPC. */
export const OUTPUT_BATCH_INTERVAL_MS = 16

/** Context usage warning threshold (percentage). */
export const CONTEXT_WARNING_THRESHOLD = 80

/** Directory for statusLine context JSON files. */
export const STATUSLINE_DIR = '/tmp/cipher-keel/context'

/** Maximum sessions per workspace. */
export const MAX_SESSIONS = 12

/** Default window dimensions. */
export const DEFAULT_WINDOW_WIDTH = 1440
export const DEFAULT_WINDOW_HEIGHT = 900
