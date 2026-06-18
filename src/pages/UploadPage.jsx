import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, FileText, AlertTriangle, CheckCircle2,
  X, ChevronDown, RefreshCw, Info, LayoutDashboard,
  BookOpen, Sparkles, BarChart3, MapPin, Shield, Map as MapIcon, TrendingUp, Users, ExternalLink,
  Check, Circle, ChevronRight, ArrowLeft,
} from 'lucide-react'
import { parseFile, detectType, mapColumns, buildBatch, validateRows, parse115B, parse114, flattenSubstanceUserRow } from '../utils/importEngine'
import { upsertRecords, upsertBknSummary, upsertRpt114, upsertSubstanceUsers } from '../utils/uploadService'
import { useData } from '../context/DataContext'

// ─── Config ───────────────────────────────────────────────────────────────────

const ACCEPT = '.xlsx,.xls,.csv'

const TYPE_LABELS = {
  complaints:     '📋 เรื่องร้องเรียน (complaints)',
  drug_incidents: '🗺️ เหตุการณ์ยาเสพติด (drug_incidents)',
  bkn_summary:    '📊 สรุป บก.น. 1–9 (RPT_115_B)',
  report_114:     '📑 รายงาน RPT_114 (การดำเนินการตามร้องเรียน)',
  substance_users:'🧑 แบบเก็บข้อมูลผู้เสพ (substance_users)',
}

// Reverse mapping: ประเภทข้อมูล (ตาราง) → หน้าเว็บที่ได้รับผลกระทบเมื่ออัปไฟล์นี้
const TABLE_TO_PAGES = {
  complaints: [
    { name: 'ภาพรวม', route: '/', icon: BarChart3 },
    { name: 'รายเขต', route: '/districts', icon: MapPin },
    { name: 'ผลการดำเนินงาน', route: '/operations', icon: TrendingUp },
  ],
  drug_incidents: [
    { name: 'ภาพรวม', route: '/', icon: BarChart3 },
    { name: 'รายเขต', route: '/districts', icon: MapPin },
    { name: 'แผนที่ยาเสพติด', route: '/radar', icon: MapIcon },
  ],
  bkn_summary: [
    { name: 'ภาพรวม', route: '/', icon: BarChart3 },
    { name: 'สถิติ บก.น.', route: '/bkn', icon: Shield },
  ],
  report_114: [
    { name: 'ภาพรวม', route: '/', icon: BarChart3 },
    { name: 'ผลการดำเนินงาน', route: '/operations', icon: TrendingUp },
  ],
  substance_users: [
    { name: 'ภาพรวม', route: '/', icon: BarChart3 },
    { name: 'รายเขต', route: '/districts', icon: MapPin },
    { name: 'ผลเก็บข้อมูลผู้เสพ', route: '/substance-users', icon: Users },
  ],
}

const COL_LABELS = {
  group_no: 'กลุ่มเรื่อง', received_date: 'วันที่รับเรื่อง',
  completed_date: 'วันที่รับผล', channel: 'แหล่งข่าว',
  district: 'เขต', subdistrict: 'แขวง', community: 'หมู่บ้าน/ชุมชน',
  province: 'จังหวัด', person_type: 'ประเภทบุคคล', sex: 'เพศ',
  occupation: 'อาชีพ', role: 'บทบาท', action_unit: 'การดำเนินการ',
  urgency: 'ระดับความเร่งด่วน', status: 'ผลการดำเนินการ',
  drug: 'ยาเสพติด', area_type: 'ประเภทพื้นที่',
  behaviors: 'พฤติการณ์', primary_drug: 'ยาหลัก',
  primary_action: 'ผลดำเนินการ', police_station: 'สน.',
  lat: 'Latitude', lng: 'Longitude',
  record_uid: 'Record UID',
}

const HIDE_COLS = new Set(['batch_id', 'source_file', 'row_index', 'record_uid'])

// ─── Guided mode ("อัปตามหน้า") — เลือกหน้าก่อน แล้วบอกว่าต้องอัปไฟล์อะไรบ้าง ──────
const PAGES = [
  { id: 'overview',        name: 'ภาพรวม',            route: '/',                 icon: BarChart3,  gradient: 'from-blue-500 to-indigo-600',   shadow: 'shadow-blue-500/30',   requiredFiles: ['complaints', 'drug_incidents', 'bkn_summary', 'report_114', 'substance_users'] },
  { id: 'districts',       name: 'รายเขต',            route: '/districts',        icon: MapPin,     gradient: 'from-indigo-500 to-purple-600', shadow: 'shadow-indigo-500/30', requiredFiles: ['complaints', 'drug_incidents', 'substance_users'] },
  { id: 'bkn',             name: 'สถิติ บก.น.',        route: '/bkn',              icon: Shield,     gradient: 'from-slate-600 to-slate-800',   shadow: 'shadow-slate-500/30',  requiredFiles: ['bkn_summary'] },
  { id: 'radar',           name: 'แผนที่ยาเสพติด',     route: '/radar',            icon: MapIcon,    gradient: 'from-cyan-500 to-blue-600',     shadow: 'shadow-cyan-500/30',   requiredFiles: ['drug_incidents'] },
  { id: 'operations',      name: 'ผลการดำเนินงาน',     route: '/operations',       icon: TrendingUp, gradient: 'from-amber-500 to-orange-600',  shadow: 'shadow-amber-500/30',  requiredFiles: ['report_114', 'complaints'] },
  { id: 'substance-users', name: 'ผลเก็บข้อมูลผู้เสพ',  route: '/substance-users',  icon: Users,      gradient: 'from-violet-500 to-purple-600', shadow: 'shadow-violet-500/30', requiredFiles: ['substance_users'] },
]

