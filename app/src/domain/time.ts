export interface Clock {
  nowIso(): string
}

export const systemClock: Clock = {
  nowIso: () => new Date().toISOString(),
}

export function toUtcIso(value: string): string {
  const timestamp = Date.parse(value)
  if (value.trim() === '' || Number.isNaN(timestamp)) {
    throw new Error('Date-time must be valid')
  }
  return new Date(timestamp).toISOString()
}
