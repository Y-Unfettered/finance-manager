import type { Migration } from '../core/types'

/**
 * v13：账户支持手动排序（资产页长按拖拽）。
 *
 * 为 accounts 增加 sort_order 列，并按（账本内）录入顺序回填初始值，
 * 使现有账户默认按创建顺序显示；之后由用户在资产页长按拖拽调整，
 * reorder 会为对应账户写入 0..n-1 的新排序值。
 */
export const ACCOUNT_SORT_ORDER_V13_MIGRATION: Migration = {
  version: 13,
  name: 'account_sort_order_v13',
  statements: `
ALTER TABLE accounts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- 回填：按（账本内）录入顺序分配初始排序值（0 起），保持"先录入的在前"
UPDATE accounts
SET sort_order = (
  SELECT COUNT(*)
  FROM accounts AS a2
  WHERE a2.ledger_id = accounts.ledger_id
    AND (a2.created_at < accounts.created_at
         OR (a2.created_at = accounts.created_at AND a2.id < accounts.id))
);
`,
}
