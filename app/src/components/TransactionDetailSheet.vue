<script setup lang="ts">
import { Copy, Pencil, RotateCcw, Trash2, Wallet, Tag, CalendarClock, FileText } from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import AppBottomSheet from './AppBottomSheet.vue'
import MoneyText from './MoneyText.vue'
import type { TransactionMetadata } from '@/features/finance/finance-service'
import { useFinanceService } from '@/features/finance/finance-service'

const props = defineProps<{
  show: boolean
  transactionId: string | undefined
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  updated: []
}>()

const router = useRouter()
const finance = useFinanceService()
const loading = ref(false)
const deleting = ref(false)
const errorMessage = ref('')
const tx = ref<TransactionMetadata>()

// 删除三步确认
type DeleteStep = 'none' | 'confirm1' | 'confirm2'
const deleteStep = ref<DeleteStep>('none')
const verifyNumber = ref('')
const expectedNumber = ref('')

const displayAmount = computed(() => {
  if (!tx.value) return 0
  if (tx.value.type === 'expense' || tx.value.type === 'credit_purchase') {
    return -tx.value.amountMinor
  }
  return tx.value.amountMinor
})

const amountTone = computed<'income' | 'expense' | 'default'>(() => {
  if (!tx.value) return 'default'
  if (tx.value.type === 'income' || tx.value.type === 'refund') return 'income'
  if (tx.value.type === 'expense' || tx.value.type === 'credit_purchase') return 'expense'
  return 'default'
})

const showPlus = computed(() => tx.value?.type === 'income' || tx.value?.type === 'refund')
const canEditOrCopy = computed(() =>
  tx.value
    ? ['expense', 'income', 'transfer', 'credit_purchase', 'repayment', 'refund'].includes(
        tx.value.type,
      )
    : false,
)

const formattedOccurredAt = computed(() => {
  if (!tx.value) return ''
  return formatDateTime(tx.value.occurredAt)
})

const formattedCreatedAt = computed(() => {
  if (!tx.value) return ''
  return formatDateTime(tx.value.createdAt)
})

const canDelete = computed(() => {
  if (!tx.value || tx.value.status === 'void') return false
  return verifyNumber.value.trim() === expectedNumber.value
})

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  const pad = (v: number): string => String(v).padStart(2, '0')
  return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function load(): Promise<void> {
  if (!props.transactionId || !finance) return
  loading.value = true
  errorMessage.value = ''
  deleteStep.value = 'none'
  try {
    const result = await finance.getTransaction(props.transactionId)
    if (!result) throw new Error('交易不存在')
    tx.value = result
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.show, props.transactionId],
  () => {
    if (props.show) void load()
  },
)

onMounted(() => {
  if (props.show) void load()
})

function close(): void {
  emit('update:show', false)
  deleteStep.value = 'none'
  verifyNumber.value = ''
}

function handleEdit(): void {
  if (!tx.value || !canEditOrCopy.value) return
  const id = tx.value.id
  close()
  void router.push({ name: 'new-expense', query: { edit: id } })
}

function handleCopy(): void {
  if (!tx.value || !canEditOrCopy.value) return
  const id = tx.value.id
  close()
  void router.push({ name: 'new-expense', query: { copy: id } })
}

function handleRefund(): void {
  if (!tx.value || !['expense', 'credit_purchase'].includes(tx.value.type)) return
  const id = tx.value.id
  close()
  void router.push({ name: 'new-expense', query: { refund: id } })
}

