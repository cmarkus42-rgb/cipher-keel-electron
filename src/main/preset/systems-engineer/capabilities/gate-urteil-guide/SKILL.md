---
name: gate-urteil-guide
description: Inhaltliches Urteil an den Traceability-Gates — struktureller und Plausibilitäts-Befund getrennt geführt, bewusst nicht verrechnet.
---

# Gate-Urteil-Guide

## Wann das gilt

An jedem Traceability-Gate, wenn eine Phase auf Abdeckung geprüft wird — sei es weil eine
Phase abschließt und die nächste getriggert werden soll, sei es weil ein Steuer-Überblick eine
noch unbeurteilte Phase zeigt.

## Vorgehen

**Zwei Signale, nie verrechnet.** Ein `gate_befund`-Knoten führt zwei getrennte Felder:
`strukturell` (`gruen` | `teilweise` | `rot`, deterministisch — eine Kante fehlt oder ist
vorhanden) und `plausibilitaet` (`traegt` | `fraglich` | `null` — trägt die Umsetzung die
Anforderung inhaltlich, eine Inferenz mit Fehlerrate). Beide werden **getrennt geführt** und
bewusst nicht zu einem Wert zusammengefasst. Das Gewichten eines strukturell roten gegen einen
inhaltlich grünen Befund ist deine Rolle — genuines Urteilen, nicht Ablesen.

**Der strukturelle Befund ist deterministisch, nicht dein Urteil.** Er wird über die
`gate_structural_coverage`-Query berechnet (Pflichtparameter `phase_uid`, optional `edge_type`,
Default `setzt_um`): Sie zählt, wie viele der an die Phase gebundenen `anforderung`-Knoten eine
Kante vom geprüften Typ tragen. `gruen`, wenn alle abgedeckt sind oder keine Anforderungen
existieren; `rot`, wenn keine abgedeckt ist, aber welche existieren; sonst `teilweise` — genau
diese Logik implementiert `autoGateBefund` in `phase-contract.ts`, das den Knoten mit den drei
Pflichtfeldern schreibt und über eine `gate_fuer`-Kante mit der Phase verlinkt.

**Drei Pflichtfelder, zwei optionale — und die optionalen sind der Punkt der Capability.** Für
einen `gate_befund`-Knoten sind `phase_uid`, `strukturell` und `gate_typ` schema-pflichtig;
`plausibilitaet` und `gewichtung` sind erlaubt, aber nicht erzwungen. Ein Knoten mit nur den
drei Pflichtfeldern ist schema-gültig — und inhaltlich leer: Kein Mechanismus setzt
`plausibilitaet` automatisch, sie startet als `null` und bleibt es, bis du sie als dein
eigenes inhaltliches Urteil setzt. Ebenso ist `gewichtung` ein freier Text, der festhält, wie
du die beiden Signale gegeneinander gewichtet hast — auch sie schreibt kein automatischer Pfad.
Ein Gate-Urteil, das bei den drei Pflichtfeldern stehen bleibt, hat die eigentliche Arbeit der
Capability nicht getan.

**Schreiben und verlinken.** Lege den Knoten über `graph_upsert_node` an
(`kind: 'gate_befund'`), dann die Kante über `graph_link` (`src` = Befund-uid, `dst` =
Phasen-uid). Der abgeleitete Kantentyp für das Paar `gate_befund → phase` ist `gate_fuer`
(Paar-Ableitungstabelle in `edge-types.ts`) — `graph_link` leitet ihn automatisch ab, wenn du
`type` weglässt.

**Bestehende Befunde lesen.** `gate_befunde_fuer_phase` (Pflichtparameter `phase_uid`) liefert
alle Befunde einer Phase, neueste zuerst. `gate_befunde_aggregiert` (ohne Parameter) liefert
eine Zeile je Phase mit ihrem jeweils neuesten Befund — `befund_uid` ist `null`, solange keiner
existiert. Nutze diese, bevor du ein neues Urteil schreibst: Ein Gate ist informativ, nicht
blockierend — der betroffene Strang wartet, die anderen laufen weiter, aber ein bereits
vorhandenes Urteil erneut zu duplizieren, hilft niemandem.

## Grenzen

Du erfindest kein drittes Signal neben `strukturell` und `plausibilitaet` und du verrechnest
die beiden nicht zu einer einzigen Zahl oder Farbe — das würde genau die Trennung aufheben, die
den Gate-Mechanismus trägt. Die strukturelle Berechnung selbst ist nicht dein Urteil; sie folgt
deterministisch aus der Kantenlage. Deine Arbeit ist die Gewichtung — und die Gewichtung
existiert erst, wenn du sie schreibst.
