/**
 * 捕获账户匹配（纯函数，可单测）。
 *
 * 按"支付方式/收款方式"字段的实际值（如"零钱通""中信银行储蓄卡(5441)"）
 * 动态匹配用户账户表——标准化（剥括号/剥通用卡类后缀）后互含，评分取最高。
 * 没有字段值时按来源 APP 关键词兜底。
 */

export interface AccountLike {
  id: string
  name: string
  institution?: string
  normalBalance: 'debit' | 'credit'
}

/** 标准化：剥括号段与通用卡类后缀，统一全半角（"中信银行储蓄卡(5441)"→"中信银行5441"）。 */
function normalizeName(s: string): string {
  return s
    .replace(/[（(][^)）]*[)）]/g, '')
    .replace(/储蓄卡|信用卡|银行卡|借记卡/g, '')
    .replace(/\s+/g, '')
    .trim()
}

const SOURCE_KEYWORDS: Record<string, string[]> = {
  'com.eg.android.AlipayGphone': ['支付宝余额', '余额宝', '支付宝'],
  'com.tencent.mm': ['微信（大号）', '微信零钱', '微信'],
}

export function matchCaptureAccount(
  hint: string,
  sourcePackage: string,
  accounts: AccountLike[],
  isDebitOnly: boolean,
): string | null {
  const list = isDebitOnly
    ? accounts.filter((a) => a.normalBalance === 'debit')
    : accounts
  if (list.length === 0) return null

  if (hint) {
    const h = normalizeName(hint)
    // 卡类过滤：支付方式原文自带卡类类型（"储蓄卡"/"信用卡"）——这是区分
    // 同一银行借记/贷记账户的关键信息（标准化后两者同名，必须靠原文区分）
    const hintIsCredit = /信用卡/.test(hint)
    const hintIsDebit = /储蓄卡|借记卡/.test(hint)
    // 卡号尾缀（括号里的数字，如 5441）——同行的唯一标识
    const tailOf = (s: string): string => {
      const m = /[（(](\d{3,6})[)）]/.exec(s)
      return m?.[1] ?? ''
    }
    const hintTail = tailOf(hint ?? '')

    let best: AccountLike | null = null
    let bestScore = 0
    for (const a of list) {
      // 卡类硬过滤：hint 明示"信用卡"只匹配信贷账户；明示"储蓄卡"排除信贷账户
      const aIsCredit = a.normalBalance === 'credit' || /信用卡/.test(a.name)
      if (hintIsCredit && !aIsCredit) continue
      if (hintIsDebit && aIsCredit) continue

      const n = a.name.replace(/\s+/g, '')
      const nNorm = normalizeName(a.name)
      const inst = (a.institution ?? '').replace(/\s+/g, '')
      let score = 0
      if (n === hint) score = 100
      else if (h && nNorm === h) score = 95
      else if (hint && (n.includes(hint) || hint.includes(n))) score = 90
      else if (h && (nNorm.includes(h) || h.includes(nNorm))) score = 85
      else if (h && inst && (h.includes(inst) || inst.includes(h))) score = 60
      // 尾缀加分：括号内数字一致（5441 === 5441）是同账户的强特征，同分时决胜
      const aTail = tailOf(a.name)
      if (hintTail && aTail && hintTail === aTail) score += 5
      if (score > bestScore) {
        bestScore = score
        best = a
      }
    }
    if (best) return best.id
  }

  // 来源 APP 关键词兜底：具体词（支付宝余额）先于宽泛词（支付宝）
  const keywords = SOURCE_KEYWORDS[sourcePackage]
  if (keywords) {
    for (const kw of keywords) {
      const byPkg = list.find((a) => a.name.includes(kw))
      if (byPkg) return byPkg.id
    }
    for (const kw of keywords) {
      if (kw.length < 3) continue
      const byPkg = list.find((a) => (a.institution ?? '').includes(kw))
      if (byPkg) return byPkg.id
    }
  }
  return null
}
