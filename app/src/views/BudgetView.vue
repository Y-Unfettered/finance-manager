<script setup lang="ts">
import { AlertTriangle, Pencil, Plus, Trash2 } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'

import AppBottomSheet from '@/components/AppBottomSheet.vue'
import AppIconButton from '@/components/AppIconButton.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import MoneyText from '@/components/MoneyText.vue'
import type { BudgetRecord, CategoryBudgetProgress } from '@/domain/entities'
import { parseCnyInputToMinor } from '@/domain/money'
import { useFinanceService } from '@/features/finance/finance-service'
import { useBudgetService, currentMonthPeriodKey } from '@/features/budget/budget-service'
import { useAppStore } from '@/stores/app'

interface CategoryOption {
  id: string
  name: string
}

interface BudgetListVM {
  record: BudgetRecord
  spentMinor: number
  remainingMinor: number
  overspent: boolean
  percent: number
}

interface BudgetDetailVM extends BudgetListVM {
  categoryProgress: readonly CategoryBudgetProgress[]
}

interface CategoryBudgetDraft {
  categoryId: string
  limitMinor: number
}

const appStore = useAppStore()
const finance = useFinanceService()
const budgetService = useBudgetService()

const budgets = ref<BudgetListVM[]>([])
const categories = ref<CategoryOption[]>([])
const detail = ref<BudgetDetailVM>()
const loading = ref(true)
const errorMessage = ref('')
const saving = ref(false)
const showEditor = ref(false)
const showDetail = ref(false)
const showDelete = ref(false)
const editingId = ref<string | null>(null)
const form = ref(defaultForm())

function defaultForm() {
  return {
    periodKey: currentMonthPeriodKey(),
    totalLimit: '',
    note: '',
    categoryBudgets: [] as CategoryBudgetDraft[],
  }
}

const expenseCategories = computed(() =>
  [...categories.value].sort((a, b) => a.name.localeCompare(b.name, 'zh')),
)

