---
name: handoff-logik-guide
description: Das operative Bild triggern, lesen, schreiben — warum es keine Entität-zu-Entität-Handoffs gibt und wo Führung gegen Orchestrierung endet.
---

# Handoff-Logik-Guide

## Wann das gilt

Durchgehend — dies ist der Mechanismus, der jede produktive Entität aktiviert und ihren
Abschluss wieder bei dir zusammenführt.

## Vorgehen

**Triggern, lesen, schreiben.** Das ist das operative Bild, das die Rollen verbindet: Du
triggerst eine produktive Entität mit einem zugeschnittenen Zeiger (`trigger-zeiger-format`);
die Entität liest ihren Input aus dem Graphen, arbeitet, schreibt ihren Output in den Graphen;
du liest den entstandenen Stand und triggerst die nächste. Die Rollen kommunizieren nicht
miteinander — sie kommunizieren mit dem Graphen, und du gibst den Takt vor. Genau deshalb gibt
es keine Entität-zu-Entität-Handoffs — mit zwei von M5 benannten Ausnahmen: Der Architect
übergibt am Ende des Bau-Zyklus direkt an dich, und der Workshop trägt eigene Routing-Hoheit
innerhalb der Fixing-Phase (intern, Debugger oder CF-Eskalation) und informiert dich darüber,
statt dich entscheiden zu lassen — beide bleiben an ihrer eigenen Phasengrenze. Außerhalb
dieser zwei Fälle gilt: Keine Phase übergibt einer anderen direkt, keine entscheidet selbst,
wer als Nächstes dran ist.

**Zwei Ebenen, zwei Wörter.** *Führung* ist phasenübergreifend — Triggern, Handoff-Logik,
Gate-Urteil — und liegt ausschließlich bei dir. *Orchestrierung* ist phasen-intern —
innerhalb einer getriggerten Entität ihre Worker-Sub-Sessions starten und überwachen — und
liegt bei der Cyber Factory (Bau-Wellen), dem Workshop (Bugfixing-Flow) und dem Debugger
(Worker-Session für den Fix). Läge auch die interne Orchestrierung bei dir, zöge die Last nicht
von dir weg, sondern alles zu dir hin — die Trennung ist deshalb nicht nur sprachlich, sondern
lasttragend.

**Den Handoff-Verlauf prüfen.** `handoff_audit` (ohne Parameter) geht jeden
`naechste_phase`-Übergang durch und meldet je Übergang, ob ein Trigger-Knoten mit
`triggert`-Kante zur Ziel-Phase existiert — das ist die konkrete Graph-Ebene-Prüfung für „ist
dieser Handoff tatsächlich durch mich gelaufen". `handoff_completeness` (Pflichtparameter
`phase_name`) prüft vor dem Triggern einer Zielphase, ob deren Vorgänger-Phase bereit ist: Sie
zählt `phasenoutput`-markierte Artefakte und `anlass`-Knoten, die über `traegt_phase` an den
Vorgänger gebunden sind, und liefert `is_complete`.

**Vor dem Triggern lesen.** `trigger_history` (ohne Parameter) und `trigger_for_phase`
(Pflichtparameter `phase_uid`) zeigen, was bereits an eine Phase geschickt wurde — prüfe das,
bevor du erneut triggerst, um doppelte oder widersprüchliche Trigger zu vermeiden.

## Grenzen

Diese Capability trägt deine eigene Führungsarbeit — sie berechtigt dich nicht, in die
phasen-interne Orchestrierung einer getriggerten Entität einzugreifen. Bau-Wellen, Worker und
Bugfixing-Flow bleiben deren Territorium; deine Rolle endet, sobald du getriggert hast, und
beginnt wieder, sobald der Output im Graphen steht.
