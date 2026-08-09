import {
  assertBalanced,
  type EntryTarget,
  type TransactionDraft,
  type TransactionType,
} from '@/domain/accounting'
import type { StoredEntry, StoredTransaction, TransactionWithEntries } from '@/domain/entities'
import type { Clock } from '@/domain/time'
import { toUtcIso } from '@/domain/time'
import type { IdGenerator } from '@/domain/identity'

import type { SqliteExecutor, SqlStatement, SqlValue } from '../core/types'
import { BaseRepository } from './base-repository'

interface TransactionRow extends Omit<StoredTransaction, 'merchant' | 'counterparty' | 'note'> {
  merchant: string | null
  counterparty: string | null
  note: string | null
}

interface EntryRow extends Omit<StoredEntry, 'accountId' | 'categoryId'> {
  accountId: string | null
  categoryId: string | null
}

export interface AccountActivityRecord {
  id: string
  transactionId: string
  type: StoredTransaction['type']
  amountMinor: number
  changeMinor: number
  occurredAt: string
  originalOccurredAt?: string
  title: string
  merchant?: string
  counterparty?: string
  categoryName?: string
  accountName: string
  sourceAccountName?: string
  targetAccountName?: string
  ledgerName: string
  note?: string
}

interface AccountActivityRow extends Omit<
  AccountActivityRecord,
  | 'note'
  | 'originalOccurredAt'
  | 'merchant'
  | 'counterparty'
  | 'categoryName'
  | 'sourceAccountName'
  | 'targetAccountName'
> {
  note: string | null
  originalOccurredAt: string | null
  merchant: string | null
  counterparty: string | null
  categoryName: string | null
  sourceAccountName: string | null
  targetAccountName: string | null
}

export interface TransactionSearchFilter {
  ledgerId: string
  keyword?: string
  startUtc?: string
  endUtc?: string
  accountId?: string
  categoryId?: string
  type?: TransactionType
  minAmountMinor?: number
  maxAmountMinor?: number
  includeVoid?: boolean
  limit?: number
}

export interface TransactionSearchResultItem {
  id: string
  type: TransactionType
  amountMinor: number
  occurredAt: string
  merchant?: string
  counterparty?: string
  note?: string
  categoryName?: string
  primaryAccountName?: string
  sourceAccountName?: string
  targetAccountName?: string
  originalAmountMinor?: number
  discountMinor?: number
}

export interface TransactionDiscountRecord {
  originalAmountMinor: number
  discountMinor: number
}

interface SearchRow {
  id: string
  type: TransactionType
  amountMinor: number
  occurredAt: string
  merchant: string | null
  counterparty: string | null
  note: string | null
  categoryName: string | null
  primaryAccountName: string | null
  sourceAccountName: string | null
  targetAccountName: string | null
  originalAmountMinor: number | null
  discountMinor: number | null
}

