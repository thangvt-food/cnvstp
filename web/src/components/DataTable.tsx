import { useMemo } from 'react'
import type { Measurement } from '../types'
import { computeResult, fmtDateTime, fmtHours, fmtInt, fmtSci, parseLocal, sup, trimZeros } from '../calc'

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
    return <div className="empty">Chưa có lần đo nào được lưu.</div>
  }

  return (
    <div>
      <div className="table-actions">
        <button type="button" className="btn ghost small" onClick={exportCsv}>
          Xuất CSV
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ngày giờ</th>
              <th>Giờ</th>
              <th>5 ô (1→5)</th>
              <th>Σ</th>
              <th>TB/ô</th>
              <th>Pha loãng</th>
              <th>N (TB/mL)</th>
              <th>log₁₀</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map(m => {
              const r = computeResult(m.counts, m.dilutionExp)
              const h = (parseLocal(m.time) - t0) / 3600000
              return (
                <tr key={m.id}>
                  <td>{fmtDateTime(m.time)}</td>
                  <td className="num">{fmtHours(h)}</td>
                  <td className="num">{m.counts.join('·')}</td>
                  <td className="num">{fmtInt(r.total)}</td>
                  <td className="num">{trimZeros(r.avg.toFixed(1))}</td>
                  <td className="num">10{sup(m.dilutionExp)}</td>
                  <td className="num">{fmtSci(r.concentration)}</td>
                  <td className="num">{r.log10 === null ? '—' : r.log10.toFixed(2)}</td>
                  <td className="row-actions">
                    <button type="button" className="icon-btn" onClick={() => onEdit(m)} aria-label="Sửa" title="Sửa">
                      ✎
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
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
      <p className="chart-caption">Cột "Giờ": giờ kể từ lần đo đầu tiên (hệ thống tự tính từ thời gian bạn nhập).</p>
    </div>
  )
}
