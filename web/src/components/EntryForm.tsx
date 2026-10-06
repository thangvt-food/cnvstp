import { useEffect, useRef, useState } from 'react'
import type { Measurement, MeasurementInput } from '../types'
import { computeResult, fmtInt, fmtSci, nowLocal, sup, trimZeros } from '../calc'

const DRAFT_KEY = 'cnvstp-draft-v1'
const DILUTION_MAX = 7
const EMPTY = ['', '', '', '', '']

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
      onSubmit={e => {
        e.preventDefault()
        void handleSubmit()
      }}
    >
      <div className="field">
        <label htmlFor="time">Thời gian đo</label>
        <div className="time-row">
          <input id="time" type="datetime-local" value={time} onChange={e => setTime(e.target.value)} required />
          <button type="button" className="btn ghost" onClick={() => setTime(nowLocal())}>
            Bây giờ
          </button>
        </div>
      </div>

      <div className="field">
        <label>Số tế bào đếm được — từng ô lớn (mỗi ô gồm 16 ô nhỏ)</label>
        <div className="counts-grid">
          {[0, 1, 2, 3, 4].map(i => (
            <input
              key={i}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              placeholder="0"
              aria-label={`Ô lớn ${i + 1}`}
              value={counts[i]}
              onChange={e => setCount(i, e.target.value)}
            />
          ))}
        </div>
        <p className="counts-help">Nhập số tế bào của Ô 1 → Ô 5. Trung bình mỗi ô = Σ ÷ 5.</p>
      </div>

      <div className="field">
        <label htmlFor="dilution">Hệ số pha loãng</label>
        <select id="dilution" value={dilutionExp} onChange={e => setDilutionExp(Number(e.target.value))}>
          {Array.from({ length: DILUTION_MAX + 1 }, (_, n) => (
            <option key={n} value={n}>
              10{sup(n)}
              {n === 0 ? ' — không pha loãng' : ` (pha loãng ${fmtInt(Math.pow(10, n))} lần)`}
            </option>
          ))}
        </select>
      </div>

      <div className="result-grid">
        <div className="result-cell">
          <span className="res-label">Σ tế bào (5 ô)</span>
          <span className="res-value">{fmtInt(result.total)}</span>
        </div>
        <div className="result-cell">
          <span className="res-label">TB mỗi ô lớn</span>
          <span className="res-value">{trimZeros(result.avg.toFixed(1))}</span>
        </div>
        <div className="result-cell">
          <span className="res-label">Nồng độ N (TB/mL)</span>
          <span className="res-value">{fmtSci(result.concentration)}</span>
        </div>
        <div className="result-cell">
          <span className="res-label">log₁₀(N)</span>
          <span className="res-value">{result.log10 === null ? '—' : result.log10.toFixed(2)}</span>
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={!valid || saving}>
          {saving ? 'Đang lưu…' : editing ? 'Cập nhật' : 'Lưu số liệu'}
        </button>
        {editing && (
          <button type="button" className="btn ghost" onClick={onCancelEdit}>
            Hủy sửa
          </button>
        )}
        {savedMsg && <span className="saved-msg">{savedMsg}</span>}
      </div>
    </form>
  )
}
