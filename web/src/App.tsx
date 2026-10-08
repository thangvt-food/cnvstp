import { useCallback, useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import type { Measurement, MeasurementInput } from './types'
import {
  addMeasurement,
  deleteMeasurement,
  ensureMigrated,
  listMeasurements,
  signOut,
  updateMeasurement,
} from './firebase'
import { auth, isAdminEmail } from './firebase-config'
import { fmtDateTime } from './calc'
import EntryForm from './components/EntryForm'
import GrowthChart from './components/GrowthChart'
import DataTable from './components/DataTable'
import AuthScreen from './components/AuthScreen'

const CARD = 'rounded-xl border border-slate-200 bg-white p-4'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [items, setItems] = useState<Measurement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Measurement | null>(null)
  const [dbOk, setDbOk] = useState<boolean | null>(null)
  const [mergeMsg, setMergeMsg] = useState<string | null>(null)
  const [merging, setMerging] = useState(false)

  const reload = useCallback(async () => {
    if (!auth.currentUser) {
      setItems([])
      setLoading(false)
      return
    }
    try {
      const data = await listMeasurements(auth.currentUser.uid)
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
    // Merge TRƯỚC rồi mới tải — đảm bảo admin thấy đủ dữ liệu cũ ngay lần đầu,
    // không bao giờ hiện trang trống rồi mới merge xong ở nền.
    const unsub = onAuthStateChanged(auth, async u => {
      setUser(u)
      setAuthReady(true)
      if (!u) {
        setItems([])
        setEditing(null)
        setMergeMsg(null)
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const n = await ensureMigrated(u)
        if (n > 0) setMergeMsg(`Đã merge ${n} bản ghi cũ vào tài khoản admin (không mất dữ liệu).`)
      } catch {
        /* merge lỗi thì vẫn tải dữ liệu user bình thường */
      }
      await reload()
    })
    return unsub
  }, [reload])

  /** Nút merge thủ công cho admin (dự phòng khi auto-merge bị chặn mạng/rules). */
  const handleManualMerge = async () => {
    const u = auth.currentUser
    if (!u) return
    setMerging(true)
    setMergeMsg(null)
    try {
      const n = await ensureMigrated(u)
      await reload()
      setMergeMsg(
        n > 0
          ? `Đã merge thêm ${n} bản ghi cũ vào tài khoản admin.`
          : 'Không có bản ghi cũ nào còn thiếu — dữ liệu admin đã đầy đủ.',
      )
    } catch {
      setMergeMsg('Merge thất bại — kiểm tra mạng/rules rồi thử lại.')
    } finally {
      setMerging(false)
    }
  }

  const handleSave = async (input: MeasurementInput) => {
    const uid = auth.currentUser?.uid
    if (!uid) {
      setError('Phiên đăng nhập hết hạn — hãy đăng nhập lại.')
      throw new Error('no-auth')
    }
    setSaving(true)
    setError(null)
    try {
      if (editing) {
        await updateMeasurement(uid, editing.id, input)
        setEditing(null)
      } else {
        await addMeasurement(uid, input)
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
    const uid = auth.currentUser?.uid
    if (!uid) return
    if (!window.confirm(`Xóa lần đo lúc ${fmtDateTime(m.time)}?`)) return
    setError(null)
    try {
      await deleteMeasurement(uid, m.id)
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

  const handleLogout = async () => {
    await signOut()
    setUser(null)
    setItems([])
    setEditing(null)
    setMergeMsg(null)
    setDbOk(null)
  }

  if (!authReady) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 text-sm text-slate-500">
        Đang kiểm tra phiên đăng nhập…
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-dvh bg-slate-50">
        <AuthScreen onDone={m => m > 0 && setMergeMsg(`Đã merge ${m} bản ghi cũ vào tài khoản admin.`)} />
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-[15px] text-slate-900">
      <div className="mx-auto w-full max-w-5xl px-3 pb-[calc(2.5rem_+_env(safe-area-inset-bottom))] sm:px-4">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4">
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight sm:text-xl">Đếm tế bào nấm men</h1>
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
              Buồng đếm hồng cầu Neubauer · 5 ô × 16 ô nhỏ · biểu đồ log₁₀ / CFU/mL
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  dbOk === null ? 'bg-slate-400' : dbOk ? 'bg-green-600' : 'bg-red-600'
                }`}
              />
              {dbOk === null ? 'Đang kết nối…' : dbOk ? 'CSDL trực tuyến' : 'Mất kết nối CSDL'}
            </span>
            <span
              className="max-w-44 truncate rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700"
              title={user.email ?? ''}
            >
              {user.displayName || user.email}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-600 hover:border-red-400 hover:text-red-600"
            >
              Đăng xuất
            </button>
          </div>
        </header>

        {isAdminEmail(user.email) && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
            <span>
              Tài khoản admin: đang giữ <b className="font-mono">{items.length}</b> bản ghi.
            </span>
            <button
              type="button"
              onClick={handleManualMerge}
              disabled={merging || loading}
              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-60"
            >
              {merging ? 'Đang merge…' : 'Merge dữ liệu cũ ngay'}
            </button>
          </div>
        )}
        {mergeMsg && (
          <div className="mb-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-800">
            {mergeMsg}
          </div>
        )}
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
            nhỏ = 2,5×10⁻⁴ µL. Mỗi tài khoản chỉ thấy số liệu của chính mình.
          </p>
        </footer>
      </div>
    </div>
  )
}
