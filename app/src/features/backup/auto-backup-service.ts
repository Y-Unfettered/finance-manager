/**
 * 每月自动备份。
 *
 * Android 不允许第三方 App 在进程被系统回收后按时间点执行代码，而备份包格式
 * （23 张表 dump + canonicalJson 键序 + SHA-256）必须在 JS 里生成，否则恢复时
 * 的校验值重算会不一致。所以这里不做原生定时器，而是把"每月一次"翻译成
 * 应用生命周期：进程启动和回到前台时检查"本月是否已有自动备份"，没有就补跑一份。
 * 每月首次打开应用即触发，对每日使用的记账 App 来说基本等同于月初自动备份。
 */

import { inject, type InjectionKey } from 'vue'

import { getLogger } from '@/features/debug/app-logger'
import type { SqliteExecutor } from '@/db/core/types'
import { AppSettingsRepository } from '@/db/repositories/app-settings-repository'
import type { Clock } from '@/domain/time'

import { BackupService } from './backup-service'

export const AUTO_BACKUP_ENABLED_KEY = 'auto_backup_enabled'
export const AUTO_BACKUP_LAST_MONTH_KEY = 'auto_backup_last_month'
export const AUTO_BACKUP_LAST_AT_KEY = 'auto_backup_last_at'

const log = getLogger('backup')

/** 备份文件写入口。写成功后才允许落地"本月已完成"标记。 */
export interface AutoBackupFileWriter {
  write(fileName: string, content: string): Promise<{ fileName: string; location?: string }>
}

export interface AutoBackupStatus {
  enabled: boolean
  /** 上一次自动备份所在月份（本地时区，形如 2026-09） */
  lastMonth: string | undefined
  /** 上一次自动备份的时间（ISO） */
  lastAt: string | undefined
  /** 当前本地时区月份 */
  currentMonth: string
  /** 当前月是否已有自动备份 */
  covered: boolean
}

export interface AutoBackupCreated {
  readonly ok: true
  readonly fileName: string
  readonly location?: string
  readonly month: string
}

export interface AutoBackupSkipped {
  readonly ok: false
  readonly skipped: true
  readonly reason: 'disabled' | 'already-covered'
  readonly month: string
}

export interface AutoBackupFailed {
  readonly ok: false
  readonly skipped: false
  readonly error: string
  readonly month: string
}

export type AutoBackupResult = AutoBackupCreated | AutoBackupSkipped | AutoBackupFailed

export interface AutoBackupServiceContext {
  readonly backup: BackupService
  readonly clock: Clock
  readonly writer: AutoBackupFileWriter
}

export const autoBackupServiceKey: InjectionKey<AutoBackupService> = Symbol('autoBackupService')

export function useAutoBackupService(): AutoBackupService | undefined {
  return inject(autoBackupServiceKey, undefined)
}

export class AutoBackupService {
  private readonly settings: AppSettingsRepository
  private inFlight: Promise<AutoBackupResult> | undefined

  constructor(
    database: SqliteExecutor,
    private readonly ctx: AutoBackupServiceContext,
  ) {
    this.settings = new AppSettingsRepository(database)
  }

  async getStatus(): Promise<AutoBackupStatus> {
    const nowIso = this.ctx.clock.nowIso()
    const [enabled, lastMonth, lastAt] = await Promise.all([
      this.settings.get(AUTO_BACKUP_ENABLED_KEY),
      this.settings.get(AUTO_BACKUP_LAST_MONTH_KEY),
      this.settings.get(AUTO_BACKUP_LAST_AT_KEY),
    ])
    const currentMonth = localMonthKey(nowIso)
    return {
      enabled: enabled === 'true',
      lastMonth,
      lastAt,
      currentMonth,
      covered: lastMonth !== undefined && lastMonth === currentMonth,
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.settings.set(
      AUTO_BACKUP_ENABLED_KEY,
      enabled ? 'true' : 'false',
      this.ctx.clock.nowIso(),
    )
  }

  /**
   * 月度补跑：仅在开关打开且本月尚无自动备份时创建。
   * 由进程启动和回到前台两处调用，内部有去重，重复调用安全。
   */
  async ensureMonthlyBackup(): Promise<AutoBackupResult> {
    const status = await this.getStatus()
    if (!status.enabled) {
      return { ok: false, skipped: true, reason: 'disabled', month: status.currentMonth }
    }
    if (status.covered) {
      return { ok: false, skipped: true, reason: 'already-covered', month: status.currentMonth }
    }
    return this.run(status.currentMonth, this.ctx.clock.nowIso())
  }

  /** 手动触发一次：立即创建并把本月标记为已完成，避免稍后重复补跑。 */
  async runNow(): Promise<AutoBackupResult> {
    const nowIso = this.ctx.clock.nowIso()
    return this.run(localMonthKey(nowIso), nowIso)
  }

  private run(month: string, nowIso: string): Promise<AutoBackupResult> {
    if (this.inFlight) return this.inFlight
    const pending = this.runOnce(month, nowIso)
    this.inFlight = pending
    void pending.finally(() => {
      if (this.inFlight === pending) this.inFlight = undefined
    })
    return pending
  }

  private async runOnce(month: string, nowIso: string): Promise<AutoBackupResult> {
    const fileName = autoBackupFileName(nowIso)
    try {
      const content = await this.ctx.backup.createBackupJson()
      const written = await this.ctx.writer.write(fileName, content)
      // 标记必须在文件写成功之后落地，否则"标记已更新但备份没落盘"
      await this.settings.set(AUTO_BACKUP_LAST_MONTH_KEY, month, nowIso)
      await this.settings.set(AUTO_BACKUP_LAST_AT_KEY, nowIso, nowIso)
      log.info('自动备份已创建', { fileName, month })
      return { ok: true, fileName: written.fileName, location: written.location, month }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error('自动备份失败', { fileName, month, msg: message })
      return { ok: false, skipped: false, error: message, month }
    }
  }
}

/** 本地时区月份键，形如 2026-09。 */
export function localMonthKey(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`无法解析时间：${iso}`)
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** 自动备份文件名，含本地日期与分钟，避免覆盖历史备份。 */
export function autoBackupFileName(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `finance-backup-auto-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.json`
}
