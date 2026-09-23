

/* ─── Excel row → record schema ─── */
export function mapRowToRecord(row, groupNumber) {
  const get = (...keys) => {
    for (const k of keys) {
      for (const rk of Object.keys(row)) {
        if (rk.includes(k) && row[rk] != null && String(row[rk]).trim() !== '' && String(row[rk]).trim() !== '-') {
          return row[rk]
        }
      }
    }
    return null
  }

  const dateRaw = get('วันที่รับเรื่อง', 'วันที่')
  const completedRaw = get('วันที่ดำเนินการ', 'วันที่ดำเนิน')

  const resultSummary = get('ผลการดำเนินการ')
  let status = 'ยังไม่ได้รับผล'
  if (resultSummary && String(resultSummary).includes('ได้รับผล')) status = 'ดำเนินการแล้ว'
  else if (completedRaw) status = 'ดำเนินการแล้ว'

  let channel = get('แหล่งข่าว', 'ช่องทาง')
  if (channel) {
    const c = String(channel).trim()
    channel = ['อินเตอร์เน็ต', 'สายด่วน 1386', 'ทางรัฐ'].includes(c) ? c : 'อื่นๆ'
  }

  return {
    group: groupNumber,
    date: parseExcelDate(dateRaw),
    completedDate: parseExcelDate(completedRaw),
    channel,
    district: get('อำเภอ', 'เขต'),
    subdistrict: get('ตำบล', 'แขวง'),
    community: get('หมู่บ้าน', 'ชุมชน'),
    province: get('จังหวัด') || 'กรุงเทพมหานคร',
    personType: get('ประเภทบุคคล'),
    sex: get('เพศ'),
    occupation: get('อาชีพ'),
    role: get('บทบาท'),
    actionUnit: get('การดำเนินการ', 'หน่วยดำเนินการ'),
    urgency: get('ความเร่งด่วน'),
    status,
    drug: get('ยาเสพติด'),
    areaType: get('ประเภทพื้นที่'),
  }
}

function parseExcelDate(v) {
  if (!v) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  if (!s || s === '-') return null
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) {
    let y = parseInt(m[3])
    if (y > 2400) y -= 543
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return s
}
