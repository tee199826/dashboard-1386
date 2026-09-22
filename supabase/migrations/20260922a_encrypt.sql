-- เฟส 1/2 — เข้ารหัส interview_records_pii + ปิดทางเข้าตารางตรง (ยังไม่ drop plaintext)
--
-- ที่มา: ตรวจสิทธิ์กับฐานจริง 22 ก.ย. 2569 พบว่า interview_records_pii เปิดให้ role
--        anon เข้าถึงได้ ตารางนี้เก็บชื่อ เลขบัตรประชาชน ที่อยู่ เบอร์โทร และข้อมูล
--        ผู้ขาย เป็น plaintext ทั้งหมด ปิด grant ไปแล้วแต่ข้อมูลยังเป็น plaintext อยู่
--        ถ้าสิทธิ์หลุดอีกครั้ง หรือ backup/replica หลุด ก็อ่านได้ทันที
--
--        rpt_records_pii เจอสถานการณ์เดียวกันแต่ไม่เสี่ยง เพราะเก็บเป็น ciphertext
--        งานนี้ยกโมเดลเดียวกันมาใช้กับ interview
--
-- ═══════ แบ่งสองเฟสเพราะโปรเจกต์อยู่บน free plan ไม่มี backup อัตโนมัติ ═══════
--
--   เฟส 1 = ไฟล์นี้        เข้ารหัสลง enc + เปลี่ยน RPC เป็น definer
--                          คอลัมน์ plaintext ยังอยู่ครบ ไม่แตะเลย
--   เฟส 2 = 20260922b      drop คอลัมน์ plaintext — รันหลังทดสอบเฟส 1 ผ่านแล้ว
--
--   ไฟล์นี้ไม่ทำลายข้อมูลอะไรเลย ถ้าเข้ารหัสพลาดหรือ RPC มีปัญหา ข้อมูลเดิมยัง
--   อยู่ครบทุกคอลัมน์ ย้อนกลับได้ด้วยการคืน RPC ชุดเดิม (ดูวิธีท้ายไฟล์)
--
-- ⚠️ สิ่งที่ต้องเข้าใจระหว่างอยู่เฟส 1
--    ตั้งแต่วินาทีที่รันไฟล์นี้ RPC จะอ่านและเขียนที่ enc เท่านั้น
--    คอลัมน์ plaintext จะ "หยุดนิ่ง" เป็นภาพ ณ เวลาที่รัน ไม่อัปเดตตามอีกต่อไป
--    → ถ้ามีคนแก้ข้อมูลหลังรันไฟล์นี้ แล้วย้อนกลับไปใช้ RPC ชุดเดิม
--      การแก้ช่วงนั้นจะหาย เพราะ plaintext ยังเป็นค่าเก่า
--    → จึงควรทดสอบให้จบแล้วรันเฟส 2 ในเวลาใกล้กัน อย่าทิ้งช่วงยาว
--      และถ้าเป็นไปได้ ให้รันไฟล์นี้ตอนที่ไม่มีคนใช้งานหน้าแบบสัมภาษณ์
--
-- ⚠️ ไฟล์นี้ยังแก้ของที่พังอยู่ด้วย
--    RPC ชุดเดิมประกาศเป็น security invoker คือรันด้วยสิทธิ์ของผู้เรียก
--    เมื่อ revoke สิทธิ์ตารางออกจาก authenticated ไปแล้วเมื่อ 22 ก.ย.
--    RPC ทั้งห้าตัวที่แตะ PII จะ error permission denied ทันที
--    → หน้าแบบสัมภาษณ์ใช้งานไม่ได้อยู่ตอนนี้ ไฟล์นี้แก้ด้วยการเปลี่ยนเป็น
--      security definer ซึ่งมี is_admin() กันอยู่แล้วทุกตัว (โมเดลเดียวกับ rpt)
--
-- 🔑 ใช้กุญแจร่วมกับ rpt (rpt_pii_key) ตามที่ตกลงไว้ ผลที่ตามมาคือถ้าจะหมุนกุญแจ
--    ต้อง re-encrypt ทั้งสองตารางพร้อมกัน ถ้าต้องการแยกกุญแจในอนาคต ให้สร้าง
--    secret ใหม่แล้วทำ interview_pii_encrypt/decrypt คู่ของตัวเอง
--
-- ✅ idempotent — รันซ้ำได้ ไม่เข้ารหัสซ้อน
-- ⚠️ รันบน staging ก่อน แล้วทดสอบให้ครบตามรายการท้ายไฟล์

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
-- 1) เข้ารหัสลง enc — ไม่แตะคอลัมน์ plaintext
-- ═══════════════════════════════════════════════════════════════════════════
alter table interview_records_pii add column if not exists enc         bytea;
alter table interview_records_pii add column if not exists enc_version int not null default 1;

-- เข้ารหัสเฉพาะแถวที่ยังไม่มี enc — รันซ้ำจึงไม่เข้ารหัสซ้อน และถ้ารอบก่อนค้าง
-- กลางทางก็ทำต่อจากจุดเดิมได้
-- ห่อด้วย if exists เพื่อให้ไฟล์นี้ยังรันผ่านหลังเฟส 2 ลบคอลัมน์ไปแล้ว
do $$ begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'interview_records_pii'
       and column_name = 'full_name'
  ) then
    update interview_records_pii set enc = rpt_pii_encrypt(jsonb_strip_nulls(jsonb_build_object(
      'full_name',      full_name,
      'alias',          alias,
      'national_id',    national_id,
      'birth_date',     birth_date,
      'phone',          phone,
      'contact_phone',  contact_phone,
      'address',        address,
      'sellers',        sellers,
      'interviewer',    interviewer,
      'friend_address', friend_address
    ))) where enc is null;
  end if;
