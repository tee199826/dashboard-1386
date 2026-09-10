-- ⛔ เลิกใช้แล้ว — แทนที่ด้วย 20260910_interview_records.sql
--    ไฟล์นี้ต่อคอลัมน์ของแบบฟอร์มเข้าไปใน substance_users (ตารางเดียวกับข้อมูลนำเข้า Excel)
--    ตอนนี้แบบซักผู้เสพมีตารางของตัวเองแล้ว (interview_records / interview_records_pii)
--    ถ้ายังไม่เคยรันไฟล์นี้ → ข้ามไปรัน 20260910 ได้เลย
--    ถ้าเคยรันไปแล้ว     → 20260910 จะย้ายข้อมูลที่กรอกผ่านฟอร์มออกมาให้เอง
--    เก็บไฟล์ไว้เป็นประวัติเท่านั้น
--
-- แบบเก็บข้อมูลจากผู้เสพ (แบบเก็บข้อมูลบุคคล ๑-๑) — รองรับทุกช่องในแบบฟอร์มกระดาษ
--
-- ⚠️ สถาปัตยกรรมสำคัญ: แยกเป็น 2 ตาราง
--   1) substance_users        — ข้อมูลเชิงสถิติ (ไม่ระบุตัวบุคคล) : หน้า /substance-users อ่านได้สาธารณะเหมือนเดิม
--   2) substance_user_pii     — ข้อมูลส่วนบุคคล : RLS ล็อกให้ "ผู้ดูแลระบบเท่านั้น" ทั้งอ่านและเขียน
-- ถ้าเอา PII ไปใส่ตารางแรก ข้อมูลจะเปิดให้คนทั่วไปเห็นทันที เพราะหน้านั้นไม่ต้องล็อกอิน

-- is_admin() — นิยามไว้ให้ migration รันได้ด้วยตัวเอง (security definer เพื่ออ่าน profiles ได้)
create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- ── 1) ช่องเชิงสถิติเพิ่มเติม (ไม่ใช่ PII) ─────────────────────────────────
alter table substance_users add column if not exists doc_no          text;   -- เลขที่แบบ (อ้างอิงกระดาษ)
alter table substance_users add column if not exists religion        text;
alter table substance_users add column if not exists marital_status  text;
alter table substance_users add column if not exists education       text;
alter table substance_users add column if not exists education_place text;
alter table substance_users add column if not exists resident_status text;   -- เจ้าบ้าน/ผู้อาศัย
alter table substance_users add column if not exists residence       jsonb;  -- ชุมชน/แขวง/เขต/จังหวัด/สน./บก.น. (ไม่มีเลขที่บ้าน)
alter table substance_users add column if not exists work_info       jsonb;  -- ลักษณะงาน/สถานที่ทำงาน/การแพร่ระบาดในที่ทำงาน
alter table substance_users add column if not exists first_use       jsonb;  -- รายละเอียดการเสพครั้งแรก (วิธี/ได้มาจาก/ลักษณะ/หลังจากนั้น/ช่วงหยุด)
alter table substance_users add column if not exists main_drug       jsonb;  -- ยาหลักที่ใช้ประจำ + ปริมาณ/วิธี/ความถี่/สถานที่/หาซื้อยากง่าย
alter table substance_users add column if not exists purchase        jsonb;  -- แหล่งซื้อ (ส่วนที่ไม่ระบุตัวผู้ขาย)
alter table substance_users add column if not exists drug_slang      jsonb;  -- คำที่ใช้เรียกยาเสพติด
alter table substance_users add column if not exists interview_info  jsonb;  -- สังกัดผู้สัมภาษณ์/วันที่สัมภาษณ์
alter table substance_users add column if not exists note            text;   -- ข้อสังเกต/ข้อเสนอแนะจากผู้สัมภาษณ์

