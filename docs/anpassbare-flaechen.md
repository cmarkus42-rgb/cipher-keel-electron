# Anpassbare Flächen — Inventar (CK-NFR-012)

**Stand:** 2026-08-22 — der GPU-Zugriff des Spark-Containers benannt (er geht bei jedem `daemon-reload` verloren und verfälscht dann jede Zeitmessung); der Netzfilter der Maschine benannt (er hält Erstkontakte und verfälscht jede Messung); neuer Zuordnungsplatz `rolle:rechercheur` (das Modell des Unterlaufs war
an den Hauptlauf gekoppelt); der Nachschlage-Weg beschränkt jetzt die **Suchanfrage** und filtert die
Treffer, nicht erst den Abruf; die Zeilen zum Reiter „Netz" nachgeführt, die noch „noch kein
Config-Schlüssel" sagten. Davor 2026-08-21, Netz-Werkzeuge (Vorgabe-Positivliste, Suchanbieter und
Seitengrenzen je Lauf; siehe Abschnitt „Zufuhr"). Davor am selben Tag die Zufuhr darunter
(Suchanbieter, netzwache-Positivliste, Extraktionsgrenzen). Davor 2026-08-17, Settings-Fenster (siehe
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
| `modelle.eintraege` / `modelle.zuordnung` | Der Modell-Registry: eigene und überschreibende Einträge, die **sechs** Zuordnungsslots | ja — Settings-Fenster, Reiter „Modelle" | ja — Settings-Fenster (anlegen, bearbeiten, löschen, zuordnen) |
| `modelle.zuordnung.rollen.rechercheur` | Das Modell des **Rechercheur-Unterlaufs** (`recherchieren`). Bis 2026-08-22 erbte er das Modell des Hauptlaufs; damit war die Frage „welches Modell recherchiert am besten" nicht fahrbar. Leer heißt hier — anders als bei `tagging` und `worker` — **nicht** „nimm den `llm.*`-Endpunkt", sondern „nimm das Modell des Hauptlaufs"; einen eigenen Endpunkt gibt es für diese Rolle nicht. Gelesen wird je Lauf (`baueLaufUmgebung`), eine Änderung gilt also ab dem nächsten Lauf. Eine Zuordnung, die die eigene Schleife nicht fahren kann (cli-harness), fällt **benannt** auf den Rückfall zurück, statt den Lauf mitten im Werkzeugaufruf sterben zu lassen | ja — Settings-Fenster, Reiter „Modelle", Slot „Rolle Rechercheur — der abgeschottete Unterlauf" | ja — Settings-Fenster |
| `modelle.eintraege[].faehigkeiten.sampler` | Die vier Sampler plus Denkstufe, die **allein der Codec `openai-chat`** je Anfrage mitschickt: `temperature`, `topP`, `presencePenalty`, `maxTokens`, `reasoningEffort`. `anthropicCodec.toWire` liest den Block nicht — bei jedem anderen Codec werden die Werte gespeichert, erreichen den Server aber nie; das Formular warnt dann an Ort und Stelle. Der Block ist optional; **ihn wegzulassen ist aber keine Enthaltung** (siehe unten) | ja — Settings-Fenster, Reiter „Modelle" → Eintrag bearbeiten → Block „Faehigkeitszeile" → Kontrollkaestchen „Sampler selbst setzen"; die fünf Felder erscheinen erst, wenn es angekreuzt ist | ja — Settings-Fenster |
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
| Capability-`SKILL.md` (Preset-Quelle) | `src/main/preset/*/capabilities/*/SKILL.md` | ja — Prompt-Vorschau | nein — Folgephase |
| **Fähigkeiten des Harness-Laufs** | `<Projektwurzel>/.claude/skills/<name>/SKILL.md` und `<Projektwurzel>/.claude/capabilities/<name>/SKILL.md` — gelesen von `src/main/harness/faehigkeiten.ts` | ja — als Abschnitt `## Fähigkeiten` im stabilen Präfix jedes Laufs, und im Ereignisprotokoll bei `skill.geladen` | **ja — mit einem Texteditor, ohne die App.** Eine neue `SKILL.md` unter der Projektwurzel ändert ab dem nächsten Lauf das Verhalten des Modells |
| **Netzzugang der Harness-Werkzeuge** | `netz.searxngEndpunkt`, `netz.bevorzugt`, `netz.zusaetzlichePositivliste` im ConfigStore; die Schlüssel im Schlüsselbund unter `cipher-keel-api-tavily` bzw. `cipher-keel-api-brave` (oder in `CIPHER_KEEL_API_TAVILY` / `CIPHER_KEEL_API_BRAVE`) | ja — Settings-Fenster, Reiter „Netz"; und ohne Suchanbieter melden `web_suchen` und `seite_lesen` benannt, dass Netzzugang nicht eingerichtet ist | ja — Settings-Fenster (Anbieterwahl, beide Schlüsselfelder, SearXNG-Endpunkt, Positivliste), sonst ConfigStore bzw. Schlüsselbund |
| **GPU-Zugriff des Ollama-Containers auf dem Spark** | Docker auf `gx10-91a9`, **außerhalb des Repos** | Ob `keel-qwen38:27b` auf der GPU oder auf der CPU rechnet. **Kein Schalter, sondern ein Fehlerfall, der sich von selbst einstellt** — die Mechanik steht unter der Tabelle. Symptom: Ollamas Scheduler meldet weiter `library=CUDA available="115.0 GiB"`, während jeder neu gestartete `llama-server` mit `ggml_cuda_init: failed to initialize CUDA: no CUDA-capable device is detected` auf CPU fällt. Gemessen 2026-08-22: 53 s für 19 Prompt- und 36 Antwort-Token gegen 10,8 s nach der Behebung — und gegen 22–40 s für einen **ganzen Agentenzug** auf der GPU | **nein — und das ist das Gefährliche.** keel sieht nur langsame Antworten. Prüfbefehl ist `docker exec ollama nvidia-smi -L`, **nicht** `nvidia-smi` auf dem Host: der sieht die GPU die ganze Zeit | ja, außerhalb der App — **dauerhaft behoben am 2026-08-22**: der Container ist mit ausdrücklichen `--device`-Flags neu angelegt, damit die Rechte als `DeviceAllow=` in systemds Unit-Eigenschaften stehen und einen `daemon-reload` überleben. Ein Schritt bleibt offen (`no-cgroups = true`, braucht `sudo`) — siehe unter der Tabelle |
| **`num_ctx` des abgeleiteten Ollama-Modells** || PhaseInput | Graph — `phasenoutput`-Artefakte der Vorgängerphase, aufgelöst über `phasenBindung` | ja — Prompt-Vorschau, sobald der Graph Artefakte trägt | mittelbar — ja, über die Artefakte im Graphen; es gibt keine Einstellung dafür |

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

**Diese Fläche fällt lautlos weg, sobald ein `local-http`-Eintrag den Codec `openai-chat`
trägt.** `toModelEndpoint` (`src/main/model/entry.ts`) leitet einen solchen Eintrag über die
`/v1`-Fläche und den OpenAI-kompatiblen Transport (`api-client.ts`) statt über
`ollama-client.ts` — und `OpenAiCompatibleEndpointSpec`/`GenerateRequest` an dieser Stelle
kennen kein `keep_alive`-Feld, weil ein API-Anbieter kein lokales Modell zum Warmhalten hat.
Das Modell bleibt über denselben Ollama-Daemon erreichbar, aber jeder Aufruf läuft jetzt ohne
`keep_alive`-Vorgabe — Ollama entscheidet serverseitig nach seinem eigenen Default, nicht mehr
nach dem `-1` dieser App. Heute nicht editierbar und nicht einmal sichtbar: kein Warnhinweis
im Settings-Fenster, wenn eine Faehigkeitszeile diesen Codec waehlt.

### Sampler: was keel sendet, und was nur im Modelfile steht

Ein weggelassener Sampler ist auf dieser Fläche **kein** „nimm deinen Serverwert". Ollamas
`/v1`-Schicht setzt `temperature` und `top_p` **zwangsweise auf 1.0**, wenn der Client sie nicht
mitschickt (`openai.go` L663/L681). Ein Modell mit empfohlenem `top_p 0.95` im Modelfile läuft
über `/v1` also auf 1.0, sobald keel schweigt. Genau deshalb gibt es `faehigkeiten.sampler` in
der Tabelle oben: fünf Felder, die keel je Anfrage sendet, wenn der Block gesetzt ist.

`reasoningEffort` kennt in keel nur `low`, `medium`, `high`. `'xhigh'` wird von
`normaliseEintrag` (`src/main/model/entry.ts`) **vor** dem Request abgewiesen, nicht erst im
Wiederholungsversuch: Ollamas Renderer fällt damit in seinen default-Zweig und antwortet
`unsupported Qwen3.8 reasoning effort "xhigh"` — ein 400 mitten im Lauf, der wie ein
Transportfehler aussieht, obwohl er in der Konfiguration steht.

| Fläche | Wo | In der App sichtbar | Editierbar |
|---|---|---|---|
| `top_k`, `min_p`, `repeat_penalty` | **Nur im Modelfile auf dem Server** (`PARAMETER top_k …`, beim abgeleiteten Modell auf dem Spark), nicht in dieser Config | nein — hier benannt, sonst nirgends | **nein — und das bleibt so.** Ollamas `/v1`-Fläche kennt diese drei Parameter nicht und verwirft sie stillschweigend. Ein Regler dafür im Settings-Fenster wäre eine Attrappe: er würde etwas versprechen, das den Server nie erreicht |

Das ist eine anpassbare Fläche **außerhalb** der App, und sie steht hier, weil CK-NFR-012 genau
das verlangt — benannt werden muss sie auch dann, wenn keel sie nicht erreichen kann. Wer diese
drei Werte für einen `local-http`-Eintrag heute ändern will, ändert das Modelfile auf dem Server
und legt das Modell neu an.

Ein `ollama-native`-Codec **würde** daran etwas ändern: Ollamas natives `/api/chat` nimmt alle
drei im `options`-Feld entgegen; verworfen werden sie erst in der `/v1`-Übersetzung, die
nachweislich nur sieben `options` durchreicht (Entwurf 2026-08-21, Abschnitt 1.2). Das ist eines
der wenigen belegten Argumente **für** diesen Codec — und es ist nicht dasselbe wie das Argument
dagegen: bei `tool_choice` und `parallel_tool_calls` sitzt die Lücke tatsächlich in Ollama selbst,
`/api/chat` verhält sich dort genauso, und ein eigener Codec kauft nichts (Entwurf, Abschnitt 2).
Wer die beiden Fälle vermengt, streicht ein Argument, das es gibt.

## Zufuhr: Suchanbieter, Netzwache, Seitenextraktion — Stand 2026-08-21

Die Zufuhr (`web_suchen`, `seite_lesen`) bringt drei Gruppen anpassbarer Flächen mit. **Keine
davon hat heute eine Oberfläche** — das ist der ehrliche Stand, und er steht hier, weil
CK-NFR-012 genau das verlangt: benannt werden muss eine Fläche auch dann, wenn die App sie noch
nicht erreicht.

Seit 2026-08-21 sind die beiden Werkzeuge selbst gebaut (`src/main/harness/werkzeug-netz.ts`).
Damit kommen zwei Flächen hinzu, die es vorher nur als Begriff gab: die **Vorgabe-Positivliste**
und der **Suchanbieter samt Grenzen je Lauf**. Beide hängen an **einer** Stelle, dem
`NetzKontext` im `WerkzeugKontext` — die Werkzeuge ziehen sich ihre Konfiguration ausdrücklich
nicht selbst aus dem `configStore`. Das ist kein Testtrick: eine anpassbare Fläche, die in drei
Modulen gelesen wird, läuft auseinander, und diese hier wäre dann in einem der drei falsch.

| Fläche | Herkunft | Wirkung | In der App sichtbar | Editierbar |
|---|---|---|---|---|
| `SuchKonfiguration.searxngEndpunkt` | `src/main/harness/such-anbieter.ts`, gefüllt aus `netz.searxngEndpunkt` | Basis-URL der SearXNG-Instanz, seit 2026-08-23 `http://100.78.7.108:8888` auf dem Spark. **Läuft absichtlich an der netzwache vorbei** (siehe unten). *Der Quelltext nannte bis dahin MS-01 (`100.67.95.13:8080`) — dort hat der Benutzer `cipher` keinen Docker-Zugriff, die Adresse war eine Absicht und kein Ort* | ja — Settings-Fenster, Reiter „Netz" | ja — ConfigStore und Settings-Fenster |
| `SuchKonfiguration.tavilySchluessel`, `.braveSchluessel` | `src/main/harness/such-anbieter.ts`; das Geheimnis selbst gehört wie jeder API-Schlüssel in Keychain/Umgebung, nicht in die Config | Schalten den Tavily- bzw. Brave-Anbieter frei | ja — Settings-Fenster, Reiter „Netz" (Stand, nicht Wert) | ja — über den Schlüsselbund-Kanal des Fensters |
| `SuchKonfiguration.bevorzugt` | `src/main/harness/such-anbieter.ts`, gelesen von `waehleAnbieter`, gefüllt aus `netz.bevorzugt` | Ausdrückliche Wahl zwischen `searxng`, `tavily` und `brave`. Ohne Vorgabe gewinnt Tavily — bis M6 gemessen ist; Brave fällt niemandem zu, weil es als einziges eine Speicherbeschränkung trägt. Ist der bevorzugte Anbieter nicht konfiguriert, wird das gesagt, statt still auf einen anderen auszuweichen | ja — Settings-Fenster, Reiter „Netz" | ja — ConfigStore und Settings-Fenster |
| `MAX_ANFRAGE_LAENGE` (200), `MAX_ANZAHL` (10), `MAX_AUSZUG_ZEICHEN` (300), `MAX_TITEL_ZEICHEN` (200) | Konstanten in `src/main/harness/such-anbieter.ts` (§3.4) | Grenzen der Anfrage und der Trefferdarstellung. Die 200 Zeichen der Anfrage sind zugleich eine Ausleit-Bremse: eine Suchanfrage geht unredigiert nach draußen | nein | nein — nur durch Ändern der Konstante und Neubau |
| `ZEITBUDGET_MS` (10.000), `MAX_ANTWORT_BYTES` (1.000.000) | Konstanten in `src/main/harness/such-anbieter.ts`, überschreibbar je Anbieter-Instanz (`SuchGrenzen`) | Zeit- und Größengrenze des Suchabrufs. Sie stehen **hier** und nicht in der netzwache, weil dieser eine Abruf an ihr vorbeiläuft | nein | nein — nur durch Ändern der Konstante und Neubau |
| `MIN_ZEICHEN` (250), `STANDARD_MAX_ZEICHEN` (32.000), `HARTE_MAX_ZEICHEN` (48.000) | Konstanten in `src/main/harness/seiten-text.ts` (§3.3/§3.4) | Untergrenze für brauchbaren Extrakt (darunter: benannte Absage statt Erfolg) und die Ober­grenzen, auf die ein modellgewähltes `max_zeichen` geklemmt wird | nein | nein — nur durch Ändern der Konstante und Neubau |
| `NetzWacheKontext.positivliste` | `src/main/harness/netzwache.ts`, gefüllt vom Aufrufer | Welche Hosts der **Hauptlauf** überhaupt erreichen darf. Der Unterlauf des Rechercheurs (`modus: 'offen'`) überspringt genau diese eine Regel | nein | nein — heute im Quelltext des Aufrufers, keine Config, keine Oberfläche |
| **`VORGABE_POSITIVLISTE`** | `src/main/harness/werkzeug-netz.ts` | Die Vorgabe für obige Zeile: `nodejs.org`, `developer.mozilla.org`, `electronjs.org`, `vitest.dev`, `vite.dev`, `typescriptlang.org`, `docs.ollama.com`, `docs.anthropic.com`, `react.dev`. **GitHub gehört bewusst nicht dazu** — GitHub-Recherche läuft über den Rechercheur (Nachtrag 2026-08-21), weil GitHub fremden Nutzerinhalt trägt und `github.io` Unterdomänen an jeden vergibt. Ein Test hält das fest, damit der Eintrag nicht aus Bequemlichkeit nachwächst | nein | nein — Konstante im Quelltext, Neubau nötig |
| **`NetzKontext.anbieter`** (Suchanbieter je Lauf) | `src/main/harness/werkzeug-netz.ts`, gefüllt vom Aufrufer aus `waehleAnbieter` | Welcher Suchdienst `web_suchen` bedient. Ohne `netz`-Kontext antworten beide Werkzeuge **benannt**, dass für diesen Lauf kein Netzzugang eingerichtet ist — nie mit „keine Treffer" | nein | nein — heute im Quelltext des Aufrufers |
| **`NetzKontext.modus`** | `src/main/harness/werkzeug-netz.ts` | `whitelist` (Hauptlauf) oder `offen` (Unterlauf des Rechercheurs). Im Modus `whitelist` wirkt die Positivliste an **drei** Stellen: sie beschränkt die Suchanfrage (Tavily über `include_domains`, SearXNG und Brave über eine `site:`-Kette), sie filtert die Treffer vor der Ausgabe, und sie gilt in der netzwache beim Abruf. Alle übrigen Regeln der netzwache gelten in beiden Modi unverändert | nein | nein |
| **`VORGABE_SEITE_GRENZEN`** (5 MB, 20.000 ms, 3 Weiterleitungen) | `src/main/harness/werkzeug-netz.ts` (§3.4), je Lauf über `NetzKontext.seiteGrenzen` überschreibbar | Download-, Zeit- und Weiterleitungsgrenze von `seite_lesen`. Anders als beim Suchabruf laufen sie durch die netzwache, weil das Ziel hier **modellgewählt** ist. Das Zeitbudget gilt für die **ganze Kette**; ein einzelner Verbindungsversuch bekommt davon ein Drittel (`versuchsbudgetMs`) und wird einmal wiederholt | nein | nein — Konstante im Quelltext, Neubau nötig |
| **Die SearXNG-Instanz selbst** (`/home/crimak/searxng/settings.yml` auf dem Spark) | außerhalb des Repos: Docker-Container `searxng/searxng:latest`, gestartet 2026-08-23, gebunden an `100.78.7.108:8888`, `--restart unless-stopped`. Steht hier, weil CK-NFR-012 auch Flächen außerhalb der App verlangt — wie das `num_ctx` im Modelfile | Zwei Schalter tragen den ganzen Zugang. **`search.formats: [html, json]`** — ohne `json` antwortet SearXNG auf `?format=json` mit HTTP 403, und keels `SuchAnbieter` bekommt eine Ablehnung statt Treffern; das ist der Schalter, an dem SearXNG als Agenten-Suchdienst sonst scheitert. **`server.limiter: false`** — der Limiter ist Bot-Abwehr für *öffentliche* Instanzen und weist genau die Klienten ab, für die diese Instanz da ist. Das ist kein Widerspruch zu der Regel, fremde Sperren zu achten: hier ist der Betreiber der Nutzer selbst, die Instanz lauscht nur im Tailnet, und es gibt niemanden abzuwehren | nein | **ja, aber nur außerhalb der App:** `settings.yml` auf dem Spark ändern und `docker restart searxng` |
| **Netzfilter der Maschine** (Little Snitch) | außerhalb des Repos: macOS-Netzwerkerweiterung, Regeln pro Anwendung und Ziel | Hält den **ersten** ausgehenden Kontakt der Electron-Binärdatei zu jedem neuen Host, bis eine Regel existiert. In einem unbeaufsichtigten Lauf beantwortet niemand seinen Dialog, und der Abruf läuft ins Zeitbudget. Gemessen 2026-08-22: 6 von 18 Erstkontakten hingen, 0 von 10 Folgekontakten. Betrifft **jede** Messung auf dieser Maschine, nicht nur den Rechercheur | nein — keel sieht nur einen Abruf ohne Antwort und benennt ihn als solchen | **ja, aber nur außerhalb der App:** eine Regel für die Electron-Binärdatei oder ein Little-Snitch-Profil für Messläufe |
| **`TIEFEN`** (`kurz`: 1 Suche / 2 Seiten / 4 Runden / 150 s · `gruendlich`: 3 Suchen / 5 Seiten / 8 Runden / 300 s) | `src/main/harness/rechercheur.ts` (§3.4, Runden und Uhr nachgeführt 2026-08-22) | Was ein Unterlauf des Rechercheurs je Tiefe darf. **Runden und Uhr gehören zur Tiefe**, seit M12 einen Widerspruch aufdeckte: vorher galt eine einzige Rundenzahl (4) für beide, während `gruendlich` drei Suchen und fünf Seiten zusagte — drei Such- und drei Lesezüge sind sechs und passen da nicht hinein. Gemessen schöpfte `gruendlich` sein Suchbudget in 4 von 5 Läufen voll aus, sein Seitenbudget nur in einem, und 4 von 5 endeten `runden-erschoepft`. Untergrenze der Runden ist `2 × suchen` (ein Waechtertest hält das fest); der Abschlusszug ist gratis. Die Uhr ist eine Notbremse, kein Ziel. Gezählt wird bei Suchen und Seiten, was **hinausgegangen ist oder gleich wird**, nicht der Erfolg: ein Abruf, der das Haus verlassen hat und dann scheiterte, zählt (sonst wäre ein Ziel mit zuverlässigem HTTP 500 ein unbegrenzter Kanal nach draußen); ein Aufruf, der an der Eingabeprüfung stirbt, zählt **nicht**. Unterschieden wird über die `aufrufId` am `netz.ausgehend`. **Preis, benannt:** drei gründliche Recherchen können zusammen die 900-Sekunden-Wanduhr des Hauptlaufs sprengen — dann endet der Hauptlauf benannt | nein | nein — Konstante im Quelltext, Neubau nötig |
| **`ERGEBNIS_MAX_TOKEN`** (2.000) | `src/main/harness/rechercheur.ts` (§3.4) | Ergebnisbudget des Rechercheur-Unterlaufs, in Zeichen gemessen (Faktor 4), weil in diesem Prozess kein Tokenizer des Zielmodells liegt. Runden- und Zeitbudget stehen seit 2026-08-22 bei `TIEFEN`; Kosten- und Kontextanteil erbt der Unterlauf vom Elternauftrag — was dort als Obergrenze gilt, gilt hier nicht größer | nein | nein — Konstante im Quelltext, Neubau nötig |
| **`MAX_RECHERCHEN_JE_LAUF`** (3) | `src/main/harness/rechercheur.ts` | Wie viele Recherchen **ein Elternlauf insgesamt** starten darf. Die Budgets oben gelten je Unterlauf; ohne diese Zeile begrenzte nichts die Zahl der Unterläufe — gemessen erzeugte eine einzige Modellantwort mit acht `recherchieren`-Blöcken neun Läufe, alle nebenläufig, jeder mit vollem eigenem Budget. Gezählt wird die **Position** des Aufrufs unter den `tool.intent`-Ereignissen des Elternlaufs, nicht die Gesamtzahl: acht gleichzeitige Aufrufe würden sich sonst gegenseitig alle ablehnen | nein | nein — Konstante im Quelltext, Neubau nötig |
| **`MAX_QUELL_URL_ZEICHEN`** (300), **`MAX_QUELL_TITEL_ZEICHEN`** (200) | `src/main/harness/rechercheur.ts` | Länge einer Quellzeile in der Rückgabe an den Hauptlauf. Keine Kosmetik: die End-URL ist das Ziel der letzten Weiterleitung und damit im Modus `offen` frei vom Betreiber der geholten Seite gewählt — ungekappt schob eine `302`-Antwort 4.648 Zeichen Angreifertext wörtlich in den Verlauf des Hauptlaufs. Gekappt wird **nur die Rückgabe**, nie das Protokoll: dort steht die volle URL weiter (§4.1 (4)) | nein | nein — Konstante im Quelltext, Neubau nötig |
| **Schemazustellung im Unterlauf** (`LaufUmgebung.aufgeschobenesLaden`) | `src/main/harness/rechercheur.ts` setzt `false`, `lauf.ts` liest es über `laedtAufgeschoben` | Ob die Werkzeugschemata des Unterlaufs auf Abruf kommen (`werkzeug_schema`) oder gleich mitgehen. Es ist **keine** Aussage über das Modell — dieselbe Faehigkeitszeile fährt im Hauptlauf weiter aufgeschoben —, sondern über den Zuschnitt des Laufs: drei Werkzeuge, vier Runden. Gemessen holte das Modell in acht von zehn Recherchen zuerst ein oder zwei Schemata und verbrauchte damit die halbe Rundenzahl | nein | nein — im Quelltext, Neubau nötig |
| **Die Registry des Unterlaufs** (`unterlaufRegistry`) | `src/main/harness/rechercheur.ts` | `web_suchen`, `seite_lesen`, `faehigkeit_lesen` — **kein** Datei-, **kein** Graph-Werkzeug, **kein** `recherchieren`. Das ist die Sicherheitsgrenze dieser Welle und deshalb ausdrücklich **keine** anpassbare Fläche: die Liste wird im Modul gebaut, nicht vom Aufrufer mitgegeben, und ein Test hält sie wörtlich fest | nein | **nein, und das ist Absicht** |

**Keine Fläche, aber an dieser Stelle nachzulesen:** jede ausgehende Anfrage beider Netz-Werkzeuge
steht als eigenes Ereignis `netz.ausgehend` im Protokoll des Laufs, der sie gestellt hat — mit
Werkzeug, Sprungnummer, voller URL und Host, geschrieben **vor** der Namensauflösung. Das schließt
die Zwischenziele einer Weiterleitungskette ein (bis zu drei je Abruf) und die Anfrage-URL des
Suchdienstes. §4.1 (4) verlangt das, und es war nicht erfüllt: im Protokoll standen nur die
angefragte und — allein im Erfolgsfall — die letzte URL. Es gibt dafür keinen Schalter.

**Zwei Fallen, die zur Positivliste gehören und deshalb hier stehen und nicht nur im Quelltext:**

1. **Ein Eintrag gilt für die Domäne samt aller Unterdomaenen, beliebig tief.** `nodejs.org`
   erlaubt auch `beliebig.docs.nodejs.org`. Für ein Nachschlagewerk ist das gewollt. Für eine
   Domäne, die Unterdomänen an Fremde vergibt — `github.io`, `readthedocs.io`, `vercel.app`,
   `pages.dev` —, ist es eine Einladung: mit einem solchen Eintrag steht fremder Nutzerinhalt
   im Hauptlauf neben `datei_lesen` und den Graph-Werkzeugen.
1a. **Die Beschränkung der Suchanfrage ist eine Bitte an den Anbieter, der Filter ist die
   Zusage.** Was ein Suchdienst aus `site:` macht, steht in seiner Hand; `include_domains` bei
   Tavily ist exakt, die `site:`-Kette bei SearXNG und Brave nicht garantiert. Wahr gemacht wird
   „das Modell sieht im Hauptlauf nur, was es auch öffnen kann" deshalb erst durch den Filter über
   den Treffern in `web_suchen` — und der verwirft nie still: die Zahl der verworfenen Treffer und
   der Name des zweiten Wegs (`recherchieren`) stehen in der Antwort. Bis zum 2026-08-22 gab es
   beides nicht: gesucht wurde im ganzen Netz, und erst `seite_lesen` wies den Treffer ab, nach
   dem das Modell gegriffen hatte. Die `site:`-Kette wächst mit der Liste und zählt **nicht** gegen
   `MAX_ANFRAGE_LAENGE` — sie schreibt keel, nicht das Modell. Lehnt ein Anbieter eine dadurch zu
   lange Anfrage ab, kommt das als benanntes `HTTP 4xx` zurück; gekappt wird die Liste nicht.

2. **Die Positivliste ist keine Ausleit-Grenze.** Eine erlaubte URL trägt ihren Query-String
   mit hinaus. Was diesen Kanal fast vollständig schließt, ist nicht die Liste, sondern die
   **Herkunftsprüfung** von `seite_lesen`: es nimmt ausschließlich URLs, die **bytegleich** in
   einem Suchtreffer desselben Laufs standen. Eine vom Modell komponierte
   `https://nodejs.org/?d=<Geheimnis>` hat keinen Treffer und wird abgelehnt, bevor auch nur der
   Name aufgelöst wird. Geprüft wird gegen das Ereignisprotokoll (Feld `trefferUrls` in
   `tool.completed`), nicht gegen den Antworttext — Titel und Auszug schreibt die Gegenstelle.
   **Diese Prüfung ist keine anpassbare Fläche und soll keine werden:** ein Schalter dafür wäre
   ein Schalter für die Ausleitung.

**Warum der GPU-Zugriff des Containers von selbst verlorengeht.** Unter **cgroup v2** gibt es
keinen `devices`-Controller mehr; wer ein Gerät öffnen darf, entscheidet ein **eBPF-Programm** an
der cgroup (`BPF_CGROUP_DEVICE`), und davon ist pro cgroup nur eines wirksam. Beim Start mit
`--gpus all` tut das nvidia-container-toolkit zwei getrennte Dinge: es **mountet** `/dev/nvidia*`
samt Treiberbibliotheken in den Container, und es schreibt die Geräte-Erlaubnis als eBPF-Programm
direkt in die cgroup — **an Docker vorbei**.

Dort sitzt der Bruch: mit `Cgroup Driver: systemd` (so ist die Maschine eingestellt) gehört die
cgroup des Containers nicht Docker, sondern **systemd**. systemd führt sein eigenes Modell darüber,
welche Geräte eine Unit haben darf (`DeviceAllow=`), und von der Regel des Toolkits weiß es nichts.
`systemctl daemon-reload` lässt systemd seine Eigenschaften **neu anwenden** — also ein frisches
eBPF-Geräteprogramm aus seiner eigenen Sicht anhängen, in der keine NVIDIA-Geräte vorkommen. Die
Regel ist damit weg.

Die Mounts überleben, weil sie keine cgroup-Eigenschaft sind — deshalb ist `/dev/nvidia0` weiterhin
sichtbar und `open()` gibt trotzdem `EPERM`. Und weil die Prüfung beim `open()` stattfindet, behält
der **laufende** Ollama-Prozess seine Deskriptoren und meldet weiter CUDA, während jeder **neu
gestartete** `llama-server` scheitert. Auf dieser Maschine stößt `snapd` den Reload regelmäßig an:
gemessen **8 Reloads in 30 Stunden**.

Kurz: zwei Eigentümer für dieselbe cgroup. Das Toolkit schreibt Rechte hinein, systemd schreibt sie
wieder heraus.

**Die Behebung, gewählt und am 2026-08-22 ausgeführt: systemd im Bild lassen, nicht aus der
Schleife nehmen.** Der Container ist mit ausdrücklichen `--device`-Flags neu angelegt. Damit stehen
die Geräte in Dockers `HostConfig.Devices`; runc übersetzt sie beim systemd-cgroup-Treiber in
`DeviceAllow=`-Eigenschaften der Unit — und genau die wendet ein `daemon-reload` **wieder an**,
statt sie zu verwerfen.

Der Nachweis braucht kein `sudo` und ist die Vorher/Nachher-Probe an derselben Maschine:

```bash
ID=$(docker inspect ollama --format '{{.Id}}')
systemctl show "docker-${ID}.scope" -p DevicePolicy -p DeviceAllow
#   neu:  DevicePolicy=strict
#         DeviceAllow=/dev/char/497:1 rwm      <- nvidia-uvm-tools
#         DeviceAllow=/dev/char/497:0 rwm      <- nvidia-uvm
#         DeviceAllow=/dev/char/195:255 rwm    <- nvidiactl
#   alt:  (leer) — das Toolkit hatte die Regeln an systemd vorbei geschrieben
```

Der Startbefehl, festgehalten weil er sonst beim nächsten Neubau verlorengeht:

```bash
docker run -d --name ollama --restart unless-stopped --gpus all \
  --device /dev/nvidia0 --device /dev/nvidiactl --device /dev/nvidia-modeset \
  --device /dev/nvidia-uvm --device /dev/nvidia-uvm-tools \
  -p 100.78.7.108:11434:11434 -v /home/crimak/ollama:/root/.ollama \
  -e OLLAMA_HOST=0.0.0.0:11434 ollama/ollama:latest
```

`--gpus all` bleibt dabei: es besorgt weiterhin die Treiberbibliotheken und Mounts. Die
`--device`-Flags tragen allein die **Rechte** — und die sind der Teil, der verlorenging.
Nachgemessen: dieselbe Anfrage 1,68 s statt 53 s, `load_tensors: offloaded 66/66 layers to GPU`.

**Was belegt ist und was nicht.** Belegt ist die *Mechanik*: die Geräte stehen als `DeviceAllow=`
in systemds Unit-Eigenschaften, und genau die wendet ein `daemon-reload` wieder an — beim alten
Container stand dort nichts. **Noch nicht belegt ist der Ernstfall:** seit dem Umbau am 2026-08-22
um 13:31 hat kein Reload stattgefunden.

**Die Gegenprobe braucht kein `sudo`,** weil der Auslöser von selbst kommt — `snapd` stößt ihn auf
dieser Maschine im Schnitt alle dreieinhalb Stunden an. Es genügt, danach nachzusehen:

```bash
ssh DGX '
  START=$(docker inspect ollama --format "{{.State.StartedAt}}")
  echo "Reloads seit dem Umbau: $(journalctl --since "$(date -d "$START" "+%F %T")" \
        | grep -ci "Reloading requested")"
  docker exec ollama nvidia-smi -L
'
```

Steht dort eine Zahl **größer als null** und die GPU wird trotzdem gezeigt, ist die Behebung
belegt. Wird sie nicht gezeigt, trägt die Erklärung nicht und die Untersuchung gehört wieder auf.

Der alte Container ist als `ollama-vor-device` angehalten geparkt — er bleibt, bis diese Probe
einmal bestanden ist.

**Ein Schritt bleibt offen und braucht `sudo`** (auf dem Spark nicht passwortlos, und das Passwort
ist nicht bekannt): `no-cgroups = true` in `/etc/nvidia-container-runtime/config.toml`, die Zeile
steht dort auskommentiert. Danach schreibt das Toolkit **gar keine** cgroup-Regeln mehr, und es
gibt genau einen Eigentümer statt zweier. **Das ist Hygiene, kein Funktionsbedarf:** solange die
Zeile fehlt, schreibt das Toolkit redundant mit, und ein Reload wischt genau diese Kopie weg —
systemds Kopie bleibt und trägt. Der Befehl, wenn das Passwort einmal zur Hand ist:

```bash
ssh -t DGX "sudo sed -i 's/^#no-cgroups = false/no-cgroups = true/' \
  /etc/nvidia-container-runtime/config.toml && docker restart ollama"
```

Das `-t` ist nötig, sonst bekommt `sudo` kein Terminal für die Abfrage. Und der Befehl gehört auf
den **Spark**, nicht auf den Mac: dort gibt es weder Docker noch diese Datei, und macOS bringt
BSD-`sed` mit, dessen `-i` zwingend ein Suffix verlangt.

**Nicht gewählt:** `"exec-opts": ["native.cgroupdriver=cgroupfs"]` in `/etc/docker/daemon.json`.
Das wirkt auch, ist eine Zeile statt eines Container-Neubaus — nimmt systemd aber die cgroups weg,
statt die Zuständigkeit zu klären. Es behebt das Symptom an der Stelle, an der der Fehler nicht
sitzt.

**Warum der Suchendpunkt nicht durch die netzwache läuft.** `pruefeUrl` lässt nur `https` durch
und sperrt `100.64.0.0/10` (Tailscale); der SearXNG-Endpunkt auf MS-01 ist `http` im Tailnet und
fällt damit doppelt durch. Ihn hindurchzuführen hieße, beides zu öffnen — und dahinter liegt ein
unauthentifizierter Ollama auf `100.78.7.108:11434`. Der Unterschied, der es trägt: das **Suchziel
ist betreiberkonfiguriert, nicht modellgewählt** — es steht in der Config, nie in einem
Werkzeugargument. Der Preis dafür sind die eigenen Grenzen der Datei (Zeile `ZEITBUDGET_MS` /
`MAX_ANTWORT_BYTES` oben). Für `seite_lesen`, dessen Ziel das Modell wählt, gilt das Gegenteil:
dort ist die netzwache Pflicht.

## Kostenbudget — versionierte Preistabelle

| Fläche | Herkunft | Leser | Wirkung | Änderungen |
|---|---|---|---|---|
| Modellpreise (Cent pro Million Token, Eingabe und Ausgabe getrennt) | `src/main/harness/preise.ts`, Objekt `VORGABE_PREISE` | `src/main/harness/lauf.ts`, Funktion `verbrauchAusEreignissen`, rekonstruiert nach jeder Antwort des Modells aus dem Ereignisprotokoll neu; `src/main/harness/budget.ts`s `pruefeBudgets` vergleicht danach nur noch das Ergebnis gegen das Kostenbudget | sofort — beim nächsten Lauf werden Kosten gegen die neue Tabelle gerechnet | Preise ändern sich schneller als Releases; ein alter Stand würde das Kostenbudget an der falschen Stelle abbrechen. Der Abschlussgrund nennt deshalb immer das Datum der Preistabelle (`PREISTABELLE_STAND`), damit die Versionsungewissheit sichtbar bleibt statt weggeglättet zu werden. |

**Wichtige Einschränkung:** Ein unbekanntes Modell kostet null, nicht geschätzt. Ein geratener Preis, der einen Lauf abbricht, sähe aus wie eine Messung und ist schlimmer als gar keine Kostenbremse. Ist ein Modell nicht in der Tabelle, läuft das Kostenbudget nicht für es an.

## Die vier Lauf-Budgets — heute hart verdrahtet

| Fläche | Herkunft | Wirkung | In der App sichtbar | Editierbar |
|---|---|---|---|---|
| `STANDARD_BUDGETS` (Runden, Wanduhr in ms, Kosten in Cent, Kontextanteil 0..1) | `src/main/harness-handlers.ts`, Konstante `STANDARD_BUDGETS` | Jeder Lauf ueber `HARNESS_LAUF_STARTEN` bekommt exakt dieselben vier Budgets — es gibt noch kein Fenster-Feld, das sie je Lauf setzt (siehe Kommentar an der Konstante: „Placeholder until the harness window can set its own budgets"). `src/main/harness/budget.ts`s `pruefeBudgets` prueft danach gegen genau diese Werte. | nein | **nein — heute nur durch Aendern der Konstante und Neubau der App.** Der Beleg dafuer steht im Messprotokoll (`docs/superpowers/plans/2026-08-18-harness-kern.md`, Beleg 7): fuer die Budget-Probe wurde `STANDARD_BUDGETS.runden` von `12` auf `2` gesetzt, die App neu gebaut, geprueft, danach zurueckgesetzt und erneut gebaut. |

Das ist eine anpassbare Flaeche ohne Oberflaeche im Sinne von CK-NFR-012, ehrlich gefuehrt statt
verschwiegen: Wer ein Rundenbudget, ein Zeitbudget, ein Kostenbudget oder einen Kontextanteil
abweichend vom Vorgabewert braucht, muss heute Quelltext aendern und die App neu bauen. Ein
Budget-Feld im Harness-Fenster ist Folgearbeit, keine dieser Strecke.

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
