-- กรอกข้อมูลภาคสนามเพิ่มเติมให้รายงานร้องเรียน ปปส. (RPT_73_1/2/3, RPT_111_4/5)
--
-- ที่มา: รายงาน 5 ฉบับที่ออกจากระบบเฝ้าระวัง ปปส. มีข้อมูลครบเรื่องผลตรวจสอบ
--        แต่ "ไม่มี" พิกัด / ชุมชน / เลข NISPA / บก.น. / สน. / กลุ่มพื้นที่ / ประเภทสถานที่
--        และไม่มีการระบุว่าผู้ถูกร้องเรียนเป็นเจ้าหน้าที่รัฐหรือไม่
--        ของพวกนี้ต้องให้เจ้าหน้าที่กรอกเพิ่มเอง → ตารางที่ 3 ในไฟล์นี้
--
-- โครง 3 ตาราง (แนวเดียวกับ interview_records — แยก PII ออกจากข้อมูลทั่วไป):
--   rpt_records      — ข้อมูลจากรายงาน ส่วนที่ไม่ระบุตัวบุคคล
--   rpt_records_pii  — ชื่อ/เลขบัตร/ที่อยู่/ข้อความบรรยาย (มีชื่อ-เลขบัตรปนใน free text)
--   rpt_field_entry  — ช่องที่เจ้าหน้าที่กรอกเพิ่ม (ของใหม่ทั้งหมดอยู่ที่นี่)
--
-- ⚠️ เหตุผลที่ต้องแยก 3 ตาราง ไม่ใช่ตารางเดียว:
--    นำเข้าไฟล์ใหม่ = upsert ทับ rpt_records/rpt_records_pii แต่ rpt_field_entry ต้องไม่ถูกแตะ
--    ไม่งั้นข้อมูลที่เจ้าหน้าที่กรอกไว้จะหายทุกครั้งที่อัปเดตรายงาน
--
-- 🔒 โมเดลความปลอดภัย (ต่างจากตาราง dashboard อื่นที่อ่านสาธารณะได้):
--    1. ไม่มี role ไหนแตะตารางตรงผ่าน API ได้ (revoke anon+authenticated ทุกตาราง)
--    2. ทางเข้าเดียว = RPC security definer ที่ตรวจ is_admin() และเขียน audit_logs
--    3. ชื่อ/เลขบัตร/ที่อยู่/พฤติการณ์ เข้ารหัสด้วย pgcrypto กุญแจใน Vault — ในตารางไม่มี plaintext
--    4. เพดานแถวต่อคำขอ 1,000 กันดูดทั้งชุด
--    สิ่งที่ยังกันไม่ได้: คนถือ service_role / เจ้าของโปรเจกต์ → ต้องคู่กับ 2FA + จำกัดคน
--
-- ✅ idempotent — รันซ้ำได้
-- ⚠️ รันบน staging ก่อน แล้วทดสอบสิทธิ์ anon/user/admin ผ่าน API ตรง

-- is_admin() — นิยามซ้ำไว้ให้ migration รันได้ด้วยตัวเอง
create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0.5) การเข้ารหัสข้อมูลส่วนบุคคล — pgcrypto + กุญแจใน Supabase Vault
-- ═══════════════════════════════════════════════════════════════════════════
-- ชื่อ/เลขบัตร/ที่อยู่/ข้อความพฤติการณ์ ถูกเก็บเป็น ciphertext ก้อนเดียวต่อแถว
-- ใน rpt_records_pii.enc — ในตารางไม่มี plaintext เหลืออยู่เลย
--
-- ป้องกันอะไร:  backup/dump ของฐานหลุด, replica, คนเปิด Table Editor ดูเล่น,
--               ใครก็ตามที่ได้ connection แต่ไม่ได้สิทธิ์อ่าน vault
-- ไม่ป้องกัน:   คนที่ถือ service_role / เป็นเจ้าของโปรเจกต์ Supabase (อ่าน vault ได้)
--               → ชั้นนี้จึงต้องคู่กับ 2FA + จำกัดคนเข้า Dashboard เสมอ
--
-- กุญแจไม่อยู่ในตารางไหนของเรา — Vault เก็บแบบเข้ารหัสด้วย root key ที่ Supabase ถือไว้
-- นอกฐานข้อมูล ดังนั้น dump ทั้งฐานออกไปก็ถอด vault ไม่ได้
create schema if not exists extensions;   -- Supabase มีอยู่แล้ว; ใส่ไว้เผื่อย้ายไป Postgres ที่ติดตั้งเอง
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault cascade;

-- สร้างกุญแจครั้งเดียว (32 ไบต์สุ่ม) — รันซ้ำไม่สร้างใหม่ ไม่งั้นข้อมูลเก่าถอดไม่ออก
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'rpt_pii_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'rpt_pii_key',
                                'กุญแจเข้ารหัส rpt_records_pii — ห้ามลบ ห้ามเปลี่ยนโดยไม่ re-encrypt');
  end if;
end $$;

-- อ่านกุญแจ — definer เพราะ vault อ่านได้เฉพาะ owner ; ห้ามเปิดให้ role ใดเรียกจาก API
create or replace function rpt_pii_key()
returns text language sql stable security definer set search_path = public, extensions as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'rpt_pii_key' limit 1;
$$;
revoke execute on function rpt_pii_key() from public, anon, authenticated;

