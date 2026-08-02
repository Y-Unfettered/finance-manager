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

export interface LedgerDefaults {
  ledger: LedgerRecord
  cashAccount: AccountRecord
  categories: readonly CategoryRecord[]
}

export class LedgerRepository extends BaseRepository {
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
