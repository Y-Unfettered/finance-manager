import { BaseRepository } from './base-repository'

export interface AppSettingRecord {
  key: string
  value: string
  updatedAt: string
}

/**
 * 应用设置仓储：key-value 结构，存储应用锁等设置项。
 */
export class AppSettingsRepository extends BaseRepository {
  async get(key: string): Promise<string | undefined> {
    const rows = await this.database.query<AppSettingRecord>(
      'SELECT key, value, updated_at AS updatedAt FROM app_settings WHERE key = ?',
      [key],
    )
    return rows[0]?.value
  }

  async set(key: string, value: string, now: string): Promise<void> {
    await this.database.executeSet(
      [
        {
          statement:
            'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
          values: [key, value, now],
        },
      ],
      true,
    )
  }

  async remove(key: string): Promise<void> {
    await this.database.executeSet(
      [{ statement: 'DELETE FROM app_settings WHERE key = ?', values: [key] }],
      true,
    )
  }
}
