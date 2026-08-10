---
name: trigger-zeiger-format
description: Format des Trigger-Knotens, mit dem du die nächste produktive Entität aktivierst — ein zugeschnittener Zeiger, kein blankes "du bist dran".
---

# Trigger-Zeiger-Format

## Wann das gilt

Immer, wenn du eine produktive Entität aktivierst — beim Übergang in eine neue Phase, beim
erneuten Triggern nach einem Rückweg-Befund, oder beim Anstoßen einer Teilprojekt-SE.

## Vorgehen

**Drei Pflichtfelder — und drei weitere, die den Sinn der Capability ausmachen.** Ein
`trigger`-Knoten braucht schema-pflichtig nur `entitaets_id`, `phasen_ziel` und `niveau`
(`A` | `B` | `C`). Ein Trigger mit nur diesen dreien ist schema-gültig — und genau das blanke
„du bist dran", das M5 ausdrücklich ausschließt. Der zugeschnittene Zeiger entsteht erst über
die drei schema-optionalen Felder `subsystem`, `input_quelle` und `erwarteter_output`: welches
Subsystem betroffen ist, wo der Input im Graphen liegt, was als Output erwartet wird. Die
getriggerte Entität muss dann nicht mehr selbst herausfinden, was sie abzufragen hat — lässt du
diese drei Felder leer, bleibt der Trigger technisch gültig, aber inhaltlich das, was er nicht
sein soll.

**`gate_befund_id` — optional, aber wenn gesetzt, geprüft.** Verweist ein Trigger auf ein
vorausgegangenes Gate-Urteil, trägt er dessen uid in `gate_befund_id`. Ist der Wert nicht
`null`, prüft das Schreiben, dass ein `gate_befund`-Knoten mit dieser uid existiert, bevor der
Trigger angelegt wird — ein Verweis auf ein nicht existierendes Gate scheitert laut, statt
einen kaputten Zeiger im Graphen zu hinterlassen.

**`phasen_ziel` muss eine tatsächliche Phase sein.** Der Wert wird gegen `frontmatter.name` der
`phase`-Knoten aufgelöst — ein Zielname, der zu keiner Phase im Graphen passt, lässt das
Schreiben scheitern, statt einen Trigger ins Leere zu erzeugen.

**Schreiben und verlinken.** Lege den Knoten über `graph_upsert_node` an
(`kind: 'trigger'`), dann verlinke ihn über `graph_link` mit der Ziel-Phase. Der abgeleitete
Kantentyp für das Paar `trigger → phase` ist `triggert` — dieser Kantentyp ist ausschließlich
für dieses Paar gültig, ein `triggert` mit einem anderen Ziel-Knotentyp scheitert an der
Kanten-Validierung.

**Vor dem Triggern lesen.** `trigger_history` (ohne Parameter) liefert alle Trigger
chronologisch, `trigger_for_phase` (Pflichtparameter `phase_uid`) nur die an eine bestimmte
Phase. Prüfe, was bereits geschickt wurde, bevor du erneut triggerst — insbesondere bei
Teilprojekt-SEs, wo ein Doppel-Trigger leicht unbemerkt bliebe.

## Grenzen

Ein Trigger zeigt immer auf genau eine Phase — die Kanten-Validierung erlaubt kein anderes
Ziel für `triggert`. Und ein Trigger, der nur die drei Pflichtfelder trägt, ist zwar gültig,
erfüllt aber nicht den Zweck der Capability: Fülle `subsystem`, `input_quelle` und
`erwarteter_output`, sooft du sie kennst — das Weglassen ist keine erlaubte Abkürzung, sondern
genau das Verhalten, das dieses Format verhindern soll.
