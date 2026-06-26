// รัน SQL migration ผ่าน Supabase Management API (ต้องมี SUPABASE_ACCESS_TOKEN = PAT)
// ใช้: node scripts/run-migration.mjs supabase/migrations/<file>.sql
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function env(k) {
  const t = readFileSync(join(ROOT, '.env.local'), 'utf8')
  const m = t.match(new RegExp('^' + k + '=(.*)$', 'm'))
  return m ? m[1].trim() : null
}

const PAT = env('SUPABASE_ACCESS_TOKEN')
const url = env('VITE_SUPABASE_URL') || ''
const ref = (url.match(/https:\/\/([a-z0-9]+)/) || [])[1]
const sqlPath = process.argv[2]

if (!PAT) { console.error('✗ ไม่พบ SUPABASE_ACCESS_TOKEN ใน .env.local (Personal Access Token)'); process.exit(1) }
if (!ref) { console.error('✗ หา project ref จาก VITE_SUPABASE_URL ไม่ได้'); process.exit(1) }
if (!sqlPath) { console.error('✗ ใช้: node scripts/run-migration.mjs <file.sql>'); process.exit(1) }

const sql = readFileSync(join(ROOT, sqlPath), 'utf8')
console.log(`รัน ${sqlPath} → project ${ref} (Management API)...\n`)

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
})
const body = await res.text()
if (!res.ok) { console.error(`✗ HTTP ${res.status}\n`, body); process.exit(1) }
console.log('✓ migration สำเร็จ')
try { const j = JSON.parse(body); if (Array.isArray(j) && j.length) console.log(JSON.stringify(j, null, 2)) } catch { /* DDL ไม่คืน rows */ }
