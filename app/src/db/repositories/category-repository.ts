import type { CategoryPostingRef } from '@/domain/accounting'
import type { CategoryDetailRecord, CategoryRecord } from '@/domain/entities'

import { BaseRepository } from './base-repository'

interface CategoryRow extends Omit<CategoryRecord, 'parentId' | 'archivedAt'> {
  parentId: string | null
  archivedAt: string | null
}

interface CategoryDetailRow extends CategoryRow {
  iconKey: string | null
  color: string | null
}

export class CategoryRepository extends BaseRepository {
  async create(
    record: CategoryRecord,
    appearance?: { iconKey?: string; color?: string },
  ): Promise<void> {
    const statements = [
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
    ]
    if (appearance?.iconKey || appearance?.color) {
      statements.push({
        statement: `INSERT INTO category_preferences (category_id, icon_key, color, updated_at)
          VALUES (?, ?, ?, ?)`,
        values: [record.id, appearance.iconKey ?? null, appearance.color ?? null, record.updatedAt],
      })
    }
    await this.database.executeSet(statements, true)
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

  async listDetailsByLedger(ledgerId: string): Promise<CategoryDetailRecord[]> {
    const rows = await this.database.query<CategoryDetailRow>(
      `
        SELECT categories.id, categories.ledger_id AS ledgerId,
          categories.parent_id AS parentId, categories.kind, categories.name,
          categories.sort_order AS sortOrder, categories.archived_at AS archivedAt,
          categories.created_at AS createdAt, categories.updated_at AS updatedAt,
          category_preferences.icon_key AS iconKey, category_preferences.color
        FROM categories
        LEFT JOIN category_preferences ON category_preferences.category_id = categories.id
        WHERE categories.ledger_id = ?
        ORDER BY categories.kind, categories.sort_order, categories.name
      `,
      [ledgerId],
    )
    return rows.map((row) => ({
      ...row,
      parentId: row.parentId ?? undefined,
      archivedAt: row.archivedAt ?? undefined,
      iconKey: row.iconKey ?? undefined,
      color: row.color ?? undefined,
    }))
  }

  async update(
    id: string,
    fields: {
      name: string
      parentId?: string
      sortOrder: number
      iconKey?: string
      color?: string
    },
    updatedAt: string,
  ): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `UPDATE categories SET name = ?, parent_id = ?, sort_order = ?, updated_at = ?
            WHERE id = ?`,
          values: [fields.name.trim(), fields.parentId ?? null, fields.sortOrder, updatedAt, id],
        },
        {
          statement: `INSERT INTO category_preferences (category_id, icon_key, color, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(category_id) DO UPDATE SET icon_key = excluded.icon_key,
              color = excluded.color, updated_at = excluded.updated_at`,
          values: [id, fields.iconKey ?? null, fields.color ?? null, updatedAt],
        },
      ],
      true,
    )
  }

  async archive(id: string, archivedAt: string): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: 'UPDATE categories SET archived_at = ?, updated_at = ? WHERE id = ?',
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
          statement: 'UPDATE categories SET archived_at = NULL, updated_at = ? WHERE id = ?',
          values: [updatedAt, id],
        },
      ],
      true,
    )
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

  async findById(id: string): Promise<CategoryRecord | undefined> {
    const rows = await this.database.query<CategoryRow>(
      `SELECT id, ledger_id AS ledgerId, parent_id AS parentId, kind, name,
        sort_order AS sortOrder, archived_at AS archivedAt,
        created_at AS createdAt, updated_at AS updatedAt
       FROM categories WHERE id = ? LIMIT 1`,
      [id],
    )
    const row = rows[0]
    return row
      ? { ...row, parentId: row.parentId ?? undefined, archivedAt: row.archivedAt ?? undefined }
      : undefined
  }
}
