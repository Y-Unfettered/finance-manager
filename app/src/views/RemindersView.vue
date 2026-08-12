<script setup lang="ts">
import { Bell, CalendarClock, Check, Pencil, Plus, Trash2 } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppBottomSheet from '@/components/AppBottomSheet.vue'
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
import { useAppStore } from '@/stores/app'
import { navigateBack } from '@/router/navigation-transition'

const REMINDER_TYPE_LABELS: Record<ReminderType, string> = {
  credit_card_due: '信用卡还款',
  prepaid_expiry: '预付卡到期',
  receivable_due: '应收款到期',
  custom: '自定义提醒',
}

interface ReminderFormState {
  type: ReminderType
  accountId: string
  title: string
  dueDate: string
  amount: string
  advanceDays: string
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
const saving = ref(false)

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
    dueDate: localDateValue(new Date()),
    amount: '',
    advanceDays: '3',
    enabled: true,
  }
}

const creditAccounts = computed(() => accounts.value.filter((a) => a.normalBalance === 'credit'))

const prepaidAccounts = computed(() => accounts.value.filter((a) => a.type === 'prepaid'))

const allAccounts = computed(() => accounts.value)

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

async function load(): Promise<void> {
  if (!reminderService || !appStore.ledgerId) {
    loading.value = false
    return
  }
  loading.value = true
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
  errorMessage.value = ''
  showEditor.value = true
}

function openEdit(item: ReminderWithAccount): void {
  editingId.value = item.id
  form.value = {
    type: item.type,
    accountId: item.accountId ?? '',
    title: item.title,
    dueDate: item.dueDate,
    amount: item.amountMinor ? (item.amountMinor / 100).toFixed(2) : '',
    advanceDays: String(item.advanceDays),
    enabled: item.enabled,
  }
  errorMessage.value = ''
  showEditor.value = true
}

async function submit(): Promise<void> {
  if (!reminderService || !appStore.ledgerId || saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    const dueDateIso = new Date(`${form.value.dueDate}T00:00:00`).toISOString()
    const amountMinor = form.value.amount.trim()
      ? parseCnyInputToMinor(form.value.amount)
      : undefined
    const advanceDays = Number.parseInt(form.value.advanceDays || '0', 10)
    if (editingId.value) {
      const update: UpdateReminderInput = {
        ledgerId: appStore.ledgerId,
        reminderId: editingId.value,
        title: form.value.title,
        dueDate: dueDateIso,
        amountMinor,
        advanceDays,
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
        enabled: form.value.enabled,
      }
      await reminderService.createReminder(payload)
    }
    showEditor.value = false
    await load()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
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
    await load()
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
    await load()
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
    await load()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

function typeLabel(type: ReminderType): string {
  return REMINDER_TYPE_LABELS[type] ?? type
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function daysLabel(days: number): string {
  if (days === 0) return '今天到期'
  if (days === 1) return '明天到期'
  if (days < 0) return `已逾期 ${Math.abs(days)} 天`
  return `${days} 天后到期`
}

function localDateValue(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return shifted.toISOString().slice(0, 10)
}

onMounted(load)
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
        <button type="button" @click="load">重新加载</button>
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
            <span>{{ formatDate(item.reminder.dueDate) }}</span>
            <span v-if="item.reminder.accountName">{{ item.reminder.accountName }}</span>
          </div>
          <div v-if="item.reminder.amountMinor" class="upcoming-item__amount">
            <span>应还金额</span>
            <MoneyText :amount-minor="item.reminder.amountMinor" />
          </div>
          <div class="upcoming-item__actions">
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
        <label class="form-row">
          <span>提醒类型</span>
          <select v-model="form.type">
            <option v-for="(label, key) in REMINDER_TYPE_LABELS" :key="key" :value="key">
              {{ label }}
            </option>
          </select>
        </label>
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
        <label v-if="currentAccountOptions.length > 0" class="form-row">
          <span>关联账户（可选）</span>
          <select v-model="form.accountId">
            <option value="">不关联</option>
            <option v-for="a in currentAccountOptions" :key="a.id" :value="a.id">
              {{ a.name }}
            </option>
          </select>
        </label>
        <label class="form-row">
          <span>到期日期</span>
          <input v-model="form.dueDate" type="date" required />
        </label>
        <label class="form-row">
          <span>金额（可选）</span>
          <input v-model="form.amount" type="text" inputmode="decimal" placeholder="0.00" />
        </label>
        <label class="form-row">
          <span>提前几天提醒</span>
          <input v-model="form.advanceDays" type="number" min="0" max="60" required />
        </label>
        <label class="form-row form-row--switch">
          <AppSwitch
            v-model="form.enabled"
            label="启用此提醒"
          />
        </label>
        <div v-if="errorMessage" class="form-error">{{ errorMessage }}</div>
        <div class="form-actions">
          <button type="button" @click="showEditor = false">取消</button>
          <button type="submit" :disabled="saving">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </form>
    </AppBottomSheet>

    <AppBottomSheet v-model:show="showDelete" title="删除提醒">
      <div class="confirm-dialog">
        <p>
          将删除提醒 <strong>{{ pendingReminder?.title }}</strong
          >。确认删除？
        </p>
        <div class="form-actions">
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
  padding-top: env(safe-area-inset-top);
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
.section h2 {
  margin: 0 0 var(--space-2);
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
.confirm-dialog p {
  margin: 0 0 var(--space-3);
  color: var(--color-text-secondary);
  font-size: var(--type-body-size);
  line-height: 1.6;
}
</style>
