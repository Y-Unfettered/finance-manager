import type { SQLiteDBConnection } from '@capacitor-community/sqlite'

import type { SqliteExecutor, SqlStatement, SqlValue } from './core/types'

export class CapacitorSqliteExecutor implements SqliteExecutor {
  constructor(private readonly connection: SQLiteDBConnection) {}

  async execute(statements: string, transaction = true): Promise<void> {
    await this.connection.execute(statements, transaction)
  }

  async executeSet(statements: readonly SqlStatement[], transaction = true): Promise<number> {
    if (statements.length === 0) {
      return 0
    }

    const result = await this.connection.executeSet(
      statements.map(({ statement, values = [] }) => ({ statement, values: [...values] })),
      transaction,
    )
    return result.changes?.changes ?? 0
  }

  async query<Row extends object>(
    statement: string,
    values: readonly SqlValue[] = [],
  ): Promise<Row[]> {
    const result = await this.connection.query(statement, [...values])
    return (result.values ?? []) as Row[]
  }
}
