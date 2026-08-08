import type { Migration } from '../core/types'
import { INITIAL_SCHEMA_MIGRATION } from './001_initial_schema'
import { RECEIVABLES_MIGRATION } from './002_receivables'
import { PAYABLES_MIGRATION } from './003_payables'
import { IMPORT_BATCHES_MIGRATION } from './004_import_batches'
import { IMPORT_BATCHES_SOURCE_V5_MIGRATION } from './005_import_batches_source_v5'
import { TRANSACTIONS_TYPE_CONSTRAINT_V6_MIGRATION } from './006_transactions_type_constraint_v6'
import { APP_SETTINGS_V7_MIGRATION } from './007_app_settings_v7'
import { BUDGET_TEMPLATES_REMINDERS_V8_MIGRATION } from './008_budget_templates_reminders_v8'

export const APP_MIGRATIONS: readonly Migration[] = [
  INITIAL_SCHEMA_MIGRATION,
  RECEIVABLES_MIGRATION,
  PAYABLES_MIGRATION,
  IMPORT_BATCHES_MIGRATION,
  IMPORT_BATCHES_SOURCE_V5_MIGRATION,
  TRANSACTIONS_TYPE_CONSTRAINT_V6_MIGRATION,
  APP_SETTINGS_V7_MIGRATION,
  BUDGET_TEMPLATES_REMINDERS_V8_MIGRATION,
]
export const LATEST_SCHEMA_VERSION = BUDGET_TEMPLATES_REMINDERS_V8_MIGRATION.version
