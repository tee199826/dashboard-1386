// Badge แสดงช่วงเวลาของข้อมูล — สั้น, เทาจาง, ไม่แย่งสายตา
// tone='light' (พื้นขาว → เทาจาง) | tone='dark' (พื้นการ์ดสีเข้ม → ขาวจาง)
export default function PeriodBadge({ period, tone = 'light', className = '' }) {
  if (!period) return null
  const color = tone === 'dark' ? 'text-white/70' : 'text-gray-500'
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${color} whitespace-nowrap ${className}`}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60 flex-shrink-0">
        <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
      {period}
    </span>
  )
}
