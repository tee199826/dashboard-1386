import { parseFile, detectTypeScored, mapColumns, buildBatch, validateRows, parse115B, parse114, flattenSubstanceUserRow, assignDrugIncidentDistricts, parseDrugIncidents } from "./importEngine.js"
import { parseArrestFile, parseTreatmentFile } from "./parseArrestTreatment.js"
import { upsertRecords, upsertBknSummary, upsertRpt114, upsertSubstanceUsers, upsertDrugIncidents, upsertArrestSummary, upsertTreatmentSummary } from "./uploadService.js"
import { supabase } from "../../shared/data/supabase.js"
import { getLastUploadDate } from "../../shared/utils/heroMeta.js"

// ─── Helpers ──────────────────────────────────────────────────────────────────
export const cn = (...c) => c.filter(Boolean).join(' ')

// timing helper ที่ module scope (เลี่ยง react-hooks/purity ที่ flag Date.now() ตรงๆ ใน component)
export const nowMs = () => Date.now()

// จำนวนวันจาก ISO ถึงตอนนี้ (null ถ้าไม่มี)
export function daysSince(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d)) return null
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000))
}

export const dayLabel = (n) => n == null ? null : n === 0 ? 'วันนี้' : `${n} วันก่อน`

// ดึงสถานะ DB ต่อตาราง (row count + วันอัปล่าสุด) — ใช้ใน Guided mode
export async function fetchTableStat(table) {
  const [{ count }, lastUpload] = await Promise.all([
    supabase.from(table).select('*', { count: 'exact', head: true }).then(r => r, () => ({ count: null })),
    getLastUploadDate(supabase, table).catch(() => null),
  ])
  return { count: count ?? null, lastUpload }
}

// ตรวจไฟล์ (parse + detect) ก่อนอัป — ใช้ util เดิม ไม่แตะ parser
export async function detectFileType(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  if (!['xlsx', 'xls', 'csv'].includes(ext)) throw new Error('รองรับเฉพาะไฟล์ .xlsx, .xls, .csv เท่านั้น')
  const { rows: raw, workbook: wb } = await parseFile(file)
  if (!raw || raw.length === 0) throw new Error('ไม่พบข้อมูลในไฟล์หรือไฟล์ว่างเปล่า')
  const detection = detectTypeScored(raw, file.name)
  return { raw, wb, detection, rowCount: previewCount(detection.type, raw, wb) ?? raw.length }
}

// อัปไฟล์เข้าตาราง table — dispatch ไป upsert service เดิม (ไม่แตะ UPSERT logic)
export async function uploadParsedFor(table, raw, wb, fileName) {
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
  if (table === 'arrest_summary') {
    const { rows } = parseArrestFile(wb)
    const result = await upsertArrestSummary(rows, { batchId, fileName })
    return { total: rows.length, result }
  }
  if (table === 'treatment_summary') {
    const { rows } = parseTreatmentFile(wb)
    const result = await upsertTreatmentSummary(rows, { batchId, fileName })
    return { total: rows.length, result }
  }
  const { batch } = computePreview(raw, table, fileName, wb)
  // drug_incidents: เติม district อัตโนมัติจาก lat/lng ก่อน upsert (กัน district = NULL) → upsert ด้วย content_hash
  if (table === 'drug_incidents') {
    const a = await assignDrugIncidentDistricts(batch.rows)
    if (a.unmatched.length) console.warn('[upload] drug_incidents มี lat/lng แต่ไม่ match polygon (row_index):', a.unmatched)
    const result = await upsertDrugIncidents(batch.rows, { batchId: batch.batchId, fileName })
    return { total: batch.rows.length, result, districtAssigned: a.districtAssigned, geoStats: batch.geoStats }
  }
  const result = await upsertRecords(table, batch.rows, { batchId: batch.batchId, fileName })
  return { total: batch.rows.length, result }
}

export function genBatchId() {
  const now = new Date()
  const p = (n, l = 2) => String(n).padStart(l, '0')
  return [now.getFullYear(), p(now.getMonth() + 1), p(now.getDate())].join('') +
    '-' + [p(now.getHours()), p(now.getMinutes()), p(now.getSeconds())].join('')
}

// นับจำนวนแถวที่จะอัป (ไม่เขียน DB) — ใช้โชว์ใน confirm modal
export function previewCount(table, raw, wb) {
  try {
    if (table === 'bkn_summary') return parse115B(wb).length
    if (table === 'report_114') return parse114(wb).length
    if (table === 'drug_incidents') return parseDrugIncidents(wb).rows.length
    if (table === 'arrest_summary') return parseArrestFile(wb).rows.length
    if (table === 'treatment_summary') return parseTreatmentFile(wb).rows.length
  } catch { return null }
  return raw.length   // complaints / substance_users
}

export const recordWord = (t) => (t === 'bkn_summary' || t === 'report_114') ? 'record' : 'แถว'

export function computePreview(raw, type, fileName, wb) {
  // drug_incidents: wide one-hot — parse จาก workbook ตรงๆ (content_hash idempotent, ไม่มี PII)
  if (type === 'drug_incidents') {
    try {
      const { rows, stats } = parseDrugIncidents(wb)
      return { mapped: rows, batch: { rows, batchId: genBatchId(), geoStats: stats }, validation: { validCount: rows.length, issues: [] } }
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

// แปลง Postgres error → ข้อความที่อ่านง่าย (คืน null ถ้าไม่รู้จัก → โชว์ raw)
export function humanizeError(msg) {
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
