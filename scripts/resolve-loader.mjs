// dev-only ESM hook: ให้ node resolve relative import แบบไม่มีนามสกุล (เหมือน Vite)
// ใช้เฉพาะตอนรัน test script ผ่าน node — ไม่กระทบ build จริง (Vite resolve เอง)
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[cm]?jsx?$/.test(specifier)) {
    try { return await next(specifier + '.js', context) } catch { /* fallthrough */ }
  }
  return next(specifier, context)
}
