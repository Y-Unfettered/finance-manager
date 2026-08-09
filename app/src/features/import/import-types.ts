import type { TransactionType } from '@/domain/accounting'

export type ImportTransactionType =
  'expense' | 'income' | 'transfer' | 'credit_purchase' | 'repayment' | 'refund'

export type ImportSystemField =
  | 'type'
  | 'amount'
  | 'date'
  | 'time'
  | 'merchant'
  | 'note'
  | 'sourceAccount'
  | 'targetAccount'
  | 'category'
  | 'sourceTransactionId'

export interface CsvFieldMapping {
  systemField: ImportSystemField
  columnIndex: number
  defaultValue?: string
}

export interface AccountNameMapping {
  rawName: string
  accountId: string
}

export interface CategoryNameMapping {
  rawName: string
  categoryId: string
}

export type ImportTransactionKind = 'expense' | 'income' | 'transfer'

export type ImportTransferPurpose = 'loan_out'

export interface ParsedImportRow {
  readonly index: number
  readonly raw: Record<string, string>
  readonly kind: ImportTransactionKind
  /** 转账的业务含义。借出款必须保留该语义，不能退化为普通资金转账。 */
  readonly transferPurpose?: ImportTransferPurpose
  readonly typeInferred: boolean
  readonly amountMinor: number
  readonly occurredAt: string
  readonly merchant?: string
  readonly note?: string
  readonly sourceAccountName?: string
  readonly targetAccountName?: string
  readonly categoryName?: string
  readonly sourceTransactionId?: string
}

export interface ResolvedImportRow {
  readonly index: number
  readonly raw: ParsedImportRow
  readonly sourceAccountId?: string
  readonly targetAccountId?: string
  readonly categoryId?: string
  readonly fingerprint: string
}

export interface ImportError {
  readonly rowIndex: number
  readonly message: string
  readonly rawRow?: Record<string, string>
}

export interface DuplicateImportRow {
  readonly rowIndex: number
  readonly fingerprint: string
  readonly existingTransactionId: string
}

export type ImportSourceType = 'csv' | 'xlsx' | 'json' | 'qianji' | 'other'

export interface PendingAccountCreation {
  readonly rawName: string
  readonly accountType: string
  readonly inferredName: string
  readonly institution?: string
}

export interface PendingCategoryCreation {
  readonly rawName: string
  readonly kind: 'expense' | 'income'
}

export interface ImportPlan {
  readonly fileName: string
  readonly source: ImportSourceType
  readonly totalRows: number
  readonly validRows: ResolvedImportRow[]
  readonly errors: ImportError[]
  readonly duplicates: DuplicateImportRow[]
  readonly fieldMapping: readonly CsvFieldMapping[]
  readonly sourceFingerprint: string
  readonly pendingAccountCreations: readonly PendingAccountCreation[]
  readonly pendingCategoryCreations: readonly PendingCategoryCreation[]
}

export interface ImportResult {
  readonly batchId: string
  readonly successCount: number
  readonly duplicateCount: number
  readonly errorCount: number
  readonly importedTransactionIds: string[]
  /** 执行阶段失败的行及其错误信息（预览阶段已识别的错误在 plan.errors 中） */
  readonly executionErrors: readonly ExecutionError[]
}

export interface ExecutionError {
  readonly rowIndex: number
  readonly message: string
}

export type TransactionTypeForImport = Extract<TransactionType, 'expense' | 'income' | 'transfer'>
