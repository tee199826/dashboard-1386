// pixelMapExcel.js — Export Excel ของหน้า /pixel-map
// ตัวเลขมาจาก hierarchy ชุดเดียวกับที่แผนที่และแผงรายละเอียดใช้ (ตามช่วงเวลาที่เลือก) จึงตรงกับบนจอเสมอ
// ชีท: รายละเอียดพื้นที่ (พื้นที่ในแผง = ที่คลิกเลือกไว้ หรือเขตกลางแผนที่) / รายเขต / รายแขวง / รายชุมชน
import ExcelJS from 'exceljs'
import { BEHAVIOR_FLAGS, nodeDetail, communityList, resolveAreaNode } from './pixelMapData'
import { localDateISO } from './fiscalYear'
import { formatThaiDate } from './heroMeta'
import { DNAME_TO_GROUP } from './constants'

const LEVEL_LABEL = { district: 'เขต', subdistrict: 'แขวง', community: 'ชุมชน' }
const HEADER_FILL = 'FF334155'
const FMT = { num: '#,##0', pct: '0.0%' }
const COMMUNITY_NOTE = 'หมายเหตุ: รายชื่อชุมชนนับเฉพาะชุมชนที่มีพิกัดในข้อมูล (เรื่องที่ระบุชุมชนแต่ไม่มีพิกัดนับอยู่ใน "ในชุมชน" แต่ไม่อยู่ในรายชื่อ)'
const BEHAVIOR_NOTE = 'หมายเหตุ: หนึ่งเรื่องมีได้หลายพฤติการณ์ ยอดพฤติการณ์รวมกันจึงอาจเกินจำนวนเรื่อง'

const behaviorColumns = BEHAVIOR_FLAGS.map(([col, label]) => ({ header: label, key: col, fmt: 'num' }))

