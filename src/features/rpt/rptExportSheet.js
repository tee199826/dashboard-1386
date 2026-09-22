// rptExportSheet — ประกอบไฟล์ Excel ของหน้า /rpt-entry
// แยกจาก rptEntryService เพราะไฟล์นี้ "ไม่ต่อฐานข้อมูล" จึงเทสใน node ได้ตรง ๆ
// (เทสสร้างไฟล์จริงแล้วเปิดอ่านกลับ ตรวจว่าหัวคอลัมน์ครบและ dropdown ติดจริง)
import ExcelJS from 'exceljs'
import { REPORT_GROUPS } from "./rptParser.js"
import {
  BKN_OPTIONS, ALL_STATIONS, AREA_GROUP_OPTIONS,
  PLACE_TYPE_OPTIONS, PERSON_CATEGORY_OPTIONS, OFFICIAL_TYPE_OPTIONS,
  isResultReceived,
} from "./rptEntryOptions.js"

// คอลัมน์ "ครบตามหัวรายงาน ปปส." เรียงลำดับเหมือนไฟล์ต้นฉบับ แล้วต่อด้วยช่องที่ต้องกรอกเอง
// [หัวคอลัมน์, คีย์ในข้อมูล, ตัวเลือก dropdown (ถ้ามี), ความกว้าง]
const F = (header, key, opts = {}) => ({ header, key, ...opts })

// ส่วนที่มาจากรายงาน — ชื่อหัวคอลัมน์ใช้คำเดียวกับในไฟล์ .XLSX ต้นฉบับ
const REPORT_COLUMNS = [
  F('กลุ่ม', 'report_id', { get: (r) => REPORT_GROUPS[r.report_id]?.short || r.report_id, width: 16 }),
  F('ลำดับที่', 'seq', { width: 8 }),
  F('แหล่งข่าว', 'source', { width: 16 }),
  F('เลขที่ร้องเรียน', 'complaint_no', { width: 16 }),
  F('ภาพถ่าย', 'photo', { width: 10 }),
  F('เลขที่บุคคล', 'person_no', { width: 14 }),
  F('ครั้ง (ทั้งหมด)', 'report_count', { width: 10 }),
  F('ครั้ง (ห้วง)', 'report_count_period', { width: 10 }),
  F('ประเภทบุคคล', 'person_type', { width: 12 }),
  F('เพศ', 'gender', { width: 8 }),
  F('ชื่อ', 'first_name', { width: 16 }),
  F('นามสกุล', 'last_name', { width: 18 }),
  F('ชื่ออื่นๆ', 'aka', { width: 20 }),
  F('อาชีพ', 'occupation', { width: 18 }),
  F('ตำแหน่ง', 'position', { width: 12 }),
  F('เลขบัตรประชาชน', 'national_id', { width: 16 }),
  F('วดป เกิด', 'birth_date', { get: (r) => r.birth_date || r.birth_date_raw, width: 12 }),
  F('ที่อยู่ตาม ทร. 14', 'addr_house_reg', { width: 40 }),
  F('รายละเอียดที่อยู่', 'addr_detail', { width: 40 }),
  F('ชุมชน (ในไฟล์)', 'src_community', { width: 16 }),
  F('หมู่บ้าน', 'src_village', { width: 18 }),
  F('ตำบล/แขวง', 'subdistrict', { width: 16 }),
  F('อำเภอ/เขต', 'district', { width: 16 }),
  F('จังหวัด', 'province', { width: 14 }),
  F('บทบาท', 'role', { width: 16 }),
  F('ส่งดำเนินการ (สปป/ปปส.ภาค)', 'send_to', { width: 16 }),
  F('ปปส. ภาค', 'ppsm_region', { width: 10 }),
  F('ระดับความเร่งด่วน', 'urgency', { width: 12 }),
  F('ยาเสพติด', 'drug_types', { width: 16 }),
  F('ประเภทพื้นที่', 'area_type', { width: 18 }),
  F('รายละเอียดพื้นที่', 'area_detail', { width: 50 }),
  F('การรับเรื่อง / การดำเนินการ', 'recv_action', { width: 14 }),
  F('การรับเรื่อง / วันที่รับเรื่อง', 'recv_date', { width: 12 }),
  F('การส่งตรวจสอบ / หน่วยงาน', 'send_agency', { width: 16 }),
  F('การส่งตรวจสอบ / เลขที่หนังสือส่ง', 'send_doc_no', { width: 14 }),
  F('การส่งตรวจสอบ / วันที่', 'send_date', { width: 12 }),
  F('ผลการดำเนินการ (สถานะ)', 'result_status', {
    get: (r) => (isResultReceived(r) ? (r.result_status || 'ได้รับผล') : 'ยังไม่ได้รับผล'),
    width: 14,
  }),
  F('ผลการดำเนินการ / หน่วยงาน', 'result_agency', { width: 16 }),
  F('ผลการดำเนินการ / เลขที่หนังสือรับ', 'result_doc_no', { width: 14 }),
  F('ผลการดำเนินการ / วันที่', 'result_date', { width: 12 }),
  F('ผลการดำเนินการ / พฤติการณ์', 'result_behavior', { width: 18 }),
  F('ผลการดำเนินการ / วันที่ดำเนินการ', 'result_action_date', { width: 12 }),
  F('ผลการดำเนินการ / พฤติการณ์ยาเสพติด', 'drug_behavior', { width: 14 }),
  F('ผลการดำเนินการ / มาตรการต่อบุคคล', 'person_measure', { width: 16 }),
  F('ผลการดำเนินการ / ผลการดำเนินงาน', 'result_operation', { width: 14 }),
  F('ผลการดำเนินการ / รายละเอียด', 'result_detail', { width: 50 }),
  F('รายละเอียดพฤติการณ์', 'behavior_detail', { width: 50 }),
  F('เอกสารแนบ', 'has_attachment', { get: (r) => (r.has_attachment ? 'มี' : ''), width: 10 }),
  F('หัวรายงาน', 'report_title', { width: 44 }),
  F('ช่วงข้อมูล', 'period_label', { width: 20 }),
  F('วันที่พิมพ์รายงาน', 'printed_at', { width: 12 }),
]

