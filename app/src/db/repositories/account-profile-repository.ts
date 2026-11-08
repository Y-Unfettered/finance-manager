import type { AccountPreferenceRecord, CreditProfileRecord } from '@/domain/entities'

import { BaseRepository } from './base-repository'

interface PreferenceRow {
  accountId: string
  brandKey: string | null
  iconKey: string | null
  color: string | null
  includeInAssetStats: number
  visibleInEntry: number
  updatedAt: string
}

interface CreditProfileRow {
  accountId: string
  creditLimitMinor: number
  billDay: number | null
  repaymentDay: number | null
  reminderDays: number
  effectiveFrom: string
  createdAt: string
  updatedAt: string
}

/** 信用账户账期 + 账户本体（回填自动还款提醒用：需要账户名、账本、归档状态）。 */
export interface CreditProfileWithAccount {
  accountId: string
  ledgerId: string
  accountName: string
  archivedAt?: string
  profile: CreditProfileRecord
}

export class AccountProfileRepository extends BaseRepository {
  async getPreference(accountId: string): Promise<AccountPreferenceRecord | undefined> {
    const rows = await this.database.query<PreferenceRow>(
      `SELECT account_id AS accountId, brand_key AS brandKey, icon_key AS iconKey, color,
        include_in_asset_stats AS includeInAssetStats, visible_in_entry AS visibleInEntry,
        updated_at AS updatedAt
       FROM account_preferences WHERE account_id = ? LIMIT 1`,
      [accountId],
    )
    return rows[0] ? mapPreference(rows[0]) : undefined
  }

  async savePreference(record: AccountPreferenceRecord): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `
            INSERT INTO account_preferences (
              account_id, brand_key, icon_key, color, include_in_asset_stats,
              visible_in_entry, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(account_id) DO UPDATE SET
              brand_key = excluded.brand_key,
              icon_key = excluded.icon_key,
              color = excluded.color,
              include_in_asset_stats = excluded.include_in_asset_stats,
              visible_in_entry = excluded.visible_in_entry,
              updated_at = excluded.updated_at
          `,
          values: [
            record.accountId,
            record.brandKey ?? null,
            record.iconKey ?? null,
            record.color ?? null,
            record.includeInAssetStats ? 1 : 0,
            record.visibleInEntry ? 1 : 0,
            record.updatedAt,
          ],
        },
      ],
      true,
    )
  }

  async getCreditProfile(accountId: string): Promise<CreditProfileRecord | undefined> {
    const rows = await this.database.query<CreditProfileRow>(
      `SELECT account_id AS accountId, credit_limit_minor AS creditLimitMinor,
        bill_day AS billDay, repayment_day AS repaymentDay, reminder_days AS reminderDays,
        effective_from AS effectiveFrom, created_at AS createdAt, updated_at AS updatedAt
       FROM credit_profiles WHERE account_id = ? LIMIT 1`,
      [accountId],
    )
    return rows[0] ? mapCreditProfile(rows[0]) : undefined
  }

  /**
   * 列出全部信用账户的账期（含账户名/账本/归档状态）。
   * 用途：启动时一次性回填"账期 → 还款提醒"，因此不能只按当前账本查。
   */
  async listCreditProfilesWithAccounts(): Promise<CreditProfileWithAccount[]> {
    const rows = await this.database.query<CreditProfileRow & {
      accountName: string
      ledgerId: string
      archivedAt: string | null
    }>(
      `SELECT cp.account_id AS accountId, cp.credit_limit_minor AS creditLimitMinor,
        cp.bill_day AS billDay, cp.repayment_day AS repaymentDay, cp.reminder_days AS reminderDays,
        cp.effective_from AS effectiveFrom, cp.created_at AS createdAt, cp.updated_at AS updatedAt,
        accounts.name AS accountName,
        accounts.ledger_id AS ledgerId,
        accounts.archived_at AS archivedAt
       FROM credit_profiles cp
       JOIN accounts ON accounts.id = cp.account_id
       ORDER BY cp.account_id ASC`,
    )
    return rows.map((row) => ({
      accountId: row.accountId,
      ledgerId: row.ledgerId,
      accountName: row.accountName,
      archivedAt: row.archivedAt ?? undefined,
      profile: mapCreditProfile(row),
    }))
  }

  async saveCreditProfile(record: CreditProfileRecord): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `
            INSERT INTO credit_profiles (
              account_id, credit_limit_minor, bill_day, repayment_day, reminder_days,
              effective_from, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(account_id) DO UPDATE SET
              credit_limit_minor = excluded.credit_limit_minor,
              bill_day = excluded.bill_day,
              repayment_day = excluded.repayment_day,
              reminder_days = excluded.reminder_days,
              effective_from = excluded.effective_from,
              updated_at = excluded.updated_at
          `,
          values: [
            record.accountId,
            record.creditLimitMinor,
            record.billDay ?? null,
            record.repaymentDay ?? null,
            record.reminderDays,
            record.effectiveFrom,
            record.createdAt,
            record.updatedAt,
          ],
        },
      ],
      true,
    )
  }

  async deleteCreditProfile(accountId: string): Promise<void> {
    await this.database.executeSet(
      [{ statement: 'DELETE FROM credit_profiles WHERE account_id = ?', values: [accountId] }],
      true,
    )
  }
}

function mapPreference(row: PreferenceRow): AccountPreferenceRecord {
  return {
    accountId: row.accountId,
    brandKey: row.brandKey ?? undefined,
    iconKey: row.iconKey ?? undefined,
    color: row.color ?? undefined,
    includeInAssetStats: row.includeInAssetStats === 1,
    visibleInEntry: row.visibleInEntry === 1,
    updatedAt: row.updatedAt,
  }
}

function mapCreditProfile(row: CreditProfileRow): CreditProfileRecord {
  return {
    ...row,
    billDay: row.billDay ?? undefined,
    repaymentDay: row.repaymentDay ?? undefined,
  }
}
