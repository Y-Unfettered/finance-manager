<script setup lang="ts">
import { CalendarDays, ListFilter, Menu, MoreHorizontal } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppBottomSheet from '@/components/AppBottomSheet.vue'
import AppIconButton from '@/components/AppIconButton.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import DailyLedgerCard from '@/components/DailyLedgerCard.vue'
import MoneyText from '@/components/MoneyText.vue'
import type { LedgerListItem } from '@/db/repositories/dashboard-repository'
import { useFinanceService, type HomeSnapshot } from '@/features/finance/finance-service'
import { useAppStore } from '@/stores/app'

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
const currentMonth = ref(new Date())
const snapshot = ref<HomeSnapshot>()
const loading = ref(true)
const errorMessage = ref('')
const showPeriod = ref(false)
const showFilter = ref(false)

const monthTitle = computed(
  () =>
    snapshot.value?.monthLabel ??
    `${currentMonth.value.getFullYear()}年${currentMonth.value.getMonth() + 1}月`,
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
  }
  return [...groups.values()]
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
    snapshot.value = await finance.loadHome(appStore.ledgerId, currentMonth.value)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

function openFoundation(): void {
  void router.push({ name: 'foundation' })
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function weekday(date: Date): string {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()] ?? ''
}

onMounted(loadHome)
</script>

<template>
  <main class="home-page">
    <section class="home-hero">
      <div class="home-hero__shade" />
      <div class="home-hero__safe-top">
        <AppTopBar
          :title="monthTitle"
          :show-back="false"
          period-switchable
          variant="transparent"
          @select-period="showPeriod = true"
        >
          <template #left>
            <AppIconButton label="工程信息" variant="on-dark" @click="openFoundation">
              <Menu :size="24" :stroke-width="1.75" aria-hidden="true" />
            </AppIconButton>
          </template>
          <template #right>
            <AppIconButton label="筛选" variant="on-dark" @click="showFilter = true">
              <ListFilter :size="24" :stroke-width="1.75" aria-hidden="true" />
            </AppIconButton>
          </template>
        </AppTopBar>
      </div>

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
      <BaseCard class="budget-card">
        <div class="budget-card__header">
          <strong>预算</strong>
          <AppIconButton label="预算设置">
            <MoreHorizontal :size="22" :stroke-width="1.75" aria-hidden="true" />
          </AppIconButton>
        </div>
        <div class="budget-card__track"><span /></div>
        <div class="budget-card__footer"><span>剩余：--</span><span>总额：未设置</span></div>
      </BaseCard>

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
      />
    </div>

    <AppBottomSheet v-model:show="showPeriod" title="选择账期">
      <p class="sheet-note">当前版本先展示本月数据，月份切换将在下一轮完善。</p>
    </AppBottomSheet>
    <AppBottomSheet v-model:show="showFilter" title="筛选流水">
      <p class="sheet-note">账户、分类和金额筛选将在流水管理版本开放。</p>
    </AppBottomSheet>
  </main>
</template>

<style scoped>
.home-page {
  min-height: 100dvh;
  padding-bottom: calc(var(--size-bottom-nav) + var(--space-6) + env(safe-area-inset-bottom));
  background: var(--color-background);
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

.home-hero__safe-top,
.home-hero__summary {
  position: relative;
}

.home-hero__safe-top {
  padding-top: env(safe-area-inset-top);
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
}

.budget-card__footer {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: var(--type-caption-line);
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

.sheet-note {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--type-body-size);
  line-height: var(--type-body-line);
}
</style>
