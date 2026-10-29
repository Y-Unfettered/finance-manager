// @vitest-environment node
import { runMigrations } from '@/db/migration-runner'
import type { Clock } from '@/domain/time'
import { NodeSqliteExecutor } from '@/test/node-sqlite-executor'

import {
  AUTO_BACKUP_ENABLED_KEY,
  AUTO_BACKUP_LAST_AT_KEY,
  AUTO_BACKUP_LAST_MONTH_KEY,
  autoBackupFileName,
  AutoBackupService,
  localMonthKey,
  type AutoBackupFileWriter,
} from './auto-backup-service'
import { BackupService } from './backup-service'

interface TestClock extends Clock {
  set(iso: string): void
}

function makeClock(iso: string): TestClock {
  let nowIso = iso
  return {
    nowIso: () => nowIso,
    set: (next: string) => {
      nowIso = next
    },
  }
}

class RecordingWriter implements AutoBackupFileWriter {
  readonly written: { fileName: string; content: string }[] = []
  shouldFail = false

  async write(fileName: string, content: string): Promise<{ fileName: string; location?: string }> {
    if (this.shouldFail) throw new Error('写入失败')
    this.written.push({ fileName, content })
    return { fileName, location: 'file://documents/' }
  }
}

// 取月中正午的 UTC 时间：在 UTC-12 到 UTC+11 的任何时区，本地月份都仍是当月
async function setup(iso = '2026-09-15T12:00:00.000Z') {
  const database = new NodeSqliteExecutor()
  const clock = makeClock(iso)
  await runMigrations(database, undefined, clock.nowIso)
  const backup = new BackupService({ database, clock, appVersion: '0.0.10' })
  const writer = new RecordingWriter()
  const service = new AutoBackupService(database, { backup, clock, writer })
  return { database, clock, backup, writer, service }
}

