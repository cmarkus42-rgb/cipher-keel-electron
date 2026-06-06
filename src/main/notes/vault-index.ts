/**
 * Vault Index — auto-generated index.md linking all Uebergabedokumente.
 * CK-NOTES-008
 */

import fs from 'node:fs'
import path from 'node:path'
import { graphQuery } from '../graph/query'
import { GraphWriter } from '../graph/writer'
import type Database from 'better-sqlite3'

export function generateVaultIndex(db: Database.Database, vaultPath: string): void {
  const result = graphQuery(db, { template: 'vault_index' })

  const lines: string[] = [
    '# Vault Index',
    '',
    'Automatisch generiert. Alle Uebergabedokumente dieses Projekts.',
    '',
  ]

  const docs = result.rows.filter((r: any) => r.kind === 'uebergabedokument')

  if (docs.length > 0) {
    lines.push('## Dokumente', '')
    for (const doc of docs) {
      const title = doc.title as string
      const status = doc.status as string
      if (status === 'abgeloest') {
        lines.push(`- ~~[[${title}]]~~ (abgeloest)`)
      } else {
        lines.push(`- [[${title}]]`)
      }
    }
  }

  lines.push('')

  const indexPath = path.join(vaultPath, 'index.md')
  fs.writeFileSync(indexPath, lines.join('\n'), 'utf-8')

  // Store as graph node
  const writer = new GraphWriter(db)
  writer.upsertNode({
    kind: 'note',
    title: 'Vault Index',
    path: '/vault/index.md',
    body: lines.join('\n'),
    frontmatter: { notetyp: 'vault-index' },
  })
}
