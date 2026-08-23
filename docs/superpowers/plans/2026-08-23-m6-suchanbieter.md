# M6 — SearXNG gegen Tavily. Messprotokoll

**Stand:** 2026-08-23 · **Modell:** `spark-qwen38-27b` · **Beide Arme am selben Tag**, dieselben
zehn Fragen, durch die laufende App.

Alles hier ist gemessen. Wo eine Zahl fehlt, steht das dabei.

---

## Der Aufbau, und warum beide Arme am selben Tag laufen mussten

Dieselben zehn Fragen wie in M12, fünfmal `kurz` und fünfmal `gruendlich`, je Frage ein Hauptlauf
mit dem einzigen Auftrag, `recherchieren` zu rufen. Umgestellt wird genau ein Feld
(`netz.bevorzugt`) über den Reiter „Netz".

Der Tavily-Arm aus Runde 5 (2026-08-22) lag vor und wäre billiger gewesen. Er ist trotzdem **nicht**
verwendet: der Suchindex, die Sperrlisten der Engines und die Erreichbarkeit fremder Seiten ändern
sich über Nacht. Bei einem Anbietervergleich ist genau das der Störfaktor, den man nicht haben
darf — sonst misst man den Tag und nennt es den Anbieter.

**Brave ist nicht dabei.** Die Speicherklausel §3(b)(i) der bezahlten Vertragsfassung ist ungelesen,
und keel schreibt Ergebnisse in Graph und Vault. Einen Anbieter zu fahren, dessen Bedingungen für
genau diesen Zweck niemand geprüft hat, ist dasselbe Muster wie eine fremde Sperre zu umgehen — nur
in die andere Richtung. Das ist eine Festlegung, kein Versäumnis.

---

## Das Ergebnis

| | SearXNG | Tavily |
|---|---|---|
| Ende `ziel-erreicht` | 8 von 10 | **9 von 10** |
| Läufe ohne eine Quelle | 1 von 10 | 1 von 10 |
| Seiten gelesen | 15 | **17** |
| Seitenabrufe hinausgegangen | 26 | 27 |
| davon HTTP-Sperre | **3** | 5 |
| davon nicht extrahierbar | 6 | **3** |
| davon Verbindungsfehler | 2 | **1** |

**Der Befund ist ein Gleichstand, und das ist die Aussage.** Ein Lauf Unterschied bei n = 10 ist
die Streuung eines einzelnen Laufs — dieselbe Größenordnung, in der `kurz` zwischen Runde 3 und
Runde 5 von 3:2 auf 2:3 kippte, ohne dass sich etwas geändert hatte. Was diese Messung **kann**,
ist einen großen Unterschied ausschließen; einen kleinen kann sie nicht auflösen, und dafür bräuchte
es ein Vielfaches an Fragen.

Damit ist der Nebenbefund aus M12 bestätigt: *die Trefferqualität war in keinem Lauf das Problem.*
Der Suchanbieter ist nicht der Engpass des Rechercheurs. Die verbleibenden Verluste liegen beim
**Inhalt** — HTTP-Sperren und nicht extrahierbare Seiten —, und die trifft beide Anbieter.

### Eine Vermutung, die sich nicht bestätigt hat

Erwartet war: SearXNG liefert rohe Webtreffer und zeigt deshalb häufiger auf Hosts, die den Abruf
mit HTTP 403 abweisen; Tavily ist für Agenten gebaut und schlägt lesbarere Seiten vor. **Gemessen
ist es andersherum** — Tavily hatte 5 HTTP-Sperren, SearXNG 3. Dafür hatte SearXNG doppelt so viele
nicht extrahierbare Seiten (6 gegen 3). Beide führten `github.com` als häufigstes Ziel (je 7), und
GitHub-Issues sind der Standardfall, an dem Readability scheitert.

### Was SearXNG zusätzlich liefert, und was es kostet

Die `engineLage` kommt wörtlich beim Modell an:

> *„Engines: geantwortet google cse (20), duckduckgo (2); geblockt: brave (too many requests),
> startpage (Suspended: CAPTCHA) — SearXNG sperrt eine geblockte Engine 3.600 s, bei CAPTCHA einen
> Tag, bei Cloudflare 15 Tage."*

