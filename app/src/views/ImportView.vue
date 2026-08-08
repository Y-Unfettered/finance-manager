<script setup lang="ts">
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileText,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from '@lucide/vue'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import type { AccountRecord, CategoryRecord } from '@/domain/entities'
import { parseCsv } from '@/features/import/csv-parser'
import { useImportService } from '@/features/import/import-service'
import type {
  AccountNameMapping,
  CategoryNameMapping,
  CsvFieldMapping,
  ImportPlan,
  ImportResult,
  ImportSourceType,
  ImportSystemField,
  ResolvedImportRow,
} from '@/features/import/import-types'
import { detectSourceType, parseJson, parseXlsx } from '@/features/import/source-parser'
import { useAppStore } from '@/stores/app'
import { readFileAsArrayBuffer, readFileAsText } from '@/utils/file-io'

const router = useRouter()
const appStore = useAppStore()
const importService = useImportService()

type Step = 'select' | 'mapping' | 'preview' | 'done'

interface FieldOption {
  field: ImportSystemField
  label: string
  required: boolean
}

const BASE_FIELD_OPTIONS: readonly FieldOption[] = [
  { field: 'date', label: '日期', required: true },
  { field: 'amount', label: '金额', required: true },
  { field: 'type', label: '类型', required: false },
  { field: 'merchant', label: '商户', required: false },
  { field: 'note', label: '备注', required: false },
  { field: 'sourceAccount', label: '转出账户', required: false },
  { field: 'targetAccount', label: '转入账户', required: false },
  { field: 'category', label: '分类', required: false },
  { field: 'sourceTransactionId', label: '来源交易号', required: false },
]

const TIME_FIELD_OPTION: FieldOption = {
  field: 'time',
  label: '时间',
  required: false,
}

// 只有当表头中同时存在独立的"日期"列和"时间"列时，才显示"时间"字段
// 单列含完整日期时间（如钱迹"时间"列）应映射到 date，不显示 time 字段
const fieldOptions = computed<readonly FieldOption[]>(() => {
  const hasDateColumn = headers.value.some(
    (h) => h.includes('日期') || h.toLowerCase().includes('date'),
  )
  const hasTimeColumn = headers.value.some(
    (h) => h.includes('时间') || h.toLowerCase().includes('time'),
  )
  if (hasDateColumn && hasTimeColumn) {
    // 在 type 之后插入 time
    const result: FieldOption[] = []
    for (const opt of BASE_FIELD_OPTIONS) {
      result.push(opt)
      if (opt.field === 'type') result.push(TIME_FIELD_OPTION)
    }
    return result
  }
  return BASE_FIELD_OPTIONS
})

const STEPS: readonly { label: string }[] = [
  { label: '选择' },
  { label: '映射' },
  { label: '预览' },
  { label: '完成' },
]

const step = ref<Step>('select')
const fileName = ref('')
const sourceType = ref<ImportSourceType>('csv')
const headers = ref<string[]>([])
const rows = ref<string[][]>([])
const parseErrors = ref<string[]>([])
const fieldMapping = ref<Record<ImportSystemField, number>>(emptyMapping())
const accountMappings = ref<AccountNameMapping[]>([])
const categoryMappings = ref<CategoryNameMapping[]>([])
const accounts = ref<AccountRecord[]>([])
const categories = ref<CategoryRecord[]>([])
const plan = ref<ImportPlan>()
const result = ref<ImportResult>()
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')

const isReady = computed(() => Boolean(importService && appStore.ledgerId))

const stepIndex = computed(() => {
  const map: Record<Step, number> = { select: 1, mapping: 2, preview: 3, done: 4 }
  return map[step.value]
})

const expenseCategories = computed(() => categories.value.filter((c) => c.kind === 'expense'))
const incomeCategories = computed(() => categories.value.filter((c) => c.kind === 'income'))

const canPreview = computed(() => fieldMapping.value.date >= 0 && fieldMapping.value.amount >= 0)

const visibleErrors = computed(() => (plan.value?.errors ?? []).slice(0, 20))
const hiddenErrorCount = computed(() => Math.max((plan.value?.errors.length ?? 0) - 20, 0))
const previewRows = computed(() => (plan.value?.validRows ?? []).slice(0, 5))

