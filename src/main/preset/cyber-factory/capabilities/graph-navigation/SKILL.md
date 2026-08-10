---
name: graph-navigation
description: Navigation im Knowledge Graph für die Cyber Factory — die sieben graph_*-MCP-Tools und die für dich relevanten Query-Templates.
---

# Graph-Navigation für die Cyber Factory

## Wann das gilt

Immer, wenn du Anforderungspakete, Schnittstellen-Verträge, ADRs oder offene Fragen aus dem
Graph lesen oder eigene Knoten (Frage-Knoten, Gate-Befunde, Rückweg-Dokumente) schreiben musst.
Nur auf Niveau A geladen — auf Niveau B/C greifst du über die dort bereitgestellten,
reduzierten Mechanismen zu.

## Vorgehen

**Sieben Tools, keine anderen.** Der Graph-MCP-Server stellt genau sieben `graph_*`-Tools zur
Verfügung — es gibt keine weiteren:

- **`graph_search`** — Volltext-/Vektor-Suche. Pflichtparameter `query`; optional `limit`
  (Default 10) und `kind` (Knotentyp-Filter). Liefert kompakte Treffer (uid, kind, title,
  score) — für Details danach `graph_get_node`.
- **`graph_get_node`** — lädt einen vollständigen Knoten. Pflichtparameter `uid`.
- **`graph_expand`** — Nachbarschafts-Expansion. Pflichtparameter `uid`; optional `depth`
  (1–5, Default 1), `edge_type`, `direction` (`outgoing` | `incoming` | `both`, Default `both`).
- **`graph_query`** — führt ein parametrisiertes Query-Template aus. Pflichtparameter
  `template`; optional `params` (Objekt, Schlüssel abhängig vom Template). Keine freie
  Query-Generierung — nur die registrierten Templates sind zulässig.
- **`graph_upsert_node`** — legt einen Knoten idempotent an oder aktualisiert ihn.
  Pflichtparameter `kind`, `title`; optional `path`, `status`, `body`, `content_hash`,
  `frontmatter`. Fehlt ein für den `kind` Pflicht-Frontmatter-Feld, lehnt der Aufruf ab, bevor
  irgendetwas geschrieben wird.
- **`graph_link`** — setzt eine Kante zwischen zwei Knoten. Pflichtparameter `src`, `dst`;
  optional `type` (wird sonst aus dem Knoten-Typ-Paar abgeleitet), `source`, `props`.
- **`graph_maintain`** — führt eine Wartungsoperation aus. Pflichtparameter `operation`.

**Query-Templates, die für dich als Cyber Factory relevant sind:**

- `anforderungspakete` — alle aktiven `anforderungspaket`-Knoten, optional gefiltert über
  `subsystem_uid`. Dein primärer Input pro Welle.
- `subsystem_list` / `subsystem_dependencies` — Subsystem-Übersicht und topologische
  Abhängigkeitsordnung (siehe `welle-plan-guide` für die genaue Auswertung).
- `schnittstellen_vertraege` — aktive Schnittstellen-Verträge, optional gefiltert über
  `subsystem_uid`. Lesen, nicht ändern.
- `adr_list` (optional `project_uid`) und `adr_by_tiefe` (Pflichtparameter `adr_uid`; optional
  `tiefe` mit `'summary' | 'context' | 'full'`, Default `summary`) — Architektur-Entscheidungen
  nachlesen, wenn eine Bau-Entscheidung von einer ADR abhängt.
- `offene_fragen` (optional `subsystem`) — deine eigenen offenen Coaching-Fragen an den
  Architect, um zu prüfen, ob schon eine Antwort vorliegt.
- `risk_reviews` — deine bisherigen Risk-Review-Befunde, neueste zuerst.

**Schreib-Pfad.** Für eigene Knoten (Frage-Knoten, Gate-Befunde, Rückweg-Dokumente) nutzt du
`graph_upsert_node`, für Verknüpfungen (z. B. `beantwortet` zwischen `antwort_knoten` und
`frage_knoten`) `graph_link`. Beide validieren gegen das Schema, bevor sie schreiben — ein
fehlendes Pflichtfeld oder ein für das Knoten-Paar ungültiger Kantentyp führt zu einem
Fehlerergebnis, nicht zu einem stillschweigend unvollständigen Knoten.

## Grenzen

Du nutzt `graph_query` ausschließlich mit den registrierten Templates — keine freie SQL- oder
Query-Konstruktion, auch nicht sinngemäß. Du schreibst über `graph_upsert_node`/`graph_link`
keine Knoten- oder Kantentypen, die Architect-Territorium sind (`schnittstellen_vertrag`, `adr`,
`phase_subsystem`-Zerlegung) — lesend darauf zugreifen ist dein Recht, schreibend nicht.
