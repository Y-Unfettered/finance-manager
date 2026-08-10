<script setup lang="ts">
import { Check, ChevronRight, ImagePlus, RotateCcw, Search } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AccountBrandIcon from '@/components/AccountBrandIcon.vue'
import AppBottomSheet from '@/components/AppBottomSheet.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import type { AccountBalanceRecord, AccountDetailRecord } from '@/domain/entities'
import {
  ACCOUNT_CATALOG_GROUPS,
  BANK_CATALOG,
  findAccountCatalogItem,
  type AccountCatalogItem,
  type BankCatalogItem,
} from '@/features/finance/account-catalog'
import { useFinanceService } from '@/features/finance/finance-service'
import { useAppStore } from '@/stores/app'
import { prepareAccountIconDataUri } from '@/utils/account-icon-image'

type IconChoice = AccountCatalogItem | BankCatalogItem

const router = useRouter()
const appStore = useAppStore()
const finance = useFinanceService()
const accounts = ref<AccountBalanceRecord[]>([])
const selectedAccount = ref<AccountDetailRecord>()
const showPicker = ref(false)
const loading = ref(true)
const saving = ref(false)
const preparingIcon = ref(false)
const error = ref('')
const query = ref('')
const customIconInput = ref<HTMLInputElement>()

const activeAccounts = computed(() => accounts.value.filter((account) => !account.archivedAt))
const busy = computed(() => saving.value || preparingIcon.value)
const filteredGroups = computed(() =>
  ACCOUNT_CATALOG_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(matchesQuery),
  })).filter((group) => group.items.length),
)
const filteredBanks = computed(() => BANK_CATALOG.filter(matchesQuery))
const suggestedIcon = computed(() =>
  selectedAccount.value
    ? findAccountCatalogItem(selectedAccount.value.name, selectedAccount.value.institution)
    : undefined,
)

function matchesQuery(choice: IconChoice): boolean {
  const term = query.value.trim().toLowerCase()
  if (!term) return true
  const aliases = 'aliases' in choice ? choice.aliases?.join(' ') : ''
  return `${choice.name} ${choice.id} ${aliases ?? ''}`
    .toLowerCase()
    .includes(term)
}

function appearance(account: AccountBalanceRecord): AccountCatalogItem {
  return findAccountCatalogItem(account.name, account.institution)
}

async function load(): Promise<void> {
  if (!finance || !appStore.ledgerId) {
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    accounts.value = await finance.listAccounts(appStore.ledgerId)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loading.value = false
  }
}

async function openPicker(account: AccountBalanceRecord): Promise<void> {
  if (!finance) return
  error.value = ''
  query.value = ''
  const detail = await finance.getAccountDetail(account.id)
  if (!detail) {
    error.value = '账户不存在或已被删除'
    return
  }
  selectedAccount.value = detail
  showPicker.value = true
}

async function saveIcon(brandKey: string, iconKey: string, color: string): Promise<void> {
  const account = selectedAccount.value
  if (!finance || !account || saving.value) return
  saving.value = true
  error.value = ''
  try {
    await finance.updateAccount({
      ledgerId: account.ledgerId,
      accountId: account.id,
      name: account.name,
      type: account.type,
      institution: account.institution,
      brandKey,
      iconKey,
      color,
      includeInAssetStats: account.preference.includeInAssetStats,
      visibleInEntry: account.preference.visibleInEntry,
      creditLimitMinor: account.creditProfile?.creditLimitMinor,
      billDay: account.creditProfile?.billDay,
      repaymentDay: account.creditProfile?.repaymentDay,
      reminderDays: account.creditProfile?.reminderDays,
    })
    showPicker.value = false
    selectedAccount.value = undefined
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    saving.value = false
  }
}

async function chooseIcon(choice: IconChoice): Promise<void> {
  await saveIcon(choice.id, choice.symbol, choice.color)
}

function selectCustomIcon(): void {
  if (!busy.value) customIconInput.value?.click()
}

