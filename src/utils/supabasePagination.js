import { supabase } from '../lib/supabase'

/**
 * ดึงข้อมูลทุก page จาก Supabase table แบบ pagination
 * @param {string} table ชื่อตาราง
 * @param {string} select คอลัมน์ที่ต้องการ
 * @param {object} options
 *   - batchSize: จำนวนแถวต่อ request (default 1000)
 *   - filter: callback รับ query builder แล้วเพิ่ม filter/order ก่อนส่ง
 *   - parallel: true = นับจำนวนแถวก่อน (head+count) แล้วยิงทุกหน้าพร้อมกัน (จำกัด concurrency)
 *               แทนการรอทีละหน้า — เร็วขึ้นมากบนตารางใหญ่ (เหมาะกับ query อ่าน/aggregate ที่ไม่สนลำดับ)
 * @throws เมื่อ Supabase คืน error
 */
export async function fetchAllPages(table, select, { batchSize = 1000, filter, parallel = false } = {}) {
  if (parallel) return fetchAllPagesParallel(table, select, { batchSize, filter })
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

const MAX_CONCURRENCY = 8 // เพดาน request พร้อมกัน — เร็วแต่ไม่ถล่ม Supabase/เบราว์เซอร์

// รู้จำนวนแถวรวมก่อน (head request ไม่ดึง data) → คำนวณจำนวนหน้า → ยิงทุกหน้าพร้อมกัน (pool)
// aggregate ฝั่ง client ไม่สนลำดับแถว จึงขนานได้ปลอดภัย
async function fetchAllPagesParallel(table, select, { batchSize, filter }) {
  let head = supabase.from(table).select(select, { count: 'exact', head: true })
  if (filter) head = filter(head)
  const { count, error } = await head
  if (error) throw error
  if (!count) return []

  const pages = Math.ceil(count / batchSize)
  const runPage = (i) => {
    let q = supabase.from(table).select(select).range(i * batchSize, i * batchSize + batchSize - 1)
    if (filter) q = filter(q)
    return q.then(({ data, error }) => { if (error) throw error; return data || [] })
  }

  const results = new Array(pages)
  let next = 0
  const worker = async () => { while (next < pages) { const i = next++; results[i] = await runPage(i) } }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, pages) }, worker))
  return results.flat()
}
