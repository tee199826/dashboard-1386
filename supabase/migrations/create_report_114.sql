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
  drug_yaba      integer,
  drug_ice       integer,
  drug_heroin    integer,
  drug_cannabis  integer,
  drug_kratom    integer,
  drug_inhalant  integer,
  drug_cough     integer,
  drug_none      integer,
  drug_other     integer,
  id_13          integer,
  expand         integer,
  batch_id       text,
  source_file    text,
  created_at     timestamptz DEFAULT now()
);

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
