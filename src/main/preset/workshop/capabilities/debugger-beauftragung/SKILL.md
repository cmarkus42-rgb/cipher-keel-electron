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
den Eintrag; das `CapabilityPackage`-Objekt trägt entsprechend `niveauMinimum: 'A'`. Auf
Niveau B und C entfällt diese Capability vollständig — es gibt keinen Reference-Material- oder
sonstigen Ersatz-Modus dafür; die Datei ist dort schlicht nicht geladen
(`niveau-config.ts:49`).

Was der Workshop auf B und C stattdessen hat: Die Beauftragung selbst bleibt möglich, nur ohne
diese vertiefende Anleitung. `item-dispatch` (`routing.ts`) ist auf allen drei Niveaus geladen
und trägt bereits `ziel: 'debugger'` als Routing-Ziel ohne SE-Gate (`routing.ts:96-99`) — das
genügt, um den Debugger zu beauftragen. Die Grund-Anleitung dazu ("Klassifizieren", "Dispatch:
... darunter den Debugger für tiefe Einzelbug-Bearbeitung") steht außerdem in
`workshop-body.md` (Kernaufgaben 2–3), die niveau-unabhängig immer geladen ist. Beide Niveaus
bleiben voll orchestrierungsfähig — B erlaubt weiterhin Sub-Sessions und bis zu drei parallele
Worker (`allowSubSessions: true`, `maxParallel: 3`, `niveau-config.ts:90-98`), C ist der
Bedienhilfe-Modus mit nur einem sequentiellen Worker und ganz ohne Sub-Sessions
(`allowSubSessions: false`, `maxParallel: 1`, `niveau-config.ts:100-108`) — auch dort bleibt
eine Debugger-Beauftragung als einzelner, sequentieller Schritt möglich, nur eben ohne die
zusätzliche Führung dieser Datei.

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
