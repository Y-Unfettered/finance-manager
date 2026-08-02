import { assertBalanced, type EntryTarget, type TransactionDraft } from '@/domain/accounting'
import type { StoredEntry, StoredTransaction, TransactionWithEntries } from '@/domain/entities'
import type { Clock } from '@/domain/time'
import { toUtcIso } from '@/domain/time'
import type { IdGenerator } from '@/domain/identity'

import type { SqliteExecutor, SqlStatement } from '../core/types'
import { BaseRepository } from './base-repository'

interface TransactionRow extends Omit<StoredTransaction, 'merchant' | 'note'> {
  merchant: string | null
  note: string | null
}

interface EntryRow extends Omit<StoredEntry, 'accountId' | 'categoryId'> {
  accountId: string | null
  categoryId: string | null
}

export class TransactionRepository extends BaseRepository {
  constructor(
    database: SqliteExecutor,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {
    super(database)
  }

  async create(ledgerId: string, draft: TransactionDraft): Promise<TransactionWithEntries> {
    assertBalanced(draft.entries)
    const transactionId = this.ids.next('transaction')
    const createdAt = this.clock.nowIso()
    const occurredAt = toUtcIso(draft.occurredAt)
    const entries: StoredEntry[] = draft.entries.map((entry) => ({
      id: this.ids.next('entry'),
      ledgerId,
      transactionId,
      ...targetColumns(entry.target),
      side: entry.side,
      amountMinor: entry.amountMinor,
      createdAt,
    }))

    const transaction: StoredTransaction = {
      id: transactionId,
      ledgerId,
      type: draft.type,
      status: 'posted',
      amountMinor: draft.amountMinor,
      currency: draft.currency,
      occurredAt,
      merchant: draft.merchant,
      note: draft.note,
      createdAt,
      updatedAt: createdAt,
    }

    const statements: SqlStatement[] = [
      {
        statement: `
          INSERT INTO transactions (
            id, ledger_id, type, status, amount_minor, currency, occurred_at,
            merchant, counterparty, note, capture_source, parser_version,
            confidence, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, ?, ?)
        `,
        values: [
          transaction.id,
          transaction.ledgerId,
          transaction.type,
          transaction.status,
          transaction.amountMinor,
          transaction.currency,
          transaction.occurredAt,
          transaction.merchant ?? null,
          transaction.note ?? null,
          transaction.createdAt,
          transaction.updatedAt,
        ],
      },
      ...entries.map(entryInsert),
    ]
    await this.database.executeSet(statements, true)

    return { ...transaction, entries }
  }

  async findById(id: string): Promise<TransactionWithEntries | undefined> {
    const transactionRows = await this.database.query<TransactionRow>(
      `${TRANSACTION_SELECT} WHERE id = ? LIMIT 1`,
      [id],
    )
    const row = transactionRows[0]
    if (!row) {
      return undefined
    }

    const entries = await this.listEntries(id)
    return { ...mapTransaction(row), entries }
  }

  async listByLedger(ledgerId: string): Promise<StoredTransaction[]> {
    const rows = await this.database.query<TransactionRow>(
      `${TRANSACTION_SELECT} WHERE ledger_id = ? ORDER BY occurred_at DESC, created_at DESC`,
      [ledgerId],
    )
    return rows.map(mapTransaction)
  }

  async countByLedger(ledgerId: string): Promise<number> {
    const rows = await this.database.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM transactions WHERE ledger_id = ?`,
      [ledgerId],
    )
    return rows[0]?.count ?? 0
  }

  private async listEntries(transactionId: string): Promise<StoredEntry[]> {
    const rows = await this.database.query<EntryRow>(
      `
        SELECT
          id,
          ledger_id AS ledgerId,
          transaction_id AS transactionId,
          account_id AS accountId,
          category_id AS categoryId,
          side,
          amount_minor AS amountMinor,
          created_at AS createdAt
        FROM entries
        WHERE transaction_id = ?
        ORDER BY id
      `,
      [transactionId],
    )
    return rows.map((entry) => ({
      ...entry,
      accountId: entry.accountId ?? undefined,
      categoryId: entry.categoryId ?? undefined,
    }))
  }
}

const TRANSACTION_SELECT = `
  SELECT
    id,
    ledger_id AS ledgerId,
    type,
    status,
    amount_minor AS amountMinor,
    currency,
    occurred_at AS occurredAt,
    merchant,
    note,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM transactions
`

function targetColumns(target: EntryTarget): { accountId?: string; categoryId?: string } {
  return target.kind === 'account'
    ? { accountId: target.accountId }
    : { categoryId: target.categoryId }
}

function entryInsert(entry: StoredEntry): SqlStatement {
  return {
    statement: `
      INSERT INTO entries (
        id, ledger_id, transaction_id, account_id, category_id, side,
        amount_minor, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    values: [
      entry.id,
      entry.ledgerId,
      entry.transactionId,
      entry.accountId ?? null,
      entry.categoryId ?? null,
      entry.side,
      entry.amountMinor,
      entry.createdAt,
    ],
  }
}

function mapTransaction(row: TransactionRow): StoredTransaction {
  return {
    ...row,
    merchant: row.merchant ?? undefined,
    note: row.note ?? undefined,
  }
}
