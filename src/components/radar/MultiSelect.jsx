import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'

/**
 * Dropdown เลือกได้หลายค่า (checkbox list + ค้นหา + chip ค่าที่เลือก)
 * - values = [] หมายถึง "ทั้งหมด" (ไม่กรอง)
 * - ค่าที่เลือกจะค้างไว้จนผู้ใช้เอาออกเอง (ไม่ reset อัตโนมัติ)
 * palette: slate + rose (ตัวเลือกที่ติ๊ก)
 */
export default function MultiSelect({
  label, options = [], values = [], onChange,
  allLabel = 'ทั้งหมด', placeholder = 'ค้นหา...', disabled = false, disabledHint = '',
  maxChips = 3, searchable = true,
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const norm = useMemo(() => options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o)), [options])
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? norm.filter((o) => o.label.toLowerCase().includes(s)) : norm
  }, [norm, q])
  const selected = new Set(values)
  const labelOf = (v) => norm.find((o) => o.value === v)?.label ?? v

  const toggle = (v) => onChange(selected.has(v) ? values.filter((x) => x !== v) : [...values, v])
  const selectAllFiltered = () => onChange([...new Set([...values, ...filtered.map((o) => o.value)])])

  return (
    <div ref={wrapRef} className="relative">
      {label && <label className="text-xs text-slate-500 font-semibold block mb-1">{label}</label>}
      <button type="button" disabled={disabled} title={disabled ? disabledHint : undefined}
        onClick={() => setOpen((v) => !v)}
        className={`w-full min-h-[40px] px-3 py-1.5 bg-slate-50 border rounded-lg text-sm text-left flex items-center gap-1.5 flex-wrap outline-none transition
          ${open ? 'border-slate-500 bg-white' : 'border-slate-200 hover:border-slate-300'} disabled:opacity-50 disabled:cursor-not-allowed`}>
        {values.length === 0 ? (
          <span className="text-slate-600">{allLabel}</span>
        ) : (
          <>
            {values.slice(0, maxChips).map((v) => (
              <span key={v} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md bg-rose-50 text-rose-700 text-xs font-medium ring-1 ring-rose-200">
                {labelOf(v)}
                <span role="button" tabIndex={0} aria-label={`เอา ${labelOf(v)} ออก`}
                  onClick={(e) => { e.stopPropagation(); toggle(v) }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggle(v) } }}
                  className="p-0.5 rounded hover:bg-rose-100"><X size={11} /></span>
              </span>
            ))}
            {values.length > maxChips && <span className="text-xs text-slate-500">+{values.length - maxChips}</span>}
          </>
        )}
        <ChevronDown size={14} className={`ml-auto text-slate-400 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-[50] mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
          {searchable && (
            <div className="relative border-b border-slate-100">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
                className="w-full pl-8 pr-2 py-2 text-sm outline-none" />
            </div>
          )}
          <div className="flex items-center justify-between px-2.5 py-1.5 text-[11px] bg-slate-50 border-b border-slate-100">
            <span className="text-slate-500">เลือกแล้ว <b className="text-slate-800">{values.length}</b> / {norm.length}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={selectAllFiltered} className="text-slate-600 hover:text-slate-900 font-medium">เลือกทั้งหมด{q ? 'ที่ค้น' : ''}</button>
              <button type="button" onClick={() => onChange([])} disabled={!values.length} className="text-rose-600 hover:text-rose-700 font-medium disabled:opacity-40">ล้าง</button>
            </div>
          </div>
          <ul className="max-h-56 overflow-y-auto py-1" role="listbox" aria-multiselectable="true">
            {filtered.length === 0 && <li className="px-3 py-2 text-xs text-slate-400">ไม่พบ</li>}
            {filtered.map((o) => {
              const on = selected.has(o.value)
              return (
                <li key={o.value} role="option" aria-selected={on}>
                  <button type="button" onClick={() => toggle(o.value)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-sm text-left transition ${on ? 'bg-rose-50/70 text-slate-900' : 'text-slate-700 hover:bg-slate-50'}`}>
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-rose-600 border-rose-600 text-white' : 'border-slate-300 bg-white'}`}>
                      {on && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="flex-1 truncate">{o.label}</span>
                    {o.count != null && <span className="text-[11px] tabular-nums text-slate-400">{o.count.toLocaleString()}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
