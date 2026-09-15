-- Security baseline (รายงานตรวจความปลอดภัย 15 ก.ย. 2569 — SEC-03/04/05/10/12/13)
--
-- ปัญหา: ชุด migration ใน repo ไม่มี RLS/policy ของ drug_incidents, report_114, complaints,
--   bkn_summary, substance_users, upload_batches, audit_logs และ profiles เลย และไม่มี trigger
--   สร้าง profile — ทำให้ตรวจสอบสิทธิ์จริงจาก repo ไม่ได้ และ is_admin() พึ่ง profiles.role
--   ที่ยังไม่มีหลักฐานว่าผู้ใช้แก้เองไม่ได้
--
-- ไฟล์นี้กำหนด "ฐานสิทธิ์" ให้ครบและตรวจสอบได้จาก repo:
--   1) profiles        — อ่านของตัวเอง/แอดมินอ่านทั้งหมด, ห้ามผู้ใช้เปลี่ยน role ตัวเอง (trigger)
--   2) handle_new_user — สร้าง profile ตอนสมัคร โดย role = 'user' เสมอ (ไม่เชื่อ user metadata)
--   3) ตารางสาธารณะ    — อ่านได้ทุกคน (dashboard สาธารณะโดยตั้งใจ) / เขียนได้เฉพาะแอดมิน
--   4) audit_logs      — เขียนได้เฉพาะแถวของตัวเอง, แก้/ลบไม่ได้, อ่านได้เฉพาะแอดมิน
--   5) interview_*     — RPC ทำงานเป็นธุรกรรมเดียว + ค้นหา/แบ่งหน้าฝั่งเซิร์ฟเวอร์ + mask PII ในรายการ
--
-- ✅ idempotent — รันซ้ำได้ ; ตารางที่ยังไม่มีในฐาน (เช่น bkn_summary) จะข้ามไป
-- ⚠️ รันบน staging ก่อน แล้วทดสอบ allow/deny matrix (anon/user/admin) ผ่าน API ตรง
--    ไฟล์นี้ไม่ได้ลบ policy เดิมที่ตั้งจาก dashboard — ตรวจ pg_policies ด้วยว่าไม่มี policy หลวมกว่านี้ค้างอยู่

-- ═══════════════════════════════════════════════════════════════════════════
-- 0) is_admin() — นิยามเดิม (ซ้ำไว้ให้ไฟล์นี้รันได้ด้วยตัวเอง)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;
revoke execute on function is_admin() from public;
grant  execute on function is_admin() to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) profiles
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'user',
  created_at timestamptz default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table profiles add constraint profiles_role_check check (role in ('user', 'admin'));
  end if;
end $$;

alter table profiles enable row level security;

drop policy if exists profiles_read_own   on profiles;
create policy profiles_read_own   on profiles for select using (id = auth.uid());

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_admin_all  on profiles;
create policy profiles_admin_all  on profiles for all using (is_admin()) with check (is_admin());

-- ผู้ใช้ทั่วไปแก้ profile ตัวเองได้ (เช่น full_name) แต่ห้ามเปลี่ยน role — บังคับด้วย trigger
-- (policy อย่างเดียวแยกคอลัมน์ไม่ได้) และห้ามแอดมินถอด admin ตัวเองจนไม่มีใครดูแลระบบ
create or replace function profiles_guard_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    if not is_admin() then
      raise exception 'forbidden: only admin can change role' using errcode = '42501';
    end if;
    if old.role = 'admin' and new.role <> 'admin'
       and (select count(*) from profiles where role = 'admin') <= 1 then
      raise exception 'forbidden: cannot remove the last admin' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_guard_role on profiles;
create trigger trg_profiles_guard_role
  before update on profiles
  for each row execute function profiles_guard_role();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) สร้าง profile อัตโนมัติเมื่อมีผู้ใช้ใหม่ — role = 'user' เสมอ
--    user metadata (options.data ตอน signUp) เป็นค่าที่ผู้สมัครควบคุมได้ → ห้ามใช้กำหนดสิทธิ์
--    การให้สิทธิ์ admin ทำผ่าน Edge Function admin-create-user (service role) เท่านั้น
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, role)
  values (new.id, new.email, nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''), 'user')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) ตารางข้อมูล dashboard — อ่านสาธารณะ / เขียนเฉพาะแอดมิน
--    ขอบเขตที่อนุมัติให้สาธารณะ: ข้อมูลเชิงสถิติ ไม่มีชื่อ/เลขบัตร/ที่อยู่รายบุคคล
--    (complaints มีเพศ/อาชีพ/เขต — เจ้าของข้อมูลต้องยืนยันว่าไม่ระบุตัวบุคคลทางอ้อม)
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    'drug_incidents', 'report_114', 'complaints', 'bkn_summary', 'substance_users',
    'upload_batches', 'arrest_summary', 'treatment_summary'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_public_read', t);
    execute format('create policy %I on %I for select using (true)', t || '_public_read', t);
    execute format('drop policy if exists %I on %I', t || '_admin_write', t);
    execute format('create policy %I on %I for all using (is_admin()) with check (is_admin())', t || '_admin_write', t);
  end loop;
