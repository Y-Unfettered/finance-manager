<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import {
  captureAppName,
  loadRuleConfig,
  type CaptureRule,
} from '@/features/capture-rules/capture-rule-config-service'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const errorMsg = ref('')
const version = ref(0)
const pkg = ref('')
const rules = ref<CaptureRule[]>([])

const appName = computed(() => captureAppName(pkg.value))

interface TemplateView {
  id: string
  name: string
  kindLabel: string
  enabled: boolean
  priority: number
  /** 页面特征词（签名 + 成功词 + 排除词合并展示） */
  keywords: { label: string; words: string[] }[]
  /** 字段来源（金额/账户/订单号，来自 fieldAliases） */
  fields: { label: string; words: string[] }[]
  /** 备注来源字段 */
  noteFields: string[]
}

const templates = computed<TemplateView[]>(() =>
  [...rules.value]
    .sort((a, b) => b.priority - a.priority)
    .map((r) => ({
      id: r.id,
      name: r.name,
      kindLabel: kindLabel(r),
      enabled: r.enabled,
      priority: r.priority,
      keywords: collectKeywords(r),
      fields: collectFields(r),
      noteFields: r.noteRule?.preferFields ?? [],
    })),
)

function kindLabel(rule: CaptureRule): string {
  if (rule.pageType === 'bill-detail') return '账单详情'
  if (rule.pageType === 'order-detail') return '订单详情'
  return '成功页'
}

function collectKeywords(rule: CaptureRule): { label: string; words: string[] }[] {
  const out: { label: string; words: string[] }[] = []
  const sig = rule.pageSignature
  if (sig?.requireAll?.length) out.push({ label: '必须包含', words: [...sig.requireAll] })
  if (sig?.requiredLabels?.length) out.push({ label: '必备标签', words: [...sig.requiredLabels] })
  if (sig?.requiredAnyLabel?.length)
    out.push({ label: '时间标签（任一）', words: [...sig.requiredAnyLabel] })
  if (sig?.requireAnyOf?.length)
    out.push({ label: '业务字段（任一）', words: [...sig.requireAnyOf] })
  if (rule.successKeywords?.length) out.push({ label: '成功词', words: [...rule.successKeywords] })
  if (rule.excludeKeywords?.length) out.push({ label: '排除词', words: [...rule.excludeKeywords] })
  return out.filter((g) => g.words.length > 0)
}

function collectFields(rule: CaptureRule): { label: string; words: string[] }[] {
  const out: { label: string; words: string[] }[] = []
  const aliases = rule.fieldAliases
  if (!aliases) return out
  if (aliases.amountLabel?.length) out.push({ label: '金额字段', words: [...aliases.amountLabel] })
  if (aliases.accountLabel?.length)
    out.push({ label: '账户字段', words: [...aliases.accountLabel] })
  if (aliases.orderIdLabel?.length)
    out.push({ label: '订单号字段', words: [...aliases.orderIdLabel] })
  return out.filter((g) => g.words.length > 0)
}

async function load(): Promise<void> {
  loading.value = true
  errorMsg.value = ''
  try {
    const raw = String(route.params.pkg ?? '')
    pkg.value = decodeURIComponent(raw)
    const config = await loadRuleConfig()
    version.value = config.version
    rules.value = config.rules.filter((r) => r.packageName === pkg.value)
    if (!rules.value.length) errorMsg.value = '该应用暂无规则'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '规则加载失败'
  } finally {
    loading.value = false
  }
}

// KeepAlive 复用同组件实例：点不同应用时 params 变化但不会重跑 onMounted，
// 必须 watch 参数重新加载（实测 2026-11-06：点微信看到的是抖音的缓存数据）
watch(
  () => route.params.pkg,
  (newPkg, oldPkg) => {
    if (newPkg && newPkg !== oldPkg && route.name === 'capture-rule-app') void load()
  },
)

onMounted(load)
</script>

