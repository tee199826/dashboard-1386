import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Check, AlertTriangle, Loader2 } from 'lucide-react'

// FormUI — primitives ของฟอร์มบันทึกข้อมูล (ฐานข้อมูลการข่าว)
// ดีไซน์เข้าชุดกับหน้าอื่น: การ์ดขอบบาง มุมมน ตัวเลข tabular-nums

// หมายเหตุ: merge className ไม่ให้ props ทับ — ไม่งั้นส่ง className เข้ามาแล้วสไตล์พื้นฐานหายทั้งหมด
// ช่องกรอกสูง 40px — ฟอร์มซักผู้เสพยาวเกือบร้อยช่อง ช่องเตี้ยกว่านี้กดพลาด/อ่านยากเวลานั่งกรอกไปคุยไป
const CTRL = 'w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400'

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
  // <label> ส่งคลิกต่อให้ control ตัวแรกข้างใน — ถ้าเป็นปุ่มชิป (ChipGroup) การคลิกหัวข้อ/คำอธิบาย/ช่องว่างระหว่างชิป
  // จะไปกดเลือกตัวเลือกแรกเอง ; ยกเลิกเฉพาะกรณีนั้น (ช่องพิมพ์ยังคลิกหัวข้อแล้วโฟกัสได้ตามปกติ)
  const blockChipForward = (e) => {
    if (e.currentTarget.control?.tagName === 'BUTTON' && !e.target.closest('button')) e.preventDefault()
  }
  return (
    <label data-invalid={error ? '1' : undefined} onClick={blockChipForward}
      className={`block space-y-1 ${error ? INVALID : ''} ${className}`}>
      <span className={`text-[12.5px] font-medium ${error ? 'text-rose-600' : 'text-slate-600'}`}>
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
          className={`h-9 px-3.5 rounded-full text-[12.5px] font-medium ring-1 transition ${
            on(o) ? 'bg-blue-600 text-white ring-blue-600 shadow-sm' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50 hover:ring-slate-400'
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
      {rows.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white/60 px-3 py-3 text-[12.5px] text-slate-400">{empty}</p>
      )}
      {/* แต่ละรายการมีเลขกำกับ + ปุ่มลบอยู่หัวแถว — หลายแถวติดกันจะได้ไม่งงว่าช่องไหนของแถวไหน */}
      {rows.map((row, i) => (
        <div key={i} className="rounded-xl bg-white ring-1 ring-slate-200 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11.5px] font-semibold text-slate-400">รายการที่ {i + 1}</span>
            <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} title="ลบรายการนี้"
              className="h-7 px-2 inline-flex items-center gap-1 rounded-md text-[11.5px] font-medium text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition">
              <Trash2 size={13} /> ลบ
            </button>
          </div>
          <div className={`grid grid-cols-1 ${GRID_COLS[cols] || GRID_COLS[3]} gap-2.5`}>{renderRow(row, patchAt(i), i)}</div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...rows, { ...blank }])}
        className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg border border-slate-300 bg-white text-[13px] font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition">
        <Plus size={15} /> {addLabel}
      </button>
    </div>
  )
}

// แถบบันทึก — status: null | 'saving' | 'saved' | { error }
export function SaveBar({ status, onSave, disabled, label = 'บันทึกข้อมูล' }) {
  const saving = status === 'saving'
  const done = status === 'saved'   // บันทึกแล้วต้องกดซ้ำไม่ได้ ไม่งั้นได้ข้อมูลซ้ำอีกแถว
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="submit" onClick={onSave} disabled={saving || done || disabled}
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
