// Badge แสดงช่วงเวลาของข้อมูลในการ์ด/กราฟ — ใช้ซ้ำทุกหน้า public dashboard
// tone='light' (พื้นขาว → เทาจาง) | tone='dark' (พื้นการ์ดสีเข้ม → ขาวจาง)
export default function PeriodBadge({ period, tone = 'light', className = '' }) {
  if (!period) return null
  const color = tone === 'dark' ? 'text-white/70' : 'text-gray-500'
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${color} whitespace-nowrap ${className}`}>
      📅 ข้อมูลระหว่างวันที่: {period}
    </span>
  )
}
