<script setup lang="ts">
import {
  Check,
  X,
  CheckCheck,
  Loader2,
  AlertCircle,
  ShieldCheck,
  Bell,
  Image as ImageIcon,
  Clock,
} from '@lucide/vue'
import { onActivated, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppBottomSheet from '@/components/AppBottomSheet.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import MoneyText from '@/components/MoneyText.vue'
import { useFinanceService, type ExpenseCategoryOption } from '@/features/finance/finance-service'
import type { AccountBalanceRecord } from '@/domain/entities'
import { useAppStore } from '@/stores/app'
import {
  confirmEvent,
  dismissEvent,
  dismissAll,
  listPendingEvents,
  getServiceHealth,
  type CapturedPayment,
} from '@/features/capture-inbox/capture-inbox-service'

const appStore = useAppStore()
const router = useRouter()

const events = ref<CapturedPayment[]>([])
const loading = ref(false)
const selected = ref<CapturedPayment | null>(null)
const showConfirmSheet = ref(false)
const confirming = ref(false)

const categories = ref<ExpenseCategoryOption[]>([])
const accounts = ref<AccountBalanceRecord[]>([])
const selectedAccountId = ref('')
const selectedCategoryId = ref('')

const health = ref<{
  accessibility: { enabled: boolean }
  notification: { enabled: boolean }
  pendingCount: number
}>({
  accessibility: { enabled: false },
  notification: { enabled: false },
  pendingCount: 0,
})

async function loadEvents(): Promise<void> {
  try {
    loading.value = true
    const result = await listPendingEvents()
    events.value = result.events
  } catch {
    events.value = []
  } finally {
    loading.value = false
  }
}

async function loadHealth(): Promise<void> {
  try {
    const h = await getServiceHealth()
    health.value = h
  } catch {
    // ignore
  }
}

async function loadOptions(): Promise<void> {
  if (!appStore.ledgerId) return
  const finance = useFinanceService()
  if (!finance) return
  const [cats, accts] = await Promise.all([
    finance.listExpenseCategories(appStore.ledgerId),
    finance.listAccounts(appStore.ledgerId),
  ])
  categories.value = cats
  accounts.value = accts.filter(
    (a) => a.normalBalance === 'debit',
  )
}

async function openConfirm(event: CapturedPayment): Promise<void> {
  selected.value = event
  selectedAccountId.value = ''
  selectedCategoryId.value = ''
  await loadOptions()
  showConfirmSheet.value = true
}

async function doConfirm(): Promise<void> {
  if (!selected.value || !selectedAccountId.value || !selectedCategoryId.value) return
  try {
    confirming.value = true
    await confirmEvent({
      event: selected.value,
      accountId: selectedAccountId.value,
      categoryId: selectedCategoryId.value,
    })
    showConfirmSheet.value = false
    await loadEvents()
  } catch (e) {
    alert(e instanceof Error ? e.message : '入账失败')
  } finally {
    confirming.value = false
  }
}

async function doDismiss(id: number): Promise<void> {
  await dismissEvent(id)
  await loadEvents()
}

async function doDismissAll(): Promise<void> {
  await dismissAll()
  await loadEvents()
}

function captureLabel(method: string): string {
  const map: Record<string, string> = {
    accessibility: '无障碍',
    notification: '通知',
    share_text: '分享文本',
    share_ocr: '分享图片',
    self_test: '自检',
  }
  return map[method] || method
}

function captureIcon(method: string) {
  switch (method) {
    case 'accessibility': return ShieldCheck
    case 'notification': return Bell
    case 'share_ocr': return ImageIcon
    default: return Bell
  }
}

function formatTime(isoOrMs: string | number): string {
  const t = typeof isoOrMs === 'string' && isoOrMs.length === 13 ? Number(isoOrMs) : new Date(isoOrMs).getTime()
  const d = new Date(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onMounted(async () => {
  await Promise.all([loadEvents(), loadHealth()])
})

onActivated(async () => {
  await Promise.all([loadEvents(), loadHealth()])
})
</script>

<template>
  <main class="capture-inbox">
    <AppTopBar
      title="待确认账单"
      :show-back="true"
      @on-back="router.back()"
    />

    <div class="capture-inbox__body">
      <!-- 状态诊断卡 -->
      <section class="health-bar">
        <div class="health-item" :class="{ 'health-item--on': health.accessibility.enabled }">
          <ShieldCheck :size="18" />
          <span>无障碍</span>
        </div>
        <div class="health-item" :class="{ 'health-item--on': health.notification.enabled }">
          <Bell :size="18" />
          <span>通知</span>
        </div>
        <div class="health-item health-item--on">
          <ImageIcon :size="18" />
          <span>OCR</span>
        </div>
      </section>

      <!-- 空状态 -->
      <div v-if="!loading && events.length === 0" class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 12l2 2 4-4" />
          <circle cx="12" cy="12" r="9" />
        </svg>
        <p class="empty-state__title">暂无待确认账单</p>
        <p class="empty-state__desc">
          当您在支付宝/微信等 APP 完成支付后，自动捕获的结果将出现在这里。
        </p>
      </div>

      <!-- 加载状态 -->
      <div v-else-if="loading" class="loading-state">
        <Loader2 :size="28" class="loading-state__icon" />
      </div>

      <!-- 事件列表 -->
      <div v-else class="events-list">
        <div class="events-list__header">
          <span class="events-list__count">{{ events.length }} 条待确认</span>
          <button class="events-list__dismiss-all" @click="doDismissAll">全部忽略</button>
        </div>

        <BaseCard v-for="event in events" :key="event.id" class="event-item">
          <div class="event-item__row">
            <component :is="captureIcon(event.captureMethod)" class="event-item__icon" :size="22" />
            <div class="event-item__content">
              <div class="event-item__top">
                <MoneyText :amount-minor="event.amountMinor" class="event-item__amount" />
                <span class="event-item__merchant">{{ event.merchant || '未知商户' }}</span>
              </div>
              <div class="event-item__meta">
                <span class="event-item__account">{{ event.accountHint || '未识别' }}</span>
                <span class="event-item__method">{{ captureLabel(event.captureMethod) }}</span>
                <Clock :size="12" />
                <span>{{ formatTime(event.occurredAt) }}</span>
              </div>
            </div>
          </div>

          <div class="event-item__actions">
            <button class="event-item__btn event-item__btn--dismiss" @click="doDismiss(event.id)">
              <X :size="16" />
            </button>
            <button class="event-item__btn event-item__btn--confirm" @click="openConfirm(event)">
              <Check :size="16" />
            </button>
          </div>
        </BaseCard>
      </div>

      <!-- 设置提示 -->
      <div v-if="!health.accessibility.enabled && !health.notification.enabled" class="setup-hint">
        <AlertCircle :size="16" />
        <span>无障碍服务和通知监听均未开启，自动捕获功能暂不可用。</span>
        <button class="setup-hint__btn" @click="router.push({ name: 'capture-settings' })">
          前往设置
        </button>
      </div>
    </div>

    <!-- 确认入账底部弹窗 -->
    <AppBottomSheet v-model:show="showConfirmSheet" title="确认入账">
      <div v-if="selected" class="confirm-sheet">
        <div class="confirm-sheet__amount">
          <MoneyText :amount-minor="selected.amountMinor" />
          <span class="confirm-sheet__merchant">{{ selected.merchant || '—' }}</span>
        </div>

        <label class="field">
          <span class="field__label">付款账户</span>
          <select v-model="selectedAccountId" class="field__select">
            <option value="">选择账户</option>
            <option v-for="a in accounts" :key="a.id" :value="a.id">
              {{ a.name }}
            </option>
          </select>
        </label>

        <label class="field">
          <span class="field__label">支出分类</span>
          <select v-model="selectedCategoryId" class="field__select">
            <option value="">选择分类</option>
            <option v-for="c in categories" :key="c.id" :value="c.id">
              {{ c.name }}
            </option>
          </select>
        </label>

        <div class="confirm-sheet__actions">
          <button
            class="btn btn--ghost"
            @click="showConfirmSheet = false"
          >
            取消
          </button>
          <button
            class="btn btn--primary"
            :disabled="!selectedAccountId || !selectedCategoryId || confirming"
            @click="doConfirm"
          >
            <CheckCheck v-if="!confirming" :size="16" />
            <Loader2 v-else :size="16" class="spinner" />
            {{ confirming ? '入账中...' : '确认入账' }}
          </button>
        </div>
      </div>
    </AppBottomSheet>
  </main>
</template>

<style scoped>
.capture-inbox {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
}

.capture-inbox__body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px 24px;
}

.health-bar {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  background: var(--color-surface);
  border-radius: 12px;
  margin-bottom: 12px;
}

.health-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text-tertiary);
  font-size: 12px;
  border: 1px solid var(--color-line);
}

