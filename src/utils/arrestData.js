// arrestData.js — filter/aggregate helpers สำหรับ arrest_summary + arrest_drug (สถิติจับกุมจริงจาก CRIMES กทม.)
// ต่างจาก drug_incidents: district ไม่มี "เขต" นำหน้า (เช่น "คลองเตย" ไม่ใช่ "เขตคลองเตย") — ต้องเติมก่อนเทียบกับ cascade/groupOf
// ไม่มี subdistrict/community ในระดับข้อมูลนี้ — matchesArrestArea เช็คแค่ กลุ่ม/เขต (แขวง/ชุมชน ถูก disable ที่ UI, ดู AreaCascadeBar disableSub)
import { groupOf } from '../hooks/useAreaCascade'

export const arrestDname = (district) => 'เขต' + district

export function matchesArrestArea(row, cascade) {
  const dname = arrestDname(row.district)
  const group = groupOf(dname)
  if (!group) return false
  if (cascade.group !== 'all' && group !== cascade.group) return false
  if (cascade.district !== 'all' && dname !== cascade.district) return false
  return true
}

// filterState.mode !== 'fiscal' หรือ fiscalYear ว่าง ('ทั้งหมด') → ไม่กรองปี (รวมทุกปีงบที่มี)
// ใช้ได้กับทั้ง arrest_summary และ arrest_drug (สอง field ชื่อเดียวกัน: district, fiscal_year)
export function filterArrestRows(rows, cascade, filterState) {
  const fy = filterState.mode === 'fiscal' ? filterState.fiscalYear : null
  return rows.filter((r) => matchesArrestArea(r, cascade) && (fy == null || r.fiscal_year === fy))
}

// %เปลี่ยนแปลงเทียบปีงบก่อน (cases) — เทียบได้เฉพาะตอนเลือกปีงบเดียว ไม่งั้นคืน null
// รับ allSummaryRows (ยังไม่กรองปี) เพราะต้องดูทั้งปีปัจจุบันและปีก่อนหน้า
export function computeArrestYoy(allSummaryRows, cascade, filterState) {
  if (filterState.mode !== 'fiscal' || !filterState.fiscalYear) return null
  const currentFY = filterState.fiscalYear
  const prevFY = currentFY - 1
  const areaRows = allSummaryRows.filter((r) => matchesArrestArea(r, cascade))
  const currentTotal = areaRows.filter((r) => r.fiscal_year === currentFY).reduce((s, r) => s + (r.cases || 0), 0)
  const prevTotal = areaRows.filter((r) => r.fiscal_year === prevFY).reduce((s, r) => s + (r.cases || 0), 0)
  return { currentTotal, prevTotal, prevFY, pct: prevTotal ? ((currentTotal - prevTotal) / prevTotal) * 100 : null }
}

// เขต top ตามผลรวม cases (ไม่ต้องตัด "เขต" — district ในตารางนี้เป็นชื่อล้วนอยู่แล้ว)
export function topArrestDistricts(rows, total, n = 3) {
  const m = {}
  rows.forEach((r) => { if (r.district) m[r.district] = (m[r.district] || 0) + (r.cases || 0) })
  return Object.entries(m)
    .map(([name, value]) => ({ name, value, pct: total ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n)
}
