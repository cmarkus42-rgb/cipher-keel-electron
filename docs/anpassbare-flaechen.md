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
| `llm.tagging` | Endpunkt und Modell für das Notizen-Tagging — klein und häufig, bleibt lokal | nein | nein — nur Config-Datei |
| `llm.worker` | Endpunkt und Modell für Niveau-C-Worker — groß und gelegentlich. Zeigt auf den **DGX Spark**, siehe unten | nein | nein — nur Config-Datei |

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

## Der Worker zeigt auf den DGX Spark — und was dort noch fehlt

Das Tagging bleibt lokal auf dem Mac, der Worker steht auf `100.78.7.108` (`gx10-91a9`, DGX
Spark, über Tailscale). Diese Trennung ist Absicht: Tagging ist klein und häufig und gehört
neben die Notizen, ein Worker-Auftrag ist groß und gelegentlich und gehört auf die Maschine
mit dem Speicher — und dorthin, wo ein dauerhaft geladenes Modell niemanden stört.

**Auf dem Spark fehlt noch ein Schritt.** Gemessen am 2026-08-13: Der Host antwortet über das
Tailnet in rund 6 ms auf Ping, aber auf Port 11434 lauscht nichts. Ollama bindet
standardmäßig nur an `127.0.0.1`. Nötig ist dort:

```
OLLAMA_HOST=0.0.0.0:11434
```

(als systemd-Override, danach Dienst neu starten.)

Solange das aussteht, scheitern Worker-Aufträge mit `Ollama ist auf 100.78.7.108:11434 nicht
erreichbar` — die Meldung benennt die Ursache genau. Das ist eine bewusste Entscheidung
gegen einen lokalen Default, der leise für den falschen Grund funktioniert hätte.

**Ebenfalls zu setzen:** `llm.worker.model` auf ein Modell, das der Spark wirklich ausliefert.
Der eingetragene Wert ist ein Platzhalter für das jeweilige Coding-Flaggschiff.

## Zum Festhalten geladener Modelle

`keep_alive` steht per Default auf `-1`, hält ein Modell also unbegrenzt geladen. Das ist
Absicht und dient der Latenzvermeidung: Ein kaltes Modell lässt die erste Anfrage die ganze
Ladezeit bezahlen, und die trifft denjenigen, der keel zuerst anspricht. Wer Modelle
durchmisst, ohne sie behalten zu wollen — eine Benchmark-Strecke —, setzt pro Auftrag einen
endlichen Wert.

## Was fehlt

- **Editierbarkeit generell.** Sie braucht ein Overlay-Verzeichnis für nutzereigene
  Fassungen, eine Vorrangregel gegenüber den gebündelten Inhalten und eine Validierung.
  Eigene Phase.
- **Eine Einstellungsoberfläche.** Der Renderer hat heute keine; `ui.*` ist über die
  jeweiligen Bedienelemente erreichbar, alles andere gar nicht.
