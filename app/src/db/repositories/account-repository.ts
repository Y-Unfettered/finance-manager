import { normalBalanceForAccountType, type AccountPostingRef } from '@/domain/accounts'
import type { AccountBalanceRecord, AccountRecord } from '@/domain/entities'

import { BaseRepository } from './base-repository'

interface AccountRow extends Omit<AccountRecord, 'institution' | 'archivedAt'> {
  institution: string | null
  archivedAt: string | null
}

interface BalanceRow extends AccountRow {
  balanceMinor: number
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
          account_balances.balance_minor AS balanceMinor
        FROM accounts
        JOIN account_balances ON account_balances.account_id = accounts.id
        WHERE accounts.ledger_id = ?
        ORDER BY accounts.name
      `,
      [ledgerId],
    )
    return rows.map((row) => ({ ...mapAccount(row), balanceMinor: row.balanceMinor }))
  }
}

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
