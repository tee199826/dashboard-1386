# เอกสารส่งมอบ — Dashboard 1386

ปรับปรุง 22 กันยายน 2569 · อ่าน [README](../README.md) ก่อนเพื่อรู้วิธีติดตั้งและรัน

เอกสารนี้สรุปสิ่งที่คนรับช่วงต้องรู้แต่อ่านจากโค้ดไม่ได้ตรง ๆ คือโครงสร้างระบบ ข้อมูลส่วนบุคคลอยู่ตรงไหน migration ที่ยังไม่ได้รัน และข้อค้างที่ทราบแล้ว

---

## 1. ระบบนี้ทำอะไร

เว็บสำหรับสำนักงาน ปปส. กรุงเทพฯ แสดงสถิติยาเสพติดและจัดการงานร้องเรียนในพื้นที่ 50 เขต แบ่งเป็นสองฝั่ง

- **ฝั่งเปิดดูได้** — สถิติรวม ไม่มีข้อมูลรายบุคคล
- **ฝั่งต้องล็อกอิน** — แบบสัมภาษณ์ผู้ใช้ยา แบบบันทึกภาคสนาม และงานแอดมิน

### หน้าหลัก

| Route | เรื่อง | สิทธิ์ |
|---|---|---|
| `/` | ภาพรวม | เปิด |
| `/complaints` | เรื่องร้องเรียน + ตาราง | เปิด |
| `/districts`, `/districts/behavior-table` | รายเขต + ตารางพฤติการณ์ | เปิด |
| `/situation`, `/situation/drug-evidence` | สถานการณ์ จับกุม/บำบัด/ของกลาง | เปิด |
| `/bkn` | บก.น. 1–9 | เปิด |
| `/operations` | ผลการดำเนินงาน (RPT 114) | เปิด |
| `/radar` | แผนที่เรื่องร้องเรียน + cluster + export | เปิด |
| `/pixel-map` | แผนที่เชิงพื้นที่ เปรียบเทียบ/ส่งออกภาพ | เปิด |
| `/substance-users`, `/intel/interview`, `/intel/interview/new` | แบบสัมภาษณ์ผู้ใช้ยา | **ล็อกอิน** |
| `/rpt-entry` | บันทึกข้อมูลภาคสนาม | **ล็อกอิน** |
| `/upload` | นำเข้าไฟล์ Excel | **ล็อกอิน** |
| `/admin`, `/admin/users`, `/admin/logs`, `/admin/data` | จัดการผู้ใช้ / audit log / ข้อมูล | **แอดมิน** |

### โครงสร้าง source

```
src/app/        providers + routes (App.jsx คือจุดเริ่ม routing)
src/features/   หนึ่งโฟลเดอร์ต่อหนึ่งงาน — admin bkn complaints districts
                intelligence operations overview pixel-map radar rpt situation upload
src/shared/     ใช้ร่วมกัน — ui state data filters geo export security utils
supabase/migrations/   schema + RLS + RPC
supabase/functions/    Edge Function (ปัจจุบันมี admin-create-user ตัวเดียว)
scripts/        เครื่องมือ CLI นำเข้าข้อมูล/ตรวจ (ต้องใช้ service key)
test/           ชุดทดสอบ node:test
```

### หลักสำคัญของสถาปัตยกรรม

- **สิทธิ์อยู่ที่ฐานข้อมูล ไม่ใช่ที่ React** — `ProtectedRoute` กับการซ่อนเมนูเป็นแค่ UX ตัวกันจริงคือ RLS policy, `revoke`/`grant` และ `is_admin()` ใน migration แก้หน้าจออย่างเดียวไม่ถือว่าปิดช่อง
- **สร้างผู้ใช้ผ่าน Edge Function เท่านั้น** — `admin-create-user` เพราะต้องใช้ service role key ซึ่งห้ามอยู่ฝั่ง browser
- **ข้อมูลส่วนบุคคลแยกตาราง** — ตารางหลักเก็บเฉพาะข้อมูลที่ไม่ระบุตัวบุคคล ส่วน PII อยู่ตาราง `*_pii` ที่ปิดสิทธิ์แน่นกว่า

---

## 2. ตารางที่มีข้อมูลส่วนบุคคล

**สามตารางนี้ต้องระวังที่สุด** ห้าม `grant` ให้ `anon` หรือ `authenticated` ห้าม join เข้า view สาธารณะ และห้ามดึงลงไฟล์ export

