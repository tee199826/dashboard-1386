// import-bma-boundaries.mjs — แปลง shapefile ขอบเขตทางปกครองของ กทม. (ชุด ADMINISTRATION) เป็น GeoJSON ที่หน้าเว็บใช้
//
//   node scripts/import-bma-boundaries.mjs "C:/Users/music/Downloads/ADMINISTRATION"
//
// ออก public/bangkok-subdistricts.geojson (แขวง) + public/bangkok-communities.geojson (ชุมชน)
// ไฟล์ต้นทางเป็น WGS84 อยู่แล้ว (ดู .prj) จึงไม่ต้องแปลงพิกัด แค่ปัดทศนิยมให้ไฟล์เล็กลง — ข้อมูล © กทม.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { shapefileToGeoJSON } from './lib/shapefile.mjs'

// point-in-polygon (ray casting) รองรับ Polygon/MultiPolygon + รูเจาะ — ใช้จับชุมชนเข้าเขต/แขวงตามพิกัดจริง ไม่พึ่งชื่อ
function pointInRing(pt, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}
function pointInFeature(pt, feature) {
  const geom = feature.geometry
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates]
  for (const poly of polys) {
    if (!pointInRing(pt, poly[0])) continue
    let inHole = false
    for (let h = 1; h < poly.length; h++) if (pointInRing(pt, poly[h])) { inHole = true; break }
    if (!inHole) return true
  }
  return false
}
const findContaining = (pt, features) => features.find(f => pointInFeature(pt, f)) || null

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public', 'bangkok-subdistricts.geojson')
const OUT_COMMUNITY = path.join(ROOT, 'public', 'bangkok-communities.geojson')
const DISTRICTS = path.join(ROOT, 'public', 'bangkok-districts.geojson')

const src = process.argv[2]
if (!src) {
  console.error('usage: node scripts/import-bma-boundaries.mjs <path ถึงโฟลเดอร์ ADMINISTRATION>')
  process.exit(1)
}

// ชื่อเขตยึดตาม bangkok-districts.geojson โดยจับคู่ด้วย "รหัสเขต" (ตรงกันครบ 50/50) ไม่ใช่ชื่อ
// — ชื่อในสองไฟล์สะกดต่างกันอยู่จุดหนึ่ง (ราษฎร์บูรณะ/ราษฏร์บูรณะ) ถ้าจับคู่ด้วยชื่อจะหลุดทันที
const districts = JSON.parse(fs.readFileSync(DISTRICTS, 'utf8'))
const dnameByCode = new Map(districts.features.map(f => [String(f.properties.dcode), f.properties.dname]))
const dnames = new Set(districts.features.map(f => f.properties.dname))

const gj = shapefileToGeoJSON(path.join(src, 'BMA_ADMIN_SUB_DISTRICT'), {
  precision: 5, // ~1 เมตร
  mapProperties: (r) => ({
    name: r.SUBDISTR_1,
    code: r.SUBDISTRIC,
    district: dnameByCode.get(String(r.DISTRICT_I)) ?? `เขต${r.DISTRICT_N}`,
    district_code: r.DISTRICT_I,
  }),
})

gj.features.sort((a, b) =>
  a.properties.district.localeCompare(b.properties.district, 'th') || a.properties.name.localeCompare(b.properties.name, 'th'))
fs.writeFileSync(OUT, JSON.stringify(gj))

const fromShp = new Set(gj.features.map(f => f.properties.district))
const missing = [...dnames].filter(d => !fromShp.has(d))
console.log(`[bma] แขวง ${gj.features.length} รายการ / ${fromShp.size} เขต → ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB)`)
if (missing.length) console.warn('[bma] เขตที่ไม่มีแขวงในไฟล์ BMA:', missing)

// ── ชุมชน (201ชุมชน.shp) — จับ "เขต/แขวง" ด้วยพิกัดจริง (point-in-polygon ในขอบเขต BMA) ไม่ใช่ชื่อในไฟล์ ──
// เดิมจับด้วย DNAME/SNAME ทำให้เขต↔ชุมชนไม่ตรง (ชื่อในไฟล์สะกด/ระบุเขตผิดได้) — ยึดภูมิศาสตร์จากไฟล์ที่ให้มาแทน
const COMMUNITY_SHP = path.join(src, '201ชุมชน')
if (fs.existsSync(`${COMMUNITY_SHP}.shp`)) {
  const loose = (name) => String(name || '').replace(/^เขต/, '').replace(/[ฎฏ]/g, 'ฏ').replace(/\s+/g, '')
  const dnameByLoose = new Map(districts.features.map(f => [loose(f.properties.dname), f.properties.dname]))

  let byGeo = 0, movedDistrict = 0
  const communities = shapefileToGeoJSON(COMMUNITY_SHP, {
    precision: 5,
    mapProperties: (r) => {
      const pt = [r.LON, r.LAT]
      const nameDistrict = dnameByLoose.get(loose(r.DNAME)) ?? `เขต${r.DNAME}`
      // เขต: หาเขตที่จุดของชุมชนตกอยู่ข้างใน (จาก bangkok-districts.geojson = ขอบเขต BMA) — ถ้าจุดหลุดขอบค่อยใช้ชื่อ
      const dFeature = (Number.isFinite(r.LON) && Number.isFinite(r.LAT)) ? findContaining(pt, districts.features) : null
      const district = dFeature ? dFeature.properties.dname : nameDistrict
      if (dFeature) { byGeo++; if (district !== nameDistrict) movedDistrict++ }
      // แขวง: หาแขวงในเขตนั้นที่จุดตกอยู่ข้างใน (จาก bangkok-subdistricts.geojson ที่เพิ่งสร้าง) — ไม่เจอค่อยใช้ SNAME
      const subFeature = dFeature ? findContaining(pt, gj.features.filter(s => s.properties.district === district)) : null
      return {
        name: r.CMT_NAME,
        type: r.CMT_TYPE,
        district,
        subdistrict: subFeature ? subFeature.properties.name : r.SNAME,
        lat: r.LAT,
        lng: r.LON,
      }
    },
  })
  communities.features.sort((a, b) =>
    a.properties.district.localeCompare(b.properties.district, 'th') || a.properties.name.localeCompare(b.properties.name, 'th'))
  fs.writeFileSync(OUT_COMMUNITY, JSON.stringify(communities))

  const badDistrict = communities.features.filter(f => !dnames.has(f.properties.district)).map(f => f.properties.district)
  console.log(`[bma] ชุมชน ${communities.features.length} รายการ (จับเขตด้วยพิกัด ${byGeo} รายการ, แก้เขตให้ตรงพิกัด ${movedDistrict} รายการ) → ${path.relative(ROOT, OUT_COMMUNITY)} (${(fs.statSync(OUT_COMMUNITY).size / 1024).toFixed(0)} KB)`)
  if (badDistrict.length) console.warn('[bma] ชุมชนที่ชื่อเขตไม่ตรง:', [...new Set(badDistrict)])
} else {
  console.warn('[bma] ไม่พบ 201ชุมชน.shp — ข้ามการสร้างขอบเขตชุมชน')
}
