// @vitest-environment node
import type { EntityKind, IdGenerator } from '@/domain/identity'
import type { Clock } from '@/domain/time'
import { runMigrations } from '@/db/migration-runner'
import { AccountRepository } from '@/db/repositories/account-repository'
import { CategoryRepository } from '@/db/repositories/category-repository'
import { TransactionRepository } from '@/db/repositories/transaction-repository'
import { LedgerRepository } from '@/db/repositories/ledger-repository'
import { LedgerInitializationService } from '@/features/ledger/ledger-initialization-service'
import { summarizeAssets } from '@/features/finance/asset-summary'
import { NodeSqliteExecutor } from '@/test/node-sqlite-executor'

import { ImportService } from './import-service'

const clock: Clock = { nowIso: () => '2026-08-03T04:00:00.000Z' }

class SequenceIdGenerator implements IdGenerator {
  private readonly counts = new Map<EntityKind, number>()

  next(kind: EntityKind): string {
    const count = (this.counts.get(kind) ?? 0) + 1
    this.counts.set(kind, count)
    return `${kind}_${count}`
  }
}

async function setupLedger() {
  const database = new NodeSqliteExecutor()
  const ids = new SequenceIdGenerator()
  await runMigrations(database, undefined, clock.nowIso)
  const { ledger } = await new LedgerInitializationService(
    new LedgerRepository(database),
    ids,
    clock,
  ).initialize()
  const accounts = new AccountRepository(database)
  const categories = new CategoryRepository(database)
  const bank = {
    id: ids.next('account'),
    ledgerId: ledger.id,
    name: '工资卡',
    type: 'bank' as const,
    normalBalance: 'debit' as const,
    currency: 'CNY' as const,
    createdAt: clock.nowIso(),
    updatedAt: clock.nowIso(),
  }
  await accounts.create(bank)
  const wechat = {
    id: ids.next('account'),
    ledgerId: ledger.id,
    name: '微信',
    type: 'platform' as const,
    normalBalance: 'debit' as const,
    currency: 'CNY' as const,
    createdAt: clock.nowIso(),
    updatedAt: clock.nowIso(),
  }
  await accounts.create(wechat)
  const allCategories = await categories.listByLedger(ledger.id)
  const food = allCategories.find((c) => c.name === '餐饮')!
  const salary = allCategories.find((c) => c.name === '工资')!
  const service = new ImportService({ database, clock, ids })
  return { database, ids, ledger, bank, wechat, food, salary, service, accounts, categories }
}

const EXPENSE_CSV = `date,amount,type,account,category,merchant,note
2026-08-01,12.50,支出,工资卡,餐饮,便利店,午餐
2026-08-02,8.00,支出,工资卡,餐饮,早餐,豆浆
2026-08-03,100.00,收入,工资卡,工资,公司,8月工资`

const TRANSFER_CSV = `date,amount,type,from,to,note
2026-08-01,100.00,转账,工资卡,微信,转入微信`

