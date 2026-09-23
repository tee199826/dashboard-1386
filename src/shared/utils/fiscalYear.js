

// ── ปีงบประมาณไทย (ต.ค. ปีก่อน → ก.ย. ปีนี้) ────────────────────────────────
// เช่น ปีงบ 2569 = 2025-10-01 ถึง 2026-09-30

// ปีงบ (พ.ศ.) → ช่วงวันที่ ISO { from, to }
export function getFiscalYearRange(buddhistYear) {
  const ceYear = buddhistYear - 543              // 2569 → 2026
  return {
    from: `${ceYear - 1}-10-01`,                  // '2025-10-01'
    to:   `${ceYear}-09-30`,                       // '2026-09-30'
  }
}

// วันที่ ISO → ปีงบ (พ.ศ.) ; ต.ค.-ธ.ค. นับเป็นปีงบถัดไป
export function dateToFiscalYear(isoDate) {
  if (!isoDate) return null
  const d = new Date(isoDate)
  if (isNaN(d)) return null
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const ceYear = month >= 10 ? year + 1 : year
  return ceYear + 543                             // คืนเป็น พ.ศ.
}

// Date → 'YYYY-MM-DD' ตามเวลาเครื่อง (ไม่ใช่ UTC)
// ใช้แทน toISOString().slice(0, 10) ซึ่งเป็น UTC — ในไทยช่วง 00:00–06:59 จะได้วันของเมื่อวาน
export function localDateISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ปีงบ (พ.ศ.) + เดือน (1-12) → ช่วงวันที่ ISO ของเดือนนั้น
export function getMonthRange(buddhistYear, monthNum) {
  const ceYear = buddhistYear - 543
  const lastDay = new Date(ceYear, monthNum, 0).getDate()
  return {
    from: `${ceYear}-${String(monthNum).padStart(2, '0')}-01`,
    to:   `${ceYear}-${String(monthNum).padStart(2, '0')}-${lastDay}`,
  }
}
