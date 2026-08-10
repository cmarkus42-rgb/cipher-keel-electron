// tests/preset/bodies.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ARCHITECT_BODY, CF_BODY } from '../../src/main/preset/bodies'

const SRC = path.join(__dirname, '../../src/main/preset')

describe('preset bodies are compiled into the bundle', () => {
  it('ARCHITECT_BODY matches the source file byte for byte', () => {
    const onDisk = fs.readFileSync(path.join(SRC, 'architect/architect-body.md'), 'utf-8')
    expect(ARCHITECT_BODY).toBe(onDisk)
  })

  it('CF_BODY matches the source file byte for byte', () => {
    const onDisk = fs.readFileSync(path.join(SRC, 'cyber-factory/cf-body.md'), 'utf-8')
    expect(CF_BODY).toBe(onDisk)
  })

  it('bodies are non-empty', () => {
    expect(ARCHITECT_BODY.length).toBeGreaterThan(100)
    expect(CF_BODY.length).toBeGreaterThan(100)
  })
})
