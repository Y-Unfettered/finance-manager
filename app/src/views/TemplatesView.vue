<script setup lang="ts">
import { CalendarClock, Check, Pencil, Plus, Repeat, Trash2 } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppBottomSheet from '@/components/AppBottomSheet.vue'
import AppIconButton from '@/components/AppIconButton.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import MoneyText from '@/components/MoneyText.vue'
import type {
  AccountBalanceRecord,
  RecurringFrequency,
  RecurringTransactionWithTemplate,
  TransactionTemplateType,
  TransactionTemplateWithRefs,
} from '@/domain/entities'
import { parseCnyInputToMinor } from '@/domain/money'
import {
  useFinanceService,
  type ExpenseCategoryOption,
  type IncomeCategoryOption,
} from '@/features/finance/finance-service'
import {
  useRecurringService,
  type CreateRecurringInput,
} from '@/features/recurring/recurring-service'
import { useTemplateService } from '@/features/templates/template-service'
import { useAppStore } from '@/stores/app'
import { navigateBack } from '@/router/navigation-transition'

const TEMPLATE_TYPE_LABELS: Record<TransactionTemplateType, string> = {
  expense: '支出',
  income: '收入',
  transfer: '转账',
  credit_purchase: '信用卡消费',
  repay_borrowing: '还款',
  loan_out: '借出',
  loan_recovery: '借出收回',
}

const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  daily: '每日',
  weekly: '每周',
  monthly: '每月',
}

interface TemplateFormState {
  name: string
  transactionType: TransactionTemplateType
  amount: string
  categoryId: string
  sourceAccountId: string
  targetAccountId: string
  merchant: string
  note: string
}

interface RecurringFormState {
  templateId: string
  frequency: RecurringFrequency
  intervalValue: string
  nextOccurrenceAt: string
  endDate: string
  enabled: boolean
}

const router = useRouter()
const appStore = useAppStore()
const finance = useFinanceService()
const templateService = useTemplateService()
const recurringService = useRecurringService()

const templates = ref<readonly TransactionTemplateWithRefs[]>([])
const recurring = ref<readonly RecurringTransactionWithTemplate[]>([])
const accounts = ref<AccountBalanceRecord[]>([])
const expenseCategories = ref<ExpenseCategoryOption[]>([])
const incomeCategories = ref<IncomeCategoryOption[]>([])
const loading = ref(true)
const errorMessage = ref('')
const saving = ref(false)

const showTemplateEditor = ref(false)
const editingTemplateId = ref<string | null>(null)
const templateForm = ref<TemplateFormState>(defaultTemplateForm())

const showRecurringEditor = ref(false)
const editingRecurringId = ref<string | null>(null)
const recurringForm = ref<RecurringFormState>(defaultRecurringForm())

const showTemplateDelete = ref(false)
const showRecurringDelete = ref(false)
const pendingTemplate = ref<TransactionTemplateWithRefs | null>(null)
const pendingRecurring = ref<RecurringTransactionWithTemplate | null>(null)

function defaultTemplateForm(): TemplateFormState {
  return {
    name: '',
    transactionType: 'expense',
    amount: '',
    categoryId: '',
    sourceAccountId: '',
    targetAccountId: '',
    merchant: '',
    note: '',
  }
}

function defaultRecurringForm(): RecurringFormState {
  return {
    templateId: '',
    frequency: 'monthly',
    intervalValue: '1',
    nextOccurrenceAt: localDateTimeValue(new Date()),
    endDate: '',
    enabled: true,
  }
}

const debitAccounts = computed(() => accounts.value.filter((a) => a.normalBalance === 'debit'))

const creditAccounts = computed(() => accounts.value.filter((a) => a.normalBalance === 'credit'))

const transferTargetAccounts = computed(() =>
  debitAccounts.value.filter((a) => a.id !== templateForm.value.sourceAccountId),
)

const needsCategory = computed(() =>
  ['expense', 'income', 'credit_purchase'].includes(templateForm.value.transactionType),
)

