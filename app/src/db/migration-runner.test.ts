// @vitest-environment node
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'

import type { Migration, SqliteExecutor, SqlValue } from './core/types'
import { runMigrations } from './migration-runner'

class NodeSqliteExecutor implements SqliteExecutor {
  constructor(readonly database = new DatabaseSync(':memory:')) {}

  async execute(statements: string, transaction = true): Promise<void> {
    if (!transaction) {
      this.database.exec(statements)
      return
    }

    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.exec(statements)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  async query<Row extends object>(
    statement: string,
    values: readonly SqlValue[] = [],
  ): Promise<Row[]> {
    return this.database.prepare(statement).all(...(values as SQLInputValue[])) as Row[]
  }
}

const now = () => '2026-08-03T12:00:00.000Z'

describe('database migrations', () => {
  it('creates schema v1 in an empty SQLite database and is idempotent', async () => {
    const executor = new NodeSqliteExecutor()

    await expect(runMigrations(executor, undefined, now)).resolves.toEqual([1])
    await expect(runMigrations(executor, undefined, now)).resolves.toEqual([])

    const objects = await executor.query<{ name: string; type: string }>(
      "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name",
    )
    expect(objects.map((object) => object.name)).toEqual(
      expect.arrayContaining([
        'account_balances',
        'accounts',
        'categories',
        'entries',
        'ledgers',
        'schema_migrations',
        'transaction_balances',
        'transactions',
      ]),
    )

    const versions = await executor.query<{ version: number }>(
      'SELECT version FROM schema_migrations',
    )
    expect(versions).toEqual([{ version: 1 }])
  })

  it('calculates asset and liability balances from posted entries', async () => {
    const executor = new NodeSqliteExecutor()
    await runMigrations(executor, undefined, now)
    executor.database.exec(`
      INSERT INTO ledgers VALUES ('ledger', '日常账本', 'CNY', 1, '${now()}', '${now()}');
      INSERT INTO accounts VALUES ('bank', 'ledger', '银行卡', 'bank', 'debit', 'CNY', NULL, NULL, '${now()}', '${now()}');
      INSERT INTO accounts VALUES ('credit', 'ledger', '信用卡', 'credit_card', 'credit', 'CNY', NULL, NULL, '${now()}', '${now()}');
      INSERT INTO categories VALUES ('food', 'ledger', NULL, 'expense', '餐饮', 0, NULL, '${now()}', '${now()}');
      INSERT INTO transactions VALUES ('cash-expense', 'ledger', 'expense', 'posted', 3155, 'CNY', '${now()}', NULL, NULL, NULL, NULL, NULL, NULL, '${now()}', '${now()}');
      INSERT INTO transactions VALUES ('credit-expense', 'ledger', 'credit_purchase', 'posted', 16652, 'CNY', '${now()}', NULL, NULL, NULL, NULL, NULL, NULL, '${now()}', '${now()}');
      INSERT INTO entries VALUES ('e1', 'ledger', 'cash-expense', NULL, 'food', 'debit', 3155, '${now()}');
      INSERT INTO entries VALUES ('e2', 'ledger', 'cash-expense', 'bank', NULL, 'credit', 3155, '${now()}');
      INSERT INTO entries VALUES ('e3', 'ledger', 'credit-expense', NULL, 'food', 'debit', 16652, '${now()}');
      INSERT INTO entries VALUES ('e4', 'ledger', 'credit-expense', 'credit', NULL, 'credit', 16652, '${now()}');
    `)

    const balances = await executor.query<{ account_id: string; balance_minor: number }>(
      'SELECT account_id, balance_minor FROM account_balances ORDER BY account_id',
    )
    expect(balances).toEqual([
      { account_id: 'bank', balance_minor: -3155 },
      { account_id: 'credit', balance_minor: 16652 },
    ])

    const transactionBalances = await executor.query<{
      transaction_id: string
      debit_minor: number
      credit_minor: number
    }>('SELECT transaction_id, debit_minor, credit_minor FROM transaction_balances')
    expect(transactionBalances).toEqual(
      expect.arrayContaining([
        { transaction_id: 'cash-expense', debit_minor: 3155, credit_minor: 3155 },
        { transaction_id: 'credit-expense', debit_minor: 16652, credit_minor: 16652 },
      ]),
    )
  })

  it('rejects an account whose normal balance conflicts with its financial type', async () => {
    const executor = new NodeSqliteExecutor()
    await runMigrations(executor, undefined, now)
    executor.database.exec(
      `INSERT INTO ledgers VALUES ('ledger', '日常账本', 'CNY', 1, '${now()}', '${now()}');`,
    )

    expect(() =>
      executor.database.exec(
        `INSERT INTO accounts VALUES ('bad-credit', 'ledger', '错误信用卡', 'credit_card', 'debit', 'CNY', NULL, NULL, '${now()}', '${now()}');`,
      ),
    ).toThrow()
  })

  it('rolls back a failed migration without recording its version', async () => {
    const executor = new NodeSqliteExecutor()
    const migrations: Migration[] = [
      {
        version: 1,
        name: 'broken',
        statements:
          'CREATE TABLE should_rollback (id INTEGER); INSERT INTO missing_table VALUES (1);',
      },
    ]

    await expect(runMigrations(executor, migrations, now)).rejects.toThrow()
    const tables = await executor.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'should_rollback'",
    )
    expect(tables).toEqual([])
    const versions = await executor.query<{ version: number }>(
      'SELECT version FROM schema_migrations',
    )
    expect(versions).toEqual([])
  })

  it('refuses an unknown database version instead of silently downgrading', async () => {
    const executor = new NodeSqliteExecutor()
    await executor.execute(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);
      INSERT INTO schema_migrations VALUES (99, 'future', '${now()}');
    `)

    await expect(runMigrations(executor, undefined, now)).rejects.toThrow(
      'Database schema version 99 is newer than or unknown to this app',
    )
  })
})
