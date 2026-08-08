import * as XLSX from 'xlsx'

import type { CsvParseResult } from './csv-parser'

/**
 * 统一的解析结果，与 CSV 解析输出结构一致。
 * 所有格式最终都转换为 { headers, rows, errors } 以复用字段映射逻辑。
 */
export type SourceParseResult = CsvParseResult

/**
 * 从 XLSX/XLS 文件的 ArrayBuffer 解析为二维表格。
 * 读取第一个工作表，首行视为表头。
 */
export function parseXlsx(data: ArrayBuffer): SourceParseResult {
  const errors: string[] = []
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(data, { type: 'array' })
  } catch {
    return { headers: [], rows: [], errors: ['无法解析该 Excel 文件'] }
  }

  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    return { headers: [], rows: [], errors: ['Excel 文件中没有工作表'] }
  }

  const sheet = workbook.Sheets[firstSheetName]
  if (!sheet) {
    return { headers: [], rows: [], errors: ['工作表为空'] }
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  })

  if (matrix.length === 0) {
    return { headers: [], rows: [], errors: ['工作表没有数据'] }
  }

  const headers = (matrix[0] ?? []).map((cell) => String(cell ?? '').trim())
  if (headers.every((header) => header === '')) {
    return { headers: [], rows: [], errors: ['首行（表头）为空'] }
  }

  const expectedColumns = headers.length
  const rows = matrix.slice(1).map((row, index) => {
    const cells = (Array.isArray(row) ? row : []).map((cell) => String(cell ?? ''))
    if (cells.length < expectedColumns) {
      return [...cells, ...Array.from({ length: expectedColumns - cells.length }, () => '')]
    }
    if (cells.length > expectedColumns) {
      errors.push(`第 ${index + 2} 行：列数 ${cells.length} 多于表头 ${expectedColumns}`)
      return cells.slice(0, expectedColumns)
    }
    return cells
  })

  return { headers, rows, errors }
}

/**
 * 从 JSON 文本解析为二维表格。
 * 支持对象数组格式，例如：
 *   [{"日期":"2026-08-01","金额":"12.50","类型":"支出"}]
 * 收集所有对象键的并集作为表头，每个值转为字符串。
 */
export function parseJson(content: string): SourceParseResult {
  const errors: string[] = []
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { headers: [], rows: [], errors: ['JSON 格式不正确'] }
  }

  if (!Array.isArray(parsed)) {
    return { headers: [], rows: [], errors: ['JSON 顶层必须是数组（对象列表）'] }
  }

  if (parsed.length === 0) {
    return { headers: [], rows: [], errors: ['JSON 数组为空'] }
  }

  const headerSet: string[] = []
  const seen = new Set<string>()
  for (const item of parsed) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      for (const key of Object.keys(item as Record<string, unknown>)) {
        if (!seen.has(key)) {
          seen.add(key)
          headerSet.push(key)
        }
      }
    }
  }

  if (headerSet.length === 0) {
    return { headers: [], rows: [], errors: ['JSON 对象中没有可用字段'] }
  }

  const headers = headerSet
  const rows: string[][] = parsed.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`第 ${index + 2} 行：不是有效对象`)
      return headers.map(() => '')
    }
    const record = item as Record<string, unknown>
    return headers.map((header) => cellToString(record[header]))
  })

  return { headers, rows, errors }
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

/**
 * 根据文件名扩展名推断导入来源类型。
 */
export function detectSourceType(fileName: string): 'csv' | 'xlsx' | 'json' | 'other' {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.csv')) return 'csv'
  return 'other'
}
