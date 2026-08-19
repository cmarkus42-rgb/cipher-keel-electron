import { describe, it, expect } from 'vitest'
import { normaliseEintrag, toModelEndpoint } from '../../src/main/model/entry'

const CLI = {
  id: 'claude-opus', name: 'Claude Opus (CLI)', art: 'cli-harness',
  erreichbarkeit: { art: 'cli-harness', cli: 'claude', handle: 'opus' },
  oertlichkeit: 'fremdes-netz', erklaertext: 'Abo-Kontingent statt API-Kosten.',
  empfehlung: 'Fuer Niveau A ueber den CLI-Weg.',
}

const LOCAL = {
  id: 'spark-gemma', name: 'Gemma4 26B (Spark)', art: 'local-http',
  erreichbarkeit: { art: 'local-http', host: '100.78.7.108', port: 11434, model: 'gemma4:26b' },
  oertlichkeit: 'eigenes-netz', erklaertext: 'Laeuft auf dem Spark.', empfehlung: 'Fuer Niveau C.',
}

describe('normaliseEintrag', () => {
  it('accepts a cli-harness entry without capabilities', () => {
    const e = normaliseEintrag(CLI)
    expect(e.id).toBe('claude-opus')
    expect(e.faehigkeiten).toBeUndefined()
  })

  it('names the missing field when id is absent', () => {
    expect(() => normaliseEintrag({ ...CLI, id: '' }))
      .toThrow('Eintrag ohne id')
  })

  it('rejects an art the code does not know', () => {
    expect(() => normaliseEintrag({ ...CLI, art: 'telepathie' }))
      .toThrow("Unbekannte Anbieterart 'telepathie'")
  })

  it('rejects an erreichbarkeit that contradicts the art', () => {
    expect(() => normaliseEintrag({ ...CLI, art: 'api' }))
      .toThrow("Eintrag 'claude-opus': art ist 'api', erreichbarkeit ist 'cli-harness'")
  })

  it('defaults an unmeasured capability row to vermutet', () => {
    const e = normaliseEintrag({
      id: 'spark-gemma', name: 'Gemma4 26B (Spark)', art: 'local-http',
      erreichbarkeit: { art: 'local-http', host: '100.78.7.108', port: 11434, model: 'gemma4:26b' },
      oertlichkeit: 'eigenes-netz', erklaertext: 'Laeuft auf dem Spark.', empfehlung: 'Fuer Niveau C.',
      faehigkeiten: { codec: 'ollama-native', werkzeugmodus: 'text' },
    })
    expect(e.faehigkeiten?.quelle).toBe('vermutet')
    expect(e.faehigkeiten?.gemessenAm).toBeNull()
    expect(e.faehigkeiten?.gemessenMit).toBeNull()
  })

  it('rejects a cli-harness entry that carries faehigkeiten', () => {
    expect(() => normaliseEintrag({
      ...CLI, faehigkeiten: { codec: 'anthropic', werkzeugmodus: 'nativ' },
    })).toThrow('cli-harness kennt keine faehigkeiten')
  })

  it('accepts a gemessen row with both measurement fields set', () => {
    const e = normaliseEintrag({
      ...LOCAL,
      faehigkeiten: {
        codec: 'ollama-native', werkzeugmodus: 'text', quelle: 'gemessen',
        gemessenAm: '2026-08-01', gemessenMit: 'canary-v1',
      },
    })
    expect(e.faehigkeiten?.quelle).toBe('gemessen')
    expect(e.faehigkeiten?.gemessenAm).toBe('2026-08-01')
    expect(e.faehigkeiten?.gemessenMit).toBe('canary-v1')
  })

  it('rejects gemessen without gemessenAm and gemessenMit', () => {
    expect(() => normaliseEintrag({
      ...LOCAL,
      faehigkeiten: { codec: 'ollama-native', werkzeugmodus: 'text', quelle: 'gemessen' },
    })).toThrow("quelle ist 'gemessen', aber gemessenAm oder gemessenMit fehlt")
  })

  it('rejects vermutet carrying measurement data', () => {
    expect(() => normaliseEintrag({
      ...LOCAL,
      faehigkeiten: {
        codec: 'ollama-native', werkzeugmodus: 'text', quelle: 'vermutet',
        gemessenAm: '2026-08-01', gemessenMit: 'canary-v1',
      },
    })).toThrow("quelle ist 'vermutet', darf dann aber keine Messdaten tragen")
  })

  it('rejects an unknown quelle', () => {
    expect(() => normaliseEintrag({
      ...LOCAL,
      faehigkeiten: { codec: 'ollama-native', werkzeugmodus: 'text', quelle: 'geraten' },
    })).toThrow("unbekannte quelle 'geraten'")
  })

  // Fund 2 (Review-Runde 1): the three numeric fields went unchecked. NaN is the dangerous
  // case -- every comparison against NaN is false, so a budget/context check built on it goes
  // silently inert rather than failing loudly.
  describe('numerische Faehigkeiten-Felder', () => {
    it('rejects NaN in nutzbaresKontextfenster', () => {
      expect(() => normaliseEintrag({
        ...LOCAL,
        faehigkeiten: { codec: 'ollama-native', werkzeugmodus: 'text', nutzbaresKontextfenster: NaN },
      })).toThrow("faehigkeiten.nutzbaresKontextfenster muss eine ganze Zahl groesser als 0 sein")
    })

    it('rejects a rundenbudget of 0', () => {
      expect(() => normaliseEintrag({
        ...LOCAL,
        faehigkeiten: { codec: 'ollama-native', werkzeugmodus: 'text', rundenbudget: 0 },
      })).toThrow("faehigkeiten.rundenbudget muss eine ganze Zahl groesser als 0 sein")
    })

    it('rejects a negative werkzeugObergrenze', () => {
      expect(() => normaliseEintrag({
        ...LOCAL,
        faehigkeiten: { codec: 'ollama-native', werkzeugmodus: 'text', werkzeugObergrenze: -3 },
      })).toThrow('faehigkeiten.werkzeugObergrenze')
    })

    it('rejects a non-integer rundenbudget', () => {
      expect(() => normaliseEintrag({
        ...LOCAL,
        faehigkeiten: { codec: 'ollama-native', werkzeugmodus: 'text', rundenbudget: 3.5 },
      })).toThrow('faehigkeiten.rundenbudget')
    })

    it('rejects a non-numeric nutzbaresKontextfenster', () => {
      expect(() => normaliseEintrag({
        ...LOCAL,
        faehigkeiten: { codec: 'ollama-native', werkzeugmodus: 'text', nutzbaresKontextfenster: '8192' },
      })).toThrow('faehigkeiten.nutzbaresKontextfenster')
    })

    it('accepts positive integers for all three fields', () => {
      const e = normaliseEintrag({
        ...LOCAL,
        faehigkeiten: {
          codec: 'ollama-native', werkzeugmodus: 'text',
          nutzbaresKontextfenster: 4096, werkzeugObergrenze: 6, rundenbudget: 20,
        },
      })
      expect(e.faehigkeiten?.nutzbaresKontextfenster).toBe(4096)
      expect(e.faehigkeiten?.werkzeugObergrenze).toBe(6)
      expect(e.faehigkeiten?.rundenbudget).toBe(20)
    })
  })
})

