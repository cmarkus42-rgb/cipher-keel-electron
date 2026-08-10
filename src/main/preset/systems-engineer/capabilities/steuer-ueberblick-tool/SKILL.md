---
name: steuer-ueberblick-tool
description: Die aggregierende Graph-Abfrage über Subsystem-Stränge, Phasenposition und offene Gates — deine erste M4-Last.
---

# Steuer-Überblick-Tool

## Wann das gilt

Nur auf Niveau A. Immer, wenn du dir einen Überblick über den Gesamtstand verschaffst — zu
Beginn einer Session, vor einer Trigger- oder Gate-Entscheidung, oder wenn ein Strang das
nächste Gate erreicht hat. Auf Niveau B entfällt diese Capability; dort verschaffst du dir den
Überblick manuell über einzelne Standard-Queries (`subsystem_list`, `gate_befunde_aggregiert`).

## Vorgehen

**Ein Template, eine Abfrage, keine Parameter.** `steuer_ueberblick` ist genau die
aggregierende Abfrage, die M4 dir zuweist: eine Zeile je (Subsystem-Strang, Phase)-Paar,
verbunden über die `traegt_phase`-Kante. Jede Zeile trägt Titel, `scope`, `status` und
`blocked_grund` des Subsystems, Name und `position` der Phase, sowie — über ein
Window-Function-Pattern — den jeweils neuesten `gate_befund` dieser Phase (`befund_uid` ist
`null`, solange keiner existiert). Damit siehst du in einem Aufruf, wo jeder Strang in der
Phasenkette steht und ob dort ein offenes Gate wartet.

**Die Abfrage ist global, nicht strang-gescoped.** `steuer_ueberblick` nimmt keine Parameter
und liefert jede Subsystem-Phase-Paarung im Graphen — nicht nur die eines bestimmten Strangs.
Das ist ein benannter offener Punkt, keine fehlende Funktion: M4 beschreibt einen Systems
Engineer, der mehrere Stränge zugleich steuert; M5 verfeinert das zu einer Session je Strang
auf geteiltem Graphen, und wie die strang-übergreifende Gesamtsicht unter dieser Verfeinerung
organisiert ist, bleibt mit M4 abzugleichen. Erfinde deshalb keinen Scoping-Parameter, den es
nicht gibt — filtere die zurückgegebenen Zeilen bei Bedarf selbst auf `subsystem_uid`, wenn du
nur einen einzelnen Strang siehst brauchst.

**Ergänzende, engere Abfragen.** `subsystem_list` (ohne Parameter) liefert die Subsystem-Seite
ohne Phasenbezug, `gate_befunde_aggregiert` (ohne Parameter) die Phasen-Seite mit ihrem
neuesten Befund, aber ohne Subsystem-Bezug. Beide sind die Hälften, die `steuer_ueberblick`
zusammenführt — greife auf sie nur zurück, wenn du wirklich die schmalere Sicht brauchst.

## Grenzen

`steuer_ueberblick` ist reine Orientierung — die Abfrage selbst schreibt nichts. Was du im
Überblick siehst, führt dich zu einer Entscheidung (ein Gate-Urteil, ein neuer Trigger), aber
diese Entscheidung triffst und schreibst du über `gate-urteil-guide` und
`trigger-zeiger-format`, nicht über diese Capability.