function thaiDateTime(d) {
  return `${formatThaiDate(localDateISO(d))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function metricsOf(node) {
  const count = node?.count ?? 0
  const inCommunity = node?.inCommunity ?? 0
  const row = { count, inCommunity, outCommunity: Math.max(0, count - inCommunity), inPct: count ? inCommunity / count : 0 }
  for (const [col] of BEHAVIOR_FLAGS) row[col] = node?.byBehavior?.[col] ?? 0
  return row
}

// ตารางหนึ่งก้อน: หัวตาราง (พื้นเข้ม ตัวขาว) + แถวข้อมูล + รูปแบบตัวเลขรายคอลัมน์ ; คืนเลขแถวของหัวตาราง
function addTable(ws, columns, rows) {
  const headerRow = ws.addRow(columns.map(c => c.header))
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { vertical: 'middle' }
  })
  for (const r of rows) {
    const excelRow = ws.addRow(columns.map(c => r[c.key]))
    columns.forEach((c, i) => { if (c.fmt) excelRow.getCell(i + 1).numFmt = FMT[c.fmt] })
  }
  return headerRow.number
}

// ความกว้างคอลัมน์ตามข้อความที่ยาวที่สุด (ข้ามแถวคำอธิบายด้านบนที่ยาวทั้งประโยค)
function autoWidth(ws, fromRow) {
  const widths = []
  ws.eachRow((row, n) => {
    if (n < fromRow) return
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const v = cell.value
      const len = typeof v === 'number' ? String(Math.round(v)).length + 3 : String(v ?? '').length
      widths[col] = Math.max(widths[col] ?? 0, len)
    })
  })
  widths.forEach((w, col) => { if (w) ws.getColumn(col).width = Math.min(Math.max(w + 2, 10), 48) })
}

// ตารางยาว: ตรึงหัวตาราง + ใส่ตัวกรองให้กดเลือกได้ใน Excel
function freezeAndFilter(ws, headerRowNo, columnCount) {
  ws.views = [{ state: 'frozen', ySplit: headerRowNo }]
  ws.autoFilter = { from: { row: headerRowNo, column: 1 }, to: { row: headerRowNo, column: columnCount } }
}

function addMeta(ws, lines) {
  lines.forEach((line, i) => {
    const row = ws.addRow([line])
    if (i === 0) row.getCell(1).font = { bold: true, size: 14 }
  })
  ws.addRow([])
}

function addDetailSheet(wb, { area, hierarchy, commonMeta }) {
  const node = resolveAreaNode(hierarchy, area)
  const detail = nodeDetail(node)
  if (!detail || detail.count === 0) return false

  const ws = wb.addWorksheet('รายละเอียดพื้นที่')
  const title = `${LEVEL_LABEL[area.level] ?? ''} ${String(area.label).replace(/^(เขต|แขวง|ชุมชน)\s*/, '')}`.trim()
  const where = area.level === 'community' ? `แขวง${area.sub ?? '-'} · ${area.dname}` : area.level === 'subdistrict' ? area.dname : null
  addMeta(ws, [`รายละเอียดพื้นที่ — ${title}`, ...(where ? [`อยู่ใน: ${where}`] : []), ...commonMeta])
  const tableStart = ws.rowCount + 1

  const summary = [{ topic: 'จำนวนเรื่องทั้งหมด', n: detail.count, pct: 1 }]
  if (area.level !== 'community') {
    summary.push(
      { topic: 'ในชุมชน', n: detail.inCommunity, pct: detail.count ? detail.inCommunity / detail.count : 0 },
      { topic: 'นอกชุมชน', n: detail.outCommunity, pct: detail.count ? detail.outCommunity / detail.count : 0 },
    )
  }
  addTable(ws, [{ header: 'หัวข้อ', key: 'topic' }, { header: 'จำนวน', key: 'n', fmt: 'num' }, { header: 'สัดส่วน', key: 'pct', fmt: 'pct' }], summary)
  ws.addRow([])

  addTable(ws, [{ header: 'พฤติการณ์', key: 'label' }, { header: 'จำนวน', key: 'n', fmt: 'num' }],
    detail.behaviors.length ? detail.behaviors : [{ label: 'ไม่ระบุพฤติการณ์', n: 0 }])
  ws.addRow([BEHAVIOR_NOTE])
  ws.addRow([])

  if (area.level !== 'community') {
    const communities = communityList(hierarchy, area.dname, area.level === 'subdistrict' ? area.label : null)
    ws.addRow([`ชุมชนที่พบเหตุการณ์ ${communities.length.toLocaleString()} แห่ง`]).getCell(1).font = { bold: true }
    addTable(ws,
      [{ header: 'ลำดับ', key: 'rank' }, { header: 'ชุมชน', key: 'name' }, { header: 'แขวง', key: 'subdistrict' }, { header: 'จำนวนเรื่อง', key: 'count', fmt: 'num' }],
      communities.map((c, i) => ({ ...c, rank: i + 1 })))
    ws.addRow([COMMUNITY_NOTE])
  }
  autoWidth(ws, tableStart)
  return true
}

function addListSheet(wb, name, { meta, columns, rows }) {
  const ws = wb.addWorksheet(name)
  addMeta(ws, meta)
  const headerRowNo = addTable(ws, columns, rows)
  freezeAndFilter(ws, headerRowNo, columns.length)
  autoWidth(ws, headerRowNo)
}

/**
 * hierarchy: จาก getCommunityHierarchy (กรองช่วงเวลาแล้ว) ; periodLabel: ข้อความช่วงเวลาที่เลือก (ปีงบ / เดือน / ช่วงวันที่)
 * detailArea: พื้นที่ในแผงรายละเอียด (ที่คลิกเลือกไว้ / เขตกลางแผนที่) — ไม่มีหรือไม่มีข้อมูล = ไม่ใส่ชีทนี้
 * checked*: พื้นที่ที่ติ๊กบนแผนที่ — ใส่เครื่องหมายในคอลัมน์ "ติ๊กบนแผนที่" ให้กรองใน Excel ได้
 */
export async function exportPixelMapExcel({
  hierarchy = {}, periodLabel = 'ทุกปี', detailArea = null,
  checkedDistricts = new Set(), checkedSubdistricts = new Set(), checkedCommunities = new Set(),
} = {}) {
  const now = new Date()
  const commonMeta = [
    `ช่วงเวลา: ${periodLabel}`,
    'แหล่งข้อมูล: เหตุการณ์ยาเสพติด (drug_incidents)',
    `ส่งออกเมื่อ: ${thaiDateTime(now)}`,
  ]
  const ticked = (has) => (has ? '✓' : '')

  const districtRows = []
  const subdistrictRows = []
  const communityRows = []
  // เอาเฉพาะ 50 เขตทางการ (ชุดเดียวกับที่วาดบนแผนที่) — ข้อมูลจริงมีช่องเขตที่กรอกเป็นอำเภอนอก กทม. แต่ขึ้นต้นด้วย "เขต"
  // (เช่น "เขตอำเภอเมืองสมุทรปราการ") ซึ่งหลุดตัวกรองที่ดูแค่คำนำหน้า ; ตัดออกแล้วบอกจำนวนไว้ในหมายเหตุ
  let outsideRecords = 0
  let outsideNames = 0
  for (const [dname, d] of Object.entries(hierarchy)) {
    if (!DNAME_TO_GROUP[dname]) {
      outsideRecords += d.meta?.count ?? 0
      outsideNames++
      continue
    }
    districtRows.push({
      district: dname, ...metricsOf(d.meta),
      communities: communityList(hierarchy, dname).length, ticked: ticked(checkedDistricts.has(dname)),
    })
    for (const [sub, s] of Object.entries(d.subdistricts ?? {})) {
      subdistrictRows.push({
        district: dname, subdistrict: sub, ...metricsOf(s.meta),
        communities: Object.keys(s.communities ?? {}).length, ticked: ticked(checkedSubdistricts.has(`${dname}|${sub}`)),
      })
      for (const [name, c] of Object.entries(s.communities ?? {})) {
        communityRows.push({
          district: dname, subdistrict: sub, community: name, ...metricsOf(c),
          ticked: ticked(checkedCommunities.has(`${dname}|${sub}|${name}`)),
        })
      }
    }
  }
  const outsideNote = outsideRecords > 0
    ? [`หมายเหตุ: ไม่รวม ${outsideRecords.toLocaleString()} เรื่องที่ช่องเขตระบุพื้นที่นอก กทม. (${outsideNames} ชื่อ)`]
    : []
  const byCount = (a, b) => b.count - a.count
  districtRows.sort(byCount)
  subdistrictRows.sort(byCount)
  communityRows.sort(byCount)

  const areaMetricColumns = [
    { header: 'จำนวนเรื่อง', key: 'count', fmt: 'num' },
    { header: 'ในชุมชน', key: 'inCommunity', fmt: 'num' },
    { header: 'นอกชุมชน', key: 'outCommunity', fmt: 'num' },
    { header: '% ในชุมชน', key: 'inPct', fmt: 'pct' },
    ...behaviorColumns,
  ]

  const wb = new ExcelJS.Workbook()
  wb.creator = '1386 Dashboard'
  wb.created = now

  if (detailArea) addDetailSheet(wb, { area: detailArea, hierarchy, commonMeta })

  addListSheet(wb, 'รายเขต', {
    meta: ['สรุปรายเขต', ...commonMeta, `รวม ${districtRows.length.toLocaleString()} เขต`, BEHAVIOR_NOTE, ...outsideNote],
    columns: [{ header: 'เขต', key: 'district' }, ...areaMetricColumns,
      { header: 'ชุมชนที่พบ (แห่ง)', key: 'communities', fmt: 'num' }, { header: 'ติ๊กบนแผนที่', key: 'ticked' }],
    rows: districtRows,
  })
  addListSheet(wb, 'รายแขวง', {
    meta: ['สรุปรายแขวง', ...commonMeta, `รวม ${subdistrictRows.length.toLocaleString()} แขวง`, BEHAVIOR_NOTE, ...outsideNote],
    columns: [{ header: 'เขต', key: 'district' }, { header: 'แขวง', key: 'subdistrict' }, ...areaMetricColumns,
      { header: 'ชุมชนที่พบ (แห่ง)', key: 'communities', fmt: 'num' }, { header: 'ติ๊กบนแผนที่', key: 'ticked' }],
    rows: subdistrictRows,
  })
  addListSheet(wb, 'รายชุมชน', {
    meta: ['สรุปรายชุมชน', ...commonMeta, `รวม ${communityRows.length.toLocaleString()} ชุมชน`, COMMUNITY_NOTE, ...outsideNote],
    columns: [{ header: 'เขต', key: 'district' }, { header: 'แขวง', key: 'subdistrict' }, { header: 'ชุมชน', key: 'community' },
      { header: 'จำนวนเรื่อง', key: 'count', fmt: 'num' }, ...behaviorColumns, { header: 'ติ๊กบนแผนที่', key: 'ticked' }],
    rows: communityRows,
  })

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pixel-map-${localDateISO(now)}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000) // revoke ทันทีหลัง click บางเบราว์เซอร์ยังดาวน์โหลดไม่ทัน
}
