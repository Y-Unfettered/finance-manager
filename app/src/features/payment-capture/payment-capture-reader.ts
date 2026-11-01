import { Capacitor, registerPlugin } from '@capacitor/core'
import { getLogger } from '@/features/debug/app-logger'

const captureLogger = getLogger('capturePlugin')

/** 捕获记录。对应 Android Room CaptureQueueEntity。 */
export interface CapturedPayment {
  id: number
  sourcePackage: string
  sourceName: string
  captureMethod: string
  occurredAt: string
  amountMinor: number
  amount: number
  currency: string
  merchant: string
  accountHint: string
  sourceOrderId: string
  rawFingerprint: string
  confidence: number
  parserVersion: string
  status: 'pending' | 'acknowledged' | 'dismissed' | 'expired'
  createdAt: number
  /** 规则建议的分类（格式 "expense:food" / "income:其他"） */
  suggestedCategory?: string
  /** 规则建议的默认账户 ID */
  defaultAccountId?: string
  /** 自动生成的备注（"为什么花"） */
  note?: string
  /** 原价（有优惠时与实付不同，单位分） */
  originalAmountMinor?: number
  /** 优惠金额（单位分） */
  discountMinor?: number
  /** 手续费（如提现服务费，单位分） */
  feeMinor?: number
  /** 转账转入方账户线索（transfer 用） */
  targetAccountHint?: string
  /** 方向判定：income/transfer/refund/expense/confirm */
  direction?: string
}

/** 服务健康状态。 */
export interface ServiceHealth {
  accessibility: {
    enabled: boolean
    configured: boolean
    status: string
  }
  notification: {
    enabled: boolean
    status: string
  }
  ocr: {
    enabled: boolean
    status: string
    engine?: string
  }
  shizuku?: {
    available: boolean
    running: boolean
    status: string
    version?: number
  }
  pendingCount: number
}

/** 自检结果。 */
export interface SelfTestResult {
  success: boolean
  fingerprint?: string
  message: string
}

/** 待确认记录列表响应。 */
export interface PendingEventsResult {
  events: CapturedPayment[]
  count: number
}

/** 无障碍服务诊断结果。 */
export interface AccessibilityDiagnosticsResult {
  counts: {
    serviceConnected: number
    serviceDestroyed: number
    eventTotal: number
    evtWindowState: number
    evtWindowContent: number
    rootNull: number
    textEmpty: number
    noKeyword: number
    noAmount: number
    parsed: number
    dedup: number
    queueInsert: number
    queueFail: number
    noAdapter: number
  }
  lastFailReason: string
  persisted: {
    lastConnectedAt: number
    lastDestroyedAt: number
    restartCount: number
  }
  ring: string[]
  perPkg: string[]
}

/** 通知监听服务诊断结果。 */
export interface NotificationDiagnosticsResult {
  counts: {
    connected: number
    disconnected: number
    notifTotal: number
    noKeyword: number
    noAmount: number
    parsed: number
    dedup: number
    queueInsert: number
    queueFail: number
  }
  persisted: {
    lastConnectedAt: number
    lastDisconnectedAt: number
  }
  ring: string[]
}

/** 自动恢复状态。 */
export interface AutoRecoverStatus {
  enabled: boolean
  shizukuAvailable: boolean
  shizukuRunning: boolean
  lastStatus: string
}

/** 自动恢复结果。 */
export interface AutoRecoverResult {
  success: boolean
  message: string
  autoRecoverEnabled?: boolean
}

/**
 * 原生支付捕获插件接口。
 * 对应 Android 端 PaymentCapturePlugin.java。
 */
export interface PaymentCapturePlugin {
  diagnose(): Promise<{
    pluginLoaded: boolean
    message: string
    ocr: { loaded: boolean; engine: string; error?: string }
    shizuku: { running: boolean; supported: boolean; available: boolean; version?: number }
  }>
  getServiceHealth(): Promise<ServiceHealth>
  getAccessibilityDiagnostics(): Promise<AccessibilityDiagnosticsResult>
  getNotificationDiagnostics(): Promise<NotificationDiagnosticsResult>
  resetDiagnostics(): Promise<void>
  listPendingEvents(): Promise<PendingEventsResult>
  acknowledgeEvents(options: { ids: number[] }): Promise<void>
  deleteCapturedEvent(options: { id: number }): Promise<void>
  openAccessibilitySettings(): Promise<void>
  openNotificationAccessSettings(): Promise<void>
  runSelfTest(): Promise<SelfTestResult>
  enableAccessibilityViaShizuku(): Promise<{ success: boolean; message: string }>
  requestShizukuPermission(): Promise<{ success: boolean; message: string }>

  // 自动恢复
  autoRecoverAccessibility(): Promise<AutoRecoverResult>
  setAutoRecoverEnabled(options: { enabled: boolean }): Promise<{ success: boolean; enabled: boolean }>
  getAutoRecoverStatus(): Promise<AutoRecoverStatus>
  ensureShizukuRunning(): Promise<{ success: boolean; available: boolean; message?: string }>

