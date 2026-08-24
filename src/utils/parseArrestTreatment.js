// ─── parseArrestTreatment.js ────────────────────────────────────────────────
// Parser สำหรับไฟล์สรุป "จับกุม" และ "บำบัด" (pivot เขต × ปีงบ, merged header)
//   ไฟล์จริงเป็นชีตเดียว: row0 = ปี พ.ศ. (merge ต่อปี) ; row1 = sub-header ; col0 = เขต
//   ยืดหยุ่น: หา column ด้วย pattern ข้อความ ไม่ผูกตำแหน่งตายตัว (เหมือน parse115B)

import * as XLSX from 'xlsx'
import { DNAME_TO_GROUP } from './constants'

// hash สั้นๆ (เหมือน importEngine.js) — ใช้ทำ content_hash จาก natural key
function simpleHash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0
  return (h >>> 0).toString(16)
}

// typo เขต (ฎ ชฎา → ฏ ปฏัก) — normalize ให้ตรง DNAME_TO_GROUP/geojson (เหมือน importEngine.js DISTRICT_FIX)
const DISTRICT_FIX = { 'เขตราษฎร์บูรณะ': 'เขตราษฏร์บูรณะ' }

// แถว placeholder ที่ไม่ใช่เขต กทม. จริง — พบ '-1' ในไฟล์จับกุม, 'ไม่ระบุเขต' ในไฟล์บำบัด
const BAD_DISTRICT_RE = /^(-1|ไม่ระบุ(เขต)?|รวม|grand\s*total|total)?$/i

function normalizeDistrict(raw) {
  let d = String(raw ?? '').trim()
  if (!d || BAD_DISTRICT_RE.test(d)) return null
  if (!d.startsWith('เขต')) d = 'เขต' + d
  if (DISTRICT_FIX[d]) d = DISTRICT_FIX[d]
  return d
}

function cellHelpers(ws) {
  const range = XLSX.utils.decode_range(ws['!ref'])
  const cellStr = (r, c) => {
    const cell = ws[XLSX.utils.encode_cell({ r, c })]
    return cell ? String(cell.v ?? '').trim() : ''
  }
  const cellNum = (r, c) => {
    const cell = ws[XLSX.utils.encode_cell({ r, c })]
    if (!cell) return 0
    if (typeof cell.v === 'number') return cell.v
    const n = parseFloat(String(cell.v).replace(/,/g, ''))
    return isNaN(n) ? 0 : n
  }
  return { range, cellStr, cellNum }
}

// หาแถว header: แถวที่ col0 === 'เขต' เป๊ะ (กันดักแถว title) ; แถวปี = แถวก่อนหน้า
function findHeaderRows(cellStr, maxR) {
  for (let r = 1; r <= Math.min(6, maxR); r++) {
    if (cellStr(r, 0) === 'เขต') return { yearRow: r - 1, hdrRow: r }
  }
  return { yearRow: -1, hdrRow: -1 }
}

/**
 * Parser ไฟล์จับกุม (ชีตเดียว: เขต × ปี(พ.ศ.) × [จำนวนคดี, จำนวนผู้ต้องหา(คน)])
 * @returns { rows: arrest_summary[], stats }
 */
export function parseArrestFile(workbook) {
  const sheetName = workbook.SheetNames[0]
  const ws = workbook.Sheets[sheetName]
  if (!ws || !ws['!ref']) throw new Error('ไม่พบข้อมูลในชีต — กรุณาตรวจสอบไฟล์')
  const { range, cellStr, cellNum } = cellHelpers(ws)

  const { yearRow, hdrRow } = findHeaderRows(cellStr, range.e.r)
  if (hdrRow === -1) throw new Error('ไม่พบแถวหัวตาราง "เขต" — ตรวจสอบรูปแบบไฟล์จับกุม')

  // เก็บ column blocks ต่อปี: { year, field, col } — ข้าม column "Total ..." ท้ายตาราง
  let currentYear = null
  const blocks = []
  for (let c = 1; c <= range.e.c; c++) {
    const yLabel = cellStr(yearRow, c)
    const sub = cellStr(hdrRow, c)
    if (/^\d{4}$/.test(yLabel)) currentYear = parseInt(yLabel)
    if (/^total/i.test(sub)) continue
    if (!currentYear) continue
    if (sub.includes('จำนวนคดี')) blocks.push({ year: currentYear, field: 'cases', col: c })
    else if (sub.includes('จำนวนผู้ต้องหา')) blocks.push({ year: currentYear, field: 'suspects_person', col: c })
  }
  if (blocks.length === 0) throw new Error('ไม่พบคอลัมน์ปี/จำนวนคดี/จำนวนผู้ต้องหา — ตรวจสอบรูปแบบไฟล์จับกุม')
  const years = [...new Set(blocks.map(b => b.year))].sort((a, b) => a - b)

  const rows = []
  let skippedDistricts = 0
  for (let r = hdrRow + 1; r <= range.e.r; r++) {
    const rawDistrict = cellStr(r, 0)
    if (!rawDistrict) continue
    const district = normalizeDistrict(rawDistrict)
    if (!district) { skippedDistricts++; continue }
    const zone = DNAME_TO_GROUP[district] ?? null

    for (const year of years) {
      const casesCol = blocks.find(b => b.year === year && b.field === 'cases')?.col
      const personCol = blocks.find(b => b.year === year && b.field === 'suspects_person')?.col
      const cases = casesCol != null ? cellNum(r, casesCol) : 0
      const suspects_person = personCol != null ? cellNum(r, personCol) : 0

      rows.push({
        fiscal_year: year,
        quarter: null,
        district,
        zone,
        cases,
        suspects_person,
        suspects_case: null,
        suspects_old: null,
        suspects_new: null,
        drug_type: null,
        seizure_amount: null,
        charge: null,
        charge_severe: null,
        // content_hash จาก natural key (ปีงบ+เขต) ไม่รวมค่าตัวเลข — re-upload ไฟล์แก้ยอด = upsert ทับของเดิม
        content_hash: 'as:' + simpleHash([year, district].join('|')),
      })
    }
  }

  if (rows.length === 0) throw new Error('ไม่พบแถวข้อมูลเขตในไฟล์ — ตรวจสอบรูปแบบไฟล์จับกุม')
  const final = Array.from(new Map(rows.map(r => [r.content_hash, r])).values())
  return {
    rows: final,
    stats: { parsed: final.length, districts: final.length / years.length, years, skippedDistricts },
  }
}

