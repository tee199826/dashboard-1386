// pixelMapData.js — query + aggregate ข้อมูลรายเขต สำหรับ /pixel-map
import { supabase } from '../lib/supabase'
import { fetchAllPages } from './supabasePagination'
import { isBangkokDistrict } from './statistics'
import { getBknByDistrict, getDistricts as getDistrictsOfBkn, BKN_ORDER } from './bknMapping'
import { dateToFiscalYear } from './fiscalYear'
import { DRUG_FLAGS } from './drugWide'

export const DATA_SOURCES = [
  { id: 'drug_incidents', label: 'เหตุการณ์ยาเสพติด' },
  { id: 'complaints', label: 'เรื่องร้องเรียน' },
  { id: 'bkn_summary', label: 'สถิติ บก.น. (RPT_115_B)' },
]

export const DRUG_SUBSTANCES = DRUG_FLAGS // [[col, label], ...] จาก drugWide.js
export const BEHAVIOR_FLAGS = [
  ['beh_use', 'เสพ'], ['beh_sell', 'ค้า'], ['beh_use_sell', 'เสพ/ค้า'], ['beh_produce', 'ผลิต'],
]
export const ACTION_FLAGS = [
  ['action_arrest', 'จับกุม'], ['action_treatment', 'บำบัด'], ['action_investigating', 'อยู่ระหว่างสืบสวน'],
  ['action_search', 'ตรวจค้น'], ['action_escape', 'หลบหนี'],
]
// metric สำหรับ sizing/สี number label ทุกระดับ (เขต/แขวง/ชุมชน) — 'count' (รวม) + ทุกชนิดยา + ทุก action
export const METRIC_OPTIONS = [['count', 'จำนวนคดี (ทั้งหมด)'], ...DRUG_FLAGS, ...ACTION_FLAGS]
export const BKN_FILTER_OPTIONS = BKN_ORDER.filter(b => b !== 'ไม่ระบุ')

function finalize(counts, meta = {}) {
  const values = Object.values(counts)
  const max = values.length ? Math.max(...values) : 0
  return { counts, max, ...meta }
}

// ปีงบที่มีข้อมูลจริง — ใช้เติม dropdown ปีงบ (bkn_summary ไม่มีปีงบ คืน [])
// cache ต่อ source (ถูกเรียกหลายที่บน mount) + ดึงแบบขนาน — กันสแกนตารางซ้ำโดยเปล่าประโยชน์
const _fiscalYearsCache = {}
export function getAvailableFiscalYears(source) {
  if (_fiscalYearsCache[source]) return _fiscalYearsCache[source]
  const compute = (async () => {
    if (source === 'drug_incidents') {
      const rows = await fetchAllPages('drug_incidents', 'fiscal_year', { parallel: true, orderBy: 'id' })
      return [...new Set(rows.map(r => r.fiscal_year).filter(Boolean))].sort((a, b) => b - a)
    }
    if (source === 'complaints') {
      const rows = await fetchAllPages('complaints', 'received_date', { parallel: true, orderBy: 'record_uid' })
      return [...new Set(rows.map(r => dateToFiscalYear(r.received_date)).filter(Boolean))].sort((a, b) => b - a)
    }
    return []
  })().catch(err => { delete _fiscalYearsCache[source]; throw err }) // ล้มเหลว → ให้ลองใหม่ได้
  _fiscalYearsCache[source] = compute
  return compute
}

async function getIncidentCounts({ substance, behavior, fiscalYear, bkn }) {
  const extraCols = [substance, behavior].filter(Boolean)
  const select = ['district', 'fiscal_year', ...extraCols].join(', ')
  const rows = await fetchAllPages('drug_incidents', select)
  const counts = {}
  for (const r of rows) {
    const d = r.district
    if (!isBangkokDistrict(d)) continue
    if (fiscalYear !== 'all' && String(r.fiscal_year) !== String(fiscalYear)) continue
    if (substance && !r[substance]) continue
    if (behavior && !r[behavior]) continue
    if (bkn !== 'all' && getBknByDistrict(d) !== bkn) continue
    counts[d] = (counts[d] || 0) + 1
  }
  return finalize(counts)
}

