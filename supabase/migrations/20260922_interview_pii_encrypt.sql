-- เข้ารหัส interview_records_pii + ปิดทางเข้าตารางตรง
--
-- ที่มา: ตรวจสิทธิ์กับฐานจริง 22 ก.ย. 2569 พบว่า interview_records_pii เปิดให้ role
--        anon เข้าถึงได้ ตารางนี้เก็บชื่อ เลขบัตรประชาชน ที่อยู่ เบอร์โทร และข้อมูล
--        ผู้ขาย เป็น plaintext ทั้งหมด ปิด grant ไปแล้วแต่ข้อมูลยังเป็น plaintext อยู่
--        ถ้าสิทธิ์หลุดอีกครั้ง หรือ backup/replica หลุด ก็อ่านได้ทันที
--
--        rpt_records_pii เจอสถานการณ์เดียวกันแต่ไม่เสี่ยง เพราะเก็บเป็น ciphertext
--        migration นี้ยกโมเดลเดียวกันมาใช้กับ interview
--
-- ทำอะไร:
--   1. เพิ่ม enc bytea + enc_version แล้วย้ายข้อมูลจากคอลัมน์ plaintext เข้าไป
--      จากนั้น drop คอลัมน์ plaintext ทิ้ง — ในตารางไม่เหลือ plaintext
--   2. เขียน RPC ของ interview ใหม่ให้ถอดรหัสตอนอ่าน (แนวเดียวกับ rpt_entry_*)
--   3. ถอนสิทธิ์ตารางออกจาก anon/authenticated เหลือทางเข้าเดียวคือ RPC
--
-- ⚠️ ข้อที่ 3 ไม่ใช่แค่การเพิ่มความแน่นหนา แต่เป็นการ "แก้ของที่พังอยู่"
--    RPC ชุดเดิมประกาศเป็น security invoker คือรันด้วยสิทธิ์ของผู้เรียก
--    เมื่อ revoke สิทธิ์ตารางออกจาก authenticated ไปแล้วเมื่อ 22 ก.ย.
--    RPC ทั้งห้าตัวที่แตะ PII จะ error permission denied ทันที
--    → หน้าแบบสัมภาษณ์ใช้งานไม่ได้อยู่ตอนนี้ migration นี้แก้ด้วยการเปลี่ยนเป็น
--      security definer ซึ่งมี is_admin() กันอยู่แล้วทุกตัว (โมเดลเดียวกับ rpt)
--
-- 🔑 ใช้กุญแจร่วมกับ rpt (rpt_pii_key) ตามที่ตกลงไว้ ผลที่ตามมาคือถ้าจะหมุนกุญแจ
--    ต้อง re-encrypt ทั้งสองตารางพร้อมกัน ถ้าต้องการแยกกุญแจในอนาคต ให้สร้าง
--    secret ใหม่แล้วทำ interview_pii_encrypt/decrypt คู่ของตัวเอง
--
-- ✅ idempotent — รันซ้ำได้ ไม่เข้ารหัสซ้อนและไม่ทำข้อมูลหาย
-- ⚠️ รันบน staging ก่อน แล้วทดสอบ: บันทึกแบบซัก / ค้นหา / เปิดดูรายคน / ส่งออก / ลบ
-- ⚠️ สำรองฐานก่อนรัน — ขั้นตอนนี้ drop คอลัมน์ ถ้าพลาดกู้จาก backup อย่างเดียว

-- ═══════════════════════════════════════════════════════════════════════════
-- 0) ต้องมีกลไกเข้ารหัสของ rpt ก่อน
-- ═══════════════════════════════════════════════════════════════════════════
do $$ begin
  if to_regprocedure('public.rpt_pii_encrypt(jsonb)') is null
     or to_regprocedure('public.rpt_pii_decrypt(bytea)') is null then
    raise exception
      'ไม่พบ rpt_pii_encrypt/rpt_pii_decrypt — ต้องรัน 20260918_rpt_field_entry.sql ให้ครบก่อน';
  end if;
end $$;

-- is_admin() — นิยามซ้ำไว้ให้ migration รันได้ด้วยตัวเอง
create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) ย้าย plaintext เข้า enc แล้ว drop คอลัมน์เดิม
-- ═══════════════════════════════════════════════════════════════════════════
alter table interview_records_pii add column if not exists enc         bytea;
alter table interview_records_pii add column if not exists enc_version int not null default 1;

