// acceptance tests ของไฟล์ Excel ที่หน้า /rpt-entry ส่งออก
// รัน: npm test
//
// เทสสร้างไฟล์จริงด้วย ExcelJS แล้ว "เปิดอ่านกลับ" เพื่อยืนยันว่า
//   1) หัวคอลัมน์ครบทุกช่องตามหัวรายงาน ปปส. ไม่ตกหล่น
//   2) ช่องที่ต้องกรอกมี dropdown ติดจริง (data validation ชี้ไปที่ชีตตัวเลือก)
//   3) ค่าที่เขียนลงไปตรงกับข้อมูลต้นทาง
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import {
  buildExportWorkbook, ALL_COLUMNS, REPORT_COLUMNS, ENTRY_COLUMNS, HEADER_ROW,
} from '../src/features/rpt/rptExportSheet.js'

// แถวตัวอย่างในรูปแบบเดียวกับที่ rpt_export_rows คืนมา (รวม 3 ตารางเป็นก้อนเดียว)
const ROW = {
  record_uid: '73_1|2568100100033|201605160092',
  report_id: '73_1', seq: 1, source: 'ทางรัฐ', complaint_no: '2568100100033',
  person_no: '201605160092', report_count: 1, report_count_period: 1,
  person_type: 'ทั่วไป', gender: 'ชาย', occupation: 'ไม่ทราบ/ไม่ระบุอาชีพ',
  first_name: 'กตัญญู', last_name: 'รักเจริญ', aka: 'ไมค์',
  national_id: '2540700013999', birth_date: '1999-11-05',
  addr_house_reg: '255/4 ทะเบียนบ้านกลาง', addr_detail: 'ชอยจำนียน หลังการประปา',
  src_village: 'วังทองหลาง', subdistrict: 'วังทองหลาง', district: 'เขตวังทองหลาง',
  province: 'กรุงเทพมหานคร', role: 'ผู้เสพ, ผู้ค้า', ppsm_region: 'กทม.',
  result_status: 'ได้รับผล', result_agency: 'สน.วังทองหลาง',
  result_behavior: 'พิสูจน์ทราบไม่ได้/ไม่อยู่ในพื้นที่', has_attachment: true,
  report_title: 'รายงานแสดงรายละเอียดของบุคคลผู้ถูกร้องเรียน กลุ่มที่ 1 บุคคลที่พบพฤติการณ์',
  period_label: '01 ต.ค. 68-31 ธ.ค. 68', printed_at: '2026-09-14',
  // ช่องที่กรอกเอง
  lat: 13.7563, lng: 100.5018, bkn: 'บก.น.4', police_station: 'วังทองหลาง',
  area_group: 'กรุงเทพกลาง', place_type: 'บ้านพักอาศัย',
  person_category: 'เจ้าหน้าที่รัฐ', official_types: ['ตำรวจ', 'ครู'], status: 'done',
}

async function buildAndRead(rows = [ROW], meta = { filterLabel: 'ทดสอบ' }) {
  const buf = await buildExportWorkbook(rows, meta)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  return wb
}

test('หัวคอลัมน์ในไฟล์ครบทุกช่อง และเรียงตามหัวรายงาน', async () => {
  const wb = await buildAndRead()
  const ws = wb.getWorksheet('ข้อมูลร้องเรียน')
  const header = ws.getRow(HEADER_ROW).values.slice(1)
  assert.equal(header.length, ALL_COLUMNS.length)
  assert.deepEqual(header, ALL_COLUMNS.map((c) => c.header))
})

test('มีหัวคอลัมน์ที่เคยตกหล่นครบ (ภาพถ่าย/ตำแหน่ง/เลขที่หนังสือส่ง/รับ)', async () => {
  const wb = await buildAndRead()
  const header = wb.getWorksheet('ข้อมูลร้องเรียน').getRow(HEADER_ROW).values.slice(1)
  for (const h of ['ภาพถ่าย', 'ตำแหน่ง',
    'การส่งตรวจสอบ / เลขที่หนังสือส่ง', 'ผลการดำเนินการ / เลขที่หนังสือรับ']) {
    assert.ok(header.includes(h), `ไฟล์ต้องมีคอลัมน์ "${h}"`)
  }
})

