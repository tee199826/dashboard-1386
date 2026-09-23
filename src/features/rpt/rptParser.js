import * as XLSX from 'xlsx'

// rptParser — อ่านรายงาน ปปส. ตระกูล RPT_73 (รายบุคคล) และ RPT_111 (รายพื้นที่)
//
// รูปแบบไฟล์ (เหมือนกันทั้ง 5 รายงาน — ตรวจจากไฟล์จริง 14/09/2569):
//   แถว 1      หัวรายงาน + "Report ID: 73_1"   ⚠️ RPT_111_5 หัวรายงานว่าง ต้องอ่าน Report ID แทน
//   แถว 2-7    พารามิเตอร์ที่สั่งพิมพ์ (ภาค/จังหวัด/ช่วงวันที่/วันที่พิมพ์)
//   แถว 8-9    หัวคอลัมน์ 2 ชั้น (merge) — ชั้นบนเป็นกลุ่ม เช่น "ผลการดำเนินการ"
//   แถว 10+    ข้อมูล
//
// ⚠️ กับดัก 3 ข้อที่ทำให้ parse ผิด ถ้าไม่ระวัง:
//   1) 1 เรคอร์ด = หลายแถวจริง (merge แนวตั้ง เพราะช่องบรรยายยาว) — ต้องรวมกลับด้วย "ลำดับที่"
//      นับแถวตรง ๆ จะได้ 542 แถวทั้งที่มีจริง 207 ราย
//   2) ตำแหน่งคอลัมน์ไม่ตรงกันระหว่างไฟล์ (73_1 เริ่มคอลัมน์ B, 73_2/73_3 เริ่ม C) — ห้าม hardcode index
//      ต้องแมปด้วย "ชื่อหัวคอลัมน์" เท่านั้น
//   3) ชื่อ "ผลการดำเนินการ" โผล่ซ้ำได้ 2 ที่ในไฟล์เดียว (สถานะได้รับผล / ผลการดำเนินงาน)
//      แยกด้วยตำแหน่ง: ก่อนคอลัมน์ "หน่วยงาน" = สถานะ, หลัง = ผลการดำเนินงาน

// ── ชื่อหัวคอลัมน์ในไฟล์ -> ชื่อฟิลด์ในระบบ ────────────────────────────────
// key = หัวคอลัมน์หลังรวมชั้นบน/ล่างแล้ว (ชั้นบน + ' / ' + ชั้นล่าง เมื่อไม่ซ้ำกัน)
const FIELD_MAP = {
  'ลำดับที่': 'seq',
  'แหล่งข่าว': 'source',
  'เลขที่ร้องเรียน': 'complaint_no',
  'ภาพถ่าย': 'photo',
  'เลขที่บุคคล': 'person_no',
  'ครั้ง (ทั้งหมด)': 'report_count',
  'ครั้ง (ห้วง)': 'report_count_period',
  'จำนวนครั้งที่ร้องเรียน': 'report_count',
  'ประเภทบุคคล': 'person_type',
  'เพศ': 'gender',
  'ชื่อ': 'first_name',
  'นามสกุล': 'last_name',
  'ชื่ออื่นๆ': 'aka',
  'อาชีพ': 'occupation',
  'ตำแหน่ง': 'position',
  'เลขบัตรประชาชน': 'national_id',
  'วดป เกิด': 'birth_date',
  'ที่อยู่ตาม ทร. 14': 'addr_house_reg',
  'บทบาท': 'role',
  'ส่งดำเนินการ (สปป/ปปส.ภาค)': 'send_to',
  'ปปส. ภาค': 'ppsm_region',
  'ระดับความเร่งด่วน': 'urgency',
  'ยาเสพติด': 'drug_types',
  'ประเภทพื้นที่': 'area_type',
  'รายละเอียดพื้นที่': 'area_detail',
  'รายละเอียดพฤติการณ์': 'behavior_detail',
  'เอกสารแนบ': 'has_attachment',

  // กลุ่มที่อยู่ — ตระกูล 111 ไม่มีชั้นบน, ตระกูล 73 มีชั้นบน "ที่อยู่ปัจจุบัน/..."
  'รายละเอียดที่อยู่': 'addr_detail',
  'ชุมชน': 'src_community',
  'หมู่บ้าน': 'src_village',
  'ตำบล': 'subdistrict',
  'อำเภอ': 'district',
  'จังหวัด': 'province',

  // กลุ่มขั้นตอนดำเนินการ
  'การรับเรื่อง / การดำเนินการ': 'recv_action',
  'การรับเรื่อง / วันที่รับเรื่อง': 'recv_date',
  'การส่งตรวจสอบ / หน่วยงาน': 'send_agency',
  'การส่งตรวจสอบ / เลขที่หนังสือส่ง': 'send_doc_no',
  'การส่งตรวจสอบ / วันที่': 'send_date',
  'ผลการดำเนินการ': 'result_status',          // ⚠️ กำกวม — แก้ด้วยตำแหน่ง (ดู resolveField)
  'ผลการดำเนินการ / หน่วยงาน': 'result_agency',
  'ผลการดำเนินการ / เลขที่หนังสือรับ': 'result_doc_no',
  'ผลการดำเนินการ / วันที่': 'result_date',
  'ผลการดำเนินการ / พฤติการณ์': 'result_behavior',
  'ผลการดำเนินการ / วันที่ดำเนินการ': 'result_action_date',
  'ผลการดำเนินการ / พฤติการณ์ยาเสพติด': 'drug_behavior',
  'ผลการดำเนินการ / มาตรการต่อบุคคล': 'person_measure',
  'ผลการดำเนินการ / ผลการดำเนินงาน': 'result_operation',
  'ผลการดำเนินการ / รายละเอียด': 'result_detail',
  'ผลการดำเนินการ / มีเอกสารแนบ': 'has_attachment',
}