describe('ImportService.previewCsv', () => {
  it('rejects an empty CSV', async () => {
    const plan = await new ImportService({
      database: {} as never,
      clock,
      ids: {} as never,
    }).previewCsv({
      ledgerId: 'ledger',
      fileName: 'empty.csv',
      content: '',
      fieldMapping: [{ systemField: 'amount', columnIndex: 0 }],
    })
    expect(plan.totalRows).toBe(0)
    expect(plan.validRows).toEqual([])
    expect(plan.errors[0]?.message).toContain('文件为空或无表头')
  })

  it('rejects a mapping missing required fields', async () => {
    const plan = await new ImportService({
      database: {} as never,
      clock,
      ids: {} as never,
    }).previewCsv({
      ledgerId: 'ledger',
      fileName: 'test.csv',
      content: 'date,amount\n2026-08-01,12.50',
      fieldMapping: [{ systemField: 'amount', columnIndex: 1 }],
    })
    expect(plan.errors[0]?.message).toContain('字段映射缺少必填项')
    expect(plan.validRows).toEqual([])
  })

  it('returns valid rows for an expense CSV with account and category mappings', async () => {
    const { ledger, bank, food, salary, service } = await setupLedger()
    const plan = await service.previewCsv({
      ledgerId: ledger.id,
      fileName: 'expense.csv',
      content: EXPENSE_CSV,
      fieldMapping: [
        { systemField: 'date', columnIndex: 0 },
        { systemField: 'amount', columnIndex: 1 },
        { systemField: 'type', columnIndex: 2 },
        { systemField: 'sourceAccount', columnIndex: 3 },
        { systemField: 'category', columnIndex: 4 },
        { systemField: 'merchant', columnIndex: 5 },
        { systemField: 'note', columnIndex: 6 },
      ],
      accountMappings: [{ rawName: '工资卡', accountId: bank.id }],
      categoryMappings: [
        { rawName: '餐饮', categoryId: food.id },
        { rawName: '工资', categoryId: salary.id },
      ],
    })
    expect(plan.totalRows).toBe(3)
    expect(plan.validRows).toHaveLength(3)
    expect(plan.errors).toEqual([])
    expect(plan.validRows[0]?.raw.kind).toBe('expense')
    expect(plan.validRows[2]?.raw.kind).toBe('income')
    expect(plan.sourceFingerprint).toMatch(/^batch:/)
  })

  it('reports per-row errors for missing or unmatched mappings', async () => {
    const { ledger, service } = await setupLedger()
    const plan = await service.previewCsv({
      ledgerId: ledger.id,
      fileName: 'errors.csv',
      content: 'date,amount\n2026-08-01,\n,12.50\n2026-08-03,5.00',
      fieldMapping: [
        { systemField: 'date', columnIndex: 0 },
        { systemField: 'amount', columnIndex: 1 },
      ],
    })
    expect(plan.totalRows).toBe(3)
    expect(plan.validRows).toHaveLength(1)
    expect(plan.errors).toHaveLength(2)
    expect(plan.errors[0]?.message).toContain('缺少金额')
    expect(plan.errors[1]?.message).toContain('缺少日期')
  })

  it('detects transfer rows and rejects same-account transfers', async () => {
    const { ledger, bank, wechat, service } = await setupLedger()
    const plan = await service.previewCsv({
      ledgerId: ledger.id,
      fileName: 'transfer.csv',
      content: TRANSFER_CSV,
      fieldMapping: [
        { systemField: 'date', columnIndex: 0 },
        { systemField: 'amount', columnIndex: 1 },
        { systemField: 'type', columnIndex: 2 },
        { systemField: 'sourceAccount', columnIndex: 3 },
        { systemField: 'targetAccount', columnIndex: 4 },
        { systemField: 'note', columnIndex: 5 },
      ],
      accountMappings: [
        { rawName: '工资卡', accountId: bank.id },
        { rawName: '微信', accountId: wechat.id },
      ],
    })
    expect(plan.validRows).toHaveLength(1)
    expect(plan.validRows[0]?.raw.kind).toBe('transfer')
    expect(plan.validRows[0]?.sourceAccountId).toBe(bank.id)
    expect(plan.validRows[0]?.targetAccountId).toBe(wechat.id)
  })
})

