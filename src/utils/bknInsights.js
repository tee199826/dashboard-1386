// ============================================================
// bknInsights.js — pure insight engine for /bkn Executive Summary
// ไม่มีการ fetch — รับ rows ที่ fetch มาแล้ว แล้วคืน headline + ledger
// threshold rules: URGENT = ค้าง% สูงสุด · EXCELLENT = เสร็จ% สูงสุด
// district delta = month-over-month จาก drug_incidents ภายใน บก.น. นั้น
// ============================================================
import { getBknByDistrict } from './bknMapping'

const isSpw = b => b?.includes('สปพ')

// ── format helpers (ใช้ร่วมทั้งหน้า) ──
export const fmt = n => (n || 0).toLocaleString('en-US')      // 2,606
export const pct1 = n => (n || 0).toFixed(1)                  // 67.0
export const stripKhet = d => String(d || '').replace(/^เขต\s*/, '')

// รวม bkn_summary rows ของ "งวดเดียว" → { [bkn]: {total,done,pending} }
export function aggregateByBkn(rows = []) {
  const map = {}
  rows.forEach(r => {
    if (!r.bkn) return
    if (!map[r.bkn]) map[r.bkn] = { total: 0, done: 0, pending: 0 }
    map[r.bkn].total += r.total || 0
    map[r.bkn].done += r.done || 0
    map[r.bkn].pending += r.pending || 0
  })
  return map
}

const sumUnits = entries => entries.reduce((a, [, v]) => ({
  total: a.total + v.total, done: a.done + v.done, pending: a.pending + v.pending,
}), { total: 0, done: 0, pending: 0 })

const donePct = v => (v.total > 0 ? (v.done / v.total) * 100 : 0)
const pendPct = v => (v.total > 0 ? (v.pending / v.total) * 100 : 0)

// เขตที่ขึ้น/ลงแรงสุด (mom) ภายใน บก.น. หนึ่ง — คืน { district, pct } | null
// direction: 'up' = riser (แย่) · 'down' = faller (ดี) ; guard base < 3 กันตัวเลขเพี้ยน
function districtMom(incidents, bkn, latestFy, direction) {
  const inFy = incidents.filter(r =>
    String(r.fiscal_year) === String(latestFy) && r.received_date &&
    getBknByDistrict(r.district) === bkn)
  const months = [...new Set(inFy.map(r => r.received_date.slice(0, 7)))].sort()
  if (months.length < 2) return null
  const [prevMo, lastMo] = [months[months.length - 2], months[months.length - 1]]
  const countBy = mo => {
    const m = {}
    inFy.forEach(r => { if (r.received_date.slice(0, 7) === mo) m[r.district] = (m[r.district] || 0) + 1 })
    return m
  }
  const cPrev = countBy(prevMo), cLast = countBy(lastMo)
  let best = null
  new Set([...Object.keys(cPrev), ...Object.keys(cLast)]).forEach(d => {
    const p = cPrev[d] || 0, c = cLast[d] || 0
    if (p < 3) return
    const change = ((c - p) / p) * 100
    if (direction === 'up' && change > 0 && (!best || change > best.pct)) best = { district: d, pct: change }
    if (direction === 'down' && change < 0 && (!best || change < best.pct)) best = { district: d, pct: change }
  })
  return best
}

/**
 * สร้าง insight ทั้งหมดของ Executive Summary
 * @param curRows  bkn_summary ของงวดปัจจุบัน (report_id 115_B)
 * @param prevRows bkn_summary งวดก่อน (optional) → delta
 * @param incidents drug_incidents (enriched) → district mom delta
 * @param latestFy ปีงบล่าสุดของ incidents
 * คืน null ถ้าไม่มีข้อมูล
 */
export function buildBknInsights({ curRows = [], prevRows = null, incidents = [], latestFy } = {}) {
  const cur = aggregateByBkn(curRows)
  const bknEntries = Object.entries(cur).filter(([b]) => !isSpw(b))
  const spwEntries = Object.entries(cur).filter(([b]) => isSpw(b))
  if (bknEntries.length === 0) return null

  const totals = sumUnits(bknEntries)            // universe = บก.น.1–9 (2,606)
  const spw = sumUnits(spwEntries)               // สปพ. แยก (328)
  const avgPend = pendPct(totals)

  // delta vs งวดก่อน (บก.น. only)
  let delta = null
  if (prevRows) {
    const prev = aggregateByBkn(prevRows)
    const prevTotals = sumUnits(Object.entries(prev).filter(([b]) => !isSpw(b)))
    const rel = (c, p) => (p > 0 ? ((c - p) / p) * 100 : null)
    delta = {
      done: totals.done - prevTotals.done,
      pending: totals.pending - prevTotals.pending,
      total: totals.total - prevTotals.total,
      donePctRel: rel(totals.done, prevTotals.done),
      pendPctRel: rel(totals.pending, prevTotals.pending),
      totalRel: rel(totals.total, prevTotals.total),
    }
  }

  // worst pending% / best done%
  const worst = [...bknEntries].sort(([, a], [, b]) => pendPct(b) - pendPct(a))[0]
  const best = [...bknEntries].sort(([, a], [, b]) => donePct(b) - donePct(a))[0]

  const urgent = {
    name: worst[0],
    pendingPct: pendPct(worst[1]),
    ...worst[1],
    district: districtMom(incidents, worst[0], latestFy, 'up'),
  }
  const excellent = {
    name: best[0],
    donePct: donePct(best[1]),
    ...best[1],
    district: districtMom(incidents, best[0], latestFy, 'down'),
  }

  // headline — insight ไม่ใช่ตัวเลขเปล่า
  const ratio = avgPend > 0 ? urgent.pendingPct / avgPend : 1
  const qualifier =
    ratio >= 1.9 ? 'สูงกว่าค่าเฉลี่ยเท่าตัว' :
    ratio >= 1.4 ? 'สูงกว่าค่าเฉลี่ยมาก' : 'สูงกว่าค่าเฉลี่ย'
  const headline = `${urgent.name} ค้างงาน ${pct1(urgent.pendingPct)}% — ${qualifier} ต้องเร่งดูแล`
  const subhead =
    `ภาพรวมดำเนินการแล้ว ${fmt(totals.done)} จาก ${fmt(totals.total)} เรื่อง ` +
    `(${pct1(donePct(totals))}%) · ${fmt(totals.pending)} เรื่องยังค้าง`

  return {
    totals, spw, avgPend,
    donePct: donePct(totals), pendPct: pendPct(totals),
    delta, urgent, excellent, headline, subhead,
  }
}
