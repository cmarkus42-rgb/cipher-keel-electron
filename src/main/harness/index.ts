/**
 * index — the harness's public surface.
 *
 * Everything outside src/main/harness/ imports from here, so the module cut inside stays free to
 * move. Nothing here touches Electron; the IPC surface lives in src/main/harness-handlers.ts.
 */

export { starteLauf, setzeFort, setzeFolgeauftrag, type Auftrag, type LaufUmgebung } from './lauf'
export { weiterOderFrisch, FOLGE_RESERVE } from './fortsetzbarkeit'
export { oeffneHarnessDb, lesen, laufIds } from './protokoll'
export { WerkzeugRegistry } from './werkzeuge'
export { DATEI_WERKZEUGE } from './werkzeug-datei'
export { SCHREIB_WERKZEUGE } from './werkzeug-schreiben'
export { SHELL_WERKZEUGE } from './werkzeug-shell'
// Nur der Zwischenspeicher und der Typ, nicht die halbe Sandkasten-Fassade: `profilText`,
// `starte`, `entscheide` und die Zeitgrenzen haben ausserhalb von src/main/harness/ keinen
// Aufrufer, und ihre Tests greifen ohnehin auf den Modulpfad zu. Ein Export ohne Verbraucher ist
// genau die Sorte Flaeche, gegen die tests/harness/verdrahtung.test.ts angetreten ist — sie sieht
// verdrahtet aus und ist es nicht. `effekteOhneEntscheidung` bleibt aus demselben Grund draussen
// wie sein Zwilling `effekteOhneIntent`: der Waechter importiert ihn direkt.
export { STANDARD_ZWISCHENSPEICHER } from './sandkasten'
export type { SandkastenKontext } from './sandkasten'
export {
  leseFaehigkeiten, faehigkeitLesenWerkzeug, FAEHIGKEIT_WERKZEUG_NAME, type Faehigkeit,
} from './faehigkeiten'
export { GRAPH_WERKZEUGE } from './werkzeug-graph'
export { NETZ_WERKZEUGE, VORGABE_POSITIVLISTE, VORGABE_SEITE_GRENZEN } from './werkzeug-netz'
export { rechercheurWerkzeug, RECHERCHIEREN_NAME } from './rechercheur'
export { codecFuer } from './codec'
export { type PraefixTeile } from './praefix'
export type { ModelAntwort } from './form'
