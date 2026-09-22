-- ปิดต้นเหตุ: ตารางใหม่ใน public ต้องไม่ได้สิทธิ์ anon/authenticated อัตโนมัติ
--
-- ที่มา: 22 ก.ย. 2569 พบว่า interview_records_pii ซึ่งเก็บชื่อ เลขบัตรประชาชน
--        ที่อยู่ เบอร์โทร เปิดให้ role anon เข้าถึงได้ ทั้งที่ไม่มี migration ไฟล์ไหน
--        สั่ง grant ให้เลยสักบรรทัด
--
-- ต้นเหตุ: Supabase ตั้ง default privileges ของ schema public ไว้ตั้งแต่สร้างโปรเจกต์
--          ประมาณว่า
--            alter default privileges in schema public
--              grant all on tables to postgres, anon, authenticated, service_role;
--          ผลคือ "ทุกตารางที่สร้างใหม่ใน public ได้สิทธิ์ anon อัตโนมัติ"
--          ไม่ต้องมีใครสั่ง grant เลย
--
--          ตารางจึงปลอดภัยเฉพาะตัวที่ migration เขียน revoke ไว้เอง ที่ผ่านมามีแค่
--            rpt_records_pii       — 20260918_rpt_field_entry.sql
--            interview_records_pii — 20260922a_encrypt.sql (เพิ่งแก้)
--          ตัวที่ไม่มีใคร revoke ก็เปิดอยู่เงียบ ๆ ตั้งแต่วันที่สร้าง
--
--          นี่คือเหตุผลว่าทำไมต้องแก้ที่ default ไม่ใช่ไล่ revoke ทีละตาราง
--          ไล่ revoke แก้ได้แค่ของที่มีอยู่วันนี้ ตารางที่สร้างพรุ่งนี้ก็เปิดอีก
--
-- ⚠️ ผลข้างเคียงที่ต้องรู้ก่อนรัน
--    หลังรัน ตารางใหม่จะ "ปิดสนิท" จนกว่าจะ grant เอง ตารางหน้า dashboard ที่ตั้งใจ
--    ให้อ่านสาธารณะจะไม่ทำงานถ้าลืม grant — ดูสูตรในข้อ 3 ท้ายไฟล์
--    ถือเป็นเรื่องดี เพราะเปลี่ยนจาก "เปิดไว้ก่อน ลืมปิดแล้วรั่ว"
--    เป็น "ปิดไว้ก่อน ลืมเปิดแล้วหน้าไม่ขึ้น" ซึ่งเห็นทันทีและไม่ทำข้อมูลหลุด
--
-- ⚠️ migration นี้ไม่แตะตารางที่มีอยู่แล้ว ของเดิมยังมีสิทธิ์เท่าเดิมทุกตาราง
--    ต้องไล่ตรวจของเดิมแยกต่างหาก — ดูข้อ 2
--
-- ✅ idempotent — รันซ้ำได้

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) แก้ default privileges
-- ═══════════════════════════════════════════════════════════════════════════
-- default privileges ผูกกับ "role ที่เป็นคนสร้าง object" ไม่ใช่ผูกกับ schema
-- จึงต้องสั่งให้ครบทุก role ที่มีโอกาสเป็นคนสร้างตาราง ไม่งั้นแก้ไม่ตรงจุด
do $$
declare r text;
begin
  foreach r in array array['postgres', 'supabase_admin'] loop
    if not exists (select 1 from pg_roles where rolname = r) then continue; end if;

    execute format(
      'alter default privileges for role %I in schema public revoke all on tables from anon, authenticated', r);
    execute format(
      'alter default privileges for role %I in schema public revoke all on sequences from anon, authenticated', r);
    -- ฟังก์ชันใหม่ต้องไม่ถูกเรียกจาก API จนกว่าจะ grant เอง
    execute format(
      'alter default privileges for role %I in schema public revoke all on functions from public, anon', r);
  end loop;
end $$;

-- เผื่อ session ปัจจุบันรันด้วย role อื่นที่ไม่อยู่ในรายการข้างบน
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) ตรวจของเดิม — migration นี้ไม่แก้ให้ ต้องดูเองแล้วตัดสินทีละตาราง
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ substance_user_pii ไม่มี migration ไฟล์ไหน revoke ไว้เลย ตารางนี้เก็บชื่อ
--    เลขบัตรประชาชน ที่อยู่ เบอร์โทร และข้อมูลผู้ขาย แบบ plaintext เหมือนที่
--    interview_records_pii เคยเป็น ถ้าตารางนี้ยังมีอยู่จริงในฐาน ต้องตรวจก่อน
--    เป็นอันดับแรก แล้วถ้ายังใช้งานอยู่ควรทำแบบเดียวกับ interview คือเข้ารหัส
--    + ปิดตาราง + เข้าถึงผ่าน RPC เท่านั้น
--
-- -- 2.1 ตาราง PII ที่ยังมี grant ค้าง (ควรว่าง)
-- select table_name, grantee, privilege_type
--   from information_schema.role_table_grants
--  where table_schema = 'public' and grantee in ('anon','authenticated')
--    and table_name like '%_pii'
--  order by table_name, grantee;
--
-- -- 2.2 ภาพรวมทุกตารางที่ anon แตะได้ — ไล่ดูว่าตั้งใจทุกตัวไหม
-- --     ตารางสถิติหน้า dashboard อยู่ในนี้ได้ตามปกติ
-- --     ตารางที่มีข้อมูลรายบุคคลไม่ควรอยู่ในนี้เลย
-- select table_name, string_agg(distinct privilege_type, ', ' order by privilege_type) as privs
--   from information_schema.role_table_grants
--  where table_schema = 'public' and grantee = 'anon'
--  group by table_name
--  order by table_name;
--
-- -- 2.3 default privileges ที่เหลืออยู่หลังรันไฟล์นี้ (ไม่ควรมี anon/authenticated)
-- select r.rolname as grantor, d.defaclobjtype as obj_type, d.defaclacl
--   from pg_default_acl d
--   join pg_roles r on r.oid = d.defaclrole
--   join pg_namespace n on n.oid = d.defaclnamespace
--  where n.nspname = 'public';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) สูตรสำหรับตารางใหม่ที่ตั้งใจให้อ่านสาธารณะ
-- ═══════════════════════════════════════════════════════════════════════════
-- หลังรันไฟล์นี้ ตารางสถิติที่สร้างใหม่ต้อง grant เองทุกครั้ง เช่น
--
--   alter table <ตาราง> enable row level security;
--   create policy <ตาราง>_public_read on <ตาราง> for select using (true);
--   create policy <ตาราง>_admin_write on <ตาราง> for all
--     using (is_admin()) with check (is_admin());
--   grant select on <ตาราง> to anon, authenticated;
--
-- ส่วนตารางที่มีข้อมูลรายบุคคล "ห้าม grant" ให้ทำตามแบบ rpt_records_pii คือ
-- เก็บเป็น ciphertext ไม่ grant ให้ role ไหนเลย แล้วเปิดทางเข้าผ่าน RPC
-- security definer ที่ตรวจ is_admin() และเขียน audit_logs ทุกครั้ง
