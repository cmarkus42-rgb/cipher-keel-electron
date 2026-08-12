---
name: adr-format-guide
description: Format und Tiefe-Stufen für Architecture Decision Records — Kontext, Optionen, Entscheidung, Konsequenzen.
---

# ADR-Format-Guide

## Wann das gilt

Immer, wenn du während der Zerlegung eine nicht-triviale Architektur-Entscheidung triffst —
etwa die Wahl zwischen zwei plausiblen Schnitten, einer bestimmten Schnittstellen-Form oder
einer Abhängigkeitsrichtung zwischen Subsystemen. Triviale, alternativlose Entscheidungen
brauchen kein ADR.

## Vorgehen

**Vier Pflichtteile, in dieser Reihenfolge.**

1. **Kontext** — welche Ausgangslage, welches Spannungsfeld hat die Entscheidung nötig gemacht
2. **Optionen** — welche Alternativen standen zur Wahl, kurz benannt
3. **Entscheidung** — welche Option gewählt wurde, in einem Satz
4. **Konsequenzen** — was aus der Entscheidung folgt, auch die unbequemen Nebenwirkungen

Lege für jedes ADR einen `adr`-Knoten mit den Feldern `title`, `context`, `options`,
`decision`, `consequences` und `version` an. ADRs sind versioniert — eine Revision erhöht die
`version` und ersetzt die vorherige, statt sie zu löschen.

**Tiefe je Niveau — vier vorgerechnete Renderings, nicht ein Text, der zur Laufzeit gekürzt
wird.** Jedes ADR trägt zusätzlich ein `tiefen`-Objekt mit den Schlüsseln `summary`, `context`,
`alternatives` und `consequences` — je eine vorformulierte, in sich abgeschlossene Fassung des
ADRs auf unterschiedlicher Detailstufe. Welche Fassung ein Leser bekommt, hängt vom Niveau ab.
Diese Zuordnung ist Orientierung, keine im Code erzwungene Regel — sie verbindet
`architect-body.md`s Niveau-Hinweise mit dem `tiefen`-Objekt, ist aber selbst nirgends so
festgeschrieben:

- **Niveau A**: volles ADR — alle vier Pflichtteile ungekürzt
- **Niveau B**: Kurzform — `tiefen.summary` oder `tiefen.context`, nicht das volle ADR
- **Niveau C**: keine ADRs. Niveau C kennt nur den Schnittstellen-Stempel-Modus; ADRs entfallen
  vollständig (siehe `architect-core-identity`)

Wer ein bestehendes ADR abruft, tut das über die `adr_by_tiefe`-Query mit den Parametern
`adr_uid` (Pflicht — ohne sie lehnt die Query ab) und `tiefe` (optional, `summary` | `context` |
`full`, Default `summary`), statt den vollen Frontmatter-Blob zu lesen und selbst zu kürzen —
die Kürzung ist bereits im Knoten hinterlegt, nicht dein Job zur Lesezeit.

**Nicht jede Entscheidung verdient ein ADR.** Wäge ab: Trifft die Entscheidung eine
Subsystem-Grenze, eine Schnittstellen-Form oder eine Abhängigkeitsrichtung — ja. Ist es eine
Detailfrage ohne Alternative, die niemand ernsthaft anders entscheiden würde — nein.

## Grenzen

Ein ADR hält eine getroffene Entscheidung fest, es rechtfertigt sie nicht nachträglich mit
erfundenen Optionen. Nenne nur Optionen, die tatsächlich erwogen wurden. Schreibe kein ADR für
Bau-Entscheidungen (Bibliothekswahl innerhalb eines Subsystems, Implementierungsdetails) — die
liegen bei der Cyber Factory, nicht bei dir.
