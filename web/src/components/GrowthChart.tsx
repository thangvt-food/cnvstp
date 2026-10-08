import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Measurement } from '../types'
import { computeResult, fmtDateTime, fmtHours, fmtInt, fmtSci, parseLocal, sup, trimZeros } from '../calc'

/**
 * 2 chế độ RÕ RỆT, không lẫn nhau:
 * - "log": trục Y là GIÁ TRỊ log₁₀(N) (vd 5.70, 6.15) — đường cong sinh trưởng chuẩn.
 * - "cfu": trục Y là NỒNG ĐỘ N thô (CFU/mL, vd 2.5×10⁷) — thang tuyến tính.
 * Tooltip luôn hiện cả 2 để đối chiếu với bảng số liệu.
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

/** 40000000 → "4×10⁷", 100000000 → "10⁸" */
function fmtPow(v: number): string {
  if (!isFinite(v) || v <= 0) return '—'
  const e = Math.floor(Math.log10(v))
  const mant = trimZeros((v / Math.pow(10, e)).toFixed(1))
  return mant === '1' ? `10${sup(e)}` : `${mant}×10${sup(e)}`
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

export default function GrowthChart({ items }: { items: Measurement[] }) {
  const [mode, setMode] = useState<ScaleMode>('log')

  const chart = useMemo(() => {
    if (items.length === 0) return null
    const t0 = Math.min(...items.map(m => parseLocal(m.time)))
    const data: ChartDatum[] = items.map(m => {
      const conc = computeResult(m.counts, m.dilutionExp).concentration
      return {
        hours: (parseLocal(m.time) - t0) / 3600000,
        conc: conc > 0 ? conc : null,
        log: conc > 0 ? Math.log10(conc) : null,
        m,
      }
    })
    const logs = data.map(d => d.log).filter((v): v is number => v !== null)
    const concs = data.map(d => d.conc).filter((c): c is number => c !== null)
    if (logs.length === 0) return null

    const xTicks = [...new Set(data.map(d => Math.round(d.hours * 1000) / 1000))].sort((a, b) => a - b)
    const { ticks: logTicks, domain: logDomain } = niceLogTicks(Math.min(...logs), Math.max(...logs))
    const hi = Math.max(...concs)
    return { data, xTicks, logTicks, logDomain, cfuDomain: [0, hi * 1.1] as [number, number] }
  }, [items])

  if (!chart) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 p-7 text-center text-sm text-slate-500">
        Chưa có số liệu nào có nồng độ lớn hơn 0 — lưu lần đo đầu tiên để bắt đầu biểu đồ.
      </div>
    )
  }

  const isLog = mode === 'log'

  return (
    <div className="w-full min-w-0">
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

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chart.data} margin={{ top: 8, right: 14, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#e6ebf1" strokeDasharray="3 3" />
          <XAxis
            dataKey="hours"
            type="number"
            domain={[(dataMin: number) => Math.max(0, dataMin - 1), (dataMax: number) => dataMax + 1]}
            ticks={chart.xTicks}
            interval="preserveStartEnd"
            minTickGap={16}
            height={28}
            tickFormatter={(v: number) => fmtHours(v)}
            tick={{ fontSize: 10, fill: '#59636e' }}
            tickLine={false}
            axisLine={{ stroke: '#d1d9e0' }}
          />
          {isLog ? (
            <YAxis
              dataKey="log"
              scale="linear"
              domain={chart.logDomain}
              ticks={chart.logTicks}
              interval={0}
              width={44}
              tickFormatter={(v: number) => v.toFixed(1)}
              tick={{ fontSize: 10, fill: '#59636e' }}
              tickLine={false}
              axisLine={{ stroke: '#d1d9e0' }}
            />
          ) : (
            <YAxis
              dataKey="conc"
              scale="linear"
              domain={chart.cfuDomain}
              width={64}
              tickFormatter={(v: number) => fmtPow(v)}
              tick={{ fontSize: 10, fill: '#59636e' }}
              tickLine={false}
              axisLine={{ stroke: '#d1d9e0' }}
            />
          )}
          <Tooltip content={<ChartTip />} />
          <Line
            dataKey={isLog ? 'log' : 'conc'}
            name={isLog ? 'log₁₀(N)' : 'N (CFU/mL)'}
            stroke="#0969da"
            strokeWidth={2}
            dot={{ r: 3.5, fill: '#0969da' }}
            activeDot={{ r: 5 }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-slate-500">
        Trục X: giờ kể từ lần đo đầu tiên. Trục Y:{' '}
        {isLog
          ? 'giá trị log₁₀(N) — trùng cột "log₁₀" trong bảng (vd 6.36).'
          : 'nồng độ N (CFU/mL) thang tuyến tính — trùng cột "N" trong bảng (vd 2.3×10⁶).'}
      </p>
    </div>
  )
}