// สถานะการกรอก — เก็บในฐานเป็น draft/done แต่ในไฟล์ใช้คำไทยให้คนอ่านรู้เรื่อง
const ENTRY_STATUS_TH = { empty: 'ยังไม่กรอก', draft: 'กรอกค้าง', done: 'กรอกครบ' }

// ── ช่องที่ต้องกรอกเอง — ใส่ dropdown ให้ทุกช่องที่มีตัวเลือกตายตัว ──────────
const ENTRY_COLUMNS = [
  F('ละติจูด', 'lat', { get: (r) => (r.lat == null ? '' : Number(r.lat)), width: 12 }),
  F('ลองจิจูด', 'lng', { get: (r) => (r.lng == null ? '' : Number(r.lng)), width: 12 }),
  F('ที่มาของพิกัด', 'geo_note', { width: 22 }),
  F('ชุมชน (กรอก)', 'community', { width: 22 }),
  F('เลขที่/รหัส NISPA', 'nispa_code', { width: 16 }),
  F('บก.น.', 'bkn', { list: BKN_OPTIONS, width: 12 }),
  F('สน.', 'police_station', { list: ALL_STATIONS, width: 16 }),
  F('กลุ่มพื้นที่', 'area_group', { list: AREA_GROUP_OPTIONS, width: 16 }),
  F('ประเภทสถานที่', 'place_type', { list: PLACE_TYPE_OPTIONS, width: 26 }),
  F('ระบุประเภทสถานที่ (ถ้าเลือกอื่นๆ)', 'place_type_other', { width: 20 }),
  F('ประเภทบุคคล', 'person_category', { list: PERSON_CATEGORY_OPTIONS, width: 14 }),
  F('ประเภท จนท.รัฐ', 'official_types', {
    get: (r) => (r.official_types || []).join(', '),
    list: OFFICIAL_TYPE_OPTIONS, width: 18,
  }),
  F('ระบุประเภท จนท.รัฐ (ถ้าเลือกอื่นๆ)', 'official_type_other', { width: 20 }),
  F('หมายเหตุ', 'note', { width: 30 }),
  F('สถานะกรอก', 'status', {
    get: (r) => ENTRY_STATUS_TH[r.status] || ENTRY_STATUS_TH.empty,
    list: Object.values(ENTRY_STATUS_TH), width: 12,
  }),
]

const ALL_COLUMNS = [...REPORT_COLUMNS, ...ENTRY_COLUMNS]
// แถวหัวตาราง = 6 บรรทัดหัวเรื่อง + 1 บรรทัดว่าง + 1
// ค่านี้ใช้ภายนอก (เทส/ผู้เรียก) ส่วนในฟังก์ชันอ้าง headerRow.number จริงเสมอ
// และมีเทสยืนยันว่าสองค่านี้ตรงกัน — เผื่อวันหน้ามีคนเพิ่ม/ลดบรรทัดหัวเรื่อง
const HEADER_ROW = 8

// ExcelJS ใส่ dropdown ด้วย formula ที่ยาวได้ไม่เกิน 255 ตัวอักษร
// รายชื่อ สน. 88 แห่งยาวเกินแน่นอน จึงต้องพักไว้ในชีตแยกแล้วอ้างเป็นช่วงเซลล์
function writeOptionSheet(wb) {
  const ws = wb.addWorksheet('ตัวเลือก')
  const ranges = {}
  let col = 1
  for (const c of ENTRY_COLUMNS) {
    if (!c.list) continue
    const letter = ws.getColumn(col).letter
    ws.getCell(1, col).value = c.header
    c.list.forEach((v, i) => { ws.getCell(i + 2, col).value = v })
    ranges[c.key] = `=ตัวเลือก!$${letter}$2:$${letter}$${c.list.length + 1}`
    ws.getColumn(col).width = 24
    col++
  }
  ws.getRow(1).font = { bold: true }
  ws.state = 'hidden'          // ซ่อนไว้ไม่ให้รก แต่ dropdown ยังอ้างถึงได้
  return ranges
}

