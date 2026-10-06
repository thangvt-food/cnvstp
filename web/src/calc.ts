export const SQUARES = 5
export const SMALL_SQUARES_PER_SQUARE = 16
/** Tổng số ô nhỏ đã đếm: 5 ô × 16 ô nhỏ = 80 */
export const SMALL_SQUARES_TOTAL = SQUARES * SMALL_SQUARES_PER_SQUARE

/**
 * Hệ số buồng đếm Neubauer (sâu 0,1 mm): ô nhỏ 0,05 × 0,05 mm có thể tích
 * 2,5×10⁻⁴ µL → 1 / 2,5×10⁻⁴ = 4000 tế bào/µL cho mỗi tế bào đếm trên 1 ô nhỏ,
 * nhân 1000 để đổi µL → mL.
 */
export const CHAMBER_FACTOR = 4000 * 1000

export interface Result {
  total: number
  /** Trung bình tế bào mỗi ô đếm */
  avg: number
  /** Nồng độ tế bào (tế bào/mL) */
  concentration: number
  log10: number | null
}

/**
 * N (tế bào/mL) = (Σ tế bào ÷ tổng số ô nhỏ) × 4000 × 1000 × hệ số pha loãng
 * với tổng số ô nhỏ = 5 ô × 16 ô nhỏ = 80.
 */
export function computeResult(counts: number[], dilutionExp: number): Result {
  const total = counts.reduce((s, c) => s + (c || 0), 0)
  const avg = total / SQUARES
  const concentration = (total / SMALL_SQUARES_TOTAL) * CHAMBER_FACTOR * Math.pow(10, dilutionExp)
  return {
    total,
    avg,
    concentration,
    log10: concentration > 0 ? Math.log10(concentration) : null,
  }
}

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
}

export function sup(n: number): string {
  return String(n).split('').map(c => SUP[c] ?? c).join('')
}

export function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s
}

/** Định dạng khoa học: 2.4 × 10⁷ */
export function fmtSci(v: number): string {
  if (!isFinite(v) || v <= 0) return '—'
  const exp = Math.floor(Math.log10(v))
  const mant = v / Math.pow(10, exp)
  return `${trimZeros(mant.toFixed(2))} × 10${sup(exp)}`
}

export function fmtInt(v: number): string {
  return v.toLocaleString('vi-VN')
}

export function fmtHours(h: number): string {
  const r = Math.abs(h) < 10 ? Math.round(h * 10) / 10 : Math.round(h)
  return String(r)
}

/** "2026-10-06T09:40" → "06/10/2026 09:40" */
export function fmtDateTime(local: string): string {
  const [d, t] = local.split('T')
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y} ${t}`
}

export function nowLocal(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function parseLocal(t: string): number {
  return new Date(t).getTime()
}
