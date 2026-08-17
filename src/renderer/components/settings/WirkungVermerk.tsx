/**
 * WirkungVermerk — says when a change takes effect, next to the field it belongs to.
 *
 * A page that makes every field look the same lies about three different lifetimes: the
 * model registry is read on every resolution, tiers at session launch, voice.enabled at
 * service start. That is the silent-failure shape the project treats as most expensive.
 */
import type { Wirkung } from '../../../shared/settings-types'

const TEXT: Record<Wirkung, string> = {
  'sofort': 'wirkt sofort',
  'naechste-session': 'gilt ab der naechsten Session',
  'neustart': 'braucht einen Neustart der App',
}

export function WirkungVermerk({ wirkung }: { wirkung: Wirkung }) {
  return <span style={style}>{TEXT[wirkung]}</span>
}

const style = {
  color: '#666',
  fontSize: 11,
  fontStyle: 'italic' as const,
  marginLeft: 8,
}
