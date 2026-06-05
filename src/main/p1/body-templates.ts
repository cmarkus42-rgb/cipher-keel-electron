/**
 * body-templates.ts — Body-Templates und Mindest-Inhalt-Pruefung fuer die
 * sieben Uebergabedokument-Typen.
 *
 * CK-P1-004: Body-Templates mit Gate-Befund-Sektionen
 *   - 7 Templates mit H2-Sektionen gemaess P1 Abschnitt 7
 *   - Niveau A: Gate-Befund mit getrennten Signalen (strukturell + Plausibilitaet)
 *   - Niveau B: Gate-Befund als Prosa
 *   - Niveau C: Kein H2-Geruest
 */

// ---------------------------------------------------------------------------
// Dokumenttypen — canonical source: src/main/graph/node-types.ts
// ---------------------------------------------------------------------------

export { DOKUMENT_TYPEN, type DokumentTyp } from '../graph/node-types'
import { DOKUMENT_TYPEN, type DokumentTyp } from '../graph/node-types'

export type Niveau = 'A' | 'B' | 'C'

// ---------------------------------------------------------------------------
// ValidationResult
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

// ---------------------------------------------------------------------------
// H2-Sektionen pro Dokumenttyp (gemaess P1 Abschnitt 7.1–7.7)
// Gate-Befund wird fuer Typen ab spec separat angehaengt.
// ---------------------------------------------------------------------------

const DOKUMENT_SEKTIONEN: Record<DokumentTyp, string[]> = {
  'anforderungen':     ['Kontext', 'Stakeholder-Anforderungen', 'Scope'],
  'spec':              ['Kontext', 'Anforderungen', 'Nicht-funktionale Anforderungen'],
  'architektur-paket': ['Kontext', 'REQ-Mapping', 'Architektur-Entscheidungen'],
  'build-paket':       ['Kontext', 'Code-Referenzen', 'Implementierungsdetails'],
  'test-findings':     ['Kontext', 'Test-Ergebnisse', 'Befunde'],
  'fix-report':        ['Kontext', 'Bearbeitete Befunde', 'Aenderungen'],
  'audit-summary':     ['Kontext', 'Audit-Befunde', 'Freigabe-Empfehlung']
}

// Typen, die eine Gate-Befund-Sektion tragen (alle ausser anforderungen)
const GATE_BEFUND_TYPEN = new Set<DokumentTyp>([
  'spec', 'architektur-paket', 'build-paket', 'test-findings', 'fix-report', 'audit-summary'
])

// ---------------------------------------------------------------------------
// Gate-Befund-Block je Niveau
// ---------------------------------------------------------------------------

function gateBefundBlock(niveau: Niveau): string {
  if (niveau === 'A') {
    return [
      '## Gate-Befund',
      '',
      '### Struktureller Befund',
      '',
      '<!-- Deterministisch: Ergebnis der Graph-Abfrage gegen M1 -->',
      '',
      '### Plausibilitaets-Befund',
      '',
      '<!-- Inferenz: Vorschlag — SE-Bewertung erforderlich -->'
    ].join('\n')
  }
  // Niveau B
  return [
    '## Gate-Befund',
    '',
    '<!-- Gate-Befund als Prosa -->'
  ].join('\n')
}

// ---------------------------------------------------------------------------
// generateTemplate
// ---------------------------------------------------------------------------

/**
 * Erzeugt ein Body-Template fuer den gegebenen Dokumenttyp und das Niveau.
 *
 * Niveau A: vollstaendige H2-Struktur, Gate-Befund mit zwei Signalen
 * Niveau B: vollstaendige H2-Struktur, Gate-Befund als Prosa
 * Niveau C: kein H2-Geruest — minimaler Freitext-Platzhalter
 */
export function generateTemplate(dokumentTyp: string, niveau: Niveau): string {
  if (niveau === 'C') {
    return `<!-- ${dokumentTyp} — Niveau C (minimal, kein H2-Geruest) -->`
  }

  const typ = dokumentTyp as DokumentTyp
  const sektionen = DOKUMENT_SEKTIONEN[typ] ?? ['Kontext']

  const parts: string[] = []

  for (const sektion of sektionen) {
    parts.push(`## ${sektion}`)
    parts.push('')
    parts.push(`<!-- ${sektion} -->`)
    parts.push('')
  }

  if (GATE_BEFUND_TYPEN.has(typ)) {
    parts.push(gateBefundBlock(niveau))
    parts.push('')
  }

  return parts.join('\n').trimEnd()
}

// ---------------------------------------------------------------------------
// Mindest-Inhalt-Validierung
// ---------------------------------------------------------------------------

const SA_ID_PATTERN = /SA-\d+/g
const REQ_ID_PATTERN = /REQ-\d+/g

/**
 * Extrahiert den Inhalt einer benannten H2-Sektion aus einem Body-String.
 * Gibt einen leeren String zurueck wenn die Sektion fehlt oder leer ist.
 */
function extractSection(body: string, sectionName: string): string {
  const lines = body.split('\n')
  let inSection = false
  const sectionLines: string[] = []

  for (const line of lines) {
    if (line.trimEnd() === `## ${sectionName}`) {
      inSection = true
      continue
    }
    if (inSection) {
      if (line.startsWith('## ')) break
      sectionLines.push(line)
    }
  }

  return sectionLines.join('\n').trim()
}

/**
 * Prueft Mindest-Inhalt-Bedingungen fuer einen Dokumenttyp.
 *
 * Regeln:
 *   anforderungen:   mindestens 3 eindeutige SA-IDs im Body
 *   spec:            REQ-IDs UND SA-IDs muessen vorhanden sein
 *   architektur-paket: REQ-Mapping-Sektion muss REQ-IDs enthalten
 *   build-paket:     Code-Referenzen-Sektion darf nicht leer sein
 */
export function validateMinContent(dokumentTyp: string, body: string): ValidationResult {
  const errors: string[] = []

  switch (dokumentTyp) {
    case 'anforderungen': {
      const saIds = body.match(SA_ID_PATTERN) ?? []
      const unique = new Set(saIds)
      if (unique.size < 3) {
        errors.push(`Mindestens 3 SA-IDs erforderlich, gefunden: ${unique.size}`)
      }
      break
    }

    case 'spec': {
      const reqIds = body.match(REQ_ID_PATTERN) ?? []
      const saIds  = body.match(SA_ID_PATTERN)  ?? []
      if (reqIds.length === 0) {
        errors.push('Keine REQ-IDs gefunden — spec muss REQ-IDs enthalten')
      }
      if (saIds.length === 0) {
        errors.push('Kein SA-Rueckverweis gefunden — spec muss SA-IDs als Rueckverweis enthalten')
      }
      break
    }

    case 'architektur-paket': {
      const mappingInhalt = extractSection(body, 'REQ-Mapping')
      const reqIds = mappingInhalt.match(REQ_ID_PATTERN) ?? []
      if (reqIds.length === 0) {
        errors.push('REQ-Mapping-Sektion leer oder ohne REQ-IDs — Mapping muss vollstaendig sein')
      }
      break
    }

    case 'build-paket': {
      const codeRef = extractSection(body, 'Code-Referenzen')
      if (codeRef.length === 0) {
        errors.push('Code-Referenzen-Sektion leer — mindestens eine Code-Referenz erforderlich')
      }
      break
    }

    default:
      break
  }

  return { valid: errors.length === 0, errors }
}
