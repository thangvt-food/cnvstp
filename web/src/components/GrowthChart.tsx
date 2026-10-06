import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Measurement } from '../types'
import { computeResult, fmtDateTime, fmtHours, fmtInt, fmtSci, parseLocal, sup, trimZeros } from '../calc'

type ScaleMode = 'log' | 'cfu'

/** Chế độ CFU/mL quy mọi nhãn trục Y về cùng một chuẩn ×10⁷ */
const CFU_STD_EXP = 7

interface ChartDatum {
  hours: number
  conc: number | null
  m: Measurement
}

/** 40000000 → "4×10⁷", 100000000 → "10⁸" */
function fmtPow(v: number): string {
  if (!isFinite(v) || v <= 0) return '—'
  const e = Math.floor(Math.log10(v))
  const mant = trimZeros((v / Math.pow(10, e)).toFixed(1))
  return mant === '1' ? `10${sup(e)}` : `${mant}×10${sup(e)}`
}

/** Quy về chuẩn ×10⁷: 4×10⁷ → "4"; 4×10⁶ → "0.4" */
function fmtStd(v: number): string {
  return trimZeros((v / Math.pow(10, CFU_STD_EXP)).toFixed(2))
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
        N: <b className="font-mono">{fmtSci(r.concentration)} TB/mL</b>
      </div>
      <div>
        log₁₀(N): <b className="font-mono">{r.log10 === null ? '—' : r.log10.toFixed(2)}</b>
      </div>
    </div>
  )
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
        m,
      }
    })
    const concs = data.map(d => d.conc).filter((c): c is number => c !== null)
    const empty = {
      data,
      xTicks: [] as number[],
      yTicks: [] as number[],
      logDomain: null as [number, number] | null,
      cfuDomain: [0, 1] as [number, number],
    }
    if (concs.length === 0) return empty

    const lo = Math.min(...concs)
    const hi = Math.max(...concs)
    // Mốc trục đúng tại từng giá trị đã nhập
    const xTicks = [...new Set(data.map(d => d.hours))].sort((a, b) => a - b)
    const yTicks = [...new Set(concs)].sort((a, b) => a - b)
    const logDomain: [number, number] = [
      Math.pow(10, Math.log10(lo) - 0.5),
      Math.pow(10, Math.log10(hi) + 0.5),
    ]
    const cfuDomain: [number, number] = [0, hi * 1.1]
    return { data, xTicks, yTicks, logDomain, cfuDomain }
  }, [items])

  if (!chart || !chart.logDomain) {
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
          Trục Y:{' '}
          {isLog ? 'log₁₀ nồng độ (TB/mL)' : `×10${sup(CFU_STD_EXP)} CFU/mL (chưa log)`}
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
            Log (10ⁿ)
          </button>
          <button
            type="button"
            onClick={() => setMode('cfu')}
            aria-pressed={!isLog}
            className={`rounded-md px-2.5 py-1 transition-colors ${
              !isLog ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            CFU/mL
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
            interval={0}
            height={28}
            tickFormatter={(v: number) => fmtHours(v)}
            tick={{ fontSize: 10, fill: '#59636e' }}
            tickLine={false}
            axisLine={{ stroke: '#d1d9e0' }}
          />
          <YAxis
            scale={isLog ? 'log' : 'linear'}
            domain={isLog ? chart.logDomain : chart.cfuDomain}
            ticks={chart.yTicks}
            interval={0}
            width={56}
            tickFormatter={(v: number) => (isLog ? fmtPow(v) : fmtStd(v))}
            tick={{ fontSize: 10, fill: '#59636e' }}
            tickLine={false}
            axisLine={{ stroke: '#d1d9e0' }}
          />
          <Tooltip content={<ChartTip />} />
          <Line
            dataKey="conc"
            name={isLog ? 'N (TB/mL)' : 'N (CFU/mL)'}
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
        Trục X: giờ kể từ lần đo đầu tiên, mốc tại đúng các lần đo. Trục Y:{' '}
        {isLog
          ? 'nồng độ N (TB/mL) theo thang log₁₀, mốc tại đúng các lần đo.'
          : `nồng độ N (CFU/mL) theo thang tuyến tính, quy về chuẩn ×10${sup(CFU_STD_EXP)}.`}
      </p>
    </div>
  )
}
