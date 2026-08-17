# autoTag — Konfigurationsfehler laut scheitern lassen

**Stand:** 2026-08-17
**Zuschnitt:** Fehlerbehandlung in einer Funktion. Keine Oberfläche, kein neues Verhalten beim Erfolgsfall.
**Anlass:** Messprotokoll der Modell-Registry-Strecke, Belege 3 und 4.

---

## 1. Der Befund

`NoteTagging.autoTag()` fängt **jeden** Fehler und liefert still `null`:

```ts
} catch {
  // Ollama not available — graceful degradation (CK-NOTES-002, CK-NFR-010)
  return null
}
```

Beim Messlauf der Registry-Strecke ergaben zwei grundverschiedene Ursachen dieselbe Ausgabe:

| Ursache | Ergebnis |
|---|---|
| Der DGX Spark ist nicht erreichbar (GPU belegt, Timeout) | `null` |
| Die Rolle `tagging` zeigt auf einen `cli-harness`-Eintrag — strukturell verboten | `null` |

Von außen sehen ein ausgefallener Dienst und ein Konfigurationsfehler des Nutzers **gleich
aus**. Der zweite Fall halbierte zwei der vier Belege jener Strecke.

## 2. Die Anforderung sagt das Gegenteil dessen, wofür sie zitiert wird

Der Kommentar beruft sich auf CK-NFR-010. Deren Wortlaut steht in
`src/shared/service-status.ts`:

> *„Graceful degradation must be visible. A subsystem that failed to initialize must be
> distinguishable from a subsystem that is simply empty."*

Die Anforderung verlangt also **Sichtbarkeit** und ausdrücklich die **Unterscheidbarkeit von
Ausfall und Leere**. Genau diese Unterscheidung hebt der Catch-Block auf. Er zitiert die
Anforderung als Rechtfertigung für das, was sie verbietet.

**Damit ist die Frage vor dem Code beantwortet:** Es braucht keine neue Anforderung. Die
vorhandene deckt die Unterscheidung bereits, sie wurde nur falsch gelesen.

## 3. Was bleibt und was sich ändert

**Das stille Degradieren bei Transportfehlern bleibt richtig.** Eine Notiz soll nicht
scheitern, weil gerade kein Modell läuft. CK-NOTES-002 trägt das, und der Fall ist häufig und
harmlos.

**Konfigurationsfehler sind kein Degradationsfall.** Sie gehören dem Nutzer: Er hat eine
Zuordnung gesetzt, die die Struktur-Matrix sperrt. Diese Fehlerklasse gab es nicht, als der
Catch-Block geschrieben wurde — sie entstand mit der Modell-Registry.

| Klasse | Beispiele | Verhalten |
|---|---|---|
| **Transport** | Daemon nicht erreichbar, Timeout, HTTP ≠ 200, Modell nicht installiert | still `null`, wie bisher |
| **Konfiguration** | `cli-harness`-Eintrag auf einer Rolle, unbekannte Anbieterart, fehlende `baseUrl` oder `keyRef`, unauflösbarer Eintrag | **propagiert** |

## 4. Wie ein Konfigurationsfehler sichtbar wird

**Er wird nicht in ein Ergebnis gefaltet, sondern weitergereicht.** `autoTag` fängt ihn nicht
mehr; der IPC-Handler gibt seine Meldung zurück, wie er es für andere Handler bereits tut.

Der Grund für diese Form statt eines erweiterten Rückgabewerts: Ein Konfigurationsfehler ist
kein Tagging-Ergebnis. Ihn als Feld neben den Tags zu führen hieße, jeden Aufrufer zu
verpflichten, danach zu sehen — und wer es vergisst, hat wieder das stille Schlucken, nur eine
Ebene höher.

**Was diese Strecke ausdrücklich nicht leistet:** eine Anzeige dafür. Der Messlauf hat
festgestellt, dass es **keinen Klickpfad in der Oberfläche gibt, der eine Notiz anlegt und das
Tagging auslöst**. Solange der fehlt, kann keine Fehlermeldung einen Nutzer erreichen, egal wie
laut sie ist. Diese Strecke stellt die Unterscheidung her; sie sichtbar zu machen, ist Sache
der Notizen-Oberfläche.

Das ehrlich zu benennen ist Teil des Ergebnisses. Ein „jetzt scheitert es laut", das in einer
Oberfläche endet, die niemand erreicht, wäre die dritte Variante desselben Fehlers.

## 5. Wie die beiden Klassen auseinandergehalten werden

Nicht an der Fehlermeldung — Zeichenketten zu prüfen ist genau die Sorte Kopplung, die beim
nächsten Umformulieren bricht.

Die Konfigurationsfehler entstehen alle an **einer** Stelle: bei der Auflösung von Rolle zu
Endpunkt, also in `endpointForRole` und dem, was es aufruft (`toModelEndpoint`,
`normaliseEndpoint`). Die Transportfehler entstehen **danach**, im Client.

Der Schnitt ist damit **zeitlich und nicht semantisch**: Was beim Auflösen wirft, ist
Konfiguration; was beim Senden wirft, ist Transport. Das ist im Code als zwei getrennte
`try`-Bereiche ausdrückbar, ohne eine einzige Fehlermeldung zu lesen.

## 6. Test und Beleg

- Ein Transportfehler ergibt weiterhin `null` — der bestehende Test dafür bleibt unverändert.
- Ein Konfigurationsfehler propagiert und trägt die Meldung aus `toModelEndpoint`.
- Der glückliche Pfad ändert sich nicht.
- **Beleg in der laufenden App:** dieselbe Zuordnung wie in Beleg 4 der Registry-Strecke
  (`rollen.tagging` auf `claude-opus-cli`), und diesmal muss der Fehler benennbar sein statt
  in einem `null` zu verschwinden.

## 7. Nicht dabei

- Keine Notizen-Oberfläche und kein Klickpfad zum Tagging.
- Keine Änderung am Erfolgsfall oder an `parseTagResponse` samt seiner nachsichtigen
  Auswertung — die ist für Tags richtig und ausdrücklich so entschieden.
- Keine Änderung am Timeout-Wert.
- Keine neue Anforderung. CK-NFR-010 trägt die Unterscheidung bereits.
