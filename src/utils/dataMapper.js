// Channel values as they appear in the raw Excel data
const CHANNEL_MAP = {
  'อินเตอร์เน็ต': 'อินเตอร์เน็ต',
  'ทางรัฐ':       'ทางรัฐ',
}

function normalizeChannel(raw) {
  if (!raw) return 'อื่นๆ'
  const s = String(raw).trim()
  if (s.includes('1386')) return 'สายด่วน 1386'
  return CHANNEL_MAP[s] ?? 'อื่นๆ'
}

// data2 ใช้ 'ผลการดำเนินงาน', ไฟล์อื่นใช้ 'ผลการดำเนินการ'
// '-' = ยังไม่ได้รับผล (pending), ค่าอื่นๆ = มีผลแล้ว (completed)
function normalizeStatus(raw) {
  const val = raw['ผลการดำเนินการ'] ?? raw['ผลการดำเนินงาน'] ?? null
  return val == null || String(val).trim() === '-' ? 'รอดำเนินการ' : 'ดำเนินการแล้ว'
}

// ค่าใน Excel มี prefix "เขต" นำหน้า เช่น "เขตดอนเมือง" → "ดอนเมือง"
function normalizeDistrict(raw) {
  if (!raw) return 'ไม่ระบุ'
  return String(raw).replace(/^เขต/, '').trim() || 'ไม่ระบุ'
}

export function mapRecord(raw, group) {
  return {
    สถานะ:          normalizeStatus(raw),
    เขต:            normalizeDistrict(raw['เขต']),
    ช่องทาง:         normalizeChannel(raw['แหล่งข่าว']),
    การดำเนินการ:    raw['การดำเนินการ'] ?? null,
    'วันที่รับเรื่อง': raw['วันที่รับเรื่อง'] ?? null,
    group,
  }
}
