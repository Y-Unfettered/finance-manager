/**
 * 应用内诊断日志模块。
 *
 * 提供分级日志记录（debug/info/warn/error），支持按 tag 开关和全局级别过滤。
 * 开发阶段默认全开，正式版可通过 setConfig 关闭不需要的日志。
 * 容量上限（默认 2000 条，超过后裁剪旧记录）。
 *
 * 配置持久化到 localStorage，key: `app-log-config`
 */

import { defineStore } from 'pinia'

import type { SqliteExecutor } from '@/db/core/types'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  id: number
  timestamp: number // ms
  level: LogLevel
  tag: string // 业务分类标签，如 clipboard/import/finance/nav
  message: string
  data?: Record<string, unknown>
}

const DEFAULT_MAX_ENTRIES = 2000
const CONFIG_KEY = 'app-log-config'

/** 级别排序，数字越大越严格 */
const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

/** 开发环境默认配置：全开。 */
const DEV_DEFAULT_CONFIG: LogConfig = {
  enabled: true,
  maxEntries: DEFAULT_MAX_ENTRIES,
  tagMinLevels: {}, // 空 = 所有 tag 从全局级别开始
  globalMinLevel: 'debug',
}

/** 正式发布环境默认配置：只保留 warn/error。 */
export const PRODUCTION_DEFAULT_CONFIG: LogConfig = {
  enabled: true,
  maxEntries: 500,
  tagMinLevels: {},
  globalMinLevel: 'warn',
}

export interface TagFilter {
  /** 该 tag 允许的最小级别（null = 关闭该 tag）。 */
  minLevel: LogLevel | null
}

export interface LogConfig {
  /** 日志系统总开关。 */
  enabled: boolean
  /** 最大条目数。 */
  maxEntries: number
  /** 全局最小级别过滤。 */
  globalMinLevel: LogLevel
  /** 按 tag 的独立级别覆盖（高优先级）。 */
  tagMinLevels: Record<string, LogLevel | null>
}

const defaultConfig = (): LogConfig => ({ ...DEV_DEFAULT_CONFIG })

let nextLogId = 1
function makeEntry(level: LogLevel, tag: string, message: string, data?: Record<string, unknown>): LogEntry {
  return {
    id: nextLogId++,
    timestamp: Date.now(),
    level,
    tag,
    message,
    data,
  }
}

/** 轻量级格式化，日志页友好显示 */
export function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
  )
}

function loadConfig(): LogConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LogConfig>
      return { ...defaultConfig(), ...parsed }
    }
  } catch {
    // 忽略损坏的配置
  }
  return defaultConfig()
}

function saveConfig(config: LogConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  } catch {
    // 忽略存储失败
  }
}

// ============================================================
// SQLite 落盘（PRD 需求三：最近 3 个自然日滚动保留，双闸容量）
// ============================================================

const LOG_RETENTION_DAYS = 3
const LOG_DAILY_CAP = 800
const LOG_BYTE_CAP = 2 * 1024 * 1024
const LOG_FLUSH_DELAY_MS = 800
const LOG_DATA_MAX_BYTES = 1024

let logDb: SqliteExecutor | null = null
let logFlushTimer: number | undefined
let logFlushing = false
const logWriteQueue: LogEntry[] = []

function localDayKey(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function serializeLogData(data?: Record<string, unknown>): string | null {
  if (!data) return null
  let json = JSON.stringify(data)
  if (json.length > LOG_DATA_MAX_BYTES) {
    json = `${json.slice(0, LOG_DATA_MAX_BYTES - 24)},"__truncated":true}`
  }
  return json
}

function safeParseLogData(raw: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return undefined
  }
}

/** 数据库就绪后调用（main.ts bootstrap）：挂接落盘、启动回灌、切后台强制 flush。 */
export function attachLogDatabase(executor: SqliteExecutor): void {
  logDb = executor
  void hydrateLogsFromDatabase()
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flushLogsNow()
    })
  }
}

