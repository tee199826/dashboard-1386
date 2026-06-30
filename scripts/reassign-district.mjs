// Reassign drug_incidents.district จาก lat/lng (re-run point-in-polygon ทุก row)
// แก้บั๊ก: district ใน DB ไม่ตรงตำแหน่งจริง (เช่น district='เขตคลองเตย' แต่ lat=13.83 = ดอนเมือง)
//
// ใช้งาน:
//   node scripts/reassign-district.mjs            # dry-run (default, ไม่เขียน DB)
//   node scripts/reassign-district.mjs --run      # UPDATE จริง batch 500
//
// ต้องมีใน .env.local: VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY (service_role — bypass RLS)

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const args = process.argv.slice(2)
const RUN = args.includes('--run')
const MODE = RUN ? 'RUN (เขียน DB จริง)' : 'DRY-RUN (ไม่เขียน DB)'

// ── โหลด .env.local เอง ──
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
const DNAME_KEY = 'dname'   // ชื่อเขตใน properties (มี prefix "เขต")

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

function toNum(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// normalize เพื่อแยก "สะกดต่าง" ออกจาก "ผิดเชิงพื้นที่" (DB สะกด ราษฏร์ ฏ, geojson ราษฎร์ ฎ)
const norm = s => String(s || '').trim().replace('ราษฏร์บูรณะ', 'ราษฎร์บูรณะ')

// ── ดึงทุกแถวที่มี lat/lng (paginate) ──
async function fetchAll() {
  const PAGE = 1000
  let from = 0
  const all = []
  while (true) {
    const { data, error } = await supabase
      .from('drug_incidents')
      .select('id, lat, lng, district')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

async function main() {
  console.log(`\n=== Reassign drug_incidents.district (re-run PIP) — ${MODE} ===`)
  console.log(`geojson: ${FEATURES.length} เขต · field="${DNAME_KEY}"\n`)

  const rows = await fetchAll()
  console.log(`พบแถวที่มี lat/lng: ${rows.length.toLocaleString()} row\n`)

  let matched = 0          // district เดิมถูกต้องตรง PIP
  let spelling = 0         // ต่างแค่การสะกด (ราษฏร์/ราษฎร์) — ยังนับว่าต้อง normalize
  let geo_mismatch = 0     // ผิดเชิงพื้นที่จริง (เขตคนละเขต)
  let out_of_bkk = 0       // จุดอยู่นอกขอบเขต 50 เขต
  let badLatLng = 0        // lat/lng ไม่ใช่ตัวเลข
  const updates = []       // { id, district } (ทุก row ที่ new != old)
  const geoSamples = []    // ตัวอย่าง mismatch เชิงพื้นที่
  const byNew = {}         // district_new -> [ids] (สำหรับ update + verify)

  for (const r of rows) {
    const lat = toNum(r.lat), lng = toNum(r.lng)
    if (lat == null || lng == null) { badLatLng++; continue }
    const dNew = findDistrict(lng, lat)
    if (!dNew) { out_of_bkk++; continue }
    const dOld = r.district
    if (dOld === dNew) { matched++; continue }
    // ต่างกัน → ต้องอัปเดต
    updates.push({ id: r.id, district: dNew })
    ;(byNew[dNew] ||= []).push(r.id)
    if (norm(dOld) === norm(dNew)) {
      spelling++
    } else {
      geo_mismatch++
      if (geoSamples.length < 20) geoSamples.push({ id: r.id, lat, lng, old: dOld, neu: dNew })
    }
  }

  console.log('── สรุป ──')
  console.log(`  matched (เดิมถูก):            ${matched.toLocaleString()} row`)
  console.log(`  mismatch เชิงพื้นที่ (ต้องแก้): ${geo_mismatch.toLocaleString()} row`)
  console.log(`  ต่างแค่การสะกด (normalize):    ${spelling.toLocaleString()} row`)
  console.log(`  out of Bangkok (นอก 50 เขต):  ${out_of_bkk.toLocaleString()} row`)
  console.log(`  lat/lng ไม่ถูกต้อง (skip):     ${badLatLng.toLocaleString()} row`)
  console.log(`  → จะอัปเดตทั้งหมด:            ${updates.length.toLocaleString()} row\n`)

  console.log('── ตัวอย่าง 20 row mismatch เชิงพื้นที่ (เดิม → ใหม่) ──')
  for (const s of geoSamples) {
    console.log(`  #${String(s.id).slice(0, 8)}  (${s.lat.toFixed(5)}, ${s.lng.toFixed(5)})  ${String(s.old || '∅').padEnd(16)} → ${s.neu}`)
  }

  // verify: ช่วง lat/lng ของแต่ละเขตหลัง reassign (จาก in-memory PIP)
  console.log('\n── ช่วง lat ของเขตหลัง reassign (ตัวอย่างเรียงตามจำนวน, top 12) ──')
  const rangeByNew = {}
  for (const r of rows) {
    const lat = toNum(r.lat), lng = toNum(r.lng)
    if (lat == null || lng == null) continue
    const d = findDistrict(lng, lat)
    if (!d) continue
    const e = (rangeByNew[d] ||= { n: 0, latMin: Infinity, latMax: -Infinity })
    e.n++; if (lat < e.latMin) e.latMin = lat; if (lat > e.latMax) e.latMax = lat
  }
  Object.entries(rangeByNew).sort((a, b) => b[1].n - a[1].n).slice(0, 12)
    .forEach(([d, e]) => console.log(`  ${d.padEnd(18)} n=${String(e.n).padStart(5)}  lat ${e.latMin.toFixed(4)}–${e.latMax.toFixed(4)}`))

  if (!RUN) {
    console.log('\n[DRY-RUN] ไม่เขียน DB — รันด้วย --run เพื่ออัปเดตจริง\n')
    return
  }

  console.log('\n── กำลังเขียน DB (batch 500) ──')
  let written = 0
  for (const [district, ids] of Object.entries(byNew)) {
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500)
      const { error } = await supabase.from('drug_incidents').update({ district }).in('id', chunk)
      if (error) { console.error(`  ✗ ${district}: ${error.message}`); throw error }
      written += chunk.length
    }
    console.log(`  ${district.padEnd(18)} +${ids.length}  (รวม ${written.toLocaleString()}/${updates.length.toLocaleString()})`)
  }
  console.log(`\n✓ อัปเดตสำเร็จ ${written.toLocaleString()} row\n`)
}

main().catch(err => { console.error('\n✗ ERROR:', err.message); process.exit(1) })
