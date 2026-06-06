/**
 * Architect Capability Packages — differentiated by niveau.
 *
 * A: 7 packages (skill-md lazy-loading)
 * B: 5 packages (no coaching-loop-guide, no rolling-summary)
 * C: 1 package (inline, architect-core-identity + schnittstellen-stempel, ≤800 tokens)
 *
 * CK-P3A-011, CK-P3A-012
 */

import { CapabilityNiveau } from '../niveau'
import { LoaderType } from '../capability-schema'
import type { CapabilityPackage } from '../capability-schema'

const CORE_IDENTITY_C_EXTRAKT = [
  '# Architect (Niveau C — Schnittstellen-Stempel-Modus)',
  '',
  'Du bist der Architect. Auf Niveau C bist du auf Ein-Subsystem-Fälle reduziert.',
  'Liefere einen einzelnen Schnittstellen-Vertrag (Input/Output des Gesamtsystems)',
  'und ein einzelnes Anforderungspaket. Keine ADRs, kein Coaching-Loop.',
  '',
  '## Schnittstellen-Stempel',
  '',
  'Erstelle einen schnittstellen_vertrag-Knoten mit:',
  '- input_schema: Input-Typen und Format',
  '- output_schema: Output-Typen und Format',
  '- fehlerverhalten: Fehlerfälle und Reaktionen',
  '',
  '## Negative Grenzen',
  '',
  '1. Kein produktiver Code (Pseudocode erlaubt)',
  '2. Keine Welle-Planung',
  '3. Keine Anforderungs-Schärfung',
].join('\n')

/** All 7 architect capability packages. */
const ALL_PACKAGES: CapabilityPackage[] = [
  {
    name: 'architect-core-identity',
    beschreibung: 'Kern-Identität und Auftrag des Architect-Presets',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/architect-core-identity/SKILL.md',
    niveauCExtrakt: CORE_IDENTITY_C_EXTRAKT,
  },
  {
    name: 'subsystem-zerlegung-guide',
    beschreibung: 'Anleitung zur Subsystem-Zerlegung mit Schnittstellen-Verträgen',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/subsystem-zerlegung-guide/SKILL.md',
    niveauMinimum: 'B',
  },
  {
    name: 'adr-format-guide',
    beschreibung: 'ADR-Format mit Tiefe-Stufen für Niveau-Bedienung',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/adr-format-guide/SKILL.md',
    niveauMinimum: 'B',
  },
  {
    name: 'anforderungspaket-formulierer',
    beschreibung: 'Granulare Anforderungspakete pro Worker formulieren',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/anforderungspaket-formulierer/SKILL.md',
    niveauMinimum: 'B',
  },
  {
    name: 'niveau-c-formulierer',
    beschreibung: 'Outputs auf Niveau-C-taugliche Formen reduzieren (Pflicht)',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/niveau-c-formulierer/SKILL.md',
    niveauMinimum: 'B',
  },
  {
    name: 'coaching-loop-guide',
    beschreibung: 'Frage/Antwort-Coaching-Loop im Graph während des Baus',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/coaching-loop-guide/SKILL.md',
    niveauMinimum: 'A',
  },
  {
    name: 'rolling-summary',
    beschreibung: 'Rolling Summary für Architect-State über Wellen hinweg',
    loader: LoaderType.SkillMd,
    pfad: '.claude/capabilities/rolling-summary/SKILL.md',
    niveauMinimum: 'A',
  },
]

/**
 * Returns the capability packages for a given niveau.
 * Niveau A: all 7. Niveau B: 5 (filtered by niveauMinimum). Niveau C: 1 (inline).
 */
export function getArchitectCapabilities(niveau: CapabilityNiveau): CapabilityPackage[] {
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
