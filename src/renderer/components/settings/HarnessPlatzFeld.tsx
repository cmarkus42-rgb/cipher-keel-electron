/**
 * HarnessPlatzFeld — der Platz, an dem ein Mensch waehlt, welches fremde CLI eine Sitzung faehrt.
 *
 * Wie eine Zuordnung gebaut und aus denselben Bausteinen, aber **nicht** aus einem
 * `SlotAnsicht`: ein Harness ist kein Registry-Eintrag, sondern ein Adapter, und der Entwurf
 * (§1) begruendet, warum dieser Unterschied bis hierher sichtbar bleiben soll. Deshalb
 * `ansicht.harnessPlatz` statt `ansicht.slots`, `adapterId` statt `eintragId`, und
 * SETTINGS_HARNESS_SETZEN statt SETTINGS_ZUORDNUNG_SETZEN.
 *
 * Der leere Eintrag traegt den `rueckfallKurz` des Hauptprozesses, nicht das
 * „— keine Zuordnung —" der Modellplaetze: ein leerer Harness-Platz ist keine Leere, sondern
 * ein benannter Ausgang (es gilt die Laufzeit des Presets). Der lange `rueckfallText` erklaert
 * dasselbe in zwei Saetzen und steht hinter dem ⓘ. **Beide Fassungen kommen fertig von
 * drueben**; hier zu kuerzen hiesse, die zweite ausgerechnet an der Stelle zu erfinden, die
 * keinen Text erfinden darf.
 *
 * Keine Hooks in dieser Funktion — der Zustand des Info-Knopfes liegt in ihm selbst. Das ist
 * kein Zufall, sondern der Grund, weshalb ein Test in Node sie direkt aufrufen und ihren
 * Elementbaum durchsuchen kann, ohne DOM.
 */
import type { HarnessPlatzAnsicht, Schreiber } from '../../../shared/settings-types'
import { SETTINGS_HARNESS_SETZEN } from '../../../shared/ipc-channels'
import { InfoKnopf } from './InfoKnopf'
import { wirkungText } from './WirkungVermerk'

/** Die verschiedenen Sperrgruende unter den Optionen, in der Reihenfolge des ersten Auftretens. */
function sperrgruende(platz: HarnessPlatzAnsicht): string[] {
  const gesehen = new Set<string>()
  for (const o of platz.optionen) {
    if (o.sperrgrund) gesehen.add(o.sperrgrund)
  }
  return [...gesehen]
}

export function HarnessPlatzFeld({
  platz,
  schreibe,
}: {
  platz: HarnessPlatzAnsicht
  schreibe: Schreiber
}) {
  return (
    <div style={styles.platz}>
      <div style={styles.kopf}>
        <span style={styles.name}>{platz.beschriftung}</span>
        <InfoKnopf
          id={platz.id}
          beschriftung={platz.beschriftung}
          text={
            <>
              {platz.erklaertext}
              <span style={styles.rueckfall}>{platz.rueckfallText}</span>
              <span style={styles.wirkung}>{wirkungText(platz.wirkung)}</span>
            </>
          }
        />
      </div>
      <select
        value={platz.gewaehlt}
        onChange={e => schreibe(SETTINGS_HARNESS_SETZEN, e.target.value)}
        style={styles.auswahl}
      >
        <option value="">{platz.rueckfallKurz}</option>
        {platz.optionen.map(o => (
          <option
            key={o.adapterId}
            value={o.adapterId}
            disabled={o.sperrgrund !== null}
            title={o.sperrgrund ?? undefined}
          >
            {o.name}{o.sperrgrund ? ' — gesperrt' : ''}
          </option>
        ))}
      </select>
      {/*
        Dieselbe Aufteilung wie bei den Modellplaetzen, und aus demselben Grund: ein
        `option`-Element rendert keine Kinder, eine gesperrte Zeile kann also „gesperrt" sagen,
        aber nicht warum. Die Gruende stehen einmal darunter — und sie stehen unaufgefordert
        da, nicht hinter dem ⓘ. Ob das so bleibt, ist die vertagte Frage aus §4 des Entwurfs;
        hier wird sie weder in die eine noch in die andere Richtung beantwortet.
      */}
      {sperrgruende(platz).map(grund => (
        <div key={grund} style={styles.sperrgrund}>{grund}</div>
      ))}
      {platz.gewaehltHinweis && <div style={styles.sperrgrund}>{platz.gewaehltHinweis}</div>}
    </div>
  )
}

const styles = {
  platz: { marginBottom: 16, padding: 10, background: '#111', border: '1px solid #1e1e1e', borderRadius: 3 },
  kopf: { display: 'flex' as const, alignItems: 'baseline' as const, marginBottom: 6 },
  name: { color: '#ddd', fontSize: 13 },
  auswahl: {
    width: '100%', background: '#0d0d0d', border: '1px solid #333',
    borderRadius: 3, color: '#ddd', padding: '4px 6px', fontSize: 12,
  },
  sperrgrund: { color: '#ff9a9a', fontSize: 12, marginTop: 6 },
  rueckfall: { display: 'block' as const, marginTop: 6, color: '#999' },
  wirkung: { display: 'block' as const, marginTop: 6, color: '#666', fontStyle: 'italic' as const },
}
