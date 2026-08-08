// @vitest-environment node
import type { EntityKind, IdGenerator } from '@/domain/identity'
import type { Clock } from '@/domain/time'
import { runMigrations } from '@/db/migration-runner'
import { AccountRepository } from '@/db/repositories/account-repository'
import { LedgerRepository } from '@/db/repositories/ledger-repository'
import { TransactionRepository } from '@/db/repositories/transaction-repository'
import { FinanceService } from '@/features/finance/finance-service'
import { LedgerInitializationService } from '@/features/ledger/ledger-initialization-service'
import { NodeSqliteExecutor } from '@/test/node-sqlite-executor'

import { BackupService, verifyBackupJson } from './backup-service'
import { RestoreService } from './restore-service'

const clock: Clock = { nowIso: () => '2026-08-03T04:00:00.000Z' }

class SequenceIdGenerator implements IdGenerator {
  private readonly counts = new Map<EntityKind, number>()

  next(kind: EntityKind): string {
    const count = (this.counts.get(kind) ?? 0) + 1
    this.counts.set(kind, count)
    return `${kind}_${count}`
  }
}

async function setupLedgerWithExpenses() {
  const database = new NodeSqliteExecutor()
  const ids = new SequenceIdGenerator()
  await runMigrations(database, undefined, clock.nowIso)
  const { ledger } = await new LedgerInitializationService(
    new LedgerRepository(database),
    ids,
    clock,
  ).initialize()
  const finance = new FinanceService(database, ids, clock)
  const cash = (await finance.listAccounts(ledger.id)).find((a) => a.type === 'cash')!
  const food = (await finance.listExpenseCategories(ledger.id)).find((c) => c.name === '餐饮')!
  await finance.createExpense({
    ledgerId: ledger.id,
    amountMinor: 3_800,
    accountId: cash.id,
    categoryId: food.id,
    occurredAt: '2026-08-01T03:00:00.000Z',
    merchant: '午餐',
    note: '测试支出',
  })
  return { database, ids, ledger, finance, cash }
}

describe('BackupService', () => {
  it('creates a backup package with checksum and correct record counts', async () => {
    const { database } = await setupLedgerWithExpenses()
    const service = new BackupService({ database, clock, appVersion: '0.0.10' })

    const json = await service.createBackupJson()
    const parsed = JSON.parse(json)
    expect(parsed.format).toBe('finance-manager-backup')
    expect(parsed.version).toBe(1)
    expect(parsed.schemaVersion).toBe(8)
    expect(parsed.appVersion).toBe('0.0.10')
    expect(parsed.checksum).toMatch(/^[0-9a-f]{64}$/)
    expect(parsed.recordCounts.transactions).toBeGreaterThanOrEqual(1)
    expect(parsed.recordCounts.ledgers).toBe(1)
    expect(parsed.data.transactions).toHaveLength(parsed.recordCounts.transactions)
  })

  it('verifies a backup produced by createBackupJson', async () => {
    const { database } = await setupLedgerWithExpenses()
    const service = new BackupService({ database, clock, appVersion: '0.0.10' })

    const json = await service.createBackupJson()
    const result = await verifyBackupJson(json)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.schemaVersion).toBe(8)
      expect(result.totalRestored).toBeGreaterThan(0)
    }
  })

  it('rejects a tampered backup via checksum mismatch', async () => {
    const { database } = await setupLedgerWithExpenses()
    const service = new BackupService({ database, clock, appVersion: '0.0.10' })

    const json = await service.createBackupJson()
    const tampered = JSON.parse(json)
    tampered.data.transactions[0].merchant = '被篡改'
    const result = await verifyBackupJson(JSON.stringify(tampered))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('checksum_mismatch')
    }
  })

  it('rejects invalid JSON and unknown formats', async () => {
    const invalid = await verifyBackupJson('not json')
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) expect(invalid.reason).toBe('invalid_json')

    const wrong = await verifyBackupJson(JSON.stringify({ hello: 'world' }))
    expect(wrong.ok).toBe(false)
    if (!wrong.ok) expect(wrong.reason).toBe('format_mismatch')
  })
})

