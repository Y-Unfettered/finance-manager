/**
 * 应用内诊断日志模块。
 *
 * 提供分级日志记录（debug/info/warn/error），容量上限（默认 2000 条，超过后裁剪旧记录）。
 * 用于在设置页展示，方便排查功能问题（如剪贴板检测、导入流程等）。
 */

import { defineStore } from 'pinia'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  id: number
  timestamp: number // ms
  level: LogLevel
  tag: string // 业务分类标签，如 clipboard/import/app-lock
  message: string
  data?: Record<string, unknown>
}

const DEFAULT_MAX_ENTRIES = 2000

/** 构造一条日志，用全局自增 id */
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

export const useAppLogStore = defineStore('app-log', {
  state: () => ({
    entries: [] as LogEntry[],
    maxEntries: DEFAULT_MAX_ENTRIES,
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
      this.entries.push(makeEntry(level, tag, message, data))
      if (this.entries.length > this.maxEntries) {
        const over = this.entries.length - this.maxEntries
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

    /** 导出为 JSON 文件，方便发给开发者或本地分析。 */
    exportJson(): string {
      return JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          totalEntries: this.entries.length,
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
