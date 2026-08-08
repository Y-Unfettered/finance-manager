import type { SqlValue } from '../core/types'
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
    voided_at AS voidedAt
  FROM import_batches
`

export class ImportBatchRepository extends BaseRepository {
  async create(input: CreateImportBatchInput): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `
            INSERT INTO import_batches (
              id, ledger_id, source, file_name, parser_version,
              field_mapping_json, source_fingerprint, record_count,
              success_count, duplicate_count, error_count, status, note,
              created_at, voided_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'active', ?, ?, NULL)
          `,
          values: [
            input.id,
            input.ledgerId,
            input.source,
            input.fileName?.trim() || null,
            input.parserVersion ?? null,
            input.fieldMappingJson ?? null,
            input.sourceFingerprint ?? null,
            input.recordCount,
            input.note?.trim() || null,
            input.createdAt,
          ],
        },
      ],
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
    await this.database.executeSet(
      [
        {
          statement: `
            UPDATE import_batches
            SET success_count = ?, duplicate_count = ?, error_count = ?
            WHERE id = ?
          `,
          values: [counters.successCount, counters.duplicateCount, counters.errorCount, id],
        },
      ],
      true,
    )
    void updatedAt
  }

  async attachTransaction(
    transactionId: string,
    batchId: string,
    updatedAt: string,
  ): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement: `UPDATE transactions SET import_batch_id = ?, updated_at = ? WHERE id = ?`,
          values: [batchId, updatedAt, transactionId],
        },
      ],
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

  async voidBatch(batchId: string, voidedAt: string): Promise<string[]> {
    const transactionIds = await this.listTransactionIdsByBatch(batchId)
    if (transactionIds.length === 0) {
      await this.markBatchVoided(batchId, voidedAt)
      return []
    }
    const statements = [
      ...transactionIds.map((id) => ({
        statement: `UPDATE transactions SET status = 'void', updated_at = ? WHERE id = ?`,
        values: [voidedAt, id] as SqlValue[],
      })),
      {
        statement: `UPDATE import_batches SET status = 'void', voided_at = ? WHERE id = ?`,
        values: [voidedAt, batchId] as SqlValue[],
      },
    ]
    await this.database.executeSet(statements, true)
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
    await this.database.executeSet(
      [
        {
          statement: `UPDATE import_batches SET status = 'void', voided_at = ? WHERE id = ?`,
          values: [voidedAt, batchId],
        },
      ],
      true,
    )
  }
}