async function hydrateLogsFromDatabase(): Promise<void> {
  if (!logDb) return
  try {
    const cutoff = Date.now() - (LOG_RETENTION_DAYS - 1) * 86_400_000
    const rows = await logDb.query<{
      id: number
      ts: number
      level: LogLevel
      tag: string
      message: string
      data_json: string | null
    }>('SELECT id, ts, level, tag, message, data_json FROM app_logs WHERE ts >= ? ORDER BY ts ASC', [
      cutoff,
    ])
    const store = getStore()
    if (!store) return
    const hydrated: LogEntry[] = rows.map((row) => ({
      id: row.id,
      timestamp: row.ts,
      level: row.level,
      tag: row.tag,
      message: row.message,
      data: row.data_json ? safeParseLogData(row.data_json) : undefined,
    }))
    if (hydrated.length) {
      const seen = new Set(store.entries.map((e) => `${e.timestamp}|${e.tag}|${e.message}`))
      const merged = [
        ...hydrated.filter((e) => !seen.has(`${e.timestamp}|${e.tag}|${e.message}`)),
        ...store.entries,
      ]
      merged.sort((a, b) => a.timestamp - b.timestamp)
      store.entries = merged.slice(-store.config.maxEntries)
      nextLogId = Math.max(nextLogId, ...store.entries.map((e) => e.id + 1))
    }
    void pruneLogStore()
  } catch {
    // 日志表不可用（migration 未跑完等）不影响内存日志
  }
}

/** 淘汰策略：3 天前整日清除 + 当日 debug/info 超 800 条裁剪 + 全局 2MB 最旧天优先裁 debug/info。 */
async function pruneLogStore(): Promise<void> {
  if (!logDb) return
  const days = Array.from({ length: LOG_RETENTION_DAYS }, (_, i) =>
    localDayKey(Date.now() - i * 86_400_000),
  )
  const placeholders = days.map(() => '?').join(',')
  const today = days[0] ?? ''
  try {
    await logDb.executeSet([
      { statement: `DELETE FROM app_logs WHERE day NOT IN (${placeholders})`, values: days },
      {
        statement: `DELETE FROM app_logs WHERE day = ? AND level IN ('debug','info') AND id NOT IN (
          SELECT id FROM app_logs WHERE day = ? AND level IN ('debug','info') ORDER BY id DESC LIMIT ${LOG_DAILY_CAP})`,
        values: [today, today],
      },
    ])
    for (let round = 0; round < 3; round += 1) {
      const sizeRows = await logDb.query<{ total: number | null }>(
        'SELECT COALESCE(SUM(length(message) + COALESCE(length(data_json), 0)), 0) AS total FROM app_logs',
      )
      if ((sizeRows[0]?.total ?? 0) <= LOG_BYTE_CAP) break
      const oldest = await logDb.query<{ id: number }>(
        "SELECT id FROM app_logs WHERE level IN ('debug','info') ORDER BY day ASC, id ASC LIMIT 1",
      )
      const id = oldest[0]?.id
      if (!id) break
      await logDb.executeSet([{ statement: 'DELETE FROM app_logs WHERE id = ?', values: [id] }])
    }
  } catch {
    // 淘汰失败不影响内存日志
  }
}

function scheduleLogFlush(): void {
  if (logFlushTimer !== undefined || !logDb) return
  logFlushTimer = window.setTimeout(() => {
    logFlushTimer = undefined
    void flushLogsNow()
  }, LOG_FLUSH_DELAY_MS)
}

async function flushLogsNow(): Promise<void> {
  if (!logDb || logFlushing || logWriteQueue.length === 0) return
  logFlushing = true
  const batch = logWriteQueue.splice(0, logWriteQueue.length)
  try {
    for (let i = 0; i < batch.length; i += 40) {
      const chunk = batch.slice(i, i + 40)
      await logDb.executeSet(
        chunk.map((entry) => ({
          statement:
            'INSERT INTO app_logs (day, ts, level, tag, message, data_json) VALUES (?, ?, ?, ?, ?, ?)',
          values: [
            localDayKey(entry.timestamp),
            entry.timestamp,
            entry.level,
            entry.tag,
            entry.message,
            serializeLogData(entry.data),
          ],
        })),
      )
    }
  } catch {
    // 写库失败静默：日志绝不能影响业务
  } finally {
    logFlushing = false
  }
  void pruneLogStore()
}

/** 判断某条日志是否应该被记录（基于配置）。 */
function shouldLog(config: LogConfig, tag: string, level: LogLevel): boolean {
  if (!config.enabled) return false
  const tagLevel = config.tagMinLevels[tag]
  const effectiveLevel = tagLevel === null ? 'error' : tagLevel ?? config.globalMinLevel
  return LEVEL_ORDER[level] >= LEVEL_ORDER[effectiveLevel]
}

