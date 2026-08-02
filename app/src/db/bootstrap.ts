import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite'
import { Capacitor } from '@capacitor/core'

import { CapacitorSqliteExecutor } from './capacitor-executor'
import { runMigrations } from './migration-runner'
import { LATEST_SCHEMA_VERSION } from './migrations'

const DATABASE_NAME = 'finance_manager'
const sqlite = new SQLiteConnection(CapacitorSQLite)
let connectionPromise: Promise<SQLiteDBConnection> | undefined

export interface DatabaseBootstrapResult {
  initialized: boolean
  schemaVersion: number
  appliedMigrations: readonly number[]
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

  const appliedMigrations = await runMigrations(new CapacitorSqliteExecutor(connection))
  return {
    initialized: true,
    schemaVersion: LATEST_SCHEMA_VERSION,
    appliedMigrations,
  }
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
