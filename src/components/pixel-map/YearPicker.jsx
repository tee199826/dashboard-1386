import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

// ตัวเลือกปีงบประมาณแบบติ๊กได้หลายปี — ว่าง = ทุกปี (union ของปีที่ติ๊ก)
export default function YearPicker({ options, selected, onToggle, onClear }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const n = selected.size
  const label = n === 0 ? 'ทุกปี' : n === 1 ? [...selected][0] : `${n} ปี`

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-white rounded-lg ring-1 ring-slate-200 shadow-sm px-3 h-10 hover:bg-slate-50">
        <span className="text-xs font-medium text-slate-500">ปีงบประมาณ</span>
        <span className="text-sm font-semibold text-slate-800">{label}</span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>

      {open && (
        <div className="absolute z-30 top-11 right-0 min-w-40 bg-white rounded-lg ring-1 ring-slate-200 shadow-xl py-1">
          <button type="button" onClick={onClear}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-violet-50">
            <span className={`w-3.5 shrink-0 ${n === 0 ? 'text-violet-600' : 'text-transparent'}`}><Check size={14} /></span>
            ทุกปี
          </button>
          <div className="my-1 border-t border-slate-100" />
          <div className="max-h-64 overflow-y-auto">
            {options.map(y => {
              const on = selected.has(String(y))
              return (
                <button key={y} type="button" onClick={() => onToggle(String(y))}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-violet-50">
                  <span className={`w-3.5 shrink-0 ${on ? 'text-violet-600' : 'text-transparent'}`}><Check size={14} /></span>
                  {y}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
