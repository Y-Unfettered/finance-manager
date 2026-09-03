import { PaymentCapture, callPaymentCapture } from '@/features/payment-capture/payment-capture-reader'
import type { RuleConfigResult } from '@/features/payment-capture/payment-capture-reader'

/** 规则内金额/商户/账户提取模式。 */
export interface RulePattern {
  regex: string
  group: number
}

/** 商户名到分类的映射。 */
export interface RuleCategoryMapping {
  namePattern: string
  categoryId: string
  kind: 'expense' | 'income'
}

/** 单条规则。 */
export interface CaptureRule {
  id: string
  name: string
  packageName: string
  channel: 'accessibility' | 'notification'
  successKeywords: string[]
  amountPatterns: RulePattern[]
  merchantPatterns: RulePattern[]
  accountPatterns: RulePattern[]
  categoryMappings: RuleCategoryMapping[]
  defaultAccountId?: string
  enabled: boolean
  priority: number
}

/** 用户偏好。 */
export interface CapturePreferences {
  quickEntryEnabled: boolean
  autoRecoverEnabled: boolean
}

/** 规则配置（JSON 格式，同步到原生侧）。 */
export interface CaptureRuleConfig {
  version: 1
  rules: CaptureRule[]
  preferences: CapturePreferences
}

/** 默认规则配置（预置）。 */
const DEFAULT_RULES: CaptureRule[] = [
  {
    id: 'alipay-default',
    name: '支付宝',
    packageName: 'com.eg.android.AlipayGphone',
    channel: 'accessibility',
    successKeywords: ['支付成功', '付款成功', '转账成功', '交易成功', '成功'],
    amountPatterns: [
      { regex: '[¥￥]\\s*(\\d+[\\.\\d]*)', group: 1 },
      { regex: '\\d+[\\.\\d]*\\s*元', group: 0 },
    ],
    merchantPatterns: [
      { regex: '(?:商家|商户|收款方|对方|店铺|收款人|转入)[:：]?\\s*([^\\n\\r]+)', group: 1 },
      // 兜底：首行如果没有标签前缀，取不含数字/金额/时间/系统词的文本作为商户
      { regex: '^([^\\n\\r\\d¥￥创建成功支付付款交易退款提现]*[^\\n\\r\\d¥￥：:])', group: 1 },
    ],
    accountPatterns: [
      { regex: '(?:支付账户|账户|付款方式|银行卡|储蓄卡|余额宝|余额)[:：]\\s*(.+)', group: 1 },
    ],
    categoryMappings: [
      { namePattern: '(火锅|川菜|湘菜|粤菜|餐厅|快餐|烧烤|火锅|自助餐|咖啡|奶茶|面包|水果)', categoryId: 'food', kind: 'expense' },
      { namePattern: '(超市|便利店|沃尔玛|家乐福|永辉|大润发|盒马|京东到家)', categoryId: 'grocery', kind: 'expense' },
      { namePattern: '(加油|中石化|中石油|加油卡)', categoryId: 'gas', kind: 'expense' },
      { namePattern: '(电影|影院|IMAX)', categoryId: 'entertainment', kind: 'expense' },
      { namePattern: '(游戏|充值|会员|VIP|视频|音乐)', categoryId: 'entertainment', kind: 'expense' },
      { namePattern: '(快递|跑腿|外卖|美团)', categoryId: 'food', kind: 'expense' },
      { namePattern: '(水电|燃气|话费|宽带|网络)', categoryId: 'utilities', kind: 'expense' },
      { namePattern: '(医药|医院|药店|诊所|体检)', categoryId: 'health', kind: 'expense' },
      { namePattern: '(转账|转帐|红包|发红包|收红包)', categoryId: 'transfer', kind: 'expense' },
      { namePattern: '(工资|收入|奖金|返佣|退款)', categoryId: 'income-other', kind: 'income' },
    ],
    enabled: true,
    priority: 100,
  },
  {
    id: 'wechat-default',
    name: '微信',
    packageName: 'com.tencent.mm',
    channel: 'accessibility',
    successKeywords: ['支付成功', '支付', '付款成功'],
    amountPatterns: [
      { regex: '[¥￥]\\s*(\\d+[\\.\\d]*)', group: 1 },
      { regex: '\\d+[\\.\\d]*\\s*元', group: 0 },
    ],
    merchantPatterns: [
      { regex: '(?:商户|商家|收款方)[:：]\\s*(.+)', group: 1 },
    ],
    accountPatterns: [],
    categoryMappings: [
      { namePattern: '(火锅|川菜|湘菜|餐厅|快餐|烧烤|咖啡|奶茶)', categoryId: 'food', kind: 'expense' },
      { namePattern: '(超市|便利店|京东到家)', categoryId: 'grocery', kind: 'expense' },
      { namePattern: '(游戏|充值|会员|视频|音乐)', categoryId: 'entertainment', kind: 'expense' },
      { namePattern: '(转账|红包)', categoryId: 'transfer', kind: 'expense' },
      { namePattern: '(工资|奖金|收入)', categoryId: 'income-other', kind: 'income' },
    ],
    enabled: true,
    priority: 100,
  },
  {
    id: 'jd-default',
    name: '京东',
    packageName: 'com.jingdong.app.mall',
    channel: 'accessibility',
    successKeywords: ['成功', '支付', '付款'],
    amountPatterns: [
      { regex: '[¥￥]\\s*(\\d+[\\.\\d]*)', group: 1 },
      { regex: '\\d+[\\.\\d]*\\s*元', group: 0 },
    ],
    merchantPatterns: [
      { regex: '(?:商家|商户|收款方)[:：]\\s*(.+)', group: 1 },
    ],
    accountPatterns: [],
    categoryMappings: [
      { namePattern: '(超市|生鲜|母婴|数码|家电|手机|电脑)', categoryId: 'shopping', kind: 'expense' },
    ],
    enabled: true,
    priority: 50,
  },
  {
    id: 'meituan-default',
    name: '美团',
    packageName: 'com.sankuai.meituan',
    channel: 'accessibility',
    successKeywords: ['成功', '支付', '付款'],
    amountPatterns: [
      { regex: '[¥￥]\\s*(\\d+[\\.\\d]*)', group: 1 },
      { regex: '\\d+[\\.\\d]*\\s*元', group: 0 },
    ],
    merchantPatterns: [
      { regex: '(?:商家|商户|收款方)[:：]\\s*(.+)', group: 1 },
    ],
    accountPatterns: [],
    categoryMappings: [
      { namePattern: '(外卖|美食|餐饮|餐厅|快餐)', categoryId: 'food', kind: 'expense' },
      { namePattern: '(电影|演出|旅游|酒店)', categoryId: 'entertainment', kind: 'expense' },
    ],
    enabled: true,
    priority: 50,
  },
  {
    id: 'douyin-default',
    name: '抖音',
    packageName: 'com.ss.android.ugc.aweme',
    channel: 'accessibility',
    successKeywords: ['成功', '支付', '付款'],
    amountPatterns: [
      { regex: '[¥￥]\\s*(\\d+[\\.\\d]*)', group: 1 },
      { regex: '\\d+[\\.\\d]*\\s*元', group: 0 },
    ],
    merchantPatterns: [
      { regex: '(?:商家|商户|收款方)[:：]\\s*(.+)', group: 1 },
    ],
    accountPatterns: [],
    categoryMappings: [],
    enabled: true,
    priority: 50,
  },
]