function emptyMapping(): Record<ImportSystemField, number> {
  return {
    type: -1,
    amount: -1,
    date: -1,
    time: -1,
    merchant: -1,
    note: -1,
    sourceAccount: -1,
    targetAccount: -1,
    category: -1,
    sourceTransactionId: -1,
  }
}

function autoDetectMapping(headersList: string[]): Record<ImportSystemField, number> {
  const mapping = emptyMapping()
  // 先检测是否存在独立的"日期"列
  const hasDateColumn = headersList.some(
    (h) => h.includes('日期') || h.toLowerCase().includes('date'),
  )
  headersList.forEach((header, index) => {
    const lower = header.toLowerCase()
    // 日期：优先"日期"，无"日期"列时将"时间"也映射到 date（parseDate 支持完整日期时间）
    if (mapping.date < 0) {
      if (header.includes('日期') || lower.includes('date')) {
        mapping.date = index
        return
      }
      if (!hasDateColumn && (header.includes('时间') || lower.includes('time'))) {
        mapping.date = index
        return
      }
    }
    // 时间：仅当存在独立"日期"列时才映射
    if (mapping.time < 0 && hasDateColumn && (header.includes('时间') || lower.includes('time'))) {
      mapping.time = index
      return
    }
    if (mapping.amount < 0 && (header.includes('金额') || lower.includes('amount'))) {
      mapping.amount = index
      return
    }
    if (mapping.type < 0 && (header.includes('类型') || lower.includes('type'))) {
      mapping.type = index
      return
    }
    if (mapping.merchant < 0 && (header.includes('商户') || lower.includes('merchant'))) {
      mapping.merchant = index
      return
    }
    if (mapping.note < 0 && (header.includes('备注') || lower.includes('note'))) {
      mapping.note = index
      return
    }
    // 账户：账户1/转出/付款 → source，账户2/转入/收款 → target
    if (mapping.sourceAccount < 0 && isSourceAccountHeader(header, lower)) {
      mapping.sourceAccount = index
      return
    }
    if (mapping.targetAccount < 0 && isTargetAccountHeader(header, lower)) {
      mapping.targetAccount = index
      return
    }
    // 通用账户 → source（兜底）
    if (mapping.sourceAccount < 0 && (header.includes('账户') || lower.includes('account'))) {
      mapping.sourceAccount = index
      return
    }
    if (mapping.category < 0 && (header.includes('分类') || lower.includes('category'))) {
      mapping.category = index
      return
    }
    // 交易号/ID → sourceTransactionId（防重复导入）
    if (
      mapping.sourceTransactionId < 0 &&
      (lower === 'id' || header.includes('交易号') || lower.includes('transaction id'))
    ) {
      mapping.sourceTransactionId = index
      return
    }
  })
  return mapping
}

function isSourceAccountHeader(header: string, lower: string): boolean {
  return (
    header === '账户1' ||
    header.includes('转出账户') ||
    header.includes('付款账户') ||
    header.includes('转出') ||
    lower.includes('source account') ||
    lower.includes('from account')
  )
}

