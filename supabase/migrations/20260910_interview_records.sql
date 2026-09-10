-- แบบซักผู้เสพ — แยกข้อมูลออกมาเป็นชุดของตัวเอง (ไม่ปนกับ substance_users)
--
-- เหตุผล: substance_users เป็นชุดข้อมูลที่นำเข้าจากไฟล์ Excel (Google Form export)
--         และหน้า /substance-users อ่านได้โดยไม่ต้องล็อกอิน
--         ถ้าเอาแบบซักที่กรอกมือไปปนด้วย จะทำให้
--           1) ตัวเลขสถิติของชุดข้อมูลนำเข้าเพี้ยน (ปนข้อมูลคนละแหล่ง)
--           2) การอัปโหลดไฟล์ทับ (upsert ตาม record_uid) เสี่ยงชนกับข้อมูลที่กรอกมือ
--
-- โครงใหม่ — 2 ตาราง ล็อก "ผู้ดูแลระบบเท่านั้น" ทั้งคู่:
--   interview_records      — เนื้อหาแบบฟอร์ม (ไม่ระบุตัวบุคคล)
--   interview_records_pii  — ข้อมูลส่วนบุคคล (ชื่อ/เลขบัตร/ที่อยู่/ผู้ขาย/ผู้สัมภาษณ์)
-- ยังแยก PII ไว้คนละตาราง เผื่อวันหน้าต้องการเปิดสถิติแบบซักให้อ่านสาธารณะ
-- จะปลดล็อกได้แค่ตารางแรกโดยที่ชื่อ-เลขบัตรไม่หลุดไปด้วย
--
-- รันซ้ำได้ (idempotent)

-- is_admin() — นิยามซ้ำไว้ให้ migration รันได้ด้วยตัวเอง
create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- ── 1) ตารางหลัก ────────────────────────────────────────────────────────────
create table if not exists interview_records (
  record_uid      text primary key,
  code            text,              -- รหัสอ้างอิง ผส-<ปีงบ 2 หลัก>-<ลำดับ> (trigger สร้างให้)
  fiscal_year     int,
  surveyed_at     date,              -- = วันที่สัมภาษณ์
  doc_no          text,              -- เลขที่แบบ (อ้างอิงกระดาษ)

  -- ส่วนที่ ๑ ข้อมูลบุคคล (เฉพาะช่องที่ไม่ระบุตัวตน)
  age             int,
  religion        text,
  marital_status  text,
  education       text,
  education_place text,
  resident_status text,
  residence       jsonb,             -- ชุมชน/แขวง/เขต/จังหวัด/สน./บก.น. (ไม่มีเลขที่บ้าน)
  occupation      text,
  work_info       jsonb,             -- สถานที่ทำงาน/ลักษณะงาน/การแพร่ระบาดในที่ทำงาน
  income_range    text,

  -- ๑ ประวัติถูกจับ / ๒ ประวัติบำบัด
  arrest_count    int  default 0,
  arrests         jsonb default '[]',
  rehab_count     int  default 0,
  rehabs          jsonb default '[]',

  -- ๓ การเสพครั้งแรก
  first_use_age   int,
  first_drug      text,
  first_reason    text,
  first_use       jsonb,

  -- ๔ ยาหลักที่ใช้ประจำ
  main_drug       jsonb,

  -- ๕ ราคายาเสพติด + คำที่ใช้เรียก
  regular_drugs   jsonb default '[]',
  drug_slang      jsonb,

  -- ๖ แหล่งที่เคยซื้อ
  dealer_locations jsonb default '[]',
  purchase        jsonb,

  -- ท้ายแบบ
  interview_info  jsonb,
  note            text,

  created_by      uuid default auth.uid(),
  created_at      timestamptz default now()
);

create index if not exists idx_interview_surveyed on interview_records(surveyed_at);
create index if not exists idx_interview_fy       on interview_records(fiscal_year);
create index if not exists idx_interview_occ      on interview_records(occupation);

alter table interview_records enable row level security;

drop policy if exists interview_admin_read  on interview_records;
create policy interview_admin_read  on interview_records for select using (is_admin());

drop policy if exists interview_admin_write on interview_records;
create policy interview_admin_write on interview_records for all using (is_admin()) with check (is_admin());


-- ── 2) ข้อมูลส่วนบุคคล ──────────────────────────────────────────────────────
create table if not exists interview_records_pii (
  record_uid    text primary key references interview_records(record_uid) on delete cascade,
  full_name     text,
  alias         text,
  national_id   text,
  birth_date    date,
  phone         text,
  contact_phone text,
  address       jsonb,               -- เลขที่/หมู่/อาคาร/ชั้น/ห้อง/ซอย/ถนน
  sellers       jsonb default '[]',  -- ชื่อ/ฉายา/เพศ/อายุ/รูปพรรณ/โทร/อาวุธ/ยานพาหนะ
  interviewer   jsonb,
  created_by    uuid default auth.uid(),
  created_at    timestamptz default now()
);

