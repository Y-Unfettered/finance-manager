<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import MoneyText from '@/components/MoneyText.vue'
import { useRefreshOnActivated } from '@/composables/useRefreshOnActivated'
import type { AccountType } from '@/domain/accounts'
import type { AccountBalanceRecord } from '@/domain/entities'
import { useStatisticsService } from '@/features/statistics/statistics-service'
import { useAppStore } from '@/stores/app'

interface StatementGroupDefinition {
  id: string
  label: string
  types: readonly AccountType[]
}

interface StatementGroup extends StatementGroupDefinition {
  accounts: AccountBalanceRecord[]
}

const assetDefinitions: readonly StatementGroupDefinition[] = [
  {
    id: 'funds',
    label: '现金（及等价物）',
    types: ['cash', 'bank', 'platform', 'restricted_asset'],
  },
  { id: 'prepaid', label: '预付及充值', types: ['prepaid'] },
  { id: 'investment', label: '投资资产', types: ['investment'] },
  { id: 'receivable', label: '应收账款', types: ['receivable'] },
]
const liabilityDefinitions: readonly StatementGroupDefinition[] = [
  { id: 'credit', label: '信用负债', types: ['credit_card', 'consumer_credit'] },
  { id: 'other-liability', label: '其他负债', types: ['other_liability'] },
]

const route = useRoute()
const router = useRouter()
const store = useAppStore()
const service = useStatisticsService()
const periodKey = computed(() => String(route.params.periodKey ?? ''))
const accounts = ref<AccountBalanceRecord[]>([])
const loading = ref(true)
const error = ref('')

const totalAssetsMinor = computed(() =>
  accounts.value
    .filter((account) => account.normalBalance === 'debit')
    .reduce((total, account) => total + account.balanceMinor, 0),
)
const totalLiabilitiesMinor = computed(() =>
  accounts.value
    .filter((account) => account.normalBalance === 'credit')
    .reduce((total, account) => total + account.balanceMinor, 0),
)
const liabilityRatio = computed(() =>
  totalAssetsMinor.value > 0 ? totalLiabilitiesMinor.value / totalAssetsMinor.value : 0,
)
const assetGroups = computed(() => buildGroups(assetDefinitions))
const liabilityGroups = computed(() => buildGroups(liabilityDefinitions))
const riskLabel = computed(() => {
  if (liabilityRatio.value < 0.2) return '低风险'
  if (liabilityRatio.value < 0.5) return '需关注'
  return '高风险'
})
const riskClass = computed(() => {
  if (liabilityRatio.value < 0.2) return 'safe'
  if (liabilityRatio.value < 0.5) return 'warning'
  return 'danger'
})

function buildGroups(definitions: readonly StatementGroupDefinition[]): StatementGroup[] {
  return definitions
    .map((definition) => ({
      ...definition,
      accounts: accounts.value
        .filter((account) => definition.types.includes(account.type) && account.balanceMinor !== 0)
        .sort((left, right) => Math.abs(right.balanceMinor) - Math.abs(left.balanceMinor)),
    }))
    .filter((group) => group.accounts.length > 0)
}

async function load(): Promise<void> {
  if (!service || !store.ledgerId) {
    loading.value = false
    error.value = '账本尚未准备好，请稍后重试'
    return
  }
  loading.value = true
  error.value = ''
  try {
    accounts.value = await service.assetStatement(store.ledgerId, periodKey.value)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loading.value = false
  }
}

function openAccount(accountId: string): void {
  void router.push({ name: 'account-detail', params: { accountId } })
}

onMounted(load)
useRefreshOnActivated(load)
</script>

