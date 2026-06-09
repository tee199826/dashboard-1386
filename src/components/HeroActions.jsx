import { useState } from 'react'
import { Info, RefreshCw, Maximize2, X } from 'lucide-react'
import { usePresentation } from '../context/PresentationContext'

// ปุ่ม 3 ตัวมุมขวาบนของ Hero banner — ใช้ร่วมกันได้หลายหน้า
// [ⓘ แหล่งข้อมูล] [↻ refresh] [↗ fullscreen]
// fullscreen reuse PresentationContext กลาง · modal generic ขับด้วย prop `sourceInfo`
const BTN = 'flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur rounded-lg text-white text-sm transition'

export default function HeroActions({ onRefresh, refreshing = false, sourceInfo }) {
  const [showSource, setShowSource] = useState(false)
  const { enter } = usePresentation()
  const refresh = onRefresh || (() => window.location.reload())

  return (
    <div className="flex items-center gap-2 shrink-0">
      {sourceInfo && (
        <button onClick={() => setShowSource(true)} className={`${BTN} px-4 py-2 font-medium`}>
          <Info size={15} /> แหล่งข้อมูล
        </button>
      )}
      <button onClick={refresh} disabled={refreshing} title="โหลดข้อมูลใหม่จากฐานข้อมูล"
        className={`${BTN} px-3 py-2 disabled:opacity-40`}>
        <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
      </button>
      <button onClick={enter} title="โหมดนำเสนอ" className={`${BTN} px-3 py-2`}>
        <Maximize2 size={15} />
      </button>

      {showSource && sourceInfo && <SourceInfoModal info={sourceInfo} onClose={() => setShowSource(false)} />}
    </div>
  )
}

function MetaCard({ label, value }) {
  if (!value) return null
  return (
    <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
      <span className="text-slate-500">{label}</span>
      <div className="font-bold text-violet-700 mt-0.5">{value}</div>
    </div>
  )
}

function SourceInfoModal({ info, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="bg-violet-700 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">📋</div>
            <div>
              <h2 className="font-bold text-lg">{info.title}</h2>
              {info.source && <p className="text-xs text-violet-200">{info.source}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-4">
          {info.description && (
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{info.description}</p>
          )}

          {(info.period || info.count || info.lastUpload) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <MetaCard label="ช่วงข้อมูล" value={info.period} />
              <MetaCard label="จำนวน" value={info.count} />
              <MetaCard label="อัปเดตล่าสุด" value={info.lastUpload} />
            </div>
          )}

          {info.fields?.length > 0 && (
            <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-r-lg">
              <h3 className="font-bold text-emerald-900 mb-2 flex items-center gap-2"><span>✓</span> ข้อมูลที่จัดเก็บ</h3>
              <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-700">
                {info.fields.map((f, i) => (
                  <li key={i} className="flex gap-1.5"><span className="text-emerald-600 shrink-0">•</span><span>{f}</span></li>
                ))}
              </ul>
            </div>
          )}

          {info.notCollected?.length > 0 && (
            <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-lg">
              <h3 className="font-bold text-rose-900 mb-2 flex items-center gap-2"><span>🔒</span> ข้อมูลที่ไม่จัดเก็บ (PDPA)</h3>
              <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-700">
                {info.notCollected.map((f, i) => (
                  <li key={i} className="flex gap-1.5"><span className="text-rose-500 shrink-0">✕</span><span>{f}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
