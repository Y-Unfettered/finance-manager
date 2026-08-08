<script setup lang="ts">
import {
  CalendarDays,
  ChartNoAxesColumn,
  ChevronLeft,
  ChevronRight,
  Menu,
  MoreHorizontal,
  Pencil,
  Trash2,
  WalletCards,
  X,
} from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import AppBottomSheet from '@/components/AppBottomSheet.vue'
import AppIconButton from '@/components/AppIconButton.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import DailyLedgerCard from '@/components/DailyLedgerCard.vue'
import MoneyText from '@/components/MoneyText.vue'
import RecentSummaryCard from '@/components/RecentSummaryCard.vue'
import SideDrawer from '@/components/SideDrawer.vue'
import TransactionDetailSheet from '@/components/TransactionDetailSheet.vue'
import type { LedgerListItem } from '@/db/repositories/dashboard-repository'
import type { BudgetWithProgress } from '@/domain/entities'
import {
  useFinanceService,
  type HomeSnapshot,
  type RecentSummary,
} from '@/features/finance/finance-service'
import { useBudgetService } from '@/features/budget/budget-service'
import { currentMonthPeriodKey } from '@/features/budget/budget-service'
import { useAppStore } from '@/stores/app'
import {
  useHomePreferencesService,
  type HomePreferences,
} from '@/features/preferences/home-preferences-service'

interface DailyGroup {
  key: string
  label: string
  incomeMinor: number
  expenseMinor: number
  items: LedgerListItem[]
}

const router = useRouter()
const appStore = useAppStore()
const finance = useFinanceService()
const budgetService = useBudgetService()
const homePreferencesService = useHomePreferencesService()
const currentMonth = ref(periodKeyToDate(appStore.selectedHomePeriod))
const snapshot = ref<HomeSnapshot>()
const budget = ref<BudgetWithProgress>()
const recentSummary = ref<RecentSummary>()
const homePreferences = ref<HomePreferences>({
  summaryDisplayType: 'income_expense',
  summaryRangeType: '7d',
  amountsHidden: false,
  rememberLastAccount: true,
  appearance: 'system',
})
const loading = ref(true)
const errorMessage = ref('')
const showDrawer = ref(false)
const showPeriod = ref(false)
const showTxDetail = ref(false)
const showSummarySettings = ref(false)
const activeTxId = ref<string>()
const selectedIds = ref<string[]>([])
const showBulkDelete = ref(false)
const showBulkEdit = ref(false)
const bulkDeleting = ref(false)
const bulkEditing = ref(false)
const bulkEditDate = ref('')
const bulkEditNote = ref('')
const selectionMode = computed(() => selectedIds.value.length > 0)

const monthTitle = computed(
  () => `${currentMonth.value.getFullYear()}-${pad(currentMonth.value.getMonth() + 1)}`,
)
const monthLabelShort = computed(
  () => `${currentMonth.value.getFullYear()}.${pad(currentMonth.value.getMonth() + 1)}`,
)
const dailyGroups = computed<DailyGroup[]>(() => {
  const groups = new Map<string, DailyGroup>()
  for (const item of snapshot.value?.transactions ?? []) {
    const date = new Date(item.occurredAt)
    const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        label: `${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${weekday(date)}`,
        incomeMinor: 0,
        expenseMinor: 0,
        items: [],
      }
      groups.set(key, group)
    }
    group.items.push(item)
    if (item.type === 'income') group.incomeMinor += item.amountMinor
    if (item.type === 'expense' || item.type === 'credit_purchase') {
      group.expenseMinor += item.amountMinor
    }
    if (item.type === 'refund') group.expenseMinor -= item.amountMinor
  }
  return [...groups.values()]
})
const budgetProgress = computed(() => {
  if (!budget.value) return { percent: 0, remainingMinor: 0, total: 0, over: false, has: false }
  const total = budget.value.totalLimitMinor
  const spent = budget.value.spentMinor
  const percent = total > 0 ? Math.min(100, (spent / total) * 100) : 0
  return {
    percent,
    remainingMinor: budget.value.remainingMinor,
    total,
    over: budget.value.overspent,
    has: true,
  }
})

