// exportReport.js — multi-sheet Excel export ของรายงาน drug_incidents (ใช้ร่วม /districts, /bkn, /radar)
// รับ "แถวที่ filter ตาม view ปัจจุบันแล้ว" จากหน้าที่เรียก (ไม่ query เอง) — รับประกันตัวเลขตรงกับที่ user เห็นบนจอ
import ExcelJS from 'exceljs'
import { formatThaiDate } from './heroMeta'
import { DNAME_TO_GROUP } from './constants'

const BEHAVIOR_FLAGS = [
  ['beh_use', 'เสพ'], ['beh_sell', 'ค้า'], ['beh_use_sell', 'เสพ/ค้า'], ['beh_produce', 'ผลิต'],
]
const DRUG_FLAGS = [
  ['drug_yaba', 'ยาบ้า'], ['drug_ice', 'ไอซ์'], ['drug_ecstasy', 'ยาอี'], ['drug_ketamine', 'คีตามีน'],
  ['drug_cocaine', 'โคเคน'], ['drug_heroin', 'เฮโรอีน'], ['drug_morphine', 'มอร์ฟีน'], ['drug_opium', 'ฝิ่น'],
  ['drug_kratom', 'กระท่อม'], ['drug_cannabis', 'กัญชา'], ['drug_solvent', 'สารระเหย'], ['drug_4x100', 'สี่คูณร้อย'],
  ['drug_misuse', 'ยาใช้ในทางที่ผิด'], ['drug_psychotropic', 'วัตถุออกฤทธิ์'],
]
// ลำดับตามที่ user ระบุ (ต่างจากลำดับ column จริงในตาราง) — ใช้เฉพาะ join "ผลการดำเนินการ"
const ACTION_FLAGS_ORDERED = [
  ['action_arrest', 'จับกุม'], ['action_search', 'ตรวจค้น'], ['action_escape', 'หลบหนี'],
  ['action_investigating', 'อยู่ระหว่างสืบสวน'], ['action_treatment', 'บำบัด'],
]
// สถานะ 2 bucket: ดำเนินการแล้ว = มี arrest/search/treatment ; ที่เหลือ (investigating/escape/ไม่มีเลย) = ยังไม่ดำเนินการ
const DONE_FLAGS = ['action_arrest', 'action_search', 'action_treatment']
// drug_incidents ไม่มี field ข้อหาแยก (คอลัมน์ 52-60 "ผลการจับกุม" ถูกตัดตอน parse) — ใช้ beh_* แทนโดยประมาณ (Sheet 5)
const CHARGE_FLAGS = [
  ['beh_use', 'เสพ'], ['beh_sell', 'จำหน่าย'], ['beh_use_sell', 'เสพและจำหน่าย'], ['beh_produce', 'ผลิต'],
]

// whitelist 50 เขต กทม. — มาจาก DNAME_TO_GROUP (ยืนยันแล้วว่า map ครบ 1:1 กับ bangkok-districts.geojson ทั้ง 50 เขต,
// deterministic ต่างจาก area_group ใน DB ที่ NULL ราวครึ่งนึง) — ใช้กรองทุก sheet + บังคับ Sheet 1 มี 50 แถวเสมอ
const VALID_DISTRICTS = new Set(Object.keys(DNAME_TO_GROUP))

// ลำดับ 6 กลุ่มโซน กทม. — ตรงกับ GROUP_ORDER ใน AllDistricts.jsx (คงลำดับเดียวกันข้ามหน้า ให้อ่านเทียบง่าย)
const ZONE_ORDER = ['กรุงเทพกลาง', 'กรุงเทพเหนือ', 'กรุงเทพใต้', 'กรุงเทพตะวันออก', 'กรุงธนเหนือ', 'กรุงธนใต้']

