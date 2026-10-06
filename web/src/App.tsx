import { useCallback, useEffect, useState } from 'react'
import type { Measurement, MeasurementInput } from './types'
import { addMeasurement, deleteMeasurement, listMeasurements, updateMeasurement } from './firebase'
import { fmtDateTime } from './calc'
import EntryForm from './components/EntryForm'
import GrowthChart from './components/GrowthChart'
import DataTable from './components/DataTable'

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
    <div className="page">
      <header className="app-header">
        <div>
          <h1>Đếm tế bào nấm men</h1>
          <p className="subtitle">Buồng đếm hồng cầu Neubauer · 5 ô lớn × 16 ô nhỏ · biểu đồ log₁₀</p>
        </div>
        <div className={`status ${dbOk === null ? 'checking' : dbOk ? 'ok' : 'err'}`}>
          <span className="dot" />
          {dbOk === null ? 'Đang kết nối…' : dbOk ? 'CSDL trực tuyến' : 'Mất kết nối CSDL'}
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}

      {loading ? (
        <div className="loading">Đang tải số liệu…</div>
      ) : (
        <main className="layout">
          <section className="card">
            <h2>
              Nhập số liệu{' '}
              {editing && <span className="tag">đang sửa: {fmtDateTime(editing.time)}</span>}
            </h2>
            <EntryForm saving={saving} editing={editing} onSave={handleSave} onCancelEdit={() => setEditing(null)} />
          </section>

          <section className="card">
            <h2>Đường cong sinh trưởng</h2>
            <GrowthChart items={items} />
          </section>

          <section className="card span-all">
            <h2>Nhật ký số liệu</h2>
            <DataTable items={items} onEdit={handleEdit} onDelete={handleDelete} />
          </section>
        </main>
      )}

      <footer className="app-footer">
        <p>
          Công thức: <span className="mono">N (tế bào/mL) = (Σ tế bào 5 ô lớn ÷ 5) × 10⁴ × hệ số pha loãng</span>
        </p>
        <p>Buồng đếm Neubauer: ô lớn 1 mm², độ sâu buồng 0,1 mm → thể tích 1 ô lớn = 0,1 µL = 10⁻⁴ mL.</p>
      </footer>
    </div>
  )
}
