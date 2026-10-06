import { useCallback, useEffect, useState } from 'react'
import type { Measurement, MeasurementInput } from './types'
import { addMeasurement, deleteMeasurement, listMeasurements, updateMeasurement } from './firebase'
import { fmtDateTime } from './calc'
import EntryForm from './components/EntryForm'
import GrowthChart from './components/GrowthChart'
import DataTable from './components/DataTable'

const CARD = 'rounded-xl border border-slate-200 bg-white p-4'

export default function App() {
  const [items, setItems] = useState<Measurement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Measurement | null>(null)
  const [dbOk, setDbOk] = useState<boolean | null>(null)

  const reload = useCallback(async () => {
    try {
      const data = await listMeasurements()
      setItems(data)
      setDbOk(true)
    } catch {
      setDbOk(false)
      setError('Không tải được số liệu từ cơ sở dữ liệu — kiểm tra kết nối mạng rồi tải lại trang.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleSave = async (input: MeasurementInput) => {
    setSaving(true)
    setError(null)
    try {
      if (editing) {
        await updateMeasurement(editing.id, input)
        setEditing(null)
      } else {
        await addMeasurement(input)
      }
      await reload()
    } catch {
      setDbOk(false)
      setError('Lưu không thành công — kiểm tra kết nối mạng rồi bấm lưu lại. Số liệu vẫn còn nguyên trong form.')
      throw new Error('save-failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (m: Measurement) => {
    if (!window.confirm(`Xóa lần đo lúc ${fmtDateTime(m.time)}?`)) return
    setError(null)
    try {
      await deleteMeasurement(m.id)
      await reload()
    } catch {
      setDbOk(false)
      setError('Xóa không thành công — kiểm tra kết nối mạng rồi thử lại.')
    }
  }

  const handleEdit = (m: Measurement) => {
    setEditing(m)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-[15px] text-slate-900">
      <div className="mx-auto w-full max-w-5xl px-3 pb-[calc(2.5rem_+_env(safe-area-inset-bottom))] sm:px-4">
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-4">
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight sm:text-xl">Đếm tế bào nấm men</h1>
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
              Buồng đếm hồng cầu Neubauer · 5 ô × 16 ô nhỏ · biểu đồ log₁₀
            </p>
          </div>
          <div className="inline-flex items-center gap-2 text-xs text-slate-500">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                dbOk === null ? 'bg-slate-400' : dbOk ? 'bg-green-600' : 'bg-red-600'
              }`}
            />
            {dbOk === null ? 'Đang kết nối…' : dbOk ? 'CSDL trực tuyến' : 'Mất kết nối CSDL'}
          </div>
        </header>

        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="p-6 text-center text-sm text-slate-500">Đang tải số liệu…</div>
        ) : (
          <main className="grid gap-3 md:grid-cols-[2fr_3fr] md:items-start md:gap-4">
            <section className={CARD}>
              <h2 className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold">
                Nhập số liệu
                {editing && (
                  <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs font-normal text-slate-500">
                    đang sửa: {fmtDateTime(editing.time)}
                  </span>
                )}
              </h2>
              <EntryForm
                saving={saving}
                editing={editing}
                onSave={handleSave}
                onCancelEdit={() => setEditing(null)}
              />
            </section>

            <section className={`${CARD} min-w-0`}>
              <h2 className="mb-3 text-sm font-semibold">Đường cong sinh trưởng</h2>
              <GrowthChart items={items} />
            </section>

            <section className={`${CARD} md:col-span-2`}>
              <h2 className="mb-3 text-sm font-semibold">Nhật ký số liệu</h2>
              <DataTable items={items} onEdit={handleEdit} onDelete={handleDelete} />
            </section>
          </main>
        )}

        <footer className="mt-6 border-t border-slate-200 pt-3 text-xs text-slate-500">
          <p className="my-1">
            Công thức:{' '}
            <span className="font-mono">
              N (tế bào/mL) = (Σ tế bào ÷ 80 ô nhỏ) × 4000 × 1000 × hệ số pha loãng
            </span>
          </p>
          <p className="my-1">
            Buồng đếm Neubauer sâu 0,1 mm: 5 ô đếm, mỗi ô 16 ô nhỏ 0,05 × 0,05 mm → 80 ô nhỏ; thể tích 1 ô
            nhỏ = 2,5×10⁻⁴ µL.
          </p>
        </footer>
      </div>
    </div>
  )
}
