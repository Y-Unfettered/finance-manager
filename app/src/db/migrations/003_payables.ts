import type { Migration } from '../core/types'

export const PAYABLES_MIGRATION: Migration = {
  version: 3,
  name: 'payable_management',
  statements: `
CREATE TABLE payables (
  id TEXT PRIMARY KEY NOT NULL,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE RESTRICT,
  borrow_transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  lender TEXT NOT NULL CHECK (length(trim(lender)) > 0),
  original_amount_minor INTEGER NOT NULL CHECK (original_amount_minor > 0),
  due_date TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_payables_ledger_status ON payables(ledger_id, status, due_date);
`,
}
