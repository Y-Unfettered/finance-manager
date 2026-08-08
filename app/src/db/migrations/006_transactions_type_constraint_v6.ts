import type { Migration } from '../core/types'

/**
 * v6：扩展 transactions.type 的 CHECK 约束，
 * 补全 borrowing / repay_borrowing 两个类型。
 * 早期数据库从旧版 schema 创建，CHECK 缺少这两个类型，
 * 导致信用卡还款导入时报 CHECK constraint failed: type IN(...)。
 * SQLite 不支持直接 ALTER CHECK，需重建表。
 */
export const TRANSACTIONS_TYPE_CONSTRAINT_V6_MIGRATION: Migration = {
  version: 6,
  name: 'transactions_type_constraint_v6',
  statements: `
PRAGMA foreign_keys = OFF;

-- 1. 备份现有数据
CREATE TABLE transactions_backup AS SELECT * FROM transactions;

-- 2. 删除旧索引（DROP TABLE 会自动删除表上的索引和触发器，
--    但 entries 上的触发器 entries_validate_ledger_before_insert 仍保留，
--    重建表后会自动生效）
DROP INDEX IF EXISTS idx_transactions_ledger_occurred;
DROP INDEX IF EXISTS idx_transactions_ledger_type;
DROP INDEX IF EXISTS idx_transactions_import_batch;
DROP TABLE transactions;

-- 3. 创建新表（补全 borrowing / repay_borrowing，保留 004 添加的 import_batch_id 列）
CREATE TABLE transactions (
  id TEXT PRIMARY KEY NOT NULL,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'expense', 'income', 'transfer', 'credit_purchase', 'repayment',
    'refund', 'loan_out', 'loan_recovery', 'borrowing', 'repay_borrowing',
    'balance_adjustment', 'opening_balance'
  )),
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'void')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'CNY' CHECK (currency = 'CNY'),
  occurred_at TEXT NOT NULL,
  merchant TEXT,
  counterparty TEXT,
  note TEXT,
  capture_source TEXT,
  parser_version TEXT,
  confidence REAL CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  import_batch_id TEXT REFERENCES import_batches(id) ON DELETE SET NULL
);

-- 4. 重建索引
CREATE INDEX idx_transactions_ledger_occurred ON transactions(ledger_id, occurred_at DESC);
CREATE INDEX idx_transactions_ledger_type ON transactions(ledger_id, type);
CREATE INDEX idx_transactions_import_batch ON transactions(import_batch_id) WHERE import_batch_id IS NOT NULL;

-- 5. 从备份恢复数据
INSERT INTO transactions
SELECT * FROM transactions_backup;

-- 6. 删除备份表
DROP TABLE transactions_backup;

PRAGMA foreign_keys = ON;
`,
}
