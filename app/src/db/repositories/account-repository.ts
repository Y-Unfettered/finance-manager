import { normalBalanceForAccountType, type AccountPostingRef } from '@/domain/accounts'
import type { AccountBalanceRecord, AccountRecord } from '@/domain/entities'

import { BaseRepository } from './base-repository'
import type { SqlStatement } from '../core/types'

interface AccountRow extends Omit<AccountRecord, 'institution' | 'archivedAt'> {
  institution: string | null
  archivedAt: string | null
}

interface BalanceRow extends AccountRow {
  balanceMinor: number
  brandKey: string | null
  iconKey: string | null
  color: string | null
  includeInAssetStats: number
  visibleInEntry: number
}

export class AccountRepository extends BaseRepository {
  async create(record: AccountRecord): Promise<void> {
    if (record.normalBalance !== normalBalanceForAccountType(record.type)) {
      throw new Error(`Account ${record.id} has an invalid normal balance`)
    }

    await this.database.executeSet(
      [
        {
          statement: `
            INSERT INTO accounts (
              id, ledger_id, name, type, normal_balance, currency, institution,
              archived_at, created_at, updated_at, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM accounts WHERE ledger_id = ?))
          `,
          values: [
            record.id,
            record.ledgerId,
            record.name.trim(),
            record.type,
            record.normalBalance,
            record.currency,
            record.institution?.trim() || null,
            record.archivedAt ?? null,
            record.createdAt,
            record.updatedAt,
            record.ledgerId,
          ],
        },
      ],
      true,
    )
  }

  /**
   * 按给定顺序重排账户（资产页长按拖拽）。
   * 只更新传入账户的 sort_order 为 0..n-1；其余账户保持不变。
   */
  async reorder(ledgerId: string, orderedIds: string[], updatedAt: string): Promise<void> {
    const statements = orderedIds.map((id, index) => ({
      statement: `UPDATE accounts SET sort_order = ?, updated_at = ? WHERE id = ? AND ledger_id = ?`,
      values: [index, updatedAt, id, ledgerId],
    }))
    await this.database.executeSet(statements, true)
  }

  async findPostingRef(id: string): Promise<AccountPostingRef | undefined> {
    const rows = await this.database.query<AccountPostingRef>(
      `SELECT id, type, normal_balance AS normalBalance FROM accounts WHERE id = ? LIMIT 1`,
      [id],
    )
    return rows[0]
  }

  async listByLedger(ledgerId: string): Promise<AccountRecord[]> {
    const rows = await this.database.query<AccountRow>(
      `${ACCOUNT_SELECT} WHERE ledger_id = ? ORDER BY sort_order ASC, created_at ASC, id ASC`,
      [ledgerId],
    )
    return rows.map(mapAccount)
  }

  async listBalances(ledgerId: string): Promise<AccountBalanceRecord[]> {
    const rows = await this.database.query<BalanceRow>(
      `
        SELECT
          accounts.id,
          accounts.ledger_id AS ledgerId,
          accounts.name,
          accounts.type,
          accounts.normal_balance AS normalBalance,
          accounts.currency,
          accounts.institution,
          accounts.archived_at AS archivedAt,
          accounts.created_at AS createdAt,
          accounts.updated_at AS updatedAt,
          account_balances.balance_minor AS balanceMinor,
          account_preferences.brand_key AS brandKey,
          account_preferences.icon_key AS iconKey,
          account_preferences.color,
          COALESCE(account_preferences.include_in_asset_stats, 1) AS includeInAssetStats,
          COALESCE(account_preferences.visible_in_entry, 1) AS visibleInEntry
        FROM accounts
        JOIN account_balances ON account_balances.account_id = accounts.id
        LEFT JOIN account_preferences ON account_preferences.account_id = accounts.id
        WHERE accounts.ledger_id = ?
        ORDER BY accounts.sort_order ASC, accounts.created_at ASC, accounts.id ASC
      `,
      [ledgerId],
    )
    return rows.map(mapBalance)
  }

  async listBalancesAt(ledgerId: string, endUtc: string): Promise<AccountBalanceRecord[]> {
    const rows = await this.database.query<BalanceRow>(
      `
        SELECT
          accounts.id,
          accounts.ledger_id AS ledgerId,
          accounts.name,
          accounts.type,
          accounts.normal_balance AS normalBalance,
          accounts.currency,
          accounts.institution,
          accounts.archived_at AS archivedAt,
          accounts.created_at AS createdAt,
          accounts.updated_at AS updatedAt,
          COALESCE(SUM(CASE
            WHEN transactions.id IS NULL THEN 0
            WHEN entries.side = accounts.normal_balance THEN entries.amount_minor
            ELSE -entries.amount_minor
          END), 0) AS balanceMinor,
          account_preferences.brand_key AS brandKey,
          account_preferences.icon_key AS iconKey,
          account_preferences.color,
          COALESCE(account_preferences.include_in_asset_stats, 1) AS includeInAssetStats,
          COALESCE(account_preferences.visible_in_entry, 1) AS visibleInEntry
        FROM accounts
        LEFT JOIN entries ON entries.account_id = accounts.id
        LEFT JOIN transactions ON transactions.id = entries.transaction_id
          AND transactions.status = 'posted'
          AND transactions.occurred_at < ?
        LEFT JOIN account_preferences ON account_preferences.account_id = accounts.id
        WHERE accounts.ledger_id = ?
          AND COALESCE(account_preferences.include_in_asset_stats, 1) = 1
        GROUP BY accounts.id
        ORDER BY accounts.sort_order ASC, accounts.created_at ASC, accounts.id ASC
      `,
      [endUtc, ledgerId],
    )
    return rows.map(mapBalance)
  }

