<script setup lang="ts">
import { CalendarDays, List, SlidersHorizontal } from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import DailyLedgerCard from '@/components/DailyLedgerCard.vue'
import MoneyText from '@/components/MoneyText.vue'
import MonthPickerSheet from '@/components/MonthPickerSheet.vue'
import TransactionDetailSheet from '@/components/TransactionDetailSheet.vue'
import type { LedgerListItem } from '@/db/repositories/dashboard-repository'
import type { TransactionType } from '@/domain/accounting'
import type { AccountBalanceRecord } from '@/domain/entities'
import {
  useFinanceService,
  type ExpenseCategoryOption,
  type IncomeCategoryOption,
} from '@/features/finance/finance-service'
import {
  useSearchService,
  type TransactionSearchResultItem,
} from '@/features/search/search-service'
import { useAppStore } from '@/stores/app'

type BillTypeFilter =
  'all' | 'expense' | 'income' | 'transfer' | 'credit_purchase' | 'repayment' | 'refund'
type CalendarMetric = 'flow' | 'balance' | 'income' | 'expense'

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()
const finance = useFinanceService()
const search = useSearchService()
const queryMonth = typeof route.query.month === 'string' ? route.query.month : ''
const month = ref(
  /^\d{4}-(0[1-9]|1[0-2])$/.test(queryMonth) ? queryMonth : appStore.selectedHomePeriod,
)
const items = ref<readonly LedgerListItem[]>([])
const accounts = ref<readonly AccountBalanceRecord[]>([])
const expenseCategories = ref<readonly ExpenseCategoryOption[]>([])
const incomeCategories = ref<readonly IncomeCategoryOption[]>([])
const loading = ref(true)
const typeFilter = ref<BillTypeFilter>('all')
const accountId = ref('')
const categoryId = ref('')
const view = ref<'list' | 'calendar'>(route.query.view === 'calendar' ? 'calendar' : 'list')
const calendarMetric = ref<CalendarMetric>('flow')
const selectedDate = ref('')
const activeTransactionId = ref<string>()
const showDetail = ref(false)
const showPeriod = ref(false)

const categoryOptions = computed(() => [
  ...expenseCategories.value.map((item) => ({ ...item, group: '支出分类' })),
  ...incomeCategories.value.map((item) => ({ ...item, group: '收入分类' })),
])
const summary = computed(() =>
  items.value.reduce(
    (value, item) => {
      if (item.type === 'income') value.income += item.amountMinor
      if (item.type === 'expense' || item.type === 'credit_purchase')
        value.expense += item.amountMinor
      if (item.type === 'refund') value.expense -= item.amountMinor
      return value
    },
    { income: 0, expense: 0 },
  ),
)
const groups = computed(() => {
  const map = new Map<string, LedgerListItem[]>()
  for (const item of items.value) {
    const key = item.occurredAt.slice(0, 10)
    map.set(key, [...(map.get(key) ?? []), item])
  }
  return [...map.entries()].map(([date, rows]) => ({
    date,
    label: new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    }).format(new Date(`${date}T00:00:00`)),
    rows,
    income: rows
      .filter((item) => item.type === 'income')
      .reduce((sum, item) => sum + item.amountMinor, 0),
    expense: rows.reduce(
      (sum, item) =>
        sum +
        (item.type === 'expense' || item.type === 'credit_purchase'
          ? item.amountMinor
          : item.type === 'refund'
            ? -item.amountMinor
            : 0),
      0,
    ),
  }))
})
const selectedGroup = computed(() =>
  groups.value.find((group) => group.date === selectedDate.value),
)
const calendarCells = computed(() => {
  const [year, monthNumber] = month.value.split('-').map(Number)
  const first = new Date(year!, monthNumber! - 1, 1)
  const days = new Date(year!, monthNumber!, 0).getDate()
  const offset = (first.getDay() + 6) % 7
  const totals = new Map(groups.value.map((group) => [Number(group.date.slice(-2)), group]))
  return [
    ...Array.from({ length: offset }, () => undefined),
    ...Array.from({ length: days }, (_, index) => ({
      day: index + 1,
      group: totals.get(index + 1),
    })),
  ]
})

async function loadOptions(): Promise<void> {
  if (!finance || !appStore.ledgerId) return
  ;[accounts.value, expenseCategories.value, incomeCategories.value] = await Promise.all([
    finance.listAccounts(appStore.ledgerId),
    finance.listExpenseCategories(appStore.ledgerId),
    finance.listIncomeCategories(appStore.ledgerId),
  ])
}

async function load(): Promise<void> {
  if (!search || !appStore.ledgerId) return
  loading.value = true
  try {
    const [year, monthNumber] = month.value.split('-').map(Number)
    const start = new Date(year!, monthNumber! - 1, 1)
    const end = new Date(year!, monthNumber!, 1)
    const rows = await search.searchTransactions({
      ledgerId: appStore.ledgerId,
      startUtc: start.toISOString(),
      endUtc: end.toISOString(),
      type: typeFilter.value === 'all' ? undefined : typeFilter.value,
      accountId: accountId.value || undefined,
      categoryId: categoryId.value || undefined,
      limit: 1000,
    })
    items.value = rows.map(toLedgerItem)
    if (selectedDate.value && !selectedDate.value.startsWith(month.value)) selectedDate.value = ''
  } finally {
    loading.value = false
  }
}

