# เอกสารส่งมอบ — Dashboard 1386

ปรับปรุง 22 กันยายน 2569 · อ่าน [README](../README.md) ก่อนเพื่อรู้วิธีติดตั้งและรัน

เอกสารนี้สรุปสิ่งที่คนรับช่วงต้องรู้แต่อ่านจากโค้ดไม่ได้ตรง ๆ คือโครงสร้างระบบ ข้อมูลส่วนบุคคลอยู่ตรงไหน migration ที่ยังไม่ได้รัน และข้อค้างที่ทราบแล้ว

> **อ่านข้อ 3 ก่อน** — การตรวจสิทธิ์กับฐานจริงเมื่อ 22 กันยายน 2569 พบว่าตาราง `interview_records_pii` เปิดให้ role `anon` เข้าถึงได้ ปิดช่องแล้ว และ `audit_logs` ไม่พบการเข้าถึง **แต่ audit ไม่ครอบการเรียก REST ตรงด้วย anon key ซึ่งเป็นเส้นทางเดียวกับที่ช่องโหว่เปิดไว้** จึงยังสรุปไม่ได้ว่าไม่มีข้อมูลรั่ว ต้องดู log ฝั่ง Supabase ก่อน และควรรีบทำก่อน log หมดอายุ

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
| `interview_records_pii` | ชุดเดียวกับข้างบน ผูกกับ `interview_records.record_uid` เก็บเป็น **plaintext** | RLS + policy แอดมิน + `revoke all` จาก anon/authenticated (**เคยเปิดให้ anon เข้าถึงได้ แก้แล้ว 22 ก.ย. 2569 ดูข้อ 3 — ควรเข้ารหัสเพิ่ม**) |
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

### ผลตรวจฐานจริง — ยืนยันแล้ว 22 กันยายน 2569

รัน SQL สามชุดในข้อ 4 กับฐานข้อมูลจริง ผลดังนี้

| ชุด | ตรวจอะไร | ผล |
|---|---|---|
| 1 | ตารางที่ RLS ยังไม่เปิด | **0 แถว** — ทุกตารางใน `public` เปิด RLS ครบ |
| 2 | ตารางที่เปิด RLS แต่ไม่มี policy | `rpt_records_pii` — **ตั้งใจ** ดูคำอธิบายข้างล่าง |
| 3 | grant ที่ค้างกับ anon/authenticated บนตาราง `*_pii` | **0 แถว** หลังแก้ — ดูบันทึกช่องโหว่ข้างล่าง |

**ชุดที่ 2 ไม่ใช่ปัญหา** — `rpt_records_pii` เปิด RLS โดยไม่มี policy คือการปิดตายทุก role ยกเว้น owner ซึ่งตรงกับที่ `20260918_rpt_field_entry.sql` ออกแบบไว้ คือไม่ให้ role ไหนแตะตารางตรงผ่าน API ได้เลย ทางเข้าเดียวคือ RPC แบบ `security definer` ที่ตรวจ `is_admin()` และเขียน `audit_logs` ทุกครั้ง ข้อมูลในตารางยังเป็น ciphertext ที่ถอดได้เฉพาะผ่าน `rpt_pii_decrypt()` ซึ่ง revoke จาก API แล้ว

### ⚠️ ช่องโหว่ที่พบและแก้แล้ว — 22 กันยายน 2569

**`interview_records_pii` เปิดสิทธิ์ให้ role `anon`**

ตารางนี้เก็บชื่อ-สกุล ฉายา เลขบัตรประชาชน วันเกิด เบอร์โทร ที่อยู่ และข้อมูลผู้ขาย แบบ plaintext (ต่างจาก `rpt_records_pii` ที่เข้ารหัส) การที่ `anon` มีสิทธิ์แปลว่าใครก็ตามที่มี anon key ซึ่งถูก bundle ไปกับหน้าเว็บอยู่แล้ว อาจอ่านข้อมูลส่วนบุคคลออกไปได้

แก้ด้วย `revoke all on interview_records_pii from anon, authenticated` แล้วรันชุดที่ 3 ซ้ำ ได้ 0 แถว

### ผล audit การเข้าถึง — 22 กันยายน 2569

ตรวจ `audit_logs` ย้อนหลังเพื่อดูว่ามีการอ่านตาราง PII ไปจริงหรือไม่

| ตาราง | ผล | อ่านผลอย่างไร |
|---|---|---|
| `interview_records_pii` | **0 การเข้าถึงผ่านแอป** | ไม่พบร่องรอยการอ่านผ่านเส้นทางที่ audit ครอบ |
| `rpt_records_pii` | view 58 ครั้ง จากแอดมิน 1 คน (การทดสอบ) | เป็นการใช้งานปกติ ข้อมูลที่ได้เป็น ciphertext และผ่าน RPC ที่ตรวจสิทธิ์ทุกครั้ง |

### 🔴 ข้อจำกัดของ audit ที่ต้องเข้าใจก่อนสรุป

**`audit_logs` ครอบเฉพาะการเข้าถึงที่ผ่านแอปและ RPC เท่านั้น ไม่ครอบการเรียก REST API ตรงด้วย anon key**

