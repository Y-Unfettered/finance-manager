<script setup lang="ts">
import { ArrowLeftRight, ChevronLeft, Plus } from '@lucide/vue'
import { NumberKeyboard } from 'vant'
import 'vant/es/number-keyboard/style'
import { computed, nextTick, onActivated, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CategoryIcon from '@/components/CategoryIcon.vue'
import type { AccountBalanceRecord } from '@/domain/entities'
import { formatMinorToCny, parseCnyInputToMinor } from '@/domain/money'
import { PaymentCapture } from '@/features/payment-capture/payment-capture-reader'
import { getLogger } from '@/features/debug/app-logger'
import { matchCaptureAccount } from '@/features/capture/capture-account-matcher'
import {
  useFinanceService,
  type EditTransactionFullInput,
  type ExpenseCategoryOption,
  type IncomeCategoryOption,
  type TransactionMetadata,
} from '@/features/finance/finance-service'
import { useAppStore } from '@/stores/app'
import { navigateBack } from '@/router/navigation-transition'
import {
  useHomePreferencesService,
  type HomePreferences,
} from '@/features/preferences/home-preferences-service'
import AccountPicker from './AccountPicker.vue'
import DatePicker from './DatePicker.vue'

type EntryMode = 'expense' | 'income' | 'transfer' | 'credit_purchase' | 'repayment' | 'refund'

const MODE_OPTIONS: readonly { value: EntryMode; label: string }[] = [
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
  { value: 'transfer', label: '转账' },
]

const EXPENSE_QUICK_TAGS = [
  { label: '美团月付', action: 'account' },
  { label: '今天', action: 'date' },
  { label: '图片', action: 'image' },
  { label: '优惠', action: 'discount' },
] as const

const INCOME_QUICK_TAGS = [
  { label: '微信(大号)', action: 'account' },
  { label: '今天', action: 'date' },
  { label: '图片', action: 'image' },
] as const

const TRANSFER_QUICK_TAGS = [
  { label: '今天', action: 'date' },
  { label: '图片', action: 'image' },
  { label: '手续费', action: 'fee' },
  { label: '优惠', action: 'discount' },
] as const

type QuickTagAction = 'account' | 'date' | 'image' | 'discount' | 'note' | 'fee'

interface QuickTagDef {
  label: string
  action: QuickTagAction
}

const route = useRoute()
const router = useRouter()
const log = getLogger('recordSheet')
const appStore = useAppStore()
const finance = useFinanceService()
const preferencesService = useHomePreferencesService()
const preferences = ref<HomePreferences>({
  summaryDisplayType: 'income_expense',
  summaryRangeType: '7d',
  amountsHidden: false,
  rememberLastAccount: true,
  appearance: 'system',
  colorTheme: 'green',
})

const mode = ref<EntryMode>('expense')
const accounts = ref<AccountBalanceRecord[]>([])
const expenseCategories = ref<ExpenseCategoryOption[]>([])
const incomeCategories = ref<IncomeCategoryOption[]>([])
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const keyboardVisible = ref(true)

const amountDisplay = ref('0')
const amountStarted = ref(false)
const selectedCategoryId = ref('')
const selectedCategoryName = ref('')
const merchant = ref('')
const note = ref('')
const attachmentDataUris = ref<string[]>([])
const fileInput = ref<HTMLInputElement>()

const sourceAccountId = ref('')
const targetAccountId = ref('')

const accountPickerShow = ref(false)
const accountPickerContext = ref<'source' | 'target'>('source')
const datePickerShow = ref(false)
const occurredAt = ref('')
const dateLabel = ref('今天')

const discountMode = ref(false)
const feeMode = ref(false)
const feeAmount = ref('')
const discountAmount = ref('')

const editTransactionId = ref('')
const isEditMode = ref(false)
const isCopyMode = ref(false)
const originalOccurredAt = ref('')
const originalRefundTransactionId = ref('')

const activeAccounts = computed(() =>
  accounts.value.filter((a) => !a.archivedAt && a.visibleInEntry !== false),
)
const debitAccounts = computed(() =>
  activeAccounts.value.filter((a) => a.normalBalance === 'debit'),
)
const creditAccounts = computed(() =>
  activeAccounts.value.filter((a) => a.normalBalance === 'credit'),
)
const transferDiscountIncomeCategories = computed(() =>
  incomeCategories.value.filter((c) => !c.parentId),
)
const discountIncomeCategoryId = ref('')

// 自动记账捕获元数据（P1：备注/方向/来源，落库 transactions 用）
const captureSource = ref('')
const captureParserVersion = ref('')
const captureConfidence = ref<number | undefined>(undefined)
const captureDirection = ref('')
const captureHintVisible = ref(false)
const captureFingerprint = ref('')
const captureId = ref(-1)
// 捕获合并显示：输入框显示「商户 + 备注」拼接文本，保存时未改动则拆回两字段落库
const capturePresetCombined = ref('')
const capturePresetMerchant = ref('')

/** 方向提示文案（P1 正金额场景）。 */
const directionHintText = computed(() => {
  switch (captureDirection.value) {
    case 'income': return '收入/外部打款'
    case 'transfer': return '自账户转账/提现'
    case 'refund': return '退款'
    default: return '收入/转账'
  }
})



/**
 * 规则分类建议（"kind:categoryId"，如 expense:insurance）→ 用户实际分类。
 * 匹配顺序：① 精确 id；② 分类语义词典（通用资产：categoryId → 用户分类名常见关键词）。
 * 词典覆盖不到时返回 ''，保持用户默认分类。
 */
function matchCaptureCategory(
  suggested: string,
): { id: string; name: string } | null {
  if (!suggested) return null
  const [kind, catId] = suggested.split(':')
  if (!catId) return null
  const pool = kind === 'income' ? incomeCategories.value : expenseCategories.value
  if (pool.length === 0) return null

  // ① 精确 id
  const byId = pool.find((c) => c.id === catId)
  if (byId) return { id: byId.id, name: byId.name }

  // ② 语义词典：分类名含关键词即命中（如 insurance → 保险/医疗/健康）
  const dictionary: Record<string, string[]> = {
    food: ['餐', '食', '吃', '美食', '外卖', '饮'],
    grocery: ['日用', '超市', '百货', '生鲜', '日用品'],
    utilities: ['缴费', '水电', '燃气', '生活', '话费', '通讯', '居家'],
    gas: ['加油', '油费'],
    insurance: ['保险', '医保', '医疗', '健康', '保障'],
    medical: ['医疗', '医药', '健康', '就诊'],
    health: ['医疗', '健康', '医药', '就诊'],
    transport: ['交通', '出行', '通勤', '车'],
    shopping: ['购物', '网购', '数码', '服饰', '穿戴'],
    entertainment: ['娱乐', '影音', '游戏', '旅游', '休闲'],
    education: ['教育', '学习', '书', '培训'],
    housing: ['住房', '房租', '居住'],
    pet: ['宠物'],
    'income-other': ['红包', '收红包', '其他收入', '收入', '返现', '奖励'],
    salary: ['工资', '薪水'],
  }
  const keywords = dictionary[catId]
  if (keywords) {
    const byKeyword = pool.find((c) => keywords.some((k) => c.name.includes(k)))
    if (byKeyword) return { id: byKeyword.id, name: byKeyword.name }
  }
  return null
}

const quickTags = computed<readonly QuickTagDef[]>(() => {
  if (mode.value === 'income') return INCOME_QUICK_TAGS
  if (mode.value === 'transfer' || mode.value === 'repayment') return TRANSFER_QUICK_TAGS
  return EXPENSE_QUICK_TAGS
})

const usesExpenseCategory = computed(() =>
  ['expense', 'credit_purchase', 'refund'].includes(mode.value),
)
const usesIncomeCategory = computed(() => mode.value === 'income')
const hasCategory = computed(() => usesExpenseCategory.value || usesIncomeCategory.value)
const activeCategories = computed(() =>
  usesIncomeCategory.value ? incomeCategories.value : expenseCategories.value,
)
const activeRootCategories = computed(() =>
  activeCategories.value.filter((category) => !category.parentId),
)
const selectedRootId = computed(() => {
  const selected = activeCategories.value.find(
    (category) => category.id === selectedCategoryId.value,
  )
  return selected?.parentId ?? selected?.id ?? ''
})
const activeChildCategories = computed(() =>
  selectedRootId.value
    ? activeCategories.value.filter((category) => category.parentId === selectedRootId.value)
    : [],
)
const pickerAccounts = computed(() => {
  if (accountPickerContext.value === 'target') {
    if (mode.value === 'repayment') return creditAccounts.value
    if (mode.value === 'transfer') {
      return activeAccounts.value.filter((a) => a.id !== sourceAccountId.value)
    }
    return debitAccounts.value
  }
  if (mode.value === 'expense' || mode.value === 'credit_purchase') return activeAccounts.value
  if (mode.value === 'refund') return activeAccounts.value
  if (mode.value === 'transfer') {
    return activeAccounts.value.filter((a) => a.id !== targetAccountId.value)
  }
  if (mode.value === 'repayment') return debitAccounts.value
  return debitAccounts.value
})

const pickerTitle = computed(() => {
  if (accountPickerContext.value === 'target') {
    return mode.value === 'repayment' ? '选择信用账户' : '选择转入账户'
  }
  if (mode.value === 'credit_purchase') return '选择信用账户'
  if (mode.value === 'refund') return '选择退款到账账户'
  if (mode.value === 'repayment') return '选择还款账户'
  return '选择支付账户'
})

const selectedSourceAccount = computed(() =>
  accounts.value.find((a) => a.id === sourceAccountId.value),
)
const selectedTargetAccount = computed(() =>
  accounts.value.find((a) => a.id === targetAccountId.value),
)

const canSubmit = computed(() => {
  if (loading.value || saving.value) return false
  if (amountDisplay.value === '' || amountDisplay.value === '0' || amountDisplay.value === '0.0')
    return false
  if (hasDiscount.value && Number(discountAmount.value) >= Number(amountDisplay.value))
    return false
  if (mode.value === 'refund' && originalRefundTransactionId.value === '') return false
  if (hasCategory.value) {
    return sourceAccountId.value !== '' && selectedCategoryId.value !== ''
  }
  if ((isTransfer.value || isRepayment.value) && hasDiscount.value) {
    return (
      sourceAccountId.value !== '' &&
      targetAccountId.value !== '' &&
      discountIncomeCategoryId.value !== ''
    )
  }
  return sourceAccountId.value !== '' && targetAccountId.value !== ''
})

const hasDiscount = computed(
  () =>
    discountAmount.value !== '' && discountAmount.value !== '0' && discountAmount.value !== '0.0',
)

const discountValueDisplay = computed(() => {
  if (!hasDiscount.value) return '0'
  const n = Number(discountAmount.value)
  if (isNaN(n)) return discountAmount.value
  return n.toFixed(2)
})

const actualSpending = computed(() => {
  const main = Number(amountDisplay.value) || 0
  const disc = Number(discountAmount.value) || 0
  const val = Math.max(0, main - disc)
  return val.toFixed(2)
})

const hasFee = computed(
  () => feeAmount.value !== '' && feeAmount.value !== '0' && feeAmount.value !== '0.0',
)

// 手续费模式：金额框显示转出申请额，实到 = 申请额 - 手续费（与优惠同构）
const actualArrival = computed(() => {
  const main = Number(amountDisplay.value) || 0
  const fee = Number(feeAmount.value) || 0
  const val = Math.max(0, main - fee)
  return val.toFixed(2)
})

const isExpense = computed(() => mode.value === 'expense')
const isIncome = computed(() => mode.value === 'income')
const isTransfer = computed(() => mode.value === 'transfer')
const isRepayment = computed(() => mode.value === 'repayment')
const isDualAccountMode = computed(() => isTransfer.value || isRepayment.value)

const themeColor = computed(() => {
  if (isExpense.value || mode.value === 'credit_purchase') return 'var(--color-danger)'
  if (isIncome.value || mode.value === 'refund') return 'var(--color-primary-500)'
  return 'var(--color-primary-400)'
})

const saveButtonLabel = computed(() => {
  if (saving.value) return '保存中…'
  if (isEditMode.value) return '保存修改'
  if (isCopyMode.value) return '保存为新记录'
  return '保存'
})

async function loadOptions(): Promise<void> {
  if (!finance || !appStore.ledgerId) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    const [accRows, expCats, incCats, savedPreferences] = await Promise.all([
      finance.listAccounts(appStore.ledgerId),
      finance.listExpenseCategories(appStore.ledgerId),
      finance.listIncomeCategories(appStore.ledgerId),
      preferencesService
        ? preferencesService.get(appStore.ledgerId)
        : Promise.resolve(preferences.value),
    ])
    accounts.value = accRows
    expenseCategories.value = expCats
    incomeCategories.value = incCats
    preferences.value = savedPreferences
    if (sourceAccountId.value === '') resetAccountsForMode(mode.value)
    if (targetAccountId.value === '' && mode.value === 'transfer')
      targetAccountId.value = debitAccounts.value[1]?.id ?? debitAccounts.value[0]?.id ?? ''
    if (selectedCategoryId.value === '' && expCats.length > 0) {
      selectedCategoryId.value = expCats[0]!.id
      selectedCategoryName.value = expCats[0]!.name
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

async function loadTransactionForEdit(txId: string): Promise<void> {
  if (!finance) return
  try {
    const tx = await finance.getTransaction(txId)
    if (!tx) throw new Error('交易不存在')
    applyTransactionToForm(tx)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  }
}

function applyTransactionToForm(tx: TransactionMetadata): void {
  if (['expense', 'income', 'transfer', 'credit_purchase', 'repayment', 'refund'].includes(tx.type))
    mode.value = tx.type as EntryMode
  else mode.value = 'expense'
  amountDisplay.value = formatMinorToCny(tx.originalAmountMinor ?? tx.amountMinor)
  amountStarted.value = true
  discountAmount.value = tx.discountMinor ? formatMinorToCny(tx.discountMinor) : ''
  discountMode.value = false
  merchant.value = tx.merchant ?? ''
  note.value = tx.note ?? ''
  attachmentDataUris.value = [...tx.attachmentDataUris]
  occurredAt.value = tx.occurredAt
  if (tx.sourceAccountId || tx.accountId)
    sourceAccountId.value = tx.sourceAccountId ?? tx.accountId ?? ''
  targetAccountId.value = tx.targetAccountId ?? ''
  if (tx.categoryId) selectedCategoryId.value = tx.categoryId
  if (tx.categoryName) selectedCategoryName.value = tx.categoryName
  if ((tx.type === 'transfer' || tx.type === 'repayment') && tx.discountMinor && tx.categoryId) {
    discountIncomeCategoryId.value = tx.categoryId
  }
  originalOccurredAt.value = tx.occurredAt
}

let initialActivation = true

async function initializeFormState(): Promise<void> {
  // 重置所有表单状态，避免上次记账残留（KeepAlive 缓存场景下 onMounted 不会再次触发）
  mode.value = 'expense'
  amountDisplay.value = '0'
  amountStarted.value = false
  selectedCategoryId.value = ''
  selectedCategoryName.value = ''
  merchant.value = ''
  note.value = ''
  attachmentDataUris.value = []
  sourceAccountId.value = ''
  targetAccountId.value = ''
  occurredAt.value = ''
  dateLabel.value = '今天'
  discountMode.value = false
  discountAmount.value = ''
  feeMode.value = false
  feeAmount.value = ''
  editTransactionId.value = ''
  isEditMode.value = false
  isCopyMode.value = false
  originalOccurredAt.value = ''
  originalRefundTransactionId.value = ''
  capturePresetCombined.value = ''
  capturePresetMerchant.value = ''
  errorMessage.value = ''
  accountPickerShow.value = false
  datePickerShow.value = false

  await loadOptions()

  const editId = route.query.edit
  const copyId = route.query.copy
  const refundId = route.query.refund
  const requestedMode = route.query.mode
  const requestedAccountId = route.query.accountId
  const pendingAmount = route.query.amount
  const pendingMerchant = route.query.merchant
  const pendingOccurredAt = route.query.occurredAt
  const pendingNote = route.query.note
  const pendingDirection = route.query.direction
  const pendingCaptureSource = route.query.captureSource
  const pendingParserVersion = route.query.parserVersion
  const pendingConfidence = route.query.confidence
  // 自动记账捕获的金额和商户
  if (typeof pendingAmount === 'string' && pendingAmount) {
    const minor = parseInt(pendingAmount, 10)
    if (!isNaN(minor) && minor > 0) {
      amountDisplay.value = (minor / 100).toFixed(2)
      amountStarted.value = true
    }
  }
  if (typeof pendingMerchant === 'string' && pendingMerchant) {
    merchant.value = pendingMerchant
  }
  // 仅接受合法 ISO 日期；空或非法值不写入，保存时会回退为当前时间
  if (typeof pendingOccurredAt === 'string' && pendingOccurredAt && !Number.isNaN(Date.parse(pendingOccurredAt))) {
    occurredAt.value = pendingOccurredAt
    // 日期标签同步（否则标签仍显示"今天"而实际是账单交易时间）
    const picked = new Date(pendingOccurredAt)
    const diffDays = Math.floor((Date.now() - picked.getTime()) / (1000 * 60 * 60 * 24))
    dateLabel.value =
      diffDays === 0 ? '今天' : diffDays === 1 ? '昨天' : diffDays === 2 ? '前天'
      : `${picked.getMonth() + 1}月${picked.getDate()}日`
  }
  // P1：自动备注预填（"为什么花"）
  // 显示上把「商户 + 备注」拼进原本那一个输入框（不动 UI 布局）；
  // note.value 保留捕获备注（快捷标签"备注"可改），保存时若输入框未被用户改动则拆回两字段落库。
  if (typeof pendingNote === 'string' && pendingNote && pendingNote.length > 0) {
    note.value = pendingNote
    const presetMerchant = merchant.value
    if (presetMerchant && !pendingNote.includes(presetMerchant)) {
      capturePresetCombined.value = `${presetMerchant} ${pendingNote}`
      capturePresetMerchant.value = presetMerchant
      merchant.value = capturePresetCombined.value
    } else {
      // 备注已含商户（或商户为空）：框里只显示备注
      capturePresetCombined.value = pendingNote
      capturePresetMerchant.value = presetMerchant
      merchant.value = pendingNote
    }
  }
  // P1：原价/优惠预填——金额框填原价、优惠框填优惠，实付由记账页自动算出
  const pendingOriginal = route.query.originalAmount
  const pendingDiscount = route.query.discount
  if (
    typeof pendingOriginal === 'string' && pendingOriginal &&
    typeof pendingDiscount === 'string' && pendingDiscount
  ) {
    const originalMinor = parseInt(pendingOriginal, 10)
    const discountMinor = parseInt(pendingDiscount, 10)
    if (!isNaN(originalMinor) && originalMinor > 0 && !isNaN(discountMinor) && discountMinor > 0) {
      amountDisplay.value = (originalMinor / 100).toFixed(2)
      amountStarted.value = true
      discountAmount.value = (discountMinor / 100).toFixed(2)
      discountMode.value = true
    }
  }
  // P1：手续费预填（提现服务费）——金额框填申请额、手续费框填服务费，实到自动算
  const pendingFee = route.query.fee
  if (typeof pendingFee === 'string' && pendingFee) {
    const feeMinor = parseInt(pendingFee, 10)
    if (!isNaN(feeMinor) && feeMinor > 0) {
      feeAmount.value = (feeMinor / 100).toFixed(2)
      feeMode.value = true
      discountMode.value = false
    }
  }
  // P1：捕获元数据（非编辑/复制/退款模式才透传，避免编辑时误带来源）
  if (!editId && !copyId && !refundId) {
    if (typeof pendingCaptureSource === 'string') captureSource.value = pendingCaptureSource
    if (typeof pendingParserVersion === 'string') captureParserVersion.value = pendingParserVersion
    if (typeof pendingConfidence === 'string' && pendingConfidence) {
      const c = Number(pendingConfidence)
      if (!Number.isNaN(c)) captureConfidence.value = c
    }
    const pendingAccountHint = route.query.accountHint
    const pendingSourcePackage = route.query.sourcePackage
    const pendingFingerprint = route.query.fingerprint
    const pendingSuggestedCategory = route.query.suggestedCategory
    if (typeof pendingFingerprint === 'string') captureFingerprint.value = pendingFingerprint
    const pendingCaptureId = route.query.captureId
    if (typeof pendingCaptureId === 'string' && pendingCaptureId) {
      captureId.value = parseInt(pendingCaptureId, 10)
    }
    if (typeof pendingDirection === 'string' && pendingDirection) {
      captureDirection.value = pendingDirection
      // 方向明确时自动切到对应模式（income→收入；transfer→转账），expense 保持默认；
      // 仅在无法判断（confirm）时提示用户自行确认
      if (pendingDirection === 'income') {
        switchMode('income')
      } else if (pendingDirection === 'transfer') {
        switchMode('transfer')
      }
      captureHintVisible.value = pendingDirection === 'confirm'
    }
    // 账户预选：按账户线索（付款方式）或来源 APP 匹配记账账户（如"支付宝余额""微信零钱"）
    const matchedAccountId = matchCaptureAccount(
      typeof pendingAccountHint === 'string' ? pendingAccountHint : '',
      typeof pendingSourcePackage === 'string' ? pendingSourcePackage : '',
      activeAccounts.value,
      captureDirection.value === 'income' || captureDirection.value === 'transfer',
    ) ?? undefined
    if (matchedAccountId) {
      sourceAccountId.value = matchedAccountId
    }
    // P1：转账转入方预填（必须在 switchMode 之后——reset 会覆盖预填值）
    const pendingTarget = route.query.targetAccountHint
    if (typeof pendingTarget === 'string' && pendingTarget) {
      const targetId = matchCaptureAccount(
        pendingTarget,
        typeof pendingSourcePackage === 'string' ? pendingSourcePackage : '',
        activeAccounts.value,
        true,
      )
      if (targetId) targetAccountId.value = targetId
    }
    // 分类预选：规则建议（如 expense:insurance）→ 按分类语义词典匹配用户实际分类
    const suggestedCat = matchCaptureCategory(
      typeof pendingSuggestedCategory === 'string' ? pendingSuggestedCategory : '',
    )
    if (suggestedCat) {
      selectedCategoryId.value = suggestedCat.id
      selectedCategoryName.value = suggestedCat.name
    }
    // 预填诊断日志（定位"某字段没生效"时看这里；console 桥到 logcat，adb 可直接抓取）
    const prefillDebug = {
      direction: captureDirection.value,
      amount: amountDisplay.value,
      merchant: merchant.value,
      note: note.value,
      occurredAt: occurredAt.value,
      accountHintQuery: pendingAccountHint,
      sourcePackageQuery: pendingSourcePackage,
      suggestedCategoryQuery: pendingSuggestedCategory,
      accountMatched: matchedAccountId || '(未命中)',
      categoryMatched: suggestedCat ? `${suggestedCat.name}(${suggestedCat.id})` : '(未命中)',
    }
    log.info('记账页捕获预填', prefillDebug)
    console.log('[capture-prefill]', JSON.stringify(prefillDebug))
  }
  if (typeof editId === 'string' && editId) {
    editTransactionId.value = editId
    isEditMode.value = true
    await loadTransactionForEdit(editId)
  } else if (typeof copyId === 'string' && copyId) {
    editTransactionId.value = copyId
    isCopyMode.value = true
    await loadTransactionForEdit(copyId)
    amountDisplay.value = '0'
    amountStarted.value = false
    discountAmount.value = ''
    occurredAt.value = new Date().toISOString()
  } else if (typeof refundId === 'string' && refundId) {
    originalRefundTransactionId.value = refundId
    await loadTransactionForEdit(refundId)
    mode.value = 'refund'
    amountDisplay.value = '0'
    amountStarted.value = false
    discountAmount.value = ''
    occurredAt.value = new Date().toISOString()
    attachmentDataUris.value = []
    merchant.value = ''
    note.value = '关联原支出退款'
  } else if (requestedMode === 'repayment') {
    mode.value = 'repayment'
    sourceAccountId.value = debitAccounts.value[0]?.id ?? ''
    targetAccountId.value =
      typeof requestedAccountId === 'string'
        ? requestedAccountId
        : (creditAccounts.value[0]?.id ?? '')
  } else if (
    typeof requestedAccountId === 'string' &&
    activeAccounts.value.some((item) => item.id === requestedAccountId)
  ) {
    sourceAccountId.value = requestedAccountId
  }
}

function switchMode(next: EntryMode): void {
  if (mode.value === next || saving.value) return
  mode.value = next
  errorMessage.value = ''
  if (next === 'expense' || next === 'credit_purchase' || next === 'refund') {
    if (expenseCategories.value.length > 0) {
      selectedCategoryId.value = expenseCategories.value[0]!.id
      selectedCategoryName.value = expenseCategories.value[0]!.name
    }
  } else if (next === 'income') {
    if (incomeCategories.value.length > 0) {
      selectedCategoryId.value = incomeCategories.value[0]!.id
      selectedCategoryName.value = incomeCategories.value[0]!.name
    }
  } else {
    selectedCategoryId.value = ''
    selectedCategoryName.value = ''
    discountIncomeCategoryId.value =
      incomeCategories.value.find((c) => c.name === '其他收入')?.id ??
      incomeCategories.value[0]?.id ??
      ''
  }
  // 切换模式时，如果当前账户对新模式有效，则保留不重置
  //（例如从支出切到收入时，当前借方账户如"医保"对收入模式也有效）
  const currentAccount = accounts.value.find((a) => a.id === sourceAccountId.value)
  const isSourceValidForNext = (() => {
    if (!currentAccount) return false
    if (next === 'expense' || next === 'credit_purchase' || next === 'refund' || next === 'transfer') {
      return activeAccounts.value.some((a) => a.id === currentAccount.id)
    }
    // income / repayment：仅借方账户有效
    return debitAccounts.value.some((a) => a.id === currentAccount.id)
  })()

  if (!isSourceValidForNext) {
    resetAccountsForMode(next)
  } else {
    if (next === 'transfer') {
      targetAccountId.value =
        activeAccounts.value.find((a) => a.id !== sourceAccountId.value)?.id ?? ''
    } else if (next === 'repayment') {
      targetAccountId.value = creditAccounts.value[0]?.id ?? ''
    } else {
      targetAccountId.value = ''
    }
  }
}

function resetAccountsForMode(next: EntryMode): void {
  const sourceOptions =
    next === 'expense' || next === 'credit_purchase' || next === 'refund' || next === 'transfer'
      ? activeAccounts.value
      : next === 'repayment'
        ? debitAccounts.value
        : debitAccounts.value
  const lastAccountId =
    preferences.value.rememberLastAccount && appStore.ledgerId
      ? localStorage.getItem(
          `finance-manager:last-account:${appStore.ledgerId}:${visibleMode(next)}`,
        )
      : undefined
  const defaultAccountId =
    next === 'income'
      ? preferences.value.defaultIncomeAccountId
      : preferences.value.defaultExpenseAccountId
  sourceAccountId.value =
    sourceOptions.find((item) => item.id === lastAccountId)?.id ??
    sourceOptions.find((item) => item.id === defaultAccountId)?.id ??
    sourceOptions[0]?.id ??
    ''
  if (next === 'transfer') {
    targetAccountId.value =
      activeAccounts.value.find((a) => a.id !== sourceAccountId.value)?.id ?? ''
  } else if (next === 'repayment') {
    targetAccountId.value = creditAccounts.value[0]?.id ?? ''
  } else {
    targetAccountId.value = ''
  }
}

function visibleMode(value: EntryMode): 'expense' | 'income' | 'transfer' {
  if (value === 'credit_purchase' || value === 'refund') return 'expense'
  if (value === 'repayment') return 'transfer'
  return value
}

function selectCategory(cat: ExpenseCategoryOption | IncomeCategoryOption): void {
  selectedCategoryId.value = cat.id
  selectedCategoryName.value = cat.name
}

function toggleDiscountMode(): void {
  discountMode.value = !discountMode.value
}

function pickQuickTag(tag: QuickTagDef): void {
  if (tag.action === 'account') {
    accountPickerContext.value = 'source'
    accountPickerShow.value = true
    return
  }
  if (tag.action === 'date') {
    datePickerShow.value = true
    return
  }
  if (tag.action === 'discount') {
    toggleDiscountMode()
    return
  }
  if (tag.action === 'image') {
    fileInput.value?.click()
    return
  }
  if (tag.action === 'note') {
    editNote()
    return
  }
  if (tag.action === 'fee') {
    // 手续费行内输入（与优惠同构），替代原生 prompt
    feeMode.value = !feeMode.value
    if (feeMode.value) discountMode.value = false
    if (!feeMode.value) feeAmount.value = ''
    return
  }
}

/** 编辑备注（捕获预填与快捷标签共用）。 */
function editNote(): void {
  const val = prompt('输入备注内容', note.value)
  if (val !== null) note.value = val
}

async function handleImageSelect(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  for (const file of files) {
    if (attachmentDataUris.value.length >= 3) {
      errorMessage.value = '每笔交易最多添加 3 张图片'
      break
    }
    if (!file.type.startsWith('image/')) {
      errorMessage.value = '只能添加图片文件'
      continue
    }
    if (file.size > 3 * 1024 * 1024) {
      errorMessage.value = '单张图片不能超过 3 MB'
      continue
    }
    attachmentDataUris.value.push(await readFileAsDataUri(file))
  }
}

function readFileAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

function handleAccountSelect(acc: AccountBalanceRecord | null): void {
  if (!acc) return
  if (accountPickerContext.value === 'source') {
    sourceAccountId.value = acc.id
    if (preferences.value.rememberLastAccount && appStore.ledgerId) {
      localStorage.setItem(
        `finance-manager:last-account:${appStore.ledgerId}:${visibleMode(mode.value)}`,
        acc.id,
      )
    }
  } else {
    targetAccountId.value = acc.id
  }
}

function openAccountPicker(context: 'source' | 'target'): void {
  accountPickerContext.value = context
  accountPickerShow.value = true
}

function handleDateSelect(date: string, label: string): void {
  occurredAt.value = date
  dateLabel.value = label
}

function appendDiscount(char: string): void {
  if (char === 'backspace') {
    setDiscountCandidate(discountAmount.value.slice(0, -1))
    return
  }
  if (char === 'clear') {
    setDiscountCandidate('')
    return
  }
  if (char === '-' || char === '+') return
  if (char === '00' && (discountAmount.value === '' || discountAmount.value === '0')) return
  if (discountAmount.value === '' || discountAmount.value === '0') {
    setDiscountCandidate(char === '.' ? '0.' : char)
    return
  }
  if (char === '.' && !discountAmount.value.includes('.')) {
    setDiscountCandidate(`${discountAmount.value}.`)
    return
  }
  const dotIndex = discountAmount.value.indexOf('.')
  if (dotIndex !== -1 && discountAmount.value.length - dotIndex >= 3) return
  if (discountAmount.value.length >= 9) return
  setDiscountCandidate(`${discountAmount.value}${char}`)
}

function setDiscountCandidate(value: string): void {
  const discount = Number(value)
  const original = Number(amountDisplay.value)
  if (value && Number.isFinite(discount) && discount >= original) {
    errorMessage.value = '优惠金额必须小于原金额'
    return
  }
  discountAmount.value = value
  if (errorMessage.value === '优惠金额必须小于原金额') errorMessage.value = ''
}

function setFeeCandidate(value: string): void {
  const main = Number(amountDisplay.value) || 0
  const fee = Number(value) || 0
  if (fee >= main && main > 0) {
    errorMessage.value = '手续费必须小于转出金额'
    return
  }
  feeAmount.value = value
  if (errorMessage.value === '手续费必须小于转出金额') errorMessage.value = ''
}

function appendFee(char: string): void {
  if (char === 'backspace') {
    setFeeCandidate(feeAmount.value.slice(0, -1))
    return
  }
  if (char === 'clear') {
    setFeeCandidate('')
    return
  }
  if (char === '-' || char === '+') return
  if (char === '00' && (feeAmount.value === '' || feeAmount.value === '0')) return
  if (char === '.' && !feeAmount.value.includes('.')) {
    setFeeCandidate(`${feeAmount.value}.`)
    return
  }
  const dotIndex = feeAmount.value.indexOf('.')
  if (dotIndex !== -1 && feeAmount.value.length - dotIndex >= 3) return
  if (feeAmount.value.length >= 9) return
  setFeeCandidate(`${feeAmount.value}${char}`)
}

function appendAmount(char: string): void {
  if (char === 'backspace') {
    amountDisplay.value = amountDisplay.value.slice(0, -1)
    if (amountDisplay.value === '') {
      amountDisplay.value = '0'
      amountStarted.value = false
    }
    return
  }
  if (char === 'clear') {
    amountDisplay.value = '0'
    amountStarted.value = false
    return
  }
  if (!amountStarted.value) {
    amountStarted.value = true
    if (char === '00' && (amountDisplay.value === '0' || amountDisplay.value === '0.0')) return
    if (amountDisplay.value === '0' || amountDisplay.value === '0.0') {
      amountDisplay.value = char === '.' ? '0.' : char
      return
    }
  }
  if (char === '.' && !amountDisplay.value.includes('.')) {
    amountDisplay.value += '.'
    return
  }
  if (char === '-' && !amountDisplay.value.startsWith('-')) {
    amountDisplay.value = '-' + amountDisplay.value
    return
  }
  if (char === '+' && amountDisplay.value.startsWith('-')) {
    amountDisplay.value = amountDisplay.value.slice(1)
    return
  }
  const dotIndex = amountDisplay.value.indexOf('.')
  if (dotIndex !== -1 && amountDisplay.value.length - dotIndex >= 3) return
  if (amountDisplay.value.length >= 9) return
  amountDisplay.value += char
}

function deleteKeyboardValue(): void {
  appendAmount('backspace')
}

function handleKeyboardSave(): void {
  if (canSubmit.value && !saving.value) void submit()
}

function swapAccounts(): void {
  if (sourceAccountId.value && targetAccountId.value) {
    ;[sourceAccountId.value, targetAccountId.value] = [targetAccountId.value, sourceAccountId.value]
  }
}

function goBack(): void {
  ;(document.activeElement as HTMLElement | null)?.blur()
  navigateBack(router, { name: 'home' })
}

async function submit(): Promise<void> {
  if (!finance || !appStore.ledgerId || !canSubmit.value) return
  // 捕获合并显示拆回：用户没改动输入框时，merchant 恢复为捕获商户名
  // （note 已单独保存捕获备注；用户改过框则输入即商户，note 保留）
  if (capturePresetCombined.value && merchant.value === capturePresetCombined.value) {
    merchant.value = capturePresetMerchant.value
  }
  saving.value = true
  errorMessage.value = ''
  try {
    const appliesDiscount =
      (mode.value === 'expense' || mode.value === 'credit_purchase' || mode.value === 'repayment') && hasDiscount.value
    const transferDiscount = mode.value === 'transfer' && hasDiscount.value
    const repaymentDiscount = mode.value === 'repayment' && hasDiscount.value
    const appliesAnyDiscount = appliesDiscount || transferDiscount
    const transferFee = mode.value === 'transfer' && feeMode.value && hasFee.value
    const originalAmountMinor = appliesAnyDiscount || transferFee
      ? parseCnyInputToMinor(amountDisplay.value)
      : undefined
    const discountMinor = appliesAnyDiscount
      ? parseCnyInputToMinor(discountAmount.value)
      : undefined
    const feeMinor = transferFee
      ? parseCnyInputToMinor(feeAmount.value)
      : undefined
    const amountMinor = parseCnyInputToMinor(
      transferFee ? actualArrival.value : appliesAnyDiscount ? actualSpending.value : amountDisplay.value,
    )
    if (amountMinor <= 0) throw new Error('优惠后金额必须大于 0')
    if (isEditMode.value && editTransactionId.value) {
      // 根据所选账户的 normalBalance 自动确定交易类型：
      // - expense 模式选了贷方账户 → credit_purchase
      // - credit_purchase 模式选了借方账户 → expense（换账户时自动降级）
      const selectedAccount = selectedSourceAccount.value
      const selectedTarget = selectedTargetAccount.value
      let selectedType = mode.value
      if (mode.value === 'expense' && selectedAccount?.normalBalance === 'credit') {
        selectedType = 'credit_purchase'
      } else if (mode.value === 'credit_purchase' && selectedAccount?.normalBalance === 'debit') {
        selectedType = 'expense'
      } else if (mode.value === 'transfer' && selectedTarget?.normalBalance === 'credit') {
        selectedType = 'repayment'
      }
      const input: EditTransactionFullInput = {
        ledgerId: appStore.ledgerId,
        transactionId: editTransactionId.value,
        type: selectedType,
        amountMinor,
        accountId: sourceAccountId.value,
        categoryId: selectedCategoryId.value,
        targetAccountId: targetAccountId.value || undefined,
        occurredAt: occurredAt.value || originalOccurredAt.value || new Date().toISOString(),
        merchant: merchant.value || undefined,
        note: note.value || undefined,
        attachmentDataUris: attachmentDataUris.value,
        originalAmountMinor,
        discountMinor,
        discountIncomeCategoryId: (mode.value === 'transfer' && transferDiscount)
          || (mode.value === 'repayment' && repaymentDiscount)
            ? discountIncomeCategoryId.value || undefined
            : undefined,
      }
      await finance.editTransactionFull(input)
    } else {
      const occurredAtValue = occurredAt.value || new Date().toISOString()
      // P1：捕获元数据透传（非空才写入，落库 capture_source/parser_version/confidence）
      const captureMeta = {
        captureSource: captureSource.value || undefined,
        parserVersion: captureParserVersion.value || undefined,
        confidence: captureConfidence.value,
        fingerprint: captureFingerprint.value || undefined,
      }
      if (mode.value === 'expense') {
        if (selectedSourceAccount.value?.normalBalance === 'credit') {
          await finance.createCreditPurchase({
            ledgerId: appStore.ledgerId,
            amountMinor,
            liabilityAccountId: sourceAccountId.value,
            categoryId: selectedCategoryId.value,
            occurredAt: occurredAtValue,
            merchant: merchant.value || undefined,
            note: note.value || undefined,
            ...captureMeta,
            attachmentDataUris: attachmentDataUris.value,
            originalAmountMinor,
            discountMinor,
          })
        } else {
          await finance.createExpense({
            ledgerId: appStore.ledgerId,
            amountMinor,
            accountId: sourceAccountId.value,
            categoryId: selectedCategoryId.value,
            occurredAt: occurredAtValue,
            merchant: merchant.value || undefined,
            note: note.value || undefined,
            ...captureMeta,
            attachmentDataUris: attachmentDataUris.value,
            originalAmountMinor,
            discountMinor,
          })
        }
      } else if (mode.value === 'income') {
        await finance.createIncome({
          ledgerId: appStore.ledgerId,
          amountMinor,
          accountId: sourceAccountId.value,
          categoryId: selectedCategoryId.value,
          occurredAt: occurredAtValue,
          merchant: merchant.value || undefined,
          note: note.value || undefined,
          ...captureMeta,
          attachmentDataUris: attachmentDataUris.value,
        })
      } else if (mode.value === 'transfer') {
        if (selectedTargetAccount.value?.normalBalance === 'credit') {
          await finance.createRepayment({
            ledgerId: appStore.ledgerId,
            amountMinor,
            sourceAccountId: sourceAccountId.value,
            liabilityAccountId: targetAccountId.value,
            occurredAt: occurredAtValue,
            merchant: merchant.value || undefined,
            note: note.value || undefined,
            ...captureMeta,
            attachmentDataUris: attachmentDataUris.value,
            ...(transferDiscount ? {
              originalAmountMinor,
              discountMinor,
              discountIncomeCategoryId: discountIncomeCategoryId.value || undefined,
            } : {}),
          })
        } else {
          // 手续费分类：费用 → "其他支出"
          const feeCategory = transferFee
            ? expenseCategories.value.find((c) => c.name.includes('其他支出') || c.name === '其它')
            : undefined
          if (transferFee && !feeCategory) {
            errorMessage.value = '未找到「其他支出」分类，无法记录手续费'
            saving.value = false
            return
          }
          await finance.createTransfer({
            ledgerId: appStore.ledgerId,
            amountMinor,
            sourceAccountId: sourceAccountId.value,
            targetAccountId: targetAccountId.value,
            occurredAt: occurredAtValue,
            note: note.value || undefined,
            feeMinor: transferFee ? feeMinor : undefined,
            feeCategoryId: feeCategory?.id,
            ...captureMeta,
            attachmentDataUris: attachmentDataUris.value,
            ...(transferDiscount ? {
              originalAmountMinor,
              discountMinor,
              discountIncomeCategoryId: discountIncomeCategoryId.value || undefined,
            } : {}),
          })
        }
      } else if (mode.value === 'credit_purchase') {
        await finance.createCreditPurchase({
          ledgerId: appStore.ledgerId,
          amountMinor,
          liabilityAccountId: sourceAccountId.value,
          categoryId: selectedCategoryId.value,
          occurredAt: occurredAtValue,
          merchant: merchant.value || undefined,
          note: note.value || undefined,
          ...captureMeta,
          attachmentDataUris: attachmentDataUris.value,
        })
      } else if (mode.value === 'repayment') {
        await finance.createRepayment({
          ledgerId: appStore.ledgerId,
          amountMinor,
          sourceAccountId: sourceAccountId.value,
          liabilityAccountId: targetAccountId.value,
          occurredAt: occurredAtValue,
          merchant: merchant.value || undefined,
          note: note.value || undefined,
          ...captureMeta,
          attachmentDataUris: attachmentDataUris.value,
          ...(repaymentDiscount ? {
            originalAmountMinor,
            discountMinor,
            discountIncomeCategoryId: discountIncomeCategoryId.value || undefined,
          } : {}),
        })
      } else {
        await finance.createRefund({
          ledgerId: appStore.ledgerId,
          amountMinor,
          refundAccountId: sourceAccountId.value,
          categoryId: selectedCategoryId.value,
          occurredAt: occurredAtValue,
          merchant: merchant.value || undefined,
          note: note.value || undefined,
          ...captureMeta,
          originalTransactionId: originalRefundTransactionId.value,
          attachmentDataUris: attachmentDataUris.value,
        })
      }
    }
    ;(document.activeElement as HTMLElement | null)?.blur()
    // P1：确认入账成功 → 指纹置 confirmed（永久拦截同一笔重复捕获；未保存则 30 分钟后自动允许重捕）
    if (captureFingerprint.value) {
      void PaymentCapture.markCaptureConfirmed({ fingerprint: captureFingerprint.value }).catch(() => {})
    }
    if (captureId.value > 0) {
      void PaymentCapture.acknowledgeEvents({ ids: [captureId.value] }).catch(() => {})
    }
    navigateBack(router, { name: 'home' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

async function addNewCategory(): Promise<void> {
  await router.push({
    name: 'categories',
    query: { kind: usesIncomeCategory.value ? 'income' : 'expense' },
  })
}

const pageRef = ref<HTMLElement>()
let frameScrollHandler: (() => void) | null = null

function preventFrameScroll(): void {
  const frame = pageRef.value?.closest('.route-page-frame') as HTMLElement | null
  if (!frame) return
  if (frame.scrollTop !== 0 || frame.scrollLeft !== 0) {
    frame.scrollTop = 0
    frame.scrollLeft = 0
  }
}

onMounted(async () => {
  await initializeFormState()
  initialActivation = false
  void nextTick(() => {
    preventFrameScroll()
    const frame = pageRef.value?.closest('.route-page-frame') as HTMLElement | null
    if (frame) {
      frameScrollHandler = () => {
        if (frame.scrollTop !== 0 || frame.scrollLeft !== 0) {
          frame.scrollTop = 0
          frame.scrollLeft = 0
        }
      }
      frame.addEventListener('scroll', frameScrollHandler, { passive: true })
    }
  })
})

onActivated(async () => {
  // 首次激活由 onMounted 处理；后续从 KeepAlive 缓存恢复时重新初始化表单
  if (initialActivation) return
  await initializeFormState()
})

watch(
  () => [activeAccounts.value.length, sourceAccountId.value, targetAccountId.value, mode.value],
  () => {
    if (!loading.value && sourceAccountId.value === '') resetAccountsForMode(mode.value)
  },
)

onUnmounted(() => {
  if (frameScrollHandler) {
    const frame = pageRef.value?.closest('.route-page-frame') as HTMLElement | null
    frame?.removeEventListener('scroll', frameScrollHandler)
    frameScrollHandler = null
  }
})
</script>

<template>
  <main ref="pageRef" class="record-page">
    <header class="record-header">
      <button class="header-btn" type="button" aria-label="关闭" @click="goBack">
        <ChevronLeft :size="24" :stroke-width="2" />
      </button>
      <nav class="mode-tabs">
        <button
          v-for="option in MODE_OPTIONS"
          :key="option.value"
          type="button"
          :class="['mode-tab', { active: visibleMode(mode) === option.value }]"
          :disabled="isEditMode || isCopyMode"
          @click="switchMode(option.value)"
        >
          {{ option.label }}
        </button>
      </nav>
      <button
        class="header-btn"
        type="button"
        aria-label="添加分类"
        :disabled="!hasCategory"
        @click="addNewCategory"
      >
        <Plus :size="22" :stroke-width="2" />
      </button>
    </header>

    <section class="record-body">
      <!-- 分类网格 -->
      <div v-if="hasCategory" class="category-grid">
        <div
          v-for="cat in activeRootCategories"
          :key="cat.id"
          :class="['category-item', { active: selectedRootId === cat.id }]"
          @click="selectCategory(cat)"
        >
          <CategoryIcon
            :icon-key="cat.iconKey"
            :color="selectedRootId === cat.id ? 'var(--color-primary-500)' : 'var(--color-text-tertiary)'"
            :size="32"
            :label="cat.name"
          />
          <span class="category-item__label">{{ cat.name }}</span>
        </div>
      </div>
      <div v-if="hasCategory && activeChildCategories.length" class="category-children">
        <span>二级分类</span>
        <div>
          <button
            v-for="child in activeChildCategories"
            :key="child.id"
            type="button"
            :class="{ active: selectedCategoryId === child.id }"
            @click="selectCategory(child)"
          >
            {{ child.name }}
          </button>
        </div>
      </div>

      <!-- 转账/还款模式账户选择 -->
      <div v-else-if="isDualAccountMode" class="transfer-panel">
        <button
          class="transfer-card"
          type="button"
          @click="openAccountPicker('source')"
        >
          <div class="transfer-card__header">
            <span class="transfer-card__label">{{ isRepayment ? '还款账户' : '转出账户' }}</span>
            <span class="transfer-card__chevron" aria-hidden="true">›</span>
          </div>
          <template v-if="selectedSourceAccount">
            <div class="transfer-card__name">{{ selectedSourceAccount.name }}</div>
            <div class="transfer-card__balance">
              {{ formatMinorToCny(selectedSourceAccount.balanceMinor) }}
            </div>
          </template>
          <template v-else>
            <div class="transfer-card__placeholder">
              {{ isRepayment ? '点击选择还款账户' : '点击选择转出账户' }}
            </div>
          </template>
        </button>
        <button
          v-if="isTransfer"
          class="swap-btn"
          type="button"
          aria-label="交换账户"
          @click="swapAccounts"
        >
          <ArrowLeftRight :size="24" :stroke-width="1.75" />
        </button>
        <button
          class="transfer-card"
          type="button"
          @click="openAccountPicker('target')"
        >
          <div class="transfer-card__header">
            <span class="transfer-card__label">{{ isRepayment ? '信用账户' : '转入账户' }}</span>
            <span class="transfer-card__chevron" aria-hidden="true">›</span>
          </div>
          <template v-if="selectedTargetAccount">
            <div class="transfer-card__name">{{ selectedTargetAccount.name }}</div>
            <div class="transfer-card__balance">
              {{ formatMinorToCny(selectedTargetAccount.balanceMinor) }}
            </div>
          </template>
          <template v-else>
            <div class="transfer-card__placeholder">
              {{ isRepayment ? '点击选择信用账户' : '点击选择转入账户' }}
            </div>
          </template>
        </button>
      </div>
    </section>

    <!-- 转账优惠收入分类选择 -->
    <div v-if="(isTransfer || isRepayment) && hasDiscount" class="discount-category-row">
      <span class="discount-category-label">优惠归属</span>
      <select
        v-model="discountIncomeCategoryId"
        class="discount-category-select"
        aria-label="选择优惠收入分类"
      >
        <option disabled value="">选择收入分类</option>
        <option
          v-for="cat in transferDiscountIncomeCategories"
          :key="cat.id"
          :value="cat.id"
        >
          {{ cat.name }}
        </option>
      </select>
    </div>

    <section class="record-bottom">
      <!-- 手续费模式：替换顶栏（转账提现等） -->
      <div v-if="feeMode" class="note-row note-row--discount">
        <div class="discount-left">
          <span class="discount-title">手续费</span>
          <span class="discount-sub">实际到账{{ actualArrival }}</span>
        </div>
        <span class="discount-value" :style="{ color: themeColor }">
          {{ feeAmount || '0' }}
        </span>
      </div>
      <!-- 优惠模式：替换顶栏 -->
      <div v-else-if="discountMode" class="note-row note-row--discount">
        <div class="discount-left">
          <span class="discount-title">优惠</span>
          <span class="discount-sub">实际支出{{ actualSpending }}</span>
        </div>
        <span class="discount-value" :style="{ color: themeColor }">
          {{ discountAmount || '0' }}
        </span>
      </div>
      <!-- P1：正金额方向提示（外部打款/提现/红包等，用户确认方向，不强制切换） -->
      <div v-if="captureHintVisible" class="capture-direction-hint">
        <span class="capture-direction-hint__dot"></span>
        检测到可能是{{ directionHintText }}——请在顶部切换到对应类型后再保存
      </div>

      <!-- 正常模式：备注 + 金额 -->
      <div v-else class="note-row">
        <input
          v-model="merchant"
          type="text"
          class="note-input"
          placeholder="点此输入备注…"
          :maxlength="capturePresetCombined ? 80 : 40"
        />
        <div class="amount-display" :style="{ color: themeColor }">
          {{ amountDisplay }}
        </div>
      </div>

      <!-- 快捷标签 -->
      <div class="quick-tags">
        <button
          v-for="tag in quickTags"
          :key="tag.label"
          type="button"
          :class="[
            'quick-tag',
            {
              active:
                (tag.action === 'account' && !!selectedSourceAccount) ||
                (tag.action === 'discount' && hasDiscount) ||
                (tag.action === 'image' && attachmentDataUris.length > 0),
              'quick-tag--discount-edit': tag.action === 'discount' && discountMode,
            },
          ]"
          @click="pickQuickTag(tag)"
        >
          <template v-if="tag.action === 'account' && selectedSourceAccount">
            {{ selectedSourceAccount.name }}
          </template>
          <template v-else-if="tag.action === 'discount'">
            <span class="quick-tag__discount-label">优惠</span>
            <template v-if="discountMode">
              <span class="quick-tag__discount-close" aria-hidden="true">
                ×
              </span>
            </template>
            <span v-else-if="hasDiscount" class="quick-tag__discount-value">
              ({{ discountValueDisplay }})
            </span>
          </template>
          <template v-else-if="tag.action === 'date'">{{ dateLabel }}</template>
          <template v-else>{{ tag.label }}</template>
        </button>
      </div>

      <p v-if="errorMessage" class="record-error" role="alert">{{ errorMessage }}</p>

      <div v-if="attachmentDataUris.length" class="attachment-preview">
        <div v-for="(dataUri, index) in attachmentDataUris" :key="`${index}-${dataUri.length}`">
          <img :src="dataUri" :alt="`凭证图片 ${index + 1}`" />
          <button
            type="button"
            :aria-label="`移除图片 ${index + 1}`"
            @click="attachmentDataUris.splice(index, 1)"
          >
            ×
          </button>
        </div>
      </div>
      <input
        ref="fileInput"
        class="visually-hidden"
        type="file"
        accept="image/*"
        multiple
        @change="handleImageSelect"
      />
    </section>

    <NumberKeyboard
      v-model:show="keyboardVisible"
      class="record-keyboard"
      :class="{ 'record-keyboard--disabled': !canSubmit || saving }"
      theme="custom"
      :extra-key="['00', '.']"
      :close-button-text="saveButtonLabel"
      :close-button-loading="saving"
      :blur-on-close="false"
      :hide-on-click-outside="false"
      @input="appendAmount(String($event))"
      @delete="deleteKeyboardValue"
      @close="handleKeyboardSave"
    />

    <!-- 账户选择弹窗 -->
    <AccountPicker
      v-model:show="accountPickerShow"
      :accounts="pickerAccounts"
      :selected-id="accountPickerContext === 'source' ? sourceAccountId : targetAccountId"
      :title="pickerTitle"
      :show-no-selection="false"
      @select="handleAccountSelect"
    />

    <!-- 日期选择弹窗 -->
    <DatePicker
      v-model:show="datePickerShow"
      :initial-date="occurredAt"
      @select="handleDateSelect"
    />
  </main>
</template>

<style scoped>
.record-page {
  display: flex;
  height: 100dvh;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-surface);
}

.record-header {
  display: grid;
  grid-template-columns: 48px 1fr 48px;
  align-items: center;
  padding: env(safe-area-inset-top) var(--space-3) 0;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}

.header-btn {
  display: flex;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  color: var(--color-text-primary);
  background: transparent;
  border: 0;
  border-radius: 50%;
}

.header-btn:disabled {
  opacity: 0.35;
}

.mode-tabs {
  display: flex;
  min-width: 0;
  gap: var(--space-6);
  justify-content: center;
  overflow-x: auto;
  scrollbar-width: none;
}

.mode-tabs::-webkit-scrollbar {
  display: none;
}

.mode-tab {
  position: relative;
  flex-shrink: 0;
  padding: var(--space-3) var(--space-2);
  color: var(--color-text-tertiary);
  font-size: 15px;
  font-weight: 500;
  background: transparent;
  border: 0;
  white-space: nowrap;
}

.mode-tab.active {
  color: var(--color-text-primary);
  font-weight: 600;
}

.mode-tab.active::after {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 24px;
  height: 3px;
  background: var(--color-text-primary);
  border-radius: 2px;
  transform: translateX(-50%);
  content: '';
}

.mode-tab:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.record-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4) var(--space-4);
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-3) var(--space-2);
}

.category-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-1);
  background: transparent;
  border: 0;
  border-radius: var(--radius-card);
  cursor: pointer;
}

