import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, FileText, AlertTriangle, CheckCircle2,
  X, ChevronDown, RefreshCw, Info, LayoutDashboard,
  BookOpen, Sparkles, BarChart3, MapPin, Shield, Map as MapIcon, TrendingUp, Users, ExternalLink,
  Circle, Copy, Clock,
} from 'lucide-react'
import Modal from '../components/Modal'
import { parseFile, detectType, detectTypeScored, mapColumns, buildBatch, validateRows, parse115B, parse114, flattenSubstanceUserRow, assignDrugIncidentDistricts, parseDrugIncidents } from '../utils/importEngine'
import { upsertRecords, upsertBknSummary, upsertRpt114, upsertSubstanceUsers, upsertDrugIncidents } from '../utils/uploadService'
import { useData } from '../context/DataContext'
import { supabase } from '../lib/supabase'
import { getLastUploadDate } from '../utils/heroMeta'

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

const HIDE_COLS = new Set(['batch_id', 'source_file', 'row_index', 'record_uid', 'content_hash'])

// Guided mode ใหม่ — เลือก "ตาราง" ที่จะอัปตรงๆ (mental model: 1 ไฟล์ = 1 ตาราง)
const TABLES = [
  { id: 'drug_incidents',  emoji: '🎯', name: 'เหตุการณ์ยาเสพติด',     icon: MapIcon,    grad: 'from-violet-500 to-purple-600',  shadow: 'shadow-violet-500/30' },
  { id: 'complaints',      emoji: '📞', name: 'เรื่องร้องเรียน 1386',    icon: FileText,   grad: 'from-blue-500 to-indigo-600',    shadow: 'shadow-blue-500/30' },
  { id: 'substance_users', emoji: '🧑', name: 'แบบเก็บข้อมูลผู้เสพ',     icon: Users,      grad: 'from-emerald-500 to-teal-600',   shadow: 'shadow-emerald-500/30' },
  { id: 'bkn_summary',     emoji: '📊', name: 'สรุป บก.น. (RPT 115_B)',  icon: Shield,     grad: 'from-amber-500 to-orange-600',   shadow: 'shadow-amber-500/30' },
  { id: 'report_114',      emoji: '📑', name: 'รายงาน RPT_114',          icon: TrendingUp, grad: 'from-rose-500 to-pink-600',       shadow: 'shadow-rose-500/30' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const cn = (...c) => c.filter(Boolean).join(' ')

// timing helper ที่ module scope (เลี่ยง react-hooks/purity ที่ flag Date.now() ตรงๆ ใน component)
const nowMs = () => Date.now()

// จำนวนวันจาก ISO ถึงตอนนี้ (null ถ้าไม่มี)
function daysSince(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d)) return null
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000))
}
const dayLabel = (n) => n == null ? null : n === 0 ? 'วันนี้' : `${n} วันก่อน`

// ดึงสถานะ DB ต่อตาราง (row count + วันอัปล่าสุด) — ใช้ใน Guided mode
async function fetchTableStat(table) {
  const [{ count }, lastUpload] = await Promise.all([
    supabase.from(table).select('*', { count: 'exact', head: true }).then(r => r, () => ({ count: null })),
    getLastUploadDate(supabase, table).catch(() => null),
  ])
  return { count: count ?? null, lastUpload }
}

// ตรวจไฟล์ (parse + detect) ก่อนอัป — ใช้ util เดิม ไม่แตะ parser
async function detectFileType(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  if (!['xlsx', 'xls', 'csv'].includes(ext)) throw new Error('รองรับเฉพาะไฟล์ .xlsx, .xls, .csv เท่านั้น')
  const { rows: raw, workbook: wb } = await parseFile(file)
  if (!raw || raw.length === 0) throw new Error('ไม่พบข้อมูลในไฟล์หรือไฟล์ว่างเปล่า')
  const detection = detectTypeScored(raw, file.name)
  return { raw, wb, detection, rowCount: previewCount(detection.type, raw, wb) ?? raw.length }
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
  const { batch } = computePreview(raw, table, fileName, wb)
  // drug_incidents: เติม district อัตโนมัติจาก lat/lng ก่อน upsert (กัน district = NULL) → upsert ด้วย content_hash
  if (table === 'drug_incidents') {
    const a = await assignDrugIncidentDistricts(batch.rows)
    if (a.unmatched.length) console.warn('[upload] drug_incidents มี lat/lng แต่ไม่ match polygon (row_index):', a.unmatched)
    const result = await upsertDrugIncidents(batch.rows, { batchId: batch.batchId, fileName })
    return { total: batch.rows.length, result, districtAssigned: a.districtAssigned }
  }
  const result = await upsertRecords(table, batch.rows, { batchId: batch.batchId, fileName })
  return { total: batch.rows.length, result }
}

