import { BaseRepository } from './base-repository'

export type ImportSource = 'csv' | 'xlsx' | 'json' | 'qianji' | 'other'
export type ImportBatchStatus = 'active' | 'void'

export interface ImportBatchRecord {
  id: string
  ledgerId: string
  source: ImportSource
  fileName: string | null
  parserVersion: string | null
  fieldMappingJson: string | null
  sourceFingerprint: string | null
  recordCount: number
  successCount: number
  duplicateCount: number
  errorCount: number
  status: ImportBatchStatus
  note: string | null
  createdAt: string
  voidedAt: string | null
  executionErrorsJson: string | null
}

export interface CreateImportBatchInput {
  id: string
  ledgerId: string
  source: ImportSource
  fileName?: string
  parserVersion?: string
  fieldMappingJson?: string
  sourceFingerprint?: string
  recordCount: number
  note?: string
  createdAt: string
}

export interface ImportBatchCounters {
  successCount: number
  duplicateCount: number
  errorCount: number
}

export interface ImportBatchTransactionItem {
  id: string
  transactionId: string
  type: string
  amountMinor: number
  occurredAt: string
  merchant: string | null
  counterparty: string | null
  note: string | null
  categoryName: string | null
  primaryAccountName: string | null
  sourceAccountName: string | null
  targetAccountName: string | null
  status: string
}

interface ImportBatchTransactionRow {
  id: string
  transactionId: string
  type: string
  amountMinor: number
  occurredAt: string
  merchant: string | null
  counterparty: string | null
  note: string | null
  categoryName: string | null
  primaryAccountName: string | null
  sourceAccountName: string | null
  targetAccountName: string | null
  status: string
}

const IMPORT_BATCH_SELECT = `
  SELECT
    id,
    ledger_id AS ledgerId,
    source,
    file_name AS fileName,
    parser_version AS parserVersion,
    field_mapping_json AS fieldMappingJson,
    source_fingerprint AS sourceFingerprint,
    record_count AS recordCount,
    success_count AS successCount,
    duplicate_count AS duplicateCount,
    error_count AS errorCount,
    status,
    note,
    created_at AS createdAt,
    voided_at AS voidedAt,
    execution_errors_json AS executionErrorsJson
  FROM import_batches
`

const BATCH_TRANSACTION_SELECT = `
  SELECT
    transactions.id AS id,
    transactions.id AS transactionId,
    transactions.type,
    transactions.amount_minor AS amountMinor,
    transactions.occurred_at AS occurredAt,
    transactions.merchant,
    transactions.counterparty,
    transactions.note,
    transactions.status,
    MAX(categories.name) AS categoryName,
    MAX(CASE
      WHEN transactions.type NOT IN ('transfer','repayment','loan_out','loan_recovery','borrowing','repay_borrowing')
        AND accounts.id IS NOT NULL THEN accounts.name
    END) AS primaryAccountName,
    MAX(CASE
      WHEN transactions.type IN ('transfer','repayment','loan_out','loan_recovery','borrowing','repay_borrowing')
        AND entries.side = 'credit' THEN accounts.name
    END) AS sourceAccountName,
    MAX(CASE
      WHEN transactions.type IN ('transfer','repayment','loan_out','loan_recovery','borrowing','repay_borrowing')
        AND entries.side = 'debit' THEN accounts.name
    END) AS targetAccountName
  FROM transactions
  LEFT JOIN entries ON entries.transaction_id = transactions.id
  LEFT JOIN accounts ON accounts.id = entries.account_id
  LEFT JOIN categories ON categories.id = entries.category_id
  WHERE transactions.import_batch_id = ?
  GROUP BY transactions.id
  ORDER BY transactions.occurred_at DESC, transactions.created_at DESC
`

export class ImportBatchRepository extends BaseRepository {
  async create(input: CreateImportBatchInput): Promise<void> {
    const fileName = input.fileName?.trim() || null
    const parserVersion = input.parserVersion ?? null
    const fieldMappingJson = input.fieldMappingJson ?? null
    const sourceFingerprint = input.sourceFingerprint ?? null
    const note = input.note?.trim() || null
    await this.database.execute(
      `INSERT INTO import_batches (
        id, ledger_id, source, file_name, parser_version,
        field_mapping_json, source_fingerprint, record_count,
        success_count, duplicate_count, error_count, status, note,
        created_at, voided_at, execution_errors_json
      ) VALUES (
        '${sqlEscapeString(input.id)}',
        '${sqlEscapeString(input.ledgerId)}',
        '${sqlEscapeString(input.source)}',
        ${fileName !== null ? `'${sqlEscapeString(fileName)}'` : 'NULL'},
        ${parserVersion !== null ? `'${sqlEscapeString(parserVersion)}'` : 'NULL'},
        ${fieldMappingJson !== null ? `'${sqlEscapeString(fieldMappingJson)}'` : 'NULL'},
        ${sourceFingerprint !== null ? `'${sqlEscapeString(sourceFingerprint)}'` : 'NULL'},
        ${input.recordCount}, 0, 0, 0, 'active',
        ${note !== null ? `'${sqlEscapeString(note)}'` : 'NULL'},
        '${sqlEscapeString(input.createdAt)}', NULL, NULL)`,
      true,
    )
  }

