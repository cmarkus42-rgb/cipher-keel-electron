# M7 — folgt ein 27B dem Nachlade-Satz für Fähigkeiten? Messprotokoll

**Stand:** 2026-08-22 · **Modell:** `spark-qwen38-27b` (`keel-qwen38:27b` auf dem DGX Spark)
· **40 Läufe durch die laufende App**, nicht gegen eingespeiste Antworten.

Alles hier ist gemessen. Wo eine Zahl fehlt, steht das dabei.

---

## Warum das der wichtigste Messpunkt war

Der Präfix nennt je Fähigkeit nur **Name und Beschreibung**. Der Rumpf kommt ausschließlich über
`faehigkeit_lesen`, und die einzige Aufforderung dazu ist ein Satz in dessen Beschreibung:

> *„Liest den vollen Text einer Faehigkeit aus der Liste oben. Rufe es, bevor du eine benutzt."*

Ob ein Modell dieser Größenklasse das tut, war unbelegt — und **keels Niveau B ruht schon heute
auf derselben Annahme**. Wäre die Antwort nein gewesen, wäre nicht nur diese Welle betroffen.

## Der Aufbau

Eigene Wurzel `/tmp/keel-m7` mit zwei Fähigkeiten, damit die M12-Messungen unberührt bleiben — die
Fähigkeiten des Hauptlaufs landen über `rechercheur.ts:625` auch im Präfix jedes Unterlaufs.

| Fähigkeit | Was nur im Rumpf steht |
|---|---|
| `pruefbericht-form` | Drei feste Überschriften `## Befund` / `## Beleg` / `## Rest`, dazu eine Schlusszeile `PB-OK` oder `PB-OFFEN` |
| `ablage-kuerzel` | Pfad `ergebnisse/<KUERZEL>/<LFD>.md`; Kürzel = erste drei Konsonanten, laufende Nummer **ab 007** statt ab 001 |

Beide Aufgaben sind **ohne den Rumpf nicht lösbar**. Das ist der Kern des Aufbaus: eine Aufgabe,
die das Modell auch aus Vorwissen lösen könnte, würde Vorwissen messen statt Gehorsam. Wer nicht
liest, muss raten, und Raten ist an der Ausgabe zu sehen — ein generischer Prüfbericht hat keine
Zeile `PB-OFFEN`, und niemand rät eine laufende Nummer, die bei 007 beginnt.

**Gezählt wird zweierlei, und die Trennung ist der Punkt:**

- `skill.geladen` im Protokoll — *hat es gelesen?*
- die Ausgabe gegen die Hausregel — *hat es die Regel auch angewandt?*

Lesen ohne Anwenden wäre ein anderer Befund als gar nicht lesen, und beide zusammenzuwerfen hätte
den einen Fehler verdeckt, der tatsächlich auftrat.

**Zwei Sätze Läufe, nicht einer.** Die ersten zwanzig Aufträge enden auf *„Halte dich an die
Hausform / Hausregel dieses Projekts"* und zeigen damit auf die Fähigkeit. Das misst die leichtere
Frage. Die zweiten zwanzig lassen den Satz weg — erst sie messen, ob das Modell die
Fähigkeitenliste im Präfix **von sich aus** als einschlägig erkennt. Ohne diesen zweiten Satz wäre
„20 von 20" überdehnt gewesen: es hätte nach *„es liest immer"* geklungen, gemessen wäre aber nur
*„es liest, wenn man es hinschickt"*.

---

## Das Ergebnis

| | mit Zeigefinger (20) | **ohne Zeigefinger (20)** |
|---|---|---|
| `faehigkeit_lesen` gerufen | **20 von 20** | **20 von 20** |
| Regel korrekt angewandt | 19 von 20 | 19 von 20 |

**40 von 40 Läufen haben die Fähigkeit gelesen, bevor sie sie benutzt haben** — auch dann, wenn im
Auftrag nichts auf eine Hausregel hindeutete. Die Annahme, auf der keels Niveau B ruht, trägt für
dieses Modell.