.category-item__icon {
  display: flex;
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  color: var(--color-text-tertiary);
  background: var(--color-background);
  border-radius: 14px;
  transition: all 0.15s;
  border: 2px solid transparent;
}

.category-item.active .category-item__icon {
  color: var(--color-primary-600);
  background: var(--color-primary-50);
  border-color: var(--color-primary-500);
}

.category-item.active :deep(.category-icon) {
  box-shadow: 0 0 0 2px var(--color-primary-500);
}

.category-item__label {
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
  line-height: 1.2;
  text-align: center;
}

.category-item.active .category-item__label {
  color: var(--color-primary-600);
  font-weight: 600;
}

.category-children {
  display: grid;
  margin-top: var(--space-4);
  gap: var(--space-2);
}

.category-children > span {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}

.category-children > div {
  display: flex;
  overflow-x: auto;
  gap: var(--space-2);
  scrollbar-width: none;
}

.category-children button {
  min-height: 36px;
  padding: 0 var(--space-4);
  flex: none;
  color: var(--color-text-secondary);
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-pill);
}

.category-children button.active {
  color: var(--color-primary-700);
  background: var(--color-primary-50);
  border-color: var(--color-primary-500);
}

.transfer-panel {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
}

.transfer-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: 100%;
  padding: var(--space-4);
  text-align: left;
  color: var(--color-text-primary);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-card);
  cursor: pointer;
}

