// acceptance tests ของ parser รายงาน ปปส. (RPT_73_1/2/3, RPT_111_4/5)
// รัน: npm test
//
// ไฟล์ตัวอย่างจริงอยู่นอก repo (มี PII) — เทสจึงประกอบ workbook ขึ้นเองด้วย xlsx
// ให้มีครบทุกกับดักที่เจอในไฟล์จริง แล้วตรวจว่า parser จัดการถูก:
//   1) หัวคอลัมน์ 2 ชั้นแบบ merge + 1 เรคอร์ดกินหลายแถว
//   2) ตำแหน่งคอลัมน์เริ่มไม่ตรงกันระหว่างไฟล์ (73_1 เริ่ม B, 73_2/3 เริ่ม C)
//   3) "ผลการดำเนินการ" ซ้ำ 2 ที่ — ก่อน/หลังคอลัมน์ "หน่วยงาน"
//   4) หัวคอลัมน์มี \n และช่องว่างซ้อน
//   5) วันที่ พ.ศ. เสีย ("07/07/3112", "00/00/2543") และวันเกิดย้อนหลังหลายสิบปี
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseRptWorkbook, thaiDateToISO, splitRecord } from '../src/features/rpt/rptParser.js'

// สร้าง .xlsx จาก array-of-arrays + รายการ merge แล้วคืนเป็น ArrayBuffer
function buildWorkbook(aoa, merges = [], sheetName = 'SHEET') {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!merges'] = merges.map(([r1, c1, r2, c2]) => ({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return out
}

// หัวรายงานคัดมาจากไฟล์จริง — สังเกตว่า 73_3 เขียน "กลุ่ม 3:" ไม่มีคำว่า "ที่"
const TITLES = {
  '73_1': 'รายงานแสดงรายละเอียดของบุคคลผู้ถูกร้องเรียน กลุ่มที่ 1 บุคคลที่พบพฤติการณ์',
  '73_2': 'รายงานแสดงรายละเอียดของบุคคลผู้ถูกร้องเรียน กลุ่มที่ 2 มีตัวตน ไม่พบประวัติ',
  '73_3': 'รายงานแสดงรายละเอียดของบุคคลผู้ถูกร้องเรียน กลุ่ม 3: ยังพิสูจน์ทราบตัวตนไม่ได้',
  '111_4': 'รายงานแสดงรายละเอียดของพื้นที่ร้องเรียน กลุ่มที่ 4 สถานที่',
  '111_5': 'รายงานแสดงรายละเอียดของพื้นที่ร้องเรียน กลุ่มที่ 5 พื้นที่',
}

const HEAD = (reportId) => ([
  [null, TITLES[reportId], null, null, null, null, null, null, null, null, `Report ID: ${reportId}`],
  [null, 'ปปส. ภาค :', null, 'กทม.'],
  [null, 'จังหวัด : ', null, 'กรุงเทพมหานคร'],
  [null, 'อำเภอ : ', null, 'ทั้งหมด'],
  [null, 'ตำบล : ', null, 'ทั้งหมด'],
  [null, 'หน่วยงานนำเข้าข้อมูล : ', null, 'ศูนย์เฝ้าระวัง'],
  [null, 'วันที่พิมพ์ : ', null, '14/09/2569', null, null, 'เวลาพิมพ์ : ', null, null, null, '10:34:57'],
])

