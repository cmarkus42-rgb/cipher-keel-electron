/**
 * Scaffolding Skill — standalone directory/file scaffold.
 * Callable by Architect (after decomposition) and SE (Quereinstieg).
 * CK-P3A-010
 */

import fs from 'node:fs'
import path from 'node:path'

export interface ScaffoldConfig {
  projectPath: string
  subsystems: string[]
  testFramework: 'vitest' | 'jest' | 'none'
  language: 'typescript' | 'python' | 'go'
}

export interface ScaffoldResult {
  createdDirs: string[]
  createdFiles: string[]
}

const EXT: Record<string, string> = { typescript: '.ts', python: '.py', go: '.go' }
const TEST_EXT: Record<string, string> = { typescript: '.test.ts', python: '_test.py', go: '_test.go' }

function testStub(subsystem: string, framework: string, lang: string): string {
  if (lang === 'typescript') {
    return `import { describe, it, expect } from '${framework}'\n\ndescribe('${subsystem}', () => {\n  it.todo('implement tests')\n})\n`
  }
  if (lang === 'python') return `# ${subsystem} tests\n`
  return `package ${subsystem}\n`
}

function indexStub(subsystem: string, lang: string): string {
  if (lang === 'typescript') return `// ${subsystem} module\nexport {}\n`
  if (lang === 'python') return `# ${subsystem} module\n`
  return `package ${subsystem}\n`
}

export function scaffoldProject(config: ScaffoldConfig): ScaffoldResult {
  const { projectPath, subsystems, testFramework, language } = config
  const createdDirs: string[] = []
  const createdFiles: string[] = []
  const ext = EXT[language] ?? '.ts'
  const testExt = TEST_EXT[language] ?? '.test.ts'

  for (const sub of subsystems) {
    const srcDir = path.join(projectPath, 'src', sub)
    const testDir = path.join(projectPath, 'tests', sub)

    fs.mkdirSync(srcDir, { recursive: true })
    createdDirs.push(srcDir)

    fs.mkdirSync(testDir, { recursive: true })
    createdDirs.push(testDir)

    // Index file
    const indexPath = path.join(srcDir, `index${ext}`)
    fs.writeFileSync(indexPath, indexStub(sub, language))
    createdFiles.push(indexPath)

    // Test stub
    if (testFramework !== 'none') {
      const testPath = path.join(testDir, `${sub}${testExt}`)
      fs.writeFileSync(testPath, testStub(sub, testFramework, language))
      createdFiles.push(testPath)
    }
  }

  return { createdDirs, createdFiles }
}
