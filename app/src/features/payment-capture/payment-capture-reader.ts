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

/**
 * 原生支付捕获插件接口。
 * 对应 Android 端 PaymentCapturePlugin.java。
 */
export interface PaymentCapturePlugin {
  getServiceHealth(): Promise<ServiceHealth>
  listPendingEvents(): Promise<PendingEventsResult>
  acknowledgeEvents(options: { ids: number[] }): Promise<void>
  deleteCapturedEvent(options: { id: number }): Promise<void>
  openAccessibilitySettings(): Promise<void>
  openNotificationAccessSettings(): Promise<void>
  runSelfTest(): Promise<SelfTestResult>
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
  async getServiceHealth(): Promise<ServiceHealth> {
    return {
      accessibility: { enabled: false, configured: false, status: 'not_available' },
      notification: { enabled: false, status: 'not_available' },
      ocr: { enabled: false, status: 'not_available' },
      pendingCount: 0,
    }
  }

  async listPendingEvents(): Promise<PendingEventsResult> {
    return { events: [], count: 0 }
  }

  async acknowledgeEvents(): Promise<void> {}
  async deleteCapturedEvent(): Promise<void> {}
  async openAccessibilitySettings(): Promise<void> {}
  async openNotificationAccessSettings(): Promise<void> {}

  async runSelfTest(): Promise<SelfTestResult> {
    return { success: false, message: '仅原生平台可用' }
  }

  async addCapturedEvent(): Promise<CapturedPayment> {
    throw new Error('Web 平台不支持 addCapturedEvent')
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