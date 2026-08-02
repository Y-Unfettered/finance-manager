import type { Migration } from '../core/types'
import { INITIAL_SCHEMA_MIGRATION } from './001_initial_schema'

export const APP_MIGRATIONS: readonly Migration[] = [INITIAL_SCHEMA_MIGRATION]
export const LATEST_SCHEMA_VERSION = INITIAL_SCHEMA_MIGRATION.version
