/**
 * defaults — the entries that ship with the app.
 *
 * Deliberately short. Every entry here is reachable from this machine or from the DGX
 * Spark, plus one representative per API vendor family. An entry nobody has ever reached
 * would be a guess wearing the clothes of a default.
 *
 * Capability rows are `vermutet` throughout: no canary job exists yet (M8 section 7 line 12).
 *
 * **2026-08-24: eight more `api` entries joined, all through OpenRouter.** That relaxes "one
 * representative per API vendor family" on purpose, not by drift — all eight go through the
 * one provider integration this file already has, not eight new ones, and Christian asked for
 * a curated set of the strongest open coding models plus the Chinese flagships, checked against
 * the real catalog rather than built from memory (every slug verified against
 * `https://openrouter.ai/api/v1/models` on 2026-08-24 — see the block comment above that group
 * for the shared assumptions and `docs/superpowers/specs/2026-08-23-befund-tier-platz-kennt-das-cli-nicht.md`
 * for why none of them ever becomes a `cli-harness` entry).
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

  // ---------------------------------------------------------------------------------------
  // OpenRouter — kuratierte Auswahl, 2026-08-24. Acht Eintraege ueber denselben schon
  // integrierten Anbieter wie 'openrouter-qwen3-coder' oben, kein neuer Adapter und keine neue
  // Paarungsfalle: sie gehen an eigene-schleife- und ein-schuss-Plaetze (Laeufer-Werte, siehe
  // model/eignung.ts), nie an einen CLI-Platz
  // (docs/superpowers/specs/2026-08-23-befund-tier-platz-kennt-das-cli-nicht.md,
  // Abschnitt "Was daran nicht wartet"). Jeder Slug wurde am 2026-08-24 gegen
  // https://openrouter.ai/api/v1/models geprueft, nicht aus dem Gedaechtnis gebaut.
  //
  // Gemeinsame Annahmen, einmal hier statt acht Mal wiederholt:
  // - codec: 'openai-chat' — OpenRouter spricht die OpenAI-kompatible Flaeche.
  // - quelle: 'vermutet', gemessenAm: null, gemessenMit: null fuer alle acht. Keines wurde
  //   gemessen — 'gemessen' ist das Wort des Kanarienauftrags (M8 Abschnitt 7 Zeile 12), und in
  //   dieser Codebasis sind schon vier Behauptungen aufgeflogen, die eine Messung vortaeuschten.
  // - werkzeugmodus: 'nativ' ist eine ANNAHME, keine Messung — keines der acht wurde mit
  //   Werkzeugaufrufen ueber OpenRouter getestet. Stuende hier 'text', wiese
  //   `pruefeStartbedingungen` (harness/lauf.ts) jeden Lauf ueber die eigene Schleife benannt ab
  //   ("nicht gebaut") — die Annahme ist also folgenreich, nicht kosmetisch.
  // - nutzbaresKontextfenster ist die HAELFTE von `top_provider.context_length`, NICHT von
  //   `context_length` — die beiden Felder unterscheiden sich in der API-Antwort haeufig:
  //   `context_length` ist das Maximum ueber alle Anbieter hinter dem Modell, `top_provider.
  //   context_length` ist das Fenster, das ein Request beim tatsaechlich gewaehlten Anbieter
  //   bekommt. Erste Fassung dieses Kommentars halbierte `context_length` und lag damit bei
  //   `openrouter-qwen38-27b` beim knapp Doppelten des servierten Fensters (500.000 statt 131.072
  //   — die Haelfte von `top_provider.context_length` 262.144) und bei `openrouter-minimax-m3`
  //   ohne jeden Sicherheitsabstand (524.288 traf `top_provider.context_length` exakt statt es zu
  //   halbieren). Dieselbe Vorsicht wie beim bestehenden OpenRouter-Eintrag oben (131072 von
  //   deklarierten 262144, dort ist `context_length` und `top_provider.context_length` gleich)
  //   und bei spark-qwen38-27b (dort aus einem gemessenen Grund, hier nicht gemessen, sondern
  //   vorsorglich): das volle Fenster ist eine Herstellerangabe, kein Betriebswert. Zwei
  //   Verbraucher rechnen mit der Zahl, die hier steht: `pruefeBudgets` (harness/budget.ts) — ein
  //   zu hoher Wert liesse das Kontextbudget erst brechen, wenn der Server selbst schon kappt —
  //   und `weiterOderFrisch` (harness/fortsetzbarkeit.ts), das mit derselben Zahl entscheidet, ob
  //   ein Folgeauftrag noch in denselben Lauf darf oder einen neuen Lauf braucht.
  // - Preise: siehe harness/preise.ts, VORGABE_PREISE — alle acht haben dort einen Eintrag,
  //   sonst rechnete das Kostenbudget mit einer stillen Null.
  // ---------------------------------------------------------------------------------------
  {
    id: 'openrouter-qwen3-coder-plus', name: 'Qwen3 Coder Plus (OpenRouter)', art: 'api',
    erreichbarkeit: {
      art: 'api', baseUrl: 'https://openrouter.ai/api/v1', model: 'qwen/qwen3-coder-plus', keyRef: 'openrouter',
    },
    oertlichkeit: 'fremdes-netz',
    erklaertext: 'Alibabas groesseres Coding-Flaggschiff, 1.000.000 Token deklariertes Kontextfenster, ueber OpenRouter.',
    empfehlung: 'Fuer grosse Coding-Auftraege, wenn spark-qwen38-27b nicht reicht oder belegt ist.',
    faehigkeiten: {
      codec: 'openai-chat', werkzeugmodus: 'nativ',
      nutzbaresKontextfenster: 500000, // Haelfte von top_provider.context_length 1.000.000.
      quelle: 'vermutet', gemessenAm: null, gemessenMit: null,
    },
  },
  {
    id: 'openrouter-kimi-k27-code', name: 'Kimi K2.7 Code (OpenRouter)', art: 'api',
    erreichbarkeit: {
      art: 'api', baseUrl: 'https://openrouter.ai/api/v1', model: 'moonshotai/kimi-k2.7-code', keyRef: 'openrouter',
    },
    oertlichkeit: 'fremdes-netz',
    erklaertext:
      'Moonshots Coding-Modell ueber OpenRouter — nicht ueber das lokal installierte Kimi-CLI ' +
      '(ein eigener CLI-Harness dafuer ist bewusst nicht gebaut, siehe der Befund im '
      + 'Blockkommentar oben).',
    empfehlung: 'Zweite Wahl neben Qwen3 Coder Plus fuer Coding-Auftraege ueber einen Anbieter.',
    faehigkeiten: {
      codec: 'openai-chat', werkzeugmodus: 'nativ',
      nutzbaresKontextfenster: 131072, // Haelfte von top_provider.context_length 262.144.
      quelle: 'vermutet', gemessenAm: null, gemessenMit: null,
    },
  },
  {
    id: 'openrouter-codestral-2508', name: 'Codestral 2508 (OpenRouter)', art: 'api',
    erreichbarkeit: {
      art: 'api', baseUrl: 'https://openrouter.ai/api/v1', model: 'mistralai/codestral-2508', keyRef: 'openrouter',
    },
    oertlichkeit: 'fremdes-netz',
    erklaertext: 'Mistrals Coding-Modell, europaeischer Anbieter hinter OpenRouter.',
    empfehlung: 'Fuer Coding-Auftraege, wenn eine europaeische Herkunft des Anbieters gewuenscht ist.',
    faehigkeiten: {
      codec: 'openai-chat', werkzeugmodus: 'nativ',
      nutzbaresKontextfenster: 128000, // Haelfte von top_provider.context_length 256.000.
      quelle: 'vermutet', gemessenAm: null, gemessenMit: null,
    },
  },
  {
    id: 'openrouter-deepseek-v4-pro', name: 'DeepSeek V4 Pro (OpenRouter)', art: 'api',
    erreichbarkeit: {
      art: 'api', baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-v4-pro', keyRef: 'openrouter',
    },
    oertlichkeit: 'fremdes-netz',
    erklaertext: 'DeepSeeks aktuelles Flaggschiff, ueber OpenRouter.',
    empfehlung: 'China-Flaggschiff-Option fuer grosse Auftraege ueber einen Anbieter.',
    faehigkeiten: {
      codec: 'openai-chat', werkzeugmodus: 'nativ',
      // Haelfte von top_provider.context_length 1.024.000 — NICHT von context_length
      // 1.048.576, dem Maximum ueber alle Anbieter. Die beiden weichen bei diesem Modell
      // voneinander ab (siehe der Sammelkommentar oben).
      nutzbaresKontextfenster: 512000,
      quelle: 'vermutet', gemessenAm: null, gemessenMit: null,
    },
  },
  {
    id: 'openrouter-glm-53', name: 'GLM 5.3 (OpenRouter)', art: 'api',
    erreichbarkeit: {
      art: 'api', baseUrl: 'https://openrouter.ai/api/v1', model: 'z-ai/glm-5.3', keyRef: 'openrouter',
    },
    oertlichkeit: 'fremdes-netz',
    erklaertext: 'Z.ais (Zhipu) aktuelles Flaggschiff, ueber OpenRouter.',
    empfehlung: 'Zweite China-Flaggschiff-Option neben DeepSeek V4 Pro.',
    faehigkeiten: {
      codec: 'openai-chat', werkzeugmodus: 'nativ',
      nutzbaresKontextfenster: 524288, // Haelfte von top_provider.context_length 1.048.576.
      quelle: 'vermutet', gemessenAm: null, gemessenMit: null,
    },
  },
  {
    id: 'openrouter-minimax-m3', name: 'MiniMax M3 (OpenRouter)', art: 'api',
    erreichbarkeit: {
      art: 'api', baseUrl: 'https://openrouter.ai/api/v1', model: 'minimax/minimax-m3', keyRef: 'openrouter',
    },
    oertlichkeit: 'fremdes-netz',
    erklaertext: 'MiniMaxs aktuelles Flaggschiff, ueber OpenRouter — von den drei China-Flaggschiffen hier das guenstigste.',
    empfehlung: 'Dritte China-Flaggschiff-Option, wenn Kosten staerker zaehlen als bei den beiden anderen.',
    faehigkeiten: {
      codec: 'openai-chat', werkzeugmodus: 'nativ',
      // Haelfte von top_provider.context_length 524.288 — NICHT von context_length 1.048.576.
      // Review-Fund: eine erste Fassung halbierte context_length und traf damit
      // top_provider.context_length exakt, ohne jeden Sicherheitsabstand.
      nutzbaresKontextfenster: 262144,
      quelle: 'vermutet', gemessenAm: null, gemessenMit: null,
    },
  },
  {
    id: 'openrouter-qwen38-27b', name: 'Qwen3.8 27B (OpenRouter)', art: 'api',
    erreichbarkeit: {
      art: 'api', baseUrl: 'https://openrouter.ai/api/v1', model: 'qwen/qwen3.8-27b', keyRef: 'openrouter',
    },
    oertlichkeit: 'fremdes-netz',
    erklaertext:
      'Dasselbe Modell wie spark-qwen38-27b, hier ueber OpenRouter statt den eigenen Spark — '
      + 'klein genug fuer Alltagsarbeit, aber ohne die Messungen, die der Spark-Eintrag traegt.',
    empfehlung: 'Rueckfall fuer Niveau C, wenn der Spark belegt oder nicht erreichbar ist.',
    faehigkeiten: {
      codec: 'openai-chat', werkzeugmodus: 'nativ',
      // Haelfte von top_provider.context_length 262.144 — NICHT von context_length 1.000.000,
      // dem Maximum ueber alle Anbieter. Review-Fund: eine erste Fassung halbierte
      // context_length und lag damit beim knapp Doppelten des tatsaechlich servierten
      // Fensters (500.000 statt 131.072) — mit kontextAnteil 0.8 haette pruefeBudgets erst bei
      // 400.000 Token gefeuert, waehrend der Anbieter selbst schon bei 262.144 kappt: ein
      // Lauf haette so ins stille Abschneiden statt in den benannten Abschluss laufen koennen.
      nutzbaresKontextfenster: 131072,
      quelle: 'vermutet', gemessenAm: null, gemessenMit: null,
    },
  },
  {
    id: 'openrouter-gpt-oss-120b', name: 'GPT-OSS 120B (OpenRouter)', art: 'api',
    erreichbarkeit: {
      art: 'api', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-oss-120b', keyRef: 'openrouter',
    },
    oertlichkeit: 'fremdes-netz',
    erklaertext:
      'Dasselbe offene Modell wie spark-gpt-oss-120b, hier ueber OpenRouter — sehr billig, ohne '
      + 'den Spark zu belegen.',
    empfehlung: 'Billigster Rueckfall, wenn weder der Mac noch der Spark ein passendes Modell frei haben.',
    faehigkeiten: {
      codec: 'openai-chat', werkzeugmodus: 'nativ',
      nutzbaresKontextfenster: 65536, // Haelfte von top_provider.context_length 131.072.
      quelle: 'vermutet', gemessenAm: null, gemessenMit: null,
    },
  },
].map(normaliseEintrag)