<template>
  <main class="statement-page">
    <div class="safe-top"><AppTopBar title="资产负债表" @back="router.back()" /></div>
    <div class="statement-content">
      <p class="statement-period">{{ periodKey }}</p>
      <div v-if="loading" class="state">正在读取月末资产…</div>
      <div v-else-if="error" class="state error">{{ error }}</div>
      <template v-else>
        <BaseCard class="ratio-card">
          <div>
            <strong>负债率</strong>
            <small>（总负债/总资产）× 100%</small>
          </div>
          <div>
            <strong>{{ (liabilityRatio * 100).toFixed(2) }}%</strong>
            <span :class="riskClass">{{ riskLabel }}</span>
          </div>
        </BaseCard>

        <BaseCard class="statement-card">
          <header>
            <strong>资产</strong>
            <MoneyText :amount-minor="totalAssetsMinor" :show-currency="false" />
          </header>
          <template v-for="group in assetGroups" :key="group.id">
            <div class="statement-card__group">{{ group.label }}</div>
            <button
              v-for="account in group.accounts"
              :key="account.id"
              type="button"
              class="statement-card__row"
              @click="openAccount(account.id)"
            >
              <span>{{ account.name }}</span>
              <MoneyText :amount-minor="account.balanceMinor" :show-currency="false" />
              <ChevronRight :size="19" aria-hidden="true" />
            </button>
          </template>
          <div v-if="assetGroups.length === 0" class="statement-card__empty">该月没有资产</div>
        </BaseCard>

        <BaseCard class="statement-card">
          <header>
            <strong>负债</strong>
            <MoneyText
              :amount-minor="totalLiabilitiesMinor === 0 ? 0 : -totalLiabilitiesMinor"
              :show-currency="false"
            />
          </header>
          <template v-for="group in liabilityGroups" :key="group.id">
            <div class="statement-card__group statement-card__group--liability">
              {{ group.label }}
            </div>
            <button
              v-for="account in group.accounts"
              :key="account.id"
              type="button"
              class="statement-card__row"
              @click="openAccount(account.id)"
            >
              <span>{{ account.name }}</span>
              <MoneyText
                :amount-minor="account.balanceMinor === 0 ? 0 : -account.balanceMinor"
                :show-currency="false"
              />
              <ChevronRight :size="19" aria-hidden="true" />
            </button>
          </template>
          <div v-if="liabilityGroups.length === 0" class="statement-card__empty">该月没有负债</div>
        </BaseCard>
      </template>
    </div>
  </main>
</template>

<style scoped src="./statistics-shared.css"></style>
<style scoped>
.statement-page {
  min-height: 100dvh;
  background: var(--color-background);
}
.statement-content {
  display: grid;
  max-width: 520px;
  padding: var(--space-2) var(--page-gutter) calc(var(--space-8) + env(safe-area-inset-bottom));
  margin: auto;
  gap: var(--space-3);
}
.statement-period {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  text-align: center;
}
.ratio-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ratio-card > div {
  display: grid;
  gap: 2px;
}
.ratio-card > div:last-child {
  justify-items: end;
}
.ratio-card small {
  color: var(--color-text-tertiary);
}
.ratio-card > div:last-child strong {
  font-size: 24px;
  font-variant-numeric: tabular-nums;
}
.ratio-card span {
  padding: 2px 7px;
  font-size: var(--type-caption-size);
  border-radius: var(--radius-control);
}
.ratio-card .safe {
  color: var(--color-income);
  background: color-mix(in srgb, var(--color-income) 12%, transparent);
}
.ratio-card .warning {
  color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 12%, transparent);
}
.ratio-card .danger {
  color: var(--color-expense);
  background: color-mix(in srgb, var(--color-expense) 12%, transparent);
}
.statement-card {
  padding: 0;
  overflow: hidden;
}
.statement-card header {
  display: flex;
  min-height: 54px;
  padding: 0 var(--space-4);
  align-items: center;
  justify-content: space-between;
  font-size: var(--type-section-title-size);
}
.statement-card header :deep(.money-text) {
  font-weight: 700;
}
.statement-card__group {
  padding: 7px var(--space-4);
  color: var(--color-primary-700);
  font-size: var(--type-label-size);
  font-weight: 650;
  background: var(--color-primary-50);
}
.statement-card__group--liability {
  color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 10%, var(--color-surface));
}
.statement-card__row {
  display: grid;
  width: 100%;
  min-height: 52px;
  padding: 0 var(--space-3) 0 var(--space-4);
  grid-template-columns: minmax(0, 1fr) auto 20px;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-primary);
  font: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  border-top: 1px solid var(--color-divider);
}
.statement-card__row :deep(.money-text) {
  font-variant-numeric: tabular-nums;
}
.statement-card__row svg {
  color: var(--color-text-tertiary);
}
.statement-card__empty {
  padding: var(--space-5);
  color: var(--color-text-tertiary);
  text-align: center;
  border-top: 1px solid var(--color-divider);
}
</style>
