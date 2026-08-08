import { inject, type InjectionKey } from 'vue'

import { AppSettingsRepository } from '@/db/repositories/app-settings-repository'
import type { SqliteExecutor } from '@/db/core/types'
import type { Clock } from '@/domain/time'

export const APP_LOCK_ENABLED_KEY = 'app_lock_enabled'
export const APP_LOCK_PIN_HASH_KEY = 'app_lock_pin_hash'
export const APP_LOCK_PIN_SALT_KEY = 'app_lock_pin_salt'

export interface AppLockState {
  enabled: boolean
  hasPin: boolean
}

export const appLockServiceKey: InjectionKey<AppLockService> = Symbol('appLockService')

/**
 * 应用锁服务：管理 PIN 码的设置、验证与启用状态。
 * PIN 使用 SHA-256 + 随机盐哈希存储，不保存明文。
 */
export class AppLockService {
  private readonly settings: AppSettingsRepository

  constructor(
    database: SqliteExecutor,
    private readonly clock: Clock,
  ) {
    this.settings = new AppSettingsRepository(database)
  }

  /** 读取当前应用锁状态 */
  async getState(): Promise<AppLockState> {
    const [enabled, hash] = await Promise.all([
      this.settings.get(APP_LOCK_ENABLED_KEY),
      this.settings.get(APP_LOCK_PIN_HASH_KEY),
    ])
    return {
      enabled: enabled === 'true',
      hasPin: Boolean(hash),
    }
  }

  /** 设置 PIN 码（同时启用应用锁） */
  async setupPin(pin: string): Promise<void> {
    assertPin(pin)
    const salt = generateSalt()
    const hash = await hashPin(pin, salt)
    const now = this.clock.nowIso()
    await Promise.all([
      this.settings.set(APP_LOCK_PIN_HASH_KEY, hash, now),
      this.settings.set(APP_LOCK_PIN_SALT_KEY, salt, now),
      this.settings.set(APP_LOCK_ENABLED_KEY, 'true', now),
    ])
  }

  /** 验证 PIN 码 */
  async verifyPin(pin: string): Promise<boolean> {
    const [storedHash, salt] = await Promise.all([
      this.settings.get(APP_LOCK_PIN_HASH_KEY),
      this.settings.get(APP_LOCK_PIN_SALT_KEY),
    ])
    if (!storedHash || !salt) return false
    const hash = await hashPin(pin, salt)
    return constantTimeEqual(hash, storedHash)
  }

  /** 启用/禁用应用锁（需先设置 PIN） */
  async setEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
      const hash = await this.settings.get(APP_LOCK_PIN_HASH_KEY)
      if (!hash) throw new Error('请先设置 PIN 码')
    }
    const now = this.clock.nowIso()
    await this.settings.set(APP_LOCK_ENABLED_KEY, enabled ? 'true' : 'false', now)
  }

  /** 关闭应用锁并清除 PIN */
  async disable(): Promise<void> {
    const now = this.clock.nowIso()
    await Promise.all([
      this.settings.set(APP_LOCK_ENABLED_KEY, 'false', now),
      this.settings.remove(APP_LOCK_PIN_HASH_KEY),
      this.settings.remove(APP_LOCK_PIN_SALT_KEY),
    ])
  }

  /** 修改 PIN：需验证旧 PIN */
  async changePin(oldPin: string, newPin: string): Promise<void> {
    const ok = await this.verifyPin(oldPin)
    if (!ok) throw new Error('旧 PIN 码错误')
    await this.setupPin(newPin)
  }
}

function assertPin(pin: string): void {
  if (!/^\d{4,8}$/.test(pin)) {
    throw new Error('PIN 码应为 4-8 位数字')
  }
}

function generateSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export function useAppLockService(): AppLockService {
  const service = inject(appLockServiceKey)
  if (!service) throw new Error('AppLockService not provided')
  return service
}
