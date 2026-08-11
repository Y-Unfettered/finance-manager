<script setup lang="ts">
import { ChevronRight, Plus } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppBottomSheet from '@/components/AppBottomSheet.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import BudgetRing from '@/components/BudgetRing.vue'
import CategoryIcon from '@/components/CategoryIcon.vue'
import { useRefreshOnActivated } from '@/composables/useRefreshOnActivated'
import type { BudgetMode, BudgetWithProgress } from '@/domain/entities'
import { parseCnyInputToMinor } from '@/domain/money'
import { budgetRemainingRingPercent } from '@/features/budget/budget-presentation'
import { useBudgetService } from '@/features/budget/budget-service'
import { useFinanceService, type ExpenseCategoryOption } from '@/features/finance/finance-service'
import { useAppStore } from '@/stores/app'

interface CategoryDraft {
  categoryId: string
  limitMinor: number
}

const router = useRouter()
const appStore = useAppStore()
const budgets = useBudgetService()
const finance = useFinanceService()
const periodKey = computed(() => appStore.selectedHomePeriod)
const progress = ref<BudgetWithProgress>()
const categories = ref<ExpenseCategoryOption[]>([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const showEditor = ref(false)
const form = ref({
  mode: 'total_and_categories' as BudgetMode,
  total: '',
  autoCopy: true,
  scope: 'month' as 'month' | 'future',
  categories: [] as CategoryDraft[],
})
const rootCategories = computed(() => categories.value.filter((item) => !item.parentId))
const categoryTotal = computed(() =>
  form.value.categories.reduce((sum, item) => sum + item.limitMinor, 0),
)
const remainingPercent = computed(() => {
  const value = progress.value
  return value ? budgetRemainingRingPercent(value.totalLimitMinor, value.spentMinor) : 0
})

async function load(options: { silent?: boolean } = {}) {
  if (!budgets || !appStore.ledgerId) return
  if (!options.silent) loading.value = true
  error.value = ''
  try {
    const [budget, cats] = await Promise.all([
      budgets.getBudgetForPeriod(appStore.ledgerId, periodKey.value),
      finance ? finance.listExpenseCategories(appStore.ledgerId) : Promise.resolve([]),
    ])
    progress.value = budget
    categories.value = cats
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (!options.silent) loading.value = false
  }
}
function openEditor() {
  const value = progress.value
  form.value = value
    ? {
        mode: value.mode,
        total: (value.totalLimitMinor / 100).toFixed(2),
        autoCopy: value.autoCopy,
        scope: 'month',
        categories: value.categoryBudgets.map((item) => ({
          categoryId: item.categoryId,
          limitMinor: item.limitMinor,
        })),
      }
    : { mode: 'total_and_categories', total: '', autoCopy: true, scope: 'month', categories: [] }
  error.value = ''
  showEditor.value = true
}
function addCategory(id: string) {
  if (id && !form.value.categories.some((item) => item.categoryId === id))
    form.value.categories.push({ categoryId: id, limitMinor: 0 })
}
function removeCategory(id: string) {
  form.value.categories = form.value.categories.filter((item) => item.categoryId !== id)
}
function updateLimit(id: string, value: string) {
  const item = form.value.categories.find((row) => row.categoryId === id)
  if (!item) return
  try {
    item.limitMinor = value.trim() ? parseCnyInputToMinor(value) : 0
  } catch {
    item.limitMinor = 0
  }
}
function displayLimit(id: string) {
  const item = form.value.categories.find((row) => row.categoryId === id)
  return item?.limitMinor ? String(item.limitMinor / 100) : ''
}
function categoryName(id: string) {
  return categories.value.find((item) => item.id === id)?.name ?? '未知分类'
}
function categoryAppearance(id: string) {
  return categories.value.find((row) => row.id === id)
}
async function save() {
  if (!budgets || !appStore.ledgerId || saving.value) return
  saving.value = true
  error.value = ''
  try {
    const mode = form.value.mode
    const categoryBudgets = mode === 'total_only' ? [] : form.value.categories
    const total =
      mode === 'categories_only'
        ? categoryTotal.value
        : parseCnyInputToMinor(form.value.total || '0')
    if (progress.value) {
      await budgets.updateBudget({
        ledgerId: appStore.ledgerId,
        budgetId: progress.value.id,
        mode,
        totalLimitMinor: total,
        autoCopy: form.value.autoCopy,
        categoryBudgets,
        applyToFuture: form.value.scope === 'future',
      })
    } else {
      await budgets.createBudget({
        ledgerId: appStore.ledgerId,
        periodKey: periodKey.value,
        mode,
        totalLimitMinor: total,
        autoCopy: form.value.autoCopy,
        categoryBudgets,
      })
    }
    showEditor.value = false
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}
function goCategory(categoryId: string) {
  void router.push({ name: 'category-statistics', params: { categoryId } })
}
onMounted(load)
useRefreshOnActivated(() => load({ silent: true }))
</script>

<template>
  <main class="budget-page">
    <div class="safe-top">
      <AppTopBar title="预算管理" @back="router.back()" />
    </div>
    <div class="content">
      <div v-if="loading" class="state">正在加载预算…</div>
      <template v-else
        ><BaseCard v-if="progress" class="total-card" @click="openEditor"
          ><div>
            <strong>总预算</strong
            ><small
              >总额 ¥{{ (progress.totalLimitMinor / 100).toFixed(2) }} ｜ 支出 ¥{{
                (progress.spentMinor / 100).toFixed(2)
              }}</small
            ><span class="mode-tag">{{
              progress.mode === 'total_only'
                ? '只设置总预算'
                : progress.mode === 'categories_only'
                  ? '只设置分类预算'
                  : '总预算与分类预算'
            }}</span>
          </div>
          <BudgetRing
            :remaining-percent="remainingPercent"
            :overspent="progress.overspent"
            :size="108"
            :center-label="progress.overspent ? '超支' : '剩余'"
            :center-value="`¥${(Math.abs(progress.remainingMinor) / 100).toFixed(2)}`"
          /></BaseCard
        ><BaseCard v-else class="empty-card" @click="openEditor"
          ><strong>本月尚未设置预算</strong><span>点击设置总预算或一级分类预算</span></BaseCard
        ><BaseCard class="category-title" @click="openEditor"
          ><span
            ><strong>分类预算</strong
            ><small
              ><template v-if="progress"
                >¥{{ (progress.categoryBudgetTotalMinor / 100).toFixed(2) }}</template
              ><template v-else>未设置</template></small
            ></span
          ><span class="add-icon"><Plus :size="21" /></span></BaseCard
        ><button
          v-for="item in progress?.categoryBudgets ?? []"
          :key="item.categoryId"
          type="button"
          class="category-budget"
          @click="goCategory(item.categoryId)"
        >
          <CategoryIcon
            :icon-key="categoryAppearance(item.categoryId)?.iconKey"
            :color="categoryAppearance(item.categoryId)?.color"
            :label="item.categoryName"
            :size="46"
          /><span class="category-info"
            ><strong>{{ item.categoryName }}</strong
            ><small
              >总额 ¥{{ (item.limitMinor / 100).toFixed(2) }} ·
              {{ item.transactionCount }} 笔支出（¥{{ (item.spentMinor / 100).toFixed(2) }}）</small
            ></span
          ><BudgetRing
            :remaining-percent="budgetRemainingRingPercent(item.limitMinor, item.spentMinor)"
            :overspent="item.overspent"
            :size="58"
            :center-label="item.overspent ? '超支' : '剩余'"
            :center-value="`¥${(Math.abs(item.remainingMinor) / 100).toFixed(0)}`"
          /><ChevronRight :size="18" />
        </button>
        <p v-if="progress && progress.unallocatedBudgetMinor > 0" class="unallocated">
          未分配预算 ¥{{ (progress.unallocatedBudgetMinor / 100).toFixed(2) }}，分类外支出已使用 ¥{{
            (progress.unallocatedSpentMinor / 100).toFixed(2)
          }}
        </p>
        <p v-if="error" class="error">{{ error }}</p></template
      >
    </div>
    <AppBottomSheet v-model:show="showEditor" title="设置预算"
      ><form class="editor" @submit.prevent="save">
        <fieldset>
          <legend>预算模式</legend>
          <label
            v-for="option in [
              { value: 'total_and_categories', label: '总预算 + 分类预算' },
              { value: 'total_only', label: '只设置总预算' },
              { value: 'categories_only', label: '只设置分类预算' },
            ]"
            :key="option.value"
            ><input v-model="form.mode" type="radio" :value="option.value" /><span>{{
              option.label
            }}</span></label
          >
        </fieldset>
        <label v-if="form.mode !== 'categories_only'" class="field"
          ><span>总预算（元）</span
          ><input v-model="form.total" inputmode="decimal" placeholder="0.00" required
        /></label>
        <div v-else class="derived-total">
          总预算自动等于分类预算合计：¥{{ (categoryTotal / 100).toFixed(2) }}
        </div>
        <div v-if="form.mode !== 'total_only'" class="category-editor">
          <div class="category-editor__head">
            <strong>一级分类预算</strong
            ><select
              @change="
                addCategory(($event.target as HTMLSelectElement).value)
                ;($event.target as HTMLSelectElement).value = ''
              "
            >
              <option value="">+ 添加分类</option>
              <option
                v-for="item in rootCategories"
                :key="item.id"
                :value="item.id"
                :disabled="form.categories.some((row) => row.categoryId === item.id)"
              >
                {{ item.name }}
              </option>
            </select>
          </div>
          <label v-for="item in form.categories" :key="item.categoryId"
            ><span>{{ categoryName(item.categoryId) }}</span
            ><input
              :value="displayLimit(item.categoryId)"
              inputmode="decimal"
              placeholder="0.00"
              @input="updateLimit(item.categoryId, ($event.target as HTMLInputElement).value)"
            /><button type="button" @click="removeCategory(item.categoryId)">移除</button></label
          >
        </div>
        <label class="switch-row"
          ><span><strong>自动复制到下月</strong><small>新月份只复制配置，不复制支出</small></span
          ><input v-model="form.autoCopy" type="checkbox"
        /></label>
        <fieldset v-if="progress">
          <legend>应用范围</legend>
          <label><input v-model="form.scope" type="radio" value="month" /><span>仅本月</span></label
          ><label
            ><input v-model="form.scope" type="radio" value="future" /><span
              >本月及已有后续月份</span
            ></label
          >
        </fieldset>
        <p v-if="error" class="error">{{ error }}</p>
        <button class="save-button" type="submit" :disabled="saving">
          {{ saving ? '保存中…' : '保存预算' }}
        </button>
      </form></AppBottomSheet
    >
  </main>
</template>

<style scoped>
.budget-page {
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
  padding: var(--space-4) var(--page-gutter) calc(var(--space-8) + env(safe-area-inset-bottom));
  margin: auto;
  gap: var(--space-3);
}
.state,
.empty-card {
  padding: var(--space-8);
  color: var(--color-text-tertiary);
  text-align: center;
}
.empty-card {
  display: grid;
  gap: var(--space-2);
  border: 0;
}
.empty-card strong {
  color: var(--color-text-primary);
}
.total-card {
  display: grid;
  grid-template-columns: 1fr 116px;
  align-items: center;
  gap: var(--space-3);
  border: 0;
}
.total-card > div:first-child {
  display: grid;
  gap: 6px;
}
.total-card strong,
.category-title strong {
  font-size: var(--type-section-title-size);
}
.total-card small,
.category-title small,
.category-info small {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.mode-tag {
  width: max-content;
  padding: 4px 9px;
  color: var(--color-primary-700);
  font-size: 11px;
  background: var(--color-primary-50);
  border-radius: 999px;
}
.category-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 0;
}
.category-title > span:first-child {
  display: grid;
  gap: 3px;
}
.add-icon {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  color: var(--color-primary-600);
  background: var(--color-primary-50);
  border-radius: 50%;
}
.category-budget {
  display: grid;
  min-height: 88px;
  padding: var(--space-3);
  grid-template-columns: 48px 1fr 64px 18px;
  align-items: center;
  gap: var(--space-3);
  color: inherit;
  text-align: left;
  background: var(--color-surface);
  border: 0;
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
}
.category-avatar {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  font-weight: 700;
  border-radius: 50%;
}
.category-info {
  display: grid;
  gap: 4px;
}
.category-budget > svg {
  color: var(--color-text-tertiary);
}
.unallocated {
  margin: 0;
  padding: 0 var(--space-2);
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.editor {
  display: grid;
  gap: var(--space-4);
}
fieldset {
  display: grid;
  padding: 0;
  gap: var(--space-2);
  border: 0;
}
legend {
  margin-bottom: var(--space-2);
  font-weight: 600;
}
fieldset label {
  display: flex;
  min-height: 42px;
  align-items: center;
  gap: var(--space-2);
}
.field {
  display: grid;
  gap: var(--space-2);
}
.field > span {
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
}
.field input,
.category-editor input,
.category-editor select {
  height: 44px;
  padding: 0 var(--space-3);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
}
.derived-total {
  padding: var(--space-3);
  color: var(--color-primary-700);
  background: var(--color-primary-50);
  border-radius: var(--radius-control);
}
.category-editor {
  display: grid;
  gap: var(--space-2);
}
.category-editor__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.category-editor label {
  display: grid;
  grid-template-columns: 1fr 110px auto;
  align-items: center;
  gap: var(--space-2);
}
.category-editor label button {
  color: var(--color-expense);
  background: transparent;
  border: 0;
}
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.switch-row > span {
  display: grid;
}
.switch-row small {
  color: var(--color-text-tertiary);
}
.switch-row input {
  width: 22px;
  height: 22px;
}
.save-button {
  height: 48px;
  color: white;
  font-weight: 600;
  background: var(--color-primary-600);
  border: 0;
  border-radius: var(--radius-control);
}
.error {
  margin: 0;
  color: var(--color-danger);
  font-size: var(--type-caption-size);
}
</style>