async function uploadCustomIcon(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || busy.value) return
  error.value = ''
  preparingIcon.value = true
  try {
    const dataUri = await prepareAccountIconDataUri(file)
    preparingIcon.value = false
    await saveIcon('custom-upload', dataUri, '#ffffff')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    preparingIcon.value = false
  }
}

onMounted(load)
</script>

<template>
  <main class="icon-management-page">
    <div class="safe-top"><AppTopBar title="账户图标管理" @back="router.back()" /></div>
    <div class="content">
      <p class="intro">选择账户后可替换为任意品牌、银行或通用账户图标，不会影响余额和流水。</p>
      <div v-if="loading" class="state">正在读取账户…</div>
      <div v-else-if="error && !showPicker" class="state state--error">{{ error }}</div>
      <BaseCard v-else-if="activeAccounts.length" class="account-list">
        <button
          v-for="account in activeAccounts"
          :key="account.id"
          type="button"
          @click="openPicker(account)"
        >
          <AccountBrandIcon
            :label="account.name"
            :brand-key="account.brandKey ?? appearance(account).id"
            :symbol="account.iconKey ?? appearance(account).symbol"
            :color="account.color ?? appearance(account).color"
          />
          <span>
            <strong>{{ account.name }}</strong>
            <small>{{ account.institution || '未设置机构' }}</small>
          </span>
          <ChevronRight :size="19" aria-hidden="true" />
        </button>
      </BaseCard>
      <div v-else class="state">还没有可设置的账户</div>
    </div>

    <AppBottomSheet
      v-model:show="showPicker"
      :title="selectedAccount ? `替换“${selectedAccount.name}”图标` : '替换账户图标'"
    >
      <div class="icon-picker-sheet">
        <label class="search-box">
          <Search :size="19" aria-hidden="true" />
          <input v-model="query" type="search" placeholder="搜索支付宝、银行、充值卡…" />
        </label>

        <button
          type="button"
          class="custom-upload-choice"
          :disabled="busy"
          @click="selectCustomIcon"
        >
          <ImagePlus :size="20" />
          <span>
            <strong>上传自定义图标</strong>
            <small>支持 PNG、JPG、WebP，自动缩放为正方形</small>
          </span>
          <AccountBrandIcon
            v-if="selectedAccount?.preference.iconKey?.startsWith('data:image/')"
            :label="selectedAccount.name"
            brand-key="custom-upload"
            :symbol="selectedAccount.preference.iconKey"
            color="#ffffff"
          />
          <ChevronRight v-else :size="19" />
        </button>
        <input
          ref="customIconInput"
          class="custom-upload-input"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          @change="uploadCustomIcon"
        />

        <button
          v-if="suggestedIcon && !query"
          type="button"
          class="auto-choice"
          :disabled="busy"
          @click="chooseIcon(suggestedIcon)"
        >
          <RotateCcw :size="18" />
          <span><strong>恢复自动匹配</strong><small>按账户名称和机构选择图标</small></span>
          <AccountBrandIcon
            :label="suggestedIcon.name"
            :brand-key="suggestedIcon.id"
            :symbol="suggestedIcon.symbol"
            :color="suggestedIcon.color"
          />
        </button>

        <section v-for="group in filteredGroups" :key="group.id" class="choice-section">
          <h3>{{ group.title }}</h3>
          <div class="choice-grid">
            <button
              v-for="item in group.items"
              :key="item.id"
              type="button"
              :disabled="busy"
              :class="{ active: selectedAccount?.preference.brandKey === item.id }"
              @click="chooseIcon(item)"
            >
              <AccountBrandIcon
                :label="item.name"
                :brand-key="item.id"
                :symbol="item.symbol"
                :color="item.color"
                size="large"
              />
              <span>{{ item.name }}</span>
              <Check v-if="selectedAccount?.preference.brandKey === item.id" :size="13" />
            </button>
          </div>
        </section>

        <section v-if="filteredBanks.length" class="choice-section">
          <h3>银行图标</h3>
          <div class="choice-grid">
            <button
              v-for="bank in filteredBanks"
              :key="bank.id"
              type="button"
              :disabled="busy"
              :class="{ active: selectedAccount?.preference.brandKey === bank.id }"
              @click="chooseIcon(bank)"
            >
              <AccountBrandIcon
                :label="bank.name"
                :brand-key="bank.id"
                :symbol="bank.symbol"
                :color="bank.color"
                size="large"
              />
              <span>{{ bank.name }}</span>
              <Check v-if="selectedAccount?.preference.brandKey === bank.id" :size="13" />
            </button>
          </div>
        </section>

        <p v-if="error" class="picker-error">{{ error }}</p>
        <div v-if="!filteredGroups.length && !filteredBanks.length" class="state">
          没有匹配的图标
        </div>
      </div>
    </AppBottomSheet>
  </main>
