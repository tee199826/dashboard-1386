-- แบบซักผู้เสพ — แก้จุดจากการรีวิวโค้ด
-- รันต่อจาก 20260910 → 20260911 → 20260912 → 20260914 ; รันซ้ำได้ (idempotent)
--
-- 1) เลขที่แบบ / รหัสอ้างอิง ใช้ตัวนับ (interview_counters) แทน max()+1
--    เดิมลบรายการเลขล่าสุดแล้ว เลขนั้นถูกออกซ้ำให้คนถัดไป → กระดาษ 2 ใบเลขเดียวกัน
--    ตัวนับเดินหน้าอย่างเดียว ไม่ย้อนแม้ลบรายการ ; insert ... on conflict ล็อกแถวตัวนับ
--    บันทึกพร้อมกันจึงไม่ชน (ใช้แทน advisory lock ของ 20260912)
-- 2) เลขที่แบบที่เคยพิมพ์เอง (ก่อนมีระบบออกเลข) เช่น "๑-๑/๒๕๖๙" → ย้ายไปเก็บที่ doc_no_legacy แล้วออกเลขใหม่
--    ไม่งั้นระบบนับต่อจาก ๒๕๖๙ และถ้าเคยพิมพ์ซ้ำกันจะสร้าง unique index ไม่ได้
-- 3) save_interview() — บันทึก 2 ตาราง (เนื้อหา + ข้อมูลส่วนบุคคล) ใน transaction เดียว
--    เดิมหน้าเว็บ insert ทีละตาราง ถ้าหลุดกลางทางจะเหลือแถวกำพร้า

-- กันกรณีไฟล์ก่อนหน้ารันไม่ครบ (เช่น 20260911 หยุดตอนสร้าง unique index)
alter table interview_records     add column if not exists nationality   text;
alter table interview_records_pii add column if not exists friend_address text;
alter table interview_records     add column if not exists doc_no_legacy text;   -- เลขที่แบบที่เคยพิมพ์เอง

-- ── 1) ตารางตัวนับ ─────────────────────────────────────────────────────────
create table if not exists interview_counters (
  key     text primary key,   -- 'doc_no' | 'code:<ปีงบ 2 หลัก>'
  last_no int  not null
);
-- ไม่มี policy = หน้าเว็บอ่าน/แก้ตรง ๆ ไม่ได้ ; trigger เขียนผ่าน security definer
alter table interview_counters enable row level security;
revoke all on interview_counters from anon, authenticated;

-- ── 2) ย้ายเลขที่แบบที่พิมพ์เอง + ออกเลขใหม่ — ทำครั้งเดียว ก่อนเริ่มใช้ตัวนับ doc_no ─────
do $$
declare base int; total int;
begin
  if exists (select 1 from interview_counters where key = 'doc_no') then return; end if;

  select count(*) into total from interview_records;

  -- ถือว่า "พิมพ์เอง" เมื่อ: รูปแบบไม่ใช่ ๑-๑/<เลขไทย> , หรือซ้ำกับแถวอื่น ,
  -- หรือเลขดูเป็นปี พ.ศ. (2500–2699) และมากกว่าจำนวนแถวทั้งหมด
  -- (ตอนรันครั้งแรกเลขที่ระบบออกให้ยังไม่เกินจำนวนแถว — ขั้นนี้ไม่ทำซ้ำหลังมีตัวนับแล้ว)
  with legacy as (
    select record_uid, doc_no,
           case when doc_no ~ '^๑-๑/[๐-๙]+$'
                then translate(split_part(doc_no, '/', 2), '๐๑๒๓๔๕๖๗๘๙', '0123456789')::int end as n,
           count(*) over (partition by doc_no) as dup
      from interview_records
     where doc_no is not null and doc_no <> ''
  )
  update interview_records r
     set doc_no_legacy = legacy.doc_no, doc_no = null
    from legacy
   where r.record_uid = legacy.record_uid
     and (legacy.n is null or legacy.dup > 1 or (legacy.n between 2500 and 2699 and legacy.n > total));

  -- ออกเลขให้แถวที่ยังไม่มี ต่อจากเลขสูงสุดที่เหลือ
  select coalesce(max(translate(split_part(doc_no, '/', 2), '๐๑๒๓๔๕๖๗๘๙', '0123456789')::int), 0)
    into base from interview_records where doc_no ~ '^๑-๑/[๐-๙]+$';

  with numbered as (
    select record_uid, row_number() over (order by surveyed_at nulls last, record_uid) + base as rn
      from interview_records
     where doc_no is null or doc_no = ''
  )
  update interview_records r
     set doc_no = '๑-๑/' || translate(lpad(numbered.rn::text, 4, '0'), '0123456789', '๐๑๒๓๔๕๖๗๘๙')
    from numbered
   where r.record_uid = numbered.record_uid;

  select coalesce(max(translate(split_part(doc_no, '/', 2), '๐๑๒๓๔๕๖๗๘๙', '0123456789')::int), 0)
    into base from interview_records where doc_no ~ '^๑-๑/[๐-๙]+$';
  insert into interview_counters (key, last_no) values ('doc_no', base);