export const useAppLogStore = defineStore('app-log', {
  state: () => ({
    entries: [] as LogEntry[],
    config: loadConfig(),
  }),
  getters: {
    byLevel(state) {
      return (level: LogLevel) => state.entries.filter((e) => e.level === level)
    },
    byTag(state) {
      return (tag: string) => state.entries.filter((e) => e.tag === tag)
    },
  },
  actions: {
    /** 追加一条日志，超过容量上限时裁剪最旧的记录；同时进入落盘队列（800ms 批量 flush）。 */
    append(level: LogLevel, tag: string, message: string, data?: Record<string, unknown>) {
      if (!shouldLog(this.config, tag, level)) return
      const entry = makeEntry(level, tag, message, data)
      this.entries.push(entry)
      if (this.entries.length > this.config.maxEntries) {
        const over = this.entries.length - this.config.maxEntries
        this.entries.splice(0, over)
      }
      logWriteQueue.push(entry)
      scheduleLogFlush()
    },

    debug(tag: string, message: string, data?: Record<string, unknown>) {
      this.append('debug', tag, message, data)
    },
    info(tag: string, message: string, data?: Record<string, unknown>) {
      this.append('info', tag, message, data)
    },
    warn(tag: string, message: string, data?: Record<string, unknown>) {
      this.append('warn', tag, message, data)
    },
    error(tag: string, message: string, data?: Record<string, unknown>) {
      this.append('error', tag, message, data)
    },

    clear() {
      this.entries = []
      logWriteQueue.length = 0
      if (logDb) void logDb.execute('DELETE FROM app_logs').catch(() => {})
    },

    /** 更新日志配置并持久化。 */
    setConfig(next: Partial<LogConfig>) {
      this.config = { ...this.config, ...next }
      saveConfig(this.config)
    },

    /** 一键切换到开发配置（全开）。 */
    setDevMode() {
      this.config = { ...DEV_DEFAULT_CONFIG }
      saveConfig(this.config)
    },

    /** 一键切换到正式发布配置（仅 warn/error）。 */
    setProductionMode() {
      this.config = { ...PRODUCTION_DEFAULT_CONFIG }
      saveConfig(this.config)
    },

    /** 导出为 JSON 文件（结构向后兼容：保留 entries，新增 days 分区）。 */
    exportJson(): string {
      const days: Record<string, number> = {}
      for (const entry of this.entries) {
        const day = localDayKey(entry.timestamp)
        days[day] = (days[day] ?? 0) + 1
      }
      return JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          totalEntries: this.entries.length,
          retentionDays: LOG_RETENTION_DAYS,
          days,
          config: this.config,
          entries: this.entries,
        },
        null,
        2,
      )
    },
  },
})

/**
 * 便捷对象：给非 pinia 上下文（如纯 TS 文件）调用的 logger 包装。
 * 假设 store 通过全局注入拿到（在 main.ts bootstrap 后可用）。
 */
export interface TaggedLogger {
  debug: (message: string, data?: Record<string, unknown>) => void
  info: (message: string, data?: Record<string, unknown>) => void
  warn: (message: string, data?: Record<string, unknown>) => void
  error: (message: string, data?: Record<string, unknown>) => void
}

let cachedStore: ReturnType<typeof useAppLogStore> | null = null
function getStore(): ReturnType<typeof useAppLogStore> | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = (globalThis as any).__pinia
  if (!p) return null
  if (!cachedStore) cachedStore = useAppLogStore(p)
  return cachedStore
}

export function getLogger(tag: string): TaggedLogger {
  const safeCall = (
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ) => {
    const s = getStore()
    if (s) s.append(level, tag, message, data)
  }
  return {
    debug: (m, d) => safeCall('debug', m, d),
    info: (m, d) => safeCall('info', m, d),
    warn: (m, d) => safeCall('warn', m, d),
    error: (m, d) => safeCall('error', m, d),
  }
}

/** 让纯 TS 文件在 bootstrap 后能拿到 pinia 实例。在 main.ts bootstrap 中调用一次。 */
export function installGlobalPinia(pinia: ReturnType<typeof import('pinia').createPinia>): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).__pinia = pinia
  cachedStore = null
}