// สีพื้นหลังแยกโซน (Sheet "Top 3 เขตต่อโซน") — ARGB, ตัวเดียวกับที่ user ระบุ (blue/purple/pink/emerald/amber/rose -100)
const ZONE_COLORS = {
  กรุงเทพเหนือ: 'FFDBEAFE',
  กรุงเทพกลาง: 'FFE9D5FF',
  กรุงเทพใต้: 'FFFCE7F3',
  กรุงเทพตะวันออก: 'FFD1FAE5',
  กรุงธนเหนือ: 'FFFEF3C7',
  กรุงธนใต้: 'FFFFE4E6',
}

const deriveStatus = (r) => (DONE_FLAGS.some(f => r[f]) ? 'ดำเนินการแล้ว' : 'ยังไม่ดำเนินการ')
// จำนวน "ครั้งตรวจพบยา" ต่อแถว — 1 แถวร้องเรียนอาจพบยาหลายชนิด นับซ้ำได้ (ต่างจาก "ร้องเรียน" ที่นับ 1 แถว = 1)
const drugInstanceCount = (r) => {
  let n = DRUG_FLAGS.filter(([col]) => r[col]).length
  if (Array.isArray(r.drug_others)) n += r.drug_others.filter(Boolean).length
  return n
}
// กรองแถวตามช่วงวันที่ (inclusive) — ใช้ column เดียวกันทุกจุดเรียก (received_date ของ drug_incidents)
const withinRange = (dateStr, from, to) => {
  if (!dateStr) return false
  if (from && dateStr < from) return false
  if (to && dateStr > to) return false
  return true
}
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
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } }
    cell.alignment = { vertical: 'middle' }
  })
}

// select string ครบทุก column ที่ derive logic ในไฟล์นี้ต้องใช้ — หน้าไหน fetch แบบ column แคบ (ไม่ใช่ '*')
// ต้อง select อย่างน้อยชุดนี้ก่อนส่งเข้า exportDrugIncidentReport ไม่งั้น ชนิดยา/ผลการดำเนินการ/สถานะ จะว่างหมด
export const DRUG_INCIDENT_EXPORT_COLUMNS = [
  'district', 'subdistrict', 'community', 'received_date',
  ...BEHAVIOR_FLAGS.map(([c]) => c),
  ...DRUG_FLAGS.map(([c]) => c), 'drug_others',
  ...ACTION_FLAGS_ORDERED.map(([c]) => c),
].join(', ')

// ── aggregate รายเขต (Sheet 1 + ฐานของ Sheet 4) — pre-seed 50 เขตเสมอ แม้ไม่มีข้อมูล ──
function buildDistrictSummary(validRows, dealerRows) {
  const map = {}
  for (const d of VALID_DISTRICTS) map[d] = { district: d, total: 0, done: 0 }
  for (const r of validRows) {
    const m = map[r.district]
    m.total++
    if (deriveStatus(r) === 'ดำเนินการแล้ว') m.done++
  }
  const dealerCounts = {}
  for (const r of dealerRows) {
    for (const loc of (r?.dealer_locations || [])) {
      const d = (loc?.district || '').trim()
      if (!VALID_DISTRICTS.has(d)) continue
      dealerCounts[d] = (dealerCounts[d] || 0) + 1
    }
  }
  return Object.values(map)
    .map((m) => ({
      เขต: m.district,
      กลุ่มโซน: DNAME_TO_GROUP[m.district],
      ร้องเรียนทั้งหมด: m.total,
      ดำเนินการแล้ว: m.done,
      ยังไม่ดำเนินการ: m.total - m.done,
      '% ดำเนินการ': m.total ? m.done / m.total : 0,
      แหล่งซื้อ: dealerCounts[m.district] || 0,
    }))
    .sort((a, b) => b.ร้องเรียนทั้งหมด - a.ร้องเรียนทั้งหมด)
}

