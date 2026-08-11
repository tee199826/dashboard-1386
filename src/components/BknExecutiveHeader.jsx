import { RefreshCw, Maximize2, ChevronDown } from 'lucide-react'
import { usePresentation } from '../context/PresentationContext'

// Editorial header สำหรับ /bkn — แทน UnifiedHero + DateFilter + control bar (รวมเป็นแถบเดียว)
// controls: ปีงบ (1) · refresh (1) · fullscreen (1) — ตาม spec "ลบ UI ซ้ำ"
// ไม่มี gradient · border-b hairline · typography เป็นพระเอก

// "01 ต.ค. 68-31 พ.ค. 69" → "1 ต.ค. 68 – 31 พ.ค. 69" (en dash, ตัด 0 นำหน้า)
function fmtPeriod(period) {
  if (!period) return null
  return String(period)
    .replace(/-/, ' – ')
    .replace(/(^|\s)0(\d)/g, '$1$2')
}
const fyOf = period => {
  const m = String(period || '').match(/(\d{2})\s*$/)
  return m ? 2500 + parseInt(m[1], 10) : null
}

const ICON_BTN = 'p-2 rounded-md ring-1 ring-slate-200 bg-white text-slate-400 hover:text-blue-700 hover:ring-slate-300 transition'

export default function BknExecutiveHeader({ period, lastUpload, onRefresh, refreshing = false }) {
  const { enter } = usePresentation()
  const fy = fyOf(period)

  return (
    <header className="border-b border-slate-200 pb-6">
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-widest text-slate-500">
            Police Command · บก.น. 1–9
          </div>
          <h1 className="mt-1.5 text-3xl lg:text-[2rem] font-semibold tracking-tight text-slate-900 leading-tight">
            รายงานความรวดเร็วการดำเนินการ
          </h1>
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-500 flex-wrap">
            <span className="font-medium text-slate-600">RPT 115_B</span>
            {period && <><span className="text-slate-300">·</span><span className="tabular-nums">{fmtPeriod(period)}</span></>}
            {lastUpload && <><span className="text-slate-300">·</span><span>อัปเดต {lastUpload}</span></>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* ปีงบ — งวดเดียว (2569) จึง static ; เตรียม wire เมื่อมีหลายปีงบ */}
          <div title="ข้อมูล RPT 115_B มีเฉพาะปีงบ 2569"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md ring-1 ring-slate-200 bg-white text-sm text-slate-700">
            <span className="text-xs uppercase tracking-wide text-slate-400">ปีงบ</span>
            <span className="font-semibold tabular-nums">{fy || '—'}</span>
            <ChevronDown size={14} className="text-slate-300" />
          </div>
          <button onClick={onRefresh} disabled={refreshing} title="โหลดข้อมูลใหม่"
            className={`${ICON_BTN} disabled:opacity-40`}>
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button onClick={enter} title="โหมดนำเสนอ" className={ICON_BTN}>
            <Maximize2 size={15} />
          </button>
        </div>
      </div>
    </header>
  )
}
