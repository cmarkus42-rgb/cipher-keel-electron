/**
 * keel-arbeiter — die Niveau-B-Zelle im Gitter.
 *
 * `rollenTyp: BeauftragteInstanz`: die Zelle bekommt einen Auftrag und arbeitet ihn ab — heute
 * vom Menschen im Auftragsfeld, spaeter von einer starken Sitzung ueber SESSION_AUFTRAG.
 *
 * **`model` ist absichtlich leer, auf jedem Niveau.** Das Modell kommt aus dem Zuordnungsplatz
 * `sitzung:niveau-b` (model/slots.ts). Traegt hier jemand ein `provider:model` nach, gibt es
 * zwei Antworten auf eine Frage, und die zweite ist die, die beim naechsten Umbau vergessen
 * wird. tests/preset/keel-arbeiter.test.ts haelt das Feld leer.
 *
 * `capabilityAnbindung` kommt aus ka-capabilities.ts (getKaCapabilityPackages), nicht aus einer
 * eigenen Liste hier — siehe dort fuer den Grund: ENT-025 verlangt ein nicht-leeres Array
 * unbedingt, und eine zweite handgepflegte Liste neben den Paketen waere die Kopie, die beim
 * naechsten Umbau mit ihnen auseinanderlaeuft.
 */

import { RollenTyp } from '../schema'
import { CapabilityNiveau } from '../niveau'
import type { PresetRahmen } from '../schema'
import { getKaCapabilityPackages } from './ka-capabilities'

export function createKaRahmen(niveau: CapabilityNiveau): PresetRahmen {
  return {
    id: 'keel-arbeiter',
    name: 'keel-Arbeiter',
    rollenTyp: RollenTyp.BeauftragteInstanz,
    phasenBindung: [],
    capabilityAnbindung: getKaCapabilityPackages(niveau).map(p => p.name),
    graphAnbindung: { lesen: true, schreiben: false },
    personaVorgabe: '',
    runtime: 'keel-harness',
    model: '',
    capabilityNiveau: niveau,
    harnessBindung: '',
  }
}

export const KA_RAHMEN: PresetRahmen = createKaRahmen(CapabilityNiveau.B)
