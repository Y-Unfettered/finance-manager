import type { Migration, SqliteExecutor } from './core/types'
import { APP_MIGRATIONS } from './migrations'

interface MigrationRow {
  version: unknown
}

const MIGRATION_TABLE_SQL = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
`

export async function runMigrations(
  database: SqliteExecutor,
  migrations: readonly Migration[] = APP_MIGRATIONS,
  now: () => string = () => new Date().toISOString(),
): Promise<number[]> {
  validateMigrationList(migrations)
  await database.execute(MIGRATION_TABLE_SQL, false)

  const rows = await database.query<MigrationRow>(
    'SELECT version FROM schema_migrations ORDER BY version ASC',
  )
  const appliedVersions = rows.map((row) => parseVersion(row.version))
  validateAppliedVersions(appliedVersions, migrations)

  const appliedSet = new Set(appliedVersions)
  const newlyApplied: number[] = []

  for (const migration of migrations) {
    if (appliedSet.has(migration.version)) {
      continue
    }

    const recordSql = `INSERT INTO schema_migrations (version, name, applied_at) VALUES (${migration.version}, '${escapeSqlText(migration.name)}', '${escapeSqlText(now())}');`

    // Split migration SQL by PRAGMA statements. PRAGMAs must run outside
    // transactions (SQLite defers them until COMMIT), while other SQL runs
    // in a transaction for atomicity.
    const parts = splitByPragma(migration.statements)
    const dataCount = parts.filter((p) => p.type === 'data').length
    let dataIndex = 0

    for (const part of parts) {
      if (part.type === 'pragma') {
        await database.execute(part.statement, false)
      } else {
        dataIndex += 1
        const withRecord = dataIndex === dataCount ? part.statement + '\n' + recordSql : part.statement
        await database.execute(withRecord, true)
      }
    }
    newlyApplied.push(migration.version)
  }

  return newlyApplied
}

function validateMigrationList(migrations: readonly Migration[]): void {
  let previousVersion = 0
  for (const migration of migrations) {
    if (!Number.isSafeInteger(migration.version) || migration.version <= previousVersion) {
      throw new Error('Migrations must use unique, strictly increasing positive versions')
    }
    if (migration.name.trim() === '' || migration.statements.trim() === '') {
      throw new Error(`Migration ${migration.version} must have a name and SQL statements`)
    }
    previousVersion = migration.version
  }
}

function validateAppliedVersions(
  appliedVersions: readonly number[],
  migrations: readonly Migration[],
): void {
  const knownVersions = new Set(migrations.map((migration) => migration.version))
  for (const version of appliedVersions) {
    if (!knownVersions.has(version)) {
      throw new Error(`Database schema version ${version} is newer than or unknown to this app`)
    }
  }

  for (let index = 0; index < appliedVersions.length; index += 1) {
    if (appliedVersions[index] !== migrations[index]?.version) {
      throw new Error('Applied database migrations are not a valid prefix of the app migrations')
    }
  }
}

function parseVersion(value: unknown): number {
  const version = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new Error(`Invalid schema migration version: ${String(value)}`)
  }
  return version
}

function escapeSqlText(value: string): string {
  return value.replaceAll("'", "''")
}

/**
 * Split migration SQL into blocks, separating PRAGMA statements from other SQL.
 * PRAGMA statements must run outside transactions (SQLite defers them until
 * COMMIT), while other SQL runs in a transaction for atomicity.
 *
 * Example input:
 *   "PRAGMA foreign_keys = OFF;\nCREATE TABLE x(...);\nPRAGMA foreign_keys = ON;"
 *
 * Output: [{type:'pragma', statement:'PRAGMA foreign_keys = OFF;'},
 *          {type:'data', statement:'CREATE TABLE x(...);'},
 *          {type:'pragma', statement:'PRAGMA foreign_keys = ON;'}]
 */
function splitByPragma(sql: string): Array<{ type: 'pragma'; statement: string } | { type: 'data'; statement: string }> {
  const parts: Array<{ type: 'pragma'; statement: string } | { type: 'data'; statement: string }> = []
  let buffer = ''
  let type: 'pragma' | 'data' | null = null

  function flush() {
    const trimmed = buffer.trim()
    if (trimmed.length > 0) {
      parts.push({ type: type as 'pragma' | 'data', statement: trimmed })
    }
    buffer = ''
  }

  const lines = sql.split('\n')
  for (const raw of lines) {
    const line = raw.trim()
    if (line.length === 0 || line.startsWith('--')) {
      buffer += raw + '\n'
      continue
    }

    const isPragma = /^\s*PRAGMA\b/i.test(line)

    if (type === null) {
      type = isPragma ? 'pragma' : 'data'
    } else if (type !== (isPragma ? 'pragma' : 'data')) {
      flush()
      type = isPragma ? 'pragma' : 'data'
    }

    buffer += raw + '\n'
  }
  flush()

  return parts
}
