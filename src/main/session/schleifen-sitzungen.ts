/**
 * schleifen-sitzungen — the grid cells of keel's own loop.
 *
 * **The state has exactly one source, and that is deliberate.** The obvious path would be to
 * derive the cell in the renderer from the event stream (run.started -> laeuft, run.finished ->
 * leerlaufend). But the main process needs the state anyway, to reject a second order while one
 * is still running. Then two places would know it — and that is the failure mode this stretch
 * has already paid for three times (aufgeschobenesLaden, klemmeMaxZeichen, WORKER_TIMEOUT_MS). So
 * the main process owns it, and the renderer derives nothing.
 */

export type Zellenzustand = 'leerlaufend' | 'laeuft'

export interface SchleifenZelle {
  name: string
  wurzel: string
  entityId: string
  /** The registry entry this cell was started with. */
  eintragId: string
  zustand: Zellenzustand
  /**
   * The currently running run — or, in state `leerlaufend`, the most recently run one. `null`
   * only while the cell has never had an order at all. Both live in one field, because
   * `weiterOderFrisch` needs exactly the last run; a second field "letzteLaufId" would be the
   * same fact held in two places.
   */
  laufId: string | null
  letzterEndzustand: string | null
}

export interface Zellenregister {
  setze(z: SchleifenZelle): void
  hole(name: string): SchleifenZelle | undefined
  entferne(name: string): void
  alle(): SchleifenZelle[]
  setzeZustand(name: string, zustand: Zellenzustand, endzustand?: string | null): void
  setzeLauf(name: string, laufId: string): void
}

export function neuesRegister(): Zellenregister {
  const zellen = new Map<string, SchleifenZelle>()
  return {
    setze: (z) => { zellen.set(z.name, z) },
    hole: (name) => zellen.get(name),
    entferne: (name) => { zellen.delete(name) },
    alle: () => [...zellen.values()],
    setzeZustand: (name, zustand, endzustand) => {
      const z = zellen.get(name)
      if (!z) return
      z.zustand = zustand
      if (endzustand !== undefined) z.letzterEndzustand = endzustand
    },
    setzeLauf: (name, laufId) => {
      const z = zellen.get(name)
      if (!z) return
      z.laufId = laufId
      z.zustand = 'laeuft'
    },
  }
}

/**
 * Pure, so a test can drive it directly — no test in this repo reaches ipcMain. Same pattern as
 * pruefeAnhaenge and pruefeLaufLaeuftNicht in harness-handlers.ts.
 */
export function pruefeZelleFrei(
  name: string, register: Zellenregister,
): { ok: true; zelle: SchleifenZelle } | { ok: false; meldung: string } {
  const zelle = register.hole(name)
  if (!zelle) {
    return { ok: false, meldung: `Es gibt keine Niveau-B-Zelle '${name}'.` }
  }
  if (zelle.zustand === 'laeuft') {
    return {
      ok: false,
      meldung: `In der Zelle '${name}' laeuft bereits ein Auftrag. Warte, bis er fertig ist, ` +
        `oder brich ihn ab — dein Auftrag ist nicht verloren.`,
    }
  }
  return { ok: true, zelle }
}