// ── รายเรื่อง (Sheet 2) ──
function buildDetailRows(validRows) {
  return validRows
    .slice()
    .sort((a, b) => (b.received_date || '').localeCompare(a.received_date || ''))
    .map((r) => ({
      วันที่: formatThaiDate(r.received_date) || '-',
      เขต: r.district,
      แขวง: r.subdistrict || '-',
      ชุมชน: r.community || '-',
      กลุ่มโซน: DNAME_TO_GROUP[r.district],
      พฤติการณ์: joinFlags(r, BEHAVIOR_FLAGS),
      ชนิดยา: drugLabel(r),
      สถานะ: deriveStatus(r),
      ผลการดำเนินการ: joinFlags(r, ACTION_FLAGS_ORDERED),
    }))
}

// ── breakdown สถานะ + ผล (Sheet 3) — คืน array-of-arrays ตรงกับ layout ที่ user ระบุ (คอลัมน์ "จำนวน" ซ้ำ 2 ครั้ง) ──
function buildStatusBreakdown(validRows) {
  const total = validRows.length
  const doneRows = validRows.filter((r) => deriveStatus(r) === 'ดำเนินการแล้ว')
  const notDoneRows = validRows.filter((r) => deriveStatus(r) === 'ยังไม่ดำเนินการ')
  const countFlag = (rows, col) => rows.filter((r) => r[col]).length
  const pct = (n) => (total ? n / total : 0)

  const header = ['สถานะ', 'จำนวน', '%', 'ผลการดำเนินการ', 'จำนวน']
  const rows = [
    ['ดำเนินการแล้ว', doneRows.length, pct(doneRows.length), 'จับกุม', countFlag(doneRows, 'action_arrest')],
    ['', '', '', 'ตรวจค้น', countFlag(doneRows, 'action_search')],
    ['', '', '', 'บำบัด', countFlag(doneRows, 'action_treatment')],
    ['ยังไม่ดำเนินการ', notDoneRows.length, pct(notDoneRows.length), 'อยู่ระหว่างสืบสวน', countFlag(notDoneRows, 'action_investigating')],
    ['', '', '', 'หลบหนี', countFlag(notDoneRows, 'action_escape')],
  ]
  return { header, rows }
}

// ── Top 5 เขต (Sheet 4) — ตัดจาก summary ที่ sort แล้ว ──
function buildTop5(summaryRows) {
  return summaryRows.slice(0, 5).map((r, i) => ({
    อันดับ: i + 1,
    เขต: r.เขต,
    กลุ่มโซน: r.กลุ่มโซน,
    จำนวนร้องเรียน: r.ร้องเรียนทั้งหมด,
    ดำเนินการแล้ว: r.ดำเนินการแล้ว,
    ยังไม่ดำเนิน: r.ยังไม่ดำเนินการ,
    '% สำเร็จ': r.ร้องเรียนทั้งหมด ? r.ดำเนินการแล้ว / r.ร้องเรียนทั้งหมด : 0,
  }))
}

// ── ข้อหา (Sheet 5) — ไม่มี field ข้อหาจริงใน drug_incidents จึงใช้ beh_* (พฤติการณ์) แทนโดยประมาณ ──
function buildChargeBreakdown(validRows) {
  const stats = CHARGE_FLAGS.map(([col, label]) => {
    const rows = validRows.filter((r) => r[col])
    const done = rows.filter((r) => deriveStatus(r) === 'ดำเนินการแล้ว').length
    return { label, count: rows.length, done, notDone: rows.length - done }
  })
  const totalCount = stats.reduce((s, x) => s + x.count, 0)
  const totalDone = stats.reduce((s, x) => s + x.done, 0)
  const totalNotDone = stats.reduce((s, x) => s + x.notDone, 0)
  const mainRows = stats.map((s) => [s.label, s.count, totalCount ? s.count / totalCount : 0, s.done, s.notDone])
  mainRows.push(['รวม', totalCount, totalCount ? 1 : 0, totalDone, totalNotDone])

  const byDistrict = {}
  for (const d of VALID_DISTRICTS) byDistrict[d] = { เสพ: 0, จำหน่าย: 0, เสพและจำหน่าย: 0, ผลิต: 0 }
  for (const r of validRows) {
    const m = byDistrict[r.district]
    for (const [col, label] of CHARGE_FLAGS) if (r[col]) m[label]++
  }
  const districtRows = Object.entries(byDistrict)
    .map(([d, c]) => [d, c['เสพ'], c['จำหน่าย'], c['เสพและจำหน่าย'], c['ผลิต'], c['เสพ'] + c['จำหน่าย'] + c['เสพและจำหน่าย'] + c['ผลิต']])
    .sort((a, b) => b[5] - a[5])

  return { mainRows, districtRows }
}