describe('AutoBackupService', () => {
  it('默认未启用，本月未覆盖', async () => {
    const { service } = await setup()
    const status = await service.getStatus()
    expect(status.enabled).toBe(false)
    expect(status.covered).toBe(false)
    expect(status.lastMonth).toBeUndefined()
    expect(status.lastAt).toBeUndefined()
    expect(status.currentMonth).toBe(localMonthKey('2026-09-15T12:00:00.000Z'))
  })

  it('未启用时不创建备份', async () => {
    const { service, writer } = await setup()
    const result = await service.ensureMonthlyBackup()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.skipped).toBe(true)
      if (result.skipped) expect(result.reason).toBe('disabled')
    }
    expect(writer.written).toHaveLength(0)
  })

  it('启用后首次补跑创建备份并落地本月标记', async () => {
    const { service, writer, clock } = await setup()
    await service.setEnabled(true)

    const result = await service.ensureMonthlyBackup()
    if (!result.ok) throw new Error(`预期创建成功：${JSON.stringify(result)}`)
    expect(result.fileName).toMatch(/^finance-backup-auto-202609\d{2}-\d{4}\.json$/)
    expect(result.location).toBe('file://documents/')
    expect(writer.written).toHaveLength(1)

    const status = await service.getStatus()
    expect(status.enabled).toBe(true)
    expect(status.covered).toBe(true)
    expect(status.lastMonth).toBe(localMonthKey(clock.nowIso()))
    expect(status.lastAt).toBe(clock.nowIso())
  })

  it('同一月份重复调用不会重复创建', async () => {
    const { service, writer } = await setup()
    await service.setEnabled(true)
    await service.ensureMonthlyBackup()

    const result = await service.ensureMonthlyBackup()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.skipped).toBe(true)
      if (result.skipped) expect(result.reason).toBe('already-covered')
    }
    expect(writer.written).toHaveLength(1)
  })

  it('跨月后再次补跑并更新标记', async () => {
    const { service, writer, clock } = await setup()
    await service.setEnabled(true)
    await service.ensureMonthlyBackup()

    clock.set('2026-10-15T12:00:00.000Z')
    const result = await service.ensureMonthlyBackup()
    if (!result.ok) throw new Error(`预期跨月补跑成功：${JSON.stringify(result)}`)
    expect(result.month).toBe(localMonthKey('2026-10-15T12:00:00.000Z'))
    expect(writer.written).toHaveLength(2)

    const status = await service.getStatus()
    expect(status.covered).toBe(true)
    expect(status.lastMonth).toBe('2026-10')
  })

  it('写入失败时不落地标记，修复后可重试', async () => {
    const { service, writer } = await setup()
    await service.setEnabled(true)
    writer.shouldFail = true

    const failed = await service.ensureMonthlyBackup()
    expect(failed.ok).toBe(false)
    if (!failed.ok) {
      expect(failed.skipped).toBe(false)
      if (!failed.skipped) expect(failed.error).toContain('写入失败')
    }
    let status = await service.getStatus()
    expect(status.covered).toBe(false)

    writer.shouldFail = false
    const retried = await service.ensureMonthlyBackup()
    if (!retried.ok) throw new Error(`预期重试成功：${JSON.stringify(retried)}`)
    expect(writer.written).toHaveLength(1)
    status = await service.getStatus()
    expect(status.covered).toBe(true)
  })

  it('runNow 立即创建并把本月标记为已完成', async () => {
    const { service, writer } = await setup()
    await service.setEnabled(true)

    const result = await service.runNow()
    if (!result.ok) throw new Error(`预期 runNow 成功：${JSON.stringify(result)}`)
    expect(writer.written).toHaveLength(1)

    const status = await service.getStatus()
    expect(status.covered).toBe(true)

    const skipped = await service.ensureMonthlyBackup()
    expect(skipped.ok).toBe(false)
    expect(writer.written).toHaveLength(1)
  })

  it('并发触发只创建一份备份', async () => {
    const { service, writer } = await setup()
    await service.setEnabled(true)
    await Promise.all([service.ensureMonthlyBackup(), service.runNow()])
    expect(writer.written).toHaveLength(1)
  })

  it('设置与标记持久化到 app_settings，新建实例可见', async () => {
    const { database, clock, backup, writer, service } = await setup()
    await service.setEnabled(true)
    await service.ensureMonthlyBackup()

    const rebuilt = new AutoBackupService(database, { backup, clock, writer })
    const status = await rebuilt.getStatus()
    expect(status.enabled).toBe(true)
    expect(status.covered).toBe(true)
  })

  it('关闭开关不再补跑，重新打开后继续按月创建', async () => {
    const { service, writer, clock } = await setup()
    await service.setEnabled(true)
    await service.ensureMonthlyBackup()
    await service.setEnabled(false)

    clock.set('2026-10-15T12:00:00.000Z')
    const result = await service.ensureMonthlyBackup()
    expect(result.ok).toBe(false)
    expect(writer.written).toHaveLength(1)

    await service.setEnabled(true)
    const resumed = await service.ensureMonthlyBackup()
    if (!resumed.ok) throw new Error(`预期重新打开后补跑：${JSON.stringify(resumed)}`)
    expect(writer.written).toHaveLength(2)
  })

  it('生成的文件是合法的备份包结构', async () => {
    const { service, writer } = await setup()
    await service.setEnabled(true)
    await service.ensureMonthlyBackup()

    const [written] = writer.written
    expect(written).toBeDefined()
    if (!written) return
    const parsed = JSON.parse(written.content) as Record<string, unknown>
    expect(parsed.format).toBe('finance-manager-backup')
    expect(parsed.version).toBe(1)
    expect(parsed.checksum).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('localMonthKey', () => {
  it('返回本地时区月份键', () => {
    expect(localMonthKey('2026-09-15T12:00:00.000Z')).toBe('2026-09')
    expect(localMonthKey('2026-01-05T12:00:00.000Z')).toBe('2026-01')
    expect(localMonthKey('2026-12-20T12:00:00.000Z')).toBe('2026-12')
  })

  it('拒绝无法解析的时间', () => {
    expect(() => localMonthKey('not-a-date')).toThrow(/无法解析时间/)
  })
})

describe('autoBackupFileName', () => {
  it('文件名含本地日期与分钟，且不同时间不重复', () => {
    const a = autoBackupFileName('2026-09-15T12:00:00.000Z')
    const b = autoBackupFileName('2026-09-15T12:05:00.000Z')
    expect(a).toMatch(/^finance-backup-auto-202609\d{2}-\d{4}\.json$/)
    expect(a).not.toBe(b)
  })
})

describe('设置键', () => {
  it('使用独立的 app_settings key，不与应用锁冲突', () => {
    expect([AUTO_BACKUP_ENABLED_KEY, AUTO_BACKUP_LAST_MONTH_KEY, AUTO_BACKUP_LAST_AT_KEY]).toEqual([
      'auto_backup_enabled',
      'auto_backup_last_month',
      'auto_backup_last_at',
    ])
    expect(new Set([AUTO_BACKUP_ENABLED_KEY, AUTO_BACKUP_LAST_MONTH_KEY, AUTO_BACKUP_LAST_AT_KEY])).toHaveLength(3)
  })
})