function isTargetAccountHeader(header: string, lower: string): boolean {
  return (
    header === '账户2' ||
    header.includes('转入账户') ||
    header.includes('收款账户') ||
    header.includes('转入') ||
    header.includes('收款') ||
    lower.includes('target account') ||
    lower.includes('to account')
  )
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !importService || !appStore.ledgerId) return
  loading.value = true
  errorMessage.value = ''
  try {
    const detected = detectSourceType(file.name)
    if (detected === 'other') {
      throw new Error('不支持的文件格式，请选择 CSV、Excel（.xlsx/.xls）或 JSON 文件')
    }
    let parsedHeaders: string[] = []
    let parsedRows: string[][] = []
    let parsedErrors: string[] = []
    if (detected === 'xlsx') {
      const buffer = await readFileAsArrayBuffer(file)
      const result = parseXlsx(buffer)
      parsedHeaders = result.headers
      parsedRows = result.rows
      parsedErrors = result.errors
    } else if (detected === 'json') {
      const text = await readFileAsText(file)
      const result = parseJson(text)
      parsedHeaders = result.headers
      parsedRows = result.rows
      parsedErrors = result.errors
    } else {
      const text = await readFileAsText(file)
      const result = parseCsv(text)
      parsedHeaders = result.headers
      parsedRows = result.rows
      parsedErrors = result.errors
    }
    if (parsedHeaders.length === 0) {
      throw new Error(parsedErrors[0] ?? '文件为空或无表头')
    }
    fileName.value = file.name
    sourceType.value = detected
    headers.value = parsedHeaders
    rows.value = parsedRows
    parseErrors.value = parsedErrors
    fieldMapping.value = autoDetectMapping(parsedHeaders)
    accountMappings.value = []
    categoryMappings.value = []
    plan.value = undefined
    result.value = undefined
    await loadMappingOptions()
    step.value = 'mapping'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

async function loadMappingOptions(): Promise<void> {
  if (!importService || !appStore.ledgerId) return
  const ledgerId = appStore.ledgerId
  const [accountList, categoryList] = await Promise.all([
    importService.listAccountsForMapping(ledgerId),
    importService.listCategoriesForMapping(ledgerId),
  ])
  accounts.value = accountList
  categories.value = categoryList
}

function addAccountMapping(): void {
  accountMappings.value.push({ rawName: '', accountId: '' })
}

function removeAccountMapping(index: number): void {
  accountMappings.value.splice(index, 1)
}

function addCategoryMapping(): void {
  categoryMappings.value.push({ rawName: '', categoryId: '' })
}

function removeCategoryMapping(index: number): void {
  categoryMappings.value.splice(index, 1)
}

function buildFieldMappings(): CsvFieldMapping[] {
  return (Object.keys(fieldMapping.value) as ImportSystemField[])
    .filter((field) => fieldMapping.value[field] >= 0)
    .map((field) => ({ systemField: field, columnIndex: fieldMapping.value[field] }))
}

function buildAccountMappings(): AccountNameMapping[] {
  return accountMappings.value
    .filter((m) => m.rawName.trim() !== '' && m.accountId !== '')
    .map((m) => ({ rawName: m.rawName, accountId: m.accountId }))
}

function buildCategoryMappings(): CategoryNameMapping[] {
  return categoryMappings.value
    .filter((m) => m.rawName.trim() !== '' && m.categoryId !== '')
    .map((m) => ({ rawName: m.rawName, categoryId: m.categoryId }))
}

async function goToPreview(): Promise<void> {
  if (!importService || !appStore.ledgerId || !canPreview.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const built = await importService.previewRows({
      ledgerId: appStore.ledgerId,
      fileName: fileName.value,
      source: sourceType.value,
      headers: headers.value,
      rows: rows.value,
      parseErrors: parseErrors.value,
      fieldMapping: buildFieldMappings(),
      accountMappings: buildAccountMappings(),
      categoryMappings: buildCategoryMappings(),
    })
    plan.value = built
    step.value = 'preview'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

async function confirmImport(): Promise<void> {
  if (!importService || !appStore.ledgerId || !plan.value || saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    const res = await importService.executeImport({
      ledgerId: appStore.ledgerId,
      plan: plan.value,
    })
    result.value = res
    step.value = 'done'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

function resetWizard(): void {
  step.value = 'select'
  fileName.value = ''
  sourceType.value = 'csv'
  headers.value = []
  rows.value = []
  parseErrors.value = []
  fieldMapping.value = emptyMapping()
  accountMappings.value = []
  categoryMappings.value = []
  plan.value = undefined
  result.value = undefined
  errorMessage.value = ''
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function kindLabel(row: ResolvedImportRow): string {
  if (row.raw.kind === 'expense') return '支出'
  if (row.raw.kind === 'income') return '收入'
  return '转账'
}

function accountTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    cash: '现金',
    bank: '银行卡',
    platform: '平台',
    credit_card: '信用卡',
    consumer_credit: '消费信贷',
    prepaid: '充值卡',
    investment: '投资',
    restricted_asset: '限定资产',
    other_liability: '其他负债',
  }
  return labels[type] ?? type
}

function goToBatches(): void {
  router.push({ name: 'import-batches' })
}
</script>

<template>
  <main class="import-page">
    <div class="import-page__safe-top">
      <AppTopBar title="导入账单" @back="router.back()" />
    </div>

    <div class="import-page__content">
      <ol class="stepper">
        <li
          v-for="(item, index) in STEPS"
          :key="item.label"
          class="stepper__item"
          :class="{
            'stepper__item--active': index + 1 === stepIndex,
            'stepper__item--done': index + 1 < stepIndex,
          }"
        >
          <span class="stepper__dot">{{ index + 1 }}</span>
          <span class="stepper__label">{{ item.label }}</span>
          <ChevronRight
            v-if="index < STEPS.length - 1"
            :size="14"
            :stroke-width="1.75"
            class="stepper__sep"
            aria-hidden="true"
          />
        </li>
      </ol>

      <div v-if="!isReady" class="page-state">数据未就绪，请先选择账本。</div>

      <template v-else>
        <!-- 步骤 1：选择文件 -->
        <template v-if="step === 'select'">
          <BaseCard class="hint-card">
            <div class="hint-card__title">
              <FileText :size="20" :stroke-width="1.75" />
              <span>选择账单文件</span>
            </div>
            <p class="hint-card__desc">
              支持 Excel（.xlsx/.xls）、CSV、JSON 三种格式，首行为表头。必填列：日期、金额。
            </p>
          </BaseCard>

          <label class="file-button" :class="{ 'file-button--loading': loading }">
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/json"
              hidden
              :disabled="loading"
              @change="onFileChange"
            />
            <Upload :size="18" :stroke-width="1.75" />
            <span>{{ loading ? '正在读取…' : '选择账单文件' }}</span>
          </label>

          <div v-if="errorMessage" class="page-state page-state--error">
            {{ errorMessage }}
          </div>
        </template>

        <!-- 步骤 2：字段与名称映射 -->
        <template v-else-if="step === 'mapping'">
          <BaseCard class="block-card">
            <h2 class="block-card__title">字段映射</h2>
            <p class="block-card__hint">为每个系统字段选择对应的列。</p>
            <div class="mapping-list">
              <div
                v-for="option in fieldOptions"
                :key="option.field"
                class="mapping-row mapping-row--field"
              >
                <span class="mapping-row__label">
                  {{ option.label }}
                  <em v-if="option.required" class="mapping-row__required">*</em>
                </span>
                <select v-model.number="fieldMapping[option.field]">
                  <option :value="-1">不导入</option>
                  <option v-for="(header, index) in headers" :key="index" :value="index">
                    {{ header }}
                  </option>
                </select>
              </div>
            </div>
          </BaseCard>

          <BaseCard class="block-card">
            <h2 class="block-card__title">账户映射</h2>
            <p class="block-card__hint">将 CSV 中的账户名映射到已有账户（可选）。</p>
            <div
              v-for="(mapping, index) in accountMappings"
              :key="index"
              class="mapping-row mapping-row--pair"
            >
              <input v-model="mapping.rawName" placeholder="CSV 中的账户名" maxlength="40" />
              <select v-model="mapping.accountId">
                <option value="" disabled>选择账户</option>
                <option v-for="account in accounts" :key="account.id" :value="account.id">
                  {{ account.name }}
                </option>
              </select>
              <button
                type="button"
                class="icon-button"
                aria-label="删除账户映射"
                @click="removeAccountMapping(index)"
              >
                <Trash2 :size="18" :stroke-width="1.75" />
              </button>
            </div>
            <button type="button" class="add-row-button" @click="addAccountMapping">
              <Plus :size="16" :stroke-width="1.75" />添加账户映射
            </button>
          </BaseCard>

          <BaseCard class="block-card">
            <h2 class="block-card__title">分类映射</h2>
            <p class="block-card__hint">将 CSV 中的分类名映射到已有分类（可选）。</p>
            <div
              v-for="(mapping, index) in categoryMappings"
              :key="index"
              class="mapping-row mapping-row--pair"
            >
              <input v-model="mapping.rawName" placeholder="CSV 中的分类名" maxlength="40" />
              <select v-model="mapping.categoryId">
                <option value="" disabled>选择分类</option>
                <optgroup v-if="expenseCategories.length" label="支出">
                  <option
                    v-for="category in expenseCategories"
                    :key="category.id"
                    :value="category.id"
                  >
                    {{ category.name }}
                  </option>
                </optgroup>
                <optgroup v-if="incomeCategories.length" label="收入">
                  <option
                    v-for="category in incomeCategories"
                    :key="category.id"
                    :value="category.id"
                  >
                    {{ category.name }}
                  </option>
                </optgroup>
              </select>
              <button
                type="button"
                class="icon-button"
                aria-label="删除分类映射"
                @click="removeCategoryMapping(index)"
              >
                <Trash2 :size="18" :stroke-width="1.75" />
              </button>
            </div>
            <button type="button" class="add-row-button" @click="addCategoryMapping">
              <Plus :size="16" :stroke-width="1.75" />添加分类映射
            </button>
          </BaseCard>

          <div v-if="errorMessage" class="page-state page-state--error">
            {{ errorMessage }}
          </div>

          <div class="actions">
            <button type="button" class="secondary-button" @click="resetWizard">返回</button>
            <button
              type="button"
              class="primary-button"
              :disabled="!canPreview || loading"
              @click="goToPreview"
            >
              {{ loading ? '正在预览…' : '下一步：预览' }}
            </button>
          </div>
        </template>

        <!-- 步骤 3：预览 -->
        <template v-else-if="step === 'preview'">
          <BaseCard v-if="plan" class="stats-card" variant="summary">
            <div class="stats-grid">
              <div class="stats-item">
                <strong>{{ plan.totalRows }}</strong>
                <small>总行数</small>
              </div>
              <div class="stats-item">
                <strong>{{ plan.validRows.length }}</strong>
                <small>有效行</small>
              </div>
              <div class="stats-item stats-item--error">
                <strong>{{ plan.errors.length }}</strong>
                <small>错误</small>
              </div>
              <div class="stats-item">
                <strong>{{ plan.duplicates.length }}</strong>
                <small>重复</small>
              </div>
            </div>
          </BaseCard>

          <BaseCard
            v-if="
              plan && (plan.pendingAccountCreations.length || plan.pendingCategoryCreations.length)
            "
            class="block-card"
          >
            <h2 class="block-card__title">将自动创建</h2>
            <p class="block-card__hint">未匹配的账户和分类会在导入时自动创建。</p>
            <div v-if="plan.pendingAccountCreations.length" class="pending-section">
              <h3 class="pending-section__title">新账户</h3>
              <ul class="pending-list">
                <li v-for="item in plan.pendingAccountCreations" :key="item.rawName">
                  <strong>{{ item.inferredName }}</strong>
                  <small
                    >{{ accountTypeLabel(item.accountType)
                    }}{{ item.institution ? ' · ' + item.institution : '' }}</small
                  >
                </li>
              </ul>
            </div>
            <div v-if="plan.pendingCategoryCreations.length" class="pending-section">
              <h3 class="pending-section__title">新分类</h3>
              <ul class="pending-list">
                <li v-for="item in plan.pendingCategoryCreations" :key="item.rawName">
                  <strong>{{ item.rawName }}</strong>
                  <small>{{ item.kind === 'expense' ? '支出' : '收入' }}</small>
                </li>
              </ul>
            </div>
          </BaseCard>

          <BaseCard v-if="visibleErrors.length" class="block-card">
            <h2 class="block-card__title">错误列表</h2>
            <ul class="error-list">
              <li v-for="(item, index) in visibleErrors" :key="index">
                <AlertCircle :size="16" :stroke-width="1.75" />
                <span>第 {{ item.rowIndex }} 行：{{ item.message }}</span>
              </li>
            </ul>
            <p v-if="hiddenErrorCount > 0" class="block-card__hint">
              还有 {{ hiddenErrorCount }} 条错误
            </p>
          </BaseCard>

          <BaseCard v-if="previewRows.length" class="block-card">
            <h2 class="block-card__title">有效行预览（前 5 行）</h2>
            <ul class="preview-list">
              <li v-for="row in previewRows" :key="row.index">
                <span class="preview-list__date">{{ formatDate(row.raw.occurredAt) }}</span>
                <span class="preview-list__kind">{{ kindLabel(row) }}</span>
                <span class="preview-list__amount"
                  >¥{{ (row.raw.amountMinor / 100).toFixed(2) }}</span
                >
                <span class="preview-list__merchant">{{ row.raw.merchant ?? '—' }}</span>
              </li>
            </ul>
          </BaseCard>

          <div v-if="errorMessage" class="page-state page-state--error">
            {{ errorMessage }}
          </div>

          <div class="actions">
            <button
              type="button"
              class="secondary-button"
              :disabled="saving"
              @click="step = 'mapping'"
            >
              返回调整
            </button>
            <button
              v-if="plan && plan.validRows.length > 0"
              type="button"
              class="primary-button"
              :disabled="saving"
              @click="confirmImport"
            >
              {{ saving ? '正在导入…' : '确认导入' }}
            </button>
          </div>
        </template>

        <!-- 步骤 4：完成 -->
        <template v-else-if="step === 'done'">
          <BaseCard class="done-card" variant="summary">
            <CheckCircle2 :size="40" :stroke-width="1.5" class="done-card__icon" />
            <strong class="done-card__title">导入完成</strong>
            <div v-if="result" class="done-card__stats">
              <div>
                <span>成功</span>
                <strong class="done-card__success">{{ result.successCount }} 条</strong>
              </div>
              <div>
                <span>失败</span>
                <strong class="done-card__fail">{{ result.errorCount }} 条</strong>
              </div>
            </div>
            <p v-if="result?.batchId" class="done-card__batch">批次 ID：{{ result.batchId }}</p>
          </BaseCard>

          <BaseCard
            v-if="result?.executionErrors && result.executionErrors.length > 0"
            class="block-card"
          >
            <h2 class="block-card__title">失败原因</h2>
            <p class="block-card__hint">以下行在执行阶段失败，请根据错误信息调整数据后重试。</p>
            <ul class="error-list">
              <li v-for="err in result.executionErrors.slice(0, 20)" :key="err.rowIndex">
                <small>第 {{ err.rowIndex }} 行</small>
                <span>{{ err.message }}</span>
              </li>
            </ul>
            <p v-if="result.executionErrors.length > 20" class="block-card__hint">
              还有 {{ result.executionErrors.length - 20 }} 条错误未显示…
            </p>
          </BaseCard>

          <div v-if="errorMessage" class="page-state page-state--error">
            {{ errorMessage }}
          </div>

          <div class="actions">
            <button type="button" class="secondary-button" @click="resetWizard">
              <RefreshCw :size="18" :stroke-width="1.75" />再导入一个
            </button>
            <button type="button" class="primary-button" @click="goToBatches">查看批次</button>
          </div>
        </template>
      </template>
    </div>
  </main>
</template>

<style scoped>
.import-page {
  min-height: 100dvh;
  padding-bottom: calc(var(--space-10) + env(safe-area-inset-bottom));
  background: var(--color-background);
}
.import-page__safe-top {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}
.import-page__content {
  display: grid;
  max-width: 520px;
  padding: var(--space-4) var(--page-gutter) var(--space-10);
  margin: auto;
  gap: var(--space-4);
}

.stepper {
  display: flex;
  align-items: center;
  margin: 0;
  padding: 0;
  gap: var(--space-1);
  list-style: none;
}
.stepper__item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.stepper__dot {
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  font-weight: 600;
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-pill);
}
.stepper__item--active .stepper__dot {
  color: #fff;
  background: var(--color-primary-600);
  border-color: var(--color-primary-600);
}
.stepper__item--active .stepper__label {
  color: var(--color-text-primary);
  font-weight: 600;
}
.stepper__item--done .stepper__dot {
  color: var(--color-primary-600);
  background: var(--color-primary-50);
  border-color: var(--color-primary-50);
}
.stepper__sep {
  color: var(--color-text-tertiary);
}

.page-state {
  padding: var(--space-4);
  color: var(--color-text-tertiary);
  text-align: center;
  font-size: var(--type-body-size);
}
.page-state--error {
  color: var(--color-danger);
}

.hint-card__title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-primary);
  font-size: var(--type-section-title-size);
  font-weight: 600;
}
.hint-card__title svg {
  color: var(--color-primary-600);
}
.hint-card__desc {
  margin: var(--space-2) 0 0;
  color: var(--color-text-secondary);
  font-size: var(--type-body-size);
  line-height: var(--type-body-line);
}

