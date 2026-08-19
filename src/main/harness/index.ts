/**
 * index — the harness's public surface.
 *
 * Everything outside src/main/harness/ imports from here, so the module cut inside stays free to
 * move. Nothing here touches Electron; the IPC surface lives in src/main/harness-handlers.ts.
 */

export { starteLauf, setzeFort, type Auftrag, type LaufUmgebung } from './lauf'
export { oeffneHarnessDb, lesen, laufIds } from './protokoll'
export { WerkzeugRegistry } from './werkzeuge'
export { DATEI_WERKZEUGE } from './werkzeug-datei'
export { GRAPH_WERKZEUGE } from './werkzeug-graph'
export { codecFuer } from './codec'
export { type PraefixTeile } from './praefix'
export type { ModelAntwort } from './form'
