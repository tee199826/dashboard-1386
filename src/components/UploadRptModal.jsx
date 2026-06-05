import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { CheckCircle2, XCircle, FileSpreadsheet, Upload, AlertTriangle, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import { parse114 } from '../utils/importEngine'
import { upsertRpt114 } from '../utils/uploadService'

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function Modal({ children, onClose, title }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

function ConfirmModal({ title, message, detail, onConfirm, onCancel, confirmLabel = 'ยืนยัน', danger = false }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className={`px-6 py-4 border-b ${danger ? 'bg-rose-50 border-rose-100' : 'bg-amber-50 border-amber-100'}`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{danger ? '⚠️' : '📋'}</span>
            <h3 className={`font-bold text-base ${danger ? 'text-rose-800' : 'text-amber-800'}`}>{title}</h3>
          </div>
        </div>
        <div className="px-6 py-5">
          <p className="text-slate-700 text-sm leading-relaxed">{message}</p>
          {detail && <p className="text-xs text-slate-500 mt-2 leading-relaxed">{detail}</p>}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-sm font-medium transition">
            ยกเลิก
          </button>
          <button onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition ${
              danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function UploadRptModal({ onClose, onSaved, showToast }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [rpt114Rows, setRpt114Rows] = useState(null)
  const [rpt114ParseError, setRpt114ParseError] = useState(null)
  const [uploadResult, setUploadResult] = useState(null)

  const handleReset = () => {
    setFile(null); setPreview(null); setError(''); setUploading(false)
    setRpt114Rows(null); setRpt114ParseError(null); setUploadResult(null)
  }

  const handleFile = async (f) => {
    if (!f) return
    setFile(f); setError(''); setPreview(null); setRpt114Rows(null); setRpt114ParseError(null)
    try {
      const buffer = await f.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const sheetName = wb.SheetNames.find(n => n.includes('RPT') || n.includes('114')) || wb.SheetNames[0]
      const sheet = wb.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

      let period = ''
      for (const row of data) {
        if (!row) continue
        if (row[8] === 'ระหว่างวันที่ : ') period = row[11]
      }

      const sumRow = data.find(r => r && String(r[1] || '').trim() === 'รวมทั้งหมด')
      if (!sumRow) throw new Error('ไม่พบแถว "รวมทั้งหมด" — ตรวจสอบว่าเป็นไฟล์ RPT_114')

      const n = v => parseFloat(String(v ?? '').replace(/,/g, '')) || 0
      const totals = {
        total: n(sumRow[2]), completed: n(sumRow[3]), completed_pct: n(sumRow[4]),
        found: n(sumRow[5]), notFound: n(sumRow[6]), notInArea: n(sumRow[7]),
        investigating: n(sumRow[8]), deceased: n(sumRow[9]), arrested: n(sumRow[10]),
        moreInvest: n(sumRow[11]), treatment: n(sumRow[12]), harass: n(sumRow[13]),
        closed: n(sumRow[14]), other: n(sumRow[15]),
      }

      let year = 2569
      if (period) {
        const match = String(period).match(/(\d{2,4})\s*$/)
        if (match) { const y = parseInt(match[1]); year = y < 100 ? 2500 + y : y }
      }
      setPreview({ period, totals, year })

      try {
        const rows = parse114(wb)
        setRpt114Rows(rows); setRpt114ParseError(null)
      } catch (err) {
        setRpt114Rows(null); setRpt114ParseError(err.message)
      }
    } catch (err) {
      setError(err.message)
    }
  }

  const handleUpload = async () => {
    if (!preview) return
    setUploading(true)
    const startMs = Date.now()
    const now = new Date()
    const p2 = n => String(n).padStart(2, '0')
    const batchId = `${now.getFullYear()}${p2(now.getMonth()+1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`

    const result = {
      fileName: file.name, fileSize: file.size, year: preview.year, period: preview.period,
      elapsedSec: '0',
      ops:    { rows: 0, success: false, error: null },
      rpt114: { rows: 0, success: false, error: null, skipped: false },
    }

    // 1. operations_summary
    try {
      await supabase.from('operations_summary').delete().eq('channel', 'รวมทุกช่องทาง').eq('year', preview.year)
      const t = preview.totals
      const note = 'RPT_114 ' + (preview.period || '')
      const opsRows = [
        { channel: 'รวมทุกช่องทาง', category: 'รวมทั้งหมด',        count: t.total,         year: preview.year, notes: note },
        { channel: 'รวมทุกช่องทาง', category: 'ดำเนินการแล้ว',     count: t.completed,     year: preview.year, notes: note },
        { channel: 'รวมทุกช่องทาง', category: 'พบพฤติการณ์',       count: t.found,         year: preview.year, notes: note },
        { channel: 'รวมทุกช่องทาง', category: 'ไม่พบพฤติการณ์',    count: t.notFound,      year: preview.year, notes: note },
        { channel: 'รวมทุกช่องทาง', category: 'ไม่พบตัวในพื้นที่',  count: t.notInArea,     year: preview.year, notes: note },
        { channel: 'รวมทุกช่องทาง', category: 'อยู่ระหว่างสืบสวน', count: t.investigating, year: preview.year, notes: note },
        { channel: 'รวมทุกช่องทาง', category: 'จับกุม',            count: t.arrested,      year: preview.year, notes: note },
        { channel: 'รวมทุกช่องทาง', category: 'บำบัด',             count: t.treatment,     year: preview.year, notes: note },
        { channel: 'รวมทุกช่องทาง', category: 'กลั่นแกล้ง',        count: t.harass,        year: preview.year, notes: note },
        { channel: 'รวมทุกช่องทาง', category: 'ยุติเรื่อง',        count: t.closed,        year: preview.year, notes: note },
        { channel: 'รวมทุกช่องทาง', category: 'อื่นๆ',             count: t.other,         year: preview.year, notes: note },
      ]
      const { error } = await supabase.from('operations_summary').insert(opsRows)
      if (error) throw error
      result.ops.rows = opsRows.length; result.ops.success = true
      try {
        await supabase.from('upload_batches').insert([{
          batch_id: batchId, target_table: 'operations_summary',
          file_name: file.name, row_count: opsRows.length, status: 'completed',
          uploaded_at: now.toISOString(),
        }])
      } catch { /* non-fatal */ }
    } catch (err) {
      result.ops.error = err.message
      try {
        await supabase.from('upload_batches').insert([{
          batch_id: batchId, target_table: 'operations_summary',
          file_name: file.name, row_count: 0, status: 'failed', uploaded_at: now.toISOString(),
        }])
      } catch { /* non-fatal */ }
    }

    // 2. report_114
    if (!rpt114Rows || rpt114Rows.length === 0) {
      result.rpt114.skipped = true
      result.rpt114.error = rpt114ParseError || 'ไม่พบข้อมูลกลุ่มในไฟล์'
    } else {
      try {
        await upsertRpt114(rpt114Rows, { batchId, fileName: file.name })
        result.rpt114.rows = rpt114Rows.length; result.rpt114.success = true
      } catch (err) {
        result.rpt114.error = err.message
      }
    }

    result.elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1)
    if (result.ops.success) onSaved()
    setUploadResult(result); setUploading(false)
  }

  return (
    <Modal onClose={onClose} title={uploadResult ? 'ผลการนำเข้าข้อมูล' : 'นำเข้ารายงาน RPT_114 (ป.ป.ส.)'}>
      <div className="p-6">
        {uploadResult ? (
          <>
            <div className="text-center py-1 mb-5">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 size={36} className="text-emerald-600" />
              </div>
              <div className="text-xl font-bold text-slate-800">นำเข้าข้อมูลสำเร็จ</div>
              <div className="text-sm text-slate-500 mt-1">ใช้เวลา {uploadResult.elapsedSec} วินาที</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 flex items-center gap-3">
              <FileSpreadsheet size={26} className="text-emerald-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800 text-sm truncate">{uploadResult.fileName}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {formatFileSize(uploadResult.fileSize)}
                  <span className="mx-1.5 text-slate-300">|</span>
                  ปีงบประมาณ พ.ศ. {uploadResult.year}
                  {uploadResult.period && <span className="ml-1.5 text-blue-600">({uploadResult.period})</span>}
                </div>
              </div>
            </div>
            <div className="mb-5">
              <div className="text-sm font-semibold text-slate-700 mb-2.5">ผลการบันทึก:</div>
              <div className="space-y-2">
                <div className={`flex items-center gap-3 p-3.5 rounded-xl border ${uploadResult.ops.success ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${uploadResult.ops.success ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                    {uploadResult.ops.success ? <CheckCircle2 size={14} className="text-white" /> : <XCircle size={14} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <code className="text-xs bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono">operations_summary</code>
                      {uploadResult.ops.success
                        ? <span className="text-xs text-emerald-700 font-semibold">เพิ่ม/อัปเดต {uploadResult.ops.rows} แถว</span>
                        : <span className="text-xs text-rose-600 font-medium">ล้มเหลว</span>}
                    </div>
                    {uploadResult.ops.error && <div className="text-xs text-rose-500 mt-1 break-all">{uploadResult.ops.error}</div>}
                  </div>
                  <span className={`text-lg font-bold leading-none ${uploadResult.ops.success ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {uploadResult.ops.success ? '✓' : '✗'}
                  </span>
                </div>
                <div className={`flex items-center gap-3 p-3.5 rounded-xl border ${
                  uploadResult.rpt114.success ? 'bg-emerald-50 border-emerald-200'
                  : uploadResult.rpt114.skipped ? 'bg-amber-50 border-amber-200'
                  : 'bg-rose-50 border-rose-200'}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    uploadResult.rpt114.success ? 'bg-emerald-500' : uploadResult.rpt114.skipped ? 'bg-amber-400' : 'bg-rose-500'}`}>
                    {uploadResult.rpt114.success ? <CheckCircle2 size={14} className="text-white" /> : <AlertTriangle size={14} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <code className="text-xs bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono">report_114</code>
                      {uploadResult.rpt114.success
                        ? <span className="text-xs text-emerald-700 font-semibold">เพิ่ม/อัปเดต {uploadResult.rpt114.rows} แถว (กลุ่ม 1–5 + รวม)</span>
                        : uploadResult.rpt114.skipped
                        ? <span className="text-xs text-amber-600 font-medium">ข้ามการบันทึก</span>
                        : <span className="text-xs text-rose-600 font-medium">ล้มเหลว</span>}
                    </div>
                    {uploadResult.rpt114.error && (
                      <div className={`text-xs mt-1 break-all ${uploadResult.rpt114.skipped ? 'text-amber-500' : 'text-rose-500'}`}>
                        {uploadResult.rpt114.error}
                      </div>
                    )}
                  </div>
                  <span className={`text-lg font-bold leading-none ${uploadResult.rpt114.success ? 'text-emerald-600' : uploadResult.rpt114.skipped ? 'text-amber-500' : 'text-rose-600'}`}>
                    {uploadResult.rpt114.success ? '✓' : uploadResult.rpt114.skipped ? '–' : '✗'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-2.5">
              <button onClick={handleReset} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-sm font-medium transition text-slate-700">
                นำเข้าไฟล์เพิ่ม
              </button>
              <button onClick={onClose} className="px-4 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-sm font-medium transition text-slate-700">ปิด</button>
              <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition">ดูข้อมูล</button>
            </div>
          </>
        ) : !preview && !error ? (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 text-sm text-blue-800">
              <strong>รองรับไฟล์รายงาน RPT_114</strong><br />
              "รายงานการดำเนินการตามข้อร้องเรียน" จากระบบ ป.ป.ส.
            </div>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]) }}
              className={`border-2 border-dashed rounded-xl p-10 text-center ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50'}`}>
              <Upload size={48} className="mx-auto text-slate-400 mb-3" />
              <div className="font-semibold text-slate-700 mb-3">ลากไฟล์ RPT_114 มาวาง</div>
              <label className="inline-block">
                <input type="file" accept=".xlsx,.xls" onChange={e => handleFile(e.target.files[0])} className="hidden" />
                <span className="px-5 py-2.5 bg-blue-600 text-white rounded-lg cursor-pointer font-medium inline-block">เลือกไฟล์</span>
              </label>
            </div>
          </>
        ) : error ? (
          <>
            <div className="bg-rose-50 border-2 border-rose-200 rounded-xl p-5 mb-4">
              <AlertTriangle className="text-rose-600 inline mr-2" size={18} />
              <span className="text-rose-700 font-medium">{error}</span>
            </div>
            <button onClick={() => { setError(''); setFile(null); setRpt114Rows(null); setRpt114ParseError(null) }} className="w-full px-4 py-2 bg-slate-100 rounded-lg">ลองใหม่</button>
          </>
        ) : (
          <>
            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4 mb-4">
              <CheckCircle2 className="text-emerald-600 inline mr-2" size={20} />
              <strong className="text-emerald-900">อ่านไฟล์สำเร็จ</strong>
              <div className="text-xs text-emerald-700 mt-1">
                📅 ช่วง: {preview.period} · 🗓️ ปี: พ.ศ. {preview.year}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="text-xs text-blue-600">เรื่องร้องเรียน</div>
                <div className="text-2xl font-bold text-blue-700">{preview.totals.total.toLocaleString()}</div>
              </div>
              <div className="bg-emerald-50 p-3 rounded-lg">
                <div className="text-xs text-emerald-600">ดำเนินการ</div>
                <div className="text-2xl font-bold text-emerald-700">{preview.totals.completed.toLocaleString()}</div>
              </div>
              <div className="bg-rose-50 p-3 rounded-lg">
                <div className="text-xs text-rose-600">พบพฤติการณ์</div>
                <div className="text-xl font-bold text-rose-700">{preview.totals.found.toLocaleString()}</div>
              </div>
              <div className="bg-slate-100 p-3 rounded-lg">
                <div className="text-xs text-slate-600">ไม่พบ</div>
                <div className="text-xl font-bold text-slate-700">{preview.totals.notFound.toLocaleString()}</div>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs mb-4 space-y-1.5">
              <div className="font-bold text-slate-700 mb-1">จะบันทึกลง 2 ตาราง:</div>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-600">✅</span>
                <code className="bg-slate-200 px-1.5 py-0.5 rounded text-[11px]">operations_summary</code>
                <span className="text-slate-500">— 11 category rows (เหมือนเดิม)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={rpt114Rows ? 'text-emerald-600' : 'text-amber-500'}>{rpt114Rows ? '✅' : '⚠️'}</span>
                <code className={`px-1.5 py-0.5 rounded text-[11px] ${rpt114Rows ? 'bg-slate-200' : 'bg-amber-100'}`}>report_114</code>
                {rpt114Rows
                  ? <span className="text-slate-500">— {rpt114Rows.length} rows (กลุ่ม 1–5 + รวม)</span>
                  : <span className="text-amber-600">parse ไม่ได้: {rpt114ParseError}</span>}
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setPreview(null); setFile(null); setRpt114Rows(null); setRpt114ParseError(null) }} className="px-4 py-2 border rounded-lg">เลือกไฟล์ใหม่</button>
              <button onClick={() => setConfirmOpen(true)} disabled={uploading} className="px-6 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">
                {uploading ? 'กำลังนำเข้า...' : 'ยืนยันนำเข้า'}
              </button>
            </div>
            {confirmOpen && (
              <ConfirmModal
                title="ยืนยันการนำเข้า RPT_114"
                message={`ต้องการแทนที่ข้อมูล RPT_114 ปี พ.ศ. ${preview.year} ทั้งหมดใช่หรือไม่?`}
                detail={`ช่วงเวลา: ${preview.period} · รวม ${preview.totals.total.toLocaleString()} เรื่อง`}
                onConfirm={() => { setConfirmOpen(false); handleUpload() }}
                onCancel={() => setConfirmOpen(false)}
                confirmLabel="นำเข้าข้อมูล"
                danger={true}
              />
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
