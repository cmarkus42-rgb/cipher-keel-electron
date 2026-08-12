---
name: welle-plan-granularisierer
description: Granularisierung des Welle-Plans auf Worker-Kapazität, plus die generelle Pflicht zu atomaren Arbeitsschritten.
---

# Welle-Plan-Granularisierer

## Wann das gilt

Direkt nach dem Aufbau des Welle-Plans (`welle-plan-guide`), sobald eine `topo_order`-Gruppe
mehr Subsysteme enthält, als parallel laufen dürfen. Auch beim Formulieren einzelner
Arbeitsschritte innerhalb einer Welle gilt dieselbe Granularitäts-Pflicht.

## Vorgehen

**Kapazität ist die harte Grenze, nicht die Abhängigkeit.** Der Welle-Plan-Guide liefert
Gruppen von Subsystemen mit gleichem `topo_order` — das sind alle Subsysteme, die
abhängigkeitstechnisch gleichzeitig gebaut werden könnten. Ob das tatsächlich passiert,
entscheidet allein `maxWorkers` (aus `getCfMaxWorkers`: 5 auf Niveau A, 2 auf Niveau B, 1 auf
Niveau C). Passt eine Gruppe nicht komplett in eine Welle, schneide sie in aufeinanderfolgende
Wellen derselben Größe (maximal `maxWorkers` Subsysteme pro Welle) — in der Reihenfolge, in der
die Subsystem-UIDs aus der Gruppe kommen. Eine Gruppe mit acht Subsystemen bei `maxWorkers = 5`
wird so zu zwei Wellen: fünf plus drei, nicht zu einer überbuchten Welle. Ist `maxWorkers < 1`,
wird 1 angenommen — es gibt immer mindestens einen Worker pro Welle.

**Granularitäts-Pflicht.** Dasselbe Prinzip gilt eine Ebene tiefer, für die Instruktionen, die
du einem einzelnen Worker sendest: Jede Aufgabe muss auf atomare Schritte heruntergebrochen
werden. Kein Schritt darf mehr als eine Entscheidung oder eine Zustandsänderung enthalten.
Zusammengesetzte Aktionen — "implementiere X und passe gleichzeitig Y an" — sind vor dem Senden
in Teilschritte zu zerlegen. Ein Worker, der zwei Entscheidungen in einem Schritt trifft, kann
bei einem Fehler nicht sauber zurückrudern.

**Zusammenspiel.** Die Wellen-Kapazitäts-Granularisierung schneidet auf Subsystem-Ebene (wie
viele Subsysteme parallel), die Schritt-Granularisierung schneidet auf Instruktions-Ebene (wie
viele Entscheidungen pro Sendung). Beide verhindern dieselbe Klasse Fehler: zu viel auf einmal,
zu wenig Rückrudermöglichkeit bei einem Bruch.

## Grenzen

Die Kapazitäts-Grenze ist strikt — du überbuchst eine Welle nie, auch nicht, wenn ein
Subsystem klein wirkt. Umgekehrt zerteilst du nicht willkürlich feiner als nötig: Eine Gruppe,
die in eine einzige Welle passt, bleibt eine Welle. Granularisierung ist Kapazitäts- und
Schritt-Zuschnitt — sie ist keine Abhängigkeits-Neubewertung; welche Subsysteme überhaupt in
derselben Gruppe stehen, entscheidet weiterhin ausschließlich `haengt_ab_von`.