test('ค่าที่เขียนลงแถวข้อมูลตรงกับต้นทาง', async () => {
  const wb = await buildAndRead()
  const ws = wb.getWorksheet('ข้อมูลร้องเรียน')
  const header = ws.getRow(HEADER_ROW).values.slice(1)
  const row = ws.getRow(HEADER_ROW + 1)
  const at = (h) => row.getCell(header.indexOf(h) + 1).value

  assert.equal(at('เลขที่ร้องเรียน'), '2568100100033')
  assert.equal(at('ชื่อ'), 'กตัญญู')
  assert.equal(at('เลขบัตรประชาชน'), '2540700013999', 'เลขบัตรออกเต็ม ไม่ปิดบัง')
  assert.equal(at('ละติจูด'), 13.7563)
  assert.equal(at('สน.'), 'วังทองหลาง')
  assert.equal(at('ประเภท จนท.รัฐ'), 'ตำรวจ, ครู', 'หลายค่ารวมด้วย , ')
  assert.equal(at('เอกสารแนบ'), 'มี')
  assert.equal(at('สถานะกรอก'), 'กรอกครบ')
})

test('ช่องที่กรอกเองมี dropdown ติดจริง และชี้ไปชีตตัวเลือก', async () => {
  const wb = await buildAndRead()
  const ws = wb.getWorksheet('ข้อมูลร้องเรียน')
  const withList = ENTRY_COLUMNS.filter((c) => c.list)
  assert.ok(withList.length >= 6, 'ต้องมีช่อง dropdown อย่างน้อย 6 ช่อง')

  for (const c of withList) {
    const col = REPORT_COLUMNS.length + ENTRY_COLUMNS.indexOf(c) + 1
    const dv = ws.getCell(HEADER_ROW + 1, col).dataValidation
    assert.ok(dv, `คอลัมน์ "${c.header}" ต้องมี dropdown`)
    assert.equal(dv.type, 'list')
    assert.match(dv.formulae[0], /ตัวเลือก!/, `"${c.header}" ต้องอ้างชีตตัวเลือก`)
  }
})

test('ชีตตัวเลือกถูกซ่อน และมีรายชื่อ สน. ครบ 88 แห่ง', async () => {
  const wb = await buildAndRead()
  const ws = wb.getWorksheet('ตัวเลือก')
  assert.ok(ws, 'ต้องมีชีตตัวเลือก')
  assert.equal(ws.state, 'hidden')

  const stationCol = ENTRY_COLUMNS.filter((c) => c.list).findIndex((c) => c.key === 'police_station') + 1
  assert.equal(ws.getCell(1, stationCol).value, 'สน.')
  const stations = []
  for (let r = 2; ; r++) {
    const v = ws.getCell(r, stationCol).value
    if (!v) break
    stations.push(v)
  }
  assert.equal(stations.length, 88, 'สน. ต้องครบ 88 แห่ง')
})

test('dropdown ครอบคลุมแถวว่างเผื่อไว้ให้กรอกเพิ่ม', async () => {
  const wb = await buildAndRead()
  const ws = wb.getWorksheet('ข้อมูลร้องเรียน')
  const bknIdx = ENTRY_COLUMNS.findIndex((c) => c.key === 'bkn')
  const col = REPORT_COLUMNS.length + bknIdx + 1
  // มีข้อมูล 1 แถว แต่ต้องใส่ validation เผื่อแถวว่างอีก 200 แถว
  assert.ok(ws.getCell(HEADER_ROW + 150, col).dataValidation, 'แถวว่างต้องมี dropdown ด้วย')
})

test('ไฟล์เปล่า (ไม่มีข้อมูล) ยังสร้างได้ ไม่พัง', async () => {
  const wb = await buildAndRead([], {})
  const ws = wb.getWorksheet('ข้อมูลร้องเรียน')
  assert.equal(ws.getRow(HEADER_ROW).values.slice(1).length, ALL_COLUMNS.length)
})

test('HEADER_ROW ตรงกับแถวหัวตารางจริงในไฟล์', async () => {
  const wb = await buildAndRead()
  const ws = wb.getWorksheet('ข้อมูลร้องเรียน')
  // หาแถวแรกที่มีเซลล์ครบเท่าจำนวนคอลัมน์ = แถวหัวตาราง
  let found = 0
  ws.eachRow((row, n) => {
    if (!found && row.values.slice(1).length === ALL_COLUMNS.length) found = n
  })
  assert.equal(found, HEADER_ROW, 'ถ้าเพิ่ม/ลดบรรทัดหัวเรื่อง ต้องแก้ HEADER_ROW ตาม')
})

