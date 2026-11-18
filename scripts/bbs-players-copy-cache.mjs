import { realpathSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const [outFile, ...sources] = process.argv.slice(2).map((file) => realpathSync(file))
if (!outFile || !sources.length || sources.includes(outFile))
  throw new Error('Pass a separate migrated destination D1 SQLite file followed by source files')
const output = new DatabaseSync(outFile)
const insert = output.prepare(`
  INSERT OR IGNORE INTO nba_cache
    (cache_key, capability, provider, record_json, expires_at_ms, stale_until_ms, updated_at_ms)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`)
output.exec('BEGIN IMMEDIATE')
let copied = 0
try {
  for (const file of sources) {
    const source = new DatabaseSync(file, { readOnly: true })
    try {
      for (const row of source
        .prepare(
          `
        SELECT cache_key, capability, provider, record_json, expires_at_ms, stale_until_ms, updated_at_ms
        FROM nba_cache
      `,
        )
        .iterate())
        copied += Number(insert.run(...Object.values(row)).changes)
    } finally {
      source.close()
    }
  }
  output.exec('COMMIT')
} catch (error) {
  output.exec('ROLLBACK')
  throw error
} finally {
  output.close()
}
console.log(`Copied ${copied} cache rows without overwriting any destination rows`)
