import { useState, useRef } from "react"
import { Sparkles, BarChart3, ExternalLink, Clock } from "lucide-react"
import { ACCEPT, TABLE_TO_PAGES, TABLES } from "./uploadConfig.js"
import { cn, daysSince, dayLabel } from "./uploadWorkflow.js"

// ─── Impacted Pages — ไฟล์นี้จะอัปเดตหน้าไหนบ้าง (reverse mapping) ────────────────
export function ImpactedPages({ type }) {
  const pages = TABLE_TO_PAGES[type]
  if (!pages || pages.length === 0) return null

  return (
    <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-semibold text-blue-900">
          ไฟล์นี้จะอัปเดตหน้า ({pages.length} หน้า)
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {pages.map(p => (
          <div
            key={p.route}
            className="inline-flex items-center gap-2 bg-white border border-blue-200 rounded-lg px-3 py-1.5 text-sm hover:border-blue-400 hover:shadow-sm transition cursor-pointer"
            onClick={() => window.open(p.route, '_blank')}
            title={`เปิด ${p.name} ในแท็บใหม่`}
          >
            <p.icon className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-slate-700 font-medium">{p.name}</span>
            <span className="text-xs text-slate-400 font-mono">{p.route}</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-600 mt-3 leading-relaxed">
        💡 หลังกดยืนยันอัปโหลด ข้อมูลจะ sync ทันที คุณสามารถเปิดหน้าด้านบนเพื่อดูผลได้
      </p>
    </div>
  )
}

// ─── Guided Upload ("อัปตามหน้า") ────────────────────────────────────────────────

// dropzone เล็กต่อ slot — รับไฟล์เดียวแล้วส่งให้ onFile
export function FileDropzone({ onFile, busy, className }) {
  const ref = useRef(null)
  const [drag, setDrag] = useState(false)
  return (
    <div
      onDrop={e => { e.preventDefault(); setDrag(false); if (busy) return; const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}
      onDragOver={e => { e.preventDefault(); if (!busy) setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onClick={() => !busy && ref.current?.click()}
      className={cn(
        'border-2 border-dashed rounded-lg px-4 py-3 text-center transition',
        busy ? 'opacity-60 cursor-wait border-slate-300' : 'cursor-pointer',
        drag ? 'border-blue-500 bg-blue-50' : (!busy && 'border-slate-300 hover:border-blue-400'),
        className,
      )}
    >
      {busy ? (
        <span className="text-xs text-slate-500 inline-flex items-center gap-2">
          <span className="w-3 h-3 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
          กำลังอัปโหลด...
        </span>
      ) : (
        <span className="text-xs text-slate-500">ลากไฟล์มาวางหรือคลิก</span>
      )}
      <input ref={ref} type="file" accept={ACCEPT} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
    </div>
  )
}

// แบนเนอร์สรุปสถานะ DB รวม
export function StatsBanner({ dbStats, lastUpload }) {
  const tables = Object.values(dbStats)
  const total = tables.reduce((s, v) => s + (v?.count || 0), 0)
  const days = daysSince(lastUpload)
  return (
    <div className="flex items-center gap-3 flex-wrap bg-white ring-1 ring-slate-200 rounded-2xl px-5 py-3.5 text-sm">
      <span className="inline-flex items-center gap-1.5 text-slate-700"><BarChart3 size={15} className="text-violet-600" /> <strong>{TABLES.length}</strong> ตาราง</span>
      <span className="text-slate-300">·</span>
      <span className="text-slate-700"><strong className="tabular-nums">{total.toLocaleString()}</strong> row รวม</span>
      {days != null && <><span className="text-slate-300">·</span><span className="text-slate-500">อัปล่าสุด {dayLabel(days)}</span></>}
    </div>
  )
}

// รายการอัปล่าสุด (จาก upload_batches)
export function RecentUploads({ rows }) {
  if (!rows?.length) return null
  return (
    <div className="bg-white ring-1 ring-slate-200 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Clock size={15} className="text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-700">อัปล่าสุด</h3>
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => {
          const days = daysSince(r.uploaded_at)
          const t = TABLES.find(x => x.id === r.target_table)
          return (
            <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="text-lg flex-shrink-0">{t?.emoji || '📄'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-slate-800 truncate">{r.file_name}</div>
                <div className="text-xs text-slate-400 font-mono">{r.target_table}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="tabular-nums font-medium text-slate-700">{(r.row_count ?? 0).toLocaleString()} row</div>
                {days != null && <div className="text-xs text-slate-400">{dayLabel(days)}</div>}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