Bemerkenswert ist, dass der Zeigefinger **nichts** ändert. Das Modell liest die Liste im Präfix,
erkennt einen einschlägigen Namen und holt den Rumpf, bevor es antwortet. Es rief die Fähigkeit
regelmäßig im selben Zug wie die Werkzeugschemata ab und schrieb das auch hin: *„Ich beginne damit,
die Hausform für Prüfberichte zu lesen und die Schemata der benötigten Werkzeuge abzurufen — beides
sind voneinander unabhängige Schritte."*

### Die zwei Fehlschläge sind derselbe Fehler, und es ist kein Regelfehler

Beide Male traf es `ablage-kuerzel`, beide Male stand die **Herleitung richtig da** und nur das
zusammengesetzte Kürzel war falsch:

```
Lauf 13:  „Erste drei Konsonanten von `Werkzeug` → W, r, k → WKR"
Lauf 37:  „Die ersten drei Konsonanten von „Werkzeug" sind W, r, k → WKZ"
```

Zweimal `W, r, k` korrekt bestimmt, zweimal beim Hinschreiben vertauscht beziehungsweise ein `z`
aus dem Wort mitgenommen. Der Prüfbericht, dessen Regel keine Buchstabenarithmetik verlangt, hatte
**0 Fehler in 20 Läufen**. Der Fehler sitzt also nicht beim Befolgen und nicht beim Verstehen,
sondern beim mechanischen Zusammensetzen einer kurzen Zeichenkette — genau die Klasse Fehler, für
die diese Größenklasse bekannt ist, und dieselbe wie bei den JSON-Typ-Tippfehlern aus M12.

**Was daraus für Fähigkeiten folgt:** eine Hausregel, die das Modell *rechnen* lässt, kostet
Zuverlässigkeit; eine, die ihm eine Form *vorgibt*, kostet keine. Wer eine Fähigkeit schreibt,
schreibt besser die Tabelle hin als die Rechenvorschrift.

---

## Was dieser Befund **nicht** sagt

Drei Einschränkungen, die zum Aufbau gehören und nicht kleingeredet werden sollen:

1. **Zwei Fähigkeiten, beide einschlägig.** Die Liste im Präfix hatte zwei Einträge, und zur
   jeweiligen Aufgabe passte genau einer. Damit ist *Auswahl* praktisch gratis. Ein Lauf mit zehn
   Fähigkeiten, von denen eine passt, würde etwas anderes messen — und diese Frage ist offen.
2. **Beide Aufgaben brauchten die Fähigkeit zwingend.** Das war Absicht, macht den Befund aber zu
   einer Aussage über den Fall „ohne Rumpf geht es nicht". Der Fall „ginge auch ohne, wäre mit aber
   besser" ist nicht gemessen.
3. **Ein Modell, ein Tag.** `spark-qwen38-27b` mit Denkstufe `medium`. Nichts hier überträgt sich
   ohne Messung auf ein anderes Niveau-C-Modell.

## Wie es gefahren wurde

`fahre-m7.mjs` im Job-Verzeichnis, vier Fälle à zehn Wiederholungen, Auswahl über einen Bereich
(`node fahre-m7.mjs m7 21-40`). Je Lauf werden `skill.geladen` und die Textblöcke der
Modellantworten abgelegt.

**Eine Falle des Messwerkzeugs, die beinahe teuer geworden wäre** und die den Rauchtest gerechtfertigt
hat: die erste Fassung zog den Antworttext als `JSON.stringify(nutzlast)` heraus. Darin wird ein
Zeilenumbruch zu den zwei Zeichen `\` und `n`, das `n` klebt an das folgende Wort, und die Prüfung
auf `\bPB-OFFEN` schlug fehl — obwohl das Modell die Regel tadellos angewandt hatte. Zwanzig Läufe
hätten „0 von 20 angewandt" ergeben, ein Befund, der ausschließlich die Auswertung gemessen hätte.
Die Blöcke werden jetzt einzeln herausgezogen. **Der Rauchtest, der das fand, kostete 30 Sekunden.**
