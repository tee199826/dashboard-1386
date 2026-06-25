// Sanity test parseDrugIncidents ด้วย synthetic fixture (ไม่ต้องมีข้อมูลจริง — PDPA)
// header layout จำลองตามไฟล์จริง (col positions ที่ inspect มา)
// รัน: node --import ./scripts/register.mjs scripts/test-parse-fixtures.mjs
import XLSX from 'xlsx'
import { parseDrugIncidents } from '../src/utils/importEngine.js'

const W = 70
const blank = () => Array(W).fill(null)
function set(arr, obj) { for (const k in obj) arr[k] = obj[k]; return arr }

// ── row 2 = header (ตำแหน่งตรงไฟล์จริง) ──
const H = blank()
set(H, {
  0: 'ที่', 1: 'วัน', 2: 'เดือน', 3: 'ปี', 4: 'กลุ่ม',
  5: 'รหัสบุคคล/รหัสข่าว', 6: 'เพศ', 7: 'ชื่อ', 8: 'นามสกุล', 9: 'เลขที่บัตรประชาชน',
  10: 'ที่อยู่ปัจจุบัน/ที่มีพฤติการณ์', 11: 'ชุมชน', 12: 'แขวง', /* 13 = district (ไม่มี header) */
  14: 'รหัสชุมชน (Nispa)', 15: 'พิกัด X', 16: 'พิกัด Y', 17: 'กลุ่มพื้นที่ สูตร',
  19: 'เสพ', 20: 'ค้า', 21: 'เสพ/ค้า', 22: 'ผลิต',
  23: 'ยาบ้า', 24: 'ไอซ์', 25: 'ยาอี', 26: 'คีตามีน', 27: 'โคเคน', 28: 'เฮโรอีน', 29: 'มอร์ฟีน',
  30: 'ฝื่น', 31: 'กระท่อม', 32: 'กัญชา', 33: 'สารระเหย', 34: 'สี่คูณร้อย', 35: 'ยาใช้ในทางที่ผิด', 36: 'วัตถุออกฤทธิ์',
  37: 'อื่นๆ',
  43: 'พบพฤติการณ์', 44: 'ไม่พบพฤติการณ์', 45: 'พิสูจน์ทราบไม่ได้/ไม่พบตัว/', 46: 'เสียชีวิต',
  47: 'ตรวจค้น', 48: 'จับกุม', 49: 'หลบหนี', 50: 'อยู่ระหว่างสืบสวน/ไม่แน่ใจ', 51: 'บำบัด',
  // cols ≥ 52 = บล็อกข้อหา/หน่วยงาน (ต้องถูก ignore)
  52: 'อื่น', 53: 'จำหน่าย', 69: 'กระท่อม',
})

const data = [
  set(blank(), { 0: 'ฐานข้อมูลดิบเรื่องร้องเรียน ปีงบประมาณ 2569' }),  // row 0: title
  blank(),                                                              // row 1: group (merge spillover)
  H,                                                                    // row 2: column names
  // A: ครบ — ยาบ้า + ฝื่น(typo) + เสพ + พบ + จับกุม ; col69 กระท่อม (ignore block)
  set(blank(), { 1: 1, 2: 'ต.ค.', 3: 68, 4: 1, 7: 'ทดสอบ', 8: 'หนึ่ง', 9: '1234567890123', 10: '99/9 ถนนทดสอบ', 11: 'ชุมชนเอ', 12: 'ทุ่งครุ', 13: 'ทุ่งครุ', 14: 'C001', 15: 13.7, 16: 100.5, 17: 'กรุงธนใต้', 19: 1, 23: 1, 30: 1, 43: 1, 48: 1, 69: 1 }),
  // B: ไม่มี lat/lng → ต้องไม่ skip (district = เขตบางรัก)
  set(blank(), { 1: 2, 2: 'พ.ย.', 3: 68, 4: 2, 11: 'ชุมชนบี', 12: 'สีลม', 13: 'บางรัก', 20: 1, 23: 1, 44: 1, 47: 1 }),
  // C: ไม่มี district แต่มี lat/lng → ต้องไม่ skip (district = null → PIP ตอน upload)
  set(blank(), { 1: 3, 2: 'ธ.ค.', 3: 68, 15: 13.8, 16: 100.6, 24: 1 }),
  // D: อื่นๆ (ชนิดยาอื่น) → drug_others array ; เสพ/ค้า
  set(blank(), { 1: 4, 2: 'ม.ค.', 3: 69, 12: 'คลองตัน', 13: 'คลองเตย', 21: 1, 37: 'เคนมผง' }),
  // E: typo เขต (ฎ ชฎา) → normalize เป็น ฏ ปฏัก
  set(blank(), { 1: 5, 2: 'ก.พ.', 3: 69, 12: 'ราษฎร์บูรณะ', 13: 'ราษฎร์บูรณะ', 23: 1 }),
  // F: duplicate ของ A → ต้อง dedup (content_hash ตรง)
  set(blank(), { 1: 1, 2: 'ต.ค.', 3: 68, 4: 1, 7: 'ทดสอบ', 8: 'หนึ่ง', 9: '1234567890123', 10: '99/9 ถนนทดสอบ', 11: 'ชุมชนเอ', 12: 'ทุ่งครุ', 13: 'ทุ่งครุ', 14: 'C001', 15: 13.7, 16: 100.5, 17: 'กรุงธนใต้', 19: 1, 23: 1, 30: 1, 43: 1, 48: 1, 69: 1 }),
  // G: วันที่ไม่ครบ (ไม่มี วัน) → skip
  set(blank(), { 2: 'ต.ค.', 3: 68, 23: 1 }),
]

