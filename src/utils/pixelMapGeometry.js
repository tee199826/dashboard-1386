// pixelMapGeometry.js — projection + dot-grid สำหรับ /pixel-map
// bbox กทม. ทั้งหมด (จาก public/bangkok-districts.geojson, 50 features, ทุกอันเป็น Polygon)
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point } from '@turf/helpers'

export const BKK_BBOX = { minLng: 100.328, maxLng: 100.939, minLat: 13.484, maxLat: 13.955 } // ครอบขอบเขต BMA_ADMIN_DISTRICT พอดี (ปลายบางขุนเทียนลงถึง ~13.485)

const GEOJSON_URL = '/bangkok-districts.geojson'
let _geoPromise = null

// cache ระดับ module — /pixel-map recompute grid บ่อยตาม control ที่เปลี่ยน แต่ geojson โหลดครั้งเดียวพอ
export function loadDistrictGeoJSON() {
  if (!_geoPromise) _geoPromise = fetch(GEOJSON_URL).then(r => r.json())
  return _geoPromise
}

// equirectangular projection ครอบเฉพาะ bbox กทม. — cos(lat) แก้สัดส่วนแกน lng, fit-to-canvas พร้อม padding
// คืน { project([lng,lat]) → [x,y], unproject([x,y]) → [lng,lat] } — affine ล้วน invert ตรงไปตรงมา
export function makeProjection(bbox, width, height, padding = 24) {
  const midLatRad = ((bbox.minLat + bbox.maxLat) / 2) * Math.PI / 180
  const cosLat = Math.cos(midLatRad)
  const lngSpan = (bbox.maxLng - bbox.minLng) * cosLat
  const latSpan = bbox.maxLat - bbox.minLat
  const innerW = Math.max(1, width - padding * 2)
  const innerH = Math.max(1, height - padding * 2)
  const scale = Math.min(innerW / lngSpan, innerH / latSpan)
  const usedW = lngSpan * scale
  const usedH = latSpan * scale
  const offsetX = (width - usedW) / 2
  const offsetY = (height - usedH) / 2

  const project = ([lng, lat]) => [
    offsetX + (lng - bbox.minLng) * cosLat * scale,
    offsetY + (bbox.maxLat - lat) * scale, // flip แกน y (เหนือ = บน)
  ]
  const unproject = ([x, y]) => [
    bbox.minLng + (x - offsetX) / (cosLat * scale),
    bbox.maxLat - (y - offsetY) / scale,
  ]
  return { project, unproject }
}

// สร้าง path `d` attribute จาก feature เดียว รองรับทั้ง Polygon และ MultiPolygon (hole = ring ที่ 2 เป็นต้นไปของแต่ละ polygon)
export function featurePathD(feature, project) {
  const geom = feature.geometry
  const polygons = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates]
  return polygons.map(rings => rings.map(ring => {
    const pts = ring.map(([lng, lat]) => project([lng, lat]))
    return 'M' + pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L') + 'Z'
  }).join(' ')).join(' ')
}

// เขตเป็น Polygon ล้วนเสมอ (ไม่มี MultiPolygon ในไฟล์ 50 เขต) — คง export เดิมไว้ ใช้ featurePathD ร่วมกัน กันโค้ดซ้ำ
export function districtPathD(feature, project) {
  return featurePathD(feature, project)
}

// ring เดียว (ไม่มี hole) → path `d` — ใช้กับรูปทรงประมาณของแขวง/ชุมชนที่ไม่มีขอบเขตจริงในไฟล์ (ดู subdistrictOutlineRing/communityCellRing)
export function ringPathD(ring, project) {
  if (!ring || ring.length === 0) return null
  const pts = ring.map(([lng, lat]) => project([lng, lat]))
  return 'M' + pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L') + 'Z'
}

// index (Map คีย์ "เขต|แขวง" หรือ "เขต|แขวง|ชุมชน") ของขอบเขตจริงจากไฟล์ geojson แยก — ยังไม่มีไฟล์ให้ใน public/
// (มีแค่ระดับเขต) ฟังก์ชัน lookup จึงคืน undefined เสมอตอนนี้ แล้ว fallback ไปใช้รูปทรงประมาณ — พร้อมใช้ทันทีถ้าเพิ่มไฟล์ทีหลัง
export function lookupSubdistrict(index, district, sub) {
  return index ? index.get(`${district}|${sub}`) : undefined
}
export function lookupCommunity(index, district, sub, name) {
  return index ? index.get(`${district}|${sub}|${name}`) : undefined
}

// วงกลมประมาณ (ในหน่วย lng/lat) รอบจุดศูนย์กลาง — ชดเชย cos(lat) แกน lng เหมือน makeProjection ให้ออกมากลมจริงบนจอ หลัง project()
function circleRingAt(lat, lng, radiusLatDeg, segments = 24) {
  const cosLat = Math.cos(lat * Math.PI / 180) || 1
  const ring = []
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2
    ring.push([lng + (radiusLatDeg / cosLat) * Math.cos(theta), lat + radiusLatDeg * Math.sin(theta)])
  }
  return ring
}