// ── โหมด "รายกลุ่มโซน" (6 กลุ่ม) — ทางเลือกแทนโหมด "รายเขต" (50 เขต) เมื่อ user เลือกจาก ExportDialog ──

// Sheet 1: สรุปรายกลุ่มโซน — 6 แถว, เรียงมาก→น้อยตามร้องเรียน (แทน Top 5 ที่มีความหมายน้อยเมื่อเหลือแค่ 6 กลุ่ม)
function buildZoneSummary(validRows) {
  const districtCountOf = {}
  for (const d of VALID_DISTRICTS) districtCountOf[DNAME_TO_GROUP[d]] = (districtCountOf[DNAME_TO_GROUP[d]] || 0) + 1
  const map = {}
  for (const z of ZONE_ORDER) map[z] = { zone: z, districtCount: districtCountOf[z] || 0, total: 0, done: 0, incidents: 0 }
  for (const r of validRows) {
    const m = map[DNAME_TO_GROUP[r.district]]
    m.total++
    if (deriveStatus(r) === 'ดำเนินการแล้ว') m.done++
    m.incidents += drugInstanceCount(r)
  }
  return ZONE_ORDER.map((z) => {
    const m = map[z]
    return {
      กลุ่มโซน: m.zone,
      จำนวนเขต: m.districtCount,
      ร้องเรียน: m.total,
      ดำเนินการแล้ว: m.done,
      ยังไม่ดำเนิน: m.total - m.done,
      '% สำเร็จ': m.total ? m.done / m.total : 0,
      เหตุการณ์: m.incidents,
    }
  }).sort((a, b) => b.ร้องเรียน - a.ร้องเรียน)
}

// Sheet 2: รายละเอียดเรื่องร้องเรียน (โหมดโซน) — เหมือน buildDetailRows แต่คอลัมน์ "เขต" → "กลุ่มโซน"
function buildDetailRowsZone(validRows) {
  return validRows
    .slice()
    .sort((a, b) => (b.received_date || '').localeCompare(a.received_date || ''))
    .map((r) => ({
      วันที่: formatThaiDate(r.received_date) || '-',
      กลุ่มโซน: DNAME_TO_GROUP[r.district],
      แขวง: r.subdistrict || '-',
      ชุมชน: r.community || '-',
      พฤติการณ์: joinFlags(r, BEHAVIOR_FLAGS),
      ชนิดยา: drugLabel(r),
      สถานะ: deriveStatus(r),
      ผลการดำเนินการ: joinFlags(r, ACTION_FLAGS_ORDERED),
    }))
}

// Sheet 2b: Top 3 เขตในแต่ละโซน — โซนเรียงตาม zoneOrder ที่รับมา (มาก→น้อยตามร้องเรียนรวม, คำนวณไว้แล้วจาก buildZoneSummary)
// ในแต่ละโซนเรียงเขตตามร้องเรียนมาก→น้อยเอง แล้วตัดเหลือ 3 อันดับแรก
function buildTop3PerZone(validRows, zoneOrder) {
  return zoneOrder.map((zone) => {
    const districts = Object.keys(DNAME_TO_GROUP).filter((d) => DNAME_TO_GROUP[d] === zone)
    const stats = districts.map((d) => {
      const rows = validRows.filter((r) => r.district === d)
      const total = rows.length
      const done = rows.filter((r) => deriveStatus(r) === 'ดำเนินการแล้ว').length
      return { district: d, total, done, notDone: total - done, pct: total ? done / total : 0 }
    })
    stats.sort((a, b) => b.total - a.total)
    return { zone, rows: stats.slice(0, 3) }
  })
}

