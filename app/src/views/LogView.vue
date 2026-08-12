<script setup lang="ts">
import { Share2 } from '@lucide/vue'
import { Download, FileSearch, Trash2 } from '@lucide/vue'
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import 'vant/es/toast/style'
import 'vant/es/dialog/style'

import AppSelect from '@/components/AppSelect.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import {
  formatTimestamp,
  useAppLogStore,
  type LogEntry,
  type LogLevel,
} from '@/features/debug/app-logger'

const router = useRouter()
const logStore = useAppLogStore()

const levelFilter = ref<LogLevel | 'all'>('all')
const tagFilter = ref<string>('all')
const keyword = ref('')
const exportHint = ref<string>('')
const shareToast = ref<string>('')

const levelOptions = [
  { value: 'all', label: '全部级别' },
  { value: 'debug', label: 'DEBUG' },
  { value: 'info', label: 'INFO' },
  { value: 'warn', label: 'WARN' },
  { value: 'error', label: 'ERROR' },
]

const levelDisplay = computed(() => {
  const opt = levelOptions.find((o) => o.value === levelFilter.value)
  return opt?.label ?? '全部级别'
})

const allTags = computed(() => {
  const s = new Set<string>()
  logStore.entries.forEach((e) => s.add(e.tag))
  return ['all', ...Array.from(s).sort()]
})

const tagOptions = computed(() =>
  allTags.value.map((t) => ({
    value: t,
    label: t === 'all' ? '全部分类' : t,
  })),
)

const tagDisplay = computed(() => (tagFilter.value === 'all' ? '全部分类' : tagFilter.value))

const filtered = computed<LogEntry[]>(() => {
  const kw = keyword.value.trim().toLowerCase()
  return logStore.entries
    .slice()
    .reverse()
    .filter((e) => {
      if (levelFilter.value !== 'all' && e.level !== levelFilter.value) return false
      if (tagFilter.value !== 'all' && e.tag !== tagFilter.value) return false
      if (kw) {
        const hit =
          e.message.toLowerCase().includes(kw) ||
          (e.data && JSON.stringify(e.data).toLowerCase().includes(kw))
        if (!hit) return false
      }
      return true
    })
})

function showClearConfirm(): void {
  const dialog = showConfirmDialog({
    title: '清空日志',
    message: `确定清空 ${logStore.entries.length} 条日志吗？此操作不可撤销。`,
  })
  dialog.then(() => {
    logStore.clear()
    exportHint.value = ''
    shareToast.value = ''
    showToast({ type: 'success', message: '已清空', position: 'bottom', duration: 800 })
  }).catch(() => {})
}