end $$;

-- ตาราง backup ของ schema เก่า — ไม่มีหน้าไหนใช้ : เปิด RLS โดยไม่มี policy = ปิดทุก role ยกเว้น owner
do $$ begin
  if to_regclass('public.drug_incidents_legacy_v1') is not null then
    alter table drug_incidents_legacy_v1 enable row level security;
    revoke all on drug_incidents_legacy_v1 from anon, authenticated;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) audit_logs — append-only
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists audit_logs (
  id          bigserial primary key,
  user_id     uuid,
  user_email  text,
  action      text not null,
  resource    text,
  resource_id text,
  details     jsonb,
  user_agent  text,
  created_at  timestamptz default now()
);
create index if not exists idx_audit_logs_created on audit_logs(created_at desc);

alter table audit_logs enable row level security;

-- เขียนได้เฉพาะแถวที่ user_id = ตัวเอง (ปลอม actor ไม่ได้) ; anon เขียนไม่ได้
drop policy if exists audit_insert_own on audit_logs;
create policy audit_insert_own on audit_logs for insert to authenticated with check (user_id = auth.uid());

drop policy if exists audit_admin_read on audit_logs;
create policy audit_admin_read on audit_logs for select using (is_admin());

-- ไม่มี policy update/delete → แก้/ลบผ่าน API ไม่ได้ (รวมแอดมิน) ; ตัด grant ซ้ำอีกชั้น
revoke update, delete, truncate on audit_logs from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) แบบซักผู้เสพ — RPC (security invoker → RLS ของ interview_* ยังบังคับใช้)
--    ทุกฟังก์ชันตรวจ is_admin() ซ้ำและ raise ถ้าไม่ใช่ เพื่อไม่ให้ error กลายเป็น "ไม่มีข้อมูล"
-- ═══════════════════════════════════════════════════════════════════════════

-- ตัวช่วย: mask เลขบัตร (เหลือ 4 ตัวท้าย) และเบอร์โทร (เหลือ 3 ตัวท้าย) — ใช้ในรายการ/ผลค้นหา
create or replace function interview_mask_nid(v text)
returns text language sql immutable as $$
  select case when v is null or v = '' then null
              else repeat('x', greatest(length(regexp_replace(v, '\D', '', 'g')) - 4, 0))
                   || right(regexp_replace(v, '\D', '', 'g'), 4) end;
$$;
create or replace function interview_mask_phone(v text)
returns text language sql immutable as $$
  select case when v is null or v = '' then null
              else repeat('x', greatest(length(v) - 3, 0)) || right(v, 3) end;
$$;

-- 5.1 บันทึกแบบซัก + PII ในธุรกรรมเดียว (SEC-12)
--     record_uid = idempotency key : ยิงซ้ำด้วย uid เดิม → ไม่สร้างแถวซ้ำ, PII ถูก upsert
create or replace function interview_save(p_record jsonb, p_pii jsonb default null)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_uid text := p_record->>'record_uid';
  r interview_records;
  pr interview_records_pii;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_uid is null or v_uid = '' then raise exception 'record_uid required'; end if;

  -- ตัดคอลัมน์ที่ต้องให้ trigger/default เป็นคนกำหนด
  r := jsonb_populate_record(null::interview_records,
         (p_record - 'code' - 'doc_no' - 'created_by' - 'created_at'));
  r.created_by := auth.uid();
  r.created_at := now();
  insert into interview_records select (r).* on conflict (record_uid) do nothing;

  if p_pii is not null and p_pii <> '{}'::jsonb then
    pr := jsonb_populate_record(null::interview_records_pii,
            (p_pii - 'created_by' - 'created_at') || jsonb_build_object('record_uid', v_uid));
    pr.created_by := auth.uid();
    pr.created_at := now();
    insert into interview_records_pii select (pr).*
    on conflict (record_uid) do update set
      full_name = excluded.full_name, alias = excluded.alias, national_id = excluded.national_id,
      birth_date = excluded.birth_date, phone = excluded.phone, contact_phone = excluded.contact_phone,
      address = excluded.address, sellers = excluded.sellers, interviewer = excluded.interviewer;
  end if;

  insert into audit_logs (user_id, user_email, action, resource, resource_id, details)
  values (auth.uid(), auth.jwt()->>'email', 'create', 'interview_records', v_uid,
          jsonb_build_object('hasPii', p_pii is not null and p_pii <> '{}'::jsonb));

  return (select jsonb_build_object('record_uid', ir.record_uid, 'code', ir.code, 'doc_no', ir.doc_no)
            from interview_records ir where ir.record_uid = v_uid);
end $$;

