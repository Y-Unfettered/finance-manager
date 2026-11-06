import { showFailToast, showToast, showSuccessToast } from 'vant'
import 'vant/es/toast/style'

/**
 * 统一轻提示（PRD 需求四 7.5 弹层契约）：替代各页内联 result-message 的场景，
 * 底部居中、2s 自动消失。失败/成功用带图标的变体。
 */
export function showAppToast(message: string): void {
  showToast({ message, duration: 2000, position: 'bottom' })
}

export function showAppSuccessToast(message: string): void {
  showSuccessToast({ message, duration: 2000, position: 'bottom' })
}

export function showAppFailToast(message: string): void {
  showFailToast({ message, duration: 2000, position: 'bottom' })
}
