import type { SQLiteDBConnection } from '@capacitor-community/sqlite'

import type { SqliteExecutor, SqlValue } from './core/types'

export class CapacitorSqliteExecutor implements SqliteExecutor {
  constructor(private readonly connection: SQLiteDBConnection) {}

  async execute(statements: string, transaction = true): Promise<void> {
    await this.connection.execute(statements, transaction)
  }

  async query<Row extends object>(
    statement: string,
    values: readonly SqlValue[] = [],
  ): Promise<Row[]> {
    const result = await this.connection.query(statement, [...values])
    return (result.values ?? []) as Row[]
  }
}