async function load(): Promise<void> {
  if (!budgetService || !appStore.ledgerId) {
    loading.value = false
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    const [list, expenseCats] = await Promise.all([
      budgetService.listBudgets(appStore.ledgerId),
      finance ? finance.listExpenseCategories(appStore.ledgerId) : Promise.resolve([]),
    ])
    categories.value = expenseCats.map((c) => ({ id: c.id, name: c.name }))
    const vms: BudgetListVM[] = await Promise.all(
      list.map(async (record) => {
        const summary = await budgetService!.getBudgetDetail(record.id)
        const spent = summary?.spentMinor ?? 0
        const remaining = summary?.remainingMinor ?? record.totalLimitMinor
        return {
          record,
          spentMinor: spent,
          remainingMinor: remaining,
          overspent: summary?.overspent ?? false,
          percent:
            record.totalLimitMinor > 0 ? Math.min(100, (spent / record.totalLimitMinor) * 100) : 0,
        }
      }),
    )
    budgets.value = vms
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

function openCreate(): void {
  editingId.value = null
  form.value = defaultForm()
  showEditor.value = true
}

function openEdit(item: BudgetListVM): void {
  editingId.value = item.record.id
  loadBudgetDetailIntoForm(item.record.id)
  showEditor.value = true
}

async function loadBudgetDetailIntoForm(budgetId: string): Promise<void> {
  if (!budgetService) return
  try {
    const summary = await budgetService.getBudgetDetail(budgetId)
    if (!summary) return
    form.value = {
      periodKey: summary.budget.periodKey,
      totalLimit: (summary.budget.totalLimitMinor / 100).toFixed(2),
      note: summary.budget.note ?? '',
      categoryBudgets: summary.categoryProgress.map((c) => ({
        categoryId: c.categoryId,
        limitMinor: c.limitMinor,
      })),
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  }
}

function addCategoryLimit(categoryId: string): void {
  if (!categoryId) return
  if (form.value.categoryBudgets.some((c) => c.categoryId === categoryId)) return
  form.value.categoryBudgets.push({ categoryId, limitMinor: 0 })
}

function removeCategoryLimit(categoryId: string): void {
  form.value.categoryBudgets = form.value.categoryBudgets.filter((c) => c.categoryId !== categoryId)
}

function categoryLimitInput(categoryId: string, value: string): void {
  const cb = form.value.categoryBudgets.find((c) => c.categoryId === categoryId)
  if (!cb) return
  try {
    cb.limitMinor = value.trim() === '' ? 0 : parseCnyInputToMinor(value)
  } catch {
    // 忽略无效输入
  }
}

function categoryName(categoryId: string): string {
  return categories.value.find((c) => c.id === categoryId)?.name ?? '未知分类'
}

function categoryLimitInputValue(categoryId: string): string {
  const cb = form.value.categoryBudgets.find((c) => c.categoryId === categoryId)
  if (!cb || cb.limitMinor === 0) return ''
  return (cb.limitMinor / 100).toFixed(2)
}

async function submit(): Promise<void> {
  if (!budgetService || !appStore.ledgerId || saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    const totalLimit = parseCnyInputToMinor(form.value.totalLimit || '0')
    if (editingId.value) {
      await budgetService.updateBudget({
        ledgerId: appStore.ledgerId,
        budgetId: editingId.value,
        totalLimitMinor: totalLimit,
        note: form.value.note,
        categoryBudgets: form.value.categoryBudgets,
      })
    } else {
      await budgetService.createBudget({
        ledgerId: appStore.ledgerId,
        periodKey: form.value.periodKey,
        totalLimitMinor: totalLimit,
        note: form.value.note,
        categoryBudgets: form.value.categoryBudgets,
      })
    }
    showEditor.value = false
    await load()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

async function openDetail(item: BudgetListVM): Promise<void> {
  if (!budgetService) return
  try {
    const summary = await budgetService.getBudgetDetail(item.record.id)
    if (!summary) return
    detail.value = {
      ...item,
      categoryProgress: summary.categoryProgress,
    }
    showDetail.value = true
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  }
}

function openDelete(item: BudgetListVM): void {
  detail.value = {
    ...item,
    categoryProgress: [],
  }
  showDetail.value = false
  showDelete.value = true
}

async function confirmDelete(): Promise<void> {
  if (!budgetService || !appStore.ledgerId || !detail.value || saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await budgetService.deleteBudget(appStore.ledgerId, detail.value.record.id)
    showDelete.value = false
    await load()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <main class="budget-page">
    <div class="budget-page__safe-top">
      <AppTopBar title="预算管理">
        <template #right>
          <AppIconButton label="新增预算" @click="openCreate">
            <Plus :size="22" :stroke-width="1.75" aria-hidden="true" />
          </AppIconButton>
        </template>
      </AppTopBar>
    </div>

    <div class="budget-page__content">
      <div v-if="loading" class="page-state">正在加载预算…</div>
      <div v-else-if="errorMessage" class="page-state page-state--error">
        <span>{{ errorMessage }}</span>
        <button type="button" @click="load">重新加载</button>
      </div>
      <div v-else-if="budgets.length === 0" class="empty-state">
        <Plus :size="28" :stroke-width="1.5" aria-hidden="true" />
        <strong>尚未设置预算</strong>
        <span>点击右上角加号，为本月设定预算上限。</span>
      </div>

      <BaseCard v-for="item in budgets" :key="item.record.id" class="budget-item" variant="summary">
        <div class="budget-item__header">
          <strong>{{ item.record.periodKey }} 预算</strong>
          <div class="budget-item__actions">
            <AppIconButton label="编辑" @click="openEdit(item)">
              <Pencil :size="18" :stroke-width="1.75" aria-hidden="true" />
            </AppIconButton>
            <AppIconButton label="删除" @click="openDelete(item)">
              <Trash2 :size="18" :stroke-width="1.75" aria-hidden="true" />
            </AppIconButton>
          </div>
        </div>
        <div class="budget-item__track">
          <span
            :class="{ 'budget-item__track-bar--overspent': item.overspent }"
            :style="{ width: `${item.percent}%` }"
          />
        </div>
        <div class="budget-item__summary">
          <div>
            <span>已支出</span>
            <MoneyText :amount-minor="item.spentMinor" />
          </div>
          <div>
            <span>剩余</span>
            <MoneyText :amount-minor="item.remainingMinor" />
          </div>
          <div>
            <span>总额</span>
            <MoneyText :amount-minor="item.record.totalLimitMinor" />
          </div>
        </div>
        <button v-if="item.record.note" type="button" class="budget-item__note">
          {{ item.record.note }}
        </button>
        <button type="button" class="budget-item__detail" @click="openDetail(item)">
          查看分类明细
        </button>
      </BaseCard>
    </div>

    <AppBottomSheet v-model:show="showEditor" :title="editingId ? '编辑预算' : '新建预算'">
      <form class="form" @submit.prevent="submit">
        <label class="form-row">
          <span>期间 (YYYY-MM)</span>
          <input v-model="form.periodKey" type="month" :disabled="!!editingId" required />
        </label>
        <label class="form-row">
          <span>预算总额 (元)</span>
          <input
            v-model="form.totalLimit"
            type="text"
            inputmode="decimal"
            placeholder="0.00"
            required
          />
        </label>
        <label class="form-row">
          <span>备注</span>
          <input v-model="form.note" type="text" placeholder="可选" />
        </label>

        <div class="form-category">
          <div class="form-category__title">分类上限（可选）</div>
          <select
            class="form-category__select"
            @change="(e) => addCategoryLimit((e.target as HTMLSelectElement).value)"
          >
            <option value="">+ 添加分类</option>
            <option
              v-for="c in expenseCategories"
              :key="c.id"
              :value="c.id"
              :disabled="form.categoryBudgets.some((cb) => cb.categoryId === c.id)"
            >
              {{ c.name }}
            </option>
          </select>
          <div v-for="cb in form.categoryBudgets" :key="cb.categoryId" class="form-category__row">
            <span>{{ categoryName(cb.categoryId) }}</span>
            <input
              type="text"
              inputmode="decimal"
              placeholder="0.00"
              :value="categoryLimitInputValue(cb.categoryId)"
              @input="
                (e) => categoryLimitInput(cb.categoryId, (e.target as HTMLInputElement).value)
              "
            />
            <button type="button" @click="removeCategoryLimit(cb.categoryId)">移除</button>
          </div>
        </div>

        <div v-if="errorMessage" class="form-error">{{ errorMessage }}</div>

        <div class="form-actions">
          <button type="button" @click="showEditor = false">取消</button>
          <button type="submit" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</button>
        </div>
      </form>
    </AppBottomSheet>

    <AppBottomSheet v-model:show="showDetail" title="分类预算明细">
      <div v-if="detail" class="detail-list">
        <div class="detail-list__summary">
          <span>总预算</span>
          <MoneyText :amount-minor="detail.record.totalLimitMinor" />
        </div>
        <div v-for="cp in detail.categoryProgress" :key="cp.categoryId" class="detail-row">
          <div class="detail-row__head">
            <strong>{{ cp.categoryName }}</strong>
            <span :class="{ 'detail-row__overspent': cp.overspent }">
              已支 <MoneyText :amount-minor="cp.spentMinor" /> / 上限
              <MoneyText :amount-minor="cp.limitMinor" />
            </span>
          </div>
          <div class="detail-row__track">
            <span
              :class="{ 'detail-row__track-bar--overspent': cp.overspent }"
              :style="{
                width: `${cp.limitMinor > 0 ? Math.min(100, (cp.spentMinor / cp.limitMinor) * 100) : 0}%`,
              }"
            />
          </div>
          <div v-if="cp.overspent" class="detail-row__warn">
            <AlertTriangle :size="14" :stroke-width="2" aria-hidden="true" />
            <span>已超出分类上限</span>
          </div>
        </div>
        <div v-if="detail.categoryProgress.length === 0" class="detail-empty">尚未设置分类上限</div>
      </div>
    </AppBottomSheet>

    <AppBottomSheet v-model:show="showDelete" title="删除预算">
      <div class="delete-confirm">
        <p>
          将删除
          <strong>{{ detail?.record.periodKey }}</strong>
          预算及其分类上限。已发生的交易不会被改动。确认删除？
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
.budget-page {
  min-height: 100dvh;
  padding-bottom: calc(var(--space-8) + env(safe-area-inset-bottom));
  background: var(--color-background);
}
.budget-page__safe-top {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}
.budget-page__content {
  display: grid;
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
.budget-item {
  display: grid;
  gap: var(--space-3);
}
.budget-item__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.budget-item__header strong {
  font-size: var(--type-section-title-size);
}
.budget-item__actions {
  display: flex;
  gap: var(--space-1);
}
.budget-item__track {
  height: 8px;
  overflow: hidden;
  background: var(--color-primary-50);
  border-radius: var(--radius-pill);
}
.budget-item__track span {
  display: block;
  height: 100%;
  background: var(--color-primary-500);
  transition: width 0.2s;
}
.budget-item__track-bar--overspent {
  background: var(--color-expense) !important;
}
.budget-item__summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
  font-size: var(--type-caption-size);
}
.budget-item__summary span {
  display: block;
  color: var(--color-text-tertiary);
  margin-bottom: 2px;
}
.budget-item__note {
  padding: var(--space-2) var(--space-3);
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
  text-align: left;
  background: var(--color-primary-50);
  border: 0;
  border-radius: var(--radius-sm);
}
.budget-item__detail {
  padding: var(--space-2);
  color: var(--color-primary-700);
  font-size: var(--type-caption-size);
  background: transparent;
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-pill);
}
.form {
  display: grid;
  gap: var(--space-3);
}
.form-row {
  display: grid;
  gap: 6px;
  font-size: var(--type-caption-size);
}
.form-row input {
  padding: var(--space-2) var(--space-3);
  font-size: var(--type-body-size);
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-sm);
}
.form-row input:disabled {
  background: var(--color-background);
  color: var(--color-text-tertiary);
}
.form-category {
  display: grid;
  gap: var(--space-2);
}
.form-category__title {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.form-category__select {
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-sm);
  font-size: var(--type-body-size);
}
.form-category__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px auto;
  gap: var(--space-2);
  align-items: center;
}
.form-category__row input {
  padding: var(--space-2) var(--space-3);
  text-align: right;
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-sm);
}
.form-category__row button {
  padding: var(--space-1) var(--space-2);
  color: var(--color-expense);
  background: transparent;
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-pill);
  font-size: var(--type-caption-size);
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
.detail-list {
  display: grid;
  gap: var(--space-3);
}
.detail-list__summary {
  display: flex;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  background: var(--color-primary-50);
  border-radius: var(--radius-sm);
  font-size: var(--type-caption-size);
}
.detail-row {
  display: grid;
  gap: var(--space-1);
}
.detail-row__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--type-caption-size);
}
.detail-row__overspent {
  color: var(--color-expense);
}
.detail-row__track {
  height: 6px;
  overflow: hidden;
  background: var(--color-primary-50);
  border-radius: var(--radius-pill);
}
.detail-row__track span {
  display: block;
  height: 100%;
  background: var(--color-primary-500);
}
.detail-row__track-bar--overspent {
  background: var(--color-expense) !important;
}
.detail-row__warn {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--color-expense);
  font-size: var(--type-caption-size);
}
.detail-empty {
  text-align: center;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  padding: var(--space-3);
}
.delete-confirm p {
  margin: 0 0 var(--space-3);
  color: var(--color-text-secondary);
  font-size: var(--type-body-size);
}
</style>
