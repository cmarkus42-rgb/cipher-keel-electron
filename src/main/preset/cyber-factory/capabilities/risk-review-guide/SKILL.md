---
name: risk-review-guide
description: Risk-Review-Gate nach jeder Bau-Welle — Risiko-Klassifikation als gate_befund-Knoten, nur auf Niveau A.
---

# Risk-Review-Guide

## Wann das gilt

Nach jeder abgeschlossenen Bau-Welle, bevor du die nächste Welle startest. Risk-Reviews sind
eine Niveau-A-Capability — auf Niveau B und C entfällt dieser Schritt.

## Vorgehen

**Ein `gate_befund`-Knoten pro Risiko.** Für jedes identifizierte Risiko legst du einen
`gate_befund`-Knoten mit `gate_typ: 'risk-review'` an. Sechs Angaben gehören dazu:

- `phase_uid` — die Phase, zu der die Welle gehört (Pflichtfeld)
- `risiko` — knappe Beschreibung des Risikos
- `wahrscheinlichkeit` — eine von `hoch` | `mittel` | `niedrig`
- `impact` — eine von `hoch` | `mittel` | `niedrig`
- `massnahme` — die vorgesehene Gegenmaßnahme
- `befund_statement` — die zusammenfassende Aussage des Befunds

`phase_uid`, `strukturell` und `gate_typ` sind die drei Pflichtfelder des `gate_befund`-Knotens
selbst; fehlt eines, weist der Graph den Knoten beim Anlegen zurück. `strukturell` wird für
Risk-Reviews fest auf `'gruen'` gesetzt — dieses Signal beschreibt, dass die Welle strukturell
vollständig abgeschlossen ist, nicht die Schwere des gefundenen Risikos. Die Risiko-Schwere
selbst steckt ausschließlich in `wahrscheinlichkeit` und `impact`.

**200-Token-Grenze für `befund_statement`.** Das `befund_statement` darf geschätzt nicht mehr
als 200 Token umfassen (Schätzung: Zeichenlänge / 4, aufgerundet). Überschreitest du das Limit,
lehnt die Erstellung ab, bevor überhaupt geschrieben wird — fasse dich kürzer, statt das Limit
zu umgehen.

**Mehrere Risiken, mehrere Knoten.** Enthält eine Welle mehrere unabhängige Risiken, legst du
für jedes einen eigenen `gate_befund`-Knoten an, statt sie in einem Statement zu bündeln — sonst
lässt sich später keines gezielt über die Query `risk_reviews` (alle `gate_befund`-Knoten mit
`gate_typ: 'risk-review'`, neueste zuerst) nachvollziehen.

## Grenzen

Ein Risk-Review ist eine Risiko-Einschätzung, kein Architektur- oder Bugfixing-Befund. Findest
du beim Review, dass die Ursache eines Risikos in der Modularisierung selbst liegt, ist das ein
Fall für das Rückweg-Protokoll (`gate_typ: 'architektur-bruch'`), nicht für einen weiteren
Risk-Review-Knoten mit `strukturell: 'gruen'`.
