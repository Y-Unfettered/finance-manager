// @vitest-environment node
import type { EntityKind, IdGenerator } from '@/domain/identity'
import type { Clock } from '@/domain/time'
import { runMigrations } from '@/db/migration-runner'
import { AccountRepository } from '@/db/repositories/account-repository'
import { LedgerRepository } from '@/db/repositories/ledger-repository'
import { LedgerInitializationService } from '@/features/ledger/ledger-initialization-service'
import { NodeSqliteExecutor } from '@/test/node-sqlite-executor'

import { FinanceService } from './finance-service'

const clock: Clock = { nowIso: () => '2026-08-03T04:00:00.000Z' }

class SequenceIdGenerator implements IdGenerator {
  private readonly counts = new Map<EntityKind, number>()

  next(kind: EntityKind): string {
    const count = (this.counts.get(kind) ?? 0) + 1
    this.counts.set(kind, count)
    return `${kind}_${count}`
  }
}

describe('FinanceService', () => {
  it('creates an expense and exposes it through account balances and the monthly home snapshot', async () => {
    const database = new NodeSqliteExecutor()
    const ids = new SequenceIdGenerator()
    await runMigrations(database, undefined, clock.nowIso)
    const { ledger } = await new LedgerInitializationService(
      new LedgerRepository(database),
      ids,
      clock,
    ).initialize()
    const service = new FinanceService(database, ids, clock)
    const cash = (await service.listAccounts(ledger.id)).find((account) => account.type === 'cash')!
    const food = (await service.listExpenseCategories(ledger.id)).find(
      (category) => category.name === '餐饮',
    )!

    await service.createExpense({
      ledgerId: ledger.id,
      amountMinor: 3_800,
      accountId: cash.id,
      categoryId: food.id,
      occurredAt: new Date(2026, 7, 3, 12).toISOString(),
      merchant: '午餐',
    })

    const balances = await new AccountRepository(database).listBalances(ledger.id)
    expect(balances.find((account) => account.id === cash.id)?.balanceMinor).toBe(-3_800)

    const snapshot = await service.loadHome(ledger.id, new Date(2026, 7, 1))
    expect(snapshot.monthLabel).toBe('2026年8月')
    expect(snapshot.summary).toEqual({
      incomeMinor: 0,
      expenseMinor: 3_800,
      balanceMinor: -3_800,
    })
    expect(snapshot.transactions).toMatchObject([
      {
        type: 'expense',
        amountMinor: 3_800,
        title: '午餐',
        accountLabel: '现金',
      },
    ])
  })

  it('creates a reusable bank account with the correct normal balance', async () => {
    const database = new NodeSqliteExecutor()
    const ids = new SequenceIdGenerator()
    await runMigrations(database, undefined, clock.nowIso)
    const { ledger } = await new LedgerInitializationService(
      new LedgerRepository(database),
      ids,
      clock,
    ).initialize()
    const service = new FinanceService(database, ids, clock)

    const bank = await service.createAccount({
      ledgerId: ledger.id,
      type: 'bank',
      name: ' 招商银行 ',
      institution: ' 招商银行 ',
    })

    expect(bank).toMatchObject({
      name: '招商银行',
      institution: '招商银行',
      normalBalance: 'debit',
    })
    expect(await service.listAccounts(ledger.id)).toContainEqual(
      expect.objectContaining({ id: bank.id, balanceMinor: 0 }),
    )
  })

  it('supports asset and liability account types used by the account catalog', async () => {
    const database = new NodeSqliteExecutor()
    const ids = new SequenceIdGenerator()
    await runMigrations(database, undefined, clock.nowIso)
    const { ledger } = await new LedgerInitializationService(
      new LedgerRepository(database),
      ids,
      clock,
    ).initialize()
    const service = new FinanceService(database, ids, clock)

    const investment = await service.createAccount({
      ledgerId: ledger.id,
      type: 'investment',
      name: '股票账户',
    })
    const credit = await service.createAccount({
      ledgerId: ledger.id,
      type: 'credit_card',
      name: '招商银行信用卡',
      institution: '招商银行',
    })

    expect(investment.normalBalance).toBe('debit')
    expect(credit.normalBalance).toBe('credit')
  })

  it('records an opening balance and later adjusts the account without affecting monthly income', async () => {
    const database = new NodeSqliteExecutor()
    const ids = new SequenceIdGenerator()
    await runMigrations(database, undefined, clock.nowIso)
    const { ledger } = await new LedgerInitializationService(
      new LedgerRepository(database),
      ids,
      clock,
    ).initialize()
    const service = new FinanceService(database, ids, clock)

    const bank = await service.createAccount({
      ledgerId: ledger.id,
      type: 'bank',
      name: '工资卡',
      initialBalanceMinor: 120_000,
      occurredAt: clock.nowIso(),
    })
    expect((await service.getAccount(bank.id))?.balanceMinor).toBe(120_000)

    await service.adjustAccountBalance({
      ledgerId: ledger.id,
      accountId: bank.id,
      balanceMinor: 115_500,
      occurredAt: clock.nowIso(),
      note: '余额核对',
    })
    expect((await service.getAccount(bank.id))?.balanceMinor).toBe(115_500)
    expect((await service.loadHome(ledger.id, new Date(2026, 7, 1))).summary).toEqual({
      incomeMinor: 0,
      expenseMinor: 0,
      balanceMinor: 0,
    })
    expect(await service.listAccountActivity(bank.id)).toHaveLength(2)
  })

  it('tracks a receivable through partial and final recovery', async () => {
    const database = new NodeSqliteExecutor()
    const ids = new SequenceIdGenerator()
    await runMigrations(database, undefined, clock.nowIso)
    const { ledger } = await new LedgerInitializationService(
      new LedgerRepository(database),
      ids,
      clock,
    ).initialize()
    const service = new FinanceService(database, ids, clock)
    const cash = (await service.listAccounts(ledger.id)).find((account) => account.type === 'cash')!
    await service.adjustAccountBalance({
      ledgerId: ledger.id,
      accountId: cash.id,
      balanceMinor: 100_000,
      occurredAt: clock.nowIso(),
    })

    const receivable = await service.createReceivable({
      ledgerId: ledger.id,
      borrower: '张三',
      amountMinor: 80_000,
      sourceAccountId: cash.id,
      occurredAt: clock.nowIso(),
      dueDate: '2026-08-20',
    })
    expect((await service.listReceivables(ledger.id))[0]).toMatchObject({
      id: receivable.id,
      outstandingMinor: 80_000,
      status: 'open',
    })

    await service.recoverReceivable({
      receivableId: receivable.id,
      amountMinor: 30_000,
      depositAccountId: cash.id,
      occurredAt: clock.nowIso(),
    })
    expect((await service.listReceivables(ledger.id))[0]).toMatchObject({
      outstandingMinor: 50_000,
      status: 'open',
    })
    await service.recoverReceivable({
      receivableId: receivable.id,
      amountMinor: 50_000,
      depositAccountId: cash.id,
      occurredAt: clock.nowIso(),
    })
    expect((await service.listReceivables(ledger.id))[0]).toMatchObject({
      outstandingMinor: 0,
      status: 'settled',
    })
  })

  it('records an income that increases the deposit account and the monthly income summary', async () => {
    const database = new NodeSqliteExecutor()
    const ids = new SequenceIdGenerator()
    await runMigrations(database, undefined, clock.nowIso)
    const { ledger } = await new LedgerInitializationService(
      new LedgerRepository(database),
      ids,
      clock,
    ).initialize()
    const service = new FinanceService(database, ids, clock)
    const bank = await service.createAccount({
      ledgerId: ledger.id,
      type: 'bank',
      name: '工资卡',
    })
    const salary = (await service.listIncomeCategories(ledger.id)).find(
      (category) => category.name === '工资',
    )!

    await service.createIncome({
      ledgerId: ledger.id,
      amountMinor: 888_800,
      accountId: bank.id,
      categoryId: salary.id,
      occurredAt: clock.nowIso(),
      merchant: '公司',
    })

    expect((await service.getAccount(bank.id))?.balanceMinor).toBe(888_800)
    const snapshot = await service.loadHome(ledger.id, new Date(2026, 7, 1))
    expect(snapshot.summary).toEqual({
      incomeMinor: 888_800,
      expenseMinor: 0,
      balanceMinor: 888_800,
    })
  })

  it('moves funds between two accounts through a transfer without changing income or expense', async () => {
    const database = new NodeSqliteExecutor()
    const ids = new SequenceIdGenerator()
    await runMigrations(database, undefined, clock.nowIso)
    const { ledger } = await new LedgerInitializationService(
      new LedgerRepository(database),
      ids,
      clock,
    ).initialize()
    const service = new FinanceService(database, ids, clock)
    const bank = await service.createAccount({
      ledgerId: ledger.id,
      type: 'bank',
      name: '工资卡',
      initialBalanceMinor: 100_000,
      occurredAt: clock.nowIso(),
    })
    const wechat = await service.createAccount({
      ledgerId: ledger.id,
      type: 'platform',
      name: '微信余额',
    })

    await service.createTransfer({
      ledgerId: ledger.id,
      amountMinor: 30_000,
      sourceAccountId: bank.id,
      targetAccountId: wechat.id,
      occurredAt: clock.nowIso(),
    })

    expect((await service.getAccount(bank.id))?.balanceMinor).toBe(70_000)
    expect((await service.getAccount(wechat.id))?.balanceMinor).toBe(30_000)
    const snapshot = await service.loadHome(ledger.id, new Date(2026, 7, 1))
    expect(snapshot.summary).toEqual({
      incomeMinor: 0,
      expenseMinor: 0,
      balanceMinor: 0,
    })
  })

  it('tracks a payable through partial and final repayment', async () => {
    const database = new NodeSqliteExecutor()
    const ids = new SequenceIdGenerator()
    await runMigrations(database, undefined, clock.nowIso)
    const { ledger } = await new LedgerInitializationService(
      new LedgerRepository(database),
      ids,
      clock,
    ).initialize()
    const service = new FinanceService(database, ids, clock)
    const cash = (await service.listAccounts(ledger.id)).find((account) => account.type === 'cash')!

    const payable = await service.createPayable({
      ledgerId: ledger.id,
      lender: '李四',
      amountMinor: 50_000,
      depositAccountId: cash.id,
      occurredAt: clock.nowIso(),
      dueDate: '2026-09-01',
    })
    expect((await service.listPayables(ledger.id))[0]).toMatchObject({
      id: payable.id,
      outstandingMinor: 50_000,
      status: 'open',
    })
    expect((await service.getAccount(cash.id))?.balanceMinor).toBe(50_000)

    await service.repayPayable({
      payableId: payable.id,
      amountMinor: 20_000,
      sourceAccountId: cash.id,
      occurredAt: clock.nowIso(),
    })
    expect((await service.listPayables(ledger.id))[0]).toMatchObject({
      outstandingMinor: 30_000,
      status: 'open',
    })
    expect((await service.getAccount(cash.id))?.balanceMinor).toBe(30_000)

    await service.repayPayable({
      payableId: payable.id,
      amountMinor: 30_000,
      sourceAccountId: cash.id,
      occurredAt: clock.nowIso(),
    })
    expect((await service.listPayables(ledger.id))[0]).toMatchObject({
      outstandingMinor: 0,
      status: 'settled',
    })
    expect((await service.getAccount(cash.id))?.balanceMinor).toBe(0)

    const snapshot = await service.loadHome(ledger.id, new Date(2026, 7, 1))
    expect(snapshot.summary).toEqual({
      incomeMinor: 0,
      expenseMinor: 0,
      balanceMinor: 0,
    })
  })

  it('renames and archives an account whose balance is zero, then unarchives it', async () => {
    const database = new NodeSqliteExecutor()
    const ids = new SequenceIdGenerator()
    await runMigrations(database, undefined, clock.nowIso)
    const { ledger } = await new LedgerInitializationService(
      new LedgerRepository(database),
      ids,
      clock,
    ).initialize()
    const service = new FinanceService(database, ids, clock)
    const bank = await service.createAccount({
      ledgerId: ledger.id,
      type: 'bank',
      name: '旧名称',
    })

    await service.renameAccount({
      ledgerId: ledger.id,
      accountId: bank.id,
      name: ' 新名称 ',
    })
    expect((await service.getAccount(bank.id))?.name).toBe('新名称')

    await service.archiveAccount(ledger.id, bank.id)
    expect((await service.getAccount(bank.id))?.archivedAt).toBeTruthy()

    await service.unarchiveAccount(ledger.id, bank.id)
    expect((await service.getAccount(bank.id))?.archivedAt).toBeUndefined()
  })

  it('refuses to archive an account whose balance is non-zero', async () => {
    const database = new NodeSqliteExecutor()
    const ids = new SequenceIdGenerator()
    await runMigrations(database, undefined, clock.nowIso)
    const { ledger } = await new LedgerInitializationService(
      new LedgerRepository(database),
      ids,
      clock,
    ).initialize()
    const service = new FinanceService(database, ids, clock)
    const bank = await service.createAccount({
      ledgerId: ledger.id,
      type: 'bank',
      name: '工资卡',
      initialBalanceMinor: 100_000,
      occurredAt: clock.nowIso(),
    })

    await expect(service.archiveAccount(ledger.id, bank.id)).rejects.toThrow('账户余额非零')
  })

  it('updates and deletes a settled receivable while preserving historical transactions', async () => {
    const database = new NodeSqliteExecutor()
    const ids = new SequenceIdGenerator()
    await runMigrations(database, undefined, clock.nowIso)
    const { ledger } = await new LedgerInitializationService(
      new LedgerRepository(database),
      ids,
      clock,
    ).initialize()
    const service = new FinanceService(database, ids, clock)
    const cash = (await service.listAccounts(ledger.id)).find((account) => account.type === 'cash')!
    await service.adjustAccountBalance({
      ledgerId: ledger.id,
      accountId: cash.id,
      balanceMinor: 100_000,
      occurredAt: clock.nowIso(),
    })

    const receivable = await service.createReceivable({
      ledgerId: ledger.id,
      borrower: '张三',
      amountMinor: 60_000,
      sourceAccountId: cash.id,
      occurredAt: clock.nowIso(),
      dueDate: '2026-08-20',
      note: '初始备注',
    })

    await service.updateReceivable({
      ledgerId: ledger.id,
      receivableId: receivable.id,
      dueDate: '2026-09-15',
      note: '修改后备注',
    })
    expect(await service.listReceivables(ledger.id)).toMatchObject([
      { dueDate: '2026-09-15', note: '修改后备注' },
    ])

    await expect(service.deleteReceivable(ledger.id, receivable.id)).rejects.toThrow(
      '仅可删除已结清的借出款',
    )

    await service.recoverReceivable({
      receivableId: receivable.id,
      amountMinor: 60_000,
      depositAccountId: cash.id,
      occurredAt: clock.nowIso(),
    })
    expect((await service.listReceivables(ledger.id))[0]?.status).toBe('settled')

    await service.deleteReceivable(ledger.id, receivable.id)
    expect(await service.listReceivables(ledger.id)).toEqual([])
    expect((await service.getAccount(cash.id))?.balanceMinor).toBe(100_000)
  })

  it('updates and deletes a settled payable while preserving historical transactions', async () => {
    const database = new NodeSqliteExecutor()
    const ids = new SequenceIdGenerator()
    await runMigrations(database, undefined, clock.nowIso)
    const { ledger } = await new LedgerInitializationService(
      new LedgerRepository(database),
      ids,
      clock,
    ).initialize()
    const service = new FinanceService(database, ids, clock)
    const cash = (await service.listAccounts(ledger.id)).find((account) => account.type === 'cash')!

    const payable = await service.createPayable({
      ledgerId: ledger.id,
      lender: '李四',
      amountMinor: 40_000,
      depositAccountId: cash.id,
      occurredAt: clock.nowIso(),
      dueDate: '2026-09-01',
      note: '初始备注',
    })

    await service.updatePayable({
      ledgerId: ledger.id,
      payableId: payable.id,
      dueDate: '2026-10-10',
      note: '修改后备注',
    })
    expect(await service.listPayables(ledger.id)).toMatchObject([
      { dueDate: '2026-10-10', note: '修改后备注' },
    ])

    await expect(service.deletePayable(ledger.id, payable.id)).rejects.toThrow(
      '仅可删除已结清的借入款',
    )

    await service.repayPayable({
      payableId: payable.id,
      amountMinor: 40_000,
      sourceAccountId: cash.id,
      occurredAt: clock.nowIso(),
    })
    expect((await service.listPayables(ledger.id))[0]?.status).toBe('settled')

    await service.deletePayable(ledger.id, payable.id)
    expect(await service.listPayables(ledger.id)).toEqual([])
    expect((await service.getAccount(cash.id))?.balanceMinor).toBe(0)
  })

  it('lists recent transactions and voids an expense, rolling back the account balance', async () => {
    const database = new NodeSqliteExecutor()
    const ids = new SequenceIdGenerator()
    await runMigrations(database, undefined, clock.nowIso)
    const { ledger } = await new LedgerInitializationService(
      new LedgerRepository(database),
      ids,
      clock,
    ).initialize()
    const service = new FinanceService(database, ids, clock)
    const cash = (await service.listAccounts(ledger.id)).find((account) => account.type === 'cash')!
    const food = (await service.listExpenseCategories(ledger.id)).find(
      (category) => category.name === '餐饮',
    )!
    await service.adjustAccountBalance({
      ledgerId: ledger.id,
      accountId: cash.id,
      balanceMinor: 100_000,
      occurredAt: clock.nowIso(),
    })

    const expenseId = await service.createExpense({
      ledgerId: ledger.id,
      amountMinor: 2_500,
      accountId: cash.id,
      categoryId: food.id,
      occurredAt: clock.nowIso(),
      merchant: '便利店',
    })
    expect((await service.getAccount(cash.id))?.balanceMinor).toBe(97_500)

    const recent = await service.listRecentTransactions(ledger.id, 5)
    expect(recent).toHaveLength(1)
    expect(recent[0]).toMatchObject({ id: expenseId, title: '便利店', amountMinor: 2_500 })

    await service.voidTransaction(ledger.id, expenseId)
    expect((await service.getAccount(cash.id))?.balanceMinor).toBe(100_000)
    expect(await service.listRecentTransactions(ledger.id, 5)).toHaveLength(0)
  })

  it('edits a transaction metadata and exposes the updated fields through getTransaction', async () => {
    const database = new NodeSqliteExecutor()
    const ids = new SequenceIdGenerator()
    await runMigrations(database, undefined, clock.nowIso)
    const { ledger } = await new LedgerInitializationService(
      new LedgerRepository(database),
      ids,
      clock,
    ).initialize()
    const service = new FinanceService(database, ids, clock)
    const cash = (await service.listAccounts(ledger.id)).find((account) => account.type === 'cash')!
    const food = (await service.listExpenseCategories(ledger.id)).find(
      (category) => category.name === '餐饮',
    )!

    const expenseId = await service.createExpense({
      ledgerId: ledger.id,
      amountMinor: 1_800,
      accountId: cash.id,
      categoryId: food.id,
      occurredAt: new Date('2026-08-01T03:00:00.000Z').toISOString(),
      merchant: '原始商家',
      note: '原始备注',
    })

    await service.editTransaction({
      ledgerId: ledger.id,
      transactionId: expenseId,
      occurredAt: new Date('2026-08-02T05:30:00.000Z').toISOString(),
      merchant: '修改后商家',
      note: '修改后备注',
    })

    const updated = await service.getTransaction(expenseId)
    expect(updated).toMatchObject({
      id: expenseId,
      merchant: '修改后商家',
      note: '修改后备注',
      occurredAt: '2026-08-02T05:30:00.000Z',
    })

    const recent = await service.listRecentTransactions(ledger.id, 5)
    expect(recent[0]).toMatchObject({ title: '修改后商家' })
  })

  it('refuses to void an opening balance or an already voided transaction', async () => {
    const database = new NodeSqliteExecutor()
    const ids = new SequenceIdGenerator()
    await runMigrations(database, undefined, clock.nowIso)
    const { ledger } = await new LedgerInitializationService(
      new LedgerRepository(database),
      ids,
      clock,
    ).initialize()
    const service = new FinanceService(database, ids, clock)
    const cash = (await service.listAccounts(ledger.id)).find((account) => account.type === 'cash')!
    await service.adjustAccountBalance({
      ledgerId: ledger.id,
      accountId: cash.id,
      balanceMinor: 50_000,
      occurredAt: clock.nowIso(),
    })
    const food = (await service.listExpenseCategories(ledger.id)).find(
      (category) => category.name === '餐饮',
    )!
    const expenseId = await service.createExpense({
      ledgerId: ledger.id,
      amountMinor: 1_000,
      accountId: cash.id,
      categoryId: food.id,
      occurredAt: clock.nowIso(),
    })

    await service.voidTransaction(ledger.id, expenseId)
    await expect(service.voidTransaction(ledger.id, expenseId)).rejects.toThrow('交易已撤销')
  })
})
