<script setup lang="ts">
import { BarChart3, MoreHorizontal, Pencil, Plus, WalletCards } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AccountBrandIcon from '@/components/AccountBrandIcon.vue'
import AppBottomSheet from '@/components/AppBottomSheet.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import MoneyText from '@/components/MoneyText.vue'
import TransactionDetailSheet from '@/components/TransactionDetailSheet.vue'
import type { AccountActivityRecord } from '@/db/repositories/transaction-repository'
import { isLiabilityAccountType, type AccountType } from '@/domain/accounts'
import { statementPeriodForDate, repaymentDateForStatement } from '@/domain/credit-cycle'
import type { AccountDetailRecord } from '@/domain/entities'
import { parseCnyInputToMinor } from '@/domain/money'
import { findAccountCatalogItem } from '@/features/finance/account-catalog'
import { useFinanceService } from '@/features/finance/finance-service'

const route = useRoute()
const router = useRouter()
const finance = useFinanceService()
const account = ref<AccountDetailRecord>()
const activities = ref<AccountActivityRecord[]>([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const showEdit = ref(false)
const showMore = ref(false)
const showAdjust = ref(false)
const showTx = ref(false)
const activeTx = ref<string>()
const form = ref({
  name: '',
  type: 'cash' as AccountType,
  institution: '',
  creditLimit: '',
  billDay: '',
  repaymentDay: '',
  includeInAssetStats: true,
  visibleInEntry: true,
})
const adjustForm = ref({ balance: '', note: '' })
const accountId = computed(() => String(route.params.accountId ?? ''))
const liability = computed(() =>
  account.value ? isLiabilityAccountType(account.value.type) : false,
)
const icon = computed(() =>
  findAccountCatalogItem(account.value?.name ?? '', account.value?.institution),
)
const availableCredit = computed(() =>
  Math.max(
    0,
    (account.value?.creditProfile?.creditLimitMinor ?? 0) - (account.value?.balanceMinor ?? 0),
  ),
)
const nextRepayment = computed(() => {
  const p = account.value?.creditProfile
  if (!p?.billDay || !p.repaymentDay) return undefined
  const now = new Date()
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return repaymentDateForStatement(key, p.billDay, p.repaymentDay)
})
const groups = computed(() => {
  const map = new Map<
    string,
    {
      key: string
      label: string
      period?: string
      rows: AccountActivityRecord[]
      inflow: number
      outflow: number
      spending: number
      refund: number
      repayment: number
    }
  >()
  for (const row of activities.value) {
    let key: string
    let period: string | undefined
    const statementDate =
      row.type === 'refund' && row.originalOccurredAt ? row.originalOccurredAt : row.occurredAt
    if (liability.value && account.value?.creditProfile?.billDay) {
      const value = statementPeriodForDate(statementDate, account.value.creditProfile.billDay)
      key = value.statementPeriodKey
      period = `${value.startUtc.slice(5, 10)}—${new Date(new Date(value.endUtc).getTime() - 1).toISOString().slice(5, 10)}`
    } else key = row.occurredAt.slice(0, 7)
    let group = map.get(key)
    if (!group) {
      group = {
        key,
        label: `${Number(key.slice(5))}月`,
        period,
        rows: [],
        inflow: 0,
        outflow: 0,
        spending: 0,
        refund: 0,
        repayment: 0,
      }
      map.set(key, group)
    }
    group.rows.push(row)
    if (row.changeMinor > 0) group.inflow += row.changeMinor
    else group.outflow += Math.abs(row.changeMinor)
    if (row.type === 'credit_purchase') group.spending += row.amountMinor
    if (row.type === 'refund') group.refund += row.amountMinor
    if (row.type === 'repayment') group.repayment += row.amountMinor
  }
  return [...map.values()].sort((a, b) => b.key.localeCompare(a.key))
})
async function load() {
  if (!finance || !accountId.value) return
  loading.value = true
  error.value = ''
  try {
    const [detail, rows] = await Promise.all([
      finance.getAccountDetail(accountId.value),
      finance.listAccountActivity(accountId.value),
    ])
    if (!detail) throw new Error('账户不存在')
    account.value = detail
    activities.value = rows
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}
function openEdit() {
  if (!account.value) return
  const p = account.value.creditProfile
  form.value = {
    name: account.value.name,
    type: account.value.type,
    institution: account.value.institution ?? '',
    creditLimit: p ? String(p.creditLimitMinor / 100) : '',
    billDay: p?.billDay ? String(p.billDay) : '',
    repaymentDay: p?.repaymentDay ? String(p.repaymentDay) : '',
    includeInAssetStats: account.value.preference.includeInAssetStats,
    visibleInEntry: account.value.preference.visibleInEntry,
  }
  showEdit.value = true
}
async function save() {
  if (!finance || !account.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    await finance.updateAccount({
      ledgerId: account.value.ledgerId,
      accountId: account.value.id,
      name: form.value.name,
      type: form.value.type,
      institution: form.value.institution,
      brandKey: account.value.preference.brandKey,
      iconKey: account.value.preference.iconKey,
      color: account.value.preference.color,
      includeInAssetStats: form.value.includeInAssetStats,
      visibleInEntry: form.value.visibleInEntry,
      creditLimitMinor: form.value.creditLimit ? parseCnyInputToMinor(form.value.creditLimit) : 0,
      billDay: form.value.billDay ? Number(form.value.billDay) : undefined,
      repaymentDay: form.value.repaymentDay ? Number(form.value.repaymentDay) : undefined,
    })
    showEdit.value = false
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}
function openActivity(row: AccountActivityRecord) {
  activeTx.value = row.transactionId
  showTx.value = true
}
function goRepay() {
  void router.push({
    name: 'new-expense',
    query: { mode: 'repayment', accountId: accountId.value },
  })
}
function openAdjust() {
  if (!account.value) return
  adjustForm.value = { balance: String(account.value.balanceMinor / 100), note: '' }
  showMore.value = false
  showAdjust.value = true
}
async function adjust() {
  if (!finance || !account.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    await finance.adjustAccountBalance({
      ledgerId: account.value.ledgerId,
      accountId: account.value.id,
      balanceMinor: parseCnyInputToMinor(adjustForm.value.balance),
      occurredAt: new Date().toISOString(),
      note: adjustForm.value.note || '手动核对余额',
    })
    showAdjust.value = false
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}
async function toggleArchive() {
  if (!finance || !account.value) return
  error.value = ''
  try {
    if (account.value.archivedAt) {
      await finance.unarchiveAccount(account.value.ledgerId, account.value.id)
    } else {
      if (!confirm('归档后记账时不再显示该账户，历史流水仍会保留。确认归档？')) return
      await finance.archiveAccount(account.value.ledgerId, account.value.id)
    }
    showMore.value = false
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(
    new Date(value),
  )
}
onMounted(load)
</script>

<template>
  <main class="account-page">
    <div class="safe-top">
      <AppTopBar :title="account?.name ?? '账户详情'" @back="router.back()" />
    </div>
    <div v-if="loading" class="state">正在读取账户…</div>
    <div v-else-if="!account" class="state error">{{ error }}</div>
    <div v-else class="content">
      <BaseCard class="hero"
        ><AccountBrandIcon
          :label="account.name"
          :symbol="account.preference.iconKey ?? icon.symbol"
          :color="account.preference.color ?? icon.color"
          size="large"
        /><span class="hero-label">{{ liability ? '当前欠款' : '当前余额' }}</span
        ><MoneyText :amount-minor="account.balanceMinor" />
        <div v-if="liability" class="credit-grid">
          <div>
            <small>总额度</small
            ><MoneyText :amount-minor="account.creditProfile?.creditLimitMinor ?? 0" />
          </div>
          <div><small>可用额度</small><MoneyText :amount-minor="availableCredit" /></div>
          <div>
            <small>出账日</small><strong>{{ account.creditProfile?.billDay ?? '—' }}</strong>
          </div>
          <div>
            <small>还款日</small
            ><strong>{{ nextRepayment ?? account.creditProfile?.repaymentDay ?? '—' }}</strong>
          </div>
        </div></BaseCard
      >
      <div class="actions">
        <button
          type="button"
          @click="router.push({ name: 'account-statistics', params: { accountId } })"
        >
          <BarChart3 :size="19" />统计</button
        ><button type="button" @click="openEdit"><Pencil :size="19" />修改</button
        ><button type="button" @click="showMore = true"><MoreHorizontal :size="19" />更多</button>
      </div>
      <section>
        <h2>{{ liability ? '账单与还款' : '账户流水' }}</h2>
        <BaseCard v-for="group in groups" :key="group.key" class="month-card"
          ><header>
            <span
              ><strong>{{ group.label }}</strong
              ><small v-if="group.period">{{ group.period }}</small></span
            ><span v-if="liability"
              ><small
                >消费 ¥{{ (group.spending / 100).toFixed(2) }} · 退款 ¥{{
                  (group.refund / 100).toFixed(2)
                }}</small
              ><small>还款 ¥{{ (group.repayment / 100).toFixed(2) }}</small></span
            ><span v-else
              ><small>流入 ¥{{ (group.inflow / 100).toFixed(2) }}</small
              ><small>流出 ¥{{ (group.outflow / 100).toFixed(2) }}</small></span
            >
          </header>
          <button v-for="row in group.rows" :key="row.id" type="button" @click="openActivity(row)">
            <span
              ><strong>{{ row.title }}</strong
              ><small>{{ formatDate(row.occurredAt) }}</small></span
            ><MoneyText
              :amount-minor="row.changeMinor"
              :tone="row.changeMinor > 0 ? 'income' : row.changeMinor < 0 ? 'expense' : 'default'"
            /></button
        ></BaseCard>
        <div v-if="!groups.length" class="state">还没有账户流水</div>
      </section>
    </div>
    <div v-if="account && !account.archivedAt" class="bottom-actions">
      <button type="button" @click="router.push({ name: 'new-expense', query: { accountId } })">
        <Plus :size="20" />记一笔</button
      ><button v-if="liability" type="button" @click="goRepay">
        <WalletCards :size="20" />还款
      </button>
    </div>
    <AppBottomSheet v-model:show="showEdit" title="修改账户"
      ><form class="editor" @submit.prevent="save">
        <label
          ><span>账户类型</span
          ><select v-model="form.type">
            <option value="cash">现金</option>
            <option value="bank">银行卡</option>
            <option value="platform">平台余额</option>
            <option value="restricted_asset">受限资产</option>
            <option value="prepaid">预付资产</option>
            <option value="investment">投资余额</option>
            <option value="credit_card">信用卡</option>
            <option value="consumer_credit">消费信用</option>
            <option value="other_liability">其他负债</option>
          </select></label
        ><label><span>账户名称</span><input v-model="form.name" required /></label
        ><label><span>机构</span><input v-model="form.institution" /></label
        ><template v-if="isLiabilityAccountType(form.type)"
          ><label
            ><span>总额度</span><input v-model="form.creditLimit" inputmode="decimal"
          /></label>
          <div class="two-fields">
            <label
              ><span>出账日</span
              ><input v-model="form.billDay" type="number" min="1" max="31" /></label
            ><label
              ><span>还款日</span><input v-model="form.repaymentDay" type="number" min="1" max="31"
            /></label></div></template
        ><label class="toggle"
          ><span>是否计入资产统计</span
          ><input v-model="form.includeInAssetStats" type="checkbox" /></label
        ><label class="toggle"
          ><span>记账页显示</span><input v-model="form.visibleInEntry" type="checkbox"
        /></label>
        <p v-if="error" class="error">{{ error }}</p>
        <button class="primary" type="submit" :disabled="saving">
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </form></AppBottomSheet
    ><AppBottomSheet v-model:show="showMore" title="账户信息"
      ><div v-if="account" class="more-list">
        <div>
          <span>初始创建</span><strong>{{ account.createdAt.slice(0, 10) }}</strong>
        </div>
        <div>
          <span>计入资产统计</span
          ><strong>{{ account.preference.includeInAssetStats ? '是' : '否' }}</strong>
        </div>
        <div>
          <span>账户状态</span><strong>{{ account.archivedAt ? '已归档' : '使用中' }}</strong>
        </div>
        <button type="button" @click="openAdjust">
          核对并调整{{ liability ? '欠款' : '余额' }}</button
        ><button type="button" @click="toggleArchive">
          {{ account.archivedAt ? '恢复使用' : '归档账户' }}
        </button>
        <p>账户存在余额或欠款时不能归档；有历史流水的账户不会被直接删除。</p>
      </div></AppBottomSheet
    ><AppBottomSheet v-model:show="showAdjust" :title="liability ? '调整当前欠款' : '调整当前余额'"
      ><form class="editor" @submit.prevent="adjust">
        <label
          ><span>{{ liability ? '当前欠款' : '目标余额' }}（元）</span
          ><input v-model="adjustForm.balance" required inputmode="decimal" /></label
        ><label
          ><span>调整说明</span
          ><input v-model="adjustForm.note" maxlength="40" placeholder="例如：与银行余额核对"
        /></label>
        <p v-if="error" class="error">{{ error }}</p>
        <button class="primary" type="submit" :disabled="saving">
          {{ saving ? '调整中…' : '确认调整' }}
        </button>
      </form></AppBottomSheet
    ><TransactionDetailSheet
      :show="showTx"
      :transaction-id="activeTx"
      @update:show="showTx = $event"
      @updated="load"
    />
  </main>
</template>

<style scoped>
.account-page {
  min-height: 100dvh;
  padding-bottom: calc(78px + env(safe-area-inset-bottom));
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
  padding: var(--space-4) var(--page-gutter);
  margin: auto;
  gap: var(--space-4);
}
.hero {
  display: grid;
  padding: var(--space-5);
  place-items: center;
  border: 0;
}
.hero-label {
  margin-top: var(--space-3);
  color: var(--color-text-tertiary);
}
.hero > :deep(.money-text) {
  font-size: 32px;
  font-weight: 700;
}
.credit-grid {
  display: grid;
  width: 100%;
  margin-top: var(--space-5);
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-2);
  text-align: center;
}
.credit-grid div {
  display: grid;
}
.credit-grid small {
  color: var(--color-text-tertiary);
  font-size: 10px;
}
.credit-grid :deep(.money-text),
.credit-grid strong {
  font-size: 12px;
}
.actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
}
.actions button {
  display: flex;
  height: 48px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--color-primary-700);
  background: var(--color-primary-50);
  border: 0;
  border-radius: var(--radius-control);
}
h2 {
  margin: 0 0 var(--space-3);
  font-size: var(--type-section-title-size);
}
section {
  display: grid;
  gap: var(--space-3);
}
.month-card {
  padding: 0 var(--space-4);
}
.month-card header {
  display: flex;
  min-height: 62px;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-divider);
}
.month-card header > span {
  display: grid;
}
.month-card header > span:last-child {
  text-align: right;
}
.month-card small {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.month-card button {
  display: flex;
  width: 100%;
  min-height: 58px;
  padding: 0;
  align-items: center;
  justify-content: space-between;
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  border-top: 1px solid var(--color-divider);
}
.month-card button:first-of-type {
  border-top: 0;
}
.month-card button > span {
  display: grid;
}
.state {
  padding: var(--space-8);
  color: var(--color-text-tertiary);
  text-align: center;
}
.error {
  color: var(--color-danger);
}
.bottom-actions {
  position: fixed;
  z-index: 8;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  padding: 10px var(--page-gutter) calc(10px + env(safe-area-inset-bottom));
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: var(--space-3);
  background: var(--color-surface);
  border-top: 1px solid var(--color-divider);
}
.bottom-actions button {
  display: flex;
  height: 48px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: white;
  font-weight: 600;
  background: var(--color-primary-600);
  border: 0;
  border-radius: var(--radius-control);
}
.editor {
  display: grid;
  gap: var(--space-3);
}
.editor label {
  display: grid;
  gap: 6px;
}
.editor label > span {
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
}
.editor input,
.editor select {
  height: 44px;
  padding: 0 var(--space-3);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
}
.two-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}
.editor .toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.toggle input {
  width: 22px;
  height: 22px;
}
.primary {
  height: 48px;
  color: white;
  background: var(--color-primary-600);
  border: 0;
  border-radius: var(--radius-control);
}
.more-list {
  display: grid;
}
.more-list div {
  display: flex;
  min-height: 52px;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--color-divider);
}
.more-list div:first-child {
  border-top: 0;
}
.more-list span {
  color: var(--color-text-tertiary);
}
.more-list > button {
  min-height: 48px;
  color: var(--color-primary-700);
  text-align: left;
  background: transparent;
  border: 0;
  border-top: 1px solid var(--color-divider);
}
.more-list > button + button {
  color: var(--color-danger);
}
.more-list p {
  margin: var(--space-2) 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
</style>
