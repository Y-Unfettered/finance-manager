<script setup lang="ts">
import {
  Check,
  X,
  Loader2,
  AlertCircle,
  ShieldCheck,
  Clock,
} from '@lucide/vue'
import { onActivated, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import MoneyText from '@/components/MoneyText.vue'
import { getLogger } from '@/features/debug/app-logger'
import type { CapturedPayment } from '@/features/capture-inbox/capture-inbox-service'
import {
  dismissEvent,
  dismissAll,
  listPendingEvents,
  getServiceHealth,
} from '@/features/capture-inbox/capture-inbox-service'

const log = getLogger('capture-inbox')
const router = useRouter()

const events = ref<CapturedPayment[]>([])
const loading = ref(false)
const message = ref('')

const health = ref<{
  accessibility: { enabled: boolean; connected?: boolean }
  pendingCount: number
}>({
  accessibility: { enabled: false },
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

/**
 * 点「确认」→ 跳完整记账页预填（与支付宝账单详情自动跳转同一条链路），
 * 记账页保存时会自动确认队列事件并置指纹 confirmed。
 * 转账类额外带 mode=transfer（需选转入账户）。
 */
function goRecordPage(event: CapturedPayment): void {
  const isTransfer = event.direction === 'transfer'
  router.push({
    path: '/transactions/new',
    query: {
      ...(isTransfer ? { mode: 'transfer', direction: 'transfer' } : {}),
      direction: event.direction ?? '',
      amount: String(event.amountMinor),
      merchant: event.merchant ?? '',
      occurredAt: normalizeOccurredAt(event.occurredAt),
      note: event.note ?? '',
      accountHint: event.accountHint ?? '',
      targetAccountHint: event.targetAccountHint ?? '',
      captureSource: event.captureMethod ?? '',
      parserVersion: event.parserVersion ?? '',
      confidence: event.confidence != null ? String(event.confidence) : '',
      fingerprint: event.rawFingerprint ?? '',
      captureId: String(event.id),
      fee: event.feeMinor != null ? String(event.feeMinor) : '',
      originalAmount: event.originalAmountMinor != null ? String(event.originalAmountMinor) : '',
      discount: event.discountMinor != null ? String(event.discountMinor) : '',
      suggestedCategory: event.suggestedCategory ?? '',
    },
  })
}

async function doDismiss(id: number): Promise<void> {
  try {
    await dismissEvent(id)
  } catch (e) {
    message.value = '忽略失败，请重试'
    log.warn('doDismiss 失败', { msg: e instanceof Error ? e.message : String(e) })
    return
  }
  await loadEvents()
  await loadHealth()
}

async function doDismissAll(): Promise<void> {
  try {
    await dismissAll()
  } catch (e) {
    message.value = '批量忽略失败，请重试'
    log.warn('doDismissAll 失败', { msg: e instanceof Error ? e.message : String(e) })
    return
  }
  await loadEvents()
  await loadHealth()
}

/** 队列里可能残留旧版毫秒时间串，统一归一为 ISO（非法值返回空串，由记账页回退当前时间）。 */
function normalizeOccurredAt(value?: string): string {
  if (!value) return ''
  if (/^\d+$/.test(value)) {
    const ms = Number(value)
    return Number.isSafeInteger(ms) && ms > 0 ? new Date(ms).toISOString() : ''
  }
  return value
}

function captureLabel(method: string): string {
  const map: Record<string, string> = {
    accessibility: '无障碍',
    self_test: '自检',
  }
  return map[method] || method
}

/** P1：方向标签文案。 */
function directionLabel(direction: string): string {
  const map: Record<string, string> = {
    income: '收入',
    transfer: '转账',
    refund: '退款',
    confirm: '待确认',
    expense: '支出',
  }
  return map[direction] || direction
}

function captureIcon(method: string) {
  switch (method) {
    case 'accessibility': return ShieldCheck
    default: return ShieldCheck
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
    <div class="safe-top">
      <AppTopBar
        title="待确认账单"
        :show-back="true"
        @on-back="router.back()"
      />
    </div>

    <div class="capture-inbox__body">
      <section class="health-bar">
        <div class="health-item" :class="{ 'health-item--on': health.accessibility.connected ?? health.accessibility.enabled }">
          <ShieldCheck :size="18" />
          <span>无障碍</span>
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

        <p v-if="message" class="events-list__message">{{ message }}</p>

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
              <!-- P1：备注与方向标签 -->
              <div v-if="event.note || event.direction" class="event-item__note-row">
                <span v-if="event.direction && event.direction !== 'expense'" class="event-item__direction">
                  {{ directionLabel(event.direction) }}
                </span>
                <span v-if="event.note" class="event-item__note">{{ event.note }}</span>
              </div>
            </div>
          </div>

          <div class="event-item__actions">
            <button class="event-item__btn event-item__btn--dismiss" @click="doDismiss(event.id)">
              <X :size="16" />
              忽略
            </button>
            <button class="event-item__btn event-item__btn--confirm" @click="goRecordPage(event)">
              <Check :size="16" />
              确认
            </button>
          </div>
        </BaseCard>
      </div>

      <div v-if="!health.accessibility.enabled" class="setup-hint">
        <AlertCircle :size="16" />
        <span>无障碍服务未开启，自动捕获功能暂不可用。</span>
        <button class="setup-hint__btn" @click="router.push({ name: 'capture-settings' })">
          前往设置
        </button>
      </div>
    </div>

  </main>
</template>

<style scoped>
.capture-inbox {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
}

/* 状态栏安全区：顶栏从摄像头/状态栏下方开始（其余页面同款） */
.capture-inbox .safe-top {
  position: sticky;
  z-index: 40;
  top: 0;
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
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
  min-width: 0;
}

.event-item__amount {
  font-weight: 600;
  font-size: 16px;
  flex: none;
}

.event-item__merchant {
  font-size: 14px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.event-item__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-tertiary);
  flex-wrap: wrap;
  min-width: 0;
}

.event-item__account {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-item__method {
  padding: 1px 6px;
  background: var(--color-surface);
  border-radius: 4px;
  font-size: 11px;
}

/* P1：备注与方向标签 */
.event-item__note-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 12px;
  min-width: 0;
}

.event-item__direction {
  flex: none;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.event-item__note {
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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


/* 忽略失败等操作提示 */
.events-list__message {
  margin: 0;
  padding: 6px 12px;
  color: var(--color-danger);
  font-size: var(--type-caption-size);
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
}
</style>