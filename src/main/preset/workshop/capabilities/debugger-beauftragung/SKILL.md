---
name: debugger-beauftragung
description: Debugger als phasen-interne Spezialinstanz beauftragen — kein verbotener Ketten-Handoff, sondern Orchestrierung wie bei einem Worker.
---

# Debugger Beauftragung

## Wann das gilt

Immer dann, wenn ein Item im Routing (`item-dispatch`) auf `ziel: 'debugger'` fällt — ein
klarer Bug mit Tiefenbedarf, den der Workshop nicht selbst in der Breite bearbeiten will,
sondern an die beauftragte Fixing-Spezialinstanz gibt (M5 §8.6).

Diese Datei selbst ist nur auf Niveau A geladen: `debugger-beauftragung` steht ausschließlich
in `CAPABILITIES_NIVEAU_A` (`niveau-config.ts:39-47`) — weder `CAPABILITIES_NIVEAU_B`
(`niveau-config.ts:50-57`) noch `CAPABILITIES_NIVEAU_C` (`niveau-config.ts:60-66`) enthalten
den Eintrag. Der Kommentar über `CAPABILITIES_NIVEAU_B` ("debugger-beauftragung als
reference-material, bleibt in Liste, Mode aendert sich", `niveau-config.ts:49`) beschreibt
einen Zustand, den das Array darunter nicht umsetzt — die Liste dort ist sechsgliedrig, ohne
diesen Eintrag. Das `CapabilityPackage`-Objekt trägt trotzdem `niveauMinimum: 'B'` als
Dokumentations-Metadatum, das genau diese — im Code nicht eingelöste — Absicht festhält;
nichts in `getNiveauWorkshopConfig` wertet `niveauMinimum` aus, die tatsächliche
Freischaltung läuft ausschließlich über die drei Arrays. Praktisch heißt das: Auf Niveau B
oder C ist diese Datei für eine Session schlicht nicht geladen — es gibt aktuell keinen
implementierten Reference-Material-Ersatz dafür. Das Debugger-Routing selbst
(`item-dispatch`, `routing.ts`) ist davon unberührt: `routeItem`/`createRoutingNode` kennen
kein Niveau-Argument, ein `ziel: 'debugger'` ist auf jedem Niveau möglich, auch ohne diese
Guide-Datei.

## Vorgehen

Die Beauftragung ist phasen-interne Orchestrierung, kein Ketten-Handoff (M5 §8.6): Der
Workshop steuert den Debugger wie einen seiner Worker, nicht wie eine nachgelagerte Phase. Der
Datenweg bleibt graph-vermittelt — der Debugger liest den Bug-Kontext aus dem Graphen und
schreibt Fix und Walkthrough dorthin zurück; seine eigene Worker-Sub-Session orchestriert er
selbständig, der Workshop mischt sich dort nicht ein. Dokumentiere die Beauftragung als
Routing-Entscheidung (`item-dispatch`, `ziel: 'debugger'`) — das genügt, ein zusätzliches
SE-Gate ist für `intern`/`debugger` nicht vorgesehen (`routing.ts:96-99`).

## Grenzen

Kein Verteiler für viele Bugs zugleich — das bleibt bei `item-dispatch`/dem Workshop selbst.
Kein adversariales Testing (Testing Assistant) und keine neuen Features (Cyber Factory). Und
der Workshop übernimmt die Tiefen-Analyse des Bugs nicht selbst — dafür beauftragt er gerade
den Debugger.
