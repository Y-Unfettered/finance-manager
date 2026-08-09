<script setup lang="ts">
import {
  CheckCircle2,
  ChevronRight,
  HandCoins,
  Pencil,
  Plus,
  Trash2,
  WalletCards,
} from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppBottomSheet from '@/components/AppBottomSheet.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import MoneyText from '@/components/MoneyText.vue'
import type { AccountBalanceRecord, PayableBalanceRecord } from '@/domain/entities'
import { parseCnyInputToMinor } from '@/domain/money'
import { useFinanceService } from '@/features/finance/finance-service'
import { useAppStore } from '@/stores/app'
import { navigateBack } from '@/router/navigation-transition'

const router = useRouter()
const appStore = useAppStore()
const finance = useFinanceService()
const payables = ref<PayableBalanceRecord[]>([])
const accounts = ref<AccountBalanceRecord[]>([])
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const showAdd = ref(false)
const showDetail = ref(false)
const showRepayment = ref(false)
const showEdit = ref(false)
const showDelete = ref(false)
const selected = ref<PayableBalanceRecord>()
const addForm = ref(defaultAddForm())
const repaymentForm = ref(defaultRepaymentForm())
const editForm = ref(defaultEditForm())

const liquidAccounts = computed(() =>
  accounts.value.filter(
    (account) =>
      account.normalBalance === 'debit' &&
      !['receivable', 'investment', 'restricted_asset'].includes(account.type),
  ),
)
const outstandingMinor = computed(() =>
  payables.value.reduce((sum, item) => sum + Math.max(0, item.outstandingMinor), 0),
)
const openCount = computed(() => payables.value.filter((item) => item.status === 'open').length)