.transfer-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.transfer-card__label {
  color: var(--color-text-secondary);
  font-size: var(--type-body-size);
}

.transfer-card__chevron {
  color: var(--color-text-tertiary);
  font-size: 20px;
  line-height: 1;
}

.transfer-card__name {
  color: var(--color-text-primary);
  font-size: var(--type-body-size);
  font-weight: 600;
}

.transfer-card__balance {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  font-variant-numeric: tabular-nums;
}

.transfer-card__placeholder {
  color: var(--color-text-tertiary);
  font-size: var(--type-body-size);
}

.swap-btn {
  display: flex;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  color: var(--color-primary-600);
  justify-self: center;
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: 50%;
  cursor: pointer;
}

.record-bottom {
  padding: var(--space-2) var(--space-4) calc(246px + env(safe-area-inset-bottom));
  background: var(--color-surface);
  border-top: 1px solid var(--color-divider);
}

.note-row {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2) 0 var(--space-3);
}

.capture-direction-hint {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-1) 0 var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-warning, #f59e0b) 12%, transparent);
  color: var(--color-warning, #b45309);
  font-size: var(--type-caption-size);
}

.capture-direction-hint__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex: none;
}

.note-input {
  flex: 1;
  min-width: 0;
  color: var(--color-text-secondary);
  font-size: var(--type-body-size);
  background: transparent;
  border: 0;
  outline: 0;
}

