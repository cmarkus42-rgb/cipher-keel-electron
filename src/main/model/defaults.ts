/**
 * defaults — the entries that ship with the app.
 *
 * Deliberately short. Every entry here is reachable from this machine or from the DGX
 * Spark, plus one representative per API vendor family. An entry nobody has ever reached
 * would be a guess wearing the clothes of a default.
 *
 * Capability rows are `vermutet` throughout: no canary job exists yet (M8 section 7 line 12).
 */

import { normaliseEintrag, type ModellEintrag } from './entry'

const SPARK_HOST = '100.78.7.108'

export const DEFAULT_EINTRAEGE: ModellEintrag[] = [
  {
    id: 'claude-opus-cli', name: 'Claude Opus (Claude Code)', art: 'cli-harness',
    erreichbarkeit: { art: 'cli-harness', cli: 'claude', handle: 'opus' },
    oertlichkeit: 'fremdes-netz',
    erklaertext: 'Laeuft im mitgelieferten Harness von Claude Code und nutzt das Abo-Kontingent statt API-Kosten.',
    empfehlung: 'Fuer Niveau A dort, wo Fehler sich vervielfachen — Ideation, Requirements, Systems Engineer.',
  },
  {
    id: 'claude-sonnet-cli', name: 'Claude Sonnet (Claude Code)', art: 'cli-harness',
    erreichbarkeit: { art: 'cli-harness', cli: 'claude', handle: 'sonnet' },
    oertlichkeit: 'fremdes-netz',
    erklaertext: 'Der Alltagsweg im Abo-Kontingent.',
    empfehlung: 'Voreinstellung fuer Cyber Factory und Workshop.',
  },
  {
    id: 'claude-haiku-cli', name: 'Claude Haiku (Claude Code)', art: 'cli-harness',
    erreichbarkeit: { art: 'cli-harness', cli: 'claude', handle: 'haiku' },
    oertlichkeit: 'fremdes-netz',
    erklaertext: 'Der billigste Weg im Abo-Kontingent.',
    empfehlung: 'Fuer mechanische Arbeit, wenn kein lokales Modell bereitsteht.',
  },
  {
    id: 'mac-qwen3-30b', name: 'Qwen3 30B A3B (Mac Mini)', art: 'local-http',
    erreichbarkeit: { art: 'local-http', host: '127.0.0.1', port: 11434, model: 'qwen3:30b-a3b-instruct-2507-q4_K_M' },
    oertlichkeit: 'lokal',
    erklaertext: 'Laeuft auf dem Arbeitsplatz selbst. Nichts verlaesst die Maschine.',
    empfehlung: 'Fuer Notizen-Tagging und kleine C-Auftraege ohne Wartezeit auf einen zweiten Rechner.',
    faehigkeiten: { codec: 'ollama-native', werkzeugmodus: 'text', nutzbaresKontextfenster: 32768 },
  },
  {
    id: 'spark-gemma4-26b', name: 'Gemma4 26B (DGX Spark)', art: 'local-http',
    erreichbarkeit: { art: 'local-http', host: SPARK_HOST, port: 11434, model: 'gemma4:26b' },
    oertlichkeit: 'eigenes-netz',
    erklaertext: 'Laeuft auf dem DGX Spark ueber Tailscale, 128 GB Unified Memory. Ueber LAN geschlossen.',
    empfehlung: 'Voreinstellung fuer Niveau-C-Auftraege — die Maschine mit dem Speicher fuer ein ernsthaftes Modell.',
    faehigkeiten: { codec: 'ollama-native', werkzeugmodus: 'text', nutzbaresKontextfenster: 65536 },
  },
  {
    id: 'spark-gpt-oss-120b', name: 'GPT-OSS 120B (DGX Spark)', art: 'local-http',
    erreichbarkeit: { art: 'local-http', host: SPARK_HOST, port: 11434, model: 'gpt-oss:120b' },
    oertlichkeit: 'eigenes-netz',
    erklaertext: 'Das groesste lokal verfuegbare Modell. Braucht den Spark und dessen GPU ungeteilt.',
    empfehlung: 'Fuer Arbeit, die lokal bleiben muss und mehr verlangt als ein 26B.',
    faehigkeiten: { codec: 'ollama-native', werkzeugmodus: 'text', nutzbaresKontextfenster: 131072 },
  },
  {
    id: 'spark-qwen38-27b', name: 'Qwen3.8 27B (DGX Spark)', art: 'local-http',
    erreichbarkeit: { art: 'local-http', host: SPARK_HOST, port: 11434, model: 'keel-qwen38:27b' },
    oertlichkeit: 'eigenes-netz',
    erklaertext:
      'Laeuft auf dem DGX Spark ueber Tailscale, 128 GB Unified Memory. Abgeleitetes Tag: '
      + 'Kontext und die drei Sampler, die Ollamas /v1-Flaeche nicht durchreicht, stehen im '
      + 'Modelfile auf dem Server.',
    empfehlung:
      'Voreinstellung fuer Niveau C, sobald es Werkzeuge braucht — das erste lokale Modell in '
      + 'dieser Registry, das die eigene Schleife fahren kann.',
    faehigkeiten: {
      codec: 'openai-chat',
      // Pflicht: pruefeStartbedingungen wirft bei 'text' *vor* codecFuer. Genau daran koennen die
      // drei aelteren lokalen Eintraege die Schleife bis heute nicht fahren.
      werkzeugmodus: 'nativ',
      // Gemessen 2026-08-21: zwei tool_calls mit index 0 und 1, finish_reason 'tool_calls'.
      paralleleAufrufe: true,
      // Das Modell denkt (unabschaltbar ausser mit reasoningEffort 'none'), aber dieser Transport
      // traegt keinen Denkblock zurueck in die Historie: keels fromWire liest `message.reasoning`
      // heute nicht. Das Feld beschreibt den Transport, nicht das Modell.
      denkbloecke: false,
      // Ollamas /v1 zerlegt eine multimodale Nachricht in mehrere interne Nachrichten; der
      // Bildpfad ist dort strukturell beschaedigt. Vision kann das Modell, dieser Weg nicht.
      bilder: false,
      // Pflicht, kein Ermessen: der Codec emittiert fuer ein Dokument {type:'file'}, und Ollamas
      // /v1 kennt nur text, image_url und input_audio. Bei true stuerbe jeder Lauf mit Anhang mit
      // einem HTTP 400 statt mit dem verstaendlichen CodecKannNicht.
      dokumente: false,
      aufgeschobenesLaden: true,
      werkzeugObergrenze: 12,
      // **Haengt am Modelfile.** Ollama teilt das deklarierte num_ctx auf parallele Plaetze auf:
      // gemessen 2026-08-21 lieferte `num_ctx 65536` genau 32.770 nutzbare Token, und der Prompt
      // wurde vorne *still* abgeschnitten. Das Modelfile steht deshalb auf 131072, damit hier
      // 65536 stimmt. Laufen die beiden Zahlen auseinander, feuert keels Kontextbudget nie und
      // der Server kappt lautlos — der teuerste stille Fehler dieser Welle.
      nutzbaresKontextfenster: 65536,
      vertragsStrenge: { schemaTiefe: 2, reparaturversuche: 1 },
      rundenbudget: 12,
      sampler: {
        // Der Thinking-Satz der Model Card. Ollamas /v1 setzt temperature und top_p zwangsweise
        // auf 1.0, wenn der Client sie weglaesst — Weglassen waere also keine Enthaltung.
        temperature: 1.0,
        topP: 0.95,
        presencePenalty: 0,
        // Nie unter 2048: bei hohem Denkaufwand schneidet ein kleineres Budget ab, *bevor* die
        // Denkspur endet, und der Klient sieht dann gar keinen Inhalt, nur finish_reason 'length'.
        maxTokens: 8192,
        // Gemessen: medium liefert die laengste Antwort (1.290 Zeichen in 37 s), xhigh die
        // kuerzeste in 106 s. Siehe DENKSTUFEN in model/entry.ts.
        reasoningEffort: 'medium',
      },
      gemessenAm: null,
      gemessenMit: null,
      // Bleibt 'vermutet', bis es einen Kanarienauftrag gibt — auch die hier gemessenen Zahlen
      // sind von Hand gemessen, nicht vom Kanarienauftrag. 'gemessen' ist dessen Wort.
      quelle: 'vermutet',
    },
  },
  {
    id: 'openrouter-qwen3-coder', name: 'Qwen3 Coder (OpenRouter)', art: 'api',
    erreichbarkeit: {
      art: 'api', baseUrl: 'https://openrouter.ai/api/v1', model: 'qwen/qwen3-coder', keyRef: 'openrouter',
    },
    oertlichkeit: 'fremdes-netz',
    erklaertext: 'Ein OSS-Flaggschiff ueber einen fremden Hoster — erreichbar ueber OpenRouter mit eigenem Schluessel.',
    empfehlung: 'Wenn die eigene Maschine belegt ist — ein Anbieter haelt Niveau C am Leben.',
    faehigkeiten: { codec: 'openai-chat', werkzeugmodus: 'nativ', nutzbaresKontextfenster: 131072 },
  },
].map(normaliseEintrag)
