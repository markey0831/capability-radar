import type { AdminPersonImportRow } from './admin-api'
import * as XLSX from 'xlsx'

export function decodeCsvBytes(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '')
  } catch {
    try {
      return new TextDecoder('gbk').decode(buffer).replace(/^\uFEFF/, '')
    } catch {
      return new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, '')
    }
  }
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += character
      }
    } else if (character === '"') {
      inQuotes = true
    } else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (character !== '\r') {
      field += character
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((candidate) => candidate.some((cell) => cell.trim().length > 0))
}

function toBoolean(value: string | undefined): boolean {
  return ['是', 'true', '1', 'yes', 'y'].includes((value ?? '').trim().toLowerCase())
}

function parsePersonImportRows(rows: string[][]): AdminPersonImportRow[] {
  if (rows.length < 2) return []
  const header = rows[0].map((cell) => cell.trim())
  const column = (name: string) => header.findIndex((cell) => cell === name)
  const nameColumn = column('姓名') >= 0 ? column('姓名') : 0
  const departmentColumn = column('部门') >= 0 ? column('部门') : 1
  const roleColumn = column('职位ID')
  const evaluateeColumn = column('可被评')
  const raterColumn = column('可评分')

  return rows.slice(1)
    .map((cells) => ({
      name: (cells[nameColumn] ?? '').trim(),
      department: (cells[departmentColumn] ?? '').trim(),
      currentRoleId: roleColumn >= 0 ? (cells[roleColumn] ?? '').trim() || null : null,
      canBeEvaluatee: toBoolean(cells[evaluateeColumn]),
      canBeRater: toBoolean(cells[raterColumn]),
    }))
    .filter((row) => row.name.length > 0 || row.department.length > 0)
}

export function parsePersonImportCsv(text: string): AdminPersonImportRow[] {
  return parsePersonImportRows(parseCsv(text))
}

export function parsePersonImportWorkbook(buffer: ArrayBuffer): AdminPersonImportRow[] {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return []
  const sheet = workbook.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' })
  return parsePersonImportRows(matrix.map((row) => (row as unknown[]).map((cell) => String(cell ?? '').trim())))
}

export function parsePersonImportFile(buffer: ArrayBuffer, filename: string): AdminPersonImportRow[] {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return parsePersonImportWorkbook(buffer)
  return parsePersonImportCsv(decodeCsvBytes(buffer))
}
