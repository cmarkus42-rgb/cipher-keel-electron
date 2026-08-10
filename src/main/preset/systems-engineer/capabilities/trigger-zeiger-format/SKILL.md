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

**`gate_befund_id` und `phasen_ziel` — diese Prüfungen macht dir niemand ab.** Es gibt eine
Funktion (`createTrigger` in `se-trigger.ts`), die vor dem Schreiben prüft, dass ein
referenziertes `gate_befund_id` auf einen existierenden `gate_befund`-Knoten zeigt, und die
`phasen_ziel` gegen `frontmatter.name` der `phase`-Knoten auflöst. Diese Funktion hat aber
keinen Aufrufer aus einer laufenden Session heraus — sie ist über kein MCP-Tool erreichbar. Der
Pfad, den du tatsächlich hast, ist `graph_upsert_node` + `graph_link`, und der prüft das nicht:
`graph_upsert_node` verlangt nur, dass die für `kind: 'trigger'` pflichtigen Felder
(`entitaets_id`, `phasen_ziel`, `niveau`) nicht-leere Strings sind — er schaut nicht nach, ob
`phasen_ziel` zu einer echten Phase passt oder ob `gate_befund_id` existiert. `graph_link`
prüft nur, dass die uids, die du ihm als `src`/`dst` gibst, im Graphen existieren — er
vergleicht das nicht gegen die Werte, die im Frontmatter des Trigger-Knotens stehen. Du kannst
also mit diesen beiden Tools genau den kaputten Zeiger schreiben, den die Prüfung eigentlich
verhindern soll, und nichts schlägt fehl.

**Die Garantie musst du selbst herstellen — vor dem Schreiben, nicht danach.** Bevor du den
Trigger anlegst: Löse `phasen_ziel` über `graph_query` auf, z. B. mit Template `nodes_by_kind`
und `params: { kind: 'phase' }` — vergleiche die zurückgelieferten `frontmatter.name`-Werte mit
deinem `phasen_ziel` und nimm die passende uid als `dst` für `graph_link`. Ist `gate_befund_id`
gesetzt, bestätige sie separat mit `graph_get_node` (Pflichtparameter `uid`) und prüfe, dass der
zurückgegebene Knoten `kind: 'gate_befund'` trägt, bevor du den Wert ins Trigger-Frontmatter
schreibst. Beides sind zusätzliche Aufrufe, die du selbst machst — kein Tool macht sie für dich.

**Schreiben und verlinken.** Lege den Knoten über `graph_upsert_node` an
(`kind: 'trigger'`), dann verlinke ihn über `graph_link` mit der Ziel-Phase, deren uid du zuvor
aufgelöst hast. Der abgeleitete Kantentyp für das Paar `trigger → phase` ist `triggert` —
dieser Kantentyp ist ausschließlich für dieses Paar gültig, ein `triggert` mit einem anderen
Ziel-Knotentyp scheitert an der Kanten-Validierung. Diese Kanten-Validierung prüft aber nur den
Knotentyp des Ziels, nicht, ob es die *richtige* Phase ist — das ist wieder deine eigene
Auflösung von oben, nicht ein Sicherheitsnetz von `graph_link`.

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

Verlass dich nicht darauf, dass ein ungültiges `phasen_ziel` oder ein erfundenes
`gate_befund_id` beim Schreiben auffliegt — der Werkzeugpfad, den du hast, prüft beides nicht.
Löse beides selbst auf, bevor du schreibst (siehe oben); ein Trigger, den du ohne diese
Vorab-Prüfung schreibst, kann im Graphen stehen, ohne dass er hält, was er behauptet.
