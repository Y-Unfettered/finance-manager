import { getLogger } from '@/features/debug/app-logger'
import { inject, type InjectionKey } from 'vue'

const log = getLogger('import')

import {
  createCreditIncome,
  createCreditPurchase,
  createExpense,
  createIncome,
  createLoanOut,
  createRepayBorrowing,
  createTransfer,
  type CategoryPostingRef,
} from '@/domain/accounting'
import {
  normalBalanceForAccountType,
  type AccountPostingRef,
  type AccountType,
} from '@/domain/accounts'
import type { AccountRecord, CategoryRecord } from '@/domain/entities'
import { parseCnyInputToMinor } from '@/domain/money'
import type { Clock } from '@/domain/time'
import type { IdGenerator } from '@/domain/identity'
import type { SqliteExecutor } from '@/db/core/types'
import { AccountRepository } from '@/db/repositories/account-repository'
import { CategoryRepository } from '@/db/repositories/category-repository'
import { ImportBatchRepository, type ImportBatchRecord } from '@/db/repositories/import-batch-repository'
import { TransactionRepository } from '@/db/repositories/transaction-repository'

import { parseCsv, detectDelimiter } from './csv-parser'
import type {
  AccountNameMapping,
  CategoryNameMapping,
  CsvFieldMapping,
  DuplicateImportRow,
  ExecutionError,
  ImportError,
  ImportPlan,
  ImportResult,
  ImportSourceType,
  ImportSystemField,
  ImportTransactionKind,
  ParsedImportRow,
  PendingAccountCreation,
  PendingCategoryCreation,
  ResolvedImportRow,
} from './import-types'

export interface ImportServiceContext {
  readonly database: SqliteExecutor
  readonly clock: Clock
  readonly ids: IdGenerator
}

export interface PreviewCsvInput {
  readonly ledgerId: string
  readonly fileName: string
  readonly content: string
  readonly fieldMapping: readonly CsvFieldMapping[]
  readonly accountMappings?: readonly AccountNameMapping[]
  readonly categoryMappings?: readonly CategoryNameMapping[]
  readonly source?: ImportSourceType
}

export interface PreviewRowsInput {
  readonly ledgerId: string
  readonly fileName: string
  readonly source: ImportSourceType
  readonly headers: string[]
  readonly rows: string[][]
  readonly parseErrors?: readonly string[]
  readonly fieldMapping: readonly CsvFieldMapping[]
  readonly accountMappings?: readonly AccountNameMapping[]
  readonly categoryMappings?: readonly CategoryNameMapping[]
  /** 未匹配的账户/分类是否自动创建（默认 true）。 */
  readonly autoCreate?: boolean
}

export interface ExecuteImportInput {
  readonly ledgerId: string
  readonly plan: ImportPlan
  readonly note?: string
}

const REQUIRED_FIELDS: readonly ImportSystemField[] = ['amount', 'date']

export class ImportService {
  private readonly batches: ImportBatchRepository
  private readonly transactions: TransactionRepository
  private readonly accounts: AccountRepository
  private readonly categories: CategoryRepository

  constructor(
    private readonly ctx: ImportServiceContext,
    transactions?: TransactionRepository,
  ) {
    this.batches = new ImportBatchRepository(ctx.database)
    this.transactions = transactions ?? new TransactionRepository(ctx.database, ctx.ids, ctx.clock)
    this.accounts = new AccountRepository(ctx.database)
    this.categories = new CategoryRepository(ctx.database)
  }

  async previewCsv(input: PreviewCsvInput): Promise<ImportPlan> {
    const delimiter = detectDelimiter(input.content)
    const parsed = parseCsv(input.content, { delimiter })
    log.debug('previewCsv: start', { fileName: input.fileName, rowCount: parsed.rows.length })
    const plan = await this.previewRows({
      ledgerId: input.ledgerId,
      fileName: input.fileName,
      source: input.source ?? 'csv',
      headers: parsed.headers,
      rows: parsed.rows,
      parseErrors: parsed.errors,
      fieldMapping: input.fieldMapping,
      accountMappings: input.accountMappings,
      categoryMappings: input.categoryMappings,
    })
    log.info('previewCsv: done', {
      validRows: plan.validRows.length,
      errors: plan.errors.length,
      unmatchedAccounts: plan.unmatchedAccounts.length,
    })
    return plan
  }

