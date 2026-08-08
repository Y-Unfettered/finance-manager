import type { Migration } from '../core/types'

export const RECEIVABLES_MIGRATION: Migration = {
  version: 2,
  name: 'receivable_management',
  statements: `
CREATE TABLE receivables (
  id TEXT PRIMARY KEY NOT NULL,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE RESTRICT,
  loan_transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  borrower TEXT NOT NULL CHECK (length(trim(borrower)) > 0),
  original_amount_minor INTEGER NOT NULL CHECK (original_amount_minor > 0),
  due_date TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_receivables_ledger_status ON receivables(ledger_id, status, due_date);
`,
}
