<script setup lang="ts">
import {
  Braces,
  CircleCheck,
  Download,
  FileText,
  Info,
  LoaderCircle,
  TriangleAlert,
} from '@lucide/vue'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import { useExportService } from '@/features/export/export-service'
import { useAppStore } from '@/stores/app'
import { saveTextFile } from '@/utils/file-io'

type ExportFormat = 'csv' | 'json'

const formatOptions: readonly {
  value: ExportFormat
  label: string
  description: string
  icon: typeof FileText
}[] = [
  { value: 'csv', label: 'CSV', description: '适合用 Excel 打开查看与二次整理', icon: FileText },
  { value: 'json', label: 'JSON', description: '结构化数据，便于程序处理与迁移', icon: Braces },
]

const router = useRouter()
const appStore = useAppStore()
const exportService = useExportService()

const isReady = computed(
  () => appStore.databaseStatus === 'ready' && !!exportService && !!appStore.ledgerId,
)

const format = ref<ExportFormat>('csv')
const includeVoid = ref(false)
const exporting = ref(false)
const resultMessage = ref('')
const errorMessage = ref('')

const buttonLabel = computed(() => {
  if (exporting.value) return '正在导出…'
  return format.value === 'csv' ? '导出为 CSV' : '导出为 JSON'
})

async function doExport(): Promise<void> {
  if (!exportService || !appStore.ledgerId || exporting.value) return
  exporting.value = true
  errorMessage.value = ''
  resultMessage.value = ''
  try {
    const ledgerId = appStore.ledgerId
    const options = { includeVoid: includeVoid.value }
    const isCsv = format.value === 'csv'
    const content = isCsv
      ? await exportService.exportTransactionsCsv(ledgerId, options)
      : await exportService.exportTransactionsJson(ledgerId, options)
    const fileName = `transactions-${formatStamp(new Date())}.${isCsv ? 'csv' : 'json'}`
    const mimeType = isCsv ? 'text/csv' : 'application/json'
    const result = await saveTextFile(fileName, content, mimeType)
    resultMessage.value = result.downloaded
      ? `已通过浏览器下载：${result.fileName}`
      : `已导出：${result.fileName}${result.location ? `（${result.location}）` : ''}`
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    exporting.value = false
  }
}

function formatStamp(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}
</script>

<template>
  <main class="export-page">
    <div class="export-page__safe-top">
      <AppTopBar title="导出账单" @back="router.back()" />
    </div>

    <div class="export-page__content">
      <div v-if="!isReady" class="page-state">数据库尚未就绪，导出功能暂不可用。</div>

      <template v-else>
        <section class="block">
          <h2>导出格式</h2>
          <BaseCard class="format-list">
            <button
              v-for="opt in formatOptions"
              :key="opt.value"
              type="button"
              class="format-item"
              :class="{ 'format-item--active': format === opt.value }"
              :disabled="exporting"
              @click="format = opt.value"
            >
              <span class="format-icon">
                <component :is="opt.icon" :size="20" :stroke-width="1.75" aria-hidden="true" />
              </span>
              <span class="format-main">
                <strong>{{ opt.label }}</strong>
                <small>{{ opt.description }}</small>
              </span>
              <CircleCheck
                v-if="format === opt.value"
                :size="20"
                :stroke-width="1.75"
                class="format-check"
              />
            </button>
          </BaseCard>
        </section>

        <section class="block">
          <h2>导出选项</h2>
          <BaseCard>
            <label class="option-row">
              <input
                v-model="includeVoid"
                type="checkbox"
                class="option-input"
                :disabled="exporting"
              />
              <span class="option-box">
                <CircleCheck v-if="includeVoid" :size="16" :stroke-width="2.5" />
              </span>
              <span class="option-text">
                <strong>包含已撤销交易</strong>
                <small>默认仅导出已生效交易；勾选后将一并导出已撤销记录。</small>
              </span>
            </label>
          </BaseCard>
        </section>

        <section class="block">
          <button class="primary-button" type="button" :disabled="exporting" @click="doExport">
            <LoaderCircle v-if="exporting" :size="18" :stroke-width="2" class="spin" />
            <Download v-else :size="18" :stroke-width="1.75" />
            {{ buttonLabel }}
          </button>
          <div v-if="resultMessage" class="result-message result-message--ok">
            <CircleCheck :size="18" :stroke-width="1.75" />
            <span>{{ resultMessage }}</span>
          </div>
          <div v-if="errorMessage" class="result-message result-message--error">
            <TriangleAlert :size="18" :stroke-width="1.75" />
            <span>{{ errorMessage }}</span>
          </div>
        </section>

        <section class="block block--note">
          <Info :size="18" :stroke-width="1.75" aria-hidden="true" />
          <span>导出仅包含当前账本的交易流水，不包含账户余额与借入借出跟踪数据。</span>
        </section>
      </template>
    </div>
  </main>
