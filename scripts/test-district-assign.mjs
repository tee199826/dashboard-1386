// ทดสอบ assignDrugIncidentDistricts ด้วย mock data (ไม่แตะ DB)
// shim fetch ให้ districtMatcher อ่าน geojson จาก local file แทน HTTP
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GEOJSON = readFileSync(join(__dirname, '..', 'public', 'bangkok-districts.geojson'), 'utf8')

globalThis.fetch = async (url) => ({
  ok: true,
  status: 200,
  json: async () => JSON.parse(GEOJSON),
})

const { assignDrugIncidentDistricts } = await import('../src/utils/importEngine.js')

// mock 5 แถว (จำลองหลัง mapColumns + buildBatch → มี lat/lng + district + row_index)
const rows = [
  { row_index: 1, lat: 13.81451, lng: 100.65865, district: null },              // → ควรได้ เขตบึงกุ่ม
  { row_index: 2, lat: 13.72390, lng: 100.79394, district: null },              // → ควรได้ เขตลาดกระบัง
  { row_index: 3, lat: 13.70975, lng: 100.52632, district: '' },                // → ควรได้ เขตสาทร (string ว่าง = ต้อง assign)
  { row_index: 4, lat: 13.75000, lng: 100.50000, district: 'เขตพระนคร' },        // → เคารพค่าเดิม (ไม่ override)
  { row_index: 5, lat: null,     lng: null,      district: null },              // → skip (ไม่มี lat/lng)
  { row_index: 6, lat: 18.78870, lng: 98.98530,  district: null },              // → นอก กทม. (เชียงใหม่) = unmatched
]

const before = rows.map(r => ({ ...r }))
const res = await assignDrugIncidentDistricts(rows)

console.log('=== ผลทดสอบ assignDrugIncidentDistricts ===\n')
console.log('row | lat        | lng        | district เดิม      | district หลัง')
console.log('----+------------+------------+--------------------+--------------------')
rows.forEach((r, i) => {
  const b = before[i]
  const orig = b.district === null ? 'null' : (b.district === '' ? "''" : b.district)
  console.log(
    `  ${r.row_index} | ${String(b.lat).padEnd(10)} | ${String(b.lng).padEnd(10)} | ${String(orig).padEnd(18)} | ${r.district ?? 'null'}`,
  )
})

console.log('\n── สรุป ──')
console.log('  districtAssigned:', res.districtAssigned, '(คาดหวัง 3 — row 1,2,3)')
console.log('  unmatched (row_index):', JSON.stringify(res.unmatched), '(คาดหวัง [6])')

// assertions
const ok =
  rows[0].district === 'เขตบึงกุ่ม' &&
  rows[1].district === 'เขตลาดกระบัง' &&
  rows[2].district && rows[2].district.startsWith('เขต') &&
  rows[3].district === 'เขตพระนคร' &&        // ไม่ถูก override
  rows[4].district === null &&               // skip
  rows[5].district === null &&               // unmatched ไม่ assign
  res.districtAssigned === 3 &&
  res.unmatched.length === 1 && res.unmatched[0] === 6

console.log('\n' + (ok ? '✓ PASS — ทุก assertion ผ่าน' : '✗ FAIL — มี assertion ไม่ผ่าน'))
process.exit(ok ? 0 : 1)
