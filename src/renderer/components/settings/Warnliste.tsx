/**
 * Warnliste — renders warnings that arrive as finished text.
 *
 * The codes are used only to key the list, never to decide what a warning means: the rule
 * that produced it lives in src/main/model/eignung.ts and is not restated here.
 */
import type { WarnungAnsicht } from '../../../shared/settings-types'

export function Warnliste({ warnungen }: { warnungen: WarnungAnsicht[] }) {
  if (warnungen.length === 0) return null
  return (
    <ul style={styles.liste}>
      {warnungen.map(w => (
        <li key={w.code} style={styles.zeile}>{w.text}</li>
      ))}
    </ul>
  )
}

const styles = {
  liste: { margin: '6px 0 0', padding: '0 0 0 18px', listStyle: 'square' as const },
  zeile: { color: '#d9b25f', fontSize: 12, marginBottom: 3 },
}
