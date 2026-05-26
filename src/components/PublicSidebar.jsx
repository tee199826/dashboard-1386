import { NavLink } from 'react-router-dom'
import { BarChart3, MapPin, LogIn, Database, ScrollText, Users, FileSpreadsheet, Map, Upload } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function PublicSidebar({ sidebarOpen, setSidebarOpen }) {
  const { user, isAdmin } = useAuth()

  const close = () => setSidebarOpen?.(false)

  const publicMenus = [
    { to: '/', icon: <BarChart3 size={18} />, label: 'ภาพรวม' },
    { to: '/districts', icon: <MapPin size={18} />, label: 'รายเขต' },
    { to: '/radar', icon: <Map size={18} />, label: 'แผนที่ยาเสพติด' },
    { to: '/operations', icon: <FileSpreadsheet size={18} />, label: 'ผลการดำเนินงาน' },
  ]

  const adminMenus = [
    { to: '/admin/data', icon: <Database size={18} />, label: 'จัดการข้อมูล' },
    { to: '/admin/logs', icon: <ScrollText size={18} />, label: 'ประวัติการใช้งาน' },
    { to: '/admin/users', icon: <Users size={18} />, label: 'ผู้ใช้งาน' },
  ]

  return (
    <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-gradient-to-b from-slate-900 to-blue-900 text-white flex-shrink-0 overflow-y-auto transform transition-transform duration-300 ${
      sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
    }`}>

      <nav className="p-3 space-y-1">
        <div className="px-3 py-1 text-xs text-blue-300/70 uppercase tracking-wide">เมนูหลัก</div>
        {publicMenus.map(m => (
          <NavLink key={m.to} to={m.to} end={m.to === '/'} onClick={close}
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
              isActive ? 'bg-white/20 font-semibold' : 'hover:bg-white/10'
            }`}>
            {m.icon} {m.label}
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <div className="px-3 py-1 mt-4 text-xs text-amber-300/80 uppercase tracking-wide">👑 ผู้ดูแลระบบ</div>
            <NavLink to="/upload" onClick={close}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                isActive ? 'bg-amber-500/20 text-amber-100 font-semibold' : 'hover:bg-white/10'
              }`}>
              <Upload size={18} /> นำเข้าข้อมูล
            </NavLink>
            {adminMenus.map(m => (
              <NavLink key={m.to} to={m.to} onClick={close}
                className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                  isActive ? 'bg-amber-500/20 text-amber-100 font-semibold' : 'hover:bg-white/10'
                }`}>
                {m.icon} {m.label}
              </NavLink>
            ))}
          </>
        )}

        {!user && (
          <div className="pt-4 mt-4 border-t border-white/10">
            <NavLink to="/login" onClick={close}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm bg-white/10 hover:bg-white/20 transition">
              <LogIn size={18} /> เข้าสู่ระบบ
            </NavLink>
          </div>
        )}
      </nav>
    </aside>
  )
}
