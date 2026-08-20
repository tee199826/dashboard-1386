import { useState, useRef, useEffect } from 'react'

// ปุ่ม swatch 32x32 + popover เล็ก (native color input + hex field) — แทนที่ raw <input type=color> ลอยอยู่กลางแผง
// align: 'right' (ค่าเริ่มต้น) เปิด popover ไปทางซ้าย เหมาะกับ swatch ที่อยู่ขอบขวาของแผง
//        'left' เปิดไปทางขวา เหมาะกับ swatch ที่อยู่ชิดซ้าย (เช่น หัว panel ในโหมด compare) กันไม่ให้ทับแถบเมนูซ้าย
export default function ColorSwatch({ value, onChange, title, align = 'right' }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false) }
    // capture phase — ต้องมาก่อน d3-zoom's mousedown handler บน <svg> แผนที่ ไม่งั้นคลิกบนแผนที่จะไม่ปิด popover (d3 หยุด event ไว้ก่อนถึง document แบบ bubble)
    document.addEventListener('mousedown', onClickOutside, true)
    return () => document.removeEventListener('mousedown', onClickOutside, true)
  }, [open])

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button type="button" title={title} onClick={() => setOpen(o => !o)}
        className="w-8 h-8 rounded-lg ring-1 ring-slate-200 shrink-0 cursor-pointer"
        style={{ background: value }} />
      {open && (
        <div className={`absolute z-50 top-9 ${align === 'left' ? 'left-0' : 'right-0'} bg-white rounded-lg ring-1 ring-slate-200 shadow-lg p-2.5 space-y-2 w-40`}>
          <input type="color" value={value} onChange={e => onChange(e.target.value)} className="w-full h-8 rounded cursor-pointer" />
          <input type="text" value={value} onChange={e => onChange(e.target.value)}
            className="w-full h-7 px-2 rounded ring-1 ring-slate-200 text-xs font-mono outline-none focus:ring-2 focus:ring-violet-500" />
        </div>
      )}
    </div>
  )
}