async function getComplaintsCounts({ fiscalYear, bkn }) {
  const rows = await fetchAllPages('complaints', 'district, received_date')
  const counts = {}
  for (const r of rows) {
    const d = r.district
    if (!isBangkokDistrict(d)) continue
    if (fiscalYear !== 'all' && dateToFiscalYear(r.received_date) !== Number(fiscalYear)) continue
    if (bkn !== 'all' && getBknByDistrict(d) !== bkn) continue
    counts[d] = (counts[d] || 0) + 1
  }
  return finalize(counts)
}

// bkn_summary เก็บสรุประดับ บก.น. เท่านั้น (ไม่มีคอลัมน์เขต/ปีงบ) — กระจายค่าเฉลี่ยต่อเขตในสังกัดแทน
async function getBknSummaryCounts({ bkn }) {
  const { data, error } = await supabase
    .from('bkn_summary')
    .select('bkn,total,period')
    .eq('report_id', '115_B')
    .limit(500)
  if (error) throw error

  const periods = [...new Set((data || []).map(r => r.period).filter(Boolean))].sort()
  const latest = periods[periods.length - 1]

  const byBkn = {}
  for (const r of data || []) {
    if (r.period !== latest) continue
    byBkn[r.bkn] = (byBkn[r.bkn] || 0) + (r.total || 0)
  }

  const counts = {}
  for (const [bknName, total] of Object.entries(byBkn)) {
    if (bkn !== 'all' && bknName !== bkn) continue
    const districts = getDistrictsOfBkn(bknName)
    if (!districts.length) continue
    const perDistrict = total / districts.length
    districts.forEach(d => { counts[d] = perDistrict })
  }
  return finalize(counts, {
    period: latest,
    note: 'bkn_summary ไม่มีข้อมูลระดับเขต — ค่าที่แสดงคือค่าเฉลี่ยต่อเขตของ บก.น. นั้น',
  })
}

// จุดเข้าเดียวสำหรับหน้า /pixel-map — คืน { counts: {district: count}, max, note? }
export async function getDistrictCounts({ source, substance = null, behavior = null, fiscalYear = 'all', bkn = 'all' }) {
  if (source === 'complaints') return getComplaintsCounts({ fiscalYear, bkn })
  if (source === 'bkn_summary') return getBknSummaryCounts({ bkn })
  return getIncidentCounts({ substance, behavior, fiscalYear, bkn })
}

const HIERARCHY_FLAG_COLS = [...DRUG_FLAGS, ...ACTION_FLAGS].map(([col]) => col)
const makeMeta = () => ({ count: 0, bySubstance: {}, byAction: {} })
function bumpFlags(target, r) {
  target.count++
  for (const [col] of DRUG_FLAGS) if (r[col]) target.bySubstance[col] = (target.bySubstance[col] || 0) + 1
  for (const [col] of ACTION_FLAGS) if (r[col]) target.byAction[col] = (target.byAction[col] || 0) + 1
}

// แถวดิบสำหรับสร้าง hierarchy — ดึงจาก Supabase ครั้งเดียวต่อ session แล้ว cache ไว้
// เปลี่ยนปีที่เลือกไม่ต้อง fetch ใหม่ (ข้อมูลดิบชุดเดิม กรอง/นับในหน่วยความจำ = เร็วมาก ไม่หน่วง)
let _hierarchyRowsPromise = null
function fetchHierarchyRows() {
  if (!_hierarchyRowsPromise) {
    const select = ['district', 'subdistrict', 'community', 'lat', 'lng', 'fiscal_year', ...HIERARCHY_FLAG_COLS].join(', ')
    _hierarchyRowsPromise = fetchAllPages('drug_incidents', select, { parallel: true, orderBy: 'id' }).catch(err => {
      _hierarchyRowsPromise = null // ล้มเหลว → ให้ครั้งหน้าลองใหม่ ไม่ค้าง promise ที่ reject
      throw err
    })
  }
  return _hierarchyRowsPromise
}

// ล้าง cache ข้อมูลดิบ (hierarchy + ปีงบ) — เรียกหลังอัปโหลด/นำเข้าข้อมูล drug_incidents/complaints สำเร็จ
// ให้ครั้งต่อไปที่เปิด /pixel-map ดึงข้อมูลสดจาก Supabase แทนชุดเดิมที่ค้างไว้ทั้ง session (กันตัวเลข/รายการปีเก่า)
export function clearPixelMapDataCache() {
  _hierarchyRowsPromise = null
  for (const key of Object.keys(_fiscalYearsCache)) delete _fiscalYearsCache[key]
}