async function loadHome(): Promise<void> {
  if (!finance || !appStore.ledgerId) {
    loading.value = false
    errorMessage.value =
      appStore.databaseStatus === 'error'
        ? `本地数据库启动失败：${appStore.databaseError ?? '未知错误'}`
        : '正在准备本地账本，请稍候…'
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    const periodKey = currentMonthPeriodKey(currentMonth.value)
    if (homePreferencesService) {
      homePreferences.value = await homePreferencesService.get(appStore.ledgerId)
    }
    const [homeSnapshot, budgetSnapshot] = await Promise.all([
      finance.loadHome(appStore.ledgerId, currentMonth.value),
      budgetService ? budgetService.getBudgetForPeriod(appStore.ledgerId, periodKey) : undefined,
    ])
    snapshot.value = homeSnapshot
    budget.value = budgetSnapshot
    recentSummary.value =
      homePreferences.value.summaryRangeType === 'hidden'
        ? undefined
        : await finance.loadRecentSummary(appStore.ledgerId, homePreferences.value.summaryRangeType)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

function openDrawer(): void {
  showDrawer.value = true
}

defineExpose({ openDrawer })

function shiftMonth(delta: number): void {
  const date = new Date(currentMonth.value)
  date.setMonth(date.getMonth() + delta)
  currentMonth.value = date
}

function pickToday(): void {
  const today = new Date()
  if (
    today.getFullYear() !== currentMonth.value.getFullYear() ||
    today.getMonth() !== currentMonth.value.getMonth()
  ) {
    currentMonth.value = today
  }
  showPeriod.value = false
}

function goBills(): void {
  void router.push({
    name: 'bills',
    query: { view: 'calendar', month: appStore.selectedHomePeriod },
  })
}
function goAssets(): void {
  void router.push({ name: 'accounts' })
}
function goMonthlyReport(): void {
  void router.push({ name: 'monthly-report', query: { month: appStore.selectedHomePeriod } })
}

async function saveSummaryPreferences(): Promise<void> {
  if (!homePreferencesService || !appStore.ledgerId) return
  await homePreferencesService.save(appStore.ledgerId, homePreferences.value)
  showSummarySettings.value = false
  await loadHome()
}

function goBudget(): void {
  void router.push({ name: 'budget' })
}

function openTransaction(tx: LedgerListItem): void {
  activeTxId.value = tx.id
  showTxDetail.value = true
}

function startSelection(tx: LedgerListItem): void {
  selectedIds.value = [tx.id]
  appStore.homeFabVisible = false
}

function toggleSelection(tx: LedgerListItem): void {
  selectedIds.value = selectedIds.value.includes(tx.id)
    ? selectedIds.value.filter((id) => id !== tx.id)
    : [...selectedIds.value, tx.id]
  if (!selectedIds.value.length) appStore.homeFabVisible = true
}

function cancelSelection(): void {
  selectedIds.value = []
  showBulkDelete.value = false
  showBulkEdit.value = false
  bulkEditDate.value = ''
  bulkEditNote.value = ''
  appStore.homeFabVisible = true
}

function editSelection(): void {
  const id = selectedIds.value[0]
  if (!id) return
  if (selectedIds.value.length === 1) {
    cancelSelection()
    void router.push({ name: 'new-expense', query: { edit: id } })
    return
  }
  showBulkEdit.value = true
}

async function applyBulkEdit(): Promise<void> {
  if (
    !finance ||
    !appStore.ledgerId ||
    bulkEditing.value ||
    (!bulkEditDate.value && !bulkEditNote.value.trim())
  )
    return
  bulkEditing.value = true
  try {
    const occurredAt = bulkEditDate.value
      ? new Date(`${bulkEditDate.value}T12:00:00`).toISOString()
      : undefined
    const note = bulkEditNote.value.trim() || undefined
    for (const transactionId of selectedIds.value) {
      await finance.editTransaction({
        ledgerId: appStore.ledgerId,
        transactionId,
        occurredAt,
        note,
      })
    }
    cancelSelection()
    await loadHome()
  } finally {
    bulkEditing.value = false
  }
}

async function deleteSelection(): Promise<void> {
  if (!finance || !appStore.ledgerId || bulkDeleting.value) return
  bulkDeleting.value = true
  try {
    for (const id of selectedIds.value) await finance.voidTransaction(appStore.ledgerId, id)
    cancelSelection()
    await loadHome()
  } finally {
    bulkDeleting.value = false
  }
}

function handleTxUpdated(): void {
  void loadHome()
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function weekday(date: Date): string {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()] ?? ''
}

function periodKeyToDate(periodKey: string): Date {
  const [year, month] = periodKey.split('-').map(Number)
  return new Date(year!, month! - 1, 1)
}

watch(currentMonth, (value) => {
  appStore.selectHomePeriod(currentMonthPeriodKey(value))
  void loadHome()
})

onMounted(loadHome)
</script>

<template>
  <main class="home-page" :class="{ 'home-page--amounts-hidden': homePreferences.amountsHidden }">
    <div class="home-topbar">
      <AppTopBar
        :title="monthTitle"
        :show-back="false"
        period-switchable
        variant="transparent"
        @select-period="showPeriod = true"
      >
        <template #left>
          <AppIconButton label="菜单" variant="on-dark" @click="openDrawer">
            <Menu :size="26" :stroke-width="2.4" aria-hidden="true" />
          </AppIconButton>
        </template>
        <template #right>
          <AppIconButton label="日历视图" variant="on-dark" @click="goBills">
            <CalendarDays :size="23" :stroke-width="2.3" aria-hidden="true" />
          </AppIconButton>
          <AppIconButton label="月报表" variant="on-dark" @click="goMonthlyReport">
            <ChartNoAxesColumn :size="23" :stroke-width="2.3" aria-hidden="true" />
          </AppIconButton>
          <AppIconButton label="资产管理" variant="on-dark" @click="goAssets">
            <WalletCards :size="23" :stroke-width="2.3" aria-hidden="true" />
          </AppIconButton>
        </template>
      </AppTopBar>
    </div>
    <section class="home-hero">
      <div class="home-hero__shade" />
      <div class="home-hero__summary">
        <div class="home-hero__expense">
          <span>月支出</span>
          <MoneyText :amount-minor="snapshot?.summary.expenseMinor ?? 0" />
        </div>
        <div class="home-hero__metrics">
          <div>
            <span>月收入</span>
            <MoneyText :amount-minor="snapshot?.summary.incomeMinor ?? 0" />
          </div>
          <div>
            <span>本月结余</span>
            <MoneyText :amount-minor="snapshot?.summary.balanceMinor ?? 0" />
          </div>
        </div>
      </div>
    </section>

    <div class="home-page__content">
      <BaseCard
        class="budget-card"
        :class="{ 'budget-card--over': budgetProgress.over }"
        @click="goBudget"
      >
        <div class="budget-card__header">
          <strong>预算 · {{ monthLabelShort }}</strong>
          <AppIconButton label="预算管理">
            <MoreHorizontal :size="22" :stroke-width="1.75" aria-hidden="true" />
          </AppIconButton>
        </div>
        <div class="budget-card__track">
          <span :style="{ width: `${budgetProgress.percent}%` }" />
        </div>
        <div class="budget-card__footer">
          <span v-if="budgetProgress.has">
            剩余：<b :class="{ 'budget-card--danger': budgetProgress.over }">
              ¥{{ (budgetProgress.remainingMinor / 100).toFixed(2) }}
            </b>
          </span>
          <span v-else>未设置预算，点击设置</span>
          <span v-if="budgetProgress.has">
            总额：¥{{ (budgetProgress.total / 100).toFixed(2) }} · 已用
            {{ budgetProgress.percent.toFixed(0) }}%
          </span>
        </div>
      </BaseCard>

      <RecentSummaryCard
        v-if="recentSummary"
        :summary="recentSummary"
        :display-type="homePreferences.summaryDisplayType"
        @settings="showSummarySettings = true"
      />

      <div v-if="loading" class="page-state">正在读取本地账本…</div>
      <div v-else-if="errorMessage" class="page-state page-state--error">
        <span>{{ errorMessage }}</span>
        <button type="button" @click="loadHome">重新加载</button>
      </div>
      <div v-else-if="dailyGroups.length === 0" class="empty-state">
        <CalendarDays :size="28" :stroke-width="1.5" aria-hidden="true" />
        <strong>本月还没有流水</strong>
        <span>点击下方绿色按钮，记下第一笔支出。</span>
      </div>
      <DailyLedgerCard
        v-for="group in dailyGroups"
        :key="group.key"
        :label="group.label"
        :income-minor="group.incomeMinor"
        :expense-minor="group.expenseMinor"
        :items="group.items"
        :selected-ids="selectedIds"
        :selection-mode="selectionMode"
        @select="openTransaction"
        @longpress="startSelection"
        @toggle="toggleSelection"
      />
    </div>

    <SideDrawer v-model:show="showDrawer" />

    <AppBottomSheet v-model:show="showPeriod" title="选择账期">
      <div class="period-picker">
        <div class="period-picker__toolbar">
          <button type="button" class="icon-button" aria-label="上个月" @click="shiftMonth(-1)">
            <ChevronLeft :size="22" :stroke-width="1.75" aria-hidden="true" />
          </button>
          <strong class="period-picker__current">{{ monthTitle }}</strong>
          <button type="button" class="icon-button" aria-label="下个月" @click="shiftMonth(1)">
            <ChevronRight :size="22" :stroke-width="1.75" aria-hidden="true" />
          </button>
        </div>
        <button type="button" class="primary-button" @click="pickToday">回到本月</button>
        <p class="sheet-note">切换账期后，首页月收支、结余与流水会按所选月份重新汇总。</p>
      </div>
    </AppBottomSheet>

    <TransactionDetailSheet
      :show="showTxDetail"
      :transaction-id="activeTxId"
      @update:show="showTxDetail = $event"
      @updated="handleTxUpdated"
    />

    <AppBottomSheet v-model:show="showSummarySettings" title="最近汇总设置">
      <form class="summary-settings" @submit.prevent="saveSummaryPreferences">
        <fieldset>
          <legend>显示类型</legend>
          <label
            ><input
              v-model="homePreferences.summaryDisplayType"
              type="radio"
              value="expense"
            />仅支出</label
          ><label
            ><input
              v-model="homePreferences.summaryDisplayType"
              type="radio"
              value="income_expense"
            />收入与支出</label
          >
        </fieldset>
        <fieldset>
          <legend>日期范围</legend>
          <label
            v-for="option in [
              { value: 'week', label: '本周' },
              { value: '7d', label: '最近 7 日' },
              { value: '15d', label: '最近 15 日' },
              { value: 'hidden', label: '不显示' },
            ]"
            :key="option.value"
            ><input
              v-model="homePreferences.summaryRangeType"
              type="radio"
              :value="option.value"
            />{{ option.label }}</label
          >
        </fieldset>
        <button class="primary-button" type="submit">保存</button>
      </form>
    </AppBottomSheet>

    <div v-if="selectionMode" class="bulk-actions" role="toolbar" aria-label="批量操作">
      <button type="button" @click="cancelSelection">
        <X :size="20" aria-hidden="true" /><span>取消</span>
      </button>
      <strong>已选 {{ selectedIds.length }} 笔</strong>
      <button type="button" @click="editSelection">
        <Pencil :size="19" aria-hidden="true" /><span>修改</span>
      </button>
      <button type="button" class="bulk-actions__danger" @click="showBulkDelete = true">
        <Trash2 :size="19" aria-hidden="true" /><span>删除</span>
      </button>
    </div>

    <AppBottomSheet v-model:show="showBulkDelete" title="批量删除">
      <div class="bulk-confirm">
        <p>确定删除选中的 {{ selectedIds.length }} 笔账目吗？删除后相关余额会同步回退。</p>
        <div>
          <button type="button" class="ghost-button" @click="showBulkDelete = false">取消</button>
          <button
            type="button"
            class="danger-button"
            :disabled="bulkDeleting"
            @click="deleteSelection"
          >
            {{ bulkDeleting ? '删除中…' : '确认删除' }}
          </button>
        </div>
      </div>
    </AppBottomSheet>

    <AppBottomSheet v-model:show="showBulkEdit" title="批量修改">
      <form class="bulk-edit" @submit.prevent="applyBulkEdit">
        <p>只会修改已填写的字段，留空的内容保持原样。</p>
        <label><span>统一日期</span><input v-model="bulkEditDate" type="date" /></label>
        <label
          ><span>统一备注</span
          ><input v-model="bulkEditNote" type="text" placeholder="留空则不修改"
        /></label>
        <button
          class="primary-button"
          type="submit"
          :disabled="bulkEditing || (!bulkEditDate && !bulkEditNote.trim())"
        >
          {{ bulkEditing ? '修改中…' : `修改 ${selectedIds.length} 笔` }}
        </button>
      </form>
    </AppBottomSheet>
  </main>
</template>

<style scoped>
.home-page {
  min-height: 100dvh;
  padding-bottom: calc(96px + env(safe-area-inset-bottom));
  background: var(--color-background);
}

.home-topbar {
  position: sticky;
  z-index: 30;
  top: 0;
  height: calc(var(--size-app-bar) + env(safe-area-inset-top));
  padding-top: env(safe-area-inset-top);
  margin-bottom: calc((var(--size-app-bar) + env(safe-area-inset-top)) * -1);
  background: linear-gradient(180deg, rgb(7 20 18 / 52%), rgb(7 20 18 / 12%));
  backdrop-filter: blur(4px);
}

.home-hero {
  position: relative;
  height: var(--size-home-hero);
  overflow: hidden;
  color: white;
  background: url('@/assets/home-hero-v1.png') center 48% / cover no-repeat;
}

.home-hero__shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgb(9 25 23 / 34%) 0%,
    rgb(7 25 22 / 26%) 40%,
    rgb(7 24 21 / 72%) 100%
  );
}

