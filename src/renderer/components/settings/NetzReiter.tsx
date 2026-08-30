/**
 * NetzReiter — der Netzzugang der Harness-Werkzeuge.
 *
 * Zwei Wege mit verschiedener Vertrauensstufe, und dieser Reiter stellt beide ein:
 *
 * - **Nachschlagen** im Hauptlauf, gegen die Positivliste. Herstellerdokumentation, nichts sonst.
 * - **Recherchieren** im gekapselten Unterlauf, fuer alles ausserhalb der Liste. Dort gilt keine
 *   Positivliste, dafuer hat der Unterlauf keine Datei- und keine Graph-Werkzeuge.
 *
 * Derselbe Suchanbieter bedient beide. Ohne Anbieter melden `web_suchen` und `seite_lesen`
 * benannt, dass Netzzugang nicht eingerichtet ist — sie geben keine leeren Treffer zurueck. Ein
 * Agent, der leere Ergebnisse statt eines Fehlers bekommt, halluziniert die Antwort.
 *
 * Die Schluessel gehen ueber `GeheimnisFeld` in den Schluesselbund, nie in die Konfigurationsdatei
 * und nie zurueck ins Fenster. Dasselbe Feld wie bei den Modell-Eintraegen, nicht eine zweite
 * Kopie davon.
 */
import type { SettingsAnsicht, Schreiber } from '../../../shared/settings-types'
import { GeheimnisFeld } from './GeheimnisFeld'
import { wirkungText } from './WirkungVermerk'
import { InfoKnopf } from './InfoKnopf'

/**
 * Die Anbieter mit dem, was ein Nutzer wissen muss, **bevor** er waehlt. Die Brave-Zeile ist der
 * Grund, warum diese Texte hier stehen und nicht nur im Quelltext: die Auflage ist eine
 * Entscheidung des Betreibers, und sie gehoert an die Stelle, an der er sie trifft.
 */
const ANBIETER: ReadonlyArray<{ wert: string; text: string; hinweis: string }> = [
  {
    wert: '',
    text: 'automatisch',
    hinweis: 'Nimmt den ersten eingerichteten: Tavily, dann SearXNG, dann Brave.',
  },
  {
    wert: 'tavily',
    text: 'Tavily',
    hinweis:
      '1.000 Anfragen im Monat frei, ohne Kreditkarte. Fuer Agenten gebaut. Keine Auflage, die '
      + 'keels Ereignisprotokoll beruehrt.',
  },
  {
    wert: 'searxng',
    text: 'SearXNG (selbst gehostet)',
    hinweis:
      'Ohne Grenzkosten und ohne Schluessel, braucht aber eine eigene Instanz. Reicht weiter, was '
      + 'Google und DuckDuckGo herausruecken — kann sich als DuckDuckGo-Proxy entpuppen.',
  },
  {
    wert: 'brave',
    text: 'Brave',
    hinweis:
      'Eigener Index — findet anderes als die uebrigen, und das zaehlt beim Rechercheur. '
      + 'Aber: §3(b)(i) der Nutzungsbedingungen untersagt das Speichern von Ergebnissen ausser '
      + 'transient. keels Ereignisprotokoll ist append-only und haelt die Trefferliste dauerhaft. '
      + 'Ob das als „transient storage required for operation" durchgeht, ist eine Auslegung.',
  },
]

