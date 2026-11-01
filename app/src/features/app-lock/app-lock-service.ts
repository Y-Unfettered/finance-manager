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
 * PIN 使用 PBKDF2-SHA256（21 万轮）+ 随机盐哈希存储，不保存明文。
 * 旧版本（单轮 SHA-256）哈希在验证成功后透明升级为 PBKDF2。
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
    const now = this.clock.nowIso()
    const stored = await this.buildPbkdf2Storage(pin)
    await Promise.all([
      this.settings.set(APP_LOCK_PIN_HASH_KEY, stored, now),
      this.settings.set(APP_LOCK_ENABLED_KEY, 'true', now),
    ])
  }

  /** 验证 PIN 码。旧格式（单轮 SHA-256）验证成功后透明升级为 PBKDF2。 */
  async verifyPin(pin: string): Promise<boolean> {
    const [storedHash, legacySalt] = await Promise.all([
      this.settings.get(APP_LOCK_PIN_HASH_KEY),
      this.settings.get(APP_LOCK_PIN_SALT_KEY),
    ])
    if (!storedHash) return false

    if (isPbkdf2Storage(storedHash)) {
      const [, , salt, expected] = storedHash.split('$')
      if (!salt || !expected) return false
      const hash = await pbkdf2Hash(pin, salt)
      return constantTimeEqual(hash, expected)
    }

    // 旧格式：单轮 SHA-256(salt:pin)
    if (!legacySalt) return false
    const legacy = await legacyHashPin(pin, legacySalt)
    if (!constantTimeEqual(legacy, storedHash)) return false
    // 验证通过 → 升级存储格式（旧 PIN 不变，仅加固）
    const stored = await this.buildPbkdf2Storage(pin)
    await this.settings.set(APP_LOCK_PIN_HASH_KEY, stored, this.clock.nowIso())
    return true
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

  /** 生成新的 PBKDF2 存储串（setupPin / 透明升级共用）。 */
  private async buildPbkdf2Storage(pin: string): Promise<string> {
    const salt = generateSalt()
    const hash = await pbkdf2Hash(pin, salt)
    return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`
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

/** PBKDF2 迭代次数：4-8 位纯数字 PIN 的离线爆破成本主要取决于它（OWASP 建议 ≥6e5，取 2.1e5 平衡移动端解锁延迟）。 */
const PBKDF2_ITERATIONS = 210_000

/** 旧版单轮 SHA-256 哈希（v1.1.0 及之前），仅用于验证并透明升级。 */
async function legacyHashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function pbkdf2Hash(pin: string, salt: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(salt),
      iterations: PBKDF2_ITERATIONS,
    },
    keyMaterial,
    256,
  )
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** 新存储格式：pbkdf2$<iterations>$<salt>$<hash>（自带参数，便于未来调轮次/换算法）。 */
function isPbkdf2Storage(stored: string): boolean {
  return stored.startsWith('pbkdf2$')
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
