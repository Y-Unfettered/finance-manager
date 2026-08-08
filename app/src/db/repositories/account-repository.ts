import { normalBalanceForAccountType, type AccountPostingRef } from '@/domain/accounts'
import type { AccountBalanceRecord, AccountRecord } from '@/domain/entities'

import { BaseRepository } from './base-repository'

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
              archived_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          ],
        },
      ],
      true,
    )
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
      `${ACCOUNT_SELECT} WHERE ledger_id = ? ORDER BY name`,
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
        ORDER BY accounts.name
      `,
      [ledgerId],
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
