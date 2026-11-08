import type {
  ReminderManagedBy,
  ReminderRecord,
  ReminderRecurrence,
  ReminderType,
  ReminderWithAccount,
} from '@/domain/entities'
import type { SqlValue } from '@/db/core/types'
import { BaseRepository } from '@/db/repositories/base-repository'

interface ReminderRow
  extends Omit<
    ReminderRecord,
    | 'accountId'
    | 'amountMinor'
    | 'lastTriggeredAt'
    | 'enabled'
    | 'dueDate'
    | 'type'
    | 'recurrence'
    | 'managedBy'
  > {
  account_id: string | null
  amount_minor: number | null
  last_triggered_at: string | null
  enabled: number
  due_date: string
  type: string
  recurrence: string | null
  managed_by: string | null
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
  recurrence?: ReminderRecurrence
  enabled?: boolean
  /** 来源标记：'credit_profile' = 由信用卡账期自动生成；缺省 = 用户手建。 */
  managedBy?: ReminderManagedBy
}

export interface UpdateReminderInput {
  ledgerId: string
  reminderId: string
  title?: string
  dueDate?: string
  amountMinor?: number
  advanceDays?: number
  recurrence?: ReminderRecurrence
  enabled?: boolean
  /** 传 null 表示清掉"本期已处理"标记（账期改期后由自动同步清，手动编辑不传）。 */
  lastTriggeredAt?: string | null
}

export class ReminderRepository extends BaseRepository {
  async create(record: ReminderRecord): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `
            INSERT INTO reminders (
              id, ledger_id, type, account_id, title, due_date,
              amount_minor, advance_days, recurrence, enabled, last_triggered_at,
              managed_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            record.recurrence ?? 'none',
            record.enabled ? 1 : 0,
            record.lastTriggeredAt ?? null,
            record.managedBy ?? null,
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
    if (fields.recurrence !== undefined) {
      setClauses.unshift('recurrence = ?')
      values.unshift(fields.recurrence)
    }
    if (fields.enabled !== undefined) {
      setClauses.unshift('enabled = ?')
      values.unshift(fields.enabled ? 1 : 0)
    }
    if (fields.lastTriggeredAt !== undefined) {
      setClauses.unshift('last_triggered_at = ?')
      values.unshift(fields.lastTriggeredAt)
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

  /**
   * 查"某账户下由指定来源自动生成的提醒"（信用卡账期同步用）。
   * 只认带 managed_by 标记的条目——用户手工建的提醒（managed_by 为 NULL）不会被同步逻辑碰。
   */
  async findByAccountManagedBy(
    accountId: string,
    managedBy: ReminderManagedBy,
  ): Promise<ReminderRecord | undefined> {
    const rows = await this.database.query<ReminderRow>(
      `${REMINDER_SELECT} WHERE account_id = ? AND managed_by = ? ORDER BY created_at ASC LIMIT 1`,
      [accountId, managedBy],
    )
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

  /**
   * 取账本下全部启用提醒（不按日期过滤）。
   * 日期窗口/循环期次的计算在 service 层用本地日期做——原先在 SQL 里拿
   * due_date（UTC 偏移串）与本地日期串做字符串比较，UTC+8 下"今天到期"
   * 的提醒在到期当天反而查不出来（2026-11-08 排查确认），这里一并根治。
   */
  async listEnabledByLedger(ledgerId: string): Promise<ReminderWithAccount[]> {
    const rows = await this.database.query<ReminderWithAccountRow>(
      `${REMINDER_WITH_ACCOUNT_SELECT} WHERE reminders.ledger_id = ? AND reminders.enabled = 1
       ORDER BY reminders.due_date ASC`,
      [ledgerId],
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
    recurrence AS recurrence,
    enabled,
    last_triggered_at AS last_triggered_at,
    managed_by AS managed_by,
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
    reminders.recurrence AS recurrence,
    reminders.enabled,
    reminders.last_triggered_at AS last_triggered_at,
    reminders.managed_by AS managed_by,
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
    recurrence: (row.recurrence as ReminderRecurrence | null) ?? 'none',
    enabled: row.enabled === 1,
    lastTriggeredAt: row.last_triggered_at ?? undefined,
    managedBy: (row.managed_by as ReminderManagedBy | null) ?? undefined,
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