end $$;

comment on column interview_records_pii.enc is
  'ciphertext ของ {full_name, alias, national_id, birth_date, phone, contact_phone, address, sellers, interviewer, friend_address} — ถอดผ่าน rpt_pii_decrypt() เท่านั้น';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) RPC — เขียนใหม่เป็น security definer + อ่าน/เขียนที่ enc
--    ลายเซ็นและรูปแบบผลลัพธ์เหมือนเดิมทุกตัว ฝั่ง React ไม่ต้องแก้
-- ═══════════════════════════════════════════════════════════════════════════

-- 2.1 บันทึกแบบซัก + PII ในธุรกรรมเดียว
--     เขียนลง enc อย่างเดียว ไม่เขียน plaintext — ตั้งใจ เพราะจุดประสงค์ของงานนี้
--     คือเลิกเก็บ plaintext ถ้าเขียนทั้งสองที่ก็เท่ากับยังสร้าง plaintext ใหม่ต่อไป
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
-- 4) ตรวจหลังรัน — ทำให้ครบก่อนไปเฟส 2
-- ═══════════════════════════════════════════════════════════════════════════
-- ── 4.1 ทุกแถวมี enc แล้ว (ควรว่าง) ───────────────────────────────────────
-- select record_uid from interview_records_pii where enc is null;
--
-- ── 4.2 ถอดรหัสกลับมาได้ทุกแถว (ควรว่าง) ──────────────────────────────────
-- select record_uid from interview_records_pii
--  where jsonb_typeof(rpt_pii_decrypt(enc)) is distinct from 'object';
--
-- ── 4.3 ⭐ สำคัญสุด: ค่าที่ถอดออกมาตรงกับ plaintext เดิมทุกช่อง (ควรว่าง) ──
--     นี่คือข้อที่พิสูจน์ว่าเข้ารหัสไม่ผิดเพี้ยน ทำข้อนี้ก่อนตัดสินใจรันเฟส 2
-- select record_uid
--   from interview_records_pii p, lateral (select rpt_pii_decrypt(p.enc) d) x
--  where (x.d->>'full_name')      is distinct from p.full_name
--     or (x.d->>'alias')          is distinct from p.alias
--     or (x.d->>'national_id')    is distinct from p.national_id
--     or (x.d->>'birth_date')     is distinct from p.birth_date::text
--     or (x.d->>'phone')          is distinct from p.phone
--     or (x.d->>'contact_phone')  is distinct from p.contact_phone
--     or (x.d->>'friend_address') is distinct from p.friend_address
--     or (x.d->'address')         is distinct from p.address
--     or (x.d->'sellers')         is distinct from p.sellers
--     or (x.d->'interviewer')     is distinct from p.interviewer;
--
--     หมายเหตุ: ถ้ามีคนแก้ข้อมูลผ่านหน้าเว็บ "หลัง" รันไฟล์นี้ แถวนั้นจะโผล่มา
--     เป็นเรื่องปกติ เพราะ plaintext หยุดนิ่งแล้ว ให้ดูว่า record_uid ที่โผล่มา
--     ตรงกับที่เพิ่งแก้ไหม ถ้าใช่ข้ามได้ ถ้าไม่ใช่แปลว่าเข้ารหัสมีปัญหา — อย่ารันเฟส 2
--
-- ── 4.4 ไม่มี grant ค้างกับ anon/authenticated (ควรว่าง) ─────────────────
-- select table_name, grantee, privilege_type
--   from information_schema.role_table_grants
--  where table_schema = 'public' and grantee in ('anon','authenticated')
--    and table_name like 'interview_%';
--
-- ── 4.5 ทดสอบผ่านหน้าเว็บด้วยบัญชีแอดมินจริง ให้ครบทั้งห้าอย่าง ──────────
--     บันทึกแบบซักใหม่ / ค้นหาด้วยชื่อ / ค้นหาด้วยเลขบัตร / เปิดดูรายคน / ส่งออก
--     แล้วเช็คว่า audit_logs มีรายการ view ของ interview_records_pii เพิ่มขึ้นจริง

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) ถ้าต้องย้อนกลับ (ยังทำได้ตราบที่ยังไม่รันเฟส 2)
-- ═══════════════════════════════════════════════════════════════════════════
-- คอลัมน์ plaintext ยังอยู่ครบ จึงย้อนได้ด้วยการคืน RPC ชุดเดิมกับสิทธิ์ตาราง
--   1. รัน 20260915_security_baseline.sql ส่วน 5.1-5.5 ใหม่ (RPC แบบ invoker)
--   2. grant select, insert, update, delete on interview_records_pii to authenticated;
--      grant select, insert, update, delete on interview_records     to authenticated;
--   3. ข้อมูลที่ถูกแก้ระหว่างอยู่เฟส 1 จะหาย เพราะการแก้นั้นลงที่ enc ไม่ใช่ plaintext
--      กู้คืนรายแถวได้ด้วย
--        update interview_records_pii p set
--          full_name = x.d->>'full_name', alias = x.d->>'alias', ...
--          from lateral (select rpt_pii_decrypt(p.enc) d) x where p.record_uid = '<uid>';
