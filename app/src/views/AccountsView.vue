<script setup lang="ts">
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronRight,
  Eye,
  EyeOff,
  MoreHorizontal,
  Plus,
  Search,
} from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'

import AccountBrandIcon from '@/components/AccountBrandIcon.vue'
import AppBottomSheet from '@/components/AppBottomSheet.vue'
import AppIconButton from '@/components/AppIconButton.vue'
import BaseCard from '@/components/BaseCard.vue'
import MoneyText from '@/components/MoneyText.vue'
import type { AccountBalanceRecord } from '@/domain/entities'
import {
  ACCOUNT_CATALOG_GROUPS,
  BANK_CATALOG,
  findAccountCatalogItem,
  type AccountCatalogItem,
  type BankCatalogItem,
} from '@/features/finance/account-catalog'
import { summarizeAssets, type AssetSectionSummary } from '@/features/finance/asset-summary'
import { useFinanceService } from '@/features/finance/finance-service'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const finance = useFinanceService()
const accounts = ref<AccountBalanceRecord[]>([])
const loading = ref(true)
const errorMessage = ref('')
const formError = ref('')
const saving = ref(false)
const amountsVisible = ref(true)
const showCatalog = ref(false)
const showBanks = ref(false)
const showForm = ref(false)
const showGroup = ref(false)
const bankQuery = ref('')
const pendingItem = ref<AccountCatalogItem>()
const selectedBank = ref<BankCatalogItem>()
const selectedSection = ref<AssetSectionSummary>()
const form = ref({ name: '', institution: '' })

const overview = computed(() => summarizeAssets(accounts.value))
const visibleSections = computed(() =>
  overview.value.sections.filter(
    (section) =>
      ['credit', 'funds', 'prepaid', 'investment'].includes(section.id) || section.count > 0,
  ),
)
const filteredBanks = computed(() => {
  const query = bankQuery.value.trim().toLowerCase()
  if (!query) return BANK_CATALOG
  return BANK_CATALOG.filter(
    (bank) => bank.name.toLowerCase().includes(query) || bank.id.includes(query),
  )
})
const sectionAccounts = computed(() => {
  const types = selectedSection.value?.accountTypes ?? []
  return accounts.value.filter((account) => types.includes(account.type))
})
const liabilityRatioLabel = computed(() => `${(overview.value.liabilityRatio * 100).toFixed(2)}%`)

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

function chooseCatalogItem(item: AccountCatalogItem): void {
  pendingItem.value = item
  selectedBank.value = undefined
  showCatalog.value = false
  if (item.chooseBank) {
    bankQuery.value = ''
    showBanks.value = true
    return
  }
  beginAccountForm(item.name, item.institution ?? '')
}

function chooseBank(bank: BankCatalogItem): void {
  const item = pendingItem.value
  if (!item) return
  const isCreditCard = item.type === 'credit_card'
  selectedBank.value = bank
  showBanks.value = false
  beginAccountForm(isCreditCard ? `${bank.name}信用卡` : bank.name, bank.name)
}

function beginAccountForm(name: string, institution: string): void {
  form.value = { name, institution }
  formError.value = ''
  showForm.value = true
}