  async previewRows(input: PreviewRowsInput): Promise<ImportPlan> {
    const { headers, rows, source } = input
    const autoCreate = input.autoCreate ?? true
    const errors: ImportError[] = [
      ...(input.parseErrors ?? []).map((message) => ({ rowIndex: 0, message })),
    ]
    if (input.parseErrors && input.parseErrors.length > 0) {
      log.info('previewRows: parseErrors', { count: input.parseErrors.length, fileName: input.fileName })
    }

    if (headers.length === 0) {
      return emptyPlan(input.fileName, source, rows, input.fieldMapping, errors, '文件为空或无表头')
    }

    const missingFields = REQUIRED_FIELDS.filter(
      (field) => !input.fieldMapping.some((mapping) => mapping.systemField === field),
    )
    if (missingFields.length > 0) {
      errors.push({
        rowIndex: 0,
        message: `字段映射缺少必填项：${missingFields.join(', ')}`,
      })
      return emptyPlan(input.fileName, source, rows, input.fieldMapping, errors)
    }

    const fieldIndex = buildFieldIndex(headers, input.fieldMapping)

    // 1. 加载已有账户，按名称建立索引（手动映射优先，其次按名称匹配已有账户）
    const existingAccounts = await this.accounts.listByLedger(input.ledgerId)
    const accountByName = new Map<string, string>()
    for (const account of existingAccounts) {
      accountByName.set(account.name.trim(), account.id)
    }
    const accountMap = new Map<string, string>()
    for (const mapping of input.accountMappings ?? []) {
      accountMap.set(mapping.rawName.trim(), mapping.accountId)
    }

    // 2. 加载已有分类，按名称建立索引
    const existingCategories = await this.categories.listByLedger(input.ledgerId)
    const categoryByName = new Map<string, { categoryId: string; kind: 'expense' | 'income' }>()
    for (const category of existingCategories) {
      if (category.kind === 'expense' || category.kind === 'income') {
        categoryByName.set(category.name.trim(), {
          categoryId: category.id,
          kind: category.kind,
        })
      }
    }
    const categoryMap = new Map<string, CategoryResolution>()
    for (const mapping of input.categoryMappings ?? []) {
      const existing = categoryByName.get(mapping.rawName.trim())
      categoryMap.set(mapping.rawName.trim(), {
        categoryId: mapping.categoryId,
        kind: existing?.kind,
      })
    }

    // 3. 收集所有行中出现的未匹配账户/分类名，生成 pending 创建项
    const pendingAccounts: PendingAccountCreation[] = []
    const pendingAccountIds = new Map<string, string>() // rawName → 临时 ID
    const pendingCategories: PendingCategoryCreation[] = []
    const pendingCategoryIds = new Map<string, string>() // rawName → 临时 ID
    const unmatchedAccounts: Array<{
      rawName: string
      role: 'source' | 'target'
      candidates: Array<{ accountId: string; accountName: string }>
    }> = []

    const parsedRows: ParsedImportRow[] = []
    rows.forEach((rawRow, index) => {
      const rowIndex = index + 2
      const raw: Record<string, string> = {}
      headers.forEach((header, headerIndex) => {
        raw[header] = rawRow[headerIndex] ?? ''
      })
      const parsedRow = parseRow(raw, rowIndex, fieldIndex, headers)
      if (parsedRow instanceof ErrorRow) {
        errors.push({ rowIndex, message: parsedRow.message, rawRow: raw })
        return
      }
      parsedRows.push(parsedRow)

      if (autoCreate) {
        collectPendingAccounts(
          parsedRow,
          accountMap,
          accountByName,
          pendingAccounts,
          pendingAccountIds,
          unmatchedAccounts,
        )
        collectPendingCategories(
          parsedRow,
          categoryMap,
          categoryByName,
          pendingCategories,
          pendingCategoryIds,
        )
      }
    })

    // 4. 解析每一行（此时 accountMap/categoryMap 已含 pending 临时 ID）
    const validRows: ResolvedImportRow[] = []
    const duplicates: DuplicateImportRow[] = []
    for (const parsedRow of parsedRows) {
      const resolved = resolveRow(parsedRow, accountMap, categoryMap)
      if (resolved instanceof ErrorRow) {
        errors.push({ rowIndex: parsedRow.index, message: resolved.message })
        continue
      }
      validRows.push(resolved)
    }

    // 5. 检测指纹重复
    const sourceFingerprint = computeBatchFingerprint(input.fileName, rows)
    let duplicateWarning: string | undefined
    const existingBatch = await this.batches.findActiveByFingerprint(input.ledgerId, sourceFingerprint)
    if (existingBatch) {
      duplicateWarning = `该文件似乎已经导入过（批次 ${existingBatch.fileName}），是否继续？`
    }

    log.debug('previewRows: pending', {
      unmatchedAccounts: unmatchedAccounts.length,
      pendingAccountCreations: pendingAccounts.length,
      pendingCategoryCreations: pendingCategories.length,
    })

    return {
      fileName: input.fileName,
      source,
      totalRows: rows.length,
      validRows,
      errors,
      duplicates,
      fieldMapping: input.fieldMapping,
      sourceFingerprint,
      pendingAccountCreations: pendingAccounts,
      pendingCategoryCreations: pendingCategories,
      duplicateWarning,
      existingActiveBatch: existingBatch
        ? { id: existingBatch.id, fileName: existingBatch.fileName, createdAt: existingBatch.createdAt }
        : undefined,
      unmatchedAccounts,
    }
  }

  private async loadCategoryKindIndex(
    ledgerId: string,
  ): Promise<Map<string, 'expense' | 'income'>> {
    const categories = await this.categories.listByLedger(ledgerId)
    const index = new Map<string, 'expense' | 'income'>()
    for (const category of categories) {
      if (category.kind === 'expense' || category.kind === 'income') {
        index.set(category.id, category.kind)
      }
    }
    return index
  }

  private async createPendingAccounts(
    ledgerId: string,
    pending: readonly PendingAccountCreation[],
    idMap: Map<string, string>,
  ): Promise<void> {
    for (const item of pending) {
      const tempId = `pending:account:${item.rawName}`
      const now = this.ctx.clock.nowIso()
      const accountType = item.accountType as AccountType
      const record: AccountRecord = {
        id: this.ctx.ids.next('account'),
        ledgerId,
        name: item.inferredName,
        type: accountType,
        normalBalance: normalBalanceForAccountType(accountType),
        currency: 'CNY',
        institution: item.institution,
        createdAt: now,
        updatedAt: now,
      }
      await this.accounts.create(record)
      idMap.set(tempId, record.id)
    }
  }

