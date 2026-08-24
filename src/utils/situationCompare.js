// situationCompare.js — เปรียบเทียบปีงบก่อน + เขต top3 ใช้ร่วม ArrestSection/IncidentsSection (หน้า /situation)
import { getFiscalYearRange } from './fiscalYear'
import { filterByDateColumn } from './filterRows'
import { groupOf } from '../hooks/useAreaCascade'

// แถวผ่านตัวกรองพื้นที่ (กลุ่ม/เขต/แขวง/ชุมชน) ปัจจุบันของ cascade หรือไม่ — ไม่ผ่านตัวกรองเวลา (ใช้เทียบข้ามปีงบ)
export function matchesArea(r, cascade) {
  if (cascade.group !== 'all' && groupOf(r.district) !== cascade.group) return false
  if (cascade.district !== 'all' && r.district !== cascade.district) return false
  if (cascade.subdistrict !== 'all' && r.subdistrict !== cascade.subdistrict) return false
  if (cascade.community !== 'all' && r.community !== cascade.community) return false
  return true
}

// %เปลี่ยนแปลงเทียบปีงบก่อน — เทียบได้เฉพาะตอนเลือกปีงบเดียว (mode fiscal + fiscalYear ระบุ) ไม่งั้นคืน null
export function computeYoy(allRows, cascade, filterState, rowFilter = () => true) {
  if (filterState.mode !== 'fiscal' || !filterState.fiscalYear) return null
  const currentFY = filterState.fiscalYear
  const prevFY = currentFY - 1
  const prevRows = filterByDateColumn(allRows, 'received_date', getFiscalYearRange(prevFY))
    .filter((r) => matchesArea(r, cascade))
    .filter(rowFilter)
  const currentTotal = cascade.rows.filter(rowFilter).length
  const prevTotal = prevRows.length
  return {
    currentTotal, prevTotal, prevFY,
    pct: prevTotal ? ((currentTotal - prevTotal) / prevTotal) * 100 : null,
  }
}

// เขต top3 ตามจำนวน (ตัด "เขต" นำหน้าออกให้อ่านง่าย) + % จาก total ที่ส่งมา
export function top3Districts(rows, total) {
  const m = {}
  rows.forEach((r) => { if (r.district) m[r.district] = (m[r.district] || 0) + 1 })
  return Object.entries(m)
    .map(([district, value]) => ({ name: district.replace(/^เขต/, ''), value, pct: total ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
}

// คู่ปีงบสำหรับกราฟเทียบพฤติการณ์ 2 ปี — ใช้ปีที่เลือกอยู่ถ้าเลือกปีงบเดียว ไม่งั้น fallback ไป 2 ปีล่าสุดที่มีข้อมูล
export function pickComparePair(filterState, availableYears) {
  if (filterState.mode === 'fiscal' && filterState.fiscalYear) {
    return [filterState.fiscalYear, filterState.fiscalYear - 1]
  }
  const sorted = [...availableYears].sort((a, b) => b - a)
  return sorted.length >= 2 ? [sorted[0], sorted[1]] : null
}

export function yearRows(allRows, cascade, fy) {
  return filterByDateColumn(allRows, 'received_date', getFiscalYearRange(fy)).filter((r) => matchesArea(r, cascade))
}
