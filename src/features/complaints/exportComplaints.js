import { createWorksheetWriter, styleExcelHeader as styleHeaderRow } from '../../shared/export/excelReportSheet.js'
import ExcelJS from 'exceljs'
import { downloadBlob, XLSX_MIME } from '../../shared/export/downloadBlob.js'
import { formatThaiDate, formatThaiDateTime } from '../../shared/utils/heroMeta.js'
import { DNAME_TO_GROUP } from '../../shared/utils/constants.js'

// exportComplaints.js — Excel export ของหน้า /complaints (แถวที่ filter ตาม view ปัจจุบันแล้ว)

// DB สะกด "ราษฎร์บูรณะ" ด้วย ฎ ชฎา (ถูกต้อง) แต่ DNAME_TO_GROUP ใช้ ฏ ปฏัก ตาม GeoJSON เดิม
const DISTRICT_ALIAS = { 'เขตราษฎร์บูรณะ': 'เขตราษฏร์บูรณะ' }
const groupOf = (d) => DNAME_TO_GROUP[DISTRICT_ALIAS[d] || d] || 'ไม่ระบุ'

// ต้องตรงกับนิยามใน ComplaintsPage.jsx
const DONE_STATUSES = ['จับกุม', 'บำบัด', 'ดำเนินการแล้ว', 'ยุติเรื่อง', 'ถูกกลั่นแกล้ง']
const isDone = (status) => DONE_STATUSES.includes(status)
const splitMulti = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : [])

const PCT_COLUMNS = new Set(['%'])
const isNumericHeader = (h) => !PCT_COLUMNS.has(h) && ['จำนวน'].includes(h)
const writeSheet = createWorksheetWriter({ percentColumns: PCT_COLUMNS, isNumericHeader, styleHeaderRow })

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
  downloadBlob(new Blob([buffer], { type: XLSX_MIME }), `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
