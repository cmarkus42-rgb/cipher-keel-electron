/**
 * CliStartReiter — free-text start parameters per adapter.
 *
 * The adapter list comes from AdapterRegistry.listIds() via the view model, so a new CLI
 * adapter appears here without this file knowing it exists. The warning about a duplicated
 * parameter is computed in main from the adapter's own appGesteuerteParameter.
 */
import type { SettingsAnsicht, Schreiber } from '../../../shared/settings-types'
import { WirkungVermerk } from './WirkungVermerk'
import { Warnliste } from './Warnliste'

export function CliStartReiter({
  ansicht,
  schreibe,
}: {
  ansicht: SettingsAnsicht
  schreibe: Schreiber
}) {
  return (
    <div>
      <h2 style={styles.ueberschrift}>Startparameter je CLI</h2>
      <p style={styles.erklaerung}>
        Diese Parameter werden dem Startbefehl vorangestellt. Die App haengt ihre eigenen
        danach an — sie gehoeren nicht hierher.
      </p>
      {ansicht.adapter.map(a => (
        <div key={a.id} style={styles.block}>
          <div style={styles.kopf}>
            <span style={styles.name}>{a.name}</span>
            <span style={styles.kennung}>{a.id}</span>
            <WirkungVermerk wirkung="naechste-session" />
          </div>
          {/* Keyed on the value: see ModelleReiter -- an uncontrolled input would keep
              showing what it was mounted with after a write returns a fresh view. */}
          <input
            key={a.startArgs}
            defaultValue={a.startArgs}
            placeholder="z. B. --dangerously-skip-permissions"
            onBlur={e => schreibe('settings:startargs-setzen', a.id, e.target.value)}
            style={styles.eingabe}
          />
          <Warnliste warnungen={a.warnungen} />
          {a.appGesteuerteParameter.length > 0 && (
            <div style={styles.appGesteuert}>
              Von der App selbst gesetzt: {a.appGesteuerteParameter.join(' · ')}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

const styles = {
  ueberschrift: { color: '#e0e0e0', fontSize: 14, margin: '0 0 8px' },
  erklaerung: { color: '#888', fontSize: 12, margin: '0 0 16px' },
  block: { marginBottom: 14, padding: 10, background: '#111', border: '1px solid #1e1e1e', borderRadius: 3 },
  kopf: { display: 'flex' as const, gap: 10, alignItems: 'baseline' as const, marginBottom: 6 },
  name: { color: '#ddd', fontSize: 13 },
  kennung: { color: '#666', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" },
  eingabe: {
    width: '100%', background: '#0d0d0d', border: '1px solid #333', borderRadius: 3,
    color: '#ddd', padding: '4px 6px', fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
  },
  appGesteuert: { color: '#666', fontSize: 11, marginTop: 6, fontFamily: "'JetBrains Mono', monospace" },
}
