/**
 * SprachausgabeReiter — the two voice fields, with their different lifetimes.
 *
 * `enabled` is read once at service start (main.ts), `piperVoice` on every utterance
 * (tts-piper.ts). Showing them side by side without saying so would be a lie by layout.
 */
import type { SettingsAnsicht, Schreiber } from '../../../shared/settings-types'
import { wirkungText } from './WirkungVermerk'
import { InfoKnopf } from './InfoKnopf'

export function SprachausgabeReiter({
  ansicht,
  schreibe,
}: {
  ansicht: SettingsAnsicht
  schreibe: Schreiber
}) {
  return (
    <div>
      <h2 style={styles.ueberschrift}>Sprachausgabe</h2>

      <div style={styles.block}>
        {/*
          Der Info-Knopf steht **neben** dem label, nicht darin.

          Nicht, weil ein Klick sonst das Kaestchen umschaltete — das tut er nicht: die
          Aktivierung eines label laesst interaktive Nachkommen ausdruecklich aus, und ein
          `button` ist interaktiver Inhalt. Sondern weil der barrierefreie Name des Kaestchens
          aus dem Inhalt seines label berechnet wird: ein Knopf darin steuerte sein eigenes
          `aria-label` dazu bei, und das Kaestchen hiesse fuer eine Vorlesehilfe
          „Sprachausgabe aktiv Erläuterung zu Sprachausgabe aktiv".

          Der Vermerk stand hier vorher im label. Als reiner Text war das richtig — er *gehoert*
          zur Beschriftung. Als eigenes Bedienelement gehoert er daneben.
        */}
        <div style={styles.zeile}>
          <label style={styles.zeile}>
            <input
              type="checkbox"
              checked={ansicht.sprachausgabe.aktiv}
              onChange={e => schreibe('settings:einfachfeld-setzen', 'sprachausgabe:aktiv', e.target.checked)}
            />
            <span style={styles.name}>Sprachausgabe aktiv</span>
          </label>
          <InfoKnopf
            id="sprachausgabe:aktiv"
            beschriftung="Sprachausgabe aktiv"
            text={wirkungText('neustart')}
          />
        </div>
      </div>

      <div style={styles.block}>
        <div style={styles.kopf}>
          <span style={styles.name}>Stimme</span>
          <InfoKnopf
            id="sprachausgabe:stimme"
            beschriftung="Stimme"
            text={wirkungText('sofort')}
          />
        </div>
        <input
          key={ansicht.sprachausgabe.stimme}
          defaultValue={ansicht.sprachausgabe.stimme}
          placeholder="de_DE-cipher_adult-medium"
          onBlur={e => schreibe('settings:einfachfeld-setzen', 'sprachausgabe:stimme', e.target.value)}
          style={styles.eingabe}
        />
      </div>
    </div>
  )
}

const styles = {
  ueberschrift: { color: '#e0e0e0', fontSize: 14, margin: '0 0 12px' },
  block: { marginBottom: 14, padding: 10, background: '#111', border: '1px solid #1e1e1e', borderRadius: 3 },
  kopf: { display: 'flex' as const, alignItems: 'baseline' as const, marginBottom: 6 },
  zeile: { display: 'flex' as const, alignItems: 'center' as const, gap: 8, cursor: 'pointer' as const },
  name: { color: '#ddd', fontSize: 13 },
  eingabe: {
    width: '100%', background: '#0d0d0d', border: '1px solid #333', borderRadius: 3,
    color: '#ddd', padding: '4px 6px', fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
  },
}
