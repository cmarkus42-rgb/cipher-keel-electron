---
name: rueckweg-protokoll
description: Protokoll für den Rückweg vom Bauen zum Entwurf, wenn die Architekten-Zerlegung beim Bauen nicht trägt.
---

# Rückweg-Protokoll

## Wann das gilt

Sobald du beim Bauen feststellst, dass die Modularisierung des Architects nicht trägt — eine
Schnittstelle passt nicht zur Implementierung, ein Subsystem lässt sich mit dem vereinbarten
Vertrag nicht bauen, oder eine Abhängigkeit fehlt, die erst beim Bau sichtbar wird.

## Vorgehen

**Kein direkter Entität-zu-Entität-Handoff.** Es gibt keine direkte Übergabe von der Cyber
Factory zum Architect. Der Rückweg läuft ausschließlich über den Graph und den Systems
Engineer: Du schreibst deinen Befund, der SE liest ihn und entscheidet — das ist seine
Quereinstiegs-Last, rückwärts gelesen — und kann den Architect erneut triggern. Du triggerst
nichts selbst.

**Zwei Knoten anlegen, in dieser Reihenfolge:**

1. **`gate_befund`** mit `gate_typ: 'architektur-bruch'` und `strukturell: 'rot'`. Pflichtfelder
   sind `phase_uid`, `strukturell`, `gate_typ` — fehlt eines, weist der Graph den Knoten beim
   Anlegen zurück. Zusätzlich trägst du `subsystem`, `bruchpunkt`, `schnittstelle` und
   `bau_implikation` ins Frontmatter, damit der Befund für den SE selbsterklärend ist.
2. **`uebergabedokument`** mit `dokumentTyp: 'rueckweg-befund'` (das einzige Pflichtfeld dieses
   Knotentyps) und einem Freitext-Body, der Subsystem, Bruchpunkt, Schnittstelle und
   Bau-Implikation menschenlesbar zusammenfasst, sowie dem Hinweis, dass die Cyber Factory auf
   die SE-Entscheidung wartet und nicht auf eigene Faust umbaut.

**Danach warten.** Nach dem Schreiben beider Knoten hältst du das betroffene Subsystem blockiert
und arbeitest an anderen, nicht betroffenen Subsystemen der laufenden Welle weiter, falls
vorhanden. Du baust das blockierte Subsystem nicht um, auch nicht versuchsweise, bis der SE
reagiert hat.

**Warum die Trennung trägt.** Planen ist divergent, Bauen ist konvergent — vermischt eine Rolle
beides, trifft sie Bau-Entscheidungen, bevor die Modularisierung steht, und muss mitten im
Code-Kontext zurückrudern. Der Rückweg über den Graph hält diese Trennung, ohne dich als Builder
einzumauern: Der Architect bleibt über die Coaching-Fragen (`frage_knoten`/`antwort_knoten`)
und über Rückweg-Befunde im Loop, ohne dass du selbst Architektur-Entscheidungen triffst.

## Grenzen

Du triffst am Bruchpunkt keine Architektur-Entscheidung selbst — auch keine naheliegende. Du
dokumentierst den Bruch strukturiert und wartest. Du triggerst weder den Architect noch den SE
direkt; beide erfahren vom Bruch ausschließlich durch das Lesen der beiden Knoten im Graph.
