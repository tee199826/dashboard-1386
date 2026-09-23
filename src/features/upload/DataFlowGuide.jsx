import { useState } from 'react'
import { FileText, ChevronDown, BookOpen, Sparkles } from 'lucide-react'
import { FLOW_COLORS, FLOW_MAP } from './uploadConfig.js'

export function DataFlowGuide() {
  // default: เปิดบน tablet+ (≥768px), ปิดบน mobile
  const [open, setOpen] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 768px)').matches)

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition mb-6 overflow-hidden">
      {/* header — collapsible toggle */}
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/30">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-slate-900">คู่มือการนำเข้าข้อมูล</h3>
            <p className="text-xs text-slate-500">ดูว่าไฟล์แต่ละชนิดจะแสดงในหน้าใดบ้าง</p>
          </div>
        </div>
        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* body */}
      {open && (
        <div className="px-6 pb-6 border-t border-slate-100 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {FLOW_MAP.map(item => {
              const c = FLOW_COLORS[item.color] || FLOW_COLORS.blue
              const Icon = item.icon
              return (
                <div key={item.route}
                  className={`group bg-white border border-slate-100 rounded-xl p-4 transition-all duration-200 hover:shadow-md ${c.border} ${c.shadow}`}>
                  {/* page header */}
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br ${c.grad}`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-slate-900 truncate">{item.page}</div>
                      <div className="text-xs text-slate-400 font-mono">{item.route}</div>
                    </div>
                  </div>
                  {/* files */}
                  <div className="mb-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">ไฟล์ที่อัป</div>
                    <div className="space-y-1">
                      {item.files.map(f => (
                        <div key={f} className="flex items-start gap-1.5 text-xs">
                          <FileText className="w-3 h-3 mt-0.5 text-slate-400 flex-shrink-0" />
                          <span className="text-slate-700">{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* tables */}
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">ตาราง DB</div>
                    <div className="flex flex-wrap gap-1">
                      {item.tables.map(t => (
                        <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* info bar */}
          <div className="mt-4 flex items-start gap-2 p-3 bg-blue-50/60 border border-blue-100 rounded-lg">
            <Sparkles className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-slate-700">
              <span className="font-semibold text-blue-700">Auto-detect:</span>{' '}
              ระบบตรวจสอบชนิดไฟล์อัตโนมัติจากชื่อ column ถ้าตรวจผิด คลิกที่ป้ายชนิดไฟล์เพื่อเปลี่ยนเอง
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
