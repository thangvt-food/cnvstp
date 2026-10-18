import { computeResult } from './calc'
import type { MeasurementInput } from './types'

export interface ParseResult {
  inputs: MeasurementInput[]
  /** Lỗi từng dòng (đã kèm số dòng trong file) */
  errors: string[]
  /** Tổng số dòng dữ liệu đã quét (không tính header) */
  totalRows: number
}

const TIME_KEYS = ['thoi_gian', 'thoigian', 'time', 'ngay_gio', 'ngaygio', 'datetime']
const COUNT_KEYS = ['o1', 'o2', 'o3', 'o4', 'o5']
const DIL_KEYS = ['he_so_pha_loang', 'hesopha_loang', 'pha_loang', 'phaloang', 'dilution', 'dilutionexp', '10^n']

function normKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** "06/10/2026 09:40" hoặc "06/10/2026" + "09:40" → "2026-10-06T09:40". Trả null nếu không parse được. */
function normalizeTime(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  // Đã đúng ISO datetime-local (có thể kèm giây): "2026-10-06T09:40" / "...:00"
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (m) {
    const [, y, mo, d, h, mi] = m
    const dt = new Date(`${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi}`)
    if (!Number.isNaN(dt.getTime())) {
      const p = (n: number) => String(n).padStart(2, '0')
      return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`
    }
  }
  // ISO date only → mặc định 00:00 (ít gặp, vẫn chấp nhận)
  m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) {
    const [, y, mo, d] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T00:00`
  }
  // Kiểu VN "06/10/2026 09:40" hoặc "06-10-2026 09:40"
  m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[T ](\d{1,2}):(\d{2})(?::\d{2})?)?$/)
  if (m) {
    const [, d, mo, y, h = '0', mi = '00'] = m
    const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi))
    if (!Number.isNaN(dt.getTime())) {
      const p = (n: number) => String(n).padStart(2, '0')
      return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`
    }
  }
  // Fallback: để Date tự parse, rồi chuẩn hóa về datetime-local
  const dt = new Date(v)
  if (!Number.isNaN(dt.getTime())) {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`
  }
  return null
}

function splitLine(line: string, delim: string): string[] {
  // Tách CSV tôn trọng ngoặc kép ("a;b";c)
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQ = !inQ
      }
    } else if (c === delim && !inQ) {
      out.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out.map(s => s.trim().replace(/^"|"$/g, '').trim())
}

function detectDelim(header: string): string {
  const counts: Record<string, number> = {
    ';': header.split(';').length,
    ',': header.split(',').length,
    '\t': header.split('\t').length,
  }
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ';') as string
}

/**
 * Parse nội dung CSV/TXT thành danh sách MeasurementInput.
 * Chấp nhận:
 * - File do app Xuất ra (header Thoi_gian...;O1..O5;He_so_pha_loang...),
 * - File hiệu chỉnh có thêm cột Gio_tu_lan_dau, Tong, N, log, Trang_thai (tự bỏ qua),
 * - File tự gõ tối thiểu: time,O1,O2,O3,O4,O5,dilution.
 */
