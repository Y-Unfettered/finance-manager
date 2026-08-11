import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * 原生剪贴板读取插件接口。
 * 对应 Android 端 ClipboardReaderPlugin.java。
 */
export interface ClipboardReaderPlugin {
  /** 立即读取系统剪贴板文本。返回 { value, hasContent }。 */
  getText(): Promise<{ value: string; hasContent: boolean }>

  /** 标记当前剪贴板内容为已处理，避免 onResume 时重复弹窗。 */
  markConsumed(): Promise<void>

  /** 监听原生侧推来的「检测到待导入账单」事件。 */
  addListener(
    event: 'clipboardImportCandidate',
    listener: (data: { value: string }) => void,
  ): Promise<PluginListenerHandle>

  /** 移除所有监听器。 */
  removeAllListeners(): Promise<void>
}

interface PluginListenerHandle {
  remove: () => Promise<void>
}

/**
 * Web 平台 fallback：用 navigator.clipboard API，无 onResume 监听能力。
 * 在浏览器/非原生环境下退化为「手动粘贴」模式。
 */
class WebClipboardReader implements ClipboardReaderPlugin {
  async getText(): Promise<{ value: string; hasContent: boolean }> {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        const text = await navigator.clipboard.readText()
        return { value: text, hasContent: Boolean(text) }
      } catch {
        return { value: '', hasContent: false }
      }
    }
    return { value: '', hasContent: false }
  }

  async markConsumed(): Promise<void> {
    // Web 端无需处理
  }

  async addListener(
    event: 'clipboardImportCandidate',
    listener: (data: { value: string }) => void,
  ): Promise<PluginListenerHandle> {
    void event
    void listener
    return { remove: async () => {} }
  }

  async removeAllListeners(): Promise<void> {
    // Web 端无需处理
  }
}

export const ClipboardReader = registerPlugin<ClipboardReaderPlugin>('ClipboardReader', {
  web: () => Promise.resolve(new WebClipboardReader()),
})

/**
 * 判断是否在原生平台（Android）运行，剪贴板原生能力可用。
 */
export function isNativeClipboardAvailable(): boolean {
  return Capacitor.isNativePlatform()
}
