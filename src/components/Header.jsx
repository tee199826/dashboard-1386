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
      <div className="w-full px-3 sm:px-6 py-3 flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-0 min-w-0 flex-1">
          {/* โลโก้ + 1386 Dashboard */}
          <div className="flex items-center gap-2 sm:gap-3 pr-3 sm:pr-5 border-r border-white/30 flex-shrink-0">
            <img
              src={logoOncb}
              alt="ป.ป.ส."
              className="w-8 h-8 sm:w-11 sm:h-11 object-contain flex-shrink-0"
              style={{ mixBlendMode: 'screen' }}
            />
            <div className="leading-tight flex-shrink-0">
              <div className="text-lg sm:text-2xl font-bold">1386</div>
              <div className="text-xs text-blue-200 hidden sm:block">Dashboard</div>
            </div>
          </div>
          {/* ชื่อระบบ */}
          <div className="pl-3 sm:pl-5 min-w-0 flex-1">
            <h1 className="text-sm sm:text-base lg:text-lg font-bold leading-tight truncate">ระบบแสดงผลและบริหารการจัดการข้อมูลเรื่องร้องเรียนยาเสพติด 1386</h1>
            <p className="text-xs text-blue-200 mt-0.5 hidden sm:block truncate">สรุปผลการดำเนินงาน – สำนักงานป้องกันและปราบปรามยาเสพติด (ป.ป.ส.) กรุงเทพมหานคร</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          {user ? (
            <>
              <div className="text-right text-sm hidden sm:block">
                <div className="font-semibold">{profile?.full_name || user.email}</div>
                <div className="text-xs text-blue-200">{isAdmin ? '👑 ผู้ดูแลระบบ' : '👤 ผู้ใช้งาน'}</div>
              </div>
              <button
                onClick={handleLogout}
                className="px-3 sm:px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 transition flex items-center gap-2 text-sm font-medium flex-shrink-0"
              >
                <LogOut size={16} /> <span className="hidden sm:inline">ออกจากระบบ</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="px-3 sm:px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 transition flex items-center gap-2 text-sm font-medium flex-shrink-0"
            >
              <LogIn size={16} /> <span className="hidden sm:inline">เข้าสู่ระบบ (Admin)</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}