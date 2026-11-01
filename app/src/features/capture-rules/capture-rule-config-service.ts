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

/** 页面特征签名：用于判断"当前页面是否是目标详情页"。 */
export interface RulePageSignature {
  requireAll?: string[]
  requiredLabels?: string[]
  /** 同义标签任一命中（如时间标签"创建时间"/"支付时间"只出现其一） */
  requiredAnyLabel?: string[]
  /** 业务字段至少命中一个（如提现详情页无"付款方式"但有"提现到"） */
  requireAnyOf?: string[]
  timeFormats?: string[]
}

/** 字段别名：同一字段在不同 APP/版本上的标签措辞。 */
export interface RuleFieldAliases {
  amountLabel?: string[]
  orderAmountLabel?: string[]
  originalPriceLabel?: string[]
  discountLabel?: string[]
  occurredAtLabel?: string[]
  accountLabel?: string[]
  merchantLabel?: string[]
  noteLabel?: string[]
  orderIdLabel?: string[]
  /** 转账转入方账户线索（如"提现银行""收款方账号"） */
  targetAccountLabel?: string[]
  /** 手续费字段（如"服务费"），值内嵌金额 */
  feeLabel?: string[]
}

/** 备注提取规则。 */
export interface RuleNote {
  preferFields?: string[]
  maxLength?: number
  cleanPatterns?: string[]
  fallbackToMerchant?: boolean
  prefix?: string
  joinFirst?: number
}

/** 布局锚点提取：模板结构位置（如商户名在金额行上方），无标签字段也能提取。 */
export interface RuleLayoutExtract {
  merchant?: { anchor: 'amount'; offset: number; stripPrefix?: string; stripPrefixPattern?: string }
}

/** 转账双账户提取：标题按分隔符拆出转出方/转入方，固定提示兜底。 */
export interface RuleTransferExtract {
  titleSeparator?: string
  defaultSourceAccountHint?: string
  defaultTargetAccountHint?: string
}

/** 方向判断规则（以字段结构为准，不以"提现/转账"字样为准）。 */
export interface RuleDirection {
  negative?: 'expense' | 'income' | 'transfer' | 'refund' | 'confirm'
  /** 外部打款信号字段（任一命中 → income），如"对方账户""转账备注" */
  externalIncomeFields?: string[]
  externalIncomeField?: string
  selfTransferFields?: string[]
  refundFields?: string[]
  default?: 'confirm' | 'expense' | 'income' | 'transfer' | 'refund'
}

/** 单条规则。 */
export interface CaptureRule {
  id: string
  name: string
  packageName: string
  channel: 'accessibility' | 'notification'
  /** 页面类型：bill-detail（账单详情）/ order-detail（订单详情）；缺省=成功页规则 */
  pageType?: 'bill-detail' | 'order-detail'
  /** 排除词：页面含任一则本规则拒绝（防成功页规则抢详情页的活） */
  excludeKeywords?: string[]
  successKeywords: string[]
  amountPatterns: RulePattern[]
  merchantPatterns: RulePattern[]
  accountPatterns: RulePattern[]
  categoryMappings: RuleCategoryMapping[]
  defaultAccountId?: string
  pageSignature?: RulePageSignature
  fieldAliases?: RuleFieldAliases
  noteRule?: RuleNote
  directionRule?: RuleDirection
  /** 模板布局锚点（结构位置提取，优先于标签匹配） */
  layoutExtract?: RuleLayoutExtract
  /** 转账双账户提取（标题拆分 + 固定提示兜底） */
  transferExtract?: RuleTransferExtract
  /** 账户固定提示（模板语义固定入某账户，如红包→微信大号零钱） */
  defaultSourceAccountHint?: string
  defaultTargetAccountHint?: string
  enabled: boolean
  priority: number
}

/** 用户偏好。 */
export interface CapturePreferences {
  quickEntryEnabled: boolean
  autoRecoverEnabled: boolean
}

/** 规则配置（JSON 格式，同步到原生侧）。
 * version 1/2 为旧版宽松匹配；3 = 收紧后的规则集（完整成功词 + 页面签名强制），
 * 加载到旧版本配置时自动升级为最新默认规则并回写原生。 */