  addCapturedEvent(options: {
    sourcePackage?: string
    sourceName?: string
    captureMethod?: string
    occurredAt?: string
    amountMinor?: number
    currency?: string
    merchant?: string
    accountHint?: string
    sourceOrderId?: string
    rawFingerprint?: string
    confidence?: number
    parserVersion?: string
    note?: string
    direction?: string
  }): Promise<CapturedPayment>

  exportDiagnosticLog(): Promise<{
    success: boolean
    filePath?: string
    fileName?: string
    fileSize?: number
    message: string
  }>

  shareDiagnosticLog(): Promise<{
    success: boolean
    filePath?: string
    message: string
  }>

  /** 确认入账成功后回调原生：指纹置 confirmed（永久拦截重复捕获） */
  markCaptureConfirmed(options: { fingerprint: string }): Promise<void>

  /** 清空捕获指纹（调试用）：pendingOnly=true 仅清 pending，否则全部清空 */
  clearCaptureFingerprints(options: { pendingOnly?: boolean }): Promise<void>

  /** 重复交易拦截开关：开启后捕获命中已存交易时不跳转记账页（默认开） */
  setDuplicateBlockEnabled(options: { enabled: boolean }): Promise<void>
  getDuplicateBlockEnabled(): Promise<{ enabled: boolean }>

  addListener(
    event: 'paymentCaptureCandidate' | 'paymentCaptureQuickEntry' | 'overlayCommitRequest',
    listener: (data: CapturedPayment) => void,
  ): Promise<PluginListenerHandle>
  removeAllListeners(): Promise<void>

  /** 原生悬浮窗入账完成后回调：原生关悬浮窗 + Toast */
  onOverlayCommitDone(options: { success: boolean; message: string }): Promise<void>

  /** 检查/打开悬浮窗权限 */
  canDrawOverlay(): Promise<{ granted: boolean }>
  openOverlaySettings(): Promise<void>

  /** 前端同步分类和账户列表给原生悬浮窗 */
  syncOverlayOptions(options: { categories: { id: string; name: string }[]; accounts: { id: string; name: string }[]; ledgerId?: string }): Promise<void>

  /** 前端同步当前账本 ID 给原生 */
  setActiveLedgerId(options: { ledgerId: string }): Promise<void>

  /** 打日志到 logcat */
  log(options: { msg: string }): Promise<void>

  /** 获取待入账的捕获数据 */
  getPendingCaptureData(): Promise<{
    amountMinor?: number
    merchant?: string
    occurredAt?: string
    /** 队列条目 id（保存后 acknowledge 用） */
    id?: number
    note?: string
    direction?: string
    accountHint?: string
    sourcePackage?: string
    fingerprint?: string
    suggestedCategory?: string
    originalAmountMinor?: number
    discountMinor?: number
    feeMinor?: number
    targetAccountHint?: string
    captureSource?: string
    parserVersion?: string
    confidence?: number
  }>

  // 规则配置
  getCaptureRules(): Promise<RuleConfigResult>
  saveCaptureRules(options: { config: string }): Promise<RuleConfigResult>
  resetCaptureRules(): Promise<RuleConfigResult>
}

export interface RuleConfigResult {
  success: boolean
  message?: string
  config?: unknown
}

interface PluginListenerHandle {
  remove: () => Promise<void>
}

/** Web fallback：所有方法返回空/默认值，用于浏览器开发。 */
class WebPaymentCapture implements PaymentCapturePlugin {
  async diagnose(): Promise<{
    pluginLoaded: boolean
    message: string
    ocr: { loaded: boolean; engine: string }
    shizuku: { running: boolean; supported: boolean; available: boolean }
  }> {
    return {
      pluginLoaded: false,
      message: '仅原生平台可用',
      ocr: { loaded: false, engine: 'unknown' },
      shizuku: { running: false, supported: false, available: false },
    }
  }

  async getServiceHealth(): Promise<ServiceHealth> {
    return {
      accessibility: { enabled: false, configured: false, status: 'not_available' },
      notification: { enabled: false, status: 'not_available' },
      ocr: { enabled: false, status: 'not_available' },
      pendingCount: 0,
    }
  }

  async getAccessibilityDiagnostics(): Promise<AccessibilityDiagnosticsResult> {
    return {
      counts: {
        serviceConnected: 0, serviceDestroyed: 0, eventTotal: 0,
        evtWindowState: 0, evtWindowContent: 0, rootNull: 0,
        textEmpty: 0, noKeyword: 0, noAmount: 0, parsed: 0,
        dedup: 0, queueInsert: 0, queueFail: 0, noAdapter: 0,
      },
      lastFailReason: '',
      persisted: { lastConnectedAt: 0, lastDestroyedAt: 0, restartCount: 0 },
      ring: [],
      perPkg: [],
    }
  }

