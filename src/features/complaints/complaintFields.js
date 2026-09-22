import { MONTH_TH_SHORT } from "../../shared/utils/constants.js"

export const GROUPS = [
  { v: 1, l: '1 - พบพฤติการณ์' },
  { v: 2, l: '2 - มีตัวตน ไม่พบประวัติ' },
  { v: 3, l: '3 - พิสูจน์ทราบไม่ได้' },
  { v: 4, l: '4 - สถานที่' },
  { v: 5, l: '5 - พื้นที่' },
]

export const CHANNELS = ['อินเตอร์เน็ต', 'สายด่วน 1386', 'ทางรัฐ', 'อื่นๆ']

export const STATUSES = ['ดำเนินการแล้ว', 'ยังไม่ได้รับผล']

export const ACTION_UNITS = ['ส่งต่อ', 'ดำเนินการเอง', 'ทำร่วม']

/* ─── Helpers ─── */
export function formatThaiDate(dateStr) {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    return `${d.getDate()} ${MONTH_TH_SHORT[d.getMonth() + 1]} ${d.getFullYear() + 543}`
  } catch { return dateStr }
}
