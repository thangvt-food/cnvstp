import { useEffect, useRef, useState } from 'react'
import type { Measurement, MeasurementInput } from '../types'
import { computeResult, fmtInt, fmtSci, nowLocal, sup, trimZeros } from '../calc'

const DRAFT_KEY = 'cnvstp-draft-v1'
const DILUTION_MAX = 7
const EMPTY = ['', '', '', '', '']

const INPUT =
  'w-full min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/30'
const LABEL = 'mb-1.5 block text-xs font-semibold text-slate-600'
const BTN = 'inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold'
const BTN_GHOST = `${BTN} border border-slate-200 bg-slate-50 text-slate-900 hover:bg-slate-100`

interface Draft {
  time: string
  counts: string[]
  dilutionExp: number
}

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (raw) {
      const d = JSON.parse(raw) as Partial<Draft>
      if (typeof d.time === 'string' && Array.isArray(d.counts) && typeof d.dilutionExp === 'number') {
        return {
          time: d.time,
          counts: [...EMPTY].map((_, i) => String(d.counts?.[i] ?? '')),
          dilutionExp: Math.min(Math.max(d.dilutionExp, 0), DILUTION_MAX),
        }
      }
    }
  } catch {
    /* draft hỏng thì dùng giá trị mặc định */
  }
  return { time: nowLocal(), counts: [...EMPTY], dilutionExp: 0 }
}

interface Props {
  saving: boolean
  editing: Measurement | null
  onSave: (input: MeasurementInput) => Promise<void>
  onCancelEdit: () => void
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`min-w-0 rounded-lg border p-2 ${
        accent ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-slate-50'
      }`}
    >
      <span className="block text-[11px] text-slate-500">{label}</span>
      <span
        className={`block truncate font-mono text-base font-semibold tabular-nums ${
          accent ? 'text-blue-700' : 'text-slate-900'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

export default function EntryForm({ saving, editing, onSave, onCancelEdit }: Props) {
  const [draft] = useState<Draft>(loadDraft)
  const [time, setTime] = useState(draft.time)
  const [counts, setCounts] = useState<string[]>(draft.counts)
  const [dilutionExp, setDilutionExp] = useState(draft.dilutionExp)
  const [savedMsg, setSavedMsg] = useState('')
  const editingRef = useRef<Measurement | null>(null)

  useEffect(() => {
    editingRef.current = editing
    if (editing) {
      setTime(editing.time)
      setCounts(editing.counts.map(c => String(c)))
      setDilutionExp(editing.dilutionExp)
    }
  }, [editing])

  // Lưu tạm form để không mất số liệu khi refresh / mất mạng
  useEffect(() => {
    if (!editing) {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ time, counts, dilutionExp }))
      } catch {
        /* bỏ qua */
      }
    }
  }, [time, counts, dilutionExp, editing])

  useEffect(() => {
    if (!savedMsg) return
    const t = window.setTimeout(() => setSavedMsg(''), 2500)
    return () => window.clearTimeout(t)
  }, [savedMsg])

  const parsed = counts.map(c => {
    if (c.trim() === '') return 0
    const n = Number(c)
    return Number.isFinite(n) ? Math.max(0, n) : 0
  })
  const anyCount = counts.some(c => c.trim() !== '' && Number.isFinite(Number(c)))
  const valid = anyCount && time !== ''
  const result = computeResult(parsed, dilutionExp)

  const setCount = (i: number, v: string) => {
    setCounts(prev => prev.map((c, j) => (j === i ? v : c)))
  }

  const handleSubmit = async () => {
    if (!valid || saving) return
    const input: MeasurementInput = { time, counts: parsed, dilutionExp, ...computeResult(parsed, dilutionExp) }
    try {
      await onSave(input)
      setCounts([...EMPTY])
      setDilutionExp(0)
      setTime(nowLocal())
      try {
        localStorage.removeItem(DRAFT_KEY)
      } catch {
        /* bỏ qua */
      }
      setSavedMsg(editingRef.current ? 'Đã cập nhật ✓' : 'Đã lưu ✓')
    } catch {
      /* App đã hiển thị lỗi — giữ nguyên số liệu trong form */
    }
  }

  return (
    <form
      className="space-y-3.5"
      onSubmit={e => {
        e.preventDefault()
        void handleSubmit()
      }}
    >
      <div>
        <label htmlFor="time" className={LABEL}>
          Thời gian đo
        </label>
        <div className="flex gap-2">
          <input
            id="time"
            type="datetime-local"
            value={time}
            onChange={e => setTime(e.target.value)}
            required
            className={`${INPUT} min-w-0 flex-1`}
          />
          <button type="button" onClick={() => setTime(nowLocal())} className={`${BTN_GHOST} shrink-0`}>
            Bây giờ
          </button>
        </div>
      </div>

      <div>
        <label className={LABEL}>Số tế bào đếm được — từng ô (mỗi ô gồm 16 ô nhỏ)</label>
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i}>
              <span className="mb-1 block text-center text-[10px] font-semibold tracking-wide text-slate-500">
                Ô {i + 1}
              </span>
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                placeholder="0"
                aria-label={`Ô lớn ${i + 1}`}
                value={counts[i]}
                onChange={e => setCount(i, e.target.value)}
                className="h-14 w-full rounded-lg border border-slate-200 bg-white px-1 text-center font-mono text-lg font-semibold text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/30"
              />
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">Nhập số tế bào của Ô 1 → Ô 5. Trung bình mỗi ô = Σ ÷ 5.</p>
      </div>

      <div>
        <label htmlFor="dilution" className={LABEL}>
          Hệ số pha loãng
        </label>
        <select
          id="dilution"
          value={dilutionExp}
          onChange={e => setDilutionExp(Number(e.target.value))}
          className={INPUT}
        >
          {Array.from({ length: DILUTION_MAX + 1 }, (_, n) => (
            <option key={n} value={n}>
              10{sup(n)}
              {n === 0 ? ' — không pha loãng' : ` (pha loãng ${fmtInt(Math.pow(10, n))} lần)`}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Σ tế bào (5 ô)" value={fmtInt(result.total)} />
        <Stat label="TB mỗi ô" value={trimZeros(result.avg.toFixed(1))} />
        <Stat label="Nồng độ N (TB/mL)" value={fmtSci(result.concentration)} accent />
        <Stat label="log₁₀(N)" value={result.log10 === null ? '—' : result.log10.toFixed(2)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={!valid || saving}
          className={`${BTN} w-full bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-40`}
        >
          {saving ? 'Đang lưu…' : editing ? 'Cập nhật' : 'Lưu số liệu'}
        </button>
        {editing && (
          <button type="button" onClick={onCancelEdit} className={BTN_GHOST}>
            Hủy sửa
          </button>
        )}
        {savedMsg && <span className="text-sm font-semibold text-green-700">{savedMsg}</span>}
      </div>
    </form>
  )
}