async function submitAccount(): Promise<void> {
  const item = pendingItem.value
  if (!finance || !appStore.ledgerId || !item || saving.value) return
  saving.value = true
  formError.value = ''
  try {
    await finance.createAccount({
      ledgerId: appStore.ledgerId,
      name: form.value.name,
      type: item.type,
      institution: form.value.institution,
    })
    showForm.value = false
    pendingItem.value = undefined
    selectedBank.value = undefined
    await loadAccounts()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

function openSection(section: AssetSectionSummary): void {
  selectedSection.value = section
  showGroup.value = true
}

function iconForAccount(account: AccountBalanceRecord): AccountCatalogItem {
  return findAccountCatalogItem(account.name, account.institution)
}

onMounted(loadAccounts)
</script>

<template>
  <main class="assets-page">
    <section class="assets-hero">
      <div class="assets-hero__safe-top">
        <AppIconButton class="assets-hero__more" label="资产设置">
          <MoreHorizontal :size="24" :stroke-width="1.75" aria-hidden="true" />
        </AppIconButton>
      </div>
      <button
        class="assets-hero__visibility"
        type="button"
        @click="amountsVisible = !amountsVisible"
      >
        <span>净资产</span>
        <Eye v-if="amountsVisible" :size="20" :stroke-width="1.75" aria-hidden="true" />
        <EyeOff v-else :size="20" :stroke-width="1.75" aria-hidden="true" />
      </button>
      <MoneyText
        v-if="amountsVisible"
        class="assets-hero__net"
        :amount-minor="overview.netAssetsMinor"
      />
      <strong v-else class="assets-hero__net">••••••</strong>
      <div class="assets-hero__totals">
        <div>
          <span>总资产</span>
          <MoneyText v-if="amountsVisible" :amount-minor="overview.totalAssetsMinor" />
          <strong v-else>••••</strong>
        </div>
        <div>
          <span>总负债</span>
          <MoneyText
            v-if="amountsVisible"
            :amount-minor="
              overview.totalLiabilitiesMinor === 0 ? 0 : -overview.totalLiabilitiesMinor
            "
          />
          <strong v-else>••••</strong>
        </div>
      </div>
    </section>

    <div class="assets-page__content">
      <div v-if="loading" class="page-state">正在读取资产…</div>
      <div v-else-if="errorMessage" class="page-state page-state--error">
        <span>{{ errorMessage }}</span>
        <button type="button" @click="loadAccounts">重新加载</button>
      </div>
      <template v-else>
        <BaseCard class="trend-card">
          <header>
            <strong>资产趋势</strong>
            <MoreHorizontal :size="20" :stroke-width="1.75" aria-hidden="true" />
          </header>
          <div class="trend-card__track">
            <span :style="{ width: `${Math.min(100, overview.liabilityRatio * 100)}%` }" />
          </div>
          <div class="trend-card__footer">
            <span>{{ overview.assetCount }} 项资产｜{{ overview.liabilityCount }} 项负债</span>
            <span
              >负债率 <strong>{{ liabilityRatioLabel }}</strong></span
            >
          </div>
        </BaseCard>

        <BaseCard class="borrow-card">
          <div>
            <ArrowDownToLine :size="24" :stroke-width="1.75" aria-hidden="true" />
            <span><small>总借入</small><MoneyText :amount-minor="overview.borrowedMinor" /></span>
          </div>
          <i aria-hidden="true" />
          <div>
            <ArrowUpFromLine :size="24" :stroke-width="1.75" aria-hidden="true" />
            <span><small>总借出</small><MoneyText :amount-minor="overview.lentMinor" /></span>
          </div>
        </BaseCard>

        <BaseCard class="asset-groups">
          <button
            v-for="section in visibleSections"
            :key="section.id"
            type="button"
            @click="openSection(section)"
          >
            <strong>{{ section.label }}</strong>
            <span>
              <MoneyText :amount-minor="section.amountMinor" />
              <ChevronRight :size="22" :stroke-width="1.75" aria-hidden="true" />
            </span>
          </button>
        </BaseCard>
      </template>
    </div>

    <button
      class="asset-add-button"
      type="button"
      aria-label="添加资产"
      @click="showCatalog = true"
    >
      <Plus :size="28" :stroke-width="2" aria-hidden="true" />
    </button>

    <AppBottomSheet v-model:show="showCatalog" title="选择账户分类">
      <div class="catalog-picker">
        <section v-for="group in ACCOUNT_CATALOG_GROUPS" :key="group.id" class="catalog-section">
          <h3>{{ group.title }}</h3>
          <div class="catalog-grid">
            <button
              v-for="item in group.items"
              :key="item.id"
              type="button"
              @click="chooseCatalogItem(item)"
            >
              <AccountBrandIcon
                :label="item.name"
                :symbol="item.symbol"
                :color="item.color"
                :foreground="item.foreground"
                size="large"
              />
              <span>{{ item.name }}</span>
            </button>
          </div>
        </section>
      </div>
    </AppBottomSheet>

    <AppBottomSheet v-model:show="showBanks" title="选择银行">
      <div class="bank-picker">
        <label class="bank-search">
          <Search :size="22" :stroke-width="1.75" aria-hidden="true" />
          <input v-model="bankQuery" type="search" placeholder="搜索银行" />
        </label>
        <div class="bank-list">
          <button
            v-for="bank in filteredBanks"
            :key="bank.id"
            type="button"
            @click="chooseBank(bank)"
          >
            <AccountBrandIcon :label="bank.name" :symbol="bank.symbol" :color="bank.color" />
            <span>{{ bank.name }}</span>
          </button>
        </div>
      </div>
    </AppBottomSheet>

    <AppBottomSheet v-model:show="showForm" :title="`添加${pendingItem?.name ?? ''}账户`">
      <form class="account-form" @submit.prevent="submitAccount">
        <div v-if="pendingItem" class="account-form__type">
          <AccountBrandIcon
            :label="selectedBank?.name ?? pendingItem.name"
            :symbol="selectedBank?.symbol ?? pendingItem.symbol"
            :color="selectedBank?.color ?? pendingItem.color"
          />
          <span
            ><small>账户类型</small><strong>{{ pendingItem.name }}</strong></span
          >
        </div>
        <label>
          <span>账户名称</span>
          <input v-model="form.name" required maxlength="30" placeholder="请输入账户名称" />
        </label>
        <label>
          <span>机构（可选）</span>
          <input v-model="form.institution" maxlength="30" placeholder="例如：招商银行" />
        </label>
        <div v-if="formError" class="form-error" role="alert">{{ formError }}</div>
        <button class="primary-button" type="submit" :disabled="saving">
          {{ saving ? '正在保存…' : '保存账户' }}
        </button>
        <p class="account-form__note">本版本新账户初始余额为 ¥0.00，期初余额将在下一步接入。</p>
      </form>
    </AppBottomSheet>

    <AppBottomSheet
      v-model:show="showGroup"
      :title="selectedSection ? `${selectedSection.label}账户` : '账户明细'"
    >
      <div class="group-detail">
        <div v-if="sectionAccounts.length === 0" class="group-detail__empty">还没有此类账户</div>
        <div v-for="account in sectionAccounts" :key="account.id" class="group-account-row">
          <AccountBrandIcon
            :label="account.name"
            :symbol="iconForAccount(account).symbol"
            :color="iconForAccount(account).color"
          />
          <span
            ><strong>{{ account.name }}</strong
            ><small>{{ account.institution }}</small></span
          >
          <MoneyText :amount-minor="account.balanceMinor" />
        </div>
      </div>
    </AppBottomSheet>
  </main>
</template>

<style scoped>
.assets-page {
  min-height: 100dvh;
  padding-bottom: calc(var(--size-bottom-nav) + var(--space-8) + env(safe-area-inset-bottom));
  background: var(--color-background);
}

.assets-hero {
  position: relative;
  min-height: 238px;
  padding: calc(env(safe-area-inset-top) + var(--space-8)) var(--page-gutter) var(--space-6);
  text-align: center;
  background: var(--color-surface);
  border-radius: 0 0 var(--radius-card) var(--radius-card);
}

.assets-hero__safe-top {
  position: absolute;
  top: env(safe-area-inset-top);
  right: var(--space-2);
}

.assets-hero__visibility {
  display: inline-flex;
  padding: 0;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-tertiary);
  font-size: var(--type-section-title-size);
  background: transparent;
  border: 0;
}

.assets-hero__net {
  display: block;
  min-height: 42px;
  margin-top: var(--space-2);
  font-size: var(--type-money-display-size);
  font-weight: 600;
  line-height: 42px;
}

.assets-hero__totals {
  display: grid;
  margin-top: var(--space-5);
  grid-template-columns: 1fr 1fr;
  gap: var(--space-6);
}

.assets-hero__totals div {
  display: grid;
  gap: var(--space-1);
}

.assets-hero__totals span {
  color: var(--color-text-tertiary);
  font-size: var(--type-label-size);
}

.assets-hero__totals :deep(.money-text),
.assets-hero__totals strong {
  font-size: var(--type-money-summary-size);
  font-weight: 600;
}

.assets-page__content {
  display: grid;
  max-width: 520px;
  padding: var(--space-3) var(--page-gutter) 0;
  margin: 0 auto;
  gap: var(--space-3);
}

.trend-card header,
.trend-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.trend-card header strong {
  font-size: var(--type-section-title-size);
  font-weight: 600;
}

.trend-card header svg {
  color: var(--color-text-tertiary);
}

.trend-card__track {
  height: 8px;
  margin: var(--space-5) 0 var(--space-3);
  overflow: hidden;
  background: var(--color-primary-50);
  border-radius: var(--radius-pill);
}

.trend-card__track span {
  display: block;
  min-width: 2px;
  height: 100%;
  background: #55c59b;
}

.trend-card__footer {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}

.trend-card__footer strong {
  color: var(--color-text-primary);
  font-size: var(--type-section-title-size);
}

.borrow-card {
  display: grid;
  grid-template-columns: 1fr 1px 1fr;
  align-items: center;
  gap: var(--space-4);
}

.borrow-card > div {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
}

.borrow-card svg {
  color: var(--color-text-tertiary);
}

.borrow-card span {
  display: grid;
  text-align: left;
}

.borrow-card small {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}

.borrow-card :deep(.money-text) {
  font-size: var(--type-section-title-size);
  font-weight: 600;
}

.borrow-card i {
  height: 36px;
  background: var(--color-divider);
}

.asset-groups {
  padding: 0 var(--space-4);
}

.asset-groups button {
  display: flex;
  width: 100%;
  min-height: 60px;
  padding: 0;
  align-items: center;
  justify-content: space-between;
  color: var(--color-text-primary);
  background: transparent;
  border: 0;
  border-top: 1px solid var(--color-divider);
}

.asset-groups button:first-child {
  border-top: 0;
}

.asset-groups button > strong {
  font-size: var(--type-section-title-size);
  font-weight: 600;
}

.asset-groups button > span {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.asset-groups svg {
  color: var(--color-text-tertiary);
}

.asset-add-button {
  position: fixed;
  z-index: 18;
  right: var(--space-5);
  bottom: calc(var(--size-bottom-nav) + var(--space-5) + env(safe-area-inset-bottom));
  display: grid;
  width: 56px;
  height: 56px;
  padding: 0;
  place-items: center;
  color: white;
  background: var(--color-primary-600);
  border: 0;
  border-radius: var(--radius-pill);
  box-shadow: 0 8px 24px rgb(23 107 93 / 22%);
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

.catalog-picker,
.bank-picker,
.group-detail {
  max-height: 68dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.catalog-section + .catalog-section {
  padding-top: var(--space-5);
  margin-top: var(--space-5);
  border-top: 8px solid var(--color-background);
}

.catalog-section h3 {
  margin: 0 0 var(--space-4);
  font-size: var(--type-section-title-size);
  font-weight: 600;
}

.catalog-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-5) var(--space-2);
}

.catalog-grid button {
  display: grid;
  min-width: 0;
  padding: 0;
  place-items: center;
  gap: var(--space-2);
  color: var(--color-text-primary);
  font-size: var(--type-label-size);
  background: transparent;
  border: 0;
}

.catalog-grid button > span:last-child {
  overflow: hidden;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bank-search {
  display: flex;
  height: 48px;
  padding: 0 var(--space-3);
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-tertiary);
  background: var(--color-background);
  border-radius: var(--radius-control);
}

.bank-search input {
  min-width: 0;
  flex: 1;
  color: var(--color-text-primary);
  background: transparent;
  border: 0;
  outline: 0;
}

.bank-list {
  margin-top: var(--space-3);
}

.bank-list button,
.group-account-row {
  display: flex;
  width: 100%;
  min-height: 60px;
  padding: var(--space-2) 0;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-text-primary);
  text-align: left;
  background: transparent;
  border: 0;
  border-top: 1px solid var(--color-divider);
}

.bank-list button:first-child,
.group-account-row:first-child {
  border-top: 0;
}

.bank-list button > span:last-child {
  font-size: var(--type-list-primary-size);
  font-weight: 500;
}

.account-form {
  display: grid;
  gap: var(--space-4);
}

.account-form__type,
.group-account-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.account-form__type > span:last-child,
.group-account-row > span:nth-child(2) {
  display: grid;
  min-width: 0;
  flex: 1;
}

.account-form__type small,
.group-account-row small {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}

.account-form label {
  display: grid;
  gap: var(--space-2);
}

.account-form label > span {
  color: var(--color-text-secondary);
  font-size: var(--type-label-size);
}

.account-form input {
  width: 100%;
  height: 48px;
  padding: 0 var(--space-3);
  color: var(--color-text-primary);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
  outline: 0;
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
  background: rgb(185 67 67 / 8%);
  border-radius: var(--radius-control);
}

.account-form__note,
.group-detail__empty {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: var(--type-caption-line);
  text-align: center;
}

.group-detail__empty {
  padding: var(--space-8) 0;
}
</style>