export function parseImportText(text: string): ParseResult {
  const errors: string[] = []
  const inputs: MeasurementInput[] = []
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = clean
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
  if (lines.length === 0) return { inputs, errors: ['File trống — không có dòng nào.'], totalRows: 0 }

  const delim = detectDelim(lines[0])
  const firstCells = splitLine(lines[0], delim).map(normKey)
  const looksHeader =
    firstCells.some(c => TIME_KEYS.some(k => c.includes(k))) ||
    firstCells.filter(c => COUNT_KEYS.includes(c)).length >= 2

  let colTime = 0
  let colCounts = [1, 2, 3, 4, 5]
  let colDil = 6
  let dataStart = 0

  if (looksHeader) {
    dataStart = 1
    const idx = (pred: (c: string) => boolean) => firstCells.findIndex(pred)
    const t = idx(c => TIME_KEYS.some(k => c === k || c.startsWith(k)))
    if (t >= 0) colTime = t
    const ci = COUNT_KEYS.map(k => idx(c => c === k))
    if (ci.every(i => i >= 0)) colCounts = ci as number[]
    else {
      // Header tiếng Việt rút gọn khác? fallback: 5 cột số liên tiếp sau cột time
      const nums: number[] = []
      for (let i = 0; i < firstCells.length && nums.length < 5; i++) {
        if (i !== colTime && !DIL_KEYS.some(k => firstCells[i].includes(k)) && !firstCells[i].includes('gio_tu_lan')) {
          // đoán theo vị trí mặc định của file export
          void 0
        }
      }
      void nums
    }
    const d = idx(c => DIL_KEYS.some(k => c.includes(k)))
    if (d >= 0) colDil = d
    else {
      // File export chuẩn: dilution đứng ngay sau O5
      colDil = Math.max(...colCounts) + 1
    }
    // Không header kiểu O1..O5 mà là file 7 cột trần: time + 5 số + dil
    if (ci.some(i => i < 0)) {
      colTime = 0
      colCounts = [1, 2, 3, 4, 5]
      colDil = 6
    }
  } else {
    // Không header: mặc định time;O1;O2;O3;O4;O5;dil
    colTime = 0
    colCounts = [1, 2, 3, 4, 5]
    colDil = 6
  }

  lines.slice(dataStart).forEach((line, i) => {
    const rowNo = dataStart + i + 1
    const cells = splitLine(line, delim)
    const need = Math.max(colTime, ...colCounts, colDil)
    if (cells.length <= need) {
      errors.push(`Dòng ${rowNo}: thiếu cột (có ${cells.length}, cần ≥ ${need + 1}).`)
      return
    }
    const time = normalizeTime(cells[colTime] ?? '')
    if (!time) {
      errors.push(`Dòng ${rowNo}: thời gian "${cells[colTime] ?? ''}" không hợp lệ (cần YYYY-MM-DDTHH:mm hoặc DD/MM/YYYY HH:mm).`)
      return
    }
    const counts: number[] = []
    for (const c of colCounts) {
      const raw = (cells[c] ?? '').trim()
      if (raw === '') {
        counts.push(0)
        continue
      }
      const n = Number(raw.replace(',', '.'))
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(Math.round(n)) || n > 100000) {
        errors.push(`Dòng ${rowNo}: số tế bào "${raw}" phải là số nguyên 0–100000.`)
        return
      }
      counts.push(Math.round(n))
    }
    if (counts.every(c => c === 0)) {
      errors.push(`Dòng ${rowNo}: cả 5 ô đều = 0 — bỏ qua dòng trắng.`)
      return
    }
    const dilRaw = (cells[colDil] ?? '').trim()
    // Chấp nhận số mũ "0"–"7", "10^2", "10²" hoặc hệ số tuyệt đối 10/100/1000...
    // Lưu ý: file do app Xuất ra ghi SỐ MŨ (0,1,2) nên "1" = 10¹, không phải 1x.
    let dilutionExp: number | null = null
    if (dilRaw === '') dilutionExp = 0
    else {
      const supMap: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' }
      const hasPowMark = /[\^⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(dilRaw)
      if (hasPowMark) {
        // Dạng "10^2", "10²", "10 2": lấy phần mũ ở cuối
        const tail = dilRaw.replace(/^.*?10\s*\^?\s*/, '')
        const ascii = tail.split('').map(ch => supMap[ch] ?? ch).join('').trim()
        if (/^-?\d+$/.test(ascii)) dilutionExp = Number(ascii)
      } else if (/^-?\d+$/.test(dilRaw.trim())) {
        const n = Number(dilRaw.trim())
        if (n >= 0 && n <= 7) dilutionExp = n // số mũ trực tiếp (định dạng app xuất ra)
        else if ([10, 100, 1000, 10000, 100000, 1000000, 10000000].includes(n)) {
          dilutionExp = Math.round(Math.log10(n)) // hệ số tuyệt đối → số mũ
        } else dilutionExp = NaN // số khác (vd "9") → báo lỗi bên dưới
      }
    }
    if (dilutionExp === null || !Number.isInteger(dilutionExp) || dilutionExp < 0 || dilutionExp > 7) {
      errors.push(`Dòng ${rowNo}: hệ số pha loãng "${dilRaw}" không hợp lệ (cần 0–7 hoặc 10ⁿ).`)
      return
    }
    const r = computeResult(counts, dilutionExp)
    inputs.push({ time, counts, dilutionExp, total: r.total, avg: r.avg, concentration: r.concentration })
  })

  return { inputs, errors, totalRows: lines.length - dataStart }
}

/** Xuất CSV đúng định dạng app (để import lại được ngay). */
export function buildExportCsv(
  rows: Array<{ time: string; counts: number[]; dilutionExp: number; hours: number }>,
): string {
  const head = [
    'Thoi_gian (ISO)',
    'Gio_tu_lan_dau (h)',
    'O1',
    'O2',
    'O3',
    'O4',
    'O5',
    'He_so_pha_loang (10^n)',
    'Tong_5_o',
    'TB_moi_o',
    'Nong_do_N (TB/mL)',
    'log10_N',
  ]
  const body = rows.map(r => {
    const res = computeResult(r.counts, r.dilutionExp)
    return [
      r.time,
      r.hours.toFixed(3),
      ...r.counts,
      r.dilutionExp,
      res.total,
      res.avg.toFixed(2),
      res.concentration.toExponential(3),
      res.log10 === null ? '' : res.log10.toFixed(3),
    ]
      .map(v => String(v))
      .join(';')
  })
  return '﻿' + [head.join(';'), ...body].join('\r\n')
}
