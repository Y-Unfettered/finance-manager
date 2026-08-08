<script setup lang="ts">
import {
  ArrowLeftRight,
  Award,
  BookOpen,
  Bus,
  Car,
  ChevronLeft,
  Coins,
  Dumbbell,
  Edit3,
  Gamepad2,
  Gift,
  HeartPulse,
  Home,
  Laptop,
  LayoutGrid,
  Package,
  Phone,
  Plus,
  Shirt,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Utensils,
  UtensilsCrossed,
  Wallet,
  X,
  Zap,
} from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AccountBalanceRecord } from '@/domain/entities'
import { formatMinorToCny, parseCnyInputToMinor } from '@/domain/money'
import {
  useFinanceService,
  type EditTransactionFullInput,
  type ExpenseCategoryOption,
  type IncomeCategoryOption,
  type TransactionMetadata,
} from '@/features/finance/finance-service'
import { useAppStore } from '@/stores/app'
import AccountPicker from './AccountPicker.vue'
import DatePicker from './DatePicker.vue'

type EntryMode = 'expense' | 'income' | 'transfer'

interface CategoryIcon {
  name: string
  icon: typeof Wallet
}

const EXPENSE_ICONS: readonly CategoryIcon[] = [
  { name: '餐饮', icon: UtensilsCrossed },
  { name: '三餐', icon: Utensils },
  { name: '零食', icon: Sparkles },
  { name: '交通', icon: Bus },
  { name: '购物', icon: ShoppingCart },
  { name: '居住', icon: Home },
  { name: '医疗', icon: HeartPulse },
  { name: '娱乐', icon: Gamepad2 },
  { name: '人情往来', icon: Gift },
  { name: '其他支出', icon: LayoutGrid },
  { name: '日用品', icon: Package },
  { name: '水电煤', icon: Zap },
  { name: '电器数码', icon: Laptop },
  { name: '话费网费', icon: Phone },
  { name: '衣服', icon: Shirt },
  { name: '汽车/加油', icon: Car },
  { name: '旅行', icon: Sparkles },
  { name: '学习', icon: BookOpen },
  { name: '运动', icon: Dumbbell },
  { name: '宠物', icon: Sparkles },
  { name: '孩子', icon: Gift },
  { name: '其它', icon: LayoutGrid },
] as const

const INCOME_ICONS: readonly CategoryIcon[] = [
  { name: '工资', icon: Coins },
  { name: '奖金', icon: Award },
  { name: '红包', icon: Gift },
  { name: '投资收益', icon: TrendingUp },
  { name: '其他收入', icon: Plus },
  { name: '生活费', icon: Home },
  { name: '收红包', icon: Gift },
  { name: '外快', icon: Sparkles },
  { name: '股票基金', icon: TrendingUp },
] as const

const EXPENSE_QUICK_TAGS = [
  { label: '美团月付', action: 'account' },
  { label: '今天', action: 'date' },
  { label: '报销', action: 'disabled' },
  { label: '图片', action: 'disabled' },
  { label: '优惠', action: 'discount' },
  { label: '备注', action: 'note' },
] as const

const INCOME_QUICK_TAGS = [
  { label: '微信(大号)', action: 'account' },
  { label: '今天', action: 'date' },
  { label: '图片', action: 'disabled' },
  { label: '备注', action: 'note' },
] as const

const TRANSFER_QUICK_TAGS = [
  { label: '今天', action: 'date' },
  { label: '图片', action: 'disabled' },
  { label: '手续费', action: 'note' },
  { label: '优惠', action: 'discount' },
  { label: '备注', action: 'note' },
] as const

type QuickTagAction = 'account' | 'date' | 'disabled' | 'discount' | 'note'

interface QuickTagDef {
  label: string
  action: QuickTagAction
}

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const finance = useFinanceService()

const mode = ref<EntryMode>('expense')
const accounts = ref<AccountBalanceRecord[]>([])
const expenseCategories = ref<ExpenseCategoryOption[]>([])
const incomeCategories = ref<IncomeCategoryOption[]>([])
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')

const amountDisplay = ref('0.0')
const selectedCategoryId = ref('')
const selectedCategoryName = ref('')
const merchant = ref('')
const note = ref('')

const sourceAccountId = ref('')
const targetAccountId = ref('')

const accountPickerShow = ref(false)
const accountPickerContext = ref<'source' | 'target'>('source')
const datePickerShow = ref(false)
const occurredAt = ref('')
const dateLabel = ref('今天')

const discountMode = ref(false)
const discountAmount = ref('')

const editTransactionId = ref('')
const isEditMode = ref(false)
const isCopyMode = ref(false)
const originalOccurredAt = ref('')

