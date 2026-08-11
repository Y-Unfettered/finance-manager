<script setup lang="ts">
import { ChevronDown, ChevronUp, FileText, ListChecks, RotateCcw } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppBottomSheet from '@/components/AppBottomSheet.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import { formatMinorToCny } from '@/domain/money'
import type { ImportBatchRecord, ImportBatchTransactionItem, ImportSource } from '@/db/repositories/import-batch-repository'
import { getLogger } from '@/features/debug/app-logger'
import { useImportService } from '@/features/import/import-service'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()
const importService = useImportService()
const log = getLogger('import-batches')

interface BatchWithSummary {
  batch: ImportBatchRecord
  summary: string
}

const batches = ref<BatchWithSummary[]>([])
const loading = ref(true)
const voiding = ref(false)
const errorMessage = ref('')
const showVoid = ref(false)
const selectedBatch = ref<ImportBatchRecord>()

const expandedId = ref<string | null>(null)
const loadingDetail = ref<string | null>(null)
const detailError = ref('')
interface BatchDetail {
  transactions: ImportBatchTransactionItem[]
  executionErrors: Array<{
    rowIndex: number
    message: string
    row?: Record<string, unknown>
  }>
  preflightErrors: Array<{ rowIndex: number; message: string }>
}
const detailMap = ref<Record<string, BatchDetail>>({})

const voidPreviewTransactions = ref<ImportBatchTransactionItem[]>([])

const isReady = computed(() => Boolean(importService && appStore.ledgerId))

const activeBatches = computed(() => batches.value.filter(b => b.batch.status === 'active'))
const voidedBatches = computed(() => batches.value.filter(b => b.batch.status === 'void'))