  private async createPendingCategories(
    ledgerId: string,
    pending: readonly PendingCategoryCreation[],
    idMap: Map<string, string>,
  ): Promise<void> {
    for (const item of pending) {
      const tempId = `pending:category:${item.rawName}`
      const now = this.ctx.clock.nowIso()
      const record: CategoryRecord = {
        id: this.ctx.ids.next('category'),
        ledgerId,
        kind: item.kind,
        name: item.rawName,
        sortOrder: 99,
        createdAt: now,
        updatedAt: now,
      }
      await this.categories.create(record)
      idMap.set(tempId, record.id)
    }
  }

  private resolvePendingIds(
    row: ResolvedImportRow,
    accountIdMap: Map<string, string>,
    categoryIdMap: Map<string, string>,
  ): ResolvedImportRow {
    const sourceAccountId = resolveId(row.sourceAccountId, accountIdMap)
    const targetAccountId = resolveId(row.targetAccountId, accountIdMap)
    const categoryId = resolveId(row.categoryId, categoryIdMap)
    return {
      ...row,
      sourceAccountId,
      targetAccountId,
      categoryId,
    }
  }

  async checkBatchDuplicate(ledgerId: string, plan: ImportPlan): Promise<boolean> {
    const existing = await this.batches.findActiveByFingerprint(ledgerId, plan.sourceFingerprint)
    log.info('checkBatchDuplicate: checked', { duplicate: Boolean(existing), ledgerId })
    return Boolean(existing)
  }

