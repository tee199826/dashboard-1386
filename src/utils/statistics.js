export const FIELD = {
  STATUS:   'status',
  DISTRICT: 'district',
  CHANNEL:  'channel',
  ACTION:   'actionUnit',
  DATE:     'date',
}

const STATUS_DONE = 'ดำเนินการแล้ว'

// Excel เก็บวันที่เป็น serial number (จำนวนวันนับจาก 1900-01-01)
// ถ้าเป็น string ให้ Date() parse ตรง
function parseDate(value) {
  if (!value) return null
  if (typeof value === 'number') {
    return new Date(Math.round((value - 25569) * 86400 * 1000))
  }
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

function toYearMonth(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${date.getFullYear()}-${m}`
}

// ─── Exported functions ────────────────────────────────────────────────────

export function getTotals(records) {
  const completed = records.filter((r) => r[FIELD.STATUS] === STATUS_DONE).length
  const total = records.length
  return {
    total,
    completed,
    pending: total - completed,
    pct: total > 0 ? Math.round((completed / total) * 100) : 0,
  }
}

export function getDistricts(records) {
  const map = {}
  for (const r of records) {
    const key = r[FIELD.DISTRICT] ?? 'ไม่ระบุ'
    if (!map[key]) map[key] = { district: key, total: 0, completed: 0 }
    map[key].total++
    if (r[FIELD.STATUS] === STATUS_DONE) map[key].completed++
  }
  return Object.values(map).sort((a, b) => b.total - a.total)
}

export function getChannels(records) {
  const known = ['อินเตอร์เน็ต', 'สายด่วน 1386', 'ทางรัฐ']
  const counts = {}
  for (const r of records) {
    const ch = r[FIELD.CHANNEL] ?? ''
    const key = known.includes(ch) ? ch : 'อื่นๆ'
    counts[key] = (counts[key] ?? 0) + 1
  }
  const total = records.length || 1
  return [...known, 'อื่นๆ'].map((name) => ({
    name,
    count: counts[name] ?? 0,
    pct: Math.round(((counts[name] ?? 0) / total) * 100),
  }))
}

export function getActions(records) {
  const known = ['ดำเนินการเอง', 'ทำร่วม', 'ส่งต่อ']
  const counts = {}
  for (const r of records) {
    const a = r[FIELD.ACTION]
    if (known.includes(a)) counts[a] = (counts[a] ?? 0) + 1
  }
  const knownSum = known.reduce((s, k) => s + (counts[k] ?? 0), 0)
  counts['ไม่ระบุ'] = records.length - knownSum
  const total = records.length || 1
  return [...known, 'ไม่ระบุ'].map((name) => ({
    name,
    count: counts[name] ?? 0,
    pct: Math.round(((counts[name] ?? 0) / total) * 100),
  }))
}

const THAI_MONTH_FULL = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const THAI_MONTH_SHORT = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

export function getMonthlyTrend(records) {
  const map = {}
  for (const r of records) {
    const d = parseDate(r[FIELD.DATE])
    if (!d) continue
    const key = toYearMonth(d)
    if (!map[key]) map[key] = { month: key, received: 0, completed: 0 }
    map[key].received++
    if (r[FIELD.STATUS] === STATUS_DONE) map[key].completed++
  }
  return Object.values(map)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(r => {
      const [y, m] = r.month.split('-')
      const monthIdx = parseInt(m)
      const yearTH = parseInt(y) + 543
      return {
        ...r,
        monthLabel: `${THAI_MONTH_SHORT[monthIdx]} ${yearTH}`,
        monthFull: `${THAI_MONTH_FULL[monthIdx]} ${yearTH}`,
      }
    })
}

export function getSevenDayAvg(records) {
  const dates = records.map((r) => parseDate(r[FIELD.DATE])).filter(Boolean)
  if (dates.length === 0) return { avg: 0, total: 0 }
  const maxTime = Math.max(...dates.map((d) => d.getTime()))
  const cutoff = maxTime - 6 * 24 * 60 * 60 * 1000
  const total = dates.filter((d) => d.getTime() >= cutoff).length
  return { avg: Math.round((total / 7) * 10) / 10, total }
}

export function getTopDistricts(records, n = 5) {
  return getDistricts(records).slice(0, n).map(d => ({ ...d, name: d.district }))
}

export function filterByYear(records, year) {
  if (year === 'all') return records
  return records.filter(r => {
    if (!r.date) return false
    return String(parseInt(r.date.slice(0, 4)) + 543) === year
  })
}

export function filterByMonth(records, month) {
  if (month === 'all') return records
  return records.filter(r => r.date && r.date.slice(5, 7) === month)
}

export function getYears(records) {
  const s = new Set()
  records.forEach(r => {
    if (r.date) s.add(parseInt(r.date.slice(0, 4)) + 543)
  })
  return Array.from(s).sort()
}
