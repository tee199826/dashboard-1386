// exportAreaStats.js — Excel "สถิติรายพื้นที่" ของ /radar (เขต / แขวง / ชุมชน) — 1 ครั้ง = 1 แถว drug_incidents
// รับแถวที่กรองตาม view ปัจจุบันแล้ว (ตัวเลขตรงกับ panel บนจอ) ; จัด format ให้อ่านง่าย: header เข้ม, freeze, filter, เรียงมาก→น้อย
import ExcelJS from 'exceljs'
import { downloadBlob, XLSX_MIME } from "./downloadBlob.js"
import { formatThaiDate } from "../utils/heroMeta.js"
import { DRUG_FLAGS } from "../data/drugFlags.js"
import { aggregateAreas, BEHAVIOR_LABELS, isBkkDistrict } from "../geo/areaStats.js"

const DRUG_NAMES = DRUG_FLAGS.map(([, name]) => name)
const HEADER_FILL = 'FF1E293B'   // slate-800
const SUB_FILL = 'FFF1F5F9'      // slate-100
const BORDER = { style: 'thin', color: { argb: 'FFCBD5E1' } }

function nowLabel() {
  const d = new Date()
  return `${formatThaiDate(d.toISOString().slice(0, 10))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// เขียน sheet 1 ระดับ — meta 3 บรรทัด + header 2 ชั้น (กลุ่มคอลัมน์) + data
function writeLevelSheet(wb, { name, areas, levelCols, meta }) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 6 }] })
  meta.forEach((line) => { const r = ws.addRow([line]); r.font = { size: 11, color: { argb: 'FF475569' } } })
  ws.getRow(1).font = { bold: true, size: 13, color: { argb: 'FF0F172A' } }
  ws.addRow([])

  const header = ['ลำดับ', ...levelCols, 'กลุ่มโซน', 'จำนวนครั้ง', ...BEHAVIOR_LABELS, ...DRUG_NAMES, 'ยาอื่น', 'ล่าสุด']
  // แถวกลุ่มคอลัมน์ (ชั้นบน) — merge ช่วง พฤติการณ์ / ชนิดยา
  const groupRow = ws.addRow(header.map(() => ''))
  const behStart = 1 + levelCols.length + 3, behEnd = behStart + BEHAVIOR_LABELS.length - 1
  const drugStart = behEnd + 1, drugEnd = drugStart + DRUG_NAMES.length
  groupRow.getCell(behStart).value = 'พฤติการณ์ (ครั้ง)'
  groupRow.getCell(drugStart).value = 'ชนิดยาที่ร้องเรียน (ครั้ง — 1 เรื่องอาจมีหลายชนิด)'
  ws.mergeCells(groupRow.number, behStart, groupRow.number, behEnd)
  ws.mergeCells(groupRow.number, drugStart, groupRow.number, drugEnd)
  groupRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUB_FILL } }
    cell.font = { bold: true, size: 10, color: { argb: 'FF334155' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
  })

  const headerRow = ws.addRow(header)
  headerRow.height = 22
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
  })

  const levelKeys = { เขต: 'district', แขวง: 'subdistrict', ชุมชน: 'community' }
  areas.forEach((a, i) => {
    const others = Object.entries(a.drugs).filter(([n]) => !DRUG_NAMES.includes(n)).map(([n, c]) => `${n} (${c})`).join(', ')
    const values = [
      i + 1,
      ...levelCols.map((c) => a[levelKeys[c]] || '-'),
      a.zone || '-',
      a.total,
      ...BEHAVIOR_LABELS.map((b) => a.beh[b] || 0),
      ...DRUG_NAMES.map((d) => a.drugs[d] || 0),
      others || '',
      a.latest ? formatThaiDate(a.latest) : '',
    ]
    const row = ws.addRow(values)
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
      if (typeof cell.value === 'number') {
        cell.numFmt = '#,##0'
        cell.alignment = { horizontal: 'right' }
        if (cell.value === 0 && col > 1) cell.font = { color: { argb: 'FF94A3B8' } }   // 0 จาง ๆ ให้ตัวเลขจริงเด่น
      }
      if (col === behStart - 1) cell.font = { bold: true, color: { argb: 'FFBE123C' } }   // จำนวนครั้ง = rose-700
    })
    if (i % 2 === 1) row.eachCell({ includeEmpty: true }, (cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } } })
  })

  // แถวรวม
  const totalRow = ws.addRow([
    '', ...levelCols.map((_, i) => (i === 0 ? 'รวม' : '')), `${areas.length.toLocaleString()} พื้นที่`,
    areas.reduce((s, a) => s + a.total, 0),
    ...BEHAVIOR_LABELS.map((b) => areas.reduce((s, a) => s + (a.beh[b] || 0), 0)),
    ...DRUG_NAMES.map((d) => areas.reduce((s, a) => s + (a.drugs[d] || 0), 0)),
    '', '',
  ])
  totalRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUB_FILL } }
    cell.border = { top: { style: 'medium', color: { argb: 'FF1E293B' } }, bottom: BORDER, left: BORDER, right: BORDER }
    if (typeof cell.value === 'number') { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'right' } }
  })

  ws.autoFilter = { from: { row: headerRow.number, column: 1 }, to: { row: headerRow.number + areas.length, column: header.length } }
  // ความกว้าง: ชื่อพื้นที่กว้าง, ตัวเลขแคบ
  header.forEach((h, i) => {
    const col = ws.getColumn(i + 1)
    if (h === 'ลำดับ') col.width = 7
    else if (levelCols.includes(h)) col.width = h === 'ชุมชน' ? 34 : 20
    else if (h === 'กลุ่มโซน') col.width = 16
    else if (h === 'จำนวนครั้ง') col.width = 12
    else if (h === 'ยาอื่น') col.width = 24
    else if (h === 'ล่าสุด') col.width = 14
    else col.width = Math.max(8, Math.min(14, h.length + 3))
  })
  return ws
}

/**
 * export สถิติรายพื้นที่ 3 ระดับ (เขต/แขวง/ชุมชน) + sheet สรุป
 * @param {object} opts
 *   - rows: แถว drug_incidents ที่กรองตาม view แล้ว
 *   - periodLabel / filterLabel: ข้อความสรุปตัวกรองที่ใช้ (ลง meta)
 */
export async function exportAreaStats({ rows = [], periodLabel = 'ทั้งหมด', filterLabel = 'ทั้งหมด', filenamePrefix = 'radar-area-stats' } = {}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = '1386 Dashboard'
  wb.created = new Date()

  const byDistrict = aggregateAreas(rows, 'district')
  const bySub = aggregateAreas(rows, 'subdistrict')
  const byCommunity = aggregateAreas(rows, 'community')
  const withCommunity = rows.filter((r) => (r.community ?? '').toString().trim()).length
  const outsideBkk = rows.filter((r) => !isBkkDistrict(r.district)).length

  const meta = [
    'สถิติเรื่องร้องเรียนยาเสพติดรายพื้นที่ — กรุงเทพมหานคร',
    `ช่วงเวลา: ${periodLabel}  ·  ตัวกรอง: ${filterLabel}`,
    `ข้อมูล ณ วันที่ ${nowLabel()}  ·  ${rows.length.toLocaleString()} ครั้ง (1 ครั้ง = 1 เรื่องร้องเรียน)${outsideBkk ? `  ·  ไม่รวม ${outsideBkk.toLocaleString()} ครั้งที่ระบุเขตนอก กทม.` : ''}`,
  ]

  // ── Sheet สรุป ──
  const ws = wb.addWorksheet('สรุป')
  meta.forEach((line) => ws.addRow([line]))
  ws.getRow(1).font = { bold: true, size: 14 }
  ws.addRow([])
  const kv = (k, v) => { const r = ws.addRow([k, v]); r.getCell(1).font = { color: { argb: 'FF475569' } }; r.getCell(2).font = { bold: true }; if (typeof v === 'number') r.getCell(2).numFmt = '#,##0' }
  kv('จำนวนครั้งร้องเรียนทั้งหมด', rows.length)
  kv('จำนวนเขตที่มีเรื่อง', byDistrict.length)
  kv('จำนวนแขวงที่มีเรื่อง', bySub.length)
  kv('จำนวนชุมชนที่ระบุชื่อ', byCommunity.length)
  kv('เรื่องที่ระบุชุมชน', withCommunity)
  kv('เรื่องที่ไม่ระบุชุมชน', rows.length - withCommunity)
  ws.addRow([])
  const bh = ws.addRow(['พฤติการณ์', 'จำนวนครั้ง', 'สัดส่วน'])
  bh.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } } })
  const behTotals = BEHAVIOR_LABELS.map((b) => [b, byDistrict.reduce((s, a) => s + (a.beh[b] || 0), 0)])
  for (const [b, n] of behTotals) { const r = ws.addRow([b, n, rows.length ? n / rows.length : 0]); r.getCell(2).numFmt = '#,##0'; r.getCell(3).numFmt = '0.0%' }
  ws.addRow([])
  const th = ws.addRow(['Top 10 เขต', 'จำนวนครั้ง', 'เสพ', 'ค้า', 'เสพ/ค้า', 'ผลิต'])
  th.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } } })
  for (const a of byDistrict.slice(0, 10)) {
    const r = ws.addRow([a.district, a.total, ...BEHAVIOR_LABELS.map((b) => a.beh[b] || 0)])
    for (let c = 2; c <= 6; c++) r.getCell(c).numFmt = '#,##0'
  }
  ws.getColumn(1).width = 34; ws.getColumn(2).width = 14; [3, 4, 5, 6].forEach((c) => { ws.getColumn(c).width = 10 })

  writeLevelSheet(wb, { name: 'รายเขต', areas: byDistrict, levelCols: ['เขต'], meta })
  writeLevelSheet(wb, { name: 'รายแขวง', areas: bySub, levelCols: ['เขต', 'แขวง'], meta })
  writeLevelSheet(wb, { name: 'รายชุมชน', areas: byCommunity, levelCols: ['เขต', 'แขวง', 'ชุมชน'], meta })

  const buffer = await wb.xlsx.writeBuffer()
  downloadBlob(new Blob([buffer], { type: XLSX_MIME }), `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
