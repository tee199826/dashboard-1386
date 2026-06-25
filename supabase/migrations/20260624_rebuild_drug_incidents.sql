-- Migration: rebuild_drug_incidents (wide one-hot schema)
-- เป้าหมาย: เปลี่ยน drug_incidents → wide format (one-hot drug_*/beh_*/result_*/action_*)
--   derive primary_drug/behaviors/primary_action ฝั่ง client (/radar) — ไม่ใช้ generated column
-- Backup ของเดิม: drug_incidents_legacy_v1 (rename, ปลอดภัย ย้อนกลับได้)
-- ✅ idempotent — รันจาก state ไหนก็ได้ (fresh / partial-run / รันซ้ำ) ไม่พัง

-- ── Step 1+2: backup ตารางเดิม + rename index ของมัน (เฉพาะตอนที่ตารางเดิมยังเป็น schema เก่า) ──
--   ทำใน DO block: rename เฉพาะถ้า drug_incidents ยังอยู่ + ยังไม่มี legacy
--   → ป้องกันการ rename index ของ "ตารางใหม่" โดยพลั้งเมื่อรันซ้ำ
DO $$
DECLARE
  has_old    bool;
  has_legacy bool;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'drug_incidents')            INTO has_old;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'drug_incidents_legacy_v1')  INTO has_legacy;

  IF has_old AND NOT has_legacy THEN
    -- ตารางเดิมยังเป็น schema เก่า → backup + rename pkey/index กัน collision กับตารางใหม่
    ALTER TABLE drug_incidents RENAME TO drug_incidents_legacy_v1;
    ALTER INDEX IF EXISTS drug_incidents_pkey            RENAME TO drug_incidents_legacy_v1_pkey;
    ALTER INDEX IF EXISTS drug_incidents_record_uid_key  RENAME TO dil_v1_record_uid_key;
    ALTER INDEX IF EXISTS idx_drug_incidents_date        RENAME TO idx_dil_v1_date;
    ALTER INDEX IF EXISTS idx_drug_incidents_district    RENAME TO idx_dil_v1_district;
    ALTER INDEX IF EXISTS idx_drug_incidents_geo         RENAME TO idx_dil_v1_geo;
    ALTER INDEX IF EXISTS idx_drug_incidents_fy          RENAME TO idx_dil_v1_fy;
  END IF;
END $$;

-- ── Step 3: สร้าง table ใหม่ (wide) — IF NOT EXISTS กันรันซ้ำ ──
CREATE TABLE IF NOT EXISTS drug_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  received_date date NOT NULL,
  fiscal_year int NOT NULL,

  group_no int,
  community text,
  subdistrict text,
  district text NOT NULL,
  community_code text,
  address text,
  lat numeric(10,7),
  lng numeric(10,7),
  area_group text,

  -- พฤติการณ์ (one-hot)
  beh_use bool DEFAULT false,
  beh_sell bool DEFAULT false,
  beh_use_sell bool DEFAULT false,
  beh_produce bool DEFAULT false,

  -- ชนิดยา (one-hot)
  drug_yaba bool DEFAULT false,
  drug_ice bool DEFAULT false,
  drug_ecstasy bool DEFAULT false,
  drug_ketamine bool DEFAULT false,
  drug_cocaine bool DEFAULT false,
  drug_heroin bool DEFAULT false,
  drug_morphine bool DEFAULT false,
  drug_opium bool DEFAULT false,
  drug_kratom bool DEFAULT false,
  drug_cannabis bool DEFAULT false,
  drug_solvent bool DEFAULT false,
  drug_4x100 bool DEFAULT false,
  drug_misuse bool DEFAULT false,
  drug_psychotropic bool DEFAULT false,
  drug_others text[],

  -- ผลพิสูจน์ทราบ (one-hot)
  result_found bool DEFAULT false,
  result_not_found bool DEFAULT false,
  result_unprovable bool DEFAULT false,
  result_deceased bool DEFAULT false,

  -- ดำเนินการ (one-hot)
  action_search bool DEFAULT false,
  action_arrest bool DEFAULT false,
  action_escape bool DEFAULT false,
  action_investigating bool DEFAULT false,
  action_treatment bool DEFAULT false,

  source text,
  created_at timestamptz DEFAULT now(),
  content_hash text UNIQUE
);
-- NOTE: ไม่มี generated columns (primary_drug/behaviors/primary_action)
--   เหตุผล: CONCAT_WS เป็น STABLE → generated column ต้อง IMMUTABLE → Postgres reject
--   วิธีใหม่ (A): derive ฝั่ง client (/radar) จาก one-hot ตอน load — importEngine ไม่เกี่ยว
--   ทุก query อ่าน drug_*/beh_*/action_* (boolean) ตรงๆ

-- ── Step 4: indexes — IF NOT EXISTS กันรันซ้ำ ──
CREATE INDEX IF NOT EXISTS idx_drug_incidents_date     ON drug_incidents(received_date);
CREATE INDEX IF NOT EXISTS idx_drug_incidents_district ON drug_incidents(district);
CREATE INDEX IF NOT EXISTS idx_drug_incidents_geo      ON drug_incidents(lat, lng);
CREATE INDEX IF NOT EXISTS idx_drug_incidents_fy       ON drug_incidents(fiscal_year);

-- ── rollback (ถ้าต้องย้อนกลับเป็น schema เก่า) ──
-- DROP TABLE IF EXISTS drug_incidents;
-- ALTER TABLE drug_incidents_legacy_v1 RENAME TO drug_incidents;
-- ALTER INDEX drug_incidents_legacy_v1_pkey RENAME TO drug_incidents_pkey;
