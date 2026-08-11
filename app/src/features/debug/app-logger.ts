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
    /** 追加一条日志，超过容量上限时裁剪最旧的记录。 */
    append(level: LogLevel, tag: string, message: string, data?: Record<string, unknown>) {
      if (!shouldLog(this.config, tag, level)) return
      this.entries.push(makeEntry(level, tag, message, data))
      if (this.entries.length > this.config.maxEntries) {
        const over = this.entries.length - this.config.maxEntries
        this.entries.splice(0, over)
      }
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

    /** 导出为 JSON 文件，方便发给开发者或本地分析。 */
    exportJson(): string {
      return JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          totalEntries: this.entries.length,
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