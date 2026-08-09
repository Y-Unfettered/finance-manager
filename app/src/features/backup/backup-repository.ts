import type { SqliteExecutor, SqlStatement, SqlValue } from '@/db/core/types'

import type { BackupData, BackupTableName, SqlJsonValue } from './backup-types'

interface TableSchema {
  readonly name: BackupTableName
  readonly columns: readonly string[]
}

/** 各表的列定义，顺序与备份导出和恢复插入一致。 */
const TABLE_SCHEMAS: readonly TableSchema[] = [
  {
    name: 'schema_migrations',
    columns: ['version', 'name', 'applied_at'],
  },
  {
    name: 'ledgers',
    columns: ['id', 'name', 'base_currency', 'period_start_day', 'created_at', 'updated_at'],
  },
  {
    name: 'ledger_preferences',
    columns: ['ledger_id', 'archived_at', 'updated_at'],
  },
  {
    name: 'accounts',
    columns: [
      'id',
      'ledger_id',
      'name',
      'type',
      'normal_balance',
      'currency',
      'institution',
      'archived_at',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'account_preferences',
    columns: [
      'account_id',
      'brand_key',
      'icon_key',
      'color',
      'include_in_asset_stats',
      'visible_in_entry',
      'updated_at',
    ],
  },
  {
    name: 'credit_profiles',
    columns: [
      'account_id',
      'credit_limit_minor',
      'bill_day',
      'repayment_day',
      'reminder_days',
      'effective_from',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'categories',
    columns: [
      'id',
      'ledger_id',
      'parent_id',
      'kind',
      'name',
      'sort_order',
      'archived_at',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'category_preferences',
    columns: ['category_id', 'icon_key', 'color', 'updated_at'],
  },
  {
    name: 'app_settings',
    columns: ['key', 'value', 'updated_at'],
  },
  {
    name: 'import_batches',
    columns: [
      'id',
      'ledger_id',
      'source',
      'file_name',
      'parser_version',
      'field_mapping_json',
      'source_fingerprint',
      'record_count',
      'success_count',
      'duplicate_count',
      'error_count',
      'status',
      'note',
      'created_at',
      'voided_at',
    ],
  },
  {
    name: 'transactions',
    columns: [
      'id',
      'ledger_id',
      'type',
      'status',
      'amount_minor',
      'currency',
      'occurred_at',
      'merchant',
      'counterparty',
      'note',
      'capture_source',
      'parser_version',
      'confidence',
      'import_batch_id',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'transaction_links',
    columns: ['transaction_id', 'original_transaction_id', 'relation_type', 'created_at'],
  },
  {
    name: 'transaction_discounts',
    columns: ['transaction_id', 'original_amount_minor', 'discount_minor', 'created_at'],
  },
  {
    name: 'transaction_attachments',
    columns: ['id', 'transaction_id', 'mime_type', 'data_uri', 'created_at'],
  },
  {
    name: 'entries',
    columns: [
      'id',
      'ledger_id',
      'transaction_id',
      'account_id',
      'category_id',
      'side',
      'amount_minor',
      'created_at',
    ],
  },
  {
    name: 'receivables',
    columns: [
      'id',
      'ledger_id',
      'account_id',
      'loan_transaction_id',
      'borrower',
      'original_amount_minor',
      'due_date',
      'note',
      'status',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'payables',
    columns: [
      'id',
      'ledger_id',
      'account_id',
      'borrow_transaction_id',
      'lender',
      'original_amount_minor',
      'due_date',
      'note',
      'status',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'budgets',
    columns: [
      'id',
      'ledger_id',
      'period_type',
      'period_key',
      'total_limit_minor',
      'note',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'budget_policies',
    columns: ['budget_id', 'mode', 'auto_copy', 'source_period_key', 'updated_at'],
  },
  {
    name: 'category_budgets',
    columns: ['id', 'budget_id', 'category_id', 'limit_minor', 'created_at', 'updated_at'],
  },
  {
    name: 'transaction_templates',
    columns: [
      'id',
      'ledger_id',
      'name',
      'transaction_type',
      'amount_minor',
      'category_id',
      'source_account_id',
      'target_account_id',
      'merchant',
      'note',
      'sort_order',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'recurring_transactions',
    columns: [
      'id',
      'ledger_id',
      'template_id',
      'frequency',
      'interval_value',
      'next_occurrence_at',
      'end_date',
      'last_executed_at',
      'last_transaction_id',
      'enabled',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'reminders',
    columns: [
      'id',
      'ledger_id',
      'type',
      'account_id',
      'title',
      'due_date',
      'amount_minor',
      'advance_days',
      'enabled',
      'last_triggered_at',
      'created_at',
      'updated_at',
    ],
  },
]

export class BackupRepository {
  constructor(private readonly database: SqliteExecutor) {}

  async dumpAll(): Promise<BackupData> {
    const data = {} as BackupData
    for (const schema of TABLE_SCHEMAS) {
      data[schema.name] = await this.dumpTable(schema)
    }
    return data
  }

  async countAll(): Promise<Record<BackupTableName, number>> {
    const counts = {} as Record<BackupTableName, number>
    for (const schema of TABLE_SCHEMAS) {
      const rows = await this.database.query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${schema.name}`,
      )
      counts[schema.name] = rows[0]?.count ?? 0
    }
    return counts
  }

  /** 在单个事务中清空所有表并按外键顺序插入备份行。返回各表实际写入行数。 */
  async replaceAll(data: BackupData): Promise<Record<BackupTableName, number>> {
    const statements: SqlStatement[] = []
    for (const schema of [...TABLE_SCHEMAS].reverse()) {
      statements.push({ statement: `DELETE FROM ${schema.name}` })
    }
    const restored = {} as Record<BackupTableName, number>
    for (const schema of TABLE_SCHEMAS) {
      const rows = data[schema.name] ?? []
      restored[schema.name] = rows.length
      for (const row of rows) {
        statements.push({
          statement: buildInsertStatement(schema),
          values: schema.columns.map((column) => normalizeValue(row[column])),
        })
      }
    }
    await this.database.executeSet(statements, true)
    return restored
  }

  private async dumpTable(schema: TableSchema): Promise<Record<string, SqlJsonValue>[]> {
    const columnList = schema.columns.join(', ')
    const rows = await this.database.query<Record<string, SqlJsonValue>>(
      `SELECT ${columnList} FROM ${schema.name}`,
    )
    return rows
  }
}

function buildInsertStatement(schema: TableSchema): string {
  const placeholders = schema.columns.map(() => '?').join(', ')
  return `INSERT INTO ${schema.name} (${schema.columns.join(', ')}) VALUES (${placeholders})`
}

/**
 * 将备份行中的值规范化为 SQLite 可接受的类型。
 * 备份经 JSON 往返后，数值可能仍为 number，字符串仍为 string；其余非预期类型统一转为 null。
 */
function normalizeValue(value: unknown): SqlValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  return null
}

export const BACKUP_TABLE_SCHEMAS = TABLE_SCHEMAS
export type { TableSchema }
