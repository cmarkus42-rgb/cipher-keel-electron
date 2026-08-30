# Paket A: keel muss den Harness wählen können — Entwurf

**Stand:** 2026-08-30, nach dem Merge von Paket B (`main` bei `5edd729`, 2822 Tests).
Ersetzt die Skizze in `plans/2026-08-30-naechste-schritte-harness-wahl-und-mcp-transport.md`,
Abschnitt „Paket A", und stützt sich auf eine Recherche gegen die Doku **und** das installierte
Binary (`/opt/homebrew/bin/kimi`, `@moonshot-ai/kimi-code@0.38.0`).

---

## 1. Die Anforderung, in Christians Worten

> *„es geht … um den cli harness kimicode — dort hinterlege ich dann das modell was ich will …
> ich will ja auch cli-harnesse wechseln/probieren können"*

und

> *„diese möglichkeit MUSS es sowieso geben — wir wollen ja keinen goldenen käfig"*

Daraus folgt eine Festlegung, die den ganzen Entwurf trägt: **der Harness ist die Wahl, das
Modell ist es nicht.** Welches Modell ein CLI benutzt, ist dessen eigene Sache. keel muss es
nicht kennen und soll es nicht vorschreiben.

## 2. Was am 2026-08-30 gegen das Binary geprüft wurde

Der bisherige Plan nannte den Adapter „billig — er unterscheidet sich in `cmd`, im
Modell-Schalter und in der Frage, wie ein Entitäts-Prompt hineinkommt." **Das ist zu wenig.**
Die vierte Frage fehlte, und sie ist die teuerste: *wie kommen die zehn keel-Werkzeuge in eine
Kimi-Sitzung?* Wir haben gerade eine Woche in genau diese Erreichbarkeit für Claude Code
gesteckt; ein Harness ohne sie wäre in der Teststrecke kein gleichwertiger Teilnehmer.

### 2.1 Belegt am Hilfetext des Binaries

| Beobachtung | Folge für den Adapter |
|---|---|
| `--agent-file <path>` existiert | der Weg für den Entitäts-Prompt |
| „Cannot be combined with `--session`/`--continue`" — wörtlich im Hilfetext | Prompt beim **Anlegen** binden, beim Fortsetzen **weglassen** |
| `-m, --model <model>` existiert | wird bewusst **nicht** von keel gesetzt, siehe §4 |
| `-S/--session`, `-c/--continue` | Fortsetzen ja — aber kein `--fork-session`-Gegenstück |
| **kein `mcp`-Befehl** in der gesamten Befehlsliste | kein Gegenstück zu `claude mcp add-json` |

`--agent-file` ist **nicht wiederholbar**, obwohl `--help` mit `(default: [])` das Gegenteil
nahelegt. Empirisch aufgelöst, ohne einen Lauf zu starten:

```
error: option '--agent-file <path>' argument '/tmp/nope2.md' is invalid.
       --agent-file may only be specified once.
```

Der Parser bricht vor jeder Sitzungs- und Netzaktivität ab. `(default: [])` ist ein Innenleben
von commander.js, keine Zusage.

### 2.2 Belegt an der Dokumentation

**MCP-Konfiguration hat einen projektlokalen Ort** — das war die offene Frage, und sie fällt
günstig aus:

- Nutzerebene: `~/.kimi-code/mcp.json`
- **Projektebene: `<projekt>/.kimi-code/mcp.json`**, „effective only for the current repository"
- Bei Namensgleichheit gewinnt die Projektebene

Format ist JSON mit demselben Schlüssel, den wir schon schreiben:

```json
{ "mcpServers": { "cipher-keel": {
    "url": "http://127.0.0.1:<port>/mcp",
    "headers": { "Authorization": "Bearer <schluessel>" } } } }
```

**Damit bleibt `~/.kimi-code/config.toml` unangetastet** — 91 KB, Modus 0600, mit hoher
Wahrscheinlichkeit Anbieter-Zugangsdaten. Ein Adapter, der beim Sitzungsstart automatisch dort
hineinschriebe, wäre etwas kategorisch anderes als einer, der eine projektlokale Datei anfasst.
Die Datei wurde für diese Recherche ausdrücklich **nicht gelesen**.

**Der Rumpf einer Agent-Datei ist der Systemprompt.** Wörtlich:

> *„The body is the agent's system prompt, and it is rendered as a template each time the prompt
> is built"*

Pflichtfeld im Frontmatter ist genau eines: `description`. `name` fällt sonst auf den
Dateinamen zurück und muss kebab-case ergeben. Bei explizitem `--agent-file` **bricht das CLI
bei einer ungültigen Datei ab**, statt sie wie bei der Verzeichnissuche zu überspringen — ein
Fehlverhalten wäre also laut, nicht still. Gut.