<template>
  <main class="rule-app-page">
    <div class="safe-top rule-app-safe">
      <AppTopBar :title="appName" :show-back="true" @on-back="router.back()" />
    </div>

    <div class="content">
      <div v-if="loading" class="state">正在读取规则…</div>
      <div v-else-if="errorMsg && !rules.length" class="state state--error">{{ errorMsg }}</div>

      <template v-else>
        <p class="page-hint">
          {{ appName }} 的识别模板（{{ rules.length }} 条）· 规则版本
          <strong>v{{ version }}</strong>
        </p>

        <BaseCard v-for="tpl in templates" :key="tpl.id" class="tpl-card">
          <div class="tpl-head">
            <strong class="tpl-name">{{ tpl.name }}</strong>
            <span class="tpl-badge" :class="tpl.enabled ? 'tpl-badge--on' : 'tpl-badge--off'">
              {{ tpl.enabled ? '启用' : '已禁用' }}
            </span>
          </div>
          <div class="tpl-tags">
            <span class="tpl-tag tpl-tag--kind">{{ tpl.kindLabel }}</span>
            <span class="tpl-tag">优先级 {{ tpl.priority }}</span>
          </div>

          <div v-for="group in tpl.keywords" :key="group.label" class="tpl-kw-group">
            <span class="tpl-kw-label">{{ group.label }}</span>
            <div class="tpl-kw-words">
              <span v-for="w in group.words" :key="w" class="tpl-kw">{{ w }}</span>
            </div>
          </div>

          <div v-if="tpl.noteFields.length" class="tpl-kw-group">
            <span class="tpl-kw-label">备注来源</span>
            <div class="tpl-kw-words">
              <span v-for="w in tpl.noteFields" :key="w" class="tpl-kw">{{ w }}</span>
            </div>
          </div>

          <div v-for="group in tpl.fields" :key="group.label" class="tpl-kw-group">
            <span class="tpl-kw-label">{{ group.label }}</span>
            <div class="tpl-kw-words">
              <span v-for="w in group.words" :key="w" class="tpl-kw">{{ w }}</span>
            </div>
          </div>
        </BaseCard>
      </template>
    </div>
  </main>
</template>

<style scoped>
.rule-app-page {
  min-height: 100dvh;
  background: var(--color-background);
}

.rule-app-safe {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}

.content {
  display: grid;
  gap: var(--space-3);
  max-width: 520px;
  padding: var(--space-4) var(--page-gutter) calc(var(--space-8) + env(safe-area-inset-bottom));
  margin: 0 auto;
}

.page-hint {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: var(--type-caption-line);
}

.page-hint strong {
  color: var(--color-text-secondary);
}

.tpl-card {
  display: grid;
  gap: var(--space-2);
}

.tpl-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.tpl-name {
  font-size: var(--type-list-primary-size);
  font-weight: 500;
}

.tpl-badge {
  padding: 2px 10px;
  font-size: var(--type-caption-size);
  border-radius: var(--radius-pill);
}

.tpl-badge--on {
  color: var(--color-success);
  background: color-mix(in srgb, var(--color-success) 12%, transparent);
}

.tpl-badge--off {
  color: var(--color-text-tertiary);
  background: var(--color-background);
}

.tpl-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.tpl-tag {
  padding: 2px 10px;
  color: var(--color-text-secondary);
  font-size: 11px;
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-pill);
}

.tpl-tag--kind {
  color: var(--color-primary-600);
  background: var(--color-primary-50);
  border-color: var(--color-primary-100);
}

.tpl-kw-group {
  display: grid;
  gap: var(--space-1);
}

.tpl-kw-label {
  color: var(--color-text-tertiary);
  font-size: 11px;
}

.tpl-kw-words {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tpl-kw {
  padding: 2px 8px;
  color: var(--color-text-secondary);
  font-size: 11px;
  background: var(--color-background);
  border-radius: 4px;
}

.state {
  padding: var(--space-8) var(--space-4);
  color: var(--color-text-tertiary);
  font-size: var(--type-body-size);
  text-align: center;
}

.state--error {
  color: var(--color-danger);
}
</style>
