# Übergabe nach der Adapter- und MCP-Strecke

**Stand:** 2026-08-24, 00:35 · **`main` bei `fc083f2`**, mit `origin/main` synchron ·
**2783 Tests** in 205 Dateien, typecheck und lint grün · Arbeitsbaum sauber, kein offener Zweig.

Vorgänger: `2026-08-23-handover-nach-niveau-c.md`. Diese Datei sagt zuerst, was sich am Gesamtbild
geändert hat, dann was offen ist.

---

## 1. Das Gefälle funktioniert jetzt — beobachtet, nicht behauptet

Die Übergabe von gestern endete mit dem Satz: *„Genau ein Schritt trennt „Motor läuft" von
„Gefälle funktioniert", und das ist der nächste substanzielle Bau."* Der Schritt ist getan.

**Eine Niveau-B-Zelle ist eine Gitterzelle wie jede andere.** Sie hat einen Modellplatz in den
Einstellungen, einen Lebenszyklus, einen Auftragskanal und einen Ereignisstrom.
`RUNTIMES_WITHOUT_ADAPTER` ist leer.

Belegt wurde das **in der laufenden App**, mit echten Klicks: Kachel → Auswahl → Zelle zeigt
Modell und „bereit" → Auftrag → Ereignisse laufen live ein → „bereit — zuletzt: fertig". Dazu
fünf aufeinanderfolgende echte Aufträge gegen den DGX Spark in **dieselbe** Zelle, die beiden
erzwungenen Absagen und das Einfrieren des Modells. Protokoll:
`2026-08-23-keel-harness-adapter-protokoll.md`.

**Was dabei eine Planannahme widerlegt hat:** der Entwurf behauptete, das 27B falle „mit knappem
Fenster" nach einem echten Lauf immer auf einen frischen Lauf. Sein Fenster ist 65 536, die
Schwelle 39 322, gemessen wurden 1,7–1,8k je Zug. Alle fünf Aufträge liefen deshalb in denselben
Lauf. **Der Mechanismus ist damit bestätigt, nicht widerlegt** — er hat gemessen entschieden, und
die Messung fiel anders aus als die Annahme. Falsch war die Illustration, nicht die Regel.

---

## 2. Was seither dazukam

**Drei MCP-Werkzeuge fürs Beauftragen von oben** — `keel_zellen`, `keel_zelle_beauftragen`,
`keel_zelle_ergebnis`. Die Auftragslogik liegt in `session/schleifen-auftrag.ts`: eine Fassung,
zwei Aufrufer, kein zweites Rennen.

**Acht OpenRouter-Einträge** statt einem: Coding (`qwen3-coder-plus`, `kimi-k2.7-code`,
`codestral-2508`), China-Flaggschiffe (`deepseek-v4-pro`, `glm-5.3`, `minimax-m3`, `qwen3.8-27b`),
dazu `gpt-oss-120b`. Alle Slugs gegen den Katalog geprüft, alle Fähigkeitszeilen `quelle:
'vermutet'`.

---

## 3. Der wichtigste offene Punkt: die MCP-Fläche hat keinen Aufrufer

**Die drei neuen Werkzeuge sind heute nicht erreichbar — und die sieben `graph_*`-Werkzeuge waren
es nie.** Beim Bauen gefunden:

- `handleRequest` hat keinen Produktionsaufrufer
- `startStdioServer` wird nirgends gerufen, kein `bin`-Eintrag
- **`ClaudeCodeAdapter.postLaunchInjection` hat keinen Aufrufer** — die Registrierung des
  MCP-Servers bei einer neuen Sitzung läuft also nie

Das ist die vierte Instanz des Fehlers, den dieses Repo als seine erste Regel führt, und diese
ist älter als beide Strecken. Sie ist im Kopf von `mcp-server.ts` und in
`docs/anpassbare-flaechen.md` **benannt** statt geerbt.

**Was fehlt:** eine HTTP-Fläche für `ctx.mcpUrl` mit Bearer-Auth, und ein Aufruf von
`postLaunchInjection` beim Sitzungsstart. Das ist ein eigenes Vorhaben mit eigener
Sicherheitsfläche — bewusst nicht nachts entschieden.

**Und es hängt mehr daran als der Transport:** `keel_zelle_beauftragen` kann **jede** Zelle
adressieren, `keel_zelle_ergebnis` **jeden** Lauf der Protokolldatenbank auslesen. Wer die
HTTP-Fläche baut, entscheidet zugleich über Scoping.

---

## 4. Zwei benannte Befunde, bewusst nicht gebaut

**Kimi als CLI-Harness** (`specs/2026-08-23-befund-tier-platz-kennt-das-cli-nicht.md`). Kimi Code
ist installiert (`/opt/homebrew/bin/kimi`, `@moonshot-ai/kimi-code@0.38.0`, Modellschalter
`-m/--model`, Alias-Format `<provider>/<modell>`, hier über OpenRouter mit Vorgabe
`openrouter/moonshotai/kimi-k3`).

