/**
 * Token 规范校验（PRD BUG-07/11/12、需求四 7.6.5）。
 *
 * 扫描 src 下所有 .vue 文件：
 *  1. var(--x) 引用了 tokens.css 未定义的 token → 报错
 *  2. var(--x, #hex) 形式的 hex fallback（token 欠账）→ 报错
 *  3. .vue 内硬编码 hex 色值（白/黑与品牌色白名单除外）→ 报错
 *  4. 已知偏差值 min-height: 68px → 报错
 *
 * 运行：npm run check:tokens
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const srcDir = fileURLToPath(new URL('../src', import.meta.url))
const tokensFile = join(srcDir, 'design-system/tokens.css')

function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, exts, out)
    else if (exts.some((ext) => name.endsWith(ext))) out.push(full)
  }
  return out
}

const defined = new Set()
for (const match of readFileSync(tokensFile, 'utf8').matchAll(/--([a-zA-Z0-9-]+)\s*:/g)) {
  defined.add(`--${match[1]}`)
}

// 品牌资产/装饰插画类硬编码白名单（不属于主题 token 体系）
const FILE_WHITELIST_HEX = ['AccountBrandIcon.vue', 'SideDrawer.vue']
// 68px 行高白名单：分类管理行带 6 个操作钮、密度高，2026-11-07 回测后有意恢复 68
const FILE_WHITELIST_68PX = ['CategoryManagementView.vue']
// 白名单 hex（黑/白中性色）
const HEX_WHITELIST = new Set(['#ffffff', '#000000'])

const problems = []
for (const file of walk(srcDir, ['.vue'])) {
  const rel = relative(srcDir, file)
  const text = readFileSync(file, 'utf8')

  for (const match of text.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
    if (!defined.has(match[1])) problems.push(`${rel}: 未定义 token ${match[1]}`)
  }
  for (const match of text.matchAll(/var\(\s*--[a-zA-Z0-9-]+\s*,\s*#[0-9a-fA-F]{3,8}\s*\)/g)) {
    problems.push(`${rel}: var() 带 hex fallback（token 欠账）: ${match[0]}`)
  }
  if (!FILE_WHITELIST_HEX.some((name) => rel.endsWith(name))) {
    for (const match of text.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      const hex = `#${match[0].slice(1).toLowerCase()}`
      if (!HEX_WHITELIST.has(hex)) problems.push(`${rel}: .vue 内硬编码 hex ${match[0]}`)
    }
  }
  if (!FILE_WHITELIST_68PX.some((name) => rel.endsWith(name))) {
    for (const _match of text.matchAll(/min-height:\s*68px/g)) {
      problems.push(`${rel}: 行高 68px 偏差（应 56px）`)
    }
  }
}

if (problems.length) {
  console.error(`✗ token 校验：${problems.length} 处问题`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
console.log('✓ token 校验通过：无未定义 var()、无 hex fallback、.vue 无硬编码 hex、无 68px 行高')
