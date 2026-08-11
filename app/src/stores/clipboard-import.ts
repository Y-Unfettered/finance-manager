import { defineStore } from 'pinia'

import { ClipboardReader } from '@/features/clipboard/clipboard-reader'
import { isConsumedFingerprint } from '@/features/clipboard/clipboard-fingerprint-cache'

/**
 * 全局剪贴板候选项状态。
 *
 * 当原生侧 handleOnResume 检测到剪贴板里是「待导入交易 JSON」时，
 * 通过 notifyListeners 推事件给 WebView。App.vue 监听该事件后调用
 * setCandidate 写入这里，ClipboardImportDialog.vue 据此显示全局弹窗。
 */
export interface ClipboardCandidate {
  /** 候选项的唯一 id（自增），用于 v-for key */
  id: number
  /** 原始 JSON 文本 */
  text: string
  /** 探测到的交易条数（用于弹窗显示） */
  count: number
}

let nextCandidateId = 1

export const useClipboardImportStore = defineStore('clipboard-import', {
  state: () => ({
    /** 当前待确认的候选项，最多保留 1 个，新的覆盖旧的 */
    current: undefined as ClipboardCandidate | undefined,
    /** 弹窗是否显示 */
    dialogVisible: false,
  }),
  actions: {
    /**
     * 设置当前候选项并显示弹窗。
     * 如果已有候选项（用户未处理），用新的覆盖。
     */
    setCandidate(text: string, count: number) {
      // 如果已消费过，不再弹窗
      if (isConsumedFingerprint(text)) {
        return
      }
      this.current = { id: nextCandidateId++, text, count }
      this.dialogVisible = true
    },

    /** 关闭弹窗，但不标记为已处理（用户可能下次还想看）。 */
    dismiss() {
      this.dialogVisible = false
    },

    /** 关闭弹窗并标记当前候选项为已忽略（调用原生 markConsumed）。 */
    async ignore() {
      this.dialogVisible = false
      this.current = undefined
      try {
        await ClipboardReader.markConsumed()
      } catch {
        // 忽略错误
      }
    },

    /** 用户点「立即导入」后，关闭弹窗但保留候选项文本，由调用方读取并跳转。 */
    confirm() {
      this.dialogVisible = false
    },

    /** 清空当前候选项。 */
    clear() {
      this.current = undefined
      this.dialogVisible = false
    },
  },
})
