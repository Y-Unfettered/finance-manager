/**
 * 完整本地备份包格式。
 *
 * 备份以 JSON 文本形式存储，包含 schema 版本、时间、记录数和 SHA-256 校验值，
 * 用于在空库中完整恢复账本数据。
 */

export const BACKUP_FORMAT = 'finance-manager-backup'
export const BACKUP_FORMAT_VERSION = 1

/** 备份中包含的数据表名（按恢复顺序排列，遵循外键依赖）。 */
export const BACKUP_TABLES = [
  'schema_migrations',
  'ledgers',
  'ledger_preferences',
  'accounts',
  'account_preferences',
  'credit_profiles',
  'categories',
  'category_preferences',
  'app_settings',
  'import_batches',
  'transactions',
  'transaction_links',
  'transaction_attachments',
  'entries',
  'receivables',
  'payables',
  'budgets',
  'budget_policies',
  'category_budgets',
  'transaction_templates',
  'recurring_transactions',
  'reminders',
] as const

export type BackupTableName = (typeof BACKUP_TABLES)[number]

/** 各表对应的原始行集合，键为表名，值为行数组。 */
export type BackupData = Record<BackupTableName, readonly Record<string, SqlJsonValue>[]>

/** 备份包中可被 JSON 序列化的值类型。 */
export type SqlJsonValue = string | number | boolean | null

export interface BackupPackage {
  readonly format: typeof BACKUP_FORMAT
  readonly version: typeof BACKUP_FORMAT_VERSION
  readonly schemaVersion: number
  readonly appVersion: string
  readonly createdAt: string
  readonly recordCounts: Record<BackupTableName, number>
  readonly data: BackupData
  readonly checksum: string
}

/** 用于生成备份包的输入（不含校验值，由服务计算）。 */
export interface BackupPayload {
  readonly format: typeof BACKUP_FORMAT
  readonly version: typeof BACKUP_FORMAT_VERSION
  readonly schemaVersion: number
  readonly appVersion: string
  readonly createdAt: string
  readonly recordCounts: Record<BackupTableName, number>
  readonly data: BackupData
}

export interface RestoreSummary {
  readonly restoredCounts: Record<BackupTableName, number>
  readonly totalRestored: number
  readonly schemaVersion: number
  readonly backupCreatedAt: string
}

export interface RestoreFailure {
  readonly reason:
    'invalid_json' | 'format_mismatch' | 'checksum_mismatch' | 'schema_too_new' | 'empty_backup'
  readonly message: string
}

export type RestoreResult = ({ ok: true } & RestoreSummary) | ({ ok: false } & RestoreFailure)
