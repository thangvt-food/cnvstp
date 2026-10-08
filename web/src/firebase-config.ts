import { initializeApp } from 'firebase/app'
import { getAnalytics, isSupported as analyticsSupported } from 'firebase/analytics'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getDatabase } from 'firebase/database'

// Config do người dùng cung cấp (Firebase console > Project settings > Your apps)
const firebaseConfig = {
  apiKey: 'AIzaSyBpasZ72EgIovTCVHokMpTYiXWdQolB1qc',
  authDomain: 'ant05-efa02.firebaseapp.com',
  databaseURL: 'https://ant05-efa02-default-rtdb.firebaseio.com',
  projectId: 'ant05-efa02',
  storageBucket: 'ant05-efa02.firebasestorage.app',
  messagingSenderId: '314608297930',
  appId: '1:314608297930:web:6bd7efdc38efa70bd0d133',
  measurementId: 'G-ZZF8BE2C3J',
}

export const app = initializeApp(firebaseConfig)

// Analytics chỉ chạy trên browser https — bọc try/catch để không vỡ app
void analyticsSupported()
  .then(ok => {
    if (ok) {
      try {
        getAnalytics(app)
      } catch {
        /* bỏ qua khi analytics bị chặn */
      }
    }
  })
  .catch(() => undefined)

export const auth = getAuth(app)
export const db = getDatabase(app)
export const googleProvider = new GoogleAuthProvider()
// Luôn hỏi chọn tài khoản để dễ đổi giữa các nick Google
googleProvider.setCustomParameters({ prompt: 'select_account' })

/**
 * Tài khoản admin nhận merge toàn bộ dữ liệu legacy (/measurements).
 * Firebase Auth bắt buộc email đúng định dạng nên dùng:
 *   email: admin@cnvstp.local
 *   pass : cnvstp  (tạo 1 lần trong Console > Authentication > Add user)
 * Khi đăng nhập chỉ cần gõ "admin" — app tự map sang email trên.
 */
export const ADMIN_EMAIL = 'admin@cnvstp.local'
export const ADMIN_SHORTCUT = 'admin'

/** "admin" → "admin@cnvstp.local", còn lại giữ nguyên (trim). */
export function normalizeLoginId(input: string): string {
  const v = input.trim()
  if (v.toLowerCase() === ADMIN_SHORTCUT) return ADMIN_EMAIL
  return v
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase() === ADMIN_EMAIL
}
