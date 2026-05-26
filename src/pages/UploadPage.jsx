import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, FileText, AlertTriangle, CheckCircle2,
  X, ChevronDown, RefreshCw, Info, LayoutDashboard,
} from 'lucide-react'
import { parseFile, detectType, mapColumns, buildBatch, validateRows } from '../utils/importEngine'
import { upsertRecords } from '../utils/uploadService'
import { useData } from '../context/DataContext'

// ─── Config ───────────────────────────────────────────────────────────────────

const ACCEPT = '.xlsx,.xls,.csv'

const TYPE_LABELS = {
  complaints:     '📋 เรื่องร้องเรียน (complaints)',
  drug_incidents: '🗺️ เหตุการณ์ยาเสพติด (drug_incidents)',
}

const COL_LABELS = {
  // complaints
  group_no: 'กลุ่มเรื่อง', received_date: 'วันที่รับเรื่อง',
  completed_date: 'วันที่รับผล', channel: 'แหล่งข่าว',
  district: 'เขต', subdistrict: 'แขวง', community: 'หมู่บ้าน/ชุมชน',
  province: 'จังหวัด', person_type: 'ประเภทบุคคล', sex: 'เพศ',
  occupation: 'อาชีพ', role: 'บทบาท', action_unit: 'การดำเนินการ',
  urgency: 'ระดับความเร่งด่วน', status: 'ผลการดำเนินการ',
  drug: 'ยาเสพติด', area_type: 'ประเภทพื้นที่',
  // drug_incidents
  behaviors: 'พฤติการณ์', primary_drug: 'ยาหลัก',
  primary_action: 'ผลดำเนินการ', police_station: 'สน.',
  lat: 'Latitude', lng: 'Longitude',
  // batch (ไม่แสดงในตาราง แต่เก็บ label ไว้)
  record_uid: 'Record UID',
}

// คอลัมน์ที่ไม่ต้องแสดงในตัวอย่าง
const HIDE_COLS = new Set(['batch_id', 'source_file', 'row_index', 'record_uid'])

// ─── Helper ───────────────────────────────────────────────────────────────────

