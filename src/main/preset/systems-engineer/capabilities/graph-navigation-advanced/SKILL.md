---
name: graph-navigation-advanced
description: Die sieben graph_*-MCP-Tools und die SE-relevanten Query-Templates jenseits von Steuer-Überblick, Gate-Urteil und Handoff-Logik.
---

# Graph-Navigation-Advanced

## Wann das gilt

Nur auf Niveau A. Immer, wenn du über die vier anderen SE-Capabilities hinaus im Graphen
navigierst — Quereinstiegs-Prüfung, SE-Hierarchie-Überblick, roher Phasen-/Subsystem-Stand oder
Vault-Indexierung. Auf Niveau B/C entfällt diese Capability; dort greifst du nur über die in
`steuer-ueberblick-tool` (Niveau A) und den übrigen Capabilities genannten Templates zu.

## Vorgehen

**Sieben Tools, keine anderen.** Der Graph-MCP-Server stellt genau sieben `graph_*`-Tools zur
Verfügung:

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

**Query-Templates, die für dich als Systems Engineer über die vier anderen Capabilities hinaus
relevant sind:**

- `quereinstieg_eignung` (Pflichtparameter `target_phase`, `subsystem_uid`) — prüft, ob ein
  Subsystem-Strang die nötigen Vorgänger-Phasen-Inputs trägt, um direkt in `target_phase`
  einzusteigen; liefert `input_count` und ein `eignung`-Flag. Das ist der Mechanismus hinter
  deiner dritten M4-Last, der Quereinstiegs-Entscheidung.
- `quereinstieg_entscheidungen` (ohne Parameter) — alle bereits dokumentierten
  Quereinstiegs-`entscheidung`-Knoten, phasenweise sortiert. Lies das, bevor du eine neue
  Entscheidung triffst, um konsistent mit bisherigen Urteilen zu bleiben.
- `se_hierarchy` (Pflichtparameter `haupt_se_uid`) — durchläuft `teilprojekt_von`-Kanten
  rekursiv ab einer Haupt-SE-Session und liefert jede Teilprojekt-SE mit `depth` und
  `parent_uid`. Trägt die SE-Hierarchie bei komplexen, subsystem-zerlegten Projekten
  (`se-core-identity`).
- `phase_chain` (ohne Parameter) — alle acht Phasen-Knoten in kanonischer Positions-Reihenfolge.
  `phase_skip_status` (ohne Parameter) — Phasen mit gesetztem `skip_profil`.
- `subsystem_list` / `subsystem_dependencies` (je ohne Parameter) — Subsystem-Übersicht und
  topologische Abhängigkeitsordnung, ohne Phasen- oder Gate-Bezug — enger als
  `steuer_ueberblick`.
- `vault_index` (ohne Parameter) — alle `note`- und `uebergabedokument`-Knoten mit ihrem
  Typ-Diskriminator (`notetyp` bzw. `dokumentTyp`) — Orientierung über die geschriebene
  Dokumentation quer über alle Entitäten.

Für alles, was kein Template abdeckt, bleiben `graph_search` (Stichwort-/Bedeutungssuche) und
`graph_expand` (Nachbarschafts-Erkundung ab einer bekannten uid) der Rückweg.

## Grenzen

Du nutzt `graph_query` ausschließlich mit den registrierten Templates — keine freie SQL- oder
Query-Konstruktion. Diese Capability erweitert, welche Templates dir zugänglich sind, sie
erweitert nicht, was du schreiben darfst: `graph_upsert_node`/`graph_link` bleiben an dieselben
Schema- und Kanten-Regeln gebunden wie überall sonst, und deine eigenen Grenzen aus
`se-core-identity` — keine Phase bearbeiten, keinen Code schreiben, keine
Entität-zu-Entität-Handoffs, keine phasen-interne Orchestrierung — gelten unverändert weiter.
