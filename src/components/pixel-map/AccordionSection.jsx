import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

// section wrapper ใช้ร่วมกันทุก section ของแผงขวา — header กด collapse/expand ได้, accent bar ซ้าย, ตัวหนังสือเล็ก tracking กว้าง
export default function AccordionSection({ title, icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-5 py-3.5 hover:bg-slate-50 transition">
        <span className="w-1 h-4 rounded-full bg-violet-500 shrink-0" />
        {icon}
        <span className="flex-1 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500">{title}</span>
        <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-5 pb-5 space-y-3">{children}</div>}
    </div>
  )
}
