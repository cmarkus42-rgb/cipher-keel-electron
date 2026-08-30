/**
 * ModelleReiter — entries, the assignments, fallbacks, secrets.
 *
 * Every locked option and every warning is text the main process computed. This file
 * decides layout, never eligibility.
 *
 * Die Zuordnungen stehen nach Art gruppiert, Harness zuerst (Entwurf §3), und die erklaerenden
 * Texte — was bei leerem Platz gilt, wann eine Aenderung wirkt, was ein Eintrag ist — sind
 * hinter Info-Knoepfe gewandert (§4). Was die Wahl *einschraenkt*, steht weiterhin
 * unaufgefordert auf der Seite; diese Grenze ist vertagt, nicht entschieden.
 */
import { useState } from 'react'
import type { SettingsAnsicht, SlotAnsicht, Schreiber } from '../../../shared/settings-types'
import { Warnliste } from './Warnliste'
import { wirkungText } from './WirkungVermerk'
import { GeheimnisFeld } from './GeheimnisFeld'
import { EintragFormular } from './EintragFormular'
import { RueckfallEndpunkt } from './RueckfallEndpunkt'
import { InfoKnopf } from './InfoKnopf'
import { HarnessPlatzFeld } from './HarnessPlatzFeld'

const ART_TITEL: Record<string, string> = {
  'cli-harness': 'Ueber ein CLI-Harness',
  'local-http': 'Ueber HTTP im eigenen Zugriff',
  'api': 'Ueber einen fremden Anbieter',
}

/**
 * Die Zuordnungsgruppen, in der Reihenfolge, in der sie im Fenster stehen.
 *
 * Der Harness zuerst, weil er die groebste Wahl ist: er entscheidet mit, welche der darunter
 * stehenden Zuordnungen ueberhaupt greifen — ein Kimi-Harness liest keinen Tier-Platz. Entwurf
 * §3.
 */
const GRUPPEN = [
  { art: 'tier', titel: 'Tiers' },
  { art: 'sitzung', titel: 'Sitzung' },
  { art: 'rolle', titel: 'Rollen' },
] as const satisfies readonly { art: SlotAnsicht['art']; titel: string }[]

/**
 * Der Waechter, der die Stelle des frueheren „ungruppierten Restes" einnimmt.
 *
 * Solange die Gruppierung ueber eine Id-Tabelle lief, brauchte es unten auf der Seite einen
 * sichtbaren Rest fuer Plaetze, die die Tabelle nicht kannte — sonst waeren sie stumm
 * verschwunden. Mit `slot.art` ist die Menge der Arten geschlossen, und der Rest waere
 * beweisbar leer: toter Code, der eine Sorgfalt vortaeuscht, die der Typ schon leistet.
 *
 * Ersatzlos streichen waere aber schlechter als der Rest. Kaeme eine vierte Art dazu, fielen
 * ihre Plaetze ohne diese Zeile *ganz* von der Seite, ohne Fehler und ohne Spur. Die Zeile
 * uebersetzt dann nicht mehr — der Bau bricht dort ab, wo die Gruppe fehlt, statt im Fenster.
 */
type GruppierteArt = (typeof GRUPPEN)[number]['art']
const _keineArtOhneGruppe: [Exclude<SlotAnsicht['art'], GruppierteArt>] extends [never]
  ? true
  : never = true

const OERTLICHKEIT_TEXT: Record<string, string> = {
  'lokal': 'lokal',
  'eigenes-netz': 'eigenes Netz',
  'fremdes-netz': 'fremdes Netz',
}

/** The distinct lock reasons among a slot's options, in first-seen order. */
function sperrgruende(slot: SlotAnsicht): string[] {
  const gesehen = new Set<string>()
  for (const o of slot.optionen) {
    if (o.sperrgrund) gesehen.add(o.sperrgrund)
  }
  return [...gesehen]
}

/**
 * Eine Zuordnung.
 *
 * Was der Platz bedeutet und wann eine Aenderung wirkt, steht hinter dem ⓘ; was die Wahl
 * einschraenkt (Sperrgrund, Hinweis, Warnung), steht unaufgefordert darunter. Diese Grenze ist
 * die **vertagte** Frage aus §4 des Entwurfs, keine Entscheidung dieser Datei — der
 * eingerueckte Korrekturblock dort haelt fest, dass sie auf die Design-Session gehoert.
 */
