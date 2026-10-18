import type { MeasurementInput } from '../types'
import { fmtDateTime, fmtSci } from '../calc'

interface Props {
  fileName: string
  inputs: MeasurementInput[]
  errors: string[]
  totalRows: number
  importing: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function ImportDialog({
  fileName,
  inputs,
  errors,
  totalRows,
  importing,
  onConfirm,
  onClose,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-title"
      onClick={e => {
        if (e.target === e.currentTarget && !importing) onClose()
      }}
    >
      <div className="max-h-[85dvh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 id="import-title" className="text-base font-bold text-slate-900">
            Nhập số liệu từ file
          </h2>
          <p className="mt-0.5 truncate text-xs text-slate-500" title={fileName}>
            {fileName} · quét {totalRows} dòng
          </p>
        </div>

        <div className="max-h-[55dvh] overflow-y-auto px-4 py-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-1 font-semibold text-green-700">
              ✓ {inputs.length} dòng hợp lệ
            </span>
            {errors.length > 0 && (
              <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700">
                ✕ {errors.length} dòng lỗi (sẽ bỏ qua)
              </span>
            )}
          </div>

          {inputs.length > 0 && (
            <>
              <p className="mb-1.5 mt-3 text-xs font-semibold text-slate-600">
                Xem trước {Math.min(inputs.length, 8)} / {inputs.length} dòng đầu:
              </p>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[420px] border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-left text-[11px] uppercase text-slate-500">
                      <th className="px-2 py-1.5">Ngày giờ</th>
                      <th className="px-2 py-1.5 text-right">5 ô</th>
                      <th className="px-2 py-1.5 text-right">Pha loãng</th>
                      <th className="px-2 py-1.5 text-right">N (TB/mL)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {inputs.slice(0, 8).map((m, i) => (
                      <tr key={i}>
                        <td className="whitespace-nowrap px-2 py-1.5">{fmtDateTime(m.time)}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono tabular-nums">
                          {m.counts.join('·')}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">10{m.dilutionExp}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-blue-700">
                          {fmtSci(m.concentration)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {inputs.length > 8 && (
                <p className="mt-1 text-[11px] text-slate-500">…và {inputs.length - 8} dòng nữa.</p>
              )}
            </>
          )}

          {errors.length > 0 && (
            <>
              <p className="mb-1.5 mt-3 text-xs font-semibold text-red-700">Các dòng bị bỏ qua:</p>
              <ul className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                {errors.slice(0, 20).map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
                {errors.length > 20 && <li>…và {errors.length - 20} lỗi nữa.</li>}
              </ul>
            </>
          )}

          {inputs.length === 0 && (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
              Không có dòng nào hợp lệ để nhập. Kiểm tra lại định dạng cột: thời gian, O1–O5, hệ số pha
              loãng.
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-4 py-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={importing || inputs.length === 0}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {importing ? 'Đang nhập…' : `Nhập ${inputs.length} dòng`}
          </button>
        </div>
      </div>
    </div>
  )
}
