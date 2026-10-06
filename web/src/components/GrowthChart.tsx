import { useMemo } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Measurement } from '../types'
import { computeResult, fmtDateTime, fmtHours, fmtInt, fmtSci, parseLocal, sup } from '../calc'

interface ChartDatum {
  hours: number
  conc: number | null
  m: Measurement
}

function ChartTip(props: { active?: boolean; payload?: Array<{ payload: ChartDatum }> }) {
  const { active, payload } = props
  if (!active || !payload || payload.length === 0) return null
  const { hours, m } = payload[0].payload
  const r = computeResult(m.counts, m.dilutionExp)
  return (
    <div className="chart-tip">
      <div className="tip-title">
        {fmtDateTime(m.time)} · +{fmtHours(hours)} h
      </div>
      <div>
        Σ 5 ô: <b>{fmtInt(r.total)}</b>
      </div>
      <div>
        Pha loãng: <b>10{sup(m.dilutionExp)}</b>
      </div>
      <div>
        N: <b>{fmtSci(r.concentration)} TB/mL</b>
      </div>
      <div>
        log₁₀(N): <b>{r.log10 === null ? '—' : r.log10.toFixed(2)}</b>
      </div>
    </div>
  )
}

export default function GrowthChart({ items }: { items: Measurement[] }) {
  const chart = useMemo(() => {
    if (items.length === 0) return null
    const t0 = Math.min(...items.map(m => parseLocal(m.time)))
    const data: ChartDatum[] = items.map(m => ({
      hours: (parseLocal(m.time) - t0) / 3600000,
      conc: m.concentration > 0 ? m.concentration : null,
      m,
    }))
    const concs = data.map(d => d.conc).filter((c): c is number => c !== null)
    if (concs.length === 0) return { data, domain: null, ticks: [] as number[] }
    const lo = Math.min(...concs)
    const hi = Math.max(...concs)
    let minE = Math.floor(Math.log10(lo))
    let maxE = Math.ceil(Math.log10(hi))
    if (minE === maxE) {
      minE -= 1
      maxE += 1
    }
    const step = maxE - minE > 7 ? 2 : 1
    const ticks: number[] = []
    for (let e = minE; e <= maxE; e += step) ticks.push(Math.pow(10, e))
    return { data, domain: [Math.pow(10, minE), Math.pow(10, maxE)] as [number, number], ticks }
  }, [items])

  if (!chart || !chart.domain) {
    return (
      <div className="empty">
        Chưa có số liệu nào có nồng độ lớn hơn 0 — lưu lần đo đầu tiên để bắt đầu biểu đồ.
      </div>
    )
  }

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chart.data} margin={{ top: 8, right: 18, bottom: 4, left: 2 }}>
          <CartesianGrid stroke="#e6ebf1" strokeDasharray="3 3" />
          <XAxis
            dataKey="hours"
            type="number"
            domain={[
              (dataMin: number) => Math.max(0, dataMin - 0.5),
              (dataMax: number) => dataMax + 0.5,
            ]}
            tickFormatter={(v: number) => fmtHours(v)}
            tick={{ fontSize: 11, fill: '#59636e' }}
            tickLine={false}
            axisLine={{ stroke: '#d1d9e0' }}
          />
          <YAxis
            scale="log"
            domain={chart.domain}
            ticks={chart.ticks}
            tickFormatter={(v: number) => `10${sup(Math.round(Math.log10(v)))}`}
            width={54}
            tick={{ fontSize: 11, fill: '#59636e' }}
            tickLine={false}
            axisLine={{ stroke: '#d1d9e0' }}
          />
          <Tooltip content={<ChartTip />} />
          <Line
            dataKey="conc"
            name="N (TB/mL)"
            stroke="#0969da"
            strokeWidth={2}
            dot={{ r: 3.5, fill: '#0969da' }}
            activeDot={{ r: 5 }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="chart-caption">
        Trục Y (log): nồng độ tế bào N (TB/mL). Trục X: giờ kể từ lần đo đầu tiên.
      </p>
    </div>
  )
}
