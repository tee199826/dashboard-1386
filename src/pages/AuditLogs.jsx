import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ScrollText, RefreshCw } from 'lucide-react'

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
    <div className="p-6 md:p-8 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ScrollText size={24} className="text-blue-600" /> ประวัติการใช้งาน
          </h1>
          <p className="text-sm text-slate-500 mt-1">บันทึก 500 รายการล่าสุด</p>
        </div>
        <button onClick={load}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2">
          <RefreshCw size={14} /> รีเฟรช
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">กำลังโหลด...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-slate-500">ยังไม่มีบันทึก</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-[600px] w-full">
            <thead className="bg-slate-50 text-xs text-slate-600 uppercase">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">เวลา</th>
                <th className="text-left px-5 py-3 font-semibold">ผู้ใช้</th>
                <th className="text-left px-5 py-3 font-semibold">การกระทำ</th>
                <th className="text-left px-5 py-3 font-semibold">รายการ</th>
                <th className="text-left px-5 py-3 font-semibold">รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const action = ACTION_LABELS[log.action] || { l: log.action, c: 'bg-slate-50 text-slate-700' }
                return (
                  <tr key={log.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-5 py-3 text-sm text-slate-600 whitespace-nowrap">{formatTime(log.created_at)}</td>
                    <td className="px-5 py-3 text-sm font-medium text-slate-800">{log.user_email}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${action.c}`}>{action.l}</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-700">
                      {log.resource ? `${log.resource}${log.resource_id ? ' #' + log.resource_id : ''}` : '-'}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500 max-w-xs truncate">
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