.note-input::placeholder {
  color: var(--color-text-tertiary);
}

.amount-display {
  font-size: 36px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.quick-tags {
  display: flex;
  gap: var(--space-2);
  padding-bottom: var(--space-2);
  overflow-x: auto;
  scrollbar-width: none;
}

.quick-tags::-webkit-scrollbar {
  display: none;
}

.record-error {
  margin: 0 0 var(--space-2);
  color: var(--color-danger);
  font-size: var(--type-caption-size);
  line-height: var(--type-caption-line);
  text-align: right;
}

.quick-tag {
  flex-shrink: 0;
  padding: var(--space-2) var(--space-3);
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-pill);
  white-space: nowrap;
}

.quick-tag.active {
  color: var(--color-primary-600);
  background: var(--color-primary-50);
  border-color: var(--color-primary-200);
}

.quick-tag--discount-edit {
  color: var(--color-primary-600) !important;
  background: var(--color-primary-50) !important;
  border-color: var(--color-primary-200) !important;
  padding-left: var(--space-3);
  padding-right: var(--space-3);
}

.quick-tag__discount-label {
  font-weight: 500;
}

.quick-tag__discount-close {
  display: inline-flex;
  width: 18px;
  height: 18px;
  margin-left: var(--space-1);
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  background: var(--color-primary-500);
  border: 0;
  border-radius: 50%;
  cursor: pointer;
}