/**
 * Parser ไฟล์บำบัด (ชีตเดียว: เขต × ปี(พ.ศ.) × [รวม, รักษาจิตร่วม, ไม่ระบุ/ผู้ใช้/ผู้เสพ/ผู้ติด])
 * หมายเหตุ: ไฟล์จริงไม่มี breakdown รายเก่า/ใหม่ (old_person/new_person) หรือ dimension อายุ/อาชีพ/เพศ
 *   ตามที่ระบุใน spec ต้นทาง — เก็บ:
 *   - dimension=null            → ยอดรวมจำนวนผู้เข้าบำบัด(คน) ต่อเขต/ปี (total_person)
 *   - dimension='mental_co_occurring' → จำนวนผู้เข้าบำบัดที่รักษาอาการทางจิตร่วม (total_person)
 *   - dimension='status', dim_value=ไม่ระบุ|ผู้ใช้|ผู้เสพ|ผู้ติด → breakdown ตามสถานะการใช้ (total_person)
 * @returns { rows: treatment_summary[], stats }
 */
export function parseTreatmentFile(workbook) {
  const sheetName = workbook.SheetNames[0]
  const ws = workbook.Sheets[sheetName]
  if (!ws || !ws['!ref']) throw new Error('ไม่พบข้อมูลในชีต — กรุณาตรวจสอบไฟล์')
  const { range, cellStr, cellNum } = cellHelpers(ws)

  const { yearRow, hdrRow } = findHeaderRows(cellStr, range.e.r)
  if (hdrRow === -1) throw new Error('ไม่พบแถวหัวตาราง "เขต" — ตรวจสอบรูปแบบไฟล์บำบัด')

  const STATUS_LABELS = new Set(['ไม่ระบุ', 'ผู้ใช้', 'ผู้เสพ', 'ผู้ติด'])
  let currentYear = null
  const blocks = [] // { year, kind: 'total' | 'mental_co' | 'status', label?, col }
  for (let c = 1; c <= range.e.c; c++) {
    const yLabel = cellStr(yearRow, c)
    const sub = cellStr(hdrRow, c)
    if (/^\d{4}$/.test(yLabel)) currentYear = parseInt(yLabel)
    if (/^total/i.test(sub)) continue
    if (!currentYear) continue
    if (sub === 'จำนวนผู้เข้าบำบัด(คน)') blocks.push({ year: currentYear, kind: 'total', col: c })
    else if (sub === 'จำนวนผู้เข้าบำบัดที่รักษาอาการทางจิตร่วม(คน)') blocks.push({ year: currentYear, kind: 'mental_co', col: c })
    else if (STATUS_LABELS.has(sub)) blocks.push({ year: currentYear, kind: 'status', label: sub, col: c })
  }
  if (blocks.length === 0) throw new Error('ไม่พบคอลัมน์ปี/จำนวนผู้เข้าบำบัด — ตรวจสอบรูปแบบไฟล์บำบัด')
  const years = [...new Set(blocks.map(b => b.year))].sort((a, b) => a - b)

  const rows = []
  let skippedDistricts = 0
  for (let r = hdrRow + 1; r <= range.e.r; r++) {
    const rawDistrict = cellStr(r, 0)
    if (!rawDistrict) continue
    const district = normalizeDistrict(rawDistrict)
    if (!district) { skippedDistricts++; continue }
    const zone = DNAME_TO_GROUP[district] ?? null

    for (const year of years) {
      const yearBlocks = blocks.filter(b => b.year === year)
      for (const b of yearBlocks) {
        const total_person = cellNum(r, b.col)
        const dimension = b.kind === 'total' ? null : b.kind === 'mental_co' ? 'mental_co_occurring' : 'status'
        const dim_value = b.kind === 'status' ? b.label : null
        rows.push({
          fiscal_year: year,
          quarter: null,
          district,
          zone,
          total_person,
          old_person: null,
          new_person: null,
          dimension,
          dim_value,
          content_hash: 'ts:' + simpleHash([year, district, dimension ?? '', dim_value ?? ''].join('|')),
        })
      }
    }
  }

  if (rows.length === 0) throw new Error('ไม่พบแถวข้อมูลเขตในไฟล์ — ตรวจสอบรูปแบบไฟล์บำบัด')
  const final = Array.from(new Map(rows.map(r => [r.content_hash, r])).values())
  return {
    rows: final,
    stats: { parsed: final.length, districts: final.length / (years.length * 6), years, skippedDistricts },
  }
}
