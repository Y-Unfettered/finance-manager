import { defineStore } from 'pinia'
import type { CapturedPayment } from '@/features/payment-capture/payment-capture-reader'
import type { AccountBalanceRecord } from '@/domain/entities'
import type { ExpenseCategoryOption } from '@/features/finance/finance-service'

/** 当场弹窗记账的当前数据。 */
export interface CaptureEntryState {
  /** 当前待确认的捕获记录 */
  current: CapturedPayment | null
  /** 弹窗是否显示 */
  visible: boolean
  /** 用户选择的账户 ID */
  accountId: string
  /** 用户选择的分类 ID */
  categoryId: string
  /** 记账金额（分），用户可修改 */
  amountMinor: number
  /** 备注 */
  note: string
  /** 入账中 */
  confirming: boolean
  /** 加载账户/分类中 */
  loading: boolean
  /** 可用账户列表 */
  accounts: AccountBalanceRecord[]
  /** 可用分类列表 */
  categories: ExpenseCategoryOption[]
  /** 入账结果信息 */
  message: string
}

/** 默认分类图标映射（规则建议的分类关键字 → 分类图标 key）。 */
const DEFAULT_CATEGORY_MAP: Record<string, { label: string; iconKey: string; color: string }> = {
  food: { label: '餐饮', iconKey: 'utensils', color: '#d97706' },
  coffee: { label: '咖啡', iconKey: 'coffee', color: '#92400e' },
  grocery: { label: '生鲜', iconKey: 'apple', color: '#16a34a' },
  shopping: { label: '购物', iconKey: 'shopping-bag', color: '#2563eb' },
  gas: { label: '加油', iconKey: 'fuel', color: '#dc2626' },
  entertainment: { label: '娱乐', iconKey: 'gamepad', color: '#7c3aed' },
  transfer: { label: '转账', iconKey: 'wallet', color: '#0891b2' },
  utilities: { label: '水电', iconKey: 'water', color: '#0369a1' },
  health: { label: '医疗', iconKey: 'hospital', color: '#be123c' },
  'income-other': { label: '其他收入', iconKey: 'banknote', color: '#059669' },
}

/** 解析规则建议的分类字符串（"kind:id"）。 */
export function parseSuggestedCategory(suggested: string | null | undefined): {
  kind: 'expense' | 'income'
  categoryId: string
} | null {
  if (!suggested) return null
  const [kind, categoryId] = suggested.split(':')
  if ((kind === 'expense' || kind === 'income') && categoryId) {
    return { kind, categoryId }
  }
  return null
}

/** 将规则建议的分类 ID 映射到显示名和图标。 */
export function resolveSuggestedCategory(categoryId: string | null | undefined): {
  label: string
  iconKey: string
  color: string
} | null {
  if (!categoryId) return null
  const mapped = DEFAULT_CATEGORY_MAP[categoryId]
  if (mapped) return mapped
  return null
}

/**
 * 当场弹窗记账状态。
 *
 * 原生侧检测到支付成功后，通过 paymentCaptureQuickEntry 事件推送过来，
 * 写入这里，CaptureQuickEntrySheet 据此显示底部弹窗。
 */