const needsSourceAccount = computed(() =>
  [
    'expense',
    'transfer',
    'credit_purchase',
    'repay_borrowing',
    'loan_out',
    'loan_recovery',
  ].includes(templateForm.value.transactionType),
)

const needsTargetAccount = computed(() =>
  ['transfer', 'income', 'repay_borrowing', 'loan_recovery'].includes(
    templateForm.value.transactionType,
  ),
)

const currentCategoryOptions = computed(() => {
  if (
    templateForm.value.transactionType === 'expense' ||
    templateForm.value.transactionType === 'credit_purchase'
  ) {
    return expenseCategories.value
  }
  if (templateForm.value.transactionType === 'income') {
    return incomeCategories.value
  }
  return []
})

const currentSourceAccounts = computed(() => {
  if (templateForm.value.transactionType === 'repay_borrowing') {
    return debitAccounts.value
  }
  if (templateForm.value.transactionType === 'credit_purchase') {
    return debitAccounts.value
  }
  return debitAccounts.value
})

const currentTargetAccounts = computed(() => {
  if (templateForm.value.transactionType === 'repay_borrowing') {
    return creditAccounts.value
  }
  if (templateForm.value.transactionType === 'income') {
    return debitAccounts.value
  }
  return transferTargetAccounts.value
})

