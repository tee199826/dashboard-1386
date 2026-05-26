-- Migration: add_record_uid
-- เพิ่มคอลัมน์ record_uid สำหรับตรวจสอบข้อมูลซ้ำใน complaints และ drug_incidents
-- รันซ้ำได้ปลอดภัย: ใช้ IF NOT EXISTS และ DROP CONSTRAINT ก่อนสร้างใหม่

-- ============================================================
-- TABLE: complaints
-- ============================================================

-- 1. เพิ่มคอลัมน์ (ข้าม ถ้ามีแล้ว)
ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS record_uid text;

-- 2. Backfill เฉพาะแถวที่ยังไม่มีค่า
UPDATE complaints
SET record_uid = md5(
  coalesce(received_date::text, '') || '|' ||
  coalesce(subdistrict,         '') || '|' ||
  coalesce(community,           '') || '|' ||
  coalesce(channel,             '') || '|' ||
  coalesce(person_type,         '')
)
WHERE record_uid IS NULL;

-- 3. เพิ่ม UNIQUE constraint (ข้าม ถ้ามีแล้ว)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'complaints_record_uid_key'
      AND conrelid = 'complaints'::regclass
  ) THEN
    ALTER TABLE complaints
      ADD CONSTRAINT complaints_record_uid_key UNIQUE (record_uid);
  END IF;
END
$$;

-- ============================================================
-- TABLE: drug_incidents
-- ============================================================

-- 1. เพิ่มคอลัมน์ (ข้าม ถ้ามีแล้ว)
ALTER TABLE drug_incidents
  ADD COLUMN IF NOT EXISTS record_uid text;

-- 2. Backfill เฉพาะแถวที่ยังไม่มีค่า
UPDATE drug_incidents
SET record_uid = md5(
  coalesce(received_date::text, '') || '|' ||
  coalesce(subdistrict,         '') || '|' ||
  coalesce(community,           '') || '|' ||
  coalesce(behaviors,           '') || '|' ||
  coalesce(lat::text,           '') || '|' ||
  coalesce(lng::text,           '')
)
WHERE record_uid IS NULL;

-- 3. เพิ่ม UNIQUE constraint (ข้าม ถ้ามีแล้ว)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'drug_incidents_record_uid_key'
      AND conrelid = 'drug_incidents'::regclass
  ) THEN
    ALTER TABLE drug_incidents
      ADD CONSTRAINT drug_incidents_record_uid_key UNIQUE (record_uid);
  END IF;
END
$$;