**Nicht belegt:** was `-m` mit einem unbekannten Alias tut — lauter Fehler oder stiller Rückfall
auf `default_model`. Die Doku schweigt. Absichtlich nicht durch einen echten Lauf geklärt. Der
Entwurf in §4 ist so gebaut, dass die Antwort keine Rolle spielt.

## 3. Die drei Unterschiede, die der Adapter wirklich trägt

### 3.1 Der Prompt ersetzt, er ergänzt nicht

Claude bekommt `--append-system-prompt-file`; das Wort *append* steht im Schalternamen. Kimis
Agent-Datei-Rumpf **ist** der Systemprompt. Wer denselben Text unverändert übergibt, wirft
Kimis eigenen Vorgabe-Prompt weg.

Die Doku nennt den Platzhalter dafür: **`${base_prompt}`**. Der Adapter setzt ihn an den Anfang
des Rumpfs, damit aus „ersetzen" wieder „ergänzen" wird. Das ist kein Detail, sondern die
Übersetzung zwischen zwei verschiedenen Vorstellungen davon, was ein Zusatzprompt ist.

### 3.2 Der Rumpf wird als Template gerendert — `${` ist nicht neutral

Aus demselben Satz folgt, was er nicht sagt: **jede `${…}`-Sequenz in unserem Entitätsprompt
wird interpoliert.** Unsere Prompt-Texte enthalten Regeln, Beispiele und potenziell Code. Eine
Zeichenfolge wie `${foo}` verschwände lautlos oder würde durch etwas Fremdes ersetzt.

Der Adapter muss das behandeln, und zwar bevor jemand es im Feld bemerkt. Zwei Wege, und der
Entwurf entscheidet sich für den zweiten:

- **Maskieren** — jede `${`-Sequenz unschädlich machen. Verlangt Kenntnis der Escape-Regel; die
  Doku nennt keine.
- **Erkennen und benennen** — enthält der zusammengesetzte Prompt eine `${`-Sequenz außer dem
  von uns selbst gesetzten `${base_prompt}`, bricht der Adapter beim Anlegen ab und sagt, wo.
  Das ist der Weg, der zu diesem Repo passt: **laut scheitern statt still verfälschen**, und er
  braucht keine Regel, die niemand belegt hat.

### 3.3 Die MCP-Einspritzung ist einfacher, nicht schwerer

Kimi hat keinen `mcp`-Befehl, also entfällt Pfad 2 vollständig. Es bleibt **ein** Schreibpfad:
`<projekt>/.kimi-code/mcp.json`. Der Vertrag, den Paket B gerade gebaut hat — Einspritzen vor
dem Anlegen der tmux-Sitzung, Rücknahme durch Wiederherstellen des Vorzustands, Rückgabewert
`boolean` — passt darauf besser als auf Claude, weil es keinen zweiten, nicht zurücknehmbaren
Pfad gibt.

**Eine Schnittstellen-Korrektur gehört in dieselbe Änderung:** der Bedeutungssatz von
`postLaunchInjection` in `agent-adapter.ts` lautet heute wörtlich *„`settings.local.json` trägt
keinen Eintrag aus diesem Versuch mehr."* Das ist Claudes Dateiname an einer Stelle, die von
keinem Dateinamen wissen darf, und für Kimi schlicht falsch. Der Satz muss die geschriebene
Konfiguration meinen, nicht eine bestimmte Datei.

### 3.4 Die Trust-Abfrage — ein Betriebsbefund, kein Entwurfsdetail

Projektlokale MCP-Server lösen in einem nicht vertrauten Ordner beim Sitzungsstart eine
Rückfrage aus, **Vorgabe „Don't trust"**. Eine von keel gestartete Kimi-Sitzung kann also im
Pane auf eine Antwort warten, und wer sie wegklickt, hat eine Sitzung ohne die zehn Werkzeuge —
der Zustand „sieht gesund aus, ist es nicht".

keel kann die Abfrage nicht umgehen und soll es auch nicht. Was es kann: **den Fall benennen.**
Der Adapter trägt ihn in seinen Sitzungshinweis, sodass er dort steht, wo ein Mensch hinsieht.

## 4. Die Modellfrage (A4) — ohne Eingriff in eine freigetestete Fläche

Die alte Fassung des Befunds stellte die Frage „wie erzwingen wir, dass ein Tier-Platz nur
Einträge anbietet, die zum CLI passen?" und skizzierte drei Wege, von denen keiner überzeugte.
Christians Satz beantwortet sie anders: **ein CLI bringt sein Modell selbst mit.**

