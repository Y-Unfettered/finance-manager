<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Copy, ScanLine } from '@lucide/vue'

import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import { PaymentCapture } from '@/features/payment-capture/payment-capture-reader'

const router = useRouter()

interface DumpLine {
  depth: number
  cls: string
  text: string
  desc: string
  hasContent: boolean
}

const dumpText = ref('')
const capturedAt = ref(0)
const loaded = ref(false)
const filterTextOnly = ref(false)
const copyState = ref<'' | 'ok' | 'fail'>('')

const lines = computed<DumpLine[]>(() => parseDump(dumpText.value))
const visibleLines = computed(() =>
  filterTextOnly.value ? lines.value.filter((l) => l.hasContent) : lines.value,
)
const contentCount = computed(() => lines.value.filter((l) => l.hasContent).length)

function parseDump(raw: string): DumpLine[] {
  const out: DumpLine[] = []
  for (const line of raw.split('\n')) {
    const m = /^(\s*)\[([^\]]+)\](.*)$/.exec(line)
    if (!m || m[1] === undefined || m[2] === undefined) continue
    const rest = m[3] ?? ''
    let text = ''
    let desc = ''
    const tm = / text="(.*)"/.exec(rest) // 贪婪：text 值内部可能还有引号
    if (tm && tm[1] !== undefined) {
      const inner: string = tm[1]
      const dm = /^(.*?)"\s+desc="(.*)$/s.exec(inner)
      if (dm && dm[1] !== undefined && dm[2] !== undefined) {
        text = dm[1]
        desc = dm[2]
      } else {
        text = inner
      }
    } else {
      const dm = /\s+desc="(.*)$/s.exec(rest)
      if (dm && dm[1] !== undefined) desc = dm[1]
    }
    out.push({
      depth: Math.floor(m[1].length / 2),
      cls: m[2],
      text,
      desc,
      hasContent: !!(text || desc),
    })
  }
  return out
}

/** 读后清地取回最新抓取结果；无新数据时保留当前显示。 */
async function refresh(): Promise<void> {
  try {
    const r = await PaymentCapture.getPendingScreenDump()
    if (r?.hasData && r.text) {
      dumpText.value = r.text
      capturedAt.value = r.capturedAt
    }
  } catch {
    // 忽略：保留当前显示
  }
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible') void refresh()
}

onMounted(async () => {
  await refresh()
  loaded.value = true
  // 已在本页时点按钮抓取新页面：APP 回前台后刷新为最新结果
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

async function copyAll(): Promise<void> {
  try {
    await navigator.clipboard.writeText(dumpText.value)
    copyState.value = 'ok'
  } catch {
    copyState.value = 'fail'
  } finally {
    setTimeout(() => (copyState.value = ''), 2000)
  }
}

function capturedAtLabel(): string {
  if (!capturedAt.value) return ''
  const d = new Date(capturedAt.value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
</script>

<template>
  <main class="reader-page">
    <div class="safe-top"><AppTopBar title="读屏测试" @back="router.back()" /></div>
    <div class="content">
      <BaseCard v-if="!dumpText" class="empty-card">
        <div class="empty">
          <ScanLine :size="28" />
          <strong v-if="loaded">还没有抓取数据</strong>
          <strong v-else>正在读取…</strong>
          <p>
            到目标页面（如支付宝账单详情）点击悬浮「读屏」按钮，抓取后会自动跳转到本页。
          </p>
        </div>
      </BaseCard>

      <template v-else>
        <BaseCard class="toolbar">
          <div class="meta">
            <span>共 {{ lines.length }} 个节点</span>
            <span>有内容 {{ contentCount }} 个</span>
            <span v-if="capturedAtLabel()">抓取于 {{ capturedAtLabel() }}</span>
          </div>
          <div class="actions">
            <button
              type="button"
              class="chip"
              :class="{ 'chip--active': filterTextOnly }"
              @click="filterTextOnly = !filterTextOnly"
            >
              只看有文本节点
            </button>
            <button type="button" class="chip chip--copy" @click="copyAll">
              <Copy :size="14" />
              {{ copyState === 'ok' ? '已复制' : copyState === 'fail' ? '复制失败' : '复制全文' }}
            </button>
          </div>
        </BaseCard>

        <BaseCard class="tree-card">
          <div class="tree">
            <div
              v-for="(line, i) in visibleLines"
              :key="i"
              class="tree-line"
              :class="{ 'tree-line--content': line.hasContent }"
              :style="{ paddingLeft: line.depth * 12 + 6 + 'px' }"
            >
              <span class="cls">[{{ line.cls }}]</span>
              <span v-if="line.text" class="text"> text="{{ line.text }}"</span>
              <span v-if="line.desc" class="desc"> desc="{{ line.desc }}"</span>
            </div>
          </div>
        </BaseCard>
      </template>
    </div>
  </main>
</template>

<style scoped>
.reader-page {
  min-height: 100%;
  background: var(--color-background);
}

.content {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-3) var(--page-gutter) var(--space-8);
}

.empty-card {
  padding: var(--space-8) var(--space-4);
}

.empty {
  display: grid;
  justify-items: center;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  text-align: center;
}

.empty p {
  margin: 0;
  font-size: var(--type-caption-size);
  line-height: var(--type-caption-line);
}

.toolbar {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-pill);
}

.chip--active {
  color: var(--color-primary-600);
  background: var(--color-primary-50);
  border-color: var(--color-primary-100);
}

.chip--copy {
  color: white;
  background: var(--color-primary-600);
  border-color: var(--color-primary-600);
}

.tree-card {
  padding: var(--space-3);
  overflow: hidden;
}

.tree {
  overflow-x: auto;
}

.tree-line {
  font-family: 'Cascadia Mono', 'Courier New', monospace;
  font-size: 11px;
  line-height: 17px;
  color: var(--color-text-tertiary);
  white-space: nowrap;
}

.tree-line--content {
  color: var(--color-text-primary);
}

.tree-line--content .text,
.tree-line--content .desc {
  color: var(--color-primary-600);
  font-weight: 500;
}
</style>
