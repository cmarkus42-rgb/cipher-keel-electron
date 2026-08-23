/**
 * index — the harness's public surface.
 *
 * Everything outside src/main/harness/ imports from here, so the module cut inside stays free to
 * move. Nothing here touches Electron; the IPC surface lives in src/main/harness-handlers.ts.
 */

export { starteLauf, setzeFort, setzeFolgeauftrag, type Auftrag, type LaufUmgebung } from './lauf'
export { oeffneHarnessDb, lesen, laufIds } from './protokoll'
export { WerkzeugRegistry } from './werkzeuge'
export { DATEI_WERKZEUGE } from './werkzeug-datei'
export {
  leseFaehigkeiten, faehigkeitLesenWerkzeug, FAEHIGKEIT_WERKZEUG_NAME, type Faehigkeit,
} from './faehigkeiten'
export { GRAPH_WERKZEUGE } from './werkzeug-graph'
export { NETZ_WERKZEUGE, VORGABE_POSITIVLISTE, VORGABE_SEITE_GRENZEN } from './werkzeug-netz'
export { rechercheurWerkzeug, RECHERCHIEREN_NAME } from './rechercheur'
export { codecFuer } from './codec'
export { type PraefixTeile } from './praefix'
export type { ModelAntwort } from './form'