async function load(): Promise<void> {
  if (!templateService || !appStore.ledgerId) {
    loading.value = false
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    const [tpls, recs, accts, expCats, incCats] = await Promise.all([
      templateService.listTemplates(appStore.ledgerId),
      recurringService ? recurringService.listRecurring(appStore.ledgerId) : Promise.resolve([]),
      finance ? finance.listAccounts(appStore.ledgerId) : Promise.resolve([]),
      finance ? finance.listExpenseCategories(appStore.ledgerId) : Promise.resolve([]),
      finance ? finance.listIncomeCategories(appStore.ledgerId) : Promise.resolve([]),
    ])
    templates.value = tpls
    recurring.value = recs
    accounts.value = accts
    expenseCategories.value = expCats
    incomeCategories.value = incCats
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

function openCreateTemplate(): void {
  editingTemplateId.value = null
  templateForm.value = defaultTemplateForm()
  errorMessage.value = ''
  showTemplateEditor.value = true
}

function openEditTemplate(item: TransactionTemplateWithRefs): void {
  editingTemplateId.value = item.id
  templateForm.value = {
    name: item.name,
    transactionType: item.transactionType,
    amount: (item.amountMinor / 100).toFixed(2),
    categoryId: item.categoryId ?? '',
    sourceAccountId: item.sourceAccountId ?? '',
    targetAccountId: item.targetAccountId ?? '',
    merchant: item.merchant ?? '',
    note: item.note ?? '',
  }
  errorMessage.value = ''
  showTemplateEditor.value = true
}

async function submitTemplate(): Promise<void> {
  if (!templateService || !appStore.ledgerId || saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    const amountMinor = parseCnyInputToMinor(templateForm.value.amount || '0')
    const name = templateForm.value.name
    const categoryId = templateForm.value.categoryId || undefined
    const sourceAccountId = templateForm.value.sourceAccountId || undefined
    const targetAccountId = templateForm.value.targetAccountId || undefined
    const merchant = templateForm.value.merchant || undefined
    const note = templateForm.value.note || undefined
    if (editingTemplateId.value) {
      await templateService.updateTemplate({
        ledgerId: appStore.ledgerId,
        templateId: editingTemplateId.value,
        name,
        amountMinor,
        categoryId,
        sourceAccountId,
        targetAccountId,
        merchant,
        note,
      })
    } else {
      await templateService.createTemplate({
        ledgerId: appStore.ledgerId,
        name,
        transactionType: templateForm.value.transactionType,
        amountMinor,
        categoryId,
        sourceAccountId,
        targetAccountId,
        merchant,
        note,
      })
    }
    showTemplateEditor.value = false
    await load()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

function openDeleteTemplate(item: TransactionTemplateWithRefs): void {
  pendingTemplate.value = item
  showTemplateDelete.value = true
}

async function confirmDeleteTemplate(): Promise<void> {
  if (!templateService || !appStore.ledgerId || !pendingTemplate.value || saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await templateService.deleteTemplate(appStore.ledgerId, pendingTemplate.value.id)
    showTemplateDelete.value = false
    pendingTemplate.value = null
    await load()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

function openCreateRecurring(): void {
  if (templates.value.length === 0) {
    errorMessage.value = '请先创建至少一个模板'
    return
  }
  editingRecurringId.value = null
  recurringForm.value = defaultRecurringForm()
  recurringForm.value.templateId = templates.value[0]?.id ?? ''
  errorMessage.value = ''
  showRecurringEditor.value = true
}

function openEditRecurring(item: RecurringTransactionWithTemplate): void {
  editingRecurringId.value = item.id
  recurringForm.value = {
    templateId: item.templateId,
    frequency: item.frequency,
    intervalValue: String(item.intervalValue),
    nextOccurrenceAt: localDateTimeValue(new Date(item.nextOccurrenceAt)),
    endDate: item.endDate ? item.endDate.slice(0, 10) : '',
    enabled: item.enabled,
  }
  errorMessage.value = ''
  showRecurringEditor.value = true
}

async function submitRecurring(): Promise<void> {
  if (!recurringService || !appStore.ledgerId || saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    const intervalValue = Number.parseInt(recurringForm.value.intervalValue || '1', 10)
    const nextOccurrenceAt = new Date(recurringForm.value.nextOccurrenceAt).toISOString()
    const endDate = recurringForm.value.endDate
      ? new Date(`${recurringForm.value.endDate}T00:00:00`).toISOString()
      : undefined
    if (editingRecurringId.value) {
      await recurringService.updateRecurring({
        ledgerId: appStore.ledgerId,
        recurringId: editingRecurringId.value,
        frequency: recurringForm.value.frequency,
        intervalValue,
        nextOccurrenceAt,
        endDate,
        enabled: recurringForm.value.enabled,
      })
    } else {
      const payload: CreateRecurringInput = {
        ledgerId: appStore.ledgerId,
        templateId: recurringForm.value.templateId,
        frequency: recurringForm.value.frequency,
        intervalValue,
        nextOccurrenceAt,
        endDate,
        enabled: recurringForm.value.enabled,
      }
      await recurringService.createRecurring(payload)
    }
    showRecurringEditor.value = false
    await load()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

function openDeleteRecurring(item: RecurringTransactionWithTemplate): void {
  pendingRecurring.value = item
  showRecurringDelete.value = true
}

async function confirmDeleteRecurring(): Promise<void> {
  if (!recurringService || !appStore.ledgerId || !pendingRecurring.value || saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await recurringService.deleteRecurring(appStore.ledgerId, pendingRecurring.value.id)
    showRecurringDelete.value = false
    pendingRecurring.value = null
    await load()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

async function toggleRecurringEnabled(item: RecurringTransactionWithTemplate): Promise<void> {
  if (!recurringService || !appStore.ledgerId || saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await recurringService.updateRecurring({
      ledgerId: appStore.ledgerId,
      recurringId: item.id,
      enabled: !item.enabled,
    })
    await load()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

function templateTypeLabel(type: TransactionTemplateType): string {
  return TEMPLATE_TYPE_LABELS[type] ?? type
}

function templateSummary(item: TransactionTemplateWithRefs): string {
  const parts: string[] = []
  if (item.sourceAccountName) parts.push(item.sourceAccountName)
  if (item.targetAccountName) parts.push(`→ ${item.targetAccountName}`)
  if (item.categoryName) parts.push(item.categoryName)
  return parts.join(' · ')
}

function frequencyLabel(item: RecurringTransactionWithTemplate): string {
  const interval = item.intervalValue > 1 ? `每 ${item.intervalValue} ` : ''
  return `${interval}${FREQUENCY_LABELS[item.frequency]}`
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

function localDateTimeValue(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return shifted.toISOString().slice(0, 16)
}

onMounted(load)
</script>

<template>
  <main class="templates-page">
    <div class="templates-page__safe-top">
      <AppTopBar title="模板与周期交易" @back="navigateBack(router, { name: 'settings' })" />
    </div>

    <div class="templates-page__content">
      <div v-if="loading" class="page-state">正在加载…</div>
      <div v-else-if="errorMessage" class="page-state page-state--error">
        <span>{{ errorMessage }}</span>
        <button type="button" @click="load">重新加载</button>
      </div>

      <section v-if="!loading" class="section">
        <div class="section__head">
          <h2>交易模板</h2>
          <AppIconButton label="新增模板" @click="openCreateTemplate">
            <Plus :size="22" :stroke-width="1.75" aria-hidden="true" />
          </AppIconButton>
        </div>
        <div v-if="templates.length === 0" class="empty-state">
          <Repeat :size="32" :stroke-width="1.5" aria-hidden="true" />
          <strong>还没有模板</strong>
          <span>常用记账可以保存为模板，一键复用。</span>
        </div>
        <BaseCard v-for="item in templates" :key="item.id" class="template-item" variant="compact">
          <div class="template-item__head">
            <strong>{{ item.name }}</strong>
            <span class="template-item__type">{{ templateTypeLabel(item.transactionType) }}</span>
          </div>
          <div class="template-item__amount">
            <MoneyText :amount-minor="item.amountMinor" />
          </div>
          <div v-if="templateSummary(item)" class="template-item__summary">
            {{ templateSummary(item) }}
          </div>
          <div v-if="item.merchant || item.note" class="template-item__meta">
            <span v-if="item.merchant">{{ item.merchant }}</span>
            <span v-if="item.note">{{ item.note }}</span>
          </div>
          <div class="template-item__actions">
            <AppIconButton label="编辑" @click="openEditTemplate(item)">
              <Pencil :size="18" :stroke-width="1.75" aria-hidden="true" />
            </AppIconButton>
            <AppIconButton label="删除" @click="openDeleteTemplate(item)">
              <Trash2 :size="18" :stroke-width="1.75" aria-hidden="true" />
            </AppIconButton>
          </div>
        </BaseCard>
      </section>

      <section v-if="!loading" class="section">
        <div class="section__head">
          <h2>周期交易</h2>
          <AppIconButton
            label="新增周期交易"
            :disabled="templates.length === 0"
            @click="openCreateRecurring"
          >
            <Plus :size="22" :stroke-width="1.75" aria-hidden="true" />
          </AppIconButton>
        </div>
        <p v-if="templates.length === 0" class="section-hint">先创建模板后才能添加周期交易。</p>
        <div v-else-if="recurring.length === 0" class="empty-state">
          <CalendarClock :size="32" :stroke-width="1.5" aria-hidden="true" />
          <strong>没有周期交易</strong>
          <span>设置后，到时间会提示你按模板入账。</span>
        </div>
        <BaseCard v-for="item in recurring" :key="item.id" class="recurring-item" variant="compact">
          <div class="recurring-item__head">
            <div class="recurring-item__title">
              <strong>{{ item.templateName }}</strong>
              <span class="recurring-item__freq">{{ frequencyLabel(item) }}</span>
            </div>
            <button
              type="button"
              class="recurring-item__toggle"
              :class="{ 'recurring-item__toggle--off': !item.enabled }"
              @click="toggleRecurringEnabled(item)"
            >
              <Check v-if="item.enabled" :size="14" :stroke-width="2.5" aria-hidden="true" />
            </button>
          </div>
          <div class="recurring-item__next">
            <span>下次执行</span>
            <strong>{{ formatDateTime(item.nextOccurrenceAt) }}</strong>
          </div>
          <div v-if="item.endDate" class="recurring-item__end">
            <span>结束日期</span>
            <strong>{{ item.endDate.slice(0, 10) }}</strong>
          </div>
          <div class="recurring-item__actions">
            <AppIconButton label="编辑" @click="openEditRecurring(item)">
              <Pencil :size="18" :stroke-width="1.75" aria-hidden="true" />
            </AppIconButton>
            <AppIconButton label="删除" @click="openDeleteRecurring(item)">
              <Trash2 :size="18" :stroke-width="1.75" aria-hidden="true" />
            </AppIconButton>
          </div>
        </BaseCard>
      </section>
    </div>

    <AppBottomSheet
      v-model:show="showTemplateEditor"
      :title="editingTemplateId ? '编辑模板' : '新建模板'"
    >
      <form class="form" @submit.prevent="submitTemplate">
        <label class="form-row">
          <span>模板名称</span>
          <input
            v-model="templateForm.name"
            type="text"
            required
            maxlength="30"
            placeholder="例如：午餐"
          />
        </label>
        <label class="form-row">
          <span>类型</span>
          <select v-model="templateForm.transactionType">
            <option v-for="(label, key) in TEMPLATE_TYPE_LABELS" :key="key" :value="key">
              {{ label }}
            </option>
          </select>
        </label>
        <label class="form-row">
          <span>金额</span>
          <input
            v-model="templateForm.amount"
            type="text"
            inputmode="decimal"
            placeholder="0.00"
            required
          />
        </label>
        <label v-if="needsCategory" class="form-row">
          <span>分类</span>
          <select v-model="templateForm.categoryId">
            <option value="">不指定分类</option>
            <option v-for="c in currentCategoryOptions" :key="c.id" :value="c.id">
              {{ c.name }}
            </option>
          </select>
        </label>
        <label v-if="needsSourceAccount" class="form-row">
          <span>付款 / 转出账户</span>
          <select v-model="templateForm.sourceAccountId">
            <option value="">请选择</option>
            <option v-for="a in currentSourceAccounts" :key="a.id" :value="a.id">
              {{ a.name }}
            </option>
          </select>
        </label>
        <label v-if="needsTargetAccount" class="form-row">
          <span>收款 / 转入账户</span>
          <select v-model="templateForm.targetAccountId">
            <option value="">请选择</option>
            <option v-for="a in currentTargetAccounts" :key="a.id" :value="a.id">
              {{ a.name }}
            </option>
          </select>
        </label>
        <label class="form-row">
          <span>商户（可选）</span>
          <input v-model="templateForm.merchant" type="text" maxlength="30" />
        </label>
        <label class="form-row">
          <span>备注（可选）</span>
          <textarea v-model="templateForm.note" rows="2" maxlength="120" />
        </label>
        <div v-if="errorMessage" class="form-error">{{ errorMessage }}</div>
        <div class="form-actions">
          <button type="button" @click="showTemplateEditor = false">取消</button>
          <button type="submit" :disabled="saving">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </form>
    </AppBottomSheet>

    <AppBottomSheet
      v-model:show="showRecurringEditor"
      :title="editingRecurringId ? '编辑周期交易' : '新建周期交易'"
    >
      <form class="form" @submit.prevent="submitRecurring">
        <label class="form-row">
          <span>使用模板</span>
          <select v-model="recurringForm.templateId" :disabled="!!editingRecurringId" required>
            <option value="" disabled>请选择模板</option>
            <option v-for="t in templates" :key="t.id" :value="t.id">
              {{ t.name }} · ¥{{ (t.amountMinor / 100).toFixed(2) }}
            </option>
          </select>
        </label>
        <label class="form-row">
          <span>频率</span>
          <select v-model="recurringForm.frequency">
            <option value="daily">每日</option>
            <option value="weekly">每周</option>
            <option value="monthly">每月</option>
          </select>
        </label>
        <label class="form-row">
          <span>间隔（每 N 个频率执行一次）</span>
          <input v-model="recurringForm.intervalValue" type="number" min="1" required />
        </label>
        <label class="form-row">
          <span>下次执行时间</span>
          <input v-model="recurringForm.nextOccurrenceAt" type="datetime-local" required />
        </label>
        <label class="form-row">
          <span>结束日期（可选）</span>
          <input v-model="recurringForm.endDate" type="date" />
        </label>
        <label class="form-row form-row--inline">
          <input v-model="recurringForm.enabled" type="checkbox" />
          <span>启用此周期交易</span>
        </label>
        <div v-if="errorMessage" class="form-error">{{ errorMessage }}</div>
        <div class="form-actions">
          <button type="button" @click="showRecurringEditor = false">取消</button>
          <button type="submit" :disabled="saving">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </form>
    </AppBottomSheet>

    <AppBottomSheet v-model:show="showTemplateDelete" title="删除模板">
      <div class="confirm-dialog">
        <p>
          将删除模板 <strong>{{ pendingTemplate?.name }}</strong
          >。基于此模板的周期交易会保留但失去关联，已发生的交易不受影响。确认删除？
        </p>
        <div class="form-actions">
          <button type="button" @click="showTemplateDelete = false">取消</button>
          <button type="button" class="danger" :disabled="saving" @click="confirmDeleteTemplate">
            删除
          </button>
        </div>
      </div>
    </AppBottomSheet>

    <AppBottomSheet v-model:show="showRecurringDelete" title="删除周期交易">
      <div class="confirm-dialog">
        <p>将删除此周期交易规则。已生成的交易不会被改动。确认删除？</p>
        <div class="form-actions">
          <button type="button" @click="showRecurringDelete = false">取消</button>
          <button type="button" class="danger" :disabled="saving" @click="confirmDeleteRecurring">
            删除
          </button>
        </div>
      </div>
    </AppBottomSheet>
  </main>
</template>

<style scoped>
.templates-page {
  min-height: 100dvh;
  padding-bottom: calc(var(--space-8) + env(safe-area-inset-bottom));
  background: var(--color-background);
}
.templates-page__safe-top {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}
.templates-page__content {
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
.section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}
.section__head h2 {
  margin: 0;
  font-size: var(--type-section-title-size);
}
.section-hint {
  margin: 0;
  padding: var(--space-3);
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  text-align: center;
  background: var(--color-surface);
  border: 1px dashed var(--color-divider);
  border-radius: var(--radius-card);
}
.template-item,
.recurring-item {
  display: grid;
  gap: var(--space-2);
}
.template-item__head,
.recurring-item__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.template-item__head strong,
.recurring-item__title strong {
  font-size: var(--type-body-size);
  font-weight: 600;
}
.template-item__type,
.recurring-item__freq {
  padding: 2px var(--space-2);
  color: var(--color-primary-700);
  font-size: var(--type-caption-size);
  background: var(--color-primary-50);
  border-radius: var(--radius-pill);
}
.template-item__amount {
  font-size: var(--type-section-title-size);
  font-weight: 600;
  color: var(--color-text-primary);
}
.template-item__summary,
.template-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.template-item__meta span {
  padding: 2px var(--space-2);
  background: var(--color-background);
  border-radius: var(--radius-sm);
}
.template-item__actions,
.recurring-item__actions {
  display: flex;
  gap: var(--space-1);
  justify-content: flex-end;
}
.recurring-item__title {
  display: grid;
  gap: 2px;
}
.recurring-item__next,
.recurring-item__end {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--type-caption-size);
}
.recurring-item__next span,
.recurring-item__end span {
  color: var(--color-text-tertiary);
}
.recurring-item__next strong,
.recurring-item__end strong {
  color: var(--color-text-primary);
  font-weight: 500;
}
.recurring-item__toggle {
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
.recurring-item__toggle--off {
  justify-content: flex-start;
  background: var(--color-divider);
}
.recurring-item__toggle::after {
  content: '';
  display: block;
  width: 18px;
  height: 18px;
  background: white;
  border-radius: 50%;
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
.form-row select,
.form-row textarea {
  padding: var(--space-2) var(--space-3);
  font-size: var(--type-body-size);
  color: var(--color-text-primary);
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-sm);
}
.form-row input:disabled,
.form-row select:disabled {
  background: var(--color-background);
  color: var(--color-text-tertiary);
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
