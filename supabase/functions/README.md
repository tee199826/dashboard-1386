# Supabase Edge Functions

| ฟังก์ชัน | ใช้โดย | หน้าที่ |
|---|---|---|
| `admin-create-user` | `/admin/users` (UserManagement.jsx) | สร้างบัญชี + กำหนด role ฝั่งเซิร์ฟเวอร์ (SEC-04) |

```sh
supabase functions deploy admin-create-user
```

- Secrets `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` ถูกใส่ให้อัตโนมัติใน runtime — ไม่ต้องตั้งเอง และ **ห้าม** ใส่ service role key ในตัวแปร `VITE_*`
- ต้องรัน `supabase/migrations/20260915_security_baseline.sql` ก่อน (ใช้ `is_admin()`, `profiles`, `audit_logs`, trigger `handle_new_user`)
- ทดสอบ: ผู้ใช้ role `user` เรียกต้องได้ 403; ไม่ส่ง JWT ต้องได้ 401; แอดมินสร้าง user แล้ว session ของแอดมินต้องไม่เปลี่ยน
