import { useMemo, useRef, useState } from 'react'
import type { Measurement, MeasurementInput } from '../types'
import { computeResult, fmtDateTime, fmtHours, fmtInt, fmtSci, parseLocal, sup, trimZeros } from '../calc'
import { buildExportCsv, parseImportText } from '../csv'
import ImportDialog from './ImportDialog'

const TH =
  'whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500'
const TD = 'whitespace-nowrap px-2.5 py-2'
const TD_NUM = 'whitespace-nowrap px-2.5 py-2 text-right font-mono tabular-nums'
const ICON_BTN =
  'inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:border-blue-600 hover:text-blue-600'
const ICON_BTN_DANGER =
  'inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-red-600 hover:border-red-600'
/** Nút icon gọn cho list mobile */
const ICON_SM =
  'inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-sm text-slate-500 hover:border-blue-600 hover:text-blue-600'
const ICON_SM_DANGER =
  'inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-sm text-red-600 hover:border-red-600'

interface Props {
  items: Measurement[]
  onEdit: (m: Measurement) => void
  onDelete: (m: Measurement) => void
  onImport: (inputs: MeasurementInput[]) => Promise<void>
}

interface DayGroup {
  key: string // "YYYY-MM-DD"
  rows: Measurement[]
}

/** "2026-10-06" → { label: "Thứ Hai · 06/10/2026", today: false } */
function fmtDay(key: string): { label: string; today: boolean } {
  const [y, mo, d] = key.split('-').map(Number)
  const date = new Date(y, mo - 1, d)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000)
  const wd = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'][date.getDay()]
  const ddmm = `${String(d).padStart(2, '0')}/${String(mo).padStart(2, '0')}/${y}`
  if (diff === 0) return { label: `Hôm nay · ${ddmm}`, today: true }
  if (diff === -1) return { label: `Hôm qua · ${ddmm}`, today: false }
  return { label: `${wd} · ${ddmm}`, today: false }
}

/** "2026-10-06T09:40" → "09:40" */
function fmtHM(local: string): string {
  return local.split('T')[1] ?? local
}

/** "2026-10-06T09:40" → "06/10/2026" */
function fmtD(local: string): string {
  return fmtDateTime(local).split(' ')[0] ?? local
}