const SUBDISTRICT_MIN_RADIUS = 0.006 // ~650m
const SUBDISTRICT_MAX_RADIUS = 0.02  // ~2.2km
const SUBDISTRICT_DEFAULT_RADIUS = 0.01

// กรอบประมาณของแขวง (ไม่มี polygon จริง) — รัศมีอิงจากระยะเฉลี่ยจาก centroid แขวงไปยังชุมชนของมันเอง (ยิ่งกระจายกว้าง ยิ่งวงใหญ่)
// ไม่มีชุมชนเลย (แขวงที่ไม่มีจุดพิกัดระดับชุมชน) → ใช้รัศมี default
export function subdistrictOutlineRing(node) {
  const { centroid } = node
  if (!centroid) return null
  const communities = Object.values(node.communities || {})
  let radius = SUBDISTRICT_DEFAULT_RADIUS
  const cosLat = Math.cos(centroid.lat * Math.PI / 180)
  let sum = 0, n = 0
  for (const c of communities) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue
    const dLat = c.lat - centroid.lat
    const dLng = (c.lng - centroid.lng) * cosLat
    sum += Math.hypot(dLat, dLng)
    n++
  }
  if (n > 0) radius = Math.min(SUBDISTRICT_MAX_RADIUS, Math.max(SUBDISTRICT_MIN_RADIUS, (sum / n) * 1.6))
  return circleRingAt(centroid.lat, centroid.lng, radius, 32)
}

const COMMUNITY_MIN_RADIUS = 0.0012 // ~130m
const COMMUNITY_MAX_RADIUS = 0.006  // ~650m
const COMMUNITY_DEFAULT_RADIUS = 0.003

// "เซลล์" ประมาณของชุมชน (ไม่มี polygon จริง) — รัศมี = ครึ่งระยะไปชุมชนพี่น้องที่ใกล้ที่สุดในแขวงเดียวกัน กันไม่ให้วงซ้อนกัน
// (nearest-neighbor half-distance — ประมาณ Voronoi แบบง่าย ไม่ต้อง clip polygon จริง) ไม่มีพี่น้อง → รัศมี default
export function communityCellRing(subFeature, c, siblings) {
  if (!Number.isFinite(c?.lat) || !Number.isFinite(c?.lng)) return null
  let radius = COMMUNITY_DEFAULT_RADIUS
  const cosLat = Math.cos(c.lat * Math.PI / 180)
  let minDist = Infinity
  for (const s of siblings) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue
    const dLat = s.lat - c.lat
    const dLng = (s.lng - c.lng) * cosLat
    const dist = Math.hypot(dLat, dLng)
    if (dist > 0) minDist = Math.min(minDist, dist)
  }
  if (Number.isFinite(minDist)) radius = Math.min(COMMUNITY_MAX_RADIUS, Math.max(COMMUNITY_MIN_RADIUS, minDist / 2))
  return circleRingAt(c.lat, c.lng, radius)
}

// วงกลม fallback สุดท้าย — ใช้เมื่อ communityCellRing คืน null (พิกัดไม่ถูกต้อง)
export function circleRing(c) {
  if (!Number.isFinite(c?.lat) || !Number.isFinite(c?.lng)) return []
  return circleRingAt(c.lat, c.lng, COMMUNITY_DEFAULT_RADIUS)
}

// สร้าง grid จุดทั่ว canvas แล้วเก็บเฉพาะจุดที่ตกอยู่ในเขตใดเขตหนึ่ง (point-in-polygon ด้วย turf)
// คืน [{ x, y, district }] — district = properties.dname (มีคำนำหน้า "เขต")
// memoize ตาม (spacing, width, height) ที่เรียก — ไม่ผูกกับ data เลย เพื่อให้ re-filter data ไม่ต้อง recompute grid
export function buildDotGrid(geojson, { width, height, spacing = 12, padding = 24 }) {
  const { project, unproject } = makeProjection(BKK_BBOX, width, height, padding)
  const dots = []
  for (let y = padding; y <= height - padding; y += spacing) {
    for (let x = padding; x <= width - padding; x += spacing) {
      const [lng, lat] = unproject([x, y])
      const pt = point([lng, lat])
      for (const feature of geojson.features) {
        if (booleanPointInPolygon(pt, feature)) {
          dots.push({ x, y, district: feature.properties.dname })
          break
        }
      }
    }
  }
  return { dots, project }
}

// เลือก index แบบกระจายสม่ำเสมอ (deterministic, ไม่สุ่ม) — ใช้ทำ Density mode thinning ต่อเขต
export function thinnedIndices(count, ratio) {
  const keep = new Set()
  if (ratio >= 1 || count === 0) {
    for (let i = 0; i < count; i++) keep.add(i)
    return keep
  }
  const n = Math.max(ratio > 0 ? 1 : 0, Math.round(count * ratio))
  for (let k = 0; k < n; k++) keep.add(Math.floor((k * count) / n))
  return keep
}
