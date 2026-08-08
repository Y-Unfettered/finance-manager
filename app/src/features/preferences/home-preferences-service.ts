import { inject, type InjectionKey } from 'vue'

import type { Clock } from '@/domain/time'
import type { SqliteExecutor } from '@/db/core/types'
import { AppSettingsRepository } from '@/db/repositories/app-settings-repository'

export type HomeSummaryDisplayType = 'expense' | 'income_expense'
export type HomeSummaryRangeType = 'week' | '7d' | '15d' | 'hidden'

export interface HomePreferences {
  summaryDisplayType: HomeSummaryDisplayType
  summaryRangeType: HomeSummaryRangeType
  amountsHidden: boolean
  defaultExpenseAccountId?: string
  defaultIncomeAccountId?: string
  rememberLastAccount: boolean
  appearance: 'system' | 'light' | 'dark'
}

const DEFAULTS: HomePreferences = {
  summaryDisplayType: 'income_expense',
  summaryRangeType: '7d',
  amountsHidden: false,
  rememberLastAccount: true,
  appearance: 'system',
}

export class HomePreferencesService {
  private readonly settings: AppSettingsRepository

  constructor(
    database: SqliteExecutor,
    private readonly clock: Clock,
  ) {
    this.settings = new AppSettingsRepository(database)
  }

  async get(ledgerId: string): Promise<HomePreferences> {
    const raw = await this.settings.get(`home_preferences:${ledgerId}`)
    if (!raw) return { ...DEFAULTS }
    try {
      const value = JSON.parse(raw) as Partial<HomePreferences>
      const preferences: HomePreferences = {
        summaryDisplayType: value.summaryDisplayType === 'expense' ? 'expense' : 'income_expense',
        summaryRangeType: ['week', '7d', '15d', 'hidden'].includes(value.summaryRangeType ?? '')
          ? (value.summaryRangeType as HomeSummaryRangeType)
          : '7d',
        amountsHidden: false,
        defaultExpenseAccountId: optionalId(value.defaultExpenseAccountId),
        defaultIncomeAccountId: optionalId(value.defaultIncomeAccountId),
        rememberLastAccount: value.rememberLastAccount !== false,
        appearance: ['system', 'light', 'dark'].includes(value.appearance ?? '')
          ? (value.appearance as HomePreferences['appearance'])
          : 'system',
      }
      applyAppearance(preferences.appearance)
      return preferences
    } catch {
      return { ...DEFAULTS }
    }
  }

  async save(ledgerId: string, preferences: HomePreferences): Promise<void> {
    preferences.amountsHidden = false
    await this.settings.set(
      `home_preferences:${ledgerId}`,
      JSON.stringify(preferences),
      this.clock.nowIso(),
    )
    applyAppearance(preferences.appearance)
  }
}

function optionalId(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function applyAppearance(appearance: HomePreferences['appearance']): void {
  if (typeof document === 'undefined') return
  if (appearance === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = appearance
}

export const homePreferencesServiceKey: InjectionKey<HomePreferencesService> =
  Symbol('homePreferencesService')

export function useHomePreferencesService(): HomePreferencesService | undefined {
  return inject(homePreferencesServiceKey, undefined)
}
