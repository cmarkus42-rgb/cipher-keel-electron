/**
 * index — the harness's public surface.
 *
 * Everything outside src/main/harness/ imports from here, so the module cut inside stays free to
 * move. Nothing here touches Electron; the IPC surface lives in src/main/harness-handlers.ts.
 */

export { starteLauf, setzeFort, type Auftrag, type LaufUmgebung } from './lauf'
export { oeffneHarnessDb, anhaengen, lesen, laufIds } from './protokoll'
export { WerkzeugRegistry, type Werkzeug, type WerkzeugKontext } from './werkzeuge'
export { DATEI_WERKZEUGE } from './werkzeug-datei'
export { GRAPH_WERKZEUGE } from './werkzeug-graph'
export { codecFuer } from './codec'
export { projiziere } from './projektion'
export { baueStabilenTeil, type PraefixTeile } from './praefix'
export { PREISTABELLE_STAND, VORGABE_PREISE } from './preise'
export type { Ereignis, EreignisArt } from './ereignisse'
export type { Block, Nachricht, ModelAntwort } from './form'
export type { WacheKontext } from './pfadwache'