function Zuordnung({
  slot,
  ansicht,
  schreibe,
}: {
  slot: SlotAnsicht
  ansicht: SettingsAnsicht
  schreibe: Schreiber
}) {
  return (
    <div style={styles.slot}>
      <div style={styles.slotKopf}>
        <span style={styles.slotName}>{slot.beschriftung}</span>
        <InfoKnopf
          id={slot.id}
          beschriftung={slot.beschriftung}
          text={
            <>
              {slot.rueckfallText}
              <span style={styles.wirkungImPopup}>{wirkungText(slot.wirkung)}</span>
            </>
          }
        />
      </div>
      <select
        value={slot.gewaehlt}
        onChange={e => schreibe('settings:zuordnung-setzen', slot.id, e.target.value)}
        style={styles.auswahl}
      >
        <option value="">— keine Zuordnung —</option>
        {slot.optionen.map(o => (
          <option
            key={o.eintragId}
            value={o.eintragId}
            disabled={o.sperrgrund !== null}
            title={o.sperrgrund ?? undefined}
          >
            {o.name}{o.sperrgrund ? ' — gesperrt' : ''}
          </option>
        ))}
      </select>
      {/*
        A disabled option can say "gesperrt" but not why — an option element renders
        no children beyond its label. The reasons are listed once beneath the field,
        deduplicated, because several entries usually share one: the answer to "why
        can I not pick that" belongs on screen, not in a tooltip.
      */}
      {sperrgruende(slot).map(grund => (
        <div key={grund} style={styles.sperrgrund}>{grund}</div>
      ))}
      {slot.gewaehltHinweis && <div style={styles.sperrgrund}>{slot.gewaehltHinweis}</div>}
      <Warnliste warnungen={slot.warnungen} />
      {slot.art === 'tier' && (
        <div style={styles.rueckfallFeld}>
          <label style={styles.marke}>Rueckfall-Handle</label>
          {/*
            `slot.art` entscheidet, ob das Feld erscheint — `slot.id.slice(5)` sagt nur noch,
            *welches* Tier gemeint ist. Das ist der Schluessel, keine Art: das Ansichtsmodell
            fuehrt ihn nicht, und aus der Art allein waere er nicht zu gewinnen.
          */}
          {/*
            Keyed on the value, not just the slot: an uncontrolled input keeps whatever
            it was mounted with, and every write returns a whole fresh view. Without
            this key the field would go on showing a value the view model has already
            replaced — the one place in this window where "it replaces what it has"
            would quietly not be true.
          */}
          <input
            key={ansicht.modellTiers[slot.id.slice(5) as 'light' | 'standard' | 'heavy']}
            defaultValue={ansicht.modellTiers[slot.id.slice(5) as 'light' | 'standard' | 'heavy']}
            onBlur={e =>
              schreibe('settings:einfachfeld-setzen', `modelltier:${slot.id.slice(5)}`, e.target.value)
            }
            style={styles.eingabe}
          />
        </div>
      )}
      {/*
        Gepruefte Bedingung ist der **Endpunkt**, nicht das Praefix `rolle:`. Der
        Rechercheur ist eine Rolle ohne `llm.*`-Endpunkt — sein Rueckfall ist das Modell des
        Hauptlaufs. Ueber das Praefix zu gehen ergab hier `endpunkt === undefined` und damit
        ein Formular, das `undefined:undefined` anbot und beim Schreiben einen Endpunkt
        angelegt haette, den niemand liest.

        Auch die Vorbedingung fragt inzwischen `slot.art` statt des Praefixes; `slice(6)` liefert
        nur noch den Schluessel der Rolle. Beides zusammen heisst: die Art kommt aus dem
        Ansichtsmodell, und ob es fuer diese Rolle wirklich einen Endpunkt gibt, sagt weiterhin
        der Endpunkt selbst.
      */}
      {slot.art === 'rolle' && (() => {
        const rolle = slot.id.slice(6) as keyof SettingsAnsicht['rueckfallEndpunkte']
        const endpunkt = ansicht.rueckfallEndpunkte[rolle]
        if (!endpunkt) return null
        return (
          // Keyed on the endpoint's own values, same discipline as the tier field
          // above: without it the form would keep showing what it was mounted with
          // after a write elsewhere replaces the view model.
          <RueckfallEndpunkt
            key={JSON.stringify(endpunkt)}
            rolle={rolle}
            endpunkt={endpunkt}
            schreibe={schreibe}
          />
        )
      })()}
    </div>
  )
}

