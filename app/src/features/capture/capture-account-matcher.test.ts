import { matchCaptureAccount, type AccountLike } from './capture-account-matcher'

// 取自用户真实账户表（2026-10-31）
const ACCOUNTS: AccountLike[] = [
  { id: 'acc_zhongxin', name: '中信银行（5441）', normalBalance: 'debit', institution: '中信银行' },
  { id: 'acc_chengdu', name: '成都银行（0652）', normalBalance: 'debit', institution: '成都银行' },
  { id: 'acc_zhaoshang', name: '招商银行', normalBalance: 'debit', institution: '招商银行' },
  { id: 'acc_zfb', name: '支付宝余额', normalBalance: 'debit', institution: '支付宝' },
  { id: 'acc_wx_xiao', name: '微信（小号）', normalBalance: 'debit', institution: '微信' },
  { id: 'acc_wx_da', name: '微信（大号）', normalBalance: 'debit', institution: '微信' },
  { id: 'acc_lingqiantong', name: '零钱通', normalBalance: 'debit', institution: '微信' },
  { id: 'acc_yuebao', name: '余额宝', normalBalance: 'debit', institution: '支付宝' },
  { id: 'acc_yulibao', name: '余利宝', normalBalance: 'debit', institution: '支付宝' },
  { id: 'acc_huabei', name: '花呗', normalBalance: 'credit', institution: '支付宝' },
  { id: 'acc_zhongxin_credit', name: '中信银行信用卡', normalBalance: 'credit', institution: '中信银行' },
  { id: 'acc_zhaoshang_credit', name: '招商银行信用卡', normalBalance: 'credit', institution: '招商银行' },
]

const ALIPAY = 'com.eg.android.AlipayGphone'
const WECHAT = 'com.tencent.mm'

describe('matchCaptureAccount', () => {
  it('精确匹配：支付方式"零钱通" → 零钱通账户', () => {
    expect(matchCaptureAccount('零钱通', WECHAT, ACCOUNTS, false)).toBe('acc_lingqiantong')
  })

  it('标准化匹配：微信"中信银行储蓄卡(5441)" → 中信银行（5441）账户（剥后缀+括号）', () => {
    expect(matchCaptureAccount('中信银行储蓄卡(5441)', ALIPAY, ACCOUNTS, false)).toBe('acc_zhongxin')
  })

  it('卡类区分：微信"中信银行储蓄卡(5441)" → 中信银行（5441）储蓄卡账户，不误选中信银行信用卡', () => {
    expect(matchCaptureAccount('中信银行储蓄卡(5441)', WECHAT, ACCOUNTS, false)).toBe('acc_zhongxin')
  })

  it('卡类区分：支付方式"中信银行信用卡" → 中信银行信用卡账户', () => {
    expect(matchCaptureAccount('中信银行信用卡', ALIPAY, ACCOUNTS, false)).toBe('acc_zhongxin_credit')
  })

  it('卡类区分扩散：招商银行储蓄卡 → 招商银行（借记），不误选招商银行信用卡', () => {
    expect(matchCaptureAccount('招商银行储蓄卡(1234)', ALIPAY, ACCOUNTS, false)).toBe('acc_zhaoshang')
  })

  it('卡类区分扩散：招商银行信用卡 → 招商银行信用卡账户', () => {
    expect(matchCaptureAccount('招商银行信用卡', ALIPAY, ACCOUNTS, false)).toBe('acc_zhaoshang_credit')
  })

  it('标准化匹配：支付宝"成都银行储蓄卡(0652)" → 成都银行（0652）账户', () => {
    expect(matchCaptureAccount('成都银行储蓄卡(0652)', ALIPAY, ACCOUNTS, false)).toBe('acc_chengdu')
  })

  it('支付方式"余额宝" → 余额宝账户（不误选余利宝）', () => {
    expect(matchCaptureAccount('余额宝', ALIPAY, ACCOUNTS, false)).toBe('acc_yuebao')
  })

  it('收入（isDebitOnly）排除信贷账户：花呗不可作为收款账户', () => {
    // 支付宝收入，无 hint → 兜底按来源关键词命中支付宝余额（而非花呗）
    expect(matchCaptureAccount('', ALIPAY, ACCOUNTS, true)).toBe('acc_zfb')
    // 即便 hint 恰好等于花呗，收入场景也排除信贷
    expect(matchCaptureAccount('花呗', ALIPAY, ACCOUNTS, true)).not.toBe('acc_huabei')
  })

  it('支出场景允许信贷账户：花呗付款命中花呗', () => {
    expect(matchCaptureAccount('花呗', ALIPAY, ACCOUNTS, false)).toBe('acc_huabei')
  })

  it('无 hint 时按来源兜底：微信 → 微信（大号）（日常主用零钱）', () => {
    expect(matchCaptureAccount('', WECHAT, ACCOUNTS, false)).toBe('acc_wx_da')
  })

  it('无候选命中返回 null（保持用户默认）', () => {
    expect(matchCaptureAccount('不存在的银行', 'com.unknown.app', ACCOUNTS, false)).toBeNull()
  })
})
