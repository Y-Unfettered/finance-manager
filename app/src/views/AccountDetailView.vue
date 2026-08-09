<script setup lang="ts">
import { Pencil, Plus, Trash2, WalletCards, X } from '@lucide/vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppBottomSheet from '@/components/AppBottomSheet.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import AccountActivityMonthCard from '@/components/AccountActivityMonthCard.vue'
import BaseCard from '@/components/BaseCard.vue'
import MoneyText from '@/components/MoneyText.vue'
import { useRefreshOnActivated } from '@/composables/useRefreshOnActivated'
import { useRoutePageActive } from '@/composables/routePageActivation'
import TransactionDetailSheet from '@/components/TransactionDetailSheet.vue'
import type { LedgerListItem } from '@/db/repositories/dashboard-repository'
import type { AccountActivityRecord } from '@/db/repositories/transaction-repository'
import { isLiabilityAccountType, type AccountType } from '@/domain/accounts'
import { statementPeriodForDate, repaymentDateForStatement } from '@/domain/credit-cycle'
import type { AccountDetailRecord } from '@/domain/entities'
import { parseCnyInputToMinor } from '@/domain/money'
import { useFinanceService } from '@/features/finance/finance-service'

const route = useRoute()
const router = useRouter()
const pageActive = useRoutePageActive()
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
const selectedIds = ref<string[]>([])
const showBulkDelete = ref(false)
const showBulkEdit = ref(false)
const bulkDeleting = ref(false)
const bulkEditing = ref(false)
const bulkEditDate = ref('')
const bulkEditNote = ref('')
const accountPage = ref<HTMLElement>()
const bottomActionsVisible = ref(true)
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
let accountScrollContainer: HTMLElement | undefined
let lastAccountScrollTop = 0
let accountTouchY: number | undefined
let accountUsesTouchInput = false
const accountId = computed(() => String(route.params.accountId ?? ''))
const liability = computed(() =>
  account.value ? isLiabilityAccountType(account.value.type) : false,
)
const selectionMode = computed(() => selectedIds.value.length > 0)
const heroAmountMinor = computed(() => {
  const balanceMinor = account.value?.balanceMinor ?? 0
  return liability.value ? -Math.abs(balanceMinor) : balanceMinor
})
const repaymentDateLabel = computed(() => {
  const p = account.value?.creditProfile
  if (!p?.billDay || !p.repaymentDay) return undefined
  const now = new Date()
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return repaymentDateForStatement(key, p.billDay, p.repaymentDay).slice(5)
})

type AccountLedgerItem = LedgerListItem & {
  dateLabel: string
  ledgerLabel: string
  displayAmountMinor: number
}

const groups = computed(() => {
  const map = new Map<
    string,
    {
      key: string
      label: string
      period: string
      items: AccountLedgerItem[]
      inflow: number
      outflow: number
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
      period = formatPeriod(
        value.startUtc,
        new Date(new Date(value.endUtc).getTime() - 1).toISOString(),
      )
    } else {
      key = row.occurredAt.slice(0, 7)
      period = calendarMonthPeriod(key)
    }
    let group = map.get(key)
    if (!group) {
      group = {
        key,
        label: `${Number(key.slice(5))}月`,
        period: period ?? calendarMonthPeriod(key),
        items: [],
        inflow: 0,
        outflow: 0,
      }
      map.set(key, group)
    }
    const displayAmountMinor = liability.value ? -row.changeMinor : row.changeMinor
    group.items.push({
      id: row.transactionId,
      type: row.type,
      amountMinor: row.amountMinor,
      occurredAt: row.occurredAt,
      title: row.title,
      categoryLabel: activityCategoryLabel(row),
      accountLabel: activityAccountLabel(row),
      dateLabel: formatActivityDate(row.occurredAt),
      ledgerLabel: row.ledgerName,
      displayAmountMinor,
    })
    if (displayAmountMinor > 0) group.inflow += displayAmountMinor
    else group.outflow += Math.abs(displayAmountMinor)
  }
  return [...map.values()].sort((a, b) => b.key.localeCompare(a.key))
})

const directionalActivityTypes = new Set([
  'transfer',
  'repayment',
  'loan_out',
  'loan_recovery',
  'borrowing',
  'repay_borrowing',
])

function activityTypeLabel(type: AccountActivityRecord['type']): string {
  return {
    expense: '支出',
    income: '收入',
    transfer: '转账',
    credit_purchase: '信用消费',
    repayment: '还款',
    refund: '退款',
    loan_out: '借出款',
    loan_recovery: '收到还款',
    borrowing: '借入款',
    repay_borrowing: '归还借款',
    balance_adjustment: '余额调整',
    opening_balance: '期初余额',
  }[type]
}

