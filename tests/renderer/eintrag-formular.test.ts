import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  baueFaehigkeitenPayload, samplerWarnung, samplerLuecken, DENKSTUFEN_AUSWAHL, LEER, type Felder,
} from '../../src/renderer/components/settings/EintragFormular'
import { normaliseEintrag, DENKSTUFEN } from '../../src/main/model/entry'
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

  // Der sampler-Block ist optional und muss es bleiben. Ein Formular, das ihn immer mitsendet,
  // wuerde jeden bestehenden Eintrag beim ersten Speichern mit Samplern versehen, die niemand
  // gewaehlt hat — und die Ollama dann statt seiner eigenen Werte benutzt.
  describe('sampler', () => {
    it('sendet keinen sampler-Block, solange das Kaestchen aus ist', () => {
      const f: Felder = { ...LEER, art: 'local-http' }
      const payload = baueFaehigkeitenPayload(f, undefined) as Record<string, unknown>
      expect('sampler' in payload).toBe(false)
    })

    it('sendet die keel-Namen als Zahlen, wenn das Kaestchen an ist', () => {
      const f: Felder = {
        ...LEER, art: 'local-http', fSamplerAn: true,
        fTemperature: '1.0', fTopP: '0.95', fPresencePenalty: '0.0', fMaxTokens: '8192',
        fReasoningEffort: 'medium',
      }
      const payload = baueFaehigkeitenPayload(f, undefined) as Record<string, unknown>
      expect(payload.sampler).toEqual({
        temperature: 1.0, topP: 0.95, presencePenalty: 0.0, maxTokens: 8192,
        reasoningEffort: 'medium',
      })
    })

    it('laesst reasoningEffort weg, wenn keine Stufe gewaehlt ist', () => {
      const f: Felder = {
        ...LEER, art: 'local-http', fSamplerAn: true,
        fTemperature: '0.7', fTopP: '0.8', fPresencePenalty: '1.5', fMaxTokens: '2048',
        fReasoningEffort: '',
      }
      const payload = baueFaehigkeitenPayload(f, undefined) as Record<string, unknown>
      expect(payload.sampler).toEqual({
        temperature: 0.7, topP: 0.8, presencePenalty: 1.5, maxTokens: 2048,
      })
    })

    // Runde 2, Fund 4: der Vorgaenger dieses Tests prueft `expect(['', 'low', 'medium',
    // 'high']).toContain(LEER.fReasoningEffort)` — eine Tautologie ueber eine Konstante, die
    // ueber die Auswahlliste im <select> nichts sagt. Wer dort eine vierte Option von Hand
    // einhaengt, bleibt gruen und wird erst beim Speichern von normaliseEintrag aufgehalten;
    // der Kommentar im Formular nennt aber ausdruecklich „gar nicht erst anbieten" als Ziel.
    describe('Denkstufen-Auswahl', () => {
      const QUELLE = readFileSync(
        join(__dirname, '../../src/renderer/components/settings/EintragFormular.tsx'), 'utf8',
      )

      it('bietet genau die Stufen an, die normaliseEintrag durchlaesst', () => {
        expect(DENKSTUFEN_AUSWAHL.map(s => s.wert)).toEqual(['none', 'low', 'medium', 'high'])
        // Und zwar dieselben: eine zu viel hier waere 106 Sekunden fuer eine kuerzere Antwort
        // (`xhigh`, gemessen), eine fehlende waere eine Stufe, die die Datei erlaubt und das
        // Formular verschweigt.
        expect(new Set(DENKSTUFEN_AUSWAHL.map(s => s.wert))).toEqual(DENKSTUFEN)
      })

      it('haengt keine Stufe von Hand ins <select>, sondern nur die Liste', () => {
        const abDenkstufe = QUELLE.slice(QUELLE.indexOf('>Denkstufe</label>'))
        const select = abDenkstufe.slice(0, abDenkstufe.indexOf('</select>'))
        expect(select).not.toBe('')
        const literale = [...select.matchAll(/<option value="([^"]*)"/g)].map(m => m[1])
        // Nur „keine Angabe" steht literal da; jede echte Stufe kommt aus DENKSTUFEN_AUSWAHL.
        // Ein handgeschriebenes <option value="xhigh"> faellt genau hier auf.
        expect(literale).toEqual([''])
      })
    })

    // Runde 2, Fund 2: `Number('')` ist 0, nicht NaN. Ein geleertes Temperaturfeld ergab damit
    // `temperature: 0` — ein plausibel aussehender Wert, den niemand gewaehlt hat und der auf
    // dem Draht als gieriges Sampling ankommt. Die Ausgangslage (1.0/0.95) sah dabei aus wie
    // gespeichert. Leer heisst hier nicht 0, sondern „keine Zahl", und das muss auffallen.
    describe('leergeraeumte Zahlenfelder', () => {
      const LEERES_FELD: Felder = {
        ...LEER, art: 'local-http', fSamplerAn: true,
        fTemperature: '', fTopP: '   ', fPresencePenalty: '', fMaxTokens: '',
      }

      it('macht aus einem leeren Feld keine 0', () => {
        const payload = baueFaehigkeitenPayload(LEERES_FELD, undefined) as Record<string, unknown>
        const s = payload.sampler as Record<string, number>
        for (const feld of ['temperature', 'topP', 'presencePenalty', 'maxTokens']) {
          expect(s[feld], `${feld} aus leerem Feld`).toBeNaN()
        }
      })

      // Das Fenster sagte dazu nichts: bei maxTokens warnte immerhin die 2048-Zeile (weil 0 <
      // 2048), bei Temperatur und Top-P gar nichts. Ein leeres Feld ist ab jetzt eine Angabe,
      // die garantiert scheitert — und das darf das Formular vorher sagen, wie beim ungebauten
      // Codec auch.
      it('nennt jedes leere Feld beim Namen, bevor gespeichert wird', () => {
        const w = samplerLuecken({
          ...LEER, art: 'local-http', fSamplerAn: true, fTemperature: '', fTopP: '   ',
        })
        expect(w).toMatch(/Temperatur/)
        expect(w).toMatch(/Top-P/)
        expect(w).not.toMatch(/Antwortlaenge/)
      })

      it('schweigt, wenn alle vier Felder etwas tragen', () => {
        expect(samplerLuecken({ ...LEER, art: 'local-http', fSamplerAn: true })).toBeNull()
      })

      it('schweigt, solange das Kaestchen aus ist', () => {
        expect(samplerLuecken({ ...LEER, art: 'local-http', fTemperature: '' })).toBeNull()
      })

      // Ende zu Ende, ueber die Grenze hinweg: der Renderer darf nicht aus src/main lesen, ein
      // Test darf es — und nur so ist belegt, dass der Formularwert auch wirklich abgewiesen
      // wird statt nur anders auszusehen.
      it('wird von normaliseEintrag benannt abgewiesen, statt still hinauszugehen', () => {
        expect(() => normaliseEintrag({
          id: 'x', name: 'X', art: 'local-http',
          erreichbarkeit: { art: 'local-http', host: '127.0.0.1', port: 11434, model: 'q' },
          oertlichkeit: 'eigenes-netz', erklaertext: '', empfehlung: '',
          faehigkeiten: baueFaehigkeitenPayload(LEERES_FELD, undefined),
        })).toThrow(/sampler\.temperature/)
      })
    })

    // Runde 2, Fund 1: der Abschnitt wird fuer jeden Nicht-cli-harness-Eintrag angeboten, aber
    // gelesen wird `f.sampler` nur von openAiChatCodec.toWire. Bei Codec 'anthropic' ist der
    // Regler genau die Attrappe, gegen die CK-NFR-012 antritt — er verspricht etwas, das den
    // Server nie erreicht. Die Datei kennt das Warnmuster schon (UNGEBAUTE_CODECS), hier fehlte es.
    describe('samplerWarnung', () => {
      it('warnt bei anthropic, dessen toWire den Block nie anfasst', () => {
        const w = samplerWarnung({ ...LEER, art: 'api', fSamplerAn: true, fCodec: 'anthropic' })
        expect(w).toMatch(/anthropic/)
        expect(w).toMatch(/openai-chat/)
      })

      it('warnt auch bei den ungebauten Codecs, solange der Block ihnen nichts sagt', () => {
        for (const codec of ['ollama-native', 'text'] as const) {
          expect(samplerWarnung({ ...LEER, art: 'local-http', fSamplerAn: true, fCodec: codec }))
            .toMatch(/openai-chat/)
        }
      })

      it('schweigt bei openai-chat — dort gehen die Werte wirklich hinaus', () => {
        expect(samplerWarnung({
          ...LEER, art: 'local-http', fSamplerAn: true, fCodec: 'openai-chat',
        })).toBeNull()
      })

      it('schweigt, solange das Kaestchen aus ist — dann verspricht nichts etwas', () => {
        expect(samplerWarnung({ ...LEER, art: 'api', fSamplerAn: false, fCodec: 'anthropic' }))
          .toBeNull()
      })
    })
  })
})
