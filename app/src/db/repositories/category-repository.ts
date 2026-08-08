import type { CategoryPostingRef } from '@/domain/accounting'
import type { CategoryRecord } from '@/domain/entities'

import { BaseRepository } from './base-repository'

interface CategoryRow extends Omit<CategoryRecord, 'parentId' | 'archivedAt'> {
  parentId: string | null
  archivedAt: string | null
}

export class CategoryRepository extends BaseRepository {
  async create(record: CategoryRecord): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `
            INSERT INTO categories (
              id, ledger_id, parent_id, kind, name, sort_order, archived_at,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          values: [
            record.id,
            record.ledgerId,
            record.parentId ?? null,
            record.kind,
            record.name.trim(),
            record.sortOrder,
            record.archivedAt ?? null,
            record.createdAt,
            record.updatedAt,
          ],
        },
      ],
      true,
    )
  }

  async findPostingRef(id: string): Promise<CategoryPostingRef | undefined> {
    const rows = await this.database.query<CategoryPostingRef>(
      `SELECT id, kind FROM categories WHERE id = ? LIMIT 1`,
      [id],
    )
    return rows[0]
  }

  async listByLedger(ledgerId: string): Promise<CategoryRecord[]> {
    const rows = await this.database.query<CategoryRow>(
      `
        SELECT
          id,
          ledger_id AS ledgerId,
          parent_id AS parentId,
          kind,
          name,
          sort_order AS sortOrder,
          archived_at AS archivedAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM categories
        WHERE ledger_id = ?
        ORDER BY kind, sort_order, name
      `,
      [ledgerId],
    )
    return rows.map((row) => ({
      ...row,
      parentId: row.parentId ?? undefined,
      archivedAt: row.archivedAt ?? undefined,
    }))
  }

  async findByName(ledgerId: string, name: string): Promise<CategoryRecord | undefined> {
    const rows = await this.database.query<CategoryRow>(
      `
        SELECT id, ledger_id AS ledgerId, parent_id AS parentId, kind, name,
          sort_order AS sortOrder, archived_at AS archivedAt,
          created_at AS createdAt, updated_at AS updatedAt
        FROM categories WHERE ledger_id = ? AND name = ? LIMIT 1
      `,
      [ledgerId, name],
    )
    const row = rows[0]
    return row
      ? { ...row, parentId: row.parentId ?? undefined, archivedAt: row.archivedAt ?? undefined }
      : undefined
  }
}
