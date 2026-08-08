import { inject, type InjectionKey } from 'vue'

import type { Clock } from '@/domain/time'

import { BackupRepository } from './backup-repository'
import { BackupService, verifyBackupJson, type BackupServiceContext } from './backup-service'
import type { BackupData, BackupTableName, RestoreResult } from './backup-types'

export interface RestoreServiceContext extends BackupServiceContext {
  readonly clock: Clock
}

export interface RestoreOutcome {
  readonly result: RestoreResult
  /** 恢复前自动生成的备份 JSON（仅当确实执行了恢复时存在）。 */
  readonly preRestoreBackup?: string
}

export class RestoreService {
  private readonly repo: BackupRepository
  private readonly backup: BackupService

  constructor(private readonly ctx: RestoreServiceContext) {
    this.repo = new BackupRepository(ctx.database)
    this.backup = new BackupService(ctx)
  }

  /** 校验备份并通过后清空当前库再写入；恢复前会先生成一份自动备份。 */
  async restoreFromJson(json: string): Promise<RestoreOutcome> {
    const verification = await verifyBackupJson(json)
    if (!verification.ok) {
      return { result: verification }
    }

    const preRestoreBackup = await this.backup.createBackupJson()
    const pkg = parseBackupData(json)
    const restoredCounts = await this.repo.replaceAll(pkg)

    return {
      result: {
        ok: true,
        schemaVersion: verification.schemaVersion,
        backupCreatedAt: verification.backupCreatedAt,
        restoredCounts,
        totalRestored: sumCounts(restoredCounts),
      },
      preRestoreBackup,
    }
  }
}

function parseBackupData(json: string): BackupData {
  const parsed = JSON.parse(json) as { data: BackupData }
  return parsed.data
}

function sumCounts(counts: Record<BackupTableName, number>): number {
  let total = 0
  for (const key of Object.keys(counts)) {
    total += counts[key as BackupTableName] ?? 0
  }
  return total
}

export const restoreServiceKey: InjectionKey<RestoreService> = Symbol('restoreService')

export function useRestoreService(): RestoreService | undefined {
  return inject(restoreServiceKey, undefined)
}