-- 5.2 ค้นหา + แบ่งหน้าฝั่งเซิร์ฟเวอร์ (SEC-05/13) — คืนเฉพาะคอลัมน์ที่รายการต้องใช้ + PII แบบ mask
create or replace function interview_search(
  p_q text default null, p_from date default null, p_to date default null,
  p_district text default null, p_occupation text default null,
  p_age_min int default null, p_age_max int default null,
  p_limit int default 50, p_offset int default 0
)
returns table (
  record_uid text, code text, surveyed_at date, doc_no text, age int, occupation text,
  district text, subdistrict text, full_name text, national_id_masked text, total_count bigint
)
language plpgsql security invoker stable set search_path = public as $$
declare
  q text := nullif(trim(p_q), '');
  q_digits text;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  q_digits := nullif(regexp_replace(coalesce(q, ''), '\D', '', 'g'), '');
  return query
    select ir.record_uid, ir.code, ir.surveyed_at, ir.doc_no, ir.age, ir.occupation,
           ir.residence->>'district', ir.residence->>'subdistrict',
           p.full_name, interview_mask_nid(p.national_id),
           count(*) over () as total_count
      from interview_records ir
      left join interview_records_pii p on p.record_uid = ir.record_uid
     where (q is null
            or ir.code ilike '%' || q || '%' or ir.doc_no ilike '%' || q || '%'
            or p.full_name ilike '%' || q || '%' or p.alias ilike '%' || q || '%'
            or (q_digits is not null and (p.national_id like '%' || q_digits || '%'
                                          or p.phone like '%' || q_digits || '%')))
       and (p_from is null or ir.surveyed_at >= p_from)
       and (p_to   is null or ir.surveyed_at <= p_to)
       and (p_district   is null or ir.residence->>'district' = p_district)
       and (p_occupation is null or ir.occupation = p_occupation)
       and (p_age_min is null or ir.age >= p_age_min)
       and (p_age_max is null or ir.age <= p_age_max)
     order by ir.surveyed_at desc nulls last, ir.record_uid
     limit greatest(1, least(p_limit, 100000)) offset greatest(0, p_offset);
end $$;

-- ตัวเลือกตัวกรอง (อาชีพ) — ไม่แตะ PII
create or replace function interview_filter_options()
returns table (occupation text)
language plpgsql security invoker stable set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select distinct ir.occupation from interview_records ir
     where ir.occupation is not null and ir.occupation <> ''
     order by 1;
end $$;

-- 5.3 เปิดดูรายละเอียดรายคน — ดึง PII เต็มเฉพาะแถวเดียว + บันทึก audit ในธุรกรรมเดียว (SEC-05/10)
create or replace function interview_get(p_record_uid text)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare rec jsonb; pii jsonb;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select to_jsonb(ir) into rec from interview_records ir where ir.record_uid = p_record_uid;
  if rec is null then return null; end if;
  select to_jsonb(p) into pii from interview_records_pii p where p.record_uid = p_record_uid;
  insert into audit_logs (user_id, user_email, action, resource, resource_id)
  values (auth.uid(), auth.jwt()->>'email', 'view', 'interview_records_pii', p_record_uid);
  return jsonb_build_object('record', rec, 'pii', pii);
end $$;

-- 5.4 ส่งออก — ใช้ตัวกรองชุดเดียวกับ search, คืน PII เต็ม, audit ก่อนคืนข้อมูล (ถ้า audit ล้ม → ไม่คืน)
create or replace function interview_export(
  p_q text default null, p_from date default null, p_to date default null,
  p_district text default null, p_occupation text default null,
  p_age_min int default null, p_age_max int default null
)
returns setof jsonb
language plpgsql security invoker set search_path = public as $$
declare n bigint;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(max(s.total_count), 0) into n
    from interview_search(p_q, p_from, p_to, p_district, p_occupation, p_age_min, p_age_max, 1, 0) s;
  insert into audit_logs (user_id, user_email, action, resource, details)
  values (auth.uid(), auth.jwt()->>'email', 'export', 'interview_records',
          jsonb_build_object('count', n, 'q', p_q, 'from', p_from, 'to', p_to,
                             'district', p_district, 'occupation', p_occupation));
  return query
    select to_jsonb(ir) || jsonb_build_object('pii', to_jsonb(p))
      from interview_search(p_q, p_from, p_to, p_district, p_occupation, p_age_min, p_age_max, 200000, 0) s
      join interview_records ir on ir.record_uid = s.record_uid
      left join interview_records_pii p on p.record_uid = ir.record_uid
     order by ir.surveyed_at desc nulls last, ir.record_uid;
end $$;

-- 5.5 ลบ — ลบ parent ครั้งเดียว อาศัย FK on delete cascade ; audit ในธุรกรรมเดียว (SEC-12)
create or replace function interview_delete(p_record_uid text)
returns boolean
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from interview_records where record_uid = p_record_uid;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  insert into audit_logs (user_id, user_email, action, resource, resource_id)
  values (auth.uid(), auth.jwt()->>'email', 'delete', 'interview_records', p_record_uid);
  return true;
end $$;

-- สิทธิ์เรียก RPC: เฉพาะผู้ล็อกอิน (ตรวจ is_admin() ซ้ำภายใน)
do $$
declare f text;
begin
  foreach f in array array[
    'interview_save(jsonb, jsonb)',
    'interview_search(text, date, date, text, text, int, int, int, int)',
    'interview_filter_options()',
    'interview_get(text)',
    'interview_export(text, date, date, text, text, int, int)',
    'interview_delete(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