  async executeImport(input: ExecuteImportInput): Promise<ImportResult> {
    const { ledgerId, plan, note } = input
    log.debug('executeImport: start', {
      ledgerId,
      plan: { validRows: plan.validRows.length, errorRows: plan.errors.length },
    })
    try {
      if (plan.validRows.length === 0) {
        return {
          batchId: '',
          successCount: 0,
          duplicateCount: 0,
          errorCount: plan.errors.length,
          importedTransactionIds: [],
          executionErrors: [],
        }
      }

      // 检查该文件指纹是否已有活跃的导入批次，防止重复导入
      const existingBatch = await this.batches.findActiveByFingerprint(ledgerId, plan.sourceFingerprint)
      if (existingBatch) {
        throw new Error(
          `该数据已在此前导入过（批次：${existingBatch.fileName ?? '未知'}，` +
          `导入时间：${existingBatch.createdAt}），不允许重复导入。` +
          `如需重新导入，请先撤销旧的导入批次。`,
        )
      }

      // 创建 pending 账户与分类，建立 临时 ID → 真实 ID 映射
      const accountIdMap = new Map<string, string>()
      const categoryIdMap = new Map<string, string>()
      await this.createPendingAccounts(ledgerId, plan.pendingAccountCreations, accountIdMap)
      await this.createPendingCategories(ledgerId, plan.pendingCategoryCreations, categoryIdMap)

      const batchId = this.ctx.ids.next('import_batch')
      const now = this.ctx.clock.nowIso()
      await this.batches.create({
        id: batchId,
        ledgerId,
        source: plan.source,
        fileName: plan.fileName,
        parserVersion: 'csv-v1',
        fieldMappingJson: JSON.stringify(plan.fieldMapping),
        sourceFingerprint: plan.sourceFingerprint,
        recordCount: plan.totalRows,
        note,
        createdAt: now,
      })

      const importedTransactionIds: string[] = []
      const executionErrors: ExecutionError[] = []
      let successCount = 0
      let errorCount = plan.errors.length

      for (const row of plan.validRows) {
        try {
          const resolved = this.resolvePendingIds(row, accountIdMap, categoryIdMap)
          const transactionId = await this.createTransactionForRow(resolved, ledgerId)
          await this.batches.attachTransaction(transactionId, batchId, this.ctx.clock.nowIso())
          importedTransactionIds.push(transactionId)
          successCount += 1
        } catch (error) {
          executionErrors.push({
            rowIndex: row.index,
            message: error instanceof Error ? error.message : String(error),
          })
          errorCount += 1
        }
      }

      await this.batches.updateCounters(
        batchId,
        {
          successCount,
          duplicateCount: 0,
          errorCount,
        },
        this.ctx.clock.nowIso(),
      )

      if (executionErrors.length > 0) {
        const validRowsSnapshot = plan.validRows
          .filter((r) => executionErrors.some((e) => e.rowIndex === r.index))
          .map((r) => {
            const d = new Date(r.raw.occurredAt)
            const y = d.getFullYear()
            const m = String(d.getMonth() + 1).padStart(2, '0')
            const day = String(d.getDate()).padStart(2, '0')
            const hh = String(d.getHours()).padStart(2, '0')
            const mm = String(d.getMinutes()).padStart(2, '0')
            return {
              index: r.index,
              date: `${y}-${m}-${day}`,
              time: `${hh}:${mm}`,
              amountMinor: r.raw.amountMinor,
              kind: r.raw.kind,
              sourceAccount: r.raw.sourceAccountName,
              targetAccount: r.raw.targetAccountName,
              category: r.raw.categoryName,
              merchant: r.raw.merchant,
              note: r.raw.note,
              sourceTransactionId: r.raw.sourceTransactionId,
            }
          })
        const payload = {
          executionErrors,
          preflightErrors: plan.errors,
          failedValidRows: validRowsSnapshot,
        }
        try {
          await this.batches.saveExecutionErrors(batchId, JSON.stringify(payload))
        } catch {
          // 持久化失败详情失败不影响主流程，静默忽略
        }
      } else if (plan.errors.length > 0) {
        // 没有执行阶段错误，但有前验（预览）阶段错误，也存一份，避免 UI 完全看不见
        try {
          await this.batches.saveExecutionErrors(
            batchId,
            JSON.stringify({ executionErrors: [], preflightErrors: plan.errors, failedValidRows: [] }),
          )
        } catch {
          // 静默忽略
        }
      }

    log.info('executeImport: success', {
      batchId,
      inserted: successCount,
      skipped: 0,
      errorRows: executionErrors.length,
    })
    return {
      batchId,
      successCount,
      duplicateCount: 0,
      errorCount,
      importedTransactionIds,
      executionErrors,
    }
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error))
      log.error('executeImport: failed', { error: e.message, context: { ledgerId, fileName: plan.fileName } })
      throw e
    }
  }

  async voidBatch(ledgerId: string, batchId: string): Promise<string[]> {
    try {
      log.debug('voidBatch: start', { batchId, ledgerId })
      const batch = await this.batches.findById(batchId)
      if (!batch || batch.ledgerId !== ledgerId) {
        throw new Error('导入批次不存在')
      }
      if (batch.status === 'void') {
        throw new Error('导入批次已撤销')
      }
      const txIds = await this.batches.voidBatch(batchId, this.ctx.clock.nowIso())
      log.info('voidBatch: voided', { batchId, transactionCount: txIds.length })
      return txIds
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error))
      log.error('voidBatch: failed', { error: e.message, batchId })
      throw e
    }
  }

  async listBatches(ledgerId: string) {
    return this.batches.listByLedger(ledgerId)
  }

  async listBatchesWithSummary(ledgerId: string): Promise<
    Array<{ batch: ImportBatchRecord; summary: string }>
  > {
    const batches = await this.batches.listByLedger(ledgerId)
    const results: Array<{ batch: ImportBatchRecord; summary: string }> = []
    for (const batch of batches) {
      let summary = ''
      try {
        const items = await this.batches.listBatchActivity(batch.id)
        const posted = items.filter((i) => i.status === 'posted')
        const labels = posted.slice(0, 3).map((i) => {
          const label = i.merchant ?? i.counterparty ?? i.note
          return label ? label.trim() : ''
        }).filter((s) => s.length > 0)
        if (labels.length > 0) {
          summary = labels.join('、')
          if (posted.length > 3) {
            summary += `等 ${posted.length} 笔`
          }
        } else if (items.length > 0) {
          // 没有可读摘要但有交易记录（可能全 void）
          summary = `${items.length} 笔交易（已撤销）`
        }
      } catch (error) {
        console.error('listBatchesWithSummary detail failed', error)
      }
      results.push({ batch, summary })
    }
    return results
  }

  async getBatch(batchId: string) {
    return this.batches.findById(batchId)
  }

  async getBatchDetail(ledgerId: string, batchId: string) {
    const batch = await this.batches.findById(batchId)
    if (!batch || batch.ledgerId !== ledgerId) {
      throw new Error('导入批次不存在')
    }
    const transactions = await this.batches.listBatchActivity(batchId)
    let executionErrors: {
      rowIndex: number
      message: string
      row?: Record<string, unknown>
    }[] = []
    let preflightErrors: {
      rowIndex: number
      message: string
    }[] = []
    if (batch.executionErrorsJson) {
      try {
        const parsed = JSON.parse(batch.executionErrorsJson) as {
          executionErrors?: { rowIndex: number; message: string }[]
          preflightErrors?: { rowIndex: number; message: string }[]
          failedValidRows?: Array<Record<string, unknown> & { index: number }>
        }
        const rowByIndex = new Map<number, Record<string, unknown>>()
        for (const r of parsed.failedValidRows ?? []) {
          rowByIndex.set(r.index, r as Record<string, unknown>)
        }
        executionErrors = (parsed.executionErrors ?? []).map((e) => ({
          ...e,
          row: rowByIndex.get(e.rowIndex),
        }))
        preflightErrors = parsed.preflightErrors ?? []
      } catch {
        // 解析失败就当没有
      }
    }
    return {
      batch,
      transactions,
      executionErrors,
      preflightErrors,
    }
  }

  async listAccountsForMapping(ledgerId: string) {
    return this.accounts.listByLedger(ledgerId)
  }

  async createAccountForImport(
    ledgerId: string,
    name: string,
    accountType: string = 'platform',
  ): Promise<string> {
    const existing = await this.accounts.listByLedger(ledgerId)
    const match = existing.find((a) => a.name === name)
    if (match) return match.id
    const now = this.ctx.clock.nowIso()
    const record: AccountRecord = {
      id: this.ctx.ids.next('account'),
      ledgerId,
      name,
      type: accountType as AccountType,
      normalBalance: normalBalanceForAccountType(accountType as AccountType),
      currency: 'CNY',
      createdAt: now,
      updatedAt: now,
    }
    await this.accounts.create(record)
    log.info('createAccountForImport: created', { name, accountId: record.id })
    return record.id
  }

  async listCategoriesForMapping(ledgerId: string) {
    return this.categories.listByLedger(ledgerId)
  }

  private async createTransactionForRow(row: ResolvedImportRow, ledgerId: string): Promise<string> {
    const occurredAt = row.raw.occurredAt
    if (row.raw.kind === 'expense') {
      return this.createExpenseEntry(ledgerId, row, occurredAt)
    }
    if (row.raw.kind === 'income') {
      return this.createIncomeEntry(ledgerId, row, occurredAt)
    }
    return this.createTransferEntry(ledgerId, row, occurredAt)
  }

  private async resolveAccountPostingRef(accountId: string): Promise<AccountPostingRef> {
    const ref = await this.accounts.findPostingRef(accountId)
    if (!ref) throw new Error(`账户不存在：${accountId}`)
    return ref
  }

  private async resolveCategoryPostingRef(categoryId: string): Promise<CategoryPostingRef> {
    const ref = await this.categories.findPostingRef(categoryId)
    if (!ref) throw new Error(`分类不存在：${categoryId}`)
    return ref
  }

  private async createExpenseEntry(
    ledgerId: string,
    row: ResolvedImportRow,
    occurredAt: string,
  ): Promise<string> {
    if (!row.sourceAccountId) throw new Error('支出缺少账户')
    if (!row.categoryId) throw new Error('支出缺少分类')
    const [paymentAccount, category] = await Promise.all([
      this.resolveAccountPostingRef(row.sourceAccountId),
      this.resolveCategoryPostingRef(row.categoryId),
    ])
    // 信用卡/负债账户不能直接支出，改用 credit_purchase 类型
    if (paymentAccount.normalBalance === 'credit') {
      const draft = createCreditPurchase({
        amountMinor: row.raw.amountMinor,
        occurredAt,
        liabilityAccount: paymentAccount,
        category,
        merchant: row.raw.merchant,
        counterparty: row.raw.merchant,
        note: row.raw.note,
      })
      const created = await this.transactions.create(ledgerId, draft)
      return created.id
    }
    const draft = createExpense({
      amountMinor: row.raw.amountMinor,
      occurredAt,
      paymentAccount,
      category,
      merchant: row.raw.merchant,
      counterparty: row.raw.merchant,
      note: row.raw.note,
    })
    const created = await this.transactions.create(ledgerId, draft)
    return created.id
  }

  private async createIncomeEntry(
    ledgerId: string,
    row: ResolvedImportRow,
    occurredAt: string,
  ): Promise<string> {
    if (!row.sourceAccountId) throw new Error('收入缺少账户')
    if (!row.categoryId) throw new Error('收入缺少分类')
    const [depositAccount, category] = await Promise.all([
      this.resolveAccountPostingRef(row.sourceAccountId),
      this.resolveCategoryPostingRef(row.categoryId),
    ])
    // 信用卡/负债账户不能直接收收入，改用 refund 类型（如信用卡退款、返现）
    if (depositAccount.normalBalance === 'credit') {
      const draft = createCreditIncome({
        amountMinor: row.raw.amountMinor,
        occurredAt,
        liabilityAccount: depositAccount,
        category,
        merchant: row.raw.merchant,
        counterparty: row.raw.merchant,
        note: row.raw.note,
      })
      const created = await this.transactions.create(ledgerId, draft)
      return created.id
    }
    const draft = createIncome({
      amountMinor: row.raw.amountMinor,
      occurredAt,
      depositAccount,
      category,
      merchant: row.raw.merchant,
      counterparty: row.raw.merchant,
      note: row.raw.note,
    })
    const created = await this.transactions.create(ledgerId, draft)
    return created.id
  }

  private async createTransferEntry(
    ledgerId: string,
    row: ResolvedImportRow,
    occurredAt: string,
  ): Promise<string> {
    if (!row.sourceAccountId || !row.targetAccountId) throw new Error('转账缺少账户')
    const [sourceAccount, targetAccount] = await Promise.all([
      this.resolveAccountPostingRef(row.sourceAccountId),
      this.resolveAccountPostingRef(row.targetAccountId),
    ])
    // 信用卡还款：source 是 debit（银行卡），target 是 credit（信用卡）
    if (sourceAccount.normalBalance === 'debit' && targetAccount.normalBalance === 'credit') {
      const draft = createRepayBorrowing({
        amountMinor: row.raw.amountMinor,
        occurredAt,
        payableAccount: targetAccount,
        sourceAccount,
        note: row.raw.note,
      })
      const created = await this.transactions.create(ledgerId, draft)
      return created.id
    }
    if (row.raw.transferPurpose === 'loan_out') {
      if (targetAccount.type !== 'receivable') {
        throw new Error('借出款的转入账户必须是应收/借出账户')
      }
      const draft = createLoanOut({
        amountMinor: row.raw.amountMinor,
        occurredAt,
        sourceAccount,
        receivableAccount: targetAccount,
        counterparty: row.raw.targetAccountName,
        note: row.raw.note,
      })
      const created = await this.transactions.create(ledgerId, draft)
      return created.id
    }
    const draft = createTransfer({
      amountMinor: row.raw.amountMinor,
      occurredAt,
      sourceAccount,
      targetAccount,
      note: row.raw.note,
    })
    const created = await this.transactions.create(ledgerId, draft)
    return created.id
  }
}

