-- Migration: create_report_114
-- สร้างตาราง report_114 สำหรับรายงานการดำเนินการตามข้อร้องเรียน (RPT_114)
-- รันซ้ำได้ปลอดภัย: ใช้ IF NOT EXISTS

CREATE TABLE IF NOT EXISTS report_114 (
  id             bigserial PRIMARY KEY,
  report_id      text      NOT NULL DEFAULT '114',
  fiscal_year    integer   NOT NULL,
  period         text,
  group_name     text      NOT NULL,
  group_no       integer,
  complaints     integer,
  processed      integer,
  percent        numeric,
  found          integer,
  not_found      integer,
  not_in_area    integer,
  investigating  integer,
  deceased       integer,
  arrested       integer,
  more_invest    integer,
  rehab          integer,
  framed         integer,
  closed         integer,
  action_other   integer,
  charge_use     integer,
  charge_possess integer,
  charge_sell    integer,
  charge_possess_sell integer,
  charge_none    integer,
  drug_yaba      numeric,
  drug_ice       numeric,
  drug_heroin    numeric,
  drug_cannabis  numeric,
  drug_kratom    numeric,
  drug_inhalant  numeric,
  drug_cough     numeric,
  drug_none      numeric,
  drug_other     numeric,
  id_13          integer,
  expand         integer,
  batch_id       text,
  source_file    text,
  created_at     timestamptz DEFAULT now()
);

-- แก้คอลัมน์ drug_* ที่เคย CREATE เป็น integer ให้เป็น numeric (หน่วยกรัม มีทศนิยม)
DO $$
DECLARE col text;
BEGIN
  FOREACH col IN ARRAY ARRAY['drug_yaba','drug_ice','drug_heroin','drug_cannabis',
                              'drug_kratom','drug_inhalant','drug_cough','drug_none','drug_other']
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'report_114' AND column_name = col AND data_type = 'integer'
    ) THEN
      EXECUTE format('ALTER TABLE report_114 ALTER COLUMN %I TYPE numeric', col);
    END IF;
  END LOOP;
END
$$;

-- Unique constraint สำหรับ upsert (report_id, fiscal_year, group_name)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'report_114_report_id_fiscal_year_group_name_key'
      AND conrelid = 'report_114'::regclass
  ) THEN
    ALTER TABLE report_114
      ADD CONSTRAINT report_114_report_id_fiscal_year_group_name_key
      UNIQUE (report_id, fiscal_year, group_name);
  END IF;
END
$$;
