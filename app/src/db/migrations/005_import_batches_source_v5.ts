import type { Migration } from '../core/types'

/**
 * v5：扩展 import_batches.source 的 CHECK 约束，
 * 支持 csv / xlsx / json / qianji / other 五种来源。
 * SQLite 不支持直接 ALTER CHECK，需重建表。
 */
export const IMPORT_BATCHES_SOURCE_V5_MIGRATION: Migration = {
  version: 5,
  name: 'import_batches_source_v5',
  statements: `
PRAGMA foreign_keys = OFF;

-- 1. 备份现有数据到临时表
CREATE TABLE import_batches_backup AS SELECT * FROM import_batches;

-- 2. 删除旧表（含旧 CHECK 约束）和旧索引
DROP INDEX IF EXISTS idx_import_batches_ledger_status;
DROP TABLE import_batches;

-- 3. 创建新表（扩展 source 的 CHECK 约束：csv/xlsx/json/qianji/other）
-- 重建后 transactions.import_batch_id 的外键引用字符串仍为 "import_batches"，匹配新表
CREATE TABLE import_batches (
  id TEXT PRIMARY KEY NOT NULL,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('csv', 'xlsx', 'json', 'qianji', 'other')),
  file_name TEXT,
  parser_version TEXT,
  field_mapping_json TEXT,
  source_fingerprint TEXT,
  record_count INTEGER NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  success_count INTEGER NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'void')),
  note TEXT,
  created_at TEXT NOT NULL,
  voided_at TEXT,
  CHECK (success_count + duplicate_count + error_count <= record_count)
);

CREATE INDEX idx_import_batches_ledger_status ON import_batches(ledger_id, status, created_at);

-- 4. 从备份恢复数据
INSERT INTO import_batches
SELECT * FROM import_batches_backup;

-- 5. 删除备份表
DROP TABLE import_batches_backup;

PRAGMA foreign_keys = ON;
`,
}
