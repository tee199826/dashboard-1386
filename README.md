# Dashboard 1386

เว็บสำนักงานสำหรับแสดงสถิติและจัดการงานร้องเรียน สถานการณ์ยาเสพติด แผนที่ รายงาน และข้อมูลการสัมภาษณ์

## เทคโนโลยี

- React และ React Router: หน้าจอและการเปลี่ยนหน้า
- Vite: development server และ build
- Tailwind CSS: รูปแบบหน้าจอ
- Supabase: authentication, PostgreSQL, RPC และ Edge Functions
- Leaflet / React Leaflet, D3 และ Turf: แผนที่และการประมวลผลพื้นที่
- Recharts: กราฟ
- SheetJS และ ExcelJS: อ่านและส่งออก Excel

ดูรุ่น dependency ที่ใช้งานจริงใน `package.json` และ `package-lock.json`

## เริ่มอ่านโค้ด

- `src/main.jsx`: จุดเริ่มต้น
- `src/app/App.jsx`: providers และ routes
- `src/features/`: หน้าจอและ logic แยกตามงาน
- `src/shared/`: UI, state, data, security และเครื่องมือที่ใช้ร่วมกัน
- [แผนผัง source และหลักการเพิ่มโค้ด](src/README.md)
- `supabase/`: โค้ดฝั่งฐานข้อมูลและ Edge Functions
- `scripts/`: เครื่องมือตรวจและจัดการโปรเจกต์
- `test/`: ชุดทดสอบ

## เริ่มต้นใช้งาน

ต้องมี Node.js 20 ขึ้นไป (โปรเจกต์ทดสอบบน Node 24)

```bash
npm ci                      # ติดตั้ง dependency ตาม lockfile
cp .env.example .env.local  # แล้วเติมค่าจริงที่ขอจากผู้ดูแล
npm run dev                 # เปิด dev server
```

`.env.local` ถูก gitignore ไว้แล้ว — ห้าม commit และห้ามใส่ service key ในตัวแปรที่ขึ้นต้นด้วย `VITE_` เพราะตัวแปรเหล่านั้นถูก bundle ขึ้นเว็บ

ผู้เข้าร่วมทีมใหม่อ่าน [docs/HANDOFF.md](docs/HANDOFF.md) เพื่อดูโครงสร้างระบบ ตารางที่มีข้อมูลส่วนบุคคล migration ที่ยังไม่ได้รัน และข้อค้างที่ทราบ

## คำสั่ง

| คำสั่ง | หน้าที่ |
|---|---|
| `npm ci` | ติดตั้ง dependency ตาม lockfile |
| `npm run dev` | เปิด development server |
| `npm run build` | ตรวจ public assets แล้วสร้าง production bundle |
| `npm run preview` | เปิดดู bundle ที่ build แล้ว |
| `npm run lint` | ตรวจโค้ดและกฎการอ้างอิงระหว่างหมวด |
| `npm test` | รันชุดทดสอบของโปรเจกต์ |

ใช้ configuration สำหรับสภาพแวดล้อมทดสอบที่ผู้ดูแลจัดให้ และตรวจปลายทาง Supabase ก่อนเปิด dev server อย่าใช้ข้อมูลจริงเพื่อทดลองแก้โค้ดโดยไม่จำเป็น

## หลักการดูแลข้อมูล

- ไม่ใส่ไฟล์ environment, กุญแจ หรือข้อมูลบุคคลจริงลง Git
- ห้ามใส่ service-role key ใน frontend
- การซ่อนเมนูหรือป้องกัน route ฝั่ง React ต้องทำควบคู่กับสิทธิ์ฐานข้อมูล/RPC/Edge Function
- ไฟล์ภายใต้ `public/` อาจถูกเผยแพร่พร้อมเว็บ จึงไม่ใช่ที่เก็บข้อมูลส่วนบุคคลหรือไฟล์รายงานต้นฉบับ
- ทดสอบการนำเข้า/ส่งออกด้วยข้อมูลสมมติ และตรวจข้อจำกัดไฟล์ก่อนอ่านข้อมูล

## สถานะการจัดโครงสร้าง 22 กันยายน 2569

ย้าย source ตามฟีเจอร์และปรับ import โดยตรวจ syntax tree ว่า logic เดิมยังอยู่ครบ ผ่าน offline build และการทดสอบข้อมูลสมมติ 8 ข้อ การตรวจ lint ทั้ง source ยังมีข้อผิดพลาดเดิม 31 จุดและคำเตือนเดิม 6 จุด จึงยังไม่ถือว่า lint ผ่านทั้งหมด ไม่ได้ทดสอบกับฐานข้อมูลจริงหรือรับรองความปลอดภัยทั้งระบบ