export function NetzReiter({
  ansicht,
  schreibe,
}: {
  ansicht: SettingsAnsicht
  schreibe: Schreiber
}) {
  const netz = ansicht.netz
  const gewaehlt = ANBIETER.find(a => a.wert === netz.bevorzugt) ?? ANBIETER[0]

  return (
    <div>
      <h2 style={styles.ueberschrift}>Netzzugang der Harness-Werkzeuge</h2>
      <p style={styles.erklaerung}>
        Zwei Wege: <b>Nachschlagen</b> im Hauptlauf gegen die Positivliste unten, und der
        gekapselte <b>Rechercheur</b> fuer alles ausserhalb. Ohne Suchanbieter meldet das Werkzeug
        benannt, dass nichts eingerichtet ist — es liefert keine leeren Treffer.
      </p>

      <div style={styles.block}>
        <div style={styles.kopf}>
          <span style={styles.name}>Suchanbieter</span>
          <InfoKnopf
            id="netz:bevorzugt"
            beschriftung="Suchanbieter"
            text={wirkungText('naechster-lauf')}
          />
        </div>
        <select
          value={netz.bevorzugt}
          onChange={e => schreibe('settings:einfachfeld-setzen', 'netz:bevorzugt', e.target.value)}
          style={styles.auswahl}
        >
          {ANBIETER.map(a => (
            <option key={a.wert} value={a.wert}>{a.text}</option>
          ))}
        </select>
        <div style={styles.hinweis}>{gewaehlt.hinweis}</div>
      </div>

      <div style={styles.block}>
        <GeheimnisFeld
          keyRef="tavily"
          status={netz.tavily.status}
          hinweis={netz.tavily.hinweis}
          schreibe={schreibe}
        />
        <GeheimnisFeld
          keyRef="brave"
          status={netz.brave.status}
          hinweis={netz.brave.hinweis}
          schreibe={schreibe}
        />
      </div>

      <div style={styles.block}>
        <div style={styles.kopf}>
          <span style={styles.name}>SearXNG-Endpunkt</span>
          <InfoKnopf
            id="netz:searxngEndpunkt"
            beschriftung="SearXNG-Endpunkt"
            text={wirkungText('naechster-lauf')}
          />
        </div>
        {/* Keyed auf den Wert: siehe ModelleReiter — ein unkontrolliertes Feld zeigte sonst
            weiter, womit es eingehaengt wurde, nachdem ein Schreiben eine frische Ansicht
            zurueckgegeben hat. */}
        <input
          key={netz.searxngEndpunkt}
          defaultValue={netz.searxngEndpunkt}
          placeholder="z. B. http://100.78.7.108:8888 — leer heisst nicht eingerichtet"
          onBlur={e => schreibe('settings:einfachfeld-setzen', 'netz:searxngEndpunkt', e.target.value)}
          style={styles.eingabe}
        />
        <div style={styles.hinweis}>
          Kein Schluessel noetig. Der Aufruf geht bewusst nicht durch die Netzwache: das Suchziel
          ist betreiberkonfiguriert, und eine Instanz im Tailnet ist http auf 100.64.0.0/10 — durch
          die Wache zu fuehren hiesse, genau die zwei Regeln zu oeffnen, die dort am meisten tragen.
        </div>
      </div>

      <div style={styles.block}>
        <div style={styles.kopf}>
          <span style={styles.name}>Positivliste fuer das Nachschlagen</span>
          <InfoKnopf
            id="netz:positivliste"
            beschriftung="Positivliste fuer das Nachschlagen"
            text={wirkungText('naechster-lauf')}
          />
        </div>
        <div style={styles.hinweis}>
          Nur diese Hosts darf der Hauptlauf holen. Ein Eintrag deckt seine Unterdomaenen mit ab.
          Alles andere laeuft ueber den Rechercheur — <b>auch GitHub</b>, absichtlich: eine
          Repository-Seite traegt fremden Text in Issues und READMEs, den niemand redigiert hat.
          Sie ist kein Nachschlagewerk.
        </div>
        <div style={styles.vorgabe}>
          Mitgeliefert: {netz.vorgabePositivliste.join(' · ')}
        </div>
        <textarea
          key={netz.zusaetzlichePositivliste.join('\n')}
          defaultValue={netz.zusaetzlichePositivliste.join('\n')}
          placeholder={'Ein Host je Zeile, ohne Schema und ohne Pfad\nz. B. docs.python.org'}
          rows={4}
          onBlur={e =>
            schreibe('settings:einfachfeld-setzen', 'netz:zusaetzlichePositivliste', e.target.value)
          }
          style={{ ...styles.eingabe, resize: 'vertical' as const }}
        />
      </div>
    </div>
  )
}

const styles = {
  ueberschrift: { color: '#e0e0e0', fontSize: 14, margin: '0 0 8px' },
  erklaerung: { color: '#888', fontSize: 12, margin: '0 0 16px', lineHeight: 1.5 },
  block: { marginBottom: 14, padding: 10, background: '#111', border: '1px solid #1e1e1e', borderRadius: 3 },
  kopf: { display: 'flex' as const, gap: 10, alignItems: 'baseline' as const, marginBottom: 6 },
  name: { color: '#ddd', fontSize: 13 },
  hinweis: { color: '#888', fontSize: 11, marginTop: 6, lineHeight: 1.5 },
  vorgabe: {
    color: '#666', fontSize: 11, margin: '8px 0', fontFamily: "'JetBrains Mono', monospace",
    lineHeight: 1.6,
  },
  auswahl: {
    background: '#0d0d0d', border: '1px solid #333', borderRadius: 3,
    color: '#ddd', padding: '4px 6px', fontSize: 12, minWidth: 220,
  },
  eingabe: {
    width: '100%', background: '#0d0d0d', border: '1px solid #333', borderRadius: 3,
    color: '#ddd', padding: '4px 6px', fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
  },
}
