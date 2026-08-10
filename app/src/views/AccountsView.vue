<script setup lang="ts">
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  MoreHorizontal,
  Plus,
  Search,
} from '@lucide/vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AccountBrandIcon from '@/components/AccountBrandIcon.vue'
import AppBottomSheet from '@/components/AppBottomSheet.vue'
import AppIconButton from '@/components/AppIconButton.vue'
import BaseCard from '@/components/BaseCard.vue'
import MoneyText from '@/components/MoneyText.vue'
import { useRefreshOnActivated } from '@/composables/useRefreshOnActivated'
import { useRoutePageActive } from '@/composables/routePageActivation'
import { isLiabilityAccountType } from '@/domain/accounts'
import type { AccountBalanceRecord, CreditProfileRecord } from '@/domain/entities'
import { parseCnyInputToMinor } from '@/domain/money'
import {
  ACCOUNT_CATALOG_GROUPS,
  BANK_CATALOG,
  findAccountCatalogItem,
  type AccountCatalogItem,
  type BankCatalogItem,
} from '@/features/finance/account-catalog'
import {
  summarizeAssets,
  type AssetSectionId,
  type AssetSectionSummary,
} from '@/features/finance/asset-summary'
import { useFinanceService } from '@/features/finance/finance-service'
import { useAppStore } from '@/stores/app'
import { navigateBack } from '@/router/navigation-transition'

const appStore = useAppStore()
const router = useRouter()
const pageActive = useRoutePageActive()
const finance = useFinanceService()
type AssetAccountRecord = AccountBalanceRecord & { creditProfile?: CreditProfileRecord }

const accounts = ref<AssetAccountRecord[]>([])
const loading = ref(true)
const errorMessage = ref('')
const formError = ref('')
const saving = ref(false)
const amountsVisible = ref(true)
const showCatalog = ref(false)
const showQuickActions = ref(false)
const showGroupManagement = ref(false)
const showArchivedAccounts = ref(false)
const hiddenSectionIds = ref<AssetSectionId[]>([])
const showBanks = ref(false)
const showForm = ref(false)
const assetsPage = ref<HTMLElement>()
const assetActionsVisible = ref(true)
const expandedSectionIds = ref<AssetSectionId[]>([])
const bankQuery = ref('')
const pendingItem = ref<AccountCatalogItem>()
const selectedBank = ref<BankCatalogItem>()
const form = ref({
  name: '',
  institution: '',
  initialBalance: '',
  creditLimit: '',
  billDay: '20',
  repaymentDay: '10',
  reminderDays: '3',
  includeInAssetStats: true,
  visibleInEntry: true,
})
let assetsScrollContainer: HTMLElement | undefined
let lastAssetsScrollTop = 0
let assetTouchActive = false
let assetsUseTouchInput = false

const overview = computed(() =>
  summarizeAssets(accounts.value.filter((account) => !account.archivedAt)),
)
const visibleSections = computed(() =>
  overview.value.sections.filter(
    (section) =>
      !hiddenSectionIds.value.includes(section.id) &&
      (section.count > 0 ||
        (section.id === 'credit' &&
          accounts.value.some(
            (account) =>
              section.accountTypes.includes(account.type) &&
              (showArchivedAccounts.value || !account.archivedAt),
          ))),
  ),
)
const filteredBanks = computed(() => {
  const query = bankQuery.value.trim().toLowerCase()
  if (!query) return BANK_CATALOG
  return BANK_CATALOG.filter(
    (bank) => bank.name.toLowerCase().includes(query) || bank.id.includes(query),
  )
})
function getSectionAccounts(section: AssetSectionSummary) {
  return accounts.value.filter(
    (account) =>
      section.accountTypes.includes(account.type) &&
      (showArchivedAccounts.value || !account.archivedAt),
  )
}
const liabilityRatioLabel = computed(() => `${(overview.value.liabilityRatio * 100).toFixed(2)}%`)
const pendingIsLiability = computed(() =>
  pendingItem.value ? isLiabilityAccountType(pendingItem.value.type) : false,
)

const amountFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatMinorAmount(amountMinor: number): string {
  return amountFormatter.format(amountMinor / 100)
}

function sectionDisplayAmountMinor(section: AssetSectionSummary): number {
  if (section.id !== 'credit' || section.amountMinor === 0) return section.amountMinor
  return -Math.abs(section.amountMinor)
}

