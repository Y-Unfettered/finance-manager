import type {
  TransactionTemplateRecord,
  TransactionTemplateType,
  TransactionTemplateWithRefs,
} from '@/domain/entities'
import type { SqlValue } from '@/db/core/types'
import { BaseRepository } from '@/db/repositories/base-repository'

interface TemplateRow extends Omit<
  TransactionTemplateRecord,
  'categoryId' | 'sourceAccountId' | 'targetAccountId' | 'merchant' | 'note'
> {
  categoryId: string | null
  sourceAccountId: string | null
  targetAccountId: string | null
  merchant: string | null
  note: string | null
}

interface TemplateWithRefsRow extends TemplateRow {
  categoryName: string | null
  sourceAccountName: string | null
  targetAccountName: string | null
}

export interface CreateTemplateInput {
  ledgerId: string
  name: string
  transactionType: TransactionTemplateType
  amountMinor: number
  categoryId?: string
  sourceAccountId?: string
  targetAccountId?: string
  merchant?: string
  note?: string
  sortOrder?: number
}

export interface UpdateTemplateInput {
  ledgerId: string
  templateId: string
  name?: string
  amountMinor?: number
  categoryId?: string
  sourceAccountId?: string
  targetAccountId?: string
  merchant?: string
  note?: string
  sortOrder?: number
}

export class TemplateRepository extends BaseRepository {
  async create(record: TransactionTemplateRecord): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `
            INSERT INTO transaction_templates (
              id, ledger_id, name, transaction_type, amount_minor,
              category_id, source_account_id, target_account_id,
              merchant, note, sort_order, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          values: [
            record.id,
            record.ledgerId,
            record.name,
            record.transactionType,
            record.amountMinor,
            record.categoryId ?? null,
            record.sourceAccountId ?? null,
            record.targetAccountId ?? null,
            record.merchant ?? null,
            record.note ?? null,
            record.sortOrder,
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
    fields: Omit<UpdateTemplateInput, 'ledgerId' | 'templateId'>,
    updatedAt: string,
  ): Promise<void> {
    const setClauses: string[] = ['updated_at = ?']
    const values: SqlValue[] = [updatedAt]
    if (fields.name !== undefined) {
      setClauses.unshift('name = ?')
      values.unshift(fields.name)
    }
    if (fields.amountMinor !== undefined) {
      setClauses.unshift('amount_minor = ?')
      values.unshift(fields.amountMinor)
    }
    if (fields.categoryId !== undefined) {
      setClauses.unshift('category_id = ?')
      values.unshift(fields.categoryId || null)
    }
    if (fields.sourceAccountId !== undefined) {
      setClauses.unshift('source_account_id = ?')
      values.unshift(fields.sourceAccountId || null)
    }
    if (fields.targetAccountId !== undefined) {
      setClauses.unshift('target_account_id = ?')
      values.unshift(fields.targetAccountId || null)
    }
    if (fields.merchant !== undefined) {
      setClauses.unshift('merchant = ?')
      values.unshift(fields.merchant.trim() === '' ? null : fields.merchant.trim())
    }
    if (fields.note !== undefined) {
      setClauses.unshift('note = ?')
      values.unshift(fields.note.trim() === '' ? null : fields.note.trim())
    }
    if (fields.sortOrder !== undefined) {
      setClauses.unshift('sort_order = ?')
      values.unshift(fields.sortOrder)
    }
    values.push(id)
    await this.database.executeSet(
      [
        {
          statement: `UPDATE transaction_templates SET ${setClauses.join(', ')} WHERE id = ?`,
          values,
        },
      ],
      true,
    )
  }

  async findById(id: string): Promise<TransactionTemplateRecord | undefined> {
    const rows = await this.database.query<TemplateRow>(`${TEMPLATE_SELECT} WHERE id = ? LIMIT 1`, [
      id,
    ])
    return rows[0] ? mapTemplate(rows[0]) : undefined
  }

  async findWithRefsById(id: string): Promise<TransactionTemplateWithRefs | undefined> {
    const rows = await this.database.query<TemplateWithRefsRow>(
      `${TEMPLATE_WITH_REFS_SELECT} WHERE templates.id = ? LIMIT 1`,
      [id],
    )
    return rows[0] ? mapTemplateWithRefs(rows[0]) : undefined
  }

  async listByLedger(ledgerId: string): Promise<TransactionTemplateWithRefs[]> {
    const rows = await this.database.query<TemplateWithRefsRow>(
      `${TEMPLATE_WITH_REFS_SELECT} WHERE templates.ledger_id = ?
       ORDER BY templates.sort_order ASC, templates.created_at ASC`,
      [ledgerId],
    )
    return rows.map(mapTemplateWithRefs)
  }

  async delete(id: string): Promise<void> {
    await this.database.executeSet(
      [{ statement: `DELETE FROM transaction_templates WHERE id = ?`, values: [id] as SqlValue[] }],
      true,
    )
  }
}

const TEMPLATE_SELECT = `
  SELECT
    id,
    ledger_id AS ledgerId,
    name,
    transaction_type AS transactionType,
    amount_minor AS amountMinor,
    category_id AS categoryId,
    source_account_id AS sourceAccountId,
    target_account_id AS targetAccountId,
    merchant,
    note,
    sort_order AS sortOrder,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM transaction_templates
`

const TEMPLATE_WITH_REFS_SELECT = `
  SELECT
    templates.id,
    templates.ledger_id AS ledgerId,
    templates.name,
    templates.transaction_type AS transactionType,
    templates.amount_minor AS amountMinor,
    templates.category_id AS categoryId,
    templates.source_account_id AS sourceAccountId,
    templates.target_account_id AS targetAccountId,
    templates.merchant,
    templates.note,
    templates.sort_order AS sortOrder,
    templates.created_at AS createdAt,
    templates.updated_at AS updatedAt,
    categories.name AS categoryName,
    src_account.name AS sourceAccountName,
    tgt_account.name AS targetAccountName
  FROM transaction_templates AS templates
  LEFT JOIN categories ON categories.id = templates.category_id
  LEFT JOIN accounts AS src_account ON src_account.id = templates.source_account_id
  LEFT JOIN accounts AS tgt_account ON tgt_account.id = templates.target_account_id
`

function mapTemplate(row: TemplateRow): TransactionTemplateRecord {
  return {
    ...row,
    categoryId: row.categoryId ?? undefined,
    sourceAccountId: row.sourceAccountId ?? undefined,
    targetAccountId: row.targetAccountId ?? undefined,
    merchant: row.merchant ?? undefined,
    note: row.note ?? undefined,
  }
}

function mapTemplateWithRefs(row: TemplateWithRefsRow): TransactionTemplateWithRefs {
  return {
    ...mapTemplate(row),
    categoryName: row.categoryName ?? undefined,
    sourceAccountName: row.sourceAccountName ?? undefined,
    targetAccountName: row.targetAccountName ?? undefined,
  }
}
