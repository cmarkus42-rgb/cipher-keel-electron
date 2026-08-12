---
name: niveau-c-formulierer
description: Architect-Outputs auf eine Niveau-C-taugliche Form reduzieren — Pflicht-Capability auf Niveau A und B.
---

# Niveau-C-Formulierer

## Wann das gilt

Immer, wenn du auf Niveau A oder B einen Output erzeugst, der ein optionales
Niveau-C-Extrakt-Feld trägt oder anderweitig auch von einer Niveau-C-Instanz gelesen werden
könnte — etwa `niveau_c_extrakt` im Anforderungspaket oder `tiefen.summary` im ADR. Diese
Capability ist Pflicht: Sie ist auf Niveau A und B immer geladen, nicht optional zuschaltbar,
weil praktisch jedes deiner Artefakte potenziell eine Niveau-C-Fassung braucht.

## Vorgehen

**Die drei Niveaus kennen.** cipher keel unterscheidet drei Bedienungsformen:

| Niveau | Bedienung | Entsprechung |
|--------|-----------|--------------|
| A | Voll-Harness (CLAUDE.md) | Vollständiges Tool-Set, nativer Lazy-Load |
| B | Harness-nativ | Manueller Lazy-Load, kein Bash |
| C | Instruktionsdatei | Inline-Capabilities, read-only |

Eine Niveau-C-Instanz hat kein natives Lazy-Loading, keinen Bash-Zugriff und kein automatisches
Tool-Listing. Was du für Niveau C formulierst, muss deshalb vollständig inline stehen — ein
Verweis auf eine andere Datei, die "bei Bedarf nachgeladen" wird, funktioniert dort nicht.

**Token-Budget respektieren.** Eine vollständige Niveau-C-Instruktionsdatei hat ein
Gesamtbudget von maximal 2000 Token. Einzelne Extrakt-Felder, die du in ein größeres
Niveau-A/B-Artefakt einbettest, haben ihr eigenes, engeres Budget — z. B. maximal 1000 Token
für den Niveau-C-Extrakt eines Anforderungspakets. Bei Zielkonflikt kürze zuerst Herleitung und
Begründung, nie das, was der Niveau-C-Nutzer zur Ausführung tatsächlich braucht
(Akzeptanzkriterium, Schnittstellen-Stempel).

**Klarstellungssatz voranstellen.** Jede eigenständige Niveau-C-Instruktionsdatei beginnt mit
einem Klarstellungssatz, der die Betriebsform benennt: dass Capabilities inline eingebettet
sind, kein externes SKILL.md-Loading und kein automatisches Tool-Listing stattfindet, und das
Token-Budget für die gesamte Datei bei 2000 Token liegt. Ein Extrakt ohne diesen Hinweis lässt
den Niveau-C-Leser im Unklaren darüber, warum ihm Fähigkeiten fehlen, die ein
Niveau-A-Kontext selbstverständlich hätte.

**Reduktionstechnik.** Entferne beim Herunterbrechen: Querverweise auf andere Capabilities,
mehrstufige Begründungsketten, alles, was ein Nachladen oder eine Rückfrage voraussetzt. Behalte:
die konkrete Handlungsanweisung, das Ergebnisformat, die Fehlerbehandlung. Ein Niveau-C-Extrakt
ist kein gekürztes Summary zur Orientierung — es ist die vollständige, in sich geschlossene
Anleitung für den einzigen Fall, den Niveau C überhaupt behandelt.

## Grenzen

Diese Capability reduziert Form und Umfang, nicht Inhalt. Ein Niveau-C-Extrakt darf keine
andere Entscheidung treffen als das Niveau-A-Original — er ist eine verdichtete Ansicht
desselben Sachverhalts, keine eigenständige, laxere Fassung. Erzeuge kein Extrakt-Feld für
Artefakte, die auf Niveau C ohnehin nicht existieren (ADRs, Coaching-Loop) — dort bleibt das
Feld leer beziehungsweise entfällt der Artefakttyp ganz.
