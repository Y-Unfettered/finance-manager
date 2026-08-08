import type { ReminderRecord, ReminderType, ReminderWithAccount } from '@/domain/entities'
import type { SqlValue } from '@/db/core/types'
import { BaseRepository } from '@/db/repositories/base-repository'

interface ReminderRow extends Omit<
  ReminderRecord,
  'accountId' | 'amountMinor' | 'lastTriggeredAt' | 'enabled' | 'dueDate' | 'type'
> {
  account_id: string | null
  amount_minor: number | null
  last_triggered_at: string | null
  enabled: number
  due_date: string
  type: string
}

interface ReminderWithAccountRow extends ReminderRow {
  accountName: string | null
}

export interface CreateReminderInput {
  ledgerId: string
  type: ReminderType
  accountId?: string
  title: string
  dueDate: string
  amountMinor?: number
  advanceDays?: number
  enabled?: boolean
}

export interface UpdateReminderInput {
  ledgerId: string
  reminderId: string
  title?: string
  dueDate?: string
  amountMinor?: number
  advanceDays?: number
  enabled?: boolean
}

export class ReminderRepository extends BaseRepository {
  async create(record: ReminderRecord): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `
            INSERT INTO reminders (
              id, ledger_id, type, account_id, title, due_date,
              amount_minor, advance_days, enabled, last_triggered_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          values: [
            record.id,
            record.ledgerId,
            record.type,
            record.accountId ?? null,
            record.title,
            record.dueDate,
            record.amountMinor ?? null,
            record.advanceDays,
            record.enabled ? 1 : 0,
            record.lastTriggeredAt ?? null,
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
    fields: Omit<UpdateReminderInput, 'ledgerId' | 'reminderId'>,
    updatedAt: string,
  ): Promise<void> {
    const setClauses: string[] = ['updated_at = ?']
    const values: SqlValue[] = [updatedAt]
    if (fields.title !== undefined) {
      setClauses.unshift('title = ?')
      values.unshift(fields.title)
    }
    if (fields.dueDate !== undefined) {
      setClauses.unshift('due_date = ?')
      values.unshift(fields.dueDate)
    }
    if (fields.amountMinor !== undefined) {
      setClauses.unshift('amount_minor = ?')
      values.unshift(fields.amountMinor)
    }
    if (fields.advanceDays !== undefined) {
      setClauses.unshift('advance_days = ?')
      values.unshift(fields.advanceDays)
    }
    if (fields.enabled !== undefined) {
      setClauses.unshift('enabled = ?')
      values.unshift(fields.enabled ? 1 : 0)
    }
    values.push(id)
    await this.database.executeSet(
      [{ statement: `UPDATE reminders SET ${setClauses.join(', ')} WHERE id = ?`, values }],
      true,
    )
  }

  async markTriggered(id: string, triggeredAt: string): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `UPDATE reminders SET last_triggered_at = ?, updated_at = ? WHERE id = ?`,
          values: [triggeredAt, triggeredAt, id] as SqlValue[],
        },
      ],
      true,
    )
  }

  async findById(id: string): Promise<ReminderRecord | undefined> {
    const rows = await this.database.query<ReminderRow>(`${REMINDER_SELECT} WHERE id = ? LIMIT 1`, [
      id,
    ])
    return rows[0] ? mapReminder(rows[0]) : undefined
  }

  async listByLedger(ledgerId: string): Promise<ReminderWithAccount[]> {
    const rows = await this.database.query<ReminderWithAccountRow>(
      `${REMINDER_WITH_ACCOUNT_SELECT} WHERE reminders.ledger_id = ?
       ORDER BY reminders.due_date ASC`,
      [ledgerId],
    )
    return rows.map(mapReminderWithAccount)
  }

  async listUpcoming(
    ledgerId: string,
    fromIso: string,
    lookaheadDays: number,
  ): Promise<ReminderWithAccount[]> {
    const endIso = new Date(
      new Date(fromIso).getTime() + lookaheadDays * 24 * 60 * 60 * 1000,
    ).toISOString()
    const rows = await this.database.query<ReminderWithAccountRow>(
      `${REMINDER_WITH_ACCOUNT_SELECT}
       WHERE reminders.ledger_id = ?
         AND reminders.enabled = 1
         AND reminders.due_date >= ?
         AND reminders.due_date <= ?
       ORDER BY reminders.due_date ASC`,
      [ledgerId, fromIso.slice(0, 10), endIso.slice(0, 10)],
    )
    return rows.map(mapReminderWithAccount)
  }

  async delete(id: string): Promise<void> {
    await this.database.executeSet(
      [{ statement: `DELETE FROM reminders WHERE id = ?`, values: [id] as SqlValue[] }],
      true,
    )
  }
}

const REMINDER_SELECT = `
  SELECT
    id,
    ledger_id AS ledgerId,
    type,
    account_id AS account_id,
    title,
    due_date AS due_date,
    amount_minor AS amount_minor,
    advance_days AS advanceDays,
    enabled,
    last_triggered_at AS last_triggered_at,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM reminders
`

const REMINDER_WITH_ACCOUNT_SELECT = `
  SELECT
    reminders.id,
    reminders.ledger_id AS ledgerId,
    reminders.type,
    reminders.account_id AS account_id,
    reminders.title,
    reminders.due_date AS due_date,
    reminders.amount_minor AS amount_minor,
    reminders.advance_days AS advanceDays,
    reminders.enabled,
    reminders.last_triggered_at AS last_triggered_at,
    reminders.created_at AS createdAt,
    reminders.updated_at AS updatedAt,
    accounts.name AS accountName
  FROM reminders
  LEFT JOIN accounts ON accounts.id = reminders.account_id
`

function mapReminder(row: ReminderRow): ReminderRecord {
  return {
    id: row.id,
    ledgerId: row.ledgerId,
    type: row.type as ReminderType,
    accountId: row.account_id ?? undefined,
    title: row.title,
    dueDate: row.due_date,
    amountMinor: row.amount_minor ?? undefined,
    advanceDays: row.advanceDays,
    enabled: row.enabled === 1,
    lastTriggeredAt: row.last_triggered_at ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function mapReminderWithAccount(row: ReminderWithAccountRow): ReminderWithAccount {
  return {
    ...mapReminder(row),
    accountName: row.accountName ?? undefined,
  }
}
