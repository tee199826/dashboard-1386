# ส่งโค้ดและโครงสร้างฐานข้อมูลให้ทีมตรวจ

## สิ่งที่ส่งให้ทีมใน GitHub

ใช้ repository แบบ private และให้สิทธิ์อ่านเฉพาะทีมที่เกี่ยวข้อง ไม่ใช้ข้อมูล production เป็นตัวอย่าง

| ส่วน | สิ่งที่ควรส่ง |
|---|---|
| Frontend | `src/`, `index.html`, `package.json`, `package-lock.json`, `vite.config.js`, `eslint.config.js` |
| คู่มือ | `README.md`, `src/README.md`, เอกสารนี้, ขั้นตอนติดตั้งและรายการข้อจำกัดที่ยังเหลือ |
| การทดสอบ | tests ที่ยืนยันว่าใช้ข้อมูลสมมติเท่านั้น; เริ่มที่ security, complaintImport และ asyncResource |
| การ deploy | `netlify.toml`, `public/_headers`, `public/_redirects` หลังตรวจว่าไม่มี credential |
| รูปและข้อมูลสาธารณะ | assets ที่มีสิทธิ์เผยแพร่; GeoJSON/JSON ใน public ต้องตรวจว่าไม่มีพิกัดหรือรายละเอียดบุคคลจริง |
| Environment | `.env.example` ที่มีเฉพาะชื่อตัวแปรและ placeholder; ห้ามคัดลอกค่าจาก `.env.local` |
| ฐานข้อมูล | `supabase/migrations/`, `supabase/functions/`, schema-only ที่ตรวจแล้ว, ERD/data dictionary และตารางอธิบายสิทธิ์ |

`VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` เป็นค่าที่ frontend ใช้ ให้ทีมตั้งค่าของสภาพแวดล้อมทดสอบเอง ส่วน `SUPABASE_SERVICE_ROLE_KEY` อยู่ฝั่งเซิร์ฟเวอร์และไม่ใส่ใน repository

## ฐานข้อมูลต้องมีรายละเอียดอะไร

ทีมควรเห็นตาราง คอลัมน์ ชนิดข้อมูล primary/foreign keys, constraints, indexes, views, functions/RPC, triggers, grants และ RLS policies รวมถึงการเปิด RLS ของแต่ละตาราง

สำหรับข้อมูลเข้ารหัส ให้ส่งการออกแบบ ขั้นตอนจัดการกุญแจ และโค้ดฟังก์ชันที่ตรวจแล้ว ส่งเฉพาะชื่อ/วิธีอ้างอิง secret ไม่ส่งค่ากุญแจหรือ Vault secrets จริง

ถ้าต้องทดลอง flow ให้สร้างฐานข้อมูลทดสอบแยก แล้วใส่ seed ที่สร้างขึ้นใหม่ เช่น `TEST PERSON 001` และตัวระบุสมมติ ไม่คัดลอกข้อมูลจริงมาเปลี่ยนเฉพาะชื่อ เพราะเลขบัตร ที่อยู่ พิกัด และรายละเอียดอื่นยังอาจระบุบุคคลได้

## สิ่งที่พบในโปรเจกต์นี้

- มี migration 19 ไฟล์ ณ วันที่ตรวจ 23 กันยายน 2569 รวมงาน RLS, RPC, RPT และการเข้ารหัสที่เพิ่งเพิ่ม
- มี Edge Function `admin-create-user`
- ไฟล์ migration บางชื่อไม่อยู่ในรูปแบบตัวเลขตามด้วย `_` เช่น `20260922a_encrypt.sql`, `20260922b_drop_plaintext.sql`, `add_record_uid.sql` และ `create_report_114.sql` ต้องให้ผู้ดูแลยืนยันลำดับและวิธีนำไปใช้กับ migration runner
- ยังไม่ได้เชื่อมต่อฐานข้อมูลจริง จึงยังยืนยันไม่ได้ว่า migrations ใน repository ตรงกับ schema ที่ใช้งานจริงหรือสร้างระบบใหม่ได้ครบตั้งแต่ฐานข้อมูลว่าง ห้ามใช้เอกสารนี้เป็นคำสั่งให้รัน migrations ทั้งหมดกับ production
- `.env.example` มีอยู่แล้ว แต่ไม่ได้เปิดอ่านในการตรวจนี้ ต้องตรวจค่าภายในก่อนส่ง
- `test/rptParser.test.mjs` และ `test/rptExportSheet.test.mjs` ยังไม่ได้ตรวจยืนยันว่า fixtures เป็นข้อมูลสมมติทั้งหมด จึงไม่รวมในการรันทดสอบแบบปลอดข้อมูลจริงครั้งนี้ ต้องให้เจ้าของข้อมูลตรวจหรือแทนด้วยข้อมูลสมมติก่อนแชร์
- ไฟล์ GeoJSON/JSON ใน `public/` ไม่ได้เปิดอ่านข้อมูลภายในในการตรวจนี้ จึงยังไม่รับรองว่าเผยแพร่ได้ทั้งหมด

