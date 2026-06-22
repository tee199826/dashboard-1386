import { defineConfig } from 'vite'
import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// build info (commit hash + date) สำหรับ /admin System Info
let buildHash = 'unknown', buildDate = ''
try { buildHash = execSync('git rev-parse --short HEAD').toString().trim() } catch { /* ไม่อยู่ใน git */ }
try { buildDate = execSync('git log -1 --format=%cd --date=format:%Y-%m-%d').toString().trim() } catch { /* ไม่อยู่ใน git */ }

export default defineConfig({
  define: {
    __BUILD_HASH__: JSON.stringify(buildHash),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  plugins: [
    tailwindcss(),
    react(),
  ],
})