-- ── 2) ข้อมูลส่วนบุคคล — แยกตาราง ล็อกแอดมินเท่านั้น ──────────────────────
create table if not exists substance_user_pii (
  record_uid   text primary key,          -- ตรงกับ substance_users.record_uid
  full_name    text,                      -- ชื่อ-สกุล
  alias        text,                      -- ชื่ออื่นๆ
  national_id  text,                      -- เลขประจำตัวประชาชน
  birth_date   date,
  phone        text,                      -- โทรศัพท์มือถือ
  contact_phone text,                     -- โทรศัพท์ที่ติดต่อได้
  address      jsonb,                     -- เลขที่/หมู่/อาคาร/ชั้น/ห้อง/ซอย/ถนน
  sellers      jsonb default '[]',        -- ข้อมูลผู้ขาย: ชื่อ/สกุล/ฉายา/เพศ/อายุ/รูปพรรณ/โทร/อาวุธ/ยานพาหนะ
  interviewer  jsonb,                     -- ชื่อผู้สัมภาษณ์ + เบอร์ผู้เก็บข้อมูล
  created_by   uuid default auth.uid(),
  created_at   timestamptz default now()
);

create index if not exists idx_su_pii_name on substance_user_pii(full_name);

alter table substance_user_pii enable row level security;

drop policy if exists su_pii_admin_read  on substance_user_pii;
create policy su_pii_admin_read  on substance_user_pii for select using (is_admin());

drop policy if exists su_pii_admin_write on substance_user_pii;
create policy su_pii_admin_write on substance_user_pii for all using (is_admin()) with check (is_admin());


-- ── 3) รหัสอ้างอิง — อ่านออก ค้นหาง่าย ──────────────────────────────────────
-- รูปแบบ: ผส-<ปีงบ 2 หลัก>-<ลำดับ 4 หลัก>   เช่น  ผส-69-0001
-- สร้างด้วย trigger ฝั่งฐานข้อมูล → ได้รหัสทุกทาง ทั้งกรอกผ่านฟอร์มและนำเข้าไฟล์ Excel
-- และเลขไม่ชนกันแม้บันทึกพร้อมกันหลายเครื่อง
alter table substance_users add column if not exists code text;

-- ปีงบจากวันที่ (ต.ค. เป็นต้นไปนับเป็นปีงบถัดไป) — ใช้ตอน fiscal_year ว่าง
create or replace function su_fiscal_year(d date)
returns int language sql immutable as $$
  select case when d is null then null
              when extract(month from d) >= 10 then extract(year from d)::int + 544
              else extract(year from d)::int + 543 end;
$$;

create or replace function su_assign_code()
returns trigger language plpgsql as $$
declare fy int; yy text; n int;
begin
  if new.code is not null and new.code <> '' then return new; end if;
  fy := coalesce(new.fiscal_year, su_fiscal_year(new.surveyed_at::date), su_fiscal_year(current_date));
  yy := right(fy::text, 2);
  select coalesce(max((regexp_replace(code, '^.*-', ''))::int), 0) + 1
    into n from substance_users where code like 'ผส-' || yy || '-%';
  new.code := 'ผส-' || yy || '-' || lpad(n::text, 4, '0');
  return new;
end $$;

drop trigger if exists trg_su_assign_code on substance_users;
create trigger trg_su_assign_code
  before insert on substance_users
  for each row execute function su_assign_code();

-- เติมรหัสย้อนหลังให้ข้อมูลเดิมที่ยังไม่มี (เรียงตามวันที่สำรวจในแต่ละปีงบ)
with numbered as (
  select record_uid,
         coalesce(fiscal_year, su_fiscal_year(surveyed_at::date), 0) as fy,
         row_number() over (
           partition by coalesce(fiscal_year, su_fiscal_year(surveyed_at::date), 0)
           order by surveyed_at nulls last, record_uid
         ) as rn
    from substance_users where code is null
)
update substance_users s
   set code = 'ผส-' || right(n.fy::text, 2) || '-' || lpad(n.rn::text, 4, '0')
  from numbered n where s.record_uid = n.record_uid;

create unique index if not exists idx_substance_users_code on substance_users(code);