describe('ImportService.executeImport', () => {
  it('imports expense and income rows, links them to a batch, and updates account balances', async () => {
    const { database, ids, ledger, bank, food, salary, service } = await setupLedger()
    const plan = await service.previewCsv({
      ledgerId: ledger.id,
      fileName: 'expense.csv',
      content: EXPENSE_CSV,
      fieldMapping: [
        { systemField: 'date', columnIndex: 0 },
        { systemField: 'amount', columnIndex: 1 },
        { systemField: 'type', columnIndex: 2 },
        { systemField: 'sourceAccount', columnIndex: 3 },
        { systemField: 'category', columnIndex: 4 },
        { systemField: 'merchant', columnIndex: 5 },
        { systemField: 'note', columnIndex: 6 },
      ],
      accountMappings: [{ rawName: '工资卡', accountId: bank.id }],
      categoryMappings: [
        { rawName: '餐饮', categoryId: food.id },
        { rawName: '工资', categoryId: salary.id },
      ],
    })

    const result = await service.executeImport({ ledgerId: ledger.id, plan })
    expect(result.successCount).toBe(3)
    expect(result.errorCount).toBe(0)
    expect(result.batchId).toBeTruthy()
    expect(result.importedTransactionIds).toHaveLength(3)

    const transactions = new TransactionRepository(database, ids, clock)
    const all = await transactions.listByLedger(ledger.id)
    expect(all.filter((t) => t.status === 'posted')).toHaveLength(3)

    const balances = await new AccountRepository(database).listBalances(ledger.id)
    const bankBalance = balances.find((b) => b.id === bank.id)?.balanceMinor
    expect(bankBalance).toBe(0 - 1_250 - 800 + 10_000)
  })

  it('refuses to import the same file twice via batch fingerprint', async () => {
    const { ledger, bank, food, service } = await setupLedger()
    const plan = await service.previewCsv({
      ledgerId: ledger.id,
      fileName: 'dup.csv',
      content: 'date,amount,account,category\n2026-08-01,5.00,工资卡,餐饮',
      fieldMapping: [
        { systemField: 'date', columnIndex: 0 },
        { systemField: 'amount', columnIndex: 1 },
        { systemField: 'sourceAccount', columnIndex: 2 },
        { systemField: 'category', columnIndex: 3 },
      ],
      accountMappings: [{ rawName: '工资卡', accountId: bank.id }],
      categoryMappings: [{ rawName: '餐饮', categoryId: food.id }],
    })

    const first = await service.executeImport({ ledgerId: ledger.id, plan })
    expect(first.successCount).toBe(1)

    const second = await service.executeImport({ ledgerId: ledger.id, plan })
    expect(second.successCount).toBe(0)
    expect(second.duplicateCount).toBe(1)
    expect(second.batchId).toBe('')
  })

  it('records error rows without aborting the batch', async () => {
    const { ledger, bank, food, service } = await setupLedger()
    const plan = await service.previewCsv({
      ledgerId: ledger.id,
      fileName: 'mixed.csv',
      content:
        'date,amount,account,category\n2026-08-01,5.00,工资卡,餐饮\n2026-08-02,无效金额,工资卡,餐饮',
      fieldMapping: [
        { systemField: 'date', columnIndex: 0 },
        { systemField: 'amount', columnIndex: 1 },
        { systemField: 'sourceAccount', columnIndex: 2 },
        { systemField: 'category', columnIndex: 3 },
      ],
      accountMappings: [{ rawName: '工资卡', accountId: bank.id }],
      categoryMappings: [{ rawName: '餐饮', categoryId: food.id }],
    })
    expect(plan.validRows).toHaveLength(1)
    expect(plan.errors).toHaveLength(1)

    const result = await service.executeImport({ ledgerId: ledger.id, plan })
    expect(result.successCount).toBe(1)
    expect(result.errorCount).toBe(1)
  })

  it('imports income rows tied to a credit account as refund transactions', async () => {
    const { database, ids, ledger, salary, service, accounts } = await setupLedger()
    const creditCard = {
      id: ids.next('account'),
      ledgerId: ledger.id,
      name: '抖音月付',
      type: 'credit_card' as const,
      normalBalance: 'credit' as const,
      currency: 'CNY' as const,
      createdAt: clock.nowIso(),
      updatedAt: clock.nowIso(),
    }
    await accounts.create(creditCard)

    const plan = await service.previewCsv({
      ledgerId: ledger.id,
      fileName: 'credit-income.csv',
      content:
        'date,amount,type,account,category,merchant\n2026-08-01,88.00,收入,抖音月付,工资,信用卡返现',
      fieldMapping: [
        { systemField: 'date', columnIndex: 0 },
        { systemField: 'amount', columnIndex: 1 },
        { systemField: 'type', columnIndex: 2 },
        { systemField: 'sourceAccount', columnIndex: 3 },
        { systemField: 'category', columnIndex: 4 },
        { systemField: 'merchant', columnIndex: 5 },
      ],
      accountMappings: [{ rawName: '抖音月付', accountId: creditCard.id }],
      categoryMappings: [{ rawName: '工资', categoryId: salary.id }],
    })

    expect(plan.errors).toHaveLength(0)
    expect(plan.validRows).toHaveLength(1)

    const result = await service.executeImport({ ledgerId: ledger.id, plan })
    expect(result.successCount).toBe(1)
    expect(result.errorCount).toBe(0)

    const transactions = new TransactionRepository(database, ids, clock)
    const posted = await transactions.listByLedger(ledger.id)
    const refund = posted.find((t) => t.type === 'refund')
    expect(refund).toBeTruthy()
    expect(refund?.amountMinor).toBe(8800)
    expect(refund?.merchant).toBe('信用卡返现')
  })

  it('auto-creates unmatched accounts and categories using the account catalog', async () => {
    const { database, ledger, bank, food, service } = await setupLedger()
    const plan = await service.previewCsv({
      ledgerId: ledger.id,
      fileName: 'auto-create.csv',
      content:
        'date,amount,type,account,category\n2026-08-01,5.00,支出,工资卡,餐饮\n2026-08-02,3.50,支出,余额宝,外卖',
      fieldMapping: [
        { systemField: 'date', columnIndex: 0 },
        { systemField: 'amount', columnIndex: 1 },
        { systemField: 'type', columnIndex: 2 },
        { systemField: 'sourceAccount', columnIndex: 3 },
        { systemField: 'category', columnIndex: 4 },
      ],
      accountMappings: [{ rawName: '工资卡', accountId: bank.id }],
      categoryMappings: [{ rawName: '餐饮', categoryId: food.id }],
    })

    expect(plan.validRows).toHaveLength(2)
    expect(plan.errors).toHaveLength(0)
    expect(plan.pendingAccountCreations).toHaveLength(1)
    expect(plan.pendingAccountCreations[0]?.rawName).toBe('余额宝')
    expect(plan.pendingAccountCreations[0]?.accountType).toBe('platform')
    expect(plan.pendingCategoryCreations).toHaveLength(1)
    expect(plan.pendingCategoryCreations[0]?.rawName).toBe('外卖')
    expect(plan.pendingCategoryCreations[0]?.kind).toBe('expense')

    const result = await service.executeImport({ ledgerId: ledger.id, plan })
    expect(result.successCount).toBe(2)

    const accounts = await new AccountRepository(database).listByLedger(ledger.id)
    const yuebao = accounts.find((account) => account.name === '余额宝')
    expect(yuebao?.type).toBe('platform')

    const categories = await new CategoryRepository(database).listByLedger(ledger.id)
    const takeaway = categories.find((category) => category.name === '外卖')
    expect(takeaway?.kind).toBe('expense')
  })

  it('recognizes 还款 and 债务-借出 types as transfers with arrow-split and same-account handling', async () => {
    const { database, ledger, bank, service } = await setupLedger()
    const plan = await service.previewCsv({
      ledgerId: ledger.id,
      fileName: 'qianji-export.csv',
      content:
        '时间,类型,金额,账户1,账户2\n2026-07-22 14:14:24,还款,125.90,中信银行,招商银行\n2026-07-22 14:13:57,还款,45.78,工资卡,工资卡\n2026-03-19 13:25:42,债务-借出,2000.00,工资卡->杨浩,',
      fieldMapping: [
        { systemField: 'date', columnIndex: 0 },
        { systemField: 'type', columnIndex: 1 },
        { systemField: 'amount', columnIndex: 2 },
        { systemField: 'sourceAccount', columnIndex: 3 },
        { systemField: 'targetAccount', columnIndex: 4 },
      ],
      accountMappings: [
        { rawName: '工资卡', accountId: bank.id },
        { rawName: '中信银行', accountId: bank.id },
      ],
    })

    expect(plan.errors).toHaveLength(0)
    expect(plan.validRows).toHaveLength(3)

    // 还款 → 中信银行→招商银行（不同账户转账）
    const row1 = plan.validRows[0]!
    expect(row1.raw.kind).toBe('transfer')
    expect(row1.sourceAccountId).toBe(bank.id)

    // 还款 → 工资卡→工资卡同名，转入方自动改为"工资卡信用卡"
    const row2 = plan.validRows[1]!
    expect(row2.raw.kind).toBe('transfer')
    expect(row2.raw.targetAccountName).toBe('工资卡信用卡')

    // 债务-借出 → "工资卡->杨浩"拆分为 工资卡→杨浩
    const row3 = plan.validRows[2]!
    expect(row3.raw.kind).toBe('transfer')
    expect(row3.raw.transferPurpose).toBe('loan_out')
    expect(row3.raw.sourceAccountName).toBe('工资卡')
    expect(row3.raw.targetAccountName).toBe('杨浩')
    expect(row3.sourceAccountId).toBe(bank.id)
    // 杨浩应为 pending 自动创建
    const receivable = plan.pendingAccountCreations.find((p) => p.rawName === '杨浩')
    expect(receivable?.accountType).toBe('receivable')
    expect(receivable?.inferredName).toBe('杨浩')
    // 工资卡信用卡应为 pending 自动创建（credit_card 类型）
    const creditCard = plan.pendingAccountCreations.find((p) => p.rawName === '工资卡信用卡')
    expect(creditCard?.accountType).toBe('credit_card')
    expect(creditCard?.inferredName).toBe('工资卡信用卡')

    const result = await service.executeImport({ ledgerId: ledger.id, plan })
    expect(result.successCount).toBe(3)

    const importedAccounts = await new AccountRepository(database).listBalances(ledger.id)
    const yangHao = importedAccounts.find((account) => account.name === '杨浩')
    expect(yangHao?.type).toBe('receivable')
    expect(yangHao?.balanceMinor).toBe(200_000)
    expect(summarizeAssets(importedAccounts).lentMinor).toBe(200_000)

    const loanTransactions = await database.query<{ type: string }>(
      `SELECT type FROM transactions WHERE amount_minor = 200000`,
    )
    expect(loanTransactions).toEqual([{ type: 'loan_out' }])
  })

  it('infers kind from account count when type is unrecognized', async () => {
    const { ledger, bank, service } = await setupLedger()
    const plan = await service.previewCsv({
      ledgerId: ledger.id,
      fileName: 'unknown-types.csv',
      content:
        '时间,类型,金额,账户1,账户2\n2026-07-22 14:14:24,余额调整,100.00,工资卡,微信\n2026-07-22 14:13:57,代付,50.00,工资卡,',
      fieldMapping: [
        { systemField: 'date', columnIndex: 0 },
        { systemField: 'type', columnIndex: 1 },
        { systemField: 'amount', columnIndex: 2 },
        { systemField: 'sourceAccount', columnIndex: 3 },
        { systemField: 'targetAccount', columnIndex: 4 },
      ],
      accountMappings: [
        { rawName: '工资卡', accountId: bank.id },
        { rawName: '微信', accountId: 'account_wechat' },
      ],
    })

    expect(plan.errors).toHaveLength(0)
    expect(plan.validRows).toHaveLength(2)

    // "余额调整"有两个不同账户 → 推断为转账
    const row1 = plan.validRows[0]!
    expect(row1.raw.kind).toBe('transfer')
    expect(row1.raw.typeInferred).toBe(true)

    // "代付"只有一个账户 → 根据金额正负推断为收入（金额为正）
    const row2 = plan.validRows[1]!
    expect(row2.raw.kind).toBe('income')
    expect(row2.raw.typeInferred).toBe(true)
  })
})