.home-hero__summary {
  position: relative;
}

.home-hero__summary {
  position: absolute;
  right: var(--page-gutter);
  bottom: var(--space-4);
  left: var(--page-gutter);
}

.home-hero__expense > span {
  display: block;
  color: rgb(255 255 255 / 92%);
  font-size: var(--type-label-size);
  font-weight: 600;
  line-height: var(--type-label-line);
}

.home-hero__expense :deep(.money-text) {
  display: block;
  margin-top: 2px;
  color: white;
  font-size: var(--type-money-hero-size);
  font-weight: 600;
  line-height: var(--type-money-hero-line);
}

.home-hero__metrics {
  display: flex;
  margin-top: var(--space-3);
  align-items: center;
  gap: var(--space-6);
}

.home-hero__metrics > div {
  display: inline-flex;
  min-width: 0;
  align-items: baseline;
  gap: var(--space-2);
}

.home-hero__metrics span {
  flex: 0 0 auto;
  color: rgb(255 255 255 / 92%);
  font-size: var(--type-label-size);
  font-weight: 600;
  line-height: var(--type-label-line);
}

.home-hero__metrics :deep(.money-text) {
  overflow: hidden;
  color: white;
  font-size: var(--type-list-primary-size);
  font-weight: 600;
  line-height: var(--type-list-primary-line);
  text-overflow: ellipsis;
}

