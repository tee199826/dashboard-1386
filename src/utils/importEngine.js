import * as XLSX from 'xlsx'

// ─── Mapping ชื่อ header ภาษาไทย → ชื่อคอลัมน์ DB ───────────────────────────

const COMPLAINTS_MAP = {
  'แหล่งข่าว':           'channel',
  'เขต':                 'district',
  'แขวง':                'subdistrict',
  'หมู่บ้าน/ชุมชน':      'community',
  'หมู่บ้าน':            'community',
  'จังหวัด':             'province',
  'ประเภทบุคคล':         'person_type',
  'เพศ':                 'sex',
  'อาชีพ':               'occupation',
  'บทบาท':               'role',
  'การดำเนินการ':        'action_unit',
  'ระดับความเร่งด่วน':   'urgency',
  'ผลการดำเนินการ':      'status',
  'ผลการดำเนินงาน':      'status',
  'ยาเสพติด':            'drug',
  'ประเภทพื้นที่':        'area_type',
  'วันที่รับเรื่อง':      'received_date',
  'วันที่รับผล':          'completed_date',
  'กลุ่มเรื่อง':          'group_no',
}

const DRUG_INCIDENTS_MAP = {
  'วันที่รับเรื่อง':      'received_date',
  'แขวง':                'subdistrict',
  'เขต':                 'district',
  'หมู่บ้าน/ชุมชน':      'community',
  'หมู่บ้าน':            'community',
  'พฤติการณ์':           'behaviors',
  'ยาหลัก':              'primary_drug',
  'ผลดำเนินการ':         'primary_action',
  'สน.':                 'police_station',
  'lat':                 'lat',
  'lng':                 'lng',
  'latitude':            'lat',
  'longitude':           'lng',
  'พิกัด lat':           'lat',
  'พิกัด lng':           'lng',
}

// ─── Helper: แปลงวันที่เป็น YYYY-MM-DD ────────────────────────────────────────

function parseDate(value) {
  if (value == null || value === '' || value === '-') return null

  // SheetJS อาจส่ง Date object มาตรงๆ
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null
    return value.toISOString().slice(0, 10)
  }

  // Excel serial number (number)
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value)
    if (!date) return null
    const m = String(date.m).padStart(2, '0')
    const d = String(date.d).padStart(2, '0')
    return `${date.y}-${m}-${d}`
  }

  // string: ลอง parse หลายรูปแบบ
  const str = String(value).trim()

  // รูปแบบ DD/MM/YYYY หรือ DD-MM-YYYY (ปี ค.ศ. หรือ พ.ศ.)
  const dmyMatch = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
  if (dmyMatch) {
    let [, d, m, y] = dmyMatch
    // ถ้าปีเกิน 2500 สันนิษฐานว่าเป็น พ.ศ.
    if (parseInt(y) > 2500) y = String(parseInt(y) - 543)
    const date = new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`)
    if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10)
  }

  // รูปแบบ YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    let y = parseInt(isoMatch[1])
    if (y > 2500) y -= 543
    const rest = str.slice(4)
    const date = new Date(`${y}${rest}`)
    if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10)
  }

  const d = new Date(str)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)

  return null
}

// Helper: ค่าว่าง / '-' / 'null' → null
function normalizeValue(v) {
  if (v == null) return null
  const s = String(v).trim()
  if (s === '' || s === '-' || s.toLowerCase() === 'null') return null
  return s
}

// ─── 1. parseFile ─────────────────────────────────────────────────────────────

/**
 * รับ File object (.xlsx/.xls/.csv) แล้วคืน array ของ plain object
 * แต่ละ object มี key = ชื่อ header, value = ค่าในเซลล์
 * ข้ามแถวที่ว่างทั้งหมด
 */
export async function parseFile(file) {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,   // ให้ SheetJS แปลง serial → Date อัตโนมัติ
    dateNF: 'yyyy-mm-dd',
  })

  // อ่านชีทแรก
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]

  const rawRows = XLSX.utils.sheet_to_json(sheet, {
    defval: null,      // เซลล์ว่างให้เป็น null แทน undefined
    raw: false,        // ให้ SheetJS format ค่าออกมา (วันที่จะเป็น string)
  })

  // ข้ามแถวที่ทุก value เป็น null/ว่าง
  return rawRows.filter(row =>
    Object.values(row).some(v => v != null && String(v).trim() !== '')
  )
}

// ─── 2. detectType ────────────────────────────────────────────────────────────

/**
 * เดาประเภทไฟล์จาก header
 * คืน 'complaints' | 'drug_incidents' | 'unknown'
 */
export function detectType(rows) {
  if (!rows || rows.length === 0) return 'unknown'

  const headers = Object.keys(rows[0]).map(h => h.trim().toLowerCase())

  // ถ้ามี lat/lng หรือ "พิกัด" → drug_incidents
  const hasCoordsHeader = headers.some(h =>
    h === 'lat' || h === 'lng' ||
    h === 'latitude' || h === 'longitude' ||
    h.includes('พิกัด')
  )
  if (hasCoordsHeader) return 'drug_incidents'

  // ถ้ามีค่า lat/lng จริงในข้อมูล (กรณี header ชื่อแปลก)
  const sample = rows.slice(0, 5)
  const hasCoordValues = sample.some(row =>
    Object.entries(row).some(([k, v]) => {
      const key = k.trim().toLowerCase()
      return (key === 'lat' || key === 'lng') && v != null && v !== ''
    })
  )
  if (hasCoordValues) return 'drug_incidents'

  // ถ้ามี header ลักษณะ complaints
  const complaintsSignals = ['แหล่งข่าว', 'เขต', 'แขวง', 'ยาเสพติด', 'กลุ่มเรื่อง']
  const hasComplaints = complaintsSignals.some(sig =>
    headers.includes(sig.toLowerCase())
  )
  if (hasComplaints) return 'complaints'

  return 'unknown'
}

// ─── 3. mapColumns ────────────────────────────────────────────────────────────

const DATE_COLUMNS = new Set(['received_date', 'completed_date'])

/**
 * แปลง key ภาษาไทยจาก Excel → ชื่อคอลัมน์ DB
 * วันที่แปลงเป็น YYYY-MM-DD, ค่าว่าง/'-'/'null' เป็น null
 * คอลัมน์ที่ไม่อยู่ใน mapping จะถูกข้าม
 */
export function mapColumns(rows, type) {
  const mapping = type === 'drug_incidents' ? DRUG_INCIDENTS_MAP : COMPLAINTS_MAP

  // สร้าง lookup โดย trim header ก่อนเทียบ
  return rows.map(row => {
    const mapped = {}
    for (const [rawKey, rawVal] of Object.entries(row)) {
      const key = rawKey.trim()
      const dbCol = mapping[key]
      if (!dbCol) continue  // ข้ามคอลัมน์ที่ไม่อยู่ใน mapping

      if (DATE_COLUMNS.has(dbCol)) {
        mapped[dbCol] = parseDate(rawVal)
      } else if (dbCol === 'lat' || dbCol === 'lng') {
        const n = parseFloat(rawVal)
        mapped[dbCol] = isNaN(n) ? null : n
      } else {
        mapped[dbCol] = normalizeValue(rawVal)
      }
    }
    return mapped
  })
}

// ─── 4. buildBatch ────────────────────────────────────────────────────────────

/**
 * เพิ่ม batch_id, source_file, row_index, record_uid ให้ทุกแถว
 * record_uid รูปแบบ: YYYYMMDD-HHmmss#000001
 */
export function buildBatch(rows, fileName, type) {
  const now = new Date()
  const pad = (n, len = 2) => String(n).padStart(len, '0')
  const batchId = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('') + '-' + [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('')

  const enriched = rows.map((row, i) => {
    const rowIndex = i + 1
    return {
      ...row,
      batch_id:    batchId,
      source_file: fileName,
      row_index:   rowIndex,
      record_uid:  `${batchId}#${pad(rowIndex, 6)}`,
    }
  })

  return { batchId, rows: enriched }
}

