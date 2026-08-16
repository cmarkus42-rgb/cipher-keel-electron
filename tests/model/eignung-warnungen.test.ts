import { describe, it, expect } from 'vitest'
import { warnungen } from '../../src/main/model/eignung'
import { normaliseEintrag, type ModellEintrag, type Faehigkeiten } from '../../src/main/model/entry'
import { CapabilityNiveau } from '../../src/main/preset/niveau'

function lokal(over: Partial<Faehigkeiten> = {}): ModellEintrag {
  return normaliseEintrag({
    id: 'spark-x', name: 'X', art: 'local-http',
    erreichbarkeit: { art: 'local-http', host: '100.78.7.108', port: 11434, model: 'x' },
    oertlichkeit: 'eigenes-netz', erklaertext: 'x', empfehlung: 'x',
    faehigkeiten: { codec: 'ollama-native', werkzeugmodus: 'nativ', quelle: 'gemessen',
      gemessenAm: '2026-08-16', gemessenMit: 'kanarie-1', nutzbaresKontextfenster: 131072, ...over },
  })
}

const codes = (w: { code: string }[]) => w.map(x => x.code)

describe('warnings sit on the assignment, never on the entry', () => {
  it('warns about the text tool protocol on the own loop', () => {
    expect(codes(warnungen(lokal({ werkzeugmodus: 'text' }), 'eigene-schleife', CapabilityNiveau.B)))
      .toContain('werkzeugmodus-text')
  })

  it('does not warn about the tool protocol on the one-shot runner — it uses no tools', () => {
    expect(codes(warnungen(lokal({ werkzeugmodus: 'text' }), 'ein-schuss', CapabilityNiveau.C)))
      .not.toContain('werkzeugmodus-text')
  })

  it('warns when an agentic niveau rests on an unmeasured row', () => {
    const vermutet = lokal({ quelle: 'vermutet', gemessenAm: null, gemessenMit: null })
    expect(codes(warnungen(vermutet, 'eigene-schleife', CapabilityNiveau.A))).toContain('nicht-gemessen')
  })

  it('warns when the context window is below the frame demand', () => {
    const w = warnungen(lokal({ nutzbaresKontextfenster: 8192 }), 'eigene-schleife',
      CapabilityNiveau.A, { startkontextToken: 40000 })
    expect(codes(w)).toContain('kontext-zu-klein')
  })

  it('does not apply the context rule when no number is known', () => {
    expect(codes(warnungen(lokal(), 'eigene-schleife', CapabilityNiveau.A))).not.toContain('kontext-zu-klein')
  })

  it('warns when a niveau sits below the runner capability', () => {
    expect(codes(warnungen(lokal(), 'eigene-schleife', CapabilityNiveau.C))).toContain('unter-faehigkeit')
  })

  it('warns that the prompt leaves the own network for a foreign-net entry', () => {
    const fremd = normaliseEintrag({
      id: 'or-x', name: 'X', art: 'api',
      erreichbarkeit: { art: 'api', baseUrl: 'https://openrouter.ai/api/v1', model: 'x', keyRef: 'openrouter' },
      oertlichkeit: 'fremdes-netz', erklaertext: 'x', empfehlung: 'x',
      faehigkeiten: { codec: 'openai-chat', werkzeugmodus: 'nativ', quelle: 'gemessen',
        gemessenAm: '2026-08-16', gemessenMit: 'kanarie-1' },
    })
    const c = codes(warnungen(fremd, 'ein-schuss', CapabilityNiveau.C))
    expect(c).toContain('verlaesst-netz')
    expect(c).toContain('teure-ebene-fuer-mechanik')
  })

  // The counter-proof. moondream (1B) failed the C contract twice while gemma4:26b,
  // qwen3-vl:30b and gpt-oss:120b passed first try — all four local. Keying the warning on
  // locality would shout at the 120B as loudly as at the 1B and become noise within a week.
  it('does NOT warn a strong measured local model on B for being local', () => {
    const w = codes(warnungen(lokal(), 'eigene-schleife', CapabilityNiveau.B))
    expect(w).toEqual([])
  })
})