ซึ่งการเรียกตรงด้วย anon key **คือเส้นทางเดียวกับที่ช่องโหว่นี้เปิดไว้พอดี** พูดอีกอย่างคือเครื่องมือที่ใช้ตรวจ มองไม่เห็นเส้นทางที่ต้องการตรวจ

ดังนั้น **"0 การเข้าถึงผ่านแอป" ไม่เท่ากับ "ไม่มีข้อมูลรั่ว"** — แปลได้แค่ว่าไม่มีใครใช้ช่องนี้*ผ่านหน้าเว็บ* คนที่ถือ anon key แล้วยิง REST เข้าตารางตรง ๆ จะไม่ปรากฏใน `audit_logs` เลย

จะปิดช่องว่างนี้ได้ต้องดู **Postgres log / API log ฝั่ง Supabase** ซึ่งอยู่นอก `audit_logs` และมีอายุจำกัดตาม retention ของแพ็กเกจ **ถ้าจะตรวจควรรีบทำก่อน log หมดอายุ**

### สิ่งที่ต้องทำต่อ

**ยังไม่ได้ทำ**

1. **ดู Postgres / API log ฝั่ง Supabase** หา request ที่ยิงเข้า `interview_records_pii` ด้วย role `anon` — เป็นทางเดียวที่จะตอบได้ว่ามีข้อมูลรั่วหรือไม่ ทำก่อน log หมดอายุ
2. **หาสาเหตุว่า grant นี้มาจากไหน** `20260910_interview_records.sql` ไม่ได้สั่ง grant ให้ anon อาจมาจากการแก้มือผ่าน Dashboard หรือ default privilege ของ schema ถ้าไม่ปิดต้นเหตุ มีโอกาสหลุดกลับมาอีก
3. **หมุน anon key** เพราะไม่ทราบว่า key เดิมกระจายไปถึงใครบ้างระหว่างที่ช่องเปิดอยู่ การหมุน key ทำให้ของเดิมใช้ไม่ได้ ต้องอัปเดต `.env.local` ของทุกคนและ environment ที่ deploy ไว้ด้วย
4. **เข้ารหัส `interview_records_pii`** ให้เหมือน `rpt_records_pii` ตอนนี้เป็น plaintext ทั้งตาราง ถ้าสิทธิ์หลุดอีกครั้งข้อมูลจะอ่านได้ทันที ส่วน `rpt_records_pii` ต่อให้หลุดก็ได้แค่ ciphertext — ใช้แนวเดียวกับ `rpt_pii_encrypt()` / `rpt_pii_decrypt()` ใน `20260918_rpt_field_entry.sql` ได้เลย **นี่คืองานที่ให้ผลตอบแทนสูงสุดในสี่ข้อนี้**
5. **เพิ่มการตรวจสิทธิ์เป็นงานประจำ** รัน SQL ชุดที่ 3 ทุกครั้งหลัง deploy หรือหลังแก้สิทธิ์ผ่าน Dashboard
6. **ประเมินการแจ้งเหตุตาม PDPA** ขึ้นกับผลข้อ 1 ตราบที่ยังไม่ได้ดู log ฝั่ง Supabase ยัง**สรุปไม่ได้**ว่าไม่ต้องแจ้ง

---

## 4. Migration ที่รอรัน

| ไฟล์ | สถานะ | ผลถ้าไม่รัน |
|---|---|---|
| `20260918_rpt_field_entry.sql` | **น่าจะรันแล้ว ต้องยืนยัน** — ดูหมายเหตุข้างล่าง | `/rpt-entry` ใช้ไม่ได้ ตาราง `rpt_records` / `rpt_records_pii` / `rpt_import_batches` และ RPC ยังไม่มี |
| `20260915_security_baseline.sql` | รันแล้ว ยืนยัน 22 ก.ย. 2569 จากผลตรวจข้อ 3 | staging อาจเปิดตารางกว้างกว่าที่ตั้งใจ |
| Edge Function `admin-create-user` | ยังไม่ได้ deploy บน staging | สร้างผู้ใช้จากหน้าแอดมินไม่ได้ |
| CSP / security headers | ยังไม่ได้ตั้งบน staging | header ที่เพิ่มใน SEC-14 ไม่มีผล |

> **หมายเหตุที่ต้องเคลียร์** — บันทึกเดิมระบุว่า `20260918_rpt_field_entry.sql` ยังไม่ได้รัน แต่ผลตรวจฐานจริงชุดที่ 2 เจอตาราง `rpt_records_pii` อยู่ใน `public` ซึ่งตารางนี้ถูกสร้างโดย migration ไฟล์นั้นไฟล์เดียว แปลว่าน่าจะรันไปแล้วโดยไม่ได้บันทึกไว้ **ต้องยืนยันก่อนใช้งาน `/rpt-entry`** ว่ารันครบทั้งไฟล์หรือรันไปแค่บางส่วน ตรวจด้วย
>
> ```sql
> select routine_name from information_schema.routines
> where routine_schema = 'public' and routine_name like 'rpt_%'
> order by routine_name;
> ```
>
> ถ้า RPC ของ RPT ครบตามที่ migration ประกาศไว้ = รันครบแล้ว ให้แก้สถานะในตารางนี้เป็น "รันแล้ว" ถ้าไม่ครบ = รันค้างกลางทาง ต้องรันซ้ำ (migration เขียนแบบ idempotent รันซ้ำได้ปลอดภัย)