// ─── 5. validateRows ──────────────────────────────────────────────────────────

/**
 * ตรวจสอบความถูกต้องของข้อมูลหลัง mapColumns
 * คืน { validCount, issues: [{rowIndex, field, message}] }
 */
export function validateRows(rows, type) {
  const issues = []

  for (const row of rows) {
    const i = row.row_index ?? '?'

    // ตรวจวันที่รับเรื่อง: ถ้า source มีค่าแต่ map แล้วได้ null = parse ไม่ได้
    // หมายเหตุ: ตรวจที่ null หลัง map เพราะ parseDate คืน null เมื่อ parse ไม่ได้
    if (row.received_date === null && row.source_file) {
      // ไม่ error ถ้าไม่มีฟิลด์นี้เลย แต่ถ้ามีแล้วเป็น null แสดงว่า parse ไม่ได้
      // (ตรวจด้วยการเช็คว่าแถวมี key received_date อยู่หรือเปล่า)
      if ('received_date' in row) {
        issues.push({
          rowIndex: i,
          field:    'received_date',
          message:  'แปลงวันที่ไม่ได้ (ค่าอาจเป็น null หรือรูปแบบไม่ถูกต้อง)',
        })
      }
    }

    if (type === 'complaints') {
      // ต้องมีอย่างน้อย district หรือ subdistrict
      if (!row.district && !row.subdistrict) {
        issues.push({
          rowIndex: i,
          field:    'district/subdistrict',
          message:  'ไม่มีทั้ง district และ subdistrict — ระบุพื้นที่ไม่ได้',
        })
      }
    }

    if (type === 'drug_incidents') {
      // lat ต้องมีและเป็นตัวเลข
      if (row.lat == null || typeof row.lat !== 'number') {
        issues.push({
          rowIndex: i,
          field:    'lat',
          message:  'lat ว่างหรือไม่ใช่ตัวเลข',
        })
      }
      // lng ต้องมีและเป็นตัวเลข
      if (row.lng == null || typeof row.lng !== 'number') {
        issues.push({
          rowIndex: i,
          field:    'lng',
          message:  'lng ว่างหรือไม่ใช่ตัวเลข',
        })
      }
    }
  }

  const invalidRows = new Set(issues.map(i => i.rowIndex))
  const validCount = rows.length - invalidRows.size

  return { validCount, issues }
}