// ── ตระกูล 111 ─────────────────────────────────────────────────────────────
// คอลัมน์: A ว่าง | B ลำดับ | C เลขที่ร้องเรียน | D รายละเอียดที่อยู่ | E หมู่บ้าน | F ตำบล | G อำเภอ
//          H "ผลการดำเนินการ" เดี่ยว (= สถานะ, มาก่อนหน่วยงาน) | I ผลฯ/หน่วยงาน
//          J ผลฯ/วันที่ | K "ผลการดำเนินการ" เดี่ยวอีกครั้ง (= ผลการดำเนินงาน, มาหลังหน่วยงาน)
//          L ผลฯ/รายละเอียด
function build111() {
  const aoa = [
    ...HEAD('111_5'),
    [null, 'ลำดับที่', 'เลขที่ร้องเรียน', 'รายละเอียดที่อยู่', 'หมู่บ้าน', 'ตำบล', 'อำเภอ',
      'ผลการดำเนินการ', 'ผลการดำเนินการ', 'ผลการดำเนินการ', 'ผลการดำเนินการ', 'ผลการดำเนินการ'],
    [null, null, null, null, null, null, null,
      null, 'หน่วยงาน', 'วันที่', null, 'รายละเอียด'],
    // เรคอร์ด 1 กิน 2 แถว : ช่อง "รายละเอียด" มี 2 รายการ
    [null, 1, '2568102200021', 'ร้านซ่อมรถ', 'ชุมชนสวนอ้อย', 'พระโขนง', 'เขตคลองเตย',
      'ได้รับผล', 'สน.ท่าเรือ', '27/11/2568', 'จับกุม', 'ตรวจครั้งที่ 1'],
    [null, 1, null, null, null, null, null, null, null, null, null, 'ตรวจครั้งที่ 2'],
    // เรคอร์ด 2 : วันที่เสีย ต้องกลายเป็น null แต่เก็บค่าดิบไว้
    [null, 2, '2568102200022', 'ตลาดนัด', 'บางชัน', 'บางชัน', 'เขตคลองสามวา',
      'ได้รับผล', 'สน.บางชัน', '07/07/3112', 'ยุติเรื่อง', 'ไม่พบ'],
  ]
  // merge แนวตั้งของเรคอร์ด 1 (แถว 9-10 ใน 0-based) ให้เหมือนไฟล์จริง
  const merges = [
    [9, 1, 10, 1], [9, 2, 10, 2], [9, 3, 10, 3], [9, 4, 10, 4], [9, 5, 10, 5],
    [9, 6, 10, 6], [9, 7, 10, 7], [9, 8, 10, 8], [9, 9, 10, 9], [9, 10, 10, 10],
  ]
  return buildWorkbook(aoa, merges, 'RPT_111_5')
}

test('RPT_111: รวมแถวย่อยเป็นเรคอร์ดเดียว และนับจำนวนถูก', () => {
  const out = parseRptWorkbook(build111(), 'RPT_111_5.XLSX')
  assert.equal(out.reportId, '111_5')
  assert.equal(out.kind, 'place')
  assert.equal(out.records.length, 2, '3 แถวข้อมูล แต่เป็น 2 เรคอร์ด')
})

test('RPT_111: "ผลการดำเนินการ" ที่ซ้ำกัน แยกเป็นสถานะ/ผลการดำเนินงานตามตำแหน่ง', () => {
  const [r1] = parseRptWorkbook(build111(), 'RPT_111_5.XLSX').records
  assert.equal(r1.result_status, 'ได้รับผล', 'ตัวที่มาก่อน "หน่วยงาน" = สถานะ')
  assert.equal(r1.result_operation, 'จับกุม', 'ตัวที่มาหลัง "หน่วยงาน" = ผลการดำเนินงาน')
  assert.equal(r1.result_agency, 'สน.ท่าเรือ')
})

test('RPT_111: ช่องบรรยายที่มีหลายรายการถูกรวมด้วยขึ้นบรรทัดใหม่', () => {
  const [r1] = parseRptWorkbook(build111(), 'RPT_111_5.XLSX').records
  assert.equal(r1.result_detail, 'ตรวจครั้งที่ 1\nตรวจครั้งที่ 2')
})

test('RPT_111: วันที่ พ.ศ. เพี้ยนกลายเป็น null แต่เก็บค่าดิบและเตือน', () => {
  const out = parseRptWorkbook(build111(), 'RPT_111_5.XLSX')
  const r2 = out.records[1]
  assert.equal(r2.result_date, null)
  assert.equal(r2.result_date_raw, '07/07/3112')
  assert.ok(out.warnings.some((w) => w.includes('07/07/3112')), 'ต้องมี warning บอกแถวที่ผิด')
})

test('RPT_111: แปลงวันที่ พ.ศ. -> ค.ศ. ถูกต้อง', () => {
  const [r1] = parseRptWorkbook(build111(), 'RPT_111_5.XLSX').records
  assert.equal(r1.result_date, '2025-11-27')
})