.file-button {
  display: flex;
  height: 48px;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: #fff;
  font-size: var(--type-body-size);
  font-weight: 600;
  background: var(--color-primary-600);
  border: 0;
  border-radius: var(--radius-pill);
  cursor: pointer;
}
.file-button--loading {
  opacity: 0.5;
  cursor: default;
}

.block-card__title {
  margin: 0 0 var(--space-1);
  font-size: var(--type-section-title-size);
  font-weight: 600;
}
.block-card__hint {
  margin: 0 0 var(--space-3);
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}

.mapping-list {
  display: grid;
  gap: var(--space-3);
}
.mapping-row {
  display: grid;
  align-items: center;
  gap: var(--space-2);
}
.mapping-row--field {
  grid-template-columns: minmax(0, 7rem) minmax(0, 1fr);
}
.mapping-row--pair {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 36px;
  margin-bottom: var(--space-2);
}
.mapping-row__label {
  color: var(--color-text-secondary);
  font-size: var(--type-label-size);
}
.mapping-row__required {
  color: var(--color-danger);
  font-style: normal;
}
.mapping-row input,
.mapping-row select {
  width: 100%;
  height: 40px;
  padding: 0 var(--space-3);
  color: var(--color-text-primary);
  font-size: var(--type-body-size);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
  outline: 0;
}

