export type SqlValue = string | number | null | Uint8Array

export interface SqliteExecutor {
  execute(statements: string, transaction?: boolean): Promise<void>
  query<Row extends object>(statement: string, values?: readonly SqlValue[]): Promise<Row[]>
}

export interface Migration {
  version: number
  name: string
  statements: string
}