// ── ตระกูล 73 ──────────────────────────────────────────────────────────────
// เริ่มที่คอลัมน์ C (เลื่อนจากตระกูล 111 หนึ่งช่อง) + หัวคอลัมน์มี \n และช่องว่างซ้อน
// + กลุ่มที่อยู่มีชั้นบน "ที่อยู่ปัจจุบัน/ที่อยู่ที่มีพฤติการณ์"
function build73() {
  const aoa = [
    ...HEAD('73_1'),
    [null, null, 'ลำดับที่', 'เลขที่ร้องเรียน', 'เลขที่บุคคล', 'ครั้ง   (ห้วง)', 'ชื่อ', 'นามสกุล',
      'เลขบัตรประชาชน', 'วดป เกิด',
      'ที่อยู่ปัจจุบัน/ที่อยู่ที่มีพฤติการณ์', 'ที่อยู่ปัจจุบัน/ที่อยู่ที่มีพฤติการณ์',
      'ส่งดำเนินการ\n(สปป/ปปส.ภาค)'],
    [null, null, null, null, null, null, null, null, null, null, 'ตำบล', 'อำเภอ', null],
    [null, null, 1, '2568100100033', '201605160092', 2, 'กตัญญู', 'รักเจริญ',
      '2540700013999', '05/11/2542', 'วังทองหลาง', 'เขตวังทองหลาง', 'ปปส.ภาค'],
    // วันเกิดย้อนหลังไกล — ต้องไม่ถูกตัดทิ้ง (บั๊กที่เจอตอนพัฒนา: ใช้ช่วงปีของวันที่ดำเนินการมาตรวจวันเกิด)
    [null, null, 2, '2568100100034', '201605160093', 1, 'สมชาย', 'ใจดี',
      '1100700013999', '31/05/2520', 'บางหว้า', 'เขตภาษีเจริญ', 'ปปส.ภาค'],
  ]
  return buildWorkbook(aoa, [], 'RPT_73_1')
}

test('RPT_73: แมปคอลัมน์ด้วยชื่อหัว ไม่ใช่ตำแหน่ง (ไฟล์เริ่มคอลัมน์ C)', () => {
  const out = parseRptWorkbook(build73(), 'RPT_73_1.XLSX')
  assert.equal(out.reportId, '73_1')
  assert.equal(out.kind, 'person')
  const [r1] = out.records
  assert.equal(r1.complaint_no, '2568100100033')
  assert.equal(r1.first_name, 'กตัญญู')
  assert.equal(r1.last_name, 'รักเจริญ')
  assert.equal(r1.national_id, '2540700013999')
})

test('RPT_73: หัวคอลัมน์ที่มี \\n และช่องว่างซ้อนยังแมปติด', () => {
  const [r1] = parseRptWorkbook(build73(), 'RPT_73_1.XLSX').records
  assert.equal(r1.send_to, 'ปปส.ภาค', 'หัว "ส่งดำเนินการ\\n(สปป/ปปส.ภาค)"')
  assert.equal(r1.report_count_period, 2, 'หัว "ครั้ง   (ห้วง)" มีช่องว่าง 3 ตัว')
})

test('RPT_73: กลุ่มที่อยู่ที่มีชั้นบนยาว ถอยไปแมปด้วยชื่อชั้นล่างได้', () => {
  const [r1] = parseRptWorkbook(build73(), 'RPT_73_1.XLSX').records
  assert.equal(r1.subdistrict, 'วังทองหลาง')
  assert.equal(r1.district, 'เขตวังทองหลาง')
})

test('RPT_73: วันเกิดย้อนหลังหลายสิบปีต้องไม่ถูกตัดทิ้ง', () => {
  const out = parseRptWorkbook(build73(), 'RPT_73_1.XLSX')
  assert.equal(out.records[0].birth_date, '1999-11-05')
  assert.equal(out.records[1].birth_date, '1977-05-31', 'พ.ศ. 2520 ยังเป็นวันเกิดที่ถูกต้อง')
  assert.equal(out.warnings.filter((w) => w.includes('ไม่ถูกต้อง')).length, 0,
    'ไม่ควรมี warning เรื่องวันที่ไม่ถูกต้อง')
})

test('RPT_73: record_uid ประกอบจาก report+เลขที่ร้องเรียน+เลขที่บุคคล และไม่ซ้ำ', () => {
  const out = parseRptWorkbook(build73(), 'RPT_73_1.XLSX')
  assert.equal(out.records[0].record_uid, '73_1|2568100100033|201605160092')
  assert.equal(new Set(out.records.map((r) => r.record_uid)).size, out.records.length)
})