export const importServiceKey: InjectionKey<ImportService> = Symbol('importService')

export function useImportService(): ImportService | undefined {
  return inject(importServiceKey, undefined)
}

class ErrorRow {
  constructor(public readonly message: string) {}
}

function buildFieldIndex(
  headers: string[],
  mapping: readonly CsvFieldMapping[],
): Record<ImportSystemField, CsvFieldMapping | undefined> {
  const result: Partial<Record<ImportSystemField, CsvFieldMapping>> = {}
  for (const item of mapping) {
    if (item.columnIndex < 0 || item.columnIndex >= headers.length) continue
    if (!result[item.systemField]) {
      result[item.systemField] = item
    }
  }
  return result as Record<ImportSystemField, CsvFieldMapping | undefined>
}

function readFieldByIndex(
  row: Record<string, string>,
  headers: string[],
  mapping: CsvFieldMapping | undefined,
): string {
  if (!mapping) return ''
  const headerName = headers[mapping.columnIndex]
  if (!headerName) return ''
  const value = row[headerName] ?? ''
  if (value.trim() !== '') return value.trim()
  return mapping.defaultValue?.trim() ?? ''
}

function parseRow(
  raw: Record<string, string>,
  rowIndex: number,
  fieldIndex: Record<ImportSystemField, CsvFieldMapping | undefined>,
  headers: string[],
): ParsedImportRow | ErrorRow {
  const readValue = (field: ImportSystemField): string =>
    readFieldByIndex(raw, headers, fieldIndex[field])

  const amountText = readValue('amount')
  if (amountText === '') {
    return new ErrorRow(`第 ${rowIndex} 行：缺少金额`)
  }
  let amountMinor: number
  try {
    amountMinor = parseAmountToMinor(amountText)
  } catch (error) {
    return new ErrorRow(`第 ${rowIndex} 行：金额格式不正确（${(error as Error).message}）`)
  }

  const dateText = readValue('date')
  const timeText = readValue('time')
  if (dateText === '') {
    return new ErrorRow(`第 ${rowIndex} 行：缺少日期`)
  }
  const occurredAt = parseDateTime(dateText, timeText)
  if (!occurredAt) {
    return new ErrorRow(
      `第 ${rowIndex} 行：日期格式不正确（${dateText}${timeText ? ' ' + timeText : ''}）`,
    )
  }

  const typeText = readValue('type')

  let sourceAccountName = readValue('sourceAccount') || undefined
  let targetAccountName = readValue('targetAccount') || undefined
  // 处理"中信银行->杨浩"格式：当仅填了账户1且含箭头时，拆分为转出/转入
  if (sourceAccountName && !targetAccountName) {
    const parts = sourceAccountName.split(/->|→|=>|≫/)
    if (parts.length === 2 && parts[0]!.trim() && parts[1]!.trim()) {
      sourceAccountName = parts[0]!.trim()
      targetAccountName = parts[1]!.trim()
    }
  }

  // 类型识别：先尝试关键词匹配，无法识别时根据账户数量推断
  const detection = detectKind(typeText, amountMinor)
  let kind = detection.kind
  let typeInferred = detection.inferred
  if (!kind) {
    // 类型无法识别时，根据账户推断：有两个不同账户→转账，否则→支出/收入
    if (
      sourceAccountName &&
      targetAccountName &&
      sourceAccountName.trim() !== targetAccountName.trim()
    ) {
      kind = 'transfer'
    } else {
      kind = amountMinor < 0 ? 'expense' : 'income'
    }
    typeInferred = true
  }

  // 还款场景：转出/转入同名时（如中信银行→中信银行还信用卡），
  // 将转入方改为"XX信用卡"以区分借记卡和信用卡
  if (
    kind === 'transfer' &&
    sourceAccountName &&
    targetAccountName &&
    sourceAccountName === targetAccountName &&
    typeText.includes('还')
  ) {
    targetAccountName = `${targetAccountName}信用卡`
  }

  return {
    index: rowIndex,
    raw,
    kind,
    transferPurpose: detection.transferPurpose,
    typeInferred,
    amountMinor: Math.abs(amountMinor),
    occurredAt,
    merchant: readValue('merchant') || undefined,
    note: readValue('note') || undefined,
    sourceAccountName,
    targetAccountName,
    categoryName: readValue('category') || undefined,
    sourceTransactionId: readValue('sourceTransactionId') || undefined,
  }
}