-- เข้ารหัส jsonb -> bytea  (volatile เพราะ pgp ใส่ salt สุ่มทุกครั้ง)
-- search_path ต้องมี extensions — Supabase ติดตั้ง pgcrypto ไว้ใน schema นั้น ไม่ใช่ public
create or replace function rpt_pii_encrypt(p jsonb)
returns bytea language sql security definer set search_path = public, extensions as $$
  select pgp_sym_encrypt(coalesce(p, '{}'::jsonb)::text, rpt_pii_key());
$$;
-- ถอดรหัส bytea -> jsonb
create or replace function rpt_pii_decrypt(b bytea)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select case when b is null then null else pgp_sym_decrypt(b, rpt_pii_key())::jsonb end;
$$;
revoke execute on function rpt_pii_encrypt(jsonb) from public, anon, authenticated;
revoke execute on function rpt_pii_decrypt(bytea) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) rpt_records — ข้อมูลจากรายงาน (ไม่ระบุตัวบุคคล)
-- ═══════════════════════════════════════════════════════════════════════════
-- record_uid = '<report_id>|<เลขที่ร้องเรียน>|<เลขที่บุคคล>'
--   ตรวจกับไฟล์จริงแล้วว่าไม่ซ้ำ: 73_* คู่ (ร้องเรียน+บุคคล) unique, 111_* เลขที่ร้องเรียน unique
--   ตระกูล 111 ไม่มีเลขที่บุคคล → ส่วนท้ายเป็น '-'
create table if not exists rpt_records (
  record_uid          text primary key,
  report_id           text not null,      -- '73_1' | '73_2' | '73_3' | '111_4' | '111_5'
  seq                 int,                -- ลำดับที่ในไฟล์ (เปลี่ยนได้เมื่อออกรายงานใหม่ — ห้ามใช้เป็นคีย์)
  complaint_no        text,
  person_no           text,
  source              text,               -- แหล่งข่าว: สายด่วน 1386 / อินเตอร์เน็ต / ทางรัฐ / ...
  photo               text,               -- ช่อง "ภาพถ่าย" — ว่างทุกแถวในไฟล์ชุด ต.ค.-ธ.ค. 68
  position            text,               -- ช่อง "ตำแหน่ง" — ว่างทุกแถวเช่นกัน
  send_doc_no         text,               -- เลขที่หนังสือส่ง (การส่งตรวจสอบ) — ว่างทุกแถว
  result_doc_no       text,               -- เลขที่หนังสือรับ (ผลการดำเนินการ) — ว่างทุกแถว
  report_count        int,
  report_count_period int,                -- มีเฉพาะ RPT_73_1 (แยก "ครั้งทั้งหมด" กับ "ครั้งในห้วง")
  person_type         text,               -- ประเภทบุคคลตามระบบต้นทาง (ทั่วไป/...)
  gender              text,
  occupation          text,
  role                text,               -- บทบาท: ผู้เสพ / ผู้ค้า (หลายค่าคั่น ,)
  src_community       text,               -- ⚠️ คอลัมน์ "ชุมชน" ในไฟล์ว่าง 100% ทุกไฟล์
  src_village         text,               -- ค่าชุมชนจริงมาอยู่ช่อง "หมู่บ้าน" (ระบบต้นทางใส่ผิดช่อง)
  subdistrict         text,
  district            text,               -- ชื่อเขตมี "เขต" นำหน้า ตรงกับ DNAME_TO_GROUP ฝั่ง frontend
  province            text,
  send_to             text,
  ppsm_region         text,
  urgency             text,
  drug_types          text,               -- เฉพาะ 111_*: ยาบ้า,ไอซ์ (หลายค่าคั่น ,)
  area_type           text,               -- เฉพาะ 111_*: ค้า, มั่วสุม, แพร่ระบาด, ผลิต (หลายค่าคั่น ,)
  recv_action         text,
  recv_date           date,
  send_agency         text,
  send_date           date,
  result_status       text,               -- ได้รับผล / ยังไม่ได้รับผล
  result_agency       text,               -- สน. ที่ตอบผล — ใช้เป็นค่าตั้งต้นของช่อง "สน." ที่ให้กรอก
  result_date         date,
  result_behavior     text,               -- พบพฤติการณ์ / ไม่พบพฤติการณ์ / ไม่พบตัวในพื้นที่ / ...
  result_action_date  date,
  drug_behavior       text,
  person_measure      text,
  result_operation    text,               -- จับกุม / บำบัด / ยุติเรื่อง / ...
  has_attachment      boolean default false,
  period_label        text,               -- ช่วงข้อมูลตามที่สั่งพิมพ์ เช่น '01 ต.ค. 68-31 ธ.ค. 68'
  report_title        text,               -- หัวรายงานตามที่เขียนไว้ในไฟล์ (แถวแรก) — ไม่ใช่ชื่อที่เราตั้งเอง
  printed_at          date,               -- วันที่ระบบต้นทางพิมพ์รายงานฉบับนี้
  imported_at         timestamptz default now(),
  imported_by         uuid
);

-- ฐานที่รัน migration รุ่นก่อนไปแล้วจะไม่มี 2 คอลัมน์นี้ (create table if not exists ไม่เพิ่มให้)
alter table rpt_records add column if not exists report_title  text;
alter table rpt_records add column if not exists printed_at    date;
alter table rpt_records add column if not exists photo         text;
alter table rpt_records add column if not exists position      text;
alter table rpt_records add column if not exists send_doc_no   text;
alter table rpt_records add column if not exists result_doc_no text;

