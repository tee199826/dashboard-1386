import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { UserPlus, Users as UsersIcon, X } from 'lucide-react'
import Toast from '../components/Toast'

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

function ConfirmModal({ title, message, detail, onConfirm, onCancel, confirmLabel = 'ยืนยัน', danger = false }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className={`px-6 py-4 border-b ${danger ? 'bg-rose-50 border-rose-100' : 'bg-amber-50 border-amber-100'}`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{danger ? '🗑️' : '⚠️'}</span>
            <h3 className={`font-bold text-base ${danger ? 'text-rose-800' : 'text-amber-800'}`}>{title}</h3>
          </div>
        </div>
        <div className="px-6 py-5">
          <p className="text-slate-700 text-sm leading-relaxed">{message}</p>
          {detail && <p className="text-xs text-slate-500 mt-2 leading-relaxed">{detail}</p>}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-sm font-medium transition">
            ยกเลิก
          </button>
          <button onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition ${
              danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddUserModal({ onClose, onAdded, showToast }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('user')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const doSubmit = async () => {
    setError('')
    setBusy(true)
    try {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName, role } },
      })
      if (error) throw error
      showToast?.(`เพิ่มผู้ใช้ "${email}" สำเร็จ`)
      onAdded()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setConfirmOpen(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <span className="font-bold text-slate-800">เพิ่มผู้ใช้ใหม่</span>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">อีเมล</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อ-นามสกุล</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">รหัสผ่าน (อย่างน้อย 6 ตัว)</label>
            <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">สิทธิ์</label>
            <select value={role} onChange={e => setRole(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
              <option value="user">User (ดูได้อย่างเดียว)</option>
              <option value="admin">Admin (จัดการได้)</option>
            </select>
          </div>
          {error && <div className="bg-rose-50 text-rose-700 p-3 rounded-lg text-sm">{error}</div>}
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-sm">ยกเลิก</button>
            <button type="submit" disabled={busy}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
              {busy ? 'กำลังบันทึก...' : 'เพิ่มผู้ใช้'}
            </button>
          </div>
        </form>
      </div>
      {confirmOpen && (
        <ConfirmModal
          title="ยืนยันการสร้างบัญชีผู้ใช้"
          message={`ต้องการสร้างบัญชีสำหรับ "${email}" ใช่หรือไม่?`}
          detail={`ชื่อ: ${fullName || '-'} · สิทธิ์: ${role === 'admin' ? '👑 Admin' : '👤 User'}`}
          onConfirm={() => { setConfirmOpen(false); doSubmit() }}
          onCancel={() => setConfirmOpen(false)}
          confirmLabel="สร้างบัญชี"
        />
      )}
    </div>
  )
}
