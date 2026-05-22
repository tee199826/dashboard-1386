import { LogOut, LogIn } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import logoOncb from '../assets/logo-oncb.png'

export default function Header() {
  const { user, profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <header className="bg-gradient-to-r from-slate-900 via-blue-900 to-blue-800 text-white shadow-lg min-w-0 w-full">
      <div className="w-full px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-0">
          {/* โลโก้ + 1386 Dashboard */}
          <div className="flex items-center gap-3 pr-5 border-r border-white/30">
            <img
              src={logoOncb}
              alt="ป.ป.ส."
              className="w-11 h-11 object-contain"
              style={{ mixBlendMode: 'screen' }}
            />
            <div className="leading-tight">
              <div className="text-2xl font-bold">1386</div>
              <div className="text-xs text-blue-200">Dashboard</div>
            </div>
          </div>
          {/* ชื่อระบบ */}
          <div className="pl-5">
            <h1 className="text-base font-semibold leading-tight">ระบบแสดงผลและบริหารการจัดการข้อมูลเรื่องร้องเรียนยาเสพติด 1386</h1>
            <p className="text-xs text-blue-200 mt-0.5">สรุปผลการดำเนินงาน – สำนักงานป้องกันและปราบปรามยาเสพติด (ป.ป.ส.) กรุงเทพมหานคร</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <div className="text-right text-sm">
                <div className="font-semibold">{profile?.full_name || user.email}</div>
                <div className="text-xs text-blue-200">{isAdmin ? '👑 ผู้ดูแลระบบ' : '👤 ผู้ใช้งาน'}</div>
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 transition flex items-center gap-2 text-sm font-medium"
              >
                <LogOut size={16} /> ออกจากระบบ
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 transition flex items-center gap-2 text-sm font-medium"
            >
              <LogIn size={16} /> เข้าสู่ระบบ (Admin)
            </button>
          )}
        </div>
      </div>
    </header>
  )
}