// areaStats.js — นับ "จำนวนครั้งร้องเรียน" รายพื้นที่ (เขต / แขวง / ชุมชน) จาก drug_incidents (wide one-hot)
// ใช้ร่วม /radar (panel สถิติพื้นที่ + popup + cluster) และ exportAreaStats
// 1 แถว = 1 ครั้ง ; พฤติการณ์/ตัวยา นับตาม flag (1 แถวอาจมีหลายตัวยา → ผลรวมตัวยา ≥ จำนวนครั้ง)
import { DRUG_FLAGS } from './drugFlags'
import { DNAME_TO_GROUP } from './constants'

// label พฤติการณ์ตรงกับ deriveBehaviors ใน drugWide ('เสพ/ค้า' ไม่ใช่ 'ค้าเสพ' ของ /situation)
export const BEHAVIOR_COLS = [
  ['beh_use', 'เสพ'], ['beh_sell', 'ค้า'], ['beh_use_sell', 'เสพ/ค้า'], ['beh_produce', 'ผลิต'],
]
export const BEHAVIOR_LABELS = BEHAVIOR_COLS.map(([, l]) => l)
export const DRUG_NAME_TO_COL = Object.fromEntries(DRUG_FLAGS.map(([col, name]) => [name, col]))

export const AREA_LEVELS = [
  { id: 'district', label: 'เขต' },
  { id: 'subdistrict', label: 'แขวง' },
  { id: 'community', label: 'ชุมชน' },
]

const norm = (v) => (v ?? '').toString().trim()
// นับเฉพาะ 50 เขต กทม. (whitelist DNAME_TO_GROUP) — แถวอำเภอนอก กทม. ถูก parser เติม "เขต" นำหน้าด้วย
// (เช่น "เขตอำเภอเมืองสมุทรปราการ") จึงเช็ค startsWith ไม่ได้ ; ตัดตอน aggregate (raw ยังอยู่ครบ)
export const isBkkDistrict = (d) => norm(d) in DNAME_TO_GROUP

// key ของ row ตามระดับ — คืน null ถ้าไม่มีค่าระดับนั้น (เช่น ชุมชนว่าง → ไม่นับใน "รายชุมชน") หรืออยู่นอก กทม.
export function areaPartsOf(r, level) {
  const d = norm(r.district)
  if (!isBkkDistrict(d)) return null
  if (level === 'district') return [d]
  const s = norm(r.subdistrict)
  if (level === 'subdistrict') return s ? [d, s] : null
  const c = norm(r.community)
  return c ? [d, s, c] : null
}

export const areaName = (a) => a.community || a.subdistrict || a.district || '-'
// ชื่อเต็มไล่จากใหญ่→เล็ก สำหรับ popup/ตาราง เช่น "เขตประเวศ · ดอกไม้ · ชุมชนหมู่ 5"
export const areaPath = (a) => [a.district, a.subdistrict, a.community].filter(Boolean).join(' · ')

/**
 * รวมสถิติรายพื้นที่
 * @param {object[]} rows แถว drug_incidents (กรองตาม view แล้ว)
 * @param {'district'|'subdistrict'|'community'} level
 * @returns {Array<{ key, district, subdistrict, community, zone, total, beh, drugs, subCount, lat, lng, latest }>}
 *   เรียง total มาก→น้อย ; lat/lng = จุดกึ่งกลาง (เฉลี่ยพิกัดที่มี) สำหรับ fly-to
 */
export function aggregateAreas(rows, level = 'district') {
  const map = new Map()
  for (const r of rows) {
    const parts = areaPartsOf(r, level)
    if (!parts) continue
    const key = parts.join('|')
    let a = map.get(key)
    if (!a) {
      a = {
        key, level,
        district: parts[0] || '', subdistrict: parts[1] || '', community: parts[2] || '',
        zone: DNAME_TO_GROUP[parts[0]] || '',
        total: 0, beh: {}, drugs: {}, _sub: new Set(), _lat: 0, _lng: 0, _geo: 0, latest: null,
      }
      map.set(key, a)
    }
    a.total++
    for (const [col, label] of BEHAVIOR_COLS) if (r[col]) a.beh[label] = (a.beh[label] || 0) + 1
    for (const [col, label] of DRUG_FLAGS) if (r[col]) a.drugs[label] = (a.drugs[label] || 0) + 1
    if (Array.isArray(r.drug_others)) for (const o of r.drug_others) if (o) a.drugs[o] = (a.drugs[o] || 0) + 1
    if (level === 'district' && norm(r.subdistrict)) a._sub.add(norm(r.subdistrict))
    if (level === 'subdistrict' && norm(r.community)) a._sub.add(norm(r.community))
    if (r.lat && r.lng) { a._lat += r.lat; a._lng += r.lng; a._geo++ }
    if (r.received_date && (!a.latest || r.received_date > a.latest)) a.latest = r.received_date
  }
  const out = []
  for (const a of map.values()) {
    const { _sub, _lat, _lng, _geo, ...rest } = a
    out.push({ ...rest, subCount: _sub.size, lat: _geo ? _lat / _geo : null, lng: _geo ? _lng / _geo : null })
  }
  return out.sort((x, y) => y.total - x.total || areaName(x).localeCompare(areaName(y), 'th'))
}

// สรุปกลุ่มแถว (ใช้กับ cluster บนแผนที่) — นับพื้นที่/พฤติการณ์/ตัวยา ในกลุ่มเดียว
export function summarizeRows(rows) {
  const districts = {}, subdistricts = {}, communities = {}, beh = {}, drugs = {}
  for (const r of rows) {
    const d = norm(r.district), s = norm(r.subdistrict), c = norm(r.community)
    if (d) districts[d] = (districts[d] || 0) + 1
    if (s) subdistricts[s] = (subdistricts[s] || 0) + 1
    if (c) communities[c] = (communities[c] || 0) + 1
    for (const [col, label] of BEHAVIOR_COLS) if (r[col]) beh[label] = (beh[label] || 0) + 1
    for (const [col, label] of DRUG_FLAGS) if (r[col]) drugs[label] = (drugs[label] || 0) + 1
  }
  const top = (m, n = 3) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n)
  return {
    total: rows.length,
    districts: top(districts), subdistricts: top(subdistricts), communities: top(communities),
    districtCount: Object.keys(districts).length,
    beh, drugs: top(drugs, 5),
  }
}
