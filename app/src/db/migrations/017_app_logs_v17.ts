import type { Migration } from '../core/types'

/**
 * v17：前端诊断日志落库（PRD 需求三 6.2）。
 *
 * app_logs 保留最近 3 个自然日（滚动淘汰由写入方执行）。
 * 明确不纳入备份包（backup-repository 的 TABLE_SCHEMAS 不加本表）：
 * 日志是本机诊断数据，含金额/账户名等业务字段。
 */
export const APP_LOGS_V17_MIGRATION: Migration = {
  version: 17,
  name: 'app_logs_v17',
  statements: `
CREATE TABLE IF NOT EXISTS app_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  ts INTEGER NOT NULL,
  level TEXT NOT NULL,
  tag TEXT NOT NULL,
  message TEXT NOT NULL,
  data_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_app_logs_day ON app_logs(day);
CREATE INDEX IF NOT EXISTS idx_app_logs_level ON app_logs(level);
`,
}
