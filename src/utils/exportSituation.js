// exportSituation.js — Excel export ของหน้า /situation (จับกุม/บำบัด/ร้องเรียน, ตาราง drug_incidents)
// รับแถวที่ filter ตาม view ปัจจุบันแล้วจากหน้าที่เรียก (ไม่ query เอง) — ตัวเลขตรงกับที่ user เห็นบนจอเสมอ
import ExcelJS from 'exceljs'
import { formatThaiDate } from './heroMeta'
import { DNAME_TO_GROUP } from './constants'
import { BEHAVIOR_FLAGS, DRUG_FLAGS, RESULT_FLAGS, countFlag, drugCounts, rowsWithAnyDrug } from './drugFlags'
import { DIMENSION_LABEL } from './treatmentData'

const DISTRICT_ALIAS = { 'เขตราษฎร์บูรณะ': 'เขตราษฏร์บูรณะ' }
const groupOf = (d) => DNAME_TO_GROUP[DISTRICT_ALIAS[d] || d] || 'ไม่ระบุ'

const joinFlags = (r, flags) => {
  const out = flags.filter(([col]) => r[col]).map(([, label]) => label)
  return out.length ? out.join(', ') : '-'
}
function drugLabel(r) {
  const out = DRUG_FLAGS.filter(([col]) => r[col]).map(([, label]) => label)
  if (Array.isArray(r.drug_others)) out.push(...r.drug_others.filter(Boolean))
  return out.length ? out.join(', ') : '-'
}
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
const isNumericHeader = (h) => !PCT_COLUMNS.has(h) && ['จำนวน', 'จำนวนคดี', 'ผู้ต้องหา(คน)', 'จำนวนผู้บำบัด', 'รายเก่า', 'รายใหม่'].includes(h)

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

function buildMeta(rows, periodLabel, filterLabel, extraLine) {
  const meta = [
    `ข้อมูล ณ วันที่: ${formatThaiDateTime(new Date())}`,
    `ช่วงเวลา: ${periodLabel}`,
    `ตัวกรอง: ${filterLabel}`,
    `รวม ${rows.length.toLocaleString()} รายการ`,
  ]
  if (extraLine) meta.push(extraLine)
  return meta
}

function detailRows(rows) {
  return rows
    .slice()
    .sort((a, b) => (b.received_date || '').localeCompare(a.received_date || ''))
    .map((r) => ({
      วันที่: formatThaiDate(r.received_date) || '-',
      เขต: r.district || '-',
      แขวง: r.subdistrict || '-',
      ชุมชน: r.community || '-',
      กลุ่มโซน: r.district ? groupOf(r.district) : '-',
      พฤติการณ์: joinFlags(r, BEHAVIOR_FLAGS),
      ตัวยา: drugLabel(r),
      ผลตรวจสอบ: joinFlags(r, RESULT_FLAGS),
      ผลดำเนินการ: [r.action_arrest && 'จับกุม', r.action_treatment && 'บำบัด', r.action_search && 'ตรวจค้น',
        r.action_escape && 'หลบหนี', r.action_investigating && 'อยู่ระหว่างสืบสวน'].filter(Boolean).join(', ') || '-',
    }))
}

/** Export ส่วนจับกุม — summaryRows/drugRows = arrest_summary/arrest_drug ที่ filter ตาม view ปัจจุบันแล้ว (สถิติทางการจาก CRIMES กทม.) */
export async function exportArrestReport({ summaryRows = [], drugRows = [], periodLabel = 'ทั้งหมด', filterLabel = 'ทุกพื้นที่', filenamePrefix = 'arrest-report' } = {}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = '1386 Dashboard'; wb.created = new Date()

  const totalCases = summaryRows.reduce((s, r) => s + (r.cases || 0), 0)
  const meta = [
    `ข้อมูล ณ วันที่: ${formatThaiDateTime(new Date())}`,
    `ช่วงเวลา: ${periodLabel}`,
    `ตัวกรอง: ${filterLabel}`,
    `รวม ${totalCases.toLocaleString()} คดี (${summaryRows.length.toLocaleString()} แถวเขต×ปีงบ)`,
    'ที่มา: CRIMES กทม. (arrest_summary / arrest_drug)',
  ]

  const summarySheetRows = summaryRows
    .slice()
    .sort((a, b) => b.fiscal_year - a.fiscal_year || b.cases - a.cases)
    .map((r) => ({
      เขต: r.district, ปีงบ: r.fiscal_year, จำนวนคดี: r.cases || 0,
      'ผู้ต้องหา(คน)': r.suspects_person || 0, รายเก่า: r.suspects_old ?? '-', รายใหม่: r.suspects_new ?? '-',
    }))
  writeSheet(wb, 'สรุปรายเขต', meta, ['เขต', 'ปีงบ', 'จำนวนคดี', 'ผู้ต้องหา(คน)', 'รายเก่า', 'รายใหม่'], summarySheetRows)

  const drugSheetRows = drugRows
    .slice()
    .sort((a, b) => b.fiscal_year - a.fiscal_year || b.cases - a.cases)
    .map((r) => ({ เขต: r.district, ปีงบ: r.fiscal_year, ตัวยา: r.dim_value, จำนวนคดี: r.cases || 0 }))
  writeSheet(wb, 'ของกลางตัวยา', [...meta, 'หมายเหตุ: ไม่ใช่ทุกคดีระบุตัวยาได้ — ผลรวมจำนวนคดีในชีตนี้จึงน้อยกว่ายอดรวมคดีทั้งหมด'],
    ['เขต', 'ปีงบ', 'ตัวยา', 'จำนวนคดี'], drugSheetRows)

  await download(wb, filenamePrefix)
}

