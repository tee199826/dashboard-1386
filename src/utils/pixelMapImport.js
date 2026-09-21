// pixelMapImport.js — นำเข้าไฟล์ Excel/CSV ของผู้ใช้มาเป็น data overlay ของ /pixel-map
// ผลลัพธ์มี shape เดียวกับ getDistrictCounts() คือ { counts: {'เขตXXX': number}, max }
// MapCanvas จึงวาดได้ทันที ไม่ต้องรู้ว่าข้อมูลมาจาก Supabase หรือจากไฟล์
import * as XLSX from 'xlsx'
import { DNAME_TO_GROUP } from './constants'

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024 // 10 MB — ไฟล์สรุประดับเขตไม่ควรใหญ่กว่านี้
export const ACCEPT_IMPORT = '.xlsx,.xls,.csv'

const DISTRICT_FIX = { 'เขตราษฎร์บูรณะ': 'เขตราษฏร์บูรณะ' } // ฎ ชฎา → ฏ ปฏัก ให้ตรงกับ geojson (เหมือน importEngine.js)
const VALID_DISTRICTS = new Set(Object.keys(DNAME_TO_GROUP))
export const DISTRICT_TOTAL = VALID_DISTRICTS.size

// "ดอนเมือง" / "เขต ดอนเมือง" / " เขตดอนเมือง" → "เขตดอนเมือง" ; คืน null ถ้าไม่ใช่เขต กทม.
export function normalizeDistrictName(raw) {
  let d = String(raw ?? '').replace(/\s+/g, '')
  if (!d) return null
  if (!d.startsWith('เขต')) d = 'เขต' + d
  if (DISTRICT_FIX[d]) d = DISTRICT_FIX[d]
  return VALID_DISTRICTS.has(d) ? d : null
}

// ตัวเลขจาก cell — รองรับ 1,234 / " 12 " / เลขไทย ; คืน null ถ้าไม่ใช่ตัวเลข
const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙'
export function parseNumber(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const s = String(raw ?? '').trim()
  if (!s) return null
  const n = Number(s.replace(/[๐-๙]/g, (ch) => String(THAI_DIGITS.indexOf(ch))).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

// ── อ่านไฟล์ → ตาราง ────────────────────────────────────────────────
// ไฟล์จริงมักมีแถวหัวเรื่อง/โลโก้ก่อนหัวตาราง จึงสแกนหาแถวหัวตารางแทนที่จะเดาว่าเป็นแถวแรกเสมอ
const HEADER_SCAN_ROWS = 15

function findHeaderRow(aoa) {
  const limit = Math.min(aoa.length, HEADER_SCAN_ROWS)
  let best = 0
  let bestScore = -1
  for (let r = 0; r < limit; r++) {
    const cells = (aoa[r] ?? []).filter((c) => c !== null && String(c).trim() !== '')
    if (cells.length < 2) continue // แถวเซลล์เดียว = หัวเรื่อง ไม่ใช่หัวตาราง
    const texty = cells.filter((c) => parseNumber(c) === null).length // หัวตารางเป็นข้อความเกือบทั้งแถว
    const score = texty * 2 + cells.length
    if (score > bestScore) { bestScore = score; best = r }
  }
  return best
}

function buildHeaders(row = []) {
  const used = new Set()
  return row.map((c, i) => {
    let name = String(c ?? '').trim() || `คอลัมน์ ${i + 1}`
    let n = 2
    while (used.has(name)) name = `${String(c ?? '').trim() || `คอลัมน์ ${i + 1}`} (${n++})` // กันชื่อคอลัมน์ซ้ำ
    used.add(name)
    return name
  })
}

function sheetToTable(ws) {
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false })
  if (!aoa.length) return { headers: [], rows: [] }
  const hdrRow = findHeaderRow(aoa)
  const headers = buildHeaders(aoa[hdrRow])
  const rows = []
  for (let r = hdrRow + 1; r < aoa.length; r++) {
    const arr = aoa[r] ?? []
    if (arr.every((c) => c === null || String(c).trim() === '')) continue
    const obj = {}
    headers.forEach((h, i) => { obj[h] = arr[i] ?? null })
    rows.push(obj)
  }
  return { headers, rows }
}

// ตัด BOM หน้าไฟล์ csv ที่ export จาก Excel ออก ไม่งั้นชื่อคอลัมน์แรกจะมีอักขระซ่อนติดมา
const stripBom = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s)

