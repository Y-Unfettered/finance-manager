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

  addListener(
    event: 'paymentCaptureCandidate',
    listener: (data: CapturedPayment) => void,
  ): Promise<PluginListenerHandle>
  removeAllListeners(): Promise<void>
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
    event: 'paymentCaptureCandidate',
    listener: (data: CapturedPayment) => void,
  ): Promise<PluginListenerHandle> {
    void event
    void listener
    return { remove: async () => {} }
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