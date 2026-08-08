import type { SqlStatement } from '../core/types'
import { BaseRepository } from './base-repository'
import type { AccountRecord, CategoryRecord, LedgerRecord } from '@/domain/entities'

interface LedgerRow {
  id: string
  name: string
  baseCurrency: 'CNY'
  periodStartDay: number
  createdAt: string
  updatedAt: string
}

export interface LedgerSummary extends LedgerRow {
  archivedAt?: string
  transactionCount: number
}

interface LedgerSummaryRow extends LedgerRow {
  archivedAt: string | null
  transactionCount: number
}

export interface LedgerDefaults {
  ledger: LedgerRecord
  cashAccount: AccountRecord
  categories: readonly CategoryRecord[]
}

export class LedgerRepository extends BaseRepository {
  async list(): Promise<LedgerSummary[]> {
    const rows = await this.database.query<LedgerSummaryRow>(`
      SELECT ledgers.id, ledgers.name, ledgers.base_currency AS baseCurrency,
        ledgers.period_start_day AS periodStartDay, ledgers.created_at AS createdAt,
        ledgers.updated_at AS updatedAt, ledger_preferences.archived_at AS archivedAt,
        COUNT(transactions.id) AS transactionCount
      FROM ledgers
      LEFT JOIN ledger_preferences ON ledger_preferences.ledger_id = ledgers.id
      LEFT JOIN transactions ON transactions.ledger_id = ledgers.id
      GROUP BY ledgers.id
      ORDER BY ledger_preferences.archived_at IS NOT NULL, ledgers.created_at ASC
    `)
    return rows.map((row) => ({
      ...row,
      archivedAt: row.archivedAt ?? undefined,
    }))
  }

  async findById(id: string): Promise<LedgerRecord | undefined> {
    const rows = await this.database.query<LedgerRow>(
      `
      SELECT id, name, base_currency AS baseCurrency, period_start_day AS periodStartDay,
        created_at AS createdAt, updated_at AS updatedAt
      FROM ledgers WHERE id = ? LIMIT 1
    `,
      [id],
    )
    return rows[0]
  }
  async findFirst(): Promise<LedgerRecord | undefined> {
    const rows = await this.database.query<LedgerRow>(`
      SELECT
        id,
        name,
        base_currency AS baseCurrency,
        period_start_day AS periodStartDay,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM ledgers
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `)
    return rows[0]
  }

  async create(record: LedgerRecord): Promise<void> {
    await this.database.executeSet([ledgerInsert(record)], true)
  }

  async createWithDefaults(defaults: LedgerDefaults): Promise<void> {
    const statements: SqlStatement[] = [
      ledgerInsert(defaults.ledger),
      {
        statement: `
          INSERT INTO accounts (
            id, ledger_id, name, type, normal_balance, currency, institution,
            archived_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        values: [
          defaults.cashAccount.id,
          defaults.cashAccount.ledgerId,
          defaults.cashAccount.name,
          defaults.cashAccount.type,
          defaults.cashAccount.normalBalance,
          defaults.cashAccount.currency,
          defaults.cashAccount.institution ?? null,
          defaults.cashAccount.archivedAt ?? null,
          defaults.cashAccount.createdAt,
          defaults.cashAccount.updatedAt,
        ],
      },
      ...defaults.categories.map(categoryInsert),
    ]
    await this.database.executeSet(statements, true)
  }

  async rename(id: string, name: string, updatedAt: string): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: 'UPDATE ledgers SET name = ?, updated_at = ? WHERE id = ?',
          values: [name.trim(), updatedAt, id],
        },
      ],
      true,
    )
  }

  async setArchived(id: string, archivedAt: string | undefined, updatedAt: string): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `INSERT INTO ledger_preferences (ledger_id, archived_at, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(ledger_id) DO UPDATE SET archived_at = excluded.archived_at,
            updated_at = excluded.updated_at`,
          values: [id, archivedAt ?? null, updatedAt],
        },
      ],
      true,
    )
  }
}

function ledgerInsert(record: LedgerRecord): SqlStatement {
  return {
    statement: `
      INSERT INTO ledgers (
        id, name, base_currency, period_start_day, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    values: [
      record.id,
      record.name.trim(),
      record.baseCurrency,
      record.periodStartDay,
      record.createdAt,
      record.updatedAt,
    ],
  }
}

function categoryInsert(record: CategoryRecord): SqlStatement {
  return {
    statement: `
      INSERT INTO categories (
        id, ledger_id, parent_id, kind, name, sort_order, archived_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    values: [
      record.id,
      record.ledgerId,
      record.parentId ?? null,
      record.kind,
      record.name,
      record.sortOrder,
      record.archivedAt ?? null,
      record.createdAt,
      record.updatedAt,
    ],
  }
}
