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
  // Der Netzkontext wird in baueLaufUmgebung je Harness-Lauf gebaut, nicht beim Start der App
  // und nicht je CLI-Session. Ein eigener Vermerk dafuer, weil keiner der drei anderen stimmt —
  // und ein falscher Vermerk ist schlimmer als keiner: der Nutzer wartet sonst auf einen
  // Neustart, der nichts aendert, oder haelt eine Aenderung fuer wirkungslos.
  'naechster-lauf': 'gilt ab dem naechsten Harness-Lauf',
  'naechste-session': 'gilt ab der naechsten Session',
  'neustart': 'braucht einen Neustart der App',
}

/**
 * Derselbe Satz ohne die Huelle, fuer die Stellen, die ihn in eigenem Umfeld setzen — im
 * Popup eines Info-Knopfes etwa, wo der Randabstand und das Kursiv der Zeile daneben stoerten.
 * Eine Funktion statt einer zweiten Tabelle: der Text bleibt an genau einer Stelle.
 */
export function wirkungText(wirkung: Wirkung): string {
  return TEXT[wirkung]
}

export function WirkungVermerk({ wirkung }: { wirkung: Wirkung }) {
  return <span style={style}>{wirkungText(wirkung)}</span>
}

const style = {
  color: '#666',
  fontSize: 11,
  fontStyle: 'italic' as const,
  marginLeft: 8,
}
