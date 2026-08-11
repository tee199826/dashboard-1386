import { Plus, Minus, Maximize2, LocateFixed } from 'lucide-react'

// overlay HTML ล้วน (ไม่ใช่ SVG) — เป็น UI ควบคุม ไม่ใช่เนื้อหาแผนที่ จึงไม่ควรติดไปกับ export PNG/SVG
// วางบน parent ที่ position:relative เสมอ (MapCanvas wrapper / compare panel wrapper)
export default function ZoomControls({ onZoomIn, onZoomOut, onReset, onCenter, disabled }) {
  const btn = 'w-8 h-8 flex items-center justify-center rounded-lg bg-white/95 ring-1 ring-slate-200 shadow-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed'
  return (
    <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
      <button type="button" onClick={onZoomIn} disabled={disabled} className={btn} title="ซูมเข้า"><Plus size={15} /></button>
      <button type="button" onClick={onZoomOut} disabled={disabled} className={btn} title="ซูมออก"><Minus size={15} /></button>
      <button type="button" onClick={onReset} disabled={disabled} className={btn} title="รีเซ็ตมุมมอง"><Maximize2 size={15} /></button>
      <button type="button" onClick={onCenter} disabled={disabled} className={btn} title="ไปที่เขตที่เลือก"><LocateFixed size={15} /></button>
    </div>
  )
}