</template>

<style scoped>
.export-page {
  min-height: 100dvh;
  padding-bottom: calc(var(--space-10) + env(safe-area-inset-bottom));
  background: var(--color-background);
}
.export-page__safe-top {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}
.export-page__content {
  display: grid;
  max-width: 520px;
  padding: var(--space-4) var(--page-gutter) var(--space-10);
  margin: auto;
  gap: var(--space-4);
}
.block {
  display: grid;
  gap: var(--space-3);
}
.block h2 {
  margin: var(--space-1) 0 0;
  font-size: var(--type-section-title-size);
}
.format-list {
  padding: 0 var(--space-4);
}
.format-item {
  display: grid;
  width: 100%;
  min-height: 68px;
  padding: var(--space-3) 0;
  grid-template-columns: 40px minmax(0, 1fr) 20px;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-text-primary);
  text-align: left;
  background: transparent;
  border: 0;
  border-top: 1px solid var(--color-divider);
  cursor: pointer;
}
.format-item:first-child {
  border-top: 0;
}
.format-item:disabled {
  opacity: 0.5;
}
.format-icon {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  color: var(--color-primary-600);
  background: var(--color-primary-50);
  border-radius: var(--radius-pill);
}
.format-item--active .format-icon {
  color: #fff;
  background: var(--color-primary-600);
}
.format-main {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.format-main strong {
  font-size: var(--type-list-primary-size);
  font-weight: 600;
}
.format-main small {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: 1.4;
}
.format-check {
  color: var(--color-primary-600);
}
.option-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
}
.option-input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  opacity: 0;
  pointer-events: none;
}
.option-box {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  color: #fff;
  background: transparent;
  border: 2px solid var(--color-divider);
  border-radius: var(--radius-control);
  transition:
    background var(--motion-fast) var(--ease-standard),
    border-color var(--motion-fast) var(--ease-standard);
}
.option-input:checked + .option-box {
  background: var(--color-primary-600);
  border-color: var(--color-primary-600);
}
.option-input:focus-visible + .option-box {
  outline: 2px solid var(--color-primary-600);
  outline-offset: 2px;
}
.option-text {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.option-text strong {
  font-size: var(--type-list-primary-size);
  font-weight: 600;
}
.option-text small {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: 1.4;
}
.primary-button {
  display: flex;
  width: 100%;
  height: 48px;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
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
}
.result-message {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  font-size: var(--type-caption-size);
  line-height: 1.5;
  border-radius: var(--radius-control);
}
.result-message--ok {
  color: var(--color-income);
  background: var(--color-primary-50);
}
.result-message--ok svg {
  color: var(--color-income);
}
.result-message--error {
  color: var(--color-danger);
  background: rgb(185 67 67 / 8%);
}
.result-message--error svg {
  color: var(--color-danger);
}
.page-state {
  padding: var(--space-10) var(--space-4);
  color: var(--color-text-tertiary);
  font-size: var(--type-body-size);
  text-align: center;
}
.block--note {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: 1.6;
}
.block--note svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--color-text-tertiary);
}
.spin {
  animation: export-spin 0.9s linear infinite;
}
@keyframes export-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
