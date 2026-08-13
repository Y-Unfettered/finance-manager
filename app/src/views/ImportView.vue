<script setup lang="ts">
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ClipboardPaste,
  FileJson,
  FileText,
  ListChecks,
  RefreshCw,
  RotateCcw,
  Upload,
  X,
} from '@lucide/vue'
import { computed, onActivated, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import type { AccountRecord, CategoryRecord } from '@/domain/entities'
import { getLogger } from '@/features/debug/app-logger'
import { ClipboardReader, isNativeClipboardAvailable } from '@/features/clipboard/clipboard-reader'
import { setConsumedFingerprint } from '@/features/clipboard/clipboard-fingerprint-cache'
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
  MissingField,
  ResolvedImportRow,
} from '@/features/import/import-types'
import { detectSourceType, parseJson, parseXlsx } from '@/features/import/source-parser'
import { useAppStore } from '@/stores/app'
import { useClipboardImportStore } from '@/stores/clipboard-import'
import { showToast, Field as VanField, Picker as VanPicker, Popup as VanPopup } from 'vant'
import 'vant/es/toast/style'
import 'vant/es/picker/style'
import 'vant/es/field/style'
import 'vant/es/popup/style'
import { readFileAsArrayBuffer, readFileAsText } from '@/utils/file-io'

const router = useRouter()
const appStore = useAppStore()
const importService = useImportService()
const clipboardImportStore = useClipboardImportStore()
const log = getLogger('clipboard')

type Step = 'select' | 'preview' | 'done'
type InputMode = 'file' | 'paste'

const STEPS: readonly { label: string }[] = [
  { label: '选择' },
  { label: '预览' },
  { label: '完成' },
]

const step = ref<Step>('select')
const inputMode = ref<InputMode>('file')
const pasteText = ref('')
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
const voidingBatch = ref(false)
const errorMessage = ref('')
const clipboardDialog = ref(false)
const clipboardCandidateCount = ref(0)
let lastClipboardCheckContent = ''

const isReady = computed(() => Boolean(importService && appStore.ledgerId))

const stepIndex = computed(() => {
  const map: Record<Step, number> = { select: 1, preview: 2, done: 3 }
  return map[step.value]
})

const expenseCategories = computed(() => categories.value.filter((c) => c.kind === 'expense'))
const incomeCategories = computed(() => categories.value.filter((c) => c.kind === 'income'))
// 保留给模板中可能通过 v-model 绑定的分类选择场景使用
void expenseCategories.value
void incomeCategories.value

const canPreview = computed(() => fieldMapping.value.date >= 0 && fieldMapping.value.amount >= 0)

const visibleErrors = computed(() => (plan.value?.errors ?? []).slice(0, 20))
const hiddenErrorCount = computed(() => Math.max((plan.value?.errors.length ?? 0) - 20, 0))
const previewRows = computed(() => (plan.value?.validRows ?? []))

// 统一缺失字段选择状态：key = `${rowIndex}_${fieldId}`
const fieldSelections = ref<Record<string, string>>({})

// 统一 Picker 弹窗状态
const showFieldPicker = ref(false)
const activeFieldKey = ref('')
const activeFieldType = ref<'picker' | 'input'>('picker')
const activeFieldCandidates = ref<{ text: string; value: string }[]>([])
const activeFieldId = ref('')

function selectionLabel(field: MissingField): string {
  const key = `${field.rowIndex}_${field.fieldId}`
  const sel = fieldSelections.value[key]
  if (!sel) return '请选择'
  if (field.fieldId === 'sourceAccount' || field.fieldId === 'targetAccount') {
    return accounts.value.find((a) => a.id === sel)?.name ?? sel
  }
  return categories.value.find((c) => c.id === sel)?.name ?? sel
}

function openFieldPicker(field: MissingField): void {
  const key = `${field.rowIndex}_${field.fieldId}`
  activeFieldKey.value = key
  activeFieldType.value = field.fieldType
  activeFieldId.value = field.fieldId
  activeFieldCandidates.value = []

  const row = plan.value?.validRows.find((r) => r.index === field.rowIndex)

  // 构建候选列表
  if (field.candidates) {
    if (field.fieldId === 'sourceAccount' || field.fieldId === 'targetAccount') {
      activeFieldCandidates.value = field.candidates.map((c) => ({
        text: `${c.name} (${c.id.replace('account_', '').slice(0, 6)}...)`,
        value: c.id,
      }))
    } else {
      const kind = row?.raw.kind
      const filtered = field.candidates.filter((c) => {
        const cat = categories.value.find((cat) => cat.id === c.id)
        if (!cat) return true
        return kind === 'expense' ? cat.kind === 'expense' : cat.kind === 'income'
      })
      activeFieldCandidates.value = filtered.map((c) => ({ text: c.name, value: c.id }))
    }
  }

  showFieldPicker.value = true
}

function closeFieldPicker(): void {
  showFieldPicker.value = false
  activeFieldKey.value = ''
}

