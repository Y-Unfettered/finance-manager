<script setup lang="ts">
/**
 * 首页到期提醒弹窗。
 *
 * 打开 APP 进入首页 / 从后台切回时由 HomeView 调用 listUpcoming 后弹出，
 * 只列"处于提醒窗口内且本期未处理"的提醒。
 * - 每条可单独"标记已处理"（本期静默，下期照常）；
 * - 底部勾选"今日不再提醒"：整包当天生效（localStorage 记当天日期，次日自动失效）。
 * 不做系统推送，仅应用内弹窗（本轮范围）。
 */
import { BellRing, Check } from '@lucide/vue'
import { computed, onDeactivated, ref, watch } from 'vue'

import MoneyText from '@/components/MoneyText.vue'
import { usePageScrollLock } from '@/composables/usePageScrollLock'
import type { UpcomingReminder } from '@/domain/entities'
import { daysLabel, formatReminderDate, reminderTypeLabel } from '@/features/reminders/reminder-labels'

const props = withDefaults(
  defineProps<{
    show: boolean
    items: readonly UpcomingReminder[]
    /** 正在"标记已处理"，禁止重复点击 */
    busy?: boolean
  }>(),
  { busy: false },
)

const emit = defineEmits<{
  'update:show': [value: boolean]
  /** 点了"知道了"：dismissToday 为"今日不再提醒"勾选状态 */
  dismiss: [dismissToday: boolean]
  'mark-handled': [reminderId: string]
}>()

const visible = computed(() => props.show)
const dismissToday = ref(false)

// 弹层打开期间锁住真实滚动容器（.route-page-frame），关闭时恢复
usePageScrollLock(visible)

watch(
  () => props.show,
  (show) => {
    if (show) dismissToday.value = false
  },
)

// 页面被 KeepAlive 失活时关闭弹层，避免返回首页后"遮罩复活"
onDeactivated(() => {
  if (props.show) emit('update:show', false)
})