.health-item--on {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px;
  color: var(--color-text-tertiary);
  text-align: center;
}

.empty-state__title {
  margin-top: 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.empty-state__desc {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.6;
  max-width: 240px;
}

.loading-state {
  display: flex;
  justify-content: center;
  padding: 48px;
}

.loading-state__icon {
  animation: spin 1s linear infinite;
  color: var(--color-text-tertiary);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.events-list {
  display: flex;
  flex-direction: column;
}

.events-list__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 4px 8px;
}

.events-list__count {
  font-size: 13px;
  color: var(--color-text-tertiary);
  font-weight: 500;
}

.events-list__dismiss-all {
  background: none;
  border: none;
  color: var(--color-danger);
  font-size: 13px;
  padding: 4px 8px;
  cursor: pointer;
}

.event-item {
  margin-bottom: 8px;
  padding: 12px 14px;
}

.event-item__row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.event-item__icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--color-primary);
  opacity: 0.8;
}

.event-item__content {
  flex: 1;
  min-width: 0;
}

.event-item__top {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.event-item__amount {
  font-weight: 600;
  font-size: 16px;
}

.event-item__merchant {
  font-size: 14px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-item__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-tertiary);
  flex-wrap: wrap;
}

.event-item__method {
  padding: 1px 6px;
  background: var(--color-surface);
  border-radius: 4px;
  font-size: 11px;
}

.event-item__actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--color-line);
}

.event-item__btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--color-line);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 12px;
  cursor: pointer;
}

.event-item__btn--confirm {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.event-item__btn--dismiss {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.setup-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  margin-top: 12px;
  background: color-mix(in srgb, var(--color-warning) 10%, transparent);
  border-radius: 8px;
  font-size: 12px;
  color: var(--color-text);
}

.setup-hint__btn {
  margin-left: auto;
  padding: 4px 10px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.confirm-sheet {
  padding: 8px 0 16px;
}

.confirm-sheet__amount {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--color-line);
  margin-bottom: 16px;
}

.confirm-sheet__merchant {
  font-size: 14px;
  color: var(--color-text-tertiary);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.field__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
}

.field__select {
  padding: 10px 12px;
  border: 1px solid var(--color-line);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 14px;
}

.confirm-sheet__actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.confirm-sheet__actions .btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.btn--ghost {
  background: var(--color-surface);
  border: 1px solid var(--color-line);
  color: var(--color-text);
}

.btn--primary {
  background: var(--color-primary);
  border: 1px solid var(--color-primary);
  color: white;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinner {
  animation: spin 1s linear infinite;
}
</style>