import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'

import { CapacitorSqliteExecutor } from './capacitor-executor'
import { runMigrations } from './migration-runner'
import { LATEST_SCHEMA_VERSION } from './migrations'
import { LedgerRepository } from './repositories/ledger-repository'
import { LedgerInitializationService } from '@/features/ledger/ledger-initialization-service'
import { BackupRepository } from '@/features/backup/backup-repository'
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  type BackupPackage,
  type BackupPayload,
} from '@/features/backup/backup-types'
import { systemClock } from '@/domain/time'
import { systemIdGenerator } from '@/domain/identity'

const DATABASE_NAME = 'finance_manager'
const sqlite = new SQLiteConnection(CapacitorSQLite)
let connectionPromise: Promise<SQLiteDBConnection> | undefined
let databaseExecutor: CapacitorSqliteExecutor | undefined

export interface DatabaseBootstrapResult {
  initialized: boolean
  schemaVersion: number
  appliedMigrations: readonly number[]
  ledgerId?: string
  /** 升级前自动创建的备份文件路径（如有） */
  migrationBackupPath?: string
  /** migration 失败时的错误信息 */
  migrationError?: string
}

interface AppliedVersionRow {
  version: number
}

export async function initializeFinanceDatabase(): Promise<DatabaseBootstrapResult> {
  if (!Capacitor.isNativePlatform()) {
    return { initialized: false, schemaVersion: 0, appliedMigrations: [] }
  }

  const connection = await getOrCreateConnection()
  const openResult = await connection.isDBOpen()
  if (!openResult.result) {
    await connection.open()
  }

  databaseExecutor ??= new CapacitorSqliteExecutor(connection)

  // 检测是否需要 migration：已有数据库且版本低于最新时，先自动备份
  let migrationBackupPath: string | undefined
  const pendingMigrations = await getPendingMigrations(databaseExecutor)
  if (pendingMigrations.length > 0) {
    migrationBackupPath = await createMigrationBackup(databaseExecutor)
  }

  let appliedMigrations: readonly number[]
  let migrationError: string | undefined
  try {
    appliedMigrations = await runMigrations(databaseExecutor)
  } catch (error) {
    migrationError = error instanceof Error ? error.message : String(error)
    return {
      initialized: false,
      schemaVersion: 0,
      appliedMigrations: [],
      migrationBackupPath,
      migrationError,
    }
  }

  const initialization = await new LedgerInitializationService(
    new LedgerRepository(databaseExecutor),
    systemIdGenerator,
    systemClock,
  ).initialize()
  return {
    initialized: true,
    schemaVersion: LATEST_SCHEMA_VERSION,
    appliedMigrations,
    ledgerId: initialization.ledger.id,
    migrationBackupPath,
  }
}

/** 查询当前已应用的 migration 版本，返回待执行版本列表。 */
async function getPendingMigrations(executor: CapacitorSqliteExecutor): Promise<readonly number[]> {
  try {
    const rows = await executor.query<AppliedVersionRow>(
      'SELECT version FROM schema_migrations ORDER BY version ASC',
    )
    if (rows.length === 0) return []
    const applied = new Set(rows.map((r) => r.version))
    // 如果已有版本等于最新版本，无需升级
    const maxApplied = Math.max(...rows.map((r) => r.version))
    if (maxApplied >= LATEST_SCHEMA_VERSION) return []
    return Array.from(
      { length: LATEST_SCHEMA_VERSION - maxApplied },
      (_, i) => maxApplied + i + 1,
    ).filter((v) => !applied.has(v))
  } catch {
    // schema_migrations 表不存在（首次初始化）
    return []
  }
}

/** migration 前自动生成 JSON 备份到 Documents 目录。 */
async function createMigrationBackup(
  executor: CapacitorSqliteExecutor,
): Promise<string | undefined> {
  try {
    const repo = new BackupRepository(executor)
    const [data, recordCounts] = await Promise.all([repo.dumpAll(), repo.countAll()])
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const payload: BackupPayload = {
      format: BACKUP_FORMAT,
      version: BACKUP_FORMAT_VERSION,
      schemaVersion: LATEST_SCHEMA_VERSION,
      appVersion: 'migration-backup',
      createdAt: systemClock.nowIso(),
      recordCounts,
      data,
    }
    const checksum = await computeChecksum(payload)
    const pkg: BackupPackage = { ...payload, checksum }
    const fileName = `migration-backup-${timestamp}.json`
    const result = await Filesystem.writeFile({
      path: fileName,
      data: JSON.stringify(pkg),
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true,
    })
    return result.uri
  } catch {
    // 备份失败不应阻塞 migration
    return undefined
  }
}

async function computeChecksum(payload: BackupPayload): Promise<string> {
  const text = JSON.stringify(payload)
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function requireFinanceDatabase(): CapacitorSqliteExecutor {
  if (!databaseExecutor) {
    throw new Error('Finance database has not been initialized')
  }
  return databaseExecutor
}

async function getOrCreateConnection(): Promise<SQLiteDBConnection> {
  connectionPromise ??= createConnection()
  return connectionPromise
}

async function createConnection(): Promise<SQLiteDBConnection> {
  const consistency = await sqlite.checkConnectionsConsistency()
  if (consistency.result) {
    const existing = await sqlite.isConnection(DATABASE_NAME, false)
    if (existing.result) {
      return sqlite.retrieveConnection(DATABASE_NAME, false)
    }
  }

  return sqlite.createConnection(
    DATABASE_NAME,
    false,
    'no-encryption',
    LATEST_SCHEMA_VERSION,
    false,
  )
}
