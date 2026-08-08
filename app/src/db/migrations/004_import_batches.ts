import type { Migration } from '../core/types'

export const IMPORT_BATCHES_MIGRATION: Migration = {
  version: 4,
  name: 'import_batches',
  statements: `
CREATE TABLE import_batches (
  id TEXT PRIMARY KEY NOT NULL,
  ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('csv', 'qianji', 'other')),
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

ALTER TABLE transactions ADD COLUMN import_batch_id TEXT REFERENCES import_batches(id) ON DELETE SET NULL;

CREATE INDEX idx_transactions_import_batch ON transactions(import_batch_id) WHERE import_batch_id IS NOT NULL;
`,
}
