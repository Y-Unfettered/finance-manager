import type { Migration } from '../core/types'

/**
 * v18：分类唯一约束放宽为"仅未归档"（2026-11-07 回测 bug）。
 *
 * 原表级约束 UNIQUE (ledger_id, kind, name) 不分归档与否：
 * 已归档分类会挡住新建同名分类（提示"同名分类已存在"）。
 * 重建为部分唯一索引——只约束未归档行，允许"已归档"与"未归档"同名并存；
 * 恢复（取消归档）时的重名校验由 FinanceService.unarchiveCategory 负责。
 *
 * SQLite 不支持修改约束，按官方流程重建表：foreign_keys OFF → 建新表 → 拷贝 →
 * DROP 旧表 → RENAME → 重建索引 → foreign_keys ON。bootstrap 在迁移前已自动备份。
 */
export const CATEGORY_UNIQUE_ACTIVE_V18_MIGRATION: Migration = {
  version: 18,
  name: 'category_unique_active_v18',
  statements: `
PRAGMA foreign_keys = OFF;

-- 重建表期间先摘掉引用 categories 的触发器（否则 DROP/RENAME 后触发器解析损坏），
-- 表重建完成后原样恢复
DROP TRIGGER IF EXISTS entries_validate_ledger_before_insert;

CREATE TABLE categories_new (
  id TEXT PRIMARY KEY NOT NULL,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO categories_new (id, ledger_id, parent_id, kind, name, sort_order, archived_at, created_at, updated_at)
SELECT id, ledger_id, parent_id, kind, name, sort_order, archived_at, created_at, updated_at
FROM categories;

DROP TABLE categories;
ALTER TABLE categories_new RENAME TO categories;

CREATE INDEX idx_categories_ledger_kind ON categories(ledger_id, kind);
CREATE UNIQUE INDEX idx_categories_active_name
  ON categories(ledger_id, kind, name)
  WHERE archived_at IS NULL;

CREATE TRIGGER entries_validate_ledger_before_insert
BEFORE INSERT ON entries
BEGIN
  SELECT CASE
    WHEN (SELECT ledger_id FROM transactions WHERE id = NEW.transaction_id) <> NEW.ledger_id
      THEN RAISE(ABORT, 'entry transaction belongs to another ledger')
    WHEN NEW.account_id IS NOT NULL
      AND (SELECT ledger_id FROM accounts WHERE id = NEW.account_id) <> NEW.ledger_id
      THEN RAISE(ABORT, 'entry account belongs to another ledger')
    WHEN NEW.category_id IS NOT NULL
      AND (SELECT ledger_id FROM categories WHERE id = NEW.category_id) <> NEW.ledger_id
      THEN RAISE(ABORT, 'entry category belongs to another ledger')
  END;
END;

PRAGMA foreign_keys = ON;
`,
}
