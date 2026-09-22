// districtMatcher — แมปพิกัด (lat/lng) → ชื่อเขต กทม. ด้วย point-in-polygon
// โหลด /bangkok-districts.geojson ครั้งเดียว (lazy + cache ระดับ module)
// field ชื่อเขตใน properties = "dname" (มี prefix "เขต", ยืนยันแล้ว 50 เขต)

import booleanPointInPolygon from '@turf/boolean-point-in-polygon'

const GEOJSON_URL = '/bangkok-districts.geojson'
const DNAME_KEY = 'dname'

let _features = null      // array ของ GeoJSON feature (cache)
let _bboxes = null        // [minX, minY, maxX, maxY] ต่อ feature (prefilter)
let _loadPromise = null   // กัน fetch ซ้ำเมื่อเรียกพร้อมกันหลายครั้ง

// bbox ของ feature (รองรับ Polygon / MultiPolygon ผ่าน recursion)
function computeBBox(feature) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const scan = (coords) => {
    if (typeof coords[0] === 'number') {
      const [x, y] = coords
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    } else {
      for (const c of coords) scan(c)
    }
  }
  scan(feature.geometry.coordinates)
  return [minX, minY, maxX, maxY]
}

// โหลด geojson ครั้งเดียว (ครั้งถัดไปคืน cache)
async function ensureLoaded() {
  if (_features) return
  if (!_loadPromise) {
    _loadPromise = fetch(GEOJSON_URL)
      .then(r => {
        if (!r.ok) throw new Error(`โหลด ${GEOJSON_URL} ไม่สำเร็จ (${r.status})`)
        return r.json()
      })
      .then(geo => {
        _features = geo.features || []
        _bboxes = _features.map(computeBBox)
      })
  }
  await _loadPromise
}

/**
 * คืนชื่อเขต กทม. (เช่น "เขตบางพลัด") ที่พิกัดตกอยู่ภายใน หรือ null ถ้า:
 *   - lat/lng ไม่ใช่ตัวเลขที่ valid
 *   - จุดอยู่นอกพื้นที่ทุกเขต กทม.
 */
export async function getDistrictFromLatLng(lat, lng) {
  const la = Number(lat)
  const ln = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null

  await ensureLoaded()

  const pt = { type: 'Point', coordinates: [ln, la] }   // turf = [lng, lat]
  for (let i = 0; i < _features.length; i++) {
    const [minX, minY, maxX, maxY] = _bboxes[i]
    if (ln < minX || ln > maxX || la < minY || la > maxY) continue   // bbox prefilter
    if (booleanPointInPolygon(pt, _features[i])) {
      return _features[i].properties[DNAME_KEY] ?? null
    }
  }
  return null
}
