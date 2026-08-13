# Anpassbare Flächen — Inventar (CK-NFR-012)

**Stand:** 2026-08-11

> **CK-NFR-012:** Jede Fläche, die ein Nutzer sinnvoll anpassen kann — Einstellung,
> Prompt, Persona, Regel, Parameter —, ist in der App auffindbar, in ihrer Herkunft
> benannt und entweder editierbar oder ausdrücklich als „noch nicht editierbar" geführt.
> Eine anpassbare Fläche, die nur durch Editieren einer Datei außerhalb der App
> erreichbar ist und nirgends benannt wird, verletzt diese Anforderung.
>
> **Dieses Inventar ist Audit-Inhalt.** Ein Audit prüft es gegen die Realität. Eine neue
> anpassbare Fläche ohne Eintrag hier ist ein Audit-Befund.

## Einstellungen (ConfigStore)

Ablage: `~/.config/cipher-keel/cipher-keel-config.json`

| Fläche | Wirkung | In der App sichtbar | Editierbar |
|---|---|---|---|
| `app.maxSessions` | Obergrenze gleichzeitiger Sessions | nein | nein — nur Config-Datei |
| `agent.skipPermissions` | `--dangerously-skip-permissions` beim Start; Default `true` | nein | nein — nur Config-Datei. **Sicherheitsrelevant**, im README dokumentiert |
| `agent.modelTiers` | Tier → Modell-Handle (`light`/`standard`/`heavy`) | in der Prompt-Vorschau als aufgelöstes Modell | nein — nur Config-Datei |
| `ui.theme` | Farbschema | ja | ja |
| `ui.language` | Sprache | ja | ja |
| `ui.grid` | Spalten und Zeilen des Grids | ja | ja |
| `mcp.port` | Port des Graph-MCP-Servers | nein | nein — nur Config-Datei |
| `mcp.host` | Host des Graph-MCP-Servers | nein | nein — nur Config-Datei |
| `mcp.apiKey` | Auth-Schlüssel des MCP-Servers | nein | nein — nur Config-Datei |
| `voice.enabled` | Sprachausgabe an/aus | nein | nein — nur Config-Datei |
| `voice.piperVoice` | Stimme der Sprachausgabe | nein | nein — nur Config-Datei |
| `llm.ollamaHost` | Host des lokalen Ollama — zugleich der Weg zu einem zweiten Rechner | nein | nein — nur Config-Datei |
| `llm.ollamaPort` | Port des lokalen Ollama | nein | nein — nur Config-Datei |
| `llm.ollamaModel` | Modell für Notizen-Tagging **und** Niveau-C-Worker. Der Default ist ein Platzhalter für das jeweilige Coding-Flaggschiff, keine Wahl | nein | nein — nur Config-Datei |

Zwei weitere Schlüssel liegen in derselben Datei, sind aber keine anpassbaren Flächen im
Sinne dieser Anforderung — die App schreibt sie selbst und liest sie nur zurück:

| Fläche | Wirkung | In der App sichtbar | Editierbar |
|---|---|---|---|
| `windows.main` | zuletzt genutzte Fenstergeometrie | mittelbar — das Fenster steht da, wo es stand | nein — von der App geschrieben, keine Nutzerfläche |
| `projects` | Projektliste und aktives Projekt | ja — Projektauswahl | ja — über die Projektauswahl, nicht über die Datei |

## Prompt-Schichten

Alle fünf Schichten sind seit der Prompt-Vorschau **sichtbar** (Launcher → Preset → 👁).
Vier davon liegen per `?raw` im Bundle und sind in der App nicht editierbar; die fünfte
kommt aus dem Graphen und wird über die Arbeit im Projekt beeinflusst, nicht über eine
Einstellung.

| Fläche | Herkunft | In der App sichtbar | Editierbar |
|---|---|---|---|
| Body je Entität | `src/main/preset/*/[…]-body.md` | ja — Prompt-Vorschau | nein — Folgephase |
| Persona | `src/main/preset/shared/personas/` | ja — Prompt-Vorschau | nein — Folgephase. `resolvePersona` kennt einen Nutzerverzeichnis-Zweig, der nie aufgerufen wird |
| GlobalRules | `src/main/preset/global-rules.ts` | ja — Prompt-Vorschau | nein — Folgephase |
| Capability-`SKILL.md` | `src/main/preset/*/capabilities/*/SKILL.md` | ja — Prompt-Vorschau | nein — Folgephase |
| PhaseInput | Graph — `phasenoutput`-Artefakte der Vorgängerphase, aufgelöst über `phasenBindung` | ja — Prompt-Vorschau, sobald der Graph Artefakte trägt | mittelbar — ja, über die Artefakte im Graphen; es gibt keine Einstellung dafür |

Der `phaseninput` (M2 §9.1 und §17.4) trägt keine Inhalte, sondern **Zeiger**: Titel, uid
und — sofern vorhanden — Pfad. Die Entität holt sich das Artefakt selbst über den Graphen.
Eine Entität ohne Phasenbindung (der Systems Engineer) bekommt die Schicht nicht, eine mit
mehreren (der Workshop: `fixing` und `development`) bekommt einen Block je Phase.

## Preset-Eigenschaften

| Fläche | Herkunft | In der App sichtbar | Editierbar |
|---|---|---|---|
| `capabilityNiveau` | vom Adapter (M2 §11.3) | ja — Prompt-Vorschau, alle drei Stufen | nein — folgt dem Adapter, keine freie Wahl |
| `runtime` | Preset-Rahmen | nein | nein — Folgephase. M2 §11.4 sieht einen Pro-Session-Override als M3-Arbeit vor |
| `model` | Preset-Rahmen, aufgelöst über `agent.modelTiers` | ja — Prompt-Vorschau | nur indirekt über `agent.modelTiers` |

## Was fehlt

- **Editierbarkeit generell.** Sie braucht ein Overlay-Verzeichnis für nutzereigene
  Fassungen, eine Vorrangregel gegenüber den gebündelten Inhalten und eine Validierung.
  Eigene Phase.
- **Eine Einstellungsoberfläche.** Der Renderer hat heute keine; `ui.*` ist über die
  jeweiligen Bedienelemente erreichbar, alles andere gar nicht.
