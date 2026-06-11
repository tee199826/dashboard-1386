// ── helpers สำหรับ UnifiedHero: format วันที่ไทย + ดึง last upload ──

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

export function formatThaiDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d)) return null
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`
}

export function formatPeriod(minIso, maxIso) {
  const start = formatThaiDate(minIso)
  const end = formatThaiDate(maxIso)
  if (!start || !end) return start || end || null
  if (start === end) return start
  return `${start} - ${end}`
}

// min/max ของ field วันที่ใน array → { min, max } (string ISO) ; ข้ามค่าว่าง
export function minMaxDate(rows = [], field = 'received_date') {
  let min = null, max = null
  for (const r of rows) {
    const v = r?.[field]
    if (!v) continue
    if (min === null || v < min) min = v
    if (max === null || v > max) max = v
  }
  return { min, max }
}

// ดึงวันที่ upload ล่าสุดจาก upload_batches
//   targetTable: string (1 ตาราง) | string[] (หลายตาราง) | null (ทุก target)
export async function getLastUploadDate(supabase, targetTable = null) {
  let q = supabase.from('upload_batches').select('uploaded_at')
    .order('uploaded_at', { ascending: false }).limit(1)
  if (Array.isArray(targetTable)) q = q.in('target_table', targetTable)
  else if (targetTable) q = q.eq('target_table', targetTable)
  const { data } = await q
  return data?.[0]?.uploaded_at || null
}
