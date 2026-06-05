import { MONTH_TH_SHORT, MONTH_LONG } from './constants'

/** แปลง ISO string → "D ม.ค. YYYY" (พ.ศ.) คืน null ถ้า falsy */
export function formatThaiDateShort(iso) {
  if (!iso) return null
  try {
    const d = new Date(iso)
    return `${d.getDate()} ${MONTH_TH_SHORT[d.getMonth() + 1]} ${d.getFullYear() + 543}`
  } catch { return String(iso) }
}

/** แปลง ISO string → "D มกราคม YYYY" (พ.ศ.) คืน null ถ้า falsy */
export function formatThaiDateLong(iso) {
  if (!iso) return null
  try {
    const d = new Date(iso)
    return `${d.getDate()} ${MONTH_LONG[d.getMonth() + 1]} ${d.getFullYear() + 543}`
  } catch { return String(iso) }
}

/** คริสต์ศักราช → พ.ศ. */
export const toFiscalYear = ceYear => Number(ceYear) + 543

/** พ.ศ. → คริสต์ศักราช */
export const fromFiscalYear = fyear => Number(fyear) - 543
