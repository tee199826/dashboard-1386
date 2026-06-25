-- Migration: relax_latlng_precision
-- เป้าหมาย: ขยาย precision lat/lng numeric(10,7) → numeric(12,8)
--   เหตุ: ไฟล์บางปี (66) มีพิกัด/orientation ต่างกัน + บาง row เกิน 3 หลักก่อนจุด → overflow numeric(10,7)
--   numeric(12,8) รับได้ถึง 9999.99999999 (เกินพอสำหรับ lat ≤90 / lng ≤180)
-- ✅ idempotent — ALTER TYPE ซ้ำได้ (ค่าเดิม cast เข้า type ใหม่ได้ ไม่ต้อง USING)

ALTER TABLE drug_incidents
  ALTER COLUMN lat TYPE numeric(12,8),
  ALTER COLUMN lng TYPE numeric(12,8);
