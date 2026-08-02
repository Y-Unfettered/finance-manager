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
  accountLabel: string
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
  categoryName: string | null
  primaryAccount: string | null
  sourceAccount: string | null
  targetAccount: string | null
}

export class DashboardRepository extends BaseRepository {
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
            CASE WHEN type IN ('expense', 'credit_purchase') THEN amount_minor ELSE 0 END
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
          transactions.occurred_at AS occurredAt,
          transactions.merchant,
          MAX(categories.name) AS categoryName,
          MAX(CASE
            WHEN transactions.type <> 'transfer' AND accounts.id IS NOT NULL THEN accounts.name
          END) AS primaryAccount,
          MAX(CASE
            WHEN transactions.type = 'transfer' AND entries.side = 'credit' THEN accounts.name
          END) AS sourceAccount,
          MAX(CASE
            WHEN transactions.type = 'transfer' AND entries.side = 'debit' THEN accounts.name
          END) AS targetAccount
        FROM transactions
        LEFT JOIN entries ON entries.transaction_id = transactions.id
        LEFT JOIN accounts ON accounts.id = entries.account_id
        LEFT JOIN categories ON categories.id = entries.category_id
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
}

function mapLedgerItem(row: LedgerItemRow): LedgerListItem {
  const transferLabel = [row.sourceAccount, row.targetAccount].filter(Boolean).join(' → ')
  return {
    id: row.id,
    type: row.type,
    amountMinor: row.amountMinor,
    occurredAt: row.occurredAt,
    title: row.merchant ?? row.categoryName ?? transactionFallbackTitle(row.type),
    accountLabel: row.type === 'transfer' ? transferLabel : (row.primaryAccount ?? '未指定账户'),
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
  }
}
