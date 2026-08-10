---
name: model-routing-guide
description: Model-Routing für Worker-Spawning — welcher Model-Tier pro Subsystem-Komplexität, nur auf Niveau A aktiv.
---

# Model-Routing-Guide

## Wann das gilt

Beim Starten jedes Workers, direkt vor `create_session` im Startup-Protokoll — die Model-Wahl
steht bevor die Session existiert.

## Vorgehen

**Nur auf Niveau A aktiv.** Model-Routing ist eine Niveau-A-Capability. Läufst du auf Niveau B
oder C, entfällt die Unterscheidung vollständig: jeder Worker bekommt den `standard`-Tier, ohne
Ausnahme.

**Auf Niveau A: drei Komplexitätsstufen, drei Tiers.** Schätze pro Subsystem eine von drei
Komplexitätsstufen ein und route entsprechend:

| Subsystem-Komplexität | Model-Tier |
|---|---|
| `trivial` | `light` |
| `business_logic` | `standard` |
| `architecture` | `heavy` |

Eine unbekannte oder nicht erkannte Komplexitätsstufe fällt auf `standard` zurück — es gibt
keinen vierten, unentschiedenen Zustand.

**Wo die Einschätzung herkommt.** Die Komplexitätsstufe ist keine Kennzahl aus dem Graph,
sondern deine Einschätzung anhand des Anforderungspakets und des zugehörigen Subsystems: Ein
reines CRUD- oder Config-Subsystem ist `trivial`, ein Subsystem mit fachlicher Logik und
mehreren Zuständen ist `business_logic`, ein Subsystem mit strukturellen Weichenstellungen (z. B.
neue Schnittstellen-Muster, Cross-Cutting-Konzerne) ist `architecture`.

## Grenzen

Model-Routing ist reine Ressourcen-Zuteilung für das Worker-Spawning — sie ist keine
Architektur-Bewertung. Stufst du ein Subsystem als `architecture`-komplex ein, heißt das nur
"schwereres Model für diesen Worker", nicht "hier gehört eine Architektur-Entscheidung
getroffen" — das bleibt in jedem Fall Architect-Territorium.