function onFieldPickerConfirm(val: { selectedOptions: { text: string; value: string }[] }): void {
  if (!activeFieldKey.value) return
  const valStr = val.selectedOptions[0]?.value as string
  if (valStr) {
    fieldSelections.value[activeFieldKey.value] = valStr
  }
  closeFieldPicker()
}

function fieldFieldLabel(fieldId: string): string {
  const labels: Record<string, string> = {
    date: '日期',
    sourceAccount: '账户',
    targetAccount: '转入账户',
    category: '分类',
    type: '类型',
    amount: '金额',
  }
  return labels[fieldId] ?? fieldId
}

function fieldPlaceholder(field: MissingField): string {
  const labels: Record<string, string> = {
    date: '请选择日期',
    sourceAccount: '请选择转出账户',
    targetAccount: '请选择转入账户',
    category: '请选择分类',
    type: '请选择类型',
    amount: '请输入金额',
  }
  return labels[field.fieldId] ?? '请选择'
}

function resolvedCategoryName(row: ResolvedImportRow): string | undefined {
  if (row.raw.categoryName) return row.raw.categoryName
  if (!row.categoryId) return undefined
  if (row.categoryId.startsWith('__')) return undefined
  return categories.value.find((c) => c.id === row.categoryId)?.name ?? row.categoryId
}

function resolvedSourceAccountName(row: ResolvedImportRow): string | undefined {
  if (row.raw.sourceAccountName) return row.raw.sourceAccountName
  if (!row.sourceAccountId) return undefined
  if (row.sourceAccountId.startsWith('__')) return undefined
  return accounts.value.find((a) => a.id === row.sourceAccountId)?.name ?? row.sourceAccountId
}

function resolvedTargetAccountName(row: ResolvedImportRow): string | undefined {
  if (row.raw.targetAccountName) return row.raw.targetAccountName
  if (!row.targetAccountId) return undefined
  if (row.targetAccountId.startsWith('__')) return undefined
  return accounts.value.find((a) => a.id === row.targetAccountId)?.name ?? row.targetAccountId
}

