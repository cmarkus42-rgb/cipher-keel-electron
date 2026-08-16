# NanoClaw-Rückbau — Entwurf

**Stand:** 2026-08-17
**Zuschnitt:** Entfernen. Kein Ersatz, keine Umverdrahtung über Beschriftungen hinaus.
**Autorität:** M6-Nachtrag `nachtrag-nanoclaw-abloesung_2026-08-16.md`, Punkt 4
**Anlass:** Die StatusBar meldet dauerhaft `⚠ 2 Subsysteme degradiert: nanoclaw, voice`.

---

## 1. Warum das gebaut wird

NanoClaw war als Träger für Niveau B vorgesehen und ist am 2026-08-16 abgelöst worden — keel
baut sein Harness selbst. Der Laufzeitwert und ein Kommentar sind mit der Modell-Registry
bereits gegangen; der Rest steht noch.

**Der sichtbare Anlass ist die Statuszeile**, und sie ist nicht bloß kosmetisch falsch: Beim
Start ruft `service-lifecycle.ts` weiterhin `initNanoClaw()` auf, die Bridge sucht ihren Socket
unter `~/.config/cipher-mux/channels/`, findet ihn nicht und meldet `ENOENT`. Das System meldet
zuverlässig den Ausfall eines Subsystems, das es nicht mehr geben soll.

**Die Statuszeile stumm zu schalten wäre die falsche Reparatur.** Dann liefe der Aufbau weiter
und wir hätten die Anzeige eines echten Zustands unterdrückt — die Sorte Behebung, gegen die
dieses Projekt durchgehend arbeitet. Die Meldung verschwindet als **Folge** des Rückbaus.

## 2. Der Schnitt: drei Klassen, nicht eine