| ตาราง | เก็บอะไร | การป้องกัน |
|---|---|---|
| `substance_user_pii` | ชื่อ-สกุล ฉายา เลขบัตรประชาชน วันเกิด เบอร์โทร ที่อยู่ และ**ข้อมูลผู้ขาย** (ชื่อ/รูปพรรณ/อาวุธ/ยานพาหนะ) | RLS + policy แอดมิน |
| `interview_records_pii` | ชุดเดียวกับข้างบน ผูกกับ `interview_records.record_uid` | RLS + policy แอดมิน |
| `rpt_records_pii` | PII ทั้งก้อนเก็บเป็น **ciphertext** ในคอลัมน์ `enc` (bytea) | RLS + `revoke all` จาก anon/authenticated + ถอดรหัสได้เฉพาะผ่าน `rpt_pii_decrypt()` ซึ่ง revoke จาก API แล้ว มี `enc_version` เผื่อหมุนกุญแจ |

**ระวังทางอ้อม** — `drug_incidents` มีพิกัด X/Y ระดับชุมชนและพฤติการณ์ ส่วนตารางร้องเรียนมีเพศ/อาชีพ/เขต ลำพังไม่ระบุตัวบุคคล แต่รวมกันอาจระบุได้ ความเห็นนี้บันทึกไว้ใน `20260915_security_baseline.sql` แล้วว่า **เจ้าของข้อมูลต้องยืนยัน** ก่อนเปิดสาธารณะ ยังไม่มีการยืนยันเป็นลายลักษณ์อักษร

ตารางที่ไม่มี PII: `arrest_summary`, `treatment_summary`, `report_114`, `bkn_summary`, `profiles`, `audit_logs`, `interview_counters`, `rpt_import_batches`

---

## 3. RLS และสิทธิ์

migration `20260915_security_baseline.sql` เป็นฐานสิทธิ์หลัก เปิด RLS และวาง policy ให้

- อ่านสาธารณะ + เขียนเฉพาะแอดมิน — `drug_incidents`, `report_114`, `complaints`, `bkn_summary`, `substance_users`, `upload_batches`, `arrest_summary`, `treatment_summary`
- เฉพาะเจ้าของ/แอดมิน — `profiles`, `audit_logs` (`audit_logs` ไม่มี policy update/delete เลย แก้ย้อนหลังไม่ได้แม้เป็นแอดมิน)
- เปิด RLS โดยไม่มี policy = ปิดทุก role — `drug_incidents_legacy_v1`

migration `20260918_rpt_field_entry.sql` ปิดแน่นกว่า คือ `revoke all` จาก anon/authenticated ทุกตาราง RPT แล้วเหลือทางเข้าเดียวผ่าน RPC ที่ควบคุมได้ RLS เปิดไว้เป็นชั้นสำรอง

> **ยังไม่ได้ตรวจกับฐานข้อมูลจริง** — ข้างบนคือสิ่งที่ migration *สั่ง* ไม่ใช่สิ่งที่ฐานจริง *เป็น* ดูข้อ 4

---

## 4. Migration ที่รอรัน

| ไฟล์ | สถานะ | ผลถ้าไม่รัน |
|---|---|---|
| `20260918_rpt_field_entry.sql` | **ยังไม่ได้รัน** | `/rpt-entry` ใช้ไม่ได้ ตาราง `rpt_records` / `rpt_records_pii` / `rpt_import_batches` และ RPC ยังไม่มี |
| `20260915_security_baseline.sql` | ยังไม่ได้ยืนยันบน staging | staging อาจเปิดตารางกว้างกว่าที่ตั้งใจ |
| Edge Function `admin-create-user` | ยังไม่ได้ deploy บน staging | สร้างผู้ใช้จากหน้าแอดมินไม่ได้ |
| CSP / security headers | ยังไม่ได้ตั้งบน staging | header ที่เพิ่มใน SEC-14 ไม่มีผล |

**สิ่งแรกที่ทีมรับช่วงควรทำ** คือเชื่อมต่อโปรเจกต์ Supabase จริงแล้วรันคำสั่งนี้เพื่อดูว่า RLS เปิดครบจริงไหม — ตรวจจากโค้ดอย่างเดียวไม่พอ

```sql
-- ตารางที่ RLS ยังไม่เปิด
select tablename
from pg_tables
where schemaname = 'public' and rowsecurity = false
order by tablename;

-- ตารางที่เปิด RLS แต่ไม่มี policy (= ปิดหมด ตั้งใจหรือเปล่า)
select t.tablename
from pg_tables t
left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public' and t.rowsecurity and p.policyname is null
group by t.tablename;

-- grant ที่ยังค้างอยู่กับ anon/authenticated บนตาราง PII
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name like '%_pii';
```

สามคำสั่งนี้ควรคืนผลว่าง ถ้าไม่ว่างแปลว่ามีช่องที่ยังไม่ปิด

รัน migration ด้วย `node scripts/run-migration.mjs` (ต้องมี `SUPABASE_SERVICE_KEY` ใน `.env.local`)

