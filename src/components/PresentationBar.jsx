import { Maximize2, Minimize2 } from 'lucide-react'
import { usePresentation } from '../context/PresentationContext'

export function PresentationEnterButton({ className = '' }) {
  const { enter } = usePresentation()
  return (
    <button
      onClick={enter}
      title="โหมดนำเสนอ"
      className={`p-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-violet-600 hover:border-violet-300 shadow-sm transition ${className}`}
    >
      <Maximize2 size={15} />
    </button>
  )
}

export default function PresentationBar({ title }) {
  const { exit, lastUpdateLabel } = usePresentation()
  return (
    <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-100 shadow-sm flex-shrink-0">
      <div>
        <h1 className="text-lg font-extrabold text-slate-800">{title}</h1>
        {lastUpdateLabel && (
          <p className="text-xs text-slate-400 mt-0.5">ข้อมูลอัปเดตล่าสุด: <span className="font-semibold text-slate-600">{lastUpdateLabel}</span></p>
        )}
      </div>
      <button onClick={exit} title="ออกจากโหมดนำเสนอ (ESC)"
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-600 text-sm font-medium transition border border-transparent hover:border-red-200">
        <Minimize2 size={15} />
        <span>ออก</span>
      </button>
    </div>
  )
}