function makeLogFilename(): string {
  return `app-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
}

async function buildExportJson(): Promise<{ json: string; entries: LogEntry[] } | null> {
  const entries = filtered.value.length === 0 ? logStore.entries : filtered.value
  if (entries.length === 0) return null
  const json = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      total: entries.length,
      filterApplied: filtered.value.length !== logStore.entries.length,
      entries,
    },
    null,
    2,
  )
  return { json, entries }
}

async function onExport(): Promise<void> {
  const result = await buildExportJson()
  if (!result) {
    showToast({ type: 'fail', message: '没有可导出的日志', position: 'bottom', duration: 1000 })
    return
  }
  const { json, entries } = result
  const name = makeLogFilename()
  exportHint.value = '正在导出…'
  shareToast.value = ''

  try {
    if (Capacitor.isNativePlatform()) {
      let targetDir = Directory.Documents
      let finalPath = name
      try {
        await Filesystem.stat({ path: 'Download', directory: Directory.ExternalStorage })
        targetDir = Directory.ExternalStorage
        finalPath = `Download/${name}`
      } catch {
        // fallback 用 Documents
      }
      const res = await Filesystem.writeFile({
        path: finalPath,
        data: json,
        directory: targetDir,
        encoding: Encoding.UTF8,
        recursive: true,
      })
      const uri = res.uri ?? finalPath
      exportHint.value = `✓ 已导出 ${entries.length} 条 → ${uri}`
      showToast({ type: 'success', message: '导出成功', position: 'bottom', duration: 800, className: 'logview-toast-sm' })
      return
    }

    const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
    type FsWritable = { write: (s: Blob) => Promise<void>; close: () => Promise<void> }
    type FsHandle = { createWritable: () => Promise<FsWritable> }
    const showSaveFilePicker = (window as unknown as {
      showSaveFilePicker?: (opts: { suggestedName: string }) => Promise<FsHandle>
    }).showSaveFilePicker
    if (showSaveFilePicker) {
      try {
        const fh = await showSaveFilePicker({ suggestedName: name })
        const writable = await fh.createWritable()
        await writable.write(blob)
        await writable.close()
        exportHint.value = `✓ 已导出 ${entries.length} 条`
        return
      } catch {
        // 用户取消了走 fallback
      }
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    exportHint.value = `✓ 已触发下载：${name}（${entries.length} 条）`
    showToast({ type: 'success', message: '已触发下载', position: 'bottom', duration: 800, className: 'logview-toast-sm' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    exportHint.value = `✗ 导出失败：${msg}`
    showToast({ type: 'fail', message: `导出失败：${msg}`, position: 'bottom', duration: 2500 })
  }
}

async function onShare(): Promise<void> {
  const result = await buildExportJson()
  if (!result) {
    showToast({ type: 'fail', message: '没有可分享的日志', position: 'bottom', duration: 1500 })
    return
  }
  const { json, entries } = result
  const name = makeLogFilename()

  try {
    if (Capacitor.isNativePlatform()) {
      // 先写入临时文件，通过 URI 分享
      let targetDir = Directory.Documents
      let finalPath = name
      try {
        await Filesystem.stat({ path: 'Download', directory: Directory.ExternalStorage })
        targetDir = Directory.ExternalStorage
        finalPath = `Download/${name}`
      } catch {
        // fallback 用 Documents
      }
      const res = await Filesystem.writeFile({
        path: finalPath,
        data: json,
        directory: targetDir,
        encoding: Encoding.UTF8,
        recursive: true,
      })
      const uri = res.uri ?? `file://${finalPath}`
      await Share.share({
        title: '诊断日志',
        url: uri,
        text: `来自 Finance Manager 的诊断日志，共 ${entries.length} 条。\n导出时间：${new Date().toISOString()}`,
      })
      shareToast.value = `已触发分享（${entries.length} 条）`
      return
    }

    // Web 端：优先使用 Files API，其次 Text
    const blob = new Blob([json], { type: 'application/json' })
    const file = new File([blob], name, { type: 'application/json' })
    const canShareFile = navigator.canShare?.({ files: [file] })
    if (canShareFile) {
      await navigator.share({ files: [file], title: '诊断日志' })
      shareToast.value = `已分享（${entries.length} 条）`
      return
    }
    // fallback：分享文本（截断到 32KB）
    const text = json.length > 32768 ? json.slice(0, 32768) : json
    await navigator.share({ title: '诊断日志', text })
    shareToast.value = `已分享（${entries.length} 条）`
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return
    const msg = e instanceof Error ? e.message : String(e)
    showToast({ type: 'fail', message: `分享失败：${msg}`, position: 'bottom', duration: 2500 })
  }
}

function onToggleMode(): void {
  if (logStore.config.globalMinLevel === 'debug') {
    logStore.setProductionMode()
    showToast({ type: 'text', message: '已切到正式版（仅 warn/error）', position: 'bottom', duration: 2000 })
  } else {
    logStore.setDevMode()
    showToast({ type: 'success', message: '已切到开发模式（全开）', position: 'bottom', duration: 2000 })
  }
}

const modeLabel = computed(() => {
  const cfg = logStore.config
  if (cfg.globalMinLevel === 'debug') return '开发模式（全开）'
  return '正式版（仅 warn/error）'
})

const LEVEL_META: Record<LogLevel, { label: string; cls: string }> = {
  debug: { label: 'D', cls: 'chip chip--debug' },
  info: { label: 'I', cls: 'chip chip--info' },
  warn: { label: 'W', cls: 'chip chip--warn' },
  error: { label: 'E', cls: 'chip chip--error' },
}
</script>