// Sheet 3: สถานะการดำเนินการ (โหมดโซน) — breakdown ต่อกลุ่มโซน, คอลัมน์แบนราบ (ต่างจากโหมดเขตที่มี 2 header ซ้อน)
function buildStatusBreakdownZone(validRows) {
  const countFlag = (rows, col) => rows.filter((r) => r[col]).length
  const rows = ZONE_ORDER.map((z) => {
    const zoneRows = validRows.filter((r) => DNAME_TO_GROUP[r.district] === z)
    const doneRows = zoneRows.filter((r) => deriveStatus(r) === 'ดำเนินการแล้ว')
    const notDoneRows = zoneRows.filter((r) => deriveStatus(r) === 'ยังไม่ดำเนินการ')
    return [
      z, doneRows.length,
      countFlag(doneRows, 'action_arrest'), countFlag(doneRows, 'action_search'), countFlag(doneRows, 'action_treatment'),
      notDoneRows.length, countFlag(notDoneRows, 'action_investigating'), countFlag(notDoneRows, 'action_escape'),
    ]
  })
  const header = ['กลุ่มโซน', 'ดำเนินการแล้ว', 'จับกุม', 'ตรวจค้น', 'บำบัด', 'ยังไม่ดำเนิน', 'สืบสวน', 'หลบหนี']
  return { header, rows }
}

// Sheet 4: ข้อหา รายกลุ่มโซน — เหมือน Sheet 5 "ข้อหา" ของโหมดเขต แต่ breakdown ตามกลุ่มโซนแทนรายเขต (ไม่มีตารางรวมแยก)
function buildChargeBreakdownZone(validRows) {
  const rows = ZONE_ORDER.map((z) => {
    const c = { เสพ: 0, จำหน่าย: 0, เสพและจำหน่าย: 0, ผลิต: 0 }
    for (const r of validRows) {
      if (DNAME_TO_GROUP[r.district] !== z) continue
      for (const [col, label] of CHARGE_FLAGS) if (r[col]) c[label]++
    }
    const total = c['เสพ'] + c['จำหน่าย'] + c['เสพและจำหน่าย'] + c['ผลิต']
    return [z, c['เสพ'], c['จำหน่าย'], c['เสพและจำหน่าย'], c['ผลิต'], total]
  })
  const totalRow = ['รวม', ...[1, 2, 3, 4].map((i) => rows.reduce((s, r) => s + r[i], 0))]
  totalRow.push(rows.reduce((s, r) => s + r[5], 0))
  return [...rows, totalRow]
}

const PCT_COLUMNS = new Set(['% ดำเนินการ', '% สำเร็จ', '%'])
const isNumericHeader = (h) => !PCT_COLUMNS.has(h) && [
  'ร้องเรียนทั้งหมด', 'ดำเนินการแล้ว', 'ยังไม่ดำเนินการ', 'ยังไม่ดำเนิน', 'แหล่งซื้อ', 'จำนวนร้องเรียน', 'อันดับ', 'จำนวน',
  'จำนวนเขต', 'ร้องเรียน', 'เหตุการณ์', 'จับกุม', 'ตรวจค้น', 'บำบัด', 'สืบสวน', 'หลบหนี',
  'เสพ', 'จำหน่าย', 'เสพและจำหน่าย', 'ผลิต', 'รวม',
].includes(h)

// ── เขียน 1 sheet: metadata N บรรทัด + header (bold+fill) + data, auto-width + number format ──
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

  // auto-fit width: max ความยาวข้อความในแต่ละ column (รวม header, ไม่รวม metadata ซึ่งกิน col A อย่างเดียว)
  const widths = header.map((h) => String(h).length)
  for (const row of dataRows) {
    const values = Array.isArray(row) ? row : header.map((h) => row[h])
    values.forEach((v, i) => {
      const len = typeof v === 'number' ? String(v).length + 2 : String(v ?? '').length
      if (len > widths[i]) widths[i] = len
    })
  }
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = Math.min(Math.max(w + 2, 10), 50) })
  ws.getColumn(1).width = Math.max(ws.getColumn(1).width, 34) // เผื่อ metadata บรรทัดยาว
  return ws
}

