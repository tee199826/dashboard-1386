-- เฟส 2/2 — drop คอลัมน์ plaintext ของ interview_records_pii
--
-- ⛔ อย่ารันไฟล์นี้จนกว่าจะทำครบสามอย่าง
--    1. รัน 20260922a_encrypt.sql แล้ว
--    2. ตรวจข้อ 4.1-4.4 ท้ายไฟล์ 20260922a ครบ และได้ผลว่างทุกข้อ
--       โดยเฉพาะ 4.3 ที่เทียบค่าถอดรหัสกับ plaintext เดิมทุกช่อง
--    3. ทดสอบผ่านหน้าเว็บด้วยบัญชีแอดมินจริงครบห้าอย่าง
--       บันทึกแบบซัก / ค้นหาด้วยชื่อ / ค้นหาด้วยเลขบัตร / เปิดดูรายคน / ส่งออก
--
-- ⚠️ ไฟล์นี้ย้อนกลับไม่ได้ โปรเจกต์อยู่บน free plan ไม่มี backup อัตโนมัติ
--    หลังรันแล้ว plaintext หายถาวร เหลือทางเดียวคือถอดจาก enc
--    ถ้ายังไม่มั่นใจ ให้อยู่เฟส 1 ต่อไปก่อน — เฟส 1 ปลอดภัยพอสำหรับใช้งานจริง
--    เพราะ RPC อ่าน/เขียนที่ enc และตารางถูกปิดจาก anon/authenticated แล้ว
--    สิ่งที่เฟส 2 เพิ่มให้คือ plaintext ไม่ติดไปกับ dump/replica เท่านั้น
--
-- ✅ idempotent — รันซ้ำได้ ถ้าคอลัมน์ถูก drop ไปแล้วจะข้ามเงียบ ๆ
--
-- 💡 ถ้าอยากเก็บ plaintext ไว้อีกสักพักแต่ไม่อยากให้ติดไปกับ dump
--    สำรองออกไปก่อนได้ แล้วค่อยรันไฟล์นี้
--      create table interview_pii_plaintext_backup_20260922 as
--        select record_uid, full_name, alias, national_id, birth_date, phone,
--               contact_phone, address, sellers, interviewer, friend_address
--          from interview_records_pii;
--      revoke all on interview_pii_plaintext_backup_20260922 from anon, authenticated;
--    ⚠️ ตารางสำรองนี้คือ plaintext ทั้งก้อน ต้องลบทิ้งเมื่อมั่นใจแล้ว
--       ไม่งั้นก็เท่ากับไม่ได้แก้อะไรเลย

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) ด่านตรวจ — ผ่านครบถึงจะ drop
-- ═══════════════════════════════════════════════════════════════════════════
-- ทุกข้อ raise exception ถ้าไม่ผ่าน ทำให้ทั้ง transaction ถูกยกเลิก
-- และไม่มีคอลัมน์ไหนถูก drop เลย
do $$
declare
  n_missing int;
  n_bad     int;
  n_diff    int;
  n_total   int;