function genBatchId() {
  const now = new Date()
  const p = (n, l = 2) => String(n).padStart(l, '0')
  return [now.getFullYear(), p(now.getMonth() + 1), p(now.getDate())].join('') +
    '-' + [p(now.getHours()), p(now.getMinutes()), p(now.getSeconds())].join('')
}

// นับจำนวนแถวที่จะอัป (ไม่เขียน DB) — ใช้โชว์ใน confirm modal
function previewCount(table, raw, wb) {
  try {
    if (table === 'bkn_summary') return parse115B(wb).length
    if (table === 'report_114') return parse114(wb).length
    if (table === 'drug_incidents') return parseDrugIncidents(wb).rows.length
  } catch { return null }
  return raw.length   // complaints / substance_users
}
const recordWord = (t) => (t === 'bkn_summary' || t === 'report_114') ? 'record' : 'แถว'

function computePreview(raw, type, fileName, wb) {
  // drug_incidents: wide one-hot — parse จาก workbook ตรงๆ (content_hash idempotent, ไม่มี PII)
  if (type === 'drug_incidents') {
    try {
      const { rows } = parseDrugIncidents(wb)
      return { mapped: rows, batch: { rows, batchId: genBatchId() }, validation: { validCount: rows.length, issues: [] } }
    } catch (err) {
      return { mapped: [], batch: { rows: [], batchId: genBatchId() }, validation: { validCount: 0, issues: [{ rowIndex: '-', field: 'ไฟล์', message: err.message }] } }
    }
  }
  const mapped = type === 'substance_users'
    ? raw.map((r, i) => flattenSubstanceUserRow(r, fileName, i + 1))
    : mapColumns(raw, type, fileName)
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
  const [confirmOpen, setConfirmOpen]   = useState(false)      // confirm modal ก่อนอัป (manual)
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
        const { mapped, batch: b, validation: v } = computePreview(raw, effectiveType, f.name, wb)
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
        const { mapped, batch: b, validation: v } = computePreview(rawRows, newType, file.name, storedWorkbook)
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
    setConfirmOpen(false)
    const startedAt = nowMs()
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
    try {
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
        if (selectedType === 'drug_incidents') {
          // เติม district อัตโนมัติจาก lat/lng ก่อน upsert (กัน district = NULL) → upsert ด้วย content_hash
          const a = await assignDrugIncidentDistricts(batch.rows)
          if (a.unmatched.length) console.warn('[upload] drug_incidents มี lat/lng แต่ไม่ match polygon (row_index):', a.unmatched)
          result = await upsertDrugIncidents(batch.rows, { batchId: batch.batchId, fileName: file.name })
          if (a.districtAssigned) result = { ...result, districtAssigned: a.districtAssigned }
        } else {
          result = await upsertRecords(selectedType, batch.rows, {
            batchId:  batch.batchId,
            fileName: file.name,
          })
        }
      }
    } catch (err) {
      // เผื่อ service throw (ปกติ return error ใน result) — กัน spinner ค้าง
      result = { inserted: 0, updated: 0, failed: confirmCount, error: err?.message || String(err) }
    }

    result = { ...result, durationMs: nowMs() - startedAt }
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
              onClick={() => setConfirmOpen(true)}
              disabled={!canConfirm}
              className="px-7 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-sm font-bold transition-all shadow flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Upload size={15} />
              อัปโหลด {confirmCount.toLocaleString()} {selectedType === 'bkn_summary' || selectedType === 'report_114' ? 'record' : 'แถว'}
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

      {/* ════════════ CONFIRM MODAL (manual — ก่อนอัป) ════════════ */}
      <Modal
        open={uploadMode === 'manual' && confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="ยืนยันการอัปโหลด"
        icon={<Upload size={20} />}
        actions={
          <>
            <button onClick={() => setConfirmOpen(false)}
              className="px-5 py-2.5 border border-slate-300 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition">
              ยกเลิก
            </button>
            <button onClick={handleConfirm}
              className="px-6 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-xl text-sm font-bold transition shadow-md shadow-violet-500/30 flex items-center justify-center gap-2">
              <Upload size={15} /> ยืนยันอัปโหลด
            </button>
          </>
        }
      >
        <p className="text-slate-600 mb-3">ตรวจสอบรายละเอียดก่อนบันทึกเข้าฐานข้อมูล:</p>
        <dl className="space-y-2.5">
          <ConfirmRow label="ชื่อไฟล์" value={file?.name} mono />
          <ConfirmRow label="ประเภท" value={<span className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-50 text-violet-700 rounded-md text-xs font-medium">{TYPE_LABELS[selectedType]}</span>} />
          <ConfirmRow label="จำนวนแถว" value={<span className="font-bold text-slate-900">{confirmCount.toLocaleString()} {selectedType === 'bkn_summary' || selectedType === 'report_114' ? 'record' : 'row'}</span>} />
          <ConfirmRow label="ตารางเป้าหมาย" value={selectedType} mono />
        </dl>
      </Modal>

      {/* ════════════ RESULT MODAL (manual — success / error / partial) ════════════ */}
      <UploadResultModal
        open={uploadMode === 'manual' && phase === 'done' && !!uploadResult}
        result={uploadResult}
        fileName={file?.name}
        type={selectedType}
        onClose={handleReset}
        onDashboard={async () => { await reload(); navigate('/') }}
      />
    </div>
  )
}

