import type { Migration } from '../core/types'

export const IMPORT_BATCH_ERRORS_V11_MIGRATION: Migration = {
  version: 11,
  name: 'import_batch_errors_v11',
  statements: `
ALTER TABLE import_batches ADD COLUMN execution_errors_json TEXT;
`,
}