begin
  -- ถ้า drop ไปแล้วจากรอบก่อน ก็จบตรงนี้ ไม่ต้องทำอะไร
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'interview_records_pii'
       and column_name = 'full_name'
  ) then
    raise notice 'คอลัมน์ plaintext ถูก drop ไปแล้ว ไม่มีอะไรต้องทำ';
    return;
  end if;

  -- ต้องรันเฟส 1 มาก่อน
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'interview_records_pii'
       and column_name = 'enc'
  ) then
    raise exception 'ยังไม่มีคอลัมน์ enc — ต้องรัน 20260922a_encrypt.sql ก่อน';
  end if;

  select count(*) into n_total from interview_records_pii;

  -- ด่าน 1: ทุกแถวต้องมี enc
  select count(*) into n_missing from interview_records_pii where enc is null;
  if n_missing > 0 then
    raise exception
      'ยังมี % แถวจาก % ที่ enc เป็น null — รัน 20260922a_encrypt.sql ซ้ำก่อน',
      n_missing, n_total;
  end if;

  -- ด่าน 2: ทุกแถวต้องถอดรหัสกลับมาเป็น jsonb object ได้
  --         ถ้ากุญแจผิดหรือ ciphertext เสีย rpt_pii_decrypt จะโยน error เอง
  --         ซึ่งก็ทำให้ transaction ยกเลิกเหมือนกัน ปลอดภัยทั้งสองทาง
  select count(*) into n_bad from interview_records_pii
   where jsonb_typeof(rpt_pii_decrypt(enc)) is distinct from 'object';
  if n_bad > 0 then
    raise exception 'มี % แถวที่ถอดรหัสแล้วไม่ใช่ jsonb object — อย่า drop', n_bad;
  end if;

  -- ด่าน 3: ค่าที่ถอดออกมาต้องตรงกับ plaintext เดิมทุกช่อง
  --         ข้อนี้คือหัวใจ ถ้าเข้ารหัสผิดเพี้ยนจะจับได้ตรงนี้
  select count(*) into n_diff
    from interview_records_pii p, lateral (select rpt_pii_decrypt(p.enc) d) x
   where (x.d->>'full_name')      is distinct from p.full_name
      or (x.d->>'alias')          is distinct from p.alias
      or (x.d->>'national_id')    is distinct from p.national_id
      or (x.d->>'birth_date')     is distinct from p.birth_date::text
      or (x.d->>'phone')          is distinct from p.phone
      or (x.d->>'contact_phone')  is distinct from p.contact_phone
      or (x.d->>'friend_address') is distinct from p.friend_address
      or (x.d->'address')         is distinct from p.address
      or (x.d->'sellers')         is distinct from p.sellers
      or (x.d->'interviewer')     is distinct from p.interviewer;

  if n_diff > 0 then
    raise exception
      'มี % แถวจาก % ที่ค่าถอดรหัสไม่ตรงกับ plaintext เดิม — ' ||
      'ถ้าเป็นแถวที่เพิ่งแก้ผ่านหน้าเว็บหลังรันเฟส 1 ถือว่าปกติ ' ||
      'ให้ไล่ดูด้วย query 4.3 ท้ายไฟล์ 20260922a ว่าใช่แถวนั้นจริงไหม ' ||
      'ถ้าใช่ ให้ comment ด่าน 3 นี้ออกแล้วรันใหม่ ถ้าไม่ใช่ อย่า drop เด็ดขาด',
      n_diff, n_total;
  end if;

  raise notice 'ด่านตรวจผ่านครบ % แถว — กำลัง drop คอลัมน์ plaintext', n_total;

  -- ═════════════════════════════════════════════════════════════════════════
  -- 2) drop จริง
  -- ═════════════════════════════════════════════════════════════════════════
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

  raise notice 'drop เสร็จแล้ว — ในตารางไม่เหลือ plaintext';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) ตรวจหลังรัน — ทั้งสองควรคืนผลว่าง
-- ═══════════════════════════════════════════════════════════════════════════
-- -- 3.1 ไม่เหลือคอลัมน์ plaintext
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'interview_records_pii'
--    and column_name in ('full_name','alias','national_id','birth_date','phone',
--                        'contact_phone','address','sellers','interviewer','friend_address');
--
-- -- 3.2 ไม่มี grant ค้างกับ anon/authenticated
-- select table_name, grantee, privilege_type
--   from information_schema.role_table_grants
--  where table_schema = 'public' and grantee in ('anon','authenticated')
--    and table_name like 'interview_%';
--
-- -- 3.3 ยืนยันว่ายังใช้งานได้จริง — ควรได้จำนวนเท่ากับแถวที่มีชื่อ
-- select count(*) from interview_records_pii where rpt_pii_decrypt(enc) ? 'full_name';
--
-- -- 3.4 แล้วทดสอบผ่านหน้าเว็บอีกรอบให้ครบห้าอย่างเหมือนตอนจบเฟส 1