export interface CaptureRuleConfig {
  version: 1 | 2 | 3 | 4 | 5
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
    successKeywords: ['支付成功', '付款成功', '转账成功', '交易成功'],
    excludeKeywords: ['账单详情', '创建时间', '转账备注'],
    amountPatterns: [
      { regex: '[¥￥]\\s*(\\d+[\\.\\d]*)', group: 1 },
      { regex: '\\d+[\\.\\d]*\\s*元', group: 0 },
      { regex: '[+\\-]\\s*(\\d+[\\.\\d]*)', group: 1 },
    ],
    merchantPatterns: [
      { regex: '(?:商家|商户|收款方(?!式)|对方账户|店铺|收款人|转入)[:：]?\\s*([^\\n\\r]+)', group: 1 },
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
    enabled: false,
    priority: 100,
  },
  {
    id: 'wechat-default',
    name: '微信',
    packageName: 'com.tencent.mm',
    channel: 'accessibility',
    successKeywords: ['支付成功', '付款成功'],
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
    enabled: false,
    priority: 100,
  },
  {
    id: 'jd-default',
    name: '京东',
    packageName: 'com.jingdong.app.mall',
    channel: 'accessibility',
    successKeywords: ['支付成功', '付款成功', '转账成功'],
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
    enabled: false,
    priority: 50,
  },
  {
    id: 'meituan-default',
    name: '美团',
    packageName: 'com.sankuai.meituan',
    channel: 'accessibility',
    successKeywords: ['支付成功', '付款成功', '转账成功'],
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
    enabled: false,
    priority: 50,
  },
  {
    id: 'douyin-default',
    name: '抖音',
    packageName: 'com.ss.android.ugc.aweme',
    channel: 'accessibility',
    successKeywords: ['支付成功', '付款成功', '转账成功'],
    amountPatterns: [
      { regex: '[¥￥]\\s*(\\d+[\\.\\d]*)', group: 1 },
      { regex: '\\d+[\\.\\d]*\\s*元', group: 0 },
    ],
    merchantPatterns: [
      { regex: '(?:商家|商户|收款方)[:：]\\s*(.+)', group: 1 },
    ],
    accountPatterns: [],
    categoryMappings: [],
    enabled: false,
    priority: 50,
  },
  // ===== P1：账单详情页规则（pageType=bill-detail，priority 200 高于成功页 100）=====
  {
    id: 'alipay-bill-detail',
    name: '支付宝·账单详情',
    packageName: 'com.eg.android.AlipayGphone',
    channel: 'accessibility',
    pageType: 'bill-detail',
    successKeywords: [],
    amountPatterns: [],
    merchantPatterns: [],
    accountPatterns: [],
    pageSignature: {
      // 实测：标题栏渲染有竞态不作硬性要求；时间标签措辞并存任一命中
      requireAll: [],
      requiredLabels: [],
      requiredAnyLabel: ['创建时间', '支付时间', '收款时间'],
      requireAnyOf: [
        '账单详情',
        '交易成功', '转账成功', '收款成功', '付款成功', '自动扣款成功',
        '付款方式', '转账备注', '对方账户', '提现到', '收款方式', '处理进度',
      ],
    },
    fieldAliases: {
      amountLabel: ['实付金额', '实收金额', '金额'],
      orderAmountLabel: ['订单金额'],
      discountLabel: ['红包', '优惠', '满减', '立减'],
      occurredAtLabel: ['创建时间', '支付时间', '交易时间', '转账时间'],
      accountLabel: ['付款方式', '支付方式', '收款方式'],
      merchantLabel: ['对方账户', '收款方', '商户', '商家'],
      noteLabel: ['缴费说明', '交易详情', '转账备注', '商品说明', '理由', '商品'],
      orderIdLabel: ['订单号', '商户单号', '交易单号', '户号'],
    },
    layoutExtract: {
      // 商户名固定在金额行上方（模板结构，换公司/金额不变）
      merchant: { anchor: 'amount', offset: -1 },
    },
    noteRule: {
      preferFields: ['缴费说明', '交易详情', '转账备注', '商品', '理由'],
      maxLength: 50,
      cleanPatterns: ['[-–]\\*+[^-–]*$'],
      fallbackToMerchant: true,
    },
    directionRule: {
      negative: 'expense',
      externalIncomeFields: ['对方账户', '转账备注'],
      selfTransferFields: ['提现到', '收款方式', '处理进度'],
      refundFields: ['退款'],
      default: 'confirm',
    },
    categoryMappings: [
      { namePattern: '(燃气|水费|电费|话费|宽带|物业)', categoryId: 'utilities', kind: 'expense' },
      { namePattern: '(保险|保费|好医保)', categoryId: 'insurance', kind: 'expense' },
      { namePattern: '(外卖|餐饮|奶茶|咖啡|麻辣烫)', categoryId: 'food', kind: 'expense' },
      { namePattern: '(超市|便利店|盒马)', categoryId: 'grocery', kind: 'expense' },
      { namePattern: '(零食|小吃|坚果|卤味|牛蹄筋|牛肉干)', categoryId: 'food', kind: 'expense' },
      { namePattern: '(橙子|苹果|香蕉|梨|桃|葡萄|西瓜|芒果|草莓|车厘子|荔枝|龙眼|猕猴桃|火龙果|柚子|柠檬|樱桃|哈密瓜|水果)', categoryId: 'food', kind: 'expense' },
      { namePattern: '(提现|返现|退款|红包|签到|奖励|返款)', categoryId: 'income-other', kind: 'income' },
    ],
    enabled: true,
    priority: 200,
  },
  {
    id: 'wechat-bill-detail',
    name: '微信·账单详情',
    packageName: 'com.tencent.mm',
    channel: 'accessibility',
    pageType: 'bill-detail',
    successKeywords: [],
    amountPatterns: [],
    merchantPatterns: [],
    accountPatterns: [],
    layoutExtract: {
      // 微信标题"扫二维码付款-给XXX"固定在金额上方，清洗前缀得商户名
      merchant: { anchor: 'amount', offset: -1, stripPrefix: '扫二维码付款-给' },
    },
    pageSignature: {
      requireAll: ['支付成功'],
      requiredLabels: ['支付方式'],
      requiredAnyLabel: ['支付时间', '转账时间', '收款时间', '交易单号', '转账单号', '商户单号'],
      timeFormats: ['yyyy年M月d日 HH:mm:ss', 'yyyy-MM-dd HH:mm:ss'],
    },
    fieldAliases: {
      amountLabel: ['实付金额', '金额'],
      orderAmountLabel: ['原价', '订单金额'],
      originalPriceLabel: ['原价'],
      discountLabel: ['优惠', '红包', '立减', '满减'],
      occurredAtLabel: ['支付时间', '收款时间', '转账时间'],
      accountLabel: ['支付方式'],
      merchantLabel: ['商户全称', '商户'],
      noteLabel: ['商品', '收款方备注', '商户全称'],
      orderIdLabel: ['交易单号', '商户单号', '转账单号'],
    },
    noteRule: {
      preferFields: ['商品', '收款方备注', '商户全称'],
      maxLength: 50,
      cleanPatterns: ['订单编号\\d+$', 'App-\\d+$', '[-–]\\d{6,}$', '-\\d{4,}$'],
      fallbackToMerchant: true,
    },
    directionRule: {
      negative: 'expense',
      externalIncomeField: '',
      selfTransferFields: [],
      refundFields: ['退款'],
      default: 'confirm',
    },
    categoryMappings: [
      { namePattern: '(外卖|牛杂|麻辣烫|奶茶|咖啡|餐饮|餐厅)', categoryId: 'food', kind: 'expense' },
      { namePattern: '(考试|驾考|车管|财政|非税|罚款)', categoryId: 'other-expense', kind: 'expense' },
      { namePattern: '(超市|生鲜|水果|零食)', categoryId: 'grocery', kind: 'expense' },
      { namePattern: '(京东|数码|手机|家电)', categoryId: 'shopping', kind: 'expense' },
      { namePattern: '(橙子|苹果|香蕉|梨|桃|葡萄|西瓜|芒果|草莓|车厘子|荔枝|龙眼|猕猴桃|火龙果|柚子|柠檬|樱桃|哈密瓜|零食|小吃|坚果|水果)', categoryId: 'food', kind: 'expense' },
      { namePattern: '(二维码收款|扫码付款|扫码)', categoryId: 'other-expense', kind: 'expense' },
    ],
    enabled: true,
    priority: 200,
  },
  {
    id: 'wechat-lingqiantong-out',
    name: '微信·零钱通转出',
    packageName: 'com.tencent.mm',
    channel: 'accessibility',
    pageType: 'bill-detail',
    successKeywords: [],
    amountPatterns: [],
    merchantPatterns: [],
    accountPatterns: [],
    pageSignature: {
      requireAll: ['零钱通转出'],
      requiredAnyLabel: ['收款方账号', '发起时间'],
    },
    // 标题即双账户："零钱通转出-到零钱"——转出=零钱通、转入=零钱（默认微信大号）
    // 转入方固定语义"零钱"→大号零钱（规则可调：改账户名时改这里）
    transferExtract: { titleSeparator: '转出-到', defaultTargetAccountHint: '微信（大号）' },
    fieldAliases: {
      amountLabel: ['金额'],
      occurredAtLabel: ['发起时间'],
      targetAccountLabel: ['收款方账号'],
      orderIdLabel: ['交易单号'],
    },
    directionRule: {
      negative: 'expense',
      selfTransferFields: ['收款方账号'],
      default: 'transfer',
    },
    categoryMappings: [],
    enabled: true,
    priority: 205,
  },
  {
    id: 'wechat-withdraw',
    name: '微信·零钱提现',
    packageName: 'com.tencent.mm',
    channel: 'accessibility',
    pageType: 'bill-detail',
    successKeywords: [],
    amountPatterns: [],
    merchantPatterns: [],
    accountPatterns: [],
    pageSignature: {
      requireAll: ['零钱提现'],
      requiredLabels: ['提现金额', '服务费'],
    },
    // 标题"零钱提现-到成都银行(0652)"——转出=零钱（默认微信大号）、转入=提现银行字段值
    transferExtract: { titleSeparator: '提现-到', defaultSourceAccountHint: '微信（大号）' },
    fieldAliases: {
      amountLabel: ['提现金额', '金额'],
      occurredAtLabel: ['到账时间', '申请时间'],
      targetAccountLabel: ['提现银行'],
      feeLabel: ['服务费'],
      orderIdLabel: ['提现单号'],
    },
    directionRule: {
      negative: 'expense',
      selfTransferFields: ['提现银行', '收款方账号'],
      default: 'transfer',
    },
    categoryMappings: [],
    enabled: true,
    priority: 205,
  },
  {
    id: 'wechat-redpacket',
    name: '微信·红包收款',
    packageName: 'com.tencent.mm',
    channel: 'accessibility',
    pageType: 'bill-detail',
    successKeywords: [],
    amountPatterns: [],
    merchantPatterns: [],
    accountPatterns: [],
    pageSignature: {
      requireAll: ['微信红包-来自'],
      requireAnyOf: ['已存入零钱', '已领取', '已存入'],
    },
    // 红包固定入零钱（默认微信大号；用小号时手动切）
    defaultSourceAccountHint: '微信（大号）',
    layoutExtract: {
      // 标题"微信红包-来自XXX"固定在金额上方，剥前缀得发送人
      merchant: { anchor: 'amount', offset: -1, stripPrefix: '微信红包-来自' },
    },
    fieldAliases: {
      amountLabel: ['金额'],
      occurredAtLabel: ['收款时间'],
      noteLabel: ['红包详情', '红包文字', '留言'],
      orderIdLabel: ['交易单号', '商户单号'],
    },
    noteRule: {
      preferFields: ['红包详情', '红包文字', '留言'],
      maxLength: 50,
      fallbackToMerchant: true,
    },
    directionRule: {
      negative: 'expense',
      externalIncomeField: '',
      selfTransferFields: [],
      refundFields: ['退款'],
      default: 'income',
    },
    categoryMappings: [
      { namePattern: '(红包|收款)', categoryId: 'income-other', kind: 'income' },
    ],
    enabled: true,
    priority: 210,
  },
]

