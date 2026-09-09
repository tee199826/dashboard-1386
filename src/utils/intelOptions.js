// intelOptions — ค่าคงที่ + helper ของฟอร์มบันทึกข้อมูล (ฐานข้อมูลการข่าว)
// แยกจากไฟล์ component เพราะไฟล์ component ควร export เฉพาะ component (ไม่งั้น fast-refresh พัง)
import { DNAME_TO_GROUP } from './constants'
import { DRUG_FLAGS } from './drugFlags'

// 50 เขต กทม. เรียงตามตัวอักษรไทย
export const DISTRICTS = Object.keys(DNAME_TO_GROUP).sort((a, b) => a.localeCompare(b, 'th'))

// ชื่อยา — ใช้ชุดเดียวกับที่ระบบใช้อยู่จริง (DRUG_FLAGS) ไม่ตั้งเอง เพื่อให้รวมสถิติกับหน้าอื่นได้ตรง
export const DRUG_OPTIONS = DRUG_FLAGS.map(([, label]) => label)

// ช่วงรายได้ต่อเดือน — ช่วงละ 5,000 บาท + "ไม่มีรายได้"
export const INCOME_OPTIONS = [
  'ไม่มีรายได้',
  'ต่ำกว่า 5,000',
  '5,001-10,000',
  '10,001-15,000',
  '15,001-20,000',
  '20,001-25,000',
  '25,001-30,000',
  'มากกว่า 30,000',
]

// ปี พ.ศ. สำหรับประวัติจับกุม/บำบัด — ปีปัจจุบันย้อนหลัง 50 ปี เรียงใหม่→เก่า
export const YEAR_OPTIONS = (() => {
  const nowBE = new Date().getFullYear() + 543
  return Array.from({ length: 51 }, (_, i) => String(nowBE - i))
})()

// หน่วยสำรอง — ใช้เฉพาะตอนยังดึงหน่วยจากข้อมูลจริงไม่ได้
export const UNIT_FALLBACK = ['เม็ด', 'กรัม', 'ขีด', 'กิโลกรัม', 'มัด', 'ถุง', 'ขวด']

// hash สั้น ๆ สำหรับ record_uid (รูปแบบเดียวกับ importEngine ที่ใช้ 'h:' + hash)
export function simpleHash(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  return h.toString(36)
}
