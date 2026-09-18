// dateFilterLabel.js — ข้อความสรุปช่วงเวลาของ FilterContext (ปีงบ / รายเดือน / ช่วงวันที่)
// แยกจาก DateFilter.jsx เพราะไฟล์ component ควร export เฉพาะ component (fast-refresh) และหน้าอื่นใช้ใส่ไฟล์ export ได้
const TH = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

export function describeDateFilter(state) {
  if (state.mode === 'fiscal') {
    const n = state.fiscalYears?.length || 0
    return n === 0 ? 'ทุกปี' : n === 1 ? `ปี ${state.fiscalYears[0]}` : `${n} ปีงบ`
  }
  if (state.mode === 'month') {
    if (!state.monthYear) return 'ทุกปี'
    if (!state.month) return `ปี ${state.monthYear} (ทุกเดือน)`
    return `${TH[state.month]} ${state.monthYear}`
  }
  // custom
  const { customFrom: f, customTo: t } = state
  if (!f || !t) return 'ทั้งหมด'
  const a = f.split('-').map(Number), b = t.split('-').map(Number) // [y,m,d]
  if (f === t) return `${a[2]} ${TH[a[1]]} ${a[0] + 543}`
  if (a[0] === b[0] && a[1] === b[1]) return `${a[2]}-${b[2]} ${TH[a[1]]} ${a[0] + 543}`
  if (a[0] === b[0]) return `${a[2]} ${TH[a[1]]} - ${b[2]} ${TH[b[1]]} ${a[0] + 543}`
  return `${a[2]} ${TH[a[1]]} ${a[0] + 543} - ${b[2]} ${TH[b[1]]} ${b[0] + 543}`
}

// ตัวเต็มสำหรับใส่ไฟล์/รูป export — หลายปีงบให้เห็นว่าปีไหนบ้าง (บนปุ่มย่อเป็น "2 ปีงบ" ได้ แต่ในไฟล์ต้องชัด)
export function describeDateFilterLong(state) {
  if (state.mode === 'fiscal' && (state.fiscalYears?.length || 0) > 1) {
    return `ปีงบ ${[...state.fiscalYears].sort((x, y) => x - y).join(', ')}`
  }
  return describeDateFilter(state)
}
