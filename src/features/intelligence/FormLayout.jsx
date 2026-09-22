// FormLayout — โครงหน้าสำหรับ "ฟอร์มยาว" (แบบซักผู้เสพมีเกือบร้อยช่อง)
// หัวเรื่อง + ตัวฟอร์มที่เลื่อนอ่านไล่ลงไปตามลำดับแบบกระดาษ + แถบบันทึกลอยด้านล่าง (ไม่ต้องเลื่อนสุดหน้าถึงจะกดบันทึกได้)
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export function FormLayout({ title, sub, backTo, headerAside, footer, children }) {
  return (
    <div className="min-h-full bg-slate-100/60">
      <div className="mx-auto max-w-[1120px] px-4 lg:px-6 pt-4 pb-6 space-y-4">
        <header className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm px-5 py-4">
          {backTo && (
            <Link to={backTo} className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-500 hover:text-slate-800 transition">
              <ArrowLeft size={14} /> ย้อนกลับ
            </Link>
          )}
          <div className="mt-1.5 flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-[22px] font-bold tracking-tight text-slate-900 leading-tight">{title}</h1>
              {sub && <p className="mt-1 text-[12.5px] text-slate-500 leading-relaxed">{sub}</p>}
            </div>
            {headerAside}
          </div>
        </header>

        <div className="space-y-4">{children}</div>
      </div>

      {/* แถบบันทึก — ลอยอยู่ล่างจอเสมอ ไม่ต้องเลื่อนสุดฟอร์มถึงจะกดบันทึกได้ */}
      {footer && (
        <div className="sticky bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto max-w-[1120px] px-4 lg:px-6 py-3">{footer}</div>
        </div>
      )}
    </div>
  )
}

// การ์ดหัวข้อ — id ไว้ให้เลื่อนมาหาได้ (เช่น เลื่อนไปช่องแรกที่ยังไม่ได้กรอกตอนกดบันทึก)
export function SectionCard({ id, icon: Icon, title, sub, children }) {
  return (
    <section id={id} className="scroll-mt-16 lg:scroll-mt-4 rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm">
      <div className="flex items-start gap-3 px-5 py-3.5 border-b border-slate-100">
        {Icon && (
          <span className="shrink-0 mt-0.5 grid place-items-center w-9 h-9 rounded-xl bg-blue-50 text-blue-600">
            <Icon size={17} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 leading-snug">{title}</h2>
          {sub && <p className="mt-0.5 text-[11.5px] text-slate-500 leading-relaxed">{sub}</p>}
        </div>
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  )
}

// กล่องหัวข้อย่อยภายในการ์ด (เช่น "ที่อยู่อาศัยปัจจุบัน") — คั่นสายตาโดยไม่ต้องเพิ่มการ์ดอีกใบ
export function SubSection({ title, sub, children, className = '' }) {
  return (
    <div className={`rounded-xl ring-1 ring-slate-200/80 bg-slate-50/60 p-4 ${className}`}>
      <div className="mb-3">
        <div className="text-[12.5px] font-semibold text-slate-700">{title}</div>
        {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
      </div>
      {children}
    </div>
  )
}
