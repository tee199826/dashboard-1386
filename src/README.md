# แผนผัง Source Code

เริ่มอ่านที่ `main.jsx` → `app/App.jsx` ซึ่งประกอบ providers และกำหนด routes

```text
src/
  app/                 เส้นทางและโครงหน้าแอป
    layout/            Header, Sidebar และ MainLayout
  features/            โค้ดเฉพาะงาน เก็บหน้าและส่วนย่อยไว้ด้วยกัน
    admin/             เข้าระบบ ผู้ใช้งาน และ audit logs
    overview/          ภาพรวม
    districts/         สถิติรายเขต
    bkn/               รายงาน บก.น.
    complaints/        เรื่องร้องเรียน ตาราง และฟอร์ม
    situation/         สถานการณ์ จับกุม และบำบัด
    intelligence/      แบบสัมภาษณ์และข้อมูลผู้เสพ
    pixel-map/         แผนที่แบบเลือกพื้นที่
    radar/             แผนที่เรดาร์
    operations/        ผลการปฏิบัติงาน
    rpt/               แบบรายงาน RPT
    upload/            ตรวจ แปลง และนำเข้าไฟล์
  shared/              ส่วนที่หลายหน้าหรือโครงสร้างพื้นฐานใช้ร่วมกัน
    ui/                Dialog, Toast และส่วนแสดงผลร่วม
    state/             Auth, Data, Filter และ Presentation providers
    security/          Route guard, escape HTML, ข้อจำกัดอัปโหลด และ draft cleanup
    data/              Supabase client, pagination และตัวโหลดข้อมูลร่วม
    filters/           ตัวกรองและตัวเลือกพื้นที่
    geo/               ข้อมูลพื้นที่และส่วนแผนที่ที่ใช้ร่วมกัน
    export/            เครื่องมือส่งออกรายงาน
    utils/             วันที่ ค่าคงที่ และรูปแบบแสดงผลทั่วไป
  assets/              รูปประกอบของแอป
  main.jsx             จุดเริ่มต้น React
  index.css            CSS ส่วนกลาง
```

## วิธีวางโค้ดใหม่

1. โค้ดที่ใช้ในฟีเจอร์เดียวให้อยู่ในโฟลเดอร์ฟีเจอร์นั้น ไม่สร้าง `pages/components/utils` ซ้อนกันโดยไม่มีความจำเป็น
2. ย้ายไป `shared` เมื่อมีผู้ใช้ร่วมจริง หรือเป็นหน้าที่ส่วนกลาง เช่น การเชื่อมต่อฐานข้อมูลและการตรวจสิทธิ์
3. `shared` ห้าม import จาก `features` หรือ `app`; `features` ห้าม import จาก `app` มีกฎ ESLint ช่วยตรวจ
4. ใช้ import ตรงไปยังไฟล์ และระบุนามสกุล หลีกเลี่ยง `index.js` ที่ re-export ทุกอย่าง เพราะทำให้ไล่ผู้เรียกใช้ยาก
5. แยกไฟล์เมื่อมีหน้าที่ที่เข้าใจและทดสอบได้เอง ไม่แยกเพียงเพื่อลดจำนวนบรรทัด และไม่รวมเพียงเพื่อลดจำนวนไฟล์
6. รักษา public API ของส่วนที่ใช้ร่วมกัน ถ้าย้ายไฟล์ให้แก้ import ใน source, test และ scripts พร้อมกัน

## จุดที่ต้องรักษาด้านข้อมูลและความปลอดภัย

- `shared/security/ProtectedRoute.jsx` เป็น guard ฝั่งหน้าจอ; สิทธิ์ข้อมูลจริงยังต้องบังคับด้วย RLS, RPC และ Edge Function ฝั่งเซิร์ฟเวอร์
- `shared/data/supabase.js` รวม client ไว้แห่งเดียว ห้ามฝัง service-role key ใน frontend
- การสร้างผู้ใช้ใน `features/admin/AddUserModal.jsx` เรียก `admin-create-user` ฝั่งเซิร์ฟเวอร์
- งานสัมภาษณ์ใน `features/intelligence/InterviewSearch.jsx` ต้องคงการเรียก RPC และรูปแบบการเปิดเผยข้อมูลตามสิทธิ์
- ใช้ `shared/security/uploadLimits.js` ก่อนอ่านไฟล์ และใช้ `escapeHtml.js` ในจุดสร้าง HTML ที่ต้อง escape
- ใช้ข้อมูลสมมติในการทดสอบ ไม่คัดลอกข้อมูลส่วนบุคคลลง fixtures หรือเอกสารโค้ด

## คำสั่งของโปรเจกต์

`npm run dev`, `npm run build`, `npm run lint`, `npm test`

ตรวจ configuration ก่อนรัน dev เพราะอาจชี้ไปฐานข้อมูลจริง การจัดโครงสร้างนี้ตรวจด้วย offline build และชุดทดสอบข้อมูลสมมติ ไม่ใช่การยืนยันว่า production ปลอดช่องโหว่ทั้งหมด


## ส่วนกลางหลัง clean code

- `shared/state/contexts.js` รวม context objects และ consumer hooks; provider components อยู่ในไฟล์ JSX ตามหน้าที่
- `shared/data/useAsyncResource.js` รวมสถานะโหลด ข้อผิดพลาด การยกเลิก และการกันคำตอบจากคำขอเก่า; แต่ละ consumer มี state แยกกัน
- `features/situation/arrestData.js` รวม hook โหลดข้อมูลจับกุมกับตัวช่วยจัดการข้อมูลในฟีเจอร์เดียวกัน
- `shared/geo/IncidentMap.jsx` เก็บตัวสร้าง mask ที่ใช้เฉพาะแผนที่นี้ไว้ภายใน
