import type { TransactionType } from '@/domain/accounting'

import { BaseRepository } from './base-repository'

export interface MonthlySummary {
  incomeMinor: number
  expenseMinor: number
  balanceMinor: number
}

export interface LedgerListItem {
  id: string
  type: TransactionType
  amountMinor: number
  occurredAt: string
  title: string
  categoryLabel?: string
  noteLabel?: string
  accountLabel: string
  originalAmountMinor?: number
  discountMinor?: number
}

export interface DailyFlowPoint {
  date: string
  incomeMinor: number
  expenseMinor: number
}

interface SummaryRow {
  incomeMinor: number
  expenseMinor: number
}

interface LedgerItemRow {
  id: string
  type: TransactionType
  amountMinor: number
  occurredAt: string
  merchant: string | null
  counterparty: string | null
  note: string | null
  categoryName: string | null
  primaryAccount: string | null
  sourceAccount: string | null
  targetAccount: string | null
  originalAmountMinor: number | null
  discountMinor: number | null
}

export class DashboardRepository extends BaseRepository {
  async getDailyFlow(
    ledgerId: string,
    startUtc: string,
    endUtc: string,
  ): Promise<DailyFlowPoint[]> {
    return this.database.query<DailyFlowPoint>(
      `
        SELECT date(occurred_at, 'localtime') AS date,
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount_minor ELSE 0 END), 0) AS incomeMinor,
          COALESCE(SUM(CASE
            WHEN type IN ('expense', 'credit_purchase') THEN amount_minor
            WHEN type = 'refund' THEN -amount_minor ELSE 0 END), 0) AS expenseMinor
        FROM transactions
        WHERE ledger_id = ? AND status = 'posted' AND occurred_at >= ? AND occurred_at < ?
        GROUP BY date(occurred_at, 'localtime')
        ORDER BY date ASC
      `,
      [ledgerId, startUtc, endUtc],
    )
  }
  async getMonthlySummary(
    ledgerId: string,
    startUtc: string,
    endUtc: string,
  ): Promise<MonthlySummary> {
    const rows = await this.database.query<SummaryRow>(
      `
        SELECT
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount_minor ELSE 0 END), 0) AS incomeMinor,
          COALESCE(SUM(
            CASE
              WHEN type IN ('expense', 'credit_purchase') THEN amount_minor
              WHEN type = 'refund' THEN -amount_minor
              ELSE 0
            END
          ), 0) AS expenseMinor
        FROM transactions
        WHERE ledger_id = ?
          AND status = 'posted'
          AND occurred_at >= ?
          AND occurred_at < ?
      `,
      [ledgerId, startUtc, endUtc],
    )
    const incomeMinor = rows[0]?.incomeMinor ?? 0
    const expenseMinor = rows[0]?.expenseMinor ?? 0
    return { incomeMinor, expenseMinor, balanceMinor: incomeMinor - expenseMinor }
  }

  async listMonthlyTransactions(
    ledgerId: string,
    startUtc: string,
    endUtc: string,
  ): Promise<LedgerListItem[]> {
    const rows = await this.database.query<LedgerItemRow>(
      `
        SELECT
          transactions.id,
          transactions.type,
          transactions.amount_minor AS amountMinor,
          MAX(transaction_discounts.original_amount_minor) AS originalAmountMinor,
          MAX(transaction_discounts.discount_minor) AS discountMinor,
          transactions.occurred_at AS occurredAt,
          transactions.merchant,
          transactions.counterparty,
          transactions.note,
          MAX(categories.name) AS categoryName,
          MAX(CASE
            WHEN transactions.type NOT IN ('transfer', 'repayment', 'loan_out', 'loan_recovery', 'borrowing', 'repay_borrowing')
              AND accounts.id IS NOT NULL THEN accounts.name
          END) AS primaryAccount,
          MAX(CASE
            WHEN transactions.type IN ('transfer', 'repayment', 'loan_out', 'loan_recovery', 'borrowing', 'repay_borrowing')
              AND entries.side = 'credit' THEN accounts.name
          END) AS sourceAccount,
          MAX(CASE
            WHEN transactions.type IN ('transfer', 'repayment', 'loan_out', 'loan_recovery', 'borrowing', 'repay_borrowing')
              AND entries.side = 'debit' THEN accounts.name
          END) AS targetAccount
        FROM transactions
        LEFT JOIN entries ON entries.transaction_id = transactions.id
        LEFT JOIN accounts ON accounts.id = entries.account_id
        LEFT JOIN categories ON categories.id = entries.category_id
        LEFT JOIN transaction_discounts
          ON transaction_discounts.transaction_id = transactions.id
        WHERE transactions.ledger_id = ?
          AND transactions.status = 'posted'
          AND transactions.occurred_at >= ?
          AND transactions.occurred_at < ?
        GROUP BY transactions.id
        ORDER BY transactions.occurred_at DESC, transactions.created_at DESC
      `,
      [ledgerId, startUtc, endUtc],
    )
    return rows.map(mapLedgerItem)
  }

