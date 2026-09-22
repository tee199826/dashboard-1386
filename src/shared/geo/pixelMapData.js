// pixelMapData.js — query + aggregate ข้อมูลรายเขต สำหรับ /pixel-map
import { supabase } from "../data/supabase.js"
import { fetchAllPages } from "../data/supabasePagination.js"
import { isBangkokDistrict } from "../utils/statistics.js"
import { getBknByDistrict, getDistricts as getDistrictsOfBkn, BKN_ORDER } from "./bknMapping.js"
import { dateToFiscalYear } from "../utils/fiscalYear.js"
import { DRUG_FLAGS } from "../data/drugWide.js"

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

const HIERARCHY_FLAG_COLS = [...DRUG_FLAGS, ...ACTION_FLAGS, ...BEHAVIOR_FLAGS].map(([col]) => col)
const makeMeta = () => ({ count: 0, bySubstance: {}, byAction: {}, byBehavior: {}, inCommunity: 0 })

// ชุมชนว่างหรือเป็นค่าแทนความว่าง ('-', 'ไม่ระบุ') = เหตุการณ์นอกชุมชน
const NO_COMMUNITY_RE = /^(-+|–|—|ไม่ระบุ|ไม่มี|n\/?a|null)$/i
export const hasCommunity = (v) => {
  const s = String(v ?? '').trim()
  return !!s && !NO_COMMUNITY_RE.test(s)
}

function bumpFlags(target, r) {
  target.count++
  for (const [col] of DRUG_FLAGS) if (r[col]) target.bySubstance[col] = (target.bySubstance[col] || 0) + 1
  for (const [col] of ACTION_FLAGS) if (r[col]) target.byAction[col] = (target.byAction[col] || 0) + 1
  for (const [col] of BEHAVIOR_FLAGS) if (r[col]) target.byBehavior[col] = (target.byBehavior[col] || 0) + 1
  if (hasCommunity(r.community)) target.inCommunity++
}

