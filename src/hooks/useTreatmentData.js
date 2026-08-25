// useTreatmentData — โหลด treatment_summary + treatment_dim ทั้ง 2 ตาราง (สถิติบำบัดจริงรายเขต × ปีงบ จาก บสต. กทม.)
// ต่างจาก drug_incidents.action_treatment (แค่เรื่องร้องเรียนที่จบด้วยบำบัด ~201 ราย) — นี่คือสถิติบำบัดทางการ (5,996 ราย ปีงบ 2569)
// district ในทั้ง 2 ตารางไม่มี "เขต" นำหน้า — ดู utils/treatmentData.js สำหรับ join/filter กับ cascade
// ⚠️ treatment_dim มี 3,193 แถว > 1000 (limit ต่อ request ของ Supabase) — ต้อง fetchAllPages ไม่งั้นได้แค่ 1000 แถวแรก ตัวเลขเพี้ยน
import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchAllPages } from '../utils/supabasePagination'

export function useTreatmentData() {
  const [summaryRows, setSummaryRows] = useState([])
  const [dimRows, setDimRows] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [summary, dim] = await Promise.all([
        fetchAllPages('treatment_summary', '*', { parallel: true }),
        fetchAllPages('treatment_dim', '*', { parallel: true }),
      ])
      setSummaryRows(summary)
      setDimRows(dim)
    } catch (err) {
      console.error('[useTreatmentData] load failed:', err)
      setError('ไม่สามารถโหลดข้อมูลบำบัดได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือลองใหม่')
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

  return { summaryRows, dimRows, isLoading, error, reload: load, availableYears }
}