  async listRecent(ledgerId: string, limit: number): Promise<LedgerListItem[]> {
    const rows = await this.database.query<LedgerItemRow>(
      `
        SELECT
          transactions.id,
          transactions.type,
          transactions.amount_minor AS amountMinor,
          MAX(transaction_discounts.original_amount_minor) AS originalAmountMinor,
          MAX(transaction_discounts.discount_minor) AS discountMinor,
          transactions.occurred_at AS occurredAt,
          transactions.merchant,
          transactions.counterparty,
          transactions.note,
          MAX(categories.name) AS categoryName,
          MAX(CASE
            WHEN transactions.type NOT IN ('transfer', 'repayment', 'loan_out', 'loan_recovery', 'borrowing', 'repay_borrowing')
              AND accounts.id IS NOT NULL THEN accounts.name
          END) AS primaryAccount,
          MAX(CASE
            WHEN transactions.type IN ('transfer', 'repayment', 'loan_out', 'loan_recovery', 'borrowing', 'repay_borrowing')
              AND entries.side = 'credit' THEN accounts.name
          END) AS sourceAccount,
          MAX(CASE
            WHEN transactions.type IN ('transfer', 'repayment', 'loan_out', 'loan_recovery', 'borrowing', 'repay_borrowing')
              AND entries.side = 'debit' THEN accounts.name
          END) AS targetAccount
        FROM transactions
        LEFT JOIN entries ON entries.transaction_id = transactions.id
        LEFT JOIN accounts ON accounts.id = entries.account_id
        LEFT JOIN categories ON categories.id = entries.category_id
        LEFT JOIN transaction_discounts
          ON transaction_discounts.transaction_id = transactions.id
        WHERE transactions.ledger_id = ?
          AND transactions.status = 'posted'
          AND transactions.type NOT IN (
            'opening_balance', 'balance_adjustment',
            'loan_out', 'loan_recovery', 'borrowing', 'repay_borrowing'
          )
        GROUP BY transactions.id
        ORDER BY transactions.created_at DESC
        LIMIT ?
      `,
      [ledgerId, limit],
    )
    return rows.map(mapLedgerItem)
  }
}

function mapLedgerItem(row: LedgerItemRow): LedgerListItem {
  const directional = [
    'transfer',
    'repayment',
    'loan_out',
    'loan_recovery',
    'borrowing',
    'repay_borrowing',
  ].includes(row.type)
  const categoryLabel = directional
    ? transactionFallbackTitle(row.type)
    : (row.categoryName ?? transactionFallbackTitle(row.type))
  const noteLabel = row.merchant ?? row.counterparty ?? row.note ?? undefined
  const transferLabel = [row.sourceAccount, row.targetAccount].filter(Boolean).join('→')
  return {
    id: row.id,
    type: row.type,
    amountMinor: row.amountMinor,
    occurredAt: row.occurredAt,
    title:
      row.merchant ?? row.counterparty ?? row.categoryName ?? transactionFallbackTitle(row.type),
    categoryLabel,
    noteLabel,
    accountLabel: directional ? transferLabel : (row.primaryAccount ?? '未指定账户'),
    originalAmountMinor: row.originalAmountMinor ?? undefined,
    discountMinor: row.discountMinor ?? undefined,
  }
}

function transactionFallbackTitle(type: TransactionType): string {
  switch (type) {
    case 'expense':
      return '支出'
    case 'income':
      return '收入'
    case 'transfer':
      return '转账'
    case 'credit_purchase':
      return '信用消费'
    case 'repayment':
      return '还款'
    case 'refund':
      return '退款'
    case 'loan_out':
      return '借出款'
    case 'loan_recovery':
      return '收到还款'
    case 'borrowing':
      return '借入款'
    case 'repay_borrowing':
      return '归还借款'
    case 'balance_adjustment':
      return '余额调整'
    case 'opening_balance':
      return '期初余额'
  }
}
