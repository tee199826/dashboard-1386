// useArrestData — โหลด arrest_case + arrest_dim + arrest_age_summary (สถิติจับกุมรายคดีจริง เขต×แขวง × ปีงบ จาก CRIMES กทม.)
// ต่างจาก drug_incidents.action_arrest (แค่เรื่องร้องเรียนที่จบด้วยจับกุม ~1,400 เรื่อง) — นี่คือสถิติจับกุมทางการ (~21,700 คดี ปีงบ 2567-2568 เต็มปี)
// district ในทั้ง 3 ตารางไม่มี "เขต" นำหน้า — ดู utils/arrestData.js สำหรับ join/filter กับ cascade
// PDPA เข้ม: ไม่ดึง arrest_age (รายคน มี percode) มา frontend เลย — อ่านผ่าน view arrest_age_summary ที่ aggregate
// เป็น histogram ช่วงอายุ + min/max รายเขต×ปีงบ ไว้ที่ DB แล้ว (ตารางดิบถูก REVOKE จาก anon/authenticated ไปด้วย
// ดู supabase/migrations/20260904_arrest_age_summary_view.sql — ต้องรัน migration นี้ก่อน ไม่งั้น query จะพัง)
import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchAllPages } from '../utils/supabasePagination'

export function useArrestData() {
  const [caseRows, setCaseRows] = useState([])
  const [dimRows, setDimRows] = useState([])
  const [ageSummaryRows, setAgeSummaryRows] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [cases, dim, ageSummary] = await Promise.all([
        fetchAllPages('arrest_case', '*', { parallel: true }),
        fetchAllPages('arrest_dim', '*', { parallel: true }),
        fetchAllPages('arrest_age_summary', '*', { parallel: true }),
      ])
      setCaseRows(cases)
      setDimRows(dim)
      setAgeSummaryRows(ageSummary)
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
    caseRows.forEach((r) => { if (r.fiscal_year) s.add(r.fiscal_year) })
    return [...s].sort((a, b) => b - a)
  }, [caseRows])

  return { caseRows, dimRows, ageSummaryRows, isLoading, error, reload: load, availableYears }
}
