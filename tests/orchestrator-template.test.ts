/**
 * Tests for generateWorkerAssignment (CK-INF-013)
 */
import { describe, it, expect } from 'vitest'
import { generateWorkerAssignment, WorkerAssignmentOptions } from '../src/main/session/orchestrator-template'

const base: WorkerAssignmentOptions = {
  taskText: 'Implement injectSection function',
  modul: 'CK-INF-012',
  abschlussKriterium: 'npm test passes with all inject-section tests green',
  projektPfad: '/tmp/projects/cipher-keel-electron',
  relevanteeDateien: [
    'src/main/session/inject-section.ts',
    'tests/inject-section.test.ts',
  ],
}

describe('generateWorkerAssignment', () => {
  it('includes taskText', () => {
    expect(generateWorkerAssignment(base)).toContain(base.taskText)
  })

  it('includes modul', () => {
    expect(generateWorkerAssignment(base)).toContain(base.modul)
  })

  it('includes abschlussKriterium', () => {
    expect(generateWorkerAssignment(base)).toContain(base.abschlussKriterium)
  })

  it('includes projektPfad', () => {
    expect(generateWorkerAssignment(base)).toContain(base.projektPfad)
  })

  it('includes all relevanteeDateien', () => {
    const result = generateWorkerAssignment(base)
    for (const f of base.relevanteeDateien) {
      expect(result).toContain(f)
    }
  })

  it('is parametrized — different taskText produces different output', () => {
    const r1 = generateWorkerAssignment(base)
    const r2 = generateWorkerAssignment({ ...base, taskText: 'Something completely different' })
    expect(r1).not.toBe(r2)
  })

  it('Niveau-C-Tauglichkeit: output contains all fields a new developer needs to start', () => {
    const result = generateWorkerAssignment(base)
    // Kann ein Entwickler, der das Projekt nie gesehen hat, diesen Task allein starten?
    expect(result).toContain(base.projektPfad)         // Wo liegt das Projekt?
    expect(result).toContain(base.taskText)             // Was ist zu tun?
    expect(result).toContain(base.abschlussKriterium)  // Wann ist es fertig?
    expect(result).toContain(base.modul)                // Welches Modul?
    expect(result).toContain(base.relevanteeDateien[0]) // Was soll gelesen werden?
  })
})
