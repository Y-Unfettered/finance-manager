/**
 * 使用 localStorage 持久化已消费的剪贴板内容指纹，
 * 防止应用重启后同一剪贴板内容重复触发导入弹窗。
 */

const STORAGE_KEY = 'clipboard_consumed_fingerprints'
const EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 小时

interface FingerprintEntry {
  hash: string
  consumedAt: number
}

function computeSimpleHash(text: string): string {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(16)
}

function loadEntries(): FingerprintEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as FingerprintEntry[]
  } catch {
    return []
  }
}

function saveEntries(entries: FingerprintEntry[]): void {
  // 保存时清理过期条目
  const now = Date.now()
  const valid = entries.filter((e) => now - e.consumedAt < EXPIRY_MS)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(valid))
  } catch {
    // localStorage 满时静默忽略
  }
}

export function isConsumedFingerprint(text: string): boolean {
  const hash = computeSimpleHash(text)
  const entries = loadEntries()
  return entries.some((e) => e.hash === hash)
}

export function setConsumedFingerprint(text: string): void {
  const hash = computeSimpleHash(text)
  const entries = loadEntries()
  // 如果已存在，更新时间戳
  const existing = entries.find((e) => e.hash === hash)
  if (existing) {
    existing.consumedAt = Date.now()
  } else {
    entries.push({ hash, consumedAt: Date.now() })
  }
  saveEntries(entries)
}