function computePreview(raw, type, fileName) {
  const mapped = mapColumns(raw, type)
  const b      = buildBatch(mapped, fileName, type)
  const v      = validateRows(b.rows, type)
  return { mapped, batch: b, validation: v }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UploadPage() {
  // state machine: idle → preview → uploading → done
  const [phase, setPhase]             = useState('idle')
  const [file, setFile]               = useState(null)
  const [rawRows, setRawRows]         = useState([])
  const [detectedType, setDetectedType] = useState('unknown')
  const [selectedType, setSelectedType] = useState('complaints')
  const [mappedRows, setMappedRows]   = useState([])
  const [batch, setBatch]             = useState(null)
  const [validation, setValidation]   = useState(null)
  const [uploadResult, setUploadResult] = useState(null)
  const [isDragging, setIsDragging]   = useState(false)
  const [isLoading, setIsLoading]     = useState(false)
  const [loadError, setLoadError]     = useState(null)
  const fileInputRef = useRef(null)
  const navigate = useNavigate()
  const { reload } = useData()

  // ─── อ่านไฟล์และเตรียม preview ──────────────────────────────
  const processFile = async (f) => {
    if (!f) return
    const ext = f.name.split('.').pop().toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      setLoadError('รองรับเฉพาะไฟล์ .xlsx, .xls, .csv เท่านั้น')
      return
    }

    setIsLoading(true)
    setLoadError(null)
    try {
      const raw = await parseFile(f)
      if (!raw || raw.length === 0) throw new Error('ไม่พบข้อมูลในไฟล์หรือไฟล์ว่างเปล่า')

      const detected     = detectType(raw)
      const effectiveType = detected === 'unknown' ? 'complaints' : detected
      const { mapped, batch: b, validation: v } = computePreview(raw, effectiveType, f.name)

      setFile(f)
      setRawRows(raw)
      setDetectedType(detected)
      setSelectedType(effectiveType)
      setMappedRows(mapped)
      setBatch(b)
      setValidation(v)
      setPhase('preview')
    } catch (err) {
      setLoadError('อ่านไฟล์ไม่สำเร็จ: ' + err.message)
    } finally {
      setIsLoading(false)
    }
  }

  // ─── เปลี่ยนประเภทข้อมูล (กรณี unknown) ─────────────────────
  const handleTypeChange = (e) => {
    const newType = e.target.value
    setSelectedType(newType)
    if (!rawRows.length || !file) return
    const { mapped, batch: b, validation: v } = computePreview(rawRows, newType, file.name)
    setMappedRows(mapped)
    setBatch(b)
    setValidation(v)
  }

  // ─── Drag & drop ─────────────────────────────────────────────
  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) processFile(f)
  }

  // ─── Reset กลับหน้าแรก ────────────────────────────────────────
  const handleReset = () => {
    setPhase('idle')
    setFile(null)
    setRawRows([])
    setMappedRows([])
    setBatch(null)
    setValidation(null)
    setUploadResult(null)
    setLoadError(null)
    setDetectedType('unknown')
    setSelectedType('complaints')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ─── ยืนยันอัปโหลด ───────────────────────────────────────────
  const handleConfirm = async () => {
    if (!batch || !file) return
    setPhase('uploading')
    const result = await upsertRecords(selectedType, batch.rows, {
      batchId:  batch.batchId,
      fileName: file.name,
    })
    setUploadResult(result)
    setPhase('done')
  }

  // คอลัมน์ที่จะแสดงในตัวอย่าง (ตัด batch meta ออก)
  const previewCols = mappedRows.length > 0
    ? Object.keys(mappedRows[0]).filter(k => !HIDE_COLS.has(k))
    : []

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div
      className="p-4 sm:p-6 max-w-5xl mx-auto"
      style={{ fontFamily: 'Sarabun, sans-serif' }}
    >
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center gap-3">
          <span className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow">
            <Upload size={20} className="text-white" />
          </span>
          นำเข้าข้อมูลจากไฟล์ Excel / CSV
        </h1>
        <p className="text-sm text-slate-500 mt-2 ml-[52px]">
          รองรับ .xlsx · .xls · .csv — ตรวจสอบข้อมูลก่อนบันทึกเข้าฐานข้อมูล
        </p>
      </div>

      {/* ════════════ IDLE — drop zone ════════════ */}
      {phase === 'idle' && (
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          className={`border-2 border-dashed rounded-2xl p-10 sm:p-20 text-center transition-all duration-200 ${
            isDragging
              ? 'border-blue-500 bg-blue-50 scale-[1.01]'
              : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50'
          }`}
        >
          <div className="flex flex-col items-center gap-5">
            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center transition-colors ${
              isDragging ? 'bg-blue-100' : 'bg-slate-100'
            }`}>
              <Upload size={36} className={isDragging ? 'text-blue-500' : 'text-slate-400'} />
            </div>

            <div>
              <p className="text-lg font-semibold text-slate-700">
                {isDragging ? 'วางไฟล์ที่นี่เลย' : 'ลากไฟล์มาวางที่นี่'}
              </p>
              <p className="text-sm text-slate-400 mt-1">หรือคลิกปุ่มด้านล่างเพื่อเลือกจากเครื่อง</p>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="px-7 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 shadow"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  กำลังอ่านไฟล์...
                </span>
              ) : 'เลือกไฟล์'}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={e => processFile(e.target.files?.[0])}
            />

            <div className="flex items-center gap-4 text-xs text-slate-400">
              {['.xlsx', '.xls', '.csv'].map(ext => (
                <span key={ext} className="px-2 py-0.5 bg-slate-100 rounded-md font-mono">{ext}</span>
              ))}
            </div>
          </div>

          {loadError && (
            <div className="mt-6 flex items-center gap-2 justify-center text-rose-600 text-sm bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 max-w-md mx-auto">
              <AlertTriangle size={16} className="flex-shrink-0" />
              {loadError}
            </div>
          )}
        </div>
      )}

      {/* ════════════ PREVIEW ════════════ */}
      {phase === 'preview' && file && batch && validation && (
        <div className="space-y-4">

          {/* ── Info card ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">

            {/* ชื่อไฟล์ + ปุ่มปิด */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileText size={18} className="text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 text-sm truncate">{file.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {rawRows.length.toLocaleString()} แถว · {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <button
                onClick={handleReset}
                title="เลือกไฟล์ใหม่"
                className="text-slate-400 hover:text-slate-600 transition flex-shrink-0 p-1"
              >
                <X size={18} />
              </button>
            </div>

            {/* ประเภทข้อมูล */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600 font-medium">ประเภทข้อมูล:</span>

              {detectedType !== 'unknown' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium border border-blue-200">
                  <CheckCircle2 size={13} />
                  {TYPE_LABELS[detectedType]}
                  <span className="text-blue-400 text-xs">(ตรวจพบอัตโนมัติ)</span>
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
                  <span className="text-xs text-amber-700">ตรวจประเภทไม่ได้ กรุณาเลือกเอง:</span>
                  <div className="relative">
                    <select
                      value={selectedType}
                      onChange={handleTypeChange}
                      className="appearance-none pl-3 pr-8 py-1.5 bg-amber-50 border border-amber-300 text-amber-800 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      <option value="complaints">📋 เรื่องร้องเรียน</option>
                      <option value="drug_incidents">🗺️ เหตุการณ์ยาเสพติด</option>
                    </select>
                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-amber-600 pointer-events-none" />
                  </div>
                </div>
              )}
            </div>

            {/* สรุปตัวเลข */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-slate-700">{rawRows.length.toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-0.5">แถวทั้งหมด</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-emerald-700">{validation.validCount.toLocaleString()}</p>
                <p className="text-xs text-emerald-600 mt-0.5">ผ่านการตรวจ</p>
              </div>
              <div className={`rounded-xl p-3 text-center ${validation.issues.length > 0 ? 'bg-amber-50' : 'bg-slate-50'}`}>
                <p className={`text-2xl font-bold ${validation.issues.length > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                  {validation.issues.length}
                </p>
                <p className={`text-xs mt-0.5 ${validation.issues.length > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                  แจ้งเตือน
                </p>
              </div>
            </div>
          </div>

          {/* ── Issues (orange, not red) ── */}
          {validation.issues.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-amber-800 flex items-center gap-2 mb-3">
                <AlertTriangle size={15} className="flex-shrink-0" />
                รายการแจ้งเตือน {validation.issues.length} รายการ
                <span className="font-normal text-amber-600">— ยังสามารถอัปโหลดได้</span>
              </h3>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {validation.issues.map((issue, i) => (
                  <div key={i} className="flex items-baseline gap-2 text-xs">
                    <span className="font-bold text-amber-600 flex-shrink-0 w-16">
                      แถว {issue.rowIndex}
                    </span>
                    <span className="text-amber-700 font-semibold flex-shrink-0">
                      [{issue.field}]
                    </span>
                    <span className="text-amber-800">{issue.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── ตัวอย่าง 10 แถว ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-700">
                ตัวอย่าง 10 แถวแรก (หลัง map คอลัมน์แล้ว)
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{previewCols.length} คอลัมน์</span>
                <div className="group relative">
                  <Info size={14} className="text-slate-400 cursor-help" />
                  <div className="hidden group-hover:block absolute right-0 top-5 z-10 w-56 bg-slate-800 text-white text-xs rounded-lg p-2.5 shadow-lg">
                    แสดงข้อมูลหลัง map ชื่อคอลัมน์แล้ว ก่อนอัปโหลดจริง
                  </div>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-3 py-2.5 text-left text-slate-400 font-medium bg-slate-50 sticky left-0 border-r border-slate-100 whitespace-nowrap">#</th>
                    {previewCols.map(col => (
                      <th key={col} className="px-3 py-2.5 text-left text-slate-600 font-semibold whitespace-nowrap bg-slate-50">
                        {COL_LABELS[col] || col}
                        <span className="block text-[10px] font-normal text-slate-400">{col}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mappedRows.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-blue-50/40 transition">
                      <td className="px-3 py-2 text-slate-400 sticky left-0 bg-white border-r border-slate-100">{i + 1}</td>
                      {previewCols.map(col => (
                        <td key={col} className="px-3 py-2 text-slate-700 whitespace-nowrap">
                          {row[col] == null
                            ? <span className="text-slate-300">—</span>
                            : <span className="max-w-[200px] truncate block">{String(row[col])}</span>
                          }
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Action buttons ── */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end pt-1">
            <button
              onClick={handleReset}
              className="px-6 py-2.5 border border-slate-300 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleConfirm}
              className="px-7 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-sm font-bold transition-all shadow flex items-center justify-center gap-2"
            >
              <Upload size={15} />
              ยืนยันอัปโหลด {rawRows.length.toLocaleString()} แถว
            </button>
          </div>
        </div>
      )}

      {/* ════════════ UPLOADING ════════════ */}
      {phase === 'uploading' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 text-center">
          <div className="inline-block w-14 h-14 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-5" />
          <p className="text-lg font-bold text-slate-700">กำลังอัปโหลดข้อมูล...</p>
          <p className="text-sm text-slate-400 mt-2">
            กรุณารอสักครู่ อาจใช้เวลาสักพักหากมีข้อมูลจำนวนมาก
          </p>
        </div>
      )}

      {/* ════════════ DONE ════════════ */}
      {phase === 'done' && uploadResult && (
        <div className="space-y-4">
          <div className={`rounded-2xl p-6 border ${
            uploadResult.failed === 0
              ? 'bg-emerald-50 border-emerald-200'
              : uploadResult.failed === (uploadResult.inserted + uploadResult.updated + uploadResult.failed)
              ? 'bg-rose-50 border-rose-200'
              : 'bg-amber-50 border-amber-200'
          }`}>
            {/* Result header */}
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow ${
                uploadResult.failed === 0 ? 'bg-emerald-500'
                : uploadResult.inserted + uploadResult.updated === 0 ? 'bg-rose-500'
                : 'bg-amber-500'
              }`}>
                {uploadResult.failed === 0
                  ? <CheckCircle2 size={22} className="text-white" />
                  : <AlertTriangle size={22} className="text-white" />
                }
              </div>
              <div>
                <h2 className="font-bold text-lg text-slate-800">
                  {uploadResult.failed === 0 ? 'อัปโหลดสำเร็จ'
                   : uploadResult.inserted + uploadResult.updated === 0 ? 'อัปโหลดไม่สำเร็จ'
                   : 'อัปโหลดเสร็จสิ้น (บางส่วน)'}
                </h2>
                <p className="text-sm text-slate-500">{file?.name}</p>
              </div>
            </div>

            {/* Result counts */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-white rounded-xl p-4 text-center shadow-sm">
                <p className="text-3xl font-bold text-emerald-600">{uploadResult.inserted.toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-1.5 font-medium">เพิ่มใหม่</p>
              </div>
              <div className="bg-white rounded-xl p-4 text-center shadow-sm">
                <p className="text-3xl font-bold text-blue-600">{uploadResult.updated.toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-1.5 font-medium">อัปเดต</p>
              </div>
              <div className="bg-white rounded-xl p-4 text-center shadow-sm">
                <p className={`text-3xl font-bold ${uploadResult.failed > 0 ? 'text-rose-600' : 'text-slate-300'}`}>
                  {uploadResult.failed.toLocaleString()}
                </p>
                <p className="text-xs text-slate-500 mt-1.5 font-medium">ผิดพลาด</p>
              </div>
            </div>

            {/* Error message */}
            {uploadResult.error && (
              <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 rounded-xl px-4 py-3 border border-rose-200">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                <span>{uploadResult.error}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end">
            <button
              onClick={handleReset}
              className="px-6 py-2.5 border border-slate-300 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition flex items-center justify-center gap-2"
            >
              <RefreshCw size={15} />
              อัปโหลดไฟล์ใหม่
            </button>
            {uploadResult && uploadResult.failed < (uploadResult.inserted + uploadResult.updated + uploadResult.failed) && (
              <button
                onClick={async () => { await reload(); navigate('/') }}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-sm font-semibold transition-all shadow flex items-center justify-center gap-2"
              >
                <LayoutDashboard size={15} />
                ดูข้อมูลล่าสุดในแดชบอร์ด
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
