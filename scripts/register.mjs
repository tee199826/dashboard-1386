// register ESM resolve hook (สำหรับรัน test script ผ่าน node)
import { register } from 'node:module'
register('./resolve-loader.mjs', import.meta.url)
