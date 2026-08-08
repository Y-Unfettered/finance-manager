<script setup lang="ts">
import { CalendarClock, Pencil, SlidersHorizontal, Archive, ArchiveRestore } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AccountBrandIcon from '@/components/AccountBrandIcon.vue'
import AppBottomSheet from '@/components/AppBottomSheet.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import MoneyText from '@/components/MoneyText.vue'
import TransactionDetailSheet from '@/components/TransactionDetailSheet.vue'
import type { AccountActivityRecord } from '@/db/repositories/transaction-repository'
import type { AccountBalanceRecord } from '@/domain/entities'
import { parseCnyInputToMinor } from '@/domain/money'
import { findAccountCatalogItem } from '@/features/finance/account-catalog'
import { useFinanceService } from '@/features/finance/finance-service'

const route = useRoute()
const router = useRouter()
const finance = useFinanceService()
const account = ref<AccountBalanceRecord>()
const activities = ref<AccountActivityRecord[]>([])
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const showAdjust = ref(false)
const showRename = ref(false)
const showTxDetail = ref(false)
const activeTxId = ref<string>()
const form = ref({ balance: '', occurredAt: localDateTimeValue(new Date()), note: '' })
const renameForm = ref({ name: '' })

const accountId = computed(() => String(route.params.accountId ?? ''))
const icon = computed(() =>
  findAccountCatalogItem(account.value?.name ?? '', account.value?.institution),
)
const isArchived = computed(() => Boolean(account.value?.archivedAt))

