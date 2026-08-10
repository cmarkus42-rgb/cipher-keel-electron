---
name: adversarial-probing
description: Edge Cases und Schwachstellen systematisch suchen, über das hinaus, was die bestehende Suite abdeckt.
---

# Adversarial Probing

## Wann das gilt

Nach der Testqualitäts-Beurteilung, bevor du deine Findings konsolidierst. Die bestehende Suite
zeigt dir, was das Team für prüfenswert hielt — Adversarial Probing sucht gezielt nach dem, was
sie nicht abdeckt.

## Vorgehen

**Sieben Edge-Case-Klassen, systematisch durchgegangen.** Portiert aus dem Cyber-Factory-Pack
(`09-testing-assistant.md`, Phase 3), geschärft für den funktionalen Prüf-Auftrag der Rolle:

- Leere Inputs (leerer String, leeres Array, `null`/`undefined` wo ein Wert erwartet wird)
- Sehr große Inputs (ein Vielfaches der typischen Größe)
- Unicode, Emoji, RTL-Text — insbesondere überall dort, wo Strings in Dateipfade, IDs oder
  Datenbank-Queries einfließen
- Race Conditions (zwei gleichzeitige Zugriffe auf denselben Zustand)
- Boundary Conditions (0, -1, Maximalwerte, Off-by-one an Grenzen)
- Fehlender oder abgelaufener Zugriffsnachweis, wo einer erwartet wird
- Umgehungsversuche an Stellen, die offen zugänglich sind, aber eine Prüfung voraussetzen sollten

Nicht jede Klasse passt auf jede Welle — wäge ab, welche für den geprüften Code überhaupt
zutreffen, und dokumentiere auch, welche du bewusst als nicht anwendbar übersprungen hast.

**Schwachstellen als Stichprobe, nicht als vollständiges Audit.** Der Zweck aus M5 §8.4 nennt
"Schwachstellen suchen" ausdrücklich als Teil deines Auftrags — als Stichprobe innerhalb dieses
Probings, nicht als eigene Phase. Konkrete, mit vertretbarem Aufwand prüfbare Muster: fest
codierte Geheimnisse im Code (Passwort- oder Token-artige String-Literale), fehlende Absicherung
an offen erreichbaren Schnittstellen, ungeprüft übernommene Eingaben, die in eine Datenbank-Query
oder einen Dateipfad eingehen. Ein vollständiges Sicherheits-Audit bleibt der Audit-Phase
vorbehalten — deine Stichprobe ersetzt sie nicht.

**Bugs mit Reproduktion melden.** Findest du beim Probing ein Fehlverhalten, hältst du fest, wie
es reproduzierbar ist — die konkreten Schritte oder Eingaben, nicht nur die Beobachtung. Ohne
Reproduktion ist ein Finding für den Workshop kaum verwertbar.

## Grenzen

Adversarial Probing ist eine Stichprobe, keine erschöpfende Suche — du musst nicht jede
denkbare Eingabe durchprobieren, sondern die Klassen, die für den geprüften Code plausibel sind.
Und du fixt auch hier nichts: Ein gefundener Bug wird gemeldet, nicht behoben, und ein
fehlendes Auth-Check wird dokumentiert, nicht selbst eingebaut.
