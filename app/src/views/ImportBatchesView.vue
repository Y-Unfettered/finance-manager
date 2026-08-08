<script setup lang="ts">
import { FileText, ListChecks, RotateCcw } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppBottomSheet from '@/components/AppBottomSheet.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import type { ImportBatchRecord, ImportSource } from '@/db/repositories/import-batch-repository'
import { useImportService } from '@/features/import/import-service'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()
const importService = useImportService()

const batches = ref<ImportBatchRecord[]>([])
const loading = ref(true)
const voiding = ref(false)
const errorMessage = ref('')
const showVoid = ref(false)
const selectedBatch = ref<ImportBatchRecord>()

const isReady = computed(() => Boolean(importService && appStore.ledgerId))

async function load(): Promise<void> {
  if (!importService || !appStore.ledgerId) return
  loading.value = true
  errorMessage.value = ''
  try {
    batches.value = await importService.listBatches(appStore.ledgerId)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

function openVoid(batch: ImportBatchRecord): void {
  selectedBatch.value = batch
  errorMessage.value = ''
  showVoid.value = true
}

async function submitVoid(): Promise<void> {
  if (!importService || !appStore.ledgerId || !selectedBatch.value || voiding.value) return
  voiding.value = true
  errorMessage.value = ''
  try {
    await importService.voidBatch(appStore.ledgerId, selectedBatch.value.id)
    showVoid.value = false
    selectedBatch.value = undefined
    await load()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    voiding.value = false
  }
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function sourceLabel(source: ImportSource): string {
  if (source === 'qianji') return '钱迹'
  if (source === 'csv') return 'CSV'
  if (source === 'xlsx') return 'Excel'
  if (source === 'json') return 'JSON'
  return '其他'
}

onMounted(load)
</script>

<template>
  <main class="batches-page">
    <div class="batches-page__safe-top">
      <AppTopBar title="导入批次" @back="router.back()" />
    </div>

    <div class="batches-page__content">
      <div v-if="!isReady" class="page-state">数据未就绪，请先选择账本。</div>

      <div v-else-if="loading" class="page-state">正在读取导入批次…</div>

      <div v-else-if="errorMessage && batches.length === 0" class="page-state page-state--error">
        {{ errorMessage }}
      </div>

      <div v-else-if="batches.length === 0" class="empty-state">
        <ListChecks :size="38" :stroke-width="1.5" />
        <strong>还没有导入批次</strong>
        <span>从导入账单页面导入第一个文件吧</span>
      </div>

      <template v-else>
        <section class="batch-section">
          <h2 class="batch-section__title">批次记录</h2>
          <div v-if="errorMessage" class="page-state page-state--error">
            {{ errorMessage }}
          </div>
          <BaseCard
            v-for="batch in batches"
            :key="batch.id"
            class="batch-card"
            :class="{ 'batch-card--void': batch.status === 'void' }"
          >
            <div class="batch-card__head">
              <span class="batch-card__icon">
                <FileText :size="20" :stroke-width="1.75" />
              </span>
              <div class="batch-card__title">
                <strong>{{ batch.fileName ?? '未知来源' }}</strong>
                <small
                  >{{ sourceLabel(batch.source) }} · {{ formatDateTime(batch.createdAt) }}</small
                >
              </div>
              <span
                class="batch-card__status"
                :class="{
                  'batch-card__status--active': batch.status === 'active',
                  'batch-card__status--void': batch.status === 'void',
                }"
              >
                {{ batch.status === 'active' ? '有效' : '已撤销' }}
              </span>
            </div>

            <dl class="batch-card__stats">
              <div>
                <dt>成功</dt>
                <dd>{{ batch.successCount }}</dd>
              </div>
              <div>
                <dt>失败</dt>
                <dd>{{ batch.errorCount }}</dd>
              </div>
              <div>
                <dt>重复</dt>
                <dd>{{ batch.duplicateCount }}</dd>
              </div>
            </dl>

            <p v-if="batch.note" class="batch-card__note">{{ batch.note }}</p>

            <button
              v-if="batch.status === 'active'"
              type="button"
              class="danger-button"
              :disabled="voiding && selectedBatch?.id === batch.id"
              @click="openVoid(batch)"
            >
              <RotateCcw :size="18" :stroke-width="1.75" />
              {{ voiding && selectedBatch?.id === batch.id ? '正在撤销…' : '撤销此批次' }}
            </button>
          </BaseCard>
        </section>
      </template>
    </div>

    <AppBottomSheet v-model:show="showVoid" title="撤销导入批次">
      <div class="confirm-dialog">
        <p>撤销后，该批次导入的交易将全部作废，且操作不可恢复。是否继续？</p>
        <p v-if="selectedBatch" class="confirm-dialog__target">
          {{ selectedBatch.fileName ?? '未知来源' }} · 成功 {{ selectedBatch.successCount }} 条
        </p>
        <div v-if="errorMessage" class="form-error">{{ errorMessage }}</div>
        <div class="confirm-dialog__actions">
          <button
            type="button"
            class="secondary-button"
            :disabled="voiding"
            @click="showVoid = false"
          >
            取消
          </button>
          <button type="button" class="danger-button" :disabled="voiding" @click="submitVoid">
            {{ voiding ? '正在撤销…' : '确认撤销' }}
          </button>
        </div>
      </div>
    </AppBottomSheet>
  </main>
</template>

<style scoped>
.batches-page {
  min-height: 100dvh;
  padding-bottom: calc(var(--space-10) + env(safe-area-inset-bottom));
  background: var(--color-background);
}
.batches-page__safe-top {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}
.batches-page__content {
  display: grid;
  max-width: 520px;
  padding: var(--space-4) var(--page-gutter) var(--space-10);
  margin: auto;
  gap: var(--space-4);
}

.page-state {
  padding: var(--space-8) var(--space-4);
  color: var(--color-text-tertiary);
  text-align: center;
  font-size: var(--type-body-size);
}
.page-state--error {
  color: var(--color-danger);
}

.empty-state {
  display: grid;
  padding: var(--space-10) var(--space-4);
  place-items: center;
  gap: var(--space-2);
  color: var(--color-text-tertiary);
  text-align: center;
}
.empty-state strong {
  color: var(--color-text-secondary);
}
.empty-state span {
  font-size: var(--type-caption-size);
}

.batch-section__title {
  margin: var(--space-2) 0 var(--space-1);
  font-size: var(--type-section-title-size);
  font-weight: 600;
}

.batch-card {
  display: grid;
  gap: var(--space-3);
}
.batch-card--void {
  opacity: 0.7;
}
.batch-card__head {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
}
.batch-card__icon {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  color: var(--color-primary-600);
  background: var(--color-primary-50);
  border-radius: var(--radius-pill);
}
.batch-card__title {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.batch-card__title strong {
  overflow: hidden;
  color: var(--color-text-primary);
  font-size: var(--type-list-primary-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.batch-card__title small {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.batch-card__status {
  padding: 4px var(--space-2);
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  background: var(--color-background);
  border-radius: var(--radius-pill);
}
.batch-card__status--active {
  color: var(--color-income);
  background: var(--color-primary-50);
}
.batch-card__status--void {
  color: var(--color-text-tertiary);
  background: var(--color-background);
}

.batch-card__stats {
  display: flex;
  margin: 0;
  gap: var(--space-6);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-divider);
}
.batch-card__stats div {
  display: grid;
  gap: 2px;
}
.batch-card__stats dt {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.batch-card__stats dd {
  margin: 0;
  color: var(--color-text-primary);
  font-size: var(--type-list-amount-size);
  font-weight: 600;
}

.batch-card__note {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
  background: var(--color-background);
  border-radius: var(--radius-control);
}

.danger-button {
  display: flex;
  width: 100%;
  height: 44px;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: #fff;
  font-size: var(--type-body-size);
  font-weight: 600;
  background: var(--color-danger);
  border: 0;
  border-radius: var(--radius-pill);
  cursor: pointer;
}
.danger-button:disabled {
  opacity: 0.5;
}

.confirm-dialog {
  display: grid;
  gap: var(--space-4);
}
.confirm-dialog p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--type-body-size);
  line-height: var(--type-body-line);
}
.confirm-dialog__target {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.confirm-dialog__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}
.form-error {
  color: var(--color-danger);
  font-size: var(--type-caption-size);
}

.secondary-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
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
}
</style>