function creditBalanceLabel(account: AssetAccountRecord): string {
  const signedBalance = account.balanceMinor === 0 ? 0 : -account.balanceMinor
  return formatMinorAmount(signedBalance)
}

function availableCreditMinor(account: AssetAccountRecord): number | undefined {
  const limit = account.creditProfile?.creditLimitMinor
  if (!limit) return undefined
  return Math.max(0, limit - account.balanceMinor)
}

function availableCreditLabel(account: AssetAccountRecord): string {
  const available = availableCreditMinor(account)
  return available === undefined ? '额度未设置' : `可用 ${formatMinorAmount(available)}`
}

function availableCreditPercent(account: AssetAccountRecord): number {
  const limit = account.creditProfile?.creditLimitMinor ?? 0
  const available = availableCreditMinor(account) ?? 0
  return limit > 0 ? Math.min(100, Math.max(0, (available / limit) * 100)) : 0
}

function repaymentStatus(account: AssetAccountRecord): string {
  if (account.balanceMinor <= 0) return '已还款'
  const repaymentDay = account.creditProfile?.repaymentDay
  if (!repaymentDay) return '未设置还款日'

  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let dueDate = dateForDay(today.getFullYear(), today.getMonth(), repaymentDay)
  if (dueDate < todayStart) {
    dueDate = dateForDay(today.getFullYear(), today.getMonth() + 1, repaymentDay)
  }
  const days = Math.round((dueDate.getTime() - todayStart.getTime()) / 86_400_000)
  return days === 0 ? '今天还款' : `${days}天内还款`
}

function dateForDay(year: number, month: number, day: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(day, lastDay))
}

