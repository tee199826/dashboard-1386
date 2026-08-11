// pixelMapGeometry.js — projection + dot-grid สำหรับ /pixel-map
// bbox กทม. ทั้งหมด (จาก public/bangkok-districts.geojson, 50 features, ทุกอันเป็น Polygon)
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point } from '@turf/helpers'

export const BKK_BBOX = { minLng: 100.328, maxLng: 100.939, minLat: 13.494, maxLat: 13.955 }

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

// สร้าง path `d` attribute จาก Polygon feature (รองรับ hole ทุก ring ที่ 2 เป็นต้นไป)
export function districtPathD(feature, project) {
  const rings = feature.geometry.coordinates
  return rings.map(ring => {
    const pts = ring.map(([lng, lat]) => project([lng, lat]))
    return 'M' + pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L') + 'Z'
  }).join(' ')
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