SQL ชุดนี้คือชุดที่ใช้ตรวจ RLS กับฐานจริง **รันไปแล้วเมื่อ 22 กันยายน 2569 ผลอยู่ในข้อ 3** เก็บไว้ให้รันซ้ำทุกครั้งหลัง deploy หรือหลังแก้สิทธิ์ผ่าน Dashboard

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

ชุดที่ 1 และ 3 ต้องคืนผลว่างเสมอ ถ้าไม่ว่างแปลว่ามีช่องที่ยังไม่ปิด ส่วนชุดที่ 2 คืน `rpt_records_pii` ได้ตามปกติเพราะตั้งใจปิดตาย ถ้ามีชื่อตารางอื่นโผล่มาด้วยต้องไล่ดูทีละตัว

รัน migration ด้วย `node scripts/run-migration.mjs` (ต้องมี `SUPABASE_SERVICE_KEY` ใน `.env.local`)

---

## 5. ข้อค้างที่ทราบ

### ตามผลตรวจสิทธิ์ 22 กันยายน 2569 — ทำก่อนอย่างอื่น

- **ดู Postgres / API log ฝั่ง Supabase** `audit_logs` สะอาดแต่ไม่ครอบ REST ตรงด้วย anon key ซึ่งเป็นเส้นทางที่ช่องโหว่เปิดไว้ **ทำก่อน log หมดอายุ**
- **เข้ารหัส `interview_records_pii`** ตอนนี้เป็น plaintext ทั้งตาราง ใช้แนวเดียวกับ `rpt_records_pii` ได้ — คุ้มที่สุดในบรรดางานค้าง
- **หมุน anon key** ไม่ทราบว่า key เดิมกระจายไปถึงใครระหว่างที่ช่องเปิด
- **หาสาเหตุว่า grant ของ anon มาจากไหน** migration ไม่ได้สั่งไว้ ถ้าไม่ปิดต้นเหตุมีโอกาสหลุดกลับมา
- **ยืนยันว่า `20260918_rpt_field_entry.sql` รันครบหรือยัง** ดูหมายเหตุในข้อ 4

รายละเอียดทั้งหมดอยู่ในข้อ 3

### การจัดโครงสร้าง source

ย้าย `src/components/*` และ `src/pages/*` ไป `src/features/` กับ `src/shared/` commit แล้วเมื่อ 22 กันยายน 2569 (`7225234`) ผ่าน build และ test 41 ข้อ แต่**ยังไม่ได้ทดสอบกับฐานข้อมูลจริง** ถ้าเจอหน้าที่พังหลังจากนี้ ให้สงสัย import path ก่อนเป็นอันดับแรก

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
- **ไฟล์ Excel ใน `tmp/`** เป็นไฟล์ตัวอย่างสำหรับพัฒนา (`arrest_data`, `treatment_data`, `sample-drug-incidents`) ตรวจแล้วว่าคอลัมน์ PII ว่างทั้งหมด ไฟล์ข้อมูลจริงอยู่นอก repo ถอดออกจาก tracked แล้วเมื่อ 22 กันยายน 2569
- **`.gitignore` เคยเข้ารหัสเป็น UTF-16** git จึงอ่านกฎไม่ออกเลย กฎ `tmp/` กับ `*.xlsx` ไม่เคยมีผลจริง นั่นคือเหตุที่ไฟล์ Excel หลุดเข้า tracked แก้เป็น UTF-8 แล้ว (`837ba31`) **ถ้าแก้ `.gitignore` ด้วย editor บน Windows ให้ตรวจว่ายังเป็น UTF-8** — `git diff` ที่ขึ้นว่า `Binary files differ` คือสัญญาณว่าโดนอีกแล้ว

---

## 6. ข้อตกลงที่ต้องรักษา

1. ข้อมูลจริงไม่เข้า Git — `.gitignore` ครอบ `.env*`, `data/`, `tmp/`, `*.xlsx` แล้ว
2. service key ไม่อยู่ในตัวแปร `VITE_*` เพราะจะถูก bundle ขึ้นเว็บ
3. ไม่วางไฟล์ข้อมูลใน `public/` — Vite คัดลอกทุกไฟล์ใน `public/` ขึ้นเว็บโดยไม่ตรวจสิทธิ์ (เคยเกิดมาแล้ว แก้ใน SEC-01) `npm run build` มี `scripts/check-public-assets.mjs` คอยกันไว้
4. เพิ่มหน้าที่มี PII ต้องแก้ทั้ง React **และ** RLS/RPC ฝั่งฐานข้อมูล
5. ทดสอบนำเข้า/ส่งออกด้วยข้อมูลสมมติเสมอ
