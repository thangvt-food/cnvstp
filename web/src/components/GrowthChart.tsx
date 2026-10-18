import { useMemo, useRef, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Measurement } from '../types'
import { computeResult, fmtDateTime, fmtHours, fmtInt, fmtSci, parseLocal, sup, trimZeros } from '../calc'

/**
 * 2 thang Y, không bao giờ lẫn nhau:
 * - "log": trục Y = log₁₀(N) (vd 7,87) — đường cong sinh trưởng chuẩn báo cáo.
 * - "cfu": trục Y = N thô (CFU/mL, vd 7,5×10⁷) — thang tuyến tính.
 *
 * LOGIC VẼ (một nguồn duy nhất): đối tượng `view` quyết định dataKey, domain, ticks,
 * tiêu đề trục, hàm định dạng tick VÀ giá trị y của chấm đỉnh. Đường Line, dải khoảng
 * nghỉ và chấm đỉnh đều đọc từ `view` → không thể xảy ra trục log mà vẽ giá trị CFU.
 */
type ScaleMode = 'log' | 'cfu'

interface ChartDatum {
  hours: number
  /** Nồng độ thô (CFU/mL), null khi = 0 */
  conc: number | null
  /** log₁₀(N), null khi N = 0 */
  log: number | null
  m: Measurement
}

interface RestGap {
  x1: number
  x2: number
  gap: number
  label: string
}

/** 40000000 → "4×10⁷", 100000000 → "10⁸" (nhãn tick, gọn) */
function fmtPow(v: number): string {
  if (!isFinite(v) || v <= 0) return '0'
  const e = Math.floor(Math.log10(v))
  const mant = trimZeros((v / Math.pow(10, e)).toFixed(1))
  return mant === '1' ? `10${sup(e)}` : `${mant}×10${sup(e)}`
}

function fmtNumVi(v: number, digits: number): string {
  return v.toLocaleString('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function ChartTip(props: { active?: boolean; payload?: Array<{ payload: ChartDatum }> }) {
  const { active, payload } = props
  if (!active || !payload || payload.length === 0) return null
  const { hours, m } = payload[0].payload
  const r = computeResult(m.counts, m.dilutionExp)
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs shadow-md">
      <div className="mb-1 font-semibold">
        {fmtDateTime(m.time)} · +{fmtHours(hours)} h
      </div>
      <div>
        Σ 5 ô: <b className="font-mono">{fmtInt(r.total)}</b>
      </div>
      <div>
        Pha loãng: <b className="font-mono">10{sup(m.dilutionExp)}</b>
      </div>
      <div>
        N: <b className="font-mono">{fmtSci(r.concentration)} CFU/mL</b>
      </div>
      <div>
        log₁₀(N): <b className="font-mono">{r.log10 === null ? '—' : r.log10.toFixed(2)}</b>
      </div>
    </div>
  )
}

/** Mốc tròn đẹp cho trục log₁₀ (bước 1, hoặc 0.5 khi biên độ hẹp). */
function niceLogTicks(lo: number, hi: number): { ticks: number[]; domain: [number, number] } {
  const span = hi - lo
  const step = span > 4 ? 1 : 0.5
  const start = Math.floor(lo / step) * step
  const end = Math.ceil(hi / step) * step
  const ticks: number[] = []
  for (let v = start; v <= end + 1e-9; v += step) {
    ticks.push(Math.round(v * 10) / 10)
  }
  return { ticks, domain: [start - step * 0.4, end + step * 0.4] }
}

/**
 * Trục X tuyến tính liên tục, mốc đều bội số của 10 (0-10-20…).
 * Nếu điểm đo cuối nằm sát mép phải (>93% bề rộng) thì nới thêm một ô 10 h,
 * để chấm đỉnh + nhãn chú thích không bị cắt mất.
 */
function buildXScale(maxH: number): { xMax: number; ticks: number[] } {
  let xMax = Math.max(10, Math.ceil(maxH / 10) * 10)
  if (maxH / xMax > 0.93) xMax += 10
  return { xMax, ticks: Array.from({ length: xMax / 10 + 1 }, (_, i) => i * 10) }
}