// ── แยก PII ────────────────────────────────────────────────────────────────
test('splitRecord: ชื่อ/เลขบัตร/ที่อยู่/ข้อความบรรยาย ไปตาราง PII ไม่ปนกับตารางหลัก', () => {
  const [r1] = parseRptWorkbook(build73(), 'RPT_73_1.XLSX').records
  const { base, pii } = splitRecord(r1)
  for (const f of ['first_name', 'last_name', 'national_id', 'birth_date']) {
    assert.ok(pii[f] !== undefined, `${f} ต้องอยู่ใน pii`)
    assert.equal(base[f], undefined, `${f} ต้องไม่อยู่ใน base`)
  }
  assert.equal(base.record_uid, pii.record_uid, 'ทั้งสองตารางเชื่อมด้วย record_uid')
  assert.equal(base.district, 'เขตวังทองหลาง', 'เขต/แขวงไม่ใช่ PII — อยู่ตารางหลัก')
})

// ── ตรวจไฟล์ที่ไม่รองรับ ───────────────────────────────────────────────────
test('ไฟล์ที่ไม่ใช่รายงานทั้ง 5 ต้องโยน error ที่อ่านรู้เรื่อง', () => {
  const buf = buildWorkbook([['อะไรก็ไม่รู้'], ['1', '2']], [], 'Sheet1')
  assert.throws(() => parseRptWorkbook(buf, 'random.xlsx'), /ไม่รู้จักรายงานนี้/)
})

test('thaiDateToISO: ช่วงปีของวันเกิดกว้างกว่าวันที่ดำเนินการ', () => {
  assert.equal(thaiDateToISO('01/10/2568'), '2025-10-01')
  assert.equal(thaiDateToISO('31/05/2520'), null, 'ช่วง event ไม่รับ 2520')
  assert.equal(thaiDateToISO('31/05/2520', 'birth'), '1977-05-31')
  assert.equal(thaiDateToISO('00/00/2543', 'birth'), null, 'วัน/เดือน = 00 ใช้ไม่ได้')
  assert.equal(thaiDateToISO('07/07/3112'), null, 'ปีนอกช่วง')
  assert.equal(thaiDateToISO(''), null)
  assert.equal(thaiDateToISO(null), null)
})

// ── หัวข้อกลุ่ม 1-5 ที่หน้านำเข้าใช้เรียงช่อง ──────────────────────────────
test('REPORT_ORDER เรียงตามเลขกลุ่ม 1-5 และมีข้อมูลหัวข้อครบทุกกลุ่ม', async () => {
  const { REPORT_GROUPS, REPORT_ORDER } = await import('../src/features/rpt/rptParser.js')
  assert.deepEqual(REPORT_ORDER.map((id) => REPORT_GROUPS[id].no), [1, 2, 3, 4, 5])
  assert.deepEqual(REPORT_ORDER, ['73_1', '73_2', '73_3', '111_4', '111_5'])
  for (const id of REPORT_ORDER) {
    const g = REPORT_GROUPS[id]
    for (const k of ['no', 'kind', 'file', 'title', 'label', 'short']) {
      assert.ok(g[k], `กลุ่ม ${id} ขาดข้อมูล ${k}`)
    }
    // ชื่อไฟล์ที่บอกใบ้ในช่องต้องตรงกับ Report ID จริง ไม่งั้นคนจะหยิบไฟล์ผิด
    assert.equal(g.file, `RPT_${id}`)
  }
})

// ── หัวรายงานจากไฟล์ + วันที่ของข้อมูล ────────────────────────────────────
test('อ่านหัวรายงานจากแถวแรกของไฟล์ ไม่ใช่เดาจาก Report ID', () => {
  const out = parseRptWorkbook(build73(), 'RPT_73_1.XLSX')
  assert.equal(out.title, TITLES['73_1'])
  assert.ok(out.title.includes('กลุ่มที่ 1 บุคคลที่พบพฤติการณ์'))
  assert.equal(out.records[0].report_title, out.title, 'ทุกเรคอร์ดพกหัวรายงานติดไปด้วย')
})

test('วันที่พิมพ์รายงานถูกเก็บเป็น ISO และช่วงข้อมูลติดไปกับทุกเรคอร์ด', () => {
  const out = parseRptWorkbook(build111(), 'RPT_111_5.XLSX')
  assert.equal(out.params.printed_at, '14/09/2569')
  assert.equal(out.records[0].printed_at, '2026-09-14')
  assert.equal(out.records[0].period_label, out.params.period)
})

