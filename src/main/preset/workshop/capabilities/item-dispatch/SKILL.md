---
name: item-dispatch
description: Klassifizierte Items an Worker verteilen — intern, Debugger oder CF-Eskalation; Routing-Entscheidungen als Graph-Knoten dokumentiert.
---

# Item Dispatch

## Wann das gilt

Phase 3 (`dispatchen`) des Sechs-Phasen-Flows, nach der Klassifizierung in Phase 2. Gilt für
jedes klassifizierte Item, unabhängig von Bugfixing oder Development.

## Vorgehen

Im Repo existieren zwei Dispatch-Mechanismen nebeneinander — beide gehören zu dieser
Capability, sie sind (noch) nicht vereinheitlicht:

**Die Drei-Wege-Routing-Hoheit (`routing.ts`, 139 Zeilen).** `RoutingZiel` kennt drei Werte:
`intern`, `debugger`, `cf-eskalation` (`routing.ts:13`). Eine `RoutingDecision` trägt fünf
Pflichtfelder — `quelle`, `ziel`, `itemId`, `begruendung`, `stand` (`routing.ts:28-39`) —,
`validateRoutingDecision` prüft alle fünf auf Nicht-Leere (`routing.ts:70-78`). `routeItem`
(`routing.ts:88-104`) wirft bei ungültiger Decision; bei `intern`/`debugger` ist kein SE-Gate
nötig — die Entscheidung wird direkt ausgeführt (`routing.ts:96-99`). Bei `cf-eskalation` ist
Dokumentation Pflicht: `createRoutingNode` (`routing.ts:113-131`) legt einen Knoten mit dem
Label `routing-entscheidung` und allen fünf Feldern über ein eigenes leichtgewichtiges
`RoutingGraphDb`-Interface an (`createNode(labels, properties)`, `routing.ts:59-64`) — kein
direkter `GraphWriter.upsertNode`-Aufruf. Die SE-Benachrichtigung selbst ist nicht als Funktion
im Code hinterlegt (kein `notifySE()` existiert) — der Kommentar in `routing.ts:103`
beschreibt sie als Aufgabe des Aufrufers, nicht des Moduls. `isCFEskalation`
(`routing.ts:137-139`) prüft nur `ziel === 'cf-eskalation'`.

**Der BUG/MFR/NRF-Split (`workshop-fixing-dispatch.ts`, 57 Zeilen, CK-PROC-015).**
`dispatchFixingItem` ist ein einfacherer, zweiwertiger Dispatch ohne `intern`/`cf-eskalation`:
BUG-Items gehen an `targetPreset: 'debugger'`, MFR/NRF-Items an
`targetPreset: 'development-worker'` (`workshop-fixing-dispatch.ts:28-40`). Wird ein `graphDb`
übergeben, schreibt es direkt über `GraphWriter.upsertNode` einen `note`-Knoten mit
`frontmatter.notetyp: 'routing-decision'` (Bindestrich-Schreibweise, nicht zu verwechseln mit
dem Label `routing-entscheidung` aus `routing.ts`) — `itemId` und `targetPreset` stehen in der
Frontmatter (`workshop-fixing-dispatch.ts:42-54`).

## Grenzen

Item-Dispatch entscheidet, es liest nicht (das ist `findings-lesen`) und überwacht die
dispatchten Worker nicht (das ist `worker-monitoring`). Die Routing-Hoheit ist strikt
phasen-intern: Sie ersetzt nicht das Trigger-Handoff-Modell des Systems Engineer zwischen
Phasen — nur innerhalb der Fixing-Phase entscheidet der Workshop selbst.
