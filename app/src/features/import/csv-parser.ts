export interface CsvParseResult {
  headers: string[]
  rows: string[][]
  errors: string[]
}

export interface CsvParseOptions {
  delimiter?: string
  quote?: string
  hasHeader?: boolean
}

const DEFAULT_OPTIONS: Required<CsvParseOptions> = {
  delimiter: ',',
  quote: '"',
  hasHeader: true,
}

export function parseCsv(input: string, options: CsvParseOptions = {}): CsvParseResult {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const errors: string[] = []
  const trimmed = input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
  if (trimmed.trim() === '') {
    return { headers: [], rows: [], errors }
  }

  const records: string[][] = []
  let current: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  let line = 1

  while (i < trimmed.length) {
    const char = trimmed[i]
    const next = trimmed[i + 1] ?? ''

    if (inQuotes) {
      if (char === opts.quote) {
        if (next === opts.quote) {
          field += opts.quote
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += char
      i += 1
      continue
    }

    if (char === opts.quote && field === '') {
      inQuotes = true
      i += 1
      continue
    }

    if (char === opts.delimiter) {
      current.push(field)
      field = ''
      i += 1
      continue
    }

    if (char === '\n') {
      current.push(field)
      records.push(current)
      current = []
      field = ''
      line += 1
      i += 1
      continue
    }

    field += char
    i += 1
  }

  if (field !== '' || current.length > 0) {
    current.push(field)
    records.push(current)
  }

  if (inQuotes) {
    errors.push(`第 ${line} 行：引号未闭合`)
  }

  let headers: string[] = []
  let rows = records
  if (opts.hasHeader) {
    if (records.length === 0) {
      return { headers: [], rows: [], errors }
    }
    headers = records[0]!.map((header) => header.trim())
    rows = records.slice(1)
  }

  const expectedColumns = opts.hasHeader ? headers.length : (rows[0]?.length ?? 0)
  if (expectedColumns > 0) {
    rows = rows.map((row, index) => {
      if (row.length === expectedColumns) return row
      if (row.length < expectedColumns) {
        return [...row, ...Array.from({ length: expectedColumns - row.length }, () => '')]
      }
      errors.push(
        `第 ${index + (opts.hasHeader ? 2 : 1)} 行：列数 ${row.length} 多于表头 ${expectedColumns}`,
      )
      return row.slice(0, expectedColumns)
    })
  }

  return { headers, rows, errors }
}

export function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? ''
  const candidates = new Map<string, number>([
    [',', 0],
    [';', 0],
    ['\t', 0],
    ['|', 0],
  ])
  for (const char of firstLine) {
    if (candidates.has(char)) {
      candidates.set(char, (candidates.get(char) ?? 0) + 1)
    }
  }
  let best: string = ','
  let bestCount = 0
  for (const [delimiter, count] of candidates) {
    if (count > bestCount) {
      best = delimiter
      bestCount = count
    }
  }
  return best
}
