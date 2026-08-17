/**
 * ModelleReiter — entries, the five assignments, fallbacks, secrets.
 *
 * Every locked option and every warning is text the main process computed. This file
 * decides layout, never eligibility.
 */
import type { SettingsAnsicht } from '../../../shared/settings-types'
import { Warnliste } from './Warnliste'
import { WirkungVermerk } from './WirkungVermerk'
import { GeheimnisFeld } from './GeheimnisFeld'

const ART_TITEL: Record<string, string> = {
  'cli-harness': 'Ueber ein CLI-Harness',
  'local-http': 'Ueber HTTP im eigenen Zugriff',
  'api': 'Ueber einen fremden Anbieter',
}

const OERTLICHKEIT_TEXT: Record<string, string> = {
  'lokal': 'lokal',
  'eigenes-netz': 'eigenes Netz',
  'fremdes-netz': 'fremdes Netz',
}

export function ModelleReiter({
  ansicht,
  schreibe,
}: {
  ansicht: SettingsAnsicht
  schreibe: (kanal: string, ...args: unknown[]) => Promise<void>
}) {
  const arten = ['cli-harness', 'local-http', 'api'] as const

  return (
    <div>
      {ansicht.uebersprungen.length > 0 && (
        <div style={styles.uebersprungen}>
          <strong>Uebersprungene Eintraege aus der Konfiguration</strong>
          {ansicht.uebersprungen.map((u, i) => (
            <div key={i} style={styles.uebersprungenZeile}>
              {u.beschreibung} — {u.fehler}
            </div>
          ))}
        </div>
      )}

      <h2 style={styles.ueberschrift}>Zuordnungen</h2>
      {ansicht.slots.map(slot => (
        <div key={slot.id} style={styles.slot}>
          <div style={styles.slotKopf}>
            <span style={styles.slotName}>{slot.beschriftung}</span>
            <WirkungVermerk wirkung={slot.wirkung} />
          </div>
          <select
            value={slot.gewaehlt}
            onChange={e => schreibe('settings:zuordnung-setzen', slot.id, e.target.value)}
            style={styles.auswahl}
          >
            <option value="">— keine Zuordnung —</option>
            {slot.optionen.map(o => (
              <option key={o.eintragId} value={o.eintragId} disabled={o.sperrgrund !== null}>
                {o.name}{o.sperrgrund ? ' — gesperrt' : ''}
              </option>
            ))}
          </select>
          {slot.gewaehlt === '' && <div style={styles.rueckfall}>{slot.rueckfallText}</div>}
          {slot.gewaehltHinweis && <div style={styles.sperrgrund}>{slot.gewaehltHinweis}</div>}
          <Warnliste warnungen={slot.warnungen} />
          {slot.id.startsWith('tier:') && (
            <div style={styles.rueckfallFeld}>
              <label style={styles.marke}>Rueckfall-Handle</label>
              <input
                defaultValue={ansicht.modellTiers[slot.id.slice(5) as 'light' | 'standard' | 'heavy']}
                onBlur={e =>
                  schreibe('settings:einfachfeld-setzen', `modelltier:${slot.id.slice(5)}`, e.target.value)
                }
                style={styles.eingabe}
              />
            </div>
          )}
        </div>
      ))}

      <h2 style={styles.ueberschrift}>Eintraege</h2>
      {arten.map(art => {
        const gruppe = ansicht.eintraege.filter(e => e.art === art)
        if (gruppe.length === 0) return null
        return (
          <div key={art}>
            <h3 style={styles.gruppe}>{ART_TITEL[art]}</h3>
            {gruppe.map(e => (
              <div key={e.id} style={styles.eintrag}>
                <div style={styles.eintragKopf}>
                  <span style={styles.eintragName}>{e.name}</span>
                  <span style={styles.marke}>{OERTLICHKEIT_TEXT[e.oertlichkeit]}</span>
                  {e.faehigkeitenHerkunft && (
                    <span style={styles.herkunft}>Faehigkeiten: {e.faehigkeitenHerkunft}</span>
                  )}
                </div>
                <div style={styles.erklaertext}>{e.erklaertext}</div>
                <div style={styles.empfehlung}>{e.empfehlung}</div>
                <GeheimnisFeld eintrag={e} schreibe={schreibe} />
                {e.loeschbar && (
                  <button
                    onClick={() => schreibe('settings:eintrag-loeschen', e.id)}
                    style={styles.loeschen}
                  >
                    Eintrag loeschen
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

const styles = {
  ueberschrift: { color: '#e0e0e0', fontSize: 14, margin: '0 0 12px' },
  gruppe: { color: '#888', fontSize: 12, margin: '16px 0 8px', fontWeight: 500 as const },
  slot: { marginBottom: 16, padding: 10, background: '#111', border: '1px solid #1e1e1e', borderRadius: 3 },
  slotKopf: { display: 'flex' as const, alignItems: 'baseline' as const, marginBottom: 6 },
  slotName: { color: '#ddd', fontSize: 13 },
  auswahl: {
    width: '100%', background: '#0d0d0d', border: '1px solid #333',
    borderRadius: 3, color: '#ddd', padding: '4px 6px', fontSize: 12,
  },
  rueckfall: { color: '#777', fontSize: 11, marginTop: 6 },
  sperrgrund: { color: '#ff9a9a', fontSize: 12, marginTop: 6 },
  rueckfallFeld: { marginTop: 8, display: 'flex' as const, gap: 6, alignItems: 'center' as const },
  marke: { color: '#777', fontSize: 11 },
  herkunft: { color: '#d9b25f', fontSize: 11 },
  eingabe: {
    background: '#0d0d0d', border: '1px solid #333', borderRadius: 3,
    color: '#ddd', padding: '3px 6px', fontSize: 12, width: 160,
  },
  eintrag: { marginBottom: 10, padding: 10, background: '#111', border: '1px solid #1e1e1e', borderRadius: 3 },
  eintragKopf: { display: 'flex' as const, gap: 10, alignItems: 'baseline' as const },
  eintragName: { color: '#ddd', fontSize: 13, fontWeight: 500 as const },
  erklaertext: { color: '#999', fontSize: 12, marginTop: 4 },
  empfehlung: { color: '#6a8fa8', fontSize: 12, marginTop: 3 },
  loeschen: {
    marginTop: 8, background: '#1a1a1a', color: '#ff9a9a', border: '1px solid #40292a',
    borderRadius: 3, padding: '3px 8px', cursor: 'pointer' as const, fontSize: 11,
  },
  uebersprungen: {
    marginBottom: 16, padding: 10, background: '#2a1416',
    border: '1px solid #5a2a2a', borderRadius: 3, color: '#ff9a9a', fontSize: 12,
  },
  uebersprungenZeile: { marginTop: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 },
}
