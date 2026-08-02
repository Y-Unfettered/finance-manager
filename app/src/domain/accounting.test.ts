import type { AccountPostingRef } from './accounts'
import {
  createCreditPurchase,
  createExpense,
  createIncome,
  createTransfer,
  entryTotals,
  type CategoryPostingRef,
} from './accounting'

const occurredAt = '2026-08-03T20:30:00+08:00'
const bank: AccountPostingRef = { id: 'bank-1', type: 'bank', normalBalance: 'debit' }
const wechat: AccountPostingRef = {
  id: 'wechat-1',
  type: 'platform',
  normalBalance: 'debit',
}
const creditCard: AccountPostingRef = {
  id: 'credit-1',
  type: 'credit_card',
  normalBalance: 'credit',
}
const food: CategoryPostingRef = { id: 'food', kind: 'expense' }
const salary: CategoryPostingRef = { id: 'salary', kind: 'income' }

describe('accounting rules', () => {
  it('creates a balanced cash expense without changing the amount to floating point', () => {
    const draft = createExpense({
      amountMinor: 3155,
      occurredAt,
      paymentAccount: bank,
      category: food,
      merchant: '  咖啡店  ',
    })

    expect(draft.type).toBe('expense')
    expect(draft.amountMinor).toBe(3155)
    expect(draft.merchant).toBe('咖啡店')
    expect(draft.entries).toEqual([
      { side: 'debit', amountMinor: 3155, target: { kind: 'category', categoryId: 'food' } },
      { side: 'credit', amountMinor: 3155, target: { kind: 'account', accountId: 'bank-1' } },
    ])
    expect(entryTotals(draft.entries)).toEqual({ debitMinor: 3155, creditMinor: 3155 })
  })

  it('creates income as an asset debit and income category credit', () => {
    const draft = createIncome({
      amountMinor: 1200000,
      occurredAt,
      depositAccount: bank,
      category: salary,
    })

    expect(draft.entries.map((entry) => entry.side)).toEqual(['debit', 'credit'])
    expect(entryTotals(draft.entries)).toEqual({ debitMinor: 1200000, creditMinor: 1200000 })
  })

  it('creates a transfer between asset accounts without an income or expense category', () => {
    const draft = createTransfer({
      amountMinor: 20000,
      occurredAt,
      sourceAccount: bank,
      targetAccount: wechat,
    })

    expect(draft.type).toBe('transfer')
    expect(draft.entries.every((entry) => entry.target.kind === 'account')).toBe(true)
    expect(draft.entries).toEqual([
      { side: 'debit', amountMinor: 20000, target: { kind: 'account', accountId: 'wechat-1' } },
      { side: 'credit', amountMinor: 20000, target: { kind: 'account', accountId: 'bank-1' } },
    ])
  })

  it('creates a credit purchase that increases both expense and liability', () => {
    const draft = createCreditPurchase({
      amountMinor: 16652,
      occurredAt,
      liabilityAccount: creditCard,
      category: food,
    })

    expect(draft.type).toBe('credit_purchase')
    expect(draft.entries).toEqual([
      { side: 'debit', amountMinor: 16652, target: { kind: 'category', categoryId: 'food' } },
      { side: 'credit', amountMinor: 16652, target: { kind: 'account', accountId: 'credit-1' } },
    ])
  })

  it.each([0, -1, 10.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid integer minor-unit amount %s',
    (amountMinor) => {
      expect(() =>
        createExpense({ amountMinor, occurredAt, paymentAccount: bank, category: food }),
      ).toThrow('amountMinor must be a positive safe integer')
    },
  )

  it('rejects a transfer to the same account', () => {
    expect(() =>
      createTransfer({
        amountMinor: 100,
        occurredAt,
        sourceAccount: bank,
        targetAccount: bank,
      }),
    ).toThrow('Transfer accounts must be different')
  })

  it('rejects using a liability as a normal expense payment account', () => {
    expect(() =>
      createExpense({
        amountMinor: 100,
        occurredAt,
        paymentAccount: creditCard,
        category: food,
      }),
    ).toThrow('paymentAccount must have a debit normal balance')
  })

  it('rejects a category with the wrong financial direction', () => {
    expect(() =>
      createExpense({
        amountMinor: 100,
        occurredAt,
        paymentAccount: bank,
        category: salary,
      }),
    ).toThrow('Category must be expense')
  })
})