-- ทั้งก้อนอยู่ใน DO เดียว — ถ้า migration รันซ้ำ คอลัมน์ plaintext จะไม่มีแล้ว
-- เงื่อนไข if exists จึงเป็น false และข้ามทั้งบล็อกไป ไม่เข้ารหัสซ้อน
do $$ begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'interview_records_pii'
       and column_name = 'full_name'
  ) then

    -- เข้ารหัสเฉพาะแถวที่ยังไม่มี enc — เผื่อรอบก่อนค้างกลางทาง
    update interview_records_pii set enc = rpt_pii_encrypt(jsonb_strip_nulls(jsonb_build_object(
      'full_name',     full_name,
      'alias',         alias,
      'national_id',   national_id,
      'birth_date',    birth_date,
      'phone',         phone,
      'contact_phone', contact_phone,
      'address',       address,
      'sellers',       sellers,
      'interviewer',   interviewer,
      'friend_address', friend_address
    ))) where enc is null;

    -- index เดิมชี้คอลัมน์ที่กำลังจะหาย และ index บน plaintext เองก็รั่วข้อมูลได้
    drop index if exists idx_interview_pii_name;

    alter table interview_records_pii
      drop column if exists full_name,
      drop column if exists alias,
      drop column if exists national_id,
      drop column if exists birth_date,
      drop column if exists phone,
      drop column if exists contact_phone,
      drop column if exists address,
      drop column if exists sellers,
      drop column if exists interviewer,
      drop column if exists friend_address;
  end if;
end $$;

comment on column interview_records_pii.enc is
  'ciphertext ของ {full_name, alias, national_id, birth_date, phone, contact_phone, address, sellers, interviewer, friend_address} — ถอดผ่าน rpt_pii_decrypt() เท่านั้น';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) RPC — เขียนใหม่เป็น security definer + ถอดรหัสตอนอ่าน
--    ลายเซ็นและรูปแบบผลลัพธ์เหมือนเดิมทุกตัว ฝั่ง React ไม่ต้องแก้
-- ═══════════════════════════════════════════════════════════════════════════

