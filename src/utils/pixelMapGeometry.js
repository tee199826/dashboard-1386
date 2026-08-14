// pixelMapGeometry.js — projection + dot-grid สำหรับ /pixel-map
// bbox กทม. ทั้งหมด (จาก public/bangkok-districts.geojson, 50 features, ทุกอันเป็น Polygon)
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point } from '@turf/helpers'

export const BKK_BBOX = { minLng: 100.328, maxLng: 100.939, minLat: 13.484, maxLat: 13.955 } // ครอบขอบเขต BMA_ADMIN_DISTRICT พอดี (ปลายบางขุนเทียนลงถึง ~13.485)

const GEOJSON_URL = '/bangkok-districts.geojson'
const SUBDISTRICT_URL = '/bangkok-subdistricts.geojson' // 169 แขวง (BMA) — สร้างด้วย scripts/import-bma-boundaries.mjs
const COMMUNITY_URL = '/bangkok-communities.geojson'   // 201 ชุมชน (BMA/201ชุมชน)
let _geoPromise = null
let _subPromise = null
let _comPromise = null

// cache ระดับ module — /pixel-map recompute grid บ่อยตาม control ที่เปลี่ยน แต่ geojson โหลดครั้งเดียวพอ
export function loadDistrictGeoJSON() {
  if (!_geoPromise) _geoPromise = fetch(GEOJSON_URL).then(r => r.json())
  return _geoPromise
}

export const normalizeSubdistrictName = (name) => String(name || '').replace(/^(แขวง|ตำบล)\s*/, '').replace(/\s+/g, '')
export const normalizeCommunityName = (name) => String(name || '').replace(/^ชุมชน\s*/, '').replace(/\s+/g, '')

// index ขอบเขตแขวง: "เขต|ชื่อแขวง(normalize)" → feature — ชื่อแขวงซ้ำข้ามเขตได้ จึง key คู่กับเขตเสมอ
export function loadSubdistrictIndex() {
  if (!_subPromise) {
    _subPromise = fetch(SUBDISTRICT_URL)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(gj => {
        const index = new Map()
        for (const f of gj.features) index.set(`${f.properties.district}|${normalizeSubdistrictName(f.properties.name)}`, f)
        return index
      })
  }
  return _subPromise
}

// index ขอบเขตชุมชน: key "เขต|แขวง|ชุมชน" และ key สำรอง "เขต|ชุมชน" (ชื่อแขวงในฐานข้อมูลกับไฟล์ไม่ตรงกันบ้าง)
export function loadCommunityIndex() {
  if (!_comPromise) {
    _comPromise = fetch(COMMUNITY_URL)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(gj => {
        const index = new Map()
        for (const f of gj.features) {
          const { district, subdistrict, name } = f.properties
          index.set(`${district}|${normalizeSubdistrictName(subdistrict)}|${normalizeCommunityName(name)}`, f)
          index.set(`${district}|${normalizeCommunityName(name)}`, f)
        }
        return index
      })
  }
  return _comPromise
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

// ระยะแก้ไข (Levenshtein) ตัดจบเร็วเมื่อเกิน max — เทียบชื่อสั้นๆ ระดับแขวง/ชุมชนให้ทนการสะกดต่าง 1 ตัว
function editDistanceWithin(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      best = Math.min(best, cur[j])
    }
    if (best > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

// หา feature ของแขวง — ตรงเป๊ะก่อน ไม่งั้นยอมสะกดต่างไม่เกิน 1 ตัว "ภายในเขตเดียวกัน" (กันชื่อซ้ำข้ามเขต)
export function lookupSubdistrict(index, district, sub) {
  if (!index) return undefined
  const norm = normalizeSubdistrictName(sub)
  const exact = index.get(`${district}|${norm}`)
  if (exact) return exact
  const prefix = `${district}|`
  for (const key of index.keys()) {
    if (!key.startsWith(prefix)) continue
    if (editDistanceWithin(norm, key.slice(prefix.length), 1) <= 1) return index.get(key)
  }
  return undefined
}

// หา feature ของชุมชน — คีย์เต็ม (เขต|แขวง|ชุมชน) → คีย์ไม่ผูกแขวง → ยอมสะกดต่าง 1 ตัวในเขตเดียวกัน
export function lookupCommunity(index, district, sub, name) {
  if (!index) return undefined
  const norm = normalizeCommunityName(name)
  const exact = index.get(`${district}|${normalizeSubdistrictName(sub)}|${norm}`) ?? index.get(`${district}|${norm}`)
  if (exact) return exact
  const prefix = `${district}|`
  for (const key of index.keys()) {
    const rest = key.slice(prefix.length)
    if (!key.startsWith(prefix) || rest.includes('|')) continue // เทียบเฉพาะคีย์ชื่อชุมชนล้วน
    if (editDistanceWithin(norm, rest, 1) <= 1) return index.get(key)
  }
  return undefined
}

// ── เซลล์พื้นที่จริง (ไม่ใช่วงกลม) เมื่อไม่มี polygon ในไฟล์ ──
// ตัด polygon ของ "กรอบ" (แขวง/เขต) ด้วยเส้นแบ่งครึ่งระหว่างจุดนี้กับจุดพี่น้อง (Sutherland–Hodgman / Voronoi)
function largestRing(feature) {
  const polys = feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [feature.geometry.coordinates]
  return polys.map(p => p[0]).reduce((a, b) => (b.length > a.length ? b : a))
}
function clipByBisector(poly, mid, dir) {
  const side = (p) => (p[0] - mid[0]) * dir[0] + (p[1] - mid[1]) * dir[1]
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const sa = side(a), sb = side(b)
    if (sa <= 0) out.push(a)
    if ((sa <= 0) !== (sb <= 0)) {
      const t = sa / (sa - sb)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}

// พื้นที่ของ site (แขวง/ชุมชน) = ส่วนของกรอบที่ใกล้ site มากกว่าพี่น้องอื่น — คำนวณในระนาบปรับ cos(lat)
export function communityCellRing(boundFeature, site, others) {
  if (!boundFeature || !Number.isFinite(site?.lat) || !Number.isFinite(site?.lng)) return null
  const cosLat = Math.cos(site.lat * Math.PI / 180) || 1
  const toPlane = ([lng, lat]) => [lng * cosLat, lat]
  let poly = largestRing(boundFeature).map(toPlane)
  const s = toPlane([site.lng, site.lat])
  for (const o of others) {
    if (!Number.isFinite(o?.lat) || !Number.isFinite(o?.lng)) continue
    const p = toPlane([o.lng, o.lat])
    const dir = [p[0] - s[0], p[1] - s[1]]
    if (dir[0] === 0 && dir[1] === 0) continue
    poly = clipByBisector(poly, [(s[0] + p[0]) / 2, (s[1] + p[1]) / 2], dir)
    if (poly.length < 3) return null
  }
  return poly.map(([x, y]) => [x / cosLat, y])
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
