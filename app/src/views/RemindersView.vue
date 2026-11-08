<script setup lang="ts">
// AI署名: 豆包 | 2026-11-08 | 刷新改静默（不闪 loading/不整页回顶）；删除面板按钮钉底等宽
import { Bell, CalendarClock, Check, Pencil, Plus, Trash2 } from '@lucide/vue'
import { computed, onActivated, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppBottomSheet from '@/components/AppBottomSheet.vue'
import AppSelect from '@/components/AppSelect.vue'
import AppDateInput from '@/components/AppDateInput.vue'
import AppIconButton from '@/components/AppIconButton.vue'
import AppSwitch from '@/components/AppSwitch.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import MoneyText from '@/components/MoneyText.vue'
import type {
  AccountBalanceRecord,
  ReminderType,
  ReminderWithAccount,
  UpcomingReminder,
} from '@/domain/entities'
import { parseCnyInputToMinor } from '@/domain/money'
import { useFinanceService } from '@/features/finance/finance-service'
import {
  useReminderService,
  type CreateReminderInput,
  type UpdateReminderInput,
} from '@/features/reminders/reminder-service'
import {
  REMINDER_TYPE_LABELS,
  daysLabel,
  formatReminderDate as formatDate,
  reminderTypeLabel as typeLabel,
} from '@/features/reminders/reminder-labels'
import { dateInputToLocalIso, toDateInputValue } from '@/features/reminders/reminder-dates'
import { getLogger } from '@/features/debug/app-logger'
import { useAppStore } from '@/stores/app'
import { navigateBack } from '@/router/navigation-transition'

interface ReminderFormState {
  type: ReminderType
  accountId: string
  title: string
  dueDate: string
  amount: string
  advanceDays: string
  recurring: boolean
  enabled: boolean
}

const router = useRouter()
const appStore = useAppStore()
const finance = useFinanceService()
const reminderService = useReminderService()

const reminders = ref<readonly ReminderWithAccount[]>([])
const upcoming = ref<readonly UpcomingReminder[]>([])
const accounts = ref<AccountBalanceRecord[]>([])
const loading = ref(true)
const errorMessage = ref('')
/** 编辑表单内的错误：只红字提示，不再替换掉列表（页面级错误走 errorMessage） */
const formError = ref('')
const saving = ref(false)
const log = getLogger('reminder')

const showEditor = ref(false)
const editingId = ref<string | null>(null)
const form = ref<ReminderFormState>(defaultForm())

const showDelete = ref(false)
const pendingReminder = ref<ReminderWithAccount | null>(null)

function defaultForm(): ReminderFormState {
  return {
    type: 'custom',
    accountId: '',
    title: '',
    dueDate: toDateInputValue(new Date().toISOString()),
    amount: '',
    advanceDays: '3',
    recurring: false,
    enabled: true,
  }
}

const creditAccounts = computed(() => accounts.value.filter((a) => a.normalBalance === 'credit'))

const prepaidAccounts = computed(() => accounts.value.filter((a) => a.type === 'prepaid'))

const allAccounts = computed(() => accounts.value)

const reminderTypeOptions = computed(() =>
  (Object.keys(REMINDER_TYPE_LABELS) as ReminderType[]).map((k) => ({
    value: k,
    label: REMINDER_TYPE_LABELS[k],
  })),
)
const accountSelectOptions = computed(() => [
  { value: '', label: '不关联' },
  ...allAccounts.value.map((a) => ({ value: a.id, label: a.name })),
])

const currentAccountOptions = computed(() => {
  switch (form.value.type) {
    case 'credit_card_due':
      return creditAccounts.value
    case 'prepaid_expiry':
      return prepaidAccounts.value
    case 'receivable_due':
      return []
    default:
      return allAccounts.value
  }
})

/**
 * 加载列表。默认显示骨架屏；`silent` 为静默刷新：
 * 不动 loading、不拆列表，用新数据原位替换。
 *
 * 为什么必须要静默模式（2026-11-08 实测）：模板里两个列表是 `v-if="!loading"`，
 * 一置 true 列表整段被拆掉、内容高度塌回 0，滚动容器的 scrollTop 会被钳到 0；
 * 数据回来后页面停在最上面，用户刚点的那条要重新往下找。
 */
async function load(options: { silent?: boolean } = {}): Promise<void> {
  if (!reminderService || !appStore.ledgerId) {
    loading.value = false
    return
  }
  if (!options.silent) loading.value = true
  errorMessage.value = ''
  try {
    const [list, up, accts] = await Promise.all([
      reminderService.listReminders(appStore.ledgerId),
      reminderService.listUpcoming(appStore.ledgerId, 30),
      finance ? finance.listAccounts(appStore.ledgerId) : Promise.resolve([]),
    ])
    reminders.value = list
    upcoming.value = up
    accounts.value = accts
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

function openCreate(): void {
  editingId.value = null
  form.value = defaultForm()
  formError.value = ''
  showEditor.value = true
}

function openEdit(item: ReminderWithAccount): void {
  editingId.value = item.id
  form.value = {
    type: item.type,
    accountId: item.accountId ?? '',
    title: item.title,
    // 库里的 dueDate 是完整 ISO（本地零点、带 Z），表单只要 YYYY-MM-DD，
    // 原样塞进去保存时会拼成非法日期并抛 RangeError: Invalid time value（2026-11-08 线上报错）
    dueDate: toDateInputValue(item.dueDate),
    amount: item.amountMinor ? (item.amountMinor / 100).toFixed(2) : '',
    advanceDays: String(item.advanceDays),
    recurring: item.recurrence === 'monthly',
    enabled: item.enabled,
  }
  formError.value = ''
  showEditor.value = true
}

async function submit(): Promise<void> {
  if (!reminderService || !appStore.ledgerId || saving.value) return
  saving.value = true
  formError.value = ''
  try {
    const dueDateIso = dateInputToLocalIso(form.value.dueDate)
    const amountMinor = form.value.amount.trim()
      ? parseCnyInputToMinor(form.value.amount)
      : undefined
    const advanceDays = Number.parseInt(form.value.advanceDays || '0', 10)
    const recurrence = form.value.recurring ? 'monthly' : 'none'
    if (editingId.value) {
      const update: UpdateReminderInput = {
        ledgerId: appStore.ledgerId,
        reminderId: editingId.value,
        title: form.value.title,
        dueDate: dueDateIso,
        amountMinor,
        advanceDays,
        recurrence,
        enabled: form.value.enabled,
      }
      await reminderService.updateReminder(update)
    } else {
      const payload: CreateReminderInput = {
        ledgerId: appStore.ledgerId,
        type: form.value.type,
        accountId: form.value.accountId || undefined,
        title: form.value.title,
        dueDate: dueDateIso,
        amountMinor,
        advanceDays,
        recurrence,
        enabled: form.value.enabled,
      }
      await reminderService.createReminder(payload)
    }
    showEditor.value = false
    await load({ silent: true })
  } catch (error) {
    formError.value = error instanceof Error ? error.message : String(error)
    log.error('保存提醒失败', {
      editing: Boolean(editingId.value),
      dueDate: form.value.dueDate,
      recurring: form.value.recurring,
      message: formError.value,
    })
  } finally {
    saving.value = false
  }
}

function openDelete(item: ReminderWithAccount): void {
  pendingReminder.value = item
  showDelete.value = true
}

async function confirmDelete(): Promise<void> {
  if (!reminderService || !appStore.ledgerId || !pendingReminder.value || saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await reminderService.deleteReminder(appStore.ledgerId, pendingReminder.value.id)
    showDelete.value = false
    pendingReminder.value = null
    await load({ silent: true })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

async function toggleEnabled(item: ReminderWithAccount): Promise<void> {
  if (!reminderService || !appStore.ledgerId || saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await reminderService.updateReminder({
      ledgerId: appStore.ledgerId,
      reminderId: item.id,
      enabled: !item.enabled,
    })
    await load({ silent: true })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

async function markTriggered(item: ReminderWithAccount): Promise<void> {
  if (!reminderService || saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await reminderService.markTriggered(item.id)
    await load({ silent: true })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

onMounted(load)

/**
 * 页面被 App 的 KeepAlive 缓存，同一实例不会再次触发 onMounted：
 * 建信用卡 / 改账期之后回到本页，看到的还是上一次的快照（2026-11-08 实测：
 * 库里提醒已经建好/已改成 9 号，页面仍显示旧数据）。所以每次重新激活都刷新一次。
 *
 * 重激活必须静默刷新：RoutePageFrame 在 onActivated 时刚把 scrollTop 恢复好，
 * 若这里再闪一次骨架屏、把列表拆掉，恢复的滚动位置会立刻被钳回 0。
 */
let skipFirstActivation = true
onActivated(() => {
  if (skipFirstActivation) {
    skipFirstActivation = false
    return
  }
  void load({ silent: true })
})
</script>

<template>
  <main class="reminders-page">
    <div class="reminders-page__safe-top">
      <AppTopBar title="到期提醒" @back="navigateBack(router, { name: 'settings' })">
        <template #right>
          <AppIconButton label="新增提醒" @click="openCreate">
            <Plus :size="22" :stroke-width="1.75" aria-hidden="true" />
          </AppIconButton>
        </template>
      </AppTopBar>
    </div>

    <div class="reminders-page__content">
      <div v-if="loading" class="page-state">正在加载…</div>
      <div v-else-if="errorMessage" class="page-state page-state--error">
        <span>{{ errorMessage }}</span>
        <button type="button" @click="load()">重新加载</button>
      </div>

      <section v-if="!loading && upcoming.length > 0" class="section">
        <h2>近期到期</h2>
        <BaseCard
          v-for="item in upcoming"
          :key="item.reminder.id"
          class="upcoming-item"
          variant="compact"
        >
          <div class="upcoming-item__head">
            <strong>{{ item.reminder.title }}</strong>
            <span
              class="upcoming-item__days"
              :class="{
                'upcoming-item__days--due': item.daysUntilDue === 0,
                'upcoming-item__days--overdue': item.daysUntilDue < 0,
              }"
            >
              {{ daysLabel(item.daysUntilDue) }}
            </span>
          </div>
          <div class="upcoming-item__meta">
            <span>{{ typeLabel(item.reminder.type) }}</span>
            <span>{{ formatDate(item.nextDueDate) }}</span>
            <span v-if="item.reminder.recurrence === 'monthly'">每月重复</span>
            <span v-if="item.reminder.managedBy === 'credit_profile'" class="auto-tag">自动</span>
            <span v-if="item.reminder.accountName">{{ item.reminder.accountName }}</span>
            <span v-if="item.isHandled">本期已处理</span>
          </div>
          <div v-if="item.reminder.amountMinor" class="upcoming-item__amount">
            <span>应还金额</span>
            <MoneyText :amount-minor="item.reminder.amountMinor" />
          </div>
          <div v-if="!item.isHandled" class="upcoming-item__actions">
            <button type="button" class="chip" @click="markTriggered(item.reminder)">
              <Check :size="14" :stroke-width="2.5" aria-hidden="true" />标记已处理
            </button>
          </div>
        </BaseCard>
      </section>

      <section v-if="!loading" class="section">
        <h2>全部提醒</h2>
        <div v-if="reminders.length === 0" class="empty-state">
          <Bell :size="32" :stroke-width="1.5" aria-hidden="true" />
          <strong>没有提醒</strong>
          <span>设置信用卡还款、预付卡到期、应收款等提醒，提前收到通知。</span>
        </div>
        <BaseCard
          v-for="item in reminders"
          :key="item.id"
          class="reminder-item"
          variant="compact"
          :class="{ 'reminder-item--disabled': !item.enabled }"
        >
          <div class="reminder-item__head">
            <div class="reminder-item__title">
              <strong>{{ item.title }}</strong>
              <span class="reminder-item__type">{{ typeLabel(item.type) }}</span>
            </div>
            <button
              type="button"
              class="reminder-item__toggle"
              :class="{ 'reminder-item__toggle--off': !item.enabled }"
              @click="toggleEnabled(item)"
            >
              <Check v-if="item.enabled" :size="14" :stroke-width="2.5" aria-hidden="true" />
            </button>
          </div>
          <div class="reminder-item__meta">
            <span
              ><CalendarClock :size="14" :stroke-width="2" aria-hidden="true" />{{
                formatDate(item.dueDate)
              }}</span
            >
            <span v-if="item.recurrence === 'monthly'">每月重复</span>
            <span v-if="item.managedBy === 'credit_profile'" class="auto-tag">自动</span>
            <span v-if="item.accountName">{{ item.accountName }}</span>
            <span v-if="item.advanceDays > 0">提前 {{ item.advanceDays }} 天提醒</span>
          </div>
          <div v-if="item.amountMinor" class="reminder-item__amount">
            <span>金额</span>
            <MoneyText :amount-minor="item.amountMinor" />
          </div>
          <div class="reminder-item__actions">
            <AppIconButton label="编辑" @click="openEdit(item)">
              <Pencil :size="18" :stroke-width="1.75" aria-hidden="true" />
            </AppIconButton>
            <AppIconButton label="删除" @click="openDelete(item)">
              <Trash2 :size="18" :stroke-width="1.75" aria-hidden="true" />
            </AppIconButton>
          </div>
        </BaseCard>
      </section>
    </div>

    <AppBottomSheet v-model:show="showEditor" :title="editingId ? '编辑提醒' : '新建提醒'">
      <form class="form" @submit.prevent="submit">
        <AppSelect v-model="form.type" label="提醒类型" :options="reminderTypeOptions" />
        <label class="form-row">
          <span>标题</span>
          <input
            v-model="form.title"
            type="text"
            required
            maxlength="40"
            placeholder="例如：招行还款"
          />
        </label>
        <AppSelect
          v-if="currentAccountOptions.length > 0"
          v-model="form.accountId"
          label="关联账户（可选）"
          :options="accountSelectOptions"
        />
        <AppDateInput
          v-model="form.dueDate"
          label="到期日期"
          :description="form.recurring ? '到期日按每月同一天自动延续（首次为所选日期）' : '点击选择日期'"
        />
        <label class="form-row">
          <span>金额（可选）</span>
          <input v-model="form.amount" type="text" inputmode="decimal" placeholder="0.00" />
        </label>
        <label class="form-row">
          <span>提前几天提醒</span>
          <input v-model="form.advanceDays" type="text" inputmode="numeric" placeholder="0" required />
        </label>
        <label class="form-row form-row--switch">
          <AppSwitch
            v-model="form.recurring"
            label="每月同日重复"
            description="适合花呗/白条等固定还款日，开启后无需每月重设"
          />
        </label>
        <label class="form-row form-row--switch">
          <AppSwitch
            v-model="form.enabled"
            label="启用此提醒"
          />
        </label>
        <div v-if="formError" class="form-error">{{ formError }}</div>
        <div class="form-actions">
          <button type="button" @click="showEditor = false">取消</button>
          <button type="submit" :disabled="saving">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </form>
    </AppBottomSheet>

    <!-- 删除确认：高度随内容收缩（min-height 0），按钮钉在面板最底部、五五等宽 -->
    <AppBottomSheet v-model:show="showDelete" title="删除提醒" :min-height="0">
      <div class="confirm-dialog">
        <p>
          将删除提醒 <strong>{{ pendingReminder?.title }}</strong
          >。确认删除？
        </p>
        <div class="confirm-actions">
          <button type="button" @click="showDelete = false">取消</button>
          <button type="button" class="danger" :disabled="saving" @click="confirmDelete">
            删除
          </button>
        </div>
      </div>
    </AppBottomSheet>
  </main>
</template>

<style scoped>
.reminders-page {
  min-height: 100dvh;
  padding-bottom: calc(var(--space-8) + env(safe-area-inset-bottom));
  background: var(--color-background);
}
.reminders-page__safe-top {
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}
.reminders-page__content {
  display: grid;
  max-width: 520px;
  padding: var(--space-3) var(--page-gutter) 0;
  margin: 0 auto;
  gap: var(--space-4);
}
.page-state,
.empty-state {
  display: grid;
  min-height: 150px;
  padding: var(--space-6);
  place-items: center;
  align-content: center;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--type-body-size);
  text-align: center;
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-card);
}
.page-state--error {
  color: var(--color-expense);
}
.page-state button {
  padding: var(--space-2) var(--space-4);
  color: var(--color-primary-700);
  background: var(--color-primary-50);
  border: 0;
  border-radius: var(--radius-pill);
}
.empty-state strong {
  color: var(--color-text-primary);
  font-size: var(--type-section-title-size);
}
.empty-state svg {
  color: var(--color-primary-500);
}
.section {
  display: grid;
  min-width: 0;
  gap: var(--space-3); /* 卡片栈间距 12px，与其他页面一致 */
}
.section h2 {
  margin: var(--space-2) 0 var(--space-1);
  font-size: var(--type-section-title-size);
}
.upcoming-item,
.reminder-item {
  display: grid;
  gap: var(--space-2);
}
.reminder-item--disabled {
  opacity: 0.55;
}
.upcoming-item__head,
.reminder-item__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.upcoming-item__head strong,
.reminder-item__title strong {
  font-size: var(--type-body-size);
  font-weight: 600;
}
.upcoming-item__days {
  padding: 2px var(--space-2);
  color: var(--color-primary-700);
  font-size: var(--type-caption-size);
  background: var(--color-primary-50);
  border-radius: var(--radius-pill);
  white-space: nowrap;
}
.upcoming-item__days--due {
  color: var(--color-expense);
  background: rgb(220 38 38 / 8%);
}
.upcoming-item__days--overdue {
  color: white;
  background: var(--color-expense);
}
.upcoming-item__meta,
.reminder-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.reminder-item__meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.reminder-item__type {
  padding: 2px var(--space-2);
  color: var(--color-primary-700);
  font-size: var(--type-caption-size);
  background: var(--color-primary-50);
  border-radius: var(--radius-pill);
}
/* 由信用卡账期自动生成的提醒：给个小角标，避免用户以为是重复/来历不明的条目 */
.auto-tag {
  padding: 1px var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
  background: var(--color-background);
  border-radius: var(--radius-pill);
}
.upcoming-item__amount,
.reminder-item__amount {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  font-size: var(--type-caption-size);
  background: var(--color-background);
  border-radius: var(--radius-sm);
}
.upcoming-item__amount span,
.reminder-item__amount span {
  color: var(--color-text-tertiary);
}
.upcoming-item__actions {
  display: flex;
  justify-content: flex-end;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: var(--space-1) var(--space-3);
  color: var(--color-primary-700);
  font-size: var(--type-caption-size);
  background: var(--color-primary-50);
  border: 0;
  border-radius: var(--radius-pill);
}
.reminder-item__title {
  display: grid;
  gap: 2px;
}
.reminder-item__toggle {
  width: 36px;
  height: 22px;
  padding: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  color: white;
  background: var(--color-primary-500);
  border: 0;
  border-radius: var(--radius-pill);
  transition: background var(--motion-fast) var(--ease-standard);
}
.reminder-item__toggle--off {
  justify-content: flex-start;
  background: var(--color-divider);
}
.reminder-item__toggle::after {
  content: '';
  display: block;
  width: 18px;
  height: 18px;
  background: white;
  border-radius: 50%;
}
.reminder-item__actions {
  display: flex;
  gap: var(--space-1);
  justify-content: flex-end;
}
.form {
  display: grid;
  gap: var(--space-3);
}
.form-row {
  display: grid;
  gap: 6px;
  font-size: var(--type-caption-size);
  color: var(--color-text-secondary);
}
.form-row input,
.form-row select {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  font-size: var(--type-body-size);
  color: var(--color-text-primary);
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-sm);
  outline: none;
  appearance: none;
  -webkit-appearance: none;
  transition: border-color 0.15s;
}

.form-row select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
}

.form-row input:focus,
.form-row select:focus {
  border-color: var(--color-primary-500);
}
.form-row--inline {
  grid-auto-flow: column;
  justify-content: start;
  align-items: center;
  gap: var(--space-2);
}
.form-row--inline input {
  width: 20px;
  height: 20px;
}
.form-row--switch {
  padding-top: var(--space-1);
}
.form-row--switch :deep(.app-switch-row) {
  padding: var(--space-2) 0;
  min-height: auto;
  border-top: none;
}
.form-error {
  color: var(--color-expense);
  font-size: var(--type-caption-size);
}
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
.form-actions button {
  padding: var(--space-2) var(--space-4);
  background: var(--color-primary-50);
  border: 0;
  border-radius: var(--radius-pill);
  color: var(--color-primary-700);
  font-size: var(--type-body-size);
}
.form-actions button[type='submit'] {
  background: var(--color-primary-600);
  color: white;
}
.form-actions button.danger {
  background: var(--color-expense);
  color: white;
}
.confirm-dialog {
  display: grid;
  gap: var(--space-5);
}
.confirm-dialog p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--type-body-size);
  line-height: 1.6;
}
/*
 * 删除确认的两个按钮：一横排五五等宽，钉在面板最底部。
 * 左右留白由 AppBottomSheet 的 body padding（16px）提供，
 * 距屏幕底部的安全距离由 Popup 的 safe-area-inset-bottom + body padding 兜住。
 * 面板用 min-height 0，高度随内容收缩，按钮下方不再有大片空白。
 */
.confirm-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}
.confirm-actions button {
  min-height: var(--size-touch-target);
  padding: 0 var(--space-4);
  color: var(--color-text-primary);
  font-size: 15px;
  background: var(--color-surface);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
}
.confirm-actions button.danger {
  color: #fff;
  font-weight: 600;
  background: var(--color-expense);
  border-color: var(--color-expense);
}
.confirm-actions button:disabled {
  opacity: 0.5;
}
</style>