Der Eintrag wäre ein Einzeiler und wurde **nicht** gemacht: das Feld `cli` eines Registry-Eintrags
wird beim Start **nirgends gelesen**. Welches Binary läuft, entscheidet allein der Adapter aus
`rahmen.runtime`. Ein Kimi-Eintrag wäre deshalb für **jeden** Tier-Platz wählbar, und
`tier:heavy` damit belegt startete `claude --model openrouter/moonshotai/kimi-k3`. Das scheitert
laut — falsch ist trotzdem das Angebot davor. Der Befund skizziert drei Wege, keiner ist
offensichtlich richtig; das gehört entschieden, nicht geraten.

**Eine TOCTOU-Lücke im Frisch-Zweig** (im Beweisprotokoll, eigener Abschnitt). `pruefeZelleFrei`
läuft vor mehreren `await`s, der Zellenzustand kippt erst später — zwei gleichzeitige Aufträge
passieren die Prüfung beide. Der Folgeauftrags-Zweig fängt es ab, der Frisch-Zweig nicht.
**Reiner Lesebefund ohne Feldbeleg**; die Beobachtung, mit der er zunächst begründet wurde, hatte
eine andere Ursache (siehe unten).

---

## 5. Drei Dinge über das Arbeiten, die weitergelten

**1. Die Zusagen, die eine Aufgabe der nächsten macht, prüft kein Aufgaben-Review.** Der
Abschluss-Review fand **elf** veraltete Präsens-Zusagen: eine frühe Aufgabe schreibt „kommt in
einer späteren Aufgabe", eine spätere Aufgabe **desselben Zweigs** baut es, die Ankündigung bleibt
stehen. *Jede war zum Zeitpunkt ihres Reviews wahr.* In der MCP-Strecke kam eine zwölfte dazu —
ausgerechnet im Kommentar, der die Transportlücke benennt. Vor jedem Merge gehört eine Schlussrunde
über die eigenen Terminzusagen, und die Suche allein reicht nicht: zwei Treffer lagen über
Zeilenumbrüche verteilt, einer enthielt kein einziges Suchwort.

**2. Eine plausible Regel kann am falschen Feld ansetzen.** Das nutzbare Kontextfenster wurde aus
`context_length` halbiert — richtig gedacht (Herstellerangabe ist kein Betriebswert), aber das ist
das Maximum über alle Anbieter. Was wirklich kommt, steht in `top_provider.context_length`. Bei
sechs von acht Modellen fällt das nicht auf; bei einem war der Wert fast **doppelt** so groß wie
das servierte Fenster. Die Budgetprüfung hätte bei 400 000 gefeuert, während der Anbieter bei
262 144 kappt: stilles Abschneiden statt benanntem Abschluss.

**3. Eine plausible Ursache ist keine Ursache.** Ein unerklärter Lauf in der Datenbank bekam
**drei** Erklärungen: eine Wettlauf-These (Implementierer), eine TOCTOU-These (Reviewer) — und
dann die Wahrheit: **Christian hatte parallel selbst eine Zelle bedient.** Beide Vermutungen waren
plausibel und beide falsch. „Herkunft ungeklärt" war die richtige Antwort, solange es niemand
wusste.

---

## 6. Kleinkram mit Datum

- **Die Läufer-Wache** (`tests/model/eignung-einzige-quelle.test.ts`) hat an einem Tag **viermal**
  jemanden erwischt, der *über* sie schreiben wollte — sie liest rohen Dateitext, Kommentare
  eingeschlossen. Zweimal war die Reparatur ein Gewinn (benannte Konstanten statt Literale), zweimal
  eine Umformulierung. Kein Fehler, aber ein Reibungspunkt, den man kennen sollte.
- **Ein Hintergrund-Agent und der Koordinator teilen das Arbeitsverzeichnis.** Der Kimi-Befund
  landete auf dem Feature-Zweig statt auf `main`, weil der Agent schon umgeschaltet hatte. Harmlos
  (er reiste beim Merge mit), aber beim nächsten Mal vorher `git branch --show-current` prüfen.
- **Der Merge-Commit `fc083f2` hat drei Lücken:** Backticks in der Nachricht wurden von der Shell
  als Befehlssubstitution ausgeführt. Es fehlen `context_length`, `top_provider.context_length` und
  `cli`. Der Inhalt steht vollständig im Code und in den Befunden; die Historie wurde nicht
  umgeschrieben.
- **`spark-qwen38-27b` trägt weiter `quelle: 'vermutet'`** — auch das gemessene Kontextverhalten
  macht es nicht zu `'gemessen'`. Das ist das Wort des Kanarienauftrags.
- **Aufgeschobene Kleinigkeiten** stehen im Arbeitsprotokoll der Strecke; der Abschluss-Review hat
  sie triagiert, keine blockiert.

## 7. Unverändert offen aus der Vorgängerübergabe

GPU-Reload-Probe noch nicht gefallen (Container seit 2026-08-22, 0 Reloads) · Little-Snitch-Regel
nach einem `npm ci` weiter ungeprüft · unsigniert und nicht notarisiert · Leerlauf-RAM und
Kaltstart unvermessen · Codex- und Gemini-Adapter · Niveau C.
