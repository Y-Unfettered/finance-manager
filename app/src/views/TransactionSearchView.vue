<script setup lang="ts">
import { ChevronDown, Filter, Search, X } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppSwitch from '@/components/AppSwitch.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import DatePicker from '@/components/DatePicker.vue'
import ListPickerSheet from '@/components/ListPickerSheet.vue'
import MoneyText from '@/components/MoneyText.vue'
import OptionSelector, { type OptionItem } from '@/components/OptionSelector.vue'
import SearchInput from '@/components/SearchInput.vue'
import TransactionDetailSheet from '@/components/TransactionDetailSheet.vue'
import { useRefreshOnActivated } from '@/composables/useRefreshOnActivated'
import type { AccountBalanceRecord } from '@/domain/entities'
import type { TransactionType } from '@/domain/accounting'
import { parseCnyInputToMinor } from '@/domain/money'
import {
  useFinanceService,
  type ExpenseCategoryOption,
  type IncomeCategoryOption,
} from '@/features/finance/finance-service'
import {
  useSearchService,
  type TransactionSearchFilter,
  type TransactionSearchResultItem,
} from '@/features/search/search-service'
import { useAppStore } from '@/stores/app'

interface FilterFormState {
  keyword: string
  startDate: string
  endDate: string
  accountId: string
  categoryId: string
  categoryKind: '' | 'expense' | 'income'
  type: '' | TransactionType
  minAmount: string
  maxAmount: string
  includeVoid: boolean
}

const TYPE_OPTIONS: OptionItem[] = [
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
  { value: 'transfer', label: '转账' },
  { value: 'credit_purchase', label: '信用卡消费' },
  { value: 'repay_borrowing', label: '还款' },
  { value: 'loan_out', label: '借出' },
  { value: 'loan_recovery', label: '借出收回' },
  { value: 'borrowing', label: '借入' },
  { value: 'repayment', label: '信用卡还款' },
  { value: 'refund', label: '退款' },
]

function typeLabel(type: TransactionType): string {
  return TYPE_OPTIONS.find((t) => t.value === type)?.label ?? type
}

const router = useRouter()
const appStore = useAppStore()
const finance = useFinanceService()
const searchService = useSearchService()

const accounts = ref<AccountBalanceRecord[]>([])
const expenseCategories = ref<ExpenseCategoryOption[]>([])
const incomeCategories = ref<IncomeCategoryOption[]>([])
const loading = ref(true)
const searching = ref(false)
const errorMessage = ref('')
const hasSearched = ref(false)
const results = ref<readonly TransactionSearchResultItem[]>([])
const activeTransactionId = ref<string>()
const showDetail = ref(false)

const showFilter = ref(true)
const form = ref<FilterFormState>(defaultForm())

const showStartDatePicker = ref(false)
const showEndDatePicker = ref(false)
const showAccountPicker = ref(false)
const showCategoryPicker = ref(false)

function defaultForm(): FilterFormState {
  return {
    keyword: '',
    startDate: '',
    endDate: '',
    accountId: '',
    categoryId: '',
    categoryKind: '',
    type: '',
    minAmount: '',
    maxAmount: '',
    includeVoid: false,
  }
}

const currentCategoryOptions = computed(() => {
  if (form.value.categoryKind === 'expense') return expenseCategories.value
  if (form.value.categoryKind === 'income') return incomeCategories.value
  return []
})

