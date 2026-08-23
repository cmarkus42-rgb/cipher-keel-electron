---
name: worker-startup-protokoll
description: Startup-Protokoll für Worker-Sessions (Schenkel-1) — Lifecycle-Schritte, Timings und Session-Präfix.
---

# Worker-Startup-Protokoll

## Wann das gilt

Für jeden Worker, den du in einer Welle startest — vom Moment der Session-Erstellung bis zum
laufenden Monitoring. Gilt für Claude-Code-Worker im Schenkel-1-Pfad (tmux-Sessions).

## Vorgehen

**Lifecycle in sieben Schritten, in dieser Reihenfolge:** `create_session` → `wait_startup` →
`check_prompt` → `send_instruction` → `wait_parse` → `verify_working` → `monitoring`. Überspringe
keinen Schritt und tausche die Reihenfolge nicht.

**Timings:**

- Nach `create_session`: warte `STARTUP_WAIT_MS` (10 Sekunden), bevor du den Prompt prüfst.
- Nach `send_instruction`: warte `TASK_PARSE_WAIT_MS` (15 Sekunden), bevor du verifizierst, dass
  die Arbeit begonnen hat.
- Im laufenden `monitoring`-Schritt: prüfe im Abstand von `MONITORING_INTERVAL_MS`
  (2 Minuten).
- Schlägt die Prompt-Prüfung fehl, wiederhole bis zu `MAX_STARTUP_RETRIES` (3) mal, bevor du den
  Start als gescheitert behandelst.
- Erreicht die Context-Nutzung eines Workers `CONTEXT_ROTATION_THRESHOLD` (80 %), leite proaktiv
  eine Rotation ein, statt auf ein Context-Limit zu warten.

**Session-Aufbau (Claude Code):** Die App startet den Worker über `create_session` und liefert
dabei selbst die Startparameter mit, die für diesen Adapter hinterlegt sind (Settings-Fenster,
Reiter „CLI-Start") — die Session baut die Kommandozeile also nicht selbst zusammen. Die Vorgabe
schliesst die Berechtigungsrückfrage vor jedem Werkzeugaufruf aus, weil sonst niemand im
tmux-Pane antworten könnte, den die App selbst treibt. MCP-Tools (die graph_*-Werkzeuge und die
Niveau-B-Zellenwerkzeuge) stehen heute **nicht** zur Verfügung — der Transport dafür ist noch
nicht gebaut (siehe `docs/anpassbare-flaechen.md`, Abschnitt „Was fehlt"). Instruktionen gehen
direkt per tmux `send-keys` in den Pane,
nicht über einen anderen Kanal. Cyber-Factory-Worker-Sessions tragen das Session-Präfix
`ckeel-cf-`, damit sie im Session-Overview eindeutig als CF-Worker erkennbar sind.

**Status-Tracking.** Jeder Worker trägt einen `WorkerStatus`: `sessionId`, aktueller `step` aus
dem Lifecycle, `contextUsage`, `startedAt` und `lastCheck`. Aktualisiere diesen Status bei jedem
Übergang zwischen Lifecycle-Schritten — er ist deine Grundlage für Monitoring-Entscheidungen.

## Grenzen

Der eigentliche tmux-/Session-Transport (Erzeugen, Tasten senden, Pane-Ausgabe lesen) läuft über
den Runtime-Adapter, nicht über eigenen Code in dieser Capability — du orchestrierst die
Reihenfolge und Timings, nicht die Transport-Mechanik selbst. Ändere die Timing-Konstanten nicht
situativ; sie sind für alle Worker gleich, damit das Monitoring vorhersagbar bleibt.
