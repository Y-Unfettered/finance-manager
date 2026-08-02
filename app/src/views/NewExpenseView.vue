<script setup lang="ts">
import { ReceiptText } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import type { AccountBalanceRecord } from '@/domain/entities'
import { parseCnyInputToMinor } from '@/domain/money'
import { useFinanceService, type ExpenseCategoryOption } from '@/features/finance/finance-service'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()
const finance = useFinanceService()
const accounts = ref<AccountBalanceRecord[]>([])
const categories = ref<ExpenseCategoryOption[]>([])
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const form = ref({
  amount: '',
  accountId: '',
  categoryId: '',
  occurredAt: localDateTimeValue(new Date()),
  merchant: '',
  note: '',
})

const canSubmit = computed(
  () =>
    !loading.value &&
    !saving.value &&
    form.value.amount.trim() !== '' &&
    form.value.accountId !== '' &&
    form.value.categoryId !== '',
)

async function loadOptions(): Promise<void> {
  if (!finance || !appStore.ledgerId) {
    loading.value = false
    errorMessage.value = '本地账本尚未准备完成。'
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    const [accountRows, categoryRows] = await Promise.all([
      finance.listAccounts(appStore.ledgerId),
      finance.listExpenseCategories(appStore.ledgerId),
    ])
    accounts.value = accountRows.filter((account) => account.normalBalance === 'debit')
    categories.value = categoryRows
    form.value.accountId = accounts.value[0]?.id ?? ''
    form.value.categoryId = categories.value[0]?.id ?? ''
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

async function submitExpense(): Promise<void> {
  if (!finance || !appStore.ledgerId || !canSubmit.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await finance.createExpense({
      ledgerId: appStore.ledgerId,
      amountMinor: parseCnyInputToMinor(form.value.amount),
      accountId: form.value.accountId,
      categoryId: form.value.categoryId,
      occurredAt: new Date(form.value.occurredAt).toISOString(),
      merchant: form.value.merchant,
      note: form.value.note,
    })
    await router.replace({ name: 'home', query: { saved: '1' } })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

function goBack(): void {
  void router.replace({ name: 'home' })
}

function localDateTimeValue(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return shifted.toISOString().slice(0, 16)
}

onMounted(loadOptions)
</script>

<template>
  <main class="expense-page">
    <div class="expense-page__safe-top">
      <AppTopBar title="记一笔支出" @back="goBack" />
    </div>

    <form class="expense-page__content" @submit.prevent="submitExpense">
      <BaseCard class="amount-card">
        <label for="amount">支出金额</label>
        <div class="amount-card__input">
          <span>¥</span>
          <input
            id="amount"
            v-model="form.amount"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            placeholder="0.00"
            autofocus
          />
        </div>
      </BaseCard>

      <BaseCard class="form-card">
        <label>
          <span>付款账户</span>
          <select v-model="form.accountId" :disabled="loading">
            <option value="" disabled>请选择账户</option>
            <option v-for="account in accounts" :key="account.id" :value="account.id">
              {{ account.name }}
            </option>
          </select>
        </label>
        <label>
          <span>支出分类</span>
          <select v-model="form.categoryId" :disabled="loading">
            <option value="" disabled>请选择分类</option>
            <option v-for="category in categories" :key="category.id" :value="category.id">
              {{ category.name }}
            </option>
          </select>
        </label>
        <label>
          <span>消费时间</span>
          <input v-model="form.occurredAt" type="datetime-local" />
        </label>
        <label>
          <span>商家（可选）</span>
          <input v-model="form.merchant" maxlength="40" placeholder="例如：楼下咖啡店" />
        </label>
        <label>
          <span>备注（可选）</span>
          <textarea v-model="form.note" maxlength="120" rows="3" placeholder="补充这笔消费的信息" />
        </label>
      </BaseCard>

      <div v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</div>
      <div v-if="!loading && accounts.length === 0" class="form-hint">
        请先到“资产”页添加一个资金账户。
      </div>
      <button class="save-button" type="submit" :disabled="!canSubmit">
        <ReceiptText :size="20" :stroke-width="1.75" aria-hidden="true" />
        <span>{{ saving ? '正在保存…' : '保存支出' }}</span>
      </button>
    </form>
  </main>
</template>

<style scoped>
.expense-page {
  min-height: 100dvh;
  padding-bottom: calc(var(--space-6) + env(safe-area-inset-bottom));
  background: var(--color-background);
}

.expense-page__safe-top {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}

.expense-page__content {
  display: grid;
  max-width: 520px;
  padding: var(--space-4) var(--page-gutter);
  margin: 0 auto;
  gap: var(--space-3);
}

.amount-card label {
  color: var(--color-text-secondary);
  font-size: var(--type-label-size);
  line-height: var(--type-label-line);
}

.amount-card__input {
  display: flex;
  min-height: 64px;
  align-items: center;
  gap: var(--space-2);
  border-bottom: 1px solid var(--color-divider);
}

.amount-card__input span {
  font-size: var(--type-money-summary-size);
  font-weight: 600;
}

.amount-card__input input {
  min-width: 0;
  flex: 1;
  color: var(--color-text-primary);
  font-size: var(--type-money-display-size);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  background: transparent;
  border: 0;
  outline: 0;
}

.amount-card__input input::placeholder {
  color: var(--color-text-tertiary);
}

.form-card {
  display: grid;
  gap: var(--space-4);
}

.form-card label {
  display: grid;
  gap: var(--space-2);
}

.form-card label > span {
  color: var(--color-text-secondary);
  font-size: var(--type-label-size);
  line-height: var(--type-label-line);
}

.form-card input,
.form-card select,
.form-card textarea {
  width: 100%;
  min-height: 48px;
  padding: var(--space-3);
  color: var(--color-text-primary);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
  outline: 0;
}

.form-card textarea {
  resize: none;
}

.form-card input:focus,
.form-card select:focus,
.form-card textarea:focus {
  border-color: var(--color-primary-500);
}

.form-error,
.form-hint {
  padding: var(--space-3) var(--space-4);
  font-size: var(--type-body-size);
  line-height: var(--type-body-line);
  border-radius: var(--radius-control);
}

.form-error {
  color: var(--color-danger);
  background: rgb(185 67 67 / 8%);
}

.form-hint {
  color: var(--color-warning);
  background: rgb(201 132 45 / 8%);
}

.save-button {
  display: flex;
  height: 52px;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: white;
  font-weight: 600;
  background: var(--color-primary-600);
  border: 0;
  border-radius: var(--radius-control);
  box-shadow: 0 8px 22px rgb(23 107 93 / 15%);
}

.save-button:disabled {
  box-shadow: none;
  opacity: 0.5;
}
</style>
