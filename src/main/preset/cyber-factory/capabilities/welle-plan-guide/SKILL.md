---
name: welle-plan-guide
description: Anleitung zur Struktur des Welle-Plans — topologische Sortierung der Architect-Zerlegung in Bau-Wellen.
---

# Welle-Plan-Guide

## Wann das gilt

Am Anfang jeder Cyber-Factory-Session, bevor der erste Worker startet — der Welle-Plan ist die
Grundlage, auf der jede weitere Orchestrierung aufbaut. Auch bei einem Quereinstieg, wenn eine
Session nur einen Teil der Zerlegung übernimmt.

## Vorgehen

**Input lesen.** Hol dir zuerst alle `phase_subsystem`-Knoten über die Query `subsystem_list`.
Sie liefert zwei unterschiedliche, gleich aussehende Spalten — verwechsle sie nicht:

- `status` — der Knoten-Lebenszyklus (`aktiv` | `abgeloest` | `verworfen`), nicht aus dem
  Frontmatter, sondern die Spalte `node.status`.
- `sub_status` — der fachliche Bearbeitungsstand aus dem Frontmatter
  (`json_extract(frontmatter, '$.status')`, entspricht `PhaseSubsystemAttrs.status`). **Das ist
  die Spalte, die beantwortet, ob ein Subsystem bereit zum Bauen ist** — nicht `status`.

Zusätzlich liefert die Query `scope` und `blocked_grund` (beide aus dem Frontmatter) sowie
`dep_count`, die Anzahl ausgehender `haengt_ab_von`-Kanten. Ist das Ergebnis leer, gibt es
nichts zu bauen.

**Abhängigkeiten auflösen.** Die Query `subsystem_dependencies` liefert die topologische
Ordnung: Wurzeln sind Subsysteme ohne eingehende `haengt_ab_von`-Kante, von dort aus wird
entlang ausgehender `haengt_ab_von`-Kanten traversiert. Die Kanten-Semantik ist wichtig und
leicht zu verwechseln: `B --haengt_ab_von--> A` bedeutet "B hängt von A ab" — A ist das
Fundament. Die Query gibt jedem erreichten Knoten einen `topo_order`-Wert; höherer `topo_order`
bedeutet fundamentaler, also **muss früher gebaut werden**. Sortiere deshalb absteigend nach
`topo_order`, um die Baureihenfolge zu erhalten. Subsysteme, die die CTE nicht erreicht (etwa
isolierte Zyklen), bekommen sicherheitshalber `topo_order = 0`.

**Anforderungspakete zuordnen.** Über die Query `anforderungspakete` liest du die
`anforderungspaket`-Knoten; jedes trägt im Frontmatter `subsystem` (die UID des zugehörigen
Subsystems). Bei mehreren Paketen für dasselbe Subsystem gewinnt das erste gefundene.

**Wellen bilden.** Gruppiere die Subsystem-UIDs nach `topo_order`, sortiere die Gruppen
absteigend. Jede Gruppe wird — vorbehaltlich der Worker-Kapazität, siehe
`welle-plan-granularisierer` — zu einer oder mehreren Wellen. Das Ergebnis ist ein `WellePlan`
mit einer Liste `wellen`, jede mit `index` und `slots`; jeder Slot trägt `subsystemUid`,
`subsystemTitle` und die zugeordnete `anforderungspaketUid` (oder `null`, wenn kein Paket
zugeordnet ist).

## Grenzen

Du liest die Zerlegung, du änderst sie nicht. Findest du eine fehlende oder widersprüchliche
Abhängigkeitskante, ist das ein Fall für den Rückweg (`rueckweg-protokoll`), nicht für eine
eigenmächtige Korrektur der Kanten. Die Reihenfolge der Wellen ergibt sich ausschließlich aus
den `haengt_ab_von`-Kanten und der Worker-Kapazität — nicht aus eigener Einschätzung, welches
Subsystem "wichtiger" wirkt.
