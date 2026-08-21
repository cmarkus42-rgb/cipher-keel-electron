# Messprotokoll Qwen3.8 27B auf dem DGX Spark — 2026-08-21

Alles hier ist an der laufenden Maschine gemessen, nicht recherchiert. Wo eine Messung dem
Entwurfsbericht widerspricht, gilt die Messung — und der Bericht wird nachgeführt, nicht
stillschweigend übergangen.

## Vorlauf: das Upgrade

Ollama auf dem Spark lief auf **0.32.5** (27.07.), `qwen3.8:27b` verlangt **0.32.12** (14.08.).
Der Pull scheiterte mit `412: requires a newer version of Ollama`.

Zugang: `ssh DGX` (Alias mit `nvsync.key`, **nicht** OpenClaw — der wird abgewiesen), User
`crimak`, Mitglied der `docker`-Gruppe. Kein passwortloses `sudo`, aber Docker ohne sudo reicht.

Container-Konfiguration vollständig aufgenommen, neues Image gezogen, **Version im Image geprüft
bevor getauscht wurde** (`docker run --rm --entrypoint ollama … --version` → 0.32.15), alter
Container als `ollama-alt-0325` geparkt statt gelöscht.

Entscheidend für die Auflage „alle anderen Modelle bleiben verfügbar": die Modelle liegen auf
einem **Bind-Mount** (`/home/crimak/ollama → /root/.ollama`), nicht in einem Docker-Volume. Nach
dem Tausch: alle fünf da, `gemma4:26b` (Default für `llm.worker`) antwortet.

`OLLAMA_KEEP_ALIVE=-1` **nicht** gesetzt, obwohl der Entwurf es empfiehlt: es hielte das zuletzt
benutzte Modell dauerhaft im Speicher, und `llama4:scout` (67 GB) plus `gpt-oss:120b` (65 GB)
passen nicht gemeinsam in 128 GB. Das hätte genau die anderen Verwendungen blockiert.

## M1 — lädt das Modell? **Ja.**

```
Ladezeit 9,6 s · prompt_eval 281,8 ms · 159 Token Antwort in 6,8 s
Denkspur im Feld `thinking` von /api/chat: 533 Zeichen
```

Antwortet auf Deutsch, denkt dabei auf Englisch.

## M4 — übersteht `ollama create` Renderer und Parser? **Ja.**

`keel-qwen38:27b` abgeleitet mit `num_ctx 65536`, `top_k 20`, `min_p 0`, `repeat_penalty 1.0`,
`temperature 1.0`, `top_p 0.95` — genau die Sampler, die Ollamas `/v1` nicht durchreicht.

Werkzeugaufruf gegen das abgeleitete Modell:
```
finish_reason: tool_calls · tool_calls: 1 · datei_lesen {"pfad":"README.md"}
reasoning-Feld über /v1 vorhanden: 139 Zeichen
```
Strukturiert, nicht als `<function=…>`-Text. Die Ableitung ist damit tragfähig.

## M2 — nimmt `/v1` eine `tool`-Nachricht mit Array-Inhalt? **Ja, beide Formen.**

Array-Inhalt *und* Zeichenkette liefern beide die richtige Antwort. Die Codec-Entscheidung hält:
`/v1` reicht, `ollama-native` bleibt ungebaut.