create index if not exists idx_rpt_records_report   on rpt_records(report_id);
create index if not exists idx_rpt_records_district on rpt_records(district);
create index if not exists idx_rpt_records_complaint on rpt_records(complaint_no);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) rpt_records_pii — ส่วนที่ระบุตัวบุคคล (เข้ารหัสทั้งแถว)
-- ═══════════════════════════════════════════════════════════════════════════
-- enc = pgp_sym_encrypt( jsonb ของ {first_name, last_name, aka, national_id, birth_date,
--        birth_date_raw, addr_house_reg, addr_detail, area_detail, behavior_detail, result_detail} )
-- เก็บเป็นก้อนเดียวแทน 11 คอลัมน์ เพราะเราไม่เคยกรอง/index รายคอลัมน์ในตารางนี้อยู่แล้ว
-- (การค้นหาชื่อทำใน RPC โดยถอดรหัสก่อนเทียบ — ดู rpt_entry_list)
create table if not exists rpt_records_pii (
  record_uid  text primary key references rpt_records(record_uid) on delete cascade,
  enc         bytea,
  enc_version int not null default 1,       -- เผื่อเปลี่ยนวิธีเข้ารหัส/หมุนกุญแจในอนาคต
  updated_at  timestamptz default now()
);

-- ฐานที่รัน migration รุ่นก่อน (plaintext 11 คอลัมน์) → เข้ารหัสของเดิมแล้วลบคอลัมน์ plaintext ทิ้ง
-- ทำครั้งเดียว: รอบต่อไปไม่มีคอลัมน์ national_id แล้ว จะข้ามไป
do $$
declare has_old boolean; has_enc boolean;
begin
  select exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'rpt_records_pii'
                    and column_name = 'national_id') into has_old;
  if not has_old then return; end if;

  select exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'rpt_records_pii'
                    and column_name = 'enc') into has_enc;
  if not has_enc then
    alter table rpt_records_pii
      add column enc bytea,
      add column enc_version int not null default 1,
      add column updated_at timestamptz default now();
  end if;

  update rpt_records_pii set enc = rpt_pii_encrypt(jsonb_strip_nulls(jsonb_build_object(
      'first_name', first_name, 'last_name', last_name, 'aka', aka,
      'national_id', national_id, 'birth_date', birth_date, 'birth_date_raw', birth_date_raw,
      'addr_house_reg', addr_house_reg, 'addr_detail', addr_detail,
      'area_detail', area_detail, 'behavior_detail', behavior_detail, 'result_detail', result_detail)))
   where enc is null;

  alter table rpt_records_pii
    drop column first_name, drop column last_name, drop column aka, drop column national_id,
    drop column birth_date, drop column birth_date_raw, drop column addr_house_reg,
    drop column addr_detail, drop column area_detail, drop column behavior_detail,
    drop column result_detail;
end $$;

