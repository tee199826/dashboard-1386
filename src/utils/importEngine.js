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

// ─── ชุดคอลัมน์จริงใน DB (จาก schema check) — สำหรับ identity passthrough ──────
// header ใน Excel ที่ตรงชื่อคอลัมน์ DB ใช้ได้ตรงๆ ไม่ต้องผ่าน mapping ภาษาไทย
// (ไม่รวม audit/auto column: created_at, updated_at, batch_id, record_uid,
//  source_file, row_index — จัดการโดย buildBatch / DB default)
const DRUG_INCIDENTS_COLUMNS = new Set([
  'seq', 'received_date', 'group_no', 'sex', 'community', 'subdistrict',
  'nispa_code', 'lat', 'lng', 'area_group', 'drugs', 'primary_drug',
  'behaviors', 'investigation_result', 'actions', 'primary_action',
  'place_type', 'channel', 'police_station', 'status', 'district',
])
const COMPLAINTS_COLUMNS = new Set([
  'group_no', 'received_date', 'completed_date', 'channel', 'district',
  'subdistrict', 'community', 'province', 'person_type', 'sex',
  'occupation', 'role', 'action_unit', 'urgency', 'status', 'drug',
  'area_type',
])

// substance_users — flat DB columns (jsonb ประกอบจาก flatten ไม่ผ่าน identity passthrough)
const SUBSTANCE_USERS_COLUMNS = new Set([
  'record_no', 'district', 'subdistrict', 'occupation', 'income_range',
  'arrest_count', 'rehab_count', 'first_use_age', 'first_drug', 'first_reason',
  'surveyed_at',
])
// header ไทย (จาก Google Form export) → DB column หรือ __helper (สำหรับประกอบ jsonb)
// ⚠️ key ต้องตรงเป๊ะกับ header ในไฟล์ (รวมช่องว่าง/วงเล็บ) — flatten ใช้ exact match ไม่ trim
// column นอก map (~121 ตัว รวม PII) ถูก drop เงียบๆ (flatten อ่านเฉพาะ key ใน map)
const SUBSTANCE_USERS_MAP = {
  // ── พื้นฐาน ──
  'ประทับเวลา':                'surveyed_at',
  'อายุ (ปี)':                 'age',
  'อาชีพ':                     'occupation',
  'รายได้ต่อเดือน (บาท)':       'income_range',

  // ── จับ ──
  'เคยถูกจับคดียาเสพติดหรือไม่':        '__arrest_yn',
  'จำนวนครั้งที่ถูกจับคดียาเสพติด  (โปรดระบุข้อมูลรายละเอียดการถูกจับ 2 ครั้งล่าสุด ในข้อถัดไป)':  'arrest_count',
  'ครั้งที่':           '__arrest_1_no',
  'ข้อหา':             '__arrest_1_charge',
  'ชนิดยาเสพติด':       '__arrest_1_drug',
  'เมื่อปี':            '__arrest_1_year',
  'ครั้งที่ 2':         '__arrest_2_no',
  'ข้อหา 2':           '__arrest_2_charge',
  'ชนิดยาเสพติด 2':     '__arrest_2_drug',
  'เมื่อปี 2':          '__arrest_2_year',

  // ── บำบัด ──
  'เคยเข้ารับการบำบัดยาเสพติดหรือไม่':        '__rehab_yn',
  'จำนวนครั้งที่เข้ารับการบำบัดยาเสพติด  (โปรดระบุข้อมูลรายละเอียดการบำบัด 2 ครั้งล่าสุด ในข้อถัดไป)':  'rehab_count',
  'ครั้งที่ 3':         '__rehab_1_no',
  'ชนิดยาเสพติด 3':     '__rehab_1_drug',
  'สถานที่บำบัด':       '__rehab_1_place',
  'เมื่อปี 3':          '__rehab_1_year',
  'ครั้งที่ 4':         '__rehab_2_no',
  'ชนิดยาเสพติด 4':     '__rehab_2_drug',
  'สถานที่บำบัด 2':     '__rehab_2_place',
  'เมื่อปี 4':          '__rehab_2_year',

  // ── ครั้งแรก ──
  '3. การเสพยาครั้งแรก อายุประมาณ (ปี)': 'first_use_age',
  'ชนิดยาเสพติดที่ใช้เสพครั้งแรก':     'first_drug',
  'สาเหตุที่ใช้ยาเสพติดครั้งแรก':      'first_reason',

  // ── ยาประจำ + ราคา ──
  'ยาเสพติดหลักที่ใช้เป็นประจำ': '__primary_drug',
  'ราคาต่อหน่วย (ระบุหน่วย) ':   '__price_yaba',
  'ห้วงเวลา (เดือน/ปี)':         '__period_yaba',
  'ราคาต่อหน่วย (ระบุหน่วย)  2': '__price_ice',
  'ห้วงเวลา (เดือน/ปี) 2':       '__period_ice',
  'ราคาต่อหน่วย (ระบุหน่วย)  3': '__price_heroin',
  'ห้วงเวลา (เดือน/ปี) 3':       '__period_heroin',
  'ราคาต่อหน่วย (ระบุหน่วย)  4': '__price_ketamine',
  'ห้วงเวลา (เดือน/ปี) 4':       '__period_ketamine',
  'ระบุตัวยา 2':                 '__other_name_1',
  'ราคาต่อหน่วย (ระบุหน่วย)  5': '__price_other_1',
  'ห้วงเวลา (เดือน/ปี) 5':       '__period_other_1',
  'ระบุตัวยา 3':                 '__other_name_2',
  'ราคาต่อหน่วย (ระบุหน่วย)  6': '__price_other_2',
  'ห้วงเวลา (เดือน/ปี) 6':       '__period_other_2',

  // ── แหล่งซื้อ ──
  'แหล่งที่ซื้อได้ประจำ บริเวณ/สถานที่/จุดสังเกต': '__dealer_area',
  'ชุมชน/หมู่บ้าน':   '__dealer_community',
  'แขวง/ตำบล 2':     '__dealer_subdistrict',
  'จังหวัด 4':        '__dealer_province',
  'เขต/อำเภอ 4':     '__dealer_district',
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

// Helper: Google Form timestamp "ประทับเวลา" → ISO "YYYY-MM-DD" (ปี ค.ศ.)
//   ⚠️ cell เก็บปนกัน 2 แบบ (Date/serial จาก cellDates + text) → ต้อง handle ทุก type
//   ⚠️ เลี่ยง toISOString() เพราะ shift ตาม timezone — ใช้ component ตรงๆ (no TZ math)
function parseTimestamp(v) {
  if (v == null || v === '') return null
  const fmt = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  // Case 1: Date object (cellDates: true)
  if (v instanceof Date && !isNaN(v)) {
    const y = v.getFullYear()
    if (y < 2020 || y > 2030) return null
    return fmt(y, v.getMonth() + 1, v.getDate())
  }

  // Case 2: Excel serial number (เช่น 45967) — Excel epoch 1899-12-30, คำนวณแบบ UTC ไม่มี TZ shift
  if (typeof v === 'number' && v > 1000 && v < 100000) {
    const ms = Date.UTC(1899, 11, 30) + v * 86400000
    const date = new Date(ms)
    const y = date.getUTCFullYear()
    if (y < 2020 || y > 2030) return null
    return fmt(y, date.getUTCMonth() + 1, date.getUTCDate())
  }

  // Case 3: string — ISO "YYYY-MM-DD..." หรือ "M/D/YYYY [HH:MM:SS]" (Google Form locale = en-US → M/D)
  const s = String(v).trim()
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (isoMatch) {
    const y = parseInt(isoMatch[1])
    if (y < 2020 || y > 2030) return null
    return fmt(y, parseInt(isoMatch[2]), parseInt(isoMatch[3]))
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  let month = parseInt(m[1])             // en-US: M/D/YYYY
  let day = parseInt(m[2])
  let year = parseInt(m[3])
  if (year >= 2500) year -= 543          // เผื่อมี พ.ศ. ปน (Google Form ใช้ ค.ศ. เป็นหลัก)
  // auto-swap: ถ้า slot แรก > 12 แต่ slot สอง ≤ 12 → จริงๆ เป็น D/M ปนมา → สลับกลับ
  if (month > 12 && day <= 12) { const t = month; month = day; day = t }
  if (year < 2020 || year > 2030) return null
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  return fmt(year, month, day)
}

// Helper: ค่าว่าง / '-' / 'null' → null
function normalizeValue(v) {
  if (v == null) return null
  const s = String(v).trim()
  if (s === '' || s === '-' || s.toLowerCase() === 'null') return null
  return s
}

// Helper: hash สั้นๆ จาก string (deterministic, no deps) — ใช้ fallback record_uid
// คืน hex ดิบ (caller เติม prefix 'h:' เองเพื่อกันชนกับ uid แบบ timestamp)
function simpleHash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(16)
}

// ─── Smart price parser — free-form text → ราคา normalize ต่อ 1 หน่วย ──────────
//   เช่น "50 บาท/เม็ด" → {price:50, unit:'เม็ด'} ; "1.4 กรัม /500 บาท" → {price:357, unit:'กรัม'}
//   คืน null ถ้า: ไม่มีตัวเลข / ไม่มีหน่วย / ratio / นอกช่วง sanity
//   หลัก: amount = เลขที่ติดหน่วยด้วย "ช่องว่าง" (= ปริมาณ) ; "เลข/หน่วย" = ราคาต่อหน่วย (amount=1)
const PRICE_UNIT_RE = '(?:กรัม|เม็ด|จี|ตัก|ถุง|หลอด|ก้อน)'
function parsePrice(text) {
  if (!text || typeof text !== 'string') return null
  const s = text.trim().toLowerCase()
  if (!s || !/\d/.test(s)) return null              // ไม่มีตัวเลข → "ไม่ทราบราคา", "ปกติ"

  let unit = null                                    // ไม่มีหน่วย → skip ("30", "1/400")
  if (/กรัม|\/g\b|gram/.test(s)) unit = 'กรัม'
  else if (/เม็ด/.test(s)) unit = 'เม็ด'
  else if (/จี/.test(s)) unit = 'จี'
  else if (/ตัก/.test(s)) unit = 'ตัก'
  else if (/ถุง/.test(s)) unit = 'ถุง'
  else if (/หลอด/.test(s)) unit = 'หลอด'
  else if (/ก้อน/.test(s)) unit = 'ก้อน'
  if (!unit) return null

  const allNums = (s.match(/[\d.]+/g) || []).map(parseFloat).filter(n => !isNaN(n))
  if (!allNums.length) return null
  const avg = (a, b) => (a + b) / 2

  // ปริมาณ (amount): "<เลข> <หน่วย>" (ช่องว่างคั่น) = ปริมาณ ; "<เลข>/หน่วย" = ต่อหน่วย (amount=1)
  let amount = 1
  const qtyNums = []
  const rangeUnit = s.match(new RegExp(`([\\d.]+)\\s*-\\s*([\\d.]+)\\s*${PRICE_UNIT_RE}`))
  const singleUnit = s.match(new RegExp(`([\\d.]+)\\s*${PRICE_UNIT_RE}`))
  if (rangeUnit) {
    amount = avg(parseFloat(rangeUnit[1]), parseFloat(rangeUnit[2]))
    qtyNums.push(parseFloat(rangeUnit[1]), parseFloat(rangeUnit[2]))
  } else if (singleUnit) {
    amount = parseFloat(singleUnit[1])
    qtyNums.push(parseFloat(singleUnit[1]))
  }

  // ราคา (price): ใกล้ "บาท"/"฿" ก่อน ; ไม่งั้นใช้เลขที่เหลือ (ตัดปริมาณออก) / ช่วงราคา
  let price
  const bahtMatch = s.match(/([\d.]+)\s*(?:บาท|฿)/)
  if (bahtMatch) {
    price = parseFloat(bahtMatch[1])
  } else {
    const rest = allNums.slice()
    for (const q of qtyNums) { const i = rest.indexOf(q); if (i >= 0) rest.splice(i, 1) }
    const priceRange = s.match(/([\d.]+)\s*-\s*([\d.]+)/)
    if (priceRange && !rangeUnit) price = avg(parseFloat(priceRange[1]), parseFloat(priceRange[2]))
    else if (rest.length) price = Math.max(...rest)
    else price = Math.max(...allNums)
  }

  if (price == null || isNaN(price) || price < 10) return null
  if (!amount || amount <= 0) amount = 1
  const normalizedPrice = price / amount
  if (normalizedPrice < 10 || normalizedPrice > 50000) return null   // sanity

  return { price: Math.round(normalizedPrice), unit, rawPrice: price, amount }
}

// ─── 1. parseFile ─────────────────────────────────────────────────────────────

/**
 * รับ File object (.xlsx/.xls/.csv) แล้วคืน { rows, workbook }
 * rows = array ของ plain object (key = header, value = ค่าในเซลล์)
 * workbook = raw workbook สำหรับ parser พิเศษ (เช่น parse115B)
 */
export async function parseFile(file) {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
    dateNF: 'yyyy-mm-dd',
  })

  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]

  const rawRows = XLSX.utils.sheet_to_json(sheet, {
    defval: null,
    raw: false,
  })

  const rows = rawRows.filter(row =>
    Object.values(row).some(v => v != null && String(v).trim() !== '')
  )

  return { rows, workbook }
}

