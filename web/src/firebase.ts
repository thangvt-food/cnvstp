import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { get, push, ref, remove, set, update } from 'firebase/database'
import { auth, db, googleProvider, isAdminEmail, normalizeLoginId } from './firebase-config'
import type { Measurement, MeasurementInput } from './types'

const userPath = (uid: string) => `users/${uid}/measurements`
const profilePath = (uid: string) => `users/${uid}/profile`

// ---------- Auth ----------

export async function signUpEmail(loginId: string, password: string, displayName?: string): Promise<User> {
  const email = normalizeLoginId(loginId)
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  if (displayName?.trim()) {
    await updateProfile(cred.user, { displayName: displayName.trim() }).catch(() => undefined)
  }
  await touchProfile(cred.user)
  await ensureMigrated(cred.user)
  return cred.user
}

export async function signInEmail(loginId: string, password: string): Promise<{ user: User; migrated: number }> {
  const email = normalizeLoginId(loginId)
  const cred = await signInWithEmailAndPassword(auth, email, password)
  await touchProfile(cred.user)
  const migrated = await ensureMigrated(cred.user)
  return { user: cred.user, migrated }
}

export async function signInGoogle(): Promise<{ user: User; migrated: number }> {
  const cred = await signInWithPopup(auth, googleProvider)
  await touchProfile(cred.user)
  const migrated = await ensureMigrated(cred.user)
  return { user: cred.user, migrated }
}

export function signOut(): Promise<void> {
  return fbSignOut(auth)
}

/** Lưu/cập nhật hồ sơ tối thiểu để dễ nhận diện user trong DB. */
async function touchProfile(user: User): Promise<void> {
  try {
    await update(ref(db, profilePath(user.uid)), {
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      photoURL: user.photoURL ?? null,
      lastLoginAt: new Date().toISOString(),
    })
  } catch {
    /* rules chưa deploy thì bỏ qua — không chặn login */
  }
}

// ---------- CRUD theo từng user (sau login lưu đúng như cũ, chỉ khác đường dẫn) ----------

function toList(data: Record<string, MeasurementInput> | null): Measurement[] {
  if (!data) return []
  return Object.entries(data)
    .filter(([, v]) => v && typeof v === 'object' && typeof (v as MeasurementInput).time === 'string')
    .map(([id, v]) => ({ ...(v as MeasurementInput), id }))
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
}

export async function listMeasurements(uid: string): Promise<Measurement[]> {
  const snap = await get(ref(db, userPath(uid)))
  return toList(snap.val() as Record<string, MeasurementInput> | null)
}

export async function addMeasurement(uid: string, m: MeasurementInput): Promise<string> {
  const r = await push(ref(db, userPath(uid)), m)
  return r.key as string
}

export async function updateMeasurement(uid: string, id: string, m: MeasurementInput): Promise<void> {
  await update(ref(db, `${userPath(uid)}/${id}`), m as unknown as Record<string, unknown>)
}

export async function deleteMeasurement(uid: string, id: string): Promise<void> {
  await remove(ref(db, `${userPath(uid)}/${id}`))
}

// ---------- Merge dữ liệu legacy (KHÔNG xóa nhánh cũ) ----------

/** Đọc nhánh legacy /measurements (dữ liệu trước khi có login). */
export async function fetchLegacyMeasurements(): Promise<Measurement[]> {
  const snap = await get(ref(db, 'measurements'))
  return toList(snap.val() as Record<string, MeasurementInput> | null)
}

function dedupKey(m: MeasurementInput): string {
  return [m.time, m.total, m.avg, m.concentration, m.dilutionExp, (m.counts ?? []).join(',')].join('|')
}

/**
 * Merge dữ liệu legacy vào tài khoản ADMIN (admin@cnvstp.local).
 * - User thường: KHÔNG merge, bắt đầu với sổ tay trống.
 * - Admin: copy những bản ghi legacy còn thiếu (so khớp time+tổng+counts)
 *   vào users/{uid}/measurements. Nhánh /measurements được GIỮ NGUYÊN
 *   nên không bao giờ mất dữ liệu. Chạy lại nhiều lần cũng không trùng.
 * @returns số bản ghi vừa được merge thêm
 */
/**
 * Chặn merge chạy chồng nhau trong cùng 1 phiên (vd signIn + onAuthStateChanged
 * cùng gọi lúc login → cả 2 đọc danh sách rỗng rồi cùng push gây trùng lặp).
 * Lần gọi sau sẽ dùng chung promise đang chạy thay vì merge riêng.
 */
const mergeInFlight = new Map<string, Promise<number>>()

export function ensureMigrated(user: User): Promise<number> {
  const running = mergeInFlight.get(user.uid)
  if (running) return running
  const p = doMerge(user).finally(() => {
    if (mergeInFlight.get(user.uid) === p) mergeInFlight.delete(user.uid)
  })
  mergeInFlight.set(user.uid, p)
  return p
}