describe('toModelEndpoint', () => {
  it('translates a local-http reachability into an Ollama endpoint', () => {
    const ep = toModelEndpoint({ art: 'local-http', host: '100.78.7.108', port: 11434, model: 'gemma4:26b' })
    expect(ep.kind).toBe('ollama')
    if (ep.kind === 'ollama') expect(ep.host).toBe('100.78.7.108')
  })

  it('translates an api reachability into an openai-compatible endpoint', () => {
    const ep = toModelEndpoint({
      art: 'api', baseUrl: 'https://openrouter.ai/api/v1/', model: 'qwen/qwen3-coder', keyRef: 'openrouter',
    })
    expect(ep.kind).toBe('openai-compatible')
    // The trailing slash is stripped by normaliseEndpoint — proof the shared validation ran.
    if (ep.kind === 'openai-compatible') expect(ep.baseUrl).toBe('https://openrouter.ai/api/v1')
  })

  it('refuses to build an endpoint for a cli-harness entry', () => {
    expect(() => toModelEndpoint({ art: 'cli-harness', cli: 'claude', handle: 'opus' }))
      .toThrow('hat keinen Endpunkt')
  })
})

describe('toModelEndpoint mit Codec', () => {
  it('macht aus local-http plus openai-chat einen /v1-Endpunkt ohne Schluessel', () => {
    const ep = toModelEndpoint(
      { art: 'local-http', host: '100.78.7.108', port: 11434, model: 'gemma4:26b' },
      'openai-chat',
    )
    expect(ep).toEqual({
      kind: 'openai-compatible', baseUrl: 'http://100.78.7.108:11434/v1',
      model: 'gemma4:26b', keyRef: '',
    })
  })

  it('macht aus api plus anthropic einen Anthropic-Endpunkt', () => {
    const ep = toModelEndpoint(
      { art: 'api', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-opus-5', keyRef: 'anthropic' },
      'anthropic',
    )
    expect(ep.kind).toBe('anthropic')
  })

  it('bleibt ohne Codec beim bisherigen Verhalten', () => {
    const ep = toModelEndpoint({ art: 'local-http', host: 'h', port: 1, model: 'm' })
    expect(ep.kind).toBe('ollama')
  })
})
