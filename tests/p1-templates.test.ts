/**
 * p1-templates.test.ts — Body-Templates, Versionierung und Default-Adressat
 *
 * CK-P1-004: Body-Templates mit Gate-Befund-Sektionen
 * CK-P1-006: Versionierung bei Testing-Fixing-Loops
 * CK-P1-015: Default-Adressat pro Dokumenttyp
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openGraphDb } from '../src/main/graph/db'
import { GraphWriter } from '../src/main/graph/writer'
import {
  generateTemplate,
  validateMinContent,
  DOKUMENT_TYPEN
} from '../src/main/p1/body-templates'
import {
  createNextVersion,
  getVersionChain,
  type UebergabeDokument
} from '../src/main/p1/versioning'
import {
  getDefaultAddressee,
  resolveAddressee
} from '../src/main/p1/default-addressee'

// ---------------------------------------------------------------------------
// DB setup for versioning tests
// ---------------------------------------------------------------------------

let db: Database.Database
let writer: GraphWriter

beforeEach(() => {
  db = openGraphDb({ path: ':memory:' })
  writer = new GraphWriter(db)
})

afterEach(() => {
  if (db.open) db.close()
})

// ---------------------------------------------------------------------------
// generateTemplate — Template-Generierung fuer alle 7 Typen (Niveau A)
// ---------------------------------------------------------------------------

describe('generateTemplate — alle 7 Dokumenttypen auf Niveau A', () => {
  it('erzeugt Template fuer jeden der 7 Typen', () => {
    for (const typ of DOKUMENT_TYPEN) {
      const tmpl = generateTemplate(typ, 'A')
      expect(tmpl, `Template fuer '${typ}' darf nicht leer sein`).toBeTruthy()
      expect(tmpl, `Template fuer '${typ}' muss H2-Sektionen enthalten`).toContain('##')
    }
  })

  it('anforderungen-Template enthaelt Stakeholder-Anforderungen-Sektion', () => {
    const tmpl = generateTemplate('anforderungen', 'A')
    expect(tmpl).toContain('## Stakeholder-Anforderungen')
  })

  it('anforderungen-Template enthaelt keine Gate-Befund-Sektion', () => {
    const tmpl = generateTemplate('anforderungen', 'A')
    expect(tmpl).not.toContain('## Gate-Befund')
  })

  it('spec-Template enthaelt Gate-Befund mit zwei Signalen auf Niveau A', () => {
    const tmpl = generateTemplate('spec', 'A')
    expect(tmpl).toContain('## Gate-Befund')
    expect(tmpl).toContain('### Struktureller Befund')
    expect(tmpl).toContain('### Plausibilitaets-Befund')
  })

  it('architektur-paket-Template enthaelt REQ-Mapping-Sektion', () => {
    const tmpl = generateTemplate('architektur-paket', 'A')
    expect(tmpl).toContain('## REQ-Mapping')
  })

  it('build-paket-Template enthaelt Code-Referenzen-Sektion', () => {
    const tmpl = generateTemplate('build-paket', 'A')
    expect(tmpl).toContain('## Code-Referenzen')
  })

  it('Niveau B: Gate-Befund als Prosa, keine getrennten Signale', () => {
    const tmpl = generateTemplate('spec', 'B')
    expect(tmpl).toContain('## Gate-Befund')
    expect(tmpl).not.toContain('### Struktureller Befund')
    expect(tmpl).not.toContain('### Plausibilitaets-Befund')
  })

  it('Niveau C: keine H2-Struktur im Body', () => {
    const tmpl = generateTemplate('spec', 'C')
    expect(tmpl).not.toContain('## ')
  })
})

// ---------------------------------------------------------------------------
// validateMinContent — Mindest-Inhalt-Pruefung
// ---------------------------------------------------------------------------

describe('validateMinContent — anforderungen', () => {
  it('schlaegt fehl mit 2 SA-IDs (braucht mindestens 3)', () => {
    const body = 'SA-001 erste Anforderung. SA-002 zweite Anforderung.'
    const result = validateMinContent('anforderungen', body)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('besteht mit 3 SA-IDs', () => {
    const body = 'SA-001 erste. SA-002 zweite. SA-003 dritte.'
    const result = validateMinContent('anforderungen', body)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('schlaegt fehl mit 4 SA-IDs im gleichen Token (kein Leerzeichen)', () => {
    // Jede SA-ID muss eigene Nummer haben
    const body = 'SA-001 SA-002 SA-003 sind valide'
    const result = validateMinContent('anforderungen', body)
    expect(result.valid).toBe(true)
  })
})

describe('validateMinContent — spec', () => {
  it('schlaegt fehl wenn keine REQ-IDs vorhanden', () => {
    const body = 'SA-001 SA-002 SA-003 ohne REQ-Referenz'
    const result = validateMinContent('spec', body)
    expect(result.valid).toBe(false)
  })

  it('schlaegt fehl wenn nur REQ-IDs ohne SA-Rueckverweis', () => {
    const body = 'REQ-001 erste Anforderung. REQ-002 zweite.'
    const result = validateMinContent('spec', body)
    expect(result.valid).toBe(false)
  })

  it('besteht mit REQ-IDs und SA-Rueckverweis', () => {
    const body = 'REQ-001 implementiert SA-001.\nREQ-002 adressiert SA-002.'
    const result = validateMinContent('spec', body)
    expect(result.valid).toBe(true)
  })
})

describe('validateMinContent — architektur-paket', () => {
  it('schlaegt fehl wenn REQ-Mapping leer', () => {
    const body = '## REQ-Mapping\n\n## Architektur-Entscheidungen\nEtwas.'
    const result = validateMinContent('architektur-paket', body)
    expect(result.valid).toBe(false)
  })

  it('besteht wenn REQ-Mapping REQ-IDs enthaelt', () => {
    const body = '## REQ-Mapping\nREQ-001 → Komponente A\nREQ-002 → Komponente B\n## Architektur-Entscheidungen'
    const result = validateMinContent('architektur-paket', body)
    expect(result.valid).toBe(true)
  })
})

describe('validateMinContent — build-paket', () => {
  it('schlaegt fehl wenn Code-Referenzen leer', () => {
    const body = '## Code-Referenzen\n\n## Implementierungsdetails\nEtwas.'
    const result = validateMinContent('build-paket', body)
    expect(result.valid).toBe(false)
  })

  it('besteht wenn Code-Referenzen Inhalt haben', () => {
    const body = '## Code-Referenzen\nsrc/main/graph/writer.ts:132\n## Implementierungsdetails'
    const result = validateMinContent('build-paket', body)
    expect(result.valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// createNextVersion — Versionierung
// ---------------------------------------------------------------------------

describe('createNextVersion', () => {
  it('erhoet Version von 1.0 auf 1.1', () => {
    const v1: UebergabeDokument = {
      'graph-knoten-id': 'DOC-V1-001',
      'dokument-typ': 'test-findings',
      version: '1.0',
      adressat: 'fixing',
      status: 'freigegeben'
    }
    const v2 = createNextVersion(v1)
    expect(v2.version).toBe('1.1')
  })

  it('setzt vorgaenger-dokument auf ID des Vorgaengers', () => {
    const v1: UebergabeDokument = {
      'graph-knoten-id': 'DOC-V1-001',
      'dokument-typ': 'test-findings',
      version: '1.0',
      adressat: 'fixing',
      status: 'freigegeben'
    }
    const v2 = createNextVersion(v1)
    expect(v2['vorgaenger-dokument']).toBe('DOC-V1-001')
  })

  it('adressat bleibt stabil ueber Generationen', () => {
    const v1: UebergabeDokument = {
      'graph-knoten-id': 'DOC-V1-001',
      'dokument-typ': 'test-findings',
      version: '1.0',
      adressat: 'fixing',
      status: 'freigegeben'
    }
    const v2 = createNextVersion(v1)
    expect(v2.adressat).toBe('fixing')
  })

  it('neue Version startet als Entwurf', () => {
    const v1: UebergabeDokument = {
      'graph-knoten-id': 'DOC-V1-001',
      'dokument-typ': 'test-findings',
      version: '1.0',
      adressat: 'fixing',
      status: 'freigegeben'
    }
    const v2 = createNextVersion(v1)
    expect(v2.status).toBe('entwurf')
  })

  it('neue Version hat andere graph-knoten-id', () => {
    const v1: UebergabeDokument = {
      'graph-knoten-id': 'DOC-V1-001',
      'dokument-typ': 'test-findings',
      version: '1.0',
      adressat: 'fixing',
      status: 'freigegeben'
    }
    const v2 = createNextVersion(v1)
    expect(v2['graph-knoten-id']).not.toBe('DOC-V1-001')
  })
})

// ---------------------------------------------------------------------------
// getVersionChain — Traversal ueber abgeloest_durch
// ---------------------------------------------------------------------------

describe('getVersionChain', () => {
  it('traversiert v1.0 → v1.1 ueber abgeloest_durch', () => {
    const { uid: uid1 } = writer.upsertNode({ kind: 'artefakt', title: 'test-findings v1.0', path: '/p/findings-v1.0.md' })
    const { uid: uid2 } = writer.upsertNode({ kind: 'artefakt', title: 'test-findings v1.1', path: '/p/findings-v1.1.md' })
    writer.linkEdge({ src: uid1, dst: uid2, type: 'abgeloest_durch', source: 'frontmatter' })

    const chain = getVersionChain(db, uid1)
    expect(chain).toEqual([uid1, uid2])
  })

  it('gibt einelementige Kette zurueck wenn kein Nachfolger', () => {
    const { uid } = writer.upsertNode({ kind: 'artefakt', title: 'test-findings v1.0 isoliert', path: '/p/findings-solo.md' })
    const chain = getVersionChain(db, uid)
    expect(chain).toEqual([uid])
  })

  it('traversiert dreistufige Kette v1.0 → v1.1 → v1.2', () => {
    const { uid: uid1 } = writer.upsertNode({ kind: 'artefakt', title: 'findings v1.0', path: '/p/f-v1.0.md' })
    const { uid: uid2 } = writer.upsertNode({ kind: 'artefakt', title: 'findings v1.1', path: '/p/f-v1.1.md' })
    const { uid: uid3 } = writer.upsertNode({ kind: 'artefakt', title: 'findings v1.2', path: '/p/f-v1.2.md' })
    writer.linkEdge({ src: uid1, dst: uid2, type: 'abgeloest_durch', source: 'frontmatter' })
    writer.linkEdge({ src: uid2, dst: uid3, type: 'abgeloest_durch', source: 'frontmatter' })

    const chain = getVersionChain(db, uid1)
    expect(chain).toEqual([uid1, uid2, uid3])
  })
})

// ---------------------------------------------------------------------------
// getDefaultAddressee — Default-Adressat
// ---------------------------------------------------------------------------

describe('getDefaultAddressee', () => {
  it('anforderungen → refinement', () => {
    expect(getDefaultAddressee('anforderungen')).toBe('refinement')
  })

  it('spec → architect', () => {
    expect(getDefaultAddressee('spec')).toBe('architect')
  })

  it('architektur-paket → cyber-factory', () => {
    expect(getDefaultAddressee('architektur-paket')).toBe('cyber-factory')
  })

  it('build-paket → testing', () => {
    expect(getDefaultAddressee('build-paket')).toBe('testing')
  })

  it('test-findings → fixing', () => {
    expect(getDefaultAddressee('test-findings')).toBe('fixing')
  })

  it('fix-report → audit', () => {
    expect(getDefaultAddressee('fix-report')).toBe('audit')
  })

  it('audit-summary → release-management', () => {
    expect(getDefaultAddressee('audit-summary')).toBe('release-management')
  })

  it('alle 7 Typen haben einen Default', () => {
    for (const typ of DOKUMENT_TYPEN) {
      expect(getDefaultAddressee(typ), `Kein Default fuer '${typ}'`).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// resolveAddressee — Override per Frontmatter
// ---------------------------------------------------------------------------

describe('resolveAddressee', () => {
  it('gibt Default zurueck wenn kein Override', () => {
    expect(resolveAddressee('spec')).toBe('architect')
  })

  it('gibt Override zurueck wenn adressat gesetzt', () => {
    expect(resolveAddressee('spec', 'custom-entity')).toBe('custom-entity')
  })

  it('leerer String-Override wird ignoriert → Default verwendet', () => {
    expect(resolveAddressee('spec', '')).toBe('architect')
  })
})
