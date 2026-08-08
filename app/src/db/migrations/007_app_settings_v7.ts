import type { Migration } from '../core/types'

/**
 * v7：新增 app_settings 表，存储应用级设置（应用锁 PIN 哈希、启用状态等）。
 * 使用 key-value 结构，便于后续扩展。
 */
export const APP_SETTINGS_V7_MIGRATION: Migration = {
  version: 7,
  name: 'app_settings_v7',
  statements: `
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY NOT NULL CHECK (length(trim(key)) > 0),
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_app_settings_key ON app_settings(key);
`,
}
