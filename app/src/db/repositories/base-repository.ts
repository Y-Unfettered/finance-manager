import type { SqliteExecutor } from '../core/types'

export abstract class BaseRepository {
  constructor(protected readonly database: SqliteExecutor) {}
}
