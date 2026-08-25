// useArrestData — โหลด arrest_summary + arrest_drug ทั้ง 2 ตาราง (สถิติจับกุมจริงรายเขต × ปีงบ จาก CRIMES กทม.)
// ต่างจาก drug_incidents.action_arrest (แค่เรื่องร้องเรียนที่จบด้วยจับกุม ~1,400 เรื่อง) — นี่คือสถิติจับกุมทางการ (10,835 คดี ปีงบ 2569)
// district ในทั้ง 2 ตารางไม่มี "เขต" นำหน้า — ดู utils/arrestData.js สำหรับ join/filter กับ cascade
import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchAllPages } from '../utils/supabasePagination'

export function useArrestData() {
  const [summaryRows, setSummaryRows] = useState([])
  const [drugRows, setDrugRows] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [summary, drug] = await Promise.all([
        fetchAllPages('arrest_summary', '*', { parallel: true }),
        fetchAllPages('arrest_drug', '*', { parallel: true }),
      ])
      setSummaryRows(summary)
      setDrugRows(drug)
    } catch (err) {
      console.error('[useArrestData] load failed:', err)
      setError('ไม่สามารถโหลดข้อมูลจับกุมได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือลองใหม่')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const availableYears = useMemo(() => {
    const s = new Set()
    summaryRows.forEach((r) => { if (r.fiscal_year) s.add(r.fiscal_year) })
    return [...s].sort((a, b) => b - a)
  }, [summaryRows])

  return { summaryRows, drugRows, isLoading, error, reload: load, availableYears }
}