const resultCount = computed(() => results.value.length)
const groupedResults = computed(() => {
  const groups = new Map<string, TransactionSearchResultItem[]>()
  for (const item of results.value) {
    const date = new Date(item.occurredAt)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`
    const group = groups.get(key) ?? []
    group.push(item)
    groups.set(key, group)
  }
  return [...groups.entries()].map(([date, items]) => ({ date, items }))
})
const resultSummary = computed(() =>
  results.value.reduce(
    (summary, item) => {
      if (item.type === 'income') summary.income += item.amountMinor
      if (item.type === 'expense' || item.type === 'credit_purchase')
        summary.expense += item.amountMinor
      if (item.type === 'refund') summary.expense -= item.amountMinor
      return summary
    },
    { income: 0, expense: 0 },
  ),
)

async function loadOptions(): Promise<void> {
  if (!finance || !appStore.ledgerId) {
    loading.value = false
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    const [accts, expCats, incCats] = await Promise.all([
      finance.listAccounts(appStore.ledgerId),
      finance.listExpenseCategories(appStore.ledgerId),
      finance.listIncomeCategories(appStore.ledgerId),
    ])
    accounts.value = accts
    expenseCategories.value = expCats
    incomeCategories.value = incCats
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

async function runSearch(): Promise<void> {
  if (!searchService || !appStore.ledgerId || searching.value) return
  searching.value = true
  errorMessage.value = ''
  try {
    const filter: TransactionSearchFilter = {
      ledgerId: appStore.ledgerId,
      keyword: form.value.keyword.trim() || undefined,
      startUtc: form.value.startDate
        ? new Date(`${form.value.startDate}T00:00:00`).toISOString()
        : undefined,
      endUtc: form.value.endDate
        ? new Date(`${form.value.endDate}T23:59:59`).toISOString()
        : undefined,
      accountId: form.value.accountId || undefined,
      categoryId: form.value.categoryId || undefined,
      type: form.value.type || undefined,
      minAmountMinor: form.value.minAmount.trim()
        ? parseCnyInputToMinor(form.value.minAmount)
        : undefined,
      maxAmountMinor: form.value.maxAmount.trim()
        ? parseCnyInputToMinor(form.value.maxAmount)
        : undefined,
      includeVoid: form.value.includeVoid,
      limit: 200,
    }
    results.value = await searchService.searchTransactions(filter)
    hasSearched.value = true
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    searching.value = false
  }
}

function resetFilters(): void {
  form.value = defaultForm()
  results.value = []
  hasSearched.value = false
  errorMessage.value = ''
}

function onCategoryKindChange(): void {
  form.value.categoryId = ''
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

function signedAmount(item: TransactionSearchResultItem): number {
  const negativeTypes: TransactionType[] = [
    'expense',
    'credit_purchase',
    'loan_out',
    'repay_borrowing',
    'borrowing',
  ]
  return negativeTypes.includes(item.type) ? -item.amountMinor : item.amountMinor
}

function openDetail(item: TransactionSearchResultItem): void {
  activeTransactionId.value = item.id
  showDetail.value = true
}

onMounted(loadOptions)
useRefreshOnActivated(async () => {
  await loadOptions()
  if (hasSearched.value) await runSearch()
})
</script>

<template>
  <main class="search-page">
    <div class="search-page__safe-top">
      <AppTopBar title="流水搜索" @back="router.back()" />
    </div>

    <div class="search-page__content">
      <BaseCard class="filter-card" variant="compact">
        <button type="button" class="filter-card__toggle" @click="showFilter = !showFilter">
          <Filter :size="18" :stroke-width="1.75" aria-hidden="true" />
          <span>筛选条件</span>
          <ChevronDown
            :size="18"
            :stroke-width="1.75"
            aria-hidden="true"
            :class="{ 'filter-card__chevron--open': showFilter }"
          />
        </button>
        <form v-if="showFilter" class="filter-form" @submit.prevent="runSearch">
          <label class="form-row">
            <span>关键词</span>
            <SearchInput
              v-model="form.keyword"
              :maxlength="40"
              placeholder="商户、备注、对方"
            />
          </label>
          <div class="form-row form-row--double">
            <label class="form-field">
              <span>开始日期</span>
              <button type="button" class="form-field__trigger" @click="showStartDatePicker = true">
                <span>{{ form.startDate || '选择日期' }}</span>
                <ChevronDown :size="14" :stroke-width="2" aria-hidden="true" />
              </button>
            </label>
            <label class="form-field">
              <span>结束日期</span>
              <button type="button" class="form-field__trigger" @click="showEndDatePicker = true">
                <span>{{ form.endDate || '选择日期' }}</span>
                <ChevronDown :size="14" :stroke-width="2" aria-hidden="true" />
              </button>
            </label>
          </div>
          <label class="form-field">
            <span>账户</span>
            <button type="button" class="form-field__trigger" @click="showAccountPicker = true">
              <span>{{ form.accountId ? (accounts.find((a) => a.id === form.accountId)?.name ?? form.accountId) : '全部账户' }}</span>
              <ChevronDown :size="14" :stroke-width="2" aria-hidden="true" />
            </button>
          </label>
          <label class="form-field">
            <span>分类类型</span>
            <OptionSelector
              v-model="form.categoryKind"
              :options="[
                { value: 'expense', label: '支出分类' },
                { value: 'income', label: '收入分类' },
              ]"
              placeholder="不按分类筛选"
              @update:model-value="onCategoryKindChange"
            />
          </label>
          <label v-if="form.categoryKind" class="form-field">
            <span>分类</span>
            <button type="button" class="form-field__trigger" @click="showCategoryPicker = true">
              <span>{{ form.categoryId ? (currentCategoryOptions.find((c) => c.id === form.categoryId)?.name ?? form.categoryId) : `全部${form.categoryKind === 'expense' ? '支出' : '收入'}分类` }}</span>
              <ChevronDown :size="14" :stroke-width="2" aria-hidden="true" />
            </button>
          </label>
          <label class="form-field">
            <span>交易类型</span>
            <OptionSelector
              v-model="form.type"
              :options="TYPE_OPTIONS"
              placeholder="全部类型"
            />
          </label>
          <div class="form-row form-row--double">
            <label class="form-field">
              <span>最小金额</span>
              <input
                v-model="form.minAmount"
                type="text"
                inputmode="decimal"
                placeholder="0.00"
                class="form-field__input"
              />
            </label>
            <label class="form-field">
              <span>最大金额</span>
              <input
                v-model="form.maxAmount"
                type="text"
                inputmode="decimal"
                placeholder="0.00"
                class="form-field__input"
              />
            </label>
          </div>
          <AppSwitch
            v-model="form.includeVoid"
            label="包含已撤销交易"
            variant="inline"
          />
          <div v-if="errorMessage" class="form-error">{{ errorMessage }}</div>
          <div class="filter-actions">
            <button type="button" class="ghost" @click="resetFilters">
              <X :size="16" :stroke-width="2" aria-hidden="true" />清空
            </button>
            <button type="submit" class="primary" :disabled="searching || loading">
              <Search :size="16" :stroke-width="2" aria-hidden="true" />
              {{ searching ? '搜索中…' : '搜索' }}
            </button>
          </div>
        </form>
      </BaseCard>

      <div v-if="loading" class="page-state">正在加载账户与分类…</div>

      <section v-else-if="hasSearched" class="results">
        <div class="results__head">
          <span>共 {{ resultCount }} 条结果</span>
          <span
            >收入 ¥{{ (resultSummary.income / 100).toFixed(2) }} · 支出 ¥{{
              (resultSummary.expense / 100).toFixed(2)
            }}</span
          >
        </div>
        <div v-if="results.length === 0" class="empty-state">
          <Search :size="32" :stroke-width="1.5" aria-hidden="true" />
          <strong>没有匹配的流水</strong>
          <span>调整筛选条件后再试。</span>
        </div>
        <section v-for="group in groupedResults" :key="group.date" class="result-group">
          <h3 class="result-group__title">{{ group.date }}</h3>
          <BaseCard
            v-for="item in group.items"
            :key="item.id"
            class="result-item"
            variant="compact"
            @click="openDetail(item)"
          >
            <div class="result-item__head">
              <strong>{{
                item.merchant || item.counterparty || item.primaryAccountName || '未命名'
              }}</strong>
              <MoneyText :amount-minor="signedAmount(item)" />
            </div>
            <div class="result-item__meta">
              <span class="result-item__type">{{ typeLabel(item.type) }}</span>
              <span>{{ formatDateTime(item.occurredAt) }}</span>
              <span v-if="item.categoryName">{{ item.categoryName }}</span>
              <span v-if="item.primaryAccountName">{{ item.primaryAccountName }}</span>
            </div>
            <div v-if="item.note" class="result-item__note">{{ item.note }}</div>
          </BaseCard>
        </section>
      </section>

      <div v-else class="empty-state">
        <Search :size="32" :stroke-width="1.5" aria-hidden="true" />
        <strong>设置筛选条件开始搜索</strong>
        <span>支持按关键词、日期、账户、分类、金额等多维度筛选流水。</span>
      </div>
    </div>

    <DatePicker
      :show="showStartDatePicker"
      :initial-date="form.startDate"
      @update:show="showStartDatePicker = $event"
      @select="(date) => { form.startDate = date }"
    />
    <DatePicker
      :show="showEndDatePicker"
      :initial-date="form.endDate"
      @update:show="showEndDatePicker = $event"
      @select="(date) => { form.endDate = date }"
    />
    <ListPickerSheet
      :show="showAccountPicker"
      title="选择账户"
      :options="accounts.map((a) => ({ value: a.id, label: a.name }))"
      :model-value="form.accountId"
      @update:show="showAccountPicker = $event"
      @update:model-value="form.accountId = $event"
    />
    <ListPickerSheet
      :show="showCategoryPicker"
      :title="`选择${form.categoryKind === 'expense' ? '支出' : '收入'}分类`"
      :options="currentCategoryOptions.map((c) => ({ value: c.id, label: c.name }))"
      :model-value="form.categoryId"
      @update:show="showCategoryPicker = $event"
      @update:model-value="form.categoryId = $event"
    />

    <TransactionDetailSheet
      :show="showDetail"
      :transaction-id="activeTransactionId"
      @update:show="showDetail = $event"
      @updated="runSearch"
    />
  </main>
</template>

<style scoped>
.search-page {
  width: 100%;
  min-height: 100dvh;
  padding-bottom: calc(var(--space-8) + env(safe-area-inset-bottom));
  overflow-x: clip;
  background: var(--color-background);
}
.search-page__safe-top {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}
.search-page__content {
  display: grid;
  width: 100%;
  min-width: 0;
  max-width: 520px;
  padding: var(--space-3) var(--page-gutter) 0;
  margin: 0 auto;
  gap: var(--space-3);
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
.empty-state strong {
  color: var(--color-text-primary);
  font-size: var(--type-section-title-size);
}
.empty-state svg {
  color: var(--color-primary-500);
}
.filter-card {
  min-width: 0;
  padding: 0;
}
.filter-card__toggle {
  display: flex;
  width: 100%;
  height: 48px;
  padding: 0 var(--space-4);
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-primary);
  font-size: var(--type-body-size);
  font-weight: 600;
  background: transparent;
  border: 0;
}
.filter-card__toggle svg:first-child {
  color: var(--color-primary-600);
}
.filter-card__chevron--open {
  transform: rotate(180deg);
}
.filter-card__toggle :nth-child(3) {
  margin-left: auto;
  transition: transform var(--motion-fast) var(--ease-standard);
}
.filter-form {
  display: grid;
  min-width: 0;
  padding: 0 var(--space-4) var(--space-3);
  gap: var(--space-3);
  border-top: 1px solid var(--color-divider);
}

.form-field {
  display: grid;
  min-width: 0;
  gap: 6px;
  font-size: var(--type-caption-size);
  color: var(--color-text-secondary);
}

.form-field__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-width: 0;
  min-height: 40px;
  padding: var(--space-1) var(--space-3);
  font-size: var(--type-body-size);
  color: var(--color-text-primary);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: border-color var(--motion-fast) var(--ease-standard);
}

.form-field__trigger:active {
  border-color: var(--color-primary-500);
  background: var(--color-primary-50);
}

.form-field__input {
  width: 100%;
  min-width: 0;
  min-height: 40px;
  padding: var(--space-1) var(--space-3);
  font-size: var(--type-body-size);
  color: var(--color-text-primary);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
  outline: none;
  transition: border-color var(--motion-fast) var(--ease-standard);
}

.form-field__input:focus {
  border-color: var(--color-primary-500);
}

.form-field__input::placeholder {
  color: var(--color-text-tertiary);
}

.form-row--double {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}
.form-error {
  color: var(--color-expense);
  font-size: var(--type-caption-size);
}
.filter-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
.filter-actions button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: var(--space-2) var(--space-4);
  border: 0;
  border-radius: var(--radius-pill);
  font-size: var(--type-body-size);
}
.filter-actions .ghost {
  color: var(--color-text-secondary);
  background: transparent;
  border: 1px solid var(--color-divider);
}
.filter-actions .primary {
  color: white;
  background: var(--color-primary-600);
}
.filter-actions .primary:disabled {
  opacity: 0.5;
}
.results__head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  padding: var(--space-1) var(--space-2);
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.result-group {
  display: grid;
  gap: var(--space-2);
}
.result-group__title {
  margin: var(--space-2) var(--space-2) 0;
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
  font-weight: 600;
}
.result-item {
  display: grid;
  gap: var(--space-1);
}
.result-item__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.result-item__head strong {
  font-size: var(--type-body-size);
  font-weight: 600;
}
.result-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.result-item__type {
  padding: 1px var(--space-2);
  color: var(--color-primary-700);
  background: var(--color-primary-50);
  border-radius: var(--radius-pill);
}
.result-item__note {
  padding: var(--space-1) var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
  background: var(--color-background);
  border-radius: var(--radius-sm);
}
</style>
