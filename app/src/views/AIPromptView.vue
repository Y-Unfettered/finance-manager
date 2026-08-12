<script setup lang="ts">
import { Clipboard, Sparkles } from '@lucide/vue'
import { onActivated, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import { useFinanceService } from '@/features/finance/finance-service'
import { generatePromptTemplate } from '@/features/import/prompt-template'
import { useAppStore } from '@/stores/app'
import { showToast } from 'vant'
import 'vant/es/toast/style'

const router = useRouter()
const appStore = useAppStore()
const finance = useFinanceService()

const promptText = ref('')
const charCount = ref(0)
const loading = ref(true)
const copying = ref(false)

async function load(): Promise<void> {
  if (!finance || !appStore.ledgerId) return
  loading.value = true
  try {
    const [accounts, expenseCats, incomeCats] = await Promise.all([
      finance.listAccounts(appStore.ledgerId),
      finance.listExpenseCategories(appStore.ledgerId),
      finance.listIncomeCategories(appStore.ledgerId),
    ])
    const text = generatePromptTemplate(
      accounts.map((a) => ({
        name: a.name,
        type: a.type,
        normalBalance: a.normalBalance,
      })),
      expenseCats.map((c) => ({
        id: c.id,
        name: c.name,
        parentId: c.parentId ?? null,
      })),
      incomeCats.map((c) => ({
        id: c.id,
        name: c.name,
        parentId: c.parentId ?? null,
      })),
    )
    promptText.value = text
    charCount.value = text.length
  } finally {
    loading.value = false
  }
}

async function copyPrompt(): Promise<void> {
  if (copying.value || !promptText.value) return
  copying.value = true
  try {
    await navigator.clipboard.writeText(promptText.value)
    showToast({ message: '已复制到剪贴板', duration: 2000 })
  } catch {
    showToast({ message: '复制失败，请手动复制', duration: 2000 })
  } finally {
    setTimeout(() => {
      copying.value = false
    }, 500)
  }
}

onMounted(load)
onActivated(load)
watch(
  () => appStore.ledgerId,
  () => void load(),
)
</script>

<template>
  <main class="ai-prompt-page">
    <div class="safe-top"><AppTopBar title="AI 记账提示词" @back="router.back()" /></div>
    <div class="content">
      <BaseCard class="intro-card">
        <div class="intro-card__head">
          <span class="intro-card__icon">
            <Sparkles :size="22" :stroke-width="1.75" />
          </span>
          <span class="intro-card__title">截图记账</span>
        </div>
        <p class="intro-card__desc">
          复制下方提示词 → 粘贴到豆包/AI → 上传消费截图 → 获取 JSON → 回来导入账单
        </p>
        <div class="intro-meta">
          <span class="intro-meta__item">
            <strong>{{ charCount }}</strong>
            <span>字</span>
          </span>
          <span class="intro-meta__divider"></span>
          <span class="intro-meta__item">
            <span>账户 / 分类实时同步</span>
          </span>
        </div>
      </BaseCard>

      <BaseCard class="action-card">
        <button
          type="button"
          class="copy-button"
          :disabled="loading || copying"
          @click="copyPrompt"
        >
          <Clipboard :size="18" :stroke-width="1.75" />
          <span>{{ copying ? '已复制' : '一键复制提示词' }}</span>
        </button>
      </BaseCard>

      <BaseCard v-if="!loading" class="prompt-card">
        <pre class="prompt-text">{{ promptText }}</pre>
      </BaseCard>

      <div v-if="loading" class="loading-state">加载中…</div>
    </div>
  </main>
</template>

<style scoped>
.ai-prompt-page {
  min-height: 100dvh;
  background: var(--color-background);
}
.safe-top {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}
.content {
  display: grid;
  max-width: 520px;
  padding: var(--space-4) var(--page-gutter) calc(var(--space-8) + env(safe-area-inset-bottom));
  margin: auto;
  gap: var(--space-3);
}
.intro-card {
  padding: var(--space-4);
}
.intro-card__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}
.intro-card__icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  color: var(--color-primary-600);
  background: var(--color-primary-50);
  border-radius: 50%;
}
.intro-card__title {
  font-size: var(--type-title-size);
  font-weight: 600;
}
.intro-card__desc {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--type-body-size);
  line-height: var(--type-body-line);
}
.intro-meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-divider);
}
.intro-meta__item {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.intro-meta__item strong {
  color: var(--color-primary-600);
  font-size: var(--type-page-title-size);
}
.intro-meta__item span {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.intro-meta__divider {
  width: 1px;
  height: 18px;
  background: var(--color-divider);
}
.action-card {
  padding: 0 var(--space-4);
}
.copy-button {
  display: grid;
  grid-template-columns: auto 1fr;
  min-height: 52px;
  padding: var(--space-2) var(--space-4);
  place-items: center;
  gap: var(--space-3);
  width: 100%;
  color: white;
  font-size: var(--type-body-size);
  font-weight: 600;
  background: var(--color-primary-600);
  border: 0;
  border-radius: var(--radius-control);
  cursor: pointer;
}
.copy-button:disabled {
  opacity: 0.6;
  cursor: default;
}
.prompt-card {
  padding: 0;
  overflow: hidden;
}
.prompt-text {
  display: block;
  width: 100%;
  max-height: 55vh;
  overflow: auto;
  padding: var(--space-4);
  margin: 0;
  color: var(--color-text-primary);
  font-family: 'SF Mono', ui-monospace, 'Cascadia Code', Menlo, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.loading-state {
  display: grid;
  min-height: 120px;
  place-items: center;
  color: var(--color-text-tertiary);
  font-size: var(--type-body-size);
}
</style>