const ws = XLSX.utils.aoa_to_sheet(data)
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'เรื่องร้องเรียน')

const { rows, stats } = parseDrugIncidents(wb)
console.log('=== STATS ===', JSON.stringify(stats))
console.log('=== row[0] (A) ===')
console.log(JSON.stringify(Object.fromEntries(Object.entries(rows[0]).filter(([, v]) => v !== false && v != null)), null, 1))

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++ } else { fail++; console.log('  ✗ FAIL:', msg) } }
const A = rows[0], B = rows[1], C = rows[2], D = rows[3], E = rows[4]

// fix 1: district positional (col 13 ไม่มี header)
ok(A.district === 'เขตทุ่งครุ', `district = เขตทุ่งครุ (ได้ ${A.district})`)
ok(A.subdistrict === 'ทุ่งครุ', `subdistrict = ทุ่งครุ (ได้ ${A.subdistrict})`)
// ไฟล์จริง: พิกัด X (col15) → lat (13.x), พิกัด Y (col16) → lng (100.x) — สลับจาก convention
ok(A.lng === 100.5, `lng = 100.5 (ได้ ${A.lng})`)
ok(A.lat === 13.7, `lat = 13.7 (ได้ ${A.lat})`)
// one-hot
ok(A.beh_use === true, 'เสพ → beh_use')
ok(A.drug_yaba === true, 'ยาบ้า → drug_yaba')
// fix 3: typo ฝื่น → drug_opium
ok(A.drug_opium === true, 'ฝื่น(typo) → drug_opium')
// result/action (fix 2: startsWith suffix header)
ok(A.result_found === true, 'พบพฤติการณ์ → result_found')
ok(A.action_arrest === true, 'จับกุม → action_arrest')
// fix 5: col69 กระท่อม (≥52) ต้องถูก ignore → drug_kratom = false
ok(A.drug_kratom === false, 'col69 กระท่อม (ignore block) → drug_kratom = false')
// fiscal_year: ต.ค. 68 → ปีงบ 2569
ok(A.fiscal_year === 2569, `ต.ค. 68 → fy 2569 (ได้ ${A.fiscal_year})`)
ok(A.received_date === '2025-10-01', `received_date 2025-10-01 (ได้ ${A.received_date})`)
// PII ไม่เก็บ
ok(!('first_name' in A) && !('last_name' in A) && !('id_card' in A), 'ไม่มี PII fields')

// edge cases
ok(B.lat == null && B.district === 'เขตบางรัก', 'B: ไม่มี lat → ไม่ skip, district = เขตบางรัก')
ok(C.district == null && C.lat === 13.8, 'C: ไม่มี district แต่มี lat → ไม่ skip')
ok(Array.isArray(D.drug_others) && D.drug_others[0] === 'เคนมผง', 'D: อื่นๆ → drug_others array')
ok(D.beh_use_sell === true, 'D: เสพ/ค้า → beh_use_sell')
// fix 4: typo เขต E
ok(E.district === 'เขตราษฏร์บูรณะ', `E: typo ฎ→ฏ normalize (ได้ ${E.district})`)
// dedup + skip
ok(rows.length === 5, `parsed 5 (A-E, F dedup) (ได้ ${rows.length})`)
ok(stats.skipped >= 1, `skipped ≥ 1 (G ไม่มีวัน) (ได้ ${stats.skipped})`)
ok(stats.normalized === 1, `normalized 1 (E typo) (ได้ ${stats.normalized})`)

console.log(`\n${fail === 0 ? '✓ ผ่านทั้งหมด' : '✗ มี FAIL'} — pass ${pass} / fail ${fail}`)
process.exit(fail === 0 ? 0 : 1)
