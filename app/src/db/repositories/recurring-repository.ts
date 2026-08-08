import type {
  RecurringFrequency,
  RecurringTransactionRecord,
  RecurringTransactionWithTemplate,
} from '@/domain/entities'
import type { SqlValue } from '@/db/core/types'
import { BaseRepository } from '@/db/repositories/base-repository'

interface RecurringRow extends Omit<
  RecurringTransactionRecord,
  'endDate' | 'lastExecutedAt' | 'lastTransactionId' | 'enabled'
> {
  end_date: string | null
  last_executed_at: string | null
  last_transaction_id: string | null
  enabled: number
}

interface RecurringWithTemplateRow extends RecurringRow {
  templateName: string
  transactionType: string
  amountMinor: number
}

export interface CreateRecurringInput {
  ledgerId: string
  templateId: string
  frequency: RecurringFrequency
  intervalValue?: number
  nextOccurrenceAt: string
  endDate?: string
  enabled?: boolean
}

export interface UpdateRecurringInput {
  ledgerId: string
  recurringId: string
  frequency?: RecurringFrequency
  intervalValue?: number
  nextOccurrenceAt?: string
  endDate?: string
  enabled?: boolean
}

export class RecurringRepository extends BaseRepository {
  async create(record: RecurringTransactionRecord): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `
            INSERT INTO recurring_transactions (
              id, ledger_id, template_id, frequency, interval_value,
              next_occurrence_at, end_date, last_executed_at, last_transaction_id,
              enabled, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          values: [
            record.id,
            record.ledgerId,
            record.templateId,
            record.frequency,
            record.intervalValue,
            record.nextOccurrenceAt,
            record.endDate ?? null,
            record.lastExecutedAt ?? null,
            record.lastTransactionId ?? null,
            record.enabled ? 1 : 0,
            record.createdAt,
            record.updatedAt,
          ] as SqlValue[],
        },
      ],
      true,
    )
  }

  async update(
    id: string,
    fields: Omit<UpdateRecurringInput, 'ledgerId' | 'recurringId'>,
    lastTransactionId: string | undefined,
    updatedAt: string,
  ): Promise<void> {
    const setClauses: string[] = ['updated_at = ?']
    const values: SqlValue[] = [updatedAt]
    if (fields.frequency !== undefined) {
      setClauses.unshift('frequency = ?')
      values.unshift(fields.frequency)
    }
    if (fields.intervalValue !== undefined) {
      setClauses.unshift('interval_value = ?')
      values.unshift(fields.intervalValue)
    }
    if (fields.nextOccurrenceAt !== undefined) {
      setClauses.unshift('next_occurrence_at = ?')
      values.unshift(fields.nextOccurrenceAt)
    }
    if (fields.endDate !== undefined) {
      setClauses.unshift('end_date = ?')
      values.unshift(fields.endDate || null)
    }
    if (fields.enabled !== undefined) {
      setClauses.unshift('enabled = ?')
      values.unshift(fields.enabled ? 1 : 0)
    }
    if (lastTransactionId !== undefined) {
      setClauses.unshift('last_transaction_id = ?')
      values.unshift(lastTransactionId)
    }
    values.push(id)
    await this.database.executeSet(
      [
        {
          statement: `UPDATE recurring_transactions SET ${setClauses.join(', ')} WHERE id = ?`,
          values,
        },
      ],
      true,
    )
  }

  async findById(id: string): Promise<RecurringTransactionRecord | undefined> {
    const rows = await this.database.query<RecurringRow>(
      `${RECURRING_SELECT} WHERE id = ? LIMIT 1`,
      [id],
    )
    return rows[0] ? mapRecurring(rows[0]) : undefined
  }

  async listByLedger(ledgerId: string): Promise<RecurringTransactionWithTemplate[]> {
    const rows = await this.database.query<RecurringWithTemplateRow>(
      `${RECURRING_WITH_TEMPLATE_SELECT} WHERE recurring.ledger_id = ?
       ORDER BY recurring.next_occurrence_at ASC`,
      [ledgerId],
    )
    return rows.map(mapRecurringWithTemplate)
  }

  async listDueBefore(
    ledgerId: string,
    beforeIso: string,
  ): Promise<RecurringTransactionWithTemplate[]> {
    const rows = await this.database.query<RecurringWithTemplateRow>(
      `${RECURRING_WITH_TEMPLATE_SELECT}
       WHERE recurring.ledger_id = ?
         AND recurring.enabled = 1
         AND recurring.next_occurrence_at <= ?
       ORDER BY recurring.next_occurrence_at ASC`,
      [ledgerId, beforeIso],
    )
    return rows.map(mapRecurringWithTemplate)
  }

  async delete(id: string): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `DELETE FROM recurring_transactions WHERE id = ?`,
          values: [id] as SqlValue[],
        },
      ],
      true,
    )
  }
}

const RECURRING_SELECT = `
  SELECT
    id,
    ledger_id AS ledgerId,
    template_id AS templateId,
    frequency,
    interval_value AS intervalValue,
    next_occurrence_at AS nextOccurrenceAt,
    end_date AS end_date,
    last_executed_at AS last_executed_at,
    last_transaction_id AS last_transaction_id,
    enabled,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM recurring_transactions
`

const RECURRING_WITH_TEMPLATE_SELECT = `
  SELECT
    recurring.id,
    recurring.ledger_id AS ledgerId,
    recurring.template_id AS templateId,
    recurring.frequency,
    recurring.interval_value AS intervalValue,
    recurring.next_occurrence_at AS nextOccurrenceAt,
    recurring.end_date AS end_date,
    recurring.last_executed_at AS last_executed_at,
    recurring.last_transaction_id AS last_transaction_id,
    recurring.enabled,
    recurring.created_at AS createdAt,
    recurring.updated_at AS updatedAt,
    templates.name AS templateName,
    templates.transaction_type AS transactionType,
    templates.amount_minor AS amountMinor
  FROM recurring_transactions AS recurring
  JOIN transaction_templates AS templates ON templates.id = recurring.template_id
`

function mapRecurring(row: RecurringRow): RecurringTransactionRecord {
  return {
    id: row.id,
    ledgerId: row.ledgerId,
    templateId: row.templateId,
    frequency: row.frequency,
    intervalValue: row.intervalValue,
    nextOccurrenceAt: row.nextOccurrenceAt,
    endDate: row.end_date ?? undefined,
    lastExecutedAt: row.last_executed_at ?? undefined,
    lastTransactionId: row.last_transaction_id ?? undefined,
    enabled: row.enabled === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function mapRecurringWithTemplate(row: RecurringWithTemplateRow): RecurringTransactionWithTemplate {
  return {
    ...mapRecurring(row),
    templateName: row.templateName,
    transactionType: row.transactionType as RecurringTransactionWithTemplate['transactionType'],
    amountMinor: row.amountMinor,
  }
}