function toLedgerItem(item: TransactionSearchResultItem): LedgerListItem {
  return {
    id: item.id,
    type: item.type,
    amountMinor: item.amountMinor,
    occurredAt: item.occurredAt,
    title: item.merchant || item.counterparty || item.categoryName || typeLabel(item.type),
    accountLabel: item.primaryAccountName ?? '',
  }
}

function typeLabel(type: TransactionType): string {
  return {
    expense: '支出',
    income: '收入',
    transfer: '转账',
    credit_purchase: '信用消费',
    repayment: '还款',
    refund: '退款',
    borrowing: '借入',
    repay_borrowing: '归还借款',
    loan_out: '借出',
    loan_recovery: '收回借款',
    balance_adjustment: '余额调整',
    opening_balance: '期初余额',
  }[type]
}

function selectDay(day: number): void {
  selectedDate.value = `${month.value}-${String(day).padStart(2, '0')}`
}

function open(item: LedgerListItem): void {
  activeTransactionId.value = item.id
  showDetail.value = true
}

watch([month, typeFilter, accountId, categoryId], () => {
  appStore.selectHomePeriod(month.value)
  void load()
})
onMounted(async () => {
  await loadOptions()
  await load()
})
</script>

<template>
  <main class="bills-page">
    <div class="safe-top">
      <AppTopBar
        :title="view === 'calendar' ? month.replace('-', '.') : '账单'"
        :period-switchable="view === 'calendar'"
        @back="router.back()"
        @select-period="showPeriod = true"
      >
        <template #right>
          <button
            class="view-button"
            type="button"
            :aria-label="view === 'list' ? '切换日历' : '切换列表'"
            @click="view = view === 'list' ? 'calendar' : 'list'"
          >
            <CalendarDays v-if="view === 'list'" :size="21" />
            <List v-else :size="21" />
          </button>
        </template>
      </AppTopBar>
    </div>
    <div class="content">
      <BaseCard v-if="view === 'list'" class="filters">
        <label><span>月份</span><input v-model="month" type="month" /></label>
        <label>
          <SlidersHorizontal :size="17" />
          <select v-model="typeFilter">
            <option value="all">全部类型</option>
            <option value="expense">支出</option>
            <option value="income">收入</option>
            <option value="transfer">转账</option>
            <option value="credit_purchase">信用消费</option>
            <option value="repayment">还款</option>
            <option value="refund">退款</option>
          </select>
        </label>
        <label>
          <span>账户</span>
          <select v-model="accountId">
            <option value="">全部账户</option>
            <option v-for="account in accounts" :key="account.id" :value="account.id">
              {{ account.name }}
            </option>
          </select>
        </label>
        <label>
          <span>分类</span>
          <select v-model="categoryId">
            <option value="">全部分类</option>
            <optgroup label="支出分类">
              <option
                v-for="category in categoryOptions.filter((item) => item.group === '支出分类')"
                :key="category.id"
                :value="category.id"
              >
                {{ category.parentId ? `— ${category.name}` : category.name }}
              </option>
            </optgroup>
            <optgroup label="收入分类">
              <option
                v-for="category in categoryOptions.filter((item) => item.group === '收入分类')"
                :key="category.id"
                :value="category.id"
              >
                {{ category.parentId ? `— ${category.name}` : category.name }}
              </option>
            </optgroup>
          </select>
        </label>
      </BaseCard>
      <BaseCard v-if="view === 'list'" class="summary">
        <div><span>收入</span><MoneyText :amount-minor="summary.income" tone="income" /></div>
        <div><span>支出</span><MoneyText :amount-minor="summary.expense" tone="expense" /></div>
        <div><span>结余</span><MoneyText :amount-minor="summary.income - summary.expense" /></div>
      </BaseCard>
      <div v-if="loading" class="state">正在读取账单…</div>
      <template v-else-if="view === 'list'">
        <DailyLedgerCard
          v-for="group in groups"
          :key="group.date"
          :label="group.label"
          :income-minor="group.income"
          :expense-minor="group.expense"
          :items="group.rows"
          @select="open"
        />
        <div v-if="!groups.length" class="state">当前筛选范围还没有账单</div>
      </template>
      <template v-else>
        <BaseCard class="calendar">
          <div
            v-for="weekday in ['一', '二', '三', '四', '五', '六', '日']"
            :key="weekday"
            class="weekday"
          >
            {{ weekday }}
          </div>
          <button
            v-for="(cell, index) in calendarCells"
            :key="index"
            class="day"
            :class="{
              'day--empty': !cell,
              'day--selected':
                cell && selectedDate.endsWith(`-${String(cell.day).padStart(2, '0')}`),
            }"
            type="button"
            :disabled="!cell"
            @click="cell && selectDay(cell.day)"
          >
            <template v-if="cell">
              <strong>{{ cell.day }}</strong>
              <template v-if="calendarMetric === 'flow'">
                <small v-if="cell.group?.expense" class="expense"
                  >-{{ (cell.group.expense / 100).toFixed(0) }}</small
                >
                <small v-if="cell.group?.income" class="income"
                  >+{{ (cell.group.income / 100).toFixed(0) }}</small
                >
              </template>
              <small
                v-else-if="calendarMetric === 'balance' && cell.group"
                :class="cell.group.income - cell.group.expense >= 0 ? 'income' : 'expense'"
              >
                {{ ((cell.group.income - cell.group.expense) / 100).toFixed(0) }}
              </small>
              <small v-else-if="calendarMetric === 'income' && cell.group?.income" class="income"
                >+{{ (cell.group.income / 100).toFixed(0) }}</small
              >
              <small v-else-if="calendarMetric === 'expense' && cell.group?.expense" class="expense"
                >-{{ (cell.group.expense / 100).toFixed(0) }}</small
              >
            </template>
          </button>
          <div class="calendar-metrics" role="tablist" aria-label="日历显示方式">
            <button
              v-for="option in [
                ['flow', '收支'],
                ['balance', '结余'],
                ['income', '收入'],
                ['expense', '支出'],
              ] as const"
              :key="option[0]"
              type="button"
              :class="{ active: calendarMetric === option[0] }"
              @click="calendarMetric = option[0]"
            >
              {{ option[1] }}
            </button>
          </div>
          <p class="calendar-total">
            月收入：{{ (summary.income / 100).toFixed(2) }}，月支出：{{
              (summary.expense / 100).toFixed(2)
            }}，月结余：{{ ((summary.income - summary.expense) / 100).toFixed(2) }}
          </p>
        </BaseCard>
        <DailyLedgerCard
          v-if="selectedGroup"
          :label="selectedGroup.label"
          :income-minor="selectedGroup.income"
          :expense-minor="selectedGroup.expense"
          :items="selectedGroup.rows"
          @select="open"
        />
        <div v-else class="state">点击日期查看当天流水</div>
      </template>
    </div>
    <TransactionDetailSheet
      :show="showDetail"
      :transaction-id="activeTransactionId"
      @update:show="showDetail = $event"
      @updated="load"
    />
    <MonthPickerSheet
      v-model:show="showPeriod"
      :period="month"
      title="选择日历月份"
      @select="month = $event"
    />
  </main>
