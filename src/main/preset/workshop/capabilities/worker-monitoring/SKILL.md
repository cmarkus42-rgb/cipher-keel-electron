---
name: worker-monitoring
description: Worker-Sub-Sessions überwachen (Phase 4) und Worker-Tasks im vollständig gelabelten, kontextfreien Format ausgeben.
---

# Worker Monitoring

## Wann das gilt

Phase 4 (`monitoring`) des Sechs-Phasen-Flows, nach dem Dispatch und vor dem
Completeness-Gate. Nur auf Niveau A und B geladen: `worker-monitoring` steht in
`CAPABILITIES_NIVEAU_A` (`niveau-config.ts:39-47`) und `CAPABILITIES_NIVEAU_B`
(`niveau-config.ts:50-57`), fehlt aber in `CAPABILITIES_NIVEAU_C` (`niveau-config.ts:60-66`) —
passend zu `allowSubSessions: false` und `maxParallel: 1` auf Niveau C
(`niveau-config.ts:104-105`): ohne Sub-Sessions gibt es dort nichts zu überwachen.

## Vorgehen

**Monitoring-Konfiguration (`workshop-flow.ts`, 218 Zeilen).** `MonitoringConfig` trägt drei
Werte (Zeilen 45-52): `intervallMs` (Prüf-Intervall, Default 150 000 ms = 2,5 Minuten),
`stuckSchwelleMs` (Stuck-Heuristik: kein Fortschritt seit N ms löst Retry aus, Default
420 000 ms = 7 Minuten) und `maxRetries` (Default 2). `DEFAULT_MONITORING_CONFIG`
(Zeilen 54-58) hält diese Defaults; `WorkshopFlowInput.monitoringConfig` kann sie pro Lauf
überschreiben. Die eigentliche Phase-4-Funktion, `monitoringPhase()` (Zeilen 172-183), ist im
aktuellen Code ein Platzhalter: Sie gibt nur `Math.max(1, itemIds.length)` als Rundenzahl
zurück und pollt keinen tatsächlichen Worker-Status — das reale Abfragen gegen die obigen
Schwellen ist Aufgabe der laufenden Session, nicht dieser Funktion.

**Worker-Task-Format (`worker-task-format.ts`, 90 Zeilen, CK-P4-003).** Ein `WorkerTask`
(Zeilen 13-26) trägt `id`, `description`, `file`, `observed`, `expected`,
`completionCriteria`. `formatWorkerTask` labelt fünf davon mit festen Markern (`MARKERS`,
Zeilen 37-43): `**Beschreibung:**`, `**Datei/Modul:**`, `**Beobachtet:**`, `**Erwartet:**`,
`**Abschluss-Kriterium:**` — `id` erscheint nur in der Überschrift
(`# Worker-Task ${id}`), nicht als eigener Marker. `validateWorkerTask` (Zeilen 80-90) prüft
alle fünf Marker über `task.includes(marker)`. Der Datei-Kommentar selbst spricht von „vier
Pflicht-Feldern" (Zeile 4) — das ist mit dem tatsächlichen `MARKERS`-Objekt und der
`validateWorkerTask`-Prüfung nicht in Einklang: Es sind fünf gelabelte Pflichtfelder, nicht
vier. Die Prüffrage bleibt unverändert: Kann jemand, der das Projekt nie gesehen hat, den Task
allein starten?

## Grenzen

Monitoring beobachtet und meldet Stillstand, es fixt nicht und dispatcht nicht neu — ein
Retry-Bedarf geht zurück an `item-dispatch`. Und diese Capability ist kein Ersatz für
`status-konsolidierung`: Zwischenstände während des Monitorings sind keine Konsolidierung.
