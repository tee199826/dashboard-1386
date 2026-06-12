import { useState, useRef, useEffect } from 'react'
import { Calendar, ChevronDown, RotateCcw } from 'lucide-react'
import { useFilter } from '../context/FilterContext'
import { getFiscalYearRange, dateToFiscalYear } from '../utils/fiscalYear'

// DateFilter — secondary control, compact-first (pill + popover)
// default = pill h-8 ; compact = pill h-7 (ใน chart card) ; popover เดียวกัน
// disabledModes={['month','custom']} → tab disable + tooltip + fallback 'fiscal'

const MODES = [
  { id: 'fiscal', label: 'ปีงบ' },
  { id: 'month', label: 'รายเดือน' },
  { id: 'custom', label: 'ช่วงวันที่' },
]
const TH = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const SELECT = 'border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white text-slate-700 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none'
const DISABLED_TIP = 'หน้านี้ใช้ข้อมูลรายปีงบเท่านั้น'

const todayISO = () => new Date().toISOString().slice(0, 10)
const shiftDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

function summarize(state) {
  if (state.mode === 'fiscal') return state.fiscalYear ? `ปีงบ ${state.fiscalYear}` : 'ทุกปีงบ'
  if (state.mode === 'month') {
    if (!state.monthYear) return 'ทุกปีงบ'
    if (!state.month) return `ปีงบ ${state.monthYear} (ทุกเดือน)`
    return `${TH[state.month]} ${state.monthYear}`
  }
  // custom
  const { customFrom: f, customTo: t } = state
  if (!f || !t) return 'ทั้งหมด'
  const a = f.split('-').map(Number), b = t.split('-').map(Number) // [y,m,d]
  if (a[0] === b[0] && a[1] === b[1]) return `${a[2]}-${b[2]} ${TH[a[1]]} ${a[0] + 543}`
  if (a[0] === b[0]) return `${a[2]} ${TH[a[1]]} - ${b[2]} ${TH[b[1]]} ${a[0] + 543}`
  return `${a[2]} ${TH[a[1]]} ${a[0] + 543} - ${b[2]} ${TH[b[1]]} ${b[0] + 543}`
}

function Popover({ availableYears, disabledModes, onClose }) {
  const { state, setMode, setFiscalYear, setMonthYear, setMonth, setCustomFrom, setCustomTo, reset } = useFilter()
  const years = availableYears.length ? availableYears : (state.fiscalYear ? [state.fiscalYear] : [])

  const presets = [
    { label: '30 วัน', apply: () => { setCustomFrom(shiftDays(-30)); setCustomTo(todayISO()) } },
    { label: '90 วัน', apply: () => { setCustomFrom(shiftDays(-90)); setCustomTo(todayISO()) } },
    { label: 'ปีงบนี้', apply: () => { const r = getFiscalYearRange(dateToFiscalYear(todayISO())); setCustomFrom(r.from); setCustomTo(r.to) } },
  ]

  const currentFY = dateToFiscalYear(todayISO())
  const safeYears = years.length ? years : [currentFY]

  return (
    <div className="absolute top-full left-0 mt-2 z-50 w-72 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-lg p-4">
      {/* tab switcher */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-3">
        {MODES.map(m => {
          const off = disabledModes.includes(m.id)
          const active = state.mode === m.id
          return (
            <button key={m.id} disabled={off} title={off ? DISABLED_TIP : undefined}
              onClick={() => !off && setMode(m.id)}
              className={`flex-1 px-2.5 py-1 text-xs font-medium rounded-md transition ${
                active ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
              } ${off ? 'opacity-40 cursor-not-allowed' : ''}`}>
              {m.label}
            </button>
          )
        })}
      </div>

      {state.mode === 'fiscal' && (
        <select className={`${SELECT} w-full h-9`} value={state.fiscalYear ?? ''} onChange={e => setFiscalYear(e.target.value === '' ? null : Number(e.target.value))}>
          <option value="">ทั้งหมด</option>
          {safeYears.map(y => <option key={y} value={y}>ปีงบ {y}</option>)}
        </select>
      )}

      {state.mode === 'month' && (
        <div className="flex items-center gap-2">
          <select className={`${SELECT} flex-1`} value={state.month ?? ''} onChange={e => setMonth(e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">ทุกเดือน</option>
            {TH.slice(1).map((l, i) => <option key={i} value={i + 1}>{l}</option>)}
          </select>
          <select className={`${SELECT} flex-1`} value={state.monthYear ?? ''} onChange={e => setMonthYear(e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">ทุกปี</option>
            {safeYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      )}

      {state.mode === 'custom' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input type="date" className={`${SELECT} flex-1`} value={state.customFrom ?? ''} onChange={e => setCustomFrom(e.target.value || null)} />
            <span className="text-slate-400 text-sm">→</span>
            <input type="date" className={`${SELECT} flex-1`} value={state.customTo ?? ''} onChange={e => setCustomTo(e.target.value || null)} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {presets.map(p => (
              <button key={p.label} onClick={p.apply}
                className="text-xs px-2 py-1 bg-slate-100 rounded-full hover:bg-blue-50 hover:text-blue-700 transition">
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-4">
        <button onClick={() => reset()} className="text-slate-500 text-sm hover:text-slate-700">ล้าง</button>
        <button onClick={onClose} className="bg-blue-600 text-white text-sm h-8 px-4 rounded-lg hover:bg-blue-700 transition">ตกลง</button>
      </div>
    </div>
  )
}

export default function DateFilter({ availableYears = [], compact = false, disabledModes = [], override = false }) {
  const { state, setMode, setFiscalYear, setMonthYear } = useFilter()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const didInit = useRef(false)

  // active mode ถูก disable → fallback ไป mode ที่ enable ตัวแรก (ถ้ามี)
  useEffect(() => {
    if (!disabledModes.includes(state.mode)) return
    const fallback = MODES.find(m => !disabledModes.includes(m.id))
    if (fallback && fallback.id !== state.mode) setMode(fallback.id)
  }, [state.mode, disabledModes, setMode])

  // ตั้งปีงบ default = ปีล่าสุด ครั้งเดียวตอน data พร้อม (หลังจากนั้นเลือก "ทั้งหมด" = null ได้)
  useEffect(() => {
    if (didInit.current || !availableYears.length) return
    didInit.current = true
    if (state.fiscalYear == null) setFiscalYear(availableYears[0])
    if (state.monthYear == null) setMonthYear(availableYears[0])
  }, [availableYears, state.fiscalYear, state.monthYear, setFiscalYear, setMonthYear])

  // click outside ปิด
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const h = compact ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-sm'
  const icon = compact ? 12 : 14

  return (
    <div className="relative inline-flex items-center gap-1" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-2 ${h} rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition`}>
        <Calendar size={icon} className="text-blue-600" />
        <span>{summarize(state)}</span>
        {override && <span className="text-[10px] text-amber-600 font-medium">● ต่าง</span>}
        <ChevronDown size={icon} className="text-slate-400" />
      </button>
      <ResetButton />
      {open && <Popover availableYears={availableYears} disabledModes={disabledModes} onClose={() => setOpen(false)} />}
    </div>
  )
}

function ResetButton() {
  const { reset } = useFilter()
  return (
    <button onClick={() => reset()} title="รีเซ็ต"
      className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-slate-500 hover:bg-slate-100 transition">
      <RotateCcw size={13} />
    </button>
  )
}