.icon-button {
  display: grid;
  width: 36px;
  height: 40px;
  place-items: center;
  color: var(--color-text-tertiary);
  background: transparent;
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
  cursor: pointer;
}
.icon-button:active {
  color: var(--color-danger);
  border-color: var(--color-danger);
}

.add-row-button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-3);
  color: var(--color-primary-600);
  font-size: var(--type-label-size);
  font-weight: 600;
  background: var(--color-primary-50);
  border: 0;
  border-radius: var(--radius-pill);
  cursor: pointer;
}

.stats-card {
  padding: var(--space-5);
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-2);
  text-align: center;
}
.stats-item {
  display: grid;
  gap: var(--space-1);
  color: var(--color-text-secondary);
}
.stats-item strong {
  color: var(--color-text-primary);
  font-size: var(--type-money-summary-size);
  font-weight: 600;
}
.stats-item small {
  font-size: var(--type-caption-size);
}
.stats-item--error strong {
  color: var(--color-danger);
}

.error-list {
  display: grid;
  margin: 0;
  padding: 0;
  gap: var(--space-2);
  list-style: none;
}
.error-list li {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  color: var(--color-danger);
  font-size: var(--type-caption-size);
  line-height: var(--type-body-line);
}
.error-list svg {
  flex: none;
  margin-top: 2px;
}