async function load(): Promise<void> {
  if (!finance || !accountId.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const [accountRow, activityRows] = await Promise.all([
      finance.getAccount(accountId.value),
      finance.listAccountActivity(accountId.value),
    ])
    if (!accountRow) throw new Error('账户不存在')
    account.value = accountRow
    activities.value = activityRows
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

function openAdjust(): void {
  if (!account.value) return
  form.value = {
    balance: (account.value.balanceMinor / 100).toFixed(2),
    occurredAt: localDateTimeValue(new Date()),
    note: '',
  }
  errorMessage.value = ''
  showAdjust.value = true
}

async function submitAdjustment(): Promise<void> {
  if (!finance || !account.value || saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await finance.adjustAccountBalance({
      ledgerId: account.value.ledgerId,
      accountId: account.value.id,
      balanceMinor: parseCnyInputToMinor(form.value.balance),
      occurredAt: new Date(form.value.occurredAt).toISOString(),
      note: form.value.note,
    })
    showAdjust.value = false
    await load()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

function openRename(): void {
  if (!account.value) return
  renameForm.value = { name: account.value.name }
  errorMessage.value = ''
  showRename.value = true
}

async function submitRename(): Promise<void> {
  if (!finance || !account.value || saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await finance.renameAccount({
      ledgerId: account.value.ledgerId,
      accountId: account.value.id,
      name: renameForm.value.name,
    })
    showRename.value = false
    await load()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

async function toggleArchive(): Promise<void> {
  if (!finance || !account.value || saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    if (isArchived.value) {
      await finance.unarchiveAccount(account.value.ledgerId, account.value.id)
    } else {
      await finance.archiveAccount(account.value.ledgerId, account.value.id)
    }
    await load()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

function openActivity(item: AccountActivityRecord): void {
  if (!item.transactionId) return
  activeTxId.value = item.transactionId
  showTxDetail.value = true
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function localDateTimeValue(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return shifted.toISOString().slice(0, 16)
}

onMounted(load)
</script>

<template>
  <main class="detail-page">
    <div class="detail-page__safe-top">
      <AppTopBar title="账户详情" @back="router.back()" />
    </div>
    <div v-if="loading" class="page-state">正在读取账户…</div>
    <div v-else-if="!account" class="page-state page-state--error">{{ errorMessage }}</div>
    <div v-else class="detail-page__content">
      <BaseCard class="account-hero" :class="{ 'account-hero--archived': isArchived }">
        <AccountBrandIcon
          :label="account.name"
          :symbol="icon.symbol"
          :color="icon.color"
          size="large"
        />
        <strong>{{ account.name }}</strong>
        <span>{{ account.institution || '个人账户' }}</span>
        <MoneyText :amount-minor="account.balanceMinor" />
        <small>当前余额</small>
        <span v-if="isArchived" class="account-hero__archived-tag">已归档</span>
      </BaseCard>

      <div v-if="errorMessage" class="inline-error" role="alert">{{ errorMessage }}</div>

      <div class="action-row">
        <button class="action-button" type="button" @click="openAdjust">
          <SlidersHorizontal :size="19" :stroke-width="1.75" aria-hidden="true" />
          <span>调整余额</span>
        </button>
        <button class="action-button" type="button" @click="openRename">
          <Pencil :size="19" :stroke-width="1.75" aria-hidden="true" />
          <span>重命名</span>
        </button>
        <button
          class="action-button"
          :class="{ 'action-button--danger': !isArchived }"
          type="button"
          :disabled="saving"
          @click="toggleArchive"
        >
          <ArchiveRestore v-if="isArchived" :size="19" :stroke-width="1.75" aria-hidden="true" />
          <Archive v-else :size="19" :stroke-width="1.75" aria-hidden="true" />
          <span>{{ isArchived ? '取消归档' : '归档账户' }}</span>
        </button>
      </div>
      <p v-if="!isArchived" class="archive-hint">归档前需先将账户余额调整为 0。</p>

      <section class="activity-section">
        <h2>账户流水</h2>
        <BaseCard v-if="activities.length" class="activity-card">
          <button
            v-for="item in activities"
            :key="`${item.id}-${item.transactionId}`"
            type="button"
            class="activity-row"
            @click="openActivity(item)"
          >
            <CalendarClock :size="18" :stroke-width="1.75" aria-hidden="true" />
            <span
              ><strong>{{ item.title }}</strong
              ><small>{{ formatDate(item.occurredAt) }}</small></span
            >
            <MoneyText
              :amount-minor="item.changeMinor"
              :tone="item.changeMinor > 0 ? 'income' : item.changeMinor < 0 ? 'expense' : 'default'"
              :show-plus="item.changeMinor > 0"
            />
          </button>
        </BaseCard>
        <div v-else class="empty-state">还没有账户流水</div>
      </section>
    </div>

    <AppBottomSheet v-model:show="showAdjust" title="调整账户余额">
      <form class="sheet-form" @submit.prevent="submitAdjustment">
        <label
          ><span>调整后的余额</span><input v-model="form.balance" inputmode="decimal" required
        /></label>
        <label
          ><span>调整时间</span><input v-model="form.occurredAt" type="datetime-local" required
        /></label>
        <label
          ><span>备注（可选）</span
          ><textarea
            v-model="form.note"
            rows="3"
            maxlength="120"
            placeholder="例如：与银行实际余额核对"
          />
        </label>
        <div v-if="errorMessage" class="form-error">{{ errorMessage }}</div>
        <button class="primary-button" type="submit" :disabled="saving">
          {{ saving ? '正在保存…' : '确认调整' }}
        </button>
        <p>系统只记录本次差额，历史流水不会被覆盖。</p>
      </form>
    </AppBottomSheet>

    <AppBottomSheet v-model:show="showRename" title="重命名账户">
      <form class="sheet-form" @submit.prevent="submitRename">
        <label
          ><span>账户名称</span
          ><input
            v-model="renameForm.name"
            required
            maxlength="30"
            placeholder="请输入新的账户名称"
        /></label>
        <div v-if="errorMessage" class="form-error">{{ errorMessage }}</div>
        <button class="primary-button" type="submit" :disabled="saving">
          {{ saving ? '正在保存…' : '确认重命名' }}
        </button>
      </form>
    </AppBottomSheet>

    <TransactionDetailSheet
      :show="showTxDetail"
      :transaction-id="activeTxId"
      @update:show="showTxDetail = $event"
      @updated="load"
    />
  </main>
</template>

<style scoped>
.detail-page {
  min-height: 100dvh;
  background: var(--color-background);
}
.detail-page__safe-top {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}
.detail-page__content {
  display: grid;
  max-width: 520px;
  padding: var(--space-4) var(--page-gutter) calc(var(--space-8) + env(safe-area-inset-bottom));
  margin: auto;
  gap: var(--space-4);
}
.account-hero {
  display: grid;
  padding: var(--space-6);
  place-items: center;
  text-align: center;
}
.account-hero > strong {
  margin-top: var(--space-3);
  font-size: var(--type-page-title-size);
}
.account-hero > span {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.account-hero :deep(.money-text) {
  margin-top: var(--space-5);
  font-size: var(--type-money-display-size);
  font-weight: 600;
}
.account-hero > small {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.account-hero--archived {
  opacity: 0.7;
}
.account-hero__archived-tag {
  display: inline-block;
  margin-top: var(--space-2);
  padding: var(--space-1) var(--space-3);
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  background: var(--color-background);
  border-radius: var(--radius-pill);
}
.inline-error {
  padding: var(--space-3);
  color: var(--color-danger);
  font-size: var(--type-body-size);
  background: rgb(185 67 67 / 8%);
  border-radius: var(--radius-control);
}
.action-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
}
.action-button {
  display: grid;
  padding: var(--space-3) var(--space-2);
  align-items: center;
  justify-items: center;
  gap: var(--space-1);
  color: var(--color-primary-700);
  font-size: var(--type-label-size);
  font-weight: 600;
  background: var(--color-primary-50);
  border: 0;
  border-radius: var(--radius-control);
}
.action-button:disabled {
  opacity: 0.55;
}
.action-button--danger {
  color: var(--color-danger);
  background: rgb(185 67 67 / 8%);
}
.archive-hint {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  text-align: center;
}
.activity-section h2 {
  margin: var(--space-2) 0 var(--space-3);
  font-size: var(--type-section-title-size);
}
.activity-card {
  padding: 0 var(--space-4);
}
.activity-row {
  display: grid;
  min-height: 64px;
  padding: 0;
  grid-template-columns: 24px 1fr auto;
  align-items: center;
  gap: var(--space-3);
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  border-top: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
}
.activity-row:first-child {
  border-top: 0;
}
.activity-row:not(:disabled):active {
  background: var(--color-primary-50);
}
.activity-row:disabled {
  opacity: 0.6;
  cursor: default;
}
.activity-row > svg {
  color: var(--color-text-tertiary);
}
.activity-row > span {
  display: grid;
}
.activity-row strong {
  font-size: var(--type-list-primary-size);
}
.activity-row small {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.activity-row :deep(.money-text) {
  font-size: var(--type-list-amount-size);
  font-weight: 600;
}
.empty-state,
.page-state {
  padding: var(--space-10);
  color: var(--color-text-tertiary);
  text-align: center;
}
.page-state--error,
.form-error {
  color: var(--color-danger);
}
.sheet-form {
  display: grid;
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
.sheet-form textarea {
  width: 100%;
  padding: var(--space-3);
  color: var(--color-text-primary);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
  outline: 0;
}
.sheet-form input {
  height: 48px;
}
.sheet-form textarea {
  resize: none;
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
.sheet-form p {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  text-align: center;
}
</style>