async function load(): Promise<void> {
  if (!importService || !appStore.ledgerId) return
  loading.value = true
  errorMessage.value = ''
  try {
    batches.value = await importService.listBatchesWithSummary(appStore.ledgerId)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

async function toggleExpand(item: BatchWithSummary): Promise<void> {
  if (!importService || !appStore.ledgerId) return
  const batch = item.batch
  const nextExpanded = expandedId.value === batch.id ? null : batch.id
  expandedId.value = nextExpanded
  if (nextExpanded && !detailMap.value[batch.id]) {
    loadingDetail.value = batch.id
    detailError.value = ''
    try {
      const detail = await importService.getBatchDetail(appStore.ledgerId, batch.id)
      detailMap.value[batch.id] = {
        transactions: detail.transactions,
        executionErrors: detail.executionErrors,
        preflightErrors: detail.preflightErrors,
      }
    } catch (error) {
      // 不把原始 SQL/技术错误显示给用户，只记日志
      log.error('getBatchDetail failed', { batchId: batch.id, error })
      detailError.value = '读取明细失败，请关闭后重试。如问题持续，请导出诊断日志排查。'
    } finally {
      loadingDetail.value = null
    }
  }
}

async function openVoid(batch: ImportBatchRecord): Promise<void> {
  selectedBatch.value = batch
  errorMessage.value = ''
  if (importService && appStore.ledgerId) {
    try {
      let detail = detailMap.value[batch.id]
      if (!detail) {
        const d = await importService.getBatchDetail(appStore.ledgerId, batch.id)
        detail = {
          transactions: d.transactions,
          executionErrors: d.executionErrors,
          preflightErrors: d.preflightErrors,
        }
        detailMap.value[batch.id] = detail
      }
      voidPreviewTransactions.value = detail.transactions.slice(0, 3)
    } catch (error) {
      log.error('openVoid getBatchDetail failed', { batchId: batch.id, error })
      voidPreviewTransactions.value = []
    }
  } else {
    voidPreviewTransactions.value = []
  }
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
    voidPreviewTransactions.value = []
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

function formatOccurredDate(iso: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
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

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    expense: '支出',
    income: '收入',
    transfer: '转账',
    repayment: '还款',
    loan_out: '借出',
    loan_recovery: '收款',
    refund: '退款',
    borrowing: '借入',
    repay_borrowing: '归还',
  }
  return map[type] ?? type
}

function accountLabel(item: ImportBatchTransactionItem): string {
  if (item.primaryAccountName) return item.primaryAccountName
  if (item.sourceAccountName && item.targetAccountName) {
    return `${item.sourceAccountName} → ${item.targetAccountName}`
  }
  if (item.sourceAccountName) return item.sourceAccountName
  if (item.targetAccountName) return item.targetAccountName
  return '—'
}

function amountLabel(item: ImportBatchTransactionItem): string {
  const sign = item.type === 'income' || item.type === 'loan_recovery' || item.type === 'borrowing' ? '+' : '−'
  return `${sign}${formatMinorToCny(item.amountMinor)}`
}

function failedRowAmount(row?: Record<string, unknown>): string {
  if (!row) return '—'
  const amount = row['amountMinor']
  if (typeof amount === 'number') return formatMinorToCny(amount)
  return '—'
}

function failedRowDate(row?: Record<string, unknown>): string {
  if (!row) return '—'
  const date = (row['date'] as string | undefined) ?? ''
  const time = (row['time'] as string | undefined) ?? ''
  return time ? `${date} ${time}` : date || '—'
}

function failedRowLabel(row?: Record<string, unknown>): string {
  if (!row) return ''
  const merchant = (row['merchant'] as string | undefined)?.trim()
  if (merchant) return merchant
  const counterparty = (row['counterparty'] as string | undefined)?.trim()
  if (counterparty) return counterparty
  const note = (row['note'] as string | undefined)?.trim()
  if (note) return note
  return ''
}

function failedRowAccount(row?: Record<string, unknown>): string {
  if (!row) return '—'
  const source = (row['sourceAccount'] as string | undefined)?.trim()
  const target = (row['targetAccount'] as string | undefined)?.trim()
  if (source && target) return `${source} → ${target}`
  if (source) return source
  if (target) return target
  return '未指定'
}

function failedRowKind(row?: Record<string, unknown>): string {
  if (!row) return '—'
  const kind = row['kind'] as string | undefined
  if (kind === 'expense') return '支出'
  if (kind === 'income') return '收入'
  if (kind === 'transfer') return '转账'
  return kind ?? '—'
}

function isAccountMissingError(message: string): boolean {
  return message.includes('缺少账户') || message.includes('缺少支出') || message.includes('缺少收入')
    || message.includes('未匹配到账户')
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
            v-for="item in activeBatches"
            :key="item.batch.id"
            class="batch-card"
            :class="{ 'batch-card--void': item.batch.status === 'void' }"
          >
            <button
              type="button"
              class="batch-card__head"
              :aria-expanded="expandedId === item.batch.id"
              @click="toggleExpand(item)"
            >
              <span class="batch-card__icon">
                <FileText :size="20" :stroke-width="1.75" />
              </span>
              <div class="batch-card__title">
                <strong>{{ item.batch.fileName ?? '未知来源' }}</strong>
                <small>{{ sourceLabel(item.batch.source) }} · {{ formatDateTime(item.batch.createdAt) }}</small>
                <small v-if="item.summary" class="batch-card__summary">{{ item.summary }}</small>
                <small v-else class="batch-card__summary batch-card__summary--empty">（无交易记录）</small>
              </div>
              <div class="batch-card__right">
                <span
                  class="batch-card__status"
                  :class="{
                    'batch-card__status--active': item.batch.status === 'active',
                    'batch-card__status--void': item.batch.status === 'void',
                  }"
                >
                  {{ item.batch.status === 'active' ? '有效' : '已撤销' }}
                </span>
                <span class="batch-card__chev">
                  <ChevronUp v-if="expandedId === item.batch.id" :size="18" :stroke-width="1.75" />
                  <ChevronDown v-else :size="18" :stroke-width="1.75" />
                </span>
              </div>
            </button>

            <dl class="batch-card__stats">
              <div>
                <dt>总行数</dt>
                <dd>{{ item.batch.recordCount }}</dd>
              </div>
              <div>
                <dt>成功</dt>
                <dd>{{ item.batch.successCount }}</dd>
              </div>
              <div>
                <dt>失败</dt>
                <dd>{{ item.batch.errorCount }}</dd>
              </div>
              <div>
                <dt>重复</dt>
                <dd>{{ item.batch.duplicateCount }}</dd>
              </div>
            </dl>

            <p v-if="item.batch.note" class="batch-card__note">{{ item.batch.note }}</p>

            <div v-if="expandedId === item.batch.id" class="batch-detail">
              <div v-if="loadingDetail === item.batch.id" class="batch-detail__loading">
                正在读取明细…
              </div>
              <div v-else-if="detailError" class="batch-detail__error">{{ detailError }}</div>
              <template v-else-if="detailMap[item.batch.id]">
                <div class="batch-detail__section">
                  <h3 class="batch-detail__section-title">
                    已导入交易（{{ detailMap[item.batch.id]!.transactions.length }}）
                  </h3>
                  <div v-if="detailMap[item.batch.id]!.transactions.length === 0" class="batch-detail__empty">
                    没有导入成功的交易
                  </div>
                  <ul v-else class="txn-list">
                    <li
                      v-for="txnItem in detailMap[item.batch.id]!.transactions"
                      :key="txnItem.id"
                      class="txn-list__item"
                      :class="{ 'txn-list__item--void': txnItem.status === 'void' }"
                    >
                      <div class="txn-list__main">
                        <div class="txn-list__title">
                          <span class="txn-list__type">{{ typeLabel(txnItem.type) }}</span>
                          <span class="txn-list__counterparty">
                            {{ txnItem.merchant ?? txnItem.counterparty ?? txnItem.note ?? '（无摘要）' }}
                          </span>
                        </div>
                        <div class="txn-list__sub">
                          <span>{{ formatOccurredDate(txnItem.occurredAt) }}</span>
                          <span class="txn-list__dot" />
                          <span>{{ accountLabel(txnItem) }}</span>
                          <span v-if="txnItem.categoryName">
                            <span class="txn-list__dot" />
                            {{ txnItem.categoryName }}
                          </span>
                          <span v-if="txnItem.status === 'void'" class="txn-list__void-badge">已作废</span>
                        </div>
                      </div>
                      <div class="txn-list__amount" :class="{ 'txn-list__amount--void': txnItem.status === 'void' }">
                        {{ amountLabel(txnItem) }}
                      </div>
                    </li>
                  </ul>
                </div>

                <div
                  v-if="detailMap[item.batch.id]!.executionErrors.length > 0 || detailMap[item.batch.id]!.preflightErrors.length > 0"
                  class="batch-detail__section"
                >
                  <h3 class="batch-detail__section-title">
                    失败明细（{{ detailMap[item.batch.id]!.executionErrors.length + detailMap[item.batch.id]!.preflightErrors.length }}）
                  </h3>
                  <ul class="err-list">
                    <li
                      v-for="(err, i) in detailMap[item.batch.id]!.executionErrors"
                      :key="`exec-${i}`"
                      class="err-list__item"
                    >
                      <div class="err-list__head">
                        <strong class="err-list__row-label">
                          {{ failedRowLabel(err.row) || `第 ${err.rowIndex} 行` }}
                        </strong>
                        <span class="err-list__amount">¥{{ failedRowAmount(err.row) }}</span>
                      </div>
                      <div class="err-list__meta">
                        <span>{{ failedRowDate(err.row) }}</span>
                        <span class="err-list__dot" />
                        <span>{{ failedRowKind(err.row) }}</span>
                        <span class="err-list__dot" />
                        <span>{{ failedRowAccount(err.row) }}</span>
                      </div>
                      <p class="err-list__message" :title="err.message">{{ err.message }}</p>
                      <p v-if="isAccountMissingError(err.message)" class="err-list__fix-hint">
                        提示：请撤销此批次，在导入预览中为该行选择正确的账户后重新导入。
                      </p>
                    </li>
                    <li
                      v-for="(err, i) in detailMap[item.batch.id]!.preflightErrors"
                      :key="`pre-${i}`"
                      class="err-list__item"
                    >
                      <div class="err-list__head">
                        <strong class="err-list__row-label">第 {{ err.rowIndex }} 行 · 校验失败</strong>
                      </div>
                      <p class="err-list__message" :title="err.message">{{ err.message }}</p>
                    </li>
                  </ul>
                </div>
              </template>
            </div>

            <button
              v-if="item.batch.status === 'active'"
              type="button"
              class="danger-button"
              :disabled="voiding && selectedBatch?.id === item.batch.id"
              @click.stop="openVoid(item.batch)"
            >
              <RotateCcw :size="18" :stroke-width="1.75" />
              {{ voiding && selectedBatch?.id === item.batch.id ? '正在撤销…' : '撤销此批次' }}
            </button>
          </BaseCard>
        </section>
        <section v-if="voidedBatches.length > 0" class="batch-section">
          <h2 class="batch-section__title batch-section__title--void">已撤销</h2>
          <BaseCard
            v-for="item in voidedBatches"
            :key="item.batch.id"
            class="batch-card"
            :class="{ 'batch-card--void': item.batch.status === 'void' }"
          >
            <button
              type="button"
              class="batch-card__head"
              :aria-expanded="expandedId === item.batch.id"
              @click="toggleExpand(item)"
            >
              <span class="batch-card__icon">
                <FileText :size="20" :stroke-width="1.75" />
              </span>
              <div class="batch-card__title">
                <strong>{{ item.batch.fileName ?? '未知来源' }}</strong>
                <small>{{ sourceLabel(item.batch.source) }} · {{ formatDateTime(item.batch.createdAt) }}</small>
                <small v-if="item.summary" class="batch-card__summary">{{ item.summary }}</small>
                <small v-else class="batch-card__summary batch-card__summary--empty">（无交易记录）</small>
              </div>
              <div class="batch-card__right">
                <span
                  class="batch-card__status"
                  :class="{
                    'batch-card__status--active': item.batch.status === 'active',
                    'batch-card__status--void': item.batch.status === 'void',
                  }"
                >
                  {{ item.batch.status === 'active' ? '有效' : '已撤销' }}
                </span>
                <span class="batch-card__chev">
                  <ChevronUp v-if="expandedId === item.batch.id" :size="18" :stroke-width="1.75" />
                  <ChevronDown v-else :size="18" :stroke-width="1.75" />
                </span>
              </div>
            </button>

            <dl class="batch-card__stats">
              <div>
                <dt>总行数</dt>
                <dd>{{ item.batch.recordCount }}</dd>
              </div>
              <div>
                <dt>成功</dt>
                <dd>{{ item.batch.successCount }}</dd>
              </div>
              <div>
                <dt>失败</dt>
                <dd>{{ item.batch.errorCount }}</dd>
              </div>
              <div>
                <dt>重复</dt>
                <dd>{{ item.batch.duplicateCount }}</dd>
              </div>
            </dl>

            <p v-if="item.batch.note" class="batch-card__note">{{ item.batch.note }}</p>

            <div v-if="expandedId === item.batch.id" class="batch-detail">
              <div v-if="loadingDetail === item.batch.id" class="batch-detail__loading">
                正在读取明细…
              </div>
              <div v-else-if="detailError" class="batch-detail__error">{{ detailError }}</div>
              <template v-else-if="detailMap[item.batch.id]">
                <div class="batch-detail__section">
                  <h3 class="batch-detail__section-title">
                    已导入交易（{{ detailMap[item.batch.id]!.transactions.length }}）
                  </h3>
                  <div v-if="detailMap[item.batch.id]!.transactions.length === 0" class="batch-detail__empty">
                    没有导入成功的交易
                  </div>
                  <ul v-else class="txn-list">
                    <li
                      v-for="txnItem in detailMap[item.batch.id]!.transactions"
                      :key="txnItem.id"
                      class="txn-list__item"
                      :class="{ 'txn-list__item--void': txnItem.status === 'void' }"
                    >
                      <div class="txn-list__main">
                        <div class="txn-list__title">
                          <span class="txn-list__type">{{ typeLabel(txnItem.type) }}</span>
                          <span class="txn-list__counterparty">
                            {{ txnItem.merchant ?? txnItem.counterparty ?? txnItem.note ?? '（无摘要）' }}
                          </span>
                        </div>
                        <div class="txn-list__sub">
                          <span>{{ formatOccurredDate(txnItem.occurredAt) }}</span>
                          <span class="txn-list__dot" />
                          <span>{{ accountLabel(txnItem) }}</span>
                          <span v-if="txnItem.categoryName">
                            <span class="txn-list__dot" />
                            {{ txnItem.categoryName }}
                          </span>
                          <span v-if="txnItem.status === 'void'" class="txn-list__void-badge">已作废</span>
                        </div>
                      </div>
                      <div class="txn-list__amount" :class="{ 'txn-list__amount--void': txnItem.status === 'void' }">
                        {{ amountLabel(txnItem) }}
                      </div>
                    </li>
                  </ul>
                </div>

                <div
                  v-if="detailMap[item.batch.id]!.executionErrors.length > 0 || detailMap[item.batch.id]!.preflightErrors.length > 0"
                  class="batch-detail__section"
                >
                  <h3 class="batch-detail__section-title">
                    失败明细（{{ detailMap[item.batch.id]!.executionErrors.length + detailMap[item.batch.id]!.preflightErrors.length }}）
                  </h3>
                  <ul class="err-list">
                    <li
                      v-for="(err, i) in detailMap[item.batch.id]!.executionErrors"
                      :key="`exec-${i}`"
                      class="err-list__item"
                    >
                      <div class="err-list__head">
                        <strong class="err-list__row-label">
                          {{ failedRowLabel(err.row) || `第 ${err.rowIndex} 行` }}
                        </strong>
                        <span class="err-list__amount">¥{{ failedRowAmount(err.row) }}</span>
                      </div>
                      <div class="err-list__meta">
                        <span>{{ failedRowDate(err.row) }}</span>
                        <span class="err-list__dot" />
                        <span>{{ failedRowKind(err.row) }}</span>
                        <span class="err-list__dot" />
                        <span>{{ failedRowAccount(err.row) }}</span>
                      </div>
                      <p class="err-list__message" :title="err.message">{{ err.message }}</p>
                      <p v-if="isAccountMissingError(err.message)" class="err-list__fix-hint">
                        提示：请撤销此批次，在导入预览中为该行选择正确的账户后重新导入。
                      </p>
                    </li>
                    <li
                      v-for="(err, i) in detailMap[item.batch.id]!.preflightErrors"
                      :key="`pre-${i}`"
                      class="err-list__item"
                    >
                      <div class="err-list__head">
                        <strong class="err-list__row-label">第 {{ err.rowIndex }} 行 · 校验失败</strong>
                      </div>
                      <p class="err-list__message" :title="err.message">{{ err.message }}</p>
                    </li>
                  </ul>
                </div>
              </template>
            </div>
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

        <div v-if="voidPreviewTransactions.length > 0" class="confirm-dialog__preview">
          <div class="confirm-dialog__preview-title">以下为该批次的前几笔交易：</div>
          <ul class="preview-list">
            <li v-for="item in voidPreviewTransactions" :key="item.id" class="preview-list__item">
              <span class="preview-list__title">
                {{ typeLabel(item.type) }} · {{ item.merchant ?? item.counterparty ?? '（无摘要）' }}
              </span>
              <span class="preview-list__amount">{{ amountLabel(item) }}</span>
            </li>
          </ul>
        </div>

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
  min-width: 0;
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
.batch-section__title--void {
  color: var(--color-text-tertiary);
}

.batch-card {
  display: grid;
  min-width: 0;
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
  padding: 0;
  background: transparent;
  border: 0;
  text-align: left;
  cursor: pointer;
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
.batch-card__summary {
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.batch-card__summary--empty {
  color: var(--color-text-quaternary);
}
.batch-card__right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.batch-card__chev {
  display: grid;
  color: var(--color-text-tertiary);
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
  gap: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-divider);
  flex-wrap: wrap;
}
.batch-card__stats div {
  display: grid;
  gap: 2px;
  min-width: 64px;
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

.batch-detail {
  display: grid;
  min-width: 0;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--color-surface-muted);
  border-radius: var(--radius-card);
}
.batch-detail__loading,
.batch-detail__error,
.batch-detail__empty {
  padding: var(--space-4) var(--space-2);
  text-align: center;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.batch-detail__error {
  color: var(--color-danger);
}
.batch-detail__section {
  display: grid;
  gap: var(--space-2);
}
.batch-detail__section-title {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
  font-weight: 600;
}

.txn-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
}
.txn-list__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-control);
}
.txn-list__item--void {
  opacity: 0.6;
}
.txn-list__main {
  min-width: 0;
}
.txn-list__title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--type-list-primary-size);
  color: var(--color-text-primary);
}
.txn-list__type {
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  background: var(--color-background);
  border-radius: var(--radius-pill);
  flex: none;
}
.txn-list__counterparty {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--type-list-primary-size);
}
.txn-list__sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 2px;
  gap: 4px 6px;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.txn-list__dot {
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: var(--color-text-quaternary);
}
.txn-list__void-badge {
  padding: 1px 6px;
  color: var(--color-text-tertiary);
  font-size: 10px;
  background: var(--color-background);
  border-radius: var(--radius-pill);
}
.txn-list__amount {
  font-size: var(--type-list-amount-size);
  font-weight: 600;
  color: var(--color-expense);
  white-space: nowrap;
}
.txn-list__amount--void {
  color: var(--color-text-tertiary);
  text-decoration: line-through;
}

