/**
 * InfoKnopf — ein kleines ⓘ neben einer Ueberschrift, das ein Popup mit erklaerendem Text oeffnet.
 *
 * **Kein Text steht in dieser Datei.** Sie bekommt ihn als Eigenschaft. Der Kopfkommentar von
 * settings-window.tsx sagt warum: „No rule lives here. sperrgrund and warnungen arrive as
 * finished German text." Was ein Platz bedeutet, weiss der Hauptprozess; diese Komponente weiss
 * nur, wie man es einklappt. Einzige Ausnahme ist das Geruest der `aria-label`-Zeile
 * („Erläuterung zu …"), und das ist Bedienbeschriftung wie „Neuer Eintrag" nebenan, keine
 * Auskunft ueber eine Regel: der erklaerende Satz selbst kommt vollstaendig von aussen.
 *
 * **Warum ein modulweiter Zustand und kein `useState` je Knopf.** Die Zusage lautet
 * „hoechstens eines offen". Mit einem Zustand je Knopf waere sie eine Absprache zwischen
 * Geschwistern, die niemand durchsetzt; mit einer einzigen Variablen ist sie ein Sachverhalt.
 * Sie ist ausserdem in Node pruefbar, ohne DOM und ohne neue Abhaengigkeit — dieses Repo hat
 * weder jsdom noch @testing-library/react (vitest.config.ts: environment 'node').
 *
 * **Warum `aria-expanded` + `aria-controls` und nicht `role="dialog"`.** Das Popup ist ein
 * aufgeklappter Erklaersatz neben einer Ueberschrift, kein Dialog: es faengt den Fokus nicht
 * ein, es hat keine Bedienelemente, und es blockiert nichts darunter. `role="dialog"` wuerde
 * einer Vorlesehilfe genau das versprechen und dann nicht halten. Die Offenlegung
 * („disclosure") beschreibt, was hier tatsaechlich passiert.
 */
import { useEffect, useSyncExternalStore, type ReactNode } from 'react'

/** Die Kennung des einen offenen Popups, oder null. Es gibt genau diese eine Variable. */
let offen: string | null = null
const hoerer = new Set<() => void>()

export function infoOffen(): string | null {
  return offen
}

function melde(): void {
  for (const h of [...hoerer]) h()
}

export function infoAbonniere(h: () => void): () => void {
  hoerer.add(h)
  return () => {
    hoerer.delete(h)
  }
}

/** Klick auf einen Knopf: oeffnet ihn — oder schliesst ihn, wenn er schon offen war. */
export function infoUmschalten(id: string): void {
  offen = offen === id ? null : id
  melde()
}

export function infoSchliessen(): void {
  if (offen === null) return
  offen = null
  melde()
}

/**
 * Haengt die beiden Schliesswege an ein Ereignisziel und gibt das Loesen zurueck.
 *
 * Das Ziel wird uebergeben statt hier auf `document` zugegriffen: dann kann ein Test ein
 * eigenes `EventTarget` aufspannen, und die Komponente bleibt die einzige Stelle, die weiss,
 * dass es in Wahrheit das Dokument ist.
 *
 * `pointerdown` statt `click`, weil der Klick daneben das Popup schliessen soll, bevor das
 * Element darunter reagiert. Blasenphase, nicht Einfangphase — der Knopf und das Popup halten
 * ihre eigenen Zeigerereignisse mit `stopPropagation` auf, und das wirkt nur so herum.
 */
export function installiereInfoSchliesser(ziel: EventTarget): () => void {
  const beiZeiger = () => infoSchliessen()
  const beiTaste = (e: Event) => {
    if ((e as KeyboardEvent).key === 'Escape') infoSchliessen()
  }
  ziel.addEventListener('pointerdown', beiZeiger)
  ziel.addEventListener('keydown', beiTaste)
  return () => {
    ziel.removeEventListener('pointerdown', beiZeiger)
    ziel.removeEventListener('keydown', beiTaste)
  }
}

export function InfoKnopf({
  id,
  beschriftung,
  text,
}: {
  /** Eindeutig auf der Seite: sie ist zugleich der Schluessel des einen offenen Popups. */
  id: string
  /** Die Ueberschrift, zu der der Knopf gehoert — nur fuer die Vorlesehilfe. */
  beschriftung: string
  text: ReactNode
}) {
  const aktuell = useSyncExternalStore(infoAbonniere, infoOffen, infoOffen)
  const istOffen = aktuell === id
  const popupId = `info-popup-${id}`

  useEffect(() => {
    if (!istOffen) return
    return installiereInfoSchliesser(document)
  }, [istOffen])

  return (
    <span style={styles.huelle} onPointerDown={e => e.stopPropagation()}>
      <button
        type="button"
        aria-label={`Erläuterung zu ${beschriftung}`}
        aria-expanded={istOffen}
        aria-controls={popupId}
        onClick={() => infoUmschalten(id)}
        style={{ ...styles.knopf, ...(istOffen ? styles.knopfOffen : {}) }}
      >
        ⓘ
      </button>
      {istOffen && (
        <span id={popupId} style={styles.popup}>
          {text}
        </span>
      )}
    </span>
  )
}

const styles = {
  huelle: { position: 'relative' as const, display: 'inline-block' as const, marginLeft: 6 },
  knopf: {
    background: 'none', border: 'none', padding: 0, lineHeight: 1,
    color: '#666', cursor: 'pointer' as const, fontSize: 12,
  },
  knopfOffen: { color: '#4a9eff' },
  popup: {
    position: 'absolute' as const, top: 18, left: 0, zIndex: 10,
    width: 320, padding: '8px 10px', background: '#1a1a1a',
    border: '1px solid #333', borderRadius: 3,
    color: '#bbb', fontSize: 12, lineHeight: 1.5,
    display: 'block' as const, fontStyle: 'normal' as const, fontWeight: 400 as const,
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
  },
}