// ฟิลด์ที่มีได้หลายค่าต่อ 1 เรคอร์ด (แต่ละแถวย่อย = 1 รายการ) — รวมด้วยขึ้นบรรทัดใหม่
const MULTILINE_FIELDS = new Set(['result_detail', 'behavior_detail', 'area_detail'])

// ── ชื่อกลุ่มรายงาน ────────────────────────────────────────────────────────
// RPT_111_5 หัวรายงานว่างในไฟล์ต้นทาง (ข้อบกพร่องของระบบที่ออกรายงาน) จึงตั้งชื่อให้เอง
// no    = เลขกลุ่มตามที่ ปปส. เรียก (ใช้เรียงและเป็นหัวข้อในหน้านำเข้า)
// title  = ชื่อกลุ่มอย่างที่เจ้าหน้าที่เรียกกันจริง
// file   = ชื่อไฟล์ที่ระบบต้นทางออกให้ — ใช้บอกใบ้ว่าช่องนี้ต้องใส่ไฟล์ไหน
export const REPORT_GROUPS = {
  '73_1': { no: 1, kind: 'person', file: 'RPT_73_1', title: 'บุคคลที่พบพฤติการณ์',
    label: 'บุคคล · กลุ่ม 1 พบพฤติการณ์', short: 'ก.1 พบพฤติการณ์' },
  '73_2': { no: 2, kind: 'person', file: 'RPT_73_2', title: 'บุคคลมีตัวตน ไม่พบประวัติ',
    label: 'บุคคล · กลุ่ม 2 มีตัวตน ไม่พบประวัติ', short: 'ก.2 ไม่พบประวัติ' },
  '73_3': { no: 3, kind: 'person', file: 'RPT_73_3', title: 'บุคคลที่ยังพิสูจน์ทราบตัวตนไม่ได้',
    label: 'บุคคล · กลุ่ม 3 ยังพิสูจน์ทราบตัวตนไม่ได้', short: 'ก.3 พิสูจน์ไม่ได้' },
  '111_4': { no: 4, kind: 'place', file: 'RPT_111_4', title: 'พื้นที่ร้องเรียน — สถานที่',
    label: 'พื้นที่ · กลุ่ม 4 สถานที่', short: 'ก.4 สถานที่' },
  '111_5': { no: 5, kind: 'place', file: 'RPT_111_5', title: 'พื้นที่ร้องเรียน — พื้นที่/บริเวณ',
    label: 'พื้นที่ · กลุ่ม 5 พื้นที่/บริเวณ', short: 'ก.5 พื้นที่' },
}

// เรียงตามเลขกลุ่ม 1-5 — ใช้เป็นลำดับหัวข้อในหน้านำเข้า
export const REPORT_ORDER = Object.keys(REPORT_GROUPS)
  .sort((a, b) => REPORT_GROUPS[a].no - REPORT_GROUPS[b].no)

const txt = (v) => (v == null ? '' : String(v).replace(/\u00A0/g, ' ').trim())

