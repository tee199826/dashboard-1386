// ── helper filter rows ตาม range/ปีงบ — ใช้ร่วมทุก source ────────────────────
import { dateToFiscalYear } from './fiscalYear'

// table ที่มี date column (complaints.received_date, drug_incidents.received_date,
// substance_users.surveyed_at) — range = { from, to } (ISO 'YYYY-MM-DD')
// range.fyears (Set) = เลือกหลายปีงบ → ตัดแถวที่ปีงบไม่อยู่ในเซ็ต (from/to เป็นแค่ช่วงครอบ min→max)
export function filterByDateColumn(rows, dateCol, range) {
  if (!range || !range.from || !range.to) return rows
  const { from, to, fyears } = range
  return rows.filter(r => {
    const v = r?.[dateCol]
    if (!v) return false
    if (v < from || v > to) return false
    if (fyears && !fyears.has(dateToFiscalYear(v))) return false
    return true
  })
}

// report_114 ที่มี fiscal_year column (พ.ศ.)
export function filterByFiscalYear(rows, fyCol, buddhistYear) {
  if (!buddhistYear) return rows
  return rows.filter(r => r?.[fyCol] === buddhistYear)
}

// หมายเหตุ:
//  - substance_users.surveyed_at → ใช้ filterByDateColumn(rows, 'surveyed_at', range)
//  - bkn_summary filter ไม่ได้ — มี period text เดียว (ไม่มี date column รายแถว)
