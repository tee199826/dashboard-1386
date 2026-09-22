import { useEffect, useState } from 'react'
import { supabase } from "../../shared/data/supabase.js"
import { UserPlus, Users as UsersIcon } from "lucide-react"
import Toast from "../../shared/ui/Toast.jsx"
import { AddUserModal } from "./AddUserModal.jsx"

export default function UserManagement() {
  const [users, setUsers] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const showToast = (message, type = 'success') => setToast({ message, type })

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('profiles').select('*').order('created_at', { ascending: false })
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="p-6 md:p-8 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <UsersIcon size={24} className="text-blue-600" /> จัดการผู้ใช้งาน
          </h1>
          <p className="text-sm text-slate-500 mt-1">{users.length} คน</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2">
          <UserPlus size={14} /> เพิ่มผู้ใช้
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">กำลังโหลด...</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-[480px] w-full">
            <thead className="bg-slate-50 text-xs text-slate-600 uppercase">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">อีเมล</th>
                <th className="text-left px-5 py-3 font-semibold">ชื่อ</th>
                <th className="text-left px-5 py-3 font-semibold">สิทธิ์</th>
                <th className="text-left px-5 py-3 font-semibold">สร้างเมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-5 py-3 text-sm">{u.email}</td>
                  <td className="px-5 py-3 text-sm">{u.full_name || '-'}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      u.role === 'admin' ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-700'
                    }`}>
                      {u.role === 'admin' ? '👑 Admin' : '👤 User'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">
                    {new Date(u.created_at).toLocaleDateString('th-TH')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onAdded={() => { load(); setShowAdd(false) }}
          showToast={showToast}
        />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