**Ehrliche Einordnung des Codec-Fixes (b):** er war damit **vorbeugend, nicht korrigierend**.
Der Entwurf führte M2 als „den einzigen Messpunkt, der die Codec-Entscheidung kippen kann" — er
kippt sie nicht. Fix (a) (leerer `content`) bleibt begründet (Ollama #14181).

## M3 — welche `reasoning_effort`-Werte gelten? **Alle sieben.**

Der Entwurf warnte, `xhigh` koste einen HTTP 400. **Das ist auf 0.32.15 falsch** — angenommen
werden `none`, `minimal`, `low`, `medium`, `high`, `max`, `xhigh`.

Auf einer trivialen Frage unterscheiden sich die Stufen nicht (141–181 Zeichen Denkspur). Auf
einer schweren Frage schon, und deutlich:

| Stufe | Denkspur | Antwort | Token | Zeit |
|---|---|---|---|---|
| `none` | 0 Z | 593 Z | 153 | **7,8 s** |
| `low` | 1.252 Z | 814 Z | 531 | 23,8 s |
| `medium` | 1.933 Z | **1.290 Z** | 799 | 37,0 s |
| `high` | 3.635 Z | 789 Z | 1.089 | 50,5 s |
| `xhigh` | **8.628 Z** | 531 Z | 2.160 | **106,3 s** |

`xhigh` denkt am längsten und antwortet am kürzesten, in vierzehnfacher Zeit gegenüber `none`.
Die Empfehlung des Entwurfs (`medium` als Vorgabe, nie `xhigh`) **bleibt richtig — aber aus einem
anderen Grund als dort angegeben.** Das gehört im Code so kommentiert: kein 400, sondern 106
Sekunden für eine schlechtere Antwort. Ein falscher Grund im Kommentar ist schlimmer als keiner,
weil ihn später jemand glaubt, der ihn nicht mehr nachprüft.

**Folgerung für den Sampler-Block:** `none` gehört als vierter Wert dazu. 7,8 s statt 37 s bei
brauchbarer Antwort ist für mechanische Niveau-C-Arbeit der richtige Schalter.

## M5 — greift der Präfix-Cache? **Ja, für die Form, die die Schleife wirklich hat.**

Zwei Messungen, und die erste war irreführend.

**Erst falsch gemessen:** derselbe System-Präfix, aber die *letzte* Nachricht ausgetauscht.
Kalt 7.344 ms, danach 2.815 und 2.756 ms — Faktor 2,6, kein echter Treffer. `gemma4:26b` verhält
sich genauso. Daraus hätte man geschlossen, der Cache sei bei diesem Modell gebrochen.

**Dann richtig gemessen:** so, wie ein Agentenlauf wächst — vorne bleibt alles stehen, hinten
kommt jeden Zug etwas dazu.

| | Token | `prompt_eval` |
|---|---|---|
| Zug 1, kalt | 5.855 | 2.718,5 ms |
| Zug 2 (+130) | 5.985 | **443,2 ms** |
| Zug 3 (+131) | 6.116 | **431,2 ms** |

Es werden nur die neuen Token verarbeitet, und es bleibt flach, während das Gespräch wächst.
Zur Kontrolle: zweimal die **identische** Anfrage → 2.739,8 ms auf 143,0 ms (Faktor 19).

**Risiko B des Entwurfs ist damit für den echten Fall widerlegt.** Die Präfix-Ökonomie trägt.
Die erste Messung bleibt hier stehen, weil sie zeigt, wie leicht man an dieser Stelle das
Falsche misst — ein ausgetauschter Schwanz ist kein Muster, das im Harness vorkommt.

## M8 — stimmt das Kontextfenster? **Nein, und das war Risiko A.** Behoben.

Ein Prompt von ~185.000 Token an `keel-qwen38:27b` mit `num_ctx 65536` im Modelfile:

```
prompt_eval_count: 32770        <- nicht 65536, nicht 185000
Antwort: 'verstanden'           <- keine Fehlermeldung, kein Hinweis
```

Der Prompt wurde **vorne still abgeschnitten**, und das Modell antwortete, als wäre nichts
gewesen. Genau der Ausgang, den der Entwurf als „den gefährlichsten still verlaufenden Fehler
dieser Welle" benennt: es sieht aus wie ein schlechtes Modell, ist aber ein gekappter Prompt.

`ollama show` bestätigt `num_ctx 65536` am Modell, und `/api/ps` meldet `context_length: 65536`.
Beide Anzeigen sind irreführend: **Ollama teilt den deklarierten Kontext auf parallele Plätze
auf** (Vorgabe zwei), und `/api/ps` zeigt die Gesamtzuteilung, nicht das, was eine einzelne
Anfrage bekommt. `OLLAMA_NUM_PARALLEL` ist auf dem Spark nicht gesetzt.

**Behoben ohne den gemeinsamen Daemon anzufassen:** `num_ctx 131072` im abgeleiteten Modell.
Das betrifft nur `keel-qwen38:27b`, nicht die anderen fünf Modelle und nicht deren Nebenläufigkeit.
Nachgemessen:

```
prompt_eval_count: 65538        <- die gewollten 65.536 (plus 2 aus dem Chat-Template)
```

**Regel, die nirgends dokumentiert ist und in den Kommentar gehört:** wer bei Ollama N Token
nutzbaren Kontext braucht, deklariert `2N`. `nutzbaresKontextfenster: 65536` in der Registry ist
damit korrekt — aber nur, solange das Modelfile auf 131072 steht. Die beiden Zahlen hängen
zusammen und stehen an verschiedenen Orten, einer davon außerhalb des Repos. Genau deshalb ist
die Modelfile-Zeile im Inventar zu benennen (CK-NFR-012).

Was **nicht** behoben ist: oberhalb von 65.536 schneidet der Server weiterhin still ab. Dagegen
schützt allein keels eigenes Kontextbudget, das vor dem Senden prüft — es muss also feuern,
bevor der Server kappt, und dafür müssen die Zahlen übereinstimmen.

## Noch offen
- **M7** — folgt ein 27B dem Nachlade-Satz für Fähigkeiten? Braucht 20 Läufe durch keel selbst.
- **M9/M10/M11** — Werkzeugliste, nicht extrahierbare Seite, Transport-Flattern.
- **M6** — SearXNG gegen Tavily. Braucht erst eine Entscheidung des Nutzers.