.preview-list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}
.preview-list li {
  display: grid;
  grid-template-columns: minmax(0, 5rem) minmax(0, 3rem) minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  border-top: 1px solid var(--color-divider);
  font-size: var(--type-caption-size);
}
.preview-list li:first-child {
  border-top: 0;
}
.preview-list__date {
  color: var(--color-text-secondary);
}
.preview-list__kind {
  color: var(--color-text-tertiary);
}
.preview-list__amount {
  color: var(--color-text-primary);
  font-weight: 600;
}
.preview-list__merchant {
  color: var(--color-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pending-section {
  margin-top: var(--space-3);
}
.pending-section__title {
  margin: 0 0 var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
  font-weight: 600;
}
.pending-list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}
.pending-list li {
  display: flex;
  padding: var(--space-2) 0;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  border-top: 1px solid var(--color-divider);
  font-size: var(--type-caption-size);
}
.pending-list li:first-child {
  border-top: 0;
}
.pending-list strong {
  color: var(--color-text-primary);
  font-weight: 500;
}
.pending-list small {
  color: var(--color-text-tertiary);
}

.done-card {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-6);
  place-items: center;
  text-align: center;
}
.done-card__icon {
  color: var(--color-income);
}
.done-card__title {
  font-size: var(--type-section-title-size);
  font-weight: 600;
}
.done-card__stats {
  display: flex;
  gap: var(--space-8);
  margin-top: var(--space-2);
}
.done-card__stats div {
  display: grid;
  gap: var(--space-1);
  color: var(--color-text-tertiary);
  font-size: var(--type-label-size);
}
.done-card__success {
  color: var(--color-income);
  font-size: var(--type-body-size);
}
.done-card__fail {
  color: var(--color-danger);
  font-size: var(--type-body-size);
}
.done-card__batch {
  margin: var(--space-2) 0 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}
.primary-button {
  display: flex;
  width: 100%;
  height: 48px;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: #fff;
  font-size: var(--type-body-size);
  font-weight: 600;
  background: var(--color-primary-600);
  border: 0;
  border-radius: var(--radius-pill);
  cursor: pointer;
}
.primary-button:disabled {
  opacity: 0.5;
}
.secondary-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: 48px;
  color: var(--color-text-primary);
  font-size: var(--type-body-size);
  font-weight: 500;
  background: transparent;
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-pill);
  cursor: pointer;
}
</style>
