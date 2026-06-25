// Sanity: detection ไฟล์ wide (title แถวแรก, header แถว 3) ต้องได้ drug_incidents >=80%
import XLSX from 'xlsx'
import { detectTypeScored } from '../src/utils/importEngine.js'
const W = 70, blank = () => Array(W).fill(null)
const set = (a, o) => { for (const k in o) a[k] = o[k]; return a }
const H = blank()
set(H, { 0: 'ที่', 1: 'วัน', 2: 'เดือน', 3: 'ปี', 4: 'กลุ่ม', 10: 'ที่อยู่ปัจจุบัน/ที่มีพฤติการณ์', 11: 'ชุมชน', 12: 'แขวง',
  15: 'พิกัด X', 16: 'พิกัด Y', 17: 'กลุ่มพื้นที่ สูตร', 19: 'เสพ', 20: 'ค้า', 21: 'เสพ/ค้า', 22: 'ผลิต',
  23: 'ยาบ้า', 24: 'ไอซ์', 25: 'ยาอี', 31: 'กระท่อม', 32: 'กัญชา', 43: 'พบพฤติการณ์', 48: 'จับกุม' })
const data = [set(blank(), { 0: 'ฐานข้อมูลดิบเรื่องร้องเรียน ปีงบประมาณ 2569' }), blank(), H,
  set(blank(), { 1: 1, 2: 'ต.ค.', 3: 68, 12: 'ทุ่งครุ', 13: 'ทุ่งครุ', 15: 100.5, 16: 13.7, 19: 1, 23: 1 })]
const ws = XLSX.utils.aoa_to_sheet(data)
const rows = XLSX.utils.sheet_to_json(ws, { defval: null })
const d = detectTypeScored(rows, 'ฐานข้อมูลดิบเรื่องร้องเรียน ปีงบ 2569.xlsx')
console.log('type:', d.type, '| confidence:', d.confidence)
console.log('reasons:', d.reasons.join(' · '))
const passDrug = d.type === 'drug_incidents' && d.confidence >= 80
console.log(passDrug ? '✓ PASS (drug_incidents >=80%)' : '✗ FAIL')
process.exit(passDrug ? 0 : 1)
