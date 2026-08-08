import type { Migration } from '../core/types'

/**
 * v9：v0.3.0 可用性重构的数据扩展。
 *
 * 采用一对一扩展表而不是 ALTER 旧表，避免破坏历史备份和既有导入数据。
 */
export const USABILITY_REBUILD_V9_MIGRATION: Migration = {
  version: 9,
  name: 'usability_rebuild_v9',
  statements: `
CREATE TABLE account_preferences (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  brand_key TEXT,
  icon_key TEXT,
  color TEXT,
  include_in_asset_stats INTEGER NOT NULL DEFAULT 1 CHECK (include_in_asset_stats IN (0, 1)),
  visible_in_entry INTEGER NOT NULL DEFAULT 1 CHECK (visible_in_entry IN (0, 1)),
  updated_at TEXT NOT NULL
);

CREATE TABLE ledger_preferences (
  ledger_id TEXT PRIMARY KEY NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  archived_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE credit_profiles (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  credit_limit_minor INTEGER NOT NULL DEFAULT 0 CHECK (credit_limit_minor >= 0),
  bill_day INTEGER CHECK (bill_day IS NULL OR bill_day BETWEEN 1 AND 31),
  repayment_day INTEGER CHECK (repayment_day IS NULL OR repayment_day BETWEEN 1 AND 31),
  reminder_days INTEGER NOT NULL DEFAULT 3 CHECK (reminder_days >= 0),
  effective_from TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE category_preferences (
  category_id TEXT PRIMARY KEY NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  icon_key TEXT,
  color TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE budget_policies (
  budget_id TEXT PRIMARY KEY NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('total_and_categories', 'total_only', 'categories_only')),
  auto_copy INTEGER NOT NULL DEFAULT 1 CHECK (auto_copy IN (0, 1)),
  source_period_key TEXT,
  updated_at TEXT NOT NULL
);

INSERT INTO budget_policies (budget_id, mode, auto_copy, source_period_key, updated_at)
SELECT
  budgets.id,
  CASE
    WHEN budgets.total_limit_minor = 0
      AND EXISTS (SELECT 1 FROM category_budgets WHERE category_budgets.budget_id = budgets.id)
      THEN 'categories_only'
    WHEN NOT EXISTS (SELECT 1 FROM category_budgets WHERE category_budgets.budget_id = budgets.id)
      THEN 'total_only'
    ELSE 'total_and_categories'
  END,
  1,
  NULL,
  budgets.updated_at
FROM budgets;

UPDATE budgets
SET total_limit_minor = COALESCE((
  SELECT SUM(category_budgets.limit_minor)
  FROM category_budgets
  WHERE category_budgets.budget_id = budgets.id
), 0)
WHERE budgets.total_limit_minor = 0
  AND EXISTS (
    SELECT 1 FROM category_budgets WHERE category_budgets.budget_id = budgets.id
  );

CREATE TABLE transaction_links (
  transaction_id TEXT PRIMARY KEY NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  original_transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('refund')),
  created_at TEXT NOT NULL,
  CHECK (transaction_id <> original_transaction_id)
);

CREATE TABLE transaction_attachments (
  id TEXT PRIMARY KEY NOT NULL,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  mime_type TEXT NOT NULL,
  data_uri TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_credit_profiles_bill_day ON credit_profiles(bill_day);
CREATE INDEX idx_transaction_links_original ON transaction_links(original_transaction_id);
CREATE INDEX idx_transaction_attachments_transaction ON transaction_attachments(transaction_id);
`,
}
