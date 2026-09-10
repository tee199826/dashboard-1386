-- แบบซักผู้เสพ — ออก "เลขที่แบบ" อัตโนมัติ รูปแบบ ๑-๑/๐๐๐๑
--
-- ต้องรัน 20260910_interview_records.sql ก่อน (ไฟล์นี้ต่อยอดจากตาราง interview_records)
-- สร้างฝั่งฐานข้อมูลด้วย trigger เหมือนรหัสอ้างอิง เพื่อให้เลขไม่ชนกันแม้บันทึกพร้อมกันหลายเครื่อง
--
-- เลขไม่รีเซ็ตรายปี — เพราะในตัวเลขไม่มีปีกำกับ ถ้ารีเซ็ตจะได้เลขซ้ำข้ามปี
-- (ปีดูได้จากรหัสอ้างอิง ผส-๖๙-xxxx และวันที่สัมภาษณ์อยู่แล้ว)
--
-- รันซ้ำได้ (idempotent)

create or replace function interview_assign_doc_no()
returns trigger language plpgsql as $$
declare n int;
begin
  if new.doc_no is not null and new.doc_no <> '' then return new; end if;
  -- นับต่อจากเลขสูงสุดเดิม — คัดเฉพาะแถวที่อยู่ในรูปแบบ ๑-๑/<เลขไทย> เท่านั้น
  -- (กันแถวที่เคยพิมพ์มือรูปแบบอื่นทำให้ cast พัง)
  select coalesce(max(translate(split_part(doc_no, '/', 2), '๐๑๒๓๔๕๖๗๘๙', '0123456789')::int), 0) + 1
    into n
    from interview_records
   where doc_no ~ '^๑-๑/[๐-๙]+$';
  new.doc_no := '๑-๑/' || translate(lpad(n::text, 4, '0'), '0123456789', '๐๑๒๓๔๕๖๗๘๙');
  return new;
end $$;

drop trigger if exists trg_interview_assign_doc_no on interview_records;
create trigger trg_interview_assign_doc_no
  before insert on interview_records
  for each row execute function interview_assign_doc_no();

-- เติมเลขย้อนหลังให้แถวเดิมที่ยังไม่มี (เรียงตามวันที่สัมภาษณ์)
with numbered as (
  select record_uid,
         row_number() over (order by surveyed_at nulls last, record_uid)
           + coalesce((select max(translate(split_part(doc_no, '/', 2), '๐๑๒๓๔๕๖๗๘๙', '0123456789')::int)
                         from interview_records where doc_no ~ '^๑-๑/[๐-๙]+$'), 0) as rn
    from interview_records
   where doc_no is null or doc_no = ''
)
update interview_records r
   set doc_no = '๑-๑/' || translate(lpad(n.rn::text, 4, '0'), '0123456789', '๐๑๒๓๔๕๖๗๘๙')
  from numbered n
 where r.record_uid = n.record_uid;

create unique index if not exists idx_interview_doc_no on interview_records(doc_no);

-- ที่อยู่ของเพื่อนที่ฝากซื้อ (ช่องทางการซื้อ = "ฝากเพื่อนซื้อ")
-- เก็บฝั่ง PII เพราะเป็นที่อยู่ของบุคคลที่สาม ไม่ใช่ข้อมูลเชิงสถิติ
alter table interview_records_pii add column if not exists friend_address text;
