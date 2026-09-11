-- แบบซักผู้เสพ — ปิดช่องว่างการแย่งเลขกันตอนบันทึกพร้อมกัน
--
-- ปัญหาเดิม: trigger ทั้งสองตัวออกเลขด้วย "select max(...) + 1"
--   ถ้าสองเครื่องกดบันทึกพร้อมกัน ทั้งคู่จะอ่าน max ค่าเดียวกัน แล้วคำนวณเลขเดียวกัน
--   unique index จะปฏิเสธเครื่องที่สอง → ผู้ใช้เจอ error ทั้งที่กรอกข้อมูลถูกต้องทุกอย่าง
--
-- วิธีแก้: pg_advisory_xact_lock ให้การออกเลขทำได้ทีละ transaction
--   คนที่สองจะรอคนแรก commit แล้วค่อยอ่าน max ใหม่ → ได้เลขถัดไป ไม่ชนกัน
--   ล็อกปลดเองอัตโนมัติเมื่อจบ transaction (xact) ไม่มีค้าง
--
-- ต้องรัน 20260910 และ 20260911 ก่อน — รันซ้ำได้ (idempotent)

-- ── รหัสอ้างอิง ผส-69-0001 ─────────────────────────────────────────────────
create or replace function interview_assign_code()
returns trigger language plpgsql as $$
declare fy int; yy text; n int;
begin
  if new.code is not null and new.code <> '' then return new; end if;
  perform pg_advisory_xact_lock(hashtext('interview_records.code'));
  fy := coalesce(new.fiscal_year, interview_fiscal_year(new.surveyed_at), interview_fiscal_year(current_date));
  yy := right(fy::text, 2);
  select coalesce(max((regexp_replace(code, '^.*-', ''))::int), 0) + 1
    into n from interview_records where code like 'ผส-' || yy || '-%';
  new.code := 'ผส-' || yy || '-' || lpad(n::text, 4, '0');
  return new;
end $$;

-- ── เลขที่แบบ ๑-๑/๐๐๐๑ ─────────────────────────────────────────────────────
create or replace function interview_assign_doc_no()
returns trigger language plpgsql as $$
declare n int;
begin
  if new.doc_no is not null and new.doc_no <> '' then return new; end if;
  perform pg_advisory_xact_lock(hashtext('interview_records.doc_no'));
  select coalesce(max(translate(split_part(doc_no, '/', 2), '๐๑๒๓๔๕๖๗๘๙', '0123456789')::int), 0) + 1
    into n
    from interview_records
   where doc_no ~ '^๑-๑/[๐-๙]+$';
  new.doc_no := '๑-๑/' || translate(lpad(n::text, 4, '0'), '0123456789', '๐๑๒๓๔๕๖๗๘๙');
  return new;
end $$;