/** Export ส่วนร้องเรียน — rows = ทุกเรื่องที่ filter ตาม view ปัจจุบันแล้ว (ไม่ subset) */
export async function exportIncidentsReport({ rows = [], periodLabel = 'ทั้งหมด', filterLabel = 'ทุกพื้นที่', filenamePrefix = 'incidents-report' } = {}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = '1386 Dashboard'; wb.created = new Date()
  const meta = buildMeta(rows, periodLabel, filterLabel)

  const total = rows.length
  const resultRows = RESULT_FLAGS.map(([col, label]) => {
    const n = countFlag(rows, col)
    return { ผลตรวจสอบ: label, จำนวน: n, '%': total ? n / total : 0 }
  })
  writeSheet(wb, 'ผลตรวจสอบ', meta, ['ผลตรวจสอบ', 'จำนวน', '%'], resultRows)

  const behRows = BEHAVIOR_FLAGS.map(([col, label]) => {
    const n = countFlag(rows, col)
    return { พฤติการณ์: label, จำนวน: n, '%': total ? n / total : 0 }
  }).sort((a, b) => b.จำนวน - a.จำนวน)
  writeSheet(wb, 'พฤติการณ์', meta, ['พฤติการณ์', 'จำนวน', '%'], behRows)

  const withDrug = rowsWithAnyDrug(rows).length
  const drugRows = drugCounts(rows, { top: 10 }).map((d) => ({ ตัวยา: d.name, จำนวน: d.value, '%': withDrug ? d.value / withDrug : 0 }))
  writeSheet(wb, 'ตัวยา Top10', [...meta, 'หมายเหตุ: 1 เรื่องมีของกลางหลายตัวยาได้ — ฐาน % คือเรื่องที่ระบุตัวยาได้เท่านั้น'],
    ['ตัวยา', 'จำนวน', '%'], drugRows)

  writeSheet(wb, 'รายละเอียด', meta,
    ['วันที่', 'เขต', 'แขวง', 'ชุมชน', 'กลุ่มโซน', 'พฤติการณ์', 'ตัวยา', 'ผลตรวจสอบ', 'ผลดำเนินการ'], detailRows(rows))

  await download(wb, filenamePrefix)
}

/** Export ส่วนบำบัด — summaryRows/dimRows = treatment_summary/treatment_dim ที่ filter ตาม view ปัจจุบันแล้ว (สถิติทางการจาก บสต. กทม.) */
export async function exportTreatmentReport({ summaryRows = [], dimRows = [], periodLabel = 'ทั้งหมด', filterLabel = 'ทุกพื้นที่', filenamePrefix = 'treatment-report' } = {}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = '1386 Dashboard'; wb.created = new Date()

  const totalPerson = summaryRows.reduce((s, r) => s + (r.total_person || 0), 0)
  const meta = [
    `ข้อมูล ณ วันที่: ${formatThaiDateTime(new Date())}`,
    `ช่วงเวลา: ${periodLabel}`,
    `ตัวกรอง: ${filterLabel}`,
    `รวม ${totalPerson.toLocaleString()} ราย (${summaryRows.length.toLocaleString()} แถวเขต×ปีงบ)`,
    'ที่มา: บสต. กทม. (treatment_summary / treatment_dim)',
  ]

  const summarySheetRows = summaryRows
    .slice()
    .sort((a, b) => b.fiscal_year - a.fiscal_year || b.total_person - a.total_person)
    .map((r) => ({
      เขต: r.district, ปีงบ: r.fiscal_year, จำนวนผู้บำบัด: r.total_person || 0,
      รายเก่า: r.old_person ?? '-', รายใหม่: r.new_person ?? '-',
    }))
  writeSheet(wb, 'สรุปรายเขต', meta, ['เขต', 'ปีงบ', 'จำนวนผู้บำบัด', 'รายเก่า', 'รายใหม่'], summarySheetRows)

  const dimSheetRows = dimRows
    .slice()
    .sort((a, b) => b.fiscal_year - a.fiscal_year || a.dimension.localeCompare(b.dimension) || b.total_person - a.total_person)
    .map((r) => ({ เขต: r.district, ปีงบ: r.fiscal_year, มิติ: DIMENSION_LABEL[r.dimension] || r.dimension, ค่า: r.dim_value, จำนวน: r.total_person || 0 }))
  writeSheet(wb, 'มิติ (ตัวยา อาชีพ เพศ ฯลฯ)', meta, ['เขต', 'ปีงบ', 'มิติ', 'ค่า', 'จำนวน'], dimSheetRows)

  await download(wb, filenamePrefix)
}

async function download(wb, filenamePrefix) {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