// หัวคอลัมน์ในไฟล์จริงมีขึ้นบรรทัดใหม่และช่องว่างซ้อน ("ส่งดำเนินการ\n(สปป/ปปส.ภาค)", "ครั้ง   (ห้วง)")
// ยุบให้เหลือช่องว่างเดียวก่อนเทียบกับ FIELD_MAP
const normHeader = (v) => txt(v).replace(/\s+/g, ' ')

// แปลง "dd/mm/yyyy" พ.ศ. -> "yyyy-mm-dd" ค.ศ. ; คืน null ถ้าไม่ใช่วันที่ที่เป็นไปได้
// ไฟล์จริงมีค่าเพี้ยนปน (พบ "07/07/3112" ใน RPT_111_5 และ "00/00/2543" ใน RPT_73_3)
// ⚠️ วันเกิดกับวันที่ดำเนินการใช้ช่วงปีคนละแบบ — วันเกิดย้อนไปได้ถึงร้อยปี
const YEAR_RANGE = { event: [2540, 2575], birth: [2440, 2575] }
export function thaiDateToISO(v, kind = 'event') {
  const s = txt(v)
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (!m) return null
  const d = +m[1], mo = +m[2], by = +m[3]
  const [lo, hi] = YEAR_RANGE[kind] || YEAR_RANGE.event
  if (by < lo || by > hi) return null
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const iso = `${by - 543}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return Number.isNaN(Date.parse(iso)) ? null : iso
}

// อ่านค่าเซลล์เป็นข้อความ (ใช้ .w ที่ Excel จัดรูปแบบไว้ก่อน เพื่อไม่ให้เลข 13 หลักกลายเป็น 2.568e12)
function cellText(ws, r, c) {
  const cell = ws[XLSX.utils.encode_cell({ r, c })]
  if (!cell) return ''
  if (cell.w != null) return txt(cell.w)
  return txt(cell.v)
}

// สร้างตารางข้อความเต็มแผ่น พร้อม "เท" ค่าของเซลล์ที่ merge ลงทุกช่องในขอบเขต
function readGrid(ws) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  const nRow = range.e.r + 1, nCol = range.e.c + 1
  const grid = Array.from({ length: nRow }, (_, r) =>
    Array.from({ length: nCol }, (_, c) => cellText(ws, r, c)))

  for (const m of ws['!merges'] || []) {
    const v = grid[m.s.r]?.[m.s.c] || ''
    if (!v) continue
    for (let r = m.s.r; r <= m.e.r && r < nRow; r++)
      for (let c = m.s.c; c <= m.e.c && c < nCol; c++)
        if (!grid[r][c]) grid[r][c] = v
  }
  return grid
}

// "Report ID: 111_5" -> "111_5"  (หาได้ทั้งแถว เพราะตำแหน่งต่างกันในแต่ละไฟล์)
function findReportId(grid) {
  for (let r = 0; r < Math.min(6, grid.length); r++) {
    for (const cell of grid[r]) {
      const m = /Report\s*ID\s*[:：]\s*([\d_]+)/i.exec(cell)
      if (m) return m[1]
    }
  }
  return null
}

// หัวรายงานจริงจากแถวแรกของไฟล์
// เช่น "รายงานแสดงรายละเอียดของบุคคลผู้ถูกร้องเรียน กลุ่มที่ 1 บุคคลที่พบพฤติการณ์"
// ⚠️ ต้องอ่านจากไฟล์ ไม่ใช่เดาจาก Report ID — เอาไว้ให้คนตรวจด้วยตาว่าหยิบไฟล์ถูกกลุ่ม
//    (RPT_111_5 แถวแรกว่างเปล่า เป็นข้อบกพร่องของระบบต้นทาง → คืน null ให้ผู้เรียกจัดการ)
function findTitle(grid) {
  const cells = (grid[0] || []).filter((c) => c && !/Report\s*ID/i.test(c))
  if (!cells.length) return null
  // แถวแรกถูก merge ไว้ ค่าเดียวกันจึงซ้ำหลายช่อง — เอาข้อความที่ยาวที่สุดพอ
  return cells.reduce((a, b) => (b.length > a.length ? b : a))
}

// หัวรายงานเขียนถึง "กลุ่มที่ N" หรือ "กลุ่ม N" ตรงกับเลขกลุ่มที่คาดไว้ไหม
// ไฟล์จริงเขียนไม่เหมือนกันทุกฉบับ: "กลุ่มที่ 1 บุคคลที่พบพฤติการณ์" / "กลุ่ม 3: ยังพิสูจน์ทราบ..."
// จึงตัดช่องว่างทิ้งก่อนแล้วเทียบตรง ๆ (เลี่ยง regex ที่ประกอบจากตัวแปร)
function titleMentionsGroup(title, no) {
  const t = String(title).replace(/\s/g, '')
  return t.includes(`กลุ่มที่${no}`) || t.includes(`กลุ่ม${no}`)
}

// แถวหัวคอลัมน์ = แถวแรกที่มีคำว่า "ลำดับที่"
function findHeaderRow(grid) {
  for (let r = 0; r < Math.min(20, grid.length); r++)
    if (grid[r].some((c) => c === 'ลำดับที่')) return r
  return -1
}

// อ่านค่าพารามิเตอร์จากหัวรายงาน เช่น label 'ระหว่างวันที่' -> '01 ต.ค. 68-31 ธ.ค. 68'
// ค่าอยู่ถัดจากป้ายในแถวเดียวกัน (ข้ามช่องว่างและช่องที่ merge ซ้ำป้ายเดิม)
function findParam(grid, label, headerRow) {
  for (let r = 0; r < headerRow; r++) {
    const row = grid[r]
    for (let c = 0; c < row.length; c++) {
      if (!row[c].startsWith(label)) continue
      for (let k = c + 1; k < row.length; k++)
        if (row[k] && row[k] !== row[c]) return row[k]
    }
  }
  return null
}

// รวมหัวคอลัมน์ 2 ชั้นเป็นชื่อเดียว แล้วแมปเป็นชื่อฟิลด์
// - ชื่อซ้ำ (เกิดจาก merge ล้นไปคอลัมน์ข้าง ๆ) ใช้ตัวแรกเสมอ
// - "ผลการดำเนินการ" เดี่ยว ๆ : ก่อนเจอ result_agency = สถานะได้รับผล / หลังจากนั้น = ผลการดำเนินงาน
function buildColumnMap(grid, headerRow) {
  const top = grid[headerRow] || []
  const bottom = grid[headerRow + 1] || []
  const map = {}          // field -> column index
  const headers = []      // [{ col, name, field }] ไว้ debug/แสดงผล
  let seenResultAgency = false

  for (let c = 0; c < Math.max(top.length, bottom.length); c++) {
    const a = normHeader(top[c]), b = normHeader(bottom[c])
    const name = a && b && a !== b ? `${a} / ${b}` : (a || b)
    if (!name) continue

    // ลองชื่อเต็ม (ชั้นบน / ชั้นล่าง) ก่อน แล้วค่อยถอยไปใช้ชื่อชั้นล่างอย่างเดียว
    // ตระกูล 73 ตั้งชั้นบนของกลุ่มที่อยู่ว่า "ที่อยู่ปัจจุบัน/ที่อยู่ที่มีพฤติการณ์" ส่วน 111 ไม่มีชั้นบน
    // — ชั้นล่าง (ตำบล/อำเภอ/จังหวัด/ชุมชน/หมู่บ้าน/รายละเอียดที่อยู่) ตรงกันทั้งสองตระกูล
    let field = FIELD_MAP[name] || (b ? FIELD_MAP[b] : undefined)
    if (field === 'result_agency') seenResultAgency = true
    if (field === 'result_status' && seenResultAgency) field = 'result_operation'
    headers.push({ col: c, name, field: field || null })
    if (field && map[field] === undefined) map[field] = c
  }
  return { map, headers }
}

/**
 * อ่านไฟล์รายงาน 1 ไฟล์
 * @param {ArrayBuffer} buf   เนื้อไฟล์ .xlsx
 * @param {string} fileName   ชื่อไฟล์ (ใช้เดา Report ID สำรอง และแสดงใน error)
 * @returns {{reportId, group, kind, params, records, headers, warnings, stats}}
 */
export function parseRptWorkbook(buf, fileName = '') {
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error(`${fileName}: ไม่พบชีตในไฟล์`)

  const grid = readGrid(ws)
  const warnings = []

  // ⚠️ ห้ามใช้ชื่อชีตระบุรายงาน — RPT_73_2 ตั้งชื่อชีตผิดเป็น "RPT_73_1"
  let reportId = findReportId(grid)
  if (!reportId) {
    const m = /RPT[_\s]*(\d+[_\s]*\d*)/i.exec(fileName)
    reportId = m ? m[1].replace(/\s/g, '_') : null
    if (reportId) warnings.push(`${fileName}: ไม่พบ "Report ID" ในไฟล์ — เดาจากชื่อไฟล์เป็น ${reportId}`)
  }
  if (!reportId || !REPORT_GROUPS[reportId])
    throw new Error(`${fileName}: ไม่รู้จักรายงานนี้ (Report ID = ${reportId || 'ไม่พบ'}) — รองรับเฉพาะ ${Object.keys(REPORT_GROUPS).join(', ')}`)

  // หัวรายงานจากไฟล์ + ตรวจว่าตรงกับกลุ่มที่ Report ID บอกไหม
  // ทั้งสองค่ามาจากคนละที่ในไฟล์ ถ้าขัดกันแปลว่าไฟล์ผิดปกติ ต้องเตือนคนใช้
  const title = findTitle(grid)
  const g = REPORT_GROUPS[reportId]
  if (!title) {
    warnings.push(`${fileName}: ไฟล์ไม่มีหัวรายงานในแถวแรก (ระบบต้นทางออกไฟล์มาแบบนี้) — ใช้ชื่อกลุ่มตาม Report ID ${reportId} แทน`)
  } else if (g && !titleMentionsGroup(title, g.no)) {
    warnings.push(`${fileName}: หัวรายงาน "${title}" ไม่ได้ระบุว่าเป็นกลุ่ม ${g.no} ทั้งที่ Report ID เป็น ${reportId} — ตรวจไฟล์ก่อนใช้งาน`)
  }

  const headerRow = findHeaderRow(grid)
  if (headerRow < 0) throw new Error(`${fileName}: หาแถวหัวคอลัมน์ไม่เจอ (ไม่มีคำว่า "ลำดับที่")`)

  const { map, headers } = buildColumnMap(grid, headerRow)
  if (map.seq === undefined) throw new Error(`${fileName}: ไม่พบคอลัมน์ "ลำดับที่"`)
  if (map.complaint_no === undefined) throw new Error(`${fileName}: ไม่พบคอลัมน์ "เลขที่ร้องเรียน"`)

  const params = {
    region: findParam(grid, 'ปปส. ภาค', headerRow),
    province: findParam(grid, 'จังหวัด', headerRow),
    source_unit: findParam(grid, 'หน่วยงานนำเข้าข้อมูล', headerRow),
    period: findParam(grid, 'ระหว่างวันที่', headerRow),
    printed_at: findParam(grid, 'วันที่พิมพ์', headerRow),
    printed_time: findParam(grid, 'เวลาพิมพ์', headerRow),
  }

  // ── รวมแถวย่อยกลับเป็นเรคอร์ดเดียว ────────────────────────────────────────
  // จัดกลุ่มตาม "ลำดับที่" : ทุกแถวที่ลำดับเดียวกันคือรายเดียวกัน
  const groups = new Map()
  for (let r = headerRow + 2; r < grid.length; r++) {
    const seq = grid[r][map.seq]
    if (!/^\d+$/.test(seq)) continue
    if (!groups.has(seq)) groups.set(seq, [])
    groups.get(seq).push(grid[r])
  }

  const seen = new Map()
  const records = []
  for (const [seq, rows] of groups) {
    const rec = { report_id: reportId, seq: +seq }

    for (const [field, col] of Object.entries(map)) {
      if (field === 'seq') continue
      // เก็บค่าไม่ซ้ำตามลำดับที่พบ — คอลัมน์ที่ merge จะได้ค่าเดียว, ช่องบรรยายได้หลายค่า
      const vals = []
      for (const row of rows) {
        const v = txt(row[col])
        if (v && !vals.includes(v)) vals.push(v)
      }
      if (!vals.length) continue
      rec[field] = MULTILINE_FIELDS.has(field) ? vals.join('\n') : vals[0]
    }

    // แปลงวันที่ พ.ศ. -> ISO (เก็บค่าดิบไว้ด้วยเมื่อแปลงไม่ได้ จะได้ตรวจย้อนได้)
    for (const f of ['recv_date', 'send_date', 'result_date', 'result_action_date', 'birth_date']) {
      if (!rec[f]) continue
      const iso = thaiDateToISO(rec[f], f === 'birth_date' ? 'birth' : 'event')
      if (iso) { rec[`${f}_raw`] = rec[f]; rec[f] = iso }
      else { rec[`${f}_raw`] = rec[f]; rec[f] = null; warnings.push(`${fileName} ลำดับ ${seq}: วันที่ "${rec[`${f}_raw`]}" ไม่ถูกต้อง — เก็บเป็นค่าว่าง`) }
    }

    rec.report_count = rec.report_count ? parseInt(rec.report_count, 10) || null : null
    rec.report_count_period = rec.report_count_period ? parseInt(rec.report_count_period, 10) || null : null
    rec.has_attachment = !!rec.has_attachment

    // คีย์ถาวรของเรคอร์ด — ใช้ upsert เพื่อไม่ให้นำเข้าซ้ำแล้วได้แถวซ้ำ
    // (ตรวจไฟล์จริงแล้ว: 73_* คู่ เลขที่ร้องเรียน+เลขที่บุคคล ไม่ซ้ำ, 111_* เลขที่ร้องเรียนไม่ซ้ำ)
    let uid = `${reportId}|${rec.complaint_no || '-'}|${rec.person_no || '-'}`
    if (seen.has(uid)) {
      const n = seen.get(uid) + 1
      seen.set(uid, n)
      uid = `${uid}#${n}`
      warnings.push(`${fileName} ลำดับ ${seq}: คีย์ซ้ำกับรายการก่อนหน้า — ต่อท้ายเป็น ${uid}`)
    } else seen.set(uid, 1)
    rec.record_uid = uid
    rec.period_label = params.period || null
    rec.report_title = title || null
    rec.printed_at = thaiDateToISO(params.printed_at) || null

    records.push(rec)
  }

  return {
    reportId,
    title,                                   // หัวรายงานตามที่เขียนไว้ในไฟล์ (null = ไฟล์ไม่มี)
    group: REPORT_GROUPS[reportId],
    kind: REPORT_GROUPS[reportId].kind,
    sheetName,
    params,
    headers,
    records,
    warnings,
    stats: { physicalRows: grid.length - headerRow - 2, records: records.length },
  }
}