async function handleOriginal(): Promise<void> {
  if (!tx.value?.originalTransactionId || !finance) return
  loading.value = true
  errorMessage.value = ''
  try {
    const original = await finance.getTransaction(tx.value.originalTransactionId)
    if (!original) throw new Error('原交易不存在')
    tx.value = original
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

function startDelete(): void {
  verifyNumber.value = ''
  expectedNumber.value = String(Math.floor(1000 + Math.random() * 9000))
  deleteStep.value = 'confirm1'
}

function proceedToDelete(): void {
  deleteStep.value = 'confirm2'
}

function cancelDelete(): void {
  deleteStep.value = 'none'
  verifyNumber.value = ''
}

async function confirmDelete(): Promise<void> {
  if (!tx.value || !finance || !canDelete.value || deleting.value) return
  deleting.value = true
  errorMessage.value = ''
  try {
    await finance.voidTransaction(tx.value.ledgerId, tx.value.id)
    emit('updated')
    close()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    deleting.value = false
  }
}

function goAccount(accountId?: string): void {
  if (!accountId) return
  close()
  void router.push({ name: 'account-detail', params: { accountId } })
}

function goCategory(categoryId?: string): void {
  if (!categoryId) return
  close()
  void router.push({ name: 'category-statistics', params: { categoryId } })
}
</script>

<template>
  <AppBottomSheet :show="show" title="详情" @update:show="$emit('update:show', $event)">
    <template v-if="tx" #actions>
      <button
        type="button"
        aria-label="复制"
        title="复制"
        :disabled="!canEditOrCopy"
        @click="handleCopy"
      >
        <Copy :size="18" :stroke-width="2" aria-hidden="true" />
      </button>
      <button
        v-if="tx.type === 'expense' || tx.type === 'credit_purchase'"
        type="button"
        aria-label="退款并冲减原支出"
        title="退款：关联原支出并冲减已花金额"
        @click="handleRefund"
      >
        <RotateCcw :size="18" :stroke-width="2" aria-hidden="true" />
      </button>
      <button
        v-if="tx.type === 'refund' && tx.originalTransactionId"
        type="button"
        aria-label="查看原交易"
        title="查看原交易"
        @click="handleOriginal"
      >
        <RotateCcw :size="18" :stroke-width="2" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="修改"
        title="修改"
        :disabled="tx.status === 'void' || !canEditOrCopy"
        @click="handleEdit"
      >
        <Pencil :size="18" :stroke-width="2" aria-hidden="true" />
      </button>
      <button
        class="detail-header-danger"
        type="button"
        aria-label="删除"
        title="删除"
        :disabled="tx.status === 'void'"
        @click="startDelete"
      >
        <Trash2 :size="18" :stroke-width="2" aria-hidden="true" />
      </button>
    </template>
    <div v-if="loading" class="sheet-state">正在加载…</div>
    <div v-else-if="!tx" class="sheet-state sheet-state--error">
      {{ errorMessage || '交易不存在' }}
    </div>
    <div v-else class="tx-detail">
      <span v-if="tx.status === 'void'" class="void-tag">已撤销</span>

      <!-- 第一行：金额 + 日期 -->
      <div class="tx-detail__row tx-detail__row--primary">
        <MoneyText :amount-minor="displayAmount" :tone="amountTone" :show-plus="showPlus" />
        <span class="tx-detail__date">{{ formattedOccurredAt }}</span>
      </div>

      <!-- 第二行：分类 -->
      <button
        v-if="tx.categoryName"
        class="tx-detail__row tx-detail__row--clickable"
        type="button"
        @click="goCategory(tx.categoryId)"
      >
        <Tag :size="18" :stroke-width="1.75" aria-hidden="true" />
        <span class="tx-detail__label">分类</span>
        <strong class="tx-detail__value">{{ tx.categoryName }}</strong>
      </button>

      <!-- 账户 -->
      <button
        v-if="tx.sourceAccountName"
        class="tx-detail__row tx-detail__row--clickable"
        type="button"
        @click="goAccount(tx.sourceAccountId)"
      >
        <Wallet :size="18" :stroke-width="1.75" aria-hidden="true" />
        <span class="tx-detail__label">转出/还款账户</span>
        <strong class="tx-detail__value">{{ tx.sourceAccountName }}</strong>
      </button>
      <button
        v-if="tx.targetAccountName"
        class="tx-detail__row tx-detail__row--clickable"
        type="button"
        @click="goAccount(tx.targetAccountId)"
      >
        <Wallet :size="18" :stroke-width="1.75" aria-hidden="true" />
        <span class="tx-detail__label">转入/信用账户</span>
        <strong class="tx-detail__value">{{ tx.targetAccountName }}</strong>
      </button>
      <button
        v-if="tx.accountName && !tx.sourceAccountName"
        class="tx-detail__row tx-detail__row--clickable"
        type="button"
        @click="goAccount(tx.accountId)"
      >
        <Wallet :size="18" :stroke-width="1.75" aria-hidden="true" />
        <span class="tx-detail__label">账户</span>
        <strong class="tx-detail__value">{{ tx.accountName }}</strong>
      </button>

      <!-- 记录于 -->
      <div class="tx-detail__row">
        <CalendarClock :size="18" :stroke-width="1.75" aria-hidden="true" />
        <span class="tx-detail__label">记录于</span>
        <span class="tx-detail__value">{{ formattedCreatedAt }}</span>
      </div>

      <!-- 备注 -->
      <div v-if="tx.note" class="tx-detail__row tx-detail__row--note">
        <FileText :size="18" :stroke-width="1.75" aria-hidden="true" />
        <span class="tx-detail__label">备注</span>
        <span class="tx-detail__value">{{ tx.note }}</span>
      </div>

      <div v-if="tx.attachmentDataUris.length" class="tx-detail__attachments">
        <span>图片凭证</span>
        <div>
          <a
            v-for="(dataUri, index) in tx.attachmentDataUris"
            :key="`${index}-${dataUri.length}`"
            :href="dataUri"
            target="_blank"
            rel="noreferrer"
          >
            <img :src="dataUri" :alt="`图片凭证 ${index + 1}`" />
          </a>
        </div>
      </div>

      <div v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</div>

      <!-- 删除第一步确认 -->
      <div v-if="deleteStep === 'confirm1'" class="confirm-box" role="alertdialog">
        <strong>确认删除此笔交易？</strong>
        <p>删除后账目会回退，此操作不可恢复。</p>
        <div class="confirm-box__actions">
          <button type="button" class="ghost-button" @click="cancelDelete">取消</button>
          <button type="button" class="danger-button" @click="proceedToDelete">继续</button>
        </div>
      </div>

      <!-- 删除第二步：数字校验 -->
      <div v-if="deleteStep === 'confirm2'" class="confirm-box" role="alertdialog">
        <strong>最终确认</strong>
        <p>请输入下方数字以确认删除：</p>
        <div class="verify-number">{{ expectedNumber }}</div>
        <input
          v-model="verifyNumber"
          class="verify-input"
          type="text"
          inputmode="numeric"
          maxlength="4"
          placeholder="输入上方数字"
          :aria-label="`请输入数字 ${expectedNumber} 以确认删除`"
        />
        <div class="confirm-box__actions">
          <button type="button" class="ghost-button" @click="cancelDelete">取消</button>
          <button
            type="button"
            class="danger-button"
            :disabled="!canDelete || deleting"
            @click="confirmDelete"
          >
            {{ deleting ? '删除中…' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>
  </AppBottomSheet>
</template>

<style scoped>
.sheet-state {
  padding: var(--space-8) var(--space-4);
  color: var(--color-text-tertiary);
  font-size: var(--type-body-size);
  text-align: center;
}
.sheet-state--error {
  color: var(--color-danger);
}
.tx-detail {
  display: grid;
  gap: var(--space-3);
}
.detail-header-danger {
  color: var(--color-danger);
}
.void-tag {
  display: inline-block;
  padding: 2px 10px;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  background: var(--color-background);
  border-radius: var(--radius-pill);
  justify-self: start;
}
.tx-detail__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
}
.tx-detail__attachments {
  display: grid;
  gap: var(--space-2);
}
.tx-detail__attachments > span {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.tx-detail__attachments > div {
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
}
.tx-detail__attachments img {
  display: block;
  width: 76px;
  height: 76px;
  object-fit: cover;
  border-radius: var(--radius-control);
}
.tx-detail__row--primary {
  align-items: baseline;
  justify-content: space-between;
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--color-divider);
}
.tx-detail__row--primary :deep(.money-text) {
  font-size: var(--type-money-display-size);
  font-weight: 600;
}
.tx-detail__date {
  color: var(--color-text-tertiary);
  font-size: var(--type-label-size);
}
.tx-detail__row--clickable {
  width: 100%;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: var(--radius-control);
  text-align: left;
}
.tx-detail__row--clickable:active {
  background: var(--color-primary-50);
}
.tx-detail__row--note {
  align-items: flex-start;
}
.tx-detail__row svg {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}
.tx-detail__label {
  color: var(--color-text-secondary);
  font-size: var(--type-label-size);
  flex-shrink: 0;
}
.tx-detail__value {
  color: var(--color-text-primary);
  font-size: var(--type-body-size);
  text-align: right;
  flex: 1;
  min-width: 0;
  overflow-wrap: break-word;
}
.confirm-box {
  display: grid;
  padding: var(--space-4);
  gap: var(--space-3);
  background: rgb(185 67 67 / 6%);
  border: 1px solid rgb(185 67 67 / 16%);
  border-radius: var(--radius-card);
}
.confirm-box strong {
  font-size: var(--type-section-title-size);
  font-weight: 600;
}
.confirm-box p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--type-body-size);
  line-height: var(--type-body-line);
}
.verify-number {
  display: grid;
  place-items: center;
  padding: var(--space-3);
  color: var(--color-text-primary);
  font-size: var(--type-money-summary-size);
  font-weight: 700;
  letter-spacing: 8px;
  background: var(--color-surface);
  border: 2px solid var(--color-divider);
  border-radius: var(--radius-control);
}
.verify-input {
  width: 100%;
  height: 48px;
  text-align: center;
  color: var(--color-text-primary);
  font-size: var(--type-money-summary-size);
  font-weight: 600;
  letter-spacing: 4px;
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
  outline: 0;
}
.verify-input:focus {
  border-color: var(--color-danger);
}
.confirm-box__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}
.ghost-button,
.danger-button {
  display: flex;
  height: 48px;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  border: 0;
  border-radius: var(--radius-control);
}
.ghost-button {
  color: var(--color-text-primary);
  background: transparent;
  border: 1px solid var(--color-divider);
}
.danger-button {
  color: white;
  background: var(--color-danger);
}
.danger-button:disabled {
  opacity: 0.45;
}
.form-error {
  padding: var(--space-3);
  color: var(--color-danger);
  font-size: var(--type-body-size);
  background: rgb(185 67 67 / 8%);
  border-radius: var(--radius-control);
}
</style>