.quick-tag__discount-value {
  color: var(--color-primary-600);
  font-size: var(--type-caption-size);
  font-variant-numeric: tabular-nums;
  margin-left: 2px;
}

.quick-tag:disabled {
  color: var(--color-text-tertiary);
  opacity: 0.5;
  cursor: not-allowed;
}

.attachment-preview {
  display: flex;
  padding: 0 var(--space-4) var(--space-2);
  gap: var(--space-2);
  overflow-x: auto;
}

.attachment-preview > div {
  position: relative;
  flex: none;
}

.attachment-preview img {
  display: block;
  width: 54px;
  height: 54px;
  object-fit: cover;
  border-radius: var(--radius-control);
}

.attachment-preview button {
  position: absolute;
  top: -5px;
  right: -5px;
  display: grid;
  width: 20px;
  height: 20px;
  padding: 0;
  place-items: center;
  color: white;
  background: var(--color-danger);
  border: 0;
  border-radius: 50%;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  clip-path: inset(50%);
}

.note-row--discount {
  gap: var(--space-3);
  padding: var(--space-2) 0 var(--space-3);
}

.discount-left {
  flex: 1;
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.discount-title {
  color: var(--color-text-primary);
  font-size: 17px;
  font-weight: 600;
}

.discount-sub {
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
}

.discount-value {
  font-size: 36px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.record-keyboard {
  --van-number-keyboard-background: var(--color-background);
  --van-number-keyboard-key-background: var(--color-surface);
  --van-number-keyboard-key-active-color: var(--color-primary-50);
  --van-number-keyboard-button-background: var(--color-primary-600);
  --van-number-keyboard-title-color: var(--color-text-secondary);
  --van-number-keyboard-key-height: 52px;
  --van-number-keyboard-z-index: 70;
}

.record-keyboard--disabled :deep(.van-key--blue) {
  pointer-events: none;
  opacity: 0.4;
}

.confirm-content {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-2) 0;
}

.confirm-title {
  margin: 0;
  color: var(--color-text-primary);
  font-size: var(--type-section-title-size);
  font-weight: 600;
}

.confirm-text {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--type-body-size);
  line-height: var(--type-body-line);
}

.confirm-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  padding-top: var(--space-2);
}

.primary-button {
  display: flex;
  height: 48px;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  background: var(--color-primary-600);
  border: 0;
  border-radius: var(--radius-control);
}

.primary-button:disabled {
  opacity: 0.55;
}

.secondary-button {
  display: flex;
  height: 48px;
  align-items: center;
  justify-content: center;
  color: var(--color-text-primary);
  font-weight: 500;
  background: transparent;
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
}

.secondary-button:disabled {
  opacity: 0.55;
}

.form-error {
  padding: var(--space-2) var(--space-3);
  color: var(--color-danger);
  font-size: var(--type-body-size);
  background: rgb(185 67 67 / 8%);
  border-radius: var(--radius-control);
}

.discount-category-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  margin: 0 var(--space-3);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
}
.discount-category-label {
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
  flex-shrink: 0;
}
.discount-category-select {
  flex: 1;
  padding: var(--space-1) var(--space-2);
  font-size: var(--type-body-size);
  color: var(--color-text-primary);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
}
</style>
