/**
 * 待确认账单服务。
 *
 * 负责：
 * 1. 从原生捕获队列读取待确认记录
 * 2. 确认后调用 finance-service 入账
 * 3. 忽略/删除记录
 * 4. 去重检测
 */
import { PaymentCapture, type CapturedPayment } from '@/features/payment-capture/payment-capture-reader'
import { useFinanceService } from '@/features/finance/finance-service'
import { useAppStore } from '@/stores/app'

export type { CapturedPayment, ServiceHealth, AccessibilityDiagnosticsResult, NotificationDiagnosticsResult } from '@/features/payment-capture/payment-capture-reader'

export interface ConfirmInput {
  event: CapturedPayment
  categoryId: string
  accountId: string
}

export interface CaptureInboxResult {
  events: CapturedPayment[]
  count: number
}

export function getPaymentCapturePlugin() {
  return PaymentCapture
}

/** 从原生捕获队列读取待确认记录。 */
export async function listPendingEvents(): Promise<CaptureInboxResult> {
  return PaymentCapture.listPendingEvents()
}

/** 确认入账：创建支出记录 + 从捕获队列删除。 */
export async function confirmEvent(input: ConfirmInput): Promise<{ transactionId: string }> {
  const appStore = useAppStore()
  const finance = useFinanceService()
  const ledgerId = appStore.ledgerId
  if (!ledgerId) throw new Error('请先选择账本')
  if (!finance) throw new Error('账务服务不可用')

  const transactionId = await finance.createExpense({
    ledgerId,
    amountMinor: input.event.amountMinor,
    accountId: input.accountId,
    categoryId: input.categoryId,
    occurredAt: input.event.occurredAt || new Date().toISOString(),
    merchant: input.event.merchant || undefined,
    note: input.event.merchant
      ? `自动记账-${input.event.captureMethod}-${input.event.merchant}`
      : `自动记账-${input.event.captureMethod}`,
  })

  await PaymentCapture.acknowledgeEvents({ ids: [input.event.id] })
  return { transactionId }
}

/** 忽略单条记录。 */
export async function dismissEvent(id: number): Promise<void> {
  await PaymentCapture.deleteCapturedEvent({ id })
}

/** 忽略全部。 */
export async function dismissAll(): Promise<void> {
  const { events } = await listPendingEvents()
  await PaymentCapture.acknowledgeEvents({ ids: events.map((e) => e.id) })
}

/** 获取服务健康状态。 */
export async function getServiceHealth() {
  return PaymentCapture.getServiceHealth()
}

/** 打开无障碍设置。 */
export function openAccessibilitySettings() {
  return PaymentCapture.openAccessibilitySettings()
}

/** 打开通知权限设置。 */
export function openNotificationAccessSettings() {
  return PaymentCapture.openNotificationAccessSettings()
}

/** 运行自检。 */
export function runSelfTest() {
  return PaymentCapture.runSelfTest()
}

/** 通过 Shizuku 自动启用无障碍服务。 */
export function enableAccessibilityViaShizuku() {
  return PaymentCapture.enableAccessibilityViaShizuku()
}

/** 请求 Shizuku 授权。 */
export function requestShizukuPermission() {
  return PaymentCapture.requestShizukuPermission()
}

/** 诊断插件加载状态。 */
export function diagnosePlugin() {
  return PaymentCapture.diagnose()
}

/** 无障碍服务诊断信息。 */
export function getAccessibilityDiagnostics() {
  return PaymentCapture.getAccessibilityDiagnostics()
}

/** 通知监听服务诊断信息。 */
export function getNotificationDiagnostics() {
  return PaymentCapture.getNotificationDiagnostics()
}

/** 重置诊断数据。 */
export function resetDiagnostics() {
  return PaymentCapture.resetDiagnostics()
}

/** 导出诊断日志为 JSON 文件。 */
export function exportDiagnosticLog() {
  return PaymentCapture.exportDiagnosticLog()
}

/** 通过分享面板分享诊断日志。 */
export function shareDiagnosticLog() {
  return PaymentCapture.shareDiagnosticLog()
}