async function load(): Promise<void> {
  if (!finance || !appStore.ledgerId) return
  loading.value = true
  errorMessage.value = ''
  try {
    const [payableRows, accountRows] = await Promise.all([
      finance.listPayables(appStore.ledgerId),
      finance.listAccounts(appStore.ledgerId),
    ])
    payables.value = payableRows
    accounts.value = accountRows
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

function openAdd(): void {
  addForm.value = defaultAddForm()
  addForm.value.depositAccountId = liquidAccounts.value[0]?.id ?? ''
  errorMessage.value = ''
  showAdd.value = true
}

async function submitAdd(): Promise<void> {
  if (!finance || !appStore.ledgerId || saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await finance.createPayable({
      ledgerId: appStore.ledgerId,
      lender: addForm.value.lender,
      amountMinor: parseCnyInputToMinor(addForm.value.amount),
      depositAccountId: addForm.value.depositAccountId,
      occurredAt: new Date(addForm.value.occurredAt).toISOString(),
      dueDate: addForm.value.dueDate,
      note: addForm.value.note,
    })
    showAdd.value = false
    await load()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

function openPayable(item: PayableBalanceRecord): void {
  selected.value = item
  showDetail.value = true
}

function openRepayment(): void {
  if (!selected.value) return
  repaymentForm.value = defaultRepaymentForm()
  repaymentForm.value.amount = (selected.value.outstandingMinor / 100).toFixed(2)
  repaymentForm.value.sourceAccountId = liquidAccounts.value[0]?.id ?? ''
  errorMessage.value = ''
  showDetail.value = false
  showRepayment.value = true
}

async function submitRepayment(): Promise<void> {
  if (!finance || !selected.value || saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await finance.repayPayable({
      payableId: selected.value.id,
      amountMinor: parseCnyInputToMinor(repaymentForm.value.amount),
      sourceAccountId: repaymentForm.value.sourceAccountId,
      occurredAt: new Date(repaymentForm.value.occurredAt).toISOString(),
      note: repaymentForm.value.note,
    })
    showRepayment.value = false
    await load()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

function openEdit(): void {
  if (!selected.value) return
  editForm.value = {
    dueDate: selected.value.dueDate ?? '',
    note: selected.value.note ?? '',
  }
  errorMessage.value = ''
  showDetail.value = false
  showEdit.value = true
}

async function submitEdit(): Promise<void> {
  if (!finance || !appStore.ledgerId || !selected.value || saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await finance.updatePayable({
      ledgerId: appStore.ledgerId,
      payableId: selected.value.id,
      dueDate: editForm.value.dueDate,
      note: editForm.value.note,
    })
    showEdit.value = false
    await load()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

function openDelete(): void {
  if (!selected.value) return
  errorMessage.value = ''
  showDetail.value = false
  showDelete.value = true
}

async function submitDelete(): Promise<void> {
  if (!finance || !appStore.ledgerId || !selected.value || saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await finance.deletePayable(appStore.ledgerId, selected.value.id)
    showDelete.value = false
    selected.value = undefined
    await load()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

function dueLabel(item: PayableBalanceRecord): string {
  if (item.status === 'settled') return '已结清'
  if (!item.dueDate) return '未设置还款日'
  return `${isOverdue(item) ? '已逾期 · ' : '应还日 · '}${new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date(`${item.dueDate}T00:00:00`))}`
}

function isOverdue(item: PayableBalanceRecord): boolean {
  return item.status === 'open' && !!item.dueDate && item.dueDate < localDateValue(new Date())
}

function defaultAddForm() {
  return {
    lender: '',
    amount: '',
    depositAccountId: '',
    occurredAt: localDateTimeValue(new Date()),
    dueDate: '',
    note: '',
  }
}

function defaultRepaymentForm() {
  return {
    amount: '',
    sourceAccountId: '',
    occurredAt: localDateTimeValue(new Date()),
    note: '',
  }
}

function defaultEditForm() {
  return {
    dueDate: '',
    note: '',
  }
}

function localDateTimeValue(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return shifted.toISOString().slice(0, 16)
}

function localDateValue(date: Date): string {
  return localDateTimeValue(date).slice(0, 10)
}

onMounted(load)
</script>

<template>
  <main class="payables-page">
    <div class="payables-page__safe-top">
      <AppTopBar title="借入款" @back="navigateBack(router, { name: 'accounts' })" />
    </div>

    <div class="payables-page__content">
      <BaseCard class="summary-card">
        <span>待归还金额</span>
        <MoneyText :amount-minor="outstandingMinor" />
        <small>{{ openCount }} 笔待还 · {{ payables.length - openCount }} 笔已结清</small>
      </BaseCard>

      <div v-if="loading" class="page-state">正在读取借入款…</div>
      <div
        v-else-if="errorMessage && !showAdd && !showRepayment"
        class="page-state page-state--error"
      >
        {{ errorMessage }}
      </div>
      <section v-else class="loan-section">
        <h2>借入记录</h2>
        <BaseCard v-if="payables.length" class="loan-list">
          <button v-for="item in payables" :key="item.id" type="button" @click="openPayable(item)">
            <span class="loan-icon" :class="{ 'loan-icon--settled': item.status === 'settled' }">
              <CheckCircle2 v-if="item.status === 'settled'" :size="21" :stroke-width="1.75" />
              <HandCoins v-else :size="21" :stroke-width="1.75" />
            </span>
            <span class="loan-main"
              ><strong>{{ item.lender }}</strong
              ><small :class="{ overdue: isOverdue(item) }">{{ dueLabel(item) }}</small></span
            >
            <span class="loan-amount"
              ><MoneyText :amount-minor="item.outstandingMinor" /><small
                >原借入 ¥{{ (item.originalAmountMinor / 100).toFixed(2) }}</small
              ></span
            >
            <ChevronRight :size="20" :stroke-width="1.75" aria-hidden="true" />
          </button>
        </BaseCard>
        <div v-else class="empty-state">
          <HandCoins :size="38" :stroke-width="1.5" /><strong>还没有借入款</strong
          ><span>向别人借钱后，可以在这里持续跟踪还款。</span>
        </div>
      </section>
    </div>

    <button class="add-button" type="button" aria-label="新增借入款" @click="openAdd">
      <Plus :size="28" :stroke-width="2" />
    </button>

    <AppBottomSheet v-model:show="showAdd" title="新增借入款">
      <form class="sheet-form" @submit.prevent="submitAdd">
        <label
          ><span>债权人或事项</span
          ><input v-model="addForm.lender" required maxlength="30" placeholder="例如：李四"
        /></label>
        <label
          ><span>借入金额</span
          ><input v-model="addForm.amount" required inputmode="decimal" placeholder="0.00"
        /></label>
        <label
          ><span>转入哪个账户</span
          ><select v-model="addForm.depositAccountId" required>
            <option value="" disabled>请选择资金账户</option>
            <option v-for="account in liquidAccounts" :key="account.id" :value="account.id">
              {{ account.name }} · ¥{{ (account.balanceMinor / 100).toFixed(2) }}
            </option>
          </select></label
        >
        <label
          ><span>借入时间</span><input v-model="addForm.occurredAt" type="datetime-local" required
        /></label>
        <label
          ><span>约定还款日（可选）</span><input v-model="addForm.dueDate" type="date"
        /></label>
        <label
          ><span>备注（可选）</span><textarea v-model="addForm.note" rows="3" maxlength="120" />
        </label>
        <div v-if="errorMessage" class="form-error">{{ errorMessage }}</div>
        <button
          class="primary-button"
          type="submit"
          :disabled="saving || liquidAccounts.length === 0"
        >
          {{ saving ? '正在保存…' : '确认借入' }}
        </button>
      </form>
    </AppBottomSheet>

    <AppBottomSheet v-model:show="showDetail" :title="selected?.lender ?? '借入款详情'">
      <div v-if="selected" class="loan-detail">
        <div class="loan-detail__amount">
          <span>当前待还</span><MoneyText :amount-minor="selected.outstandingMinor" />
        </div>
        <dl>
          <div>
            <dt>原借入金额</dt>
            <dd>¥{{ (selected.originalAmountMinor / 100).toFixed(2) }}</dd>
          </div>
          <div>
            <dt>状态</dt>
            <dd>{{ selected.status === 'settled' ? '已结清' : '待归还' }}</dd>
          </div>
          <div>
            <dt>还款日期</dt>
            <dd>{{ dueLabel(selected) }}</dd>
          </div>
          <div v-if="selected.note">
            <dt>备注</dt>
            <dd>{{ selected.note }}</dd>
          </div>
        </dl>
        <div class="loan-detail__actions">
          <button
            v-if="selected.status === 'open'"
            class="primary-button"
            type="button"
            @click="openRepayment"
          >
            <WalletCards :size="19" :stroke-width="1.75" />登记还款
          </button>
          <button class="secondary-button" type="button" @click="openEdit">
            <Pencil :size="18" :stroke-width="1.75" />编辑
          </button>
          <button
            v-if="selected.status === 'settled'"
            class="danger-button"
            type="button"
            @click="openDelete"
          >
            <Trash2 :size="18" :stroke-width="1.75" />删除记录
          </button>
        </div>
      </div>
    </AppBottomSheet>

    <AppBottomSheet v-model:show="showEdit" title="编辑借入款">
      <form class="sheet-form" @submit.prevent="submitEdit">
        <label>
          <span>约定还款日（可选）</span>
          <input v-model="editForm.dueDate" type="date" />
        </label>
        <label>
          <span>备注（可选）</span>
          <textarea v-model="editForm.note" rows="3" maxlength="120" />
        </label>
        <div v-if="errorMessage" class="form-error">{{ errorMessage }}</div>
        <button class="primary-button" type="submit" :disabled="saving">
          {{ saving ? '正在保存…' : '保存修改' }}
        </button>
      </form>
    </AppBottomSheet>

    <AppBottomSheet v-model:show="showDelete" title="删除借入款记录">
      <div class="confirm-dialog">
        <p>
          这将仅删除借入款的跟踪记录，已发生的借入与归还流水会保留在账户历史中。此操作不可撤销。
        </p>
        <div v-if="errorMessage" class="form-error">{{ errorMessage }}</div>
        <div class="confirm-dialog__actions">
          <button class="secondary-button" type="button" @click="showDelete = false">取消</button>
          <button class="danger-button" type="button" :disabled="saving" @click="submitDelete">
            {{ saving ? '正在删除…' : '确认删除' }}
          </button>
        </div>
      </div>
    </AppBottomSheet>

    <AppBottomSheet v-model:show="showRepayment" title="登记归还借款">
      <form class="sheet-form" @submit.prevent="submitRepayment">
        <label
          ><span>本次归还金额</span
          ><input v-model="repaymentForm.amount" required inputmode="decimal"
        /></label>
        <label
          ><span>还款账户</span
          ><select v-model="repaymentForm.sourceAccountId" required>
            <option value="" disabled>请选择还款账户</option>
            <option v-for="account in liquidAccounts" :key="account.id" :value="account.id">
              {{ account.name }}
            </option>
          </select></label
        >
        <label
          ><span>归还时间</span
          ><input v-model="repaymentForm.occurredAt" type="datetime-local" required
        /></label>
        <label
          ><span>备注（可选）</span
          ><textarea v-model="repaymentForm.note" rows="3" maxlength="120" />
        </label>
        <div v-if="errorMessage" class="form-error">{{ errorMessage }}</div>
        <button class="primary-button" type="submit" :disabled="saving">
          {{ saving ? '正在保存…' : '确认归还' }}
        </button>
      </form>
    </AppBottomSheet>
  </main>
</template>

<style scoped>
.payables-page {
  min-height: 100dvh;
  padding-bottom: calc(var(--space-10) + env(safe-area-inset-bottom));
  background: var(--color-background);
}
.payables-page__safe-top {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}
.payables-page__content {
  display: grid;
  max-width: 520px;
  padding: var(--space-4) var(--page-gutter) var(--space-10);
  margin: auto;
  gap: var(--space-4);
}
.summary-card {
  display: grid;
  min-height: 150px;
  padding: var(--space-6);
  align-content: center;
  text-align: center;
  background: linear-gradient(145deg, #f8fbfa, #fff);
}
.summary-card > span,
.summary-card > small {
  color: var(--color-text-tertiary);
  font-size: var(--type-label-size);
}
.summary-card :deep(.money-text) {
  margin: var(--space-2) 0;
  font-size: var(--type-money-display-size);
  font-weight: 600;
}
.loan-section h2 {
  margin: var(--space-2) 0 var(--space-3);
  font-size: var(--type-section-title-size);
}
.loan-list {
  padding: 0 var(--space-4);
}
.loan-list button {
  display: grid;
  width: 100%;
  min-height: 76px;
  padding: var(--space-2) 0;
  grid-template-columns: 40px minmax(0, 1fr) auto 20px;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-text-primary);
  text-align: left;
  background: transparent;
  border: 0;
  border-top: 1px solid var(--color-divider);
}
.loan-list button:first-child {
  border-top: 0;
}
.loan-icon {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  color: #6b4f9d;
  background: #efe9f8;
  border-radius: var(--radius-pill);
}
.loan-icon--settled {
  color: var(--color-income);
  background: var(--color-primary-50);
}
.loan-main,
.loan-amount {
  display: grid;
  min-width: 0;
}
.loan-main strong {
  overflow: hidden;
  font-size: var(--type-list-primary-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.loan-main small,
.loan-amount small {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.loan-main small.overdue {
  color: var(--color-danger);
}
.loan-amount {
  justify-items: end;
}
.loan-amount :deep(.money-text) {
  font-size: var(--type-list-amount-size);
  font-weight: 600;
}
.loan-list button > svg {
  color: var(--color-text-tertiary);
}
.add-button {
  position: fixed;
  right: var(--space-5);
  bottom: calc(var(--space-6) + env(safe-area-inset-bottom));
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  color: white;
  background: var(--color-primary-600);
  border: 0;
  border-radius: var(--radius-pill);
  box-shadow: 0 8px 24px rgb(var(--color-primary-rgb) / 22%);
}
.page-state,
.empty-state {
  display: grid;
  padding: var(--space-10) var(--space-4);
  place-items: center;
  gap: var(--space-2);
  color: var(--color-text-tertiary);
  text-align: center;
}
.page-state--error,
.form-error {
  color: var(--color-danger);
}
.empty-state strong {
  color: var(--color-text-secondary);
}
.empty-state span {
  font-size: var(--type-caption-size);
}
.sheet-form {
  display: grid;
  max-height: 68dvh;
  overflow-y: auto;
  gap: var(--space-4);
}
.sheet-form label {
  display: grid;
  gap: var(--space-2);
}
.sheet-form label > span {
  color: var(--color-text-secondary);
  font-size: var(--type-label-size);
}
.sheet-form input,
.sheet-form select,
.sheet-form textarea {
  width: 100%;
  padding: var(--space-3);
  color: var(--color-text-primary);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
  outline: 0;
}
.sheet-form input,
.sheet-form select {
  height: 48px;
}
.sheet-form textarea {
  resize: none;
}
.primary-button {
  display: flex;
  height: 48px;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
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
  gap: var(--space-2);
  color: var(--color-text-primary);
  font-weight: 500;
  background: transparent;
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
}
.danger-button {
  display: flex;
  height: 48px;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: white;
  font-weight: 600;
  background: var(--color-danger);
  border: 0;
  border-radius: var(--radius-control);
}
.danger-button:disabled {
  opacity: 0.55;
}
.loan-detail__actions {
  display: grid;
  gap: var(--space-3);
}
.confirm-dialog {
  display: grid;
  gap: var(--space-4);
}
.confirm-dialog p {
  margin: 0;
  color: var(--color-text-secondary);
  line-height: var(--type-body-line);
}
.confirm-dialog__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}
.loan-detail {
  display: grid;
  gap: var(--space-5);
}
.loan-detail__amount {
  display: grid;
  padding: var(--space-5);
  place-items: center;
  background: var(--color-primary-50);
  border-radius: var(--radius-card);
}
.loan-detail__amount span {
  color: var(--color-text-tertiary);
  font-size: var(--type-label-size);
}
.loan-detail__amount :deep(.money-text) {
  font-size: var(--type-money-display-size);
  font-weight: 600;
}
.loan-detail dl {
  margin: 0;
}
.loan-detail dl div {
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  border-top: 1px solid var(--color-divider);
}
.loan-detail dl div:first-child {
  border-top: 0;
}
.loan-detail dt {
  color: var(--color-text-tertiary);
}
.loan-detail dd {
  margin: 0;
  text-align: right;
}
</style>