.home-page__content {
  display: grid;
  max-width: 520px;
  padding: var(--space-3) var(--page-gutter) 0;
  margin: 0 auto;
  gap: var(--space-3);
}

.budget-card {
  padding: var(--space-3) var(--space-4);
  cursor: pointer;
  transition: transform var(--motion-short) var(--ease-standard);
}

.budget-card:active {
  transform: scale(0.99);
}

.budget-card__header,
.budget-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.budget-card__header {
  height: 32px;
}

.budget-card__header strong {
  font-size: var(--type-section-title-size);
  font-weight: 600;
}

.budget-card__track {
  height: 8px;
  margin: var(--space-3) 0;
  overflow: hidden;
  background: var(--color-primary-50);
  border-radius: var(--radius-pill);
}

.budget-card__track span {
  display: block;
  width: 0;
  height: 100%;
  background: var(--color-primary-500);
  transition: width var(--motion-standard) var(--ease-standard);
}

.budget-card--over .budget-card__track span {
  background: #c0392b;
}

.budget-card__footer {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: var(--type-caption-line);
}

.budget-card__footer b {
  color: var(--color-text-primary);
  font-weight: 600;
}

.budget-card--danger {
  color: #c0392b !important;
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
  line-height: var(--type-body-line);
  text-align: center;
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-card);
}