// ── แยกฟิลด์ที่ระบุตัวบุคคล ออกจากฟิลด์ทั่วไป ─────────────────────────────
// ใช้ตอนบันทึกลงฐาน: 2 ตารางแยกกัน (rpt_records / rpt_records_pii) ตามแนวเดียวกับ interview_records
export const PII_FIELDS = [
  'first_name', 'last_name', 'aka', 'national_id', 'birth_date', 'birth_date_raw',
  'addr_house_reg', 'addr_detail', 'area_detail', 'behavior_detail', 'result_detail',
]

// ⚠️ ต้องครอบคลุมหัวคอลัมน์ "ทุกช่อง" ที่ FIELD_MAP อ่านได้ (ยกเว้นที่ย้ายไป PII_FIELDS)
// ช่อง photo/position/send_doc_no/result_doc_no ว่าง 100% ในไฟล์ชุด ต.ค.-ธ.ค. 68
// แต่ยังเก็บไว้ เพราะรายงานมีช่องนี้จริง และไฟล์งวดหน้าอาจมีค่า — เทส coverage คุมไว้แล้ว
const BASE_FIELDS = [
  'record_uid', 'report_id', 'seq', 'complaint_no', 'person_no', 'source',
  'photo', 'position', 'send_doc_no', 'result_doc_no',
  'report_count', 'report_count_period', 'person_type', 'gender', 'occupation', 'role',
  'src_community', 'src_village', 'subdistrict', 'district', 'province',
  'send_to', 'ppsm_region', 'urgency', 'drug_types', 'area_type',
  'recv_action', 'recv_date', 'send_agency', 'send_date',
  'result_status', 'result_agency', 'result_date', 'result_behavior', 'result_action_date',
  'drug_behavior', 'person_measure', 'result_operation', 'has_attachment', 'period_label',
  'report_title', 'printed_at',
]

export function splitRecord(rec) {
  const base = {}, pii = { record_uid: rec.record_uid }
  for (const f of BASE_FIELDS) if (rec[f] !== undefined) base[f] = rec[f]
  for (const f of PII_FIELDS) if (rec[f] !== undefined && rec[f] !== null && rec[f] !== '') pii[f] = rec[f]
  return { base, pii: Object.keys(pii).length > 1 ? pii : null }
}
