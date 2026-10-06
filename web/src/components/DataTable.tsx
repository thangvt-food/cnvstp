import { useMemo } from 'react'
import type { Measurement } from '../types'
import { computeResult, fmtDateTime, fmtHours, fmtInt, fmtSci, parseLocal, sup, trimZeros } from '../calc'

const TH =
  'whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500'
const TD = 'whitespace-nowrap px-2.5 py-2'
const TD_NUM = 'whitespace-nowrap px-2.5 py-2 text-right font-mono tabular-nums'
const ICON_BTN =
  'inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:border-blue-600 hover:text-blue-600'
const ICON_BTN_DANGER =
  'inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-red-600 hover:border-red-600'

interface Props {
  items: Measurement[]
  onEdit: (m: Measurement) => void
  onDelete: (m: Measurement) => void
}

export default function DataTable({ items, onEdit, onDelete }: Props) {
  const t0 = useMemo(
    () => (items.length > 0 ? Math.min(...items.map(m => parseLocal(m.time))) : 0),
    [items],
  )

  const exportCsv = () => {
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
    const rows = items.map(m => {
      const r = computeResult(m.counts, m.dilutionExp)
      const h = (parseLocal(m.time) - t0) / 3600000
      return [
        m.time,
        h.toFixed(3),
        ...m.counts,
        m.dilutionExp,
        r.total,
        r.avg.toFixed(2),
        r.concentration.toExponential(3),
        r.log10 === null ? '' : r.log10.toFixed(3),
      ]
        .map(v => String(v))
        .join(';')
    })
    const csv = '\uFEFF' + [head.join(';'), ...rows].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'cnvstp-dem-te-bao.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 p-7 text-center text-sm text-slate-500">
        Chưa có lần đo nào được lưu.
      </div>
    )
  }

  return (
    <div>
      <div className="mb-2.5 flex justify-end max-md:justify-stretch">
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 hover:bg-slate-100 max-md:w-full"
        >
          Xuất CSV
        </button>
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
        <table className="w-full min-w-[820px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={TH}>Ngày giờ</th>
              <th className={TH}>Giờ</th>
              <th className={TH}>5 ô (1→5)</th>
              <th className={TH}>Σ</th>
              <th className={TH}>TB/ô</th>
              <th className={TH}>Pha loãng</th>
              <th className={TH}>N (TB/mL)</th>
              <th className={TH}>log₁₀</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.map(m => {
              const r = computeResult(m.counts, m.dilutionExp)
              const h = (parseLocal(m.time) - t0) / 3600000
              return (
                <tr key={m.id}>
                  <td className={TD}>{fmtDateTime(m.time)}</td>
                  <td className={TD_NUM}>{fmtHours(h)}</td>
                  <td className={TD_NUM}>{m.counts.join('·')}</td>
                  <td className={TD_NUM}>{fmtInt(r.total)}</td>
                  <td className={TD_NUM}>{trimZeros(r.avg.toFixed(1))}</td>
                  <td className={TD_NUM}>10{sup(m.dilutionExp)}</td>
                  <td className={TD_NUM}>{fmtSci(r.concentration)}</td>
                  <td className={TD_NUM}>{r.log10 === null ? '—' : r.log10.toFixed(2)}</td>
                  <td className="whitespace-nowrap px-2.5 py-2 text-right">
                    <button type="button" className={ICON_BTN} onClick={() => onEdit(m)} aria-label="Sửa" title="Sửa">
                      ✎
                    </button>
                    <button
                      type="button"
                      className={`${ICON_BTN_DANGER} ml-1.5`}
                      onClick={() => onDelete(m)}
                      aria-label="Xóa"
                      title="Xóa"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2.5 md:hidden">
        {items.map(m => (
          <MobileCard
            key={m.id}
            m={m}
            hours={(parseLocal(m.time) - t0) / 3600000}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Cột "Giờ": giờ kể từ lần đo đầu tiên (hệ thống tự tính từ thời gian bạn nhập).
      </p>
    </div>
  )
}

function MobileCard({
  m,
  hours,
  onEdit,
  onDelete,
}: {
  m: Measurement
  hours: number
  onEdit: (m: Measurement) => void
  onDelete: (m: Measurement) => void
}) {
  const r = computeResult(m.counts, m.dilutionExp)
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{fmtDateTime(m.time)}</div>
          <span className="mt-0.5 inline-block rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500">
            +{fmtHours(hours)} h từ lần đo đầu
          </span>
        </div>
        <div className="shrink-0">
          <button type="button" className={ICON_BTN} onClick={() => onEdit(m)} aria-label="Sửa" title="Sửa">
            ✎
          </button>
          <button
            type="button"
            className={`${ICON_BTN_DANGER} ml-1.5`}
            onClick={() => onDelete(m)}
            aria-label="Xóa"
            title="Xóa"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[15px] tracking-wide">
        <span className="mr-1 font-sans text-xs font-normal tracking-normal text-slate-500">5 ô</span>
        {m.counts.join(' · ')}
      </div>

      <div className="mb-2.5 flex flex-wrap gap-1.5 text-xs text-slate-500">
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
          Σ <b className="font-mono text-slate-900">{fmtInt(r.total)}</b>
        </span>
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
          TB/ô <b className="font-mono text-slate-900">{trimZeros(r.avg.toFixed(1))}</b>
        </span>
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
          Pha loãng <b className="font-mono text-slate-900">10{sup(m.dilutionExp)}</b>
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-2 border-t border-slate-200 pt-2 text-[13px]">
        <span className="text-slate-500">N (TB/mL)</span>
        <span className="font-mono font-semibold text-blue-700">{fmtSci(r.concentration)}</span>
      </div>
      <div className="flex items-baseline justify-between gap-2 pt-1 text-[13px]">
        <span className="text-slate-500">log₁₀(N)</span>
        <span className="font-mono font-semibold text-slate-900">
          {r.log10 === null ? '—' : r.log10.toFixed(2)}
        </span>
      </div>
    </div>
  )
}
