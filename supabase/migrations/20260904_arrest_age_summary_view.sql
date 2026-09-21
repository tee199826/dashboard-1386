-- Migration: arrest_age_summary_view
-- ปัญหา: arrest_age มีคอลัมน์ percode (เลขบัตร/รหัสคดีรายคน) — RLS แบบ `USING (true)` กันได้แค่ระดับแถว
--   ไม่กันคอลัมน์ ถ้า anon key ยิง REST API ตรง (เช่น ?select=percode) ก็ยังดึงออกมาได้อยู่ดี ต่อให้ frontend
--   ตั้งใจ select แค่ district,fiscal_year,age ก็ตาม — ต้อง aggregate ที่ DB แล้วปิดสิทธิ์ตารางดิบถึงจะปลอดภัยจริง
-- ✅ idempotent — รันซ้ำได้ปลอดภัย (CREATE OR REPLACE VIEW / REVOKE ที่ไม่เคยมีสิทธิ์อยู่แล้วไม่ error)

-- ── arrest_age_summary ──────────────────────────────────────────────────────
-- สรุป histogram ช่วงอายุ + min/max รายเขต×ปีงบ (ไม่มี percode/age รายคนหลุดออกมาเลย)
-- บวก bucket ข้ามแถว(เขต)ที่ frontend filter ได้ตรงๆ, min ของ min / max ของ max ก็ยังถูกต้องทางคณิตศาสตร์
CREATE OR REPLACE VIEW arrest_age_summary AS
SELECT
  district,
  fiscal_year,
  count(*) FILTER (WHERE age BETWEEN 12 AND 19) AS bucket_12_19,
  count(*) FILTER (WHERE age BETWEEN 20 AND 29) AS bucket_20_29,
  count(*) FILTER (WHERE age BETWEEN 30 AND 39) AS bucket_30_39,
  count(*) FILTER (WHERE age BETWEEN 40 AND 49) AS bucket_40_49,
  count(*) FILTER (WHERE age >= 50) AS bucket_50_plus,
  count(age) AS known_count,
  min(age) AS min_age,
  max(age) AS max_age
FROM arrest_age
GROUP BY district, fiscal_year;

GRANT SELECT ON arrest_age_summary TO anon, authenticated;

-- ── ปิดสิทธิ์ตารางดิบ ────────────────────────────────────────────────────────
-- ตัด anon/authenticated ออกจาก arrest_age ทั้งตาราง — เหลือ service_role (import script) เท่านั้นที่อ่าน/เขียนได้
-- frontend ต้องอ่านผ่าน arrest_age_summary เท่านั้นหลังจากนี้ (ดู src/hooks/useArrestData.js)
REVOKE ALL ON arrest_age FROM anon, authenticated;
