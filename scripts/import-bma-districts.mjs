// import-bma-districts.mjs — เปลี่ยน "ขอบเขตเขต" ของ public/bangkok-districts.geojson เป็นของ BMA_ADMIN_DISTRICT (ทางการ)
// โดย "คงคุณสมบัติเดิมทุก field" (dcode/dname/dname_e/สถิติ) ด้วยการ join ตามรหัสเขต — หน้าอื่นที่ใช้ field พวกนี้จึงไม่พัง
// เพิ่ม field กลุ่มเขตจาก BMA (khet_group / bkk_group) ไว้ใช้ต่อ ; สำรองไฟล์เดิมเป็น .bak ก่อนเขียนทับ
//
//   node scripts/import-bma-districts.mjs "C:/Users/music/Downloads/ADMINISTRATION"
//
// ไฟล์ต้นทางเป็น WGS84 อยู่แล้ว ไม่ต้องแปลงพิกัด — ข้อมูล © กทม.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readShp, readDbf } from './lib/shapefile.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public', 'bangkok-districts.geojson')

const src = process.argv[2]
if (!src) {
  console.error('usage: node scripts/import-bma-districts.mjs <path ถึงโฟลเดอร์ ADMINISTRATION>')
  process.exit(1)
}

const base = path.join(src, 'BMA_ADMIN_DISTRICT')
const geoms = readShp(`${base}.shp`, { precision: 5 })
const { rows } = readDbf(`${base}.dbf`)

// คุณสมบัติเดิม index ตามรหัสเขต — คงไว้ทั้งหมด (dcode/dname/dname_e/สถิติ) ให้หน้าอื่นทำงานต่อได้เหมือนเดิม
const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'))
const propsByCode = new Map(prev.features.map(f => [String(f.properties.dcode), f.properties]))

const features = []
const unmatched = []
for (let i = 0; i < rows.length; i++) {
  const r = rows[i]
  const geom = geoms[i]
  if (!r || !geom) continue
  const code = String(r.DISTRICT_I)
  const base = propsByCode.get(code)
  if (!base) { unmatched.push(code); continue }
  features.push({
    type: 'Feature',
    properties: {
      ...base, // dcode/dname/dname_e/สถิติเดิม
      khet_group: r.Khet_group || null, // กลุ่มเขต (เจ้าพระยา ฯลฯ)
      bkk_group: r.BKK_GROUP || null,    // กลุ่มโซน (กรุงเทพใต้ ฯลฯ)
    },
    geometry: geom,
  })
}

// เรียงตาม OBJECTID เดิมเพื่อให้ diff น้อยที่สุด (ลำดับไม่กระทบการทำงาน แต่ช่วยให้ตรวจง่าย)
features.sort((a, b) => (a.properties.OBJECTID ?? 0) - (b.properties.OBJECTID ?? 0))

// สำรองไฟล์เดิมไว้นอก public/ (public/ ถูก bundle เข้า dist) — เก็บใน tmp/ พอ เผื่อย้อนกลับตอนไม่มี git
const bakDir = path.join(ROOT, 'tmp')
fs.mkdirSync(bakDir, { recursive: true })
const bak = path.join(bakDir, 'bangkok-districts.prev.geojson')
fs.copyFileSync(OUT, bak)
fs.writeFileSync(OUT, JSON.stringify({ type: 'FeatureCollection', features }))

console.log(`[bma-district] เขต ${features.length}/50 → ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB) — สำรองเดิมไว้ที่ ${path.relative(ROOT, bak)}`)
if (unmatched.length) console.warn('[bma-district] รหัสเขตที่ไม่ตรงกับไฟล์เดิม (ข้าม):', unmatched)
