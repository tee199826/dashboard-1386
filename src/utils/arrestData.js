// arrestData.js — filter/aggregate helpers สำหรับ arrest_case + arrest_dim + arrest_age (สถิติจับกุมรายคดีจริงจาก CRIMES กทม.)
// ต่างจาก drug_incidents: district ไม่มี "เขต" นำหน้า (เช่น "คลองเตย" ไม่ใช่ "เขตคลองเตย") — ต้องเติมก่อนเทียบกับ cascade/groupOf
// arrest_case มี subdistrict (แขวง) แล้ว — matchesArrestArea เช็คถึงระดับแขวง ไม่มีระดับชุมชน (ถูก disable ที่ UI เสมอ, ดู AreaCascadeBar)
import { groupOf } from '../hooks/useAreaCascade'
import { DONUT_SEQUENCE, DONUT_OTHER_COLOR } from './reportStyle'

// สะกด "ราษฎร์บูรณะ"(ฎ ชฎา) ในข้อมูลจับกุมพบทั้ง 2 แบบ ("ราษฏร์บูรณะ" ฏ ปฏัก ตรงกับ DNAME_TO_GROUP ตรงๆ อยู่แล้ว
// แต่กันไว้เผื่อรอบ import หน้าสะกดสลับ) — normalize เป็น ฏ (ตาม GeoJSON/DNAME_TO_GROUP) ก่อนเทียบกลุ่มเสมอ
const DISTRICT_SPELLING_FIX = { 'ราษฎร์บูรณะ': 'ราษฏร์บูรณะ' }
export const arrestDname = (district) => 'เขต' + (DISTRICT_SPELLING_FIX[district] || district)

// เขต 'ไม่ระบุ' (~11% ของแถว — resolve เขตจากข้อมูลดิบไม่ได้) ไม่จัดอยู่ในกลุ่มพื้นที่ไหนเลย
// จึงโชว์เฉพาะตอนไม่ได้กรองพื้นที่ (all/all) — เลือกกลุ่ม/เขตเจาะจงแล้วจะไม่โผล่ (ไม่รู้ว่าเป็นของกลุ่มนั้นจริงไหม
// ถ้าโผล่ตอนกรองเขตเจาะจงจะไปพองยอด KPI ของเขตนั้นด้วยเคสที่ไม่รู้เขตจริง)
export function matchesArrestArea(row, cascade) {
  if (row.district === 'ไม่ระบุ') return cascade.group === 'all' && cascade.district === 'all'
  const dname = arrestDname(row.district)
  const group = groupOf(dname)
  if (!group) return false
  if (cascade.group !== 'all' && group !== cascade.group) return false
  if (cascade.district !== 'all' && dname !== cascade.district) return false
  // แขวง "ไม่ระบุ" ไม่ถูกซ่อนตอนกรองแขวงเจาะจง (ต่างจากเขต "ไม่ระบุ" ด้านบน) — เขตรู้แน่ชัดแล้ว แค่แขวงหาไม่เจอ
  // เช็คแขวงเฉพาะแถวที่มี field นี้จริง (arrest_case) — arrest_dim/arrest_age_summary aggregate แค่ระดับเขต
  // ไม่มี subdistrict เลย (ดู extract_arrest.py/arrest_age_summary_view.sql) กรองด้วยแขวงไม่ได้ ต้องปล่อยผ่าน ไม่งั้นกราฟหาย
  // เช็ค != null แทน 'in row' — หลัง migration arrest_dim ทุกแถวมี key นี้แล้ว แต่ charge/drug ยังเป็น NULL เสมอ
  // (ไม่แยกแขวง ตามเดิม) ต้องปล่อยผ่าน มีแค่ arrest_case กับ dimension='nationality' ที่ subdistrict เป็นค่าจริง กรองได้
  if (cascade.subdistrict !== 'all' && row.subdistrict != null && row.subdistrict !== cascade.subdistrict) return false
  return true
}

// filterState.mode !== 'fiscal' หรือ fiscalYear ว่าง ('ทั้งหมด') → ไม่กรองปี (รวมทุกปีงบที่มี)
// ใช้ได้กับทั้ง 3 ตาราง (arrest_case/arrest_dim/arrest_age — ทุกตัวมี field ชื่อเดียวกัน: district, fiscal_year)
export function filterArrestRows(rows, cascade, filterState) {
  const fy = filterState.mode === 'fiscal' ? filterState.fiscalYear : null
  return rows.filter((r) => matchesArrestArea(r, cascade) && (fy == null || r.fiscal_year === fy))
}

