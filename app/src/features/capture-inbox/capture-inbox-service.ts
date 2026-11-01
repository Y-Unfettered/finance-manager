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
export type { AutoRecoverStatus, AutoRecoverResult } from '@/features/payment-capture/payment-capture-reader'

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
    note: input.event.note
      ? input.event.note
      : input.event.merchant
        ? `自动记账-${input.event.captureMethod}-${input.event.merchant}`
        : `自动记账-${input.event.captureMethod}`,
    captureSource: input.event.captureMethod || undefined,
    parserVersion: input.event.parserVersion || undefined,
    confidence: input.event.confidence || undefined,
  })

  await PaymentCapture.acknowledgeEvents({ ids: [input.event.id] })
  // P1：确认入账 → 指纹置 confirmed（永久拦截重复捕获）
  if (input.event.rawFingerprint) {
    await PaymentCapture.markCaptureConfirmed({ fingerprint: input.event.rawFingerprint }).catch(() => {})
  }
  return { transactionId }
}

/** 忽略单条记录。 */
export async function dismissEvent(id: number): Promise<void> {
  await PaymentCapture.deleteCapturedEvent({ id })
}

/** 重复交易拦截开关（设置页控制）。 */
export function setDuplicateBlockEnabled(enabled: boolean): Promise<void> {
  return PaymentCapture.setDuplicateBlockEnabled({ enabled })
}

export async function getDuplicateBlockEnabled(): Promise<boolean> {
  try {
    return (await PaymentCapture.getDuplicateBlockEnabled()).enabled
  } catch {
    return true
  }
}

/** 忽略全部：待确认记录清空后，对应 pending 指纹一并清除（允许重新捕获；已入账的 confirmed 保留）。 */
export async function dismissAll(): Promise<void> {
  const { events } = await listPendingEvents()
  await PaymentCapture.acknowledgeEvents({ ids: events.map((e) => e.id) })
  await PaymentCapture.clearCaptureFingerprints({ pendingOnly: true }).catch(() => {})
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

/** 启动自动恢复：检查无障碍是否存活，不存活则通过 Shizuku 恢复。 */
export function autoRecoverAccessibility() {
  return PaymentCapture.autoRecoverAccessibility()
}

/** 设置自动恢复开关。 */
export function setAutoRecoverEnabled(enabled: boolean) {
  return PaymentCapture.setAutoRecoverEnabled({ enabled })
}

/** 获取自动恢复状态。 */
export function getAutoRecoverStatus() {
  return PaymentCapture.getAutoRecoverStatus()
}

/** 确保 Shizuku UserService 长驻进程已启动。 */
export function ensureShizukuRunning() {
  return PaymentCapture.ensureShizukuRunning()
}