// แถวรายละเอียดใน confirm modal
function ConfirmRow({ label, value, mono }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-500 flex-shrink-0">{label}</dt>
      <dd className={`text-right text-slate-800 break-all ${mono ? 'font-mono text-xs' : ''}`}>{value ?? '—'}</dd>
    </div>
  )
}

// แปลง Postgres error → ข้อความที่อ่านง่าย (คืน null ถ้าไม่รู้จัก → โชว์ raw)
function humanizeError(msg) {
  if (!msg) return null
  const m = String(msg).match(/null value in column "(\w+)"/)
  if (m) {
    const col = m[1]
    return {
      title: `ขาดข้อมูล column: ${col}`,
      causes: ['ไฟล์ไม่มี column นี้', 'Parser ไม่ได้ extract ค่าจาก filename'],
      hint: col === 'group_no'
        ? "สำหรับไฟล์ complaints: ตั้งชื่อไฟล์ให้มี 'กลุ่ม N' เช่น 'กลุ่ม 1 ปีงบ 66.xlsx'"
        : null,
    }
  }
  return null
}

// Result modal — success / error / partial (variant ตาม failed/ok)
function UploadResultModal({ open, result, fileName, type, onClose, onDashboard, closeLabel, dashboardLabel }) {
  const [copied, setCopied] = useState(false)
  if (!result) return <Modal open={false} onClose={onClose} title="" />

  const fail = result.failed || 0
  const ok = (result.inserted || 0) + (result.updated || 0)
  const variant = fail === 0 ? 'success' : ok === 0 ? 'error' : 'warning'
  const title = fail === 0 ? 'อัปโหลดสำเร็จ ✓' : ok === 0 ? 'อัปโหลดไม่สำเร็จ' : 'อัปโหลดเสร็จสิ้น (บางส่วน)'
  const icon = variant === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />
  const durationS = result.durationMs != null ? (result.durationMs / 1000).toFixed(1) : null
  const rowErrors = Array.isArray(result.errors) ? result.errors : []

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

// แบนเนอร์สรุปสถานะ DB รวม
function StatsBanner({ dbStats, lastUpload }) {
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
function RecentUploads({ rows }) {
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

function GuidedUpload({ navigate, reload }) {
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
      res = { ...out.result, districtAssigned: out.districtAssigned || 0 }
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
