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

**Sieben Tools, keine anderen — und erreichbar unter einer Bedingung.** Der Graph-MCP-Server
stellt genau sieben `graph_*`-Tools zur Verfügung — es gibt keine weiteren. Erreichbar sind sie,
wenn diese Sitzung gestartet wurde, während die aktuelle App-Instanz läuft (`SESSION_CREATE`
registriert Adresse und Schlüssel des lokalen HTTP-Servers, bevor die tmux-Sitzung entsteht).
Eine Sitzung, die einen Neustart der App überlebt hat, verliert sie und bekommt sie nicht
zurück, bis sie zerstört und neu angelegt wird (siehe `docs/anpassbare-flaechen.md`, Abschnitt
„Was fehlt", für den vollen Befund). **Gemessen, nicht nur behauptet (2026-08-30):** eine echte
Architect-Sitzung über die Grid-Oberfläche angelegt, im echten tmux-Pane `/mcp` geprüft
(`cipher-keel · ✔ connected · 10 tools`, `Auth: ✔ authenticated`) und einen echten
`graph_search`-Aufruf beobachtet, dessen Antwort die uid eines zuvor geschriebenen Knotens
exakt traf — Details in `docs/anpassbare-flaechen.md`. Nicht geprüft und weiterhin offen ist der
Fall einer Sitzung, die einen App-Neustart überlebt hat.

**Die sieben Werkzeuge:**

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
- `offene_fragen` (optional `subsystem`) — nur noch **unbeantwortete** Fragen (filtert intern
  auf `status = 'offen'`). Damit erkennst du, welche deiner Fragen noch offen sind — für die
  Antwort selbst reicht dieses Template nicht.
- `coaching_historie` (Pflichtparameter `subsystem` — UID des Subsystems, gegen
  `frage_knoten.frontmatter.subsystem` gematcht; ohne Parameter lehnt die Query ab) — die
  eigentliche Antwort-Abholung: liefert pro Frage-Knoten eine Zeile mit `frage_uid`,
  `frage_title`, `frage`, `antwort_uid`, `antwort`, `erstellt`, chronologisch aufsteigend. Die
  Antwort-Spalten sind `null`, solange kein `antwort_knoten` über die `beantwortet`-Kante
  verlinkt ist (LEFT JOIN) — so unterscheidest du "noch offen" von "beantwortet, aber noch nicht
  an den Worker weitergegeben". Nutze `coaching_historie`, nicht `offene_fragen`, um Antworten
  einzusammeln und an den fragenden Worker weiterzuleiten.
- `risk_reviews` — deine bisherigen Risk-Review-Befunde, neueste zuerst.

**Schreib-Pfad.** Für eigene Knoten (Frage-Knoten, Gate-Befunde, Rückweg-Dokumente) nutzt du
`graph_upsert_node`. Schreibst du einen `frage_knoten`, sind vier Frontmatter-Felder Pflicht:
`subsystem`, `frage`, `worker_id`, `status` — und `status` muss zusätzlich einer von `offen` |
`beantwortet` sein. Fehlt eines oder ist `status` ungültig, lehnt der Aufruf den Knoten ab,
bevor irgendetwas geschrieben wird. Für Verknüpfungen nutzt du `graph_link` — ein Beispiel aus
deinem eigenen Territorium: Verlinkst du einen selbst geschriebenen `gate_befund` mit der
zugehörigen `phase`, ist der abgeleitete Kantentyp `gate_fuer` (Paar-Ableitungstabelle in
`edge-types.ts`). Die `beantwortet`-Kante zwischen `antwort_knoten` und `frage_knoten` schreibt
dagegen der Architect, nicht du — du liest sie nur, über `coaching_historie`. Beide Schreib-Tools
validieren gegen das Schema, bevor sie schreiben — ein fehlendes Pflichtfeld oder ein für das
Knoten-Paar ungültiger Kantentyp führt zu einem Fehlerergebnis, nicht zu einem stillschweigend
unvollständigen Knoten.

## Grenzen

Du nutzt `graph_query` ausschließlich mit den registrierten Templates — keine freie SQL- oder
Query-Konstruktion, auch nicht sinngemäß. Du schreibst über `graph_upsert_node`/`graph_link`
keine Knoten- oder Kantentypen, die Architect-Territorium sind (`schnittstellen_vertrag`, `adr`,
`phase_subsystem`-Zerlegung) — lesend darauf zugreifen ist dein Recht, schreibend nicht.
