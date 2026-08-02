export type EntityKind = 'ledger' | 'account' | 'category' | 'transaction' | 'entry'

export interface IdGenerator {
  next(kind: EntityKind): string
}

export const systemIdGenerator: IdGenerator = {
  next(kind) {
    return `${kind}_${createRandomId()}`
  },
}

function createRandomId(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().replaceAll('-', '')
  }

  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