// ─── 2. detectType ────────────────────────────────────────────────────────────

/**
 * เดาประเภทไฟล์จากเนื้อหา
 * คืน 'complaints' | 'drug_incidents' | 'bkn_summary' | 'unknown'
 */
export function detectType(rows) {
  if (!rows || rows.length === 0) return 'unknown'

  const allVals = rows.flatMap(r => Object.values(r)).map(v => String(v ?? '').trim())

  // report_114: ตรวจจาก header row-0 keys (sheet title) หรือค่าใน cells
  const firstRowKeys = rows.length > 0 ? Object.keys(rows[0]).map(k => String(k ?? '').trim()) : []
  const hasRpt114 = firstRowKeys.some(k => k.includes('รายงานการดำเนินการตามข้อร้องเรียน') || /Report\s*ID:\s*114/.test(k))
    || allVals.some(v => v.includes('รายงานการดำเนินการตามข้อร้องเรียน') || /Report\s*ID:\s*114/.test(v))
  if (hasRpt114) return 'report_114'

  // bkn_summary: ตรวจหา "กลุ่ม 1" และ "บก.น." ในค่าทุก cell
  const hasGroup1 = allVals.some(v => /กลุ่ม\s*1/.test(v))
  const hasBkn    = allVals.some(v => /^บก\.(น|สปพ)/.test(v))
  if (hasGroup1 && hasBkn) return 'bkn_summary'

  const headers = Object.keys(rows[0]).map(h => h.trim().toLowerCase())

  // substance_users: ตรวจ marker เฉพาะตัว (ก่อน drug_incidents เพราะมี dealer_N_lat ด้วย)
  if (headers.includes('first_use_age') || headers.includes('dealer_1_lat') || headers.includes('record_no')) {
    return 'substance_users'
  }

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
  const dbCols  = type === 'drug_incidents' ? DRUG_INCIDENTS_COLUMNS : COMPLAINTS_COLUMNS

  // หา dbCol ของ header: ลอง mapping ภาษาไทยก่อน → ถ้าไม่เจอ ลอง identity (ตรงชื่อ DB)
  const resolveCol = header => mapping[header] || (dbCols.has(header) ? header : null)

  // ── เตือน silent loss: ถ้า > 30% ของ header ในไฟล์ map ไม่ได้เลย ──
  if (rows.length > 0) {
    const headers = Object.keys(rows[0]).map(k => k.trim())
    const unknown = headers.filter(h => !resolveCol(h))
    if (headers.length > 0 && unknown.length / headers.length > 0.30) {
      console.warn(
        `[importEngine] ${type}: map ไม่ได้ ${unknown.length}/${headers.length} คอลัมน์ ` +
        `(อาจสูญข้อมูลบางส่วน) → ${unknown.join(', ')}`
      )
    }
  }

  return rows.map(row => {
    const mapped = {}
    for (const [rawKey, rawVal] of Object.entries(row)) {
      const key = rawKey.trim()
      const dbCol = resolveCol(key)
      if (!dbCol) continue  // ข้ามคอลัมน์ที่ map ไม่ได้และไม่ตรงชื่อ DB column

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

// ─── 3b. flattenSubstanceUserRow ──────────────────────────────────────────────

/**
 * แปลง 1 แถวจากไฟล์ Google Form export (header ไทย ~146 คอลัมน์) → row substance_users
 * ขั้นตอน:
 *  1. ใช้ SUBSTANCE_USERS_MAP map header ไทย → DB column / __helper (exact match ไม่ trim)
 *     column นอก map (~121 ตัว รวม PII) ถูก drop เงียบๆ — ไม่ identity passthrough
 *  2. ประกอบ jsonb 4 ก้อนจาก __helper แล้ว strip __helper ออก (ไม่ใส่ใน output)
 * edge cases:
 *  - cell ว่าง/'-'/'null' → null ; ตัวเลข parse ไม่ได้ → null
 *  - arrest_count/rehab_count ว่าง → 0
 *  - array item ข้ามเมื่อ key หลักว่าง (arrests/rehabs:ไม่มี drug, regular_drugs:ไม่มี price/ชื่อยาอื่น, dealer:พื้นที่ว่างหมด)
 */
export function flattenSubstanceUserRow(row, fileName, rowIndex) {
  // ดึง fiscal_year จากชื่อไฟล์ — ถ้าไม่เจอ → null (DB ใส่ default ให้)
  let fiscal_year = null
  if (fileName) {
    const fy = String(fileName).match(/ปีงบประมาณ\s*(\d{4})/) || String(fileName).match(/(\d{4})/)
    if (fy) fiscal_year = parseInt(fy[1], 10)
  }

  // map header ไทย → ชื่อ target (DB col / __helper) ด้วย exact match; นอก map ทิ้ง
  const m = {}
  for (const [header, target] of Object.entries(SUBSTANCE_USERS_MAP)) {
    if (header in row) m[target] = row[header]
  }

  const sv = key => normalizeValue(m[key])                    // string | null
  const nv = key => {                                          // number | null
    const n = parseFloat(String(m[key] ?? '').replace(/,/g, ''))
    return isNaN(n) ? null : n
  }
  const cnt = key => {                                         // count → integer (default 0)
    const n = parseInt(String(m[key] ?? '').replace(/,/g, ''), 10)
    return isNaN(n) ? 0 : n
  }

  // arrests: __arrest_N_drug/charge/year (ข้ามถ้าไม่มี drug)
  const arrests = []
  for (const i of [1, 2]) {
    const drug = sv(`__arrest_${i}_drug`)
    if (!drug) continue
    arrests.push({ drug, charge: sv(`__arrest_${i}_charge`), year: nv(`__arrest_${i}_year`) })
  }

  // rehabs: __rehab_N_drug/place/year (ข้ามถ้าไม่มี drug)
  const rehabs = []
  for (const i of [1, 2]) {
    const drug = sv(`__rehab_${i}_drug`)
    if (!drug) continue
    rehabs.push({ drug, place: sv(`__rehab_${i}_place`), year: nv(`__rehab_${i}_year`) })
  }

  // regular_drugs: 4 ยา fix + 2 ยาอื่น — parse ราคา free-form text → {price, unit, rawPrice, amount}
  //   ข้ามถ้า parsePrice คืน null (ไม่มีหน่วย/ราคา/นอก sanity) ; ยาอื่นข้ามถ้าชื่อยาว่าง
  const regular_drugs = []
  for (const d of [
    { key: 'yaba', name: 'ยาบ้า' }, { key: 'ice', name: 'ไอซ์' },
    { key: 'heroin', name: 'เฮโรอีน' }, { key: 'ketamine', name: 'คีตามีน' },
  ]) {
    const p = parsePrice(sv(`__price_${d.key}`))
    if (!p) continue
    regular_drugs.push({ drug: d.name, price: p.price, unit: p.unit, rawPrice: p.rawPrice, amount: p.amount, period: sv(`__period_${d.key}`) })
  }
  for (const i of [1, 2]) {
    const name = sv(`__other_name_${i}`)
    const p = parsePrice(sv(`__price_other_${i}`))
    if (!name || !p) continue
    regular_drugs.push({ drug: name, price: p.price, unit: p.unit, rawPrice: p.rawPrice, amount: p.amount, period: sv(`__period_other_${i}`) })
  }

  // dealer_locations: 1 แหล่ง (ข้ามถ้า area + community + subdistrict ว่างหมด)
  const dealer_locations = []
  const dArea = sv('__dealer_area')
  const dCommunity = sv('__dealer_community')
  const dSub = sv('__dealer_subdistrict')
  if (dArea || dCommunity || dSub) {
    dealer_locations.push({
      area:        dArea,
      community:   dCommunity,
      subdistrict: dSub,
      province:    sv('__dealer_province'),
      district:    sv('__dealer_district'),
    })
  }

  // scalar fields (คำนวณไว้ก่อนเพื่อใช้ทั้ง record_uid และ output)
  const surveyed_at   = parseTimestamp(m['surveyed_at'])
  const age           = nv('age')
  const occupation    = sv('occupation')
  const income_range  = sv('income_range')
  const first_use_age = nv('first_use_age')
  const first_drug    = sv('first_drug')
  const first_reason  = sv('first_reason')

  // record_uid — natural key สำหรับ upsert (กันอัปซ้ำ append)
  //   'ประทับเวลา' ในไฟล์มีแค่วันที่ (ไม่มีเวลา) → ซ้ำกันได้ → ห้ามใช้ timestamp ตรงๆ อย่างเดียว
  //   จึง hash content เสมอ (+ rowIndex กัน profile เหมือนกันเป๊ะในไฟล์เดียว) แล้วผนวกกับ timestamp
  //   อัปไฟล์เดิมซ้ำ → uid เท่าเดิม → UPSERT update ; แก้ profile → uid เปลี่ยน → INSERT snapshot ใหม่
  const rawTimestamp = m['surveyed_at']
  const district = dealer_locations[0]?.district ?? null   // ไม่มี district ระดับผู้เสพใน schema → ใช้ของแหล่งซื้อ
  const contentHash = simpleHash(
    [surveyed_at, age, occupation, income_range, district, first_drug, first_use_age, first_reason, rowIndex]
      .map(v => v || '').join('|')
  )
  const record_uid = rawTimestamp
    ? 'ts:' + String(rawTimestamp).trim() + ':' + contentHash
    : 'h:' + contentHash

  return {
    record_uid,
    fiscal_year,
    surveyed_at,
    age,
    occupation,
    income_range,
    arrest_count:  cnt('arrest_count'),
    arrests,
    rehab_count:   cnt('rehab_count'),
    rehabs,
    first_use_age,
    first_drug,
    first_reason,
    regular_drugs,
    dealer_locations,
  }
}

// ─── 4. buildBatch ────────────────────────────────────────────────────────────

// content fields ต่อ type — ใช้สร้าง record_uid แบบ content-hash (idempotent: อัปไฟล์เดิม = uid เดิม)
//   ใช้คอลัมน์เนื้อหา "ครบ" เพื่อให้ชนกัน (collapse) เฉพาะแถวที่ซ้ำกันจริงทุก field
//   complaints ไม่มี free-text/ID → ใช้คอลัมน์ categorical ทั้งหมด ; drug_incidents มี lat/lng เป็นตัวแยกหลัก
const CONTENT_KEY_FIELDS = {
  complaints: [
    'received_date', 'completed_date', 'channel', 'district', 'subdistrict', 'community',
    'province', 'person_type', 'sex', 'occupation', 'role', 'action_unit', 'urgency',
    'status', 'drug', 'area_type', 'group_no',
  ],
  drug_incidents: [
    'received_date', 'lat', 'lng', 'district', 'subdistrict', 'community',
    'behaviors', 'primary_drug', 'primary_action', 'police_station', 'status', 'seq', 'nispa_code',
  ],
}

function contentRecordUid(type, row) {
  const fields = CONTENT_KEY_FIELDS[type]
  const key = fields.map(f => `${f}=${row[f] ?? ''}`).join('|')
  return 'h:' + simpleHash(key)
}

/**
 * เพิ่ม batch_id, source_file, row_index, record_uid ให้ทุกแถว
 * record_uid:
 *   - complaints / drug_incidents → content-hash ('h:' + simpleHash จาก content fields) → idempotent
 *       + dedup ในไฟล์ (last-wins) กัน Postgres "ON CONFLICT ... cannot affect row a second time"
 *   - substance_users → คง record_uid เดิมจาก flattenSubstanceUserRow
 *   - อื่นๆ → fallback batchId#rowIndex
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

  const contentHashed = type === 'complaints' || type === 'drug_incidents'

  const enriched = rows.map((row, i) => {
    const rowIndex = i + 1
    const record_uid = contentHashed
      ? contentRecordUid(type, row)
      : (row.record_uid || `${batchId}#${pad(rowIndex, 6)}`)
    return {
      ...row,
      batch_id:    batchId,
      source_file: fileName,
      row_index:   rowIndex,
      record_uid,
    }
  })

  // dedup ในไฟล์เดียวกันตาม record_uid (เฉพาะ content-hash) — เก็บแถวสุดท้าย
  const finalRows = contentHashed
    ? Array.from(new Map(enriched.map(r => [r.record_uid, r])).values())
    : enriched

  return { batchId, rows: finalRows }
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

// ─── 6. parse115B ─────────────────────────────────────────────────────────────

/**
 * Parser สำหรับรายงานสรุป RPT_115_B (บก.น. 1-9 × กลุ่ม 1-5)
 * รับ XLSX workbook โดยตรง (ไม่ใช่ rows จาก sheet_to_json)
 * คืน array: [{ bkn, group_no, total, pending, done, period }]
 *
 * ยืดหยุ่น: ค้นหาแถว/คอลัมน์โดย pattern ไม่ผูกตำแหน่งตายตัว
 */
export function parse115B(workbook) {
  const sheetName = workbook.SheetNames[0]
  const ws = workbook.Sheets[sheetName]
  if (!ws || !ws['!ref']) throw new Error('ไม่พบข้อมูลในชีต — กรุณาตรวจสอบไฟล์')

  const range = XLSX.utils.decode_range(ws['!ref'])
  const maxR = range.e.r
  const maxC = range.e.c

  function cellStr(r, c) {
    const cell = ws[XLSX.utils.encode_cell({ r, c })]
    return cell ? String(cell.v ?? '').trim() : ''
  }

  function cellNum(r, c) {
    const cell = ws[XLSX.utils.encode_cell({ r, c })]
    if (!cell) return 0
    if (typeof cell.v === 'number') return cell.v
    const n = parseInt(String(cell.v).replace(/,/g, ''))
    return isNaN(n) ? 0 : n
  }

  // 1. หา period จากแถวหัวรายงาน (แถว 0-6)
  let period = null
  outer1:
  for (let r = 0; r <= Math.min(6, maxR); r++) {
    for (let c = 0; c <= maxC; c++) {
      if (cellStr(r, c).includes('ระหว่างวันที่')) {
        for (let dc = 1; dc <= 5; dc++) {
          const v = cellStr(r, c + dc)
          if (v && !v.includes('ระหว่างวันที่')) { period = v; break outer1 }
        }
      }
    }
  }

  // 2. หาแถวหัวตาราง: แถวที่มี "หน่วยงาน" ที่ col 1
  //    (แก้ bug เดิมที่ดักจาก title text "...กลุ่ม 1-5..." แถวแรก)
  let headerRow = -1
  const groupCols = {} // group_no (1-5) → คอลัมน์เริ่มต้นของกลุ่มนั้น

  for (let r = 0; r <= Math.min(20, maxR); r++) {
    // ตรวจ exact match เพื่อกันดัก title text ที่มี "หน่วยงาน" อยู่ด้วย
    if (cellStr(r, 1) !== 'หน่วยงาน') continue
    headerRow = r
    for (let c = 2; c <= maxC; c++) {
      const m = cellStr(r, c).match(/กลุ่ม\s*(\d)/)
      if (m) groupCols[parseInt(m[1])] = c
    }
    break
  }

  if (headerRow === -1)
    throw new Error('ไม่พบแถวหัวตาราง "หน่วยงาน" — ตรวจสอบว่าเป็นไฟล์รายงาน RPT_115_B')

  for (let g = 1; g <= 5; g++) {
    if (groupCols[g] === undefined)
      throw new Error(`ไม่พบตำแหน่งคอลัมน์ "กลุ่ม ${g}" ในหัวตาราง`)
  }

  // 3. ตรวจลำดับ sub-column จากแถว headerRow+1 (sub-header)
  //    ลำดับปกติ: จำนวนผู้ถูกร้องเรียน=total | ยังไม่ได้รับผล=pending | จำนวนผลดำเนินการ=done
  let totalOff = 0, pendingOff = 1, doneOff = 2
  const subR = headerRow + 1
  const gc1 = groupCols[1]
  for (let dc = 0; dc < 3; dc++) {
    const lbl = cellStr(subR, gc1 + dc)
    if (/ผู้ถูกร้องเรียน|เรื่องร้องเรียน/.test(lbl)) totalOff = dc
    else if (/ยังไม่ได้รับผล/.test(lbl)) pendingOff = dc
    else if (/ผลดำเนินการ/.test(lbl)) doneOff = dc
  }

  // 4. อ่านแถวข้อมูล: col 1 ขึ้นต้นด้วย "บก.น." หรือ "บก.สปพ"
  const records = []
  for (let r = headerRow + 2; r <= maxR; r++) {
    const bkn = cellStr(r, 1)
    if (!/^บก\.(น|สปพ)/.test(bkn)) continue
    if (/รวม/.test(bkn)) continue // ข้ามแถวสรุป

    for (let g = 1; g <= 5; g++) {
      const gc = groupCols[g]
      records.push({
        bkn,
        group_no: g,
        total:   cellNum(r, gc + totalOff),
        pending: cellNum(r, gc + pendingOff),
        done:    cellNum(r, gc + doneOff),
        period:  period ?? null,
      })
    }
  }

  if (records.length === 0)
    throw new Error('ไม่พบแถวข้อมูล บก.น. ในไฟล์ — กรุณาตรวจสอบฟอร์แมต')

  return records
}

// ─── 7. parse114 ──────────────────────────────────────────────────────────────

/**
 * Parser สำหรับรายงาน RPT_114 (การดำเนินการตามข้อร้องเรียน กลุ่ม 1-5 + รวม)
 * ใช้ positional column mapping (cols 1-31) ซึ่งตรงกับโครงสร้างไฟล์จริง
 * คืน array: [{ report_id, fiscal_year, period, group_name, group_no, ...30 fields }]
 */
export function parse114(workbook) {
  const sheetName = workbook.SheetNames[0]
  const ws = workbook.Sheets[sheetName]
  if (!ws || !ws['!ref']) throw new Error('ไม่พบข้อมูลในชีต — กรุณาตรวจสอบไฟล์')

  const range = XLSX.utils.decode_range(ws['!ref'])
  const maxR = range.e.r
  const maxC = range.e.c

  function cellStr(r, c) {
    const cell = ws[XLSX.utils.encode_cell({ r, c })]
    return cell ? String(cell.v ?? '').trim() : ''
  }

  function cellNum(r, c) {
    const cell = ws[XLSX.utils.encode_cell({ r, c })]
    if (!cell) return null
    if (typeof cell.v === 'number') return cell.v
    const s = String(cell.v).replace(/,/g, '').trim()
    if (s === '' || s === '-') return null
    const n = parseFloat(s)
    return isNaN(n) ? null : n
  }

  // 1. หา period และ fiscal_year จากแถว 0-6
  let period = null
  let fiscal_year = null
  outer1:
  for (let r = 0; r <= Math.min(6, maxR); r++) {
    for (let c = 0; c <= maxC; c++) {
      if (cellStr(r, c).includes('ระหว่างวันที่')) {
        for (let dc = 1; dc <= 8; dc++) {
          const v = cellStr(r, c + dc)
          if (v && /\d/.test(v)) {
            period = v
            // ดึงปีงบประมาณจากปลายช่วงวันที่ เช่น "01 ต.ค. 66-30 ก.ย. 67" → 2567
            const parts = v.split('-')
            const endStr = parts[parts.length - 1].trim()
            const yearMatch = endStr.match(/(\d{2,4})\s*$/)
            if (yearMatch) {
              let y = parseInt(yearMatch[1])
              if (y < 100) y += 2500  // ปีงบ 2 หลัก เช่น 67 → 2567
              fiscal_year = y
            }
            break outer1
          }
        }
      }
    }
  }

  // 2. อ่านแถวข้อมูล: col 1 ขึ้นต้นด้วย "กลุ่ม 1-5" หรือ "รวม"
  const records = []
  for (let r = 0; r <= maxR; r++) {
    const groupName = cellStr(r, 1)
    if (!/^กลุ่ม\s*[1-5]/.test(groupName) && !/^รวม/.test(groupName)) continue

    const groupNoMatch = groupName.match(/กลุ่ม\s*(\d)/)
    const group_no = groupNoMatch ? parseInt(groupNoMatch[1]) : null

    records.push({
      report_id:           '114',
      fiscal_year,
      period,
      group_name:          groupName,
      group_no,
      complaints:          cellNum(r, 2),
      processed:           cellNum(r, 3),
      percent:             cellNum(r, 4),
      found:               cellNum(r, 5),
      not_found:           cellNum(r, 6),
      not_in_area:         cellNum(r, 7),
      investigating:       cellNum(r, 8),
      deceased:            cellNum(r, 9),
      arrested:            cellNum(r, 10),
      more_invest:         cellNum(r, 11),
      rehab:               cellNum(r, 12),
      framed:              cellNum(r, 13),
      closed:              cellNum(r, 14),
      action_other:        cellNum(r, 15),
      charge_use:          cellNum(r, 16),
      charge_possess:      cellNum(r, 17),
      charge_sell:         cellNum(r, 18),
      charge_possess_sell: cellNum(r, 19),
      charge_none:         cellNum(r, 20),
      drug_yaba:           cellNum(r, 21),
      drug_ice:            cellNum(r, 22),
      drug_heroin:         cellNum(r, 23),
      drug_cannabis:       cellNum(r, 24),
      drug_kratom:         cellNum(r, 25),
      drug_inhalant:       cellNum(r, 26),
      drug_cough:          cellNum(r, 27),
      drug_none:           cellNum(r, 28),
      drug_other:          cellNum(r, 29),
      id_13:               cellNum(r, 30),
      expand:              cellNum(r, 31),
    })
  }

  if (records.length === 0)
    throw new Error('ไม่พบแถวข้อมูลกลุ่มในไฟล์ — กรุณาตรวจสอบฟอร์แมต')

  return records
}