</template>

<style scoped>
.icon-management-page {
  min-height: 100dvh;
  background: var(--color-background);
}

.safe-top {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}

.content {
  display: grid;
  max-width: 520px;
  padding: var(--space-4) var(--page-gutter) calc(var(--space-8) + env(safe-area-inset-bottom));
  margin: auto;
  gap: var(--space-3);
}

.intro {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: var(--type-caption-line);
}

.account-list {
  padding: 0 var(--space-4);
}

.account-list button {
  display: grid;
  width: 100%;
  min-height: 64px;
  padding: 0;
  grid-template-columns: 32px 1fr 20px;
  align-items: center;
  gap: var(--space-3);
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  border-top: 1px solid var(--color-divider);
}

.account-list button:first-child {
  border-top: 0;
}

.account-list button > span {
  display: grid;
}

.account-list small,
.auto-choice small {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}

.account-list button > svg {
  color: var(--color-text-tertiary);
}

.state {
  padding: var(--space-6);
  color: var(--color-text-tertiary);
  text-align: center;
}

.state--error,
.picker-error {
  color: var(--color-danger);
}

.icon-picker-sheet {
  display: grid;
  max-height: 72dvh;
  overflow-y: auto;
  gap: var(--space-4);
  overscroll-behavior: contain;
}

.search-box {
  display: flex;
  min-height: 44px;
  padding: 0 var(--space-3);
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-tertiary);
  background: var(--color-background);
  border-radius: var(--radius-control);
}

.search-box input {
  min-width: 0;
  flex: 1;
  color: var(--color-text-primary);
  background: transparent;
  border: 0;
  outline: 0;
}

.auto-choice {
  display: grid;
  min-height: 58px;
  padding: var(--space-2) var(--space-3);
  grid-template-columns: 22px 1fr 32px;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-primary-700);
  text-align: left;
  background: var(--color-primary-50);
  border: 0;
  border-radius: var(--radius-control);
}

.custom-upload-choice {
  display: grid;
  min-height: 62px;
  padding: var(--space-2) var(--space-3);
  grid-template-columns: 24px 1fr 32px;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-primary-700);
  text-align: left;
  background: var(--color-primary-50);
  border: 1px solid var(--color-primary-100);
  border-radius: var(--radius-control);
}

.custom-upload-choice > span {
  display: grid;
}

.custom-upload-choice > svg:last-child {
  color: var(--color-text-tertiary);
}

.custom-upload-input {
  display: none;
}

.auto-choice > span {
  display: grid;
}

.choice-section h3 {
  margin: 0 0 var(--space-3);
  font-size: var(--type-label-size);
  font-weight: 600;
}

.choice-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2);
}

.choice-grid button {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 72px;
  padding: var(--space-2) var(--space-1);
  place-items: center;
  gap: 5px;
  color: var(--color-text-secondary);
  font-size: 11px;
  background: var(--color-background);
  border: 1px solid transparent;
  border-radius: var(--radius-control);
}

.choice-grid button.active {
  color: var(--color-primary-700);
  background: var(--color-primary-50);
  border-color: var(--color-primary-500);
}

.choice-grid button > span {
  overflow: hidden;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.choice-grid button > svg {
  position: absolute;
  top: 5px;
  right: 5px;
  color: var(--color-primary-600);
}

.picker-error {
  margin: 0;
  font-size: var(--type-caption-size);
  text-align: center;
}
</style>