function handleDismiss(): void {
  emit('dismiss', dismissToday.value)
  emit('update:show', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="reminder-popup">
      <div v-if="visible" class="reminder-popup" @click.self="handleDismiss">
        <div
          class="reminder-popup__card"
          role="dialog"
          aria-modal="true"
          aria-label="到期提醒"
        >
          <div class="reminder-popup__head">
            <span class="reminder-popup__icon">
              <BellRing :size="20" :stroke-width="1.9" aria-hidden="true" />
            </span>
            <div class="reminder-popup__title">
              <strong>到期提醒</strong>
              <small>{{ items.length }} 项进入提醒期</small>
            </div>
          </div>

          <ul class="reminder-popup__list">
            <li v-for="item in items" :key="item.reminder.id" class="reminder-popup__item">
              <div class="reminder-popup__row">
                <span class="reminder-popup__name">{{ item.reminder.title }}</span>
                <span
                  class="reminder-popup__days"
                  :class="{ 'reminder-popup__days--due': item.daysUntilDue === 0 }"
                >
                  {{ daysLabel(item.daysUntilDue) }}
                </span>
              </div>
              <div class="reminder-popup__meta">
                <span>{{ reminderTypeLabel(item.reminder.type) }}</span>
                <span>{{ formatReminderDate(item.nextDueDate) }}</span>
                <span v-if="item.reminder.recurrence === 'monthly'">每月重复</span>
                <span v-if="item.reminder.accountName">{{ item.reminder.accountName }}</span>
              </div>
              <div class="reminder-popup__foot">
                <span v-if="item.reminder.amountMinor" class="reminder-popup__amount">
                  应还 <MoneyText :amount-minor="item.reminder.amountMinor" />
                </span>
                <span v-else class="reminder-popup__amount">未填金额</span>
                <button
                  type="button"
                  class="reminder-popup__chip"
                  :disabled="busy"
                  @click="emit('mark-handled', item.reminder.id)"
                >
                  <Check :size="13" :stroke-width="2.5" aria-hidden="true" />标记已处理
                </button>
              </div>
            </li>
          </ul>

          <button
            type="button"
            class="reminder-popup__check"
            :aria-pressed="dismissToday ? 'true' : 'false'"
            @click="dismissToday = !dismissToday"
          >
            <span class="reminder-popup__box" :class="{ 'reminder-popup__box--on': dismissToday }">
              <Check v-if="dismissToday" :size="12" :stroke-width="3" aria-hidden="true" />
            </span>
            今日不再提醒
          </button>

          <button type="button" class="reminder-popup__ok" @click="handleDismiss">知道了</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.reminder-popup {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: flex;
  padding: var(--space-5);
  align-items: center;
  justify-content: center;
  background: rgb(15 23 42 / 45%);
}

.reminder-popup__card {
  width: 100%;
  max-width: 340px;
  max-height: min(78dvh, 560px);
  display: flex;
  padding: var(--space-4) var(--space-4) var(--space-4);
  flex-direction: column;
  background: var(--color-surface);
  border-radius: 18px;
  box-shadow: 0 18px 48px rgb(15 23 42 / 22%);
}

.reminder-popup__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.reminder-popup__icon {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--color-warning-600);
  background: var(--color-warning-50);
  border-radius: 999px;
}

.reminder-popup__title {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.reminder-popup__title strong {
  color: var(--color-text-primary);
  font-size: 17px;
  font-weight: 600;
  line-height: 1.35;
}

.reminder-popup__title small {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}

.reminder-popup__list {
  display: grid;
  padding: 0;
  margin: var(--space-3) 0 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  gap: var(--space-2);
  list-style: none;
}

.reminder-popup__item {
  display: grid;
  padding: var(--space-2) var(--space-3);
  gap: 4px;
  background: var(--color-background);
  border-radius: 12px;
}

.reminder-popup__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.reminder-popup__name {
  overflow: hidden;
  color: var(--color-text-primary);
  font-size: var(--type-body-size);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reminder-popup__days {
  flex: 0 0 auto;
  padding: 1px var(--space-2);
  color: var(--color-primary-700);
  font-size: var(--type-caption-size);
  background: var(--color-primary-50);
  border-radius: var(--radius-pill);
  white-space: nowrap;
}

.reminder-popup__days--due {
  color: var(--color-expense);
  background: rgb(220 38 38 / 8%);
}

.reminder-popup__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}

.reminder-popup__foot {
  display: flex;
  min-height: 26px;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.reminder-popup__amount {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
}

.reminder-popup__amount :deep(.money-text) {
  font-weight: 600;
}

.reminder-popup__chip {
  display: inline-flex;
  min-height: 28px;
  padding: 0 var(--space-2);
  align-items: center;
  gap: 3px;
  color: var(--color-primary-700);
  font-size: var(--type-caption-size);
  background: var(--color-primary-50);
  border: 0;
  border-radius: var(--radius-pill);
}

.reminder-popup__chip:disabled {
  opacity: 0.5;
}

.reminder-popup__check {
  display: flex;
  min-height: 44px;
  padding: 0;
  margin-top: var(--space-2);
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--type-body-size);
  background: transparent;
  border: 0;
  border-top: 1px solid var(--color-divider);
}

.reminder-popup__box {
  display: grid;
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  place-items: center;
  color: white;
  background: transparent;
  border: 1px solid var(--color-divider);
  border-radius: 5px;
}

.reminder-popup__box--on {
  background: var(--color-primary-600);
  border-color: var(--color-primary-600);
}

.reminder-popup__ok {
  min-height: 44px;
  margin-top: var(--space-2);
  color: white;
  font-size: 15px;
  font-weight: 600;
  background: var(--color-primary-600);
  border: 0;
  border-radius: 12px;
}

.reminder-popup-enter-active,
.reminder-popup-leave-active {
  transition: opacity 0.18s ease;
}

.reminder-popup-enter-from,
.reminder-popup-leave-to {
  opacity: 0;
}
</style>