Daraus folgt der einfachste denkbare Schnitt:

> **`KimiCodeAdapter` übergibt `-m` nicht.** Kimi wählt aus seiner eigenen Konfiguration.

Das hat drei Vorzüge:

1. **Die Tier-Plätze werden nicht angefasst.** Sie bleiben, was sie sind — Claude-Handles für
   Claude-Sitzungen. Kein Umbau an einer freigetesteten Fläche, keine Matrix aus Plätzen.
2. **Die offene Frage aus §2.2 wird gegenstandslos.** Was Kimi mit einem unbekannten Alias tut,
   spielt keine Rolle, wenn keel nie einen übergibt.
3. **Die Freiheit bleibt trotzdem da, und zwar schon gebaut.** `--model` steht bei Kimi *nicht*
   in `appGesteuerteParameter`. Wer ein Modell je Sitzung festnageln will, trägt `-m <alias>` in
   die freien Startparameter ein — die Fläche dafür existiert seit der Startparameter-Strecke.

**Was dabei nicht still verschluckt werden darf:** ein Preset löst weiterhin einen Tier-Platz
auf und reicht `opts.model` herein. Der Kimi-Adapter ignoriert das — und muss es **sagen**,
nicht schweigend übergehen. Der Hinweis gehört in denselben Kanal wie der Trust-Befund aus §3.4:

> *„Der Tier-Platz gilt für diesen Harness nicht — Kimi Code waehlt sein Modell aus seiner
> eigenen Konfiguration. Fuer eine Festlegung je Sitzung: `-m <alias>` in den freien
> Startparametern."*

## 5. Was gebaut wird

**A1 — `KimiCodeAdapter` als zweiter `CliSitzungsAdapter`.**
`cmd: 'kimi'`; Entitätsprompt über `--agent-file` mit Frontmatter (`description` gesetzt,
`name` kebab-case) und `${base_prompt}` als erste Zeile des Rumpfs; `${`-Wache nach §3.2;
`--agent-file` **nur beim Anlegen**, beim Fortsetzen `-S`/`-c` ohne ihn; kein `-m`;
`postLaunchInjection` schreibt `<projekt>/.kimi-code/mcp.json` und gibt die Rücknahme zurück;
`isAvailable()` gegen `kimi` auf dem PATH; `nichtVerfuegbarGrund()` benennt es.

**A2 — `kimi-cli-tmux` in `KNOWN_RUNTIMES` und `RUNTIME_TO_ADAPTER_ID`.**
Beide Stellen sind bewusst getrennt, mit einem Wächter-Test dazwischen und einem eigenen
Fehlerzweig „gültig, aber nicht gebaut" in `getForRuntime`. Der Zweig steht seit dem
Niveau-B-Bau leer da und wartet genau auf diesen Fall — er bleibt, weil Codex und Gemini noch
kommen.

**A0 — die Vertragskorrektur aus §3.3**, in derselben Strecke, weil sie sonst niemand macht.

## 6. Was ausdrücklich offen bleibt und Christian gehört

**A3 — wo ein Mensch den Harness wählt.** Nach A1 und A2 existiert der Adapter und ist
ansprechbar; was fehlt, ist die Fläche. Zwei Richtungen, und die Wahl gehört nicht geraten:

- **Am Preset, überschreibbar.** Das Preset nennt weiter einen Vorgabe-Harness, eine neue
  Zuordnung überschreibt ihn. Passt zum bestehenden Platz-Muster, `wirkung: 'naechste-session'`
  wäre dieselbe Semantik wie bei den Tiers. Gut für ein „freigetestetes und optimiertes Setup".
- **An der Launcher-Kachel.** Beim Starten einer Zelle wählt man Entität **und** Harness.
  Direkter, und das ist der Weg, der *Ausprobieren* trägt — Christians eigentliches Wort.

**Empfehlung: beides, in dieser Reihenfolge** — erst der Platz als Vorgabe, dann die Kachel als
Übersteuerung je Sitzung. Sie widersprechen sich nicht, sie sind Vorgabe und Ausnahme. Aber das
sind zwei Flächen statt einer, und die zweite gehört bestätigt, bevor sie gebaut wird.

**`opencode` ist auf dieser Maschine nicht installiert** (`which opencode` leer). Als dritter
Harness bleibt es hypothetisch, bis es da ist. Der Entwurf ist so geschnitten, dass ein dritter
Adapter nichts Bestehendes anfassen muss.

**Der unbekannte Modell-Alias** (§2.2) bleibt unbelegt. Er wird erst relevant, wenn jemand `-m`
in die freien Startparameter schreibt — und dann trägt der Mensch die Wahl selbst.
