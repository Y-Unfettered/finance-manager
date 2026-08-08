import type { BudgetRecord, CategoryBudgetWithCategory } from '@/domain/entities'

import type { SqlValue } from '../core/types'
import { BaseRepository } from './base-repository'

interface BudgetRow extends Omit<BudgetRecord, 'note'> {
  note: string | null
}

interface CategoryBudgetRow extends Omit<CategoryBudgetWithCategory, 'categoryName'> {
  categoryName: string | null
}

export interface CategoryBudgetInput {
  categoryId: string
  limitMinor: number
}

export class BudgetRepository extends BaseRepository {
  async create(
    record: BudgetRecord,
    categoryBudgets: readonly CategoryBudgetInput[],
  ): Promise<void> {
    const now = record.createdAt
    const statements = [
      {
        statement: `
          INSERT INTO budgets (
            id, ledger_id, period_type, period_key, total_limit_minor, note,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        values: [
          record.id,
          record.ledgerId,
          record.periodType,
          record.periodKey,
          record.totalLimitMinor,
          record.note ?? null,
          record.createdAt,
          record.updatedAt,
        ] as SqlValue[],
      },
    ]
    for (const cb of categoryBudgets) {
      statements.push({
        statement: `
          INSERT INTO category_budgets (id, budget_id, category_id, limit_minor, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        values: [
          `cb_${record.id}_${cb.categoryId}`,
          record.id,
          cb.categoryId,
          cb.limitMinor,
          now,
          now,
        ] as SqlValue[],
      })
    }
    await this.database.executeSet(statements, true)
  }

  async update(
    id: string,
    fields: { totalLimitMinor?: number; note?: string },
    categoryBudgets: readonly CategoryBudgetInput[] | undefined,
    updatedAt: string,
  ): Promise<void> {
    const statements = []
    if (categoryBudgets !== undefined) {
      statements.push({
        statement: `DELETE FROM category_budgets WHERE budget_id = ?`,
        values: [id] as SqlValue[],
      })
      for (const cb of categoryBudgets) {
        statements.push({
          statement: `
            INSERT INTO category_budgets (id, budget_id, category_id, limit_minor, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `,
          values: [
            `cb_${id}_${cb.categoryId}`,
            id,
            cb.categoryId,
            cb.limitMinor,
            updatedAt,
            updatedAt,
          ] as SqlValue[],
        })
      }
    }
    const setClauses: string[] = ['updated_at = ?']
    const values: SqlValue[] = [updatedAt]
    if (fields.totalLimitMinor !== undefined) {
      setClauses.unshift('total_limit_minor = ?')
      values.unshift(fields.totalLimitMinor)
    }
    if (fields.note !== undefined) {
      setClauses.unshift('note = ?')
      values.unshift(fields.note.trim() === '' ? null : fields.note.trim())
    }
    values.push(id)
    statements.push({
      statement: `UPDATE budgets SET ${setClauses.join(', ')} WHERE id = ?`,
      values,
    })
    await this.database.executeSet(statements, true)
  }

  async findByPeriod(
    ledgerId: string,
    periodType: string,
    periodKey: string,
  ): Promise<BudgetRecord | undefined> {
    const rows = await this.database.query<BudgetRow>(
      `${BUDGET_SELECT} WHERE ledger_id = ? AND period_type = ? AND period_key = ? LIMIT 1`,
      [ledgerId, periodType, periodKey],
    )
    return rows[0] ? mapBudget(rows[0]) : undefined
  }

  async findById(id: string): Promise<BudgetRecord | undefined> {
    const rows = await this.database.query<BudgetRow>(`${BUDGET_SELECT} WHERE id = ? LIMIT 1`, [id])
    return rows[0] ? mapBudget(rows[0]) : undefined
  }

  async listByLedger(ledgerId: string): Promise<BudgetRecord[]> {
    const rows = await this.database.query<BudgetRow>(
      `${BUDGET_SELECT} WHERE ledger_id = ? ORDER BY period_key DESC`,
      [ledgerId],
    )
    return rows.map(mapBudget)
  }

  async listCategoryBudgets(budgetId: string): Promise<CategoryBudgetWithCategory[]> {
    const rows = await this.database.query<CategoryBudgetRow>(
      `
        SELECT
          category_budgets.id,
          category_budgets.budget_id AS budgetId,
          category_budgets.category_id AS categoryId,
          category_budgets.limit_minor AS limitMinor,
          category_budgets.created_at AS createdAt,
          category_budgets.updated_at AS updatedAt,
          categories.name AS categoryName
        FROM category_budgets
        LEFT JOIN categories ON categories.id = category_budgets.category_id
        WHERE category_budgets.budget_id = ?
        ORDER BY categories.name
      `,
      [budgetId],
    )
    return rows.map((row) => ({ ...row, categoryName: row.categoryName ?? '' }))
  }

  async delete(id: string): Promise<void> {
    await this.database.executeSet(
      [{ statement: `DELETE FROM budgets WHERE id = ?`, values: [id] as SqlValue[] }],
      true,
    )
  }
}

const BUDGET_SELECT = `
  SELECT
    id,
    ledger_id AS ledgerId,
    period_type AS periodType,
    period_key AS periodKey,
    total_limit_minor AS totalLimitMinor,
    note,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM budgets
`

function mapBudget(row: BudgetRow): BudgetRecord {
  return { ...row, note: row.note ?? undefined }
}
