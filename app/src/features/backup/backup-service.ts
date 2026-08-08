import { inject, type InjectionKey } from 'vue'

import type { Clock } from '@/domain/time'
import type { SqliteExecutor } from '@/db/core/types'
import { LATEST_SCHEMA_VERSION } from '@/db/migrations'

import { BackupRepository } from './backup-repository'
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BACKUP_TABLES,
  type BackupPackage,
  type BackupPayload,
  type BackupTableName,
  type RestoreResult,
} from './backup-types'

export interface BackupServiceContext {
  readonly database: SqliteExecutor
  readonly clock: Clock
  readonly appVersion: string
}

export class BackupService {
  private readonly repo: BackupRepository

  constructor(private readonly ctx: BackupServiceContext) {
    this.repo = new BackupRepository(ctx.database)
  }

  /** 生成完整备份包并序列化为 JSON 字符串。 */
  async createBackupJson(): Promise<string> {
    const pkg = await this.createBackup()
    return serializeBackup(pkg)
  }

  async createBackup(): Promise<BackupPackage> {
    const [data, recordCounts] = await Promise.all([this.repo.dumpAll(), this.repo.countAll()])
    const payload: BackupPayload = {
      format: BACKUP_FORMAT,
      version: BACKUP_FORMAT_VERSION,
      schemaVersion: LATEST_SCHEMA_VERSION,
      appVersion: this.ctx.appVersion,
      createdAt: this.ctx.clock.nowIso(),
      recordCounts,
      data,
    }
    const checksum = await computeChecksum(payload)
    return { ...payload, checksum }
  }

  /** 校验备份 JSON 的格式与校验值，不写入数据库。 */
  async verifyBackupJson(json: string): Promise<RestoreResult> {
    return verifyBackupJson(json)
  }

  /** 返回当前数据库各表的记录数，用于在恢复前生成自动备份或展示。 */
  async countCurrent(): Promise<Record<BackupTableName, number>> {
    return this.repo.countAll()
  }
}

/** 解析并校验备份 JSON，返回成功后的备份包或失败原因。 */
export async function verifyBackupJson(json: string): Promise<RestoreResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, reason: 'invalid_json', message: '备份文件不是有效的 JSON。' }
  }

  if (!isBackupPackageShape(parsed)) {
    return { ok: false, reason: 'format_mismatch', message: '备份文件格式或字段不完整。' }
  }

  const { checksum, ...payload } = parsed
  const expected = await computeChecksum(payload)
  if (checksum !== expected) {
    return { ok: false, reason: 'checksum_mismatch', message: '备份校验值不匹配，文件可能已损坏。' }
  }

  const totalRecords = BACKUP_TABLES.reduce(
    (sum, table) => sum + (payload.recordCounts[table] ?? 0),
    0,
  )
  if (totalRecords === 0) {
    return { ok: false, reason: 'empty_backup', message: '备份不包含任何记录。' }
  }

  if (payload.schemaVersion > LATEST_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: 'schema_too_new',
      message: `备份的 schema 版本 ${payload.schemaVersion} 高于当前应用支持的 ${LATEST_SCHEMA_VERSION}，请先升级应用。`,
    }
  }

  return {
    ok: true,
    schemaVersion: payload.schemaVersion,
    backupCreatedAt: payload.createdAt,
    restoredCounts: payload.recordCounts,
    totalRestored: totalRecords,
  }
}

export function serializeBackup(pkg: BackupPackage): string {
  return JSON.stringify(pkg)
}

/** 计算备份载荷的 SHA-256 校验值（小写十六进制）。 */
export async function computeChecksum(payload: BackupPayload): Promise<string> {
  const text = canonicalJson(payload)
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return bytesToHex(new Uint8Array(digest))
}

function canonicalJson(payload: BackupPayload): string {
  const ordered: Record<string, unknown> = {
    format: payload.format,
    version: payload.version,
    schemaVersion: payload.schemaVersion,
    appVersion: payload.appVersion,
    createdAt: payload.createdAt,
    recordCounts: sortObjectKeys(payload.recordCounts),
    data: sortDataKeys(payload.data),
  }
  return JSON.stringify(ordered)
}

function sortObjectKeys(value: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {}
  for (const key of Object.keys(value).sort()) {
    const entry = value[key]
    if (entry !== undefined) result[key] = entry
  }
  return result
}

function sortDataKeys(data: BackupPayload['data']): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of BACKUP_TABLES) {
    result[key] = data[key] ?? []
  }
  return result
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}

function isBackupPackageShape(value: unknown): value is BackupPackage {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    candidate.format === BACKUP_FORMAT &&
    candidate.version === BACKUP_FORMAT_VERSION &&
    typeof candidate.schemaVersion === 'number' &&
    typeof candidate.appVersion === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.checksum === 'string' &&
    typeof candidate.recordCounts === 'object' &&
    typeof candidate.data === 'object'
  )
}

export const backupServiceKey: InjectionKey<BackupService> = Symbol('backupService')

export function useBackupService(): BackupService | undefined {
  return inject(backupServiceKey, undefined)
}
