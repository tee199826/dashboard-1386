import { useState } from 'react'
import { supabase } from '../../shared/data/supabase.js'
import { X } from 'lucide-react'
import { ConfirmModal } from '../../shared/ui/ConfirmModal.jsx'

export function AddUserModal({ onClose, onAdded, showToast }) {
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
      // สร้างผ่าน Edge Function (service role ฝั่งเซิร์ฟเวอร์) — ไม่ใช้ auth.signUp จากเบราว์เซอร์ (SEC-04):
      // role ถูกกำหนดฝั่งเซิร์ฟเวอร์หลังตรวจว่าผู้เรียกเป็นแอดมิน และ session ของแอดมินไม่ถูกสลับ
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: { email, password, full_name: fullName, role },
      })
      if (error) {
        // FunctionsHttpError → อ่านข้อความจาก body ของฟังก์ชัน (เช่น 403 forbidden / invalid email)
        const detail = await error.context?.json?.().catch(() => null)
        throw new Error(detail?.error || error.message)
      }
      if (data?.error) throw new Error(data.error)
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
            <label className="block text-sm font-medium text-slate-700 mb-1">รหัสผ่าน (อย่างน้อย 8 ตัว)</label>
            <input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)}
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
