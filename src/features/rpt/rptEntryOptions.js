import { BKN_ORDER, BKN_TO_STATIONS, BKN_AREA_GROUP, getBknByDistrict } from '../../shared/geo/bknMapping.js'
import { DNAME_TO_GROUP, BKK_GROUPS } from '../../shared/utils/constants.js'

// rptEntryOptions — ตัวเลือกของช่องที่เจ้าหน้าที่กรอกเพิ่มในหน้า /rpt-entry
// ตัวเลือกพื้นที่ (บก.น./สน./กลุ่มพื้นที่) ดึงจากตารางกลางที่ระบบใช้อยู่แล้ว
// จะได้ join กับแผนที่/สถิติหน้าอื่นได้ตรง ไม่ต้องมานั่งเทียบชื่อทีหลัง

// บก.น.1-9 (ตัด 'ไม่ระบุ' ที่มีไว้สำหรับกราฟออก — ช่องกรอกปล่อยว่างแทน)
export const BKN_OPTIONS = BKN_ORDER.filter((b) => b !== 'ไม่ระบุ')

// กลุ่มพื้นที่ กทม. 6 กลุ่ม
export const AREA_GROUP_OPTIONS = Object.keys(BKK_GROUPS)

// สน. ทั้งหมด เรียงตามตัวอักษรไทย — ใช้เมื่อยังไม่ได้เลือก บก.น.
export const ALL_STATIONS = Object.values(BKN_TO_STATIONS)
  .flat().sort((a, b) => a.localeCompare(b, 'th'))

// สน. ใน บก.น. ที่เลือก ; ไม่ได้เลือก บก.น. = คืนทั้ง 88 สน.
export function stationsOf(bkn) {
  if (!bkn) return ALL_STATIONS
  return [...(BKN_TO_STATIONS[bkn] || [])].sort((a, b) => a.localeCompare(b, 'th'))
}

// ประเภทสถานที่ — ชุดตั้งต้นจากค่าที่พบจริงในช่อง "รายละเอียดพื้นที่" ของ RPT_111_4/5
// (บาร์/ซาวน่า, อะพาร์ตเมนต์+เลขห้อง, บ้านเช่า, ร้านค้า, ริมฟุตบาท, ใต้ทางด่วน ฯลฯ)
// เพิ่ม/แก้รายการได้ที่นี่ที่เดียว — ค่าที่บันทึกไว้แล้วไม่หายถ้าลบตัวเลือกออก
export const PLACE_TYPE_OPTIONS = [
  'บ้านพักอาศัย',
  'บ้านเช่า/ห้องแถว',
  'ห้องเช่า/หอพัก/อะพาร์ตเมนต์',
  'คอนโดมิเนียม',
  'ชุมชน/หมู่บ้าน',
  'สถานบันเทิง/ผับ/บาร์/ซาวน่า',
  'ร้านอาหาร/ร้านค้า/แผงลอย',
  'โรงแรม/รีสอร์ต/ม่านรูด',
  'สถานประกอบการ/โรงงาน/อู่ซ่อม',
  'สถานศึกษา',
  'ศาสนสถาน',
  'ตลาด/ห้างสรรพสินค้า',
  'ปั๊มน้ำมัน/จุดพักรถ',
  'สถานีขนส่ง/ท่าเรือ',
  'พื้นที่สาธารณะ/สวน/ริมทาง/ใต้ทางด่วน',
  'ที่รกร้าง/พื้นที่ว่าง',
  'เรือนจำ/สถานพินิจ/สถานบำบัด',
  'อื่นๆ',
]

// ── ช่องสุดท้าย: ประเภทบุคคล ───────────────────────────────────────────────
// ผู้ถูกร้องเรียนเป็นประชาชนทั่วไป หรือเจ้าหน้าที่รัฐ
// (ระบบต้นทางมีคอลัมน์ "ประเภทบุคคล" แต่ไฟล์จริงเป็น 'ทั่วไป' ทุกแถว จึงต้องให้กรอกเอง)
export const PERSON_CATEGORY_OPTIONS = ['ทั่วไป', 'เจ้าหน้าที่รัฐ']

// เลือกได้หลายข้อ (1 คนเป็นได้มากกว่า 1 สถานะ เช่น ครู + รัฐวิสาหกิจ)
export const OFFICIAL_TYPE_OPTIONS = [
  'ตำรวจ', 'ทหาร', 'ครู', 'รัฐวิสาหกิจ', 'เจ้าหน้าที่ กทม.', 'อื่นๆ',
]

export const OFFICIAL_TYPE_OTHER = 'อื่นๆ'
export const PLACE_TYPE_OTHER = 'อื่นๆ'