// แถวดิบสำหรับสร้าง hierarchy — ดึงจาก Supabase ครั้งเดียวต่อ session แล้ว cache ไว้
// เปลี่ยนปีที่เลือกไม่ต้อง fetch ใหม่ (ข้อมูลดิบชุดเดิม กรอง/นับในหน่วยความจำ = เร็วมาก ไม่หน่วง)
let _hierarchyRowsPromise = null
function fetchHierarchyRows() {
  if (!_hierarchyRowsPromise) {
    const select = ['district', 'subdistrict', 'community', 'lat', 'lng', 'fiscal_year', 'received_date', ...HIERARCHY_FLAG_COLS].join(', ')
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
//     → ชุมชน (นับทุกแถวที่ระบุชุมชน มักมีแค่ ~28% ของข้อมูล, centroid เฉลี่ยจากแถวที่มีพิกัด — shape เดียวกับ meta คือ {count,bySubstance,byAction})
// key แขวง/ชุมชน เป็น composite เสมอ (district อยู่ใน object แม่อยู่แล้ว) — กันชื่อแขวงซ้ำข้ามเขต (พบจริง 59 ชื่อ)
// complaints/bkn_summary ไม่มี lat/lng รายแถว จึงทำ hierarchy ได้จาก drug_incidents เท่านั้น
// filter: 'all' / null = ทุกช่วง
//   { fiscalYears: [...] } = ปีงบที่เลือก (ติ๊กได้หลายปี, ว่าง = ทุกปี) — ใช้คอลัมน์ fiscal_year เหมือนเดิม
//   { from, to }           = ช่วงวันที่ ISO (รายเดือน/รายวัน) — ใช้ received_date (คอลัมน์ date NOT NULL)
//   Set/array ของปีงบ     = รูปแบบเดิม (ยังรับไว้)
function hierarchyRowFilter(filter) {
  if (!filter || filter === 'all') return null
  const years = (filter instanceof Set || Array.isArray(filter)) ? filter : filter.fiscalYears
  if (years) {
    const list = [...years].map(String)
    if (list.length === 0) return null
    const set = new Set(list)
    return (r) => set.has(String(r.fiscal_year))
  }
  if (!filter.from || !filter.to) return null
  return (r) => !!r.received_date && r.received_date >= filter.from && r.received_date <= filter.to
}

export async function getCommunityHierarchy(filter = 'all') {
  const keep = hierarchyRowFilter(filter)
  const rows = await fetchHierarchyRows()

  const tree = {}
  for (const r of rows) {
    if (keep && !keep(r)) continue // กรองตามช่วงเวลาที่เลือก (ปีงบ / เดือน / ช่วงวันที่)
    const d = r.district
    if (!isBangkokDistrict(d) || !r.subdistrict) continue
    const district = (tree[d] ||= { meta: makeMeta(), subdistricts: {} })
    bumpFlags(district.meta, r)

    const sub = (district.subdistricts[r.subdistrict] ||= { sumLat: 0, sumLng: 0, n: 0, meta: makeMeta(), communities: {} })
    bumpFlags(sub.meta, r)
    if (r.lat && r.lng) { sub.sumLat += r.lat; sub.sumLng += r.lng; sub.n++ }

    // นับ "ทุกแถวที่ระบุชุมชน" ไม่ใช่เฉพาะแถวที่มีพิกัด — ไม่งั้นจำนวนเรื่องของชุมชนขาดไป (มี 222 แถวที่ระบุชุมชนแต่ไม่มี lat/lng)
    // ส่วนพิกัดที่ใช้วางจุดบนแผนที่ เฉลี่ยจากเฉพาะแถวที่มีพิกัดจริง (nPos)
    if (hasCommunity(r.community)) {
      const c = (sub.communities[r.community] ||= { sumLat: 0, sumLng: 0, nPos: 0, ...makeMeta() })
      bumpFlags(c, r)
      if (r.lat && r.lng) { c.sumLat += r.lat; c.sumLng += r.lng; c.nPos++ }
    }
  }

  // finalize: sum → centroid เฉลี่ย
  for (const district of Object.values(tree)) {
    for (const sub of Object.values(district.subdistricts)) {
      sub.centroid = sub.n > 0 ? { lat: sub.sumLat / sub.n, lng: sub.sumLng / sub.n } : null
      delete sub.sumLat; delete sub.sumLng; delete sub.n
      for (const [name, c] of Object.entries(sub.communities)) {
        // ไม่มีแถวไหนมีพิกัดเลย (24 ชุมชน) = วาดบนแผนที่ไม่ได้ → ตัดทิ้งเหมือนเดิม (เรื่องยังถูกนับที่ระดับเขต/แขวงอยู่แล้ว)
        if (c.nPos === 0) { delete sub.communities[name]; continue }
        c.lat = c.sumLat / c.nPos; c.lng = c.sumLng / c.nPos
        delete c.sumLat; delete c.sumLng; delete c.nPos
      }
    }
  }
  return tree
}

// รายละเอียดของ node หนึ่งๆ สำหรับ tooltip บนแผนที่ — ในชุมชน/นอกชุมชน + พฤติการณ์ที่พบ (เฉพาะที่มีจริง)
// พฤติการณ์แต่ละอย่างนับแยกกัน รวมกันแล้วไม่จำเป็นต้องเท่า count (บางแถวไม่ระบุ/ติ๊กได้หลายอย่าง)
export function nodeDetail(node) {
  if (!node) return null
  const inCommunity = node.inCommunity ?? 0
  return {
    count: node.count,
    inCommunity,
    outCommunity: Math.max(0, node.count - inCommunity),
    behaviors: BEHAVIOR_FLAGS
      .map(([col, label]) => ({ label, n: node.byBehavior?.[col] ?? 0 }))
      .filter(b => b.n > 0)
      .sort((a, b) => b.n - a.n), // เรียงมาก→น้อย ให้อ่านเป็นลำดับได้ทันที
  }
}

// ข้อมูล (meta) ของพื้นที่ — อ่านสดจาก hierarchy ทุกครั้ง ตัวเลขจึงตามปีงบที่เปลี่ยนทีหลังได้ ไม่ค้างค่าเก่า
// ชุมชนต้องรู้แขวงด้วย (area.sub) เพราะชื่อชุมชนซ้ำข้ามแขวงได้ — ไม่มี sub ค่อยใช้ node ที่แนบมา
export function resolveAreaNode(hierarchy, area) {
  if (!area) return null
  const district = hierarchy?.[area.dname]
  if (area.level === 'district') return district?.meta ?? null
  if (area.level === 'subdistrict') return district?.subdistricts?.[area.label]?.meta ?? null
  return district?.subdistricts?.[area.sub]?.communities?.[area.label] ?? area.node ?? null
}

// พื้นที่เดียวกันไหม (ไม่สนว่ามาจากเมาส์ชี้/คลิก/กลางแผนที่) — ใช้ตัดสินว่าคลิกซ้ำ = ยกเลิกการเลือก
export function sameArea(a, b) {
  return !!a && !!b && a.level === b.level && a.dname === b.dname && a.label === b.label && (a.sub ?? '') === (b.sub ?? '')
}

// รวม meta ของหลายเขตเป็นก้อนเดียว (ใช้กับ panel ในโหมด compare ที่เลือกได้หลายเขตต่อ panel)
// คืน shape เดียวกับ meta ของเขต + communities (จำนวนชุมชนที่พบเหตุการณ์) → ส่งต่อ nodeDetail ได้เลย
export function sumDistrictMeta(hierarchy, names = []) {
  const out = { count: 0, bySubstance: {}, byAction: {}, byBehavior: {}, inCommunity: 0, communities: 0, districts: 0 }
  for (const name of names) {
    const node = hierarchy?.[name]
    if (!node) continue
    out.districts++
    out.count += node.meta?.count ?? 0
    out.inCommunity += node.meta?.inCommunity ?? 0
    for (const [col] of BEHAVIOR_FLAGS) out.byBehavior[col] = (out.byBehavior[col] ?? 0) + (node.meta?.byBehavior?.[col] ?? 0)
    for (const sub of Object.values(node.subdistricts ?? {})) out.communities += Object.keys(sub.communities ?? {}).length
  }
  return out
}

// รายชื่อชุมชนในพื้นที่ (ทั้งเขต หรือเจาะแขวงเดียว) เรียงจำนวนเรื่องมาก→น้อย
// รายชื่อ = ชุมชนที่มีพิกัดอย่างน้อย 1 แถว (เหมือนที่วาดบนแผนที่ได้) แต่จำนวนเรื่องของแต่ละชุมชนนับครบทุกแถว รวมแถวที่ไม่มีพิกัด
export function communityList(hierarchy, district, subdistrict = null) {
  const all = hierarchy?.[district]?.subdistricts ?? {}
  const subs = subdistrict ? (all[subdistrict] ? [[subdistrict, all[subdistrict]]] : []) : Object.entries(all)
  const out = []
  for (const [subName, sub] of subs) {
    for (const [name, c] of Object.entries(sub.communities ?? {})) {
      out.push({ name, subdistrict: subName, count: c.count })
    }
  }
  return out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'th'))
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
