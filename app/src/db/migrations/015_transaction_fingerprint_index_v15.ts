import type { Migration } from '../core/types'

/**
 * v15：捕获指纹查重索引。
 *
 * 014 为 transactions 增加 fingerprint 列用于防重，但无索引——按指纹查重
 * （WHERE fingerprint = ?）会全表扫描。补齐部分索引。
 */
export const TRANSACTION_FINGERPRINT_INDEX_V15_MIGRATION: Migration = {
  version: 15,
  name: 'transaction_fingerprint_index_v15',
  statements: `
CREATE INDEX IF NOT EXISTS idx_transactions_fingerprint
  ON transactions(fingerprint)
  WHERE fingerprint IS NOT NULL;
`,
}
