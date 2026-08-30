/**
 * wirkungText — sagt, wann eine Aenderung wirkt.
 *
 * A page that makes every field look the same lies about three different lifetimes: the
 * model registry is read on every resolution, tiers at session launch, voice.enabled at
 * service start. That is the silent-failure shape the project treats as most expensive.
 *
 * **Die Komponente `WirkungVermerk` gab es hier bis zum 2026-08-30 und gibt es absichtlich
 * nicht mehr.** Der Satz steht jetzt in jedem Reiter hinter einem Info-Knopf. Als Komponente
 * bliebe er ein zweiter, sichtbarer Weg neben dem Knopf — und genau dieses Nebeneinander war
 * der Fehler der ersten Fassung: derselbe Hinweis im Reiter „Modelle" verborgen und in den drei
 * anderen offen. Dass die Ausnahme jetzt nicht mehr baubar ist, ist kein Nebeneffekt des
 * Loeschens, sondern sein Zweck. Die Datei behaelt ihren Namen, weil sie weiterhin die eine
 * Stelle ist, an der diese vier Saetze stehen.
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

export function wirkungText(wirkung: Wirkung): string {
  return TEXT[wirkung]
}
