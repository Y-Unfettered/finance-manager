import type { SqliteExecutor } from '../core/types'

export abstract class BaseRepository {
  protected constructor(protected readonly database: SqliteExecutor) {}
}