// ── Sheet 5 "ข้อหา" — layout พิเศษ: note ทางกฎหมาย + ตารางหลัก + ตาราง breakdown รายเขต (2 header ในชีตเดียว) ──
function writeChargeSheet(workbook, metaLines, { mainRows, districtRows }) {
  const ws = workbook.addWorksheet('ข้อหา')
  metaLines.forEach((line) => ws.addRow([line]))
  ws.addRow(['หมายเหตุ: อ้างอิงจากพฤติการณ์ที่บันทึก (ไม่ใช่ข้อหาตามกฎหมาย) — หากต้องการข้อหาจริงตามกฎหมาย ต้อง re-parse ไฟล์ต้นทางเพิ่มคอลัมน์ 52-60'])
  ws.addRow([])

  const header1 = ['ข้อหา', 'จำนวน', '%', 'ดำเนินการแล้ว', 'ยังไม่ดำเนินการ']
  styleHeaderRow(ws.addRow(header1))
  for (const row of mainRows) {
    const excelRow = ws.addRow(row)
    excelRow.getCell(2).numFmt = '#,##0'
    excelRow.getCell(3).numFmt = '0.0%'
    excelRow.getCell(4).numFmt = '#,##0'
    excelRow.getCell(5).numFmt = '#,##0'
  }
  ws.getRow(ws.rowCount).eachCell((cell) => { cell.font = { bold: true } }) // แถว "รวม"

  ws.addRow([])
  ws.addRow(['Breakdown รายเขต'])
  const header2 = ['เขต', 'เสพ', 'จำหน่าย', 'เสพและจำหน่าย', 'ผลิต', 'รวม']
  styleHeaderRow(ws.addRow(header2))
  for (const row of districtRows) {
    const excelRow = ws.addRow(row)
    for (let i = 2; i <= 6; i++) excelRow.getCell(i).numFmt = '#,##0'
  }

  const widths = Array(Math.max(header1.length, header2.length)).fill(8)
  const consider = (arr) => arr.forEach((v, i) => { const len = String(v ?? '').length; if (len > widths[i]) widths[i] = len })
  consider(header1); mainRows.forEach(consider); consider(header2); districtRows.forEach(consider)
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = Math.min(Math.max(w + 2, 10), 50) })
  ws.getColumn(1).width = Math.max(ws.getColumn(1).width, 34)
  return ws
}

// ── Sheet "Top 3 เขตต่อโซน" — layout พิเศษ: merge cell คอลัมน์กลุ่มโซนต่อโซน + สีพื้นหลังแยกโซน + เส้นขอบหนาคั่นโซน ──
function writeTop3PerZoneSheet(workbook, metaLines, zoneGroups) {
  const ws = workbook.addWorksheet('Top 3 เขตต่อโซน')
  metaLines.forEach((line) => ws.addRow([line]))
  ws.addRow([])
  const header = ['กลุ่มโซน', 'อันดับ', 'เขต', 'ร้องเรียน', 'ดำเนินการแล้ว', 'ยังไม่ดำเนิน', '% สำเร็จ']
  styleHeaderRow(ws.addRow(header))

  for (const group of zoneGroups) {
    const startRow = ws.rowCount + 1
    const color = ZONE_COLORS[group.zone]
    group.rows.forEach((r, i) => {
      const excelRow = ws.addRow([group.zone, i + 1, r.district, r.total, r.done, r.notDone, r.pct])
      excelRow.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } } })
      excelRow.getCell(4).numFmt = '#,##0'
      excelRow.getCell(5).numFmt = '#,##0'
      excelRow.getCell(6).numFmt = '#,##0'
      excelRow.getCell(7).numFmt = '0.0%'
    })
    const endRow = ws.rowCount
    if (endRow > startRow) ws.mergeCells(startRow, 1, endRow, 1)
    ws.getCell(startRow, 1).alignment = { vertical: 'middle', horizontal: 'center' }
    for (let c = 1; c <= header.length; c++) ws.getRow(startRow).getCell(c).border = { top: { style: 'medium' } }
  }

  const widths = header.map((h) => String(h).length)
  for (const group of zoneGroups) {
    for (const r of group.rows) {
      const values = [group.zone, 0, r.district, r.total, r.done, r.notDone, r.pct]
      values.forEach((v, i) => { const len = typeof v === 'number' ? String(v).length + 2 : String(v ?? '').length; if (len > widths[i]) widths[i] = len })
    }
  }
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = Math.min(Math.max(w + 2, 10), 50) })
  ws.getColumn(1).width = Math.max(ws.getColumn(1).width, 34)
  return ws
}