describe('RestoreService', () => {
  it('restores a backup into an empty database and reproduces balances', async () => {
    const { database, ids, ledger, cash } = await setupLedgerWithExpenses()
    const backupService = new BackupService({ database, clock, appVersion: '0.0.10' })
    const json = await backupService.createBackupJson()

    // 全新空库
    const fresh = new NodeSqliteExecutor()
    const freshIds = new SequenceIdGenerator()
    await runMigrations(fresh, undefined, clock.nowIso)
    const restore = new RestoreService({ database: fresh, clock, appVersion: '0.0.10' })

    const outcome = await restore.restoreFromJson(json)
    expect(outcome.result.ok).toBe(true)
    if (!outcome.result.ok) return

    // 余额应与原库一致
    const originalBalances = await new AccountRepository(database).listBalances(ledger.id)
    const restoredBalances = await new AccountRepository(fresh).listBalances(ledger.id)
    const originalCash = originalBalances.find((b) => b.id === cash.id)?.balanceMinor
    const restoredCash = restoredBalances.find((b) => b.id === cash.id)?.balanceMinor
    expect(restoredCash).toBe(originalCash)

    // 交易数量一致
    const originalTx = await new TransactionRepository(database, ids, clock).listByLedger(ledger.id)
    const restoredLedger = (await new LedgerRepository(fresh).findFirst())!
    const restoredTx = await new TransactionRepository(fresh, freshIds, clock).listByLedger(
      restoredLedger.id,
    )
    expect(restoredTx).toHaveLength(originalTx.length)
  })

  it('refuses to restore a backup with a corrupted checksum', async () => {
    const { database } = await setupLedgerWithExpenses()
    const backupService = new BackupService({ database, clock, appVersion: '0.0.10' })
    const json = await backupService.createBackupJson()
    const tampered = JSON.parse(json)
    tampered.checksum = '0'.repeat(64)

    const fresh = new NodeSqliteExecutor()
    await runMigrations(fresh, undefined, clock.nowIso)
    const restore = new RestoreService({ database: fresh, clock, appVersion: '0.0.10' })

    const outcome = await restore.restoreFromJson(JSON.stringify(tampered))
    expect(outcome.result.ok).toBe(false)
    if (!outcome.result.ok) expect(outcome.result.reason).toBe('checksum_mismatch')
  })

  it('generates a pre-restore backup before overwriting data', async () => {
    const { database, ids, ledger, cash, finance } = await setupLedgerWithExpenses()
    const backupService = new BackupService({ database, clock, appVersion: '0.0.10' })
    const sourceJson = await backupService.createBackupJson()

    // 在原库上再追加一笔交易，使恢复会覆盖数据
    const food = (await finance.listExpenseCategories(ledger.id)).find((c) => c.name === '餐饮')!
    void ids
    await finance.createExpense({
      ledgerId: ledger.id,
      amountMinor: 1_000,
      accountId: cash.id,
      categoryId: food.id,
      occurredAt: '2026-08-02T03:00:00.000Z',
      merchant: '恢复前新增',
    })
    const balanceBeforeRestore = (
      await new AccountRepository(database).listBalances(ledger.id)
    ).find((b) => b.id === cash.id)!.balanceMinor

    const restore = new RestoreService({ database, clock, appVersion: '0.0.10' })
    const outcome = await restore.restoreFromJson(sourceJson)
    expect(outcome.result.ok).toBe(true)
    expect(outcome.preRestoreBackup).toBeTruthy()

    // 恢复后余额应回到备份时状态（不含恢复前新增的交易）
    const balanceAfterRestore = (
      await new AccountRepository(database).listBalances(ledger.id)
    ).find((b) => b.id === cash.id)!.balanceMinor
    expect(balanceAfterRestore).not.toBe(balanceBeforeRestore)
  })
})
