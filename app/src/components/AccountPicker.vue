<script setup lang="ts">
import { computed, ref } from 'vue'
import { Filter, Plus } from '@lucide/vue'
import type { AccountBalanceRecord } from '@/domain/entities'
import { formatMinorToCny } from '@/domain/money'
import AccountAvatar from './AccountAvatar.vue'
import AccountBrandIcon from './AccountBrandIcon.vue'

const props = defineProps<{
  show: boolean
  accounts: AccountBalanceRecord[]
  selectedId?: string
  title?: string
  showNoSelection?: boolean
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  select: [account: AccountBalanceRecord | null]
  'create-account': []
}>()

const searchQuery = ref('')

const filteredAccounts = computed(() => {
  if (!searchQuery.value) return props.accounts
  const q = searchQuery.value.toLowerCase()
  return props.accounts.filter(
    (a) =>
      a.name.toLowerCase().includes(q) ||
      (a.institution && a.institution.toLowerCase().includes(q)),
  )
})

const debitAccounts = computed(() =>
  filteredAccounts.value.filter((a) => a.normalBalance === 'debit'),
)
const creditAccounts = computed(() =>
  filteredAccounts.value.filter((a) => a.normalBalance === 'credit'),
)

function select(acc: AccountBalanceRecord | null): void {
  emit('select', acc)
  emit('update:show', false)
}

function createAccount(): void {
  emit('create-account')
  emit('update:show', false)
}

function getAccountInitials(name: string): string {
  return name.slice(0, 2)
}

function getBrandColor(acc: AccountBalanceRecord): string {
  if (acc.type === 'credit_card') return 'var(--color-warning)'
  if (acc.normalBalance === 'credit') return 'var(--color-info)'
  const hash = [...acc.name].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 55%, 52%)`
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="account-picker__overlay" @click.self="emit('update:show', false)">
      <div class="account-picker">
        <header class="account-picker__header">
          <h2>{{ title || '选择一个账户' }}</h2>
          <div class="account-picker__header-actions">
            <button type="button" class="account-picker__icon-btn" aria-label="筛选">
              <Filter :size="22" :stroke-width="1.75" />
            </button>
            <button
              type="button"
              class="account-picker__icon-btn account-picker__icon-btn--primary"
              aria-label="新建账户"
              @click="createAccount"
            >
              <Plus :size="22" :stroke-width="1.75" />
            </button>
          </div>
        </header>

        <div class="account-picker__search">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索账户"
            class="account-picker__search-input"
          />
        </div>

        <div class="account-picker__body">
          <div v-if="showNoSelection" class="account-section">
            <button
              class="account-item account-item--no-select"
              type="button"
              @click="select(null)"
            >
              <AccountAvatar label="不选择账户" :size="'large'" />
              <div class="account-item__info">
                <span class="account-item__name">不选择账户</span>
              </div>
            </button>
          </div>

          <section v-if="debitAccounts.length > 0" class="account-section">
            <div class="account-section__label">资产类账户</div>
            <div class="account-grid">
              <button
                v-for="acc in debitAccounts"
                :key="acc.id"
                class="account-item"
                :class="{ selected: selectedId === acc.id }"
                type="button"
                @click="select(acc)"
              >
                <AccountBrandIcon
                  :label="acc.name"
                  :symbol="getAccountInitials(acc.name)"
                  :color="getBrandColor(acc)"
                  :size="'large'"
                />
                <div class="account-item__info">
                  <span class="account-item__name">{{ acc.name }}</span>
                  <span class="account-item__balance">{{
                    formatMinorToCny(acc.balanceMinor)
                  }}</span>
                </div>
              </button>
            </div>
          </section>

          <section v-if="creditAccounts.length > 0" class="account-section">
            <div class="account-section__label">信用/负债类</div>
            <div class="account-grid">
              <button
                v-for="acc in creditAccounts"
                :key="acc.id"
                class="account-item"
                :class="{ selected: selectedId === acc.id }"
                type="button"
                @click="select(acc)"
              >
                <AccountBrandIcon
                  :label="acc.name"
                  :symbol="getAccountInitials(acc.name)"
                  :color="getBrandColor(acc)"
                  :size="'large'"
                />
                <div class="account-item__info">
                  <span class="account-item__name">{{ acc.name }}</span>
                  <span class="account-item__balance">{{
                    formatMinorToCny(acc.balanceMinor)
                  }}</span>
                </div>
              </button>
            </div>
          </section>

          <div v-if="filteredAccounts.length === 0" class="account-empty">暂无账户，请先创建</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.account-picker__overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
  display: flex;
  align-items: flex-end;
  background: rgb(0 0 0 / 45%);
}

.account-picker {
  display: flex;
  max-height: 75vh;
  width: 100%;
  flex-direction: column;
  background: var(--color-surface);
  border-radius: 20px 20px 0 0;
  overflow: hidden;
}

.account-picker__header {
  display: flex;
  min-height: 56px;
  padding: 0 var(--space-4);
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-divider);
}

.account-picker__header h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.account-picker__header-actions {
  display: flex;
  gap: var(--space-2);
}

.account-picker__icon-btn {
  display: flex;
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  background: var(--color-background);
  border: 0;
  border-radius: 12px;
}

.account-picker__icon-btn--primary {
  color: white;
  background: var(--color-primary-500);
}

.account-picker__search {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-divider);
}

.account-picker__search-input {
  width: 100%;
  padding: 10px 14px;
  font-size: 15px;
  color: var(--color-text-primary);
  background: var(--color-background);
  border: 0;
  border-radius: 12px;
  outline: none;
}

.account-picker__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-3) var(--space-4) env(safe-area-inset-bottom);
}

.account-section {
  margin-bottom: var(--space-4);
}

.account-section__label {
  margin-bottom: var(--space-2);
  color: var(--color-text-tertiary);
  font-size: 13px;
  font-weight: 500;
  padding-left: 4px;
}

.account-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: var(--space-2);
}

.account-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: var(--space-3) var(--space-2);
  background: var(--color-background);
  border: 2px solid transparent;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.account-item:active {
  transform: scale(0.97);
}

.account-item.selected {
  border-color: var(--color-primary-500);
  background: var(--color-primary-50);
}

.account-item--no-select {
  flex-direction: row;
  justify-content: flex-start;
  gap: var(--space-3);
  padding: var(--space-3);
}

.account-item__info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
  width: 100%;
}

.account-item--no-select .account-item__info {
  align-items: flex-start;
}

.account-item__name {
  color: var(--color-text-primary);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  text-align: center;
}

.account-item--no-select .account-item__name {
  text-align: left;
}

.account-item__balance {
  color: var(--color-text-tertiary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.account-empty {
  padding: var(--space-6);
  text-align: center;
  color: var(--color-text-tertiary);
}
</style>
