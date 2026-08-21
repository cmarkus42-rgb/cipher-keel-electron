/**
 * Der Leser fuer Faehigkeiten — gegen echte Verzeichnisse, nicht gegen ein Attrappen-Dateisystem.
 *
 * Der interessante Teil sind nicht die gueltigen Skills, sondern die ungueltigen: ein Verzeichnis
 * ohne brauchbares Frontmatter darf nicht stillschweigend verschwinden. Ein Modell, dem eine
 * Faehigkeit fehlt, sucht sonst den Fehler bei sich.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { leseFaehigkeiten } from '../../src/main/harness/faehigkeiten'

let wurzel: string

beforeEach(() => {
  wurzel = mkdtempSync(join(tmpdir(), 'keel-faehigkeiten-'))
})

afterEach(() => {
  rmSync(wurzel, { recursive: true, force: true })
})

function lege(unterwurzel: string, verzeichnis: string, inhalt: string): void {
  const ziel = join(wurzel, '.claude', unterwurzel, verzeichnis)
  mkdirSync(ziel, { recursive: true })
  writeFileSync(join(ziel, 'SKILL.md'), inhalt, 'utf-8')
}

const GUELTIG = (name: string, beschreibung = 'Tut etwas Bestimmtes.') =>
  `---\nname: ${name}\ndescription: ${beschreibung}\n---\n\n# ${name}\n\nDer Rumpf.\n`

describe('leseFaehigkeiten', () => {
  it('liest einen gueltigen Skill mit Name, Beschreibung und Rumpf', () => {
    lege('skills', 'web-recherche', GUELTIG('web-recherche', 'Sucht im Netz und liest Seiten.'))
    const befund = leseFaehigkeiten(wurzel)
    expect(befund.uebersprungen).toEqual([])
    expect(befund.faehigkeiten).toHaveLength(1)
    expect(befund.faehigkeiten[0].name).toBe('web-recherche')
    expect(befund.faehigkeiten[0].beschreibung).toBe('Sucht im Netz und liest Seiten.')
    expect(befund.faehigkeiten[0].rumpf).toContain('Der Rumpf.')
    // Der Rumpf ist der Rumpf: das Frontmatter gehoert nicht mit in den Verlauf.
    expect(befund.faehigkeiten[0].rumpf).not.toContain('description:')
  })

  it('gibt bei fehlender Wurzel eine leere Liste zurueck, ohne zu werfen', () => {
    const befund = leseFaehigkeiten(wurzel)
    expect(befund.faehigkeiten).toEqual([])
    expect(befund.uebersprungen).toEqual([])
  })

  it('ueberspringt ein Verzeichnis ohne SKILL.md und nennt es', () => {
    mkdirSync(join(wurzel, '.claude', 'skills', 'leer'), { recursive: true })
    const befund = leseFaehigkeiten(wurzel)
    expect(befund.faehigkeiten).toEqual([])
    expect(befund.uebersprungen).toHaveLength(1)
    expect(befund.uebersprungen[0].pfad).toContain('leer')
    expect(befund.uebersprungen[0].grund).toContain('SKILL.md')
  })

  it('ueberspringt eine SKILL.md ganz ohne Frontmatter und nennt sie', () => {
    lege('skills', 'ohne-kopf', '# Nur Text\n\nkein Frontmatter hier.\n')
    const befund = leseFaehigkeiten(wurzel)
    expect(befund.faehigkeiten).toEqual([])
    expect(befund.uebersprungen).toHaveLength(1)
    expect(befund.uebersprungen[0].pfad).toContain('ohne-kopf')
    expect(befund.uebersprungen[0].grund).toContain('name')
  })

  it('ueberspringt eine SKILL.md ohne description und nennt das Feld', () => {
    lege('skills', 'halb', '---\nname: halb\n---\n\nRumpf.\n')
    const befund = leseFaehigkeiten(wurzel)
    expect(befund.faehigkeiten).toEqual([])
    expect(befund.uebersprungen[0].grund).toContain('description')
  })

  it('ueberspringt einen Namen mit unerlaubten Zeichen und nennt die Regel', () => {
    lege('skills', 'Gross_Schreibung', GUELTIG('Gross_Schreibung'))
    const befund = leseFaehigkeiten(wurzel)
    expect(befund.faehigkeiten).toEqual([])
    expect(befund.uebersprungen[0].grund).toContain('name')
  })

  it('ueberspringt eine zu lange description', () => {
    lege('skills', 'lang', GUELTIG('lang', 'x'.repeat(1025)))
    const befund = leseFaehigkeiten(wurzel)
    expect(befund.faehigkeiten).toEqual([])
    expect(befund.uebersprungen[0].grund).toContain('description')
  })

  it('ueberspringt einen Skill, dessen name nicht dem Verzeichnisnamen entspricht', () => {
    lege('skills', 'verzeichnis-a', GUELTIG('name-b'))
    const befund = leseFaehigkeiten(wurzel)
    expect(befund.faehigkeiten).toEqual([])
    expect(befund.uebersprungen).toHaveLength(1)
    expect(befund.uebersprungen[0].grund).toContain('verzeichnis-a')
    expect(befund.uebersprungen[0].grund).toContain('name-b')
  })

  it('ueberspringt kaputtes YAML im Frontmatter, statt den ganzen Leser mitzureissen', () => {
    lege('skills', 'kaputt', '---\nname: [unbalanced\ndescription: x\n---\n\nRumpf.\n')
    lege('skills', 'heil', GUELTIG('heil'))
    const befund = leseFaehigkeiten(wurzel)
    // Der heile Skill kommt trotzdem durch — ein kaputter Nachbar darf ihn nicht mitnehmen.
    expect(befund.faehigkeiten.map(f => f.name)).toEqual(['heil'])
    expect(befund.uebersprungen).toHaveLength(1)
    expect(befund.uebersprungen[0].pfad).toContain('kaputt')
  })

  it('liest beide Wurzeln: .claude/skills und .claude/capabilities', () => {
    lege('skills', 'aus-skills', GUELTIG('aus-skills'))
    lege('capabilities', 'aus-capabilities', GUELTIG('aus-capabilities'))
    const befund = leseFaehigkeiten(wurzel)
    expect(befund.faehigkeiten.map(f => f.name).sort()).toEqual(['aus-capabilities', 'aus-skills'])
  })

  it('laesst bei Namensgleichheit .claude/skills gewinnen und nennt die verdraengte', () => {
    lege('skills', 'doppelt', GUELTIG('doppelt', 'Aus skills.'))
    lege('capabilities', 'doppelt', GUELTIG('doppelt', 'Aus capabilities.'))
    const befund = leseFaehigkeiten(wurzel)
    expect(befund.faehigkeiten).toHaveLength(1)
    expect(befund.faehigkeiten[0].beschreibung).toBe('Aus skills.')
    expect(befund.uebersprungen).toHaveLength(1)
    expect(befund.uebersprungen[0].pfad).toContain('capabilities')
    expect(befund.uebersprungen[0].grund).toContain('doppelt')
  })

  it('ist eine reine Funktion: zwei Aufrufe liefern dieselbe Reihenfolge', () => {
    lege('skills', 'b-zweite', GUELTIG('b-zweite'))
    lege('skills', 'a-erste', GUELTIG('a-erste'))
    const eins = leseFaehigkeiten(wurzel).faehigkeiten.map(f => f.name)
    const zwei = leseFaehigkeiten(wurzel).faehigkeiten.map(f => f.name)
    expect(eins).toEqual(zwei)
  })

  it('nimmt eine Datei, die direkt in der Wurzel liegt, nicht fuer ein Skill-Verzeichnis', () => {
    mkdirSync(join(wurzel, '.claude', 'skills'), { recursive: true })
    writeFileSync(join(wurzel, '.claude', 'skills', 'README.md'), 'nichts', 'utf-8')
    const befund = leseFaehigkeiten(wurzel)
    expect(befund.faehigkeiten).toEqual([])
    expect(befund.uebersprungen).toEqual([])
  })
})
