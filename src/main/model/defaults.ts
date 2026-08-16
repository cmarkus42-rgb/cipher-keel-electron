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
    id: 'openrouter-qwen3-coder', name: 'Qwen3 Coder (OpenRouter)', art: 'api',
    erreichbarkeit: {
      art: 'api', baseUrl: 'https://openrouter.ai/api/v1', model: 'qwen/qwen3-coder', keyRef: 'openrouter',
    },
    oertlichkeit: 'fremdes-netz',
    erklaertext: 'Ein OSS-Flaggschiff ueber einen fremden Hoster. Der Prompt verlaesst das eigene Netz.',
    empfehlung: 'Wenn die eigene Maschine belegt ist — ein Anbieter haelt Niveau C am Leben.',
    faehigkeiten: { codec: 'openai-chat', werkzeugmodus: 'nativ', nutzbaresKontextfenster: 131072 },
  },
].map(normaliseEintrag)