test('หัวรายงานที่ระบุกลุ่มไม่ตรงกับ Report ID ต้องเตือน', () => {
  // ไฟล์บอกว่าเป็น Report ID 73_1 (กลุ่ม 1) แต่หัวรายงานเขียนว่ากลุ่มที่ 3
  const aoa = [
    [null, 'รายงานแสดงรายละเอียดของบุคคลผู้ถูกร้องเรียน กลุ่มที่ 3 ยังพิสูจน์ทราบตัวตนไม่ได้',
      null, null, null, null, null, null, null, null, 'Report ID: 73_1'],
    ...HEAD('73_1').slice(1),
    [null, null, 'ลำดับที่', 'เลขที่ร้องเรียน', 'เลขที่บุคคล'],
    [null, null, null, null, null],
    [null, null, 1, '2568100100033', '201605160092'],
  ]
  const out = parseRptWorkbook(buildWorkbook(aoa, [], 'RPT_73_1'), 'RPT_73_1.XLSX')
  assert.ok(out.warnings.some((w) => w.includes('ไม่ได้ระบุว่าเป็นกลุ่ม 1')),
    'ต้องเตือนว่าหัวรายงานกับ Report ID ขัดกัน')
})

test('หัวรายงานที่เขียน "กลุ่ม 3:" (ไม่มีคำว่า "ที่") ต้องไม่ถูกเตือนผิด ๆ', () => {
  const aoa = [
    [null, 'รายงานแสดงรายละเอียดของบุคคลผู้ถูกร้องเรียน กลุ่ม 3: ยังพิสูจน์ทราบตัวตนไม่ได้',
      null, null, null, null, null, null, null, null, 'Report ID: 73_3'],
    ...HEAD('73_3').slice(1),
    [null, null, 'ลำดับที่', 'เลขที่ร้องเรียน', 'เลขที่บุคคล'],
    [null, null, null, null, null],
    [null, null, 1, '2568100100033', '201605160092'],
  ]
  const out = parseRptWorkbook(buildWorkbook(aoa, [], 'RPT_73_3'), 'RPT_73_3.XLSX')
  assert.equal(out.warnings.filter((w) => w.includes('หัวรายงาน')).length, 0)
})

test('ไฟล์ที่ไม่มีหัวรายงาน (RPT_111_5) เตือนแต่ยังนำเข้าได้', () => {
  const aoa = [
    [null, null, null, null, null, null, null, null, null, null, null, 'Report ID: 111_5'],
    ...HEAD('111_5').slice(1),
    [null, 'ลำดับที่', 'เลขที่ร้องเรียน'],
    [null, null, null],
    [null, 1, '2568102200021'],
  ]
  const out = parseRptWorkbook(buildWorkbook(aoa, [], 'RPT_111_5'), 'RPT_111_5.XLSX')
  assert.equal(out.title, null)
  assert.equal(out.records.length, 1, 'ยังนำเข้าได้ปกติ')
  assert.ok(out.warnings.some((w) => w.includes('ไม่มีหัวรายงาน')))
})

// ── ครบทุกช่องตามหัวคอลัมน์ในรายงาน ──────────────────────────────────────
// กันการ "อ่านได้แต่ลืมเก็บ" — เคยพลาดมาแล้ว 4 ช่อง (ภาพถ่าย/ตำแหน่ง/เลขที่หนังสือส่ง/รับ)
// ที่ FIELD_MAP อ่านออกแต่ไม่อยู่ใน BASE_FIELDS จึงไม่เคยถูกบันทึกลงฐาน
test('ทุกฟิลด์ที่ FIELD_MAP อ่านได้ ต้องถูกเก็บลงฐาน (BASE_FIELDS หรือ PII_FIELDS)', async () => {
  const fs = await import('node:fs')
  const url = new URL('../src/features/rpt/rptParser.js', import.meta.url)
  const src = fs.readFileSync(url, 'utf8')

  const mapped = new Set(
    [...src.matchAll(/^\s*'[^']+':\s*'(\w+)',/gm)].map((m) => m[1]),
  )
  const base = new Set(
    src.match(/const BASE_FIELDS = \[([\s\S]*?)\n\]/)[1]
      .match(/'(\w+)'/g).map((x) => x.replace(/'/g, '')),
  )
  const { PII_FIELDS } = await import('../src/features/rpt/rptParser.js')
  const stored = new Set([...base, ...PII_FIELDS])

  const missing = [...mapped].filter((f) => !stored.has(f))
  assert.deepEqual(missing, [],
    `ฟิลด์เหล่านี้อ่านได้แต่ไม่ถูกเก็บ: ${missing.join(', ')}`)
})
