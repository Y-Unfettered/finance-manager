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
import { onActivated, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import AppBottomSheet from '@/components/AppBottomSheet.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import AccountBrandIcon from '@/components/AccountBrandIcon.vue'
import BaseCard from '@/components/BaseCard.vue'
import CategoryIcon from '@/components/CategoryIcon.vue'
import MoneyText from '@/components/MoneyText.vue'
import { findAccountCatalogItem } from '@/features/finance/account-catalog'
import { formatMinorToCny } from '@/domain/money'
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
const message = ref('')

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

function appearance(acc: { name: string; institution?: string }) {
  return findAccountCatalogItem(acc.name, acc.institution)
}

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
  categories.value = cats.filter((c) => !c.parentId)
  accounts.value = accts.filter(
    (a) => !a.archivedAt && a.visibleInEntry !== false && a.normalBalance === 'debit',
  )
}

async function openConfirm(event: CapturedPayment): Promise<void> {
  selected.value = event
  selectedAccountId.value = ''
  selectedCategoryId.value = ''
  message.value = ''
  await loadOptions()
  showConfirmSheet.value = true
}

async function doConfirm(): Promise<void> {
  if (!selected.value || !selectedAccountId.value || !selectedCategoryId.value) return
  try {
    confirming.value = true
    message.value = ''
    await confirmEvent({
      event: selected.value,
      accountId: selectedAccountId.value,
      categoryId: selectedCategoryId.value,
    })
    message.value = '入账成功'
    showConfirmSheet.value = false
    await loadEvents()
    await loadHealth()
  } catch (e) {
    message.value = e instanceof Error ? e.message : '入账失败'
  } finally {
    confirming.value = false
  }
}

function onDismissConfirm(): void {
  if (confirming.value) return
  showConfirmSheet.value = false
}

async function doDismiss(id: number): Promise<void> {
  await dismissEvent(id)
  await loadEvents()
  await loadHealth()
}

async function doDismissAll(): Promise<void> {
  await dismissAll()
  await loadEvents()
  await loadHealth()
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

      <div v-else-if="loading" class="loading-state">
        <Loader2 :size="28" class="loading-state__icon" />
      </div>

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
              忽略
            </button>
            <button class="event-item__btn event-item__btn--confirm" @click="openConfirm(event)">
              <Check :size="16" />
              确认
            </button>
          </div>
        </BaseCard>
      </div>

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

        <section class="entry-section">
          <span class="entry-section__label">支出分类</span>
          <div class="entry-categories">
            <button
              v-for="cat in categories.slice(0, 12)"
              :key="cat.id"
              type="button"
              :class="['entry-cat', { active: selectedCategoryId === cat.id }]"
              @click="selectedCategoryId = cat.id"
            >
              <CategoryIcon
                :icon-key="cat.iconKey"
                color="var(--color-primary-500)"
                :size="28"
                :label="cat.name"
              />
              <span class="entry-cat__label">{{ cat.name }}</span>
            </button>
          </div>
          <div v-if="categories.length === 0" class="entry-empty">暂无支出分类，请先在「设置」中添加</div>
        </section>

        <section class="entry-section">
          <span class="entry-section__label">付款账户</span>
          <div class="entry-accounts">
            <button
              v-for="acc in accounts.slice(0, 8)"
              :key="acc.id"
              type="button"
              :class="['entry-account', { active: selectedAccountId === acc.id }]"
              @click="selectedAccountId = acc.id"
            >
              <AccountBrandIcon
                :label="acc.name"
                :brand-key="acc.brandKey ?? appearance(acc).id"
                :symbol="acc.iconKey ?? appearance(acc).symbol"
                :color="acc.color ?? appearance(acc).color"
                :size="'small'"
              />
              <div class="entry-account__info">
                <span class="entry-account__name">{{ acc.name }}</span>
                <span class="entry-account__balance">
                  {{ formatMinorToCny(acc.balanceMinor) }}
                </span>
              </div>
            </button>
          </div>
          <div v-if="accounts.length === 0" class="entry-empty">暂无付款账户，请先在「账户」中添加</div>
        </section>

        <div class="confirm-sheet__actions">
          <button
            class="entry-btn entry-btn--dismiss"
            :disabled="confirming"
            @click="onDismissConfirm"
          >
            忽略
          </button>
          <button
            class="entry-btn entry-btn--confirm"
            :disabled="!selectedAccountId || !selectedCategoryId || confirming"
            @click="doConfirm"
          >
            <CheckCheck v-if="!confirming" :size="16" />
            <Loader2 v-else :size="16" class="spinner" />
            {{ confirming ? '入账中…' : '确认入账' }}
          </button>
        </div>

        <p v-if="message" class="confirm-sheet__message" :class="message === '入账成功' ? 'confirm-sheet__message--success' : 'confirm-sheet__message--error'">
          {{ message }}
        </p>
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
  max-height: 80vh;
  overflow-y: auto;
}

.confirm-sheet__amount {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--color-divider);
  margin-bottom: 16px;
}

.confirm-sheet__merchant {
  font-size: 14px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.entry-section {
  margin-bottom: var(--space-4);
}

.entry-section__label {
  display: block;
  margin-bottom: var(--space-2);
  color: var(--color-text-tertiary);
  font-size: 13px;
  font-weight: 500;
  padding-left: 2px;
}

.entry-categories {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px var(--space-2);
}

.entry-cat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--space-1) 2px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
}

.entry-cat.active {
  border-color: var(--color-primary-500);
  background: var(--color-primary-50);
}

.entry-cat:active {
  transform: scale(0.95);
}

.entry-cat__label {
  color: var(--color-text-secondary);
  font-size: 11px;
  text-align: center;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.entry-cat.active .entry-cat__label {
  color: var(--color-primary-700);
  font-weight: 600;
}

.entry-accounts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.entry-account {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: var(--space-2) 2px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
}

.entry-account.active {
  border-color: var(--color-primary-500);
  background: var(--color-primary-50);
}

.entry-account:active {
  transform: scale(0.95);
}

.entry-account__info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
  width: 100%;
}

.entry-account__name {
  color: var(--color-text-primary);
  font-size: 11px;
  font-weight: 500;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.entry-account__balance {
  color: var(--color-text-tertiary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.entry-empty {
  padding: 16px 0;
  text-align: center;
  color: var(--color-text-tertiary);
  font-size: 13px;
}

.confirm-sheet__actions {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.entry-btn {
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 600;
  border-radius: 12px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.entry-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.entry-btn--dismiss {
  color: var(--color-text-primary);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
}

.entry-btn--confirm {
  color: white;
  background: var(--color-primary-600);
  border: 0;
}

.confirm-sheet__message {
  margin: var(--space-2) 0 0;
  font-size: var(--type-caption-size);
  text-align: center;
  line-height: 1.4;
}

.confirm-sheet__message--success {
  color: var(--color-success);
}

.confirm-sheet__message--error {
  color: var(--color-danger);
}

.spinner {
  animation: spin 1s linear infinite;
}
</style>