const debitAccounts = computed(() => accounts.value.filter((a) => a.normalBalance === 'debit'))

const expenseIconMap = computed<Record<string, CategoryIcon>>(() => {
  const map: Record<string, CategoryIcon> = {}
  for (const item of EXPENSE_ICONS) map[item.name] = item
  return map
})

const incomeIconMap = computed<Record<string, CategoryIcon>>(() => {
  const map: Record<string, CategoryIcon> = {}
  for (const item of INCOME_ICONS) map[item.name] = item
  return map
})

const expenseGridIcons = computed(() =>
  expenseCategories.value.map((c) => expenseIconMap.value[c.name]?.icon ?? LayoutGrid),
)
const incomeGridIcons = computed(() =>
  incomeCategories.value.map((c) => incomeIconMap.value[c.name]?.icon ?? LayoutGrid),
)

const quickTags = computed<readonly QuickTagDef[]>(() => {
  if (mode.value === 'expense') return EXPENSE_QUICK_TAGS
  if (mode.value === 'income') return INCOME_QUICK_TAGS
  return TRANSFER_QUICK_TAGS
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
  if (mode.value === 'expense' || mode.value === 'income') {
    return sourceAccountId.value !== '' && selectedCategoryId.value !== ''
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

const isExpense = computed(() => mode.value === 'expense')
const isIncome = computed(() => mode.value === 'income')
const isTransfer = computed(() => mode.value === 'transfer')

const themeColor = computed(() => {
  if (isExpense.value) return 'var(--color-danger)'
  if (isIncome.value) return 'var(--color-primary-500)'
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
    const [accRows, expCats, incCats] = await Promise.all([
      finance.listAccounts(appStore.ledgerId),
      finance.listExpenseCategories(appStore.ledgerId),
      finance.listIncomeCategories(appStore.ledgerId),
    ])
    accounts.value = accRows
    expenseCategories.value = expCats
    incomeCategories.value = incCats
    if (sourceAccountId.value === '') sourceAccountId.value = debitAccounts.value[0]?.id ?? ''
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
  if (tx.type === 'income') mode.value = 'income'
  else if (tx.type === 'transfer') mode.value = 'transfer'
  else mode.value = 'expense'
  amountDisplay.value = formatMinorToCny(tx.amountMinor)
  merchant.value = tx.merchant ?? ''
  note.value = tx.note ?? ''
  if (tx.accountId) sourceAccountId.value = tx.accountId
  if (tx.categoryId) selectedCategoryId.value = tx.categoryId
  if (tx.categoryName) selectedCategoryName.value = tx.categoryName
  originalOccurredAt.value = tx.occurredAt
}

function switchMode(next: EntryMode): void {
  if (mode.value === next || saving.value) return
  mode.value = next
  errorMessage.value = ''
  if (next === 'expense') {
    if (expenseCategories.value.length > 0) {
      selectedCategoryId.value = expenseCategories.value[0]!.id
      selectedCategoryName.value = expenseCategories.value[0]!.name
    }
  } else if (next === 'income') {
    if (incomeCategories.value.length > 0) {
      selectedCategoryId.value = incomeCategories.value[0]!.id
      selectedCategoryName.value = incomeCategories.value[0]!.name
    }
  } else if (next === 'transfer') {
    selectedCategoryId.value = ''
    selectedCategoryName.value = ''
    const sources = debitAccounts.value
    if (sourceAccountId.value === '' && sources.length > 0) sourceAccountId.value = sources[0]!.id
    if (targetAccountId.value === '' && sources.length > 1) targetAccountId.value = sources[1]!.id
    else if (targetAccountId.value === '' && sources.length > 0)
      targetAccountId.value = sources[0]!.id
  }
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
  if (tag.action === 'disabled') {
    return
  }
  if (tag.action === 'note') {
    const val = prompt('输入备注内容', note.value)
    if (val !== null) note.value = val
    return
  }
}

function handleAccountSelect(acc: AccountBalanceRecord | null): void {
  if (!acc) return
  if (accountPickerContext.value === 'source') {
    sourceAccountId.value = acc.id
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
    discountAmount.value = discountAmount.value.slice(0, -1)
    return
  }
  if (char === 'clear') {
    discountAmount.value = ''
    return
  }
  if (char === '-' || char === '+') return
  if (discountAmount.value === '' || discountAmount.value === '0') {
    discountAmount.value = char === '.' ? '0.' : char
    return
  }
  if (char === '.' && !discountAmount.value.includes('.')) {
    discountAmount.value += '.'
    return
  }
  const dotIndex = discountAmount.value.indexOf('.')
  if (dotIndex !== -1 && discountAmount.value.length - dotIndex >= 3) return
  if (discountAmount.value.length >= 9) return
  discountAmount.value += char
}

function appendAmount(char: string): void {
  if (discountMode.value) {
    appendDiscount(char)
    return
  }
  if (char === 'backspace') {
    amountDisplay.value = amountDisplay.value.slice(0, -1)
    if (amountDisplay.value === '') amountDisplay.value = '0'
    return
  }
  if (char === 'clear') {
    amountDisplay.value = '0.0'
    return
  }
  if (amountDisplay.value === '0' || amountDisplay.value === '0.0') {
    amountDisplay.value = char === '.' ? '0.' : char
    return
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

function swapAccounts(): void {
  if (sourceAccountId.value && targetAccountId.value) {
    ;[sourceAccountId.value, targetAccountId.value] = [targetAccountId.value, sourceAccountId.value]
  }
}

function goBack(): void {
  void router.replace({ name: 'home' })
}

async function submit(): Promise<void> {
  if (!finance || !appStore.ledgerId || !canSubmit.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    const amountMinor = parseCnyInputToMinor(amountDisplay.value)
    if (isEditMode.value && editTransactionId.value) {
      const input: EditTransactionFullInput = {
        ledgerId: appStore.ledgerId,
        transactionId: editTransactionId.value,
        type: mode.value === 'income' ? 'income' : 'expense',
        amountMinor,
        accountId: sourceAccountId.value,
        categoryId: selectedCategoryId.value,
        occurredAt: originalOccurredAt.value || new Date().toISOString(),
        merchant: merchant.value || undefined,
        note: note.value || undefined,
      }
      await finance.editTransactionFull(input)
    } else {
      const occurredAtValue = occurredAt.value || new Date().toISOString()
      if (mode.value === 'expense') {
        await finance.createExpense({
          ledgerId: appStore.ledgerId,
          amountMinor,
          accountId: sourceAccountId.value,
          categoryId: selectedCategoryId.value,
          occurredAt: occurredAtValue,
          merchant: merchant.value || undefined,
          note: note.value || undefined,
        })
      } else if (mode.value === 'income') {
        await finance.createIncome({
          ledgerId: appStore.ledgerId,
          amountMinor,
          accountId: sourceAccountId.value,
          categoryId: selectedCategoryId.value,
          occurredAt: occurredAtValue,
          merchant: merchant.value || undefined,
          note: note.value || undefined,
        })
      } else {
        await finance.createTransfer({
          ledgerId: appStore.ledgerId,
          amountMinor,
          sourceAccountId: sourceAccountId.value,
          targetAccountId: targetAccountId.value,
          occurredAt: occurredAtValue,
          note: note.value || undefined,
        })
      }
    }
    await router.replace({ name: 'home', query: { saved: '1' } })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

async function addNewCategory(): Promise<void> {
  const name = prompt('输入新分类名称')
  if (!name || !finance || !appStore.ledgerId) return
  try {
    if (mode.value === 'expense') {
      const id = await finance.createExpenseCategory(appStore.ledgerId, name)
      expenseCategories.value = await finance.listExpenseCategories(appStore.ledgerId)
      selectedCategoryId.value = id
      selectedCategoryName.value = name
    } else if (mode.value === 'income') {
      const id = await finance.createIncomeCategory(appStore.ledgerId, name)
      incomeCategories.value = await finance.listIncomeCategories(appStore.ledgerId)
      selectedCategoryId.value = id
      selectedCategoryName.value = name
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  }
}

onMounted(async () => {
  await loadOptions()
  const editId = route.query.edit
  const copyId = route.query.copy
  if (typeof editId === 'string' && editId) {
    editTransactionId.value = editId
    isEditMode.value = true
    await loadTransactionForEdit(editId)
  } else if (typeof copyId === 'string' && copyId) {
    editTransactionId.value = copyId
    isCopyMode.value = true
    await loadTransactionForEdit(copyId)
    amountDisplay.value = '0.0'
  }
})

watch(
  () => [debitAccounts.value.length, sourceAccountId.value],
  () => {
    if (!loading.value && sourceAccountId.value === '' && debitAccounts.value.length > 0) {
      sourceAccountId.value = debitAccounts.value[0]!.id
    }
  },
)
</script>

<template>
  <main class="record-page">
    <header class="record-header">
      <button class="header-btn" type="button" aria-label="关闭" @click="goBack">
        <ChevronLeft :size="24" :stroke-width="2" />
      </button>
      <nav class="mode-tabs">
        <button
          type="button"
          :class="['mode-tab', { active: isExpense }]"
          :disabled="isEditMode || isCopyMode"
          @click="switchMode('expense')"
        >
          支出
        </button>
        <button
          type="button"
          :class="['mode-tab', { active: isIncome }]"
          :disabled="isEditMode || isCopyMode"
          @click="switchMode('income')"
        >
          收入
        </button>
        <button
          type="button"
          :class="['mode-tab', { active: isTransfer }]"
          :disabled="isEditMode || isCopyMode"
          @click="switchMode('transfer')"
        >
          转账
        </button>
      </nav>
      <button class="header-btn" type="button" aria-label="添加分类" @click="addNewCategory">
        <Plus :size="22" :stroke-width="2" />
      </button>
    </header>

    <section class="record-body">
      <!-- 分类网格 -->
      <div v-if="isExpense || isIncome" class="category-grid">
        <div
          v-for="(cat, idx) in isExpense ? expenseCategories : incomeCategories"
          :key="cat.id"
          :class="['category-item', { active: selectedCategoryId === cat.id }]"
          @click="selectCategory(cat)"
        >
          <div class="category-item__icon">
            <component
              :is="(isExpense ? expenseGridIcons : incomeGridIcons)[idx]"
              :size="24"
              :stroke-width="1.75"
            />
          </div>
          <span class="category-item__label">{{ cat.name }}</span>
        </div>
      </div>

      <!-- 转账模式账户选择 -->
      <div v-else class="transfer-panel">
        <button
          class="transfer-row transfer-row--clickable"
          type="button"
          @click="openAccountPicker('source')"
        >
          <div class="transfer-row__label">转出账户</div>
          <div class="transfer-row__value">
            <template v-if="selectedSourceAccount">
              <span class="transfer-row__name">{{ selectedSourceAccount.name }}</span>
              <span class="transfer-row__balance">
                {{ formatMinorToCny(selectedSourceAccount.balanceMinor) }}
              </span>
            </template>
            <span v-else class="transfer-row__placeholder">点击选择转出账户</span>
          </div>
        </button>
        <button class="swap-btn" type="button" aria-label="交换账户" @click="swapAccounts">
          <ArrowLeftRight :size="28" :stroke-width="1.75" />
        </button>
        <button
          class="transfer-row transfer-row--clickable"
          type="button"
          @click="openAccountPicker('target')"
        >
          <div class="transfer-row__label">转入账户</div>
          <div class="transfer-row__value">
            <template v-if="selectedTargetAccount">
              <span class="transfer-row__name">{{ selectedTargetAccount.name }}</span>
              <span class="transfer-row__balance">
                {{ formatMinorToCny(selectedTargetAccount.balanceMinor) }}
              </span>
            </template>
            <span v-else class="transfer-row__placeholder">点击选择转入账户</span>
          </div>
        </button>
      </div>
    </section>

    <section class="record-bottom">
      <!-- 优惠模式：替换顶栏 -->
      <div v-if="discountMode" class="note-row note-row--discount">
        <div class="discount-left">
          <span class="discount-title">优惠</span>
          <span class="discount-sub">实际支出{{ actualSpending }}</span>
        </div>
        <div class="discount-value-group">
          <span class="discount-value" :style="{ color: themeColor }">
            {{ discountAmount || '0' }}
          </span>
          <button
            type="button"
            class="discount-close"
            aria-label="关闭优惠编辑"
            @click="discountMode = false"
          >
            <X :size="18" :stroke-width="2" />
          </button>
        </div>
      </div>
      <!-- 正常模式：备注 + 金额 -->
      <div v-else class="note-row">
        <input
          v-model="merchant"
          type="text"
          class="note-input"
          placeholder="点此输入备注…"
          maxlength="40"
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
                (tag.action === 'discount' && hasDiscount),
              'quick-tag--discount-edit': tag.action === 'discount' && discountMode,
              disabled: tag.action === 'disabled',
            },
          ]"
          :disabled="tag.action === 'disabled'"
          @click="pickQuickTag(tag)"
        >
          <template v-if="tag.action === 'account' && selectedSourceAccount">
            {{ selectedSourceAccount.name }}
          </template>
          <template v-else-if="tag.action === 'discount'">
            <span class="quick-tag__discount-label">优惠</span>
            <template v-if="discountMode">
              <button
                type="button"
                class="quick-tag__discount-close"
                aria-label="关闭优惠编辑"
                @click.stop="toggleDiscountMode"
              >
                ×
              </button>
            </template>
            <span v-else-if="hasDiscount" class="quick-tag__discount-value">
              ({{ discountValueDisplay }})
            </span>
          </template>
          <template v-else>{{ tag.label }}</template>
        </button>
      </div>

      <!-- 数字键盘 -->
      <div class="numpad">
        <button class="numpad-btn" type="button" @click="appendAmount('1')">1</button>
        <button class="numpad-btn" type="button" @click="appendAmount('2')">2</button>
        <button class="numpad-btn" type="button" @click="appendAmount('3')">3</button>
        <button class="numpad-btn numpad-btn--op" type="button" @click="appendAmount('backspace')">
          <Edit3 :size="20" :stroke-width="1.75" />
        </button>

        <button class="numpad-btn" type="button" @click="appendAmount('4')">4</button>
        <button class="numpad-btn" type="button" @click="appendAmount('5')">5</button>
        <button class="numpad-btn" type="button" @click="appendAmount('6')">6</button>
        <button class="numpad-btn numpad-btn--op" type="button" @click="appendAmount('-')">
          −
        </button>

        <button class="numpad-btn" type="button" @click="appendAmount('7')">7</button>
        <button class="numpad-btn" type="button" @click="appendAmount('8')">8</button>
        <button class="numpad-btn" type="button" @click="appendAmount('9')">9</button>
        <button class="numpad-btn numpad-btn--op" type="button" @click="appendAmount('+')">
          +
        </button>

        <button class="numpad-btn numpad-btn--wide" type="button" @click="appendAmount('clear')">
          再记
        </button>
        <button class="numpad-btn" type="button" @click="appendAmount('0')">0</button>
        <button class="numpad-btn" type="button" @click="appendAmount('.')">.</button>
        <button
          class="numpad-btn numpad-btn--save"
          type="button"
          :disabled="!canSubmit || saving"
          :style="{ background: themeColor }"
          @click="submit"
        >
          {{ saving ? '保存中…' : saveButtonLabel }}
        </button>
      </div>
    </section>

    <!-- 账户选择弹窗 -->
    <AccountPicker
      v-model:show="accountPickerShow"
      :accounts="accounts"
      :selected-id="accountPickerContext === 'source' ? sourceAccountId : targetAccountId"
      :title="accountPickerContext === 'source' ? '选择支付账户' : '选择收款账户'"
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
  min-height: 100dvh;
  flex-direction: column;
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

.mode-tabs {
  display: flex;
  gap: var(--space-4);
  justify-content: center;
}

.mode-tab {
  position: relative;
  padding: var(--space-3) 0;
  color: var(--color-text-tertiary);
  font-size: 17px;
  font-weight: 500;
  background: transparent;
  border: 0;
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

.transfer-panel {
  display: grid;
  gap: var(--space-3);
  padding-top: var(--space-2);
}

.transfer-row {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-4);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-card);
}

.transfer-row--clickable {
  cursor: pointer;
  width: 100%;
  text-align: left;
}

.transfer-row__label {
  color: var(--color-text-secondary);
  font-size: var(--type-body-size);
}

.transfer-row__value {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.transfer-row__name {
  color: var(--color-text-primary);
  font-size: var(--type-body-size);
  font-weight: 500;
}

.transfer-row__balance {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  font-variant-numeric: tabular-nums;
}

.transfer-row__placeholder {
  color: var(--color-text-tertiary);
  font-size: var(--type-body-size);
}

.swap-btn {
  display: flex;
  width: 56px;
  height: 56px;
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
  padding: var(--space-2) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom));
  background: var(--color-surface);
  border-top: 1px solid var(--color-divider);
}

.note-row {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2) 0 var(--space-3);
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

.note-row--discount {
  gap: var(--space-3);
  background: var(--color-primary-50);
  border-radius: var(--radius-control);
  padding: var(--space-2) var(--space-3);
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

.discount-value-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.discount-value {
  font-size: 36px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.discount-close {
  display: flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  color: white;
  background: var(--color-primary-500);
  border: 0;
  border-radius: 50%;
  cursor: pointer;
}

.numpad {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2px;
  background: var(--color-divider);
  border-radius: var(--radius-control);
  overflow: hidden;
}

.numpad-btn {
  display: flex;
  height: 56px;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--color-text-primary);
  font-size: 22px;
  font-weight: 500;
  background: var(--color-surface);
  border: 0;
  cursor: pointer;
}

.numpad-btn:active {
  background: var(--color-background);
}

.numpad-btn--op {
  color: var(--color-text-tertiary);
}

.numpad-btn--wide {
  grid-column: span 1;
  font-size: 16px;
  color: var(--color-text-secondary);
}

.numpad-btn--save {
  color: white;
  font-weight: 600;
  font-size: 17px;
}

.numpad-btn--save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
</style>
