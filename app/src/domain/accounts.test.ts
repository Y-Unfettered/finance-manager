import { normalBalanceForAccountType } from './accounts'

describe('account type rules', () => {
  it('uses debit balances for assets and receivables', () => {
    expect(normalBalanceForAccountType('cash')).toBe('debit')
    expect(normalBalanceForAccountType('bank')).toBe('debit')
    expect(normalBalanceForAccountType('receivable')).toBe('debit')
  })

  it('uses credit balances for credit accounts and liabilities', () => {
    expect(normalBalanceForAccountType('credit_card')).toBe('credit')
    expect(normalBalanceForAccountType('consumer_credit')).toBe('credit')
    expect(normalBalanceForAccountType('other_liability')).toBe('credit')
  })
})
