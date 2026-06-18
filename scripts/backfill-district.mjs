// Backfill drug_incidents.district จาก lat/lng โดยใช้ point-in-polygon กับ
// public/bangkok-districts.geojson (field ชื่อเขต = "dname", มี prefix "เขต")
//
// ใช้งาน:
//   node scripts/backfill-district.mjs            # dry-run (default, ไม่เขียน DB)
//   node scripts/backfill-district.mjs --dry-run  # dry-run
//   node scripts/backfill-district.mjs --run      # UPDATE จริง
//
// ต้องมีใน .env.local: VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY (service_role — bypass RLS)

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ── flags ──
const args = process.argv.slice(2)
const RUN = args.includes('--run')
const MODE = RUN ? 'RUN (เขียน DB จริง)' : 'DRY-RUN (ไม่เขียน DB)'

// ── โหลด .env.local เอง (ไม่พึ่ง dotenv) ──
function loadEnv(path) {
  const env = {}
  let text
  try { text = readFileSync(path, 'utf8') } catch { return env }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    env[m[1]] = v
  }
  return env
}

const env = loadEnv(join(ROOT, '.env.local'))
const SUPABASE_URL = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('✗ ขาด env: ต้องมี VITE_SUPABASE_URL และ SUPABASE_SERVICE_KEY ใน .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ── โหลด geojson ──
const geo = JSON.parse(readFileSync(join(ROOT, 'public', 'bangkok-districts.geojson'), 'utf8'))
const FEATURES = geo.features
const DNAME_KEY = 'dname'   // ชื่อ field เขตใน properties (ยืนยันแล้ว 50 features, prefix "เขต")

// bbox ต่อ feature สำหรับ prefilter เร็วๆ ก่อนเรียก point-in-polygon
function featureBBox(f) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const scan = (coords) => {
    if (typeof coords[0] === 'number') {
      const [x, y] = coords
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    } else for (const c of coords) scan(c)
  }
  scan(f.geometry.coordinates)
  return [minX, minY, maxX, maxY]
}
const BBOXES = FEATURES.map(featureBBox)

function findDistrict(lng, lat) {
  const pt = { type: 'Point', coordinates: [lng, lat] }
  for (let i = 0; i < FEATURES.length; i++) {
    const [minX, minY, maxX, maxY] = BBOXES[i]
    if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue
    if (booleanPointInPolygon(pt, FEATURES[i])) return FEATURES[i].properties[DNAME_KEY]
  }
  return null
}

// ── ดึงแถวที่ district IS NULL (paginate) ──
async function fetchNullDistrict() {
  const PAGE = 1000
  let from = 0
  const all = []
  while (true) {
    const { data, error } = await supabase
      .from('drug_incidents')
      .select('id, lat, lng')
      .is('district', null)
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

function toNum(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function main() {
  console.log(`\n=== Backfill drug_incidents.district — ${MODE} ===`)
  console.log(`geojson: ${FEATURES.length} เขต · field="${DNAME_KEY}"\n`)

  const rows = await fetchNullDistrict()
  console.log(`พบแถว district IS NULL: ${rows.length.toLocaleString()} row`)

  const updates = []        // { id, district }
  const samples = []        // ตัวอย่างไว้โชว์
  let noLatLng = 0          // Z: lat/lng เป็น null
  let noMatch = 0           // Y: จุดอยู่นอก กทม.
  const byDistrict = {}     // district -> [ids]

  for (const r of rows) {
    const lat = toNum(r.lat)
    const lng = toNum(r.lng)
    if (lat == null || lng == null) { noLatLng++; continue }
    const district = findDistrict(lng, lat)
    if (!district) { noMatch++; continue }
    updates.push({ id: r.id, district })
    ;(byDistrict[district] ||= []).push(r.id)
    if (samples.length < 10) samples.push({ id: r.id, lat, lng, district })
  }

  // ── สรุป ──
  console.log('\n── สรุป ──')
  console.log(`  matched (เจอเขต):        ${updates.length.toLocaleString()} row`)
  console.log(`  no match (นอก กทม.):     ${noMatch.toLocaleString()} row`)
  console.log(`  lat/lng null (skip):     ${noLatLng.toLocaleString()} row`)
  console.log(`  รวม:                     ${rows.length.toLocaleString()} row`)

  console.log('\n── ตัวอย่าง 10 row แรกที่ match ──')
  for (const s of samples) {
    console.log(`  #${s.id}  (${s.lat.toFixed(5)}, ${s.lng.toFixed(5)})  →  ${s.district}`)
  }

  console.log('\n── การกระจายตามเขต (top 10) ──')
  Object.entries(byDistrict)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
    .forEach(([d, ids]) => console.log(`  ${d.padEnd(18)} ${ids.length.toLocaleString()} row`))

  if (!RUN) {
    console.log('\n[DRY-RUN] ไม่เขียน DB — รันด้วย --run เพื่ออัปเดตจริง\n')
    return
  }

  // ── UPDATE จริง: group ตามเขต แล้ว .in('id', chunk) ทีละ 500 ──
  console.log('\n── กำลังเขียน DB ──')
  let written = 0
  for (const [district, ids] of Object.entries(byDistrict)) {
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500)
      const { error } = await supabase
        .from('drug_incidents')
        .update({ district })
        .in('id', chunk)
      if (error) { console.error(`  ✗ ${district}: ${error.message}`); throw error }
      written += chunk.length
      console.log(`  ${district.padEnd(18)} +${chunk.length}  (รวม ${written.toLocaleString()}/${updates.length.toLocaleString()})`)
    }
  }
  console.log(`\n✓ อัปเดตสำเร็จ ${written.toLocaleString()} row\n`)
}

main().catch(err => { console.error('\n✗ ERROR:', err.message); process.exit(1) })
