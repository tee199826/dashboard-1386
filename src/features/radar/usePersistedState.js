import { useEffect, useState } from 'react'

// useState ที่จำค่าไว้ใน localStorage — ตัวกรองหน้า /radar "ค้าง" ข้ามการ reload/เปลี่ยนหน้า
// ค่าที่เก็บเป็น JSON ; อ่าน/เขียนใน try/catch (private mode / quota เต็ม → ทำงานเหมือน useState ปกติ)
export function usePersistedState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw != null) return JSON.parse(raw)
    } catch { /* ignore */ }
    return typeof initial === 'function' ? initial() : initial
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
  }, [key, value])
  return [value, setValue]
}