export class TransactionRepository extends BaseRepository {
  constructor(
    database: SqliteExecutor,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {
    super(database)
  }

  async create(
    ledgerId: string,
    draft: TransactionDraft,
    link?: { originalTransactionId: string; relationType: 'refund' },
    attachmentDataUris: readonly string[] = [],
    discount?: TransactionDiscountRecord,
  ): Promise<TransactionWithEntries> {
    return this.write(ledgerId, draft, link, undefined, attachmentDataUris, discount)
  }

  async replace(
    ledgerId: string,
    replacedTransactionId: string,
    draft: TransactionDraft,
    link?: { originalTransactionId: string; relationType: 'refund' },
    attachmentDataUris: readonly string[] = [],
    discount?: TransactionDiscountRecord,
  ): Promise<TransactionWithEntries> {
    return this.write(ledgerId, draft, link, replacedTransactionId, attachmentDataUris, discount)
  }

  private async write(
    ledgerId: string,
    draft: TransactionDraft,
    link?: { originalTransactionId: string; relationType: 'refund' },
    replacedTransactionId?: string,
    attachmentDataUris: readonly string[] = [],
    discount?: TransactionDiscountRecord,
  ): Promise<TransactionWithEntries> {
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
      counterparty: draft.counterparty,
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
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
          transaction.counterparty ?? null,
          transaction.note ?? null,
          transaction.createdAt,
          transaction.updatedAt,
        ],
      },
      ...entries.map(entryInsert),
    ]
    if (replacedTransactionId) {
      statements.unshift({
        statement: `UPDATE transactions SET status = 'void', updated_at = ?
          WHERE id = ? AND ledger_id = ? AND status = 'posted'`,
        values: [createdAt, replacedTransactionId, ledgerId],
      })
    }
    if (link) {
      statements.push({
        statement: `INSERT INTO transaction_links (
          transaction_id, original_transaction_id, relation_type, created_at
        ) VALUES (?, ?, ?, ?)`,
        values: [transaction.id, link.originalTransactionId, link.relationType, createdAt],
      })
    }
    if (discount) {
      statements.push({
        statement: `INSERT INTO transaction_discounts (
          transaction_id, original_amount_minor, discount_minor, created_at
        ) VALUES (?, ?, ?, ?)`,
        values: [transaction.id, discount.originalAmountMinor, discount.discountMinor, createdAt],
      })
    }
    attachmentDataUris.forEach((dataUri, index) => {
      const mimeType = /^data:([^;,]+)[;,]/.exec(dataUri)?.[1] ?? 'application/octet-stream'
      statements.push({
        statement: `INSERT INTO transaction_attachments (
          id, transaction_id, mime_type, data_uri, created_at
        ) VALUES (?, ?, ?, ?, ?)`,
        values: [
          `${transaction.id}_attachment_${index}`,
          transaction.id,
          mimeType,
          dataUri,
          createdAt,
        ],
      })
    })
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

  async findDiscount(transactionId: string): Promise<TransactionDiscountRecord | undefined> {
    const rows = await this.database.query<TransactionDiscountRecord>(
      `SELECT original_amount_minor AS originalAmountMinor, discount_minor AS discountMinor
       FROM transaction_discounts WHERE transaction_id = ? LIMIT 1`,
      [transactionId],
    )
    return rows[0]
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

  async voidTransaction(id: string, updatedAt: string): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `UPDATE transactions SET status = 'void', updated_at = ? WHERE id = ?`,
          values: [updatedAt, id],
        },
      ],
      true,
    )
  }

  async linkRefund(
    transactionId: string,
    originalTransactionId: string,
    createdAt: string,
  ): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `INSERT INTO transaction_links (transaction_id, original_transaction_id, relation_type, created_at)
        VALUES (?, ?, 'refund', ?)`,
          values: [transactionId, originalTransactionId, createdAt],
        },
      ],
      true,
    )
  }

  async refundedAmount(originalTransactionId: string): Promise<number> {
    const rows = await this.database.query<{ amountMinor: number }>(
      `SELECT COALESCE(SUM(transactions.amount_minor), 0) AS amountMinor
       FROM transaction_links JOIN transactions ON transactions.id = transaction_links.transaction_id
       WHERE transaction_links.original_transaction_id = ?
         AND transaction_links.relation_type = 'refund' AND transactions.status = 'posted'`,
      [originalTransactionId],
    )
    return rows[0]?.amountMinor ?? 0
  }

  async originalTransactionId(transactionId: string): Promise<string | undefined> {
    const rows = await this.database.query<{ originalTransactionId: string }>(
      `SELECT original_transaction_id AS originalTransactionId
       FROM transaction_links
       WHERE transaction_id = ? AND relation_type = 'refund' LIMIT 1`,
      [transactionId],
    )
    return rows[0]?.originalTransactionId
  }

  async listAttachmentDataUris(transactionId: string): Promise<string[]> {
    const rows = await this.database.query<{ dataUri: string }>(
      `SELECT data_uri AS dataUri FROM transaction_attachments
       WHERE transaction_id = ? ORDER BY created_at, id`,
      [transactionId],
    )
    return rows.map((row) => row.dataUri)
  }

  async updateMetadata(
    id: string,
    fields: { occurredAt?: string; merchant?: string; note?: string },
    updatedAt: string,
  ): Promise<void> {
    const setClauses: string[] = ['updated_at = ?']
    const values: SqlValue[] = [updatedAt]
    if (fields.occurredAt !== undefined) {
      setClauses.unshift('occurred_at = ?')
      values.unshift(fields.occurredAt)
    }
    if (fields.merchant !== undefined) {
      setClauses.unshift('merchant = ?')
      values.unshift(fields.merchant.trim() === '' ? null : fields.merchant.trim())
    }
    if (fields.note !== undefined) {
      setClauses.unshift('note = ?')
      values.unshift(fields.note.trim() === '' ? null : fields.note.trim())
    }
    values.push(id)
    await this.database.executeSet(
      [
        {
          statement: `UPDATE transactions SET ${setClauses.join(', ')} WHERE id = ?`,
          values,
        },
      ],
      true,
    )
  }

  async listByAccount(accountId: string): Promise<AccountActivityRecord[]> {
    const rows = await this.database.query<AccountActivityRow>(
      `
        SELECT
          entries.id,
          transactions.id AS transactionId,
          transactions.type,
          transactions.amount_minor AS amountMinor,
          CASE
            WHEN entries.side = accounts.normal_balance THEN entries.amount_minor
            ELSE -entries.amount_minor
          END AS changeMinor,
          transactions.occurred_at AS occurredAt,
          original_transactions.occurred_at AS originalOccurredAt,
          transactions.merchant,
          transactions.counterparty,
          categories.name AS categoryName,
          accounts.name AS accountName,
          ledgers.name AS ledgerName,
          (SELECT source_accounts.name
            FROM entries AS source_entries
            JOIN accounts AS source_accounts ON source_accounts.id = source_entries.account_id
            WHERE source_entries.transaction_id = transactions.id
              AND source_entries.side = 'credit'
            ORDER BY source_entries.id
            LIMIT 1
          ) AS sourceAccountName,
          (SELECT target_accounts.name
            FROM entries AS target_entries
            JOIN accounts AS target_accounts ON target_accounts.id = target_entries.account_id
            WHERE target_entries.transaction_id = transactions.id
              AND target_entries.side = 'debit'
            ORDER BY target_entries.id
            LIMIT 1
          ) AS targetAccountName,
          COALESCE(transactions.counterparty, transactions.merchant, categories.name,
            CASE transactions.type
              WHEN 'opening_balance' THEN '期初余额'
              WHEN 'balance_adjustment' THEN '余额调整'
              WHEN 'loan_out' THEN '借出款'
              WHEN 'loan_recovery' THEN '收到还款'
              WHEN 'borrowing' THEN '借入款'
              WHEN 'repay_borrowing' THEN '归还借款'
              ELSE '账户流水'
            END
          ) AS title,
          transactions.note
        FROM entries
        JOIN transactions ON transactions.id = entries.transaction_id
        JOIN accounts ON accounts.id = entries.account_id
        JOIN ledgers ON ledgers.id = transactions.ledger_id
        LEFT JOIN entries AS category_entries
          ON category_entries.transaction_id = transactions.id
          AND category_entries.category_id IS NOT NULL
        LEFT JOIN categories ON categories.id = category_entries.category_id
        LEFT JOIN transaction_links ON transaction_links.transaction_id = transactions.id
          AND transaction_links.relation_type = 'refund'
        LEFT JOIN transactions AS original_transactions
          ON original_transactions.id = transaction_links.original_transaction_id
        WHERE entries.account_id = ? AND transactions.status = 'posted'
        ORDER BY transactions.occurred_at DESC, transactions.created_at DESC
      `,
      [accountId],
    )
    return rows.map((row) => ({
      ...row,
      note: row.note ?? undefined,
      originalOccurredAt: row.originalOccurredAt ?? undefined,
      merchant: row.merchant ?? undefined,
      counterparty: row.counterparty ?? undefined,
      categoryName: row.categoryName ?? undefined,
      sourceAccountName: row.sourceAccountName ?? undefined,
      targetAccountName: row.targetAccountName ?? undefined,
    }))
  }

  /**
   * 多维度搜索筛选：关键词、日期范围、账户、分类、类型、金额区间。
   * 关键词匹配 merchant / counterparty / note / category.name / account.name。
   * 账户/分类筛选命中任一相关分录。
   */
  async search(filter: TransactionSearchFilter): Promise<TransactionSearchResultItem[]> {
    const where: string[] = ['transactions.ledger_id = ?']
    const values: SqlValue[] = [filter.ledgerId]
    if (!filter.includeVoid) {
      where.push("transactions.status = 'posted'")
    }
    if (filter.keyword && filter.keyword.trim() !== '') {
      where.push(
        `(transactions.merchant LIKE ? OR transactions.counterparty LIKE ? OR transactions.note LIKE ? OR categories.name LIKE ? OR accounts.name LIKE ?)`,
      )
      const kw = `%${filter.keyword.trim()}%`
      values.push(kw, kw, kw, kw, kw)
    }
    if (filter.startUtc) {
      where.push('transactions.occurred_at >= ?')
      values.push(filter.startUtc)
    }
    if (filter.endUtc) {
      where.push('transactions.occurred_at < ?')
      values.push(filter.endUtc)
    }
    if (filter.type) {
      where.push('transactions.type = ?')
      values.push(filter.type)
    }
    if (filter.minAmountMinor !== undefined) {
      where.push('transactions.amount_minor >= ?')
      values.push(filter.minAmountMinor)
    }
    if (filter.maxAmountMinor !== undefined) {
      where.push('transactions.amount_minor <= ?')
      values.push(filter.maxAmountMinor)
    }
    if (filter.accountId) {
      where.push(
        `EXISTS (SELECT 1 FROM entries AS e_acc WHERE e_acc.transaction_id = transactions.id AND e_acc.account_id = ?)`,
      )
      values.push(filter.accountId)
    }
    if (filter.categoryId) {
      where.push(
        `EXISTS (SELECT 1 FROM entries AS e_cat
          LEFT JOIN categories AS filter_category ON filter_category.id = e_cat.category_id
          WHERE e_cat.transaction_id = transactions.id
            AND (e_cat.category_id = ? OR filter_category.parent_id = ?))`,
      )
      values.push(filter.categoryId, filter.categoryId)
    }

    const limitClause = filter.limit ? `LIMIT ${Math.max(1, Math.min(filter.limit, 1000))}` : ''
    const rows = await this.database.query<SearchRow>(
      `
        SELECT
          transactions.id,
          transactions.type,
          transactions.amount_minor AS amountMinor,
          transactions.occurred_at AS occurredAt,
          transactions.merchant,
          transactions.counterparty,
          transactions.note,
          MAX(transaction_discounts.original_amount_minor) AS originalAmountMinor,
          MAX(transaction_discounts.discount_minor) AS discountMinor,
          MAX(categories.name) AS categoryName,
          MAX(CASE
            WHEN transactions.type NOT IN ('transfer', 'repayment', 'loan_out', 'loan_recovery', 'borrowing', 'repay_borrowing')
              AND accounts.id IS NOT NULL THEN accounts.name
          END) AS primaryAccountName,
          MAX(CASE
            WHEN transactions.type IN ('transfer', 'repayment', 'loan_out', 'loan_recovery', 'borrowing', 'repay_borrowing')
              AND entries.side = 'credit' THEN accounts.name
          END) AS sourceAccountName,
          MAX(CASE
            WHEN transactions.type IN ('transfer', 'repayment', 'loan_out', 'loan_recovery', 'borrowing', 'repay_borrowing')
              AND entries.side = 'debit' THEN accounts.name
          END) AS targetAccountName
        FROM transactions
        LEFT JOIN entries ON entries.transaction_id = transactions.id
        LEFT JOIN accounts ON accounts.id = entries.account_id
        LEFT JOIN categories ON categories.id = entries.category_id
        LEFT JOIN transaction_discounts
          ON transaction_discounts.transaction_id = transactions.id
        WHERE ${where.join(' AND ')}
        GROUP BY transactions.id
        ORDER BY transactions.occurred_at DESC, transactions.created_at DESC
        ${limitClause}
      `,
      values,
    )
    return rows.map(mapSearchRow)
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
    counterparty,
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
    counterparty: row.counterparty ?? undefined,
    note: row.note ?? undefined,
  }
}

function mapSearchRow(row: SearchRow): TransactionSearchResultItem {
  return {
    id: row.id,
    type: row.type,
    amountMinor: row.amountMinor,
    occurredAt: row.occurredAt,
    merchant: row.merchant ?? undefined,
    counterparty: row.counterparty ?? undefined,
    note: row.note ?? undefined,
    categoryName: row.categoryName ?? undefined,
    primaryAccountName: row.primaryAccountName ?? undefined,
    sourceAccountName: row.sourceAccountName ?? undefined,
    targetAccountName: row.targetAccountName ?? undefined,
    originalAmountMinor: row.originalAmountMinor ?? undefined,
    discountMinor: row.discountMinor ?? undefined,
  }
}