## วิธีขอ schema จากผู้ดูแลฐานข้อมูล

ให้ DBA ส่ง **schema-only** ของ application schemas พร้อม custom RLS/policies/functions ที่เกี่ยวข้อง โดยไม่มีแถวข้อมูล ตัวอย่าง CLI ของ Supabase ต่อไปนี้เป็นขั้นตอนสำหรับผู้ดูแลที่ตรวจปลายทางแล้วเท่านั้น ไม่ได้รันในงานนี้:

```sh
supabase db dump --linked --file schema-review.sql
```

ตามเอกสาร Supabase คำสั่ง dump ปกติส่งออก schema; ตัวเลือก `--data-only` ใช้ส่งออกข้อมูล จึงไม่ใช้ตัวเลือกนั้นกับชุดตรวจโค้ด ตรวจ schema ที่ถูกยกเว้นและ customizations ใน auth/storage ตามรุ่น CLI ด้วย อย่าถือว่า dump ไฟล์เดียวครอบคลุมทุกส่วน และตรวจ function bodies/default values/comments ว่าไม่มี secret ฝังก่อน commit

อ้างอิง: [Supabase local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows)

## ห้ามส่ง

- `.env`, `.env.local`, รหัสผ่านฐานข้อมูล, connection strings ที่มีรหัสผ่าน, access/refresh tokens และ service-role key
- กุญแจเข้ารหัส, Vault secret values และไฟล์สำรอง plaintext
- Database dump ที่มีข้อมูลจริง, auth users/sessions, audit logs, Excel/CSV ต้นฉบับ, ข้อมูลบุคคลหรือพิกัดรายบุคคล
- `node_modules/`, `dist/`, `tmp/`, `private-data/` และ cache ของเครื่องมือ

ก่อน push ตรวจทั้ง diff ที่จะส่งและประวัติ Git เพราะ `.gitignore` ไม่เอาข้อมูลที่เคย commit ออกจากประวัติ และอย่าใช้ `git add .` โดยไม่ตรวจรายการไฟล์ ถ้าเคยมี credential รั่ว ให้เพิกถอนหรือหมุนกุญแจก่อน พร้อมจัดการประวัติที่มีข้อมูลอ่อนไหวตามขั้นตอนของทีม

อ้างอิง: [GitHub: remediating a leaked secret](https://docs.github.com/en/code-security/tutorials/remediate-leaked-secrets/remediating-a-leaked-secret)

## ผลตรวจโค้ดรอบนี้

- รวม lifecycle การโหลดข้อมูลและป้องกันผลตอบกลับเก่าไว้ใน `useAsyncResource`
- รวม context/consumer hooks, hero chip, วันที่ และรูปแบบหัวตาราง Excel ที่ซ้ำกัน
- ลบ import/ตัวแปรที่ไม่ใช้ และรวมไฟล์เล็กที่ใช้เฉพาะจุดกลับเข้ากับโมดูลที่เกี่ยวข้อง
- Lint source: 0 errors / 0 warnings; offline production build ผ่าน
- Tests ข้อมูลสมมติ 15 ข้อผ่าน รวมการโหลดสลับลำดับ การยกเลิก และ retry
- เปรียบเทียบผลสรุปรายงาน 5 กรณีและรูปแบบหัวตาราง Excel 3 แบบกับโค้ดเดิมผ่าน
- ตรวจว่า authentication, route guards, RPC สัมภาษณ์ และ security helpers เดิมยังอยู่ครบ

ยังมีคำเตือน build เรื่อง bundle ขนาดใหญ่และ dynamic import ที่ไม่แยก chunk ไม่ได้ทดสอบ end-to-end กับฐานข้อมูลจริง และไม่ได้รับรองความปลอดภัยทั้งระบบจาก lint/build/tests เหล่านี้
