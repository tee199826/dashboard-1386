import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { RefreshCw } from 'lucide-react'

const ACTION_LABELS = {
  login:  { l: 'เข้าสู่ระบบ',   c: 'bg-emerald-50 text-emerald-700' },
  logout: { l: 'ออกจากระบบ',    c: 'bg-slate-50 text-slate-700' },
  view:   { l: 'ดูข้อมูล',       c: 'bg-sky-50 text-sky-700' },
  create: { l: 'เพิ่มข้อมูล',    c: 'bg-blue-50 text-blue-700' },
  update: { l: 'แก้ไขข้อมูล',   c: 'bg-amber-50 text-amber-700' },
  delete: { l: 'ลบข้อมูล',       c: 'bg-rose-50 text-rose-700' },
}

export default function AuditLogs() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('audit_logs').select('*').order('created_at', { ascending: false }).limit(500)
    setLogs(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const formatTime = ts =>
    new Date(ts).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto bg-slate-50 min-h-screen space-y-8" style={{ fontFamily: 'Sarabun, sans-serif' }}>
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-blue-800 rounded-2xl px-6 pt-8 pb-10 text-white shadow-2xl overflow-hidden relative">
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-blue-300 mb-3">บันทึกการใช้งานระบบ · Audit Trail</div>
            <h1 className="text-3xl lg:text-4xl font-extrabold leading-tight">ประวัติการใช้งาน</h1>
            <p className="text-sm text-blue-200 mt-3">บันทึก 500 รายการล่าสุด · ติดตามการเข้าถึงและแก้ไขข้อมูล</p>
          </div>
          <button onClick={load} className="px-5 py-2.5 bg-white text-blue-800 hover:bg-blue-50 rounded-xl font-bold flex items-center gap-2 transition shadow-lg flex-shrink-0 text-sm">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> รีเฟรช
          </button>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-400 via-sky-300 to-blue-600 opacity-75" />
      </div>

      <div className="bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">กำลังโหลด...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-slate-500">ยังไม่มีบันทึก</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-[600px] w-full">
            <thead className="bg-slate-800 text-xs text-white uppercase">
              <tr>
                <th className="text-left px-5 py-4 font-bold">เวลา</th>
                <th className="text-left px-5 py-4 font-bold">ผู้ใช้</th>
                <th className="text-left px-5 py-4 font-bold">การกระทำ</th>
                <th className="text-left px-5 py-4 font-bold">รายการ</th>
                <th className="text-left px-5 py-4 font-bold">รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const action = ACTION_LABELS[log.action] || { l: log.action, c: 'bg-slate-50 text-slate-700' }
                return (
                  <tr key={log.id} className="border-t border-slate-100 odd:bg-slate-50/40 hover:bg-blue-50/30 transition">
                    <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">{formatTime(log.created_at)}</td>
                    <td className="px-5 py-4 text-sm font-medium text-slate-800">{log.user_email}</td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${action.c}`}>{action.l}</span>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      {log.resource ? `${log.resource}${log.resource_id ? ' #' + log.resource_id : ''}` : '-'}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500 max-w-xs truncate">
                      {log.details ? JSON.stringify(log.details) : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}
