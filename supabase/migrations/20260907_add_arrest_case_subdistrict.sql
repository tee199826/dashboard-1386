-- Migration: add_arrest_case_subdistrict
-- arrest_case เดิมมีแค่ระดับเขต — เพิ่ม subdistrict (แขวง) เพื่อรองรับตารางพฤติการณ์รายแขวง
-- ✅ idempotent — ADD COLUMN IF NOT EXISTS รันซ้ำได้ปลอดภัย
-- หลังรัน migration นี้: ต้อง re-import data/arrest_case.csv ใหม่ (จาก scripts/extract_arrest.py)
--   เพราะแถวเดิมในตารางจะมี subdistrict เป็น NULL ทั้งหมด — ลบของเดิมแล้วนำเข้าใหม่ทั้งตาราง (ไม่ใช่ upsert ทับ)

ALTER TABLE arrest_case ADD COLUMN IF NOT EXISTS subdistrict text;