.err-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
}
.err-list__item {
  min-width: 0;
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border-left: 3px solid var(--color-danger);
  border-radius: var(--radius-control);
  display: grid;
  gap: 4px;
}
.err-list__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--type-caption-size);
  color: var(--color-text-primary);
}
.err-list__row-label {
  overflow: hidden;
  color: var(--color-text-primary);
  font-size: var(--type-list-primary-size);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.err-list__amount {
  flex: none;
  font-weight: 600;
  color: var(--color-expense);
  font-size: var(--type-body-size);
}
.err-list__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.err-list__dot {
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: var(--color-text-quaternary);
}
.err-list__message {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.err-list__fix-hint {
  margin: 4px 0 0;
  padding: var(--space-2) var(--space-3);
  color: var(--color-primary-700);
  font-size: var(--type-caption-size);
  line-height: 1.5;
  background: var(--color-primary-50);
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
.confirm-dialog__preview {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-surface-muted);
  border-radius: var(--radius-control);
}
.confirm-dialog__preview-title {
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
  font-weight: 500;
}
.preview-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--space-2);
}
.preview-list__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-control);
}
.preview-list__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--type-caption-size);
  color: var(--color-text-primary);
}
.preview-list__amount {
  font-size: var(--type-caption-size);
  font-weight: 600;
  color: var(--color-expense);
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