export default function DataTable({ items, onEdit, onDelete, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<{
    fileName: string
    inputs: MeasurementInput[]
    errors: string[]
    totalRows: number
  } | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const t0 = useMemo(
    () => (items.length > 0 ? Math.min(...items.map(m => parseLocal(m.time))) : 0),
    [items],
  )

  /** Mới nhất lên trước */
  const sorted = useMemo(
    () => [...items].sort((a, b) => parseLocal(b.time) - parseLocal(a.time)),
    [items],
  )

  /** Gom theo ngày (giữ thứ tự mới → cũ) */
  const groups = useMemo<DayGroup[]>(() => {
    const out: DayGroup[] = []
    for (const m of sorted) {
      const key = m.time.slice(0, 10)
      const last = out[out.length - 1]
      if (last && last.key === key) last.rows.push(m)
      else out.push({ key, rows: [m] })
    }
    return out
  }, [sorted])

  const exportCsv = () => {
    const csv = buildExportCsv(
      sorted.map(m => ({
        time: m.time,
        counts: m.counts,
        dilutionExp: m.dilutionExp,
        hours: (parseLocal(m.time) - t0) / 3600000,
      })),
    )
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'cnvstp-dem-te-bao.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleFile = async (f: File | undefined) => {
    if (!f) return
    setImportMsg(null)
    try {
      const text = await f.text()
      const { inputs, errors, totalRows } = parseImportText(text)
      if (totalRows === 0 && errors.length > 0) {
        setImportMsg(errors[0])
        return
      }
      setPreview({ fileName: f.name, inputs, errors, totalRows })
    } catch {
      setImportMsg('Không đọc được file — hãy thử file .csv khác.')
    }
  }

  const handleConfirmImport = async () => {
    if (!preview || preview.inputs.length === 0) return
    setImporting(true)
    try {
      await onImport(preview.inputs)
      setPreview(null)
      setImportMsg(`Đã nhập ${preview.inputs.length} dòng từ file.`)
    } catch {
      setImportMsg('Nhập thất bại — kiểm tra mạng rồi thử lại.')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const newest = sorted.length > 0 ? fmtD(sorted[0].time) : ''
  const oldest = sorted.length > 0 ? fmtD(sorted[sorted.length - 1].time) : ''
  const isEmpty = items.length === 0

  return (
    <div>
      {/* Header gọn: tổng quan bên trái, Nhập + Xuất bên phải */}
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-slate-500">
          {isEmpty ? (
            <>Chưa có lần đo nào được lưu.</>
          ) : (
            <>
              Tổng <b className="font-mono text-slate-900">{items.length}</b> lần đo
              <span className="hidden sm:inline">
                {' '}
                · {oldest} → {newest}
              </span>
            </>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="hidden"
            aria-label="Chọn file CSV để nhập"
            onChange={e => {
              void handleFile(e.target.files?.[0])
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Nhập CSV
          </button>
          {!isEmpty && (
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 hover:bg-slate-100"
            >
              Xuất CSV
            </button>
          )}
        </div>
      </div>
      {importMsg && (
        <div className="mb-2.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          {importMsg}
        </div>
      )}
      {preview && (
        <ImportDialog
          fileName={preview.fileName}
          inputs={preview.inputs}
          errors={preview.errors}
          totalRows={preview.totalRows}
          importing={importing}
          onConfirm={() => void handleConfirmImport()}
          onClose={() => {
            if (!importing) {
              setPreview(null)
              if (fileRef.current) fileRef.current.value = ''
            }
          }}
        />
      )}
      {isEmpty && !preview ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-7 text-center text-sm text-slate-500">
          Chưa có lần đo nào được lưu — bấm <b>Nhập CSV</b> để tải file xuất ra trước đây, hoặc nhập tay ở
          biểu mẫu bên trên.
        </div>
      ) : (
        <>
      {/* Desktop: bảng + vạch phân ngày */}
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
            {groups.map(g => {
              const { label, today } = fmtDay(g.key)
              return (
                <DayRows
                  key={g.key}
                  label={label}
                  today={today}
                  count={g.rows.length}
                  rows={g.rows}
                  t0={t0}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: list gọn theo ngày, không còn card rời */}
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 md:hidden">
        {groups.map(g => {
          const { label, today } = fmtDay(g.key)
          return (
            <li key={g.key}>
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5">
                {today && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />}
                <span className="truncate text-xs font-bold text-slate-700">{label}</span>
                <span className="ml-auto shrink-0 rounded-full border border-slate-200 bg-white px-1.5 py-px text-[11px] text-slate-500">
                  {g.rows.length} lần đo
                </span>
              </div>
              <ul className="divide-y divide-slate-100">
                {g.rows.map(m => (
                  <MobileRow key={m.id} m={m} hours={(parseLocal(m.time) - t0) / 3600000} onEdit={onEdit} onDelete={onDelete} />
                ))}
              </ul>
            </li>
          )
        })}
      </ul>

      <p className="mt-2 text-xs text-slate-500">
        Cột "Giờ": giờ kể từ lần đo đầu tiên (hệ thống tự tính từ thời gian bạn nhập). File nhập:
        CSV ngăn cách bằng <b className="font-mono">;</b> (đúng định dạng file Xuất ra) — các cột tính toán
        (Σ, N, log) sẽ tự tính lại, cột thừa tự bỏ qua.
      </p>
        </>
      )}
    </div>
  )
}

/** Vạch phân ngày + các dòng số liệu (desktop) */
function DayRows({
  label,
  today,
  count,
  rows,
  t0,
  onEdit,
  onDelete,
}: {
  label: string
  today: boolean
  count: number
  rows: Measurement[]
  t0: number
  onEdit: (m: Measurement) => void
  onDelete: (m: Measurement) => void
}) {
  return (
    <>
      <tr className="bg-slate-50">
        <td colSpan={9} className="px-2.5 py-1.5">
          <span className="inline-flex items-center gap-2 text-xs">
            {today && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}
            <b className="text-slate-700">{label}</b>
            <span className="text-slate-400">· {count} lần đo</span>
          </span>
        </td>
      </tr>
      {rows.map(m => {
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
    </>
  )
}

/** 1 dòng list mobile: giờ + số liệu trái, N/log phải, thao tác gọn */
function MobileRow({
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
    <li className="flex items-center gap-2 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-bold tabular-nums">{fmtHM(m.time)}</span>
          <span className="text-[11px] text-slate-400">+{fmtHours(hours)} h</span>
        </div>
        <div className="mt-0.5 truncate font-mono text-xs tabular-nums text-slate-500">
          {m.counts.join(' · ')}
        </div>
        <div className="mt-0.5 text-[11px] text-slate-400">
          Σ <b className="font-mono text-slate-600">{fmtInt(r.total)}</b>
          {' · '}TB/ô <b className="font-mono text-slate-600">{trimZeros(r.avg.toFixed(1))}</b>
          {' · '}10{sup(m.dilutionExp)}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-sm font-bold tabular-nums text-blue-700">
          {fmtSci(r.concentration)}
        </div>
        <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500">
          log {r.log10 === null ? '—' : r.log10.toFixed(2)}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <button type="button" className={ICON_SM} onClick={() => onEdit(m)} aria-label="Sửa" title="Sửa">
          ✎
        </button>
        <button
          type="button"
          className={ICON_SM_DANGER}
          onClick={() => onDelete(m)}
          aria-label="Xóa"
          title="Xóa"
        >
          ✕
        </button>
      </div>
    </li>
  )
}
