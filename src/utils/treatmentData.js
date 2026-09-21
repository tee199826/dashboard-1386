// treatmentData.js — filter/aggregate helpers สำหรับ treatment_summary + treatment_dim (บสต. กทม.)
// ต่างจาก drug_incidents.action_treatment (เหตุการณ์ในระบบร้องเรียนที่จบด้วยบำบัด ~201 เรื่อง) — นี่คือสถิติบำบัดทางการจาก บสต. (5,996 ราย ปีงบ 2569)
// district ในทั้ง 2 ตารางไม่มี "เขต" นำหน้า (เหมือน arrest_summary/arrest_drug) — ต้องเติมก่อนเทียบกับ cascade/groupOf
// ไม่มี subdistrict/community ในระดับข้อมูลนี้ — matchesTreatmentArea เช็คแค่ กลุ่ม/เขต (แขวง/ชุมชน ถูก disable ที่ UI)
import { groupOf } from '../hooks/useAreaCascade'
import { DONUT_SEQUENCE, DONUT_OTHER_COLOR } from './reportStyle'

export const DIMENSION_LABEL = {
  drug: 'ตัวยา', section: 'มาตรา', occupation: 'อาชีพ', education: 'การศึกษา', status: 'สถานะ', sex: 'เพศ',
}

export const treatmentDname = (district) => 'เขต' + district

export function matchesTreatmentArea(row, cascade) {
  const dname = treatmentDname(row.district)
  const group = groupOf(dname)
  if (!group) return false
  if (cascade.group !== 'all' && group !== cascade.group) return false
  if (cascade.district !== 'all' && dname !== cascade.district) return false
  return true
}

// ใช้ได้กับทั้ง treatment_summary และ treatment_dim (สอง field ชื่อเดียวกัน: district, fiscal_year)
// filterState.mode !== 'fiscal' หรือ fiscalYear ว่าง ('ทั้งหมด') → ไม่กรองปี (รวมทุกปีงบที่มี)
export function filterTreatmentRows(rows, cascade, filterState) {
  const fy = filterState.mode === 'fiscal' ? filterState.fiscalYear : null
  return rows.filter((r) => matchesTreatmentArea(r, cascade) && (fy == null || r.fiscal_year === fy))
}

// %เปลี่ยนแปลงเทียบปีงบก่อน (total_person) — เทียบได้เฉพาะตอนเลือกปีงบเดียว ไม่งั้นคืน null
// รับ allSummaryRows (ยังไม่กรองปี) เพราะต้องดูทั้งปีปัจจุบันและปีก่อนหน้า
export function computeTreatmentYoy(allSummaryRows, cascade, filterState) {
  if (filterState.mode !== 'fiscal' || !filterState.fiscalYear) return null
  const currentFY = filterState.fiscalYear
  const prevFY = currentFY - 1
  const areaRows = allSummaryRows.filter((r) => matchesTreatmentArea(r, cascade))
  const currentTotal = areaRows.filter((r) => r.fiscal_year === currentFY).reduce((s, r) => s + (r.total_person || 0), 0)
  const prevTotal = areaRows.filter((r) => r.fiscal_year === prevFY).reduce((s, r) => s + (r.total_person || 0), 0)
  return { currentTotal, prevTotal, prevFY, pct: prevTotal ? ((currentTotal - prevTotal) / prevTotal) * 100 : null }
}

// เขต top ตามผลรวม total_person (ไม่ต้องตัด "เขต" — district ในตารางนี้เป็นชื่อล้วนอยู่แล้ว)
export function topTreatmentDistricts(rows, total, n = 3) {
  const m = {}
  rows.forEach((r) => { if (r.district) m[r.district] = (m[r.district] || 0) + (r.total_person || 0) })
  return Object.entries(m)
    .map(([name, value]) => ({ name, value, pct: total ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n)
}

// treatment_dim: รวม total_person ตาม dim_value ของ dimension ที่ระบุ (dimRows ต้อง filter ตาม cascade/ปีงบ มาแล้ว)
export function dimensionCounts(dimRows, dimension, { top = null } = {}) {
  const m = {}
  dimRows.forEach((r) => {
    if (r.dimension !== dimension) return
    m[r.dim_value] = (m[r.dim_value] || 0) + (r.total_person || 0)
  })
  const data = Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  return top ? data.slice(0, top) : data
}

// % มาตรา 113 ในหมวด section (เน้นตาม PDF template) — ฐาน % คือผลรวมทุกค่าของ dimension='section' ที่ระบุได้เท่านั้น
export function section113Pct(dimRows) {
  const sectionData = dimensionCounts(dimRows, 'section')
  const total = sectionData.reduce((s, d) => s + d.value, 0)
  const m113 = sectionData.find((d) => d.name === 'ม.113')?.value || 0
  return { total, m113, pct: total ? (m113 / total) * 100 : 0 }
}

// ตัด top N + รวมที่เหลือเป็น "อื่นๆ" — ใช้กับโดนัทที่มีหลายค่า (เช่น ตัวยา) กันแตกสีจนอ่านไม่ออก
export function topWithOther(data, n = 5) {
  if (data.length <= n) return data
  const top = data.slice(0, n)
  const otherValue = data.slice(n).reduce((s, d) => s + d.value, 0)
  return otherValue > 0 ? [...top, { name: 'อื่นๆ', value: otherValue }] : top
}

// ผูกสีตามลำดับ (data ต้องเรียงมาก→น้อยมาแล้ว) — ใช้กับ DonutChart
export function withDonutColors(data) {
  return data.map((d, i) => ({ ...d, color: DONUT_SEQUENCE[i] ?? DONUT_OTHER_COLOR }))
}