/** ประกอบ workbook จากแถวที่ดึงมาแล้ว — คืน Blob พร้อมดาวน์โหลด */
export async function buildExportWorkbook(rows, meta = {}) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('ข้อมูลร้องเรียน')
  const ranges = writeOptionSheet(wb)
  ws.addRow(['ข้อมูลเรื่องร้องเรียน ปปส. — ครบทุกช่องตามรายงาน พร้อมช่องกรอกข้อมูลภาคสนาม'])
  ws.getRow(1).font = { bold: true, size: 14 }
  ws.addRow([`ตัวกรอง: ${meta.filterLabel || 'ทั้งหมด'}`])
  ws.addRow([`จำนวน: ${rows.length} รายการ · ส่งออกเมื่อ ${new Date().toLocaleString('th-TH')}`])
  ws.addRow([`ช่วงข้อมูล: ${rows[0]?.period_label || '—'}`])
  ws.addRow(['ช่องตั้งแต่ "ละติจูด" เป็นต้นไป คือช่องที่ต้องกรอกเอง — ช่องที่มีลูกศรเลือกจากรายการได้'])
  ws.getRow(5).font = { italic: true, color: { argb: 'FF64748B' } }
  ws.addRow(['⚠️ ไฟล์นี้มีชื่อ-เลขบัตร-ที่อยู่ของบุคคล ห้ามส่งต่อนอกหน่วยงาน'])
  ws.getRow(6).font = { bold: true, color: { argb: 'FFB91C1C' } }
  ws.addRow([])

  const headerRow = ws.addRow(ALL_COLUMNS.map((c) => c.header))
  const hr = headerRow.number            // เลขแถวหัวตารางจริง
  headerRow.eachCell((cell, i) => {
    const isEntry = i > REPORT_COLUMNS.length
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid',
      fgColor: { argb: isEntry ? 'FF1D4ED8' : 'FF334155' } }   // ช่องกรอกเองใช้สีน้ำเงินให้แยกออก
    cell.alignment = { vertical: 'middle', wrapText: true }
  })
  headerRow.height = 32

  // ย้อมสีช่องผล: ได้รับผลแล้ว = ฟ้า, ยังไม่ได้รับผล = แดง
  // (ยังไม่ได้รับผล = ช่องพฤติการณ์จะว่าง ต้องมองออกทันทีว่าแถวไหนยังรออยู่)
  const COL_STATUS = ALL_COLUMNS.findIndex((c) => c.key === 'result_status') + 1
  const COL_BEHAVIOR = ALL_COLUMNS.findIndex((c) => c.key === 'result_behavior') + 1

  for (const r of rows) {
    const row = ws.addRow(ALL_COLUMNS.map((c) => (c.get ? c.get(r) : r[c.key]) ?? ''))
    const received = isResultReceived(r)
    const font = { bold: true, color: { argb: received ? 'FF0369A1' : 'FFDC2626' } }
    row.getCell(COL_STATUS).font = font
    row.getCell(COL_BEHAVIOR).font = font
    if (!received) row.getCell(COL_BEHAVIOR).value = 'รอผลตรวจสอบ'
  }

  ALL_COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width || 14 })

  // ใส่ dropdown ให้ทุกแถวข้อมูล (เผื่อแถวว่างอีก 200 แถวสำหรับเพิ่มเอง)
  const lastRow = hr + Math.max(rows.length, 1) + 200
  ENTRY_COLUMNS.forEach((c, i) => {
    if (!c.list) return
    const col = REPORT_COLUMNS.length + i + 1
    // เริ่มที่แถวข้อมูลแถวแรก (hr + 1) — ห้ามใส่ทับแถวหัวตาราง
    for (let r = hr + 1; r <= lastRow; r++) {
      ws.getCell(r, col).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [ranges[c.key]],
        // ไม่บังคับ — "ประเภท จนท.รัฐ" เลือกได้หลายค่า ต้องพิมพ์คั่นด้วย , เองได้
        showErrorMessage: false,
      }
    }
  })

  ws.views = [{ state: 'frozen', xSplit: 4, ySplit: hr }]
  ws.autoFilter = {
    from: { row: hr, column: 1 },
    to: { row: hr, column: ALL_COLUMNS.length },
  }

  return wb.xlsx.writeBuffer()
}

export { ALL_COLUMNS, REPORT_COLUMNS, ENTRY_COLUMNS, HEADER_ROW, ENTRY_STATUS_TH }
