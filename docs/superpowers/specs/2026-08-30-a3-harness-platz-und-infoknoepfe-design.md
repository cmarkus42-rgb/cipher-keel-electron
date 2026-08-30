# A3: der Harness-Platz in den Einstellungen, und die Hinweise hinter Info-Knöpfe

**Stand:** 2026-08-30, `main` bei `3763c9d`. Christians Entscheidung: *„ja, in den einstellungen —
sinnvoll einsortiert (und nimm die hinweisetexte bitte mal in popups hinter info-buttons auf der
seite)"*.

Damit ist A3 entschieden: **der Platz in den Einstellungen**, nicht die Launcher-Kachel. Die
Kachel-Übersteuerung je Sitzung bleibt unbeantwortet und wird hier nicht gebaut.

---

## 1. Ein Harness ist kein Platz im Sinne von `slots.ts`

Der naheliegende Weg wäre ein achter Eintrag in `SLOTS`. Er ist falsch.

Jeder Platz dort zielt heute auf einen **Registry-Eintrag** — ein Modell —, und seine Optionen
werden über `eignung.ts` gefiltert: `laeufer`, `niveau`, Anbieterart. Ein Harness ist kein
Modelleintrag, sondern ein **Adapter**. Ihn in dieselbe Liste zu hängen hiesse, `Slot` zwei
verschiedene Dinge bedeuten zu lassen, und Eignungsregeln auf etwas anzuwenden, über das sie
nichts aussagen. Das ist dieselbe Verwechslung, an der der Befund vom 2026-08-23 hing (ein
Tier-Platz, der ein Modell wählt, aber nicht das CLI).

**Also ein eigener Typ**, `HarnessPlatz`, neben `SLOTS` statt darin. Der eigene Typ ist dabei
nicht teurer, sondern billiger:

- **Die Optionen kommen aus der `AdapterRegistry`**, gefiltert auf CLI-Adapter
  (`istSchleifenAdapter` schliesst die eigene Schleife aus — sie ist kein Harness zum Wechseln,
  sondern eine andere Sitzungsart).
- **Der Sperrgrund existiert schon.** Jeder Adapter hat `isAvailable()` und
  `nichtVerfuegbarGrund()` — auf Deutsch, genau in der Form, die die Seite als `sperrgrund`
  ohnehin rendert. `opencode` ist auf dieser Maschine nicht installiert; es erschiene gesperrt
  **mit Begründung**, ohne eine Zeile neuer Regellogik.
- **Kein `eignung`-Aufruf, keine zweite Quelle für die Läufer-Regeln.** Der Wächter-Test
  `eignung-einzige-quelle.test.ts` bleibt unberührt.

## 2. Was der Platz übersteuert — und was ausdrücklich nicht

Aufgelöst wird der Adapter heute an **einer** Stelle: `adapterRegistry.getForRuntime(rahmen.runtime)`
in `SESSION_CREATE`.

**Die Regel, und sie ist die wichtigste des Entwurfs:**

> Der Harness-Platz übersteuert **nur dann**, wenn die Laufzeit des Presets ohnehin auf einen
> **CLI-Adapter** zeigt.

Ein Preset mit `runtime: 'keel-harness'` ist eine Niveau-B-Zelle — die eigene Schleife, kein
fremder Prozess in einem Pane. Würde ein Harness-Platz auch die übersteuern, machte die Wahl
„Kimi" jede Niveau-B-Zelle kaputt. Der Platz wählt **zwischen fremden CLIs**, nicht zwischen
Sitzungsarten.

**Leerer Platz = das Preset entscheidet**, also genau das heutige Verhalten. Die Vorgabe ist
damit „keine Änderung", und wer nichts einstellt, merkt nichts.

**`wirkung: 'naechste-session'`** — wie bei den Tiers und der Niveau-B-Sitzung. Ein laufender
Pane hat seinen Prozess schon gestartet.

**Was passiert, wenn der gewählte Harness nicht verfügbar ist:** derselbe Weg wie heute. Die
`isAvailable()`-Prüfung in `SESSION_CREATE` läuft ohnehin vor jeder Verzweigung und scheitert
benannt mit `nichtVerfuegbarGrund()`. Kein neuer Fehlerpfad.

## 3. „Sinnvoll einsortiert"

Die Zuordnungen sind heute eine flache Liste aus sieben Plätzen dreier Arten. Sie bekommen
Überschriften nach Art, in dieser Reihenfolge:

1. **Harness** — womit eine Sitzung läuft (der neue Platz)
2. **Tiers** — welches Modell ein CLI-Harness startet
3. **Sitzung** — die eigene Schleife im Gitter
4. **Rollen** — was aus einem laufenden Auftrag heraus aufgelöst wird

Der Harness steht oben, weil er die gröbste Wahl ist: er entscheidet, *welche* der darunter
stehenden Zuordnungen überhaupt zur Anwendung kommen. Ein Kimi-Harness liest keinen Tier-Platz —
und genau das soll man in dieser Reihenfolge sehen können.

## 4. Die Hinweise hinter Info-Knöpfe

Ein `InfoKnopf`: kleines ⓘ neben einer Überschrift, öffnet ein Popup mit dem Text. Ein offenes
Popup schliesst beim Klick daneben und mit Escape.

**Dahinter kommen die erklärenden Texte:** was ein Platz bedeutet, wann eine Änderung wirkt
(`WirkungVermerk`), was bei leerem Platz passiert (`rueckfallText`), was ein Eintrag ist
(`erklaertext`, `empfehlung`), wofür ein Reiter da ist.

**Davor bleiben — und das ist eine Einschränkung, keine Nachlässigkeit:**

- **Sperrgründe** (warum eine Option nicht wählbar ist)
- **Warnungen** (`Warnliste`)
- **`gewaehltHinweis`** (was an der getroffenen Wahl klemmt)
- **übersprungene Einträge** und Fehlermeldungen

`ModelleReiter.tsx` begründet das heute schon im Quelltext, und die Begründung trägt: *„the
answer to ‚why can I not pick that' belongs on screen, not in a tooltip."* Eine Warnung hinter
einem Knopf ist eine Warnung, die niemand liest. Hinter das ⓘ gehört, was **erklärt**; auf die
Seite gehört, was **einschränkt**.

## 5. Was nicht gebaut wird

- **Keine Wahl an der Launcher-Kachel.** Christian hat die Einstellungen gewählt; die
  Übersteuerung je Sitzung bleibt offen.
- **Kein Preset bekommt `runtime: 'kimi-cli-tmux'`.** Der Platz ist der Weg, nicht ein zweites
  Preset je Harness — sonst entsteht genau die Matrix, die dieser Entwurf vermeidet.
- **Keine Änderung an den Tier-Plätzen.** Dass ein Kimi-Harness sie nicht liest, sagt der
  Adapter beim Start als Hinweis; die Plätze bleiben, was sie sind.

## 6. Was danach ungemessen bleibt

Der erste echte Kimi-Start. Frontmatter, `${base_prompt}` und die `${`-Wache folgen Doku und
Hilfetext; kein Lauf hat sie bestätigt. **Nach A3 ist er zum ersten Mal möglich** — und er
gehört beobachtet, nicht angenommen.
