<script setup lang="ts">
import { Banknote, Landmark, Plus, WalletCards } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'

import AccountAvatar from '@/components/AccountAvatar.vue'
import AppBottomSheet from '@/components/AppBottomSheet.vue'
import AppIconButton from '@/components/AppIconButton.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import MoneyText from '@/components/MoneyText.vue'
import type { AccountType } from '@/domain/accounts'
import type { AccountBalanceRecord } from '@/domain/entities'
import { useFinanceService } from '@/features/finance/finance-service'
import { useAppStore } from '@/stores/app'

type NewAccountType = Extract<AccountType, 'cash' | 'bank' | 'platform'>

const appStore = useAppStore()
const finance = useFinanceService()
const accounts = ref<AccountBalanceRecord[]>([])
const loading = ref(true)
const errorMessage = ref('')
const formError = ref('')
const showCreate = ref(false)
const saving = ref(false)
const form = ref({ name: '', type: 'bank' as NewAccountType, institution: '' })

const totalBalance = computed(() =>
  accounts.value
    .filter((account) => account.normalBalance === 'debit')
    .reduce((total, account) => total + account.balanceMinor, 0),
)

async function loadAccounts(): Promise<void> {
  if (!finance || !appStore.ledgerId) {
    loading.value = false
    errorMessage.value = '正在准备本地账本，请稍候…'
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    accounts.value = await finance.listAccounts(appStore.ledgerId)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

async function submitAccount(): Promise<void> {
  if (!finance || !appStore.ledgerId || saving.value) return
  saving.value = true
  formError.value = ''
  try {
    await finance.createAccount({
      ledgerId: appStore.ledgerId,
      name: form.value.name,
      type: form.value.type,
      institution: form.value.institution,
    })
    form.value = { name: '', type: 'bank', institution: '' }
    showCreate.value = false
    await loadAccounts()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

function accountTypeLabel(type: AccountType): string {
  const labels: Record<AccountType, string> = {
    cash: '现金',
    bank: '银行卡',
    platform: '平台账户',
    restricted_asset: '专用账户',
    prepaid: '预充值卡',
    investment: '投资账户',
    receivable: '借出款',
    credit_card: '信用卡',
    consumer_credit: '先用后付',
    other_liability: '其他负债',
  }
  return labels[type]
}

onMounted(loadAccounts)
</script>

<template>
  <main class="accounts-page">
    <div class="accounts-page__safe-top">
      <AppTopBar title="账户资产" :show-back="false">
        <template #right>
          <AppIconButton label="添加账户" @click="showCreate = true">
            <Plus :size="24" :stroke-width="1.75" aria-hidden="true" />
          </AppIconButton>
        </template>
      </AppTopBar>
    </div>

    <div class="accounts-page__content">
      <BaseCard variant="summary" class="asset-summary">
        <span>资金账户合计</span>
        <MoneyText class="asset-summary__amount" :amount-minor="totalBalance" />
        <small>{{ accounts.length }} 个账户 · 金额保存在本机</small>
      </BaseCard>

      <div v-if="loading" class="page-state">正在读取账户…</div>
      <div v-else-if="errorMessage" class="page-state page-state--error">
        <span>{{ errorMessage }}</span>
        <button type="button" @click="loadAccounts">重新加载</button>
      </div>
      <BaseCard v-else class="account-list">
        <div class="account-list__title">
          <strong>我的账户</strong>
          <span>{{ accounts.length }} 项</span>
        </div>
        <button v-for="account in accounts" :key="account.id" class="account-row" type="button">
          <AccountAvatar
            :label="account.name"
            :tone="
              account.type === 'platform' ? 'info' : account.type === 'cash' ? 'warning' : 'primary'
            "
          >
            <Banknote v-if="account.type === 'cash'" :size="22" :stroke-width="1.75" />
            <Landmark v-else-if="account.type === 'bank'" :size="22" :stroke-width="1.75" />
            <WalletCards v-else :size="22" :stroke-width="1.75" />
          </AccountAvatar>
          <span class="account-row__body">
            <strong>{{ account.name }}</strong>
            <small>{{ account.institution || accountTypeLabel(account.type) }}</small>
          </span>
          <MoneyText class="account-row__amount" :amount-minor="account.balanceMinor" />
        </button>
      </BaseCard>
    </div>

    <AppBottomSheet v-model:show="showCreate" title="添加资金账户">
      <form class="account-form" @submit.prevent="submitAccount">
        <label>
          <span>账户类型</span>
          <select v-model="form.type">
            <option value="cash">现金</option>
            <option value="bank">银行卡</option>
            <option value="platform">平台账户</option>
          </select>
        </label>
        <label>
          <span>账户名称</span>
          <input v-model="form.name" required maxlength="24" placeholder="例如：招商银行" />
        </label>
        <label>
          <span>机构（可选）</span>
          <input v-model="form.institution" maxlength="24" placeholder="例如：招商银行" />
        </label>
        <div v-if="formError" class="form-error" role="alert">{{ formError }}</div>
        <button class="primary-button" type="submit" :disabled="saving">
          {{ saving ? '正在保存…' : '保存账户' }}
        </button>
      </form>
    </AppBottomSheet>
  </main>
</template>

<style scoped>
.accounts-page {
  min-height: 100dvh;
  padding-bottom: calc(var(--size-bottom-nav) + var(--space-6) + env(safe-area-inset-bottom));
  background: var(--color-background);
}

.accounts-page__safe-top {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}

.accounts-page__content {
  display: grid;
  max-width: 520px;
  padding: var(--space-4) var(--page-gutter);
  margin: 0 auto;
  gap: var(--space-3);
}

.asset-summary > span,
.asset-summary small {
  color: var(--color-text-secondary);
  font-size: var(--type-label-size);
  line-height: var(--type-label-line);
}

.asset-summary__amount {
  display: block;
  margin: var(--space-1) 0 var(--space-2);
  font-size: var(--type-money-display-size);
  font-weight: 600;
  line-height: var(--type-money-display-line);
}

.asset-summary small {
  color: var(--color-text-tertiary);
}

.account-list {
  padding: 0 var(--space-4);
}

.account-list__title {
  display: flex;
  height: 48px;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-divider);
}

.account-list__title strong {
  font-size: var(--type-section-title-size);
  font-weight: 600;
}

.account-list__title span {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}

.account-row {
  display: grid;
  width: 100%;
  min-height: 68px;
  padding: var(--space-2) 0;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  border-top: 1px solid var(--color-divider);
}

.account-row:first-of-type {
  border-top: 0;
}

.account-row__body {
  display: grid;
  min-width: 0;
}

.account-row__body strong,
.account-row__amount {
  font-size: var(--type-list-primary-size);
  font-weight: 500;
  line-height: var(--type-list-primary-line);
}

.account-row__body small {
  overflow: hidden;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: var(--type-caption-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-state {
  display: grid;
  min-height: 120px;
  padding: var(--space-5);
  place-items: center;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--type-body-size);
  text-align: center;
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

.account-form {
  display: grid;
  gap: var(--space-4);
}

.account-form label {
  display: grid;
  gap: var(--space-2);
}

.account-form label > span {
  color: var(--color-text-secondary);
  font-size: var(--type-label-size);
  line-height: var(--type-label-line);
}

.account-form input,
.account-form select {
  width: 100%;
  height: 48px;
  padding: 0 var(--space-3);
  color: var(--color-text-primary);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
  outline: 0;
}

.account-form input:focus,
.account-form select:focus {
  border-color: var(--color-primary-500);
}

.primary-button {
  height: 48px;
  color: white;
  font-weight: 600;
  background: var(--color-primary-600);
  border: 0;
  border-radius: var(--radius-control);
}

.primary-button:disabled {
  opacity: 0.55;
}

.form-error {
  padding: var(--space-3);
  color: var(--color-danger);
  font-size: var(--type-body-size);
  line-height: var(--type-body-line);
  background: rgb(185 67 67 / 8%);
  border-radius: var(--radius-control);
}
</style>
