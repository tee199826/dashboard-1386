// Edge Function: admin-create-user (SEC-04)
//
// เดิม /admin/users เรียก supabase.auth.signUp() จากเบราว์เซอร์พร้อม options.data.role — user metadata
// เป็นค่าที่ผู้สมัครควบคุมได้ จึงใช้กำหนดสิทธิ์ไม่ได้ และ signUp ด้วย client เดียวกับแอดมินอาจสลับ session
//
// ฟังก์ชันนี้:
//   1) ตรวจ JWT ของผู้เรียก (anon-key client + Authorization header) → ต้องเป็นแอดมินตาม profiles.role
//   2) สร้างผู้ใช้ด้วย service role (auth.admin.createUser) — คีย์อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น
//   3) กำหนด role ใน profiles จากฝั่งเซิร์ฟเวอร์ (trigger handle_new_user ตั้ง 'user' ไว้ก่อนเสมอ)
//   4) บันทึก audit_logs ด้วย service role โดยผูก actor จาก JWT ที่ตรวจแล้ว
//
// Deploy:  supabase functions deploy admin-create-user
// Env ที่ Supabase ใส่ให้อัตโนมัติใน runtime: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_ROLES = new Set(['user', 'admin'])
const MIN_PASSWORD = 8

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' })

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceKey) return json(500, { error: 'server misconfigured' })

  // 1) ตัวตนผู้เรียก — ใช้ anon client + JWT ของผู้เรียก ให้ RLS/is_admin() ตัดสินเอง
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'unauthorized' })
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user: actor }, error: actorErr } = await caller.auth.getUser()
  if (actorErr || !actor) return json(401, { error: 'unauthorized' })
  const { data: isAdmin, error: adminErr } = await caller.rpc('is_admin')
  if (adminErr || isAdmin !== true) return json(403, { error: 'forbidden' })

  // 2) ตรวจ input
  let body: { email?: string; password?: string; full_name?: string; role?: string }
  try { body = await req.json() } catch { return json(400, { error: 'invalid json' }) }
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  const fullName = String(body.full_name ?? '').trim() || null
  const role = String(body.role ?? 'user')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'invalid email' })
  if (password.length < MIN_PASSWORD) return json(400, { error: `password must be at least ${MIN_PASSWORD} characters` })
  if (!ALLOWED_ROLES.has(role)) return json(400, { error: 'invalid role' })

  // 3) สร้างผู้ใช้ + ตั้ง role ด้วย service role (ไม่ผ่าน metadata)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: fullName },
  })
  if (createErr || !created.user) return json(400, { error: createErr?.message ?? 'create failed' })

  // trigger handle_new_user สร้างแถว profiles (role='user') แล้ว → upsert ให้ครบและตั้ง role ที่ต้องการ
  const { error: profErr } = await admin.from('profiles')
    .upsert({ id: created.user.id, email, full_name: fullName, role }, { onConflict: 'id' })
  if (profErr) {
    // กันบัญชีค้างแบบไม่มี profile/สิทธิ์ผิด — ลบผู้ใช้ที่เพิ่งสร้างแล้วรายงาน error
    await admin.auth.admin.deleteUser(created.user.id)
    return json(500, { error: 'profile setup failed: ' + profErr.message })
  }

  // 4) audit ฝั่งเซิร์ฟเวอร์ — actor จาก JWT ที่ตรวจแล้ว (ไม่รับจาก body)
  await admin.from('audit_logs').insert({
    user_id: actor.id, user_email: actor.email, action: 'create', resource: 'profiles',
    resource_id: created.user.id, details: { email, role },
    user_agent: req.headers.get('user-agent'),
  })

  return json(200, { id: created.user.id, email, role })
})
