// @vitest-environment node
import { NodeSqliteExecutor } from '@/test/node-sqlite-executor'

import type { Migration } from './core/types'
import { runMigrations } from './migration-runner'
import { INITIAL_SCHEMA_MIGRATION } from './migrations/001_initial_schema'
import { RECEIVABLES_MIGRATION } from './migrations/002_receivables'
import { PAYABLES_MIGRATION } from './migrations/003_payables'
import { IMPORT_BATCHES_MIGRATION } from './migrations/004_import_batches'

const now = () => '2026-08-03T12:00:00.000Z'

describe('database migrations', () => {
  it('creates the latest schema in an empty SQLite database and is idempotent', async () => {
    const executor = new NodeSqliteExecutor()

    await expect(runMigrations(executor, undefined, now)).resolves.toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ])
    await expect(runMigrations(executor, undefined, now)).resolves.toEqual([])

    const objects = await executor.query<{ name: string; type: string }>(
      "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name",
    )
    expect(objects.map((object) => object.name)).toEqual(
      expect.arrayContaining([
        'account_balances',
        'accounts',
        'account_preferences',
        'budgets',
        'budget_policies',
        'categories',
        'category_budgets',
        'category_preferences',
        'credit_profiles',
        'entries',
        'import_batches',
        'ledgers',
        'ledger_preferences',
        'payables',
        'receivables',
        'recurring_transactions',
        'reminders',
        'schema_migrations',
        'transaction_balances',
        'transaction_templates',
        'transactions',
        'transaction_links',
        'transaction_attachments',
      ]),
    )

    const versions = await executor.query<{ version: number }>(
      'SELECT version FROM schema_migrations',
    )
    expect(versions).toEqual([
      { version: 1 },
      { version: 2 },
      { version: 3 },
      { version: 4 },
      { version: 5 },
      { version: 6 },
      { version: 7 },
      { version: 8 },
      { version: 9 },
    ])
  })

  it('calculates asset and liability balances from posted entries', async () => {
    const executor = new NodeSqliteExecutor()
    await runMigrations(executor, undefined, now)
    executor.database.exec(`
      INSERT INTO ledgers VALUES ('ledger', '日常账本', 'CNY', 1, '${now()}', '${now()}');
      INSERT INTO accounts VALUES ('bank', 'ledger', '银行卡', 'bank', 'debit', 'CNY', NULL, NULL, '${now()}', '${now()}');
      INSERT INTO accounts VALUES ('credit', 'ledger', '信用卡', 'credit_card', 'credit', 'CNY', NULL, NULL, '${now()}', '${now()}');
      INSERT INTO categories VALUES ('food', 'ledger', NULL, 'expense', '餐饮', 0, NULL, '${now()}', '${now()}');
      INSERT INTO transactions VALUES ('cash-expense', 'ledger', 'expense', 'posted', 3155, 'CNY', '${now()}', NULL, NULL, NULL, NULL, NULL, NULL, '${now()}', '${now()}', NULL);
      INSERT INTO transactions VALUES ('credit-expense', 'ledger', 'credit_purchase', 'posted', 16652, 'CNY', '${now()}', NULL, NULL, NULL, NULL, NULL, NULL, '${now()}', '${now()}', NULL);
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

  it('upgrades an existing v1 database to v2 without losing finance data', async () => {
    const executor = new NodeSqliteExecutor()
    await expect(runMigrations(executor, [INITIAL_SCHEMA_MIGRATION], now)).resolves.toEqual([1])
    executor.database.exec(
      `INSERT INTO ledgers VALUES ('ledger', '原有账本', 'CNY', 1, '${now()}', '${now()}');`,
    )

    await expect(runMigrations(executor, undefined, now)).resolves.toEqual([2, 3, 4, 5, 6, 7, 8, 9])
    expect(await executor.query<{ name: string }>('SELECT name FROM ledgers')).toEqual([
      { name: '原有账本' },
    ])
    expect(
      await executor.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'receivables'",
      ),
    ).toEqual([{ name: 'receivables' }])
    expect(
      await executor.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'payables'",
      ),
    ).toEqual([{ name: 'payables' }])
  })

  it('upgrades an existing v2 database to v3 without losing receivables', async () => {
    const executor = new NodeSqliteExecutor()
    await runMigrations(executor, [INITIAL_SCHEMA_MIGRATION, RECEIVABLES_MIGRATION], now)
    executor.database.exec(
      `INSERT INTO ledgers VALUES ('ledger', '升级账本', 'CNY', 1, '${now()}', '${now()}');`,
    )

    await expect(runMigrations(executor, undefined, now)).resolves.toEqual([3, 4, 5, 6, 7, 8, 9])
    expect(await executor.query<{ name: string }>('SELECT name FROM ledgers')).toEqual([
      { name: '升级账本' },
    ])
    expect(
      await executor.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'payables'",
      ),
    ).toEqual([{ name: 'payables' }])
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

  it('allows xlsx and json as import_batches source values after v5 migration', async () => {
    const executor = new NodeSqliteExecutor()
    await runMigrations(executor, undefined, now)
    executor.database.exec(
      `INSERT INTO ledgers VALUES ('ledger', '账本', 'CNY', 1, '${now()}', '${now()}');`,
    )
    // v5 之前 CHECK 约束只允许 csv/qianji/other，v5 后扩展到 csv/xlsx/json/qianji/other
    for (const source of ['csv', 'xlsx', 'json', 'qianji', 'other']) {
      executor.database.exec(
        `INSERT INTO import_batches (id, ledger_id, source, record_count, success_count, duplicate_count, error_count, status, created_at)
         VALUES ('batch_${source}', 'ledger', '${source}', 0, 0, 0, 0, 'active', '${now()}');`,
      )
    }
    const sources = await executor.query<{ source: string }>(
      'SELECT source FROM import_batches ORDER BY source',
    )
    expect(sources.map((row) => row.source)).toEqual(['csv', 'json', 'other', 'qianji', 'xlsx'])
  })

  it('upgrades an existing v4 database to v5 preserving import_batches data', async () => {
    const executor = new NodeSqliteExecutor()
    // 先应用到 v4
    await runMigrations(executor, [
      INITIAL_SCHEMA_MIGRATION,
      RECEIVABLES_MIGRATION,
      PAYABLES_MIGRATION,
      IMPORT_BATCHES_MIGRATION,
    ])
    // 旧约束只允许 csv/qianji/other
    executor.database.exec(
      `INSERT INTO ledgers VALUES ('ledger', '账本', 'CNY', 1, '${now()}', '${now()}');`,
    )
    executor.database.exec(
      `INSERT INTO import_batches (id, ledger_id, source, record_count, success_count, duplicate_count, error_count, status, created_at)
       VALUES ('batch_csv', 'ledger', 'csv', 3, 2, 0, 1, 'active', '${now()}');`,
    )

    // 升级到 v5/v6/v7/v8
    await expect(runMigrations(executor, undefined, now)).resolves.toEqual([5, 6, 7, 8, 9])

    // 旧数据保留
    const rows = await executor.query<{ id: string; source: string; record_count: number }>(
      'SELECT id, source, record_count FROM import_batches',
    )
    expect(rows).toEqual([{ id: 'batch_csv', source: 'csv', record_count: 3 }])

    // 新约束允许 xlsx 和 json
    executor.database.exec(
      `INSERT INTO import_batches (id, ledger_id, source, record_count, success_count, duplicate_count, error_count, status, created_at)
       VALUES ('batch_xlsx', 'ledger', 'xlsx', 1, 1, 0, 0, 'active', '${now()}');`,
    )
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

  it('allows repay_borrowing type after v6 migration', async () => {
    const executor = new NodeSqliteExecutor()
    await runMigrations(executor, undefined, now)
    executor.database.exec(`
      INSERT INTO ledgers VALUES ('ledger', '账本', 'CNY', 1, '${now()}', '${now()}');
      INSERT INTO accounts VALUES ('bank', 'ledger', '银行卡', 'bank', 'debit', 'CNY', NULL, NULL, '${now()}', '${now()}');
      INSERT INTO accounts VALUES ('credit', 'ledger', '信用卡', 'credit_card', 'credit', 'CNY', NULL, NULL, '${now()}', '${now()}');
      INSERT INTO categories VALUES ('food', 'ledger', NULL, 'expense', '餐饮', 0, NULL, '${now()}', '${now()}');
      INSERT INTO transactions (id, ledger_id, type, status, amount_minor, currency, occurred_at, created_at, updated_at)
        VALUES ('repay-tx', 'ledger', 'repay_borrowing', 'posted', 5000, 'CNY', '${now()}', '${now()}', '${now()}');
      INSERT INTO entries VALUES ('e1', 'ledger', 'repay-tx', 'credit', NULL, 'debit', 5000, '${now()}');
      INSERT INTO entries VALUES ('e2', 'ledger', 'repay-tx', 'bank', NULL, 'credit', 5000, '${now()}');
    `)

    const tx = await executor.query<{ type: string; amount_minor: number }>(
      'SELECT type, amount_minor FROM transactions WHERE id = ?',
      ['repay-tx'],
    )
    expect(tx).toEqual([{ type: 'repay_borrowing', amount_minor: 5000 }])
  })

  it('upgrades an existing v5 database to v6 preserving transactions data', async () => {
    const executor = new NodeSqliteExecutor()
    // 先应用到 v5
    await runMigrations(executor, [
      INITIAL_SCHEMA_MIGRATION,
      RECEIVABLES_MIGRATION,
      PAYABLES_MIGRATION,
      IMPORT_BATCHES_MIGRATION,
      // v5 迁移在 index.ts，这里手动引入
      (await import('./migrations/005_import_batches_source_v5'))
        .IMPORT_BATCHES_SOURCE_V5_MIGRATION,
    ])
    executor.database.exec(`
      INSERT INTO ledgers VALUES ('ledger', '账本', 'CNY', 1, '${now()}', '${now()}');
      INSERT INTO accounts VALUES ('bank', 'ledger', '银行卡', 'bank', 'debit', 'CNY', NULL, NULL, '${now()}', '${now()}');
      INSERT INTO categories VALUES ('food', 'ledger', NULL, 'expense', '餐饮', 0, NULL, '${now()}', '${now()}');
      INSERT INTO transactions (id, ledger_id, type, status, amount_minor, currency, occurred_at, created_at, updated_at)
        VALUES ('existing-tx', 'ledger', 'expense', 'posted', 2000, 'CNY', '${now()}', '${now()}', '${now()}');
      INSERT INTO entries VALUES ('e1', 'ledger', 'existing-tx', NULL, 'food', 'debit', 2000, '${now()}');
      INSERT INTO entries VALUES ('e2', 'ledger', 'existing-tx', 'bank', NULL, 'credit', 2000, '${now()}');
    `)

    // 升级到 v6/v7/v8
    await expect(runMigrations(executor, undefined, now)).resolves.toEqual([6, 7, 8, 9])

    // 旧数据保留
    const tx = await executor.query<{ id: string; type: string }>(
      'SELECT id, type FROM transactions WHERE id = ?',
      ['existing-tx'],
    )
    expect(tx).toEqual([{ id: 'existing-tx', type: 'expense' }])

    // 新约束允许 repay_borrowing
    executor.database.exec(`
      INSERT INTO transactions (id, ledger_id, type, status, amount_minor, currency, occurred_at, created_at, updated_at)
        VALUES ('repay-tx', 'ledger', 'repay_borrowing', 'posted', 5000, 'CNY', '${now()}', '${now()}', '${now()}');
    `)
    const newTx = await executor.query<{ type: string }>(
      'SELECT type FROM transactions WHERE id = ?',
      ['repay-tx'],
    )
    expect(newTx).toEqual([{ type: 'repay_borrowing' }])
  })

  it('creates v8 budget/templates/reminders tables and accepts valid records', async () => {
    const executor = new NodeSqliteExecutor()
    await runMigrations(executor, undefined, now)
    executor.database.exec(`
      INSERT INTO ledgers VALUES ('ledger', '账本', 'CNY', 1, '${now()}', '${now()}');
      INSERT INTO accounts VALUES ('bank', 'ledger', '银行卡', 'bank', 'debit', 'CNY', NULL, NULL, '${now()}', '${now()}');
      INSERT INTO categories VALUES ('food', 'ledger', NULL, 'expense', '餐饮', 0, NULL, '${now()}', '${now()}');
    `)

    // 预算
    executor.database.exec(`
      INSERT INTO budgets (id, ledger_id, period_type, period_key, total_limit_minor, note, created_at, updated_at)
      VALUES ('budget-1', 'ledger', 'monthly', '2026-08', 500000, '8月餐饮预算', '${now()}', '${now()}');
      INSERT INTO category_budgets (id, budget_id, category_id, limit_minor, created_at, updated_at)
      VALUES ('cb-1', 'budget-1', 'food', 300000, '${now()}', '${now()}');
    `)

    // 模板
    executor.database.exec(`
      INSERT INTO transaction_templates (
        id, ledger_id, name, transaction_type, amount_minor,
        category_id, source_account_id, target_account_id,
        merchant, note, sort_order, created_at, updated_at
      ) VALUES ('tpl-1', 'ledger', '早餐', 'expense', 1500,
        'food', 'bank', NULL, '便利店', NULL, 0, '${now()}', '${now()}');
    `)

    // 周期交易
    executor.database.exec(`
      INSERT INTO recurring_transactions (
        id, ledger_id, template_id, frequency, interval_value,
        next_occurrence_at, end_date, last_executed_at, last_transaction_id,
        enabled, created_at, updated_at
      ) VALUES ('r-1', 'ledger', 'tpl-1', 'daily', 1,
        '${now()}', NULL, NULL, NULL, 1, '${now()}', '${now()}');
    `)

    // 提醒
    executor.database.exec(`
      INSERT INTO reminders (
        id, ledger_id, type, account_id, title, due_date,
        amount_minor, advance_days, enabled, last_triggered_at, created_at, updated_at
      ) VALUES ('rm-1', 'ledger', 'credit_card_due', NULL, '招商信用卡还款', '2026-08-20',
        50000, 3, 1, NULL, '${now()}', '${now()}');
    `)

    const budget = await executor.query<{ period_key: string; total_limit_minor: number }>(
      'SELECT period_key, total_limit_minor FROM budgets WHERE id = ?',
      ['budget-1'],
    )
    expect(budget).toEqual([{ period_key: '2026-08', total_limit_minor: 500000 }])

    const tables = await executor.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (
        'budgets', 'category_budgets', 'transaction_templates',
        'recurring_transactions', 'reminders'
      ) ORDER BY name`,
    )
    expect(tables.map((row) => row.name)).toEqual([
      'budgets',
      'category_budgets',
      'recurring_transactions',
      'reminders',
      'transaction_templates',
    ])
  })
})
