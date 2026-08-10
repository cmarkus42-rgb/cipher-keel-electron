---
name: subsystem-zerlegung-guide
description: Anleitung zur rekursiven Subsystem-Zerlegung entlang stabilisierbarer Schnittstellen, inklusive Schnittstellen-Verträgen.
---

# Subsystem-Zerlegungs-Guide

## Wann das gilt

Zu Beginn jeder Architektur-Phase, sobald ein System oder ein größeres Subsystem noch nicht in
tragfähige Einheiten zerlegt ist. Auch bei einer nachträglichen Korrektur, wenn du selbst — als
einzige dazu befugte Instanz — eine bestehende Zerlegung als zu fein oder zu grob
zurückstufst.

## Vorgehen

**Rekursiv, entlang stabilisierbarer Schnittstellen.** Zerlege das System nicht nach
Bauchgefühl oder nach Dateistruktur, sondern entlang der Stellen, an denen sich eine
Schnittstelle stabilisieren lässt — Grenzen, die auch nach künftigen Änderungen innerhalb
eines Subsystems voraussichtlich stabil bleiben. Wiederhole die Zerlegung rekursiv: Ein grobes
Subsystem, das selbst wieder mehrere unabhängig testbare Einheiten enthält, wird weiter
unterteilt, bis jedes Blatt eine Blackbox mit klarer Außenschnittstelle ist.

**Blackbox/Whitebox.** Jedes Subsystem ist für die übrige Architektur eine Blackbox — nur sein
Vertrag zählt, nicht seine innere Struktur. Für dich als Architect ist es beim Zerlegen
zeitweise eine Whitebox: Du musst genug von seinem Innenleben verstehen, um zu wissen, wo die
stabile Schnittstelle verläuft, gibst dieses Wissen aber nicht als Bauanleitung weiter — das
wäre bereits Bau-Entscheidung.

**Jedes Subsystem als Knoten.** Lege für jedes identifizierte Subsystem einen
`phase_subsystem`-Knoten an (Felder: `scope`, `status`, ggf. `blocked_grund`). Subsysteme ohne
eingehende `haengt_ab_von`-Kante sind die Wurzeln der Zerlegung — dort kann die Cyber Factory
zuerst ansetzen.

**Abhängigkeiten als Kanten, nicht als Reihenfolge.** Wenn Subsystem B auf Subsystem A
angewiesen ist, setzt du eine `haengt_ab_von`-Kante von B nach A. Das ist eine
Abhängigkeitsaussage, keine Wellen-Zuweisung — wie viele Subsysteme parallel in einer Welle
laufen, entscheidet die Cyber Factory anhand dieser Kanten, nicht du.

**Schnittstellen-Vertrag pro Grenze.** Für jede Grenze zwischen zwei Subsystemen legst du
einen `schnittstellen_vertrag`-Knoten an, verlinkt über `schnittstellen_vertrag_fuer` mit dem
betroffenen Subsystem. Der Vertrag hat sechs Pflichtfelder, sonst weist ihn der Graph beim
Anlegen zurück:

- `subsystem_a`, `subsystem_b` — die beiden Subsysteme, zwischen denen der Vertrag gilt
- `input_schema` — Typen und Format dessen, was hereinkommt
- `output_schema` — Typen und Format dessen, was herausgeht
- `fehlerverhalten` — welche Fehlerfälle auftreten können und wie darauf reagiert wird
- `template_version` — Version des Vertrags-Templates

Das Paar `subsystem_a`/`subsystem_b` und `template_version` sind strukturell — sie identifizieren
und versionieren den Vertrag. Die drei Inhaltsfelder `input_schema`, `output_schema` und
`fehlerverhalten` sind die eigentliche Substanz. Ein Vertrag ohne `fehlerverhalten` ist
inhaltlich unvollständig — ein Worker, der die Blackbox baut, muss wissen, was bei einem
Fehlerfall an der Grenze passiert, nicht nur, was im Erfolgsfall durchgereicht wird — und fehlt
eines der sechs Felder überhaupt, lässt sich der Knoten gar nicht erst anlegen.

## Grenzen

Du zerlegst und dokumentierst die Verträge — du implementierst sie nicht. Sobald du anfängst,
konkrete Funktionssignaturen mit Implementierungslogik statt reinen Typ- und Formatangaben zu
schreiben, hast du die Blackbox-Grenze bereits überschritten. Ebenso legst du keine
Bau-Reihenfolge fest: Die `haengt_ab_von`-Kanten sind alles, was du beisteuerst; die
Wellen-Struktur bleibt CF-Territorium.