create index if not exists idx_interview_pii_name on interview_records_pii(full_name);

alter table interview_records_pii enable row level security;

drop policy if exists interview_pii_admin_read  on interview_records_pii;
create policy interview_pii_admin_read  on interview_records_pii for select using (is_admin());

drop policy if exists interview_pii_admin_write on interview_records_pii;
create policy interview_pii_admin_write on interview_records_pii for all using (is_admin()) with check (is_admin());


-- ── 3) รหัสอ้างอิง ผส-๖๙-๐๐๐๑ ───────────────────────────────────────────────
-- สร้างฝั่งฐานข้อมูลด้วย trigger → เลขไม่ชนกันแม้บันทึกพร้อมกันหลายเครื่อง
create or replace function interview_fiscal_year(d date)
returns int language sql immutable as $$
  select case when d is null then null
              when extract(month from d) >= 10 then extract(year from d)::int + 544
              else extract(year from d)::int + 543 end;
$$;

create or replace function interview_assign_code()
returns trigger language plpgsql as $$
declare fy int; yy text; n int;
begin
  if new.code is not null and new.code <> '' then return new; end if;
  fy := coalesce(new.fiscal_year, interview_fiscal_year(new.surveyed_at), interview_fiscal_year(current_date));
  yy := right(fy::text, 2);
  select coalesce(max((regexp_replace(code, '^.*-', ''))::int), 0) + 1
    into n from interview_records where code like 'ผส-' || yy || '-%';
  new.code := 'ผส-' || yy || '-' || lpad(n::text, 4, '0');
  return new;
end $$;

drop trigger if exists trg_interview_assign_code on interview_records;
create trigger trg_interview_assign_code
  before insert on interview_records
  for each row execute function interview_assign_code();

create unique index if not exists idx_interview_code on interview_records(code);


-- ── 4) ย้ายรายการที่เคยกรอกผ่านฟอร์มออกจาก substance_users ──────────────────
-- ทำเฉพาะกรณีที่เคยรัน migration 20260909 ไปแล้ว (ตาราง/คอลัมน์เดิมมีอยู่จริง)
-- เกณฑ์คัดแถว "มาจากฟอร์ม" — แถวที่นำเข้าจาก Excel ไม่เคยมีค่าในคอลัมน์กลุ่มนี้เลย
-- (importEngine เขียนเฉพาะ field ชุดของมันเอง) จึงแยกออกจากกันได้แน่นอน
do $$
declare has_old boolean;
begin
  select to_regclass('public.substance_user_pii') is not null
     and exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'substance_users' and column_name = 'doc_no')
    into has_old;
  if not has_old then return; end if;

  create temp table _moved on commit drop as
    select record_uid from substance_users
     where doc_no is not null or religion is not null or marital_status is not null
        or education is not null or education_place is not null or resident_status is not null
        or residence is not null or work_info is not null or first_use is not null
        or main_drug is not null or purchase is not null or drug_slang is not null
        or interview_info is not null or note is not null
        or record_uid in (select record_uid from substance_user_pii);

  insert into interview_records (
    record_uid, code, fiscal_year, surveyed_at, doc_no, age, religion, marital_status,
    education, education_place, resident_status, residence, occupation, work_info, income_range,
    arrest_count, arrests, rehab_count, rehabs, first_use_age, first_drug, first_reason, first_use,
    main_drug, regular_drugs, drug_slang, dealer_locations, purchase, interview_info, note)
  select
    s.record_uid, s.code, s.fiscal_year, s.surveyed_at::date, s.doc_no, s.age, s.religion, s.marital_status,
    s.education, s.education_place, s.resident_status, s.residence, s.occupation, s.work_info, s.income_range,
    coalesce(s.arrest_count, 0), coalesce(s.arrests, '[]'), coalesce(s.rehab_count, 0), coalesce(s.rehabs, '[]'),
    s.first_use_age, s.first_drug, s.first_reason, s.first_use,
    s.main_drug, coalesce(s.regular_drugs, '[]'), s.drug_slang, coalesce(s.dealer_locations, '[]'),
    s.purchase, s.interview_info, s.note
    from substance_users s join _moved m using (record_uid)
   on conflict (record_uid) do nothing;

  insert into interview_records_pii (
    record_uid, full_name, alias, national_id, birth_date, phone, contact_phone,
    address, sellers, interviewer, created_by, created_at)
  select p.record_uid, p.full_name, p.alias, p.national_id, p.birth_date, p.phone, p.contact_phone,
         p.address, coalesce(p.sellers, '[]'), p.interviewer, p.created_by, p.created_at
    from substance_user_pii p join _moved m using (record_uid)
   on conflict (record_uid) do nothing;

  delete from substance_user_pii where record_uid in (select record_uid from _moved);
  delete from substance_users    where record_uid in (select record_uid from _moved);
end $$;