-- 2.1 บันทึกแบบซัก + PII ในธุรกรรมเดียว
create or replace function interview_save(p_record jsonb, p_pii jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := p_record->>'record_uid';
  r interview_records;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_uid is null or v_uid = '' then raise exception 'record_uid required'; end if;

  r := jsonb_populate_record(null::interview_records,
         (p_record - 'code' - 'doc_no' - 'created_by' - 'created_at'));
  r.created_by := auth.uid();
  r.created_at := now();
  insert into interview_records select (r).* on conflict (record_uid) do nothing;

  if p_pii is not null and p_pii <> '{}'::jsonb then
    insert into interview_records_pii (record_uid, enc, enc_version, created_by, created_at)
    values (v_uid,
            rpt_pii_encrypt(jsonb_strip_nulls(p_pii - 'record_uid' - 'created_by' - 'created_at')),
            1, auth.uid(), now())
    on conflict (record_uid) do update set enc = excluded.enc, enc_version = excluded.enc_version;
  end if;

  insert into audit_logs (user_id, user_email, action, resource, resource_id, details)
  values (auth.uid(), auth.jwt()->>'email', 'create', 'interview_records', v_uid,
          jsonb_build_object('hasPii', p_pii is not null and p_pii <> '{}'::jsonb));

  return (select jsonb_build_object('record_uid', ir.record_uid, 'code', ir.code, 'doc_no', ir.doc_no)
            from interview_records ir where ir.record_uid = v_uid);
end $$;

-- 2.2 ค้นหา + แบ่งหน้าฝั่งเซิร์ฟเวอร์ — คืน PII แบบ mask เหมือนเดิม
--     ค้นชื่อ/ฉายา/เลขบัตร/เบอร์ ต้องถอดรหัสก่อนถึงจะเทียบได้ จึงใช้ lateral
--     ให้ตัวกรองที่ไม่ใช่ PII (วันที่/เขต/อาชีพ/อายุ) ถูกใช้ก่อน แล้วค่อยถอดเฉพาะ
--     แถวที่เหลือ — แนวเดียวกับ rpt_entry_list
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
language plpgsql security definer stable set search_path = public as $$
declare
  q text := nullif(trim(p_q), '');
  q_digits text;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  q_digits := nullif(regexp_replace(coalesce(q, ''), '\D', '', 'g'), '');
  return query
    select ir.record_uid, ir.code, ir.surveyed_at, ir.doc_no, ir.age, ir.occupation,
           ir.residence->>'district', ir.residence->>'subdistrict',
           p.d->>'full_name', interview_mask_nid(p.d->>'national_id'),
           count(*) over () as total_count
      from interview_records ir
      left join lateral (
        select rpt_pii_decrypt(x.enc) as d from interview_records_pii x
         where x.record_uid = ir.record_uid
      ) p on true
     where (q is null
            or ir.code ilike '%' || q || '%' or ir.doc_no ilike '%' || q || '%'
            or (p.d->>'full_name') ilike '%' || q || '%'
            or (p.d->>'alias')     ilike '%' || q || '%'
            or (q_digits is not null and ((p.d->>'national_id') like '%' || q_digits || '%'
                                          or (p.d->>'phone') like '%' || q_digits || '%')))
       and (p_from is null or ir.surveyed_at >= p_from)
       and (p_to   is null or ir.surveyed_at <= p_to)
       and (p_district   is null or ir.residence->>'district' = p_district)
       and (p_occupation is null or ir.occupation = p_occupation)
       and (p_age_min is null or ir.age >= p_age_min)
       and (p_age_max is null or ir.age <= p_age_max)
     order by ir.surveyed_at desc nulls last, ir.record_uid
     limit greatest(1, least(p_limit, 100000)) offset greatest(0, p_offset);
end $$;

-- 2.3 ตัวเลือกตัวกรอง — ไม่แตะ PII แต่เปลี่ยนเป็น definer ให้เข้าชุดกัน
create or replace function interview_filter_options()
returns table (occupation text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select distinct ir.occupation from interview_records ir
     where ir.occupation is not null and ir.occupation <> ''
     order by 1;
end $$;

-- 2.4 เปิดดูรายละเอียดรายคน — PII เต็ม + audit ในธุรกรรมเดียว
--     ใส่ record_uid กลับเข้า jsonb ให้รูปแบบตรงกับของเดิมที่มาจาก to_jsonb(p)
create or replace function interview_get(p_record_uid text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare rec jsonb; pii jsonb;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select to_jsonb(ir) into rec from interview_records ir where ir.record_uid = p_record_uid;
  if rec is null then return null; end if;

  select rpt_pii_decrypt(p.enc) || jsonb_build_object('record_uid', p.record_uid)
    into pii
    from interview_records_pii p where p.record_uid = p_record_uid;

  insert into audit_logs (user_id, user_email, action, resource, resource_id)
  values (auth.uid(), auth.jwt()->>'email', 'view', 'interview_records_pii', p_record_uid);
  return jsonb_build_object('record', rec, 'pii', pii);
end $$;

-- 2.5 ส่งออก — ตัวกรองชุดเดียวกับ search, PII เต็ม, audit ก่อนคืนข้อมูล
create or replace function interview_export(
  p_q text default null, p_from date default null, p_to date default null,
  p_district text default null, p_occupation text default null,
  p_age_min int default null, p_age_max int default null
)
returns setof jsonb
language plpgsql security definer set search_path = public as $$
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
    select to_jsonb(ir) || jsonb_build_object('pii',
             rpt_pii_decrypt(p.enc) || jsonb_build_object('record_uid', p.record_uid))
      from interview_search(p_q, p_from, p_to, p_district, p_occupation, p_age_min, p_age_max, 200000, 0) s
      join interview_records ir on ir.record_uid = s.record_uid
      left join interview_records_pii p on p.record_uid = ir.record_uid
     order by ir.surveyed_at desc nulls last, ir.record_uid;
end $$;

-- 2.6 ลบ — อาศัย FK on delete cascade ลบ PII ตามไปด้วย
create or replace function interview_delete(p_record_uid text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from interview_records where record_uid = p_record_uid;
  get diagnostics n = row_count;
  if n > 0 then
    insert into audit_logs (user_id, user_email, action, resource, resource_id)
    values (auth.uid(), auth.jwt()->>'email', 'delete', 'interview_records', p_record_uid);
  end if;
  return n > 0;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) ปิดทางเข้าตารางตรง — เหลือทางเดียวคือ RPC ข้างบน
-- ═══════════════════════════════════════════════════════════════════════════
-- ฝั่งแอปเรียกผ่าน rpc() ทั้งหมดอยู่แล้ว ไม่มีที่ไหน select ตารางตรง
-- RLS ยังเปิดพร้อม policy แอดมินไว้เป็นชั้นสำรอง เผื่อวันหน้ามีใครเผลอ grant กลับ
alter table interview_records     enable row level security;
alter table interview_records_pii enable row level security;

revoke all on interview_records     from anon, authenticated;
revoke all on interview_records_pii from anon, authenticated;

-- RPC เรียกได้เฉพาะผู้ล็อกอิน (is_admin() ข้างในกันอีกชั้น) — anon เรียกไม่ได้เลย
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
    execute format('grant  execute on function %s to authenticated', f);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) ตรวจหลังรัน — ทั้งสามควรคืนผลว่าง
-- ═══════════════════════════════════════════════════════════════════════════
-- -- 4.1 ไม่เหลือคอลัมน์ plaintext
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'interview_records_pii'
--    and column_name in ('full_name','alias','national_id','birth_date','phone',
--                        'contact_phone','address','sellers','interviewer','friend_address');
--
-- -- 4.2 ไม่มีแถวไหนเข้ารหัสไม่สำเร็จ
-- select record_uid from interview_records_pii where enc is null;
--
-- -- 4.3 ไม่มี grant ค้างกับ anon/authenticated
-- select table_name, grantee, privilege_type
--   from information_schema.role_table_grants
--  where table_schema = 'public' and grantee in ('anon','authenticated')
--    and table_name like 'interview_%';
--
-- -- 4.4 สุ่มตรวจว่าถอดรหัสกลับมาได้จริง (ควรได้ค่าเท่ากับจำนวนแถวที่มี PII)
-- select count(*) from interview_records_pii where rpt_pii_decrypt(enc) ? 'full_name';