async function loadAccounts(options: { silent?: boolean } = {}): Promise<void> {
  if (!finance || !appStore.ledgerId) {
    loading.value = false
    errorMessage.value = '正在准备本地账本，请稍候…'
    return
  }
  if (!options.silent) loading.value = true
  errorMessage.value = ''
  try {
    const listedAccounts = await finance.listAccounts(appStore.ledgerId)
    const creditAccounts = listedAccounts.filter((account) =>
      ['credit_card', 'consumer_credit'].includes(account.type),
    )
    const creditDetails = await Promise.all(
      creditAccounts.map((account) => finance.getAccountDetail(account.id)),
    )
    const creditProfiles = new Map(
      creditDetails.flatMap((detail) =>
        detail?.creditProfile ? [[detail.id, detail.creditProfile] as const] : [],
      ),
    )
    accounts.value = listedAccounts.map((account) => ({
      ...account,
      creditProfile: creditProfiles.get(account.id),
    }))
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (!options.silent) loading.value = false
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
  form.value = {
    name,
    institution,
    initialBalance: '',
    creditLimit: '',
    billDay: '20',
    repaymentDay: '10',
    reminderDays: '3',
    includeInAssetStats: true,
    visibleInEntry: true,
  }
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
      brandKey: selectedBank.value?.id ?? item.id,
      iconKey: selectedBank.value?.symbol ?? item.symbol,
      color: selectedBank.value?.color ?? item.color,
      includeInAssetStats: form.value.includeInAssetStats,
      visibleInEntry: form.value.visibleInEntry,
      initialBalanceMinor: form.value.initialBalance.trim()
        ? parseCnyInputToMinor(form.value.initialBalance)
        : 0,
      creditLimitMinor:
        pendingIsLiability.value && form.value.creditLimit.trim()
          ? parseCnyInputToMinor(form.value.creditLimit)
          : undefined,
      billDay: pendingIsLiability.value ? Number(form.value.billDay) : undefined,
      repaymentDay: pendingIsLiability.value ? Number(form.value.repaymentDay) : undefined,
      reminderDays: pendingIsLiability.value ? Number(form.value.reminderDays) : undefined,
      occurredAt: new Date().toISOString(),
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

function toggleSection(section: AssetSectionSummary): void {
  const index = expandedSectionIds.value.indexOf(section.id)
  if (index === -1) {
    expandedSectionIds.value.push(section.id)
  } else {
    expandedSectionIds.value.splice(index, 1)
  }
}

function openAccount(account: AccountBalanceRecord): void {
  void router.push({ name: 'account-detail', params: { accountId: account.id } })
}

function goBack(): void {
  navigateBack(router, { name: 'home' })
}

function iconForAccount(account: AccountBalanceRecord): AccountCatalogItem {
  return findAccountCatalogItem(account.name, account.institution)
}

function openCatalog(): void {
  showQuickActions.value = false
  showCatalog.value = true
}

function toggleArchivedAccounts(): void {
  showArchivedAccounts.value = !showArchivedAccounts.value
  showQuickActions.value = false
}

function openGroupManagement(): void {
  showQuickActions.value = false
  showGroupManagement.value = true
}

function toggleSectionVisibility(sectionId: AssetSectionId): void {
  hiddenSectionIds.value = hiddenSectionIds.value.includes(sectionId)
    ? hiddenSectionIds.value.filter((id) => id !== sectionId)
    : [...hiddenSectionIds.value, sectionId]
  if (appStore.ledgerId) {
    localStorage.setItem(
      `finance-manager:asset-sections:${appStore.ledgerId}`,
      JSON.stringify(hiddenSectionIds.value),
    )
  }
}

function updateAssetActionsVisibility(): void {
  const scrollTop = assetsScrollContainer?.scrollTop ?? 0
  const delta = scrollTop - lastAssetsScrollTop
  if (assetsUseTouchInput && assetTouchActive && Math.abs(delta) >= 2) {
    assetActionsVisible.value = delta < 0
  } else if (!assetsUseTouchInput && scrollTop <= 2) {
    assetActionsVisible.value = true
  } else if (!assetsUseTouchInput && Math.abs(delta) >= 8) {
    assetActionsVisible.value = delta < 0
  }
  if (!assetActionsVisible.value) showQuickActions.value = false
  lastAssetsScrollTop = scrollTop
}

function handleAssetTouchStart(event: TouchEvent): void {
  const touch = event.touches[0]
  assetsUseTouchInput = true
  assetTouchActive = Boolean(touch && event.touches.length === 1)
  lastAssetsScrollTop = assetsScrollContainer?.scrollTop ?? 0
}

function handleAssetTouchEnd(): void {
  assetTouchActive = false
  lastAssetsScrollTop = assetsScrollContainer?.scrollTop ?? 0
}

function bindAssetsScroll(): void {
  assetsScrollContainer = assetsPage.value ?? undefined
  lastAssetsScrollTop = assetsScrollContainer?.scrollTop ?? 0
  assetsScrollContainer?.addEventListener('scroll', updateAssetActionsVisibility, { passive: true })
  updateAssetActionsVisibility()
}

onMounted(() => {
  if (appStore.ledgerId) {
    const stored = localStorage.getItem(`finance-manager:asset-sections:${appStore.ledgerId}`)
    try {
      hiddenSectionIds.value = stored ? (JSON.parse(stored) as AssetSectionId[]) : []
    } catch {
      hiddenSectionIds.value = []
    }
  }
  void loadAccounts()
  bindAssetsScroll()
})
useRefreshOnActivated(() => loadAccounts({ silent: true }))

onUnmounted(() => {
  assetsScrollContainer?.removeEventListener('scroll', updateAssetActionsVisibility)
})
</script>

<template>
  <main
    ref="assetsPage"
    class="assets-page"
    @touchstart.passive="handleAssetTouchStart"
    @touchend="handleAssetTouchEnd"
    @touchcancel="handleAssetTouchEnd"
  >
    <section class="assets-hero">
      <div class="assets-hero__safe-top">
        <AppIconButton label="返回首页" @click="goBack">
          <ChevronLeft :size="24" :stroke-width="1.9" aria-hidden="true" />
        </AppIconButton>
        <AppIconButton
          class="assets-hero__more"
          label="资产设置"
          @click="router.push({ name: 'settings' })"
        >
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
        <button type="button" @click="loadAccounts()">重新加载</button>
      </div>
      <template v-else>
        <BaseCard class="trend-card">
          <button
            class="trend-card__button"
            type="button"
            @click="router.push({ name: 'asset-statistics' })"
          >
            <header>
              <strong>资产趋势</strong>
              <ChevronRight :size="20" :stroke-width="1.75" aria-hidden="true" />
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
          </button>
        </BaseCard>

        <BaseCard class="borrow-card">
          <button type="button" @click="router.push({ name: 'payables' })">
            <ArrowDownToLine :size="24" :stroke-width="1.75" aria-hidden="true" />
            <span>
              <small>总借入</small>
              <MoneyText
                v-if="amountsVisible"
                :amount-minor="overview.borrowedMinor === 0 ? 0 : overview.borrowedMinor"
                tone="expense"
              />
              <strong v-else>••••</strong>
            </span>
          </button>
          <i aria-hidden="true" />
          <button type="button" @click="router.push({ name: 'receivables' })">
            <ArrowUpFromLine :size="24" :stroke-width="1.75" aria-hidden="true" />
            <span>
              <small>总借出</small>
              <MoneyText
                v-if="amountsVisible"
                :amount-minor="overview.lentMinor"
                tone="income"
                :show-plus="overview.lentMinor > 0"
              />
              <strong v-else>••••</strong>
            </span>
          </button>
        </BaseCard>

        <BaseCard
          v-for="section in visibleSections"
          :key="section.id"
          class="section-card"
          :class="{
            'section-card--empty': section.count === 0,
            'section-card--expanded': expandedSectionIds.includes(section.id),
          }"
        >
          <button
            type="button"
            :aria-expanded="expandedSectionIds.includes(section.id)"
            @click="toggleSection(section)"
          >
            <strong>{{ section.label }}</strong>
            <span>
              <MoneyText
                :amount-minor="sectionDisplayAmountMinor(section)"
                :show-currency="false"
              />
              <ChevronRight
                :size="22"
                :stroke-width="1.75"
                aria-hidden="true"
                class="section-card__chevron"
              />
            </span>
          </button>
          <div v-if="expandedSectionIds.includes(section.id)" class="section-card__body">
            <div v-if="getSectionAccounts(section).length === 0" class="section-card__empty">
              还没有此类账户
            </div>
            <button
              v-for="account in getSectionAccounts(section)"
              :key="account.id"
              class="section-card__row"
              :class="{ 'credit-account-row': section.id === 'credit' }"
              type="button"
              @click="openAccount(account)"
            >
              <template v-if="section.id === 'credit'">
                <AccountBrandIcon
                  :label="account.name"
                  :brand-key="account.brandKey ?? iconForAccount(account).id"
                  :symbol="account.iconKey ?? iconForAccount(account).symbol"
                  :color="account.color ?? iconForAccount(account).color"
                />
                <span class="credit-account-row__content">
                  <span class="credit-account-row__heading">
                    <strong>{{ account.name }}</strong>
                    <strong v-if="amountsVisible" class="credit-account-row__balance">{{
                      creditBalanceLabel(account)
                    }}</strong>
                    <strong v-else class="credit-account-row__balance">••••</strong>
                  </span>
                  <span class="credit-account-row__track" aria-hidden="true">
                    <i :style="{ width: `${availableCreditPercent(account)}%` }" />
                  </span>
                  <span class="credit-account-row__meta">
                    <small>{{ repaymentStatus(account) }}</small>
                    <small>{{
                      amountsVisible ? availableCreditLabel(account) : '可用 ••••'
                    }}</small>
                  </span>
                </span>
              </template>
              <template v-else>
                <AccountBrandIcon
                  :label="account.name"
                  :brand-key="account.brandKey ?? iconForAccount(account).id"
                  :symbol="account.iconKey ?? iconForAccount(account).symbol"
                  :color="account.color ?? iconForAccount(account).color"
                />
                <span
                  ><strong>{{ account.name }}</strong
                  ><small>{{ account.institution }}</small></span
                >
                <MoneyText :amount-minor="account.balanceMinor" />
                <ChevronRight :size="20" :stroke-width="1.75" aria-hidden="true" />
              </template>
            </button>
          </div>
        </BaseCard>
      </template>
    </div>

    <Teleport to="body">
      <template v-if="pageActive">
        <div v-if="showQuickActions" class="asset-quick-actions">
          <button type="button" @click="openCatalog">
            <span>添加账户</span><Plus :size="20" />
          </button>
          <button type="button" @click="openGroupManagement">
            <span>账户分组管理</span><MoreHorizontal :size="20" />
          </button>
          <button type="button" @click="toggleArchivedAccounts">
            <span>{{ showArchivedAccounts ? '隐藏已归档账户' : '显示已归档账户' }}</span>
            <EyeOff v-if="showArchivedAccounts" :size="20" />
            <Eye v-else :size="20" />
          </button>
        </div>

        <button
          class="asset-add-button"
          :class="{ 'asset-add-button--hidden': !assetActionsVisible }"
          type="button"
          aria-label="资产快捷操作"
          :aria-expanded="showQuickActions"
          @click="showQuickActions = !showQuickActions"
        >
          <Plus
            :size="28"
            :stroke-width="2"
            aria-hidden="true"
            :class="{ 'asset-add-button__icon--open': showQuickActions }"
          />
        </button>
      </template>
    </Teleport>

    <AppBottomSheet v-model:show="showGroupManagement" title="账户分组管理">
      <div class="group-management">
        <p>关闭后该分组只从资产首页隐藏，不影响账户、流水和统计数据。</p>
        <label v-for="section in overview.sections" :key="section.id">
          <span
            ><strong>{{ section.label }}</strong
            ><small>{{ section.count }} 个账户</small></span
          >
          <input
            type="checkbox"
            :checked="!hiddenSectionIds.includes(section.id)"
            @change="toggleSectionVisibility(section.id)"
          />
        </label>
      </div>
    </AppBottomSheet>

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
                :brand-key="item.id"
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
            <AccountBrandIcon
              :label="bank.name"
              :brand-key="bank.id"
              :symbol="bank.symbol"
              :color="bank.color"
            />
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
            :brand-key="selectedBank?.id ?? pendingItem.id"
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
        <label>
          <span>{{ pendingIsLiability ? '当前欠款' : '当前余额' }}</span>
          <input
            v-model="form.initialBalance"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            placeholder="0.00"
          />
        </label>
        <template v-if="pendingIsLiability">
          <label>
            <span>总额度</span>
            <input
              v-model="form.creditLimit"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              placeholder="0.00"
            />
          </label>
          <div class="account-form__credit-days">
            <label>
              <span>出账日</span>
              <input v-model="form.billDay" type="number" min="1" max="31" required />
            </label>
            <label>
              <span>还款日</span>
              <input v-model="form.repaymentDay" type="number" min="1" max="31" required />
            </label>
            <label>
              <span>提前提醒</span>
              <input v-model="form.reminderDays" type="number" min="0" max="30" required />
            </label>
          </div>
        </template>
        <label class="account-form__switch">
          <span><strong>计入资产统计</strong><small>关闭后不参与总资产和资产趋势</small></span>
          <input v-model="form.includeInAssetStats" type="checkbox" />
        </label>
        <label class="account-form__switch">
          <span><strong>记账时显示</strong><small>关闭后不会出现在账户选择器</small></span>
          <input v-model="form.visibleInEntry" type="checkbox" />
        </label>
        <div v-if="formError" class="form-error" role="alert">{{ formError }}</div>
        <button class="primary-button" type="submit" :disabled="saving">
          {{ saving ? '正在保存…' : '保存账户' }}
        </button>
        <p class="account-form__note">当前余额会作为期初余额记入独立流水，不计入月收入或月支出。</p>
      </form>
    </AppBottomSheet>
  </main>
</template>

<style scoped>
.assets-page {
  height: 100dvh;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: calc(96px + env(safe-area-inset-bottom));
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
  left: var(--space-2);
  right: var(--space-2);
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.trend-card__button {
  display: block;
  width: 100%;
  padding: 0;
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
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

.borrow-card > button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: var(--radius-control);
}

.borrow-card > button:active {
  background: var(--color-primary-50);
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

.borrow-card :deep(.money-text),
.borrow-card strong {
  font-size: var(--type-section-title-size);
  font-weight: 600;
}

.borrow-card i {
  height: 36px;
  background: var(--color-divider);
}

.section-card {
  padding: 0 var(--space-4);
}

.section-card > button {
  display: flex;
  width: 100%;
  min-height: 60px;
  padding: var(--space-2) 0;
  align-items: center;
  justify-content: space-between;
  color: var(--color-text-primary);
  background: transparent;
  border: 0;
}

.section-card--empty > button {
  opacity: 0.55;
}

.section-card > button > strong {
  font-size: var(--type-section-title-size);
  font-weight: 600;
}

.section-card > button > span {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.section-card > button :deep(.money-text) {
  color: var(--color-text-primary);
  font-weight: 600;
}

.section-card__chevron {
  color: var(--color-text-tertiary);
  transition: transform var(--motion-short) var(--ease-standard);
}

.section-card--expanded > button .section-card__chevron {
  transform: rotate(90deg);
}

.section-card__body {
  padding: 0 0 var(--space-2);
}

.section-card__row {
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
  border-radius: var(--radius-control);
}

.section-card__row:active {
  background: var(--color-primary-50);
}

.section-card__row > span:nth-child(2) {
  display: grid;
  min-width: 0;
  flex: 1;
}

.section-card__row small {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}

.section-card__row svg {
  color: var(--color-text-tertiary);
}

.credit-account-row {
  min-height: 82px;
  padding: var(--space-3) 0;
  align-items: center;
  border-radius: 0;
}

.credit-account-row__content {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 5px;
}

.credit-account-row__heading,
.credit-account-row__meta {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.credit-account-row__heading > strong:first-child {
  overflow: hidden;
  font-size: var(--type-list-primary-size);
  font-weight: 500;
  line-height: var(--type-list-primary-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.credit-account-row__balance {
  flex: 0 0 auto;
  font-size: var(--type-list-amount-size);
  font-variant-numeric: tabular-nums lining-nums;
  font-weight: 500;
  line-height: var(--type-list-amount-line);
}

.credit-account-row__track {
  display: block;
  height: 4px;
  overflow: hidden;
  background: var(--color-primary-50);
  border-radius: var(--radius-pill);
}

.credit-account-row__track i {
  display: block;
  height: 100%;
  background: var(--color-primary-500);
  border-radius: inherit;
  transition: width var(--motion-base) var(--ease-standard);
}

.credit-account-row__meta small {
  overflow: hidden;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  font-variant-numeric: tabular-nums lining-nums;
  line-height: var(--type-caption-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.credit-account-row__meta small:last-child {
  text-align: right;
}

.section-card__empty {
  padding: var(--space-8) 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: var(--type-caption-line);
  text-align: center;
}

.asset-add-button {
  position: fixed;
  z-index: 18;
  right: var(--space-5);
  bottom: calc(var(--space-5) + env(safe-area-inset-bottom));
  display: grid;
  width: 56px;
  height: 56px;
  padding: 0;
  place-items: center;
  color: white;
  background: var(--color-primary-600);
  border: 0;
  border-radius: var(--radius-pill);
  box-shadow: 0 8px 24px rgb(var(--color-primary-rgb) / 22%);
  transition:
    opacity var(--motion-base) var(--ease-emphasized),
    transform var(--motion-base) var(--ease-emphasized),
    box-shadow var(--motion-fast) var(--ease-standard);
}

.asset-add-button--hidden {
  pointer-events: none;
  opacity: 0;
  transform: scale(0.55);
}

.asset-add-button svg {
  transition: transform var(--motion-fast) var(--ease-standard);
}

.asset-add-button__icon--open {
  transform: rotate(45deg);
}

.asset-quick-actions {
  position: fixed;
  z-index: 17;
  right: var(--space-5);
  bottom: calc(88px + env(safe-area-inset-bottom));
  display: grid;
  justify-items: end;
  gap: var(--space-2);
}

.asset-quick-actions button {
  display: flex;
  min-height: 42px;
  padding: var(--space-2) var(--space-3);
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-primary);
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-card);
}

.asset-quick-actions svg {
  color: var(--color-primary-600);
}

.group-management {
  display: grid;
  gap: var(--space-2);
}

.group-management > p {
  margin: 0 0 var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
}

.group-management label {
  display: flex;
  min-height: 52px;
  padding: var(--space-2) 0;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-divider);
}

.group-management label span {
  display: grid;
  gap: 2px;
}

.group-management label small {
  color: var(--color-text-tertiary);
}

.group-management input {
  width: 22px;
  height: 22px;
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
.bank-picker {
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
  padding: var(--space-2);
  place-items: center;
  gap: var(--space-2);
  color: var(--color-text-primary);
  font-size: var(--type-label-size);
  background: transparent;
  border: 0;
  border-radius: var(--radius-control);
}

.catalog-grid button:active {
  background: var(--color-primary-50);
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

.bank-list button {
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
  border-radius: var(--radius-control);
}

.bank-list button:first-child {
  border-top: 0;
}

.bank-list button:active {
  background: var(--color-primary-50);
}

.bank-list button > span:last-child {
  font-size: var(--type-list-primary-size);
  font-weight: 500;
}

.account-form {
  display: grid;
  gap: var(--space-4);
}

.account-form__type {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.account-form__type > span:last-child {
  display: grid;
  min-width: 0;
  flex: 1;
}

.account-form__type small {
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

.account-form__credit-days {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
}

.account-form__credit-days input {
  padding: 0 var(--space-2);
  text-align: center;
}

.account-form label.account-form__switch {
  display: flex;
  min-height: 54px;
  padding: var(--space-2) 0;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--color-divider);
}

.account-form__switch > span {
  display: grid;
  gap: 2px;
}

.account-form__switch small {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}

.account-form .account-form__switch input {
  width: 42px;
  height: 24px;
  accent-color: var(--color-primary-600);
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

.account-form__note {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: var(--type-caption-line);
  text-align: center;
}
</style>