<template>
  <main class="log-page">
    <div class="safe-top">
      <AppTopBar title="诊断日志" @back="router.back()" />
    </div>
    <div class="content">
      <section>
        <h2>总览</h2>
        <BaseCard class="overview-card">
          <div class="overview-item">
            <strong>{{ logStore.entries.length }}</strong>
            <small>条日志</small>
          </div>
          <div class="overview-item overview-item--debug">
            <strong>{{ logStore.entries.filter(e => e.level === 'debug').length }}</strong>
            <small>DEBUG</small>
          </div>
          <div class="overview-item overview-item--info">
            <strong>{{ logStore.entries.filter(e => e.level === 'info').length }}</strong>
            <small>INFO</small>
          </div>
          <div class="overview-item overview-item--warn">
            <strong>{{ logStore.entries.filter(e => e.level === 'warn').length }}</strong>
            <small>WARN</small>
          </div>
          <div class="overview-item overview-item--error">
            <strong>{{ logStore.entries.filter(e => e.level === 'error').length }}</strong>
            <small>ERROR</small>
          </div>
        </BaseCard>
      </section>

      <section>
        <h2>筛选</h2>
        <BaseCard class="filter-card">
          <AppSelect
            v-model="levelFilter"
            label="级别"
            :options="levelOptions"
            :placeholder="levelDisplay"
          />
          <AppSelect
            v-model="tagFilter"
            label="分类"
            :options="tagOptions"
            :placeholder="tagDisplay"
          />
          <div class="filter-search">
            <input
              v-model="keyword"
              type="text"
              placeholder="关键词过滤消息和数据"
              class="filter-search-input"
            />
          </div>
        </BaseCard>
      </section>

      <section>
        <div class="config-row">
          <button type="button" class="mode-toggle" @click="onToggleMode">
            <span class="dot" />
            <span>{{ modeLabel }}</span>
          </button>
        </div>
        <div class="action-row">
          <button type="button" class="secondary-button" :disabled="!logStore.entries.length" @click="showClearConfirm">
            <Trash2 :size="16" :stroke-width="1.75" />
            <span>清空</span>
          </button>
          <button type="button" class="accent-button" :disabled="!logStore.entries.length" @click="onShare">
            <Share2 :size="16" :stroke-width="1.75" />
            <span>分享</span>
          </button>
          <button type="button" class="primary-button" :disabled="!logStore.entries.length" @click="onExport">
            <Download :size="16" :stroke-width="1.75" />
            <span>导出 JSON</span>
          </button>
        </div>
        <p v-if="exportHint" class="export-hint">{{ exportHint }}</p>
        <p v-if="shareToast" class="share-hint">{{ shareToast }}</p>
      </section>

      <section v-if="filtered.length === 0">
        <BaseCard class="empty-card">
          <FileSearch :size="28" :stroke-width="1.5" />
          <strong>没有匹配的日志</strong>
          <small>{{ logStore.entries.length ? '调整筛选条件再试试' : '还没有日志记录，去操作一下相关功能吧' }}</small>
        </BaseCard>
      </section>

      <section v-else>
        <h2>日志（{{ filtered.length }} 条）</h2>
        <div class="log-list">
          <div v-for="entry in filtered" :key="entry.id" class="log-entry">
            <div class="log-entry__head">
              <span :class="LEVEL_META[entry.level].cls">{{ LEVEL_META[entry.level].label }}</span>
              <span class="tag-chip" title="分类">{{ entry.tag }}</span>
              <span class="ts">{{ formatTimestamp(entry.timestamp) }}</span>
            </div>
            <p class="log-entry__msg">{{ entry.message }}</p>
            <pre v-if="entry.data && Object.keys(entry.data).length" class="log-entry__data">{{ JSON.stringify(entry.data, null, 2) }}</pre>
          </div>
        </div>
      </section>

      <div class="bottom-pad" />
    </div>
  </main>
</template>

<style scoped>
.log-page {
  min-height: 100dvh;
  background: var(--color-background);
}

.safe-top {
  padding-top: env(safe-area-inset-top);
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--color-background);
  border-bottom: 1px solid var(--color-divider);
}

.content {
  padding: var(--space-5) var(--page-gutter);
  display: grid;
  gap: var(--space-4);
  max-width: var(--container-max-width);
  margin: 0 auto;
}