  async findById(id: string): Promise<ImportBatchRecord | undefined> {
    const rows = await this.database.query<ImportBatchRecord>(
      `${IMPORT_BATCH_SELECT} WHERE id = ? LIMIT 1`,
      [id],
    )
    return rows[0]
  }

  async listByLedger(ledgerId: string): Promise<ImportBatchRecord[]> {
    const rows = await this.database.query<ImportBatchRecord>(
      `${IMPORT_BATCH_SELECT} WHERE ledger_id = ? ORDER BY created_at DESC`,
      [ledgerId],
    )
    return rows
  }

  async findActiveByFingerprint(
    ledgerId: string,
    sourceFingerprint: string,
  ): Promise<ImportBatchRecord | undefined> {
    const rows = await this.database.query<ImportBatchRecord>(
      `${IMPORT_BATCH_SELECT} WHERE ledger_id = ? AND source_fingerprint = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
      [ledgerId, sourceFingerprint],
    )
    return rows[0]
  }

  async findByFingerprint(
    ledgerId: string,
    sourceFingerprint: string,
  ): Promise<ImportBatchRecord | undefined> {
    const rows = await this.database.query<ImportBatchRecord>(
      `${IMPORT_BATCH_SELECT} WHERE ledger_id = ? AND source_fingerprint = ? ORDER BY created_at DESC LIMIT 1`,
      [ledgerId, sourceFingerprint],
    )
    return rows[0]
  }

  async updateCounters(
    id: string,
    counters: ImportBatchCounters,
    updatedAt: string,
  ): Promise<void> {
    await this.database.execute(
      `UPDATE import_batches
        SET success_count = ${counters.successCount}, duplicate_count = ${counters.duplicateCount}, error_count = ${counters.errorCount}
        WHERE id = '${sqlEscapeString(id)}'`,
      true,
    )
    void updatedAt
  }

  async saveExecutionErrors(
    id: string,
    executionErrorsJson: string,
  ): Promise<void> {
    await this.database.execute(
      `UPDATE import_batches
        SET execution_errors_json = '${sqlEscapeString(executionErrorsJson)}'
        WHERE id = '${sqlEscapeString(id)}'`,
      true,
    )
  }

  async attachTransaction(
    transactionId: string,
    batchId: string,
    updatedAt: string,
  ): Promise<void> {
    await this.database.execute(
      `UPDATE transactions SET import_batch_id = '${sqlEscapeString(batchId)}', updated_at = '${sqlEscapeString(updatedAt)}' WHERE id = '${sqlEscapeString(transactionId)}'`,
      true,
    )
  }

  async listTransactionIdsByBatch(batchId: string): Promise<string[]> {
    const rows = await this.database.query<{ id: string }>(
      `SELECT id FROM transactions WHERE import_batch_id = ? ORDER BY created_at ASC`,
      [batchId],
    )
    return rows.map((row) => row.id)
  }

  async listBatchActivity(batchId: string): Promise<ImportBatchTransactionItem[]> {
    const rows = await this.database.query<ImportBatchTransactionRow>(BATCH_TRANSACTION_SELECT, [
      batchId,
    ])
    return rows.map((row) => ({ ...row }))
  }

  async voidBatch(batchId: string, voidedAt: string): Promise<string[]> {
    const transactionIds = await this.listTransactionIdsByBatch(batchId)
    if (transactionIds.length === 0) {
      await this.markBatchVoided(batchId, voidedAt)
      return []
    }
    const escapedBatchId = sqlEscapeString(batchId)
    const escapedVoidedAt = sqlEscapeString(voidedAt)
    // Capacitor executeSet has a known bug with ? parameter binding and may
    // misbehave with empty values arrays. Use execute() with inline values and
    // call each statement separately (execute() only runs the first statement
    // when multiple are semicolon-separated).
    for (const id of transactionIds) {
      await this.database.execute(
        `UPDATE transactions SET status = 'void', updated_at = '${escapedVoidedAt}' WHERE id = '${sqlEscapeString(id)}'`,
        true,
      )
    }
    await this.database.execute(
      `UPDATE import_batches SET status = 'void', voided_at = '${escapedVoidedAt}' WHERE id = '${escapedBatchId}'`,
      true,
    )
    return transactionIds
  }

  async countActiveTransactionsByLedger(ledgerId: string): Promise<number> {
    const rows = await this.database.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM transactions WHERE ledger_id = ? AND status = 'posted'`,
      [ledgerId],
    )
    return rows[0]?.count ?? 0
  }

  private async markBatchVoided(batchId: string, voidedAt: string): Promise<void> {
    await this.database.execute(
      `UPDATE import_batches SET status = 'void', voided_at = '${sqlEscapeString(voidedAt)}' WHERE id = '${sqlEscapeString(batchId)}'`,
      true,
    )
  }
}

/** Minimal SQL string escaper for values that are safely sourced (UUIDs / ISO timestamps). */
function sqlEscapeString(value: string): string {
  return value.replace(/'/g, "''")
}