end $$;

create unique index if not exists idx_interview_doc_no on interview_records(doc_no);

-- ตัวนับรหัสอ้างอิงแยกตามปีงบ — เริ่มจากเลขสูงสุดที่มีอยู่ (รันซ้ำไม่ทำให้ตัวนับถอยหลัง)
insert into interview_counters (key, last_no)
select 'code:' || substring(code from '^ผส-(\d+)-'), max(substring(code from '-(\d+)$')::int)
  from interview_records
 where code ~ '^ผส-\d+-\d+$'
 group by 1
on conflict (key) do update set last_no = greatest(interview_counters.last_no, excluded.last_no);

-- ── trigger ออกเลข — ใช้ตัวนับ ─────────────────────────────────────────────
create or replace function interview_assign_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare fy int; yy text; n int;
begin
  if new.code is not null and new.code <> '' then return new; end if;
  fy := coalesce(new.fiscal_year, interview_fiscal_year(new.surveyed_at), interview_fiscal_year(current_date));
  yy := right(fy::text, 2);
  insert into interview_counters as c (key, last_no) values ('code:' || yy, 1)
    on conflict (key) do update set last_no = c.last_no + 1
    returning c.last_no into n;
  new.code := 'ผส-' || yy || '-' || lpad(n::text, 4, '0');
  return new;
end $$;

create or replace function interview_assign_doc_no()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.doc_no is not null and new.doc_no <> '' then return new; end if;
  insert into interview_counters as c (key, last_no) values ('doc_no', 1)
    on conflict (key) do update set last_no = c.last_no + 1
    returning c.last_no into n;
  new.doc_no := '๑-๑/' || translate(lpad(n::text, 4, '0'), '0123456789', '๐๑๒๓๔๕๖๗๘๙');
  return new;
end $$;

drop trigger if exists trg_interview_assign_code on interview_records;
create trigger trg_interview_assign_code
  before insert on interview_records
  for each row execute function interview_assign_code();

drop trigger if exists trg_interview_assign_doc_no on interview_records;
create trigger trg_interview_assign_doc_no
  before insert on interview_records
  for each row execute function interview_assign_doc_no();

-- ── 3) บันทึก 2 ตารางใน transaction เดียว ────────────────────────────────────
-- security invoker = RLS ยังบังคับ (ผู้ดูแลระบบเท่านั้น) เหมือน insert ตรงจากหน้าเว็บ
-- ใส่ created_by / created_at เอง เพราะ jsonb_populate_record ให้คอลัมน์ที่ไม่ส่งมาเป็น null (ไม่ใช้ค่า default)
create or replace function save_interview(p_record jsonb, p_pii jsonb default null)
returns table (code text, doc_no text)
language plpgsql security invoker set search_path = public as $$
#variable_conflict use_column
declare
  rec interview_records;
  pii interview_records_pii;
begin
  rec := jsonb_populate_record(null::interview_records, p_record);
  rec.created_by := auth.uid();
  rec.created_at := now();
  insert into interview_records values (rec.*) returning * into rec;   -- trigger ออก code / doc_no ให้

  if p_pii is not null then
    pii := jsonb_populate_record(null::interview_records_pii, p_pii);
    pii.record_uid := rec.record_uid;
    pii.created_by := auth.uid();
    pii.created_at := now();
    insert into interview_records_pii values (pii.*);
  end if;

  return query select rec.code, rec.doc_no;
end $$;

revoke all on function save_interview(jsonb, jsonb) from public, anon;
grant execute on function save_interview(jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
