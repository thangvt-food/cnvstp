import { useCallback, useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import type { Measurement, MeasurementInput } from './types'
import {
  addMeasurement,
  countPending,
  deleteMeasurement,
  dropAddOp,
  enqueueOp,
  ensureMigrated,
  flushOutbox,
  listMeasurements,
  loadOutbox,
  signOut,
  updateAddOpData,
  updateMeasurement,
} from './firebase'
import { auth, isAdminEmail } from './firebase-config'
import { fmtDateTime, parseLocal } from './calc'
import EntryForm from './components/EntryForm'
import GrowthChart from './components/GrowthChart'
import DataTable from './components/DataTable'
import AuthScreen from './components/AuthScreen'

const CARD = 'rounded-xl border border-slate-200 bg-white p-4'

const byTimeDesc = (a: Measurement, b: Measurement) => parseLocal(b.time) - parseLocal(a.time)

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
  const [online, setOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [netMsg, setNetMsg] = useState<string | null>(null)

  const refreshPending = useCallback(() => {
    const u = auth.currentUser
    setPending(u ? countPending(u.uid) : 0)
  }, [])

  const reload = useCallback(async () => {
    const u = auth.currentUser
    if (!u) {
      setItems([])
      setLoading(false)
      return
    }
    try {
      const data = await listMeasurements(u.uid)
      setItems(data)
      setDbOk(true)
      refreshPending()
    } catch {
      setDbOk(false)
      if (!navigator.onLine) {
        // Ngoại tuyến: hiện các bản ghi đang chờ đồng bộ để user vẫn thấy việc mình làm
        const queued = loadOutbox()
          .filter(o => o.uid === u.uid && o.type === 'add' && o.data)
          .map(o => ({ ...(o.data as MeasurementInput), id: o.clientTempId ?? o.id }))
          .sort(byTimeDesc)
        setItems(queued)
        setError(null)
        setNetMsg('Đang ngoại tuyến — số liệu mới lưu tạm trên máy, sẽ tự đẩy lên CSDL khi có mạng.')
      } else {
        setError('Không tải được số liệu từ cơ sở dữ liệu — kiểm tra kết nối mạng rồi tải lại trang.')
      }
    } finally {
      setLoading(false)
    }
  }, [refreshPending])

  /** Đẩy hàng đợi offline lên CSDL rồi tải lại. */
  const syncNow = useCallback(async () => {
    const u = auth.currentUser
    if (!u || !navigator.onLine) return
    if (countPending(u.uid) === 0) {
      setPending(0)
      return
    }
    setSyncing(true)
    try {
      const { done, failed } = await flushOutbox(u.uid)
      setPending(countPending(u.uid))
      if (done > 0) {
        setNetMsg(`Đã đồng bộ ${done} thao tác offline lên CSDL.`)
        await reload()
      }
      if (failed > 0) {
        setNetMsg('Còn thao tác chưa đồng bộ được — sẽ tự thử lại khi mạng ổn định.')
      }
    } finally {
      setSyncing(false)
    }
  }, [reload])

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
        setNetMsg(null)
        setPending(0)
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
      await syncNow()
    })
    return unsub
  }, [reload, syncNow])

  // Theo dõi mạng thật: offline → pill "Ngoại tuyến", online lại → tự đồng bộ
  useEffect(() => {
    const goOnline = () => {
      setOnline(true)
      setDbOk(true)
      setNetMsg(null)
      void syncNow()
    }
    const goOffline = () => {
      setOnline(false)
      setDbOk(false)
      setError(null) // tránh banner đỏ gây hoang mang khi chỉ là rớt mạng
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [syncNow])

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

  /** Lưu tạm khi offline (hoặc khi ghi online thất bại): cập nhật UI ngay + xếp hàng đợi. */
  const saveOffline = (uid: string, input: MeasurementInput) => {
    if (editing) {
      if (editing.id.startsWith('local-')) {
        updateAddOpData(editing.id, input)
        setItems(prev =>
          prev.map(x => (x.id === editing.id ? { ...input, id: editing.id } : x)).sort(byTimeDesc),
        )
      } else {
        enqueueOp({ uid, type: 'update', measurementId: editing.id, data: input })
        setItems(prev =>
          prev.map(x => (x.id === editing.id ? { ...input, id: editing.id } : x)).sort(byTimeDesc),
        )
      }
      setEditing(null)
    } else {
      const tempId = `local-${Date.now()}`
      enqueueOp({ uid, type: 'add', clientTempId: tempId, data: input })
      setItems(prev => [...prev, { ...input, id: tempId }].sort(byTimeDesc))
    }
    refreshPending()
    setNetMsg('Đã lưu tạm (ngoại tuyến) — sẽ tự đẩy lên CSDL khi có mạng trở lại.')
  }

  const handleSave = async (input: MeasurementInput) => {
    const uid = auth.currentUser?.uid
    if (!uid) {
      setError('Phiên đăng nhập hết hạn — hãy đăng nhập lại.')
      throw new Error('no-auth')
    }
    if (!navigator.onLine) {
      saveOffline(uid, input)
      return
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
      // Rớt mạng giữa chừng (trình duyệt vẫn báo online): giữ số liệu bằng hàng đợi
      setDbOk(false)
      saveOffline(uid, input)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (m: Measurement) => {
    const uid = auth.currentUser?.uid
    if (!uid) return
    if (!window.confirm(`Xóa lần đo lúc ${fmtDateTime(m.time)}?`)) return
    setError(null)
    if (!navigator.onLine) {
      if (m.id.startsWith('local-')) dropAddOp(m.id)
      else enqueueOp({ uid, type: 'delete', measurementId: m.id })
      setItems(prev => prev.filter(x => x.id !== m.id))
      refreshPending()
      setNetMsg('Đã xóa tạm (ngoại tuyến) — sẽ đồng bộ khi có mạng trở lại.')
      return
    }
    try {
      await deleteMeasurement(uid, m.id)
      await reload()
    } catch {
      setDbOk(false)
      if (m.id.startsWith('local-')) dropAddOp(m.id)
      else enqueueOp({ uid, type: 'delete', measurementId: m.id })
      setItems(prev => prev.filter(x => x.id !== m.id))
      refreshPending()
      setNetMsg('Xóa chưa tới được CSDL — đã xếp hàng đợi, sẽ đồng bộ khi mạng ổn định.')
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
    setNetMsg(null)
    setPending(0)
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
        <header className="py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-700 to-cyan-500 text-white shadow-md shadow-blue-600/20">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <circle cx="12" cy="12" r="8.5" />
                <circle cx="9.2" cy="10.2" r="1.4" fill="currentColor" stroke="none" />
                <circle cx="14.2" cy="9.2" r="1" fill="currentColor" stroke="none" />
                <circle cx="13.2" cy="14.2" r="1.6" fill="currentColor" stroke="none" />
                <circle cx="9.4" cy="14.8" r="0.9" fill="currentColor" stroke="none" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">
                Buồng đếm hồng cầu Neubauer
              </p>
              <h1 className="truncate text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
                Đếm tế bào nấm men
              </h1>
            </div>
            <span
              className={`inline-flex h-8 shrink-0 items-center gap-1.5 self-start rounded-full border px-3 text-xs font-medium shadow-sm sm:self-center ${
                !online
                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
              title={
                !online
                  ? 'Không có mạng — số liệu lưu tạm trên máy, tự đồng bộ khi online'
                  : 'Trạng thái kết nối CSDL'
              }
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  !online ? 'bg-amber-500' : dbOk === null ? 'bg-slate-400' : dbOk ? 'bg-green-600' : 'bg-red-600'
                }`}
              />
              {!online ? 'Ngoại tuyến' : dbOk === null ? 'Đang kết nối…' : dbOk ? 'Trực tuyến' : 'Mất kết nối'}
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {['5 ô × 16 ô nhỏ', 'Sâu 0,1 mm · 80 ô nhỏ', 'Biểu đồ log₁₀ / CFU/mL'].map(c => (
              <span
                key={c}
                className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
              >
                {c}
              </span>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex h-8 max-w-[240px] items-center gap-1.5 rounded-full border border-slate-200 bg-white py-0 pl-1 pr-3 text-xs shadow-sm"
              title={user.email ?? ''}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                {(user.displayName || user.email || '?').trim().charAt(0).toUpperCase()}
              </span>
              <span className="truncate font-medium text-slate-700">
                {user.displayName || user.email}
              </span>
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500 shadow-sm hover:border-red-300 hover:bg-red-50 hover:text-red-600"
            >
              <span aria-hidden>⏻</span> Đăng xuất
            </button>
          </div>
        </header>

        {!online && (
          <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <svg
              viewBox="0 0 24 24"
              className="mt-0.5 h-5 w-5 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <line x1="2" y1="2" x2="22" y2="22" />
              <path d="M8.5 16.5a5 5 0 0 1 7 0" />
              <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
              <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
              <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
              <path d="M5 13a10 10 0 0 1 5.24-2.76" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
            <div className="min-w-0">
              <p className="font-semibold">Bạn đang ngoại tuyến — cứ dùng bình thường nhé.</p>
              <p className="mt-0.5 text-[13px] leading-relaxed">
                Nhập, sửa, xóa số liệu vẫn chạy; mọi thay đổi được lưu tạm trên máy và{' '}
                <b>tự đẩy lên CSDL</b> ngay khi có mạng trở lại — không mất dữ liệu.
                {pending > 0 && (
                  <>
                    {' '}Hiện có <b className="font-mono">{pending}</b> thao tác đang chờ đồng bộ.
                  </>
                )}
              </p>
            </div>
          </div>
        )}
        {pending > 0 && online && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
            <span>
              Còn <b className="font-mono">{pending}</b> thao tác offline chưa đồng bộ.
            </span>
            <button
              type="button"
              onClick={() => void syncNow()}
              disabled={syncing}
              className="inline-flex min-h-9 items-center justify-center rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {syncing ? 'Đang đồng bộ…' : 'Đồng bộ ngay'}
            </button>
          </div>
        )}
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
        {netMsg && (
          <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
            {netMsg}
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
