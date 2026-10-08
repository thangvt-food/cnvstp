import { useState } from 'react'
import { FirebaseError } from 'firebase/app'
import { authErrorMessage, signInEmail, signInGoogle, signUpEmail } from '../firebase'

const INPUT =
  'w-full min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/30'
const LABEL = 'mb-1.5 block text-xs font-semibold text-slate-600'
const BTN =
  'inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60'

type Mode = 'login' | 'signup'

export default function AuthScreen({ onDone }: { onDone: (migrated: number) => void }) {
  const [mode, setMode] = useState<Mode>('login')
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const fail = (e: unknown) => {
    if (e instanceof FirebaseError) setError(authErrorMessage(e.code))
    else setError('Có lỗi xảy ra — thử lại.')
  }

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'signup') {
        if (password.length < 6) {
          setError('Mật khẩu tối thiểu 6 ký tự.')
          return
        }
        await signUpEmail(loginId, password, name)
        setNotice('Đã tạo tài khoản và đăng nhập thành công.')
        onDone(0)
      } else {
        const { migrated } = await signInEmail(loginId, password)
        if (migrated > 0) setNotice(`Đã merge ${migrated} bản ghi cũ vào tài khoản admin.`)
        onDone(migrated)
      }
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const handleGoogle = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await signInGoogle()
      onDone(0)
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h1 className="text-lg font-bold tracking-tight">Đếm tế bào nấm men</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {mode === 'login' ? 'Đăng nhập để xem và lưu số liệu của bạn' : 'Tạo tài khoản mới bằng email'}
        </p>

        <div className="mt-4 inline-flex rounded-lg border border-slate-200 p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setMode('login')}
            aria-pressed={mode === 'login'}
            className={`rounded-md px-4 py-1.5 font-semibold transition-colors ${
              mode === 'login' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            aria-pressed={mode === 'signup'}
            className={`rounded-md px-4 py-1.5 font-semibold transition-colors ${
              mode === 'signup' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tạo tài khoản
          </button>
        </div>

        <form onSubmit={handleEmail} className="mt-4 space-y-3">
          {mode === 'signup' && (
            <div>
              <label htmlFor="auth-name" className={LABEL}>
                Tên hiển thị (không bắt buộc)
              </label>
              <input
                id="auth-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="VD: Nhóm CNVSTP"
                autoComplete="name"
                className={INPUT}
              />
            </div>
          )}
          <div>
            <label htmlFor="auth-id" className={LABEL}>
              Email
            </label>
            <input
              id="auth-id"
              type="text"
              value={loginId}
              onChange={e => setLoginId(e.target.value)}
              placeholder="email@..."
              autoComplete="username"
              required
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="auth-pass" className={LABEL}>
              Mật khẩu
            </label>
            <input
              id="auth-pass"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Tối thiểu 6 ký tự"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              className={INPUT}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-800">
              {notice}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !loginId.trim() || !password}
            className={`${BTN} w-full bg-blue-600 text-white hover:bg-blue-700`}
          >
            {busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          hoặc
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          className={`${BTN} w-full border border-slate-200 bg-white text-slate-900 hover:bg-slate-50`}
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden className="mr-2">
            <path
              fill="#FFC107"
              d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
            />
            <path
              fill="#FF3D00"
              d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
            />
            <path
              fill="#4CAF50"
              d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
            />
            <path
              fill="#1976D2"
              d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"
            />
          </svg>
          Đăng nhập bằng Google
        </button>

        <ul className="mt-4 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-500">
          <li>Mỗi tài khoản chỉ xem và lưu số liệu của chính mình.</li>
          <li>Mật khẩu tối thiểu 6 ký tự — hoặc đăng nhập nhanh bằng Google.</li>
          <li>Số liệu lưu trực tuyến, đổi máy đăng nhập vẫn thấy đầy đủ.</li>
        </ul>
      </div>
    </div>
  )
}
