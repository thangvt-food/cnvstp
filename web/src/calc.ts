export const SQUARES = 5

/** 1 ô lớn Neubauer: 1 mm² × 0,1 mm = 0,1 µL = 10⁻⁴ mL */
export const VOLUME_FACTOR = 1e4

export interface Result {
  total: number
  avg: number
  concentration: number
  log10: number | null
}

/**
 * N (tế bào/mL) = (Σ tế bào 5 ô lớn ÷ 5) × 10⁴ × hệ số pha loãng
 */
export function computeResult(counts: number[], dilutionExp: number): Result {
  const total = counts.reduce((s, c) => s + (c || 0), 0)
  const avg = total / SQUARES
  const concentration = avg * VOLUME_FACTOR * Math.pow(10, dilutionExp)
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
