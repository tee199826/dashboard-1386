import test from 'node:test'
import assert from 'node:assert/strict'
import { mapRowToRecord } from '../src/features/complaints/complaintImport.js'

// Synthetic rows only; no database, environment files, or real person fixtures.
test('complaint import converts Buddhist dates and completion status', () => {
  const row = mapRowToRecord({ 'วันที่รับเรื่อง': '22/09/2569', 'วันที่ดำเนินการ': '23/09/2569', 'ช่องทาง': 'สายด่วน 1386' }, 2)
  assert.equal(row.date, '2026-09-22')
  assert.equal(row.completedDate, '2026-09-23')
  assert.equal(row.status, 'ดำเนินการแล้ว')
  assert.equal(row.channel, 'สายด่วน 1386')
  assert.equal(row.group, 2)
})

test('complaint import handles missing values and unknown channels', () => {
  const row = mapRowToRecord({ 'วันที่รับเรื่อง': '-', 'เขต': ' ', 'ช่องทาง': 'synthetic-channel' }, 1)
  assert.equal(row.date, null)
  assert.equal(row.district, null)
  assert.equal(row.channel, 'อื่นๆ')
  assert.equal(row.status, 'ยังไม่ได้รับผล')
})

test('complaint import returns only the defined record fields', () => {
  const row = mapRowToRecord({ id: 'synthetic-id', full_name: 'SYNTHETIC ONLY', national_id: 'TEST-ONLY', role: 'admin' }, 3)
  assert.equal(Object.hasOwn(row, 'id'), false)
  assert.equal(Object.hasOwn(row, 'full_name'), false)
  assert.equal(Object.hasOwn(row, 'national_id'), false)
  assert.equal(row.role, null)
})