function allFieldsSelected(): boolean {
  if (!plan.value) return true
  return plan.value.missingFields.every((field) => {
    const key = `${field.rowIndex}_${field.fieldId}`
    const sel = fieldSelections.value[key]
    return Boolean(sel)
  })
}

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
  const exact = new Map<string, ImportSystemField>()
  exact.set('date', 'date')
  exact.set('time', 'time')
  exact.set('amount', 'amount')
  exact.set('type', 'type')
  exact.set('merchant', 'merchant')
  exact.set('note', 'note')
  exact.set('sourceAccount', 'sourceAccount')
  exact.set('targetAccount', 'targetAccount')
  exact.set('source_account', 'sourceAccount')
  exact.set('target_account', 'targetAccount')
  exact.set('category', 'category')
  exact.set('sourceTransactionId', 'sourceTransactionId')
  exact.set('source_transaction_id', 'sourceTransactionId')
  exact.set('transactionId', 'sourceTransactionId')
  exact.set('transaction_id', 'sourceTransactionId')
  exact.set('id', 'sourceTransactionId')

  const hasDateColumn = headersList.some(
    (h) => h.includes('日期') || h.toLowerCase().includes('date'),
  )

  headersList.forEach((header, index) => {
    const trimmed = header.trim()
    const lower = trimmed.toLowerCase()

    // 1. 精确匹配英文字段名（驼峰 / snake_case），优先级最高
    if (mapping.date < 0 && exact.get(trimmed) === 'date') { mapping.date = index; return }
    if (mapping.time < 0 && exact.get(trimmed) === 'time') { mapping.time = index; return }
    if (mapping.amount < 0 && exact.get(trimmed) === 'amount') { mapping.amount = index; return }
    if (mapping.type < 0 && exact.get(trimmed) === 'type') { mapping.type = index; return }
    if (mapping.merchant < 0 && exact.get(trimmed) === 'merchant') { mapping.merchant = index; return }
    if (mapping.note < 0 && exact.get(trimmed) === 'note') { mapping.note = index; return }
    if (mapping.sourceAccount < 0 && exact.get(trimmed) === 'sourceAccount') { mapping.sourceAccount = index; return }
    if (mapping.targetAccount < 0 && exact.get(trimmed) === 'targetAccount') { mapping.targetAccount = index; return }
    if (mapping.category < 0 && exact.get(trimmed) === 'category') { mapping.category = index; return }
    if (mapping.sourceTransactionId < 0 && exact.get(trimmed) === 'sourceTransactionId') { mapping.sourceTransactionId = index; return }

    // 2. 中文表头匹配
    if (mapping.date < 0) {
      if (trimmed.includes('日期') || lower.includes('date')) {
        mapping.date = index
        return
      }
      if (!hasDateColumn && (trimmed.includes('时间') || lower.includes('time'))) {
        mapping.date = index
        return
      }
    }
    if (mapping.time < 0 && hasDateColumn && (trimmed.includes('时间') || lower.includes('time'))) {
      mapping.time = index
      return
    }
    if (mapping.amount < 0 && (trimmed.includes('金额') || lower.includes('amount'))) {
      mapping.amount = index
      return
    }
    if (mapping.type < 0 && (trimmed.includes('类型') || lower.includes('type'))) {
      mapping.type = index
      return
    }
    if (mapping.merchant < 0 && (trimmed.includes('商户') || lower.includes('merchant'))) {
      mapping.merchant = index
      return
    }
    if (mapping.note < 0 && (trimmed.includes('备注') || lower.includes('note'))) {
      mapping.note = index
      return
    }
    if (mapping.sourceAccount < 0 && isSourceAccountHeader(trimmed, lower)) {
      mapping.sourceAccount = index
      return
    }
    if (mapping.targetAccount < 0 && isTargetAccountHeader(trimmed, lower)) {
      mapping.targetAccount = index
      return
    }
    if (mapping.sourceAccount < 0 && (trimmed.includes('账户') || lower.includes('account'))) {
      mapping.sourceAccount = index
      return
    }
    if (mapping.category < 0 && (trimmed.includes('分类') || lower.includes('category'))) {
      mapping.category = index
      return
    }
    if (
      mapping.sourceTransactionId < 0 &&
      (trimmed.includes('交易号') || lower.includes('transaction id') || lower === 'transactionid')
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
    await goToPreview()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

function applyParsedResult(
  parsedHeaders: string[],
  parsedRows: string[][],
  parsedErrors: string[],
  source: ImportSourceType,
  name: string,
): void {
  if (parsedHeaders.length === 0) {
    throw new Error(parsedErrors[0] ?? '解析结果为空')
  }
  fileName.value = name
  sourceType.value = source
  headers.value = parsedHeaders
  rows.value = parsedRows
  parseErrors.value = parsedErrors
  fieldMapping.value = autoDetectMapping(parsedHeaders)
  accountMappings.value = []
  categoryMappings.value = []
  plan.value = undefined
  result.value = undefined
}

async function onPasteSubmit(): Promise<void> {
  const text = pasteText.value.trim()
  if (!text) return
  if (!importService || !appStore.ledgerId) return
  loading.value = true
  errorMessage.value = ''
  try {
    const result = parseJson(text)
    applyParsedResult(result.headers, result.rows, result.errors, 'json', '粘贴导入.json')
    await loadMappingOptions()
    await goToPreview()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

async function readFromClipboard(): Promise<string | null> {
  // 优先使用原生插件（Android ClipboardManager，无权限限制）
  if (isNativeClipboardAvailable()) {
    try {
      const { value, hasContent } = await ClipboardReader.getText()
      return hasContent ? value : null
    } catch {
      return null
    }
  }
  // Web fallback（浏览器/非原生环境）
  try {
    if (navigator.clipboard && window.isSecureContext) {
      return await navigator.clipboard.readText()
    }
  } catch {
    // ignore
  }
  return null
}

async function onClipboardButton(): Promise<void> {
  if (!importService || !appStore.ledgerId) return
  loading.value = true
  errorMessage.value = ''
  try {
    const text = await readFromClipboard()
    if (!text || !text.trim()) {
      throw new Error('剪贴板为空')
    }
    const result = parseJson(text.trim())
    applyParsedResult(result.headers, result.rows, result.errors, 'json', '剪贴板导入.json')
    pasteText.value = text.trim()
    await loadMappingOptions()
    await goToPreview()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

interface ClipboardProbeResult {
  ok: boolean
  count: number
  text: string
}

function probeClipboardJson(text: string): ClipboardProbeResult {
  const trimmed = text?.trim() ?? ''
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return { ok: false, count: 0, text: trimmed }
  }
  try {
    const arr = JSON.parse(trimmed)
    if (!Array.isArray(arr)) return { ok: false, count: 0, text: trimmed }
    if (arr.length === 0) return { ok: false, count: 0, text: trimmed }
    const looksLikeTransaction = arr.some(
      (item) =>
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        ('date' in item || 'amount' in item || 'type' in item),
    )
    return { ok: looksLikeTransaction, count: arr.length, text: trimmed }
  } catch {
    return { ok: false, count: 0, text: trimmed }
  }
}

async function confirmUseClipboard(): Promise<void> {
  if (!importService || !appStore.ledgerId) return
  loading.value = true
  errorMessage.value = ''
  try {
    const result = parseJson(lastClipboardCheckContent)
    applyParsedResult(result.headers, result.rows, result.errors, 'json', '剪贴板导入.json')
    await loadMappingOptions()
    pasteText.value = lastClipboardCheckContent
    await goToPreview()
    clipboardDialog.value = false
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

function dismissClipboardDialog(): void {
  clipboardDialog.value = false
}

/**
 * 进入导入页时检查是否有待处理的剪贴板候选项：
 * 1. 如果是用户从全局弹窗点「立即导入」跳过来的（clipboardImportStore.current 存在），
 *    直接消费该候选项，自动跳到映射步骤。
 * 2. 否则在原生环境下主动读一次剪贴板，检测到交易 JSON 则弹本地确认弹窗。
 */
async function checkPendingClipboard(): Promise<void> {
  if (!importService || !appStore.ledgerId) return

  // 情况1：全局弹窗跳转过来，store 里有候选项
  if (clipboardImportStore.current) {
    const candidateText = clipboardImportStore.current.text
    log.info('checkPendingClipboard: 从 store 消费候选项', {
      length: candidateText.length,
      count: clipboardImportStore.current.count,
    })
    clipboardImportStore.clear()
    try {
      const result = parseJson(candidateText)
      applyParsedResult(result.headers, result.rows, result.errors, 'json', '剪贴板导入.json')
      await loadMappingOptions()
      pasteText.value = candidateText
      await goToPreview()
      // 标记为已处理，避免下次 onResume 重复弹
      await ClipboardReader.markConsumed().catch(() => {})
      // 持久化记录指纹，防止应用重启后同一内容重复弹窗
      setConsumedFingerprint(candidateText)
      // 更新去重内容，防止 store 路径消费后剪贴板路径再次弹窗
      lastClipboardCheckContent = candidateText
      log.info('checkPendingClipboard: store 候选项消费成功，跳 preview')
      return
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      log.error('checkPendingClipboard: store 候选项 parse 失败', { msg })
      errorMessage.value = msg
    }
  }

  // 情况2：原生环境下主动读剪贴板检测
  if (!isNativeClipboardAvailable()) {
    log.debug('checkPendingClipboard: 非原生平台，跳过主动读剪贴板')
    return
  }
  try {
    const text = await readFromClipboard()
    if (!text) {
      log.info('checkPendingClipboard: 主动读剪贴板为空')
      return
    }
    const probe = probeClipboardJson(text)
    log.info('checkPendingClipboard: 主动 probe 结果', { ok: probe.ok, count: probe.count, head: text.slice(0, 80) })
    if (!probe.ok) return
    if (probe.text === lastClipboardCheckContent) {
      log.debug('checkPendingClipboard: 与上次检测内容一致，跳过')
      return
    }
    lastClipboardCheckContent = probe.text
    clipboardCandidateCount.value = probe.count
    clipboardDialog.value = true
    log.info('checkPendingClipboard: 弹本地确认框', { count: probe.count })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('checkPendingClipboard: 主动读剪贴板失败', { msg })
  }
}

onMounted(() => {
  if (isReady.value) {
    checkPendingClipboard()
  }
})

// KeepAlive 缓存恢复时重置写入状态。
// 导入是写入操作，不保留上次的步骤/数据，避免用户再次进入时停留在"完成"页。
// 首次挂载时 onMounted 已处理初始化，跳过；后续从缓存恢复时重置并重新检查剪贴板。
// 同时重新加载账户/分类列表，因为用户可能在资产管理/分类管理里改过名称了。
let isFirstActivation = true
onActivated(() => {
  if (isFirstActivation) {
    isFirstActivation = false
    return
  }
  resetWizard()
  if (isReady.value) {
    void loadMappingOptions()
    checkPendingClipboard()
  }
})

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

// 保留手动映射相关函数，未来可能恢复账户/分类手动映射 UI
void addAccountMapping
void removeAccountMapping
void addCategoryMapping
void removeCategoryMapping

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

async function applyUnmatchedAndRePreview(): Promise<void> {
  if (!importService || !appStore.ledgerId || !plan.value) return
  if (!allFieldsSelected()) return
  loading.value = true
  errorMessage.value = ''
  try {
    // 处理「创建新账户」：先创建账户，再建映射
    const newAccountMappings: AccountNameMapping[] = [...accountMappings.value]
    const newCategoryMappings: CategoryNameMapping[] = [...categoryMappings.value]

    for (const field of plan.value.missingFields) {
      const key = `${field.rowIndex}_${field.fieldId}`
      const selectedId = fieldSelections.value[key]
      if (!selectedId) continue

      if (field.fieldId === 'sourceAccount' || field.fieldId === 'targetAccount') {
        const missingKey = field.fieldId === 'sourceAccount'
          ? `__missing_source_${field.rowIndex}__`
          : `__missing_target_${field.rowIndex}__`
        newAccountMappings.push({ rawName: missingKey, accountId: selectedId })
      } else if (field.fieldId === 'category') {
        const missingKey = `__missing_category_${field.rowIndex}__`
        newCategoryMappings.push({ rawName: missingKey, categoryId: selectedId })
      }
    }

    accountMappings.value = newAccountMappings
    categoryMappings.value = newCategoryMappings

    // 重新预览
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
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

async function confirmImport(): Promise<void> {
  if (!importService || !appStore.ledgerId || !plan.value || saving.value) return
  if (!allFieldsSelected()) {
    errorMessage.value = '还有未确认的字段，请先在上方"需要确认的字段"中完成选择。'
    return
  }

  saving.value = true
  errorMessage.value = ''
  try {
    // 合并 fieldSelections 到 mappings，确保 executeImport 能拿到用户选择的缺失字段
    const mergedAccountMappings: AccountNameMapping[] = [...accountMappings.value]
    const mergedCategoryMappings: CategoryNameMapping[] = [...categoryMappings.value]

    for (const field of plan.value.missingFields) {
      const key = `${field.rowIndex}_${field.fieldId}`
      const selectedId = fieldSelections.value[key]
      if (!selectedId) continue

      if (field.fieldId === 'sourceAccount' || field.fieldId === 'targetAccount') {
        const missingKey = field.fieldId === 'sourceAccount'
          ? `__missing_source_${field.rowIndex}__`
          : `__missing_target_${field.rowIndex}__`
        mergedAccountMappings.push({ rawName: missingKey, accountId: selectedId })
      } else if (field.fieldId === 'category') {
        mergedCategoryMappings.push({
          rawName: `__missing_category_${field.rowIndex}__`,
          categoryId: selectedId,
        })
      }
    }

    const res = await importService.executeImport({
      ledgerId: appStore.ledgerId,
      plan: plan.value,
      accountMappings: mergedAccountMappings,
      categoryMappings: mergedCategoryMappings,
    })
    result.value = res
    step.value = 'done'
    if (pasteText.value) {
      setConsumedFingerprint(pasteText.value)
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

async function voidExistingBatchAndRetry(): Promise<void> {
  if (!importService || !appStore.ledgerId || voidingBatch.value) return
  voidingBatch.value = true
  errorMessage.value = ''
  try {
    // 撤销全部与当前文件指纹相同的 active 批次（可能因历史 bug 累积了多个）
    let voidedCount = 0
    let hasDuplicate = true
    let retryCount = 0
    const maxRetry = 10
    while (hasDuplicate && retryCount < maxRetry) {
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
      if (!built.existingActiveBatch) {
        hasDuplicate = false
        break
      }
      await importService.voidBatch(appStore.ledgerId, built.existingActiveBatch.id)
      voidedCount += 1
      retryCount += 1
    }
    if (voidedCount > 0) {
      showToast({
        message: voidedCount > 1 ? `已撤销 ${voidedCount} 个旧批次` : '已撤销旧批次',
        duration: 1200,
        position: 'bottom',
        className: 'import-toast-sm',
      })
    }
    if (!plan.value?.duplicateWarning) {
      showToast({
        message: '重复检查通过，可直接导入',
        duration: 1500,
        position: 'bottom',
        className: 'import-toast-sm',
      })
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    voidingBatch.value = false
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
  fieldSelections.value = {}
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
        <!-- 步骤 1：选择文件 / 粘贴文本 -->
        <template v-if="step === 'select'">
          <BaseCard class="hint-card">
            <div class="hint-card__title">
              <FileText :size="20" :stroke-width="1.75" />
              <span>导入账单</span>
            </div>
            <p class="hint-card__desc">
              支持选文件或直接粘贴豆包输出的 JSON。必填列：日期、金额。
            </p>
          </BaseCard>

          <div class="mode-tabs" role="tablist">
            <button
              type="button"
              class="mode-tabs__item"
              :class="{ 'mode-tabs__item--active': inputMode === 'file' }"
              role="tab"
              :aria-selected="inputMode === 'file'"
              @click="inputMode = 'file'"
            >
              <Upload :size="16" :stroke-width="1.75" />
              <span>选择文件</span>
            </button>
            <button
              type="button"
              class="mode-tabs__item"
              :class="{ 'mode-tabs__item--active': inputMode === 'paste' }"
              role="tab"
              :aria-selected="inputMode === 'paste'"
              @click="inputMode = 'paste'"
            >
              <FileJson :size="16" :stroke-width="1.75" />
              <span>粘贴 JSON</span>
            </button>
          </div>

          <template v-if="inputMode === 'file'">
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

            <button
              type="button"
              class="secondary-paste-button"
              :disabled="loading"
              @click="onClipboardButton"
            >
              <ClipboardPaste :size="18" :stroke-width="1.75" />
              <span>{{ loading ? '正在读取…' : '从剪贴板读取' }}</span>
            </button>
          </template>

          <template v-else>
            <textarea
              v-model="pasteText"
              class="paste-textarea"
              placeholder='粘贴豆包输出的 JSON，例如：&#10;[{"date":"2026-08-09","type":"expense","amount":"35.34","sourceAccount":"支付宝","category":"医疗"}]'
              rows="10"
            />
            <div class="paste-actions">
              <button
                type="button"
                class="secondary-paste-button"
                :disabled="loading"
                @click="onClipboardButton"
              >
                <ClipboardPaste :size="18" :stroke-width="1.75" />
                <span>{{ loading ? '正在读取…' : '从剪贴板粘贴' }}</span>
              </button>
              <button
                type="button"
                class="primary-button"
                :disabled="!pasteText.trim() || loading"
                @click="onPasteSubmit"
              >
                <FileJson :size="18" :stroke-width="1.75" />
                <span>{{ loading ? '解析中…' : '解析 JSON' }}</span>
              </button>
            </div>
          </template>

          <div v-if="errorMessage" class="page-state page-state--error">
            {{ errorMessage }}
          </div>

          <BaseCard class="history-entry-card">
            <button type="button" class="history-entry-card__btn" @click="goToBatches">
              <span class="history-entry-card__icon">
                <ListChecks :size="18" :stroke-width="1.75" />
              </span>
              <span class="history-entry-card__label">
                <strong>查看历史批次</strong>
                <small>查看过去导入的记录，撤销或排查问题</small>
              </span>
              <ChevronRight :size="16" :stroke-width="1.75" class="history-entry-card__chev" />
            </button>
          </BaseCard>
        </template>

        <!-- 步骤 2：预览 -->
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

          <BaseCard v-if="plan?.duplicateWarning" class="block-card" variant="summary">
            <div class="duplicate-warning">
              <AlertCircle :size="18" :stroke-width="1.75" />
              <div class="duplicate-warning__text">
                <strong>{{ plan.duplicateWarning }}</strong>
                <span>该文件已在之前导入过，不允许重复导入。</span>
                <div v-if="plan.existingActiveBatch" class="existing-batch-info">
                  <div class="existing-batch-info__row">
                    <span class="existing-batch-info__label">已有批次</span>
                    <span class="existing-batch-info__value">{{ plan.existingActiveBatch.fileName ?? '未知文件名' }}</span>
                  </div>
                  <div class="existing-batch-info__row">
                    <span class="existing-batch-info__label">导入时间</span>
                    <span class="existing-batch-info__value">{{ plan.existingActiveBatch.createdAt }}</span>
                  </div>
                  <button
                    type="button"
                    class="primary-button primary-button--sm"
                    :disabled="voidingBatch"
                    @click="voidExistingBatchAndRetry"
                  >
                    <RotateCcw :size="16" :stroke-width="1.75" />
                    {{ voidingBatch ? '正在撤销…' : '撤销此批次并重新导入' }}
                  </button>
                </div>
              </div>
            </div>
          </BaseCard>

          <!-- 统一缺失字段确认 -->
          <BaseCard v-if="plan && plan.missingFields.length > 0" class="block-card unmatched-card">
            <h2 class="block-card__title">需要确认的字段</h2>
            <p class="block-card__hint">以下行有缺失字段，请手动选择以完成导入。</p>
            <div
              v-for="field in plan.missingFields"
              :key="`${field.rowIndex}_${field.fieldId}`"
              class="unmatched-item"
            >
              <div class="unmatched-item__alert">
                <AlertCircle :size="16" :stroke-width="1.75" class="unmatched-item__alert-icon" />
                <span class="unmatched-item__alert-text">{{ field.displayLabel }}</span>
              </div>
              <div class="unmatched-item__control">
                <span class="unmatched-item__tag">{{ fieldFieldLabel(field.fieldId) }}</span>
                <VanField
                  v-if="field.fieldType === 'picker'"
                  is-link
                  readonly
                  clickable
                  :model-value="selectionLabel(field)"
                  :placeholder="fieldPlaceholder(field)"
                  :name="`${field.rowIndex}_${field.fieldId}`"
                  :class="{
                    'unmatched-item__picker': true,
                    'unmatched-item__picker--warning': !fieldSelections[`${field.rowIndex}_${field.fieldId}`],
                  }"
                  @click="openFieldPicker(field)"
                />
              </div>
            </div>
            <button type="button" class="add-row-button" :disabled="!allFieldsSelected()" @click="applyUnmatchedAndRePreview">
              <RefreshCw :size="16" :stroke-width="1.75" />重新检查
            </button>
          </BaseCard>

          <VanPopup v-model:show="showFieldPicker" position="bottom">
            <VanPicker
              :columns="activeFieldCandidates"
              @confirm="onFieldPickerConfirm"
              @cancel="closeFieldPicker"
            />
          </VanPopup>

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
            <h2 class="block-card__title">有效行预览（共 {{ previewRows.length }} 行）</h2>
            <div class="preview-rows-list">
              <div
                v-for="row in previewRows"
                :key="row.index"
                class="preview-row-card"
              >
                <div class="preview-row-card__header">
                  <span class="preview-row-card__index">第 {{ row.index - 1 }} 行</span>
                  <span class="preview-row-card__kind">{{ kindLabel(row) }}</span>
                  <span class="preview-row-card__amount">¥{{ (row.raw.amountMinor / 100).toFixed(2) }}</span>
                </div>
                <div class="preview-row-card__fields">
                  <div v-if="row.raw.occurredAt" class="preview-field">
                    <span class="preview-field__label">时间</span>
                    <span class="preview-field__value">{{ formatDate(row.raw.occurredAt) }}</span>
                  </div>
                  <div v-if="row.raw.merchant" class="preview-field">
                    <span class="preview-field__label">商户</span>
                    <span class="preview-field__value">{{ row.raw.merchant }}</span>
                  </div>
                  <div v-if="resolvedSourceAccountName(row)" class="preview-field">
                    <span class="preview-field__label">转出账户</span>
                    <span class="preview-field__value">{{ resolvedSourceAccountName(row) }}</span>
                  </div>
                  <div v-if="resolvedTargetAccountName(row)" class="preview-field">
                    <span class="preview-field__label">转入账户</span>
                    <span class="preview-field__value">{{ resolvedTargetAccountName(row) }}</span>
                  </div>
                  <div v-if="resolvedCategoryName(row)" class="preview-field">
                    <span class="preview-field__label">分类</span>
                    <span class="preview-field__value">{{ resolvedCategoryName(row) }}</span>
                  </div>
                  <div v-else-if="row.raw.kind !== 'transfer'" class="preview-field">
                    <span class="preview-field__label">分类</span>
                    <span class="preview-field__value preview-field__value--empty">未填写</span>
                  </div>
                  <div v-if="row.raw.note" class="preview-field">
                    <span class="preview-field__label">备注</span>
                    <span class="preview-field__value">{{ row.raw.note }}</span>
                  </div>
                  <div v-if="row.raw.sourceTransactionId" class="preview-field">
                    <span class="preview-field__label">交易号</span>
                    <span class="preview-field__value preview-field__value--mono">{{ row.raw.sourceTransactionId }}</span>
                  </div>
                </div>
              </div>
            </div>
          </BaseCard>

          <div v-if="errorMessage" class="page-state page-state--error">
            {{ errorMessage }}
          </div>

          <div class="actions">
            <button
              type="button"
              class="secondary-button"
              :disabled="saving"
              @click="resetWizard"
            >
              返回重新选择
            </button>
            <button
              v-if="plan && plan.validRows.length > 0 && !plan.duplicateWarning"
              type="button"
              class="primary-button"
              :disabled="saving"
              @click="confirmImport"
            >
              {{ saving ? '正在导入…' : '确认导入' }}
            </button>
          </div>
        </template>

        <!-- 步骤 3：完成 -->
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
            <p v-if="result?.batchId" class="done-card__batch">批次编号：{{ result.batchId.slice(0, 8) }}…</p>
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

    <!-- 剪贴板自动检测弹窗 -->
    <div v-if="clipboardDialog" class="dialog-overlay" role="dialog" aria-modal="true">
      <BaseCard class="dialog-card">
        <button
          type="button"
          class="dialog-card__close"
          aria-label="关闭"
          @click="dismissClipboardDialog"
        >
          <X :size="18" :stroke-width="1.75" />
        </button>
        <div class="dialog-card__icon">
          <ClipboardPaste :size="36" :stroke-width="1.5" />
        </div>
        <strong class="dialog-card__title">检测到待导入账单</strong>
        <p class="dialog-card__desc">
          剪贴板中有 <em>{{ clipboardCandidateCount }}</em> 条交易记录，是否立即导入？
        </p>
        <div class="dialog-card__actions">
          <button type="button" class="secondary-button" @click="dismissClipboardDialog">
            暂不导入
          </button>
          <button
            type="button"
            class="primary-button"
            :disabled="loading"
            @click="confirmUseClipboard"
          >
            {{ loading ? '解析中…' : '立即导入' }}
          </button>
        </div>
      </BaseCard>
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

.mode-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  padding: var(--space-1);
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-pill);
}
.mode-tabs__item {
  display: flex;
  height: 40px;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  color: var(--color-text-secondary);
  font-size: var(--type-label-size);
  font-weight: 500;
  background: transparent;
  border: 0;
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.mode-tabs__item--active {
  color: var(--color-text-primary);
  font-weight: 600;
  background: var(--color-primary-50);
}

.secondary-paste-button {
  display: flex;
  height: 48px;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--color-text-primary);
  font-size: var(--type-body-size);
  font-weight: 500;
  background: transparent;
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-pill);
  cursor: pointer;
}
.secondary-paste-button:disabled {
  opacity: 0.5;
  cursor: default;
}

.history-entry-card {
  padding: 0;
  overflow: hidden;
}
.history-entry-card__btn {
  display: flex;
  width: 100%;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
}
.history-entry-card__icon {
  display: grid;
  flex: none;
  width: 36px;
  height: 36px;
  place-items: center;
  color: var(--color-primary-600);
  background: var(--color-primary-50);
  border-radius: var(--radius-pill);
}
.history-entry-card__label {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: 2px;
}
.history-entry-card__label strong {
  color: var(--color-text-primary);
  font-size: var(--type-body-size);
  font-weight: 600;
}
.history-entry-card__label small {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.history-entry-card__chev {
  flex: none;
  color: var(--color-text-quaternary);
}

.paste-textarea {
  width: 100%;
  min-height: 200px;
  padding: var(--space-3);
  color: var(--color-text-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-lg);
  outline: 0;
  resize: vertical;
}
.paste-textarea::placeholder {
  color: var(--color-text-tertiary);
}

.paste-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: var(--page-gutter);
  background: rgba(20, 22, 24, 0.45);
  backdrop-filter: blur(2px);
}
.dialog-card {
  position: relative;
  width: 100%;
  max-width: 360px;
  padding: var(--space-6) var(--space-5) var(--space-5);
  display: grid;
  gap: var(--space-3);
  place-items: center;
  text-align: center;
}
.dialog-card__close {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  color: var(--color-text-tertiary);
  background: transparent;
  border: 0;
  border-radius: var(--radius-control);
  cursor: pointer;
}
.dialog-card__icon {
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  color: var(--color-primary-600);
  background: var(--color-primary-50);
  border-radius: 50%;
}
.dialog-card__title {
  font-size: var(--type-section-title-size);
  font-weight: 600;
}
.dialog-card__desc {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--type-body-size);
  line-height: var(--type-body-line);
}
.dialog-card__desc em {
  color: var(--color-primary-600);
  font-style: normal;
  font-weight: 700;
}
.dialog-card__actions {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.duplicate-warning {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  color: var(--color-warning, #f0a030);
  font-size: var(--type-body-size);
  line-height: var(--type-body-line);
}
.duplicate-warning svg {
  flex: none;
  margin-top: 2px;
}
.duplicate-warning__text {
  display: grid;
  gap: 4px;
}
.duplicate-warning__text strong {
  color: var(--color-warning, #f0a030);
  font-weight: 600;
}
.duplicate-warning__text span {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.existing-batch-info {
  margin-top: var(--space-3);
  padding: var(--space-3);
  background: var(--color-background-raised, #ffffff);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-md);
  display: grid;
  gap: var(--space-2);
}
.existing-batch-info__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}
.existing-batch-info__label {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  flex: none;
}
.existing-batch-info__value {
  color: var(--color-text-primary);
  font-size: var(--type-caption-size);
  font-weight: 500;
  text-align: right;
}
.primary-button--sm {
  padding: 10px var(--space-3);
  font-size: var(--type-caption-size);
  margin-top: var(--space-1);
  justify-self: start;
}

/* 需要确认的字段卡片 */
.unmatched-card {
  padding: var(--space-5) var(--space-4);
}
.unmatched-item {
  padding: 16px 0;
  border-top: 1px solid var(--color-divider);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.unmatched-item:first-of-type {
  border-top: 0;
  padding-top: 8px;
}
.unmatched-item__alert {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.unmatched-item__alert-icon {
  color: #f0a030;
  flex: none;
}
.unmatched-item__alert-text {
  color: #c77e20;
  font-size: var(--type-body-size);
  font-weight: 500;
}
.unmatched-item__control {
  display: grid;
  grid-template-columns: 5rem 1fr;
  align-items: center;
  gap: 12px;
}
.unmatched-item__tag {
  justify-self: center;
  display: flex;
  align-items: center;
  padding: 2px 10px;
  min-height: 36px;
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
  font-weight: 500;
  background: var(--color-surface);
  border-radius: var(--radius-pill);
}
.unmatched-item__hint {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: 1.5;
  padding-left: 4px;
}
.unmatched-item__picker {
  width: 100% !important;
  max-width: 100% !important;
}
/* 未选择时显示警告边框 */
.unmatched-item__picker--warning:deep(.van-cell) {
  border-bottom-color: #f0a030 !important;
}
.unmatched-item__picker--warning:deep(.van-field__placeholder) {
  color: #f0a030 !important;
}

/* 有效行预览卡片 */
.preview-rows-list {
  display: grid;
  gap: var(--space-3);
}
.preview-row-card {
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.preview-row-card__header {
  display: grid;
  grid-template-columns: minmax(0, auto) 1fr auto;
  align-items: center;
  gap: var(--space-2);
  padding: 12px var(--space-3);
  background: var(--color-background);
  border-bottom: 1px solid var(--color-divider);
}
.preview-row-card__index {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  font-weight: 600;
  padding: 2px 8px;
  background: var(--color-surface);
  border-radius: var(--radius-pill);
}
.preview-row-card__kind {
  justify-self: end;
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
}
.preview-row-card__amount {
  color: var(--color-primary-600);
  font-size: var(--type-body-size);
  font-weight: 600;
}
.preview-row-card__fields {
  display: grid;
  gap: 8px;
  padding: var(--space-2) var(--space-3) var(--space-3);
}
.preview-field {
  display: grid;
  grid-template-columns: 5.5rem 1fr;
  align-items: baseline;
  gap: var(--space-2);
  font-size: var(--type-caption-size);
}
.preview-field__label {
  color: var(--color-text-tertiary);
  font-weight: 500;
}
.preview-field__value {
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-field__value--empty {
  color: var(--color-text-quaternary, #999);
}
.preview-field__value--mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--color-text-secondary);
}
</style>

<style>
/* Vant Toast 是全局 fixed 元素，需要非 scoped 覆盖宽度 */
.van-toast.import-toast-sm {
  width: auto !important;
  min-width: 180px !important;
  max-width: 260px !important;
  padding: 10px 20px !important;
  font-size: 14px !important;
}
</style>
