import { DatabaseSync, type SQLInputValue } from 'node:sqlite'

import type { SqliteExecutor, SqlStatement, SqlValue } from '@/db/core/types'

export class NodeSqliteExecutor implements SqliteExecutor {
  constructor(readonly database = new DatabaseSync(':memory:')) {}

  async execute(statements: string, transaction = true): Promise<void> {
    if (!transaction) {
      this.database.exec(statements)
      return
    }

    this.withTransaction(() => this.database.exec(statements))
  }

  async executeSet(statements: readonly SqlStatement[], transaction = true): Promise<number> {
    const executeAll = () => {
      let changes = 0
      for (const item of statements) {
        const result = this.database
          .prepare(item.statement)
          .run(...((item.values ?? []) as SQLInputValue[]))
        changes += Number(result.changes)
      }
      return changes
    }

    return transaction ? this.withTransaction(executeAll) : executeAll()
  }

  async query<Row extends object>(
    statement: string,
    values: readonly SqlValue[] = [],
  ): Promise<Row[]> {
    return this.database.prepare(statement).all(...(values as SQLInputValue[])) as Row[]
  }

  close(): void {
    this.database.close()
  }

  private withTransaction<Result>(operation: () => Result): Result {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const result = operation()
      this.database.exec('COMMIT')
      return result
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
}