// YoY จับกุม — เทียบยอดปีงบที่เลือกกับปีงบก่อนหน้า (คืนทั้งคดีและผู้ต้องหาในรอบเดียว)
// allCaseRows = arrest_case ดิบที่ยังไม่กรองปี (ต้องเห็นทั้งปีปัจจุบันและปีก่อน) — กรองพื้นที่ในนี้เอง
// รูปแบบเดียวกับ computeTreatmentYoy ใน treatmentData.js
// คืน null เมื่อไม่ได้เลือกปีเจาะจง (mode อื่น หรือ 'ทั้งหมด') — ไม่มีปีอ้างอิงให้เทียบ
// pct = null เมื่อปีก่อนไม่มีข้อมูล — หารด้วยศูนย์ไม่ได้ ต้องให้ UI โชว์ '—' แทน 0%
export function computeArrestYoy(allCaseRows, cascade, filterState) {
  if (filterState.mode !== 'fiscal' || !filterState.fiscalYear) return null
  const currentFY = filterState.fiscalYear
  const prevFY = currentFY - 1
  const areaRows = allCaseRows.filter((r) => matchesArrestArea(r, cascade))
  const sum = (fy, key) => areaRows.filter((r) => r.fiscal_year === fy).reduce((s, r) => s + (r[key] || 0), 0)
  const pctOf = (cur, prev) => (prev ? ((cur - prev) / prev) * 100 : null)
  const cases = { current: sum(currentFY, 'cases'), prev: sum(prevFY, 'cases') }
  const persons = { current: sum(currentFY, 'persons'), prev: sum(prevFY, 'persons') }
  return {
    prevFY,
    cases: { ...cases, pct: pctOf(cases.current, cases.prev) },
    persons: { ...persons, pct: pctOf(persons.current, persons.prev) },
  }
}

// แขวงที่มีข้อมูลจับกุมจริงในเขตที่เลือก (ต่างจาก cascade.subdistrictOptions ที่มาจาก drug_incidents — แขวงของ 2 ชุดข้อมูล
// ไม่จำเป็นต้องตรงกัน) ต้องเลือกเขตก่อนเสมอ (คืน [] ถ้าเขต='all') — ไม่ซ่อน "ไม่ระบุ" ให้โผล่เป็นตัวเลือกปกติ
// รับ caseRows ดิบ (ยังไม่ผ่าน filterArrestRows) เพราะต้องเห็นทุกแขวงในเขตนั้น ไม่ใช่แค่แขวงที่เลือกอยู่แล้ว
export function arrestSubdistrictOptions(caseRows, cascade, filterState) {
  if (cascade.district === 'all') return []
  const rows = filterArrestRows(caseRows, { ...cascade, subdistrict: 'all' }, filterState)
  const s = new Set()
  rows.forEach((r) => { if (r.subdistrict) s.add(r.subdistrict) })
  return [...s].sort((a, b) => a.localeCompare(b, 'th'))
}