/**
 * สร้าง + ดาวน์โหลด multi-sheet Excel report จาก drug_incidents (+ substance_users สำหรับ "แหล่งซื้อ")
 * @param {object} opts
 *   - incidentRows: drug_incidents rows ที่ filter ตาม view ปัจจุบันแล้ว (ปีงบ/เดือน/เขต/ชนิดยา ฯลฯ) — จะถูกกรองซ้ำเหลือแค่ 50 เขต กทม.
 *   - dealerRows: substance_users rows (dealer_locations) filter ตามช่วงเวลาเดียวกัน — ใส่ [] ถ้าไม่มี
 *   - mode: 'district' (default, 5 sheet ตามเดิม) | 'zone' (4 sheet สรุปตาม 6 กลุ่มโซน แทนรายเขต)
 *   - dateRange: { from, to } (ISO date string, ใส่ฝั่งไหนก็ได้) — override periodLabel ด้วยการกรอง incidentRows
 *     ตาม received_date ที่นี่โดยตรง (centralized ที่เดียว กันแต่ละหน้า implement ซ้ำ) ใส่ null/undefined = ไม่กรอง (ใช้ incidentRows ตามที่ส่งมา)
 *   - periodLabel: ข้อความช่วงเวลา เช่น "ปีงบ 2569 (1 ต.ค. 2568 - 31 พ.ค. 2569)"
 *   - filterLabel: ข้อความตัวกรองที่ใช้อยู่ เช่น "ทุกเขต · ทุกชนิดยา"
 *   - filenamePrefix: เติมหน้า `-YYYY-MM-DD.xlsx` (default '1386-report') — โหมด zone เติม `-zone` ต่อท้ายให้อัตโนมัติ
 */