  async getNotificationDiagnostics(): Promise<NotificationDiagnosticsResult> {
    return {
      counts: {
        connected: 0, disconnected: 0, notifTotal: 0,
        noKeyword: 0, noAmount: 0, parsed: 0, dedup: 0,
        queueInsert: 0, queueFail: 0,
      },
      persisted: { lastConnectedAt: 0, lastDisconnectedAt: 0 },
      ring: [],
    }
  }

  async resetDiagnostics(): Promise<void> {}

  async listPendingEvents(): Promise<PendingEventsResult> {
    return { events: [], count: 0 }
  }

  async acknowledgeEvents(): Promise<void> {}
  async deleteCapturedEvent(): Promise<void> {}
  async openAccessibilitySettings(): Promise<void> {}
  async openNotificationAccessSettings(): Promise<void> {}

  async enableAccessibilityViaShizuku(): Promise<{ success: boolean; message: string }> {
    return { success: false, message: '仅原生平台可用' }
  }

  async requestShizukuPermission(): Promise<{ success: boolean; message: string }> {
    return { success: false, message: '仅原生平台可用' }
  }

  async autoRecoverAccessibility(): Promise<AutoRecoverResult> {
    return { success: false, message: '仅原生平台可用' }
  }

  async setAutoRecoverEnabled(): Promise<{ success: boolean; enabled: boolean }> {
    return { success: false, enabled: false }
  }

  async getAutoRecoverStatus(): Promise<AutoRecoverStatus> {
    return { enabled: false, shizukuAvailable: false, shizukuRunning: false, lastStatus: '' }
  }

  async ensureShizukuRunning(): Promise<{ success: boolean; available: boolean; message?: string }> {
    return { success: false, available: false, message: '仅原生平台可用' }
  }

  async runSelfTest(): Promise<SelfTestResult> {
    return { success: false, message: '仅原生平台可用' }
  }

  async addCapturedEvent(): Promise<CapturedPayment> {
    throw new Error('Web 平台不支持 addCapturedEvent')
  }

  async exportDiagnosticLog(): Promise<{
    success: boolean
    filePath?: string
    fileName?: string
    fileSize?: number
    message: string
  }> {
    return { success: false, message: '仅原生平台可用' }
  }

  async shareDiagnosticLog(): Promise<{
    success: boolean
    filePath?: string
    message: string
  }> {
    return { success: false, message: '仅原生平台可用' }
  }

  async addListener(
    event: 'paymentCaptureCandidate' | 'paymentCaptureQuickEntry' | 'overlayCommitRequest',
    listener: (data: CapturedPayment) => void,
  ): Promise<PluginListenerHandle> {
    void event
    void listener
    return { remove: async () => {} }
  }

  async onOverlayCommitDone(): Promise<void> {}
  async markCaptureConfirmed(): Promise<void> {}
  async clearCaptureFingerprints(): Promise<void> {}
  async setDuplicateBlockEnabled(): Promise<void> {}
  async getDuplicateBlockEnabled(): Promise<{ enabled: boolean }> {
    return { enabled: true }
  }
  async canDrawOverlay(): Promise<{ granted: boolean }> {
    return { granted: false }
  }
  async openOverlaySettings(): Promise<void> {}
  async syncOverlayOptions(): Promise<void> {}
  async setActiveLedgerId(): Promise<void> {}
  async log(): Promise<void> {}
  async getPendingCaptureData(): Promise<{
    amountMinor?: number
    merchant?: string
    occurredAt?: string
    /** 队列条目 id（保存后 acknowledge 用） */
    id?: number
    note?: string
    direction?: string
    accountHint?: string
    sourcePackage?: string
    fingerprint?: string
    suggestedCategory?: string
    originalAmountMinor?: number
    discountMinor?: number
    feeMinor?: number
    targetAccountHint?: string
    captureSource?: string
    parserVersion?: string
    confidence?: number
  }> {
    return {}
  }

  async getCaptureRules(): Promise<RuleConfigResult> {
    return { success: false, message: '仅原生平台可用' }
  }
  async saveCaptureRules(): Promise<RuleConfigResult> {
    return { success: false, message: '仅原生平台可用' }
  }
  async resetCaptureRules(): Promise<RuleConfigResult> {
    return { success: false, message: '仅原生平台可用' }
  }

  async removeAllListeners(): Promise<void> {}
}

export const PaymentCapture = registerPlugin<PaymentCapturePlugin>('PaymentCapture', {
  web: () => Promise.resolve(new WebPaymentCapture()),
})

/** 带日志的调用包装。 */
export async function callPaymentCapture<T>(name: string, fn: () => Promise<T>): Promise<T> {
  captureLogger.debug(`PaymentCapture.${name} 调用`)
  try {
    const result = await fn()
    captureLogger.info(`PaymentCapture.${name} 成功`)
    return result
  } catch (err) {
    captureLogger.error(`PaymentCapture.${name} 异常: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}

export function isNativeCaptureAvailable(): boolean {
  return Capacitor.isNativePlatform()
}