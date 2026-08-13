/**
 * 向 android/app/src/main/assets/capacitor.plugins.json 注入本地插件。
 *
 * `npx cap sync android` 会从各 npm 插件的 package.json/capacitor.plugin.json
 * 重新生成 capacitor.plugins.json，每次都会把我们的本地 ClipboardReader 冲
 * 掉。本脚本在 sync 之后运行，确保本地插件条目恢复。
 *
 * 用法 (package.json):
 *   "cap:sync": "npm run build && cap sync && node scripts/patch-capacitor-plugins.mjs"
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')

const TARGET = resolve(
  PROJECT_ROOT,
  'android/app/src/main/assets/capacitor.plugins.json',
)

const LOCAL_PLUGINS = [
  { pkg: 'local', classpath: 'app.financemanager.local.ClipboardReaderPlugin' },
  { pkg: 'local', classpath: 'app.financemanager.capture.plugin.PaymentCapturePlugin' },
]

if (!existsSync(TARGET)) {
  console.warn('[patch-capacitor-plugins] 目标不存在，跳过：', TARGET)
  process.exit(0)
}

/** @type {Array<{pkg:string,classpath:string}>} */
let arr
try {
  arr = JSON.parse(readFileSync(TARGET, 'utf8'))
} catch (e) {
  console.error('[patch-capacitor-plugins] 解析失败:', e?.message ?? e)
  process.exit(1)
}

const existingClasspaths = new Set(arr.map((p) => p.classpath))
let added = 0
for (const plugin of LOCAL_PLUGINS) {
  if (existingClasspaths.has(plugin.classpath)) continue
  arr.push(plugin)
  added++
}

if (added === 0) {
  console.log('[patch-capacitor-plugins] 本地插件条目已存在，无需修改。')
  process.exit(0)
}

writeFileSync(TARGET, JSON.stringify(arr, null, '\t') + '\n', 'utf8')
console.log(
  `[patch-capacitor-plugins] 已注入 ${added} 个本地插件条目 → ${TARGET}`,
)
