import { useEffect, useRef, useState } from 'react'
import { RotateCcw, Calendar } from 'lucide-react'
import { useFilter } from '../context/FilterContext'

// control ช่วงข้อมูล — อ่าน/เขียนผ่าน useFilter() (page-level หรือ nested per-chart)
// compact=true → ปุ่มเล็ก + popover เปิด full UI (ใช้ในหัว chart card)

const MODES = [
  { id: 'fiscal', label: 'ปีงบ' },
  { id: 'month', label: 'รายเดือน' },
  { id: 'custom', label: 'Custom' },
]
const TH_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

const TAB = 'px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200'
const TAB_ON = 'bg-blue-600 text-white shadow-sm'
const TAB_OFF = 'bg-slate-100 text-slate-700 hover:bg-slate-200'
const SELECT = 'border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white text-slate-700 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none'

function summarize(state) {
  if (state.mode === 'fiscal') return state.fiscalYear ? `ปีงบ ${state.fiscalYear}` : 'ปีงบ —'
  if (state.mode === 'month') {
    const m = state.month ? TH_MONTHS[state.month - 1] : '—'
    return `${m} ${state.monthYear ?? '—'}`
  }
  return state.customFrom && state.customTo ? `${state.customFrom} → ${state.customTo}` : 'Custom'
}

function FilterPanel({ availableYears }) {
  const { state, setMode, setFiscalYear, setMonthYear, setMonth, setCustomFrom, setCustomTo, reset } = useFilter()
  const years = availableYears.length ? availableYears : (state.fiscalYear ? [state.fiscalYear] : [])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Calendar size={15} className="text-blue-600" /> ช่วงข้อมูล:
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            {MODES.map(m => (
              <button key={m.id} onClick={() => setMode(m.id)}
                className={`${TAB} ${state.mode === m.id ? TAB_ON : TAB_OFF}`}>
                {m.label}
              </button>
            ))}
          </div>
          <button onClick={reset} title="รีเซ็ต"
            className="bg-slate-100 hover:bg-slate-200 rounded-md p-1.5 text-slate-600 transition">
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {state.mode === 'fiscal' && (
        <select className={SELECT} value={state.fiscalYear ?? ''} onChange={e => setFiscalYear(Number(e.target.value))}>
          {years.map(y => <option key={y} value={y}>ปีงบ {y}</option>)}
        </select>
      )}

      {state.mode === 'month' && (
        <div className="flex items-center gap-2 flex-wrap">
          <select className={SELECT} value={state.month ?? ''} onChange={e => setMonth(Number(e.target.value))}>
            <option value="" disabled>เดือน</option>
            {TH_MONTHS.map((l, i) => <option key={i} value={i + 1}>{l}</option>)}
          </select>
          <select className={SELECT} value={state.monthYear ?? ''} onChange={e => setMonthYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      )}

      {state.mode === 'custom' && (
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" className={SELECT} value={state.customFrom ?? ''} onChange={e => setCustomFrom(e.target.value || null)} />
          <span className="text-slate-400 text-sm">→</span>
          <input type="date" className={SELECT} value={state.customTo ?? ''} onChange={e => setCustomTo(e.target.value || null)} />
        </div>
      )}
    </div>
  )
}

export default function DateFilter({ onChange, availableYears = [], compact = false }) {
  const { state } = useFilter()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // แจ้ง state ออกไป (per-chart consumer ใช้ตรงๆ ได้)
  useEffect(() => { onChange?.(state) }, [state]) // eslint-disable-line react-hooks/exhaustive-deps

  // click outside ปิด popover (compact)
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (!compact) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <FilterPanel availableYears={availableYears} />
      </div>
    )
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white text-slate-700 hover:border-blue-400 transition">
        <Calendar size={14} className="text-blue-600" /> {summarize(state)}
        <span className="text-slate-400 text-xs">▼</span>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl p-4">
          <FilterPanel availableYears={availableYears} />
        </div>
      )}
    </div>
  )
}