function activityCategoryLabel(row: AccountActivityRecord): string {
  return directionalActivityTypes.has(row.type)
    ? activityTypeLabel(row.type)
    : (row.categoryName ?? activityTypeLabel(row.type))
}

function activityAccountLabel(row: AccountActivityRecord): string {
  if (!directionalActivityTypes.has(row.type)) return row.accountName
  return [row.sourceAccountName, row.targetAccountName].filter(Boolean).join('→') || row.accountName
}

function formatPeriod(start: string, end: string): string {
  return `${start.slice(5, 10).replace('-', '/')}–${end.slice(5, 10).replace('-', '/')}`
}

function calendarMonthPeriod(key: string): string {
  const [year, month] = key.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year!, month!, 0)).getUTCDate()
  return `${String(month).padStart(2, '0')}/01–${String(month).padStart(2, '0')}/${String(lastDay).padStart(2, '0')}`
}

function formatActivityDate(value: string): string {
  const date = new Date(value)
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
async function load(options: { silent?: boolean } = {}) {
  if (!finance || !accountId.value) return
  if (!options.silent) loading.value = true
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
    if (!options.silent) loading.value = false
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
function openActivity(item: LedgerListItem) {
  activeTx.value = item.id
  showTx.value = true
}
function startSelection(item: LedgerListItem): void {
  selectedIds.value = [item.id]
  bottomActionsVisible.value = false
}
function toggleSelection(item: LedgerListItem): void {
  selectedIds.value = selectedIds.value.includes(item.id)
    ? selectedIds.value.filter((id) => id !== item.id)
    : [...selectedIds.value, item.id]
  if (!selectedIds.value.length) bottomActionsVisible.value = true
}
function cancelSelection(): void {
  selectedIds.value = []
  showBulkDelete.value = false
  showBulkEdit.value = false
  bulkEditDate.value = ''
  bulkEditNote.value = ''
  bottomActionsVisible.value = true
}
function editSelection(): void {
  const id = selectedIds.value[0]
  if (!id) return
  if (selectedIds.value.length === 1) {
    void router.push({ name: 'new-expense', query: { edit: id } })
    return
  }
  showBulkEdit.value = true
}
async function applyBulkEdit(): Promise<void> {
  if (
    !finance ||
    !account.value ||
    bulkEditing.value ||
    (!bulkEditDate.value && !bulkEditNote.value.trim())
  )
    return
  bulkEditing.value = true
  try {
    const occurredAt = bulkEditDate.value
      ? new Date(`${bulkEditDate.value}T12:00:00`).toISOString()
      : undefined
    const note = bulkEditNote.value.trim() || undefined
    for (const transactionId of selectedIds.value) {
      await finance.editTransaction({
        ledgerId: account.value.ledgerId,
        transactionId,
        occurredAt,
        note,
      })
    }
    cancelSelection()
    await load()
  } finally {
    bulkEditing.value = false
  }
}
async function deleteSelection(): Promise<void> {
  if (!finance || !account.value || bulkDeleting.value) return
  bulkDeleting.value = true
  try {
    for (const transactionId of selectedIds.value) {
      await finance.voidTransaction(account.value.ledgerId, transactionId)
    }
    cancelSelection()
    await load()
  } finally {
    bulkDeleting.value = false
  }
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
function updateBottomActionsVisibility(): void {
  const scrollTop = accountScrollContainer?.scrollTop ?? 0
  const delta = scrollTop - lastAccountScrollTop
  if (scrollTop <= 2) bottomActionsVisible.value = true
  else if (!accountUsesTouchInput && Math.abs(delta) >= 8) {
    bottomActionsVisible.value = delta < 0
  }
  lastAccountScrollTop = scrollTop
}

function handleAccountTouchStart(event: TouchEvent): void {
  const touch = event.touches[0]
  accountUsesTouchInput = true
  accountTouchY = touch && event.touches.length === 1 ? touch.clientY : undefined
}

function handleAccountTouchMove(event: TouchEvent): void {
  const touch = event.touches[0]
  if (!touch || accountTouchY === undefined) return
  const deltaY = touch.clientY - accountTouchY
  if (Math.abs(deltaY) < 12) return
  bottomActionsVisible.value = deltaY > 0
  accountTouchY = touch.clientY
}

function handleAccountTouchEnd(): void {
  accountTouchY = undefined
}

function bindAccountScroll(): void {
  accountScrollContainer = accountPage.value?.closest<HTMLElement>('.route-page-frame') ?? undefined
  lastAccountScrollTop = accountScrollContainer?.scrollTop ?? 0
  accountScrollContainer?.addEventListener('scroll', updateBottomActionsVisibility, {
    passive: true,
  })
  updateBottomActionsVisibility()
}

onMounted(() => {
  void load()
  bindAccountScroll()
})
useRefreshOnActivated(() => load({ silent: true }))

onUnmounted(() => {
  accountScrollContainer?.removeEventListener('scroll', updateBottomActionsVisibility)
})
</script>

<template>
  <main
    ref="accountPage"
    class="account-page"
    @touchstart.passive="handleAccountTouchStart"
    @touchmove.passive="handleAccountTouchMove"
    @touchend="handleAccountTouchEnd"
    @touchcancel="handleAccountTouchEnd"
  >
    <div class="safe-top">
      <AppTopBar :title="account?.name ?? '账户详情'" title-alignment="start" @back="router.back()">
        <template #right>
          <nav class="top-actions" aria-label="账户操作">
            <button
              type="button"
              @click="router.push({ name: 'account-statistics', params: { accountId } })"
            >
              统计
            </button>
            <button type="button" @click="openEdit">修改</button>
            <button type="button" @click="showMore = true">更多</button>
          </nav>
        </template>
      </AppTopBar>
    </div>
    <div v-if="loading" class="state">正在读取账户…</div>
    <div v-else-if="!account" class="state error">{{ error }}</div>
    <div v-else class="content">
      <BaseCard class="hero">
        <span class="hero-label">{{ liability ? '当前欠款' : '账户余额' }}</span>
        <MoneyText :amount-minor="heroAmountMinor" :show-currency="false" />
        <div v-if="liability" class="credit-grid">
          <div>
            <small>总额度</small>
            <MoneyText
              :amount-minor="account.creditProfile?.creditLimitMinor ?? 0"
              :show-currency="false"
            />
          </div>
          <div>
            <small>出账日期</small><strong>{{ account.creditProfile?.billDay ?? '—' }}</strong>
          </div>
          <div>
            <small>还款日期</small><strong>{{ repaymentDateLabel ?? '—' }}</strong>
          </div>
        </div>
      </BaseCard>
      <section>
        <AccountActivityMonthCard
          v-for="group in groups"
          :key="group.key"
          :label="group.label"
          :period="group.period"
          :inflow-minor="group.inflow"
          :outflow-minor="group.outflow"
          :items="group.items"
          :selected-ids="selectedIds"
          :selection-mode="selectionMode"
          @select="openActivity"
          @longpress="startSelection"
          @toggle="toggleSelection"
        />
        <div v-if="!groups.length" class="state">还没有账户流水</div>
      </section>
    </div>
    <Teleport to="body">
      <div
        v-if="pageActive && account && !account.archivedAt && !selectionMode"
        class="bottom-actions"
        :class="{ 'bottom-actions--hidden': !bottomActionsVisible }"
      >
        <button type="button" @click="router.push({ name: 'new-expense', query: { accountId } })">
          <Plus :size="20" />记一笔</button
        ><button v-if="liability" type="button" @click="goRepay">
          <WalletCards :size="20" />还款
        </button>
      </div>
    </Teleport>
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
    <div v-if="selectionMode" class="bulk-actions" role="toolbar" aria-label="批量操作">
      <button type="button" @click="cancelSelection">
        <X :size="20" aria-hidden="true" /><span>取消</span>
      </button>
      <strong>已选 {{ selectedIds.length }} 笔</strong>
      <button type="button" @click="editSelection">
        <Pencil :size="19" aria-hidden="true" /><span>修改</span>
      </button>
      <button type="button" class="bulk-actions__danger" @click="showBulkDelete = true">
        <Trash2 :size="19" aria-hidden="true" /><span>删除</span>
      </button>
    </div>
    <AppBottomSheet v-model:show="showBulkDelete" title="批量删除">
      <div class="bulk-confirm">
        <p>确定删除选中的 {{ selectedIds.length }} 笔账目吗？删除后相关余额会同步回退。</p>
        <div>
          <button type="button" class="ghost-button" @click="showBulkDelete = false">取消</button>
          <button
            type="button"
            class="danger-button"
            :disabled="bulkDeleting"
            @click="deleteSelection"
          >
            {{ bulkDeleting ? '删除中…' : '确认删除' }}
          </button>
        </div>
      </div>
    </AppBottomSheet>
    <AppBottomSheet v-model:show="showBulkEdit" title="批量修改">
      <form class="bulk-edit" @submit.prevent="applyBulkEdit">
        <p>只会修改已填写的字段，留空的内容保持原样。</p>
        <label><span>统一日期</span><input v-model="bulkEditDate" type="date" /></label>
        <label
          ><span>统一备注</span
          ><input v-model="bulkEditNote" type="text" placeholder="留空则不修改"
        /></label>
        <button
          class="primary"
          type="submit"
          :disabled="bulkEditing || (!bulkEditDate && !bulkEditNote.trim())"
        >
          {{ bulkEditing ? '修改中…' : `修改 ${selectedIds.length} 笔` }}
        </button>
      </form>
    </AppBottomSheet>
  </main>
</template>

<style scoped>
.account-page {
  min-height: 100dvh;
  padding-bottom: calc(78px + env(safe-area-inset-bottom));
  background: var(--color-background);
}
.safe-top {
  position: sticky;
  z-index: 30;
  top: 0;
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}
.top-actions {
  display: flex;
  align-items: center;
  white-space: nowrap;
}
.top-actions button {
  min-width: 44px;
  height: 44px;
  padding: 0 var(--space-2);
  color: var(--color-primary-700);
  font-size: var(--type-label-size);
  font-weight: 500;
  background: transparent;
  border: 0;
  border-radius: var(--radius-pill);
}
.top-actions button:active {
  background: rgb(var(--color-primary-rgb) / 9%);
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
  padding: var(--space-4) var(--space-5);
  place-items: center;
  border: 0;
}
.hero-label {
  color: var(--color-text-tertiary);
}
.hero > :deep(.money-text) {
  font-size: 26px;
  font-weight: 700;
}
.credit-grid {
  display: grid;
  width: 100%;
  margin-top: var(--space-4);
  grid-template-columns: repeat(3, 1fr);
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
section {
  display: grid;
  gap: var(--space-3);
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
  z-index: 18;
  right: var(--page-gutter);
  bottom: calc(var(--space-5) + env(safe-area-inset-bottom));
  left: var(--page-gutter);
  display: grid;
  max-width: 492px;
  padding: 0;
  margin: 0 auto;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: var(--space-3);
  background: transparent;
  border: 0;
  transition:
    opacity var(--motion-fast) var(--ease-standard),
    transform var(--motion-base) var(--ease-standard);
}
.bottom-actions--hidden {
  pointer-events: none;
  opacity: 0;
  transform: translateY(calc(100% + var(--space-5) + env(safe-area-inset-bottom)));
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
  box-shadow: 0 8px 24px rgb(var(--color-primary-rgb) / 22%);
}
.bulk-actions {
  position: fixed;
  z-index: 45;
  right: 12px;
  bottom: calc(12px + env(safe-area-inset-bottom));
  left: 12px;
  display: grid;
  min-height: 62px;
  padding: 7px 10px;
  grid-template-columns: 54px 1fr 54px 54px;
  align-items: center;
  gap: 4px;
  color: var(--color-text-primary);
  background: rgb(255 255 255 / 96%);
  border: 1px solid rgb(23 33 30 / 8%);
  border-radius: 20px;
  box-shadow: 0 10px 32px rgb(20 32 28 / 18%);
  backdrop-filter: blur(16px);
}
.bulk-actions button {
  display: grid;
  min-height: 48px;
  place-items: center;
  gap: 1px;
  color: var(--color-text-secondary);
  font-size: 10px;
  background: transparent;
  border: 0;
}
.bulk-actions strong {
  font-size: 14px;
  text-align: center;
}
.bulk-actions .bulk-actions__danger {
  color: var(--color-danger);
}
.bulk-confirm {
  display: grid;
  gap: 20px;
}
.bulk-confirm p {
  margin: 0;
  color: var(--color-text-secondary);
  line-height: 1.65;
}
.bulk-confirm > div {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.bulk-edit {
  display: grid;
  gap: 14px;
}
.bulk-edit p {
  margin: 0 0 2px;
  color: var(--color-text-tertiary);
  font-size: 12px;
}
.bulk-edit label {
  display: grid;
  gap: 7px;
  color: var(--color-text-secondary);
  font-size: 13px;
}
.bulk-edit input {
  width: 100%;
  height: 46px;
  padding: 0 12px;
  color: var(--color-text-primary);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: 12px;
}
.bulk-edit .primary:disabled {
  opacity: 0.4;
}
.ghost-button,
.danger-button {
  height: 46px;
  font-weight: 600;
  border-radius: 12px;
}
.ghost-button {
  color: var(--color-text-primary);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
}
.danger-button {
  color: white;
  background: var(--color-danger);
  border: 0;
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
