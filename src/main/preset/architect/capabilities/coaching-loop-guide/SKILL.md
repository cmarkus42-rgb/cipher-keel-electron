---
name: coaching-loop-guide
description: Graph-vermittelter Frage/Antwort-Coaching-Loop mit CF-Workern während des Baus, inklusive Drift-Erkennung.
---

# Coaching-Loop-Guide

## Wann das gilt

Während des gesamten Bau-Zyklus, sobald die Cyber Factory mit deinen Anforderungspaketen
arbeitet. Der Coaching-Loop ist der Grund, warum du nicht fire-and-forget bist — er ist dein
Präsenz-Kanal, während die Worker bauen.

## Vorgehen

**Graph-vermittelt, nicht direkt.** Es gibt keine direkte Entität-zu-Entität-Verbindung
zwischen dir und einem CF-Worker. Der Kanal läuft über den Graphen: Ein CF-Worker, der beim
Bauen auf eine Unklarheit stößt, schreibt einen `frage_knoten` mit den Feldern `subsystem`,
`frage`, `worker_id` und `status: 'offen'`. Du liest ihn nicht in Echtzeit zugestellt, sondern
holst ihn dir aktiv ab.

**Offene Fragen abholen.** Prüfe regelmäßig — insbesondere zu Beginn jeder Coaching-Runde —
die `offene_fragen`-Query, optional gefiltert auf ein `subsystem`. Sie liefert alle
`frage_knoten` mit `status: 'offen'`, chronologisch sortiert. Arbeite sie in dieser Reihenfolge
ab; eine Frage, die lange offen steht, blockiert einen Worker, der auf sie wartet.

**Antworten als eigener Knoten.** Beantworte eine Frage nicht durch Bearbeiten des
Frage-Knotens, sondern durch einen neuen `antwort_knoten` mit den Feldern `frage_uid`,
`antwort` und `architect_session`, verlinkt über eine `beantwortet`-Kante
(`antwort_knoten → frage_knoten`). So bleibt die Frage im Originalwortlaut erhalten und die
Antwort ist eigenständig nachvollziehbar — die `coaching_historie`-Query liest beide über diese
Kante als Q&A-Paar aus.

**Deine Antwort bleibt im Rahmen deiner Rolle.** Eine Coaching-Antwort erklärt oder präzisiert
den bestehenden Schnittstellen-Vertrag oder die Subsystem-Grenze — sie liefert kein neues
Anforderungsdetail und keinen Code. Wenn eine Frage eigentlich eine Anforderungslücke aufdeckt,
ist das ein Fall für den Systems Engineer, nicht etwas, das du in der Antwort selbst nachträgst.

**Drift erkennen und melden.** Stellst du fest, dass mehrere Worker unabhängig voneinander auf
dasselbe Problem stoßen — dieselbe Unklarheit in verschiedenen Fragen, dasselbe wiederkehrende
Muster —, ist das ein Drift-Signal: ein Zeichen, dass die Zerlegung oder ein Vertrag nicht
mehr trägt. Schreibe dafür einen `gate_befund`-Knoten mit `gate_typ: 'drift'` und informiere
den Systems Engineer. Warte damit nicht, bis eine CF-Session komplett feststeckt — je früher
das Signal geschrieben wird, desto günstiger die Korrektur.

## Grenzen

Du beantwortest Fragen zu Schnittstellen und Zerlegung — du nimmst dem Worker keine
Bau-Entscheidung ab und lieferst keinen Code in der Antwort. Und du greifst nicht direkt in
eine CF-Session ein: Der Graph ist der einzige Kanal, es gibt keinen Nebenweg über Chat oder
Datei-Edits am laufenden Worker vorbei.