interface CategoryResolution {
  readonly categoryId: string
  readonly kind: 'expense' | 'income' | undefined
}

function resolveRow(
  row: ParsedImportRow,
  accountMap: Map<string, string>,
  categoryMap: Map<string, CategoryResolution>,
): ResolvedImportRow | ErrorRow {
  let sourceAccountId: string | undefined
  let targetAccountId: string | undefined
  let categoryId: string | undefined
  let resolvedKind: ImportTransactionKind = row.kind

  if (row.kind === 'expense' || row.kind === 'income') {
    if (row.sourceAccountName) {
      sourceAccountId = accountMap.get(row.sourceAccountName.trim())
      if (!sourceAccountId) {
        return new ErrorRow(`第 ${row.index} 行：未匹配到账户「${row.sourceAccountName}」`)
      }
    } else {
      // 账户名缺失：尝试从 accountMap 中查找占位键（用户在预览中选择了账户后生成）
      const missingKey = `__missing_source_${row.index}__`
      sourceAccountId = accountMap.get(missingKey)
      if (!sourceAccountId) {
        return new ErrorRow(`第 ${row.index} 行：缺少转出账户`)
      }
    }
    if (row.categoryName) {
      const resolution = categoryMap.get(row.categoryName.trim())
      if (!resolution) {
        return new ErrorRow(`第 ${row.index} 行：未匹配到分类「${row.categoryName}」`)
      }
      categoryId = resolution.categoryId
      if (row.typeInferred && (resolution.kind === 'expense' || resolution.kind === 'income')) {
        resolvedKind = resolution.kind
      }
    }
  } else if (row.kind === 'transfer') {
    if (row.sourceAccountName) {
      sourceAccountId = accountMap.get(row.sourceAccountName.trim())
      if (!sourceAccountId) {
        return new ErrorRow(`第 ${row.index} 行：未匹配到转出账户「${row.sourceAccountName}」`)
      }
    }
    if (row.targetAccountName) {
      targetAccountId = accountMap.get(row.targetAccountName.trim())
      if (!targetAccountId) {
        return new ErrorRow(`第 ${row.index} 行：未匹配到转入账户「${row.targetAccountName}」`)
      }
    }
    // 转账只有一个账户时，降级为支出/收入
    if (!sourceAccountId || !targetAccountId) {
      if (!sourceAccountId && !targetAccountId) {
        return new ErrorRow(`第 ${row.index} 行：缺少账户信息`)
      }
      // 只有一个账户，降级为支出
      if (!sourceAccountId && targetAccountId) {
        sourceAccountId = targetAccountId
      }
      targetAccountId = undefined
      resolvedKind = 'expense'
    }
    if (sourceAccountId && targetAccountId && sourceAccountId === targetAccountId) {
      return new ErrorRow(`第 ${row.index} 行：转账的转出与转入账户不能相同`)
    }
  }

  const normalizedRow: ParsedImportRow = { ...row, kind: resolvedKind }
  const fingerprint = computeRowFingerprint(
    normalizedRow,
    sourceAccountId,
    targetAccountId,
    categoryId,
  )
  return {
    index: row.index,
    raw: normalizedRow,
    sourceAccountId,
    targetAccountId,
    categoryId,
    fingerprint,
  }
}

