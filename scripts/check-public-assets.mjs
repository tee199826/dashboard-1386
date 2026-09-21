// กันไฟล์ข้อมูลหลุดขึ้นเว็บ (SEC-01) — Vite คัดลอกทุกไฟล์ใน public/ ไป dist/ โดยไม่ตรวจสิทธิ์
// รันก่อน `vite build` : ถ้าพบไฟล์นามสกุลนอกรายการอนุญาต ให้ build ล้มเหลวทันที
// อนุญาตเฉพาะไฟล์ที่ตั้งใจให้สาธารณะ (ขอบเขตแผนที่ / ไอคอน / config ของ Netlify)
import { readdirSync, statSync } from 'node:fs'
import { join, extname, relative, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url))
const ALLOWED_EXT = new Set(['.geojson', '.svg', '.png', '.ico', '.webmanifest', '.txt'])
// thai-address.json = รายชื่อ จังหวัด/อำเภอ/ตำบล ทั่วประเทศ (ข้อมูลอ้างอิงสาธารณะ kongvut/thai-province-data, MIT)
//   ช่อง "จังหวัดอื่น" ในแบบซักผู้เสพโหลดตรงจาก /thai-address.json ; อนุญาตระบุชื่อไฟล์ ไม่เปิด .json ทั้งหมด
const ALLOWED_NAME = new Set(['_redirects', '_headers', 'robots.txt', 'thai-address.json'])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const bad = walk(PUBLIC_DIR).filter((p) => {
  const base = basename(p)
  return !ALLOWED_NAME.has(base) && !ALLOWED_EXT.has(extname(base).toLowerCase())
})

if (bad.length) {
  console.error('[check-public-assets] พบไฟล์ที่ไม่อนุญาตใน public/ (จะถูกเผยแพร่บนเว็บโดยไม่ตรวจสิทธิ์):')
  for (const p of bad) console.error('  - ' + relative(process.cwd(), p))
  console.error('ย้ายไฟล์ข้อมูลไปไว้นอก public/ (เช่น private-data/) แล้ว build ใหม่')
  process.exit(1)
}
console.log('[check-public-assets] OK — public/ มีเฉพาะไฟล์ที่อนุญาต')