alter table rpt_records_pii alter column enc set not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2.5) rpt_import_batches — ประวัติการอัปโหลดทุกครั้ง
-- ═══════════════════════════════════════════════════════════════════════════
-- งานจริงคืออัปไฟล์เข้ามา "เรื่อย ๆ หลายงวด" ไม่ใช่อัปครั้งเดียวจบ
-- ตาราง rpt_records เก็บ "สถานะล่าสุด" ของแต่ละเรื่อง (upsert ทับ) จึงตอบไม่ได้ว่า
-- เคยอัปไฟล์อะไรไปบ้าง เมื่อไหร่ ของงวดไหน — ตารางนี้เก็บไว้ต่างหากเป็นบันทึกถาวร
create table if not exists rpt_import_batches (
  id                bigserial primary key,
  report_id         text not null,
  file_name         text,
  report_title      text,          -- หัวรายงานที่อ่านได้จากไฟล์ฉบับนั้น
  period_label      text,          -- ช่วงข้อมูลของไฟล์ เช่น '01 ต.ค. 68-31 ธ.ค. 68'
  printed_at        date,
  rows_imported     int not null default 0,
  imported_at       timestamptz default now(),
  imported_by       uuid,
  imported_by_email text
);
create index if not exists idx_rpt_batches_report on rpt_import_batches(report_id, imported_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) rpt_field_entry — ช่องที่เจ้าหน้าที่กรอกเพิ่ม  ★ ของใหม่ทั้งหมดอยู่ตารางนี้
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists rpt_field_entry (
  record_uid          text primary key references rpt_records(record_uid) on delete cascade,

  -- พิกัด — ละติจูด/ลองจิจูด (WGS84) ; จำกัดกรอบ กทม. กว้าง ๆ กันพิมพ์สลับ lat/lng
  lat                 numeric(10, 7),
  lng                 numeric(10, 7),
  geo_note            text,                 -- ที่มาของพิกัด เช่น 'ปักจาก Google Maps', 'ประมาณจากปากซอย'

  community           text,                 -- ชื่อชุมชนที่ร้องเรียน (ระบบต้นทางไม่ได้กรอกช่องนี้)
  nispa_code          text,                 -- เลขที่/รหัสอ้างอิงในระบบ NISPA
  bkn                 text,                 -- บก.น.1-9
  police_station      text,                 -- สน. (88 สน.)
  area_group          text,                 -- กลุ่มพื้นที่ กทม. 6 กลุ่ม (กรุงเทพกลาง/ใต้/เหนือ/ตะวันออก/กรุงธนเหนือ/กรุงธนใต้)
  place_type          text,                 -- ประเภทสถานที่
  place_type_other    text,                 -- ใช้เมื่อ place_type = 'อื่นๆ'

  -- ประเภทบุคคล — ผู้ถูกร้องเรียนเป็นประชาชนทั่วไป หรือเจ้าหน้าที่รัฐ
  -- ถ้าเป็นเจ้าหน้าที่รัฐ ติ๊กได้หลายประเภท (เช่น ตำรวจ + อื่นๆ)
  person_category     text,                 -- 'ทั่วไป' | 'เจ้าหน้าที่รัฐ'
  official_types      text[] default '{}',  -- ['ตำรวจ','ทหาร','ครู','รัฐวิสาหกิจ','เจ้าหน้าที่ กทม.','อื่นๆ']
  official_type_other text,                 -- ใช้เมื่อ official_types มี 'อื่นๆ'

  note                text,
  status              text not null default 'draft',   -- 'draft' = กรอกค้างไว้ | 'done' = กรอกครบแล้ว
  updated_by          uuid,
  updated_by_email    text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index if not exists idx_rpt_entry_status on rpt_field_entry(status);

-- ── ข้อจำกัดค่า (ทำแบบ idempotent — alter table ... add constraint ไม่มี if not exists) ──
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rpt_entry_latlng_bkk') then
    alter table rpt_field_entry add constraint rpt_entry_latlng_bkk check (
      (lat is null and lng is null)
      or (lat between 13.4 and 14.0 and lng between 100.2 and 100.95)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rpt_entry_person_category') then
    alter table rpt_field_entry add constraint rpt_entry_person_category
      check (person_category is null or person_category in ('ทั่วไป', 'เจ้าหน้าที่รัฐ'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rpt_entry_status_check') then
    alter table rpt_field_entry add constraint rpt_entry_status_check
      check (status in ('draft', 'done'));
  end if;
end $$;

-- แตะ updated_at ทุกครั้งที่แก้ (ไม่เชื่อค่าที่ client ส่งมา)
create or replace function rpt_entry_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_rpt_entry_touch on rpt_field_entry;
create trigger trg_rpt_entry_touch
  before update on rpt_field_entry
  for each row execute function rpt_entry_touch();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) RLS + สิทธิ์ระดับตาราง
-- ═══════════════════════════════════════════════════════════════════════════
-- 4.1 ทุกตาราง — "ห้ามแตะตรงผ่าน API" ไม่ว่า role ไหน
--     หน้าเว็บไม่เคยอ่าน/เขียนตารางตรงเลย (ตรวจแล้ว: ไม่มี .from('rpt_') ใน src/)
--     ทุกอย่างวิ่งผ่าน RPC security definer ที่ตรวจ is_admin() และเขียน audit
--     → ถอน grant ออกจาก anon + authenticated ให้หมด เหลือทางเข้าเดียวที่ควบคุมได้
--     RLS ยังเปิดไว้พร้อม policy แอดมิน เป็นชั้นสำรองเผื่อวันหน้ามีใครเผลอ grant กลับ
do $$
declare t text;
begin
  foreach t in array array['rpt_records', 'rpt_field_entry', 'rpt_import_batches'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_admin_all', t);
    execute format('create policy %I on %I for all using (is_admin()) with check (is_admin())', t || '_admin_all', t);
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
  -- sequence ของ rpt_import_batches ก็ไม่ต้องให้ใครแตะตรง
  revoke all on sequence rpt_import_batches_id_seq from anon, authenticated;
end $$;

-- 4.2 rpt_records_pii — ล็อกแน่นที่สุด: ห้ามแตะตรง + ไม่มี policy + ข้อมูลเข้ารหัส
-- ───────────────────────────────────────────────────────────────────────────
-- ต่อให้ grant หลุดหรือ RLS ถูกปิด สิ่งที่อ่านได้ก็เป็น ciphertext ที่ถอดไม่ได้
-- ถ้าไม่ผ่าน rpt_pii_decrypt() ซึ่งเรียกจาก API ไม่ได้ (revoke แล้ว)
-- RLS เปิดไว้และ "ไม่มี policy" = ปฏิเสธทุก role ยกเว้นเจ้าของตาราง
alter table rpt_records_pii enable row level security;
drop policy if exists rpt_records_pii_admin_all on rpt_records_pii;
revoke all on rpt_records_pii from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) rpt_import_batch — นำเข้าไฟล์ 1 ฉบับในธุรกรรมเดียว
-- ═══════════════════════════════════════════════════════════════════════════
-- รับ array ของ { base: {...}, pii: {...} } แล้ว upsert ทั้งชุด
-- ⚠️ ไม่แตะ rpt_field_entry เลย — ข้อมูลที่เจ้าหน้าที่กรอกไว้จึงอยู่ครบหลังนำเข้าไฟล์ใหม่
create or replace function rpt_import_batch(p_rows jsonb)
returns jsonb
-- definer: เขียน rpt_records_pii ซึ่งถอนสิทธิ์ตารางออกจาก authenticated แล้ว
-- ปลอดภัยเพราะตรวจ is_admin() เป็นบรรทัดแรก และไม่รับ SQL จากผู้เรียก
language plpgsql security definer set search_path = public as $$
declare
  n_base int := 0;
  n_pii  int := 0;
  v_report_id text;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a json array';
  end if;

  with src as (
    select jsonb_populate_record(null::rpt_records, (r->'base') - 'imported_at' - 'imported_by') as rec
      from jsonb_array_elements(p_rows) r
  ), ins as (
    insert into rpt_records (
      record_uid, report_id, seq, complaint_no, person_no, source,
      photo, position, send_doc_no, result_doc_no, report_count,
      report_count_period, person_type, gender, occupation, role, src_community, src_village,
      subdistrict, district, province, send_to, ppsm_region, urgency, drug_types, area_type,
      recv_action, recv_date, send_agency, send_date, result_status, result_agency,
      result_date, result_behavior, result_action_date, drug_behavior, person_measure,
      result_operation, has_attachment, period_label, report_title, printed_at,
      imported_at, imported_by
    )
    select (rec).record_uid, (rec).report_id, (rec).seq, (rec).complaint_no, (rec).person_no,
           (rec).source, (rec).photo, (rec).position, (rec).send_doc_no, (rec).result_doc_no,
           (rec).report_count, (rec).report_count_period, (rec).person_type,
           (rec).gender, (rec).occupation, (rec).role, (rec).src_community, (rec).src_village,
           (rec).subdistrict, (rec).district, (rec).province, (rec).send_to, (rec).ppsm_region,
           (rec).urgency, (rec).drug_types, (rec).area_type, (rec).recv_action, (rec).recv_date,
           (rec).send_agency, (rec).send_date, (rec).result_status, (rec).result_agency,
           (rec).result_date, (rec).result_behavior, (rec).result_action_date, (rec).drug_behavior,
           (rec).person_measure, (rec).result_operation, (rec).has_attachment, (rec).period_label,
           (rec).report_title, (rec).printed_at,
           now(), auth.uid()
      from src
    on conflict (record_uid) do update set
      report_id = excluded.report_id, seq = excluded.seq, complaint_no = excluded.complaint_no,
      person_no = excluded.person_no, source = excluded.source,
      photo = excluded.photo, position = excluded.position,
      send_doc_no = excluded.send_doc_no, result_doc_no = excluded.result_doc_no,
      report_count = excluded.report_count,
      report_count_period = excluded.report_count_period, person_type = excluded.person_type,
      gender = excluded.gender, occupation = excluded.occupation, role = excluded.role,
      src_community = excluded.src_community, src_village = excluded.src_village,
      subdistrict = excluded.subdistrict, district = excluded.district, province = excluded.province,
      send_to = excluded.send_to, ppsm_region = excluded.ppsm_region, urgency = excluded.urgency,
      drug_types = excluded.drug_types, area_type = excluded.area_type,
      recv_action = excluded.recv_action, recv_date = excluded.recv_date,
      send_agency = excluded.send_agency, send_date = excluded.send_date,
      result_status = excluded.result_status, result_agency = excluded.result_agency,
      result_date = excluded.result_date, result_behavior = excluded.result_behavior,
      result_action_date = excluded.result_action_date, drug_behavior = excluded.drug_behavior,
      person_measure = excluded.person_measure, result_operation = excluded.result_operation,
      has_attachment = excluded.has_attachment, period_label = excluded.period_label,
      report_title = excluded.report_title, printed_at = excluded.printed_at,
      imported_at = now(), imported_by = auth.uid()
    returning 1
  )
  select count(*) into n_base from ins;

  -- ส่วนระบุตัวบุคคล: เข้ารหัสทั้งก้อนก่อนเก็บ ไม่มี plaintext ลงตารางเลย
  with srcp as (
    select r->'pii' as pii
      from jsonb_array_elements(p_rows) r
     where jsonb_typeof(r->'pii') = 'object' and (r->'pii'->>'record_uid') is not null
  ), insp as (
    insert into rpt_records_pii (record_uid, enc)
    select pii->>'record_uid', rpt_pii_encrypt(pii - 'record_uid') from srcp
    on conflict (record_uid) do update set enc = excluded.enc, updated_at = now()
    returning 1
  )
  select count(*) into n_pii from insp;

  select p_rows->0->'base'->>'report_id' into v_report_id;

  insert into audit_logs (user_id, user_email, action, resource, resource_id, details)
  values (auth.uid(), auth.jwt()->>'email', 'import', 'rpt_records', v_report_id,
          jsonb_build_object('records', n_base, 'pii', n_pii));

  return jsonb_build_object('records', n_base, 'pii', n_pii, 'report_id', v_report_id);
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5.5) rpt_mask_nid — ปิดบังเลขบัตรให้เหลือ 4 ตัวท้าย
-- ═══════════════════════════════════════════════════════════════════════════
-- ใช้ร่วมกันทุกทางออก เพื่อไม่ให้มีที่ไหนเผลอส่งเลขเต็มออกไป
-- (ตรรกะเดียวกับ interview_mask_nid ของโมดูลแบบซักผู้เสพ)
create or replace function rpt_mask_nid(v text)
returns text language sql immutable as $$
  select case when v is null or v = '' then null
              else repeat('x', greatest(length(regexp_replace(v, '\D', '', 'g')) - 4, 0))
                   || right(regexp_replace(v, '\D', '', 'g'), 4) end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) rpt_entry_list — รายการสำหรับหน้าจอ (mask เลขบัตร + แบ่งหน้า)
-- ═══════════════════════════════════════════════════════════════════════════
-- หน้ารายการไม่ต้องเห็นเลขบัตรเต็ม — เห็นแค่ 4 ตัวท้ายพอสำหรับยืนยันตัวคน
-- ข้อความบรรยายยาว ๆ ไม่ส่งมาด้วย (โหลดตอนเปิดรายตัว) เพื่อไม่ให้ payload บวม
drop function if exists rpt_entry_list(text[], text, text, text);
drop function if exists rpt_entry_list(text[], text, text, text, int, int);
drop function if exists rpt_entry_list(text[], text, text, text, text, int, int);
drop function if exists rpt_entry_list(text[], text, text, text, text, boolean, int, int);
create or replace function rpt_entry_list(
  p_report_ids text[] default null,
  p_district   text    default null,
  p_status     text    default null,     -- 'draft' | 'done' | 'empty' (ยังไม่เริ่มกรอก)
  p_q          text    default null,
  p_period     text    default null,     -- ช่วงข้อมูล เช่น '01 ต.ค. 68-31 ธ.ค. 68'
  p_has_geo    boolean default null,     -- true = เฉพาะที่มีพิกัดแล้ว, false = เฉพาะที่ยังไม่มี
  p_limit      int     default 500,
  p_offset     int     default 0
)
returns table (
  record_uid text, report_id text, seq int, complaint_no text, source text,
  district text, subdistrict text, src_village text, result_behavior text, result_operation text,
  result_agency text, recv_date date, result_date date, drug_types text, area_type text,
  period_label text,
  full_name text, national_id_masked text, addr_detail text,
  entry_status text, lat numeric, lng numeric, community text, nispa_code text,
  bkn text, police_station text, area_group text, place_type text,
  person_category text, official_types text[], updated_at timestamptz,
  total_count bigint
)
-- definer: อ่าน rpt_records_pii ซึ่งถอนสิทธิ์ตารางออกจาก authenticated แล้ว
language plpgsql security definer stable set search_path = public as $$
declare q text := nullif(trim(p_q), '');
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select r.record_uid, r.report_id, r.seq, r.complaint_no, r.source,
           r.district, r.subdistrict, r.src_village, r.result_behavior, r.result_operation,
           r.result_agency, r.recv_date, r.result_date, r.drug_types, r.area_type,
           r.period_label,
           nullif(trim(coalesce(p.d->>'first_name', '') || ' ' || coalesce(p.d->>'last_name', '')), ''),
           rpt_mask_nid(p.d->>'national_id'),
           p.d->>'addr_detail',
           coalesce(e.status, 'empty'), e.lat, e.lng, e.community, e.nispa_code,
           e.bkn, e.police_station, e.area_group, e.place_type,
           e.person_category, e.official_types, e.updated_at,
           count(*) over () as total_count
      from rpt_records r
      -- ถอดรหัสรายแถว (lateral) — ตัวกรองอื่นถูกใช้ก่อน จึงถอดเฉพาะแถวที่ผ่านตัวกรองแล้ว
      left join lateral (
        select rpt_pii_decrypt(x.enc) as d from rpt_records_pii x where x.record_uid = r.record_uid
      ) p on true
      left join rpt_field_entry e on e.record_uid = r.record_uid
     where (p_report_ids is null or r.report_id = any(p_report_ids))
       and (p_district is null or r.district = p_district)
       and (p_status is null or coalesce(e.status, 'empty') = p_status)
       and (p_period is null or r.period_label = p_period)
       and (p_has_geo is null or (e.lat is not null) = p_has_geo)
       and (q is null
            or r.complaint_no          ilike '%' || q || '%'
            or r.person_no             ilike '%' || q || '%'
            or (p.d->>'first_name')    ilike '%' || q || '%'
            or (p.d->>'last_name')     ilike '%' || q || '%'
            or (p.d->>'aka')           ilike '%' || q || '%'
            or (p.d->>'addr_detail')   ilike '%' || q || '%')
     order by r.report_id, r.seq
     limit greatest(1, least(p_limit, 1000)) offset greatest(0, p_offset);
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) rpt_entry_get — เปิดดูรายตัว (PII เต็ม + บันทึก audit ในธุรกรรมเดียว)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function rpt_entry_get(p_record_uid text)
returns jsonb
-- definer: อ่าน rpt_records_pii ซึ่งถอนสิทธิ์ตารางออกจาก authenticated แล้ว
language plpgsql security definer set search_path = public as $$
declare rec jsonb; pii jsonb; ent jsonb;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select to_jsonb(r) into rec from rpt_records r where r.record_uid = p_record_uid;
  if rec is null then return null; end if;
  -- เปิดดูรายตัว = คืนครบทุกช่องรวมเลขบัตรเต็ม
  -- เจ้าหน้าที่ที่มีสิทธิ์ต้องเห็นข้อมูลครบถึงจะทำงานได้ การปิดบังตรงนี้ไม่ได้กันการถูกแฮก
  -- สิ่งที่กันการรั่วไหลจริงคือ: เข้าถึงได้เฉพาะแอดมิน + ตารางนี้ห้ามแตะตรงผ่าน API
  -- + คืนทีละ 1 คน + บันทึก audit ทุกครั้ง (ดูบรรทัดถัดไป)
  select rpt_pii_decrypt(p.enc) || jsonb_build_object('record_uid', p.record_uid)
    into pii from rpt_records_pii p where p.record_uid = p_record_uid;
  select to_jsonb(e) into ent from rpt_field_entry e where e.record_uid = p_record_uid;

  insert into audit_logs (user_id, user_email, action, resource, resource_id)
  values (auth.uid(), auth.jwt()->>'email', 'view', 'rpt_records_pii', p_record_uid);

  return jsonb_build_object('record', rec, 'pii', pii, 'entry', ent);
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8) rpt_entry_save — บันทึกช่องที่กรอกเพิ่ม
-- ═══════════════════════════════════════════════════════════════════════════
-- ตัดคอลัมน์ที่ client ไม่ควรกำหนดเองทิ้ง (ผู้แก้/เวลา) แล้วเติมจาก auth เสมอ
create or replace function rpt_entry_save(p_record_uid text, p_entry jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare e rpt_field_entry;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from rpt_records where record_uid = p_record_uid) then
    raise exception 'ไม่พบเรคอร์ด %', p_record_uid;
  end if;

  e := jsonb_populate_record(null::rpt_field_entry,
         (p_entry - 'updated_by' - 'updated_by_email' - 'created_at' - 'updated_at')
         || jsonb_build_object('record_uid', p_record_uid));
  e.updated_by := auth.uid();
  e.updated_by_email := auth.jwt()->>'email';
  -- jsonb_populate_record ตั้งต้นจาก null:: จึงได้ NULL ไม่ใช่ค่า default ของคอลัมน์
  e.status := coalesce(nullif(e.status, ''), 'draft');
  e.created_at := coalesce(e.created_at, now());
  e.updated_at := now();
  e.official_types := coalesce(e.official_types, '{}');

  insert into rpt_field_entry select (e).*
  on conflict (record_uid) do update set
    lat = excluded.lat, lng = excluded.lng, geo_note = excluded.geo_note,
    community = excluded.community, nispa_code = excluded.nispa_code,
    bkn = excluded.bkn, police_station = excluded.police_station,
    area_group = excluded.area_group, place_type = excluded.place_type,
    place_type_other = excluded.place_type_other,
    person_category = excluded.person_category, official_types = excluded.official_types,
    official_type_other = excluded.official_type_other,
    note = excluded.note, status = excluded.status,
    updated_by = excluded.updated_by, updated_by_email = excluded.updated_by_email;

  insert into audit_logs (user_id, user_email, action, resource, resource_id, details)
  values (auth.uid(), auth.jwt()->>'email', 'update', 'rpt_field_entry', p_record_uid,
          jsonb_build_object('status', e.status));

  return (select to_jsonb(x) from rpt_field_entry x where x.record_uid = p_record_uid);
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8.35) rpt_import_finish — บันทึกประวัติหลังอัปไฟล์หนึ่งฉบับเสร็จ
-- ═══════════════════════════════════════════════════════════════════════════
-- rpt_import_batch() ถูกเรียกหลายครั้งต่อไฟล์ (แบ่งส่งทีละ 250 แถว)
-- จึงแยกการบันทึกประวัติมาเรียกครั้งเดียวตอนจบ เพื่อไม่ให้ได้ประวัติซ้ำหลายแถวต่อไฟล์
create or replace function rpt_import_finish(
  p_report_id text, p_file_name text, p_title text,
  p_period text, p_printed_at date, p_rows int
)
returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into rpt_import_batches (report_id, file_name, report_title, period_label,
                                  printed_at, rows_imported, imported_by, imported_by_email)
  values (p_report_id, p_file_name, p_title, p_period, p_printed_at, p_rows,
          auth.uid(), auth.jwt()->>'email')
  returning id into v_id;
  return v_id;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8.37) rpt_import_history — ประวัติการอัปโหลดล่าสุด
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function rpt_import_history(p_limit int default 50)
returns setof rpt_import_batches
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select * from rpt_import_batches
     order by imported_at desc
     limit greatest(1, least(p_limit, 500));
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8.4) rpt_import_status — นำเข้าครบทุกกลุ่มแล้วหรือยัง
-- ═══════════════════════════════════════════════════════════════════════════
-- หน้านำเข้าอัปโหลดทีละกลุ่มตามหัวข้อ (กลุ่ม 1-5) จึงต้องรู้ว่ากลุ่มไหนเข้าแล้ว
-- กี่ราย เมื่อไหร่ และช่วงข้อมูลของไฟล์ที่เข้าไปคือช่วงไหน
-- ไม่แตะ rpt_records_pii เลย → invoker พอ (RLS ของ rpt_records คุมอยู่แล้ว)
drop function if exists rpt_import_status();
create or replace function rpt_import_status()
returns table (
  report_id text, records bigint, entries_done bigint,
  last_imported_at timestamptz, period_label text,
  report_title text, printed_at date,
  periods text[], batches bigint
)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select r.report_id, count(*)::bigint,
           count(*) filter (where e.status = 'done')::bigint,
           max(r.imported_at), max(r.period_label),
           max(r.report_title), max(r.printed_at),
           -- ช่วงข้อมูลทั้งหมดที่มีอยู่ของกลุ่มนี้ (อัปสะสมหลายงวดได้)
           array_remove(array_agg(distinct r.period_label), null),
           (select count(*) from rpt_import_batches b where b.report_id = r.report_id)
      from rpt_records r
      left join rpt_field_entry e on e.record_uid = r.record_uid
     group by r.report_id
     order by r.report_id;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8.45) rpt_delete_records — ล้างข้อมูลที่นำเข้า (ทั้งหมด หรือเฉพาะกลุ่ม)
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ ลบแล้วกู้ไม่ได้ และ cascade ไปลบ rpt_records_pii + rpt_field_entry ด้วย
--    (ช่องที่เจ้าหน้าที่กรอกเองจะหายไปพร้อมกัน — หน้าจอต้องเตือนก่อนเรียกเสมอ)
-- definer: ต้องแตะ rpt_records_pii ที่ถอนสิทธิ์ตารางออกจาก authenticated แล้ว
-- คืนจำนวนแถวที่ลบจริง เพื่อให้หน้าจอยืนยันผลได้ ไม่ต้องเดา
create or replace function rpt_delete_records(p_report_id text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_rec int; n_entry int;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  -- นับช่องที่กรอกเองที่กำลังจะหายไปด้วย เพื่อบันทึกไว้ใน audit
  select count(*) into n_entry
    from rpt_field_entry e join rpt_records r on r.record_uid = e.record_uid
   where p_report_id is null or r.report_id = p_report_id;

  delete from rpt_records r where p_report_id is null or r.report_id = p_report_id;
  get diagnostics n_rec = row_count;

  insert into audit_logs (user_id, user_email, action, resource, resource_id, details)
  values (auth.uid(), auth.jwt()->>'email', 'delete', 'rpt_records',
          coalesce(p_report_id, 'ทั้งหมด'),
          jsonb_build_object('records', n_rec, 'field_entries', n_entry));

  return jsonb_build_object('records', n_rec, 'field_entries', n_entry);
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8.6) rpt_export_rows — ดึงทุกคอลัมน์ไปทำไฟล์ Excel
-- ═══════════════════════════════════════════════════════════════════════════
-- คืน "ครบทุกช่องตามหัวรายงาน" (rpt_records + rpt_records_pii) พร้อมช่องที่กรอกเอง
-- รวมเป็น jsonb ก้อนเดียวต่อแถว — ทั้งสามตารางไม่มีชื่อคอลัมน์ชนกัน (ยกเว้น record_uid ที่ค่าเท่ากัน)
--
-- ⚠️ ไฟล์ที่ได้มีชื่อ-เลขบัตร-ที่อยู่เต็ม เพราะเจ้าหน้าที่ต้องใช้ลงพื้นที่จริง
--    จึง "บันทึก audit ก่อนคืนข้อมูลเสมอ" — ถ้าเขียน audit ไม่สำเร็จ ธุรกรรมล้ม ข้อมูลไม่ออก
-- definer: อ่าน rpt_records_pii ที่ถอนสิทธิ์ตารางออกจาก authenticated แล้ว
drop function if exists rpt_export_rows(text[], text, text, text, text);
drop function if exists rpt_export_rows(text[], text, text, text, text, text);
create or replace function rpt_export_rows(
  p_report_ids text[] default null,
  p_district   text    default null,
  p_status     text    default null,
  p_q          text    default null,
  p_period     text    default null,
  p_has_geo    boolean default null,
  p_filter_label text  default null
)
returns setof jsonb
language plpgsql security definer set search_path = public as $$
declare q text := nullif(trim(p_q), ''); n bigint;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  select count(*) into n
    from rpt_records r
    left join lateral (
      select rpt_pii_decrypt(x.enc) as d from rpt_records_pii x where x.record_uid = r.record_uid
    ) p on true
    left join rpt_field_entry e on e.record_uid = r.record_uid
   where (p_report_ids is null or r.report_id = any(p_report_ids))
     and (p_district is null or r.district = p_district)
     and (p_status is null or coalesce(e.status, 'empty') = p_status)
     and (p_period is null or r.period_label = p_period)
     and (p_has_geo is null or (e.lat is not null) = p_has_geo)
     and (q is null
          or r.complaint_no ilike '%' || q || '%' or r.person_no ilike '%' || q || '%'
          or (p.d->>'first_name') ilike '%' || q || '%' or (p.d->>'last_name') ilike '%' || q || '%'
          or (p.d->>'aka') ilike '%' || q || '%' or (p.d->>'addr_detail') ilike '%' || q || '%');

  insert into audit_logs (user_id, user_email, action, resource, details)
  values (auth.uid(), auth.jwt()->>'email', 'export', 'rpt_records',
          jsonb_build_object('count', n, 'filter', p_filter_label, 'full_pii', true));

  return query
    select to_jsonb(r) || coalesce(p.d, '{}'::jsonb) || coalesce(to_jsonb(e), '{}'::jsonb)
      from rpt_records r
      left join lateral (
        select rpt_pii_decrypt(x.enc) as d from rpt_records_pii x where x.record_uid = r.record_uid
      ) p on true
      left join rpt_field_entry e on e.record_uid = r.record_uid
     where (p_report_ids is null or r.report_id = any(p_report_ids))
       and (p_district is null or r.district = p_district)
       and (p_status is null or coalesce(e.status, 'empty') = p_status)
       and (p_period is null or r.period_label = p_period)
       and (p_has_geo is null or (e.lat is not null) = p_has_geo)
       and (q is null
            or r.complaint_no ilike '%' || q || '%' or r.person_no ilike '%' || q || '%'
            or (p.d->>'first_name') ilike '%' || q || '%' or (p.d->>'last_name') ilike '%' || q || '%'
            or (p.d->>'aka') ilike '%' || q || '%' or (p.d->>'addr_detail') ilike '%' || q || '%')
     order by r.report_id, r.seq;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9) สิทธิ์เรียก RPC — เฉพาะผู้ล็อกอิน (ตรวจ is_admin() ซ้ำภายในทุกฟังก์ชัน)
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare f text;
begin
  foreach f in array array[
    'rpt_import_batch(jsonb)',
    'rpt_entry_list(text[], text, text, text, text, boolean, int, int)',
    'rpt_entry_get(text)',
    'rpt_entry_save(text, jsonb)',
    'rpt_export_rows(text[], text, text, text, text, boolean, text)',
    'rpt_import_status()',
    'rpt_import_finish(text, text, text, text, date, int)',
    'rpt_import_history(int)',
    'rpt_delete_records(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ตัวช่วย mask ไม่ต้องเปิดให้เรียกจาก API (ฟังก์ชันด้านบนเรียกใช้ภายในเองได้)
revoke execute on function rpt_mask_nid(text) from public, anon, authenticated;

-- เลิกใช้ rpt_reveal_nid แล้ว (เปิดดูรายตัวเห็นเลขบัตรครบอยู่แล้ว) — ลบทิ้งถ้าเคยสร้างไว้
drop function if exists rpt_reveal_nid(text, text);

-- เลิกใช้ rpt_log_export แล้ว — rpt_export_rows บันทึก audit ในตัวและคืนข้อมูลด้วยเลย
drop function if exists rpt_log_export(int, text);

