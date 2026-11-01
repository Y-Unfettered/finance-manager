// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { runMigrations } from '@/db/migration-runner'
import { NodeSqliteExecutor } from '@/test/node-sqlite-executor'

import { BACKUP_TABLE_SCHEMAS } from './backup-repository'

/**
 * 守护测试：备份 schema 必须与"跑完全部迁移后的物理表结构"一致。
 *
 * 背景：TABLE_SCHEMAS 与迁移文件是双头维护，曾经漂移——011/013/014 三次
 * 迁移新增的列（execution_errors_json / sort_order / fingerprint）不在备份
 * 列清单里，导致"新备份 → 恢复"后这些列的数据静默丢失。此测试保证今后
 * 任何迁移加列时，要么同步更新 TABLE_SCHEMAS，要么显式决定该列不进备份
 * （此时应把列加入下方 EXCLUDED_COLUMNS 并写明原因）。
 */
describe('备份 schema 与物理表结构一致性', () => {
  /** 有意不进备份的列（必须写明原因，且恢复后应用层可接受缺省值）。 */
  const EXCLUDED_COLUMNS: Record<string, string[]> = {}

  it('每个备份表的列集合 = PRAGMA table_info 的列集合（双向）', async () => {
    const database = new NodeSqliteExecutor()
    await runMigrations(database, undefined, () => '2026-11-01T00:00:00.000Z')

    for (const schema of BACKUP_TABLE_SCHEMAS) {
      const rows = await database.query<{ name: string }>(`PRAGMA table_info(${schema.name})`)
      const physical = new Set(rows.map((row) => row.name))
      const declared = new Set(schema.columns)
      const excluded = new Set(EXCLUDED_COLUMNS[schema.name] ?? [])

      const missingInBackup = [...physical].filter((c) => !declared.has(c) && !excluded.has(c))
      const extraInBackup = [...declared].filter((c) => !physical.has(c))

      expect(missingInBackup, `表 ${schema.name}：物理列未纳入备份，恢复后会静默丢数据`).toEqual([])
      expect(extraInBackup, `表 ${schema.name}：备份声明了不存在的物理列，恢复时必然报错`).toEqual([])
    }
  })
})