test('แถวหัวตารางต้องไม่มี dropdown ติดอยู่', async () => {
  const wb = await buildAndRead()
  const ws = wb.getWorksheet('ข้อมูลร้องเรียน')
  const bknCol = REPORT_COLUMNS.length + ENTRY_COLUMNS.findIndex((c) => c.key === 'bkn') + 1
  assert.equal(ws.getCell(HEADER_ROW, bknCol).dataValidation, undefined)
  assert.ok(ws.getCell(HEADER_ROW + 1, bknCol).dataValidation, 'แถวข้อมูลแรกต้องมี')
})

// ── ย้อมสีช่องผลการดำเนินการ ──────────────────────────────────────────────
const BLUE = 'FF0369A1'
const RED = 'FFDC2626'

function cellOf(ws, header, rowNo) {
  const head = ws.getRow(HEADER_ROW).values.slice(1)
  return ws.getRow(rowNo).getCell(head.indexOf(header) + 1)
}

test('ได้รับผลแล้ว → ช่องสถานะและพฤติการณ์เป็นสีฟ้า', async () => {
  const wb = await buildAndRead([{ ...ROW, result_status: 'ได้รับผล', result_behavior: 'พบพฤติการณ์' }])
  const ws = wb.getWorksheet('ข้อมูลร้องเรียน')
  const status = cellOf(ws, 'ผลการดำเนินการ (สถานะ)', HEADER_ROW + 1)
  const behavior = cellOf(ws, 'ผลการดำเนินการ / พฤติการณ์', HEADER_ROW + 1)
  assert.equal(status.value, 'ได้รับผล')
  assert.equal(status.font.color.argb, BLUE)
  assert.equal(behavior.value, 'พบพฤติการณ์')
  assert.equal(behavior.font.color.argb, BLUE)
})

test('ยังไม่ได้รับผล → เป็นตัวอักษรสีแดง และบอกว่ารอผลอยู่', async () => {
  const wb = await buildAndRead([{ ...ROW, result_status: null, result_behavior: null }])
  const ws = wb.getWorksheet('ข้อมูลร้องเรียน')
  const status = cellOf(ws, 'ผลการดำเนินการ (สถานะ)', HEADER_ROW + 1)
  const behavior = cellOf(ws, 'ผลการดำเนินการ / พฤติการณ์', HEADER_ROW + 1)
  assert.equal(status.value, 'ยังไม่ได้รับผล')
  assert.equal(status.font.color.argb, RED)
  assert.equal(behavior.value, 'รอผลตรวจสอบ')
  assert.equal(behavior.font.color.argb, RED)
})

test('กลุ่ม 4 ที่ไม่มีคอลัมน์สถานะในไฟล์ แต่มีพฤติการณ์ ต้องนับว่าได้รับผล', async () => {
  // RPT_111_4 ไม่มีคอลัมน์ "ได้รับผล" เลย — ถ้าดูแค่ช่องสถานะจะขึ้นแดงผิดทั้งกลุ่ม
  const wb = await buildAndRead([{
    report_id: '111_4', seq: 1, complaint_no: 'X',
    result_status: null, result_behavior: 'ไม่พบพฤติการณ์', result_operation: 'ยุติเรื่อง',
  }])
  const ws = wb.getWorksheet('ข้อมูลร้องเรียน')
  const status = cellOf(ws, 'ผลการดำเนินการ (สถานะ)', HEADER_ROW + 1)
  assert.equal(status.value, 'ได้รับผล')
  assert.equal(status.font.color.argb, BLUE)
})

test('พฤติการณ์เป็น "-" ถือว่ายังไม่ได้รับผล', async () => {
  const wb = await buildAndRead([{ ...ROW, result_status: null, result_behavior: '-' }])
  const ws = wb.getWorksheet('ข้อมูลร้องเรียน')
  assert.equal(cellOf(ws, 'ผลการดำเนินการ (สถานะ)', HEADER_ROW + 1).font.color.argb, RED)
})