const TRANSFER_KEYWORDS = [
  'transfer',
  '转账',
  '转入',
  '转出',
  '还款',
  '还信用卡',
  '信用卡还款',
  '还贷',
  '借出',
  '借出款',
  '借款',
  '借给',
  '借入',
  '借入款',
]

function detectKind(
  typeText: string,
  amountMinor: number,
): {
  kind: ImportTransactionKind | undefined
  inferred: boolean
  transferPurpose?: 'loan_out'
} {
  const normalized = typeText.trim().toLowerCase()
  if (normalized === '') {
    return { kind: amountMinor < 0 ? 'expense' : 'income', inferred: true }
  }
  if (['expense', '支出', '支'].includes(normalized)) return { kind: 'expense', inferred: false }
  if (['income', '收入', '收'].includes(normalized)) return { kind: 'income', inferred: false }
  if (normalized.includes('借出') || normalized.includes('借给')) {
    return { kind: 'transfer', inferred: false, transferPurpose: 'loan_out' }
  }
  if (TRANSFER_KEYWORDS.includes(normalized)) {
    return { kind: 'transfer', inferred: false }
  }
  // 模糊匹配：类型文本包含关键词（如"信用卡还款"、"借出款"等）
  for (const keyword of TRANSFER_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return { kind: 'transfer', inferred: false }
    }
  }
  return { kind: undefined, inferred: false }
}

function parseAmountToMinor(text: string): number {
  const normalized = text.trim().replaceAll(',', '').replaceAll('¥', '').replaceAll('￥', '')
  if (normalized.startsWith('-')) {
    return -parseCnyInputToMinor(normalized.slice(1))
  }
  return parseCnyInputToMinor(normalized)
}

function parseDateTime(dateText: string, timeText: string): string | undefined {
  const date = parseDate(dateText)
  if (!date) return undefined
  if (timeText) {
    const time = parseTime(timeText)
    if (time) {
      date.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), 0)
    }
  }
  return date.toISOString()
}

function parseDate(text: string): Date | undefined {
  const normalized = text.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(normalized)
  if (iso) {
    const [, year, month, day, hour, minute, second] = iso
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      hour ? Number(hour) : 0,
      minute ? Number(minute) : 0,
      second ? Number(second) : 0,
    )
    return isValidDate(date) ? date : undefined
  }
  const slash = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(normalized)
  if (slash) {
    const [, year, month, day] = slash
    const date = new Date(Number(year), Number(month) - 1, Number(day))
    return isValidDate(date) ? date : undefined
  }
  const ymd = /^(\d{4})(\d{2})(\d{2})$/.exec(normalized)
  if (ymd) {
    const [, year, month, day] = ymd
    const date = new Date(Number(year), Number(month) - 1, Number(day))
    return isValidDate(date) ? date : undefined
  }
  return undefined
}

function parseTime(text: string): Date | undefined {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim())
  if (!match) return undefined
  const [, hour, minute, second] = match
  const date = new Date()
  date.setHours(Number(hour), Number(minute), second ? Number(second) : 0, 0)
  return date
}

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime())
}

function computeRowFingerprint(
  row: ParsedImportRow,
  sourceAccountId: string | undefined,
  targetAccountId: string | undefined,
  categoryId: string | undefined,
): string {
  if (row.sourceTransactionId) {
    return `src:${row.sourceTransactionId}`
  }
  const parts = [
    row.kind,
    row.amountMinor,
    row.occurredAt,
    row.merchant ?? '',
    row.sourceAccountName ?? '',
    row.targetAccountName ?? '',
    sourceAccountId ?? '',
    targetAccountId ?? '',
    categoryId ?? '',
  ]
  return `hash:${parts.join('|')}`
}

function computeBatchFingerprint(fileName: string, rows: string[][]): string {
  let hash = 0
  const salt = `${fileName}|${rows.length}`
  for (let i = 0; i < salt.length; i++) {
    hash = (hash * 31 + salt.charCodeAt(i)) | 0
  }
  for (const row of rows) {
    for (const value of row) {
      for (let i = 0; i < value.length; i++) {
        hash = (hash * 31 + value.charCodeAt(i)) | 0
      }
    }
  }
  return `batch:${(hash >>> 0).toString(16)}`
}

function resolveId(id: string | undefined, idMap: Map<string, string>): string | undefined {
  if (!id) return undefined
  return idMap.get(id) ?? id
}

function emptyPlan(
  fileName: string,
  source: ImportSourceType,
  rows: string[][],
  fieldMapping: readonly CsvFieldMapping[],
  errors: ImportError[],
  fallbackMessage?: string,
): ImportPlan {
  const finalErrors =
    errors.length > 0 ? errors : fallbackMessage ? [{ rowIndex: 0, message: fallbackMessage }] : []
  return {
    fileName,
    source,
    totalRows: rows.length,
    validRows: [],
    errors: finalErrors,
    duplicates: [],
    fieldMapping,
    sourceFingerprint: computeBatchFingerprint(fileName, rows),
    pendingAccountCreations: [],
    pendingCategoryCreations: [],
    unmatchedAccounts: [],
  }
}

