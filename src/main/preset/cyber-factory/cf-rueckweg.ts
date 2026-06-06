/**
 * CF Rueckweg Protocol — escalation when architecture doesn't hold.
 *
 * "Die Zerlegung ist Input, nicht Hypothese."
 * CK-P3CF-006
 */

import type { GraphWriter } from '../../graph/writer'

export interface ArchitekturBruchInput {
  phaseUid: string
  subsystem: string
  bruchpunkt: string
  schnittstelle: string
  bauImplikation: string
}

export function reportArchitekturBruch(
  writer: GraphWriter,
  input: ArchitekturBruchInput,
): { befundUid: string; rueckwegDokUid: string } {
  const timestamp = new Date().toISOString().replace(/:/g, '-')

  // 1. gate_befund with gate_typ architektur-bruch
  const befund = writer.upsertNode({
    kind: 'gate_befund',
    title: `Architektur-Bruch: ${input.bruchpunkt.slice(0, 60)}`,
    path: `/rueckweg/befund-${timestamp}.md`,
    frontmatter: {
      phase_uid: input.phaseUid,
      strukturell: 'rot',
      gate_typ: 'architektur-bruch',
      subsystem: input.subsystem,
      bruchpunkt: input.bruchpunkt,
      schnittstelle: input.schnittstelle,
      bau_implikation: input.bauImplikation,
    },
  })

  // 2. uebergabedokument for SE information
  const dok = writer.upsertNode({
    kind: 'uebergabedokument',
    title: `Rückweg-Befund: ${input.bruchpunkt.slice(0, 40)}`,
    path: `/rueckweg/dok-${timestamp}.md`,
    body: [
      `# Rückweg-Befund`,
      '',
      `**Subsystem:** ${input.subsystem}`,
      `**Bruchpunkt:** ${input.bruchpunkt}`,
      `**Schnittstelle:** ${input.schnittstelle}`,
      `**Bau-Implikation:** ${input.bauImplikation}`,
      '',
      'CF wartet auf SE-Entscheidung. Kein Umbau auf eigene Faust.',
    ].join('\n'),
    frontmatter: {
      dokumentTyp: 'rueckweg-befund',
    },
  })

  return { befundUid: befund.uid, rueckwegDokUid: dok.uid }
}
