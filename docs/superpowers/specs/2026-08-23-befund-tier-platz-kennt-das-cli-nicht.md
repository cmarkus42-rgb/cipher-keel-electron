# Befund: ein Tier-Platz wählt ein Modell, aber nicht das CLI — und beides muss zusammenpassen

**Gefunden:** 2026-08-23, beim Versuch, Kimi Code als zweites CLI-Harness einzutragen.
**Status:** offener Entwurfsbefund. **Nichts gebaut, nichts geändert.**

> **Korrektur vom 2026-08-30 — dieser Befund beschreibt das falsche Problem.**
>
> Er unterstellt, das Ziel sei „ein Kimi-**Modell** in einem Tier-Platz". Das war es nie. Christian
> dazu: *„es geht nicht um Kimi K3 sondern um den cli harness kimicode — dort hinterlege ich dann
> das modell was ich will … ich will ja auch cli-harnesse wechseln/probieren können."*
>
> Damit fällt die Prämisse. Das Modell eines CLI-Harness ist **dessen** Sache — Kimi Code bringt
> es in seiner eigenen Konfiguration mit, und `-m` überschreibt es je Aufruf. keel muss es gar
> nicht kennen.
>
> Die **eigentliche** Lücke ist eine andere und größer: **keel kann den Harness nicht wählen.**
> Er steckt in `rahmen.runtime` und damit im Preset-Quelltext. Ein Mensch, der Claude Code gegen
> Kimi Code tauschen oder beide nebeneinander probieren will, hat dafür keine Fläche.
>
> Was unten über die Mechanik steht, bleibt richtig und wird gebraucht (`cli` wird nirgends
> gelesen; `claude-code.ts:79` nagelt `cmd: 'claude'` fest). Nur die daraus gezogene Frage war
> falsch gestellt. Die richtige steht in
> `docs/superpowers/plans/2026-08-30-naechste-schritte-harness-wahl-und-mcp-transport.md`.

---

## Der Anlass

Kimi Code ist auf dieser Maschine installiert und läuft:

```
/opt/homebrew/bin/kimi          @moonshot-ai/kimi-code@0.38.0
-m, --model <model>             LLM model alias
Anbieter: openrouter (359 Modelle), Vorgabe: openrouter/moonshotai/kimi-k3
```

Ein Registry-Eintrag dafür sähe naheliegend so aus:

```ts
{ art: 'cli-harness', cli: 'kimi', handle: 'openrouter/moonshotai/kimi-k3' }
```

Das wäre ein Einzeiler — und deshalb steht er hier statt in `defaults.ts`.

## Was dabei auffiel

**Das Feld `cli` wird beim Start nirgends gelesen.** Es gibt genau zwei Stellen, die es überhaupt
anfassen:

- `model/entry.ts:181` — prüft beim Laden, dass es nicht leer ist
- sonst niemand

Der Startbefehl entsteht in `agent/adapters/claude-code.ts:79` und lautet fest `{ cmd: 'claude', args }`.
Welches Binary läuft, entscheidet also **allein der Adapter**, und der kommt aus `runtime` des
Presets — nicht aus dem Registry-Eintrag.

## Die Folge, genau benannt

Ein Sitzungsstart zieht seine zwei Hälften aus **zwei unabhängigen Quellen**:

| Was | Woher | Beispiel |
|---|---|---|
| welches **Binary** läuft | `rahmen.runtime` → `RUNTIME_TO_ADAPTER_ID` → Adapter | `claude` |
| welches **Modell** es startet | `rahmen.model` (Tier-Label) → Zuordnungsplatz → `handle` | `opus` |

Nichts erzwingt, dass die beiden zusammenpassen. Heute fällt das nicht auf, weil **alle drei**
`cli-harness`-Einträge zu demselben Binary gehören (`claude-opus-cli`, `claude-sonnet-cli`,
`claude-haiku-cli`, alle `cli: 'claude'`). Die Frage stellt sich erst mit dem vierten.

Trägt man den Kimi-Eintrag ein, bietet das Einstellungsfenster ihn für **jeden** Tier-Platz an —
`eignung.ts` prüft nur die Anbieter**art** (`cli-harness`), nicht das Binary. Belegt jemand
`tier:heavy` damit, startet eine gewöhnliche Claude-Code-Sitzung als

```
claude --model openrouter/moonshotai/kimi-k3
```

**Das scheitert laut, nicht still** — Claude Code kennt diesen Modellnamen nicht und bricht ab. Der
Fehler ist also sichtbar. Falsch ist trotzdem etwas anderes, und zwar davor: **die Oberfläche bietet
eine Paarung an, die es nicht geben kann.** Das ist die Sorte Angebot, die dieses Repo an anderer
Stelle ausdrücklich „eine stille Falle" nennt — dort für den umgekehrten Fall, dass man einem
CLI-Harness ein fremdes Modell unterschiebt (`eignung.ts`, `sperrgrund`).

## Warum das nicht durch einen zweiten Eintrag zu lösen ist

Ein Kimi-Preset bräuchte `runtime: 'kimi-cli-tmux'`. Diesen Wert gibt es nicht; `getForRuntime`
würde ihn benannt abweisen. Für Kimi als eigenständigen Harness fehlt also:

1. ein `KimiCodeAdapter` (`CliSitzungsAdapter`) — **billig geworden**, seit die Schnittstelle in
   Basis plus zwei Sorten zerfällt; er unterscheidet sich im Wesentlichen durch `cmd`, den
   Modell-Schalter und die Prompt-Datei-Fähigkeit
2. `kimi-cli-tmux` in `KNOWN_RUNTIMES` und `RUNTIME_TO_ADAPTER_ID`
3. **und die eigentliche Entscheidung:** wie wird erzwungen, dass ein Tier-Platz nur Einträge
   anbietet, die zum CLI der Sitzung passen?

Punkt 3 ist der Grund für diesen Befund. Drei Wege, keiner davon offensichtlich richtig:

- **Der Eintrag trägt das Binary, der Platz filtert danach.** Verlangt, dass der Platz weiß, welches
  CLI später laufen wird — er weiß es nicht, das entscheidet erst das Preset.
- **Je CLI eigene Tier-Plätze** (`tier:heavy:claude`, `tier:heavy:kimi`). Ehrlich, aber die Zahl der
  Plätze wächst mit den Anbietern, und die Einstellungsseite wird zur Matrix.
- **Der Adapter prüft beim Start**, ob der aufgelöste Handle zu seinem Binary gehört, und weist
  sonst benannt ab. Billigster Weg, verlegt die Entscheidung aber ans Ende — der Mensch hat die
  falsche Paarung dann schon gespeichert.

## Was ausdrücklich nicht behauptet wird

- Ob Kimi Code `--append-system-prompt-file` oder ein Äquivalent kennt, wurde **nicht** geprüft.
  Ohne das startet eine Sitzung ohne Entitäts-Prompt, und `ClaudeCodeAdapter` weigert sich an
  dieser Stelle ausdrücklich (`buildLaunchCommand`, leerer Prompt-Pfad).
- Ob Kimis Sitzungs- und Fortsetz-Schalter (`-S`, `-c`) auf die Annahmen des tmux-Wegs passen,
  wurde nicht geprüft.
- Die drei Wege oben sind Skizzen, keine Empfehlung.

## Was daran nicht wartet

Die **OpenRouter-Einträge** (`api`) sind von all dem nicht betroffen: sie gehen an
`eigene-schleife`- und `ein-schuss`-Plätze, und dort liest keel das Modellfeld selbst und spricht
den Endpunkt direkt an. Kein CLI, keine Paarung, kein Befund.