const FILE_LABELS = {
  complaints:      'ไฟล์เรื่องร้องเรียน 1386',
  drug_incidents:  'ไฟล์เหตุการณ์ยาเสพติด',
  bkn_summary:     'ไฟล์สรุป บก.น. (RPT 115_B)',
  report_114:      'ไฟล์รายงาน 114 (RPT_114)',
  substance_users: 'ไฟล์แบบเก็บข้อมูลผู้เสพ',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const cn = (...c) => c.filter(Boolean).join(' ')

function timeAgo(ts, now) {
  const s = Math.max(0, Math.floor((now - ts) / 1000))
  if (s < 60) return `${s} วินาทีที่แล้ว`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} นาทีที่แล้ว`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ชั่วโมงที่แล้ว`
  return `${Math.floor(h / 24)} วันที่แล้ว`
}

// ตรวจไฟล์ (parse + detect) ก่อนอัป — ใช้ util เดิม ไม่แตะ parser
async function detectFileType(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  if (!['xlsx', 'xls', 'csv'].includes(ext)) throw new Error('รองรับเฉพาะไฟล์ .xlsx, .xls, .csv เท่านั้น')
  const { rows: raw, workbook: wb } = await parseFile(file)
  if (!raw || raw.length === 0) throw new Error('ไม่พบข้อมูลในไฟล์หรือไฟล์ว่างเปล่า')
  return { raw, wb, detected: detectType(raw) }
}

// อัปไฟล์เข้าตาราง table — dispatch ไป upsert service เดิม (ไม่แตะ UPSERT logic)
async function uploadParsedFor(table, raw, wb, fileName) {
  const batchId = genBatchId()
  if (table === 'bkn_summary') {
    const data = parse115B(wb)
    const result = await upsertBknSummary(data, { batchId, fileName })
    return { total: data.length, result }
  }
  if (table === 'report_114') {
    const data = parse114(wb)
    const result = await upsertRpt114(data, { batchId, fileName })
    return { total: data.length, result }
  }
  if (table === 'substance_users') {
    const result = await upsertSubstanceUsers(raw, { batchId, fileName })
    return { total: raw.length, result }
  }
  const { batch } = computePreview(raw, table, fileName)
  const result = await upsertRecords(table, batch.rows, { batchId: batch.batchId, fileName })
  return { total: batch.rows.length, result }
}

function genBatchId() {
  const now = new Date()
  const p = (n, l = 2) => String(n).padStart(l, '0')
  return [now.getFullYear(), p(now.getMonth() + 1), p(now.getDate())].join('') +
    '-' + [p(now.getHours()), p(now.getMinutes()), p(now.getSeconds())].join('')
}

function computePreview(raw, type, fileName) {
  const mapped = type === 'substance_users'
    ? raw.map((r, i) => flattenSubstanceUserRow(r, fileName, i + 1))
    : mapColumns(raw, type)
  const b      = buildBatch(mapped, fileName, type)
  const v      = validateRows(b.rows, type)
  return { mapped, batch: b, validation: v }
}

