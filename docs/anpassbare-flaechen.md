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
| `llm.worker` | Endpunkt und Modell für Niveau-C-Worker — groß und gelegentlich. Zeigt auf den **DGX Spark**, siehe unten. Kann seit 2026-08-16 auch ein **API-Anbieter** sein | nein | nein — nur Config-Datei |
| API-Schlüssel | **nicht** in der Config: Keychain (`cipher-keel-api-<ref>`) oder Umgebung (`CIPHER_KEEL_API_<REF>`). Die Config nennt nur den Namen (`keyRef`) | nein | nein — Keychain oder Umgebung |

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
| NanoClaw-Socketpfad setzen | **Quelltext** (`main.ts` ruft `new NanoClawBridge()` ohne Pfad) | **nein** — Code-Änderung nötig |
| NanoClaw installieren (`./nanoclaw.sh`) | Terminal | **nein, ausdrücklich nicht** — siehe unten |
| NanoClaw: `/add-ollama-provider`, Agent-Group, cipher-keel-Kanal | NanoClaw-CLI | offen |

## Der harte Konflikt: NanoClaws Installer schließt Assistenten aus

NanoClaws README sagt wörtlich: *„Run the script directly, **not from inside a Claude
session** — the deterministic side needs interactive prompts and real shell I/O for
Node/pnpm bootstrap, Docker, OneCLI, and the container build."*

Das steht **direkt gegen CK-NFR-013**. Niveau B ist NanoClaw; wenn dessen Einrichtung
grundsätzlich nicht assistiert laufen kann, dann ist ein Drittel des Leistungsgefälles
nicht assistiert einrichtbar. Das ist keine Kleinigkeit und gehört in die
NanoClaw-Entscheidung zurückgetragen, statt als Fußnote mitgeschleppt zu werden.

**Drei Auswege, keiner davon geprüft:**

1. **NanoClaw bleibt optional.** Niveau B ist dann eine Erweiterung für Leute, die NanoClaw
   ohnehin betreiben, und keel liefert A und C assistiert einrichtbar aus. Ehrlich, aber es
   verkleinert das ausgelieferte Gefälle auf zwei Stufen.
2. **Ein Einrichtungs-Assistent in keel**, der alles Deterministische selbst tut und für den
   einen interaktiven Schritt eine benannte Anweisung ausgibt. Erfüllt CK-NFR-013 nicht
   vollständig, aber ehrlich und nachvollziehbar.
3. **Der C-Pfad trägt mehr.** Wenn ein Großteil der billigen Arbeit ohnehin Ein-Schuss ist,
   verschiebt sich das Gewicht von B nach C — und C ist vollständig assistiert einrichtbar,
   weil es nur einen Ollama-Endpunkt braucht.

## Was fehlt

- **Editierbarkeit generell.** Sie braucht ein Overlay-Verzeichnis für nutzereigene
  Fassungen, eine Vorrangregel gegenüber den gebündelten Inhalten und eine Validierung.
  Eigene Phase.
- **Eine Einstellungsoberfläche.** Der Renderer hat heute keine; `ui.*` ist über die
  jeweiligen Bedienelemente erreichbar, alles andere gar nicht.
