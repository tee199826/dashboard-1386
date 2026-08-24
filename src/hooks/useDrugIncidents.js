// useDrugIncidents — โหลด drug_incidents ทั้งตาราง (raw one-hot columns) ใช้ร่วมทุก section ของ /situation
// select('*') + parallel paging เพราะหน้าเหล่านี้ aggregate ฝั่ง client ไม่สนลำดับแถว
import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchAllPages } from '../utils/supabasePagination'
import { dateToFiscalYear } from '../utils/fiscalYear'

export function useDrugIncidents() {
  const [rows, setRows] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const all = await fetchAllPages('drug_incidents', '*', { parallel: true })
      setRows(all)
    } catch (err) {
      console.error('[useDrugIncidents] load failed:', err)
      setError('ไม่สามารถโหลดข้อมูลได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือลองใหม่')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const availableYears = useMemo(() => {
    const s = new Set()
    rows.forEach((r) => { const fy = dateToFiscalYear(r.received_date); if (fy) s.add(fy) })
    return [...s].sort((a, b) => b - a)
  }, [rows])

  return { rows, isLoading, error, reload: load, availableYears }
}
