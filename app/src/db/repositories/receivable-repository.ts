import type { ReceivableBalanceRecord, ReceivableRecord } from '@/domain/entities'

import type { SqlValue } from '../core/types'
import { BaseRepository } from './base-repository'

interface ReceivableRow extends Omit<ReceivableRecord, 'dueDate' | 'note'> {
  dueDate: string | null
  note: string | null
}

interface ReceivableBalanceRow extends ReceivableRow {
  outstandingMinor: number
}

export interface ReceivableUpdateFields {
  dueDate?: string
  note?: string
}

export class ReceivableRepository extends BaseRepository {
  async create(record: ReceivableRecord): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `
            INSERT INTO receivables (
              id, ledger_id, account_id, loan_transaction_id, borrower,
              original_amount_minor, due_date, note, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          values: [
            record.id,
            record.ledgerId,
            record.accountId,
            record.loanTransactionId,
            record.borrower.trim(),
            record.originalAmountMinor,
            record.dueDate ?? null,
            record.note?.trim() || null,
            record.status,
            record.createdAt,
            record.updatedAt,
          ],
        },
      ],
      true,
    )
  }

  async listByLedger(ledgerId: string): Promise<ReceivableBalanceRecord[]> {
    const rows = await this.database.query<ReceivableBalanceRow>(
      `${RECEIVABLE_SELECT} WHERE receivables.ledger_id = ?
       ORDER BY receivables.status ASC, receivables.due_date IS NULL, receivables.due_date,
         receivables.created_at DESC`,
      [ledgerId],
    )
    return rows.map(mapReceivableBalance)
  }

  async findById(id: string): Promise<ReceivableBalanceRecord | undefined> {
    const rows = await this.database.query<ReceivableBalanceRow>(
      `${RECEIVABLE_SELECT} WHERE receivables.id = ? LIMIT 1`,
      [id],
    )
    return rows[0] ? mapReceivableBalance(rows[0]) : undefined
  }

  async markSettled(id: string, updatedAt: string): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `UPDATE receivables SET status = 'settled', updated_at = ? WHERE id = ?`,
          values: [updatedAt, id],
        },
      ],
      true,
    )
  }

  async update(id: string, fields: ReceivableUpdateFields, updatedAt: string): Promise<void> {
    const setClauses: string[] = ['updated_at = ?']
    const values: SqlValue[] = [updatedAt]
    if (fields.dueDate !== undefined) {
      setClauses.unshift('due_date = ?')
      values.unshift(fields.dueDate.trim() === '' ? null : fields.dueDate.trim())
    }
    if (fields.note !== undefined) {
      setClauses.unshift('note = ?')
      values.unshift(fields.note.trim() === '' ? null : fields.note.trim())
    }
    values.push(id)
    await this.database.executeSet(
      [
        {
          statement: `UPDATE receivables SET ${setClauses.join(', ')} WHERE id = ?`,
          values,
        },
      ],
      true,
    )
  }

  async delete(id: string): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `DELETE FROM receivables WHERE id = ?`,
          values: [id],
        },
      ],
      true,
    )
  }
}

const RECEIVABLE_SELECT = `
  SELECT
    receivables.id,
    receivables.ledger_id AS ledgerId,
    receivables.account_id AS accountId,
    receivables.loan_transaction_id AS loanTransactionId,
    receivables.borrower,
    receivables.original_amount_minor AS originalAmountMinor,
    receivables.due_date AS dueDate,
    receivables.note,
    receivables.status,
    receivables.created_at AS createdAt,
    receivables.updated_at AS updatedAt,
    account_balances.balance_minor AS outstandingMinor
  FROM receivables
  JOIN account_balances ON account_balances.account_id = receivables.account_id
`

function mapReceivableBalance(row: ReceivableBalanceRow): ReceivableBalanceRecord {
  return {
    ...row,
    dueDate: row.dueDate ?? undefined,
    note: row.note ?? undefined,
  }
}