/**
 * 收集行中未匹配的账户名，推入 unmatchedAccounts 让用户在预览中确认。
 * 已存在的账户（按名称匹配或唯一子串匹配）直接补入 accountMap。
 * 可推断类型的账户（借出方、信用卡后缀）仍加入 pendingAccountCreations。
 */
function collectPendingAccounts(
  row: ParsedImportRow,
  accountMap: Map<string, string>,
  existingByName: Map<string, string>,
  pending: PendingAccountCreation[],
  pendingIds: Map<string, string>,
  unmatchedAccounts: Array<{
    rawName: string
    role: 'source' | 'target'
    candidates: Array<{ accountId: string; accountName: string }>
  }>,
): void {
  const accounts = [
    { rawName: row.sourceAccountName, role: 'source' as const },
    { rawName: row.targetAccountName, role: 'target' as const },
  ].filter((item): item is { rawName: string; role: 'source' | 'target' } =>
    Boolean(item.rawName && item.rawName.trim()),
  )
  for (const { rawName, role } of accounts) {
    const key = rawName.trim()
    if (accountMap.has(key)) continue
    // 先尝试按名称匹配已有账户
    const existingId = existingByName.get(key)
    if (existingId) {
      accountMap.set(key, existingId)
      continue
    }
    // 子串匹配：检查 key 与已有账户名是否存在双向子串关系
    const substringMatches: Array<{ id: string; name: string }> = []
    for (const [existingName, existingAccountId] of existingByName) {
      if (key === existingName) continue
      if (key.includes(existingName) || existingName.includes(key)) {
        substringMatches.push({ id: existingAccountId, name: existingName })
      }
    }
    // 信用卡后缀例外：还款场景自动生成 "工资卡信用卡"，它与已有 "工资卡" 存在子串关系，
    // 但应视为不同账户（否则转账会变成同账户转账）；跳过该匹配
    const baseName = key.endsWith('信用卡') ? key.slice(0, -3) : ''
    const matches = substringMatches.length === 1 && baseName && substringMatches[0]!.name === baseName
      ? []
      : substringMatches
    if (matches.length === 1) {
      accountMap.set(key, matches[0]!.id)
      continue
    }
    if (matches.length > 1) {
      unmatchedAccounts.push({
        rawName: key,
        role,
        candidates: matches.map((m) => ({ accountId: m.id, accountName: m.name })),
      })
      continue
    }
    // 对可推断类型的账户（借出款转入方、还款的信用卡后缀），加入 pending 自动创建
    const canInfer =
      (role === 'target' && row.transferPurpose === 'loan_out') ||
      (key.endsWith('信用卡') && row.kind === 'transfer')
    if (canInfer && !pendingIds.has(key)) {
      const accountType: AccountType =
        role === 'target' && row.transferPurpose === 'loan_out' ? 'receivable' : 'credit_card'
      const tempId = `pending:account:${key}`
      pendingIds.set(key, tempId)
      pending.push({
        rawName: key,
        accountType,
        inferredName: key,
      })
      accountMap.set(key, tempId)
      continue
    }
    // 完全未匹配：加入 accountMap 以便行能解析，推入 unmatchedAccounts 让用户选择。
    // 不加入 pendingAccountCreations，避免导入时静默创建账户。
    const tempId = `pending:account:${key}`
    pendingIds.set(key, tempId)
    accountMap.set(key, tempId)
    const alreadyListed = unmatchedAccounts.some((u) => u.rawName === key)
    if (!alreadyListed) {
      unmatchedAccounts.push({
        rawName: key,
        role,
        candidates: [], // 无候选，用户需从所有账户中手动选择
      })
    }
  }

  // 支出/收入行缺少账户名时，生成占位条目让用户在预览中选择
  if ((row.kind === 'expense' || row.kind === 'income') && (!row.sourceAccountName || !row.sourceAccountName.trim())) {
    const missingKey = `__missing_source_${row.index}__`
    if (!accountMap.has(missingKey)) {
      const tempId = `pending:account:${missingKey}`
      accountMap.set(missingKey, tempId)
      const alreadyListed = unmatchedAccounts.some((u) => u.rawName === missingKey)
      if (!alreadyListed) {
        unmatchedAccounts.push({
          rawName: missingKey,
          role: 'source',
          candidates: [],
        })
      }
    }
  }
}

/**
 * 收集行中未匹配的分类名，生成 pending 创建项。
 * 分类类型（支出/收入）从交易类型推断：expense→支出分类，income→收入分类，transfer→不创建。
 */
function collectPendingCategories(
  row: ParsedImportRow,
  categoryMap: Map<string, CategoryResolution>,
  existingByName: Map<string, { categoryId: string; kind: 'expense' | 'income' }>,
  pending: PendingCategoryCreation[],
  pendingIds: Map<string, string>,
): void {
  if (!row.categoryName || !row.categoryName.trim()) return
  const key = row.categoryName.trim()
  if (categoryMap.has(key)) return
  // 先尝试按名称匹配已有分类
  const existing = existingByName.get(key)
  if (existing) {
    categoryMap.set(key, { categoryId: existing.categoryId, kind: existing.kind })
    return
  }
  // 未匹配，生成 pending 创建项
  if (pendingIds.has(key)) return
  if (row.kind !== 'expense' && row.kind !== 'income') return
  const tempId = `pending:category:${key}`
  pendingIds.set(key, tempId)
  categoryMap.set(key, { categoryId: tempId, kind: row.kind })
  pending.push({ rawName: key, kind: row.kind })
}