Damit ist der Kommentar in `such-anbieter.ts` („`engineLage` ist kein Schmuck") belegt statt
behauptet: zwei der vier Engines waren an diesem Tag gesperrt, und ohne diese Zeile hätte das
Modell eine halbierte Trefferbasis für die ganze gehalten.

Das ist zugleich die **Zerbrechlichkeit**, die Tavily nicht hat: SearXNGs Ergebnis hängt daran,
dass Google CSE und DuckDuckGo weiter antworten. An diesem Tag trug Google CSE 20 von 22 Treffern.
Fällt es aus, fällt der Arm — und das sieht man erst an der `engineLage`.

*Nebenbei widerlegt:* der in `waehleAnbieter` zitierte ältere SearXNG-Test sagte „Google 0
Ergebnisse … nur DuckDuckGo lief". Die Hälfte hält (Brave und Startpage blockieren, unabhängig
nachgemessen), der Schluss nicht.

---

## Was daraus folgt

**Die Vorgabe bleibt vorerst Tavily** — nicht weil es gewonnen hätte, sondern weil ein Gleichstand
kein Grund ist, eine funktionierende Vorgabe zu drehen. Die Entscheidung ist damit **keine
Messfrage mehr, sondern eine Betriebsfrage**, und die Argumente stehen sich so gegenüber:

| für SearXNG | für Tavily |
|---|---|
| kostet nichts, kein Kontingent | keine eigene Instanz zu betreiben |
| kein Schlüssel, keine fremden Bedingungen | unabhängig von Engine-Sperren |
| Anfragen verlassen das eigene Netz nur zur Engine | an diesem Tag ein Lauf besser |

**Was diese Messung nicht sagt:** nichts über Kosten im Betrieb (Tavily-Credits gegen Strom und
Pflege der Instanz), nichts über andere Fragetypen als die zehn hier, und nichts über Brave.

---

## Zwei Befunde nebenbei — einer davon ein echter Defekt

**1. `WORKER_TIMEOUT_MS` band auf gesunder Maschine. Behoben.** Zwei Läufe dieser Messung endeten
`transportfehler` nach **exakt 120,0 s** — der Konstante. Einer hatte 71.045 Zeichen
Werkzeugausgabe im Verlauf, der andere 43; großer Kontext und langes Nachdenken laufen gegen
dieselbe Wand. Über alle 215 erfolgreichen Züge dieser Messtage: Median 8,4 s, p90 55,4 s,
p99 99,1 s, längster durchgekommener Zug **108,5 s**. Die Grenze lag also *innerhalb* der
Arbeitsverteilung, elf Sekunden über dem längsten Zug, der noch ankam. keels Schleife bekommt
jetzt ihr eigenes Budget (`SCHLEIFE_TIMEOUT_MS`, 300 s) statt des Budgets für den
Ein-Schuss-Worker — dieselbe Trennung, die `notes/note-tagging.ts` seit je macht.

*Die Übergabe hatte die Konstante bewusst stehen lassen, weil sich „auf einer viermal zu langsamen
Maschine die richtige Zahl nicht bestimmen lässt". Das war richtig — und mit einer gesunden
Maschine und 215 Zügen lässt sie sich bestimmen.*

**2. Der Fix ist verdrahtet, aber nicht im Feld provoziert.** Der Wächter fährt das echte `sende`
aus `rechercheurModell()` und wurde beim Entfernen der Zeile rot gesehen; dass der Klient
`req.timeoutMs` beachtet, steht in `ollama-client.ts:82`. **Der wiederholte Lauf 8 beweist den Fix
nicht** — sein längster Zug war 75,0 s und hätte auch die alte Grenze überlebt. Wer den Beweis im
Feld will, braucht einen Zug, der zwischen 120 und 300 s liegt; die Verteilung liefert ihn selten.

---

## Rohdaten

`$CLAUDE_JOB_DIR/tmp/m12/laeufe11` (SearXNG) und `laeufe12` (Tavily), Auswertung `m6.py`. Die zwei
verworfenen `transportfehler`-Läufe liegen unter `verworfen/` und sind nicht hineingerechnet — sie
sind der Beleg für Befund 1, nicht Messwerte über einen Anbieter.
