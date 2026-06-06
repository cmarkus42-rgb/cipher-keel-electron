/**
 * CF Capability Packages — differentiated by niveau.
 *
 * A: 8 packages (skill-md lazy-loading)
 * B: 5 packages (no model-routing-guide, risk-review-guide, graph-navigation)
 * C: 1 package (cf-core-identity inline, ≤500 tokens)
 *
 * CK-P3CF-007, CK-P3CF-010
 */

import { CapabilityNiveau } from '../niveau'
import { LoaderType } from '../capability-schema'
import type { CapabilityPackage } from '../capability-schema'

const CORE_IDENTITY_C_EXTRAKT = [
  '# Cyber Factory (Niveau C — Development-Worker-Modus)',
  '',
  'Du bist der Cyber Factory Worker auf Niveau C.',
  'Du arbeitest als strukturierter Coding-Agent an einem einzelnen Anforderungspaket.',
  'Keine Orchestrierung, keine Welle-Planung, kein Worker-Spawning.',
  '',
  '## Auftrag',
  '',
  'Lies das zugewiesene anforderungspaket aus dem Graph.',
  'Implementiere die enthaltenen req_ids direkt im Code.',
  'Orientiere dich an code_anker und akzeptanzkriterium.',
  '',
  '## Negative Grenzen',
  '',
  '1. Kein Spawnen weiterer Worker-Sessions',
  '2. Keine Welle-Planung oder Dekomposition',
  '3. Kein Lesen von ADRs oder Schnittstellen-Verträgen (nur anforderungspaket)',
  '4. Kein Graph-Schreiben außer Status-Updates am eigenen Paket',
].join('\n')

/** All 8 CF capability packages. */
const ALL_PACKAGES: CapabilityPackage[] = [
  {
    name: 'cf-core-identity',
    beschreibung: 'Kern-Identität und Auftrag des Cyber Factory Presets',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/cf-core-identity/SKILL.md',
    niveauCExtrakt: CORE_IDENTITY_C_EXTRAKT,
  },
  {
    name: 'welle-plan-guide',
    beschreibung: 'Anleitung zur Welle-Planung mit Abhängigkeitsanalyse',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/welle-plan-guide/SKILL.md',
    niveauMinimum: 'B',
  },
  {
    name: 'worker-startup-protokoll',
    beschreibung: 'Startup-Protokoll für Worker-Sessions und Handoff-Format',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/worker-startup-protokoll/SKILL.md',
    niveauMinimum: 'B',
  },
  {
    name: 'welle-plan-granularisierer',
    beschreibung: 'Granularisierung von Anforderungspaketen pro Worker-Kapazität',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/welle-plan-granularisierer/SKILL.md',
    niveauMinimum: 'B',
  },
  {
    name: 'rueckweg-protokoll',
    beschreibung: 'Rückweg-Protokoll für Wellen-Abschluss und Status-Konsolidierung',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/rueckweg-protokoll/SKILL.md',
    niveauMinimum: 'B',
  },
  {
    name: 'model-routing-guide',
    beschreibung: 'Model-Routing für Worker-Spawning nach Aufgaben-Komplexität',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/model-routing-guide/SKILL.md',
    niveauMinimum: 'A',
  },
  {
    name: 'risk-review-guide',
    beschreibung: 'Risk-Review-Gate für Wellen-Abschluss mit Risiko-Klassifikation',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/risk-review-guide/SKILL.md',
    niveauMinimum: 'A',
  },
  {
    name: 'graph-navigation',
    beschreibung: 'Graph-Navigation für CF: Anforderungspakete, ADRs, Verträge lesen',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/graph-navigation/SKILL.md',
    niveauMinimum: 'A',
  },
]

/**
 * Returns the capability packages for the given CF niveau.
 * Niveau A: all 8. Niveau B: 5 (filtered). Niveau C: 1 (inline).
 */
export function getCfCapabilities(niveau: CapabilityNiveau): CapabilityPackage[] {
  if (niveau === CapabilityNiveau.C) {
    return [{
      ...ALL_PACKAGES[0],
      loader: LoaderType.Inline,
      pfad: '',
    }]
  }

  return ALL_PACKAGES.filter(pkg => {
    if (!pkg.niveauMinimum) return true
    if (niveau === CapabilityNiveau.A) return true
    if (niveau === CapabilityNiveau.B) return pkg.niveauMinimum !== 'A'
    return false
  })
}
