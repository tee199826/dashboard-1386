// acceptance tests ของงานแก้จากรายงานตรวจความปลอดภัย (15 ก.ย. 2569) — pure functions ไม่แตะ Supabase
// รัน: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeHtml } from '../src/shared/security/escapeHtml.js'
import { checkUploadFile, assertUploadFile, MAX_UPLOAD_BYTES } from '../src/shared/security/uploadLimits.js'

// ── SEC-09: ค่าจากฐานข้อมูลที่ต่อเป็น HTML ให้ Leaflet ต้องถูก escape ──
test('SEC-09 escapeHtml: marker tag กลายเป็นข้อความ ไม่ใช่ element', () => {
  const marker = '<img src=x onerror="alert(1)">ยาบ้า'
  const out = escapeHtml(marker)
  assert.ok(!out.includes('<'), 'ต้องไม่มี < เหลือ')
  assert.ok(!out.includes('>'), 'ต้องไม่มี > เหลือ')
  assert.equal(out, '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;ยาบ้า')
})

test('SEC-09 escapeHtml: null/undefined → "" และตัวเลข/ไทยปกติผ่านตรง', () => {
  assert.equal(escapeHtml(null), '')
  assert.equal(escapeHtml(undefined), '')
  assert.equal(escapeHtml(42), '42')
  assert.equal(escapeHtml('เขตบางรัก'), 'เขตบางรัก')
  assert.equal(escapeHtml("a'b&c"), 'a&#39;b&amp;c')
})

// ── SEC-11: ตรวจขนาด/นามสกุลจาก metadata ก่อนอ่านไฟล์ ──
const fakeFile = (name, size) => ({
  name, size,
  arrayBuffer: async () => { throw new Error('arrayBuffer ต้องไม่ถูกเรียกเมื่อไฟล์ไม่ผ่าน gate') },
})

test('SEC-11 ไฟล์ประกาศขนาด 1 GiB ถูกปฏิเสธก่อน arrayBuffer', async () => {
  const f = fakeFile('big.xlsx', 1024 ** 3)
  const msg = checkUploadFile(f)
  assert.match(msg, /ใหญ่เกิน/)
  assert.throws(() => assertUploadFile(f), /ใหญ่เกิน/)
})

test('SEC-11 ไฟล์ขนาดพอดีเพดานผ่าน, เกิน 1 byte ไม่ผ่าน', () => {
  assert.equal(checkUploadFile({ name: 'ok.csv', size: MAX_UPLOAD_BYTES }), null)
  assert.match(checkUploadFile({ name: 'ok.csv', size: MAX_UPLOAD_BYTES + 1 }), /ใหญ่เกิน/)
})

test('SEC-11 นามสกุลนอกรายการถูกปฏิเสธ (รวม double extension)', () => {
  assert.match(checkUploadFile({ name: 'x.exe', size: 10 }), /รองรับเฉพาะ/)
  assert.match(checkUploadFile({ name: 'x.xlsx.html', size: 10 }), /รองรับเฉพาะ/)
  assert.equal(checkUploadFile({ name: 'X.XLSX', size: 10 }), null)
  assert.match(checkUploadFile({ name: 'x.csv', size: 10 }, ['xlsx', 'xls']), /รองรับเฉพาะ/)
  assert.match(checkUploadFile(null), /ไม่พบไฟล์/)
})
