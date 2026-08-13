import type { Migration } from '../core/types'

/**
 * v12：为所有旧账户补齐 account_ 前缀的唯一 ID。
 *
 * 背景：早期创建的账户使用了非 account_ 前缀的 ID 格式。
 * AI 导入提示词依赖 account_ 前缀的 ID 做端到端匹配。
 * 此 migration 为不符合格式的账户生成新的 account_ 前缀 ID，
 * 并同步更新所有外键引用。幂等：已符合格式的账户保持不变。
 */
export const ACCOUNT_ID_BACKFILL_V12_MIGRATION: Migration = {
  version: 12,
  name: 'account_id_backfill_v12',
  statements: `
PRAGMA foreign_keys = OFF;

-- 构建 ID 映射表：不符合 account_ 前缀的生成新 ID，已符合的保持原样
CREATE TEMP TABLE account_id_mapping (old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL);

INSERT INTO account_id_mapping (old_id, new_id)
SELECT
  id,
  CASE
    WHEN id LIKE 'account_%' THEN id
    ELSE 'account_' || lower(hex(randomblob(16)))
  END AS new_id
FROM accounts;

-- 更新 accounts 主键
UPDATE accounts
SET id = (SELECT new_id FROM account_id_mapping WHERE old_id = accounts.id);

-- 同步更新所有外键引用
UPDATE entries
SET account_id = (SELECT new_id FROM account_id_mapping WHERE old_id = entries.account_id)
WHERE account_id IN (SELECT old_id FROM account_id_mapping);

UPDATE receivables
SET account_id = (SELECT new_id FROM account_id_mapping WHERE old_id = receivables.account_id)
WHERE account_id IN (SELECT old_id FROM account_id_mapping);

UPDATE payables
SET account_id = (SELECT new_id FROM account_id_mapping WHERE old_id = payables.account_id)
WHERE account_id IN (SELECT old_id FROM account_id_mapping);

UPDATE transaction_templates
SET
  source_account_id = (SELECT new_id FROM account_id_mapping WHERE old_id = transaction_templates.source_account_id),
  target_account_id = (SELECT new_id FROM account_id_mapping WHERE old_id = transaction_templates.target_account_id)
WHERE source_account_id IN (SELECT old_id FROM account_id_mapping)
   OR target_account_id IN (SELECT old_id FROM account_id_mapping);

UPDATE reminders
SET account_id = (SELECT new_id FROM account_id_mapping WHERE old_id = reminders.account_id)
WHERE account_id IN (SELECT old_id FROM account_id_mapping);

UPDATE account_preferences
SET account_id = (SELECT new_id FROM account_id_mapping WHERE old_id = account_preferences.account_id)
WHERE account_id IN (SELECT old_id FROM account_id_mapping);

UPDATE credit_profiles
SET account_id = (SELECT new_id FROM account_id_mapping WHERE old_id = credit_profiles.account_id)
WHERE account_id IN (SELECT old_id FROM account_id_mapping);

DROP TABLE account_id_mapping;

PRAGMA foreign_keys = ON;
`,
}