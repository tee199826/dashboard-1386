import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

// Modal — reusable dialog (violet accent ตาม design system)
// props:
//   open      : boolean — แสดง/ซ่อน
//   onClose   : () => void — ปิด (ESC / click backdrop / ปุ่ม X)
//   title     : string
//   children  : เนื้อหา body
//   variant   : 'default' | 'success' | 'error' | 'warning' — สี accent bar + icon
//   icon      : ReactNode (optional) — ไอคอนหน้า title
//   actions   : ReactNode (optional) — ปุ่มท้าย modal
//   closeOnBackdrop : boolean (default true)

const VARIANTS = {
  default: { bar: 'from-violet-500 to-purple-600', icon: 'text-violet-600' },
  success: { bar: 'from-emerald-500 to-teal-600',  icon: 'text-emerald-600' },
  error:   { bar: 'from-rose-500 to-red-600',      icon: 'text-rose-600' },
  warning: { bar: 'from-amber-500 to-orange-600',  icon: 'text-amber-600' },
}

export default function Modal({
  open, onClose, title, children,
  variant = 'default', icon, actions, closeOnBackdrop = true,
}) {
  // ปิดด้วย ESC + ล็อค scroll พื้นหลัง
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null
  const v = VARIANTS[variant] || VARIANTS.default

  // createPortal ไปที่ document.body + z-index สูงกว่าทุก overlay ในแอป (กัน bug: บาง element ใช้ transform ร่วมกับ
  // z-index สูงมาก เช่น sidebar /radar ที่ z-[9995] — transform ทำให้ z-index มีผลทั้งที่ position:static เลยไปทับ modal ถ้า z-index ต่ำกว่า)
  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 z-[10050] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={closeOnBackdrop ? onClose : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-panel bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className={`h-1 bg-gradient-to-r ${v.bar} flex-shrink-0`} />

        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && <span className={`flex-shrink-0 ${v.icon}`}>{icon}</span>}
            <h3 className="text-lg font-bold text-slate-900 leading-snug">{title}</h3>
          </div>
          <button onClick={onClose} aria-label="ปิด"
            className="flex-shrink-0 -mr-1 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pb-5 overflow-y-auto text-sm text-slate-700">
          {children}
        </div>

        {actions && (
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