export default function GrowthChart({ items }: { items: Measurement[] }) {
  const [mode, setMode] = useState<ScaleMode>('log')
  const [report, setReport] = useState(false)
  const [exporting, setExporting] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const model = useMemo(() => {
    if (items.length === 0) return null
    const t0 = Math.min(...items.map(m => parseLocal(m.time)))
    const data: ChartDatum[] = items
      .map(m => {
        const conc = computeResult(m.counts, m.dilutionExp).concentration
        return {
          hours: (parseLocal(m.time) - t0) / 3600000,
          conc: conc > 0 ? conc : null,
          log: conc > 0 ? Math.log10(conc) : null,
          m,
        }
      })
      .sort((a, b) => a.hours - b.hours)

    const valid = data.filter(d => d.log !== null && d.conc !== null)
    if (valid.length === 0) return null

    const logs = valid.map(d => d.log as number)
    const concs = valid.map(d => d.conc as number)
    const { xMax, ticks: xTicks } = buildXScale(Math.max(...data.map(d => d.hours)))

    // Khoảng nghỉ (không đo qua đêm): khe giữa 2 mốc đo liên tiếp ≥ 8 h
    const rests: RestGap[] = []
    for (let i = 1; i < data.length; i++) {
      const gap = data[i].hours - data[i - 1].hours
      if (gap >= 8) {
        rests.push({
          x1: data[i - 1].hours,
          x2: data[i].hours,
          gap,
          label: `Nghỉ ${Math.round(gap)}h`,
        })
      }
    }

    // Đỉnh sinh trưởng = điểm có log₁₀ CAO NHẤT (tương đương N cao nhất, vì log₁₀ đơn điệu tăng).
    // Hai điểm bằng nhau thì lấy mốc SỚM hơn.
    let peak: ChartDatum = valid[0]
    for (const d of valid) {
      if ((d.log as number) > (peak.log as number)) peak = d
    }

    const { ticks: logTicks, domain: logDomain } = niceLogTicks(Math.min(...logs), Math.max(...logs))
    const cfuHi = Math.max(...concs) * 1.1

    return {
      data,
      valid,
      xMax,
      xTicks,
      rests,
      peak,
      logTicks,
      logDomain,
      cfuDomain: [0, cfuHi] as [number, number],
      cfuTicks: Array.from({ length: 6 }, (_, i) => (cfuHi * i) / 5),
    }
  }, [items])

  const downloadPNG = async (scale = 3) => {
    const box = boxRef.current
    const svg = box?.querySelector('svg')
    if (!svg) return
    try {
      setExporting(true)
      const clone = svg.cloneNode(true) as SVGSVGElement
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      const w = svg.clientWidth || box?.clientWidth || 800
      const h = svg.clientHeight || 420
      clone.setAttribute('width', String(Math.round(w * scale)))
      clone.setAttribute('height', String(Math.round(h * scale)))
      // Nền trắng + font Arial chuẩn báo cáo khi xuất ảnh
      const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
      style.textContent = 'text{font-family:Arial,Helvetica,sans-serif;}'
      clone.insertBefore(style, clone.firstChild)
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      rect.setAttribute('width', '100%')
      rect.setAttribute('height', '100%')
      rect.setAttribute('fill', '#ffffff')
      clone.insertBefore(rect, style.nextSibling)

      const svgStr = new XMLSerializer().serializeToString(clone)
      const url = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' }))
      try {
        const img = new Image()
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('img'))
          img.src = url
        })
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(w * scale)
        canvas.height = Math.round(h * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('canvas')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const a = document.createElement('a')
        a.download = `duong-cong-sinh-truong-${scale}x.png`
        a.href = canvas.toDataURL('image/png')
        a.click()
      } finally {
        URL.revokeObjectURL(url)
      }
    } finally {
      setExporting(false)
    }
  }

  if (!model) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 p-7 text-center text-sm text-slate-500">
        Chưa có số liệu nào có nồng độ lớn hơn 0 — lưu lần đo đầu tiên để bắt đầu biểu đồ.
      </div>
    )
  }

  // Chế độ báo cáo luôn dùng thang log₁₀(N) — chuẩn đường cong sinh trưởng
  const isLog = report ? true : mode === 'log'
  const { peak } = model

  // MỘT nguồn duy nhất cho mọi thứ thuộc trục Y (kể cả giá trị y của chấm đỉnh)
  const view = isLog
    ? {
        dataKey: 'log' as const,
        domain: model.logDomain,
        ticks: model.logTicks,
        axisTitle: 'Mật độ tế bào, log₁₀(N)',
        tickFmt: (v: number) => fmtNumVi(v, 1),
        yOf: (d: ChartDatum) => d.log as number,
        seriesName: 'log₁₀(N)',
      }
    : {
        dataKey: 'conc' as const,
        domain: model.cfuDomain,
        ticks: model.cfuTicks,
        axisTitle: 'Mật độ tế bào, N (CFU/mL)',
        tickFmt: (v: number) => fmtPow(v),
        yOf: (d: ChartDatum) => d.conc as number,
        seriesName: 'N (CFU/mL)',
      }

  const peakY = view.yOf(peak)

  const tickFont = report ? 13 : 10
  const labelFont = report ? 14 : 12
  const chartH = report ? 420 : 300
  const ink = report ? '#111827' : '#59636e'

  return (
    <div className="w-full min-w-0">
      {!report && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-500">
            Trục Y: {isLog ? 'log₁₀(N) — giá trị log' : 'N — nồng độ (CFU/mL)'}
          </span>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode('log')}
              aria-pressed={isLog}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                isLog ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              log₁₀(N)
            </button>
            <button
              type="button"
              onClick={() => setMode('cfu')}
              aria-pressed={!isLog}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                !isLog ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              N (CFU/mL)
            </button>
          </div>
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setReport(v => !v)}
          aria-pressed={report}
          title="Ẩn nút thao tác, nền trắng, chữ lớn, hiện nhãn trục + chú thích đỉnh/khoảng nghỉ"
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors ${
            report
              ? 'border-green-600 bg-green-600 text-white hover:bg-green-700'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          {report ? '✓ Đang ở chế độ báo cáo' : 'Chế độ báo cáo'}
        </button>
        {report && (
          <button
            type="button"
            onClick={() => void downloadPNG(3)}
            disabled={exporting}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {exporting ? 'Đang xuất…' : 'Tải ảnh PNG chuẩn báo cáo (3x)'}
          </button>
        )}
      </div>

      <div ref={boxRef} className={report ? 'rounded-lg border border-slate-300 bg-white p-3' : undefined}>
        <ResponsiveContainer width="100%" height={chartH}>
          <LineChart
            data={model.data}
            margin={{ top: report ? 34 : 16, right: report ? 34 : 22, bottom: 6, left: 6 }}
          >
            <CartesianGrid stroke={report ? '#d1d9e0' : '#e6ebf1'} strokeDasharray="3 3" />

            <XAxis
              dataKey="hours"
              type="number"
              domain={[0, model.xMax]}
              ticks={model.xTicks}
              interval={0}
              height={report ? 62 : 52}
              tickFormatter={(v: number) => fmtHours(v)}
              tick={{ fontSize: tickFont, fill: ink }}
              tickLine={report}
              axisLine={{ stroke: report ? '#111827' : '#d1d9e0', strokeWidth: report ? 1.5 : 1 }}
              label={{
                value: 'Thời gian sinh trưởng, t (h)',
                position: 'insideBottom',
                offset: -2,
                style: { fontSize: labelFont, fill: '#111827', fontWeight: 600 },
              }}
            />
            <YAxis
              dataKey={view.dataKey}
              scale="linear"
              domain={view.domain}
              ticks={view.ticks}
              interval={0}
              width={report ? 78 : isLog ? 60 : 80}
              tickFormatter={view.tickFmt}
              tick={{ fontSize: tickFont, fill: ink }}
              tickLine={report}
              axisLine={{ stroke: report ? '#111827' : '#d1d9e0', strokeWidth: report ? 1.5 : 1 }}
              label={{
                value: view.axisTitle,
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: labelFont, fill: '#111827', fontWeight: 600, textAnchor: 'middle' },
              }}
            />

            {/* Dải khoảng nghỉ — đặt SAU trục để Recharts lấy đúng scale */}
            {model.rests.map((r, i) => (
              <ReferenceArea
                key={i}
                x1={r.x1}
                x2={r.x2}
                y1={view.domain[0]}
                y2={view.domain[1]}
                fill="#fef9c3"
                fillOpacity={0.55}
                stroke="#d97706"
                strokeDasharray="5 3"
                strokeOpacity={0.7}
                label={{
                  value: r.label,
                  position: 'insideTop',
                  fontSize: report ? 13 : 11,
                  fill: '#92400e',
                  fontWeight: 600,
                }}
              />
            ))}

            <Line
              dataKey={view.dataKey}
              name={view.seriesName}
              stroke={report ? '#1d4ed8' : '#0969da'}
              strokeWidth={report ? 2.5 : 2}
              dot={{ r: report ? 4 : 3.5, fill: report ? '#1d4ed8' : '#0969da' }}
              activeDot={{ r: 5 }}
              connectNulls
              isAnimationActive={false}
            />

            {/* Chấm đỏ đánh dấu đỉnh sinh trưởng — không kèm chữ (caption ghi trong báo cáo) */}
            <ReferenceDot
              x={peak.hours}
              y={peakY}
              r={report ? 6 : 5}
              fill="#dc2626"
              stroke="#ffffff"
              strokeWidth={2}
            />

            <Tooltip content={<ChartTip />} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {!report && (
        <p className="mt-2 text-xs text-slate-500">
          Trục X: giờ kể từ lần đo đầu tiên. Trục Y:{' '}
          {isLog
            ? 'giá trị log₁₀(N) — trùng cột "log₁₀" trong bảng (vd 6.36).'
            : 'nồng độ N (CFU/mL) thang tuyến tính — trùng cột "N" trong bảng (vd 2.3×10⁶).'}
        </p>
      )}
    </div>
  )
}