export async function exportDrugIncidentReport({
  incidentRows = [], dealerRows = [], mode = 'district', dateRange = null,
  periodLabel = 'ทั้งหมด', filterLabel = 'ทุกเขต · ทุกชนิดยา', filenamePrefix = '1386-report',
} = {}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = '1386 Dashboard'
  wb.created = new Date()

  // dateRange (จาก ExportDialog โหมด "กำหนดเอง") — กรอง received_date ที่นี่ที่เดียว ก่อนตัดเหลือ 50 เขต
  const dateScopedRows = (dateRange?.from || dateRange?.to)
    ? incidentRows.filter((r) => withinRange(r.received_date, dateRange.from, dateRange.to))
    : incidentRows

  // บังคับ 50 เขต กทม. เท่านั้น — row ที่ district ไม่ตรง (สปพ./ไม่ระบุ/typo/null) ถูกตัดออกทุก sheet
  const validRows = dateScopedRows.filter((r) => VALID_DISTRICTS.has(r.district))
  const excludedCount = dateScopedRows.length - validRows.length

  const meta = [
    `ข้อมูล ณ วันที่: ${formatThaiDateTime(new Date())}`,
    `ช่วงเวลา: ${periodLabel}`,
    `ตัวกรอง: ${filterLabel}`,
  ]
  if (dateRange?.from && dateRange?.to) meta.push(`ช่วงข้อมูล: ${formatThaiDate(dateRange.from)} – ${formatThaiDate(dateRange.to)}`)
  if (excludedCount > 0) meta.push(`หมายเหตุ: ไม่รวม ${excludedCount.toLocaleString()} แถวที่ระบุเขตไม่ตรงกับ 50 เขต กทม.`)

  if (mode === 'zone') {
    const zoneSummaryRows = buildZoneSummary(validRows)
    writeSheet(wb, 'สรุปรายกลุ่มโซน', meta,
      ['กลุ่มโซน', 'จำนวนเขต', 'ร้องเรียน', 'ดำเนินการแล้ว', 'ยังไม่ดำเนิน', '% สำเร็จ', 'เหตุการณ์'], zoneSummaryRows)

    const top3PerZone = buildTop3PerZone(validRows, zoneSummaryRows.map((r) => r.กลุ่มโซน))
    writeTop3PerZoneSheet(wb, meta, top3PerZone)

    const zoneDetailRows = buildDetailRowsZone(validRows)
    writeSheet(wb, 'รายละเอียดเรื่องร้องเรียน', meta,
      ['วันที่', 'กลุ่มโซน', 'แขวง', 'ชุมชน', 'พฤติการณ์', 'ชนิดยา', 'สถานะ', 'ผลการดำเนินการ'], zoneDetailRows)

    const { header: zoneStatusHeader, rows: zoneStatusRows } = buildStatusBreakdownZone(validRows)
    writeSheet(wb, 'สถานะการดำเนินการ', meta, zoneStatusHeader, zoneStatusRows)

    const chargeMeta = [...meta, 'หมายเหตุ: อ้างอิงจากพฤติการณ์ที่บันทึก (ไม่ใช่ข้อหาตามกฎหมาย) — หากต้องการข้อหาจริงตามกฎหมาย ต้อง re-parse ไฟล์ต้นทางเพิ่มคอลัมน์ 52-60']
    const chargeWs = writeSheet(wb, 'ข้อหา', chargeMeta,
      ['กลุ่มโซน', 'เสพ', 'จำหน่าย', 'เสพและจำหน่าย', 'ผลิต', 'รวม'], buildChargeBreakdownZone(validRows))
    chargeWs.getRow(chargeWs.rowCount).eachCell((cell) => { cell.font = { bold: true } }) // แถว "รวม"
  } else {
    const summaryRows = buildDistrictSummary(validRows, dealerRows)
    writeSheet(wb, 'สรุปรายเขต', meta,
      ['เขต', 'กลุ่มโซน', 'ร้องเรียนทั้งหมด', 'ดำเนินการแล้ว', 'ยังไม่ดำเนินการ', '% ดำเนินการ', 'แหล่งซื้อ'], summaryRows)

    const detailRows = buildDetailRows(validRows)
    writeSheet(wb, 'รายละเอียดเรื่องร้องเรียน', meta,
      ['วันที่', 'เขต', 'แขวง', 'ชุมชน', 'กลุ่มโซน', 'พฤติการณ์', 'ชนิดยา', 'สถานะ', 'ผลการดำเนินการ'], detailRows)

    const { header: statusHeader, rows: statusRows } = buildStatusBreakdown(validRows)
    writeSheet(wb, 'สถานะการดำเนินการ', meta, statusHeader, statusRows)

    const top5Rows = buildTop5(summaryRows)
    writeSheet(wb, 'Top 5 เขตร้องเรียนสูงสุด', meta,
      ['อันดับ', 'เขต', 'กลุ่มโซน', 'จำนวนร้องเรียน', 'ดำเนินการแล้ว', 'ยังไม่ดำเนิน', '% สำเร็จ'], top5Rows)

    writeChargeSheet(wb, meta, buildChargeBreakdown(validRows))
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filenamePrefix}${mode === 'zone' ? '-zone' : ''}-${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
