import { useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, LayoutDashboard, MapPin, Circle, Copy } from 'lucide-react'
import Modal from '../../shared/ui/Modal.jsx'
import { humanizeError } from './uploadWorkflow.js'
import { ImpactedPages } from './UploadWidgets.jsx'

// แถวรายละเอียดใน confirm modal
export function ConfirmRow({ label, value, mono }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-500 flex-shrink-0">{label}</dt>
      <dd className={`text-right text-slate-800 break-all ${mono ? 'font-mono text-xs' : ''}`}>{value ?? '—'}</dd>
    </div>
  )
}

// Result modal — success / error / partial (variant ตาม failed/ok)
export function UploadResultModal({ open, result, fileName, type, onClose, onDashboard, closeLabel, dashboardLabel }) {
  const [copied, setCopied] = useState(false)
  if (!result) return <Modal open={false} onClose={onClose} title="" />

  const fail = result.failed || 0
  const ok = (result.inserted || 0) + (result.updated || 0)
  const variant = fail === 0 ? 'success' : ok === 0 ? 'error' : 'warning'
  const title = fail === 0 ? 'อัปโหลดสำเร็จ ✓' : ok === 0 ? 'อัปโหลดไม่สำเร็จ' : 'อัปโหลดเสร็จสิ้น (บางส่วน)'
  const icon = variant === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />
  const durationS = result.durationMs != null ? (result.durationMs / 1000).toFixed(1) : null
  const rowErrors = Array.isArray(result.errors) ? result.errors : []
  const geo = result.geoStats   // drug_incidents เท่านั้น (parser คืน orientation stats)

  const copyLog = async () => {
    const log = JSON.stringify({ file: fileName, type, ...result, errors: rowErrors }, null, 2)
    try { await navigator.clipboard.writeText(log); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard ไม่พร้อม */ }
  }

  const actions = variant === 'error' ? (
    <>
      <button onClick={copyLog}
        className="px-5 py-2.5 border border-slate-300 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition flex items-center justify-center gap-2">
        <Copy size={15} /> {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอก error log'}
      </button>
      <button onClick={onClose}
        className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-bold transition">
        ปิด
      </button>
    </>
  ) : (
    <>
      <button onClick={onClose}
        className="px-5 py-2.5 border border-slate-300 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition flex items-center justify-center gap-2">
        <RefreshCw size={15} /> {closeLabel || 'ปิด / อัปใหม่'}
      </button>
      <button onClick={onDashboard}
        className="px-6 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-xl text-sm font-bold transition shadow-md shadow-violet-500/30 flex items-center justify-center gap-2">
        <LayoutDashboard size={15} /> {dashboardLabel || 'ดูข้อมูลในแดชบอร์ด →'}
      </button>
    </>
  )

  return (
    <Modal open={open} onClose={onClose} title={title} variant={variant} icon={icon} actions={actions}>
      <p className="text-xs text-slate-400 font-mono break-all mb-4">{fileName}</p>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-emerald-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-emerald-600">{(result.inserted || 0).toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-0.5">เพิ่มใหม่</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-blue-600">{(result.updated || 0).toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-0.5">อัปเดต</p>
        </div>
        <div className={`rounded-xl p-3 text-center ${fail > 0 ? 'bg-rose-50' : 'bg-slate-50'}`}>
          <p className={`text-2xl font-bold ${fail > 0 ? 'text-rose-600' : 'text-slate-300'}`}>{fail.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-0.5">ผิดพลาด</p>
        </div>
      </div>

      <div className="space-y-2">
        {result.skipped > 0 && (
          <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
            <Circle size={13} className="flex-shrink-0 text-slate-400" /> ข้าม (ซ้ำ): {result.skipped.toLocaleString()} row
          </div>
        )}
        {result.districtAssigned > 0 && (
          <div className="flex items-center gap-2 text-sm text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2 border border-indigo-100">
            <MapPin size={14} className="flex-shrink-0" /> 🗺️ Auto-assign เขต: {result.districtAssigned.toLocaleString()} row
          </div>
        )}
        {geo && (
          <div className="bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-200">
            <div className="text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5"><MapPin size={14} className="flex-shrink-0" /> 📍 ตรวจสอบพิกัด</div>
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">พิกัดปกติ (X=lat, Y=lng)</span>
                <span className="font-semibold text-slate-700 tabular-nums">{(geo.normalOrientation || 0).toLocaleString()} row</span>
              </div>
              {geo.swappedXY > 0 && (
                <div className="flex items-center justify-between gap-3 text-amber-700 bg-amber-50 -mx-1 px-1.5 py-1 rounded">
                  <span>⚠️ พิกัดสลับแกน (X=lng, Y=lat) — auto-แก้แล้ว</span>
                  <span className="font-semibold tabular-nums">{geo.swappedXY.toLocaleString()} row</span>
                </div>
              )}
              {geo.invalidGeo > 0 && (
                <div className="flex items-center justify-between gap-3 text-rose-700 bg-rose-50 -mx-1 px-1.5 py-1 rounded">
                  <span>✕ พิกัดผิดรูป (เก็บเป็นค่าว่าง)</span>
                  <span className="font-semibold tabular-nums">{geo.invalidGeo.toLocaleString()} row</span>
                </div>
              )}
              {geo.clearedOutOfBkk > 0 && (
                <div className="flex items-center justify-between gap-3 text-slate-500 bg-slate-100/70 -mx-1 px-1.5 py-1 rounded">
                  <span>ℹ️ พิกัดนอก กทม. — ตั้งเป็นค่าว่าง (เก็บข้อมูลยาไว้)</span>
                  <span className="font-semibold tabular-nums">{geo.clearedOutOfBkk.toLocaleString()} row</span>
                </div>
              )}
              {geo.skippedInvalidYear > 0 && (
                <div className="flex items-center justify-between gap-3 text-amber-700 bg-amber-50 -mx-1 px-1.5 py-1 rounded">
                  <span>⚠️ ปีไม่ถูกต้อง (ข้ามแถว)</span>
                  <span className="font-semibold tabular-nums">{geo.skippedInvalidYear.toLocaleString()} row</span>
                </div>
              )}
            </div>
          </div>
        )}
        {durationS != null && (
          <div className="flex items-center gap-2 text-sm text-slate-500 px-3 py-1">
            ⏱️ ใช้เวลา: {durationS}s
          </div>
        )}
        {result.error && (() => {
          const h = humanizeError(result.error)
          if (!h) return (
            <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 rounded-lg px-3 py-2 border border-rose-200">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> <span className="break-words">{result.error}</span>
            </div>
          )
          return (
            <div className="text-sm bg-rose-50 rounded-lg px-3 py-3 border border-rose-200 space-y-2">
              <div className="flex items-start gap-2 font-semibold text-rose-700">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> ❌ {h.title}
              </div>
              <div className="text-xs text-rose-700">
                <div className="font-medium mb-0.5">สาเหตุที่เป็นไปได้:</div>
                <ul className="list-disc list-inside space-y-0.5 text-rose-600">
                  {h.causes.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
              {h.hint && (
                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">💡 {h.hint}</div>
              )}
              <details className="text-[11px] text-slate-400">
                <summary className="cursor-pointer">ดู error เดิม</summary>
                <span className="break-words font-mono">{result.error}</span>
              </details>
            </div>
          )
        })()}
        {rowErrors.length > 0 && (
          <div className="bg-rose-50 rounded-lg px-3 py-2 border border-rose-200">
            <p className="text-xs font-semibold text-rose-700 mb-1">ข้อผิดพลาดรายแถว:</p>
            <ul className="space-y-0.5 text-xs text-rose-700">
              {rowErrors.slice(0, 5).map((e, i) => (
                <li key={i} className="break-words">• {typeof e === 'string' ? e : (e.message || JSON.stringify(e))}</li>
              ))}
              {rowErrors.length > 5 && <li className="text-rose-500">… และอีก {rowErrors.length - 5} row</li>}
            </ul>
          </div>
        )}
        {result.batchLogError && (
          <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> <span className="break-words">⚠️ บันทึก log ไม่สำเร็จ (ข้อมูลหลักบันทึกแล้ว): {result.batchLogError}</span>
          </div>
        )}
      </div>

      {/* link ไปหน้าที่กระทบ (success / partial) */}
      {variant !== 'error' && <ImpactedPages type={type} />}
    </Modal>
  )
}