// เขต top ตามผลรวม cases (ไม่ต้องตัด "เขต" — district ในตารางนี้เป็นชื่อล้วนอยู่แล้ว)
// ตัด "ไม่ระบุ" ออกจากอันดับเสมอ — ไม่ใช่เขตจริง จะติดอันดับ 1 เพราะยอดสูงกว่าทุกเขต (803 คดี) ทำให้ ranking เพี้ยน
export function topArrestDistricts(rows, total, n = 3) {
  const m = {}
  rows.forEach((r) => { if (r.district && r.district !== 'ไม่ระบุ') m[r.district] = (m[r.district] || 0) + (r.cases || 0) })
  return Object.entries(m)
    .map(([name, value]) => ({ name, value, pct: total ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n)
}

// arrest_dim: รวม count ตาม dim_value ของ dimension ที่ระบุ (dimRows ต้อง filter ตาม cascade/ปีงบ มาแล้ว)
// dimension='charge' นับคน (1 คนมีหลายข้อหาได้), 'drug' นับคดี (1 คดีมีหลายตัวยาได้)
export function arrestDimensionCounts(dimRows, dimension, { top = null } = {}) {
  const m = {}
  dimRows.forEach((r) => {
    if (r.dimension !== dimension) return
    m[r.dim_value] = (m[r.dim_value] || 0) + (r.count || 0)
  })
  const data = Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  return top ? data.slice(0, top) : data
}

// ผูกสีตามลำดับ (data ต้องเรียงมาก→น้อยมาแล้ว) — ใช้กับ DonutChart
export function withDonutColors(data) {
  return data.map((d, i) => ({ ...d, color: DONUT_SEQUENCE[i] ?? DONUT_OTHER_COLOR }))
}

// ร้ายแรง/ไม่ร้ายแรง — derive จาก dimension='charge' (จำหน่าย/ผลิต/สมคบ/ส่งออก = ร้ายแรง, เสพ/ครอบครอง/ครอบครองเพื่อเสพ = ไม่ร้ายแรง)
// ไม่รวม "อื่น ๆ"/"ไม่ระบุ" (รวม <1% ของทุกข้อหา) เพราะจัดกลุ่มไม่ชัดเจน — ฐาน % จึงนับเฉพาะข้อหาที่จำแนกได้
const SEVERE_CHARGES = new Set(['จำหน่าย', 'ผลิต', 'สมคบ', 'ส่งออก'])
const NONSEVERE_CHARGES = new Set(['เสพ', 'ครอบครอง', 'ครอบครองเพื่อเสพ'])
export function severityCounts(dimRows) {
  let severe = 0, nonSevere = 0
  dimRows.forEach((r) => {
    if (r.dimension !== 'charge') return
    if (SEVERE_CHARGES.has(r.dim_value)) severe += r.count || 0
    else if (NONSEVERE_CHARGES.has(r.dim_value)) nonSevere += r.count || 0
  })
  return { severe, nonSevere }
}

// สัญชาติ — dimension='nationality' นับคน (PERCODE,สัญชาติ)unique, มี subdistrict จริง (ต่างจาก charge/drug)
// แยกไทย/ต่างชาติ(รวมทุกชาติ+ต่างชาติไม่ระบุ)/ไม่ระบุ — ฐาน % คือยอดรวมทั้งหมด (ไม่ระบุด้วย) โชว์ coverage ตรงๆ
export function nationalitySplit(dimRows) {
  const byValue = arrestDimensionCounts(dimRows, 'nationality')
  const total = byValue.reduce((s, d) => s + d.value, 0)
  const thai = byValue.find((d) => d.name === 'ไทย')?.value || 0
  const unknown = byValue.find((d) => d.name === 'ไม่ระบุ')?.value || 0
  const foreign = total - thai - unknown
  return { total, thai, foreign, unknown, coveredPct: total ? ((total - unknown) / total) * 100 : 0 }
}

// สัญชาติต่างชาติ top (เมียนมาร์/ลาว/กัมพูชา/...) ตัด "ไทย"/"ไม่ระบุ" ออก — เรียงมาก→น้อยมาแล้วจาก arrestDimensionCounts
export function topForeignNationalities(dimRows, n = null) {
  const data = arrestDimensionCounts(dimRows, 'nationality').filter((d) => d.name !== 'ไทย' && d.name !== 'ไม่ระบุ')
  return n ? data.slice(0, n) : data
}

// arrest_age_summary: view ที่ aggregate ที่ DB แล้ว (รายเขต×ปีงบ — ไม่มี age/percode รายคนหลุดมาถึง frontend เลย
// ดู supabase/migrations/20260904_arrest_age_summary_view.sql) — summaryRows ต้อง filter ตาม cascade/ปีงบ มาแล้ว
// (matchesArrestArea/filterArrestRows ใช้ได้ตรงๆ เพราะ view มีคอลัมน์ district, fiscal_year เหมือนตารางอื่น)
// บวก bucket ข้ามแถวได้ตรงๆ (นับคนละกลุ่มไม่ทับกัน), min ของ min / max ของ max ก็ถูกต้องทางคณิตศาสตร์
const AGE_BUCKET_FIELDS = [
  ['12-19', 'bucket_12_19'],
  ['20-29', 'bucket_20_29'],
  ['30-39', 'bucket_30_39'],
  ['40-49', 'bucket_40_49'],
  ['50+', 'bucket_50_plus'],
]

export function ageStats(summaryRows) {
  let count = 0, min = null, max = null
  summaryRows.forEach((r) => {
    count += r.known_count || 0
    if (r.min_age != null) min = min == null ? r.min_age : Math.min(min, r.min_age)
    if (r.max_age != null) max = max == null ? r.max_age : Math.max(max, r.max_age)
  })
  return { count, min, max }
}

export function ageHistogram(summaryRows) {
  const m = {}
  AGE_BUCKET_FIELDS.forEach(([name]) => { m[name] = 0 })
  summaryRows.forEach((r) => {
    AGE_BUCKET_FIELDS.forEach(([name, field]) => { m[name] += r[field] || 0 })
  })
  return AGE_BUCKET_FIELDS.map(([name]) => ({ name, value: m[name] }))
}
