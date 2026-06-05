import { X } from 'lucide-react'

export default function OperationsSourceModal({ onClose, totalCases, completed, filteredCount, percent }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="bg-blue-700 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">📊</div>
            <div>
              <h2 className="text-base font-semibold">ที่มาของข้อมูล</h2>
              <p className="text-xs text-blue-200">Data Sources Explanation</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
            <h3 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
              <span>📊</span> 1. รายงานทางการ (RPT_114)
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              <strong>รายงานการดำเนินการตามข้อร้องเรียน (Report ID: 114)</strong>
              จากระบบ ป.ป.ส. — เป็นสถิติสรุปที่เป็นตัวเลขทางการสำหรับการรายงาน
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white p-2 rounded">
                <span className="text-slate-500">รวมทั้งหมด</span>
                <div className="font-bold text-blue-700">{totalCases.toLocaleString()} เรื่อง</div>
              </div>
              <div className="bg-white p-2 rounded">
                <span className="text-slate-500">ดำเนินการแล้ว</span>
                <div className="font-bold text-emerald-700">{completed.toLocaleString()} ({percent(completed, totalCases)})</div>
              </div>
            </div>
            <div className="mt-2 text-xs text-blue-700">✓ ใช้สำหรับ: 5 Cards บนสุด, ตารางผลพฤติการณ์/ผลดำเนินการ</div>
          </div>

          <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg">
            <h3 className="font-bold text-amber-900 mb-2 flex items-center gap-2">
              <span>📁</span> 2. ข้อมูล Export Records
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              <strong>ไฟล์รายเรื่องที่ export จากระบบ ป.ป.ส.</strong> — มีรายละเอียดทุก case
              (วันที่, เขต, แขวง, ช่องทาง, สถานะ ฯลฯ) ใช้สำหรับการวิเคราะห์เชิงลึก
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white p-2 rounded">
                <span className="text-slate-500">รวม</span>
                <div className="font-bold text-amber-700">{filteredCount.toLocaleString()} records</div>
              </div>
              <div className="bg-white p-2 rounded">
                <span className="text-slate-500">ช่องทางหลัก</span>
                <div className="font-bold text-amber-700">6 ช่องทาง</div>
              </div>
            </div>
            <div className="mt-2 text-xs text-amber-700">✓ ใช้สำหรับ: Sources Overview, กราฟ, ตารางช่องทาง</div>
          </div>

          <div className="bg-slate-100 border border-slate-200 p-4 rounded-lg">
            <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
              <span>💡</span> ทำไมตัวเลขต่างกัน?
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              ทั้ง 2 แหล่งมาจาก ป.ป.ส. แต่ <strong>RPT_114 รวมทุก case</strong> ในระบบ
              ส่วน <strong>Export Records เป็น subset</strong> ที่ส่งออกเป็นไฟล์รายเรื่อง
              (ต่างกัน ~6 records — เป็นเรื่องปกติ)
            </p>
            <p className="text-sm text-slate-700 leading-relaxed mt-2">
              <strong>หลักการ:</strong> ใช้ RPT_114 สำหรับนำเสนอ/รายงาน · ใช้ Records สำหรับวิเคราะห์เชิงลึก
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}