import type { Migration } from '../core/types'

/**
 * v14：账单数据自携带捕获指纹。
 *
 * transactions 新增 fingerprint 列——通过自动记账捕获保存的账单，
 * 将识别指纹（order:单号 / tx:hash）写入自身，使防重能力与账单数据绑定：
 * - 指纹独立表被清空/丢失后，账单数据本身仍可拦截同笔账单重复识别
 * - 查重优先级：账单携带指纹（最强，含单号）> 金额+商户+时间比对（手动记账兜底）
 */
export const TRANSACTION_FINGERPRINT_V14_MIGRATION: Migration = {
  version: 14,
  name: 'transaction_fingerprint_v14',
  statements: `
ALTER TABLE transactions ADD COLUMN fingerprint TEXT;
`,
}