// ── ผลตรวจสอบกลับมาแล้วหรือยัง ─────────────────────────────────────────────
// ใช้ระบายสีในตาราง/ไฟล์ Excel: ได้รับผล = ฟ้า, ยังไม่ได้รับผล = แดง
//
// ⚠️ ห้ามดูแค่คอลัมน์ "ผลการดำเนินการ (สถานะ)" อย่างเดียว —
//    รายงานกลุ่ม 4 (RPT_111_4) ไม่มีคอลัมน์นั้นในไฟล์เลย ทั้งที่มีผลตรวจครบ 152/152
//    ถ้าดูแค่ช่องสถานะ กลุ่ม 4 จะขึ้นแดงทั้งกลุ่มทั้งที่ได้รับผลแล้ว
//    จึงถอยไปดู "พฤติการณ์" ซึ่งตรงกับเหตุผลที่ใช้จริง: ยังไม่ได้รับผล = ไม่มีข้อมูลพฤติการณ์
export function isResultReceived(r) {
  if (String(r?.result_status || '').includes('ได้รับผล')) return true
  const b = String(r?.result_behavior || '').trim()
  return b !== '' && b !== '-'
}

// ── พิกัด ──────────────────────────────────────────────────────────────────
// กรอบ กทม. แบบกว้าง — ตรงกับ constraint rpt_entry_latlng_bkk ในฐานข้อมูล
// ให้ frontend เตือนก่อนบันทึก แทนที่จะให้ฐานข้อมูลตีกลับเป็น error ดิบ
export const BKK_BOUNDS = { lat: [13.4, 14.0], lng: [100.2, 100.95] }

export function latLngError(lat, lng) {
  const hasLat = lat !== '' && lat != null, hasLng = lng !== '' && lng != null
  if (!hasLat && !hasLng) return null
  if (hasLat !== hasLng) return 'ต้องกรอกทั้งละติจูดและลองจิจูด'
  const a = Number(lat), b = Number(lng)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 'พิกัดต้องเป็นตัวเลข'
  const inBkk = a >= BKK_BOUNDS.lat[0] && a <= BKK_BOUNDS.lat[1] &&
                b >= BKK_BOUNDS.lng[0] && b <= BKK_BOUNDS.lng[1]
  if (!inBkk) {
    // สลับ lat/lng เป็นความผิดพลาดที่พบบ่อยที่สุดตอนคัดลอกพิกัด — บอกตรง ๆ ว่าน่าจะสลับ
    const swapped = b >= BKK_BOUNDS.lat[0] && b <= BKK_BOUNDS.lat[1] &&
                    a >= BKK_BOUNDS.lng[0] && a <= BKK_BOUNDS.lng[1]
    return swapped ? 'พิกัดน่าจะสลับกัน — ละติจูดของ กทม. ขึ้นต้นด้วย 13 ส่วนลองจิจูดขึ้นต้นด้วย 100'
                   : 'พิกัดอยู่นอกกรุงเทพฯ'
  }
  return null
}

// รับข้อความที่ก๊อปจาก Google Maps ("13.7563, 100.5018" หรือ "13.7563,100.5018")
// แล้วแยกเป็น lat/lng — คืน null ถ้าไม่เข้ารูปแบบ
export function parseLatLngPaste(text) {
  const m = /^\s*(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)\s*$/.exec(String(text || ''))
  if (!m) return null
  return { lat: m[1], lng: m[2] }
}

// ── เดาค่าตั้งต้นจากข้อมูลที่รายงานมีอยู่แล้ว ──────────────────────────────
// เจ้าหน้าที่แก้ทับได้เสมอ — นี่แค่ลดจำนวนช่องที่ต้องพิมพ์เอง
// สน. เดาจาก "หน่วยงานที่ตอบผล" ในรายงาน (ค่าจริงมาในรูป 'สน.วังทองหลาง')
export function suggestEntry(record) {
  const district = record?.district || ''
  const bknFromDistrict = getBknByDistrict(district)
  const bkn = bknFromDistrict === 'ไม่ระบุ' ? '' : bknFromDistrict

  let police_station = ''
  const agency = String(record?.result_agency || '')
  const m = /^สน\.\s*(.+)$/.exec(agency.trim())
  if (m) {
    const name = m[1].trim()
    if (ALL_STATIONS.includes(name)) police_station = name
  }

  return {
    bkn,
    police_station,
    // กลุ่มพื้นที่เอาจากตารางเขตทางการก่อน แล้วค่อยถอยไปใช้กลุ่มของ บก.น.
    area_group: DNAME_TO_GROUP[district] || BKN_AREA_GROUP[bkn] || '',
    // ช่อง "หมู่บ้าน" ในรายงานคือชื่อชุมชนจริง (ระบบต้นทางใส่ผิดช่อง) — ใช้เป็นค่าตั้งต้นได้
    community: record?.src_village || '',
  }
}