Der M6-Nachtrag trennt bereits reine Altlast von bloßer Umverdrahtung. Das Inventar am
Quelltext (2026-08-17, nach dem Merge von PR #19) bestätigt die Trennung und ergänzt eine
dritte Klasse.

### A — Reine Altlast, geht ersatzlos

| Ort | Was |
|---|---|
| `src/main/nanoclaw/` | `adapter.ts`, `bridge.ts`, `container-env.ts`, `index.ts`, `types.ts` |
| `tests/nanoclaw/` | `adapter`, `bridge`, `types`, `lifecycle-e2e`, `phase5-github-env` |
| `src/shared/ipc-channels.ts` | fünf Kanäle: `MESSAGE_INBOUND`, `MESSAGE_OUTBOUND`, `STATUS_CHANGED`, `CONNECT`, `DISCONNECT` |
| `src/main/service-lifecycle.ts` | `initNanoClaw()`, die Ereignis-Verdrahtung, der `disconnect()`-Pfad beim Herunterfahren |
| `src/shared/service-status.ts` | die Subsystem-Id `nanoclaw` in `SUBSYSTEM_IDS` |
| `src/renderer/components/StatusBar.tsx` | `NanoClawIndicator` samt `nanoClawStatus`-Prop |
| `src/main/main.ts` | `NanoClawBridge`-Import und das Feld im Dienste-Objekt |
| `src/main/window-manager.ts` | `nanoClawBridge` im `AppServices`-Typ |
| `src/main/ipc-handlers.ts` | Adapter-Registrierung und drei IPC-Handler |
| `docs/anpassbare-flaechen.md` | drei Inventar-Zeilen und der CK-NFR-013-Abschnitt |

### B — Bleibt, nur die Beschriftung ist falsch

| Ort | Was daran falsch ist |
|---|---|
| `src/shared/kanban-types.ts:38` | „Schenkel 1 = Claude Code, 2 = NanoClaw" — die Achse bleibt, der zweite Name nicht |
| `src/main/graph/phase-contract.ts:9` | nennt beide Schenkel namentlich |
| `src/main/preset/capabilities.ts:8` | verweist auf die `nanoclaw-skill`-Kanalroute |

### C — Bleibt ausdrücklich unangetastet

- **`LoaderType.NanoClawSkill`** in `capability-schema.ts`. Das ist der **Ladeweg für Niveau B**
  (M2 §6.4), nicht Altlast. Sein Träger wechselt, der Weg bleibt nötig. Nur der Kommentar
  daneben wird korrigiert. Zur Umbenennung siehe §4.
- **Die historischen Notizen** in `model-resolver.ts:10` und `c-worker.ts:10-11`. Die wurden in
  Tasks 7 und 9 **absichtlich** geschrieben, um die Ablösung festzuhalten. Sie zu entfernen
  hieße, den Grund zu löschen und die nächste Session dieselbe Frage neu stellen zu lassen.

## 3. Ein Fund, den der Rückbau freilegt

`src/main/graph/plausibility-inference.ts` beschreibt sich als *„local model assessment via
NanoClaw"* — hat aber **keinen einzigen Import**. Es nimmt ein `BridgeLike` entgegen:

```ts
interface BridgeLike {
  isConnected(): boolean
  sendMessage(msg: { content: string }): Promise<{ content: string } | null>
}
```

Also keine strukturelle Abhängigkeit, sondern eine ententypisierte Form — und die ist die des
abgelösten Kanals, nicht die der heutigen Modell-Schicht.

**Das ist die Plausibilitäts-Inferenz aus CK-PROC-006**, die inhaltliche Hälfte der Gates aus
M4. Ihr vorgesehener Läufer ist heute der Ein-Schuss-Worker samt Rückgabe-Vertrag, nicht eine
Kanal-Bridge. Sie hat zudem keinen Produktiv-Aufrufer.

**Der Rückbau bricht sie nicht** — mangels Import kann er das gar nicht. Er macht nur sichtbar,
dass sie auf eine Form wartet, die es nicht mehr gibt. **Die Umverdrahtung gehört nicht in
diesen Strang:** Sie ist eine Entwurfsfrage (welcher Läufer, welcher Vertrag, wer ruft auf),
keine Entfernung. Hier wird allein der Docblock ehrlich gemacht.

## 4. Was dieser Entwurf offen lässt

Zwei Entscheidungen, beide **nicht** blockierend für den Rückbau:

**Umbenennung von `LoaderType.NanoClawSkill`.** Der Wert `'nanoclaw-skill'` steht in
Capability-Deklarationen; ihn umzubenennen ist eine Datenmigration, kein Refactoring. Der Name
verweist auf etwas Abgelöstes, der Ladeweg bleibt aber gebraucht. Vorschlag zur späteren
Entscheidung: `HarnessSkill` mit dem Wert `'harness-skill'`, zusammen mit dem Harness-Bau, wo
der neue Träger ohnehin entsteht.

**Rewiring der Plausibilitäts-Inferenz** auf die Modell-Schicht (§3). Eigener Strang.

## 5. Test und Beleg

Bestehende Tests brechen absehbar an fünf Stellen — `service-lifecycle`, `service-status`,
`status-bar-degradation`, `renderer/phase5-statusbar`, `agent/adapter-niveau` und
`session/session-create-adapter-selection`. **Regel: Test anpassen, Wert nicht zurückholen.**
Wo der Gegenstand eines Tests *war* NanoClaw, fällt er weg und der Verlust wird im Testfile
vermerkt statt stillschweigend vollzogen — dasselbe Muster wie in Task 9 der Registry-Strecke.

**Der Beleg ist die Statuszeile in der laufenden App.** Sie muss danach genau ein degradiertes
Subsystem melden: `voice`. Nicht null — `voice` ist echt degradiert, und eine Anzeige, die auch
das verschluckt, wäre der zweite Fehler. Aufnahme in die laufende App, wörtlich, wie beim
Messprotokoll der Registry-Strecke.

## 6. Nicht dabei

- Kein Ersatz für den Kanal. Niveau B trägt das eigene Harness, und das ist ein anderer Strang.
- Keine Umbenennung von `LoaderType.NanoClawSkill` (§4).
- Keine Umverdrahtung der Plausibilitäts-Inferenz (§3).
- Keine Änderung an den historischen Notizen in `model-resolver.ts` und `c-worker.ts`.
- Kein Anfassen des `voice`-Subsystems, dessen Degradation echt ist.
