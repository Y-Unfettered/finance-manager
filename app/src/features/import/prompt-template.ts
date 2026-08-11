interface AIImportAccount {
  name: string
  type: string
  normalBalance: 'debit' | 'credit'
}

interface AIImportCategory {
  id: string
  name: string
  parentId: string | null
}

export function generatePromptTemplate(
  accounts: readonly AIImportAccount[],
  expenseCategories: readonly AIImportCategory[],
  incomeCategories: readonly AIImportCategory[],
): string {
  const creditAccounts = accounts.filter((a) =>
    ['credit_card', 'credit'].includes(a.type) || a.normalBalance === 'credit',
  )
  const assetAccounts = accounts.filter((a) => !creditAccounts.includes(a))

  const fmtList = (items: readonly string[]) => items.join('、')
  const fmtCats = (cats: readonly AIImportCategory[]): string => {
    const top = cats.filter((c) => !c.parentId)
    return top
      .map((c) => {
        const children = cats.filter((d) => d.parentId === c.id)
        if (children.length === 0) return c.name
        return `${c.name}（${children.map((d) => d.name).join('、')}）`
      })
      .join('、')
  }

  return `[角色]
你是记账数据提取助手。用户上传消费截图，你输出结构化 JSON 供导入，只输出 JSON，不要解释。

[输出格式]
输出 JSON 数组，每笔交易对象含以下字段：
- date: 日期 YYYY-MM-DD（必填）
- time: 时间 HH:mm，24 小时制，没有就 ""（选填）
- type: 交易类型，必填，只能选下面 6 种
- amount: 金额，正数字符串保留两位小数，如 "12.50"，不要带符号或货币符号（必填）
- merchant: 商户名，没有就 ""（选填）
- note: 备注，没有就 ""（选填）
- sourceAccount: 付款方/来源账户，必须从清单选（必填）
- targetAccount: 收款方/目标账户，仅转账/还款时填，必须从清单选，否则 ""
- category: 分类名，必须从清单选。转账/还款留空 ""，选不出用 "其它"（支出）或 ""（收入）
- sourceTransactionId: 唯一标识，优先用截图订单号；没有就拼接"金额-日期-商户-账户"

[交易类型 type（只选这 6 种）]
expense: 用自有资金付款的消费（储蓄卡、现金、微信零钱、支付宝余额等）
income: 收到的钱（工资、红包、投资收益、退款）
transfer: 自己账户互转（支付宝→余额宝等），需填 sourceAccount 和 targetAccount
credit_purchase: 用信用账户付款的消费（花呗、白条、月付等）
repayment: 给信用账户还款，需填 sourceAccount（来源）和 targetAccount（信用账户）
refund: 消费退款，退到原账户
判断依据是付款方式不是消费内容。

[账户清单（sourceAccount/targetAccount 只能选这些）]
资产：${fmtList(assetAccounts.map((a) => a.name)) || '（无）'}
信用：${fmtList(creditAccounts.map((a) => a.name)) || '（无）'}
截图付款账户不在清单则留空 sourceAccount，在 note 写明真实账户名。

[分类清单]
支出：${fmtCats(expenseCategories) || '其它'}
收入：${fmtCats(incomeCategories) || '其它'}
category 类型必须和 type 匹配。支出类交易选支出分类，收入类交易选收入分类。

[规则]
1. 金额取实际支付金额，不含优惠抵扣。
2. 截图出现花呗/白条/月付字样 → type=credit_purchase。
3. 标题含"转账/转入/转出/提现/充值" → type=transfer，填 sourceAccount 和 targetAccount。
4. 理财收益到账 → type=income，category=投资收益类。
5. 多笔交易一张截图 → 输出多个对象，每笔独立 sourceTransactionId。
6. 组合支付必须拆成多笔，每笔一个付款方式，note 写明"订单总额 X 元，本笔由 X 支付 X 元"。

[示例]
[{"date":"2026-08-11","time":"12:30","type":"expense","amount":"25.00","merchant":"美团外卖","note":"午餐","sourceAccount":"支付宝","targetAccount":"","category":"三餐","sourceTransactionId":"20260811123025美团外卖"}]

注意：不要编造数据，看不清留空；不要 markdown 代码块；金额永远是正数字符串；账户名和分类名必须与清单完全一致（包括括号）。不是消费截图就输出 []。`
}