---

## 5. ข้อค้างที่ทราบ

### การจัดโครงสร้าง source ยังไม่ commit

working tree ตอนนี้มีการย้าย `src/components/*` และ `src/pages/*` ไป `src/features/` กับ `src/shared/` เป็นการเปลี่ยนก้อนใหญ่ที่ยังไม่ได้ commit ผ่าน build และ test แล้วแต่ยังไม่ได้ทดสอบกับฐานข้อมูลจริง **ควร commit ให้จบก่อนเริ่มงานใหม่** ไม่อย่างนั้นเสี่ยง conflict หนัก

### lint ไม่ผ่าน — 31 error 6 warning

เป็นปัญหาเดิมที่ยกมา ไม่ได้เกิดจากการย้ายไฟล์

| กฎ | จำนวน | เรื่อง |
|---|---|---|
| `react-hooks/set-state-in-effect` | 15 | เรียก setState ตรง ๆ ใน effect ทำให้ render ซ้อน |
| `react-hooks/exhaustive-deps` | 7 | dependency array ไม่ครบ เสี่ยงค่าค้าง |
| `react-refresh/only-export-components` | 4 | ไฟล์ context export ทั้ง component และ hook |
| `react-hooks/refs` | 1 | ใช้ ref ผิดจังหวะ |

กระจายอยู่ในไฟล์ context (`AuthContext`, `DataContext`, `FilterContext`, `PresentationContext`) และหน้าหลักหลายหน้า แก้ทีละไฟล์ได้ ไม่ต้องรื้อ

`npm test` ผ่านครบ 41 ข้อ

### ค้างจากงานก่อนหน้า

- **กราฟราคายา** (`/substance-users`) — ออกแบบใหม่ค้างอยู่ รอข้อมูลเพิ่มจากเจ้าของข้อมูล
- **ข้อมูลบำบัด** — ยังไม่ได้ต่อกับแหล่ง บสต. ที่เป็นทางการ (ส่วนจับกุมต่อกับ `arrest_*` แล้ว และร้องเรียนใช้ `drug_incidents`)
- **ระดับ สน.** — `drug_incidents` ไม่มีคอลัมน์ `police_station` และ `bkn_summary` ไม่มีทั้ง สน. และปีงบ จึงยังทำสถิติระดับ สน. ไม่ได้ หน้า `/bkn` ใช้การ map จากเขตแทน

### กับดักที่เสียเวลาเจอเอง

- **กรองเขตต้องใช้ whitelist** — `drug_incidents` มีค่าที่ขึ้นต้นด้วย "เขตอำเภอ…" ปนอยู่ การกรองด้วย `startsWith('เขต')` จะได้ขยะติดมา ให้กรองด้วย `DNAME_TO_GROUP` ตอน aggregate และเก็บ raw ไว้เหมือนเดิม
- **ฟิลเตอร์ `/radar` ค้างใน localStorage** คีย์ `radar.*` — เทสแล้วผลแปลกให้ล้างก่อน
- **React StrictMode** ทำให้ popup ของ Leaflet ดูเหมือนถูก remove ทั้งที่ไม่ใช่ อย่าไล่แก้ผิดจุด
- **ไฟล์ Excel ใน `tmp/`** เป็นไฟล์ตัวอย่างสำหรับพัฒนา (`arrest_data`, `treatment_data`, `sample-drug-incidents`) ตรวจแล้วว่าคอลัมน์ PII ว่างทั้งหมด ไฟล์ข้อมูลจริงอยู่นอก repo — แต่ทั้งสามไฟล์ยัง tracked อยู่ทั้งที่ `.gitignore` มีกฎ `tmp/` และ `*.xlsx` แล้ว ควร `git rm --cached` ออก

---

## 6. ข้อตกลงที่ต้องรักษา

1. ข้อมูลจริงไม่เข้า Git — `.gitignore` ครอบ `.env*`, `data/`, `tmp/`, `*.xlsx` แล้ว
2. service key ไม่อยู่ในตัวแปร `VITE_*` เพราะจะถูก bundle ขึ้นเว็บ
3. ไม่วางไฟล์ข้อมูลใน `public/` — Vite คัดลอกทุกไฟล์ใน `public/` ขึ้นเว็บโดยไม่ตรวจสิทธิ์ (เคยเกิดมาแล้ว แก้ใน SEC-01) `npm run build` มี `scripts/check-public-assets.mjs` คอยกันไว้
4. เพิ่มหน้าที่มี PII ต้องแก้ทั้ง React **และ** RLS/RPC ฝั่งฐานข้อมูล
5. ทดสอบนำเข้า/ส่งออกด้วยข้อมูลสมมติเสมอ
