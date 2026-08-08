/**
 * preload-api.d.ts — the sole declaration of window.cipherKeel.
 *
 * The actual implementation lives in src/preload.ts (contextBridge); the
 * shape itself is canonically defined in src/shared/cipher-keel-bridge.ts
 * so both tsconfig.node.json (which type-checks src/preload.ts against it)
 * and tsconfig.web.json (this file) share one definition without crossing
 * the solution-style project-reference boundary.
 *
 * Until Phase 7 / Task 5b this file duplicated that shape by hand instead
 * of importing it, and had drifted (its on()/once() listener signature
 * omitted the mandatory IpcRendererEvent first argument). See
 * cipher-keel-bridge.ts's doc comment for the full story.
 *
 * CK-INF-009, CK-INF-022
 */

import type { CipherKeelBridge } from '../shared/cipher-keel-bridge'

declare global {
  interface Window {
    cipherKeel: CipherKeelBridge
  }
}

export {}
