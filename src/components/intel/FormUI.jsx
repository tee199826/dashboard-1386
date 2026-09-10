// FormUI — primitives ของฟอร์มบันทึกข้อมูล (ฐานข้อมูลการข่าว)
// ดีไซน์เข้าชุดกับหน้าอื่น: การ์ดขอบบาง มุมมน ตัวเลข tabular-nums
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Check, AlertTriangle, Loader2 } from 'lucide-react'

// หมายเหตุ: merge className ไม่ให้ props ทับ — ไม่งั้นส่ง className เข้ามาแล้วสไตล์พื้นฐานหายทั้งหมด
const CTRL = 'w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400'

export function IntelPage({ title, sub, backTo, children }) {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1100px] mx-auto space-y-6 bg-[#f6f7f9] min-h-screen">
      <header className="border-b border-slate-200 pb-5">
        {backTo && (
          <Link to={backTo} className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-800 transition mb-2">
            <ArrowLeft size={14} /> ย้อนกลับ
          </Link>
        )}
        <h1 className="text-2xl lg:text-[1.75rem] font-semibold tracking-tight text-slate-900 leading-tight">{title}</h1>
        {sub && <p className="mt-1.5 text-sm text-slate-500">{sub}</p>}
      </header>
      {children}
    </div>
  )
}

export function Card({ title, sub, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,22,38,0.05)] p-5 md:p-6 ${className}`}>
      {title && (
        <div className="mb-4">
          <h2 className="text-[14.5px] font-semibold tracking-tight text-slate-800">{title}</h2>
          {sub && <p className="mt-0.5 text-[11.5px] text-slate-400">{sub}</p>}
        </div>
      )}
      {children}
    </section>
  )
}

// error = true (ใช้ข้อความ default) หรือใส่ข้อความเองก็ได้
// ทาสีแดงถึงตัว control ด้วย arbitrary variant — ไม่ต้องส่ง prop ลงไปทุกชั้น
const INVALID = '[&_input]:border-rose-400 [&_select]:border-rose-400 [&_textarea]:border-rose-400 [&_input]:bg-rose-50/50 [&_select]:bg-rose-50/50'

export function Field({ label, required, hint, error, children, className = '' }) {
  return (
    <label data-invalid={error ? '1' : undefined}
      className={`block space-y-1 ${error ? INVALID : ''} ${className}`}>
      <span className={`text-xs font-medium ${error ? 'text-rose-600' : 'text-slate-600'}`}>
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
      {error ? (
        <span className="block text-[11px] font-medium text-rose-600">
          {typeof error === 'string' ? error : 'กรุณากรอกช่องนี้'}
        </span>
      ) : hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
    </label>
  )
}

export function Input({ className = '', ...props }) {
  return <input className={`${CTRL} ${className}`} {...props} />
}

export function Select({ options, placeholder = '— เลือก —', className = '', ...props }) {
  return (
    <select className={`${CTRL} ${className}`} {...props}>
      <option value="">{placeholder}</option>
      {options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o]
        return <option key={v} value={v}>{l}</option>
      })}
    </select>
  )
}

// ChipGroup — แทนช่องติ๊ก ☐ ในกระดาษ : multi=false เลือกได้อันเดียว (กดซ้ำ = ยกเลิก), multi=true เลือกหลายอัน
export function ChipGroup({ options, value, onChange, multi = false }) {
  const list = multi ? (Array.isArray(value) ? value : []) : []
  const on = (o) => (multi ? list.includes(o) : value === o)
  const toggle = (o) => {
    if (multi) onChange(list.includes(o) ? list.filter((x) => x !== o) : [...list, o])
    else onChange(value === o ? '' : o)
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => toggle(o)}
          className={`h-8 px-3 rounded-full text-xs font-medium ring-1 transition ${
            on(o) ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
          }`}>{o}</button>
      ))}
    </div>
  )
}

// แถวที่เพิ่ม/ลบได้ — rows = array, onChange(nextRows), renderRow(row, patch) วาดช่องกรอกของแถวนั้น
// cols ต้องเป็น class เต็ม ๆ (Tailwind อ่าน class จาก source ตรง ๆ — สร้างชื่อ class แบบ `sm:grid-cols-${n}` ไม่ติด)
const GRID_COLS = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' }

export function RepeatList({ rows, onChange, blank, renderRow, addLabel = 'เพิ่มรายการ', empty = 'ยังไม่มีรายการ', cols = 3 }) {
  const patchAt = (i) => (patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <div className="space-y-2.5">
      {rows.length === 0 && <p className="text-[13px] text-slate-400">{empty}</p>}
      {rows.map((row, i) => (
        <div key={i} className="flex items-end gap-2 rounded-lg bg-slate-50 ring-1 ring-slate-200 p-2.5">
          <div className={`flex-1 min-w-0 grid grid-cols-1 ${GRID_COLS[cols] || GRID_COLS[3]} gap-2`}>{renderRow(row, patchAt(i), i)}</div>
          <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} title="ลบแถวนี้"
            className="h-9 w-9 shrink-0 grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition">
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...rows, { ...blank }])}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-300 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition">
        <Plus size={15} /> {addLabel}
      </button>
    </div>
  )
}

// แถบบันทึก — status: null | 'saving' | 'saved' | { error }
export function SaveBar({ status, onSave, disabled, label = 'บันทึกข้อมูล' }) {
  const saving = status === 'saving'
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="submit" onClick={onSave} disabled={saving || disabled}
        className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        {saving ? 'กำลังบันทึก...' : label}
      </button>
      {status === 'saved' && (
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-600">
          <Check size={15} /> บันทึกเรียบร้อย
        </span>
      )}
      {status?.error && (
        <span className="inline-flex items-start gap-1.5 text-[13px] text-rose-600">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {status.error}
        </span>
      )}
    </div>
  )
}