</template>

<style scoped>
.bills-page {
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
  padding: var(--space-3) var(--page-gutter) calc(var(--space-8) + env(safe-area-inset-bottom));
  margin: auto;
  gap: var(--space-3);
}
.view-button {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  color: var(--color-text-primary);
  background: transparent;
  border: 0;
}
.filters {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}
.filters label {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-2);
}
.filters label > span {
  flex: none;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
input,
select {
  min-width: 0;
  width: 100%;
  height: 38px;
  padding: 0 var(--space-2);
  color: var(--color-text-primary);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
}
.summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
}
.summary div {
  display: grid;
}
.summary span {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.summary :deep(.money-text) {
  font-weight: 600;
}
.state {
  padding: var(--space-8);
  color: var(--color-text-tertiary);
  text-align: center;
}
.calendar-metrics {
  display: flex;
  grid-column: 1 / -1;
  width: min(100%, 270px);
  margin: 12px auto 2px;
  padding: 3px;
  background: var(--color-surface);
  border-radius: var(--radius-pill);
}
.calendar-total {
  grid-column: 1 / -1;
  margin: 8px 4px 0;
  color: var(--color-text-tertiary);
  font-size: 11px;
  line-height: 18px;
}
.calendar-metrics button {
  flex: 1;
  min-height: 34px;
  color: var(--color-text-secondary);
  background: transparent;
  border: 0;
  border-radius: var(--radius-pill);
}
.calendar-metrics button.active {
  color: var(--color-primary-700);
  background: var(--color-primary-50);
  font-weight: 600;
}
.calendar {
  display: grid;
  padding: var(--space-3);
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.weekday {
  padding: 4px;
  color: var(--color-text-tertiary);
  font-size: 12px;
  text-align: center;
}
.day {
  display: grid;
  min-height: 64px;
  padding: 8px 3px 6px;
  align-content: start;
  justify-items: center;
  gap: 2px;
  color: var(--color-text-primary);
  text-align: center;
  background: var(--color-background);
  border: 1px solid transparent;
  border-radius: 8px;
}
.day--empty {
  background: transparent;
}
.day--selected {
  border-color: var(--color-primary-500);
  background: var(--color-primary-50);
}
.day strong {
  font-size: 13px;
  line-height: 19px;
}
.day small {
  overflow: hidden;
  font-size: 9px;
  white-space: nowrap;
}
.expense {
  color: var(--color-expense);
}
.income {
  color: var(--color-income);
}
</style>
