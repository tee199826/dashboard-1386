// type shim ของ Deno runtime สำหรับ editor ที่ไม่มี Deno extension (Supabase Edge Functions รันบน Deno)
// ประกาศเฉพาะ API ที่ฟังก์ชันในโฟลเดอร์นี้ใช้ — ถ้าใช้ API เพิ่ม ให้เติมตรงนี้
declare namespace Deno {
  const env: { get(name: string): string | undefined }
  function serve(handler: (req: Request) => Response | Promise<Response>): void
}
