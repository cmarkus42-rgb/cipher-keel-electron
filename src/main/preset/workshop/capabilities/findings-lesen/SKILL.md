---
name: findings-lesen
description: Findings und Items aus dem Graphen lesen — Phase 1 (Aufnehmen) des Workshop-Flows, Grundlage für Klassifizierung und Dispatch.
---

# Findings Lesen

## Wann das gilt

Bei jedem Auslösen des Workshops — Bugfixing (`phase: fixing`) wie Development (`phase:
development`) gleichermaßen. `executeWorkshopFlow` durchläuft in jedem Lauf sechs Phasen
(`workshop-flow.ts:21-28`: aufnehmen, klassifizieren, dispatchen, monitoring,
completeness-gate, konsolidieren) — keine davon wird bei kleinem Input übersprungen.
Findings-Lesen trägt Phase 1.

## Vorgehen

Es gibt keinen dedizierten Query-Template für einzelne Work-Items (`BUG-001` etc.) — sie sind
keine eigenen Graph-Knoten, sondern eingebettet im Body eines `test-findings`- oder
Backlog-`uebergabedokument`-Knotens. Lies zuerst das Quelldokument:

1. `graph_query` mit Template `vault_index` (kein Pflichtparameter) — liefert alle `note`- und
   `uebergabedokument`-Knoten inklusive Typ-Diskriminator (`dokumentTyp` für
   `uebergabedokument`, `query.ts:831-860`). Filtere auf `dokumentTyp: 'test-findings'` (oder
   den passenden Backlog-Typ bei Development).
   Alternativ: `graph_query` mit Template `nodes_by_kind` und Pflichtparameter
   `kind: 'uebergabedokument'` (`query.ts:311-328`) — liefert dieselben Knoten ohne den
   Diskriminator; die Frontmatter-JSON bleibt trotzdem lesbar.
2. `graph_get_node` oder `graph_expand` auf die gefundene Knoten-ID, um Titel, Pfad und Body
   zu laden.
3. Aus dem Body die einzelnen Items ableiten und als `WorkItem` (`routing.ts:42-53`: `id`,
   `titel`, `typ` — `BUG`/`MFR`/`NRF`, `stand`, optional `graphNodeId`) für den Flow
   bereitstellen. `aufnehmen()` selbst (`workshop-flow.ts:149-151`) ist im aktuellen Code ein
   reiner Durchreicher — die eigentliche Graph-Lesearbeit liegt vor diesem Aufruf, bei dir.

## Grenzen

Findings-Lesen klassifiziert nicht (P1-ID-Vergabe, Subsystem-Zuordnung) und dispatcht nicht —
das ist `item-dispatch`. Es interpretiert die gelesenen Items auch nicht inhaltlich; es liefert
sie roh für die nächste Phase.