  async findBalance(id: string): Promise<AccountBalanceRecord | undefined> {
    const rows = await this.database.query<BalanceRow>(
      `${BALANCE_SELECT} WHERE accounts.id = ? LIMIT 1`,
      [id],
    )
    return rows[0] ? mapBalance(rows[0]) : undefined
  }

  async rename(id: string, name: string, updatedAt: string): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `UPDATE accounts SET name = ?, updated_at = ? WHERE id = ?`,
          values: [name.trim(), updatedAt, id],
        },
      ],
      true,
    )
  }

  async updateDetails(
    id: string,
    fields: { name: string; type: AccountRecord['type']; institution?: string },
    updatedAt: string,
  ): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `UPDATE accounts SET name = ?, type = ?, normal_balance = ?, institution = ?,
            updated_at = ? WHERE id = ?`,
          values: [
            fields.name.trim(),
            fields.type,
            normalBalanceForAccountType(fields.type),
            fields.institution?.trim() || null,
            updatedAt,
            id,
          ],
        },
      ],
      true,
    )
  }

  async archive(id: string, archivedAt: string): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `UPDATE accounts SET archived_at = ?, updated_at = ? WHERE id = ?`,
          values: [archivedAt, archivedAt, id],
        },
      ],
      true,
    )
  }

  async unarchive(id: string, updatedAt: string): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `UPDATE accounts SET archived_at = NULL, updated_at = ? WHERE id = ?`,
          values: [updatedAt, id],
        },
      ],
      true,
    )
  }

  /**
   * 物理删除账户及其关联交易（事务）。
   *
   * 前置校验（由调用方 finance-service 完成"是否可删"的语义判断）：
   * - 账户的全部交易只允许 void（已作废）或 opening_balance（期初余额调整），
   *   存在其他 posted 交易时抛错（entries.account_id ON DELETE RESTRICT 也会物理拦截）。
   * - 被退款关联（transaction_links.original_transaction_id）引用的交易不可删。
   *
   * 删除顺序：先删交易（entries/links/discounts/attachments 随 CASCADE 清理），
   * 再删账户（此时 entries.account_id 已无引用）。
   */
  async deleteWithTransactions(ledgerId: string, accountId: string): Promise<void> {
    const txRows = await this.database.query<{
      id: string
      status: string
      type: string
    }>(
      `SELECT DISTINCT t.id, t.status, t.type
       FROM transactions t
       JOIN entries e ON e.transaction_id = t.id
       WHERE e.account_id = ? AND t.ledger_id = ?`,
      [accountId, ledgerId],
    )

    for (const row of txRows) {
      if (row.status === 'posted' && row.type !== 'opening_balance') {
        throw new Error('账户存在记账流水，请先作废相关交易，或使用归档保留历史')
      }
    }

    const linked = await this.database.query<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM transaction_links l
       JOIN entries e ON e.transaction_id = l.original_transaction_id
       WHERE e.account_id = ?`,
      [accountId],
    )
    if ((linked[0]?.count ?? 0) > 0) {
      throw new Error('该账户存在被退款关联的交易，无法删除')
    }

    const statements: SqlStatement[] = []
    if (txRows.length > 0) {
      const placeholders = txRows.map(() => '?').join(', ')
      const txIds = txRows.map((r) => r.id)
      statements.push({
        statement: `DELETE FROM transactions WHERE id IN (${placeholders})`,
        values: txIds,
      })
    }
    statements.push({
      statement: `DELETE FROM accounts WHERE id = ? AND ledger_id = ?`,
      values: [accountId, ledgerId],
    })
    await this.database.executeSet(statements, true)
  }
}

const BALANCE_SELECT = `
  SELECT
    accounts.id,
    accounts.ledger_id AS ledgerId,
    accounts.name,
    accounts.type,
    accounts.normal_balance AS normalBalance,
    accounts.currency,
    accounts.institution,
    accounts.archived_at AS archivedAt,
    accounts.created_at AS createdAt,
    accounts.updated_at AS updatedAt,
    account_balances.balance_minor AS balanceMinor,
    account_preferences.brand_key AS brandKey,
    account_preferences.icon_key AS iconKey,
    account_preferences.color,
    COALESCE(account_preferences.include_in_asset_stats, 1) AS includeInAssetStats,
    COALESCE(account_preferences.visible_in_entry, 1) AS visibleInEntry
  FROM accounts
  JOIN account_balances ON account_balances.account_id = accounts.id
  LEFT JOIN account_preferences ON account_preferences.account_id = accounts.id
`

const ACCOUNT_SELECT = `
  SELECT
    id,
    ledger_id AS ledgerId,
    name,
    type,
    normal_balance AS normalBalance,
    currency,
    institution,
    archived_at AS archivedAt,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM accounts
`

function mapAccount(row: AccountRow): AccountRecord {
  return {
    ...row,
    institution: row.institution ?? undefined,
    archivedAt: row.archivedAt ?? undefined,
  }
}

function mapBalance(row: BalanceRow): AccountBalanceRecord {
  return {
    ...mapAccount(row),
    balanceMinor: row.balanceMinor,
    brandKey: row.brandKey ?? undefined,
    iconKey: row.iconKey ?? undefined,
    color: row.color ?? undefined,
    includeInAssetStats: row.includeInAssetStats === 1,
    visibleInEntry: row.visibleInEntry === 1,
  }
}
