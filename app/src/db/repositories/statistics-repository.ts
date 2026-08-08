import { BaseRepository } from './base-repository'

export interface StatisticsTotalsRow {
  incomeMinor: number
  expenseMinor: number
  transactionCount: number
}

export interface MonthlyFlowRow extends StatisticsTotalsRow {
  periodKey: string
}
export interface DistributionRow {
  id: string
  name: string
  amountMinor: number
}
export interface AssetMonthlyDelta {
  periodKey: string
  assetDeltaMinor: number
  liabilityDeltaMinor: number
}

export class StatisticsRepository extends BaseRepository {
  async categoryTotals(
    categoryId: string,
    startUtc: string,
    endUtc: string,
  ): Promise<StatisticsTotalsRow> {
    const rows = await this.database.query<StatisticsTotalsRow>(
      `${CATEGORY_BASE_SELECT}
      WHERE (categories.id = ? OR categories.parent_id = ?) AND transactions.status = 'posted'
        AND transactions.occurred_at >= ? AND transactions.occurred_at < ?`,
      [categoryId, categoryId, startUtc, endUtc],
    )
    return rows[0] ?? { incomeMinor: 0, expenseMinor: 0, transactionCount: 0 }
  }

  async categoryMonthly(
    categoryId: string,
    startUtc: string,
    endUtc: string,
  ): Promise<MonthlyFlowRow[]> {
    return this.database.query<MonthlyFlowRow>(
      `${CATEGORY_MONTHLY_SELECT}
      WHERE (categories.id = ? OR categories.parent_id = ?) AND transactions.status = 'posted'
        AND transactions.occurred_at >= ? AND transactions.occurred_at < ?
      GROUP BY substr(transactions.occurred_at, 1, 7) ORDER BY periodKey`,
      [categoryId, categoryId, startUtc, endUtc],
    )
  }

  async categoryDistribution(
    categoryId: string,
    startUtc: string,
    endUtc: string,
  ): Promise<DistributionRow[]> {
    return this.database.query<DistributionRow>(
      `
      SELECT categories.id, categories.name, COALESCE(SUM(CASE
        WHEN transactions.type IN ('expense','credit_purchase') THEN transactions.amount_minor
        WHEN transactions.type = 'refund' THEN -transactions.amount_minor ELSE 0 END), 0) AS amountMinor
      FROM transactions JOIN entries ON entries.transaction_id = transactions.id
      JOIN categories ON categories.id = entries.category_id
      WHERE (categories.id = ? OR categories.parent_id = ?) AND transactions.status = 'posted'
        AND transactions.occurred_at >= ? AND transactions.occurred_at < ?
      GROUP BY categories.id, categories.name ORDER BY amountMinor DESC`,
      [categoryId, categoryId, startUtc, endUtc],
    )
  }

  async accountDistribution(
    accountId: string,
    startUtc: string,
    endUtc: string,
  ): Promise<DistributionRow[]> {
    return this.database.query<DistributionRow>(
      `
      SELECT COALESCE(parent.id, categories.id) AS id, COALESCE(parent.name, categories.name) AS name,
        COALESCE(SUM(CASE WHEN transactions.type IN ('expense','credit_purchase') THEN transactions.amount_minor
          WHEN transactions.type='refund' THEN -transactions.amount_minor ELSE 0 END),0) AS amountMinor
      FROM transactions JOIN entries AS account_entry ON account_entry.transaction_id=transactions.id AND account_entry.account_id=?
      JOIN entries AS category_entry ON category_entry.transaction_id=transactions.id AND category_entry.category_id IS NOT NULL
      JOIN categories ON categories.id=category_entry.category_id LEFT JOIN categories AS parent ON parent.id=categories.parent_id
      WHERE transactions.status='posted' AND transactions.occurred_at>=? AND transactions.occurred_at<?
      GROUP BY COALESCE(parent.id,categories.id),COALESCE(parent.name,categories.name) ORDER BY amountMinor DESC`,
      [accountId, startUtc, endUtc],
    )
  }

  async assetMonthlyDeltas(ledgerId: string, endUtc: string): Promise<AssetMonthlyDelta[]> {
    return this.database.query<AssetMonthlyDelta>(
      `
      SELECT substr(transactions.occurred_at,1,7) AS periodKey,
        COALESCE(SUM(CASE WHEN accounts.normal_balance='debit' THEN
          CASE WHEN entries.side=accounts.normal_balance THEN entries.amount_minor ELSE -entries.amount_minor END ELSE 0 END),0) AS assetDeltaMinor,
        COALESCE(SUM(CASE WHEN accounts.normal_balance='credit' THEN
          CASE WHEN entries.side=accounts.normal_balance THEN entries.amount_minor ELSE -entries.amount_minor END ELSE 0 END),0) AS liabilityDeltaMinor
      FROM entries JOIN transactions ON transactions.id=entries.transaction_id
      JOIN accounts ON accounts.id=entries.account_id
      LEFT JOIN account_preferences ON account_preferences.account_id=accounts.id
      WHERE transactions.ledger_id=? AND transactions.status='posted' AND transactions.occurred_at<?
        AND COALESCE(account_preferences.include_in_asset_stats,1)=1
      GROUP BY substr(transactions.occurred_at,1,7) ORDER BY periodKey`,
      [ledgerId, endUtc],
    )
  }
}

const CATEGORY_BASE_SELECT = `SELECT
  COALESCE(SUM(CASE WHEN transactions.type='income' THEN transactions.amount_minor ELSE 0 END),0) AS incomeMinor,
  COALESCE(SUM(CASE WHEN transactions.type IN ('expense','credit_purchase') THEN transactions.amount_minor
    WHEN transactions.type='refund' THEN -transactions.amount_minor ELSE 0 END),0) AS expenseMinor,
  COUNT(DISTINCT transactions.id) AS transactionCount
  FROM transactions JOIN entries ON entries.transaction_id=transactions.id
  JOIN categories ON categories.id=entries.category_id`

const CATEGORY_MONTHLY_SELECT = `SELECT substr(transactions.occurred_at,1,7) AS periodKey,
  COALESCE(SUM(CASE WHEN transactions.type='income' THEN transactions.amount_minor ELSE 0 END),0) AS incomeMinor,
  COALESCE(SUM(CASE WHEN transactions.type IN ('expense','credit_purchase') THEN transactions.amount_minor
    WHEN transactions.type='refund' THEN -transactions.amount_minor ELSE 0 END),0) AS expenseMinor,
  COUNT(DISTINCT transactions.id) AS transactionCount
  FROM transactions JOIN entries ON entries.transaction_id=transactions.id
  JOIN categories ON categories.id=entries.category_id`
