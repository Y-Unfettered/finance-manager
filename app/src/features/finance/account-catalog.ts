import type { AccountType } from '@/domain/accounts'

export type AccountCatalogGroup = 'funds' | 'credit' | 'prepaid' | 'investment'

export interface AccountCatalogItem {
  id: string
  name: string
  symbol: string
  color: string
  foreground?: string
  type: AccountType
  group: AccountCatalogGroup
  institution?: string
  chooseBank?: boolean
}

export interface BankCatalogItem {
  id: string
  name: string
  symbol: string
  color: string
}

export const ACCOUNT_CATALOG_GROUPS: readonly {
  id: AccountCatalogGroup
  title: string
  items: readonly AccountCatalogItem[]
}[] = [
  {
    id: 'funds',
    title: '资金账户',
    items: [
      item('cash', '现金', '¥', '#596cff', 'cash', 'funds'),
      item('wechat', '微信', '微', '#45bd68', 'platform', 'funds', '微信'),
      item('零钱通', '微信零钱通', '通', '#f3b72b', 'platform', 'funds', '微信'),
      item('alipay', '支付宝', '支', '#2f7cf6', 'platform', 'funds', '支付宝'),
      item('yu-ebao', '余额宝', '余', '#f45124', 'platform', 'funds', '支付宝'),
      item('yu-libao', '余利宝', '利', '#388cf5', 'platform', 'funds', '支付宝'),
      item('pocket', '小荷包', '荷', '#f3983d', 'platform', 'funds', '支付宝'),
      item('unionpay', '云闪付', '云', '#cf4247', 'platform', 'funds', '银联'),
      item('bank', '银行卡', '卡', '#4388f4', 'bank', 'funds', undefined, true),
      item('fund', '公积金', '积', '#7652eb', 'restricted_asset', 'funds'),
      item('medical', '医保', '医', '#6c79e8', 'restricted_asset', 'funds'),
      item('ecny', '数字人民币', 'e¥', '#c83827', 'platform', 'funds', '数字人民币'),
      item('huawei', '华为钱包', 'H', '#ef665d', 'platform', 'funds', '华为'),
      item('pdd', '多多钱包', '多', '#d93424', 'platform', 'funds', '拼多多'),
      item('paypal', 'PayPal', 'P', '#2868a9', 'platform', 'funds', 'PayPal'),
      item('other-funds', '其他', '其', '#7652eb', 'platform', 'funds'),
    ],
  },
  {
    id: 'credit',
    title: '信用卡账户',
    items: [
      item('credit-card', '信用卡', '卡', '#e96d42', 'credit_card', 'credit', undefined, true),
      item('huabei', '花呗', '花', '#4d8ef7', 'consumer_credit', 'credit', '支付宝'),
      item('jiebei', '借呗', '借', '#3d7fe9', 'other_liability', 'credit', '支付宝'),
      item('jd-credit', '京东白条', 'JD', '#dd3b32', 'consumer_credit', 'credit', '京东金融'),
      item('meituan', '美团月付', '美', '#f4bf22', 'consumer_credit', 'credit', '美团'),
      item('douyin', '抖音月付', '抖', '#42c9c7', 'consumer_credit', 'credit', '抖音'),
      item('weixin-pay', '微信分付', '分', '#8ecf72', 'consumer_credit', 'credit', '微信'),
      item('other-credit', '其他信用', '其', '#7652eb', 'other_liability', 'credit'),
    ],
  },
  {
    id: 'prepaid',
    title: '充值账户',
    items: [
      item('prepaid', '通用充值卡', '充', '#d99540', 'prepaid', 'prepaid'),
      item('food-card', '餐饮卡', '餐', '#e97945', 'prepaid', 'prepaid'),
      item('hair-card', '美容美发', '美', '#db6f91', 'prepaid', 'prepaid'),
      item('cake-card', '蛋糕卡', '糕', '#c38a55', 'prepaid', 'prepaid'),
      item('fitness-card', '健身卡', '健', '#4f9b85', 'prepaid', 'prepaid'),
      item('transit-card', '交通卡', '行', '#5688b8', 'prepaid', 'prepaid'),
      item('other-prepaid', '其他充值', '其', '#8a73bd', 'prepaid', 'prepaid'),
    ],
  },
  {
    id: 'investment',
    title: '投资账户',
    items: [
      item('stock', '股票', '股', '#d45f5a', 'investment', 'investment'),
      item('funds', '基金', '基', '#4778ad', 'investment', 'investment'),
      item('bond', '债券', '债', '#b88439', 'investment', 'investment'),
      item('wealth', '银行理财', '理', '#2a806f', 'investment', 'investment'),
      item('gold', '黄金', '金', '#d8a248', 'investment', 'investment'),
      item('digital', '数字资产', '数', '#65717c', 'investment', 'investment'),
      item('other-investment', '其他投资', '其', '#7652eb', 'investment', 'investment'),
    ],
  },
]

export const BANK_CATALOG: readonly BankCatalogItem[] = [
  bank('boc', '中国银行', '中', '#b52b2b'),
  bank('cmb', '招商银行', '招', '#c82737'),
  bank('icbc', '工商银行', '工', '#c92932'),
  bank('abc', '农业银行', '农', '#2e9778'),
  bank('ccb', '建设银行', '建', '#164391'),
  bank('bocom', '交通银行', '交', '#26389a'),
  bank('spdb', '浦发银行', '浦', '#183d82'),
  bank('cgb', '广发银行', '广', '#c12b2a'),
  bank('psbc', '邮政储蓄银行', '邮', '#23834e'),
  bank('rcc', '农村信用社', '信', '#35945b'),
  bank('pingan', '平安银行', '平', '#e85320'),
  bank('citic', '中信银行', '信', '#ca2e34'),
  bank('cib', '兴业银行', '兴', '#1a4b92'),
  bank('ceb', '光大银行', '光', '#6f3b92'),
  bank('cmbc', '民生银行', '民', '#2193a7'),
  bank('hxb', '华夏银行', '华', '#be2c2f'),
  bank('bob', '北京银行', '京', '#d43d38'),
  bank('cdcb', '成都银行', '成', '#d6a02e'),
  bank('other-bank', '其他银行', '其', '#687470'),
]

export function findAccountCatalogItem(
  accountName: string,
  institution?: string,
): AccountCatalogItem {
  const normalized = `${accountName} ${institution ?? ''}`.toLowerCase()
  const exact = ACCOUNT_CATALOG_GROUPS.flatMap((group) => group.items).find(
    (entry) => normalized.includes(entry.name.toLowerCase()) || normalized.includes(entry.id),
  )
  if (exact) return exact

  const matchedBank = BANK_CATALOG.find((entry) => normalized.includes(entry.name.toLowerCase()))
  if (matchedBank) {
    return item(
      matchedBank.id,
      matchedBank.name,
      matchedBank.symbol,
      matchedBank.color,
      'bank',
      'funds',
      matchedBank.name,
    )
  }

  return item(
    'generic',
    accountName,
    accountName.slice(0, 1) || '账',
    '#687470',
    'platform',
    'funds',
  )
}

function item(
  id: string,
  name: string,
  symbol: string,
  color: string,
  type: AccountType,
  group: AccountCatalogGroup,
  institution?: string,
  chooseBank = false,
): AccountCatalogItem {
  return { id, name, symbol, color, type, group, institution, chooseBank }
}

function bank(id: string, name: string, symbol: string, color: string): BankCatalogItem {
  return { id, name, symbol, color }
}
