import type { Migration } from '../core/types'

export const TRANSACTION_DISCOUNTS_V10_MIGRATION: Migration = {
  version: 10,
  name: 'transaction_discounts_v10',
  statements: `
CREATE TABLE transaction_discounts (
  transaction_id TEXT PRIMARY KEY NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  original_amount_minor INTEGER NOT NULL CHECK (original_amount_minor > 0),
  discount_minor INTEGER NOT NULL CHECK (discount_minor > 0),
  created_at TEXT NOT NULL,
  CHECK (discount_minor < original_amount_minor)
);
`,
}