export const useCaptureEntryStore = defineStore('capture-entry', {
  state: (): CaptureEntryState => ({
    current: null,
    visible: false,
    accountId: '',
    categoryId: '',
    amountMinor: 0,
    note: '',
    confirming: false,
    loading: false,
    accounts: [],
    categories: [],
    message: '',
  }),
  getters: {
    suggestedCategory: (state): { label: string; iconKey: string; color: string } | null => {
      if (!state.current) return null
      const suggestion = parseSuggestedCategory(state.current.suggestedCategory || '')
      if (!suggestion) return null
      return resolveSuggestedCategory(suggestion.categoryId)
    },
    selectedAccount: (state): AccountBalanceRecord | undefined =>
      state.accounts.find((a) => a.id === state.accountId),
    selectedCategory: (state): ExpenseCategoryOption | undefined =>
      state.categories.find((c: ExpenseCategoryOption) => c.id === state.categoryId),
  },
  actions: {
    /** 悬浮窗模式：按 pendingId 从队列加载记录并初始化表单。 */
    async loadPendingById(id: number) {
      try {
        const { listPendingEvents } = await import('@/features/capture-inbox/capture-inbox-service')
        const { events } = await listPendingEvents()
        const found = events.find((e) => e.id === id)
        if (!found) {
          this.message = '未找到待入账记录 id=' + id
          return
        }
        await this.showEntry(found)
      } catch (e) {
        this.message = e instanceof Error ? e.message : '加载失败'
      }
    },

    /** 接收原生侧推送的新捕获记录，显示弹窗。 */
    async showEntry(payment: CapturedPayment) {
      this.current = payment
      this.amountMinor = payment.amountMinor || 0
      this.note = payment.merchant || ''
      this.accountId = ''
      this.categoryId = ''
      this.confirming = false
      this.message = ''
      this.visible = true

      // 加载账户和分类
      await this.loadOptions()

      // 默认选择规则建议的账户
      if (payment.defaultAccountId && this.accounts.some((a) => a.id === payment.defaultAccountId)) {
        this.accountId = payment.defaultAccountId
      } else if (payment.accountHint) {
        // accountHint 可能是账户名，尝试匹配
        const hint = payment.accountHint.toLowerCase()
        const match = this.accounts.find((a) => a.name.toLowerCase().includes(hint))
        if (match) this.accountId = match.id
      } else if (this.accounts.length > 0) {
        this.accountId = this.accounts[0]!.id
      }
    },

    /** 加载账户和分类选项。失败时指数退避重试，避免切回 APP 时 ledger 未就绪导致弹窗只有金额。 */
    async loadOptions() {
      this.loading = true
      const delays = [0, 150, 400, 900]
      let lastErr: Error | null = null
      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, delays[attempt]))
        }
        try {
          const { useAppStore } = await import('@/stores/app')
          const appStore = useAppStore()
          // 从全局拿 financeService（store 里 inject 拿不到）
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const finance = (window as any).__financeService
          if (!appStore.ledgerId || !finance) {
            lastErr = new Error('ledger not ready: ledgerId=' + appStore.ledgerId + ' finance=' + !!finance)
            // 打日志到 logcat
            try {
              const { PaymentCapture } = await import('@/features/payment-capture/payment-capture-reader')
              await PaymentCapture.log({ msg: 'loadOptions: ' + lastErr.message })
            } catch { /* 日志失败不影响主流程 */ }
            continue
          }
          const [accRows, cats] = await Promise.all([
            finance.listAccounts(appStore.ledgerId),
            finance.listExpenseCategories(appStore.ledgerId),
          ])
          this.accounts = accRows.filter(
            (a: { normalBalance?: string; archivedAt?: string }) =>
              a.normalBalance === 'debit' && !a.archivedAt,
          )
          this.categories = cats.filter((c: { parentId?: string | null }) => !c.parentId)
          this.loading = false
          // 同步分类和账户列表给原生悬浮窗
          try {
            const { PaymentCapture } = await import('@/features/payment-capture/payment-capture-reader')
            const { useAppStore } = await import('@/stores/app')
            const appStore = useAppStore()
            await PaymentCapture.syncOverlayOptions({
              ledgerId: appStore.ledgerId ?? '',
              categories: this.categories.map((c) => ({ id: c.id, name: c.name })),
              accounts: this.accounts.map((a) => ({ id: a.id, name: a.name })),
            })
          } catch (e) { console.warn('syncOverlayOptions 失败', e) }
          return
        } catch (e) {
          lastErr = e instanceof Error ? e : new Error(String(e))
        }
      }
      this.loading = false
      if (lastErr) {
        this.message = '选项加载失败，下拉重试'
      }
    },

    /** 关闭弹窗。 */
    hideEntry() {
      this.visible = false
      this.current = null
      this.accountId = ''
      this.categoryId = ''
      this.message = ''
    },

    /** 忽略该条记录（从捕获队列删除）。 */
    async dismissEvent() {
      if (!this.current) return
      const id = this.current.id
      try {
        const { dismissEvent } = await import('@/features/capture-inbox/capture-inbox-service')
        await dismissEvent(id)
      } finally {
        this.hideEntry()
      }
    },

    /** 确认入账。 */
    async doConfirm() {
      if (!this.current || !this.accountId || !this.categoryId) return
      this.confirming = true
      this.message = ''
      try {
        const { confirmEvent } = await import('@/features/capture-inbox/capture-inbox-service')
        await confirmEvent({
          event: {
            ...this.current,
            amountMinor: this.amountMinor,
          },
          accountId: this.accountId,
          categoryId: this.categoryId,
        })
        this.message = '入账成功'
        this.visible = false
      } catch (e) {
        this.message = e instanceof Error ? e.message : '入账失败'
      } finally {
        this.confirming = false
        // 延迟隐藏，让用户看到成功提示
        if (this.message === '入账成功') {
          setTimeout(() => {
            this.current = null
            this.accountId = ''
            this.categoryId = ''
            this.message = ''
          }, 600)
        }
      }
    },
  },
})