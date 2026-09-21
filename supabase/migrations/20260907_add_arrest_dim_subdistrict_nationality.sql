-- Migration: add_arrest_dim_subdistrict_nationality
-- เพิ่ม subdistrict (แขวง) ให้ arrest_dim — ใช้กับ dimension='nationality' เท่านั้น
-- (charge/drug ยังคงรวมทั้งเขต ไม่แยกแขวง ตามเดิม — แถวเหล่านั้น subdistrict จะเป็น NULL)
-- ✅ idempotent — ADD COLUMN IF NOT EXISTS รันซ้ำได้ปลอดภัย
-- หลังรัน migration นี้: ต้อง TRUNCATE arrest_dim แล้ว re-import data/arrest_dim.csv ใหม่ทั้งตาราง
--   (จาก scripts/extract_arrest.py ที่เพิ่ม dimension='nationality' + คอลัมน์ subdistrict แล้ว)

ALTER TABLE arrest_dim ADD COLUMN IF NOT EXISTS subdistrict text;
