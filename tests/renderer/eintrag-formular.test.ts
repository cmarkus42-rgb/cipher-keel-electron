import { describe, it, expect } from 'vitest'
import { baueFaehigkeitenPayload, LEER, type Felder } from '../../src/renderer/components/settings/EintragFormular'
import type { FaehigkeitenAnsicht } from '../../src/shared/settings-types'

// Pure logic test -- no React rendering. baueFaehigkeitenPayload has no hooks and touches no
// DOM, so it is testable directly, unlike the component itself (this repo has no jsdom /
// React Testing Library setup; see run-keel skill notes on why renderer behaviour is
// otherwise verified against the live app instead).

const GEMESSEN: FaehigkeitenAnsicht = {
  codec: 'openai-chat',
  werkzeugmodus: 'nativ',
  paralleleAufrufe: true,
  denkbloecke: false,
  bilder: false,
  dokumente: false,
  aufgeschobenesLaden: false,
  werkzeugObergrenze: 6,
  nutzbaresKontextfenster: 65536,
  vertragsStrenge: { schemaTiefe: 2, reparaturversuche: 3 },
  rundenbudget: 20,
  gemessenAm: '2026-08-19',
  gemessenMit: 'canary-v1',
  quelle: 'gemessen',
}

function feldFuer(bestehend: FaehigkeitenAnsicht): Felder {
  return {
    ...LEER,
    art: 'local-http',
    fCodec: bestehend.codec,
    fWerkzeugmodus: bestehend.werkzeugmodus,
    fParalleleAufrufe: bestehend.paralleleAufrufe,
    fDenkbloecke: bestehend.denkbloecke,
    fBilder: bestehend.bilder,
    fDokumente: bestehend.dokumente,
    fAufgeschobenesLaden: bestehend.aufgeschobenesLaden,
    fWerkzeugObergrenze: String(bestehend.werkzeugObergrenze),
    fNutzbaresKontextfenster: String(bestehend.nutzbaresKontextfenster),
    fRundenbudget: String(bestehend.rundenbudget),
  }
}

describe('baueFaehigkeitenPayload', () => {
  it('returns undefined for cli-harness, regardless of the section fields', () => {
    const f: Felder = { ...LEER, art: 'cli-harness' }
    expect(baueFaehigkeitenPayload(f, undefined)).toBeUndefined()
  })

  it('sends vermutet with no measurement fields for a fresh row', () => {
    const f: Felder = { ...LEER, art: 'local-http' }
    const payload = baueFaehigkeitenPayload(f, undefined) as Record<string, unknown>
    expect(payload.quelle).toBe('vermutet')
    expect(payload.gemessenAm).toBeNull()
    expect(payload.gemessenMit).toBeNull()
  })

  // Fund 3: a quelle: 'gemessen' row must survive a save that only touches a field the
  // section does not show (Empfehlung, Erklaertext, ...). The ten shown fields still come
  // from the form; everything else must be carried through from the existing row unchanged.
  it('preserves quelle, gemessenAm, gemessenMit and vertragsStrenge from an existing gemessen row', () => {
    const f = feldFuer(GEMESSEN)
    const payload = baueFaehigkeitenPayload(f, GEMESSEN) as Record<string, unknown>
    expect(payload.quelle).toBe('gemessen')
    expect(payload.gemessenAm).toBe('2026-08-19')
    expect(payload.gemessenMit).toBe('canary-v1')
    expect(payload.vertragsStrenge).toEqual({ schemaTiefe: 2, reparaturversuche: 3 })
    // And the ten shown fields still reflect the form, not just copied wholesale.
    expect(payload.codec).toBe('openai-chat')
    expect(payload.rundenbudget).toBe(20)
  })
})
