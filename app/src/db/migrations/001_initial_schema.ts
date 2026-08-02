import type { Migration } from '../core/types'

export const INITIAL_SCHEMA_MIGRATION: Migration = {
  version: 1,
  name: 'initial_finance_schema',
  statements: `
CREATE TABLE ledgers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  base_currency TEXT NOT NULL DEFAULT 'CNY' CHECK (base_currency = 'CNY'),
  period_start_day INTEGER NOT NULL DEFAULT 1 CHECK (period_start_day BETWEEN 1 AND 28),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  type TEXT NOT NULL CHECK (type IN (
    'cash', 'bank', 'platform', 'restricted_asset', 'prepaid', 'investment',
    'receivable', 'credit_card', 'consumer_credit', 'other_liability'
  )),
  normal_balance TEXT NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
  currency TEXT NOT NULL DEFAULT 'CNY' CHECK (currency = 'CNY'),
  institution TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (type IN ('credit_card', 'consumer_credit', 'other_liability') AND normal_balance = 'credit')
    OR
    (type NOT IN ('credit_card', 'consumer_credit', 'other_liability') AND normal_balance = 'debit')
  ),
  UNIQUE (ledger_id, name)
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY NOT NULL,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (ledger_id, kind, name)
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY NOT NULL,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'expense', 'income', 'transfer', 'credit_purchase', 'repayment',
    'refund', 'loan_out', 'loan_recovery', 'balance_adjustment', 'opening_balance'
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
  updated_at TEXT NOT NULL
);

CREATE TABLE entries (
  id TEXT PRIMARY KEY NOT NULL,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
  category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
  side TEXT NOT NULL CHECK (side IN ('debit', 'credit')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  created_at TEXT NOT NULL,
  CHECK ((account_id IS NOT NULL) <> (category_id IS NOT NULL))
);

CREATE INDEX idx_accounts_ledger_type ON accounts(ledger_id, type);
CREATE INDEX idx_categories_ledger_kind ON categories(ledger_id, kind);
CREATE INDEX idx_transactions_ledger_occurred ON transactions(ledger_id, occurred_at DESC);
CREATE INDEX idx_transactions_ledger_type ON transactions(ledger_id, type);
CREATE INDEX idx_entries_transaction ON entries(transaction_id);
CREATE INDEX idx_entries_account ON entries(account_id);
CREATE INDEX idx_entries_category ON entries(category_id);

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

CREATE VIEW account_balances AS
SELECT
  account.id AS account_id,
  account.ledger_id AS ledger_id,
  COALESCE(SUM(
    CASE
      WHEN transactions.status <> 'posted' OR transactions.id IS NULL THEN 0
      WHEN entries.side = account.normal_balance THEN entries.amount_minor
      ELSE -entries.amount_minor
    END
  ), 0) AS balance_minor
FROM accounts AS account
LEFT JOIN entries ON entries.account_id = account.id
LEFT JOIN transactions ON transactions.id = entries.transaction_id
GROUP BY account.id, account.ledger_id;

CREATE VIEW transaction_balances AS
SELECT
  transactions.id AS transaction_id,
  transactions.ledger_id AS ledger_id,
  COALESCE(SUM(CASE WHEN entries.side = 'debit' THEN entries.amount_minor ELSE 0 END), 0)
    AS debit_minor,
  COALESCE(SUM(CASE WHEN entries.side = 'credit' THEN entries.amount_minor ELSE 0 END), 0)
    AS credit_minor
FROM transactions
LEFT JOIN entries ON entries.transaction_id = transactions.id
GROUP BY transactions.id, transactions.ledger_id;
`,
}
