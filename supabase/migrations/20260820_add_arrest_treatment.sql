-- Migration: add_arrest_treatment
-- เป้าหมาย: สร้าง 2 ตารางใหม่สำหรับหน้า Situation Dashboard (จับกุม/บำบัด)
--   arrest_summary   = สถิติการจับกุม (pivot: เขต × ปีงบ × ไตรมาส × ตัวยา/ข้อหา)
--   treatment_summary = สถิติผู้เข้าบำบัด (pivot: เขต × ปีงบ × dimension เช่น ยาเสพติด/อายุ/อาชีพ/เพศ)
-- ✅ idempotent — รันซ้ำได้ปลอดภัย (CREATE TABLE/INDEX IF NOT EXISTS)

-- ── arrest_summary ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS arrest_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year int NOT NULL,
  quarter int,                    -- 1-4, null = ทั้งปี
  district text NOT NULL,
  zone text,                      -- กลุ่มโซน (derive จาก district ผ่าน DNAME_TO_GROUP)

  cases int DEFAULT 0,            -- จำนวนคดี
  suspects_person int DEFAULT 0,  -- ผู้ต้องหา(คน)
  suspects_case int DEFAULT 0,    -- ผู้ต้องหา(ราย)
  suspects_old int DEFAULT 0,     -- รายเก่า
  suspects_new int DEFAULT 0,     -- รายใหม่

  drug_type text,                 -- ยาบ้า/ไอซ์/คีตามีน/... (null = รวม)
  seizure_amount numeric,         -- ปริมาณของกลาง

  charge text,                    -- ครอบครอง/จำหน่าย/ผลิต/เสพ/ครอบครองเพื่อเสพ
  charge_severe bool,             -- true = ข้อหาร้ายแรง

  created_at timestamptz DEFAULT now(),
  content_hash text UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_arrest_summary_fy_district ON arrest_summary(fiscal_year, district);

-- ── treatment_summary ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS treatment_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year int NOT NULL,
  quarter int,
  district text,
  zone text,

  total_person int DEFAULT 0,
  old_person int DEFAULT 0,
  new_person int DEFAULT 0,

  dimension text,     -- 'drug' | 'age' | 'occupation' | 'gender' | 'entry'
  dim_value text,      -- 'ยาบ้า' | '25-29 ปี' | 'รับจ้างทั่วไป' | 'ชาย' | 'ม.113'

  created_at timestamptz DEFAULT now(),
  content_hash text UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_treatment_summary_fy_district_dim ON treatment_summary(fiscal_year, district, dimension);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- NOTE: ไม่มี is_admin()/RLS policy อื่นถูก track ใน supabase/migrations/ ของ repo นี้เลย
--   (drug_incidents/report_114/bkn_summary ก็ไม่มี) — สันนิษฐานว่า is_admin() ถูกสร้างไว้แล้วบน
--   Supabase Studio โดยตรง (นอก version control). ตรวจสอบว่ามีฟังก์ชันนี้อยู่จริงก่อนรัน block นี้
--   ถ้ายังไม่มี ให้ข้าม block นี้ไปก่อน (ตารางจะเปิดโดยไม่มี RLS เหมือนตารางอื่นในระบบตอนนี้)
ALTER TABLE arrest_summary ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS arrest_read ON arrest_summary;
CREATE POLICY arrest_read ON arrest_summary FOR SELECT USING (true);
DROP POLICY IF EXISTS arrest_write ON arrest_summary;
CREATE POLICY arrest_write ON arrest_summary FOR ALL USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE treatment_summary ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS treatment_read ON treatment_summary;
CREATE POLICY treatment_read ON treatment_summary FOR SELECT USING (true);
DROP POLICY IF EXISTS treatment_write ON treatment_summary;
CREATE POLICY treatment_write ON treatment_summary FOR ALL USING (is_admin()) WITH CHECK (is_admin());