export function ModelleReiter({
  ansicht,
  schreibe,
}: {
  ansicht: SettingsAnsicht
  schreibe: Schreiber
}) {
  // null = kein Formular offen; 'neu' = leeres Formular; sonst die Kennung des Eintrags
  const [formular, setFormular] = useState<string | null>(null)
  const vorlage = formular && formular !== 'neu'
    ? ansicht.eintraege.find(e => e.id === formular) ?? null
    : null

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

      <h3 style={styles.gruppe}>Harness</h3>
      <HarnessPlatzFeld platz={ansicht.harnessPlatz} schreibe={schreibe} />

      {GRUPPEN.map(g => {
        const gruppe = ansicht.slots.filter(s => s.art === g.art)
        if (gruppe.length === 0) return null
        return (
          <div key={g.art}>
            <h3 style={styles.gruppe}>{g.titel}</h3>
            {gruppe.map(slot => (
              <Zuordnung key={slot.id} slot={slot} ansicht={ansicht} schreibe={schreibe} />
            ))}
          </div>
        )
      })}

      <div style={styles.eintraegeKopf}>
        <h2 style={styles.ueberschrift}>Eintraege</h2>
        <button onClick={() => setFormular('neu')} style={styles.neuKnopf}>Neuer Eintrag</button>
      </div>
      {formular && (
        // Keyed on which entry is open: without it, switching straight from one entry's
        // form to another reuses the mounted instance, and useState's initialiser does
        // not run again. The heading would change while the fields kept the first
        // entry's values -- and Speichern would write them under the second entry's id.
        <EintragFormular
          key={formular}
          vorlage={vorlage}
          schreibe={schreibe}
          onFertig={() => setFormular(null)}
        />
      )}
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
                  <InfoKnopf
                    id={`eintrag:${e.id}`}
                    beschriftung={e.name}
                    text={
                      <>
                        {e.erklaertext}
                        <span style={styles.empfehlungImPopup}>{e.empfehlung}</span>
                      </>
                    }
                  />
                  <span style={styles.marke}>{OERTLICHKEIT_TEXT[e.oertlichkeit]}</span>
                  {e.faehigkeitenHerkunft && (
                    <span style={styles.herkunft}>Faehigkeiten: {e.faehigkeitenHerkunft}</span>
                  )}
                </div>
                <GeheimnisFeld
                  keyRef={e.keyRef}
                  status={e.geheimnisStatus}
                  hinweis={e.geheimnisHinweis}
                  schreibe={schreibe}
                />
                <div style={styles.eintragKnoepfe}>
                  <button onClick={() => setFormular(e.id)} style={styles.bearbeiten}>
                    Bearbeiten
                  </button>
                  {e.loeschbar && (
                    <button
                      onClick={() => schreibe('settings:eintrag-loeschen', e.id)}
                      style={styles.loeschen}
                    >
                      Eintrag loeschen
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

const styles = {
  ueberschrift: { color: '#e0e0e0', fontSize: 14, margin: 0 },
  gruppe: { color: '#888', fontSize: 12, margin: '16px 0 8px', fontWeight: 500 as const },
  slot: { marginBottom: 16, padding: 10, background: '#111', border: '1px solid #1e1e1e', borderRadius: 3 },
  slotKopf: { display: 'flex' as const, alignItems: 'baseline' as const, marginBottom: 6 },
  slotName: { color: '#ddd', fontSize: 13 },
  auswahl: {
    width: '100%', background: '#0d0d0d', border: '1px solid #333',
    borderRadius: 3, color: '#ddd', padding: '4px 6px', fontSize: 12,
  },
  sperrgrund: { color: '#ff9a9a', fontSize: 12, marginTop: 6 },
  wirkungImPopup: {
    display: 'block' as const, marginTop: 6, color: '#666', fontStyle: 'italic' as const,
  },
  empfehlungImPopup: { display: 'block' as const, marginTop: 6, color: '#6a8fa8' },
  rueckfallFeld: { marginTop: 8, display: 'flex' as const, gap: 6, alignItems: 'center' as const },
  marke: { color: '#777', fontSize: 11 },
  herkunft: { color: '#d9b25f', fontSize: 11 },
  eingabe: {
    background: '#0d0d0d', border: '1px solid #333', borderRadius: 3,
    color: '#ddd', padding: '3px 6px', fontSize: 12, width: 160,
  },
  eintraegeKopf: { display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 12 },
  neuKnopf: {
    background: '#1a1a1a', color: '#ddd', border: '1px solid #333',
    borderRadius: 3, padding: '4px 10px', cursor: 'pointer' as const, fontSize: 12,
  },
  eintragKnoepfe: { display: 'flex' as const, gap: 6, marginTop: 8 },
  bearbeiten: {
    background: '#1a1a1a', color: '#ddd', border: '1px solid #333',
    borderRadius: 3, padding: '3px 8px', cursor: 'pointer' as const, fontSize: 11,
  },
  eintrag: { marginBottom: 10, padding: 10, background: '#111', border: '1px solid #1e1e1e', borderRadius: 3 },
  eintragKopf: { display: 'flex' as const, gap: 10, alignItems: 'baseline' as const },
  eintragName: { color: '#ddd', fontSize: 13, fontWeight: 500 as const },
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
