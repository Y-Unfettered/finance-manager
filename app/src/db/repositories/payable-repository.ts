import type { PayableBalanceRecord, PayableRecord } from '@/domain/entities'

import type { SqlValue } from '../core/types'
import { BaseRepository } from './base-repository'

interface PayableRow extends Omit<PayableRecord, 'dueDate' | 'note'> {
  dueDate: string | null
  note: string | null
}

interface PayableBalanceRow extends PayableRow {
  outstandingMinor: number
}

export interface PayableUpdateFields {
  dueDate?: string
  note?: string
}

export class PayableRepository extends BaseRepository {
  async create(record: PayableRecord): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `
            INSERT INTO payables (
              id, ledger_id, account_id, borrow_transaction_id, lender,
              original_amount_minor, due_date, note, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          values: [
            record.id,
            record.ledgerId,
            record.accountId,
            record.borrowTransactionId,
            record.lender,
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

  async listByLedger(ledgerId: string): Promise<PayableBalanceRecord[]> {
    const rows = await this.database.query<PayableBalanceRow>(
      `${PAYABLE_SELECT} WHERE payables.ledger_id = ?
       ORDER BY payables.status ASC, payables.due_date IS NULL, payables.due_date,
         payables.created_at DESC`,
      [ledgerId],
    )
    return rows.map(mapPayableBalance)
  }

  async findById(id: string): Promise<PayableBalanceRecord | undefined> {
    const rows = await this.database.query<PayableBalanceRow>(
      `${PAYABLE_SELECT} WHERE payables.id = ? LIMIT 1`,
      [id],
    )
    return rows[0] ? mapPayableBalance(rows[0]) : undefined
  }

  async markSettled(id: string, updatedAt: string): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `UPDATE payables SET status = 'settled', updated_at = ? WHERE id = ?`,
          values: [updatedAt, id],
        },
      ],
      true,
    )
  }

  async update(id: string, fields: PayableUpdateFields, updatedAt: string): Promise<void> {
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
          statement: `UPDATE payables SET ${setClauses.join(', ')} WHERE id = ?`,
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
          statement: `DELETE FROM payables WHERE id = ?`,
          values: [id],
        },
      ],
      true,
    )
  }
}

const PAYABLE_SELECT = `
  SELECT
    payables.id,
    payables.ledger_id AS ledgerId,
    payables.account_id AS accountId,
    payables.borrow_transaction_id AS borrowTransactionId,
    payables.lender,
    payables.original_amount_minor AS originalAmountMinor,
    payables.due_date AS dueDate,
    payables.note,
    payables.status,
    payables.created_at AS createdAt,
    payables.updated_at AS updatedAt,
    account_balances.balance_minor AS outstandingMinor
  FROM payables
  JOIN account_balances ON account_balances.account_id = payables.account_id
`

function mapPayableBalance(row: PayableBalanceRow): PayableBalanceRecord {
  return {
    ...row,
    dueDate: row.dueDate ?? undefined,
    note: row.note ?? undefined,
  }
}