.page-state button {
  padding: var(--space-2) var(--space-4);
  color: var(--color-primary-700);
  background: var(--color-primary-50);
  border: 0;
  border-radius: var(--radius-pill);
}

.page-state--error {
  color: var(--color-expense);
}

.empty-state strong {
  color: var(--color-text-primary);
  font-size: var(--type-section-title-size);
}

.empty-state svg {
  color: var(--color-primary-500);
}

.period-picker {
  display: grid;
  gap: var(--space-4);
}

.period-picker__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.period-picker__current {
  font-size: var(--type-page-title-size);
  font-weight: 600;
}

.icon-button {
  display: grid;
  width: 44px;
  height: 44px;
  padding: 0;
  place-items: center;
  color: var(--color-text-primary);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-pill);
}

.primary-button {
  height: 48px;
  color: white;
  font-weight: 600;
  background: var(--color-primary-600);
  border: 0;
  border-radius: var(--radius-control);
}

.sheet-note {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
  line-height: var(--type-caption-line);
  text-align: center;
}
.summary-settings {
  display: grid;
  gap: var(--space-4);
}
.summary-settings fieldset {
  display: grid;
  padding: 0;
  gap: var(--space-2);
  border: 0;
}
.summary-settings legend {
  margin-bottom: var(--space-2);
  font-weight: 600;
}
.summary-settings label {
  display: flex;
  min-height: 40px;
  align-items: center;
  gap: var(--space-2);
}
.bulk-actions {
  position: fixed;
  z-index: 45;
  right: 12px;
  bottom: calc(12px + env(safe-area-inset-bottom));
  left: 12px;
  display: grid;
  min-height: 62px;
  padding: 7px 10px;
  grid-template-columns: 54px 1fr 54px 54px;
  align-items: center;
  gap: 4px;
  color: var(--color-text-primary);
  background: rgb(255 255 255 / 96%);
  border: 1px solid rgb(23 33 30 / 8%);
  border-radius: 20px;
  box-shadow: 0 10px 32px rgb(20 32 28 / 18%);
  backdrop-filter: blur(16px);
}
.bulk-actions button {
  display: grid;
  min-height: 48px;
  place-items: center;
  gap: 1px;
  color: var(--color-text-secondary);
  font-size: 10px;
  background: transparent;
  border: 0;
}
.bulk-actions button:disabled {
  opacity: 0.35;
}
.bulk-actions strong {
  font-size: 14px;
  text-align: center;
}
.bulk-actions .bulk-actions__danger {
  color: var(--color-danger);
}
.bulk-confirm {
  display: grid;
  gap: 20px;
}
.bulk-confirm p {
  margin: 0;
  color: var(--color-text-secondary);
  line-height: 1.65;
}
.bulk-confirm > div {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.bulk-edit {
  display: grid;
  gap: 14px;
}
.bulk-edit p {
  margin: 0 0 2px;
  color: var(--color-text-tertiary);
  font-size: 12px;
}
.bulk-edit label {
  display: grid;
  gap: 7px;
  color: var(--color-text-secondary);
  font-size: 13px;
}
.bulk-edit input {
  width: 100%;
  height: 46px;
  padding: 0 12px;
  color: var(--color-text-primary);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: 12px;
}
.bulk-edit .primary-button:disabled {
  opacity: 0.4;
}
.ghost-button,
.danger-button {
  height: 46px;
  font-weight: 600;
  border-radius: 12px;
}
.ghost-button {
  color: var(--color-text-primary);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
}
.danger-button {
  color: white;
  background: var(--color-danger);
  border: 0;
}
.home-page--amounts-hidden :deep(.money-text),
.home-page--amounts-hidden :deep(.recent-summary-card__amount) {
  filter: blur(7px);
  user-select: none;
}
</style>