const GROUP_NAMES = {
  1: 'กลุ่ม 1: พบพฤติการณ์',
  2: 'กลุ่ม 2: มีตัวตน ไม่พบประวัติ',
  3: 'กลุ่ม 3: พิสูจน์ทราบไม่ได้',
  4: 'กลุ่ม 4: สถานที่',
  5: 'กลุ่ม 5: พื้นที่',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const [uploadMode, setUploadMode]     = useState('guided')   // 'guided' = อัปตามหน้า (default) | 'manual' = อัปทีละไฟล์ (เดิม)
  const [phase, setPhase]               = useState('idle')
  const [file, setFile]                 = useState(null)
  const [rawRows, setRawRows]           = useState([])
  const [storedWorkbook, setStoredWorkbook] = useState(null)
  const [detectedType, setDetectedType] = useState('unknown')
  const [selectedType, setSelectedType] = useState('complaints')
  const [userOverride, setUserOverride] = useState(false)   // user เปลี่ยน type เองหลัง auto-detect
  const [typeMenuOpen, setTypeMenuOpen] = useState(false)

  // complaints / drug_incidents state
  const [mappedRows, setMappedRows]     = useState([])
  const [batch, setBatch]               = useState(null)
  const [validation, setValidation]     = useState(null)

  // bkn_summary state
  const [bkn115Rows, setBkn115Rows]     = useState([])
  const [bkn115BatchId, setBkn115BatchId] = useState(null)
  const [bkn115Error, setBkn115Error]   = useState(null)

  // report_114 state
  const [rpt114Rows, setRpt114Rows]     = useState([])
  const [rpt114BatchId, setRpt114BatchId] = useState(null)
  const [rpt114Error, setRpt114Error]   = useState(null)

  const [uploadResult, setUploadResult] = useState(null)
  const [uploadProgress, setUploadProgress] = useState('')
  const [isDragging, setIsDragging]     = useState(false)
  const [isLoading, setIsLoading]       = useState(false)
  const [loadError, setLoadError]       = useState(null)
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
    setBkn115Error(null)
    setRpt114Error(null)

    try {
      const { rows: raw, workbook: wb } = await parseFile(f)
      if (!raw || raw.length === 0) throw new Error('ไม่พบข้อมูลในไฟล์หรือไฟล์ว่างเปล่า')

      const detected      = detectType(raw)
      const effectiveType = detected === 'unknown' ? 'complaints' : detected

      setFile(f)
      setRawRows(raw)
      setStoredWorkbook(wb)
      setDetectedType(detected)
      setSelectedType(effectiveType)
      setUserOverride(false)
      setTypeMenuOpen(detected === 'unknown')   // detect ไม่ได้ → เปิด dropdown ให้เลือกเลย

      if (effectiveType === 'bkn_summary') {
        try {
          const bknData = parse115B(wb)
          setBkn115Rows(bknData)
          setBkn115BatchId(genBatchId())
          setBkn115Error(null)
        } catch (parseErr) {
          setBkn115Rows([])
          setBkn115Error(parseErr.message)
        }
        setMappedRows([])
        setBatch(null)
        setValidation(null)
        setRpt114Rows([])
        setRpt114Error(null)
      } else if (effectiveType === 'report_114') {
        try {
          const rptData = parse114(wb)
          setRpt114Rows(rptData)
          setRpt114BatchId(genBatchId())
          setRpt114Error(null)
        } catch (parseErr) {
          setRpt114Rows([])
          setRpt114Error(parseErr.message)
        }
        setMappedRows([])
        setBatch(null)
        setValidation(null)
        setBkn115Rows([])
        setBkn115Error(null)
      } else {
        const { mapped, batch: b, validation: v } = computePreview(raw, effectiveType, f.name)
        setMappedRows(mapped)
        setBatch(b)
        setValidation(v)
        setBkn115Rows([])
        setBkn115Error(null)
        setRpt114Rows([])
        setRpt114Error(null)
      }

      setPhase('preview')
    } catch (err) {
      setLoadError('อ่านไฟล์ไม่สำเร็จ: ' + err.message)
    } finally {
      setIsLoading(false)
    }
  }

  // ─── เปลี่ยนประเภทข้อมูล (override auto-detect ได้เสมอ) → reparse + revalidate ──
  const applyType = (newType) => {
    setSelectedType(newType)
    setUserOverride(true)
    setTypeMenuOpen(false)
    if (!file) return
    setBkn115Error(null)
    setRpt114Error(null)

    if (newType === 'bkn_summary') {
      if (storedWorkbook) {
        try {
          const bknData = parse115B(storedWorkbook)
          setBkn115Rows(bknData)
          setBkn115BatchId(genBatchId())
          setBkn115Error(null)
        } catch (err) {
          setBkn115Rows([])
          setBkn115Error(err.message)
        }
        setMappedRows([])
        setBatch(null)
        setValidation(null)
      }
      setRpt114Rows([])
      setRpt114Error(null)
    } else if (newType === 'report_114') {
      if (storedWorkbook) {
        try {
          const rptData = parse114(storedWorkbook)
          setRpt114Rows(rptData)
          setRpt114BatchId(genBatchId())
          setRpt114Error(null)
        } catch (err) {
          setRpt114Rows([])
          setRpt114Error(err.message)
        }
        setMappedRows([])
        setBatch(null)
        setValidation(null)
      }
      setBkn115Rows([])
      setBkn115Error(null)
    } else {
      if (rawRows.length) {
        const { mapped, batch: b, validation: v } = computePreview(rawRows, newType, file.name)
        setMappedRows(mapped)
        setBatch(b)
        setValidation(v)
      }
      setBkn115Rows([])
      setBkn115Error(null)
      setRpt114Rows([])
      setRpt114Error(null)
    }
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
    setStoredWorkbook(null)
    setMappedRows([])
    setBatch(null)
    setValidation(null)
    setBkn115Rows([])
    setBkn115BatchId(null)
    setBkn115Error(null)
    setRpt114Rows([])
    setRpt114BatchId(null)
    setRpt114Error(null)
    setUploadResult(null)
    setLoadError(null)
    setDetectedType('unknown')
    setSelectedType('complaints')
    setUserOverride(false)
    setTypeMenuOpen(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ─── ยืนยันอัปโหลด ───────────────────────────────────────────
  const handleConfirm = async () => {
    if (!file) return
    setPhase('uploading')
    const totalRows = confirmCount
    setUploadProgress(
      selectedType === 'bkn_summary'
        ? `กำลังอัปโหลด ${totalRows.toLocaleString()} record (บก.น. × กลุ่ม)...`
        : selectedType === 'report_114'
        ? `กำลังอัปโหลด ${totalRows.toLocaleString()} record (RPT_114)...`
        : `กำลังอัปโหลด ${totalRows.toLocaleString()} แถว...`
    )

    let result
    if (selectedType === 'bkn_summary') {
      result = await upsertBknSummary(bkn115Rows, {
        batchId:  bkn115BatchId || genBatchId(),
        fileName: file.name,
      })
    } else if (selectedType === 'report_114') {
      result = await upsertRpt114(rpt114Rows, {
        batchId:  rpt114BatchId || genBatchId(),
        fileName: file.name,
      })
    } else if (selectedType === 'substance_users') {
      // ส่ง raw rows — upsertSubstanceUsers flatten เป็น jsonb ภายในเอง
      result = await upsertSubstanceUsers(rawRows, {
        batchId:  batch?.batchId || genBatchId(),
        fileName: file.name,
      })
    } else {
      if (!batch) { setPhase('preview'); return }
      result = await upsertRecords(selectedType, batch.rows, {
        batchId:  batch.batchId,
        fileName: file.name,
      })
    }

    setUploadResult(result)
    setPhase('done')
  }

  // ─── derived ─────────────────────────────────────────────────
  const previewCols = mappedRows.length > 0
    ? Object.keys(mappedRows[0]).filter(k => !HIDE_COLS.has(k))
    : []

  const confirmCount = selectedType === 'bkn_summary'
    ? bkn115Rows.length
    : selectedType === 'report_114'
    ? rpt114Rows.length
    : rawRows.length

  const canConfirm = selectedType === 'bkn_summary'
    ? bkn115Rows.length > 0
    : selectedType === 'report_114'
    ? rpt114Rows.length > 0
    : !!batch

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto bg-slate-50 min-h-screen space-y-8">
      {/* Page header */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-blue-800 rounded-2xl px-6 pt-8 pb-10 text-white shadow-2xl overflow-hidden relative">
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="relative">
          <div className="text-xs font-bold uppercase tracking-widest text-blue-300 mb-3">ระบบนำเข้าข้อมูล · Data Import</div>
          <h1 className="text-3xl lg:text-4xl font-extrabold leading-tight flex items-center gap-3">
            <span className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0 backdrop-blur-sm">
              <Upload size={22} className="text-white" />
            </span>
            นำเข้าข้อมูลจากไฟล์ Excel / CSV
          </h1>
          <p className="text-sm text-blue-200 mt-3">รองรับ .xlsx · .xls · .csv — รองรับ 4 ประเภท: เรื่องร้องเรียน / เหตุการณ์ยาเสพติด / สรุป บก.น. (RPT_115_B) / RPT_114</p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-400 via-sky-300 to-blue-600 opacity-75" />
      </div>

      {/* คู่มือ Data Flow — หน้าเว็บ ↔ ไฟล์ ↔ ตาราง DB */}
      <DataFlowGuide />

      {/* ════════════ MODE SWITCHER ════════════ */}
      <div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-2 inline-flex gap-1">
          <button
            onClick={() => setUploadMode('guided')}
            className={cn(
              'h-9 px-4 text-sm font-medium rounded-lg transition',
              uploadMode === 'guided'
                ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50',
            )}
          >
            <Sparkles className="w-4 h-4 inline mr-1.5" />
            อัปตามหน้า
            <span className="ml-1 text-xs opacity-75">(แนะนำ)</span>
          </button>
          <button
            onClick={() => setUploadMode('manual')}
            className={cn(
              'h-9 px-4 text-sm font-medium rounded-lg transition',
              uploadMode === 'manual'
                ? 'bg-slate-200 text-slate-900'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50',
            )}
          >
            <FileText className="w-4 h-4 inline mr-1.5" />
            อัปทีละไฟล์
          </button>
        </div>
      </div>

      {/* ════════════ GUIDED MODE — อัปตามหน้า ════════════ */}
      {uploadMode === 'guided' && <GuidedUpload navigate={navigate} reload={reload} />}

      {/* ════════════ IDLE — drop zone (manual) ════════════ */}
      {uploadMode === 'manual' && phase === 'idle' && (
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          className={`border-2 border-dashed rounded-2xl p-10 sm:p-16 text-center transition-all duration-200 ${
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

          <p className="text-xs text-slate-400 mt-4 text-center">
            💡 ใช้โหมด "อัปตามหน้า" เพื่อเห็นว่าหน้าไหนต้องอัปไฟล์อะไรบ้าง
          </p>
        </div>
      )}

      {/* ════════════ PREVIEW (manual) ════════════ */}
      {uploadMode === 'manual' && phase === 'preview' && file && (
        <div className="space-y-4">

          {/* ── Info card ── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-6 space-y-4">

            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileText size={18} className="text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 text-sm truncate">{file.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <button onClick={handleReset} title="เลือกไฟล์ใหม่"
                className="text-slate-400 hover:text-slate-600 transition flex-shrink-0 p-1">
                <X size={18} />
              </button>
            </div>

            {/* ประเภทข้อมูล — คลิก pill เพื่อเปลี่ยน type เองได้เสมอ */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600 font-medium">ประเภทข้อมูล:</span>
              <div className="relative">
                {(() => {
                  const undetected = detectedType === 'unknown' && !userOverride
                  const tone = (userOverride || undetected)
                    ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                    : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                  return (
                    <button type="button" onClick={() => setTypeMenuOpen(o => !o)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${tone}`}>
                      {undetected ? (
                        <><AlertTriangle size={13} /> กรุณาเลือกประเภท</>
                      ) : (
                        <>
                          <CheckCircle2 size={13} />
                          {TYPE_LABELS[selectedType]}
                          <span className={`text-xs ${userOverride ? 'text-amber-500' : 'text-blue-400'}`}>
                            ({userOverride ? 'ผู้ใช้เลือก' : 'ตรวจพบอัตโนมัติ'})
                          </span>
                        </>
                      )}
                      <ChevronDown size={14} className={`transition-transform ${typeMenuOpen ? 'rotate-180' : ''}`} />
                    </button>
                  )
                })()}

                {typeMenuOpen && (
                  <>
                    {/* click-away */}
                    <div className="fixed inset-0 z-10" onClick={() => setTypeMenuOpen(false)} />
                    <div className="absolute left-0 top-full mt-1 z-20 w-72 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden py-1">
                      <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">เลือกประเภทข้อมูล</div>
                      {Object.entries(TYPE_LABELS).map(([val, label]) => (
                        <button key={val} type="button" onClick={() => applyType(val)}
                          className={`w-full text-left px-3 py-2 text-sm transition flex items-center gap-2 ${
                            selectedType === val ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                          }`}>
                          <CheckCircle2 size={13} className={`flex-shrink-0 ${selectedType === val ? 'opacity-100' : 'opacity-0'}`} />
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Reverse mapping — ไฟล์นี้จะกระทบหน้าไหนบ้าง */}
            <ImpactedPages type={selectedType} />

            {/* สรุปตัวเลข */}
            {selectedType === 'bkn_summary' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-slate-700">{bkn115Rows.length}</p>
                  <p className="text-xs text-slate-500 mt-0.5">record (บก.น. × กลุ่ม)</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700">
                    {new Set(bkn115Rows.map(r => r.bkn)).size}
                  </p>
                  <p className="text-xs text-emerald-600 mt-0.5">หน่วยงาน (บก.น.)</p>
                </div>
              </div>
            ) : selectedType === 'report_114' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-slate-700">{rpt114Rows.length}</p>
                  <p className="text-xs text-slate-500 mt-0.5">record (กลุ่ม)</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-purple-700">{rpt114Rows[0]?.fiscal_year ?? '–'}</p>
                  <p className="text-xs text-purple-600 mt-0.5">ปีงบประมาณ (พ.ศ.)</p>
                </div>
              </div>
            ) : validation ? (
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
                  <p className={`text-xs mt-0.5 ${validation.issues.length > 0 ? 'text-amber-600' : 'text-slate-400'}`}>แจ้งเตือน</p>
                </div>
              </div>
            ) : null}
          </div>

          {/* ── bkn_summary parse error ── */}
          {selectedType === 'bkn_summary' && bkn115Error && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle size={16} className="text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-rose-800">อ่านไฟล์ไม่สำเร็จ</p>
                <p className="text-sm text-rose-700 mt-0.5">{bkn115Error}</p>
              </div>
            </div>
          )}

          {/* ── report_114 parse error ── */}
          {selectedType === 'report_114' && rpt114Error && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle size={16} className="text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-rose-800">อ่านไฟล์ไม่สำเร็จ</p>
                <p className="text-sm text-rose-700 mt-0.5">{rpt114Error}</p>
              </div>
            </div>
          )}

          {/* ── Issues (complaints/drug_incidents only) ── */}
          {selectedType !== 'bkn_summary' && selectedType !== 'report_114' && validation?.issues.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-amber-800 flex items-center gap-2 mb-3">
                <AlertTriangle size={15} className="flex-shrink-0" />
                รายการแจ้งเตือน {validation.issues.length} รายการ
                <span className="font-normal text-amber-600">— ยังสามารถอัปโหลดได้</span>
              </h3>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {validation.issues.map((issue, i) => (
                  <div key={i} className="flex items-baseline gap-2 text-xs">
                    <span className="font-bold text-amber-600 flex-shrink-0 w-16">แถว {issue.rowIndex}</span>
                    <span className="text-amber-700 font-semibold flex-shrink-0">[{issue.field}]</span>
                    <span className="text-amber-800">{issue.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── ตัวอย่างข้อมูล ── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-md overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-700">
                {selectedType === 'bkn_summary'
                  ? `ตัวอย่างข้อมูล (ทั้งหมด ${bkn115Rows.length} record)`
                  : selectedType === 'report_114'
                  ? `ตัวอย่างข้อมูล (ทั้งหมด ${rpt114Rows.length} record)`
                  : 'ตัวอย่าง 10 แถวแรก (หลัง map คอลัมน์แล้ว)'}
              </h3>
              {selectedType !== 'bkn_summary' && selectedType !== 'report_114' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{previewCols.length} คอลัมน์</span>
                  <div className="group relative">
                    <Info size={14} className="text-slate-400 cursor-help" />
                    <div className="hidden group-hover:block absolute right-0 top-5 z-10 w-56 bg-slate-800 text-white text-xs rounded-lg p-2.5 shadow-lg">
                      แสดงข้อมูลหลัง map ชื่อคอลัมน์แล้ว ก่อนอัปโหลดจริง
                    </div>
                  </div>
                </div>
              )}
            </div>

            {selectedType === 'bkn_summary' ? (
              // ── bkn_summary preview table ──
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-800">
                      <th className="px-3 py-2.5 text-left text-slate-300 font-medium">#</th>
                      <th className="px-3 py-2.5 text-left text-white font-bold whitespace-nowrap">หน่วยงาน (บก.น.)</th>
                      <th className="px-3 py-2.5 text-left text-white font-bold whitespace-nowrap">กลุ่ม</th>
                      <th className="px-3 py-2.5 text-right text-white font-bold whitespace-nowrap">จำนวนผู้ถูกร้องเรียน</th>
                      <th className="px-3 py-2.5 text-right text-white font-bold whitespace-nowrap">ยังไม่ได้รับผล</th>
                      <th className="px-3 py-2.5 text-right text-emerald-300 font-bold whitespace-nowrap">จำนวนผลดำเนินการ</th>
                      <th className="px-3 py-2.5 text-left text-white font-bold whitespace-nowrap">ช่วงเวลา (period)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bkn115Rows.slice(0, 20).map((row, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-blue-50/40 transition">
                        <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2 font-semibold text-indigo-700">{row.bkn}</td>
                        <td className="px-3 py-2 text-slate-600">
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-medium">
                            {GROUP_NAMES[row.group_no] ?? `กลุ่ม ${row.group_no}`}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700 font-medium">{row.total.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-amber-700 font-medium">{row.pending.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-emerald-700 font-medium">{row.done.toLocaleString()}</td>
                        <td className="px-3 py-2 text-slate-400 text-[11px]">{row.period ?? '–'}</td>
                      </tr>
                    ))}
                    {bkn115Rows.length > 20 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-2 text-center text-xs text-slate-400">
                          … และอีก {bkn115Rows.length - 20} record
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : selectedType === 'report_114' ? (
              // ── report_114 preview table ──
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-800">
                      <th className="px-3 py-2.5 text-left text-slate-300 font-medium">#</th>
                      <th className="px-3 py-2.5 text-left text-white font-bold whitespace-nowrap">กลุ่ม</th>
                      <th className="px-3 py-2.5 text-right text-white font-bold whitespace-nowrap">ร้องเรียน</th>
                      <th className="px-3 py-2.5 text-right text-emerald-300 font-bold whitespace-nowrap">ดำเนินการแล้ว</th>
                      <th className="px-3 py-2.5 text-right text-white font-bold whitespace-nowrap">ร้อยละ</th>
                      <th className="px-3 py-2.5 text-right text-blue-300 font-bold whitespace-nowrap">พบพฤติการณ์</th>
                      <th className="px-3 py-2.5 text-right text-white font-bold whitespace-nowrap">จับกุม</th>
                      <th className="px-3 py-2.5 text-left text-purple-300 font-bold whitespace-nowrap">ปีงบประมาณ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rpt114Rows.map((row, i) => (
                      <tr key={i} className={`border-b border-slate-100 hover:bg-purple-50/30 transition ${row.group_no === null ? 'bg-slate-50 font-semibold' : ''}`}>
                        <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2 text-slate-700">
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${row.group_no === null ? 'bg-slate-200 text-slate-600' : 'bg-purple-100 text-purple-700'}`}>
                            {row.group_name}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700">{row.complaints?.toLocaleString() ?? '–'}</td>
                        <td className="px-3 py-2 text-right text-emerald-700 font-medium">{row.processed?.toLocaleString() ?? '–'}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{row.percent != null ? `${row.percent}%` : '–'}</td>
                        <td className="px-3 py-2 text-right text-blue-700">{row.found?.toLocaleString() ?? '–'}</td>
                        <td className="px-3 py-2 text-right text-slate-600">{row.arrested?.toLocaleString() ?? '–'}</td>
                        <td className="px-3 py-2 text-purple-700 font-semibold">{row.fiscal_year ?? '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              // ── complaints / drug_incidents preview table ──
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-800">
                      <th className="px-3 py-2.5 text-left text-slate-300 font-medium bg-slate-800 sticky left-0 border-r border-slate-100 whitespace-nowrap">#</th>
                      {previewCols.map(col => (
                        <th key={col} className="px-3 py-2.5 text-left text-white font-bold whitespace-nowrap bg-slate-800">
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
            )}
          </div>

          {/* ── Action buttons ── */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end pt-1">
            <button onClick={handleReset}
              className="px-6 py-2.5 border border-slate-300 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition">
              ยกเลิก
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="px-7 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-sm font-bold transition-all shadow flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Upload size={15} />
              ยืนยันอัปโหลด {confirmCount.toLocaleString()} {selectedType === 'bkn_summary' || selectedType === 'report_114' ? 'record' : 'แถว'}
            </button>
          </div>
        </div>
      )}

      {/* ════════════ UPLOADING (manual) ════════════ */}
      {uploadMode === 'manual' && phase === 'uploading' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 text-center">
          <div className="inline-block w-14 h-14 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-5" />
          <p className="text-lg font-bold text-slate-700">กำลังอัปโหลดข้อมูล...</p>
          <p className="text-sm text-blue-600 font-medium mt-2">{uploadProgress}</p>
          <p className="text-xs text-slate-400 mt-1.5">กรุณารอสักครู่ อาจใช้เวลาสักพักหากมีข้อมูลจำนวนมาก</p>
        </div>
      )}

      {/* ════════════ DONE (manual) ════════════ */}
      {uploadMode === 'manual' && phase === 'done' && uploadResult && (
        <div className="space-y-4">
          <div className={`rounded-2xl p-6 border ${
            uploadResult.failed === 0
              ? 'bg-emerald-50 border-emerald-200'
              : uploadResult.failed === (uploadResult.inserted + uploadResult.updated + uploadResult.failed)
              ? 'bg-rose-50 border-rose-200'
              : 'bg-amber-50 border-amber-200'
          }`}>
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

            {uploadResult.error && (
              <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 rounded-xl px-4 py-3 border border-rose-200">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                <span>{uploadResult.error}</span>
              </div>
            )}
            {uploadResult.batchLogError && (
              <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-xl px-4 py-3 border border-amber-200">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                <span>⚠️ บันทึก upload log ไม่สำเร็จ (ข้อมูลหลักถูกบันทึกแล้ว): {uploadResult.batchLogError}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end">
            <button onClick={handleReset}
              className="px-6 py-2.5 border border-slate-300 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition flex items-center justify-center gap-2">
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

// ─── Impacted Pages — ไฟล์นี้จะอัปเดตหน้าไหนบ้าง (reverse mapping) ────────────────

function ImpactedPages({ type }) {
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
function FileDropzone({ onFile, busy, className }) {
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

// 1 slot = 1 ตารางที่หน้านั้นต้องการ (state-aware: idle / busy / mismatch / done / error)
function FileSlot({ table, slot, now, onFile, onConfirmMismatch, onReset }) {
  const status = slot?.status || 'idle'

  if (status === 'done') {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center shadow-md shadow-emerald-500/30 flex-shrink-0">
            <Check className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-900">
              {FILE_LABELS[table]}
              <span className="ml-2 text-xs text-emerald-700 font-normal">✓ อัปแล้ว</span>
            </div>
            <div className="text-xs text-slate-600 mt-0.5">
              {slot.total.toLocaleString()} row · {timeAgo(slot.uploadedAt, now)}
            </div>
          </div>
          <button onClick={onReset} title="อัปไฟล์นี้ใหม่"
            className="text-slate-400 hover:text-slate-600 transition flex-shrink-0 p-1">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>
    )
  }

  if (status === 'mismatch') {
    const p = slot.pending
    return (
      <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-900">{FILE_LABELS[table]}</div>
            <p className="text-xs text-amber-800 mt-1">
              ไฟล์นี้ถูก detect เป็น <strong>{TYPE_LABELS[p.detected] ?? p.detected}</strong> ไม่ใช่ <strong>{FILE_LABELS[table]}</strong>
            </p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => onConfirmMismatch(table)}
                className="px-3 py-1.5 text-xs font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition shadow-sm shadow-amber-500/30">
                ใช้ไฟล์นี้แทน
              </button>
              <button onClick={onReset}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition">
                เปลี่ยนไฟล์
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // idle / busy / error
  return (
    <div className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-5 hover:border-blue-400 transition">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg border-2 border-slate-200 flex items-center justify-center flex-shrink-0">
          <Upload className="w-5 h-5 text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-900">{FILE_LABELS[table]}</div>
          <div className="text-xs text-slate-500 font-mono mt-0.5">ตาราง: {table}</div>
          {status === 'error' && (
            <div className="text-xs text-rose-600 mt-1.5 flex items-start gap-1">
              <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" /> {slot.error}
            </div>
          )}
          <FileDropzone onFile={f => onFile(table, f)} busy={status === 'busy'} className="mt-3" />
        </div>
      </div>
    </div>
  )
}

// modal เตือนเมื่ออัปไม่ครบ
function PartialWarningModal({ page, missing, uploaded, total, onClose, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <div className="font-bold text-slate-900">ข้อมูลยังไม่ครบ</div>
            <div className="text-sm text-slate-500">อัปแล้ว {uploaded}/{total} ไฟล์</div>
          </div>
        </div>

        <p className="text-sm text-slate-700 mb-3">
          เพื่อให้ <strong>{page.name}</strong> แสดงข้อมูลสมบูรณ์ ควรอัปไฟล์อีก {missing.length} ไฟล์:
        </p>

        <ul className="space-y-1.5 mb-4">
          {missing.map(table => (
            <li key={table} className="flex items-center gap-2 text-sm text-slate-700">
              <Circle className="w-3 h-3 text-slate-400 flex-shrink-0" />
              {FILE_LABELS[table]}
            </li>
          ))}
        </ul>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition">
            อัปต่อ
          </button>
          <button onClick={onConfirm}
            className="px-4 py-2 text-sm bg-amber-500 text-white hover:bg-amber-600 rounded-lg shadow-md shadow-amber-500/30 transition">
            ข้ามและไป {page.name}
          </button>
        </div>
      </div>
    </div>
  )
}

function GuidedUpload({ navigate, reload }) {
  const [selectedPage, setSelectedPage] = useState(null)
  const [slots, setSlots] = useState({})   // table -> { status, total, uploadedAt, error, pending }
  const [warnOpen, setWarnOpen] = useState(false)
  const [now, setNow] = useState(Date.now())

  // tick ทุก 10 วิ ให้ "X วินาทีที่แล้ว" อัปเดต
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10000)
    return () => clearInterval(id)
  }, [])

  const page = PAGES.find(p => p.id === selectedPage) || null
  const setSlot = (table, patch) => setSlots(s => ({ ...s, [table]: { ...s[table], ...patch } }))

  const doUpload = async (table, raw, wb, fileName) => {
    setSlot(table, { status: 'busy', error: null, pending: null })
    try {
      const { total } = await uploadParsedFor(table, raw, wb, fileName)
      setSlot(table, { status: 'done', total, uploadedAt: Date.now(), pending: null })
    } catch (err) {
      setSlot(table, { status: 'error', error: err.message })
    }
  }

  const handleFile = async (table, file) => {
    setSlot(table, { status: 'busy', error: null, pending: null })
    try {
      const { raw, wb, detected } = await detectFileType(file)
      if (detected !== 'unknown' && detected !== table) {
        setSlot(table, { status: 'mismatch', pending: { raw, wb, fileName: file.name, detected } })
        return
      }
      await doUpload(table, raw, wb, file.name)
    } catch (err) {
      setSlot(table, { status: 'error', error: err.message })
    }
  }

  const confirmMismatch = (table) => {
    const p = slots[table]?.pending
    if (p) doUpload(table, p.raw, p.wb, p.fileName)
  }

  const resetSlot = (table) => setSlot(table, { status: 'idle', error: null, pending: null })

  const required = page?.requiredFiles || []
  const uploadedCount = required.filter(t => slots[t]?.status === 'done').length
  const missing = required.filter(t => slots[t]?.status !== 'done')
  const allDone = required.length > 0 && missing.length === 0

  const goToPage = async () => { await reload(); navigate(page.route) }
  const handleFinish = () => { if (allDone) goToPage(); else setWarnOpen(true) }

  const backToPages = () => { setSelectedPage(null); setSlots({}); setWarnOpen(false) }

  // ── STEP 1: เลือกหน้า ──
  if (!page) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {PAGES.map(p => (
          <button key={p.id} onClick={() => setSelectedPage(p.id)}
            className="group p-6 rounded-2xl bg-white border border-slate-200 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-1 transition-all duration-300 text-left">
            <div className="flex items-start justify-between mb-3">
              <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-md', p.gradient, p.shadow)}>
                <p.icon className="w-6 h-6 text-white" />
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition" />
            </div>
            <div className="font-bold text-slate-900 text-lg mb-1">{p.name}</div>
            <div className="text-xs text-slate-500 font-mono mb-3">{p.route}</div>
            <div className="flex items-center gap-1 text-xs text-slate-600">
              <FileText className="w-3 h-3" /> ต้องอัป {p.requiredFiles.length} ไฟล์
            </div>
          </button>
        ))}
      </div>
    )
  }

  // ── STEP 2: รายการไฟล์ที่ต้องอัป ──
  return (
    <div className="space-y-4">
      <button onClick={backToPages}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition">
        <ArrowLeft size={15} /> เลือกหน้าอื่น
      </button>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-md', page.gradient, page.shadow)}>
            <page.icon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">อัปข้อมูล: {page.name}</h2>
            <p className="text-sm text-slate-500">
              ต้องอัป {required.length} ไฟล์ — อัปเดตข้อมูลให้ครบเพื่อความสมบูรณ์
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {required.map(table => (
            <FileSlot key={table} table={table} slot={slots[table]} now={now}
              onFile={handleFile} onConfirmMismatch={confirmMismatch} onReset={() => resetSlot(table)} />
          ))}
        </div>

        <div className="flex items-center justify-between pt-1">
          <button onClick={backToPages}
            className="px-5 py-2.5 border border-slate-300 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition">
            กลับ
          </button>
          <button onClick={handleFinish}
            className={cn(
              'px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow flex items-center gap-2',
              allDone
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/30'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/30',
            )}>
            {allDone ? <Check size={16} /> : <CheckCircle2 size={16} />}
            เสร็จสิ้น ({uploadedCount}/{required.length})
          </button>
        </div>
      </div>

      {warnOpen && (
        <PartialWarningModal
          page={page} missing={missing} uploaded={uploadedCount} total={required.length}
          onClose={() => setWarnOpen(false)} onConfirm={goToPage} />
      )}
    </div>
  )
}

// ─── Data Flow Guide — คู่มือ หน้าเว็บ ↔ ไฟล์ ↔ ตาราง DB ──────────────────────────

// class literal ต่อสี (ให้ Tailwind scan เจอ) — gradient ไอคอน + border/shadow ตอน hover
const FLOW_COLORS = {
  blue:   { grad: 'from-blue-500 to-blue-600',     border: 'hover:border-blue-200',   shadow: 'hover:shadow-blue-500/10' },
  indigo: { grad: 'from-indigo-500 to-indigo-600', border: 'hover:border-indigo-200', shadow: 'hover:shadow-indigo-500/10' },
  slate:  { grad: 'from-slate-500 to-slate-600',   border: 'hover:border-slate-300',  shadow: 'hover:shadow-slate-500/10' },
  cyan:   { grad: 'from-cyan-500 to-cyan-600',     border: 'hover:border-cyan-200',   shadow: 'hover:shadow-cyan-500/10' },
  amber:  { grad: 'from-amber-500 to-amber-600',   border: 'hover:border-amber-200',  shadow: 'hover:shadow-amber-500/10' },
  violet: { grad: 'from-violet-500 to-violet-600', border: 'hover:border-violet-200', shadow: 'hover:shadow-violet-500/10' },
}

const FLOW_MAP = [
  { page: 'ภาพรวม', route: '/', icon: BarChart3, color: 'blue', files: ['ทุกไฟล์ — แสดงรวม'], tables: ['ทุกตาราง'] },
  { page: 'รายเขต', route: '/districts', icon: MapPin, color: 'indigo', files: ['เรื่องร้องเรียน', 'เหตุการณ์ยาเสพติด', 'แบบเก็บข้อมูลผู้เสพ'], tables: ['complaints', 'drug_incidents', 'substance_users'] },
  { page: 'สถิติ บก.น.', route: '/bkn', icon: Shield, color: 'slate', files: ['สรุป บก.น. (RPT 115_B)'], tables: ['bkn_summary'] },
  { page: 'แผนที่ยาเสพติด', route: '/radar', icon: MapIcon, color: 'cyan', files: ['เหตุการณ์ยาเสพติด (ต้องมี lat/lng)'], tables: ['drug_incidents'] },
  { page: 'ผลการดำเนินงาน', route: '/operations', icon: TrendingUp, color: 'amber', files: ['รายงาน 114 (RPT_114)'], tables: ['report_114'] },
  { page: 'ผลเก็บข้อมูลผู้เสพ', route: '/substance-users', icon: Users, color: 'violet', files: ['แบบเก็บข้อมูลจากผู้เสพ (Google Form export)'], tables: ['substance_users'] },
]

function DataFlowGuide() {
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
