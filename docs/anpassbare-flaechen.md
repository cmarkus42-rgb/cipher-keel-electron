# Anpassbare Flächen — Inventar (CK-NFR-012)

**Stand:** 2026-08-17 — Settings-Fenster nachgeführt (siehe
`docs/superpowers/specs/2026-08-17-settings-fenster-design.md`)

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

Seit dem Settings-Fenster (2026-08-17, Projektfenster-Kopfbereich → „Einstellungen") ist
der Grossteil dieser Tabelle **in der App erreichbar**. Die vier Blöcke ohne jeden Leser im
Quelltext (`app`, `ui`, `mcp`, `windows`) wurden im selben Zug **aus dem Schema entfernt**,
nicht nur ausgeblendet — eine Attrappen-Oberfläche für Werte, die niemand liest, hätte
dasselbe Muster fortgesetzt, gegen das diese Strecke antritt.

| Fläche | Wirkung | In der App sichtbar | Editierbar |
|---|---|---|---|
| `agent.startArgs` | Freitext-Startparameter je CLI-Adapter (ersetzt das frühere `agent.skipPermissions`); Vorgabe `--dangerously-skip-permissions` für `claude-code` | ja — Settings-Fenster, Reiter „CLI-Start" | ja — Settings-Fenster |
| `agent.modelTiers` | Tier → Modell-Handle (`light`/`standard`/`heavy`), Rückfall für einen leeren `tier:*`-Slot | ja — Settings-Fenster, Reiter „Modelle" (Rückfall-Handle je Tier), auch in der Prompt-Vorschau als aufgelöstes Modell | ja — Settings-Fenster |
| `modelle.eintraege` / `modelle.zuordnung` | Der Modell-Registry: eigene und überschreibende Einträge, die fünf Zuordnungsslots | ja — Settings-Fenster, Reiter „Modelle" | ja — Settings-Fenster (anlegen, bearbeiten, löschen, zuordnen) |
| `voice.enabled` | Sprachausgabe an/aus | ja — Settings-Fenster, Reiter „Sprachausgabe" | ja — Settings-Fenster |
| `voice.piperVoice` | Stimme der Sprachausgabe | ja — Settings-Fenster, Reiter „Sprachausgabe" | ja — Settings-Fenster |
| `llm.tagging` | Endpunkt und Modell für das Notizen-Tagging — klein und häufig, bleibt lokal. Zugleich Rückfall für einen leeren `rolle:tagging`-Slot | ja — Settings-Fenster, Reiter „Modelle" (Rückfall-Endpunkt-Editor) | ja — Settings-Fenster |
| `llm.worker` | Endpunkt und Modell für Niveau-C-Worker — groß und gelegentlich. Zeigt auf den **DGX Spark**, siehe unten. Kann seit 2026-08-16 auch ein **API-Anbieter** sein. Zugleich Rückfall für einen leeren `rolle:worker`-Slot | ja — Settings-Fenster, Reiter „Modelle" (Rückfall-Endpunkt-Editor) | ja — Settings-Fenster |
| API-Schlüssel | **nicht** in der Config: Keychain (`cipher-keel-api-<ref>`) oder Umgebung (`CIPHER_KEEL_API_<REF>`). Die Config nennt nur den Namen (`keyRef`) | ja — Settings-Fenster zeigt den Status (`im Schlüsselbund` / `aus Umgebung` / `fehlt` / `unbekannt`) am jeweiligen Eintrag | ja, aber nur schreibend — Settings-Fenster kann setzen und löschen, das Geheimnis selbst geht nie an den Renderer zurück |

Ein weiterer Schlüssel liegt in derselben Datei, ist aber keine anpassbare Fläche im Sinne
dieser Anforderung — die App schreibt ihn selbst und liest ihn nur zurück:

| Fläche | Wirkung | In der App sichtbar | Editierbar |
|---|---|---|---|
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

## Der Worker zeigt auf den DGX Spark — Stand 2026-08-14

Das Tagging bleibt lokal auf dem Mac, der Worker steht auf `100.78.7.108` (`gx10-91a9`, DGX
Spark, über Tailscale). Diese Trennung ist Absicht: Tagging ist klein und häufig und gehört
neben die Notizen, ein Worker-Auftrag ist groß und gelegentlich und gehört auf die Maschine
mit dem Speicher — und dorthin, wo ein dauerhaft geladenes Modell niemanden stört.

**Die Strecke läuft.** `gemma4:26b` beantwortete den Rückgabe-Vertrag über Tailscale beim
ersten Versuch, ohne Reparatur. Der Default in `llm.worker.model` ist deshalb ein real
vorhandenes Modell, kein Platzhalter mehr.

Die Diagnose war dabei zunächst falsch: Vermutet wurde ein fehlendes `OLLAMA_HOST`. In
Wahrheit läuft Ollama dort **im Container**, wo `OLLAMA_HOST=0.0.0.0` längst gesetzt war —
verschlossen war allein Dockers Host-Bindung auf `127.0.0.1`. Portbindungen sind bei Docker
unveränderlich, der Container musste also neu angelegt werden.

Gebunden ist er jetzt auf die **Tailscale-Adresse allein**, nicht auf `0.0.0.0`: über das
Tailnet erreichbar, über die LAN-Adresse geschlossen. Beides geprüft, und die Enge ist
gewollt.

**Was dort noch offen ist:** `docker.service` hat keine Abhängigkeit auf
`tailscaled.service`. Startet Docker beim Kaltstart zuerst, findet der Container seine IP
nicht — und ein Bindungsfehler ist ein *Start*-Fehler, den die Restart-Politik schlecht
auffängt. Der Drop-in dagegen braucht root, und auf dem Spark gibt es kein passwortloses
`sudo`:

```
sudo mkdir -p /etc/systemd/system/docker.service.d
printf "[Unit]\nAfter=tailscaled.service\nWants=tailscaled.service\n" \
  | sudo tee /etc/systemd/system/docker.service.d/after-tailscaled.conf
sudo systemctl daemon-reload
```

## API-Anbieter statt lokalem Modell

Seit dem 2026-08-16 kann jeder der beiden Endpunkte auch ein API-Anbieter sein. Ein Eintrag
sieht dann so aus:

```json
"llm": {
  "worker": {
    "kind": "openai-compatible",
    "baseUrl": "https://openrouter.ai/api/v1",
    "model": "qwen/qwen3-coder",
    "keyRef": "openrouter"
  }
}
```

Der Dialekt `openai-compatible` erreicht weit mehr als OpenAI — DeepSeek, OpenRouter,
Together, Fireworks, Groq, Mistral, xAI und vLLM sprechen ihn, und Ollamas eigene
`/v1`-Oberfläche ebenfalls. Anbieter mit eigener Form (Anthropics Messages-API, Googles
generateContent) kommen als Geschwister-Module dazu; an der Config ändert das nichts außer
einem neuen `kind`.

**Schlüssel gehören nicht hierher.** `cipher-keel-config.json` wird zwar mit `0600`
geschrieben, ist aber Klartext, landet in Backups und ist genau die Datei, die jemand beim
Hilfesuchen weiterreicht. Die Config nennt deshalb nur einen **Namen**, und der Schlüssel
liegt woanders:

| Quelle | Wo | Wann |
|---|---|---|
| macOS-Keychain | Dienst `cipher-keel-api-<ref>`, Konto `key` | bevorzugt |
| Umgebung | `CIPHER_KEEL_API_<REF>` | Rückfall, für kopflose Läufe |

Die Reihenfolge ist Absicht: Gewänne die Umgebung, würde eine vergessene Variable im
Shell-Profil stillschweigend den Schlüssel überstimmen, den ein Nutzer hinterlegt zu haben
glaubt — und der Fehler sähe aus wie ein Anbieter-Problem.

Hinterlegen von Hand:

```
security add-generic-password -s cipher-keel-api-openrouter -a key -w '<schlüssel>' -U
```

## Zum Festhalten geladener Modelle

`keep_alive` steht per Default auf `-1`, hält ein Modell also unbegrenzt geladen. Das ist
Absicht und dient der Latenzvermeidung: Ein kaltes Modell lässt die erste Anfrage die ganze
Ladezeit bezahlen, und die trifft denjenigen, der keel zuerst anspricht. Wer Modelle
durchmisst, ohne sie behalten zu wollen — eine Benchmark-Strecke —, setzt pro Auftrag einen
endlichen Wert.

---

# Einrichtung ist Teil des Ergebnisses (CK-NFR-013)

> **CK-NFR-013:** cipher keel soll herunterladbar und **assistiert einrichtbar** sein. Ein
> Maßstab: Eine Claude-Code-Session muss die vollständige Einrichtung durchführen können.
> Jeder Schritt, der zwingend von Hand am Terminal, in einer fremden Oberfläche oder in
> einer Konfigurationsdatei erfolgen muss, ist ein Mangel am Ergebnis — nicht bloß eine
> Unbequemlichkeit. **Auslieferungsmodalitäten zählen zum Ergebnis.**
>
> Das ist die Schwester von CK-NFR-012: Dort geht es um Flächen, die man *anpassen* können
> muss, hier um Schritte, die man *einrichten* muss.

## Was heute von Hand nötig ist — der ehrliche Stand (2026-08-13)

| Schritt | Wo | Automatisierbar? |
|---|---|---|
| `xattr -cr` nach der DMG-Installation | Terminal | ja, aber nur weil unsigniert — Signierung würde ihn ganz entfernen |
| `ollama pull <modell>` auf Mac und Spark | Terminal, zwei Rechner | ja, mit Zugang |
| ~~`OLLAMA_HOST` auf dem Spark~~ — **erledigt 2026-08-14**, und anders als hier beschrieben: Ollama läuft dort im Container mit `OLLAMA_HOST=0.0.0.0`, zu war allein Dockers Host-Bindung. Der Container ist jetzt auf die Tailscale-Adresse gebunden | Docker auf fremdem Host | ja, mit Zugang — **war es** |
| systemd-Drop-in `After=tailscaled.service` auf dem Spark | systemd, **braucht root** | nein — kein passwortloses `sudo` dort |
| `llm.worker.model` und ggf. Host setzen | Config-Datei | **nein** — keine Oberfläche (CK-NFR-012) |
| Niveau-B-Harness einrichten | noch kein Trägercode — keel baut sein eigenes Harness erst noch (siehe unten) | **offen** — es gibt noch nichts, das man einrichten müsste |

## Der Konflikt, der die Harness-Entscheidung ausgelöst hat — gelöst, nicht verschwunden (CK-NFR-013)

Bis 2026-08-16 war NanoClaw als Träger für Niveau B vorgesehen. Sein README sagte wörtlich:
*„Run the script directly, **not from inside a Claude session** — the deterministic side
needs interactive prompts and real shell I/O for Node/pnpm bootstrap, Docker, OneCLI, and
the container build."*

Das stand **direkt gegen CK-NFR-013**: Wenn die Einrichtung von Niveau B grundsätzlich nicht
assistiert laufen kann, ist ein Drittel des Leistungsgefälles nicht assistiert einrichtbar.
Zur Wahl standen drei Auswege — NanoClaw bleibt optional und Niveau B verkleinert sich,
keel bekommt einen eigenen Einrichtungs-Assistenten um NanoClaw herum, oder Niveau C trägt
mehr Gewicht.

**Aufgelöst am 2026-08-16 (M6-Nachtrag):** keiner der drei Auswege wurde gewählt. Statt
NanoClaw einzurichten, baut keel sein Harness für Niveau B selbst — ein eigenes Harness hat
keine Fremdinstallation, die einer Claude-Code-Session grundsätzlich verboten wäre, und der
Konflikt mit CK-NFR-013 entfällt damit strukturell statt durch einen Kompromiss. Das ist der
Grund, warum es dieses Harness gibt, nicht nur eine Umbenennung des Trägers. Der NanoClaw-
Bestand selbst ist am 2026-08-17 aus dem Repo entfernt worden (Rückbau, siehe
`docs/superpowers/specs/2026-08-17-nanoclaw-rueckbau-design.md`); die Einrichtung des neuen
Harness ist eigener, noch offener Bau-Strang (siehe „Was fehlt" unten).

## Was fehlt

- **Das Niveau-B-Harness und sein Einrichtungspfad.** Ersetzt NanoClaw als Träger (siehe
  CK-NFR-013 oben); der `nanoclaw-skill`-Ladeweg bleibt bestehen, aber das eigene Harness
  selbst — wie es eingerichtet und ohne Fremdinstallation betrieben wird — ist noch nicht
  gebaut. Eigener Bau-Strang.
- **Editierbarkeit generell.** Sie braucht ein Overlay-Verzeichnis für nutzereigene
  Fassungen, eine Vorrangregel gegenüber den gebündelten Inhalten und eine Validierung.
  Eigene Phase.
- ~~Eine Einstellungsoberfläche.~~ — **erledigt 2026-08-17.** Das Settings-Fenster deckt die
  Einstellungen-Tabelle oben ab. Weiterhin nicht editierbar: die Prompt-Schichten und
  Preset-Eigenschaften (siehe die Tabellen dort) und das Niveau-B-Harness, das es noch
  nicht gibt.