section {
  display: grid;
  gap: var(--space-2);
}
section h2 {
  margin: 0;
  padding: 0 var(--space-1);
  font-size: var(--type-section-title-size);
  font-weight: 600;
  color: var(--color-text-secondary);
  letter-spacing: 0.02em;
}

.overview-card {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--space-2);
  text-align: center;
  padding: var(--space-4) var(--space-3);
}
.overview-item {
  display: grid;
  gap: 2px;
}
.overview-item strong {
  font-size: 22px;
  color: var(--color-text-primary);
  line-height: 1;
}
.overview-item small {
  font-size: 11px;
  color: var(--color-text-tertiary);
}
.overview-item--debug strong { color: var(--color-text-tertiary); }
.overview-item--info strong { color: var(--color-primary-600); }
.overview-item--warn strong { color: #c77700; }
.overview-item--error strong { color: #c23b3b; }

.filter-card {
  display: grid;
  gap: var(--space-3);
  padding: 0 var(--space-4);
}
.filter-search {
  padding: var(--space-3) 0;
  border-top: 1px solid var(--color-divider);
}
.filter-search-input {
  width: 100%;
  height: 42px;
  padding: 0 var(--space-3);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
  color: var(--color-text-primary);
  font-size: var(--type-body-size);
  outline: none;
  transition: border-color 0.15s;
}
.filter-search-input:focus {
  border-color: var(--color-primary-500);
}

.action-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: var(--space-2);
}

.config-row {
  display: grid;
  grid-template-columns: 1fr;
  margin-bottom: var(--space-1);
}

.mode-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-pill);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--motion-fast) ease;
}
.mode-toggle:active {
  background: var(--color-primary-50);
}
.mode-toggle .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-primary-600);
}

.accent-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  color: #fff;
  font-size: var(--type-body-size);
  font-weight: 600;
  background: #1677ff;
  border: 0;
  border-radius: var(--radius-pill);
  height: 44px;
  cursor: pointer;
}
.accent-button:disabled {
  opacity: 0.5;
  cursor: default;
}

.export-hint {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text-secondary);
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-card);
  word-break: break-all;
}

.primary-button {
  display: flex;
  height: 44px;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  color: #fff;
  font-size: var(--type-body-size);
  font-weight: 600;
  background: var(--color-primary-600);
  border: 0;
  border-radius: var(--radius-pill);
  cursor: pointer;
}
.primary-button:disabled {
  opacity: 0.5;
  cursor: default;
}

.secondary-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  height: 44px;
  color: var(--color-text-primary);
  font-size: var(--type-body-size);
  font-weight: 500;
  background: transparent;
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-pill);
  cursor: pointer;
}
.secondary-button:disabled {
  opacity: 0.5;
  cursor: default;
}

.empty-card {
  display: grid;
  gap: var(--space-2);
  place-items: center;
  text-align: center;
  padding: var(--space-6) var(--space-5);
  color: var(--color-text-tertiary);
}
.empty-card strong {
  color: var(--color-text-secondary);
}
.empty-card small {
  font-size: 13px;
}

.log-list {
  display: grid;
  gap: var(--space-2);
}
.log-entry {
  padding: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-lg);
  display: grid;
  gap: var(--space-2);
}
.log-entry__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.chip {
  display: inline-grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
}
.chip--debug { background: #9ea5ad; }
.chip--info { background: var(--color-primary-600); }
.chip--warn { background: #c77700; }
.chip--error { background: #c23b3b; }

.tag-chip {
  font-size: 11px;
  color: var(--color-text-secondary);
  background: var(--color-background);
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--color-divider);
}

.ts {
  margin-left: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.log-entry__msg {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--color-text-primary);
  word-break: break-word;
}

.log-entry__data {
  margin: 0;
  padding: var(--space-2);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-secondary);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.bottom-pad {
  height: calc(env(safe-area-inset-bottom) + 32px);
}

@media (max-width: 480px) {
  .overview-card {
    grid-template-columns: repeat(5, 1fr);
  }
  .overview-item strong {
    font-size: 18px;
  }
}
</style>

<style>
.van-toast.logview-toast-sm {
  width: auto !important;
  min-width: 160px !important;
  max-width: 240px !important;
  padding: 8px 16px !important;
  font-size: 13px !important;
}
</style>
