import type { AccountPostingRef } from './accounts'
import {
  createBorrowing,
  createCreditIncome,
  createCreditPurchase,
  createBalanceAdjustment,
  createExpense,
  createIncome,
  createLoanOut,
  createLoanRecovery,
  createOpeningBalance,
  createRepayBorrowing,
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
const receivable: AccountPostingRef = {
  id: 'receivable-1',
  type: 'receivable',
  normalBalance: 'debit',
}
const payable: AccountPostingRef = {
  id: 'payable-1',
  type: 'other_liability',
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

  it('creates a credit income (refund) that decreases liability and increases income', () => {
    const draft = createCreditIncome({
      amountMinor: 8800,
      occurredAt,
      liabilityAccount: creditCard,
      category: salary,
      merchant: '信用卡返现',
    })

    expect(draft.type).toBe('refund')
    expect(draft.merchant).toBe('信用卡返现')
    expect(draft.entries).toEqual([
      { side: 'debit', amountMinor: 8800, target: { kind: 'account', accountId: 'credit-1' } },
      { side: 'credit', amountMinor: 8800, target: { kind: 'category', categoryId: 'salary' } },
    ])
    expect(entryTotals(draft.entries)).toEqual({ debitMinor: 8800, creditMinor: 8800 })
  })

  it('creates opening balances and downward balance adjustments for assets and liabilities', () => {
    expect(
      createOpeningBalance({
        amountMinor: 50_000,
        occurredAt,
        account: bank,
        offsetCategory: salary,
        increase: true,
      }).entries,
    ).toEqual([
      { side: 'debit', amountMinor: 50_000, target: { kind: 'account', accountId: 'bank-1' } },
      { side: 'credit', amountMinor: 50_000, target: { kind: 'category', categoryId: 'salary' } },
    ])
    expect(
      createBalanceAdjustment({
        amountMinor: 2_000,
        occurredAt,
        account: creditCard,
        offsetCategory: salary,
        increase: false,
      }).entries,
    ).toEqual([
      { side: 'debit', amountMinor: 2_000, target: { kind: 'account', accountId: 'credit-1' } },
      { side: 'credit', amountMinor: 2_000, target: { kind: 'category', categoryId: 'salary' } },
    ])
  })

  it('moves money into and out of a receivable without treating it as spending or income', () => {
    const loanOut = createLoanOut({
      amountMinor: 80_000,
      occurredAt,
      sourceAccount: bank,
      receivableAccount: receivable,
      counterparty: '张三',
    })
    expect(loanOut.type).toBe('loan_out')
    expect(loanOut.counterparty).toBe('张三')
    expect(loanOut.entries).toEqual([
      {
        side: 'debit',
        amountMinor: 80_000,
        target: { kind: 'account', accountId: 'receivable-1' },
      },
      { side: 'credit', amountMinor: 80_000, target: { kind: 'account', accountId: 'bank-1' } },
    ])

    expect(
      createLoanRecovery({
        amountMinor: 20_000,
        occurredAt,
        receivableAccount: receivable,
        depositAccount: bank,
      }).entries,
    ).toEqual([
      { side: 'debit', amountMinor: 20_000, target: { kind: 'account', accountId: 'bank-1' } },
      {
        side: 'credit',
        amountMinor: 20_000,
        target: { kind: 'account', accountId: 'receivable-1' },
      },
    ])
  })

  it('creates a borrowing that increases cash and a liability without affecting income or expense', () => {
    const borrowing = createBorrowing({
      amountMinor: 50_000,
      occurredAt,
      payableAccount: payable,
      depositAccount: bank,
      counterparty: '李四',
    })

    expect(borrowing.type).toBe('borrowing')
    expect(borrowing.counterparty).toBe('李四')
    expect(borrowing.entries).toEqual([
      { side: 'debit', amountMinor: 50_000, target: { kind: 'account', accountId: 'bank-1' } },
      {
        side: 'credit',
        amountMinor: 50_000,
        target: { kind: 'account', accountId: 'payable-1' },
      },
    ])
    expect(entryTotals(borrowing.entries)).toEqual({ debitMinor: 50_000, creditMinor: 50_000 })
  })

  it('creates a repay borrowing that decreases cash and a liability without affecting income or expense', () => {
    const repay = createRepayBorrowing({
      amountMinor: 20_000,
      occurredAt,
      payableAccount: payable,
      sourceAccount: bank,
    })

    expect(repay.type).toBe('repay_borrowing')
    expect(repay.entries).toEqual([
      {
        side: 'debit',
        amountMinor: 20_000,
        target: { kind: 'account', accountId: 'payable-1' },
      },
      { side: 'credit', amountMinor: 20_000, target: { kind: 'account', accountId: 'bank-1' } },
    ])
    expect(entryTotals(repay.entries)).toEqual({ debitMinor: 20_000, creditMinor: 20_000 })
  })

  it('rejects using a debit account as the payable in a borrowing', () => {
    expect(() =>
      createBorrowing({
        amountMinor: 100,
        occurredAt,
        payableAccount: bank,
        depositAccount: bank,
      }),
    ).toThrow('payableAccount must have a credit normal balance')
  })

  it('rejects using a credit account as the source of a repay borrowing', () => {
    expect(() =>
      createRepayBorrowing({
        amountMinor: 100,
        occurredAt,
        payableAccount: payable,
        sourceAccount: creditCard,
      }),
    ).toThrow('sourceAccount must have a debit normal balance')
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

  it('rejects using a debit account for credit income (refund)', () => {
    expect(() =>
      createCreditIncome({
        amountMinor: 100,
        occurredAt,
        liabilityAccount: bank,
        category: salary,
      }),
    ).toThrow('liabilityAccount must have a credit normal balance')
  })

  it('rejects credit income with an expense category', () => {
    expect(() =>
      createCreditIncome({
        amountMinor: 100,
        occurredAt,
        liabilityAccount: creditCard,
        category: food,
      }),
    ).toThrow('Category must be income')
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