// hierarchy เดียวจบ: เขต (meta: count/bySubstance/byAction รวมทั้งเขต)
//   → แขวง (centroid จาก "ทุกแถวที่มี lat/lng" ของแขวงนั้น ไม่ใช่แค่แถวมีชุมชน — centroid แม่นกว่า, + meta รวมทั้งแขวง)
//     → ชุมชน (centroid+count เฉพาะแถวที่มี community, มักมีแค่ ~28% ของข้อมูล — shape เดียวกับ meta คือ {count,bySubstance,byAction})
// key แขวง/ชุมชน เป็น composite เสมอ (district อยู่ใน object แม่อยู่แล้ว) — กันชื่อแขวงซ้ำข้ามเขต (พบจริง 59 ชื่อ)
// complaints/bkn_summary ไม่มี lat/lng รายแถว จึงทำ hierarchy ได้จาก drug_incidents เท่านั้น
// years: 'all' (ทุกปี) หรือ Set/array ของปีงบประมาณที่เลือก (ติ๊กได้หลายปี) — ว่าง = ทุกปี
export async function getCommunityHierarchy(years = 'all') {
  const yearSet = (years === 'all' || !years || (years.size ?? years.length) === 0) ? null : new Set([...years].map(String))
  const rows = await fetchHierarchyRows()

  const tree = {}
  for (const r of rows) {
    if (yearSet && !yearSet.has(String(r.fiscal_year))) continue // กรองตามปีงบประมาณที่ติ๊กไว้ (union ของปีที่เลือก)
    const d = r.district
    if (!isBangkokDistrict(d) || !r.subdistrict) continue
    const district = (tree[d] ||= { meta: makeMeta(), subdistricts: {} })
    bumpFlags(district.meta, r)

    const sub = (district.subdistricts[r.subdistrict] ||= { sumLat: 0, sumLng: 0, n: 0, meta: makeMeta(), communities: {} })
    bumpFlags(sub.meta, r)
    if (r.lat && r.lng) { sub.sumLat += r.lat; sub.sumLng += r.lng; sub.n++ }

    if (r.community && r.lat && r.lng) {
      const c = (sub.communities[r.community] ||= { sumLat: 0, sumLng: 0, ...makeMeta() })
      bumpFlags(c, r)
      c.sumLat += r.lat; c.sumLng += r.lng
    }
  }

  // finalize: sum → centroid เฉลี่ย
  for (const district of Object.values(tree)) {
    for (const sub of Object.values(district.subdistricts)) {
      sub.centroid = sub.n > 0 ? { lat: sub.sumLat / sub.n, lng: sub.sumLng / sub.n } : null
      delete sub.sumLat; delete sub.sumLng; delete sub.n
      for (const c of Object.values(sub.communities)) {
        c.lat = c.sumLat / c.count; c.lng = c.sumLng / c.count
        delete c.sumLat; delete c.sumLng
      }
    }
  }
  return tree
}

// นับ metric ที่เลือกของ node หนึ่งๆ (เขต.meta / แขวง.meta / ชุมชน — shape เดียวกันหมด) — 'count' = รวม, อื่นๆ = bySubstance/byAction (0 ถ้าไม่มี)
export function nodeMetricValue(node, metric) {
  if (!node) return 0
  if (metric === 'count') return node.count
  return node.bySubstance[metric] ?? node.byAction[metric] ?? 0
}

// max ของ metric ที่เลือก แยกตามระดับ (เขต/แขวง/ชุมชน) — คำนวณจาก hierarchy ทั้งหมด (ไม่ใช่แค่ที่ติ๊ก) ให้ font-size คงที่/แฟร์ทุก panel
export function getLevelMaxes(hierarchy, metric) {
  let district = 0, subdistrict = 0, community = 0
  for (const d of Object.values(hierarchy)) {
    district = Math.max(district, nodeMetricValue(d.meta, metric))
    for (const sub of Object.values(d.subdistricts)) {
      subdistrict = Math.max(subdistrict, nodeMetricValue(sub.meta, metric))
      for (const c of Object.values(sub.communities)) {
        community = Math.max(community, nodeMetricValue(c, metric))
      }
    }
  }
  return { district, subdistrict, community }
}
