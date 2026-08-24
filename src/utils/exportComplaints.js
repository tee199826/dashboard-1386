// exportComplaints.js — Excel export ของหน้า /complaints (แถวที่ filter ตาม view ปัจจุบันแล้ว)
import ExcelJS from 'exceljs'
import { formatThaiDate } from './heroMeta'
import { DNAME_TO_GROUP } from './constants'

// DB สะกด "ราษฎร์บูรณะ" ด้วย ฎ ชฎา (ถูกต้อง) แต่ DNAME_TO_GROUP ใช้ ฏ ปฏัก ตาม GeoJSON เดิม
const DISTRICT_ALIAS = { 'เขตราษฎร์บูรณะ': 'เขตราษฏร์บูรณะ' }
const groupOf = (d) => DNAME_TO_GROUP[DISTRICT_ALIAS[d] || d] || 'ไม่ระบุ'

// ต้องตรงกับนิยามใน ComplaintsPage.jsx
const DONE_STATUSES = ['จับกุม', 'บำบัด', 'ดำเนินการแล้ว', 'ยุติเรื่อง', 'ถูกกลั่นแกล้ง']
const isDone = (status) => DONE_STATUSES.includes(status)
const splitMulti = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : [])

function formatThaiDateTime(d) {
  const date = formatThaiDate(d.toISOString().slice(0, 10))
  const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0')
  return `${date} ${hh}:${mm}`
}

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
    cell.alignment = { vertical: 'middle' }
  })
}

const PCT_COLUMNS = new Set(['%'])
const isNumericHeader = (h) => !PCT_COLUMNS.has(h) && ['จำนวน'].includes(h)

function writeSheet(workbook, name, metaLines, header, dataRows) {
  const ws = workbook.addWorksheet(name)
  metaLines.forEach((line) => ws.addRow([line]))
  ws.addRow([])
  const headerRow = ws.addRow(header)
  styleHeaderRow(headerRow)

  for (const row of dataRows) {
    const values = Array.isArray(row) ? row : header.map((h) => row[h])
    const excelRow = ws.addRow(values)
    values.forEach((v, i) => {
      const h = header[i]
      if (PCT_COLUMNS.has(h) && typeof v === 'number') excelRow.getCell(i + 1).numFmt = '0.0%'
      else if (isNumericHeader(h) && typeof v === 'number') excelRow.getCell(i + 1).numFmt = '#,##0'
    })
  }

  const widths = header.map((h) => String(h).length)
  for (const row of dataRows) {
    const values = Array.isArray(row) ? row : header.map((h) => row[h])
    values.forEach((v, i) => {
      const len = typeof v === 'number' ? String(v).length + 2 : String(v ?? '').length
      if (len > widths[i]) widths[i] = len
    })
  }
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = Math.min(Math.max(w + 2, 10), 50) })
  ws.getColumn(1).width = Math.max(ws.getColumn(1).width, 34)
  return ws
}

/**
 * สร้าง + ดาวน์โหลด Excel report ของเรื่องร้องเรียน (complaints) — รับแถวที่ filter ตาม view ปัจจุบันแล้ว
 * @param {object} opts
 *   - rows: complaint records (camelCase, จาก useData()) ที่ filter ตามช่วงเวลา/พื้นที่ที่เลือกอยู่แล้ว
 *   - periodLabel / filterLabel: ข้อความสรุปตัวกรองที่ใช้อยู่ (แสดงใน metadata)
 *   - filenamePrefix: เติมหน้า `-YYYY-MM-DD.xlsx`
 */
export async function exportComplaintsReport({
  rows = [], periodLabel = 'ทั้งหมด', filterLabel = 'ทุกพื้นที่', filenamePrefix = 'complaints-report',
} = {}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = '1386 Dashboard'
  wb.created = new Date()

  const total = rows.length
  const done = rows.filter((r) => isDone(r.status)).length

  const meta = [
    `ข้อมูล ณ วันที่: ${formatThaiDateTime(new Date())}`,
    `ช่วงเวลา: ${periodLabel}`,
    `ตัวกรอง: ${filterLabel}`,
    `รวม ${total.toLocaleString()} เรื่อง · ดำเนินการแล้ว ${done.toLocaleString()} · คงเหลือ ${(total - done).toLocaleString()}`,
  ]

  // Sheet 1: สรุปผลดำเนินการ
  const statusMap = {}
  for (const r of rows) { const s = r.status || 'ไม่ระบุ'; statusMap[s] = (statusMap[s] || 0) + 1 }
  const statusRows = Object.entries(statusMap)
    .map(([status, count]) => ({ ผลดำเนินการ: status, จำนวน: count, '%': total ? count / total : 0 }))
    .sort((a, b) => b.จำนวน - a.จำนวน)
  writeSheet(wb, 'สรุปผลดำเนินการ', meta, ['ผลดำเนินการ', 'จำนวน', '%'], statusRows)

  // Sheet 2: รายละเอียดเรื่องร้องเรียน
  const detailRows = rows
    .slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .map((r) => ({
      วันที่: formatThaiDate(r.date) || '-',
      เขต: r.district || '-',
      แขวง: r.subdistrict || '-',
      ชุมชน: r.community || '-',
      กลุ่มโซน: r.district ? groupOf(r.district) : '-',
      พฤติการณ์: splitMulti(r.role).join(', ') || '-',
      ตัวยา: splitMulti(r.drug).join(', ') || '-',
      ช่องทาง: r.channel || '-',
      ผลดำเนินการ: r.status || 'ไม่ระบุ',
      ด่วน: r.urgency || '-',
    }))
  writeSheet(wb, 'รายละเอียดเรื่องร้องเรียน', meta,
    ['วันที่', 'เขต', 'แขวง', 'ชุมชน', 'กลุ่มโซน', 'พฤติการณ์', 'ตัวยา', 'ช่องทาง', 'ผลดำเนินการ', 'ด่วน'], detailRows)

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
