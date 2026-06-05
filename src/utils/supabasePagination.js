import { supabase } from '../lib/supabase'

/**
 * ดึงข้อมูลทุก page จาก Supabase table แบบ pagination
 * @param {string} table ชื่อตาราง
 * @param {string} select คอลัมน์ที่ต้องการ
 * @param {object} options
 *   - batchSize: จำนวนแถวต่อ request (default 1000)
 *   - filter: callback รับ query builder แล้วเพิ่ม filter/order ก่อนส่ง
 * @throws เมื่อ Supabase คืน error
 */
export async function fetchAllPages(table, select, { batchSize = 1000, filter } = {}) {
  let all = []
  let from = 0
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + batchSize - 1)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < batchSize) break
    from += batchSize
  }
  return all
}
