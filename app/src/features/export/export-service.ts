import { inject, type InjectionKey } from 'vue'

import type { TransactionType } from '@/domain/accounting'
import type { SqliteExecutor } from '@/db/core/types'

interface ExportRow {
  id: string
  type: TransactionType
  status: string
  amountMinor: number
  occurredAt: string
  merchant: string | null
  counterparty: string | null
  note: string | null
  categoryName: string | null
  primaryAccount: string | null
  sourceAccount: string | null
  targetAccount: string | null
}

export interface ExportOptions {
  readonly includeVoid?: boolean
}

export class ExportService {
  constructor(private readonly database: SqliteExecutor) {}

  async exportTransactionsCsv(ledgerId: string, options: ExportOptions = {}): Promise<string> {
    const rows = await this.listTransactions(ledgerId, options)
    const header = ['日期', '类型', '金额', '账户', '分类', '商户', '备注']
    const lines = [header.join(',')]
    for (const row of rows) {
      lines.push(
        [
          formatDate(row.occurredAt),
          typeLabel(row.type),
          formatAmount(row.amountMinor, row.type),
          escapeCsv(accountLabel(row)),
          escapeCsv(row.categoryName ?? ''),
          escapeCsv(row.merchant ?? row.counterparty ?? ''),
          escapeCsv(row.note ?? ''),
        ].join(','),
      )
    }
    return lines.join('\n')
  }

  async exportTransactionsJson(ledgerId: string, options: ExportOptions = {}): Promise<string> {
    const rows = await this.listTransactions(ledgerId, options)
    return JSON.stringify(
      rows.map((row) => ({
        id: row.id,
        date: formatDate(row.occurredAt),
        type: row.type,
        typeLabel: typeLabel(row.type),
        status: row.status,
        amount: formatAmount(row.amountMinor, row.type),
        amountMinor: row.amountMinor,
        account: accountLabel(row),
        category: row.categoryName ?? '',
        merchant: row.merchant ?? row.counterparty ?? '',
        note: row.note ?? '',
      })),
      null,
      2,
    )
  }

  private async listTransactions(ledgerId: string, options: ExportOptions): Promise<ExportRow[]> {
    const rows = await this.database.query<ExportRow>(
      `
        SELECT
          transactions.id,
          transactions.type,
          transactions.status,
          transactions.amount_minor AS amountMinor,
          transactions.occurred_at AS occurredAt,
          transactions.merchant,
          transactions.counterparty,
          transactions.note,
          MAX(categories.name) AS categoryName,
          MAX(CASE
            WHEN transactions.type NOT IN ('transfer', 'loan_out', 'loan_recovery', 'borrowing', 'repay_borrowing')
              AND accounts.id IS NOT NULL THEN accounts.name
          END) AS primaryAccount,
          MAX(CASE
            WHEN transactions.type IN ('transfer', 'loan_out', 'loan_recovery', 'borrowing', 'repay_borrowing')
              AND entries.side = 'credit' THEN accounts.name
          END) AS sourceAccount,
          MAX(CASE
            WHEN transactions.type IN ('transfer', 'loan_out', 'loan_recovery', 'borrowing', 'repay_borrowing')
              AND entries.side = 'debit' THEN accounts.name
          END) AS targetAccount
        FROM transactions
        LEFT JOIN entries ON entries.transaction_id = transactions.id
        LEFT JOIN accounts ON accounts.id = entries.account_id
        LEFT JOIN categories ON categories.id = entries.category_id
        WHERE transactions.ledger_id = ?
        GROUP BY transactions.id
        ORDER BY transactions.occurred_at DESC, transactions.created_at DESC
      `,
      [ledgerId],
    )
    if (options.includeVoid) return rows
    return rows.filter((row) => row.status === 'posted')
  }
}

function typeLabel(type: TransactionType): string {
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

function accountLabel(row: ExportRow): string {
  if (
    ['transfer', 'loan_out', 'loan_recovery', 'borrowing', 'repay_borrowing'].includes(row.type)
  ) {
    return [row.sourceAccount, row.targetAccount].filter(Boolean).join(' → ')
  }
  return row.primaryAccount ?? ''
}

function formatAmount(amountMinor: number, type: TransactionType): string {
  const yuan = (amountMinor / 100).toFixed(2)
  if (type === 'expense' || type === 'credit_purchase' || type === 'repayment') {
    return `-${yuan}`
  }
  return yuan
}

function formatDate(iso: string): string {
  return iso.slice(0, 10)
}

function escapeCsv(value: string): string {
  if (value === '') return ''
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`
  }
  return value
}

export const exportServiceKey: InjectionKey<ExportService> = Symbol('exportService')

export function useExportService(): ExportService | undefined {
  return inject(exportServiceKey, undefined)
}
