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

/** ISO → "DD ม.ค. YY" (พ.ศ. 2 หลัก, วันที่ zero-pad) */
function fmtRangePart(iso) {
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const day = String(d.getDate()).padStart(2, '0')
  const mon = MONTH_TH_SHORT[d.getMonth() + 1]
  const yy = String((d.getFullYear() + 543) % 100).padStart(2, '0')
  return `${day} ${mon} ${yy}`
}

/**
 * หาช่วงวันที่ (min–max) จาก rows ตาม field แล้ว format ภาษาไทย
 * - เดือนเดียว (ปี+เดือนเดียวกัน): "ม.ค. YY"
 * - หลายเดือน: "DD ม.ค. YY - DD ก.พ. YY"
 * - unfiltered=true: ครอบด้วย "ทั้งหมด (...)"
 * คืน null ถ้าไม่มีวันที่ valid เลย
 */
export function thaiDateRange(rows, field, { unfiltered = false } = {}) {
  if (!Array.isArray(rows)) return null
  const dates = rows.map(r => r?.[field]).filter(Boolean).map(String).sort()
  if (dates.length === 0) return null
  const min = dates[0], max = dates[dates.length - 1]
  const dMin = new Date(min), dMax = new Date(max)
  let label
  if (!isNaN(dMin) && !isNaN(dMax) &&
      dMin.getFullYear() === dMax.getFullYear() && dMin.getMonth() === dMax.getMonth()) {
    const mon = MONTH_TH_SHORT[dMin.getMonth() + 1]
    const yy = String((dMin.getFullYear() + 543) % 100).padStart(2, '0')
    label = `${mon} ${yy}`
  } else {
    label = `${fmtRangePart(min)} - ${fmtRangePart(max)}`
  }
  return unfiltered ? `ทั้งหมด (${label})` : label
}