async function doMerge(user: User): Promise<number> {
  if (!isAdminEmail(user.email)) return 0
  try {
    const [mine, legacy] = await Promise.all([
      listMeasurements(user.uid),
      fetchLegacyMeasurements(),
    ])
    if (legacy.length === 0) return 0
    const seen = new Set(mine.map(dedupKey))
    let added = 0
    for (const m of legacy) {
      const { id: _omit, ...input } = m
      const clean: MeasurementInput = {
        time: input.time,
        counts: input.counts,
        dilutionExp: input.dilutionExp,
        total: input.total,
        avg: input.avg,
        concentration: input.concentration,
      }
      if (seen.has(dedupKey(clean))) continue
      await push(ref(db, userPath(user.uid)), clean)
      seen.add(dedupKey(clean))
      added += 1
    }
    if (added > 0) {
      await set(ref(db, `${profilePath(user.uid)}/lastMergeAt`), new Date().toISOString()).catch(
        () => undefined,
      )
    }
    return added
  } catch {
    // VD rules chưa cho đọc nhánh legacy → trả 0, app vẫn dùng được dữ liệu user
    return 0
  }
}

/** Dịch mã lỗi Firebase Auth sang tiếng Việt ngắn gọn. */
export function authErrorMessage(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Email này đã có tài khoản — hãy đăng nhập thay vì tạo mới.'
    case 'auth/invalid-email':
      return 'Email chưa đúng định dạng.'
    case 'auth/weak-password':
      return 'Mật khẩu quá yếu (tối thiểu 6 ký tự).'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Sai tài khoản hoặc mật khẩu — kiểm tra lại email rồi thử lại.'
    case 'auth/popup-closed-by-user':
      return 'Bạn đã đóng cửa sổ Google — hãy thử lại.'
    case 'auth/unauthorized-domain':
      return 'Domain này chưa được cho phép (Firebase > Authentication > Authorized domains).'
    case 'auth/operation-not-allowed':
      return 'Chưa bật phương thức đăng nhập này trong Firebase Console.'
    case 'auth/network-request-failed':
      return 'Lỗi mạng — kiểm tra kết nối rồi thử lại.'
    default:
      return `Đăng nhập thất bại (${code}).`
  }
}

// ---------- Outbox offline: hàng đợi localStorage, tự push khi online ----------

export interface OutboxOp {
  id: string
  uid: string
  type: 'add' | 'update' | 'delete'
  /** id tạm phía client cho bản ghi thêm lúc offline (dạng "local-...") */
  clientTempId?: string
  measurementId?: string
  data?: MeasurementInput
  createdAt: string
}

const OUTBOX_KEY = 'cnvstp-outbox-v1'

export function loadOutbox(): OutboxOp[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as OutboxOp[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function persistOutbox(ops: OutboxOp[]): void {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(ops))
  } catch {
    /* bộ nhớ đầy thì bỏ qua — dữ liệu server vẫn nguyên */
  }
}

export function enqueueOp(op: Omit<OutboxOp, 'id' | 'createdAt'>): OutboxOp {
  const full: OutboxOp = {
    ...op,
    id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  }
  persistOutbox([...loadOutbox(), full])
  return full
}

export function dropOp(id: string): void {
  persistOutbox(loadOutbox().filter(o => o.id !== id))
}

/** Sửa data của op "add" đang chờ (user sửa bản ghi vừa thêm lúc offline). */
export function updateAddOpData(clientTempId: string, data: MeasurementInput): boolean {
  const ops = loadOutbox()
  const op = ops.find(o => o.type === 'add' && o.clientTempId === clientTempId)
  if (!op) return false
  op.data = data
  persistOutbox(ops)
  return true
}

/** Xóa op "add" đang chờ (user xóa bản ghi vừa thêm lúc offline). */
export function dropAddOp(clientTempId: string): boolean {
  const ops = loadOutbox()
  if (!ops.some(o => o.type === 'add' && o.clientTempId === clientTempId)) return false
  persistOutbox(ops.filter(o => !(o.type === 'add' && o.clientTempId === clientTempId)))
  return true
}

export function countPending(uid: string): number {
  return loadOutbox().filter(o => o.uid === uid).length
}

/**
 * Đẩy toàn bộ thao tác đang chờ của 1 user lên CSDL.
 * Dừng ở op đầu tiên thất bại (thường là vẫn chưa có mạng thật).
 */
export async function flushOutbox(uid: string): Promise<{ done: number; failed: number }> {
  const ops = loadOutbox().filter(o => o.uid === uid)
  let done = 0
  let failed = 0
  for (const op of ops) {
    try {
      if (op.type === 'add' && op.data) await addMeasurement(uid, op.data)
      else if (op.type === 'update' && op.measurementId && op.data) {
        await updateMeasurement(uid, op.measurementId, op.data)
      } else if (op.type === 'delete' && op.measurementId) {
        await deleteMeasurement(uid, op.measurementId)
      } else throw new Error('bad-op')
      dropOp(op.id)
      done += 1
    } catch {
      failed += 1
      break
    }
  }
  return { done, failed }
}