const DEFAULT_CONFIG: CaptureRuleConfig = {
  version: 5,
  rules: DEFAULT_RULES,
  preferences: {
    quickEntryEnabled: true,
    autoRecoverEnabled: true,
  },
}

const STORAGE_KEY = 'capture-rule-config'

/** 校验配置版本：v1~v5 均接受（v5 为最新：微信多模板变体标签齐备）。 */
function isValidVersion(v: number): boolean {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5
}

/** 本地存储（web 层用 localStorage，作为原生侧的规则备份）。 */
function loadLocalConfig(): CaptureRuleConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const cfg = JSON.parse(raw) as CaptureRuleConfig
    if (!isValidVersion(cfg.version)) return null
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
      if (isValidVersion(cfg.version) && cfg.rules && Array.isArray(cfg.rules)) {
        if (cfg.version >= DEFAULT_CONFIG.version) return cfg
        // 原生存的是旧版本宽松规则（单字关键词/万金油商户正则会误抓任意页面）
        // → 自动升级为最新默认规则并回写原生，只发生一次
        void saveRuleConfig(DEFAULT_CONFIG)
        return DEFAULT_CONFIG
      }
    }
  } catch {
    // fall through
  }

  const local = loadLocalConfig()
  if (local && local.version >= DEFAULT_CONFIG.version) return local

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
    if (!isValidVersion(cfg.version) || !cfg.rules || !Array.isArray(cfg.rules)) return null
    return cfg
  } catch {
    return null
  }
}