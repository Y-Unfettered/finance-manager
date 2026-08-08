import type { Migration } from '../core/types'

/**
 * v8：新增预算、模板、周期交易、提醒相关表。
 * 覆盖 v0.2.0 路线图：预算管理、常用模板/周期交易、提醒类（还款日/预付卡/应收款）。
 */
export const BUDGET_TEMPLATES_REMINDERS_V8_MIGRATION: Migration = {
  version: 8,
  name: 'budget_templates_reminders_v8',
  statements: `
-- ========== 预算 ==========
CREATE TABLE budgets (
  id TEXT PRIMARY KEY NOT NULL,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL DEFAULT 'monthly' CHECK (period_type IN ('monthly')),
  period_key TEXT NOT NULL CHECK (length(trim(period_key)) > 0),
  total_limit_minor INTEGER NOT NULL CHECK (total_limit_minor >= 0),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (ledger_id, period_type, period_key)
);

CREATE TABLE category_budgets (
  id TEXT PRIMARY KEY NOT NULL,
  budget_id TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  limit_minor INTEGER NOT NULL CHECK (limit_minor >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (budget_id, category_id)
);

CREATE INDEX idx_budgets_ledger_period ON budgets(ledger_id, period_type, period_key);
CREATE INDEX idx_category_budgets_budget ON category_budgets(budget_id);

-- ========== 交易模板 ==========
CREATE TABLE transaction_templates (
  id TEXT PRIMARY KEY NOT NULL,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'expense', 'income', 'transfer', 'credit_purchase',
    'repay_borrowing', 'loan_out', 'loan_recovery'
  )),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  source_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  target_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  merchant TEXT,
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_templates_ledger ON transaction_templates(ledger_id, sort_order);

-- ========== 周期交易 ==========
CREATE TABLE recurring_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES transaction_templates(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  interval_value INTEGER NOT NULL DEFAULT 1 CHECK (interval_value >= 1),
  next_occurrence_at TEXT NOT NULL,
  end_date TEXT,
  last_executed_at TEXT,
  last_transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_recurring_ledger_next ON recurring_transactions(ledger_id, next_occurrence_at);
CREATE INDEX idx_recurring_enabled ON recurring_transactions(enabled) WHERE enabled = 1;

-- ========== 提醒 ==========
CREATE TABLE reminders (
  id TEXT PRIMARY KEY NOT NULL,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'credit_card_due', 'prepaid_expiry', 'receivable_due', 'custom'
  )),
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  due_date TEXT NOT NULL,
  amount_minor INTEGER,
  advance_days INTEGER NOT NULL DEFAULT 3 CHECK (advance_days >= 0),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  last_triggered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_reminders_ledger_due ON reminders(ledger_id, due_date);
CREATE INDEX idx_reminders_enabled ON reminders(enabled) WHERE enabled = 1;
`,
}