// คืน { fileName, sheets: [{ name, headers, rows }] }
// csv อ่านเป็น "ข้อความ" ให้เบราว์เซอร์ถอดรหัส UTF-8 เอง (อ่านเป็น buffer แล้วภาษาไทยเพี้ยนเมื่อไฟล์ไม่มี BOM)
export async function readImportFile(file) {
  if (!file) throw new Error('ยังไม่ได้เลือกไฟล์')
  if (file.size > MAX_IMPORT_BYTES) throw new Error(`ไฟล์ใหญ่เกิน ${MAX_IMPORT_BYTES / 1024 / 1024} MB`)
  const wb = /\.csv$/i.test(file.name ?? '')
    ? XLSX.read(stripBom(await file.text()), { type: 'string' })
    : XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheets = wb.SheetNames
    .map((name) => ({ name, ...sheetToTable(wb.Sheets[name]) }))
    .filter((s) => s.headers.length && s.rows.length)
  if (!sheets.length) throw new Error('ไม่พบตารางข้อมูลในไฟล์นี้')
  return { fileName: file.name, sheets }
}

// ── เดาคอลัมน์ให้อัตโนมัติ ────────────────────────────────────────────
const DISTRICT_HEADER_RE = /เขต|อำเภอ|พื้นที่|district|area/i
const VALUE_HEADER_RE = /จำนวน|ยอด|รวม|คดี|ราย|เรื่อง|คน|ครั้ง|total|count|value|sum|amount/i
const SAMPLE_ROWS = 300

function rateOf(rows, header, test) {
  const vals = rows.map((r) => r[header]).filter((v) => v !== null && String(v).trim() !== '')
  if (!vals.length) return 0
  return vals.filter(test).length / vals.length
}

// { districtCol, valueCol } — valueCol = null แปลว่าให้นับจำนวนแถวแทนการรวมค่า
export function detectColumns({ headers, rows }) {
  const sample = rows.slice(0, SAMPLE_ROWS)
  const districtRate = Object.fromEntries(headers.map((h) => [h, rateOf(sample, h, (v) => normalizeDistrictName(v))]))
  const numberRate = Object.fromEntries(headers.map((h) => [h, rateOf(sample, h, (v) => parseNumber(v) !== null)]))

  const byDistrict = [...headers].sort((a, b) => districtRate[b] - districtRate[a])
  const namedDistrict = byDistrict.find((h) => DISTRICT_HEADER_RE.test(h) && districtRate[h] > 0.3)
  const bestDistrict = byDistrict[0]
  const districtCol = namedDistrict ?? (districtRate[bestDistrict] > 0.3 ? bestDistrict : null)

  const numeric = headers.filter((h) => h !== districtCol && numberRate[h] > 0.6)
  const valueCol = numeric.find((h) => VALUE_HEADER_RE.test(h)) ?? numeric[0] ?? null

  return { districtCol, valueCol }
}

// ── รวมค่าเป็นรายเขต ─────────────────────────────────────────────────
// valueCol = null → นับจำนวนแถวต่อเขต (ไฟล์รายเคส) ; มี valueCol → รวมค่าในคอลัมน์นั้น (ไฟล์สรุป)
export function buildCounts(rows, { districtCol, valueCol = null }) {
  const counts = {}
  const unmatched = new Map()
  let usedRows = 0
  let skippedValueRows = 0

  for (const r of rows) {
    const raw = r[districtCol]
    if (raw === null || String(raw).trim() === '') continue
    const d = normalizeDistrictName(raw)
    if (!d) {
      const key = String(raw).trim()
      unmatched.set(key, (unmatched.get(key) || 0) + 1)
      continue
    }
    let v = 1
    if (valueCol) {
      const n = parseNumber(r[valueCol])
      if (n === null) { skippedValueRows++; continue }
      v = n
    }
    counts[d] = (counts[d] || 0) + v
    usedRows++
  }
  for (const k of Object.keys(counts)) counts[k] = Math.round(counts[k] * 100) / 100 // กันเศษทศนิยมลอยจากการบวก float

  const values = Object.values(counts)
  return {
    counts,
    max: values.length ? Math.max(...values) : 0,
    total: Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100,
    districtCount: values.length,
    usedRows,
    skippedValueRows,
    unmatched: [...unmatched.entries()].map(([name, rows]) => ({ name, rows })).sort((a, b) => b.rows - a.rows),
  }
}

// ชื่อ layer จากชื่อไฟล์ — ตัดนามสกุลและย่อให้พอดีแถบ Layers
export function layerLabelFromFile(fileName, sheetName, multiSheet) {
  const base = String(fileName ?? 'ไฟล์นำเข้า').replace(/\.[^.]+$/, '').trim() || 'ไฟล์นำเข้า'
  const label = multiSheet && sheetName ? `${base} · ${sheetName}` : base
  return label.length > 40 ? `${label.slice(0, 39)}…` : label
}