const DEFAULT_CONFIG: CaptureRuleConfig = {
  version: 1,
  rules: DEFAULT_RULES,
  preferences: {
    quickEntryEnabled: true,
    autoRecoverEnabled: true,
  },
}

const STORAGE_KEY = 'capture-rule-config'

/** 本地存储（web 层用 localStorage，作为原生侧的规则备份）。 */
function loadLocalConfig(): CaptureRuleConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const cfg = JSON.parse(raw) as CaptureRuleConfig
    if (cfg.version !== 1) return null
    return cfg
  } catch {
    return null
  }
}

function saveLocalConfig(config: CaptureRuleConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // ignore
  }
}

/** 获取当前配置（原生 → 本地 → 默认）。 */
export async function loadRuleConfig(): Promise<CaptureRuleConfig> {
  try {
    const result = await callPaymentCapture('getCaptureRules', () => PaymentCapture.getCaptureRules())
    if (result.success && result.config) {
      const cfg = result.config as CaptureRuleConfig
      if (cfg.version === 1 && cfg.rules && Array.isArray(cfg.rules)) return cfg
    }
  } catch {
    // fall through
  }

  const local = loadLocalConfig()
  if (local) return local

  return DEFAULT_CONFIG
}

/** 保存规则配置（同步到原生 + 本地备份）。 */
export async function saveRuleConfig(config: CaptureRuleConfig): Promise<RuleConfigResult> {
  try {
    const result = await callPaymentCapture('saveCaptureRules', () =>
      PaymentCapture.saveCaptureRules({ config: JSON.stringify(config) }),
    )
    if (result.success) {
      saveLocalConfig(config)
    }
    return { success: result.success, message: result.message }
  } catch {
    // 原生不可用时，仅保存到本地
    saveLocalConfig(config)
    return { success: true, message: '已保存到本地（原生侧不可用）' }
  }
}

/** 重置为默认规则。 */
export async function resetRuleConfig(): Promise<RuleConfigResult> {
  return saveRuleConfig(DEFAULT_CONFIG)
}

/** 导出配置 JSON 文本。 */
export function exportRuleConfig(config: CaptureRuleConfig): string {
  return JSON.stringify(config, null, 2)
}

/** 导入配置 JSON 文本。 */
export function importRuleConfig(json: string): CaptureRuleConfig | null {
  try {
    const cfg = JSON.parse(json) as CaptureRuleConfig
    if (cfg.version !== 1 || !cfg.rules || !Array.isArray(cfg.rules)) return null
    return cfg
  } catch {
    return null
  }
}