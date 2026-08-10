---
name: anforderungspaket-formulierer
description: Granulare Anforderungspakete pro Subsystem formulieren, aus bestehenden Anforderungen — inklusive Niveau-C-Extrakt.
---

# Anforderungspaket-Formulierer

## Wann das gilt

Nachdem die Subsystem-Zerlegung steht und jedes Subsystem seinen Schnittstellen-Vertrag hat.
Ein Anforderungspaket ist der Übergabepunkt an die Cyber Factory — es ist das, was ein Worker
tatsächlich in die Hand bekommt, um ein Subsystem zu bauen.

## Vorgehen

**Ein Paket pro Subsystem, nicht ein Paket pro Anforderung.** Das Mapping von Anforderungen auf
Subsysteme ist 1:n — eine einzelne Anforderung kann mehrere Subsysteme betreffen, ein
Subsystem bündelt in der Regel mehrere Anforderungen. Du hältst dieses Mapping und schnürst
daraus je Subsystem genau ein `anforderungspaket`.

**Pflichtfelder.** Jedes Paket trägt:

- `subsystem` — welches Subsystem das Paket bedient
- `req_ids` — die Liste der Anforderungs-IDs, die dieses Subsystem abdeckt
- `code_anker` — Ansatzpunkte im Code, an denen gebaut wird
- `akzeptanzkriterium` — woran der Worker erkennt, dass das Subsystem fertig ist
- `testcase_verweis` — Verweis auf die zugehörigen Testfälle

Diese Felder kommen aus bereits vorhandenen Anforderungen und deren Akzeptanzkriterien — du
liest sie zusammen und ordnest sie dem Subsystem zu, du erfindest sie nicht neu.

**Granularität.** Ein Paket muss so eng geschnitten sein, dass ein Worker es ohne Rückfrage zum
Systems Engineer bauen kann. Ist das Paket so breit, dass es mehrere unabhängig testbare
Verhaltensweisen bündelt, gehört es wahrscheinlich zu mehr als einem Subsystem — das ist ein
Signal, die Zerlegung noch einmal zu prüfen, nicht das Paket künstlich zusammenzuhalten.

**Niveau-C-Extrakt.** Für Pakete, die auch auf Niveau C gelesen werden, füllst du zusätzlich
das optionale Feld `niveau_c_extrakt` — eine verdichtete Fassung des Pakets mit **maximal 1000
Token**. Diese Fassung enthält nur das, was ein Bedienhilfe-Nutzer ohne Rückgriff auf das volle
Paket braucht: die Kernanforderung, das Akzeptanzkriterium, keine Herleitung. Wird das
Token-Budget überschritten, kürze zuerst die Herleitung, nie das Akzeptanzkriterium.

## Grenzen

Du formulierst Pakete aus bestehenden, bereits geschärften Anforderungen — du schärfst sie
nicht selbst nach. Tauchen beim Bündeln Widersprüche oder Lücken in den Anforderungen auf, ist
das ein Befund für den Systems Engineer, kein Auftrag, die Anforderung hier zu korrigieren oder
zu ergänzen. Ebenso legst du im Paket keine Implementierungsentscheidungen fest — `code_anker`
zeigt, wo gebaut wird, nicht wie.