describe('ImportService.voidBatch', () => {
  it('voids a batch and marks its transactions as void', async () => {
    const { database, ids, ledger, bank, food, service } = await setupLedger()
    const plan = await service.previewCsv({
      ledgerId: ledger.id,
      fileName: 'void.csv',
      content: 'date,amount,account,category\n2026-08-01,5.00,工资卡,餐饮',
      fieldMapping: [
        { systemField: 'date', columnIndex: 0 },
        { systemField: 'amount', columnIndex: 1 },
        { systemField: 'sourceAccount', columnIndex: 2 },
        { systemField: 'category', columnIndex: 3 },
      ],
      accountMappings: [{ rawName: '工资卡', accountId: bank.id }],
      categoryMappings: [{ rawName: '餐饮', categoryId: food.id }],
    })

    const result = await service.executeImport({ ledgerId: ledger.id, plan })
    expect(result.successCount).toBe(1)

    const voidedIds = await service.voidBatch(ledger.id, result.batchId)
    expect(voidedIds).toHaveLength(1)

    const transactions = new TransactionRepository(database, ids, clock)
    const all = await transactions.listByLedger(ledger.id)
    expect(all[0]?.status).toBe('void')

    const batch = await service.getBatch(result.batchId)
    expect(batch?.status).toBe('void')
  })

  it('refuses to void an already voided batch', async () => {
    const { ledger, bank, food, service } = await setupLedger()
    const plan = await service.previewCsv({
      ledgerId: ledger.id,
      fileName: 'void-twice.csv',
      content: 'date,amount,account,category\n2026-08-01,5.00,工资卡,餐饮',
      fieldMapping: [
        { systemField: 'date', columnIndex: 0 },
        { systemField: 'amount', columnIndex: 1 },
        { systemField: 'sourceAccount', columnIndex: 2 },
        { systemField: 'category', columnIndex: 3 },
      ],
      accountMappings: [{ rawName: '工资卡', accountId: bank.id }],
      categoryMappings: [{ rawName: '餐饮', categoryId: food.id }],
    })

    const result = await service.executeImport({ ledgerId: ledger.id, plan })
    await service.voidBatch(ledger.id, result.batchId)
    await expect(service.voidBatch(ledger.id, result.batchId)).rejects.toThrow('已撤销')
  })

  it('lists import batches scoped to a ledger', async () => {
    const { ledger, bank, food, service } = await setupLedger()
    const plan = await service.previewCsv({
      ledgerId: ledger.id,
      fileName: 'list.csv',
      content: 'date,amount,account,category\n2026-08-01,5.00,工资卡,餐饮',
      fieldMapping: [
        { systemField: 'date', columnIndex: 0 },
        { systemField: 'amount', columnIndex: 1 },
        { systemField: 'sourceAccount', columnIndex: 2 },
        { systemField: 'category', columnIndex: 3 },
      ],
      accountMappings: [{ rawName: '工资卡', accountId: bank.id }],
      categoryMappings: [{ rawName: '餐饮', categoryId: food.id }],
    })
    const result = await service.executeImport({ ledgerId: ledger.id, plan })

    const batches = await service.listBatches(ledger.id)
    expect(batches).toHaveLength(1)
    expect(batches[0]?.id).toBe(result.batchId)
    expect(batches[0]?.source).toBe('csv')
    expect(batches[0]?.successCount).toBe(1)
    expect(batches[0]?.fileName).toBe('list.csv')
  })
})
