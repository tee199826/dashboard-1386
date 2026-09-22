import { useState, useEffect } from "react"
import { Upload, AlertTriangle, Sparkles } from "lucide-react"
import Modal from "../../shared/ui/Modal.jsx"
import { supabase } from "../../shared/data/supabase.js"
import { TYPE_LABELS, TABLES } from "./uploadConfig.js"
import { nowMs, fetchTableStat, detectFileType, uploadParsedFor, previewCount, recordWord } from "./uploadWorkflow.js"
import { UploadResultModal } from "./UploadResultModal.jsx"
import { ImpactedPages, FileDropzone, StatsBanner, RecentUploads } from "./UploadWidgets.jsx"

export function GuidedUpload({ navigate, reload }) {
  const [dbStats, setDbStats] = useState({})                 // table -> { count, lastUpload }
  const [recent, setRecent] = useState([])                   // upload_batches ล่าสุด
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(null)
  // pending = ไฟล์ที่ parse แล้วรอ confirm: { raw, wb, fileName, rowCount, detection, type }
  const [pending, setPending] = useState(null)
  const [result, setResult] = useState(null)

  // โหลดสถานะ DB ทุกตาราง + รายการอัปล่าสุด
  const loadMeta = () => {
    Promise.all(TABLES.map(async (t) => [t.id, await fetchTableStat(t.id)]))
      .then(pairs => setDbStats(Object.fromEntries(pairs))).catch(() => {})
    supabase.from('upload_batches').select('id, target_table, file_name, row_count, uploaded_at')
      .order('uploaded_at', { ascending: false }).limit(5)
      .then(({ data }) => setRecent(data || [])).catch(() => {})
  }
  useEffect(() => { loadMeta() }, [])

  const lastUpload = recent[0]?.uploaded_at || null

  // drop ไฟล์ → parse + detect (scored) → เปิด detection modal
  const handleFile = async (file) => {
    setLoadError(null)
    setBusy(true)
    try {
      const { raw, wb, detection, rowCount } = await detectFileType(file)
      // unknown → ใช้ top candidate เป็น default (ถ้ามี) แทนการบังคับว่าง
      const type = detection.type !== 'unknown' ? detection.type : (detection.candidates?.[0]?.type || '')
      setPending({ raw, wb, fileName: file.name, rowCount, detection, type })
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const doUpload = async () => {
    if (!pending || !pending.type) return
    const { raw, wb, fileName, type } = pending
    const startedAt = nowMs()
    setBusy(true)
    let res
    try {
      const out = await uploadParsedFor(type, raw, wb, fileName)
      res = { ...out.result, districtAssigned: out.districtAssigned || 0, geoStats: out.geoStats }
    } catch (err) {
      res = { inserted: 0, updated: 0, failed: previewCount(type, raw, wb) || 0, error: err?.message || String(err) }
    }
    res = { ...res, durationMs: nowMs() - startedAt, _type: type, _fileName: fileName }
    setBusy(false)
    setPending(null)
    setResult(res)
  }

  // success: "อัปไฟล์อื่น" → ปิด + refresh meta ; "เสร็จสิ้น" → ไปหน้าหลัก
  const onUploadMore = async () => { await reload(); setResult(null); loadMeta() }
  const onFinish = async () => { await reload(); navigate('/') }

  const det = pending?.detection
  const detTbl = pending && pending.type ? TABLES.find(t => t.id === pending.type) : null
  const confColor = !det ? '' : det.confidence >= 80 ? 'text-emerald-600' : det.confidence >= 50 ? 'text-amber-600' : 'text-rose-600'
  const isUnknown = det && det.type === 'unknown'

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">📤 อัปโหลดข้อมูล</h2>
        <p className="text-sm text-slate-500 mt-0.5">ลากไฟล์มาวาง — ระบบจะตรวจประเภทอัตโนมัติ</p>
      </div>

      <StatsBanner dbStats={dbStats} lastUpload={lastUpload} />

      <div className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-md p-6">
        <FileDropzone onFile={handleFile} busy={busy} className="py-16" />
        {loadError && (
          <div className="mt-4 flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" /> {loadError}
          </div>
        )}
        <p className="text-xs text-slate-400 mt-4 text-center">
          💡 รองรับ: เหตุการณ์ยาเสพติด · เรื่องร้องเรียน 1386 · ผู้เสพ · สรุป บก.น. · รายงาน 114
        </p>
      </div>

      <RecentUploads rows={recent} />

      {/* Detection Result modal */}
      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        title="ตรวจไฟล์เสร็จ"
        icon={<Sparkles size={20} />}
        variant={isUnknown ? 'warning' : 'default'}
        actions={
          <>
            <button onClick={() => setPending(null)}
              className="px-5 py-2.5 border border-slate-300 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition">
              ยกเลิก
            </button>
            <button onClick={doUpload} disabled={busy || !pending?.type}
              className="px-6 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-xl text-sm font-bold transition shadow-md shadow-violet-500/30 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
              <Upload size={15} /> ยืนยันอัปโหลด
            </button>
          </>
        }
      >
        {pending && (
          <div className="space-y-4">
            <dl className="space-y-1.5 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500">📄 ชื่อไฟล์</dt>
                <dd className="text-right font-mono text-xs text-slate-800 break-all">{pending.fileName}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-slate-500">📊 จำนวนแถว</dt>
                <dd className="text-right font-bold text-slate-900">{(pending.rowCount ?? 0).toLocaleString()} {recordWord(pending.type || det.type)}</dd>
              </div>
            </dl>

            {/* ผลการเดา */}
            <div className={`rounded-xl p-4 ${isUnknown ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-violet-50 ring-1 ring-violet-100'}`}>
              {isUnknown ? (
                <div className="text-sm text-amber-800">
                  <div className="font-medium">🤔 ระบบไม่มั่นใจประเภทไฟล์ — เลือกตามแนะนำหรือเลือกเอง</div>
                  {det.candidates?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="text-xs text-amber-700">น่าจะเป็น (เรียงตามคะแนน):</div>
                      {det.candidates.map((c, i) => {
                        const ct = TABLES.find(x => x.id === c.type)
                        return (
                          <button key={c.type} onClick={() => setPending(p => ({ ...p, type: c.type }))}
                            className={`w-full flex items-center justify-between gap-2 text-xs px-2.5 py-1.5 rounded-lg transition ${pending.type === c.type ? 'bg-amber-200/70 ring-1 ring-amber-300' : 'bg-white/60 hover:bg-amber-100'}`}>
                            <span className="text-slate-700">{i + 1}. {ct?.emoji} {ct?.name || c.type} <span className="font-mono text-slate-400">({c.type})</span></span>
                            <span className={`font-semibold ${c.score >= 30 ? 'text-amber-700' : 'text-slate-400'}`}>score {c.score}{c.score < 30 ? ' · ต่ำกว่าเกณฑ์ 30' : ''}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="text-sm text-slate-600">🎯 ระบบเดาว่าเป็น</div>
                  <div className="text-base font-bold text-slate-900 mt-0.5">{detTbl?.emoji} {detTbl?.name} <span className="text-xs font-normal text-slate-400 font-mono">({pending.type})</span></div>
                  <div className={`text-sm font-semibold mt-1 ${confColor}`}>
                    Confidence {det.confidence}% {det.confidence >= 80 ? '✓' : ''}
                    <span className="text-xs font-normal text-slate-500 ml-1">({det.reasons.join(' · ')})</span>
                  </div>
                </>
              )}
            </div>

            {/* override dropdown */}
            <div className="flex items-center justify-between gap-3 border border-slate-200 rounded-xl px-4 py-3">
              <span className="text-sm text-slate-600">❓ {isUnknown ? 'เลือกประเภท' : 'ไม่ถูก? เลือกเอง'}</span>
              <select value={pending.type} onChange={e => setPending(p => ({ ...p, type: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none">
                <option value="">— เลือกประเภท —</option>
                {Object.entries(TYPE_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
              </select>
            </div>

            {/* impacted pages */}
            {pending.type && <ImpactedPages type={pending.type} />}
          </div>
        )}
      </Modal>

      {/* Success modal — reuse UploadResultModal + ImpactedPages */}
      <UploadResultModal
        open={!!result}
        result={result}
        fileName={result?._fileName}
        type={result?._type}
        onClose={onUploadMore}
        onDashboard={onFinish}
        closeLabel="อัปไฟล์อื่น"
        dashboardLabel="เสร็จสิ้น"
      />
    </div>
  )
}
